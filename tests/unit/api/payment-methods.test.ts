/**
 * Payment Methods API Tests
 *
 * Tests for GET, POST, DELETE endpoints.
 * Uses Jest mocks — no real DB connection required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockStripeCustomers = {
  findByUserId: jest.fn(),
};

const mockPaymentMethods = {
  findByCustomer: jest.fn(),
  setDefault: jest.fn(),
  softDelete: jest.fn(),
};

jest.mock("@/lib/persistence", () => ({
  db: {
    stripeCustomers: mockStripeCustomers,
    paymentMethods: mockPaymentMethods,
  },
}));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/observability/api-observability", () => ({
  observeApiRequest: jest.fn(),
  observeApiException: jest.fn(),
}));

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => {
      const response: Record<string, unknown> = {
        status: init?.status || 200,
        body,
      };
      return response;
    }),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { GET as getPaymentMethods } from "@/app/api/billing/payment-methods/route";
import { POST as setDefault, DELETE as deleteMethod } from "@/app/api/billing/payment-methods/[id]/route";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

const mockGetCurrentUser = getCurrentUser as jest.Mock;
const mockObserveApiRequest = observeApiRequest as jest.Mock;
const mockLogEvent = logEvent as jest.Mock;

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Payment Methods API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── GET /api/billing/payment-methods ──────────────────────────────────────

  describe("GET /api/billing/payment-methods", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const response = await getPaymentMethods();

      expect(response.status).toBe(401);
      expect(mockObserveApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          route: "/api/billing/payment-methods",
          method: "GET",
          status: 401,
        })
      );
    });

    it("should return 404 when customer not found", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue(null);

      const response = await getPaymentMethods();

      expect(response.status).toBe(404);
    });

    it("should return payment methods list", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue({ id: "cust-123" });
      mockPaymentMethods.findByCustomer.mockResolvedValue([
        {
          id: "pm-1",
          brand: "visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2025,
          isDefault: true,
          createdAt: "2026-03-11T00:00:00Z",
          isDeleted: false,
        },
        {
          id: "pm-2",
          brand: "mastercard",
          last4: "5555",
          expMonth: 6,
          expYear: 2026,
          isDefault: false,
          createdAt: "2026-03-10T00:00:00Z",
          isDeleted: false,
        },
      ]);

      const response = await getPaymentMethods();

      expect(response.status).toBe(200);
      const body = response.body as Record<string, unknown>;
      expect((body.methods as unknown[]).length).toBe(2);
      expect((body.methods as Record<string, unknown>[])[0]).toEqual({
        id: "pm-1",
        brand: "visa",
        last4: "4242",
        expiry: "12/2025",
        isDefault: true,
        createdAt: "2026-03-11T00:00:00Z",
      });
    });

    it("should handle methods without expiry gracefully", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue({ id: "cust-123" });
      mockPaymentMethods.findByCustomer.mockResolvedValue([
        {
          id: "pm-1",
          brand: "visa",
          last4: "4242",
          expMonth: undefined,
          expYear: undefined,
          isDefault: true,
          createdAt: "2026-03-11T00:00:00Z",
          isDeleted: false,
        },
      ]);

      const response = await getPaymentMethods();

      expect(response.status).toBe(200);
      const body = response.body as Record<string, unknown>;
      const methods = body.methods as Record<string, unknown>[];
      expect(methods[0].expiry).toBeUndefined();
    });
  });

  // ─── POST /api/billing/payment-methods/{id}/set-default ────────────────────

  describe("POST /api/billing/payment-methods/{id}/set-default", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const response = await setDefault({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(401);
    });

    it("should return 404 when customer not found", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue(null);

      const response = await setDefault({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(404);
    });

    it("should return 403 when payment method not owned by user", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue({ id: "cust-123" });
      mockPaymentMethods.findByCustomer.mockResolvedValue([
        { id: "pm-2", isDefault: true, isDeleted: false },
      ]);

      const response = await setDefault({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(403);
    });

    it("should set payment method as default", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue({ id: "cust-123" });
      mockPaymentMethods.findByCustomer.mockResolvedValue([
        { id: "pm-1", isDefault: false, isDeleted: false },
        { id: "pm-2", isDefault: true, isDeleted: false },
      ]);
      mockPaymentMethods.setDefault.mockResolvedValue(undefined);

      const response = await setDefault({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(200);
      const body = response.body as Record<string, unknown>;
      expect(body.success).toBe(true);
      expect(mockPaymentMethods.setDefault).toHaveBeenCalledWith("pm-1", "cust-123");
      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        "Payment method set as default",
        expect.objectContaining({ methodId: "pm-1" })
      );
    });
  });

  // ─── DELETE /api/billing/payment-methods/{id} ──────────────────────────────

  describe("DELETE /api/billing/payment-methods/{id}", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const response = await deleteMethod({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(401);
    });

    it("should return 404 when customer not found", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue(null);

      const response = await deleteMethod({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(404);
    });

    it("should return 403 when payment method not owned by user", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue({ id: "cust-123" });
      mockPaymentMethods.findByCustomer.mockResolvedValue([
        { id: "pm-2", isDefault: true, isDeleted: false },
      ]);

      const response = await deleteMethod({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(403);
    });

    it("should return 400 when trying to delete last payment method", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue({ id: "cust-123" });
      mockPaymentMethods.findByCustomer.mockResolvedValue([
        { id: "pm-1", isDefault: true, isDeleted: false },
      ]);

      const response = await deleteMethod({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(400);
      const body = response.body as Record<string, unknown>;
      expect(body.error).toBe("cannot_delete_last_method");
    });

    it("should soft-delete payment method when multiple exist", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue({ id: "cust-123" });
      mockPaymentMethods.findByCustomer.mockResolvedValue([
        { id: "pm-1", isDefault: false, isDeleted: false },
        { id: "pm-2", isDefault: true, isDeleted: false },
      ]);
      mockPaymentMethods.softDelete.mockResolvedValue(undefined);

      const response = await deleteMethod({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(204);
      const body = response.body as Record<string, unknown>;
      expect(body.success).toBe(true);
      expect(mockPaymentMethods.softDelete).toHaveBeenCalledWith("pm-1");
      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        "Payment method deleted",
        expect.objectContaining({ methodId: "pm-1" })
      );
    });

    it("should count only non-deleted methods", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue({ id: "cust-123" });
      mockPaymentMethods.findByCustomer.mockResolvedValue([
        { id: "pm-1", isDefault: true, isDeleted: false },
        { id: "pm-2", isDefault: false, isDeleted: true }, // Already deleted
      ]);

      const response = await deleteMethod({} as Request, { params: { id: "pm-1" } });

      // Should prevent deletion since only 1 active method remains
      expect(response.status).toBe(400);
    });
  });

  // ─── Error Handling ────────────────────────────────────────────────────────

  describe("Error Handling", () => {
    it("should handle database errors in GET", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockRejectedValue(new Error("DB connection failed"));

      const response = await getPaymentMethods();

      expect(response.status).toBe(500);
      const body = response.body as Record<string, unknown>;
      expect(body.error).toBe("internal_server_error");
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        "Payment methods GET error",
        expect.any(Object)
      );
    });

    it("should handle database errors in POST", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue({ id: "cust-123" });
      mockPaymentMethods.findByCustomer.mockResolvedValue([{ id: "pm-1" }]);
      mockPaymentMethods.setDefault.mockRejectedValue(new Error("DB update failed"));

      const response = await setDefault({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(500);
    });

    it("should handle database errors in DELETE", async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: "user-123" });
      mockStripeCustomers.findByUserId.mockResolvedValue({ id: "cust-123" });
      mockPaymentMethods.findByCustomer.mockResolvedValue([
        { id: "pm-1", isDeleted: false },
        { id: "pm-2", isDeleted: false },
      ]);
      mockPaymentMethods.softDelete.mockRejectedValue(new Error("DB delete failed"));

      const response = await deleteMethod({} as Request, { params: { id: "pm-1" } });

      expect(response.status).toBe(500);
    });
  });
});
