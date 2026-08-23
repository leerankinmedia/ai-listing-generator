/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Keep sharp out of the JS bundle so the native .node + libvips stay on disk.
  serverExternalPackages: ["sharp"],
  // Next 16 / nft traces sharp-linux-x64.node but not the sibling libvips .so
  // (dlopen, not require). pnpm stores it under .pnpm; glob the physical
  // package, not the symlink under @img/sharp-linux-x64 (Vercel rejects that).
  outputFileTracingIncludes: {
    "/api/listings/publish": [
      "node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
    "/api/version": [
      "node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
}

export default nextConfig
