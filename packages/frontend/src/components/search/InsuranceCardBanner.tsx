'use client';

import { useState } from 'react';
import { ClipboardList, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useInsuranceCard } from '@/hooks/useInsuranceCard';

export function InsuranceCardBanner() {
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { card } = useInsuranceCard();
  const [dismissed, setDismissed] = useState(false);

  // Priority 1: URL-param-based banner (from "Find In-Network Providers" button)
  const issuerName = searchParams.get('issuerName');
  if (issuerName) {
    const planType = searchParams.get('planType');
    const planName = searchParams.get('planName');

    return (
      <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <ClipboardList className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Searching based on your <strong>{issuerName}</strong>
          {planType ? ` ${planType}` : ''} card
          {planName ? ` — ${planName}` : ''}
        </p>
      </div>
    );
  }

  // Priority 2: Saved card with matched plan (for authenticated users)
  if (
    !dismissed &&
    isAuthenticated &&
    card?.matchedPlan
  ) {
    const { planName, issuerName: savedIssuer, planType: savedType } = card.matchedPlan;
    const displayName = planName || savedIssuer || 'your saved plan';

    return (
      <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <ClipboardList className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
        <p className="flex-1 text-sm text-blue-800 dark:text-blue-200">
          Filtering by your saved plan:{' '}
          <strong>{savedIssuer ? `${savedIssuer} — ` : ''}{planName || savedType || 'Matched Plan'}</strong>
          <span className="text-blue-600 dark:text-blue-400"> (change in filters)</span>
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
          aria-label={`Dismiss saved plan banner for ${displayName}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return null;
}
