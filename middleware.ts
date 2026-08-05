import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  // Protect all /app/admin routes with a server-side admin role check.
  if (req.nextUrl.pathname.startsWith("/app/admin")) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
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
