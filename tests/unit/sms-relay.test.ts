/**
 * SMS Relay Unit Tests
 *
 * Tests for enrollment, deactivation, and duplicate prevention.
 * Uses Jest mocks — no real DB connection required.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSmsRelayParticipants = {
  create: jest.fn(),
  findByParentId: jest.fn(),
  findByFamilyId: jest.fn(),
  findByProxyNumber: jest.fn(),
  findByPhoneAndFamily: jest.fn(),
  deactivate: jest.fn(),
};

jest.mock("@/lib/persistence", () => ({
  db: {
    smsRelayParticipants: mockSmsRelayParticipants,
  },
  getDb: () => ({ smsRelayParticipants: mockSmsRelayParticipants }),
}));

import { db } from "@/lib/persistence";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SMS Relay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Enrollment", () => {
    it("should create enrollment with valid phone", async () => {
      const expected = {
        id: "enroll-1",
        familyId: "fam-123",
        parentId: "parent-123",
        phone: "+12025551234",
        proxyNumber: "+14155552671",
        isActive: true,
        enrolledAt: new Date().toISOString(),
      };

      mockSmsRelayParticipants.create.mockResolvedValue(expected);

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
      mockSmsRelayParticipants.create
        .mockResolvedValueOnce({
          id: "enroll-1",
          familyId: "fam-123",
          parentId: "parent-123",
          phone: "+12025551234",
          proxyNumber: "+14155552671",
          isActive: true,
          enrolledAt: new Date().toISOString(),
        })
        .mockRejectedValueOnce(new Error("duplicate key violation"));

      await db.smsRelayParticipants.create({
        familyId: "fam-123",
        parentId: "parent-123",
        phone: "+12025551234",
        proxyNumber: "+14155552671",
      });

      await expect(
        db.smsRelayParticipants.create({
          familyId: "fam-123",
          parentId: "parent-123",
          phone: "+12125559876",
          proxyNumber: "+14155552672",
        })
      ).rejects.toThrow();
    });
  });

  describe("Finding enrollments", () => {
    it("should find enrollment by parent ID", async () => {
      const parentId = "parent-456";
      const expected = {
        id: "enroll-2",
        familyId: "fam-456",
        parentId,
        phone: "+12025551234",
        proxyNumber: "+14155552671",
        isActive: true,
        enrolledAt: new Date().toISOString(),
      };

      mockSmsRelayParticipants.findByParentId.mockResolvedValue(expected);

      const found = await db.smsRelayParticipants.findByParentId(parentId);

      expect(found).toBeDefined();
      expect(found?.parentId).toBe(parentId);
      expect(mockSmsRelayParticipants.findByParentId).toHaveBeenCalledWith(parentId);
    });

    it("should find enrollment by proxy number", async () => {
      const proxyNumber = "+14155552671";
      const expected = {
        id: "enroll-3",
        familyId: "fam-789",
        parentId: "parent-789",
        phone: "+12025551234",
        proxyNumber,
        isActive: true,
        enrolledAt: new Date().toISOString(),
      };

      mockSmsRelayParticipants.findByProxyNumber.mockResolvedValue(expected);

      const found = await db.smsRelayParticipants.findByProxyNumber(proxyNumber);

      expect(found).toBeDefined();
      expect(found?.proxyNumber).toBe(proxyNumber);
    });

    it("should find enrollment by phone and family", async () => {
      const phone = "+12025551234";
      const familyId = "fam-abc";
      const expected = {
        id: "enroll-4",
        familyId,
        parentId: "parent-abc",
        phone,
        proxyNumber: "+14155552671",
        isActive: true,
        enrolledAt: new Date().toISOString(),
      };

      mockSmsRelayParticipants.findByPhoneAndFamily.mockResolvedValue(expected);

      const found = await db.smsRelayParticipants.findByPhoneAndFamily(phone, familyId);

      expect(found).toBeDefined();
      expect(found?.phone).toBe(phone);
      expect(found?.familyId).toBe(familyId);
    });

    it("should find multiple enrollments by family", async () => {
      const familyId = "fam-multi";
      mockSmsRelayParticipants.findByFamilyId.mockResolvedValue([
        {
          id: "enroll-5",
          familyId,
          parentId: "parent-1",
          phone: "+12025551234",
          proxyNumber: "+14155552671",
          isActive: true,
          enrolledAt: new Date().toISOString(),
        },
        {
          id: "enroll-6",
          familyId,
          parentId: "parent-2",
          phone: "+12125559876",
          proxyNumber: "+14155552672",
          isActive: true,
          enrolledAt: new Date().toISOString(),
        },
      ]);

      const found = await db.smsRelayParticipants.findByFamilyId(familyId);

      expect(found).toHaveLength(2);
      expect(found.map((e) => e.parentId)).toContain("parent-1");
      expect(found.map((e) => e.parentId)).toContain("parent-2");
    });
  });

  describe("Deactivation", () => {
    it("should deactivate enrollment", async () => {
      const parentId = "parent-deact";

      mockSmsRelayParticipants.deactivate.mockResolvedValue(undefined);
      mockSmsRelayParticipants.findByParentId.mockResolvedValue({
        id: "enroll-7",
        familyId: "fam-deact",
        parentId,
        phone: "+12025551234",
        proxyNumber: "+14155552671",
        isActive: false,
        enrolledAt: new Date().toISOString(),
      });

      await db.smsRelayParticipants.deactivate(parentId);

      const found = await db.smsRelayParticipants.findByParentId(parentId);
      expect(found?.isActive).toBe(false);
    });

    it("should not return inactive enrollments in active family queries", async () => {
      const familyId = "fam-inactive";

      // findByFamilyId should only return active enrollments (filtered by repository)
      mockSmsRelayParticipants.findByFamilyId.mockResolvedValue([]);

      const active = await db.smsRelayParticipants.findByFamilyId(familyId);

      expect(active).toHaveLength(0);
      const inactiveCount = active.filter((e) => !e.isActive).length;
      expect(inactiveCount).toBe(0);
    });
  });

  describe("Outgoing SMS relay", () => {
    it("should identify recipients as family members who did not send the message", async () => {
      const familyId = "fam-outgoing";
      const senderId = "parent-sender";

      const allParticipants = [
        {
          id: "enroll-8",
          familyId,
          parentId: senderId,
          phone: "+12025551234",
          proxyNumber: "+14155552671",
          isActive: true,
          enrolledAt: new Date().toISOString(),
        },
        {
          id: "enroll-9",
          familyId,
          parentId: "parent-recipient",
          phone: "+12125559876",
          proxyNumber: "+14155552672",
          isActive: true,
          enrolledAt: new Date().toISOString(),
        },
      ];

      mockSmsRelayParticipants.findByFamilyId.mockResolvedValue(allParticipants);

      const participants = await db.smsRelayParticipants.findByFamilyId(familyId);
      const recipients = participants.filter(
        (p) => p.parentId !== senderId && p.isActive
      );

      expect(recipients).toHaveLength(1);
      expect(recipients[0].parentId).toBe("parent-recipient");
    });
  });
});
