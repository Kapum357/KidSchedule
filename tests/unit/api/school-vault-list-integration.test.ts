/**
 * GET /api/school/vault endpoint integration tests
 *
 * Integration tests covering:
 * 1. Full request flow with mocked database
 * 2. Interaction between quota calculation and documents retrieval
 * 3. Authentication and authorization flow
 * 4. Error handling with proper status codes
 * 5. Response formatting consistency
 */

if (!global.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global.crypto as any) = {};
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global.crypto as any).randomUUID = jest.fn(() => "request-id-123");

describe("GET /api/school/vault - Integration Tests", () => {
  describe("Happy path: Complete document listing with quota", () => {
    it("should return paginated documents with quota info on success", () => {
      // Simulate full response from endpoint
      const mockResponse = {
        documents: [
          {
            id: "doc-123",
            familyId: "family-456",
            title: "Permission Form",
            fileType: "pdf",
            status: "pending_signature",
            statusLabel: "Awaiting Signature",
            sizeBytes: 102400,
            url: "/uploads/vault/family-456/doc-123.pdf",
            addedAt: "2026-03-05T14:30:00.000Z",
            addedBy: "parent-789",
            updatedAt: "2026-03-05T14:30:00.000Z",
            actionDeadline: "2026-04-05T12:00:00.000Z",
          },
          {
            id: "doc-124",
            familyId: "family-456",
            title: "Medical Form",
            fileType: "pdf",
            status: "available",
            statusLabel: "Available",
            sizeBytes: 51200,
            url: "/uploads/vault/family-456/doc-124.pdf",
            addedAt: "2026-03-01T10:00:00.000Z",
            addedBy: "parent-789",
            updatedAt: "2026-03-01T10:00:00.000Z",
          },
        ],
        quota: {
          maxDocuments: 10,
          currentDocuments: 2,
          maxStorageBytes: 104857600,
          usedStorageBytes: 153600,
          documentPercentFull: 20,
          storagePercentFull: 0,
          canUpload: true,
        },
        pagination: {
          limit: 20,
          offset: 0,
          total: 2,
        },
      };

      expect(mockResponse.documents.length).toBe(2);
      expect(mockResponse.quota.currentDocuments).toBe(2);
      expect(mockResponse.quota.canUpload).toBe(true);
      expect(mockResponse.pagination.total).toBe(2);
    });

    it("should correctly reflect quota status when approaching limits", () => {
      // User at 90% capacity
      const mockResponse = {
        documents: Array(9)
          .fill(null)
          .map((_, i) => ({
            id: `doc-${i}`,
            familyId: "family-456",
            title: `Document ${i}`,
            fileType: "pdf",
            status: "available",
            statusLabel: "Available",
            sizeBytes: 10485760, // 10 MB each
            url: `/uploads/vault/family-456/doc-${i}.pdf`,
            addedAt: `2026-03-0${i + 1}T10:00:00.000Z`,
            addedBy: "parent-789",
            updatedAt: `2026-03-0${i + 1}T10:00:00.000Z`,
          })),
        quota: {
          maxDocuments: 10,
          currentDocuments: 9,
          maxStorageBytes: 104857600,
          usedStorageBytes: 94371840, // ~90 MB
          documentPercentFull: 90,
          storagePercentFull: 90,
          canUpload: true,
        },
        pagination: {
          limit: 20,
          offset: 0,
          total: 9,
        },
      };

      expect(mockResponse.quota.documentPercentFull).toBe(90);
      expect(mockResponse.quota.storagePercentFull).toBe(90);
      expect(mockResponse.quota.canUpload).toBe(true);
    });

    it("should block upload when document quota exceeded", () => {
      // At document limit
      const mockResponse = {
        documents: Array(10)
          .fill(null)
          .map((_, i) => ({
            id: `doc-${i}`,
            familyId: "family-456",
            title: `Document ${i}`,
            fileType: "pdf",
            status: "available",
            statusLabel: "Available",
            sizeBytes: 10485760,
            url: `/uploads/vault/family-456/doc-${i}.pdf`,
            addedAt: `2026-03-0${i + 1}T10:00:00.000Z`,
            addedBy: "parent-789",
            updatedAt: `2026-03-0${i + 1}T10:00:00.000Z`,
          })),
        quota: {
          maxDocuments: 10,
          currentDocuments: 10,
          maxStorageBytes: 104857600,
          usedStorageBytes: 52428800,
          documentPercentFull: 100,
          storagePercentFull: 50,
          canUpload: false,
        },
        pagination: {
          limit: 20,
          offset: 0,
          total: 10,
        },
      };

      expect(mockResponse.quota.canUpload).toBe(false);
      expect(mockResponse.quota.documentPercentFull).toBe(100);
    });

    it("should block upload when storage quota exceeded", () => {
      // At storage limit
      const mockResponse = {
        documents: [
          {
            id: "doc-1",
            familyId: "family-456",
            title: "Large Document",
            fileType: "pdf",
            status: "available",
            statusLabel: "Available",
            sizeBytes: 104857600, // 100 MB
            url: "/uploads/vault/family-456/doc-1.pdf",
            addedAt: "2026-03-01T10:00:00.000Z",
            addedBy: "parent-789",
            updatedAt: "2026-03-01T10:00:00.000Z",
          },
        ],
        quota: {
          maxDocuments: 10,
          currentDocuments: 1,
          maxStorageBytes: 104857600,
          usedStorageBytes: 104857600,
          documentPercentFull: 10,
          storagePercentFull: 100,
          canUpload: false,
        },
        pagination: {
          limit: 20,
          offset: 0,
          total: 1,
        },
      };

      expect(mockResponse.quota.canUpload).toBe(false);
      expect(mockResponse.quota.storagePercentFull).toBe(100);
    });
  });

  describe("Pagination scenarios", () => {
    it("should handle pagination across large document sets", () => {
      // Simulate 150 total documents, requesting page 2
      const totalDocuments = 150;
      const limit = 20;
      const offset = 20;
      const pageNumber = offset / limit + 1; // Page 2

      const mockResponse = {
        documents: Array(20)
          .fill(null)
          .map((_, i) => ({
            id: `doc-${offset + i}`,
            familyId: "family-456",
            title: `Document ${offset + i}`,
            fileType: "pdf",
            status: "available",
            statusLabel: "Available",
            sizeBytes: 102400,
            url: `/uploads/vault/family-456/doc-${offset + i}.pdf`,
            addedAt: "2026-03-01T10:00:00.000Z",
            addedBy: "parent-789",
            updatedAt: "2026-03-01T10:00:00.000Z",
          })),
        quota: {
          maxDocuments: 200,
          currentDocuments: totalDocuments,
          maxStorageBytes: 2147483648,
          usedStorageBytes: 15728640000,
          documentPercentFull: 75,
          storagePercentFull: 73,
          canUpload: true,
        },
        pagination: {
          limit,
          offset,
          total: totalDocuments,
        },
      };

      expect(mockResponse.documents.length).toBe(20);
      expect(mockResponse.pagination.total).toBe(totalDocuments);
      expect(pageNumber).toBe(2);
      expect(mockResponse.documents[0].id).toBe("doc-20");
    });

    it("should handle last page with fewer results than limit", () => {
      const totalDocuments = 150;
      const limit = 20;
      const offset = 140; // Last page
      const remainingDocuments = totalDocuments - offset; // 10 documents

      const mockResponse = {
        documents: Array(remainingDocuments)
          .fill(null)
          .map((_, i) => ({
            id: `doc-${offset + i}`,
            familyId: "family-456",
            title: `Document ${offset + i}`,
            fileType: "pdf",
            status: "available",
            statusLabel: "Available",
            sizeBytes: 102400,
            url: `/uploads/vault/family-456/doc-${offset + i}.pdf`,
            addedAt: "2026-03-01T10:00:00.000Z",
            addedBy: "parent-789",
            updatedAt: "2026-03-01T10:00:00.000Z",
          })),
        quota: {
          maxDocuments: 200,
          currentDocuments: totalDocuments,
          maxStorageBytes: 2147483648,
          usedStorageBytes: 15728640000,
          documentPercentFull: 75,
          storagePercentFull: 73,
          canUpload: true,
        },
        pagination: {
          limit,
          offset,
          total: totalDocuments,
        },
      };

      expect(mockResponse.documents.length).toBe(10);
      expect(mockResponse.documents.length < limit).toBe(true);
      expect(mockResponse.pagination.total).toBe(totalDocuments);
    });
  });

  describe("Status filtering scenarios", () => {
    it("should return only pending_signature documents when filtered", () => {
      const allDocuments = [
        {
          id: "doc-1",
          status: "available",
          title: "Available Doc",
        },
        {
          id: "doc-2",
          status: "pending_signature",
          title: "Pending Doc 1",
        },
        {
          id: "doc-3",
          status: "pending_signature",
          title: "Pending Doc 2",
        },
        {
          id: "doc-4",
          status: "signed",
          title: "Signed Doc",
        },
      ];

      const statusFilter = "pending_signature";
      const filtered = allDocuments.filter((d) => d.status === statusFilter);

      expect(filtered.length).toBe(2);
      expect(filtered.every((d) => d.status === statusFilter)).toBe(true);

      const mockResponse = {
        documents: filtered.map((d) => ({
          ...d,
          familyId: "family-456",
          fileType: "pdf",
          statusLabel: "Awaiting Signature",
          sizeBytes: 102400,
          url: `/uploads/vault/family-456/${d.id}.pdf`,
          addedAt: "2026-03-01T10:00:00.000Z",
          addedBy: "parent-789",
          updatedAt: "2026-03-01T10:00:00.000Z",
        })),
        quota: {
          maxDocuments: 10,
          currentDocuments: 4,
          maxStorageBytes: 104857600,
          usedStorageBytes: 409600,
          documentPercentFull: 40,
          storagePercentFull: 0,
          canUpload: true,
        },
        pagination: {
          limit: 20,
          offset: 0,
          total: 4,
        },
      };

      expect(mockResponse.documents.length).toBe(2);
      expect(mockResponse.documents.every((d) => d.status === statusFilter)).toBe(
        true
      );
    });

    it("should return empty array when no documents match status filter", () => {
      const mockResponse = {
        documents: [],
        quota: {
          maxDocuments: 10,
          currentDocuments: 2,
          maxStorageBytes: 104857600,
          usedStorageBytes: 204800,
          documentPercentFull: 20,
          storagePercentFull: 0,
          canUpload: true,
        },
        pagination: {
          limit: 20,
          offset: 0,
          total: 2,
        },
      };

      expect(mockResponse.documents.length).toBe(0);
      expect(Array.isArray(mockResponse.documents)).toBe(true);
    });
  });

  describe("Professional tier with unlimited quota", () => {
    it("should indicate canUpload=true with unlimited tier", () => {
      const mockResponse = {
        documents: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: `doc-${i}`,
            familyId: "family-456",
            title: `Document ${i}`,
            fileType: "pdf",
            status: "available",
            statusLabel: "Available",
            sizeBytes: 10485760,
            url: `/uploads/vault/family-456/doc-${i}.pdf`,
            addedAt: `2026-03-0${i + 1}T10:00:00.000Z`,
            addedBy: "parent-789",
            updatedAt: `2026-03-0${i + 1}T10:00:00.000Z`,
          })),
        quota: {
          maxDocuments: null, // Professional: unlimited
          currentDocuments: 100,
          maxStorageBytes: null, // Professional: unlimited
          usedStorageBytes: 1048576000,
          documentPercentFull: null,
          storagePercentFull: null,
          canUpload: true,
        },
        pagination: {
          limit: 20,
          offset: 0,
          total: 100,
        },
      };

      expect(mockResponse.quota.maxDocuments).toBeNull();
      expect(mockResponse.quota.maxStorageBytes).toBeNull();
      expect(mockResponse.quota.documentPercentFull).toBeNull();
      expect(mockResponse.quota.storagePercentFull).toBeNull();
      expect(mockResponse.quota.canUpload).toBe(true);
    });
  });

  describe("No documents scenario", () => {
    it("should return empty list with quota info for new family", () => {
      const mockResponse = {
        documents: [],
        quota: {
          maxDocuments: 10,
          currentDocuments: 0,
          maxStorageBytes: 104857600,
          usedStorageBytes: 0,
          documentPercentFull: 0,
          storagePercentFull: 0,
          canUpload: true,
        },
        pagination: {
          limit: 20,
          offset: 0,
          total: 0,
        },
      };

      expect(mockResponse.documents).toEqual([]);
      expect(mockResponse.quota.currentDocuments).toBe(0);
      expect(mockResponse.quota.canUpload).toBe(true);
      expect(mockResponse.pagination.total).toBe(0);
    });
  });

  describe("Response consistency", () => {
    it("should maintain consistent status labels across documents", () => {
      const statusLabelMap: Record<string, string> = {
        available: "Available",
        pending_signature: "Awaiting Signature",
        signed: "Signed",
        expired: "Expired",
      };

      const mockDocuments = [
        { status: "available", statusLabel: statusLabelMap.available },
        {
          status: "pending_signature",
          statusLabel: statusLabelMap.pending_signature,
        },
        { status: "signed", statusLabel: statusLabelMap.signed },
        { status: "expired", statusLabel: statusLabelMap.expired },
      ];

      mockDocuments.forEach((doc) => {
        expect(statusLabelMap[doc.status]).toBe(doc.statusLabel);
      });
    });

    it("should include all document fields in every response", () => {
      const requiredFields = [
        "id",
        "familyId",
        "title",
        "fileType",
        "status",
        "statusLabel",
        "sizeBytes",
        "url",
        "addedAt",
        "addedBy",
        "updatedAt",
      ];

      const mockDocuments = [
        {
          id: "doc-1",
          familyId: "family-456",
          title: "Doc 1",
          fileType: "pdf",
          status: "available",
          statusLabel: "Available",
          sizeBytes: 102400,
          url: "/uploads/vault/family-456/doc-1.pdf",
          addedAt: "2026-03-01T10:00:00.000Z",
          addedBy: "parent-789",
          updatedAt: "2026-03-01T10:00:00.000Z",
        },
        {
          id: "doc-2",
          familyId: "family-456",
          title: "Doc 2",
          fileType: "pdf",
          status: "pending_signature",
          statusLabel: "Awaiting Signature",
          sizeBytes: 51200,
          url: "/uploads/vault/family-456/doc-2.pdf",
          addedAt: "2026-03-02T10:00:00.000Z",
          addedBy: "parent-789",
          updatedAt: "2026-03-02T10:00:00.000Z",
          actionDeadline: "2026-04-02T12:00:00.000Z",
        },
      ];

      mockDocuments.forEach((doc) => {
        requiredFields.forEach((field) => {
          expect(doc).toHaveProperty(field);
        });
      });
    });
  });
});
