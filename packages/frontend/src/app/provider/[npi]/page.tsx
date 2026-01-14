'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { providerApi, Provider, PlanAcceptance, Location } from '@/lib/api';
import { ConfidenceBadge, ConfidenceIndicator } from '@/components/ConfidenceBadge';
import { VerificationButton } from '@/components/VerificationButton';
import FreshnessWarning from '@/components/FreshnessWarning';
import { ProviderDetailSkeleton } from '@/components/ProviderCardSkeleton';
import ErrorMessage from '@/components/ErrorMessage';

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
  const [colocatedTotal, setColocatedTotal] = useState(0);
  const [loadingColocated, setLoadingColocated] = useState(false);

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
    setLoadingColocated(true);
    try {
      const result = await providerApi.getColocated(npi, { limit: 10 });
      setColocatedProviders(result.providers);
      setLocation(result.location);
      setColocatedTotal(result.pagination.total);
    } catch (err) {
      // Silently fail for colocated providers - not critical
      console.error('Failed to load colocated providers:', err);
    } finally {
      setLoadingColocated(false);
    }
  };

  useEffect(() => {
    if (npi) {
      fetchProvider();
      fetchColocatedProviders();
    }
  }, [npi]);

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

  const acceptedPlans = provider.planAcceptances.filter(
    (pa) => pa.acceptanceStatus === 'ACCEPTED'
  );

  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-gray-500">
            <li>
              <Link href="/" className="hover:text-primary-600">Home</Link>
            </li>
            <li>/</li>
            <li>
              <Link href="/search" className="hover:text-primary-600">Search</Link>
            </li>
            <li>/</li>
            <li className="text-gray-900 font-medium truncate max-w-[200px]">
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
                      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                        {provider.displayName}
                      </h1>
                      <p className="text-lg sm:text-xl text-primary-600 font-medium mb-2">
                        {specialty}
                      </p>

                      {/* Research Badge */}
                      <Link
                        href="/research"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:text-primary-800 bg-primary-50 px-3 py-1.5 rounded-full border border-primary-200 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Research-Backed Verification
                      </Link>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-2 text-gray-600">
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(`${provider.addressLine1}${provider.addressLine2 ? ' ' + provider.addressLine2 : ''}, ${provider.city}, ${provider.state} ${provider.zip}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 text-primary-600 hover:text-primary-700 transition-colors group"
                    >
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-primary-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        className="flex items-center gap-2 text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Accepted Insurance Plans
              </h2>

              {acceptedPlans.length > 0 ? (
                <div className="space-y-6">
                  {acceptedPlans.map((pa) => (
                    <div key={pa.id} className="space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-gray-50 rounded-lg gap-4">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">
                            {pa.plan?.planName || 'Unknown Plan'}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {pa.plan?.carrierName} • {pa.plan?.planType}
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
                          <ConfidenceIndicator
                            lastVerifiedAt={pa.lastVerifiedAt}
                            verificationCount={pa.verificationCount}
                            acceptanceStatus={pa.acceptanceStatus}
                          />
                          <VerificationButton
                            npi={provider.npi}
                            providerName={provider.displayName}
                            planId={pa.plan?.planId}
                            planName={pa.plan?.planName}
                          />
                        </div>
                      </div>

                      {/* Freshness Warning - Prominent Detail Variant */}
                      <FreshnessWarning
                        lastVerifiedAt={pa.lastVerifiedAt ? new Date(pa.lastVerifiedAt) : null}
                        specialty={provider.specialtyCategory}
                        taxonomyDescription={provider.taxonomyDescription}
                        providerNpi={provider.npi}
                        providerName={provider.displayName}
                        planId={pa.plan?.planId}
                        planName={pa.plan?.planName}
                        variant="detail"
                        showVerifyButton={true}
                      />

                      {/* Confidence Score Explainer */}
                      {pa.confidenceScore !== undefined && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900 mb-2">
                                Understanding Confidence Scores
                              </h4>
                              <div className="text-sm text-gray-700 space-y-2">
                                <p>
                                  This plan has a <strong>{pa.confidenceLevel?.replace('_', ' ') || 'MEDIUM'}</strong> confidence
                                  score ({pa.confidenceScore}%) based on:
                                </p>
                                <ul className="list-disc list-inside space-y-1 ml-2">
                                  <li><strong>{pa.verificationCount || 0}</strong> patient verifications</li>
                                  <li>Data freshness (last verified {pa.lastVerifiedAt ? new Date(pa.lastVerifiedAt).toLocaleDateString() : 'never'})</li>
                                  <li>Source reliability (crowdsourced + authoritative data)</li>
                                  <li>Community agreement rate</li>
                                </ul>
                                <div className="bg-white border border-primary-200 rounded p-3 mt-3">
                                  <p className="text-xs text-primary-900">
                                    <strong>Research shows:</strong> 3 patient verifications achieve expert-level accuracy
                                    (κ=0.58 vs 0.59 expert agreement). Traditional insurance directories are wrong 46-77% of the time.
                                    <br />
                                    <span className="text-primary-700 italic">Source: Mortensen et al. (2015), JAMIA; Haeder et al. (2024)</span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Verification History Timeline */}
                      {pa.verificationCount > 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900 mb-3">
                                Verification Activity
                              </h4>

                              {/* Progress to 3 verifications */}
                              <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-gray-700">
                                    Community verifications
                                  </span>
                                  <span className="text-sm text-gray-600">
                                    {pa.verificationCount} of 3 needed
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      pa.verificationCount >= 3 ? 'bg-green-500' : 'bg-primary-500'
                                    }`}
                                    style={{ width: `${Math.min(100, (pa.verificationCount / 3) * 100)}%` }}
                                  />
                                </div>
                                {pa.verificationCount >= 3 ? (
                                  <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Expert-level accuracy achieved (κ=0.58)
                                  </p>
                                ) : (
                                  <p className="text-xs text-gray-600 mt-2">
                                    {3 - pa.verificationCount} more {3 - pa.verificationCount === 1 ? 'verification' : 'verifications'} needed for high confidence
                                  </p>
                                )}
                              </div>

                              {/* Timeline */}
                              <div className="space-y-3">
                                <div className="flex gap-3">
                                  <div className="flex flex-col items-center">
                                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                                    <div className="w-0.5 h-full bg-gray-300" />
                                  </div>
                                  <div className="flex-1 pb-3">
                                    <p className="text-sm font-medium text-gray-900">
                                      {pa.verificationCount} patient{pa.verificationCount !== 1 ? 's' : ''} verified
                                    </p>
                                    <p className="text-xs text-gray-600">
                                      Most recent: {pa.lastVerifiedAt ? new Date(pa.lastVerifiedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown'}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex gap-3">
                                  <div className="flex flex-col items-center">
                                    <div className="w-2 h-2 bg-primary-500 rounded-full" />
                                    <div className="w-0.5 h-full bg-gray-300" />
                                  </div>
                                  <div className="flex-1 pb-3">
                                    <p className="text-sm font-medium text-gray-900">
                                      Confidence level
                                    </p>
                                    <p className="text-xs text-gray-600">
                                      {pa.confidenceLevel?.replace('_', ' ') || 'MEDIUM'} ({pa.confidenceScore}%)
                                    </p>
                                  </div>
                                </div>

                                <div className="flex gap-3">
                                  <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0 mt-1" />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">
                                      Acceptance status
                                    </p>
                                    <p className="text-xs text-gray-600">
                                      {pa.acceptanceStatus === 'ACCEPTED' ? 'Accepts this plan' :
                                       pa.acceptanceStatus === 'NOT_ACCEPTED' ? 'Does not accept' :
                                       pa.acceptanceStatus === 'PENDING' ? 'Status pending verification' :
                                       'Unknown'}
                                      {pa.acceptsNewPatients !== null && (
                                        <> • {pa.acceptsNewPatients ? 'Accepting new patients' : 'Not accepting new patients'}</>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-gray-600 mb-4">
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
            {!loadingColocated && colocatedTotal > 0 && location && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Other Providers at This Location
                  </h2>
                  {colocatedTotal > 10 && (
                    <Link
                      href={`/search?city=${encodeURIComponent(location.city)}&state=${location.state}&zipCode=${location.zipCode.substring(0, 5)}`}
                      className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1"
                    >
                      View all {colocatedTotal}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                </div>

                <div className="mb-4 p-3 bg-gray-50 rounded-lg flex items-start gap-2">
                  <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div className="text-sm text-gray-700">
                    <p className="font-medium">{location.addressLine1}</p>
                    {location.addressLine2 && <p>{location.addressLine2}</p>}
                    <p>{location.city}, {location.state} {location.zipCode}</p>
                    <p className="text-gray-500 mt-1">
                      {colocatedTotal + 1} provider{colocatedTotal + 1 !== 1 ? 's' : ''} at this address
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {colocatedProviders.slice(0, 10).map((colProvider) => (
                    <Link
                      key={colProvider.npi}
                      href={`/provider/${colProvider.npi}`}
                      className="block p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 hover:text-primary-600">
                            {colProvider.displayName}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {colProvider.taxonomyDescription || colProvider.specialtyCategory || 'Healthcare Provider'}
                          </p>
                          {colProvider.phone && (
                            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {colProvider.phone}
                            </p>
                          )}
                        </div>
                        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>

                {colocatedTotal > 10 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 text-center">
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
            <div className="card bg-gray-50 border-gray-200">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    Why Verification Matters
                  </h3>
                  <div className="text-xs text-gray-700 space-y-2">
                    <p>
                      <strong>46-77%</strong> of insurance directories are wrong, causing:
                    </p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><strong>4x more surprise bills</strong></li>
                      <li>28% delay needed care</li>
                      <li>540 days to fix errors</li>
                    </ul>
                    <p className="pt-2">
                      Our crowdsourced verification achieves <strong>expert-level accuracy</strong> (κ=0.58) with just 3 patients.
                    </p>
                  </div>
                </div>
              </div>

              <Link
                href="/research"
                className="text-xs font-medium text-primary-700 hover:text-primary-800 flex items-center gap-1 mt-3"
              >
                Read the research
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {/* Provider Details */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Provider Details
              </h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-gray-500">NPI Number</dt>
                  <dd className="font-mono text-gray-900">{provider.npi}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Entity Type</dt>
                  <dd className="text-gray-900">
                    {provider.entityType === 'INDIVIDUAL' ? 'Individual' : 'Organization'}
                  </dd>
                </div>
                {provider.taxonomyCode && (
                  <div>
                    <dt className="text-sm text-gray-500">Taxonomy Code</dt>
                    <dd className="font-mono text-gray-900">{provider.taxonomyCode}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-gray-500">Status</dt>
                  <dd>
                    <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${
                      provider.npiStatus === 'ACTIVE'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {provider.npiStatus}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Disclaimer */}
            <div className="card bg-yellow-50 border-yellow-200">
              <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                Important Note
              </h3>
              <p className="text-yellow-800 text-sm">
                Insurance acceptance can change. Always call the provider to confirm they accept your specific plan before your visit.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
