import { describe, it, expect } from "vitest";

/**
 * Integration-style tests for the middleware decision logic.
 * These mirror the logic in src/middleware.ts without spinning up Next.js.
 */

function shouldRedirectToLogin(pathname: string, isLoggedIn: boolean): boolean {
  const isOnPublish = pathname.startsWith("/publish");
  return isOnPublish && !isLoggedIn;
}

describe("Middleware protection logic", () => {
  it("redirects unauthenticated users away from /publish", () => {
    expect(shouldRedirectToLogin("/publish", false)).toBe(true);
  });

  it("allows authenticated users on /publish", () => {
    expect(shouldRedirectToLogin("/publish", true)).toBe(false);
  });

  it("allows everyone on home", () => {
    expect(shouldRedirectToLogin("/", false)).toBe(false);
    expect(shouldRedirectToLogin("/", true)).toBe(false);
  });

  it("allows everyone on /login", () => {
    expect(shouldRedirectToLogin("/login", false)).toBe(false);
  });

  it("protects nested publish paths", () => {
    expect(shouldRedirectToLogin("/publish/edit/123", false)).toBe(true);
    expect(shouldRedirectToLogin("/publish/edit/123", true)).toBe(false);
  });
});
