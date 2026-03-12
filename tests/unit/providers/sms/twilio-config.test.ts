/**
 * Tests for Twilio configuration module
 */

import { getTwilioAuthToken, getTwilioAccountSid, getTwilioPhoneNumber } from "@/lib/providers/sms/twilio-config";

describe("Twilio Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment after each test
    process.env = originalEnv;
  });

  describe("getTwilioAuthToken()", () => {
    it("should return the auth token when configured", () => {
      process.env.TWILIO_AUTH_TOKEN = "test_token_123";
      expect(getTwilioAuthToken()).toBe("test_token_123");
    });

    it("should throw error when TWILIO_AUTH_TOKEN is not set", () => {
      delete process.env.TWILIO_AUTH_TOKEN;
      expect(() => getTwilioAuthToken()).toThrow("TWILIO_AUTH_TOKEN is not configured");
    });

    it("should throw error when TWILIO_AUTH_TOKEN is empty string", () => {
      process.env.TWILIO_AUTH_TOKEN = "";
      expect(() => getTwilioAuthToken()).toThrow("TWILIO_AUTH_TOKEN is not configured");
    });

    it("should throw error when TWILIO_AUTH_TOKEN is whitespace only", () => {
      process.env.TWILIO_AUTH_TOKEN = "   ";
      expect(() => getTwilioAuthToken()).toThrow("TWILIO_AUTH_TOKEN is not configured");
    });

    it("should return token with whitespace trimmed", () => {
      process.env.TWILIO_AUTH_TOKEN = "  valid_token  ";
      expect(getTwilioAuthToken()).toBe("  valid_token  ");
    });
  });

  describe("getTwilioAccountSid()", () => {
    it("should return the account SID when configured", () => {
      process.env.TWILIO_ACCOUNT_SID = "AC1234567890abcdef";
      expect(getTwilioAccountSid()).toBe("AC1234567890abcdef");
    });

    it("should throw error when TWILIO_ACCOUNT_SID is not set", () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      expect(() => getTwilioAccountSid()).toThrow("TWILIO_ACCOUNT_SID is not configured");
    });

    it("should throw error when TWILIO_ACCOUNT_SID is empty string", () => {
      process.env.TWILIO_ACCOUNT_SID = "";
      expect(() => getTwilioAccountSid()).toThrow("TWILIO_ACCOUNT_SID is not configured");
    });

    it("should throw error when TWILIO_ACCOUNT_SID is whitespace only", () => {
      process.env.TWILIO_ACCOUNT_SID = "   ";
      expect(() => getTwilioAccountSid()).toThrow("TWILIO_ACCOUNT_SID is not configured");
    });
  });

  describe("getTwilioPhoneNumber()", () => {
    it("should return the phone number when configured", () => {
      process.env.TWILIO_PHONE_NUMBER = "+15551234567";
      expect(getTwilioPhoneNumber()).toBe("+15551234567");
    });

    it("should return null when TWILIO_PHONE_NUMBER is not set", () => {
      delete process.env.TWILIO_PHONE_NUMBER;
      expect(getTwilioPhoneNumber()).toBeNull();
    });

    it("should return null when TWILIO_PHONE_NUMBER is empty string", () => {
      process.env.TWILIO_PHONE_NUMBER = "";
      expect(getTwilioPhoneNumber()).toBeNull();
    });

    it("should return null when TWILIO_PHONE_NUMBER is whitespace only", () => {
      process.env.TWILIO_PHONE_NUMBER = "   ";
      expect(getTwilioPhoneNumber()).toBeNull();
    });
  });

  describe("Error handling consistency", () => {
    it("should throw consistent error messages", () => {
      delete process.env.TWILIO_AUTH_TOKEN;
      expect(() => getTwilioAuthToken()).toThrow("TWILIO_AUTH_TOKEN is not configured");

      delete process.env.TWILIO_ACCOUNT_SID;
      expect(() => getTwilioAccountSid()).toThrow("TWILIO_ACCOUNT_SID is not configured");
    });

    it("should handle simultaneous missing credentials", () => {
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_ACCOUNT_SID;

      expect(() => getTwilioAuthToken()).toThrow();
      expect(() => getTwilioAccountSid()).toThrow();
      expect(getTwilioPhoneNumber()).toBeNull();
    });
  });
});
