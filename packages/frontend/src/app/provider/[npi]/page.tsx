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
  ScoreBreakdown,
  InsuranceList,
} from '@/components/provider-detail';

interface ProviderWithPlans extends ProviderDisplay {
  planAcceptances: PlanAcceptanceDisplay[];
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

  // Calculate confidence score from plan acceptances
  const confidenceScore = provider?.planAcceptances?.reduce(
    (max, p) => Math.max(max, p.confidenceScore || 0),
    0
  ) || 0;

  // Transform plan acceptances for InsuranceList
  const insurancePlans = provider?.planAcceptances?.map(p => ({
    id: p.id,
    name: p.plan?.planName || p.plan?.issuerName || 'Unknown Plan',
    status: (p.acceptanceStatus === 'ACCEPTED' ? 'accepted' : 'unknown') as 'accepted' | 'unknown',
    confidence: p.confidenceScore || 0,
  })) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <Link
            href="/search"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#137fec] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Search</span>
            <span className="text-gray-400">&gt;</span>
            <span className="text-gray-900 font-medium">Provider Details</span>
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">!</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Provider Not Found
            </h2>
            <p className="text-gray-500 mb-6">{error}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={fetchProvider}
                className="bg-[#137fec] hover:bg-[#0d6edb] text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
              <Link
                href="/search"
                className="bg-gray-100 hover:bg-gray-200 text-gray-900 px-6 py-2.5 rounded-lg font-medium transition-colors"
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
            <ProviderHeroCard provider={provider} confidenceScore={confidenceScore} />

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Score Breakdown */}
              <ScoreBreakdown />

              {/* Insurance Plans */}
              <InsuranceList plans={insurancePlans.length > 0 ? insurancePlans : undefined} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
