'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { providerApi } from '@/lib/api';
import type { ProviderDisplay, PlanAcceptanceDisplay } from '@/types';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  ProviderHeroCard,
  InsuranceList,
  AboutProvider,
  ColocatedProviders,
} from '@/components/provider-detail';

// Provider with full plan acceptance data (from detail API)
interface ProviderWithPlans extends Omit<ProviderDisplay, 'planAcceptances'> {
  planAcceptances: PlanAcceptanceDisplay[];
  acceptsNewPatients?: boolean | null;
  languages?: string[] | null;
}

export default function ProviderDetailPage() {
  const params = useParams();
  const npi = params.npi as string;

  const [provider, setProvider] = useState<ProviderWithPlans | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProvider = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await providerApi.getByNpi(npi);
      setProvider(result.provider);
    } catch (err) {
      setError('Unable to load provider information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (npi) {
      fetchProvider();
    }
  }, [npi]);

  // Calculate overall confidence score from plan acceptances (use calculated score if available)
  const confidenceScore = provider?.planAcceptances?.reduce(
    (max, p) => Math.max(max, p.confidence?.score ?? p.confidenceScore ?? 0),
    0
  ) || 0;

  // Count total verifications across all plans
  const verificationCount = provider?.planAcceptances?.reduce(
    (total, p) => total + (p.verificationCount || 0),
    0
  ) || 0;

  // Get most recent verification date
  const lastVerifiedAt = provider?.planAcceptances?.reduce((latest, p) => {
    if (!p.lastVerifiedAt) return latest;
    if (!latest) return p.lastVerifiedAt;
    return new Date(p.lastVerifiedAt) > new Date(latest) ? p.lastVerifiedAt : latest;
  }, null as string | null);

  // Transform plan acceptances for InsuranceList - use calculated confidence per plan
  const insurancePlans = provider?.planAcceptances?.map(p => ({
    id: p.id,
    planId: p.planId,
    name: p.plan?.planName || p.plan?.issuerName || 'Unknown Plan',
    status: (p.acceptanceStatus === 'ACCEPTED' ? 'accepted' : 'unknown') as 'accepted' | 'unknown',
    confidence: p.confidence?.score ?? p.confidenceScore ?? 0,
  })) || [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <Link
            href="/search"
            className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Search</span>
            <span className="text-slate-400 dark:text-slate-600">&gt;</span>
            <span className="text-slate-900 dark:text-white font-medium">Provider Details</span>
          </Link>
        </nav>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <LoadingSpinner />
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">!</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Provider Not Found
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={fetchProvider}
                className="bg-[#137fec] hover:bg-[#0d6edb] text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
              <Link
                href="/search"
                className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                Back to Search
              </Link>
            </div>
          </div>
        )}

        {/* Provider Content */}
        {!loading && !error && provider && (
          <div className="space-y-6">
            {/* Hero Card */}
            <ProviderHeroCard
              provider={provider}
              confidenceScore={confidenceScore}
              verificationCount={verificationCount}
            />

            {/* About This Provider */}
            <AboutProvider
              entityType={provider.entityType}
              acceptsNewPatients={provider.acceptsNewPatients}
              languages={provider.languages}
              organizationName={provider.organizationName}
            />

            {/* Insurance Plans */}
            <InsuranceList
              plans={insurancePlans.length > 0 ? insurancePlans : undefined}
              npi={npi}
              providerName={provider.displayName}
              lastVerifiedAt={lastVerifiedAt}
              verificationCount={verificationCount}
              mainConfidenceScore={confidenceScore}
            />

            {/* Other Providers at This Location */}
            <ColocatedProviders npi={npi} />
          </div>
        )}
      </div>
    </div>
  );
}
