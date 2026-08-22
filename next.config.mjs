/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["sharp"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
}

export default nextConfig
