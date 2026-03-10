/**
 * Signup Validator Unit Tests
 *
 * Verifies credential validation logic, strength scoring, and result mapping
 * contained in `lib/auth/signup-validator.ts`.
 */

import {
  validateSignupCredentials,
  validationToSignupResult,
  getPasswordStrength,
} from "@/lib/auth/signup-validator";

import type { SignupCredentials } from " @/lib";

// helper to create minimal valid credential object
function makeCreds(overrides: Partial<SignupCredentials> = {}): SignupCredentials {
  return {
    fullName: "Test Parent",
    email: "user@example.com",
    password: "StrongP@ss1",
    confirmPassword: "StrongP@ss1",
    agreedToTerms: true,
    ...overrides,
  };
}

describe("Signup Validator", () => {
  const WEAK_SCORE_THRESHOLD = 20; // score <= this considered weak
  const STRONG_SCORE_LOWER = 80; // score above this is considered strong

  describe("validateSignupCredentials", () => {
    it("accepts valid email/password signup", () => {
      const creds = makeCreds();
      const res = validateSignupCredentials(creds, "email");
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("rejects missing credentials object", () => {
      const res = validateSignupCredentials(null, "email");
      expect(res.valid).toBe(false);
      expect(res.fieldErrors.form).toBeDefined();
    });

    it("rejects short full name", () => {
      const res = validateSignupCredentials(makeCreds({ fullName: "A" }), "email");
      expect(res.valid).toBe(false);
      expect(res.fieldErrors.fullName).toMatch(/at least/);
    });

    it("rejects malformed email", () => {
      const res = validateSignupCredentials(makeCreds({ email: "not-an-email" }), "email");
      expect(res.valid).toBe(false);
      expect(res.fieldErrors.email).toMatch(/valid email/);
    });

    it("rejects weak password", () => {
      const res = validateSignupCredentials(makeCreds({ password: "weak", confirmPassword: "weak" }), "email");
      expect(res.valid).toBe(false);
      expect(res.fieldErrors.password).toBeDefined();
    });

    it("rejects mismatched password", () => {
      const res = validateSignupCredentials(
        makeCreds({ confirmPassword: "Different1!" }),
        "email"
      );
      expect(res.valid).toBe(false);
      expect(res.fieldErrors.confirmPassword).toMatch(/do not match/);
    });

    it("skips password checks for OAuth providers", () => {
      const creds = makeCreds({ password: "", confirmPassword: "" });
      const res = validateSignupCredentials(creds, "google");
      expect(res.valid).toBe(true);
    });
  });

  describe("validationToSignupResult", () => {
    it("maps fieldErrors and first message correctly", () => {
      const validation = validateSignupCredentials(makeCreds({ email: "bad" }), "email");
      const signup = validationToSignupResult(validation);
      expect(signup.success).toBe(false);
      expect(signup.error).toBe("invalid_credentials");
      expect(signup.fieldErrors).toEqual(validation.fieldErrors);
      expect(signup.errorMessage).toContain("valid email");
    });
  });

  describe("getPasswordStrength", () => {
    it("scores strong password as strong", () => {
      const strength = getPasswordStrength("StrongP@ss1");
      expect(strength.label).toBe("strong");
      expect(strength.score).toBeGreaterThan(STRONG_SCORE_LOWER);
    });

    it("lists unmet requirements for weak password", () => {
      const strength = getPasswordStrength("abc");
      expect(strength.score).toBeLessThanOrEqual(WEAK_SCORE_THRESHOLD);
      expect(strength.unmetRequirements.length).toBeGreaterThan(0);
    });

    it("calculates 100 when all requirements met", () => {
      const strength = getPasswordStrength("Aa1!aaaaaa");
      expect(strength.score).toBe(100);
    });
  });
});
