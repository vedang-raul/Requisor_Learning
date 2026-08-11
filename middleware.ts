import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  // Protect all /app/admin routes with a server-side admin role check.
  if (req.nextUrl.pathname.startsWith("/app/admin")) {
    // Must mirror the cookie name used in authOptions exactly.
    // authOptions derives it from NODE_ENV, not whether the request is HTTPS —
    // so we do the same here instead of letting getToken auto-detect from the
    // request URL (which is always HTTPS behind Replit's proxy even in dev,
    // causing a cookie-name mismatch that makes getToken return null).
    const isSecure = process.env.NODE_ENV === "production";
    const cookieName = isSecure
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token";
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
      cookieName,
    });

    // No session at all — redirect to login.
    if (!token) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/";
      loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Authenticated but not admin — redirect to dashboard.
    if (token.role !== "admin") {
      const dashboardUrl = req.nextUrl.clone();
      dashboardUrl.pathname = "/app/dashboard/";
      dashboardUrl.search = "";
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/admin", "/app/admin/:path*"],
};
