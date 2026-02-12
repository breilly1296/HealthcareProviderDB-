/** @type {import('next').NextConfig} */

/**
 * Security headers for XSS and other attack prevention.
 * CSP is configured to allow:
 * - Scripts: self, inline (Next.js requires), Google reCAPTCHA
 * - Styles: self, inline (for Tailwind CSS)
 * - Images: self, data URIs, blob URIs (insurance card preview)
 * - Fonts: self
 * - Connections: self, Cloud Run API, verifymyprovider.com, Google reCAPTCHA, PostHog analytics
 * - Frames: Google (reCAPTCHA challenge iframe)
 *
 * NOTE: Re-enabled 2026-02-07 in Content-Security-Policy-Report-Only mode
 * (was disabled 2026-01-31 due to blocking API requests — see commit 9f1278a).
 * Monitor Cloud Logging / browser console for violations for 2 weeks.
 * Switch to enforcing Content-Security-Policy after clean monitoring period.
 */
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  [
    "connect-src 'self'",
    process.env.NEXT_PUBLIC_API_URL || '',
    'https://*.us-central1.run.app',
    'https://verifymyprovider.com',
    'https://www.google.com',
    'https://us.i.posthog.com',
    'https://us.posthog.com',
  ].filter(Boolean).join(' '),
  "frame-src https://www.google.com https://www.gstatic.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy-Report-Only',
    value: cspDirectives,
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
  // Prefer modern image formats for smaller payloads
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Disable SWC for ARM64 compatibility
  swcMinify: false,
  experimental: {
    // Explicitly disable turbopack for ARM64 compatibility
    turbo: undefined,
    // Externalize sharp so its native deps (detect-libc) resolve from node_modules
    serverComponentsExternalPackages: ['sharp', 'detect-libc'],
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

  // Proxy /api/v1/* requests to the backend service.
  // The frontend and backend are separate Cloud Run services; this rewrite
  // makes backend API calls same-origin so auth cookies work correctly.
  async rewrites() {
    const backendUrl =
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1')
        .replace(/\/api\/v1\/?$/, '');
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
