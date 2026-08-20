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