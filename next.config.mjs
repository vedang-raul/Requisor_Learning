/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export was dropped: the AI assistant needs a server-side
  // /api/chat route to keep the Anthropic API key off the client.
  images: { unoptimized: true },
  trailingSlash: true,
  allowedDevOrigins: [
    "b2f00baf-9e23-4513-ba89-9cbee0d4ae04-00-2heldtfjj40vj.pike.replit.dev",
  ],
};
export default nextConfig;
