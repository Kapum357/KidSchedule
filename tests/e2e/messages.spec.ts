/**
 * Messages E2E Tests
 *
 * Tests for the messages API endpoints: auth requirements, input validation,
 * and response structure. Full workflow tests (WebSocket, real-time events,
 * SMS relay) require an authenticated session and running database.
 */

import { test, expect } from "@playwright/test";

test.describe("Messages API: Authentication", () => {
  test("GET /api/messages requires authentication", async ({ request }) => {
    const response = await request.get("/api/messages");
    expect([401, 403, 404]).toContain(response.status());
  });

  test("POST /api/messages requires authentication", async ({ request }) => {
    const response = await request.post("/api/messages", {
      data: { body: "Hello" },
    });

    expect([401, 403]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/messages/:id/read requires authentication", async ({
    request,
  }) => {
    const response = await request.post(
      "/api/messages/00000000-0000-0000-0000-000000000001/read",
      { data: {} },
    );
    expect([401, 403, 404]).toContain(response.status());
  });

  test("POST /api/messages/relay requires authentication", async ({
    request,
  }) => {
    const response = await request.post("/api/messages/relay", {
      data: { phone: "+15551234567" },
    });
    expect([401, 403]).toContain(response.status());
  });
});

test.describe("Messages API: Input Validation", () => {
  test("POST /api/messages with empty body is rejected", async ({
    request,
  }) => {
    const response = await request.post("/api/messages", {
      data: {},
    });

    expect([400, 401, 403]).toContain(response.status());
  });

  test("POST /api/messages returns JSON error format", async ({ request }) => {
    const response = await request.post("/api/messages", {
      data: {},
    });

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");

    const body = await response.json();
    expect(body).toHaveProperty("error");
  });
});

test.describe("Messages API: Webhook Security", () => {
  test("Twilio webhook rejects requests without signature", async ({
    request,
  }) => {
    const response = await request.post("/api/webhooks/twilio/incoming", {
      form: {
        From: "+15551234567",
        To: "+15559876543",
        Body: "Test message",
        MessageSid: "SM1234567890abcdef",
      },
    });

    // Twilio webhook should verify signature — reject unsigned requests
    expect([400, 401, 403]).toContain(response.status());
  });

  test("Twilio webhook returns proper content-type on rejection", async ({
    request,
  }) => {
    const response = await request.post("/api/webhooks/twilio/incoming", {
      form: {
        From: "+15551234567",
        Body: "Test",
      },
    });

    const contentType = response.headers()["content-type"] ?? "";
    // Should return either TwiML XML or JSON error
    expect(
      contentType.includes("text/xml") ||
        contentType.includes("application/json"),
    ).toBe(true);
  });
});

test.describe("Messages API: Response Format", () => {
  test("unauthenticated requests return consistent error shape", async ({
    request,
  }) => {
    const protectedEndpoints = [
      { method: "POST", path: "/api/messages", data: { body: "hi" } },
      { method: "POST", path: "/api/messages/relay", data: { phone: "+15551234567" } },
    ] as const;

    for (const endpoint of protectedEndpoints) {
      const response = await request.post(endpoint.path, {
        data: endpoint.data,
      });

      expect([400, 401, 403]).toContain(response.status());

      const contentType = response.headers()["content-type"];
      expect(contentType).toContain("application/json");

      const body = await response.json();
      expect(typeof body).toBe("object");
      expect(body).toHaveProperty("error");
    }
  });
});
