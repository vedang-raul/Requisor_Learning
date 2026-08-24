/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export was dropped: the AI assistant needs a server-side
  // /api/chat route to keep the xAI API key off the client.
  images: { unoptimized: true },
  trailingSlash: true,
  allowedDevOrigins: [
    "*.pike.replit.dev",
    "*.replit.dev",
    "127.0.0.1",
    "localhost",
  ],

  async headers() {
    // ── HTTP security headers ────────────────────────────────────────────────
    // Applied to every response the server sends.  These are defence-in-depth
    // controls that do not require application code changes.
    //
    // NOTE: Content-Security-Policy is intentionally absent here.  It is set
    // per-request in middleware.ts so a fresh nonce can be embedded in every
    // response.  Static headers() runs once at build time and cannot reference
    // a request-scoped nonce.
    return [
      {
        source: "/(.*)",
        headers: [
          // Clickjacking protection — prevent this site from being embedded in
          // an attacker-controlled iframe.
          { key: "X-Frame-Options", value: "DENY" },

          // MIME-type sniffing — forces browsers to respect Content-Type.
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Referrer — only send the origin (not the path) on cross-origin navigations.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          // HSTS — once the site is visited over HTTPS, require HTTPS for 2 years.
          // Note: Replit's proxy already enforces HTTPS; this header is belt-and-braces.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },

          // Permissions — allow the AI assistant's voice input only for this
          // site; keep unrelated device features disabled.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
