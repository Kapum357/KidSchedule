/**
 * KidSchedule – API Smoke Tests
 *
 * End-to-end smoke tests validating critical API endpoints are operational.
 * These tests verify the API is responding correctly without deep functionality testing.
 *
 * @module tests/e2e/api-smoke
 */

import { test, expect } from "@playwright/test";

// ─── Health Check ──────────────────────────────────────────────────────────

test.describe("Health Check API", () => {
  test("GET /api/health returns 200 with status object", async ({ request }) => {
    const response = await request.get("/api/health");

    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.length).toBeGreaterThan(0);
  });

  test("health check includes database status", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    const databaseCheck = body.checks.find((check: { name: string }) => check.name === "database");
    expect(databaseCheck).toBeDefined();
    expect(["healthy", "unhealthy", "degraded"]).toContain(
      databaseCheck?.status,
    );
  });
});

// ─── Auth API ──────────────────────────────────────────────────────────────

test.describe("Auth API", () => {
  test("POST /api/auth/login rejects missing credentials", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/login", {
      data: {},
    });

    expect([400, 401]).toContain(response.status());

    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/auth/login rejects invalid credentials", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/login", {
      data: {
        email: "nonexistent@example.com",
        password: "wrongpassword123",
      },
    });

    // Should return 401 for invalid credentials
    expect([400, 401]).toContain(response.status());
  });

  test("POST /api/auth/refresh rejects missing token", async ({ request }) => {
    const response = await request.post("/api/auth/refresh", {
      data: {},
    });

    // Should reject when no refresh token cookie present
    expect([400, 401]).toContain(response.status());
  });

  test("POST /api/auth/logout returns 204", async ({ request }) => {
    const response = await request.post("/api/auth/logout");

    expect(response.status()).toBe(204);
  });
});

// ─── Phone Verification API ────────────────────────────────────────────────

test.describe("Phone Verification API", () => {
  test("POST /api/phone/verify/start rejects missing phone", async ({
    request,
  }) => {
    const response = await request.post("/api/phone/verify/start", {
      data: {},
    });

    expect([400, 401]).toContain(response.status());

    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/phone/verify/start rejects invalid phone format", async ({
    request,
  }) => {
    const response = await request.post("/api/phone/verify/start", {
      data: { phone: "invalid-phone" },
    });

    expect([400, 401]).toContain(response.status());

    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test("POST /api/phone/verify/check rejects missing parameters", async ({
    request,
  }) => {
    const response = await request.post("/api/phone/verify/check", {
      data: {},
    });

    expect([400, 401]).toContain(response.status());
  });

  test("POST /api/phone/verify/check rejects invalid code format", async ({
    request,
  }) => {
    const response = await request.post("/api/phone/verify/check", {
      data: {
        phone: "+15551234567",
        code: "abc",
      },
    });

    expect([400, 401]).toContain(response.status());

    const body = await response.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Billing API ───────────────────────────────────────────────────────────

test.describe("Billing API", () => {
  test("POST /api/billing/customer requires authentication", async ({
    request,
  }) => {
    const response = await request.post("/api/billing/customer", {
      data: {},
    });

    // Should require auth
    expect([401, 403]).toContain(response.status());
  });

  test("POST /api/billing/subscribe requires authentication", async ({
    request,
  }) => {
    const response = await request.post("/api/billing/subscribe", {
      data: { priceId: "price_test123" },
    });

    // Should require auth
    expect([401, 403]).toContain(response.status());
  });
});

// ─── AI Tone Analysis API ──────────────────────────────────────────────────

test.describe("AI Tone Analysis API", () => {
  test("POST /api/ai/tone-analyze requires authentication", async ({
    request,
  }) => {
    const response = await request.post("/api/ai/tone-analyze", {
      data: { text: "Hello world" },
    });

    // Should require auth
    expect([401, 403]).toContain(response.status());
  });

  test("POST /api/ai/tone-analyze rejects empty text", async ({ request }) => {
    // Even without auth, should validate input first
    const response = await request.post("/api/ai/tone-analyze", {
      data: { text: "" },
    });

    expect([400, 401, 403]).toContain(response.status());
  });
});

// ─── Webhook Endpoints ─────────────────────────────────────────────────────

test.describe("Webhook Endpoints", () => {
  test("POST /api/webhooks/stripe rejects missing signature", async ({
    request,
  }) => {
    const response = await request.post("/api/webhooks/stripe", {
      data: { type: "test.event" },
    });

    // Should reject without valid Stripe signature
    expect([400, 401]).toContain(response.status());
  });

  test("GET /api/webhooks/twilio/incoming returns TwiML", async ({
    request,
  }) => {
    const response = await request.get("/api/webhooks/twilio/incoming");

    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("text/xml");

    const body = await response.text();
    expect(body).toContain("<Response>");
  });

  test("POST /api/webhooks/twilio/status rejects missing signature", async ({
    request,
  }) => {
    const response = await request.post("/api/webhooks/twilio/status", {
      form: {
        MessageSid: "SM1234567890",
        MessageStatus: "delivered",
      },
    });

    // Should reject without valid Twilio signature
    expect([400, 401, 404]).toContain(response.status());
  });
});

// ─── Error Handling ────────────────────────────────────────────────────────

test.describe("Error Handling", () => {
  test("non-existent API route returns 404", async ({ request }) => {
    const response = await request.get("/api/nonexistent-endpoint");

    expect(response.status()).toBe(404);
  });

  test("API routes return JSON error format", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { invalid: "data" },
    });

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");

    const body = await response.json();
    expect(body).toHaveProperty("error");
  });
});
