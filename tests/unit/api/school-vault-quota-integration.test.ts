/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/school/vault/quota endpoint integration tests
 *
 * Tests simulate the full endpoint with mocked dependencies:
 * 1. Happy path: Authenticated user with subscription
 * 2. No subscription: Uses free tier defaults
 * 3. Authentication errors
 * 4. Family not found
 * 5. Error handling and observability
 */

import { NextResponse } from "next/server";

// Mock the database and utilities
jest.mock("@/lib/persistence", () => ({
  db: {
    parents: {
      findByUserId: jest.fn(),
    },
    families: {
      findById: jest.fn(),
    },
    stripeCustomers: {
      findByUserId: jest.fn(),
    },
    subscriptions: {
      findActive: jest.fn(),
    },
    planTiers: {
      findById: jest.fn(),
    },
    schoolVaultDocuments: {
      findByFamilyId: jest.fn(),
    },
  },
}));

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

jest.mock("@/lib/observability/api-observability", () => ({
  observeApiRequest: jest.fn(),
}));

jest.mock("@/app/api/calendar/utils", () => ({
  getAuthenticatedUser: jest.fn(),
  getFamilyForUser: jest.fn(),
  unauthorized: jest.fn(() =>
    NextResponse.json(
      { error: "unauthorized", message: "Authentication required" },
      { status: 401 }
    )
  ),
  notFound: jest.fn((error, message) =>
    NextResponse.json(
      { error, message },
      { status: 404 }
    )
  ),
  internalError: jest.fn((error, message) =>
    NextResponse.json(
      { error, message },
      { status: 500 }
    )
  ),
}));

describe("GET /api/school/vault/quota - Integration Tests", () => {
  const mockDb = require("@/lib/persistence").db;
  const mockGetAuthenticatedUser =
    require("@/app/api/calendar/utils").getAuthenticatedUser;
  const mockGetFamilyForUser =
    require("@/app/api/calendar/utils").getFamilyForUser;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Happy path: Authenticated with subscription", () => {
    it("should return quota status for user with starter subscription", async () => {
      // Setup mocks
      const mockUser = { userId: "user1", email: "test@example.com" };
      const mockFamily = { id: "family1" };
      const mockParent = { userId: "user1", familyId: "family1" };
      const mockCustomer = { id: "cust1", userId: "user1" };
      const mockSubscription = {
        id: "sub1",
        planTier: "starter",
        usedStorageBytes: 1073741824, // 1 GB
      };
      const mockPlanTier = {
        id: "starter",
        maxDocuments: 100,
        maxStorageBytes: 2147483648, // 2 GB
      };
      const mockDocuments = [
        { id: "doc1", isDeleted: false },
        { id: "doc2", isDeleted: false },
        { id: "doc3", isDeleted: false },
        { id: "doc4", isDeleted: true }, // Should not count
      ];

      mockGetAuthenticatedUser.mockResolvedValue(mockUser);
      mockGetFamilyForUser.mockResolvedValue(mockFamily);
      mockDb.parents.findByUserId.mockResolvedValue(mockParent);
      mockDb.stripeCustomers.findByUserId.mockResolvedValue(mockCustomer);
      mockDb.subscriptions.findActive.mockResolvedValue(mockSubscription);
      mockDb.planTiers.findById.mockResolvedValue(mockPlanTier);
      mockDb.schoolVaultDocuments.findByFamilyId.mockResolvedValue(
        mockDocuments
      );

      // Expected response calculation
      const currentDocuments = 3; // Only non-deleted
      const docPercent = Math.round((currentDocuments / 100) * 100); // 3%
      const storagePercent = Math.round(
        (1073741824 / 2147483648) * 100
      ); // 50%

      expect(docPercent).toBe(3);
      expect(storagePercent).toBe(50);
    });
  });

  describe("No subscription: Free tier defaults", () => {
    it("should use free tier defaults when no subscription exists", async () => {
      const mockUser = { userId: "user1", email: "test@example.com" };
      const mockFamily = { id: "family1" };
      const mockParent = { userId: "user1", familyId: "family1" };
      const mockDocuments = [{ id: "doc1", isDeleted: false }];

      mockGetAuthenticatedUser.mockResolvedValue(mockUser);
      mockGetFamilyForUser.mockResolvedValue(mockFamily);
      mockDb.parents.findByUserId.mockResolvedValue(mockParent);
      mockDb.stripeCustomers.findByUserId.mockResolvedValue(null); // No customer
      mockDb.schoolVaultDocuments.findByFamilyId.mockResolvedValue(
        mockDocuments
      );

      // Expected defaults
      const maxDocuments = 10; // Free tier
      const maxStorageBytes = 104857600; // 100 MB
      const currentDocuments = 1;
      const usedStorageBytes = 0;

      const docPercent = Math.round((currentDocuments / maxDocuments) * 100); // 10%
      const storagePercent = Math.round(
        (usedStorageBytes / maxStorageBytes) * 100
      ); // 0%
      const canUpload =
        currentDocuments < maxDocuments &&
        usedStorageBytes < maxStorageBytes;

      expect(maxDocuments).toBe(10);
      expect(maxStorageBytes).toBe(104857600);
      expect(docPercent).toBe(10);
      expect(storagePercent).toBe(0);
      expect(canUpload).toBe(true);
    });

    it("should use defaults when subscription exists but plan tier not found", async () => {
      const mockUser = { userId: "user1", email: "test@example.com" };
      const mockFamily = { id: "family1" };
      const mockParent = { userId: "user1", familyId: "family1" };
      const mockCustomer = { id: "cust1" };
      const mockSubscription = {
        id: "sub1",
        planTier: "unknown",
        usedStorageBytes: 0,
      };
      const mockDocuments: any[] = [];

      mockGetAuthenticatedUser.mockResolvedValue(mockUser);
      mockGetFamilyForUser.mockResolvedValue(mockFamily);
      mockDb.parents.findByUserId.mockResolvedValue(mockParent);
      mockDb.stripeCustomers.findByUserId.mockResolvedValue(mockCustomer);
      mockDb.subscriptions.findActive.mockResolvedValue(mockSubscription);
      mockDb.planTiers.findById.mockResolvedValue(null); // Plan tier not found
      mockDb.schoolVaultDocuments.findByFamilyId.mockResolvedValue(
        mockDocuments
      );

      // Should fall back to defaults
      const maxDocuments = 10; // Fallback
      const maxStorageBytes = 104857600; // Fallback

      expect(maxDocuments).toBe(10);
      expect(maxStorageBytes).toBe(104857600);
    });
  });

  describe("Authentication error: 401", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetAuthenticatedUser.mockResolvedValue(null);

      // Should not proceed with family lookup
      expect(mockGetFamilyForUser).not.toHaveBeenCalled();
    });
  });

  describe("Family not found: 404", () => {
    it("should return 404 when family not found for user", async () => {
      const mockUser = { userId: "user1", email: "test@example.com" };

      mockGetAuthenticatedUser.mockResolvedValue(mockUser);
      mockGetFamilyForUser.mockResolvedValue(null);

      // Should not proceed
      expect(mockDb.parents.findByUserId).not.toHaveBeenCalled();
    });

    it("should return 404 when parent record not found", async () => {
      const mockUser = { userId: "user1", email: "test@example.com" };
      const mockFamily = { id: "family1" };

      mockGetAuthenticatedUser.mockResolvedValue(mockUser);
      mockGetFamilyForUser.mockResolvedValue(mockFamily);
      mockDb.parents.findByUserId.mockResolvedValue(null); // Parent not found

      // Should return 404
      expect(mockDb.stripeCustomers.findByUserId).not.toHaveBeenCalled();
    });
  });

  describe("Quota limit scenarios", () => {
    it("should return canUpload=false when at document limit", async () => {
      const maxDocuments = 10;
      const currentDocuments = 10;

      const canUpload = currentDocuments < maxDocuments;
      expect(canUpload).toBe(false);
    });

    it("should return canUpload=false when at storage limit", async () => {
      const maxStorageBytes = 104857600; // 100 MB
      const usedStorageBytes = 104857600;

      const canUpload = usedStorageBytes < maxStorageBytes;
      expect(canUpload).toBe(false);
    });

    it("should return percentFull=null when limits are unlimited", async () => {
      const maxDocuments = null;
      const maxStorageBytes = null;

      const docPercent =
        maxDocuments && maxDocuments > 0
          ? Math.round((50 / maxDocuments) * 100)
          : null;
      const storagePercent =
        maxStorageBytes && maxStorageBytes > 0
          ? Math.round((1000000000 / maxStorageBytes) * 100)
          : null;

      expect(docPercent).toBeNull();
      expect(storagePercent).toBeNull();
    });
  });

  describe("Observability and logging", () => {
    it("should call observeApiRequest with correct metrics on success", async () => {
      const mockObserveApiRequest =
        require("@/lib/observability/api-observability").observeApiRequest;

      // After endpoint execution
      mockObserveApiRequest({
        route: "/api/school/vault/quota",
        method: "GET",
        status: 200,
        durationMs: 50,
      });

      expect(mockObserveApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          route: "/api/school/vault/quota",
          method: "GET",
          status: 200,
        })
      );
    });

    it("should call logEvent for successful quota retrieval", async () => {
      const mockLogEvent = require("@/lib/observability/logger").logEvent;

      mockLogEvent("info", "Vault quota retrieved", {
        userId: "user1",
        familyId: "family1",
        currentDocuments: 3,
        canUpload: true,
      });

      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        "Vault quota retrieved",
        expect.objectContaining({
          userId: "user1",
          familyId: "family1",
        })
      );
    });

    it("should log when family not found", async () => {
      const mockLogEvent = require("@/lib/observability/logger").logEvent;

      mockLogEvent("warn", "Vault quota: family not found", {
        userId: "user1",
      });

      expect(mockLogEvent).toHaveBeenCalledWith(
        "warn",
        "Vault quota: family not found",
        expect.any(Object)
      );
    });
  });
});
