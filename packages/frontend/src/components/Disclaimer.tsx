'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const DISMISSAL_KEY = 'disclaimer-dismissed';
const DISMISSAL_DURATION_DAYS = 30;

interface DisclaimerProps {
  /** Variant style - 'banner' for page-wide, 'inline' for in-content */
  variant?: 'banner' | 'inline';
  /** Show the learn more link */
  showLearnMore?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * Check if disclaimer was dismissed within the last 30 days
 */
function isDismissed(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const dismissedAt = localStorage.getItem(DISMISSAL_KEY);
    if (!dismissedAt) return false;

    const dismissedDate = new Date(dismissedAt);
    const now = new Date();
    const daysSinceDismissal = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceDismissal < DISMISSAL_DURATION_DAYS;
  } catch {
    return false;
  }
}

/**
 * Mark disclaimer as dismissed
 */
function setDismissed(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(DISMISSAL_KEY, new Date().toISOString());
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Disclaimer banner component for crowdsourced data accuracy warning
 */
export function Disclaimer({ variant = 'banner', showLearnMore = true, className = '' }: DisclaimerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if not dismissed (for banner variant)
    if (variant === 'banner') {
      setVisible(!isDismissed());
    } else {
      // Always show inline variant
      setVisible(true);
    }
  }, [variant]);

  const handleDismiss = () => {
    setDismissed();
    setVisible(false);
  };

  if (!visible) return null;

  if (variant === 'inline') {
    return (
      <div className={`bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Data Accuracy Notice:</strong> This information is crowdsourced and may be inaccurate or outdated.
              Always verify insurance acceptance directly with the provider's office before scheduling an appointment.
            </p>
            {showLearnMore && (
              <Link
                href="/disclaimer"
                className="text-sm text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline mt-1 inline-block"
              >
                Learn more about our data
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Banner variant
  return (
    <div className={`bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 ${className}`}>
      <div className="container-wide py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <svg
              className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200 truncate">
              Crowdsourced data may be inaccurate. Always verify with your provider before scheduling.
            </p>
            {showLearnMore && (
              <Link
                href="/disclaimer"
                className="text-xs sm:text-sm text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline whitespace-nowrap flex-shrink-0"
              >
                Learn more
              </Link>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded hover:bg-amber-200/50 dark:hover:bg-amber-800/50 transition-colors flex-shrink-0"
            aria-label="Dismiss disclaimer"
          >
            <svg
              className="w-4 h-4 text-amber-700 dark:text-amber-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact inline disclaimer for use in cards or small spaces
 */
export function DisclaimerCompact({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-stone-500 dark:text-gray-400 ${className}`}>
      <svg
        className="w-3 h-3 inline-block mr-1 -mt-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      Verify with provider before scheduling.{' '}
      <Link href="/disclaimer" className="underline hover:text-stone-700 dark:hover:text-gray-300">
        Learn more
      </Link>
    </p>
  );
}

export default Disclaimer;
