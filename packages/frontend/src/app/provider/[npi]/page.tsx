'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { providerApi, Provider, PlanAcceptance } from '@/lib/api';
import { ConfidenceBadge, ConfidenceIndicator } from '@/components/ConfidenceBadge';
import { VerificationButton } from '@/components/VerificationButton';

interface ProviderWithPlans extends Provider {
  displayName: string;
  planAcceptances: PlanAcceptance[];
}

export default function ProviderDetailPage() {
  const params = useParams();
  const npi = params.npi as string;

  const [provider, setProvider] = useState<ProviderWithPlans | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const specialtyLabels: Record<string, string> = {
    ENDOCRINOLOGY: 'Endocrinology',
    RHEUMATOLOGY: 'Rheumatology',
    ORTHOPEDICS: 'Orthopedics',
    INTERNAL_MEDICINE: 'Internal Medicine',
    FAMILY_MEDICINE: 'Family Medicine',
    GERIATRICS: 'Geriatrics',
    OTHER: 'Other Specialty',
  };

  useEffect(() => {
    const fetchProvider = async () => {
      setLoading(true);
      setError('');

      try {
        const result = await providerApi.getByNpi(npi);
        setProvider(result.provider);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load provider');
      } finally {
        setLoading(false);
      }
    };

    if (npi) {
      fetchProvider();
    }
  }, [npi]);

  if (loading) {
    return (
      <div className="py-12">
        <div className="container-wide">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-1/4" />
            <div className="h-40 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="py-12">
        <div className="container-wide">
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Provider Not Found</h2>
            <p className="text-gray-600 mb-6">{error || 'The provider you are looking for does not exist.'}</p>
            <Link href="/search" className="btn-primary">
              Back to Search
            </Link>
          </div>
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
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {provider.displayName}
                  </h1>
                  <p className="text-xl text-primary-600 font-medium mb-4">
                    {specialty}
                  </p>

                  {/* Contact Info */}
                  <div className="space-y-2 text-gray-600">
                    <p className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>
                        {provider.addressLine1}
                        {provider.addressLine2 && <><br />{provider.addressLine2}</>}
                        <br />
                        {provider.city}, {provider.state} {provider.zip}
                      </span>
                    </p>
                    {provider.phone && (
                      <p className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <a href={`tel:${provider.phone}`} className="text-primary-600 hover:text-primary-700">
                          {provider.phone}
                        </a>
                      </p>
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
                <div className="space-y-4">
                  {acceptedPlans.map((pa) => (
                    <div
                      key={pa.id}
                      className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-gray-50 rounded-lg gap-4"
                    >
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
                      <div className="flex items-center gap-4">
                        <ConfidenceIndicator score={pa.confidenceScore} />
                        <VerificationButton
                          npi={provider.npi}
                          providerName={provider.displayName}
                          planId={pa.plan?.planId}
                          planName={pa.plan?.planName}
                        />
                      </div>
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
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
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

            {/* Help Box */}
            <div className="card bg-primary-50 border-primary-200">
              <h3 className="text-lg font-semibold text-primary-900 mb-2">
                Help Improve This Data
              </h3>
              <p className="text-primary-800 text-sm mb-4">
                Have you visited this provider? Share your experience to help others know if their insurance is accepted.
              </p>
              <VerificationButton
                npi={provider.npi}
                providerName={provider.displayName}
              />
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
