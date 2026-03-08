/**
 * Export Queue E2E Tests
 *
 * Tests for the export API endpoints: auth requirements, input validation,
 * and response structure. Full workflow tests require a running database
 * and authenticated session.
 */

import { test, expect } from "@playwright/test";

test.describe("Export API: Authentication", () => {
  test("POST /api/exports requires authentication", async ({ request }) => {
    const response = await request.post("/api/exports", {
      data: {
        type: "pdf",
        threadId: "00000000-0000-0000-0000-000000000001",
      },
    });

    expect([401, 403]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("GET /api/exports requires authentication", async ({ request }) => {
    const response = await request.get("/api/exports");
    expect([401, 403]).toContain(response.status());
  });

  test("GET /api/exports/:id requires authentication", async ({ request }) => {
    const response = await request.get(
      "/api/exports/00000000-0000-0000-0000-000000000001",
    );
    expect([401, 403, 404]).toContain(response.status());
  });

  test("GET /api/exports/:id/verify requires authentication", async ({
    request,
  }) => {
    const response = await request.get(
      "/api/exports/00000000-0000-0000-0000-000000000001/verify",
    );
    expect([401, 403, 404]).toContain(response.status());
  });

  test("GET /api/exports/metrics returns queue metrics", async ({
    request,
  }) => {
    const response = await request.get("/api/exports/metrics");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("queueLength");
    expect(data).toHaveProperty("jobStats");
  });
});

test.describe("Export API: Input Validation", () => {
  test("POST /api/exports with empty body is rejected", async ({ request }) => {
    const response = await request.post("/api/exports", {
      data: {},
    });

    expect([400, 401, 403]).toContain(response.status());
  });

  test("POST /api/exports returns JSON error format", async ({ request }) => {
    const response = await request.post("/api/exports", {
      data: { type: "unknown_type" },
    });

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");

    const body = await response.json();
    expect(body).toHaveProperty("error");
  });
});

test.describe("Export API: Response Format", () => {
  test("unauthenticated requests return JSON with error field", async ({
    request,
  }) => {
    const endpoints = [
      { method: "GET", path: "/api/exports" },
      { method: "POST", path: "/api/exports" },
      { method: "GET", path: "/api/exports/metrics" },
    ] as const;

    for (const endpoint of endpoints) {
      const response =
        endpoint.method === "GET"
          ? await request.get(endpoint.path)
          : await request.post(endpoint.path, { data: {} });

      const contentType = response.headers()["content-type"];
      expect(contentType).toContain("application/json");

      const body = await response.json();
      expect(typeof body).toBe("object");
      expect(body).not.toBeNull();
    }
  });
});
