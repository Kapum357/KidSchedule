/**
 * JWT Key Management
 *
 * Handles RS256 keypair generation, signing, and verification using jose library.
 * - Private key signs access tokens (never exposed to client)
 * - Public key verifies tokens (can be shared)
 * - Keys stored in environment variables or secret manager
 *
 * Install: pnpm add jose
 */

import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload } from "jose";

// ─── Type Definitions ──────────────────────────────────────────────────────────

export interface AccessTokenPayload extends JWTPayload {
  sub: string;        // User ID
  email: string;      // User email
  sid: string;        // Session ID
  familyId?: string;  // Family ID (optional)
  parentId?: string;  // Parent ID (optional)
}

// ─── Key Management ────────────────────────────────────────────────────────────

/**
 * Get RS256 private key from environment.
 * In production: Store in AWS Secrets Manager, Azure Key Vault, etc.
 *
 * To generate a keypair:
 *   openssl genrsa -out private.pem 2048
 *   openssl rsa -in private.pem -pubout -out public.pem
 *   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in private.pem -out private_pkcs8.pem
 */
async function getPrivateKey(): Promise<CryptoKey> {
  const privateKeyPEM = process.env.JWT_PRIVATE_KEY;

  if (!privateKeyPEM) {
    throw new Error(
      "JWT_PRIVATE_KEY not set. Generate with: openssl genrsa -out private.pem 2048"
    );
  }

  // Import PKCS8 private key
  return importPKCS8(privateKeyPEM, "RS256");
}

/**
 * Get RS256 public key from environment.
 * Used for token verification.
 */
async function getPublicKey(): Promise<CryptoKey> {
  const publicKeyPEM = process.env.JWT_PUBLIC_KEY;

  if (!publicKeyPEM) {
    throw new Error(
      "JWT_PUBLIC_KEY not set. Generate with: openssl rsa -in private.pem -pubout -out public.pem"
    );
  }

  // Import SPKI public key
  return importSPKI(publicKeyPEM, "RS256");
}

// ─── JWT Operations ────────────────────────────────────────────────────────────

/**
 * Sign an access token with RS256.
 * Returns a JWT string: header.payload.signature
 *
 * Complexity: O(1) for small payload
 */
export async function signAccessToken(
  payload: AccessTokenPayload,
  expiresInSeconds: number
): Promise<string> {
  const privateKey = await getPrivateKey();

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(privateKey);

  return jwt;
}

/**
 * Verify and decode an access token.
 * Returns payload if valid, throws if invalid/expired.
 *
 * Complexity: O(1) for small payload
 */
export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload> {
  const publicKey = await getPublicKey();

  const { payload } = await jwtVerify(token, publicKey, {
    algorithms: ["RS256"],
  });

  return payload as AccessTokenPayload;
}

/**
 * Decode JWT payload without verifying signature.
 * Use only for debugging or extracting claims after verification.
 *
 * ⚠️ DO NOT use for authentication; always verify signature first.
 */
export function decodeTokenUnsafe(token: string): AccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload as AccessTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired without verifying signature.
 * Useful for quick expiry checks before expensive verification.
 */
export function isTokenExpired(token: string, now: Date = new Date()): boolean {
  const decoded = decodeTokenUnsafe(token);
  if (!decoded || typeof decoded.exp !== "number") return true;
  return decoded.exp < Math.floor(now.getTime() / 1000);
}

// ─── Mock Implementation (Development Only) ────────────────────────────────────

/**
 * Mock JWT signer for development (when keys not configured).
 * DO NOT USE IN PRODUCTION.
 */
export async function signAccessTokenMock(
  payload: AccessTokenPayload,
  expiresInSeconds: number
): Promise<string> {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
    "base64url"
  );

  const fullPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const payloadEncoded = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");

  // Mock signature (NOT SECURE)
  const mockSignature = Buffer.from(`MOCK_SIG_${payload.sid.substring(0, 8)}`).toString(
    "base64url"
  );

  return `${header}.${payloadEncoded}.${mockSignature}`;
}

/**
 * Mock JWT verifier (accepts any token with valid structure).
 * DO NOT USE IN PRODUCTION.
 */
export async function verifyAccessTokenMock(
  token: string
): Promise<AccessTokenPayload> {
  const decoded = decodeTokenUnsafe(token);
  if (!decoded) {
    throw new Error("Invalid token structure");
  }

  if (isTokenExpired(token)) {
    throw new Error("Token expired");
  }

  return decoded;
}

// ─── Smart Selector (Production vs Mock) ──────────────────────────────────────

/**
 * Sign access token using production RS256 if keys configured, otherwise mock.
 */
export async function createAccessToken(
  payload: AccessTokenPayload,
  expiresInSeconds: number
): Promise<string> {
  const hasKeys = process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY;

  if (hasKeys) {
    return signAccessToken(payload, expiresInSeconds);
  }

  console.warn(
    "[JWT] Using mock signing. Set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY for production."
  );
  return signAccessTokenMock(payload, expiresInSeconds);
}

/**
 * Verify access token using production RS256 if keys configured, otherwise mock.
 */
export async function validateAccessToken(token: string): Promise<AccessTokenPayload> {
  const hasKeys = process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY;

  if (hasKeys) {
    return verifyAccessToken(token);
  }

  return verifyAccessTokenMock(token);
}
