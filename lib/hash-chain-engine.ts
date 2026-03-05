/**
 * KidSchedule – Hash Chain Engine
 *
 * Cryptographic hash chain for message integrity verification.
 * Each message's hash includes the previous message's hash, creating
 * a tamper-evident chain that detects any modifications.
 *
 * This implements a simplified blockchain-like structure for
 * legal evidence preservation in co-parenting communications.
 *
 * Hash computation: SHA-256(threadId + senderId + body + sentAt + previousHash + chainIndex)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageForHashing {
  threadId: string;
  senderId: string;
  body: string;
  sentAt: string;
  chainIndex: number;
}

export interface HashedMessage extends MessageForHashing {
  messageHash: string;
  previousHash: string | null;
}

export interface ChainVerificationResult {
  isValid: boolean;
  verifiedAt: string;
  verifiedCount: number;
  tamperDetectedAtIndex: number | null;
  report: ChainVerificationReport;
}

export interface ChainVerificationReport {
  threadId: string;
  totalMessages: number;
  validMessages: number;
  invalidMessages: number;
  errors: ChainVerificationError[];
}

export interface ChainVerificationError {
  chainIndex: number;
  messageId?: string;
  error: string;
  expectedHash?: string;
  actualHash?: string;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const HASH_ALGORITHM = "SHA-256";
const GENESIS_HASH = "0".repeat(64); // Genesis block previous hash

// ─── Hash Utilities ───────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a string.
 * Uses Web Crypto API for consistency across environments.
 */
export async function sha256(input: string): Promise<string> {
  // Use Web Crypto API when available (browsers, Edge runtime).
  if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest(HASH_ALGORITHM, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback for Node.js environment where crypto.subtle may be undefined.
  // Dynamically import to avoid bundling the entire crypto module in browser builds.
  const { createHash } = await import("crypto");
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Compute the hash for a message in the chain.
 * The hash includes all relevant fields to ensure integrity.
 */
export async function computeMessageHash(
  message: MessageForHashing,
  previousHash: string | null
): Promise<string> {
  const prevHash = previousHash ?? GENESIS_HASH;
  
  // Canonical string representation for hashing
  // Order matters - must be consistent across all computations
  const hashInput = [
    `threadId:${message.threadId}`,
    `senderId:${message.senderId}`,
    `body:${message.body}`,
    `sentAt:${message.sentAt}`,
    `previousHash:${prevHash}`,
    `chainIndex:${message.chainIndex}`,
  ].join("|");

  return sha256(hashInput);
}

// ─── Chain Building ───────────────────────────────────────────────────────────

/**
 * Hash a single message and add it to the chain.
 * Returns the message with computed hash.
 */
export async function hashMessage(
  message: MessageForHashing,
  previousHash: string | null
): Promise<HashedMessage> {
  const messageHash = await computeMessageHash(message, previousHash);
  
  return {
    ...message,
    messageHash,
    previousHash,
  };
}

/**
 * Hash a batch of messages to form a chain.
 * Messages must be provided in chain order (by chainIndex).
 */
export async function hashMessageBatch(
  messages: MessageForHashing[]
): Promise<HashedMessage[]> {
  // Sort by chain index to ensure correct order
  const sorted = [...messages].sort((a, b) => a.chainIndex - b.chainIndex);
  
  const hashedMessages: HashedMessage[] = [];
  let previousHash: string | null = null;

  for (const message of sorted) {
    const hashed = await hashMessage(message, previousHash);
    hashedMessages.push(hashed);
    previousHash = hashed.messageHash;
  }

  return hashedMessages;
}

// ─── Chain Verification ───────────────────────────────────────────────────────

/**
 * Verify a chain of messages for integrity.
 * Checks that each message's hash is correct and links to the previous.
 */
export async function verifyChain(
  messages: HashedMessage[]
): Promise<ChainVerificationResult> {
  const verifiedAt = new Date().toISOString();
  
  if (messages.length === 0) {
    return {
      isValid: true,
      verifiedAt,
      verifiedCount: 0,
      tamperDetectedAtIndex: null,
      report: {
        threadId: "",
        totalMessages: 0,
        validMessages: 0,
        invalidMessages: 0,
        errors: [],
      },
    };
  }

  // Sort by chain index
  const sorted = [...messages].sort((a, b) => a.chainIndex - b.chainIndex);
  const threadId = sorted[0].threadId;

  const errors: ChainVerificationError[] = [];
  let validCount = 0;
  let tamperDetectedAtIndex: number | null = null;
  let expectedPreviousHash: string | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const message = sorted[i];
    
    // Check chain index continuity
    if (message.chainIndex !== i) {
      errors.push({
        chainIndex: message.chainIndex,
        error: `Chain index gap detected. Expected ${i}, got ${message.chainIndex}`,
      });
      if (tamperDetectedAtIndex === null) {
        tamperDetectedAtIndex = i;
      }
      continue;
    }

    // Verify previous hash link
    if (i === 0) {
      // Genesis message should have null previousHash
      if (message.previousHash !== null && message.previousHash !== GENESIS_HASH) {
        errors.push({
          chainIndex: 0,
          error: "Genesis message has unexpected previousHash",
          expectedHash: "null or genesis",
          actualHash: message.previousHash,
        });
        if (tamperDetectedAtIndex === null) {
          tamperDetectedAtIndex = 0;
        }
      }
    } else {
      // Non-genesis message should link to previous
      if (message.previousHash !== expectedPreviousHash) {
        errors.push({
          chainIndex: message.chainIndex,
          error: "Previous hash mismatch - chain link broken",
          expectedHash: expectedPreviousHash ?? "null",
          actualHash: message.previousHash ?? "null",
        });
        if (tamperDetectedAtIndex === null) {
          tamperDetectedAtIndex = message.chainIndex;
        }
      }
    }

    // Recompute hash and verify
    const computedHash = await computeMessageHash(message, message.previousHash);
    
    if (computedHash !== message.messageHash) {
      errors.push({
        chainIndex: message.chainIndex,
        error: "Message hash mismatch - content may have been tampered",
        expectedHash: computedHash,
        actualHash: message.messageHash,
      });
      if (tamperDetectedAtIndex === null) {
        tamperDetectedAtIndex = message.chainIndex;
      }
    } else {
      validCount++;
    }

    expectedPreviousHash = message.messageHash;
  }

  return {
    isValid: errors.length === 0,
    verifiedAt,
    verifiedCount: sorted.length,
    tamperDetectedAtIndex,
    report: {
      threadId,
      totalMessages: sorted.length,
      validMessages: validCount,
      invalidMessages: sorted.length - validCount,
      errors,
    },
  };
}

/**
 * Verify that a new message correctly extends an existing chain.
 * Used when adding new messages to ensure chain integrity.
 */
export async function verifyChainExtension(
  newMessage: HashedMessage,
  lastChainMessage: HashedMessage | null
): Promise<{ valid: boolean; error?: string }> {
  // For genesis message
  if (lastChainMessage === null) {
    if (newMessage.chainIndex !== 0) {
      return { valid: false, error: "First message must have chainIndex 0" };
    }
    if (newMessage.previousHash !== null && newMessage.previousHash !== GENESIS_HASH) {
      return { valid: false, error: "First message must have null previousHash" };
    }
    const computedHash = await computeMessageHash(newMessage, null);
    if (computedHash !== newMessage.messageHash) {
      return { valid: false, error: "Message hash verification failed" };
    }
    return { valid: true };
  }

  // For subsequent messages
  if (newMessage.chainIndex !== lastChainMessage.chainIndex + 1) {
    return {
      valid: false,
      error: `Expected chainIndex ${lastChainMessage.chainIndex + 1}, got ${newMessage.chainIndex}`,
    };
  }

  if (newMessage.previousHash !== lastChainMessage.messageHash) {
    return {
      valid: false,
      error: "Previous hash does not match last message hash",
    };
  }

  const computedHash = await computeMessageHash(newMessage, newMessage.previousHash);
  if (computedHash !== newMessage.messageHash) {
    return { valid: false, error: "Message hash verification failed" };
  }

  return { valid: true };
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Get the next chain index for a new message.
 */
export function getNextChainIndex(existingMessages: { chainIndex: number }[]): number {
  if (existingMessages.length === 0) {
    return 0;
  }
  const maxIndex = Math.max(...existingMessages.map((m) => m.chainIndex));
  return maxIndex + 1;
}

/**
 * Get the hash of the last message in a chain.
 * Returns null if the chain is empty.
 */
export function getLastMessageHash(
  messages: HashedMessage[]
): string | null {
  if (messages.length === 0) {
    return null;
  }
  const sorted = [...messages].sort((a, b) => b.chainIndex - a.chainIndex);
  return sorted[0].messageHash;
}
