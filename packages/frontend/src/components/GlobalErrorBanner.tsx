'use client';

import { useEffect, useState } from 'react';
import { useError } from '@/context/ErrorContext';
import { CloseIcon, AlertIcon, WifiOffIcon, ServerIcon } from '@/components/icons';

const VARIANT_STYLES = {
  network: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800',
    text: 'text-yellow-800 dark:text-yellow-200',
    icon: WifiOffIcon,
  },
  server: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    icon: ServerIcon,
  },
  'not-found': {
    bg: 'bg-gray-50 dark:bg-gray-800',
    border: 'border-gray-200 dark:border-gray-700',
    text: 'text-gray-800 dark:text-gray-200',
    icon: AlertIcon,
  },
  validation: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-800 dark:text-orange-200',
    icon: AlertIcon,
  },
  'rate-limit': {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-800 dark:text-purple-200',
    icon: AlertIcon,
  },
  unknown: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    icon: AlertIcon,
  },
} as const;

export function GlobalErrorBanner() {
  const { hasError, errorMessage, errorVariant, clearError, error } = useError();
  const [isVisible, setIsVisible] = useState(false);

  // Animate in when error appears
  useEffect(() => {
    if (hasError) {
      // Small delay for animation
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    }
    setIsVisible(false);
    return;
  }, [hasError]);

  if (!hasError || !errorMessage || !errorVariant) {
    return null;
  }

  const styles = VARIANT_STYLES[errorVariant];
  const IconComponent = styles.icon;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`
        fixed top-0 left-0 right-0 z-[100]
        transform transition-transform duration-300 ease-out
        ${isVisible ? 'translate-y-0' : '-translate-y-full'}
      `}
    >
      <div
        className={`
          mx-auto max-w-7xl px-4 py-3
          ${styles.bg} ${styles.border} border-b
          shadow-lg
        `}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <IconComponent className={`w-5 h-5 flex-shrink-0 ${styles.text}`} />
            <p className={`text-sm font-medium ${styles.text}`}>
              {errorMessage}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {error?.retryable && (
              <button
                onClick={() => window.location.reload()}
                className={`
                  px-3 py-1 text-sm font-medium rounded-md
                  ${styles.text} hover:bg-black/5 dark:hover:bg-white/5
                  transition-colors
                `}
              >
                Retry
              </button>
            )}
            <button
              onClick={clearError}
              className={`
                p-1 rounded-md
                ${styles.text} hover:bg-black/5 dark:hover:bg-white/5
                transition-colors
              `}
              aria-label="Dismiss error"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
