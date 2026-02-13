/** @type {import('next').NextConfig} */

/**
 * Content Security Policy directives.
 *
 * Allowed external services:
 * - Google reCAPTCHA v3: www.google.com, www.gstatic.com (script, frame, connect)
 * - PostHog analytics: us.posthog.com, us.i.posthog.com (script, connect)
 * - Google Maps: maps.googleapis.com (script, connect, img via https:)
 * - IP geolocation: ipapi.co (connect)
 *
 * Notes:
 * - 'unsafe-inline' for scripts is required by Next.js (inline script tags)
 * - 'unsafe-eval' is required by Next.js dev mode and some runtime features
 * - 'unsafe-inline' for styles is required by Tailwind CSS
 * - camera=(self) in Permissions-Policy is needed for insurance card photo capture
 * - next/font/google self-hosts fonts at build time, so no external font-src needed
 */
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://us.posthog.com https://maps.googleapis.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  [
    "connect-src 'self'",
    process.env.NEXT_PUBLIC_API_URL || '',
    'https://*.us-central1.run.app',
    'https://verifymyprovider.com',
    'https://*.verifymyprovider.com',
    'https://us.posthog.com',
    'https://us.i.posthog.com',
    'https://www.google.com',
    'https://maps.googleapis.com',
    'https://ipapi.co',
  ].filter(Boolean).join(' '),
  "font-src 'self'",
  "frame-src https://www.google.com https://www.gstatic.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: cspDirectives,
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
  },
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
        source: '/(.*)',
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
