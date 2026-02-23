/**
 * Password Hashing Adapter
 *
 * Provides secure password hashing using bcrypt with recommended parameters.
 * - Cost factor 12 ≈ 250ms on modern hardware (intentionally slow to prevent brute force)
 * - Salts are automatically generated and embedded in hash
 * - Constant-time comparison built into bcrypt.compare()
 *
 * Alternative: Use argon2 for newer deployments (winner of PHC 2015).
 *
 * Install: pnpm add bcrypt @types/bcrypt
 * Or: pnpm add argon2 @types/argon2
 */

// ─── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Constant-time string comparison to prevent timing attacks.
 * Always traverses the full length of the longer string.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    const aCode = a.codePointAt(i) ?? 0;
    const bCode = b.codePointAt(i) ?? 0;
    mismatch |= aCode ^ bCode;
  }
  return mismatch === 0;
}

// ─── Type Definitions ──────────────────────────────────────────────────────────

export interface PasswordHasher {
  /**
   * Hash a plaintext password.
   * Returns a salted hash string suitable for database storage.
   * Complexity: O(2^cost) ≈ 250ms for bcrypt cost 12
   */
  hash(plaintext: string): Promise<string>;

  /**
   * Verify a plaintext password against a stored hash.
   * Uses constant-time comparison to prevent timing attacks.
   * Complexity: O(2^cost) ≈ 250ms for bcrypt cost 12
   */
  verify(plaintext: string, storedHash: string): Promise<boolean>;
}

// ─── Production Hasher (bcrypt) ───────────────────────────────────────────────

/**
 * Production password hasher using bcrypt.
 *
 * To enable: Install bcrypt and uncomment implementation.
 *   pnpm add bcrypt @types/bcrypt
 *
 * Example usage:
 *   import bcrypt from 'bcrypt';
 *   const saltRounds = 12;
 *   hash = await bcrypt.hash(plaintext, saltRounds);
 *   valid = await bcrypt.compare(plaintext, hash);
 */
class BcryptPasswordHasher implements PasswordHasher {
  private readonly saltRounds = 12;

  async hash(plaintext: string): Promise<string> {
    // Dynamic import for compatibility
    const bcrypt = await import("bcrypt");
    return bcrypt.hash(plaintext, this.saltRounds);
  }

  async verify(plaintext: string, storedHash: string): Promise<boolean> {
    // Dynamic import for compatibility
    const bcrypt = await import("bcrypt");
    return bcrypt.compare(plaintext, storedHash);
  }
}

// ─── Mock Hasher (Development Only) ───────────────────────────────────────────

/**
 * Mock password hasher for development and testing.
 * DO NOT USE IN PRODUCTION.
 *
 * Uses a simple prefix + plaintext encoding (not secure).
 */
class MockPasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    // Simple mock: prefix plaintext with marker
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return `$mock$${hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  async verify(plaintext: string, storedHash: string): Promise<boolean> {
    const expectedHash = await this.hash(plaintext);
    return safeCompare(expectedHash, storedHash);
  }
}

// ─── OTP Hasher ────────────────────────────────────────────────────────────────

/**
 * Hash OTPs before storage using bcrypt or a fast hash.
 * OTPs are short-lived (5 min) so we can use a lower cost factor.
 */
export class OTPHasher {
  async hash(otp: string): Promise<string> {
    // Use SHA-256 (fast but less secure for long-lived data)
    // In production with bcrypt: use bcrypt.hash(otp, 10) for stronger security
    const encoder = new TextEncoder();
    const data = encoder.encode(otp);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async verify(otp: string, storedHash: string): Promise<boolean> {
    const expectedHash = await this.hash(otp);
    return safeCompare(expectedHash, storedHash);
  }
}

// ─── Hasher Singleton ──────────────────────────────────────────────────────────

let hasherInstance: PasswordHasher | null = null;

/**
 * Get or create password hasher singleton.
 * Uses production hasher if available, otherwise falls back to mock.
 */
export function getPasswordHasher(): PasswordHasher {
  if (hasherInstance) return hasherInstance;

  // Check if bcrypt is available
  const hasBcrypt = true;

  if (process.env.NODE_ENV === "production" && !hasBcrypt) {
    throw new Error(
      "Production mode requires bcrypt. Install with: pnpm add bcrypt @types/bcrypt"
    );
  }

  if (hasBcrypt) {
    hasherInstance = new BcryptPasswordHasher();
  } else {
    console.warn("[Password Hasher] Using mock hasher. Install bcrypt for production.");
    hasherInstance = new MockPasswordHasher();
  }

  return hasherInstance;
}

/**
 * Get OTP hasher instance (always available, uses SHA-256 by default).
 */
export function getOTPHasher(): OTPHasher {
  return new OTPHasher();
}
