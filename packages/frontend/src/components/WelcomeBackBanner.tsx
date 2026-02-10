'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bookmark, Search, X, ArrowRight } from 'lucide-react';

type BannerType = 'profile' | 'search';

export function WelcomeBackBanner() {
    const [savedUrl, setSavedUrl] = useState<string | null>(null);
    const [bannerType, setBannerType] = useState<BannerType | null>(null);
    const [displayText, setDisplayText] = useState<string | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        // Check for saved profile first (existing behavior)
        const saved = localStorage.getItem('vmp_last_profile');
        if (saved) {
            setSavedUrl(saved);
            setBannerType('profile');
            return;
        }

        // Fallback: check for recent searches
        const recentSearchesRaw = localStorage.getItem('vmp_recent_searches');
        if (recentSearchesRaw) {
            try {
                const searches = JSON.parse(recentSearchesRaw);
                if (Array.isArray(searches) && searches.length > 0) {
                    const mostRecent = searches[0];
                    const params = new URLSearchParams();
                    if (mostRecent.params.state) params.set('state', mostRecent.params.state);
                    if (mostRecent.params.specialty) params.set('specialty', mostRecent.params.specialty);
                    if (mostRecent.params.cities) params.set('cities', mostRecent.params.cities);
                    if (mostRecent.params.healthSystem) params.set('healthSystem', mostRecent.params.healthSystem);
                    if (mostRecent.params.insurancePlanId) params.set('insurancePlanId', mostRecent.params.insurancePlanId);
                    if (mostRecent.params.zipCode) params.set('zipCode', mostRecent.params.zipCode);

                    setSavedUrl(`/search?${params.toString()}`);
                    setDisplayText(mostRecent.displayText || null);
                    setBannerType('search');
                }
            } catch {
                // Ignore malformed data
            }
        }
    }, []);

    if (!savedUrl || !bannerType || isDismissed) {
        return null;
    }

    const Icon = bannerType === 'profile' ? Bookmark : Search;
    const linkText = bannerType === 'profile'
        ? 'Resume your previous search'
        : `Continue: ${displayText || 'your last search'}`;

    return (
        <div className="bg-amber-50/60 dark:bg-blue-600/10 border-b border-amber-200/60 dark:border-blue-500/20">
            <div className="container-wide py-2.5">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <Icon className="w-4 h-4 text-amber-600 dark:text-blue-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-stone-800 dark:text-white">Welcome back!</span>
                        <Link
                            href={savedUrl}
                            className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-blue-400 hover:text-primary-700 dark:hover:text-blue-300 transition-colors truncate"
                        >
                            {linkText}
                            <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                        </Link>
                    </div>
                    <button
                        onClick={() => setIsDismissed(true)}
                        className="text-stone-400 hover:text-stone-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1"
                        aria-label="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
