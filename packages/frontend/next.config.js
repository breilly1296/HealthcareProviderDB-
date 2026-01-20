/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output for Docker deployments
  output: 'standalone',
  // Disable SWC for ARM64 compatibility
  swcMinify: false,
  experimental: {
    // Explicitly disable turbopack for ARM64 compatibility
    turbo: undefined,
  },
};

module.exports = nextConfig;
