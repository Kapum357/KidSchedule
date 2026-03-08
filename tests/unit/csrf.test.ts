import { verifyOrigin, getRequestContext } from "@/lib/security/csrf";

// next/headers returns a Headers-like object; we mock to control values.
jest.mock("next/headers", () => {
  let current: Record<string, string> = {};
  return {
    headers: () => ({
      get: (name: string) => current[name.toLowerCase()] ?? null,
      // helper to set headers inside tests
      __set: (headers: Record<string, string>) => {
        current = {};
        for (const [k, v] of Object.entries(headers)) {
          current[k.toLowerCase()] = v;
        }
      },
    }),
  };
});

// typed to include our helper function
// eslint-disable-next-line @typescript-eslint/no-require-imports
const headersFn = require("next/headers").headers as () => { get(name: string): string | null; __set(headers: Record<string,string>): void };

describe("CSRF utilities", () => {
  beforeEach(() => {
    headersFn().__set({});
  });

  it("accepts a whitelisted origin header", async () => {
    headersFn().__set({ origin: "https://kidschedule.com" });
    const result = await verifyOrigin();
    expect(result).toEqual({ valid: true, origin: "https://kidschedule.com" });
  });

  it("rejects an unknown origin", async () => {
    headersFn().__set({ origin: "https://evil.com" });
    const result = await verifyOrigin();
    expect(result).toEqual({ valid: false, origin: "https://evil.com" });
  });

  it("falls back to referer when origin missing", async () => {
    headersFn().__set({ referer: "https://www.kidschedule.com/page" });
    const result = await verifyOrigin();
    expect(result.valid).toBe(true);
    expect(result.origin).toBe("https://www.kidschedule.com");
  });

  it("returns development-true when no headers and dev mode", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env as any).NODE_ENV = "development";
    headersFn().__set({});
    const result = await verifyOrigin();
    expect(result).toEqual({ valid: true, origin: null });
  });

  it("returns development-false when no headers and prod mode", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env as any).NODE_ENV = "production";
    headersFn().__set({});
    const result = await verifyOrigin();
    expect(result).toEqual({ valid: false, origin: null });
  });

  it("getRequestContext returns ip, ua, origin", async () => {
    headersFn().__set({
      "x-forwarded-for": "1.2.3.4,5.6.7.8",
      "user-agent": "jest",
      origin: "https://example.com",
    });

    const ctx = await getRequestContext();
    expect(ctx).toEqual({ ip: "1.2.3.4", userAgent: "jest", origin: "https://example.com" });
  });
});
