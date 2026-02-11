'use client';

import { ClipboardList } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export function InsuranceCardBanner() {
  const searchParams = useSearchParams();
  const issuerName = searchParams.get('issuerName');
  if (!issuerName) return null;

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
