import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isResourceFileUrl } from "./lib/resource-files";

export async function middleware(req: NextRequest) {
  // ── Per-request nonce ───────────────────────────────────────────────────
  // A fresh cryptographic nonce is generated for every HTML response.
  // Buffer.from(...).toString("base64") produces standard base64 which matches
  // the regex Next.js uses when extracting the nonce from the CSP header:
  //   /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isResourceFileRoute = req.nextUrl.pathname.startsWith("/api/resources/");
  // ── Content-Security-Policy ─────────────────────────────────────────────
  // Built per-request so the nonce can be embedded.  Kept in middleware
  // (not next.config.mjs headers()) because next.config.mjs runs once at
  // build time and cannot reference a request-scoped value.
  //
  // script-src with 'strict-dynamic':
  //  • Only scripts that carry the correct nonce are initially trusted.
  //  • Any script dynamically created by a nonce-trusted script is also
  //    trusted, so Next.js's own chunk loader and VideoEmbed's runtime
  //    injection of the YouTube IFrame API (document.createElement("script"))
  //    both work without needing a host allowlist.
  //  • 'unsafe-inline' and 'unsafe-eval' are intentionally absent: an
  //    injected <script> or eval() call is blocked even if an XSS vector exists.
  //  • Host allowlists ('self', https://www.youtube.com) are superseded by
  //    'strict-dynamic' in CSP3 browsers.  They are omitted to prevent an
  //    attacker from injecting <script src="https://www.youtube.com/..."> and
  //    having it executed by an older browser that falls back to the host list.
  //
  // style-src retains 'unsafe-inline':
  //  React JSX style={{}} props produce HTML style= attributes which cannot
  //  carry a nonce.  Removing 'unsafe-inline' from style-src would block every
  //  inline-styled element in the app; that refactor is tracked separately.
  const csp = [
    "default-src 'self'",
    // The Cloudflare host is needed for the browser-loaded Turnstile API.
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    // challenges.cloudflare.com: Turnstile widget makes API calls from the page
    // to Cloudflare to validate challenge responses.
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://challenges.cloudflare.com",
    // fonts.gstatic.com serves the actual Inter font binary files.
    "font-src 'self' data: https://fonts.gstatic.com",
    // challenges.cloudflare.com: Turnstile renders its challenge UI inside a
    // sandboxed iframe served from Cloudflare.
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com",
    isResourceFileRoute ? "frame-ancestors 'self'" :   "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
  ].join("; ");

  // ── Privileged workspace protection ─────────────────────────────────────
  const needsAdmin = req.nextUrl.pathname.startsWith("/app/admin");
  const needsTutorWorkspace = req.nextUrl.pathname.startsWith("/app/tutor");
  if (needsAdmin || needsTutorWorkspace) {
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

    // Admins retain catalog access; tutors additionally access their workspace.
    if ((needsAdmin && token.role !== "admin") || (needsTutorWorkspace && token.role !== "admin" && token.role !== "tutor")) {
      const dashboardUrl = req.nextUrl.clone();
      dashboardUrl.pathname = "/app/dashboard/";
      dashboardUrl.search = "";
      return NextResponse.redirect(dashboardUrl);
    }
  }

  // ── Propagate nonce ─────────────────────────────────────────────────────
  // The CSP is set on the REQUEST headers for two reasons:
  //   1. Next.js App Router reads the nonce from headers['content-security-policy']
  //      in app-render.js and stamps it onto every framework-generated <script>
  //      and <link> tag in the rendered HTML.
  //   2. x-nonce is read by app/layout.tsx (via next/headers) so the nonce is
  //      available for any explicit <Script nonce={nonce}> elements.
  // The CSP is also set on the RESPONSE headers so the browser enforces it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  // Run on every request except Next.js internals and static assets.
  // The nonce must be present on every HTML page response; static files
  // (_next/static chunks, images, fonts) are not HTML so they don't need it.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
