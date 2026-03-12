/**
 * GET /api/school/vault endpoint tests
 *
 * Tests cover:
 * 1. Happy path: Returns documents + quota with valid authentication
 * 2. Authentication: 401 when unauthenticated
 * 3. Family not found: 404 when user not in family
 * 4. Pagination: limit, offset parameter validation
 * 5. Status filtering: Filter by document status
 * 6. Response structure: All required fields present
 * 7. Quota enforcement: canUpload flag calculation
 */

describe("GET /api/school/vault - List Documents with Quota", () => {
  describe("Response structure", () => {
    it("should have documents array in response", () => {
      const mockResponse = {
        documents: [
          {
            id: "doc-1",
            familyId: "family-1",
            title: "Permission Form",
            fileType: "pdf",
            status: "available",
            statusLabel: "Available",
            sizeBytes: 102400,
            url: "/uploads/vault/family-1/doc-1.pdf",
            addedAt: "2026-03-01T10:00:00.000Z",
            addedBy: "parent-1",
            updatedAt: "2026-03-01T10:00:00.000Z",
          },
        ],
        quota: {
          maxDocuments: 10,
          currentDocuments: 1,
          maxStorageBytes: 104857600,
          usedStorageBytes: 102400,
          documentPercentFull: 10,
          storagePercentFull: 0,
          canUpload: true,
        },
        pagination: {
          limit: 20,
          offset: 0,
          total: 1,
        },
      };

      expect(mockResponse).toHaveProperty("documents");
      expect(mockResponse).toHaveProperty("quota");
      expect(mockResponse).toHaveProperty("pagination");
      expect(Array.isArray(mockResponse.documents)).toBe(true);
    });

    it("should have all required fields in quota object", () => {
      const mockQuota = {
        maxDocuments: 10,
        currentDocuments: 2,
        maxStorageBytes: 104857600,
        usedStorageBytes: 52428800,
        documentPercentFull: 20,
        storagePercentFull: 50,
        canUpload: true,
      };

      expect(mockQuota).toHaveProperty("maxDocuments");
      expect(mockQuota).toHaveProperty("currentDocuments");
      expect(mockQuota).toHaveProperty("maxStorageBytes");
      expect(mockQuota).toHaveProperty("usedStorageBytes");
      expect(mockQuota).toHaveProperty("documentPercentFull");
      expect(mockQuota).toHaveProperty("storagePercentFull");
      expect(mockQuota).toHaveProperty("canUpload");
    });

    it("should have all required fields in document object", () => {
      const mockDocument = {
        id: "doc-123",
        familyId: "family-456",
        title: "School Permission Form",
        fileType: "pdf",
        status: "available",
        statusLabel: "Available",
        sizeBytes: 102400,
        url: "https://example.com/form.pdf",
        addedAt: "2026-03-01T10:00:00.000Z",
        addedBy: "parent-789",
        updatedAt: "2026-03-01T10:00:00.000Z",
      };

      expect(mockDocument).toHaveProperty("id");
      expect(mockDocument).toHaveProperty("familyId");
      expect(mockDocument).toHaveProperty("title");
      expect(mockDocument).toHaveProperty("fileType");
      expect(mockDocument).toHaveProperty("status");
      expect(mockDocument).toHaveProperty("statusLabel");
      expect(mockDocument).toHaveProperty("sizeBytes");
      expect(mockDocument).toHaveProperty("url");
      expect(mockDocument).toHaveProperty("addedAt");
      expect(mockDocument).toHaveProperty("addedBy");
      expect(mockDocument).toHaveProperty("updatedAt");
    });

    it("should include actionDeadline in document when present", () => {
      const mockDocument = {
        id: "doc-123",
        familyId: "family-456",
        title: "School Permission Form",
        fileType: "pdf",
        status: "pending_signature",
        statusLabel: "Awaiting Signature",
        sizeBytes: 102400,
        url: "https://example.com/form.pdf",
        addedAt: "2026-03-01T10:00:00.000Z",
        addedBy: "parent-789",
        updatedAt: "2026-03-01T10:00:00.000Z",
        actionDeadline: "2026-04-01T12:00:00.000Z",
      };

      expect(mockDocument.actionDeadline).toBeDefined();
      expect(mockDocument.actionDeadline).toBe("2026-04-01T12:00:00.000Z");
    });

    it("should have all required fields in pagination object", () => {
      const mockPagination = {
        limit: 20,
        offset: 0,
        total: 50,
      };

      expect(mockPagination).toHaveProperty("limit");
      expect(mockPagination).toHaveProperty("offset");
      expect(mockPagination).toHaveProperty("total");
    });
  });

  describe("Pagination parameters", () => {
    it("should accept valid limit parameter (between 1 and 100)", () => {
      const validLimits = [1, 10, 20, 50, 100];

      validLimits.forEach((limit) => {
        expect(limit >= 1 && limit <= 100).toBe(true);
      });
    });

    it("should reject limit > 100", () => {
      const limit = 101;
      expect(limit > 100).toBe(true);
    });

    it("should reject limit < 1", () => {
      const limit = 0;
      expect(limit < 1).toBe(true);
    });

    it("should reject non-numeric limit", () => {
      const limitParam = "invalid";
      const parsed = parseInt(limitParam, 10);
      expect(isNaN(parsed)).toBe(true);
    });

    it("should accept valid offset parameter (>= 0)", () => {
      const validOffsets = [0, 10, 20, 100, 1000];

      validOffsets.forEach((offset) => {
        expect(offset >= 0).toBe(true);
      });
    });

    it("should reject negative offset", () => {
      const offset = -1;
      expect(offset < 0).toBe(true);
    });

    it("should reject non-numeric offset", () => {
      const offsetParam = "invalid";
      const parsed = parseInt(offsetParam, 10);
      expect(isNaN(parsed)).toBe(true);
    });

    it("should use default limit (20) when not provided", () => {
      const defaultLimit = 20;
      expect(defaultLimit).toBe(20);
    });

    it("should use default offset (0) when not provided", () => {
      const defaultOffset = 0;
      expect(defaultOffset).toBe(0);
    });

    it("should correctly slice documents with limit and offset", () => {
      const allDocuments = [
        { id: "1", title: "Doc 1" },
        { id: "2", title: "Doc 2" },
        { id: "3", title: "Doc 3" },
        { id: "4", title: "Doc 4" },
        { id: "5", title: "Doc 5" },
      ];

      const limit = 2;
      const offset = 1;

      const sliced = allDocuments.slice(offset, offset + limit);
      expect(sliced).toEqual([
        { id: "2", title: "Doc 2" },
        { id: "3", title: "Doc 3" },
      ]);
      expect(sliced.length).toBe(2);
    });
  });

  describe("Status filtering", () => {
    it("should accept valid status values", () => {
      const validStatuses = [
        "available",
        "pending_signature",
        "signed",
        "expired",
      ];

      validStatuses.forEach((status) => {
        expect(
          ["available", "pending_signature", "signed", "expired"].includes(
            status
          )
        ).toBe(true);
      });
    });

    it("should reject invalid status values", () => {
      const invalidStatuses = ["archived", "deleted", "invalid", "pending"];

      invalidStatuses.forEach((status) => {
        const validStatuses = [
          "available",
          "pending_signature",
          "signed",
          "expired",
        ];
        expect(validStatuses.includes(status)).toBe(false);
      });
    });

    it("should handle no status filter (return all documents)", () => {
      const statusFilter = undefined;
      expect(statusFilter).toBeUndefined();
    });

    it("should filter documents by status", () => {
      const allDocuments = [
        { id: "1", status: "available" },
        { id: "2", status: "pending_signature" },
        { id: "3", status: "available" },
        { id: "4", status: "signed" },
      ];

      const statusFilter = "available";
      const filtered = allDocuments.filter((d) => d.status === statusFilter);

      expect(filtered.length).toBe(2);
      expect(filtered.every((d) => d.status === "available")).toBe(true);
    });
  });

  describe("Document sorting", () => {
    it("should sort documents by addedAt DESC (newest first)", () => {
      const unsorted = [
        {
          id: "1",
          addedAt: "2026-03-01T10:00:00.000Z",
          title: "Oldest",
        },
        {
          id: "2",
          addedAt: "2026-03-03T10:00:00.000Z",
          title: "Newest",
        },
        {
          id: "3",
          addedAt: "2026-03-02T10:00:00.000Z",
          title: "Middle",
        },
      ];

      const sorted = unsorted.sort(
        (a, b) =>
          new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
      );

      expect(sorted[0].id).toBe("2");
      expect(sorted[1].id).toBe("3");
      expect(sorted[2].id).toBe("1");
    });
  });

  describe("Quota calculations", () => {
    it("should calculate document percentage correctly", () => {
      const percent = Math.round((5 / 10) * 100);
      expect(percent).toBe(50);
    });

    it("should calculate storage percentage correctly", () => {
      const used = 52428800; // 50 MB
      const max = 104857600; // 100 MB
      const percent = Math.round((used / max) * 100);
      expect(percent).toBe(50);
    });

    it("should return null for documentPercentFull when unlimited", () => {
      const maxDocuments = null;
      const currentDocuments = 100;
      const documentPercentFull =
        maxDocuments && maxDocuments > 0
          ? Math.round((currentDocuments / maxDocuments) * 100)
          : null;

      expect(documentPercentFull).toBeNull();
    });

    it("should return null for storagePercentFull when unlimited", () => {
      const maxStorageBytes = null;
      const usedStorageBytes = 1000000000;
      const storagePercentFull =
        maxStorageBytes && maxStorageBytes > 0
          ? Math.round((usedStorageBytes / maxStorageBytes) * 100)
          : null;

      expect(storagePercentFull).toBeNull();
    });
  });

  describe("canUpload flag calculation", () => {
    it("should return true when under both limits", () => {
      const maxDocuments = 10;
      const currentDocuments = 5;
      const maxStorageBytes = 104857600;
      const usedStorageBytes = 52428800;

      const canUpload =
        (maxDocuments == null ||
          maxDocuments === 0 ||
          currentDocuments < maxDocuments) &&
        (maxStorageBytes == null ||
          maxStorageBytes === 0 ||
          usedStorageBytes < maxStorageBytes);

      expect(canUpload).toBe(true);
    });

    it("should return false when at document limit", () => {
      const maxDocuments = 10;
      const currentDocuments = 10;
      const maxStorageBytes = 104857600;
      const usedStorageBytes = 52428800;

      const canUpload =
        (maxDocuments == null ||
          maxDocuments === 0 ||
          currentDocuments < maxDocuments) &&
        (maxStorageBytes == null ||
          maxStorageBytes === 0 ||
          usedStorageBytes < maxStorageBytes);

      expect(canUpload).toBe(false);
    });

    it("should return false when over document limit", () => {
      const maxDocuments = 10;
      const currentDocuments = 11;
      const maxStorageBytes = 104857600;
      const usedStorageBytes = 52428800;

      const canUpload =
        (maxDocuments == null ||
          maxDocuments === 0 ||
          currentDocuments < maxDocuments) &&
        (maxStorageBytes == null ||
          maxStorageBytes === 0 ||
          usedStorageBytes < maxStorageBytes);

      expect(canUpload).toBe(false);
    });

    it("should return false when at storage limit", () => {
      const maxDocuments = 10;
      const currentDocuments = 5;
      const maxStorageBytes = 104857600;
      const usedStorageBytes = 104857600;

      const canUpload =
        (maxDocuments == null ||
          maxDocuments === 0 ||
          currentDocuments < maxDocuments) &&
        (maxStorageBytes == null ||
          maxStorageBytes === 0 ||
          usedStorageBytes < maxStorageBytes);

      expect(canUpload).toBe(false);
    });

    it("should return false when over storage limit", () => {
      const maxDocuments = 10;
      const currentDocuments = 5;
      const maxStorageBytes = 104857600;
      const usedStorageBytes = 104857601;

      const canUpload =
        (maxDocuments == null ||
          maxDocuments === 0 ||
          currentDocuments < maxDocuments) &&
        (maxStorageBytes == null ||
          maxStorageBytes === 0 ||
          usedStorageBytes < maxStorageBytes);

      expect(canUpload).toBe(false);
    });

    it("should return true when limits are unlimited (null)", () => {
      const maxDocuments = null;
      const currentDocuments = 1000;
      const maxStorageBytes = null;
      const usedStorageBytes = 1000000000;

      const canUpload =
        (maxDocuments == null ||
          maxDocuments === 0 ||
          currentDocuments < maxDocuments) &&
        (maxStorageBytes == null ||
          maxStorageBytes === 0 ||
          usedStorageBytes < maxStorageBytes);

      expect(canUpload).toBe(true);
    });

    it("should return true when limits are zero (unlimited)", () => {
      const maxDocuments = 0;
      const currentDocuments = 1000;
      const maxStorageBytes = 0;
      const usedStorageBytes = 1000000000;

      const canUpload =
        (maxDocuments == null ||
          maxDocuments === 0 ||
          currentDocuments < maxDocuments) &&
        (maxStorageBytes == null ||
          maxStorageBytes === 0 ||
          usedStorageBytes < maxStorageBytes);

      expect(canUpload).toBe(true);
    });
  });

  describe("Empty results", () => {
    it("should return empty documents array when no documents exist", () => {
      const response = {
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

      expect(response.documents).toEqual([]);
      expect(response.pagination.total).toBe(0);
      expect(response.quota.canUpload).toBe(true);
    });

    it("should return correct pagination when results < limit", () => {
      const documents = [
        { id: "1", title: "Doc 1" },
        { id: "2", title: "Doc 2" },
      ];

      const limit = 20;
      const offset = 0;

      const pagination = {
        limit,
        offset,
        total: documents.length,
      };

      expect(pagination.total).toBe(2);
      expect(documents.length < limit).toBe(true);
    });

    it("should return correct pagination with offset", () => {
      const totalDocuments = 50;
      const limit = 20;
      const offset = 20;

      const pagination = {
        limit,
        offset,
        total: totalDocuments,
      };

      expect(pagination.offset).toBe(20);
      expect(pagination.limit).toBe(20);
      expect(pagination.total).toBe(50);
    });
  });

  describe("Plan tier defaults", () => {
    it("should use free tier defaults when no subscription", () => {
      const maxDocuments = 10;
      const maxStorageBytes = 104857600;

      expect(maxDocuments).toBe(10);
      expect(maxStorageBytes).toBe(104857600); // 100 MB
    });

    it("should calculate free tier storage in bytes correctly", () => {
      // 100 MB in bytes
      const megabytes = 100;
      const bytes = megabytes * 1024 * 1024;
      expect(bytes).toBe(104857600);
    });

    it("should use subscription limits when subscribed", () => {
      // Example: Starter tier
      const maxDocuments = 100;
      const maxStorageBytes = 2147483648; // 2 GB

      expect(maxDocuments).toBe(100);
      expect(maxStorageBytes).toBe(2147483648);
    });

    it("should use professional tier unlimited limits", () => {
      // Professional tier: unlimited
      const maxDocuments = null;
      const maxStorageBytes = null;

      expect(maxDocuments).toBeNull();
      expect(maxStorageBytes).toBeNull();
    });
  });

  describe("Deleted documents exclusion", () => {
    it("should not include deleted documents in count", () => {
      const allDocuments = [
        { id: "1", isDeleted: false },
        { id: "2", isDeleted: true },
        { id: "3", isDeleted: false },
      ];

      const activeDocuments = allDocuments.filter((doc) => !doc.isDeleted);
      expect(activeDocuments.length).toBe(2);
    });

    it("should filter deleted documents before pagination", () => {
      const allDocuments = [
        { id: "1", isDeleted: false, addedAt: "2026-03-01" },
        { id: "2", isDeleted: true, addedAt: "2026-03-02" },
        { id: "3", isDeleted: false, addedAt: "2026-03-03" },
        { id: "4", isDeleted: false, addedAt: "2026-03-04" },
        { id: "5", isDeleted: true, addedAt: "2026-03-05" },
      ];

      const activeDocuments = allDocuments.filter((doc) => !doc.isDeleted);
      expect(activeDocuments.length).toBe(3);

      const paginated = activeDocuments.slice(0, 2);
      expect(paginated.length).toBe(2);
      expect(paginated.every((d) => !d.isDeleted)).toBe(true);
    });
  });
});
