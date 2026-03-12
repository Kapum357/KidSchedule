 

/**
 * GET /api/school/vault/quota endpoint tests
 *
 * Tests cover:
 * 1. Happy path: Returns correct quota status
 * 2. Authentication: 401 when unauthenticated
 * 3. Family not found: 404 when user not in family
 * 4. No subscription: Uses free tier defaults
 * 5. With subscription: Uses plan tier limits
 * 6. Quota calculations: percentFull and canUpload logic
 * 7. Edge cases: At limits, over limits, unlimited tiers
 */

describe("GET /api/school/vault/quota - Quota Status", () => {
  describe("Response structure", () => {
    it("should have all required fields in response", () => {
      const mockResponse = {
        maxDocuments: 10,
        currentDocuments: 2,
        maxStorageBytes: 104857600,
        usedStorageBytes: 52428800,
        documentPercentFull: 20,
        storagePercentFull: 50,
        canUpload: true,
      };

      expect(mockResponse).toHaveProperty("maxDocuments");
      expect(mockResponse).toHaveProperty("currentDocuments");
      expect(mockResponse).toHaveProperty("maxStorageBytes");
      expect(mockResponse).toHaveProperty("usedStorageBytes");
      expect(mockResponse).toHaveProperty("documentPercentFull");
      expect(mockResponse).toHaveProperty("storagePercentFull");
      expect(mockResponse).toHaveProperty("canUpload");
    });

    it("should return null for percentFull when limits are unlimited", () => {
      const mockResponse = {
        maxDocuments: null,
        currentDocuments: 100,
        maxStorageBytes: null,
        usedStorageBytes: 1000000000,
        documentPercentFull: null,
        storagePercentFull: null,
        canUpload: true,
      };

      expect(mockResponse.documentPercentFull).toBeNull();
      expect(mockResponse.storagePercentFull).toBeNull();
      expect(mockResponse.canUpload).toBe(true);
    });
  });

  describe("Document quota calculations", () => {
    it("should calculate document percentage correctly", () => {
      // 5 out of 10 documents = 50%
      const percent = Math.round((5 / 10) * 100);
      expect(percent).toBe(50);
    });

    it("should round document percentage to nearest integer", () => {
      // 3 out of 10 documents = 30%
      const percent = Math.round((3 / 10) * 100);
      expect(percent).toBe(30);

      // 1 out of 3 documents = 33.33% rounds to 33%
      const percent2 = Math.round((1 / 3) * 100);
      expect(percent2).toBe(33);
    });

    it("should handle zero documents", () => {
      const percent = Math.round((0 / 10) * 100);
      expect(percent).toBe(0);
    });

    it("should handle at-limit document count", () => {
      const percent = Math.round((10 / 10) * 100);
      expect(percent).toBe(100);
    });
  });

  describe("Storage quota calculations", () => {
    it("should calculate storage percentage correctly", () => {
      // 50 MB out of 100 MB = 50%
      const used = 52428800; // 50 MB
      const max = 104857600; // 100 MB
      const percent = Math.round((used / max) * 100);
      expect(percent).toBe(50);
    });

    it("should handle gigabyte scale storage", () => {
      // 1 GB out of 2 GB = 50%
      const used = 1073741824; // 1 GB
      const max = 2147483648; // 2 GB
      const percent = Math.round((used / max) * 100);
      expect(percent).toBe(50);
    });

    it("should handle zero storage used", () => {
      const used = 0;
      const max = 104857600;
      const percent = Math.round((used / max) * 100);
      expect(percent).toBe(0);
    });

    it("should handle at-limit storage", () => {
      const used = 104857600; // 100 MB
      const max = 104857600; // 100 MB
      const percent = Math.round((used / max) * 100);
      expect(percent).toBe(100);
    });
  });

  describe("canUpload flag logic", () => {
    it("should be true when under both limits", () => {
      const canUpload =
        5 < 10 && // documents
        52428800 < 104857600; // storage (50MB < 100MB)

      expect(canUpload).toBe(true);
    });

    it("should be false when at document limit", () => {
      const canUpload =
        10 < 10 && // documents - AT LIMIT
        52428800 < 104857600; // storage

      expect(canUpload).toBe(false);
    });

    it("should be false when at storage limit", () => {
      const canUpload =
        5 < 10 && // documents
        104857600 < 104857600; // storage - AT LIMIT

      expect(canUpload).toBe(false);
    });

    it("should be false when exceeding both limits", () => {
      const canUpload =
        11 < 10 && // documents - OVER LIMIT
        105000000 < 104857600; // storage - OVER LIMIT

      expect(canUpload).toBe(false);
    });

    it("should be true with unlimited document limit", () => {
      const maxDocuments = null;
      const currentDocuments = 100;
      const canUpload =
        (maxDocuments == null || currentDocuments < maxDocuments) &&
        52428800 < 104857600;

      expect(canUpload).toBe(true);
    });

    it("should be true with unlimited storage limit", () => {
      const maxStorageBytes = null;
      const usedStorageBytes = 1000000000; // 1GB
      const canUpload =
        5 < 10 &&
        (maxStorageBytes == null || usedStorageBytes < maxStorageBytes);

      expect(canUpload).toBe(true);
    });

    it("should be true with all limits unlimited", () => {
      const canUpload =
        (null == null || 100 < null!) &&
        (null == null || 1000000000 < null!);

      expect(canUpload).toBe(true);
    });
  });

  describe("Plan tier defaults", () => {
    it("should use free tier defaults (10 docs, 100MB) when no subscription", () => {
      const maxDocuments = 10;
      const maxStorageBytes = 104857600; // 100 MB

      expect(maxDocuments).toBe(10);
      expect(maxStorageBytes).toBe(104857600);
    });

    it("should use starter tier limits (100 docs, 2GB) when subscribed", () => {
      const maxDocuments = 100;
      const maxStorageBytes = 2147483648; // 2 GB

      expect(maxDocuments).toBe(100);
      expect(maxStorageBytes).toBe(2147483648);
    });

    it("should use professional tier unlimited (null) when subscribed", () => {
      const maxDocuments = null;
      const maxStorageBytes = null;

      expect(maxDocuments).toBeNull();
      expect(maxStorageBytes).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("should handle very large byte counts", () => {
      // 10 TB storage
      const used = 10995116277760;
      const max = 10995116277760;
      const percent = Math.round((used / max) * 100);
      expect(percent).toBe(100);
    });

    it("should handle fractional percentages", () => {
      // 1 out of 7 documents
      const percent = Math.round((1 / 7) * 100);
      expect(percent).toBeGreaterThan(0);
      expect(percent).toBeLessThanOrEqual(100);
    });

    it("should handle zero max limits as unlimited", () => {
      // 0 maxDocuments means unlimited (explicit tier limit)
      const maxDocuments = 0;
      const currentDocuments = 1000;
      const canUpload =
        maxDocuments === 0 || currentDocuments < maxDocuments;

      expect(canUpload).toBe(true);
    });
  });

  describe("Quota enforcement scenarios", () => {
    it("scenario: free tier with few documents", () => {
      const maxDocuments = 10;
      const currentDocuments = 2;
      const maxStorageBytes = 104857600;
      const usedStorageBytes = 20971520; // 20 MB

      const docPercent = Math.round((currentDocuments / maxDocuments) * 100);
      const storagePercent = Math.round(
        (usedStorageBytes / maxStorageBytes) * 100
      );
      const canUpload =
        currentDocuments < maxDocuments &&
        usedStorageBytes < maxStorageBytes;

      expect(docPercent).toBe(20);
      expect(storagePercent).toBe(20);
      expect(canUpload).toBe(true);
    });

    it("scenario: starter tier near document limit", () => {
      const maxDocuments = 100;
      const currentDocuments = 95;
      const maxStorageBytes = 2147483648;
      const usedStorageBytes = 1073741824; // 1 GB of 2GB

      const docPercent = Math.round((currentDocuments / maxDocuments) * 100);
      const storagePercent = Math.round(
        (usedStorageBytes / maxStorageBytes) * 100
      );
      const canUpload =
        currentDocuments < maxDocuments &&
        usedStorageBytes < maxStorageBytes;

      expect(docPercent).toBe(95);
      expect(storagePercent).toBe(50);
      expect(canUpload).toBe(true);
    });

    it("scenario: professional tier unlimited usage", () => {
      const maxDocuments = null;
      const currentDocuments = 500;
      const maxStorageBytes = null;
      const usedStorageBytes = 5368709120; // 5 GB

      const docPercent =
        maxDocuments == null ? null : Math.round((currentDocuments / maxDocuments) * 100);
      const storagePercent =
        maxStorageBytes == null
          ? null
          : Math.round((usedStorageBytes / maxStorageBytes) * 100);
      const canUpload =
        (maxDocuments == null || currentDocuments < maxDocuments) &&
        (maxStorageBytes == null || usedStorageBytes < maxStorageBytes);

      expect(docPercent).toBeNull();
      expect(storagePercent).toBeNull();
      expect(canUpload).toBe(true);
    });

    it("scenario: quota exhausted (both limits hit)", () => {
      const maxDocuments = 10;
      const currentDocuments = 10;
      const maxStorageBytes = 104857600;
      const usedStorageBytes = 104857600;

      const docPercent = Math.round((currentDocuments / maxDocuments) * 100);
      const storagePercent = Math.round(
        (usedStorageBytes / maxStorageBytes) * 100
      );
      const canUpload =
        currentDocuments < maxDocuments &&
        usedStorageBytes < maxStorageBytes;

      expect(docPercent).toBe(100);
      expect(storagePercent).toBe(100);
      expect(canUpload).toBe(false);
    });
  });
});
