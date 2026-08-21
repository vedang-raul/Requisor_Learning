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
    // Content-Security-Policy notes:
    //  • 'unsafe-inline' / 'unsafe-eval' are required for Next.js hydration
    //    scripts and Tailwind / CSS-in-JS.  A future hardening pass can replace
    //    these with nonce-based CSP once Next.js nonce support is wired up.
    //  • frame-ancestors 'none' is the CSP equivalent of X-Frame-Options: DENY
    //    and is honoured by all modern browsers.
    //  • YouTube iframes (lesson videos) require frame-src.
    //  • Google OAuth requires accounts.google.com in connect-src + form-action.
    const csp = [
      "default-src 'self'",
      // youtube.com required: VideoEmbed dynamically injects the YouTube IFrame
      // API script (https://www.youtube.com/iframe_api) at runtime.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com",
      // fonts.googleapis.com required: globals.css @imports the Inter font
      // stylesheet from Google Fonts at load time.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com",
      // fonts.gstatic.com serves the actual Inter font binary files referenced
      // by the fonts.googleapis.com stylesheet.
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
    ].join("; ");

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

          // Permissions — disable browser features the app doesn't use.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },

          // CSP — restricts which origins can load resources.
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
