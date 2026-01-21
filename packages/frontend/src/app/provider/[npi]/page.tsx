'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { providerApi, Provider, PlanAcceptance, Location } from '@/lib/api';
import { ConfidenceBadge, ConfidenceIndicator } from '@/components/ConfidenceBadge';
import {
  ConfidenceScoreBreakdown,
  ConfidenceScoreBadge,
  type ConfidenceLevelType,
} from '@/components/ConfidenceScoreBreakdown';
import { VerificationButton } from '@/components/VerificationButton';
import FreshnessWarning from '@/components/FreshnessWarning';
import { ProviderDetailSkeleton } from '@/components/ProviderCardSkeleton';
import ErrorMessage from '@/components/ErrorMessage';
import { trackProviderView } from '@/lib/analytics';

interface ProviderWithPlans extends Provider {
  displayName: string;
  planAcceptances: PlanAcceptance[];
}

export default function ProviderDetailPage() {
  const params = useParams();
  const npi = params.npi as string;

  const [provider, setProvider] = useState<ProviderWithPlans | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; type: 'network' | 'server' | 'not-found' } | null>(null);
  const [colocatedProviders, setColocatedProviders] = useState<(Provider & { displayName: string })[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [colocatedTotal, setColocatedTotal] = useState<number | null>(null);
  const [loadingColocated, setLoadingColocated] = useState(false);
  const [colocatedError, setColocatedError] = useState<string | null>(null);
  const [colocatedFetched, setColocatedFetched] = useState(false);

  // Ref for Intersection Observer (lazy loading colocated providers)
  const colocatedSectionRef = useRef<HTMLDivElement>(null);

  // Insurance plan grouping state
  const [planSearchQuery, setPlanSearchQuery] = useState('');
  const [expandedCarriers, setExpandedCarriers] = useState<Set<string>>(new Set());

  const specialtyLabels: Record<string, string> = {
    ENDOCRINOLOGY: 'Endocrinology',
    RHEUMATOLOGY: 'Rheumatology',
    ORTHOPEDICS: 'Orthopedics',
    INTERNAL_MEDICINE: 'Internal Medicine',
    FAMILY_MEDICINE: 'Family Medicine',
    GERIATRICS: 'Geriatrics',
    OTHER: 'Other Specialty',
  };

  const fetchProvider = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await providerApi.getByNpi(npi);
      setProvider(result.provider);

      // Track provider view
      trackProviderView({
        npi,
        specialty: result.provider.specialtyCategory || result.provider.taxonomyDescription || undefined,
        providerName: result.provider.displayName,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load provider';
      const isNetworkError = errorMessage.toLowerCase().includes('network') ||
                            errorMessage.toLowerCase().includes('fetch') ||
                            errorMessage.toLowerCase().includes('connection');
      const isNotFound = errorMessage.toLowerCase().includes('not found') ||
                        errorMessage.toLowerCase().includes('404');

      setError({
        message: errorMessage,
        type: isNotFound ? 'not-found' : isNetworkError ? 'network' : 'server'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchColocatedProviders = async () => {
    if (colocatedFetched) return; // Already fetched
    setLoadingColocated(true);
    setColocatedError(null);
    try {
      const result = await providerApi.getColocated(npi, { limit: 10 });
      setColocatedProviders(result.providers);
      setLocation(result.location);
      setColocatedTotal(result.pagination.total);
      setColocatedFetched(true);
    } catch (err) {
      console.error('Failed to load colocated providers:', err);
      setColocatedError('Unable to load other providers at this location');
    } finally {
      setLoadingColocated(false);
    }
  };

  // Fetch provider on mount
  useEffect(() => {
    if (npi) {
      fetchProvider();
    }
  }, [npi]);

  // Lazy load colocated providers when section scrolls into view
  useEffect(() => {
    if (!colocatedSectionRef.current || colocatedFetched) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !colocatedFetched) {
          fetchColocatedProviders();
        }
      },
      { rootMargin: '100px' } // Start loading 100px before visible
    );

    observer.observe(colocatedSectionRef.current);

    return () => observer.disconnect();
  }, [npi, colocatedFetched]);

  // Memoized grouped plans - must be after provider state but uses safe access
  const acceptedPlans = useMemo(() => {
    if (!provider) return [];
    return provider.planAcceptances.filter(pa => pa.acceptanceStatus === 'ACCEPTED');
  }, [provider]);

  const groupedPlans = useMemo(() => {
    const groups: Record<string, PlanAcceptance[]> = {};

    for (const pa of acceptedPlans) {
      // Use carrier with fallback to issuerName for grouping
      const carrier = pa.plan?.carrier || pa.plan?.issuerName || 'Other';

      // Filter by search query if present
      if (planSearchQuery) {
        const query = planSearchQuery.toLowerCase();
        const planName = (pa.plan?.planName || '').toLowerCase();
        const carrierName = carrier.toLowerCase();
        if (!planName.includes(query) && !carrierName.includes(query)) {
          continue;
        }
      }

      if (!groups[carrier]) {
        groups[carrier] = [];
      }
      groups[carrier].push(pa);
    }

    // Sort carriers alphabetically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [acceptedPlans, planSearchQuery]);

  // Toggle carrier expansion
  const toggleCarrier = (carrier: string) => {
    setExpandedCarriers(prev => {
      const next = new Set(prev);
      if (next.has(carrier)) {
        next.delete(carrier);
      } else {
        next.add(carrier);
      }
      return next;
    });
  };

  if (loading) {
    return <ProviderDetailSkeleton />;
  }

  if (error || !provider) {
    return (
      <div className="py-12">
        <div className="container-wide">
          <ErrorMessage
            variant={error?.type || 'not-found'}
            message={error?.message || 'The provider you are looking for does not exist.'}
            action={
              error?.type === 'network' || error?.type === 'server'
                ? { label: 'Try Again', onClick: fetchProvider }
                : undefined
            }
          >
            <Link href="/search" className="btn-primary">
              Back to Search
            </Link>
          </ErrorMessage>
        </div>
      </div>
    );
  }

  const specialty = provider.specialtyCategory
    ? specialtyLabels[provider.specialtyCategory] || provider.specialtyCategory
    : provider.taxonomyDescription || 'Healthcare Provider';

  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <li>
              <Link href="/" className="hover:text-primary-600 dark:hover:text-primary-400">Home</Link>
            </li>
            <li>/</li>
            <li>
              <Link href="/search" className="hover:text-primary-600 dark:hover:text-primary-400">Search</Link>
            </li>
            <li>/</li>
            <li className="text-gray-900 dark:text-white font-medium truncate max-w-[200px]">
              {provider.displayName}
            </li>
          </ol>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Provider Header */}
            <div className="card">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="flex-1">
                      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {provider.displayName}
                      </h1>
                      <p className="text-lg sm:text-xl text-primary-600 dark:text-primary-400 font-medium mb-2">
                        {specialty}
                      </p>

                      {/* Research Badge */}
                      <Link
                        href="/research"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-200 bg-primary-50 dark:bg-primary-900/40 px-3 py-1.5 rounded-full border border-primary-200 dark:border-primary-700 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Research-Backed Verification
                      </Link>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(`${provider.addressLine1}${provider.addressLine2 ? ' ' + provider.addressLine2 : ''}, ${provider.city}, ${provider.state} ${provider.zip}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors group"
                    >
                      <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>
                        {provider.addressLine1}
                        {provider.addressLine2 && <><br />{provider.addressLine2}</>}
                        <br />
                        {provider.city}, {provider.state} {provider.zip}
                        <span className="text-xs ml-1 opacity-75">(Open in Maps)</span>
                      </span>
                    </a>
                    {provider.phone && (
                      <a
                        href={`tel:${provider.phone}`}
                        className="flex items-center gap-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                      >
                        <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span className="text-base">{provider.phone}</span>
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <VerificationButton
                    npi={provider.npi}
                    providerName={provider.displayName}
                  />
                </div>
              </div>
            </div>

            {/* Accepted Plans */}
            <div className="card">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Accepted Insurance Plans
                  {acceptedPlans.length > 0 && (
                    <span className="ml-2 text-base font-normal text-gray-500 dark:text-gray-400">
                      ({acceptedPlans.length} plan{acceptedPlans.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </h2>
                {groupedPlans.length > 1 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExpandedCarriers(new Set(groupedPlans.map(([carrier]) => carrier)))}
                      className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                    >
                      Expand All
                    </button>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <button
                      onClick={() => setExpandedCarriers(new Set())}
                      className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                    >
                      Collapse All
                    </button>
                  </div>
                )}
              </div>

              {/* Search Input */}
              {acceptedPlans.length > 5 && (
                <div className="mb-6">
                  <div className="relative">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search plans or carriers..."
                      value={planSearchQuery}
                      onChange={(e) => setPlanSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    {planSearchQuery && (
                      <button
                        onClick={() => setPlanSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {acceptedPlans.length > 0 ? (
                groupedPlans.length > 0 ? (
                  <div className="space-y-4">
                    {groupedPlans.map(([carrier, plans]) => {
                      const isExpanded = expandedCarriers.has(carrier);
                      return (
                        <div key={carrier} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          {/* Carrier Header */}
                          <button
                            onClick={() => toggleCarrier(carrier)}
                            className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3">
                              <svg
                                className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="font-semibold text-gray-900 dark:text-white">{carrier}</span>
                            </div>
                            <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full">
                              {plans.length} plan{plans.length !== 1 ? 's' : ''}
                            </span>
                          </button>

                          {/* Plans List */}
                          {isExpanded && (
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                              {plans.map((pa) => {
                                // Get confidence level for display
                                const confidenceLevel = (pa.confidence?.level ||
                                  pa.confidenceLevel?.toUpperCase().replace(' ', '_') ||
                                  'MEDIUM') as ConfidenceLevelType;

                                // Build factors - use API data if available, otherwise estimate from score
                                const factors = pa.confidence?.factors || {
                                  dataSourceScore: Math.round(pa.confidenceScore * 0.25),
                                  recencyScore: Math.round(pa.confidenceScore * 0.30),
                                  verificationScore: Math.min(25, pa.verificationCount * 8),
                                  agreementScore: Math.round(pa.confidenceScore * 0.20),
                                };

                                // Build metadata
                                const metadata = pa.confidence?.metadata || {
                                  isStale: pa.lastVerifiedAt
                                    ? (new Date().getTime() - new Date(pa.lastVerifiedAt).getTime()) > 60 * 24 * 60 * 60 * 1000
                                    : false,
                                  daysSinceVerification: pa.lastVerifiedAt
                                    ? Math.floor((new Date().getTime() - new Date(pa.lastVerifiedAt).getTime()) / (24 * 60 * 60 * 1000))
                                    : null,
                                  researchNote: pa.verificationCount < 3
                                    ? 'Research shows 3 verifications achieve expert-level accuracy (κ=0.58).'
                                    : 'This verification meets the expert-level accuracy threshold.',
                                };

                                return (
                                  <div key={pa.id} className="p-4 space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                      <div className="flex-1">
                                        <h3 className="font-medium text-gray-900 dark:text-white">
                                          {pa.plan?.planName || 'Unknown Plan'}
                                        </h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                          {pa.plan?.planType}
                                        </p>
                                        {pa.acceptsNewPatients !== null && (
                                          <p className="text-sm mt-1">
                                            {pa.acceptsNewPatients ? (
                                              <span className="text-green-600">✓ Accepting new patients</span>
                                            ) : (
                                              <span className="text-red-600">✗ Not accepting new patients</span>
                                            )}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex flex-col items-end gap-2">
                                        {/* Compact badge for list view - clickable to expand breakdown */}
                                        <ConfidenceScoreBadge
                                          score={pa.confidenceScore}
                                          level={confidenceLevel}
                                          size="sm"
                                          showScore={true}
                                        />
                                        <VerificationButton
                                          npi={provider.npi}
                                          providerName={provider.displayName}
                                          planId={pa.plan?.planId}
                                          planName={pa.plan?.planName ?? undefined}
                                        />
                                      </div>
                                    </div>

                                    {/* Full Confidence Score Breakdown */}
                                    <ConfidenceScoreBreakdown
                                      score={pa.confidenceScore}
                                      level={confidenceLevel}
                                      factors={factors}
                                      metadata={metadata}
                                    />

                                    {/* Freshness Warning */}
                                    <FreshnessWarning
                                      lastVerifiedAt={pa.lastVerifiedAt ? new Date(pa.lastVerifiedAt) : null}
                                      specialty={provider.specialtyCategory}
                                      taxonomyDescription={provider.taxonomyDescription}
                                      providerNpi={provider.npi}
                                      providerName={provider.displayName}
                                      planId={pa.plan?.planId}
                                      planName={pa.plan?.planName ?? undefined}
                                      variant="detail"
                                      showVerifyButton={true}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-gray-600 dark:text-gray-300">
                      No plans match your search.
                    </p>
                    <button
                      onClick={() => setPlanSearchQuery('')}
                      className="mt-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                    >
                      Clear search
                    </button>
                  </div>
                )
              ) : (
                <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    No verified insurance plans yet.
                  </p>
                  <VerificationButton
                    npi={provider.npi}
                    providerName={provider.displayName}
                  />
                </div>
              )}
            </div>

            {/* Other Providers at This Location */}
            <div ref={colocatedSectionRef}>
              {/* Loading state - show when fetching or not yet fetched */}
              {(loadingColocated || (!colocatedFetched && !colocatedError)) && (
                <div className="card">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Other Providers at This Location
                  </h2>
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2"></div>
                        <div className="h-4 bg-gray-100 dark:bg-gray-600 rounded w-1/2"></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error state */}
              {!loadingColocated && colocatedError && (
              <div className="card">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  Other Providers at This Location
                </h2>
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">{colocatedError}</p>
                      <button
                        onClick={fetchColocatedProviders}
                        className="text-sm font-medium text-yellow-700 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-300 mt-2"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

              {/* Zero colocated providers */}
              {!loadingColocated && !colocatedError && colocatedFetched && colocatedTotal === 0 && (
                <div className="card">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Other Providers at This Location
                  </h2>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                    <svg className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-gray-600 dark:text-gray-300 font-medium">
                      This is the only provider at this location
                    </p>
                  </div>
                </div>
              )}

              {/* Colocated providers list */}
              {!loadingColocated && !colocatedError && colocatedFetched && colocatedTotal !== null && colocatedTotal > 0 && location && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Other Providers at This Location
                  </h2>
                  {colocatedTotal > 10 && (
                    <Link
                      href={`/search?city=${encodeURIComponent(location.city)}&state=${location.state}&zipCode=${location.zipCode.substring(0, 5)}`}
                      className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                    >
                      View all {colocatedTotal}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                </div>

                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-start gap-2">
                  <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {location.name && (
                      <p className="font-semibold text-base text-gray-900 dark:text-white mb-1">{location.name}</p>
                    )}
                    {location.healthSystem && (
                      <p className="text-primary-600 dark:text-primary-400 mb-1">{location.healthSystem}</p>
                    )}
                    <p className="font-medium">{location.addressLine1}</p>
                    {location.addressLine2 && <p>{location.addressLine2}</p>}
                    <p>{location.city}, {location.state} {location.zipCode}</p>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                      {colocatedTotal + 1} provider{colocatedTotal + 1 !== 1 ? 's' : ''} at this {location.facilityType ? location.facilityType.toLowerCase() : 'address'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {colocatedProviders.slice(0, 10).map((colProvider) => (
                    <Link
                      key={colProvider.npi}
                      href={`/provider/${colProvider.npi}`}
                      className="block p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/30 dark:hover:bg-primary-900/20 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
                            {colProvider.displayName}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {colProvider.taxonomyDescription || colProvider.specialtyCategory || 'Healthcare Provider'}
                          </p>
                          {colProvider.phone && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {colProvider.phone}
                            </p>
                          )}
                        </div>
                        <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>

                {colocatedTotal > 10 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-center">
                    <Link
                      href={`/search?city=${encodeURIComponent(location.city)}&state=${location.state}&zipCode=${location.zipCode.substring(0, 5)}`}
                      className="btn-secondary"
                    >
                      View all {colocatedTotal} providers at this location
                    </Link>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Verify This Provider CTA */}
            <div className="card bg-gradient-to-br from-primary-50 to-primary-100 border-primary-300 shadow-md">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-primary-900 mb-1">
                    Verify This Provider
                  </h3>
                  <p className="text-sm text-primary-800">
                    Your 2-minute verification helps prevent surprise bills
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 text-xs text-gray-700 mb-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  5 simple yes/no questions
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-700 mb-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Under 2 minutes, no typing
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-700">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  3 verifications = expert accuracy
                </div>
              </div>

              <VerificationButton
                npi={provider.npi}
                providerName={provider.displayName}
              />

              <p className="text-xs text-primary-700 mt-3 text-center">
                Research shows patients face 4x more surprise bills when directories are wrong
              </p>
            </div>

            {/* Research Explainer */}
            <div className="card bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 bg-gray-700 dark:bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Why Verification Matters
                  </h3>
                  <div className="text-xs text-gray-700 dark:text-gray-300 space-y-2">
                    <p>
                      <strong className="text-gray-900 dark:text-white">46-77%</strong> of insurance directories are wrong, causing:
                    </p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><strong className="text-gray-900 dark:text-white">4x more surprise bills</strong></li>
                      <li>28% delay needed care</li>
                      <li>540 days to fix errors</li>
                    </ul>
                    <p className="pt-2">
                      Our crowdsourced verification achieves <strong className="text-gray-900 dark:text-white">expert-level accuracy</strong> (κ=0.58) with just 3 patients.
                    </p>
                  </div>
                </div>
              </div>

              <Link
                href="/research"
                className="text-xs font-medium text-primary-700 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 flex items-center gap-1 mt-3"
              >
                Read the research
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {/* Provider Details */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Provider Details
              </h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">NPI Number</dt>
                  <dd className="font-mono text-gray-900 dark:text-white">{provider.npi}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Entity Type</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {provider.entityType === 'INDIVIDUAL' ? 'Individual' : 'Organization'}
                  </dd>
                </div>
                {provider.taxonomyCode && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">Taxonomy Code</dt>
                    <dd className="font-mono text-gray-900 dark:text-white">{provider.taxonomyCode}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt>
                  <dd>
                    <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${
                      provider.npiStatus === 'ACTIVE'
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300'
                        : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                    }`}>
                      {provider.npiStatus}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Disclaimer */}
            <div className="card bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
              <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                Important Note
              </h3>
              <p className="text-yellow-800 dark:text-yellow-300 text-sm">
                Insurance acceptance can change. Always call the provider to confirm they accept your specific plan before your visit.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
