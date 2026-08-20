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
};
export default nextConfig;
