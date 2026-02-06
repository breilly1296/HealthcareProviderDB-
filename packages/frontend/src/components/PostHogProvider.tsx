'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Initialize PostHog only in browser
if (typeof window !== 'undefined') {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: false, // We'll capture manually for better control
      capture_pageleave: true,
      persistence: 'localStorage',
      autocapture: false,
      disable_session_recording: true,
      opt_out_capturing_by_default: true,
    });
  }
}

/**
 * Component to track pageviews on route changes
 */
function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname && typeof window !== 'undefined') {
      // Strip sensitive query params before sending to analytics
      const sanitizedParams = new URLSearchParams(searchParams.toString());
      ['npi', 'planId', 'name'].forEach(key => sanitizedParams.delete(key));
      const query = sanitizedParams.toString();
      const url = window.origin + pathname + (query ? `?${query}` : '');
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}

/**
 * PostHog Provider wrapper for the app
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PostHogPageview />
      {children}
    </PHProvider>
  );
}

// Export posthog instance for direct event tracking
export { posthog };
