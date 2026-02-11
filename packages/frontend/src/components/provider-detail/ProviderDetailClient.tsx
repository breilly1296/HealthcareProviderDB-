'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { providerKeys } from '@/hooks/useProviderSearch';
import api from '@/lib/api';
import { trackProviderView } from '@/lib/analytics';
import type { ProviderDisplay, PlanAcceptanceDisplay } from '@/types';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  ProviderHeroCard,
  InsuranceList,
  AboutProvider,
  ColocatedProviders,
} from '@/components/provider-detail';
import { Disclaimer } from '@/components/Disclaimer';

// Provider with full plan acceptance data (from detail API)
export interface ProviderWithPlans extends Omit<ProviderDisplay, 'planAcceptances'> {
  planAcceptances: PlanAcceptanceDisplay[];
  acceptsNewPatients?: boolean | null;
  languages?: string[] | null;
  nppesLastSynced?: string | null;
  locations?: Array<{
    id: number;
    address_type?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    phone?: string | null;
    fax?: string | null;
  }>;
}

interface ProviderDetailClientProps {
  npi: string;
  initialProvider: ProviderWithPlans | null;
}

// Status mapping shared between server and client
const statusMap: Record<string, 'accepted' | 'not_accepted' | 'pending' | 'unknown'> = {
  ACCEPTED: 'accepted',
  NOT_ACCEPTED: 'not_accepted',
  PENDING: 'pending',
  UNKNOWN: 'unknown',
};

export default function ProviderDetailClient({ npi, initialProvider }: ProviderDetailClientProps) {
  const {
    data: typedProvider,
    isLoading: loading,
    isError,
    refetch,
  } = useQuery<ProviderWithPlans | null>({
    queryKey: providerKeys.detail(npi),
    queryFn: async () => {
      const response = await api.providers.getByNpi(npi);
      return response.provider as ProviderWithPlans;
    },
    initialData: initialProvider ?? undefined,
    enabled: Boolean(npi),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const error = isError ? 'Unable to load provider information.' : null;

  // Track provider view when data is available
  useEffect(() => {
    if (typedProvider) {
      trackProviderView({
        npi,
        specialty: typedProvider.taxonomyDescription || typedProvider.specialtyCategory || undefined,
      });
    }
  }, [typedProvider?.npi]); // eslint-disable-line react-hooks/exhaustive-deps

  // Find the plan acceptance with the highest confidence score
  const bestAcceptance = typedProvider?.planAcceptances?.reduce<PlanAcceptanceDisplay | null>(
    (best, p) => {
      const score = p.confidence?.score ?? p.confidenceScore ?? 0;
      const bestScore = best ? (best.confidence?.score ?? best.confidenceScore ?? 0) : -1;
      return score > bestScore ? p : best;
    },
    null
  ) ?? null;

  const confidenceScore = bestAcceptance?.confidence?.score ?? bestAcceptance?.confidenceScore ?? 0;

  // Count total verifications across all plans
  const verificationCount = typedProvider?.planAcceptances?.reduce(
    (total, p) => total + (p.verificationCount || 0),
    0
  ) || 0;

  // Get most recent verification date
  const lastVerifiedAt = typedProvider?.planAcceptances?.reduce((latest, p) => {
    if (!p.lastVerifiedAt) return latest;
    if (!latest) return p.lastVerifiedAt;
    return new Date(p.lastVerifiedAt) > new Date(latest) ? p.lastVerifiedAt : latest;
  }, null as string | null);

  // Transform plan acceptances for InsuranceList
  const insurancePlans = typedProvider?.planAcceptances?.map(p => ({
    id: p.id,
    planId: p.planId,
    name: p.plan?.planName || p.plan?.issuerName || 'Unknown Plan',
    status: statusMap[p.acceptanceStatus] || 'unknown',
    confidence: p.confidence?.score ?? p.confidenceScore ?? 0,
    locationId: p.locationId ?? undefined,
    location: p.location ?? undefined,
    lastVerifiedAt: p.lastVerifiedAt,
  })) || [];

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-gray-900">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-2 text-sm">
            <li>
              <Link
                href="/search"
                className="inline-flex items-center gap-1 text-stone-600 dark:text-gray-400 hover:text-[#137fec] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Search
              </Link>
            </li>
            <li className="text-stone-400 dark:text-gray-600" aria-hidden="true">&gt;</li>
            <li aria-current="page" className="text-stone-800 dark:text-white font-medium">
              Provider Details
            </li>
          </ol>
        </nav>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <LoadingSpinner />
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700 p-12 text-center">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">!</span>
            </div>
            <h2 className="text-xl font-semibold text-stone-800 dark:text-white mb-2">
              Provider Not Found
            </h2>
            <p className="text-stone-500 dark:text-gray-400 mb-6">{error}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => refetch()}
                className="bg-[#137fec] hover:bg-[#0d6edb] text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
              <Link
                href="/search"
                className="bg-stone-100 dark:bg-gray-700 hover:bg-stone-200 dark:hover:bg-gray-600 text-stone-800 dark:text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                Back to Search
              </Link>
            </div>
          </div>
        )}

        {/* Provider Content */}
        {!loading && !error && typedProvider && (
          <div className="space-y-6">
            {/* Hero Card */}
            <ProviderHeroCard
              provider={typedProvider}
              confidenceScore={confidenceScore}
              verificationCount={verificationCount}
              nppesLastSynced={typedProvider.nppesLastSynced}
              confidenceBreakdown={bestAcceptance?.confidence}
            />

            {/* Data Accuracy Disclaimer */}
            <Disclaimer variant="inline" showLearnMore={true} />

            {/* About This Provider */}
            <AboutProvider
              entityType={typedProvider.entityType}
              acceptsNewPatients={typedProvider.acceptsNewPatients}
              languages={typedProvider.languages}
            />

            {/* Insurance Plans */}
            <InsuranceList
              plans={insurancePlans.length > 0 ? insurancePlans : undefined}
              npi={npi}
              providerName={typedProvider.displayName}
              lastVerifiedAt={lastVerifiedAt}
              verificationCount={verificationCount}
              mainConfidenceScore={confidenceScore}
              locations={typedProvider.locations}
            />

            {/* Other Providers at This Location */}
            <ColocatedProviders npi={npi} />
          </div>
        )}
      </div>
    </div>
  );
}
