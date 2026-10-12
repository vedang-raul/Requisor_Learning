jest.mock("next-auth/jwt", () => ({
  getToken: jest.fn(),
}));

import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { middleware } from "@/middleware";

const mockedGetToken = getToken as jest.Mock;

function request(path: string) {
  return new NextRequest(`https://learning.example${path}`);
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe("admin route middleware", () => {
  it("redirects visitors without a session to sign in", async () => {
    mockedGetToken.mockResolvedValue(null);

    const response = await middleware(request("/app/admin/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://learning.example/?callbackUrl=%2Fapp%2Fadmin%2F"
    );
  });

  it("redirects authenticated employees away from the admin panel", async () => {
    mockedGetToken.mockResolvedValue({ role: "employee" });

    const response = await middleware(request("/app/admin/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://learning.example/app/dashboard/");
  });

  it("allows an authenticated admin to continue", async () => {
    mockedGetToken.mockResolvedValue({ role: "admin" });

    const response = await middleware(request("/app/admin/"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not inspect session cookies for non-admin routes", async () => {
    const response = await middleware(request("/app/dashboard/"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mockedGetToken).not.toHaveBeenCalled();
  });
});

describe("embeddable protected files", () => {
  it("allows the same site to frame tutor submission files with a trailing slash", async () => {
    const response = await middleware(
      request("/api/tutor/assignment-submissions/file/?submissionId=1&inline=1")
    );

    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("frame-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });
});

describe("content security policy", () => {
  it("allows nonce-trusted scripts to load the YouTube IFrame API", async () => {
    const response = await middleware(request("/app/learn/"));
    const csp = response.headers.get("content-security-policy");

    expect(csp).toMatch(/script-src[^;]*'nonce-[^']+'/);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-src 'self' blob: https://www.youtube.com");
  });
});