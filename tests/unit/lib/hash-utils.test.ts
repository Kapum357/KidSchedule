/**
 * Hash Consistency Tests
 *
 * Verifies SHA-256 hash algorithm produces deterministic results
 * consistently across multiple runs in both Node.js and browser environments.
 *
 * This test is critical for ensuring hash chain integrity in exports
 * can be verified across platforms.
 */

import { sha256 } from "@/lib/hash-chain-engine";

describe("Hash Consistency", () => {
  /**
   * Test 1: SHA-256 produces deterministic hashes
   * Running the same input 10+ times should always produce the same output
   */
  it("should produce deterministic hashes across 10 runs", async () => {
    const input = "test data for hash consistency";
    const hashes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const hash = await sha256(input);
      hashes.push(hash);
    }

    // All hashes should be identical
    const firstHash = hashes[0];
    expect(firstHash).toHaveLength(64); // SHA-256 = 64 hex chars
    expect(firstHash).toMatch(/^[0-9a-f]{64}$/); // Valid hex format

    for (let i = 1; i < hashes.length; i++) {
      expect(hashes[i]).toBe(firstHash);
    }
  });

  /**
   * Test 2: Different inputs produce different hashes
   * Ensures hash function is sensitive to input changes
   */
  it("should produce different hashes for different inputs", async () => {
    const input1 = "message 1";
    const input2 = "message 2";

    const hash1 = await sha256(input1);
    const hash2 = await sha256(input2);

    expect(hash1).not.toBe(hash2);
  });

  /**
   * Test 3: Canonical form matters
   * Order and spacing in input must be consistent
   */
  it("should produce different hashes for different formatting", async () => {
    const input1 = "threadId:t1|senderId:u1|body:hello";
    const input2 = "threadId:t1|senderId:u1 |body:hello"; // Extra space

    const hash1 = await sha256(input1);
    const hash2 = await sha256(input2);

    expect(hash1).not.toBe(hash2);
  });

  /**
   * Test 4: Empty string hashing
   * Edge case: ensure empty strings are handled correctly
   */
  it("should hash empty string consistently", async () => {
    const hashes: string[] = [];

    for (let i = 0; i < 5; i++) {
      const hash = await sha256("");
      hashes.push(hash);
    }

    const firstHash = hashes[0];
    for (const hash of hashes.slice(1)) {
      expect(hash).toBe(firstHash);
    }
  });

  /**
   * Test 5: Large input consistency
   * Ensures large messages hash consistently
   */
  it("should hash large strings consistently", async () => {
    // 10KB of text
    const largeInput = "x".repeat(10240);
    const hashes: string[] = [];

    for (let i = 0; i < 5; i++) {
      const hash = await sha256(largeInput);
      hashes.push(hash);
    }

    const firstHash = hashes[0];
    for (const hash of hashes.slice(1)) {
      expect(hash).toBe(firstHash);
    }
  });

  /**
   * Test 6: Unicode handling
   * Ensures Unicode characters are handled consistently
   */
  it("should hash unicode strings consistently", async () => {
    const unicodeInput = "Hello 世界 🌍 مرحبا";
    const hashes: string[] = [];

    for (let i = 0; i < 5; i++) {
      const hash = await sha256(unicodeInput);
      hashes.push(hash);
    }

    const firstHash = hashes[0];
    for (const hash of hashes.slice(1)) {
      expect(hash).toBe(firstHash);
    }
  });

  /**
   * Test 7: Newline and whitespace handling
   * Ensures whitespace is preserved in hashing
   */
  it("should preserve newlines and whitespace in hash", async () => {
    const inputWithNewlines = "line1\nline2\nline3";
    const inputWithoutNewlines = "line1line2line3";

    const hash1 = await sha256(inputWithNewlines);
    const hash2 = await sha256(inputWithoutNewlines);

    expect(hash1).not.toBe(hash2);
  });

  /**
   * Test 8: Known SHA-256 test vector
   * Verifies against standard test vectors for correctness
   */
  it("should match known SHA-256 test vectors", async () => {
    const testVectors: Array<[string, string]> = [
      ["hello", "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"],
      ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
      ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ];

    for (const [input, expectedHash] of testVectors) {
      const hash = await sha256(input);
      expect(hash).toBe(expectedHash);
    }
  });

  /**
   * Test 9: Sequential consistency
   * Ensures sequential calls maintain consistency
   */
  it("should maintain consistency across sequential calls", async () => {
    const inputs = ["msg1", "msg2", "msg3", "msg4", "msg5"];
    const firstRun: string[] = [];
    const secondRun: string[] = [];

    // First run
    for (const input of inputs) {
      firstRun.push(await sha256(input));
    }

    // Second run
    for (const input of inputs) {
      secondRun.push(await sha256(input));
    }

    // Both runs should produce identical results
    expect(firstRun).toEqual(secondRun);
  });

  /**
   * Test 10: Case sensitivity
   * Ensures hash is sensitive to case
   */
  it("should be case-sensitive", async () => {
    const hash1 = await sha256("Message");
    const hash2 = await sha256("message");
    const hash3 = await sha256("MESSAGE");

    expect(hash1).not.toBe(hash2);
    expect(hash2).not.toBe(hash3);
    expect(hash1).not.toBe(hash3);
  });

  /**
   * Test 11: Long-running stability
   * Ensures no state leakage or degradation over time
   */
  it("should maintain consistency over 50 iterations", async () => {
    const input = "stability test input";
    const firstHash = await sha256(input);

    for (let i = 0; i < 50; i++) {
      const hash = await sha256(input);
      expect(hash).toBe(firstHash);
    }
  });

  /**
   * Test 12: Null character handling
   * Edge case: strings containing null bytes
   */
  it("should handle strings with null characters", async () => {
    const input1 = "hello\x00world";
    const input2 = "helloworld";

    const hash1 = await sha256(input1);
    const hash2 = await sha256(input2);

    expect(hash1).not.toBe(hash2);

    // Should be consistent across runs
    const hash1Again = await sha256(input1);
    expect(hash1Again).toBe(hash1);
  });
});
