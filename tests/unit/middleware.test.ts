jest.mock("next-auth/jwt", () => ({
  getToken: jest.fn(),
}));

import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { middleware } from "@/middleware";

const mockedGetToken = getToken as jest.Mock;
const originalEnv = process.env;

function request(path: string) {
  return new NextRequest(`https://learning.example${path}`);
}

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...originalEnv };
});

afterEach(() => { process.env = originalEnv; });

describe("Python worker security policy", () => {
  it("allows the pinned runtime CDN and WebAssembly only on the worker response", async () => {
    const response = await middleware(request("/pyodide-worker.js"));
    const policy = response.headers.get("Content-Security-Policy")!;
    expect(policy).toContain("https://cdn.jsdelivr.net");
    expect(policy).toContain("'wasm-unsafe-eval'");
    expect(policy).not.toContain("'unsafe-eval'");
    const page = await middleware(request("/"));
    expect(page.headers.get("Content-Security-Policy")).not.toContain("cdn.jsdelivr.net");
    expect(page.headers.get("Content-Security-Policy")).not.toContain("'wasm-unsafe-eval'");
  });
});

describe("public login origin", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "production", NEXTAUTH_URL: "https://learning.requisor.io" };
  });

  it("redirects Alma login to the configured origin, without caching", async () => {
    const response = await middleware(new NextRequest("https://alma.requisor.io/login/tutors-login/?callbackUrl=%2Fapp%2Ftutor%2F"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://learning.requisor.io/login/tutors-login/?callbackUrl=%2Fapp%2Ftutor%2F");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("uses the proxy's public host without looping on the callback domain", async () => {
    const response = await middleware(new NextRequest("http://localhost:5000/login/learners-login/", {
      headers: { "x-forwarded-host": "learning.requisor.io", host: "localhost:5000" },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("content-security-policy")).toContain("'strict-dynamic'");
  });

  it("redirects an alias forwarded by the proxy to the configured origin", async () => {
    const response = await middleware(new NextRequest("http://localhost:5000/login/learners-login/", {
      headers: { "x-forwarded-host": "alma.requisor.io", host: "localhost:5000" },
    }));
    expect(response.headers.get("location")).toBe("https://learning.requisor.io/login/learners-login/");
  });
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

describe("search indexing headers", () => {
  it.each(["/app/dashboard/", "/api/speech/", "/login/", "/reset-password/"])(
    "marks %s as non-indexable without changing the CSP",
    async path => {
      const response = await middleware(request(path));
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("content-security-policy")).toContain("'strict-dynamic'");
    },
  );

  it.each(["/", "/student-lms/", "/robots.txt", "/sitemap.xml", "/social-image/"])(
    "does not exclude public SEO resource %s",
    async path => {
      const response = await middleware(request(path));
      expect(response.headers.get("x-robots-tag")).toBeNull();
    },
  );
});