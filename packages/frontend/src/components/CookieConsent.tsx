'use client';

import { useState, useEffect } from 'react';
import posthog from 'posthog-js';

const CONSENT_KEY = 'vmp-analytics-consent';

export function CookieConsent() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      // Small delay so the banner slides up after page paint
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    }
    // If user previously accepted, opt them back in on load
    if (stored === 'accepted') {
      posthog.opt_in_capturing();
    }
    return undefined;
  }, []);

  if (!mounted || !visible) return null;

  const handleAccept = () => {
    posthog.opt_in_capturing();
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
  };

  const handleDecline = () => {
    posthog.opt_out_capturing();
    localStorage.setItem(CONSENT_KEY, 'declined');
    setVisible(false);
  };

  return (
    <div
      className="fixed bottom-20 md:bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl
        animate-[slideUp_0.3s_ease-out]
        bg-white dark:bg-gray-800
        border border-stone-200 dark:border-gray-700
        rounded-xl shadow-lg
        p-4 sm:p-5
        flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4"
    >
      <p className="text-sm text-stone-600 dark:text-gray-300 flex-1">
        We use privacy-preserving analytics to improve your experience. No personal health information is ever collected.
      </p>
      <div className="flex gap-2 shrink-0 self-end sm:self-auto">
        <button
          onClick={handleDecline}
          className="px-4 py-2 text-sm font-medium rounded-lg
            text-stone-600 dark:text-gray-400
            bg-stone-100 dark:bg-gray-700
            hover:bg-stone-200 dark:hover:bg-gray-600
            transition-colors"
        >
          Decline
        </button>
        <button
          onClick={handleAccept}
          className="px-4 py-2 text-sm font-medium rounded-lg
            text-white
            bg-[#137fec] hover:bg-[#0d6edb]
            transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
