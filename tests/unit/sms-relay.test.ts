/**
 * SMS Relay Unit Tests
 *
 * Tests for enrollment, deactivation, and duplicate prevention
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/persistence";

describe("SMS Relay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Enrollment", () => {
    it("should create enrollment with valid phone", async () => {
      const enrollment = await db.smsRelayParticipants.create({
        familyId: "fam-123",
        parentId: "parent-123",
        phone: "+12025551234",
        proxyNumber: "+14155552671",
      });

      expect(enrollment).toBeDefined();
      expect(enrollment.phone).toBe("+12025551234");
      expect(enrollment.proxyNumber).toBe("+14155552671");
      expect(enrollment.isActive).toBe(true);
    });

    it("should reject duplicate enrollment for same parent", async () => {
      const familyId = "fam-123";
      const parentId = "parent-123";

      // Create first enrollment
      await db.smsRelayParticipants.create({
        familyId,
        parentId,
        phone: "+12025551234",
        proxyNumber: "+14155552671",
      });

      // Try to create duplicate - should throw or return error
      expect(async () => {
        await db.smsRelayParticipants.create({
          familyId,
          parentId,
          phone: "+12125559876",
          proxyNumber: "+14155552672",
        });
      }).rejects.toThrow();
    });
  });

  describe("Finding enrollments", () => {
    it("should find enrollment by parent ID", async () => {
      const parentId = "parent-456";
      const created = await db.smsRelayParticipants.create({
        familyId: "fam-456",
        parentId,
        phone: "+12025551234",
        proxyNumber: "+14155552671",
      });

      const found = await db.smsRelayParticipants.findByParentId(parentId);

      expect(found).toBeDefined();
      expect(found?.parentId).toBe(parentId);
    });

    it("should find enrollment by proxy number", async () => {
      const proxyNumber = "+14155552671";
      const created = await db.smsRelayParticipants.create({
        familyId: "fam-789",
        parentId: "parent-789",
        phone: "+12025551234",
        proxyNumber,
      });

      const found = await db.smsRelayParticipants.findByProxyNumber(proxyNumber);

      expect(found).toBeDefined();
      expect(found?.proxyNumber).toBe(proxyNumber);
    });

    it("should find enrollment by phone and family", async () => {
      const phone = "+12025551234";
      const familyId = "fam-abc";

      const created = await db.smsRelayParticipants.create({
        familyId,
        parentId: "parent-abc",
        phone,
        proxyNumber: "+14155552671",
      });

      const found = await db.smsRelayParticipants.findByPhoneAndFamily(
        phone,
        familyId
      );

      expect(found).toBeDefined();
      expect(found?.phone).toBe(phone);
      expect(found?.familyId).toBe(familyId);
    });

    it("should find multiple enrollments by family", async () => {
      const familyId = "fam-multi";

      await db.smsRelayParticipants.create({
        familyId,
        parentId: "parent-1",
        phone: "+12025551234",
        proxyNumber: "+14155552671",
      });

      await db.smsRelayParticipants.create({
        familyId,
        parentId: "parent-2",
        phone: "+12125559876",
        proxyNumber: "+14155552672",
      });

      const found = await db.smsRelayParticipants.findByFamilyId(familyId);

      expect(found).toHaveLength(2);
      expect(found.map((e) => e.parentId)).toContain("parent-1");
      expect(found.map((e) => e.parentId)).toContain("parent-2");
    });
  });

  describe("Deactivation", () => {
    it("should deactivate enrollment", async () => {
      const parentId = "parent-deact";
      await db.smsRelayParticipants.create({
        familyId: "fam-deact",
        parentId,
        phone: "+12025551234",
        proxyNumber: "+14155552671",
      });

      await db.smsRelayParticipants.deactivate(parentId);

      const found = await db.smsRelayParticipants.findByParentId(parentId);
      expect(found?.isActive).toBe(false);
    });

    it("should not find inactive enrollments in active queries", async () => {
      const familyId = "fam-inactive";
      const parentId = "parent-inactive";

      await db.smsRelayParticipants.create({
        familyId,
        parentId,
        phone: "+12025551234",
        proxyNumber: "+14155552671",
      });

      await db.smsRelayParticipants.deactivate(parentId);

      const active = await db.smsRelayParticipants.findByFamilyId(familyId);
      // Should be filtered to only active
      const inactiveCount = active.filter((e) => !e.isActive).length;
      expect(inactiveCount).toBe(0);
    });
  });
});
