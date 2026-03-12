/**
 * Tests for emoji validation
 */

import { ALLOWED_EMOJIS, isValidEmoji, validateEmoji } from "@/lib/constants/emoji";

describe("Emoji Validation", () => {
  describe("ALLOWED_EMOJIS", () => {
    it("should contain exactly 20 emojis", () => {
      expect(ALLOWED_EMOJIS).toHaveLength(20);
    });

    it("should contain common reaction emojis", () => {
      expect(ALLOWED_EMOJIS).toContain("❤️"); // Heart
      expect(ALLOWED_EMOJIS).toContain("👍"); // Thumbs up
      expect(ALLOWED_EMOJIS).toContain("😂"); // Laughing
      expect(ALLOWED_EMOJIS).toContain("😍"); // Heart eyes
    });
  });

  describe("isValidEmoji", () => {
    it("should return true for allowed emojis", () => {
      expect(isValidEmoji("❤️")).toBe(true);
      expect(isValidEmoji("👍")).toBe(true);
      expect(isValidEmoji("😂")).toBe(true);
    });

    it("should return false for disallowed emojis", () => {
      expect(isValidEmoji("🚀")).toBe(false);
      expect(isValidEmoji("🎮")).toBe(false);
      expect(isValidEmoji("❌")).toBe(false);
    });

    it("should return false for non-emoji strings", () => {
      expect(isValidEmoji("hello")).toBe(false);
      expect(isValidEmoji("😂😂")).toBe(false); // Multiple emojis
      expect(isValidEmoji("")).toBe(false);
    });

    it("should act as type guard", () => {
      const emoji: string = "❤️";
      if (isValidEmoji(emoji)) {
        // TypeScript should narrow to AllowedEmoji
        const _: "❤️" | "👍" | "😂" = emoji;
        expect(true).toBe(true);
      }
    });
  });

  describe("validateEmoji", () => {
    it("should return true for allowed emojis", () => {
      expect(validateEmoji("❤️")).toBe(true);
      expect(validateEmoji("👍")).toBe(true);
    });

    it("should return false for disallowed emojis", () => {
      expect(validateEmoji("🚀")).toBe(false);
      expect(validateEmoji("🎮")).toBe(false);
    });
  });

  describe("XSS Prevention", () => {
    it("should prevent arbitrary emoji injection", () => {
      const malicious = '<script>alert("xss")</script>';
      expect(isValidEmoji(malicious)).toBe(false);
    });

    it("should only allow from whitelist", () => {
      const suspiciousEmoji = "🔓"; // Not in list
      expect(isValidEmoji(suspiciousEmoji)).toBe(false);
    });
  });
});
