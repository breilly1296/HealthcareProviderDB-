'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackException } from '@/lib/analytics';

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
 * Attaches window-level listeners for uncaught errors and unhandled promise
 * rejections. These fire for crashes that escape React's error boundary
 * (e.g. exceptions in async callbacks, event handlers, or setTimeout).
 */
function GlobalErrorTracker() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      trackException(event.error ?? event.message, {
        source: 'window.onerror',
        lineno: event.lineno,
        colno: event.colno,
        stackTrace: event.error instanceof Error ? event.error.stack : undefined,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      trackException(reason, {
        source: 'unhandledrejection',
        stackTrace: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}

/**
 * PostHog Provider wrapper for the app
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PostHogPageview />
      <GlobalErrorTracker />
      {children}
    </PHProvider>
  );
}

// Export posthog instance for direct event tracking
export { posthog };
