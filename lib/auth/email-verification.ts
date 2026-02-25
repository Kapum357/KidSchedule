/**
 * KidSchedule – Email Verification Token Helpers
 *
 * Stateless, HMAC-signed verification tokens.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type VerificationPayload = {
  email: string;
  exp: number;
};

function getVerificationSecret(): string {
  const secret = process.env.EMAIL_VERIFICATION_SECRET ?? process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("EMAIL_VERIFICATION_SECRET (or AUTH_JWT_SECRET) is required");
  }
  return secret;
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(payloadB64: string): string {
  return createHmac("sha256", getVerificationSecret())
    .update(payloadB64)
    .digest("base64url");
}

export function createEmailVerificationToken(email: string): string {
  const payload: VerificationPayload = {
    email: email.toLowerCase().trim(),
    exp: Date.now() + EMAIL_VERIFICATION_TTL_MS,
  };

  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifyEmailVerificationToken(token: string): {
  valid: boolean;
  email?: string;
  reason?: string;
} {
  if (!token || !token.includes(".")) {
    return { valid: false, reason: "invalid_token" };
  }

  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) {
    return { valid: false, reason: "invalid_token" };
  }

  try {
    const expectedSig = signPayload(payloadB64);
    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(expectedSig, "utf8");

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: "invalid_signature" };
    }

    const payload = JSON.parse(fromBase64Url(payloadB64)) as Partial<VerificationPayload>;
    const email = payload.email?.toLowerCase().trim();
    const exp = Number(payload.exp);

    if (!email || !Number.isFinite(exp)) {
      return { valid: false, reason: "invalid_payload" };
    }

    if (Date.now() > exp) {
      return { valid: false, reason: "token_expired" };
    }

    return { valid: true, email };
  } catch {
    return { valid: false, reason: "invalid_token" };
  }
}
