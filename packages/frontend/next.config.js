/** @type {import('next').NextConfig} */

/**
 * Security headers for XSS and other attack prevention.
 * CSP is configured to allow:
 * - Scripts: self, inline (Next.js requires), Google reCAPTCHA
 * - Styles: self, inline (for CSS-in-JS)
 * - Images: self, data URIs, any HTTPS source
 * - Fonts: self
 * - Connections: self, API domain, Google (reCAPTCHA)
 * - Frames: Google (reCAPTCHA challenge)
 */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://api.verifymyprovider.com https://*.run.app https://us.i.posthog.com https://www.google.com https://www.gstatic.com",
      "frame-src https://www.google.com",
    ].join('; ')
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  }
];

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

  // Apply security headers to all routes
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
