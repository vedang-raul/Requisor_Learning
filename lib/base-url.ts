/** Resolve the app's public base URL in any Replit environment. */
export function getBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  const prod = process.env.REPLIT_DOMAINS?.split(",")[0];
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (process.env.REPLIT_DEPLOYMENT && prod) return `https://${prod}`;
  if (dev) return `https://${dev}`;
  if (prod) return `https://${prod}`;
  // Local dev: follow the port the server was actually started on, so auth
  // redirects work even when 3000 is taken and the dev server gets another port.
  return `http://localhost:${process.env.PORT || 3000}`;
}

// NextAuth v4 requires NEXTAUTH_URL to build callback URLs.
if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = getBaseUrl();
}
