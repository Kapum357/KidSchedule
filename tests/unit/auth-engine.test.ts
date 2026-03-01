/**
 * Auth Engine Unit Tests
 *
 * Tests for the authentication engine - password validation,
 * token verification, and security utilities.
 */

import {
  AuthEngine,
  validatePasswordStrength,
  decodeAccessToken,
  isAccessTokenExpired,
} from "@/lib/auth-engine";

describe("Auth Engine", () => {
  // ─── Password Strength Validation ───────────────────────────────────────────

  describe("validatePasswordStrength", () => {
    it("should reject empty password", () => {
      const result = validatePasswordStrength("");
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject password shorter than 8 characters", () => {
      const result = validatePasswordStrength("Abc123!");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("at least 8 characters"))).toBe(true);
    });

    it("should reject password without uppercase letter", () => {
      const result = validatePasswordStrength("abcdefgh123!");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("uppercase"))).toBe(true);
    });

    it("should reject password without lowercase letter", () => {
      const result = validatePasswordStrength("ABCDEFGH123!");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("lowercase"))).toBe(true);
    });

    it("should reject password without number", () => {
      const result = validatePasswordStrength("Abcdefgh!@#");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("number"))).toBe(true);
    });

    it("should accept strong password", () => {
      const result = validatePasswordStrength("SecureP@ssw0rd!");
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject weak patterns", () => {
      // Passwords missing required components are rejected
      const result = validatePasswordStrength("password");
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should return isValid and errors array", () => {
      const result = validatePasswordStrength("xK9#mP2$vL7@nQ4!");
      expect(typeof result.isValid).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("should handle special characters", () => {
      const result = validatePasswordStrength("AAAAaaaa1!");
      // Has uppercase, lowercase, number, special char, and length
      expect(result.isValid).toBe(true);
    });
  });

  // ─── Token Functions ─────────────────────────────────────────────────────────

  describe("decodeAccessToken", () => {
    it("should return null for invalid token format", () => {
      const result = decodeAccessToken("invalid-token");
      expect(result).toBeNull();
    });

    it("should return null for empty token", () => {
      const result = decodeAccessToken("");
      expect(result).toBeNull();
    });
  });

  describe("isAccessTokenExpired", () => {
    it("should return true for invalid token", () => {
      const result = isAccessTokenExpired("invalid-token");
      expect(result).toBe(true);
    });

    it("should return true for empty token", () => {
      const result = isAccessTokenExpired("");
      expect(result).toBe(true);
    });
  });

  // ─── AuthEngine Class ───────────────────────────────────────────────────────

  describe("AuthEngine", () => {
    let engine: AuthEngine;

    beforeEach(() => {
      engine = new AuthEngine();
    });

    describe("authenticateWithPassword", () => {
      it("should reject invalid email format", () => {
        const result = engine.authenticateWithPassword(
          { email: "not-an-email", password: "password123" },
          "127.0.0.1",
          null,
          null
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe("invalid_credentials");
      });

      it("should reject empty password", () => {
        const result = engine.authenticateWithPassword(
          { email: "user@example.com", password: "" },
          "127.0.0.1",
          null,
          null
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe("invalid_credentials");
      });

      it("should reject when user not found (null hashedPassword)", () => {
        const result = engine.authenticateWithPassword(
          { email: "user@example.com", password: "Password123!" },
          "127.0.0.1",
          null, // User not found
          null
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe("invalid_credentials");
      });
    });

    describe("authenticateWithOAuth", () => {
      it("should reject when user ID not resolved", () => {
        const result = engine.authenticateWithOAuth(
          { provider: "google", idToken: "test-token" },
          "",
          null,
          "127.0.0.1"
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe("oauth_failed");
      });
    });
  });
});
