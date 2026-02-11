'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home, ChevronRight } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isDevelopment = process.env.NODE_ENV === 'development';

  useEffect(() => {
    // Log error to console
    console.error('Application error:', error);

    // Track error in PostHog (no PII — only error metadata)
    import('posthog-js').then(({ default: posthog }) => {
      if (posthog.__loaded) {
        posthog.capture('$exception', {
          $exception_message: error.message,
          $exception_type: 'unhandled_error',
          $exception_source: 'error_boundary',
          digest: error.digest,
        });
      }
    }).catch(() => {
      // PostHog not available — silently ignore
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-md mx-auto">
        {/* Error Icon */}
        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" aria-hidden="true" />
        </div>

        {/* Error Message */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Something went wrong
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">
          We encountered an unexpected error. Please try again, or contact support if the problem persists.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            <RefreshCw className="w-5 h-5 mr-2" aria-hidden="true" />
            Try Again
          </button>

          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            <Home className="w-5 h-5 mr-2" aria-hidden="true" />
            Go Home
          </Link>
        </div>

        {/* Support Link */}
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Need help?{' '}
          <a
            href="mailto:support@verifymyprovider.com"
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline"
          >
            Contact Support
          </a>
        </p>

        {/* Development Error Details */}
        {isDevelopment && (
          <div className="mt-8 text-left">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mx-auto"
            >
              <ChevronRight className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-90' : ''}`} aria-hidden="true" />
              {showDetails ? 'Hide' : 'Show'} Error Details (Development Only)
            </button>

            {showDetails && (
              <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-auto">
                <div className="mb-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Error Message
                  </span>
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 font-mono break-words">
                    {error.message}
                  </p>
                </div>

                {error.digest && (
                  <div className="mb-3">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Error Digest
                    </span>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 font-mono">
                      {error.digest}
                    </p>
                  </div>
                )}

                {error.stack && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Stack Trace
                    </span>
                    <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto">
                      {error.stack}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
