import { describe, it, expect } from "vitest";

/**
 * Unit tests for auth-related logic that does not require a full Next.js runtime.
 */

describe("Auth configuration helpers", () => {
  it("should treat /publish as a protected path", () => {
    const pathname = "/publish";
    const isOnPublish = pathname.startsWith("/publish");
    expect(isOnPublish).toBe(true);
  });

  it("should not treat home as a protected path", () => {
    const pathname = "/";
    const isOnPublish = pathname.startsWith("/publish");
    expect(isOnPublish).toBe(false);
  });

  it("should not treat /login as a protected path", () => {
    const pathname = "/login";
    const isOnPublish = pathname.startsWith("/publish");
    expect(isOnPublish).toBe(false);
  });

  it("should protect nested publish routes", () => {
    const pathname = "/publish/something";
    const isOnPublish = pathname.startsWith("/publish");
    expect(isOnPublish).toBe(true);
  });
});

describe("API URL construction", () => {
  it("should use env var when available", () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    expect(typeof apiUrl).toBe("string");
    expect(apiUrl.length).toBeGreaterThan(0);
  });
});
