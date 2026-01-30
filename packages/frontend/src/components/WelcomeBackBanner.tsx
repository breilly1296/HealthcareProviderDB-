'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bookmark, X, ArrowRight } from 'lucide-react';

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

    const handleDismiss = () => {
        setIsDismissed(true);
    };

    if (!savedUrl || isDismissed) {
        return null;
    }

    return (
        <div className="bg-blue-600/10 border-b border-blue-500/20">
            <div className="container-wide py-2.5">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <Bookmark className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Welcome back!</span>
                        <Link
                            href={savedUrl}
                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                            Resume your previous search
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1"
                        aria-label="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
