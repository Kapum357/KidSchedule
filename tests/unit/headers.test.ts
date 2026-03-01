import { SECURITY_HEADERS, AUTH_PAGE_HEADERS, buildCSP } from "@/lib/security/headers";

describe("security headers definitions", () => {
  it("AUTH_PAGE_HEADERS should extend SECURITY_HEADERS with cache directives", () => {
    // every key in SECURITY_HEADERS must appear in AUTH_PAGE_HEADERS with same value
    for (const [k, v] of Object.entries(SECURITY_HEADERS) as Array<[keyof typeof SECURITY_HEADERS, string]>) {
      expect(AUTH_PAGE_HEADERS[k]).toEqual(v);
    }

    expect(AUTH_PAGE_HEADERS["Cache-Control"]).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    expect(AUTH_PAGE_HEADERS.Pragma).toBe("no-cache");
    expect(AUTH_PAGE_HEADERS.Expires).toBe("0");
  });

  it("buildCSP returns a string containing directives", () => {
    const csp = buildCSP();
    expect(typeof csp).toBe("string");
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src/);
  });
});
