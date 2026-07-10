/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export was dropped: the AI assistant needs a server-side
  // /api/chat route to keep the Anthropic API key off the client.
  images: { unoptimized: true },
  trailingSlash: true,
};
export default nextConfig;
