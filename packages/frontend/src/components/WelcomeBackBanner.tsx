'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export function WelcomeBackBanner() {
    const [savedUrl, setSavedUrl] = useState<string | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        // Check localStorage for saved profile
        const saved = localStorage.getItem('vmp_last_profile');
        if (saved) {
            setSavedUrl(saved);
        }
    }, []);

    // Parse URL to extract friendly display text
    const getDisplayText = (url: string): { planId?: string; zip?: string } => {
        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.search);
            return {
                planId: params.get('planId') || undefined,
                zip: params.get('zip') || undefined,
            };
        } catch {
            return {};
        }
    };

    const handleDismiss = () => {
        setIsDismissed(true);
    };

    if (!savedUrl || isDismissed) {
        return null;
    }

    const { planId, zip } = getDisplayText(savedUrl);
    const hasDetails = planId || zip;

    return (
        <div className="mb-6 p-4 bg-primary-50 border border-primary-200 rounded-lg shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <svg
                            className="w-5 h-5 text-primary-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                            />
                        </svg>
                        <h3 className="font-semibold text-gray-900">Welcome back!</h3>
                    </div>
                    <p className="text-sm text-gray-700 mb-3">
                        {hasDetails ? (
                            <>
                                Resume searching
                                {planId && <span className="font-medium"> for {planId}</span>}
                                {zip && <span className="font-medium"> in {zip}</span>}?
                            </>
                        ) : (
                            'Resume your previous search?'
                        )}
                    </p>
                    <Link
                        href={savedUrl}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                    >
                        Load Saved Profile
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                            />
                        </svg>
                    </Link>
                </div>
                <button
                    onClick={handleDismiss}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Dismiss"
                >
                    <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}
