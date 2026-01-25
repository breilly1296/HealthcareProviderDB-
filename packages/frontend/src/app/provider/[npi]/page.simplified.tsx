'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { providerApi } from '@/lib/api';
import type { ProviderDisplay, PlanAcceptanceDisplay } from '@/types';
import { VerificationButton } from '@/components/VerificationButton';
import { getSpecialtyDisplay } from '@/lib/provider-utils';
import { LocationIcon, PhoneIcon } from '@/components/icons/Icons';
import { PlanAcceptanceCard } from '@/components/provider/PlanAcceptanceCard';
import { VerificationCallToAction } from '@/components/provider/VerificationCallToAction';
import { ResearchExplainer } from '@/components/provider/ResearchExplainer';

interface ProviderWithPlans extends ProviderDisplay {
  planAcceptances: PlanAcceptanceDisplay[];
}

export default function ProviderDetailPage() {
  const params = useParams();
  const npi = params.npi as string;

  const [provider, setProvider] = useState<ProviderWithPlans | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!npi) return;

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

    fetchProvider();
  }, [npi]);

  if (loading) return <LoadingState />;
  if (error || !provider) return <ErrorState error={error} />;

  const specialty = getSpecialtyDisplay(provider.specialtyCategory, provider.taxonomyDescription);
  const acceptedPlans = provider.planAcceptances.filter(pa => pa.acceptanceStatus === 'ACCEPTED');

  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        <Breadcrumb providerName={provider.displayName} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <ProviderHeader provider={provider} specialty={specialty} />
            <AcceptedPlansSection
              acceptedPlans={acceptedPlans}
              provider={provider}
              specialty={specialty}
            />
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <VerificationCallToAction npi={provider.npi} providerName={provider.displayName} />
            <ResearchExplainer />
            <ProviderDetailsCard provider={provider} />
            <DisclaimerCard />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-Components (Extracted for Clarity)
// ============================================================

function LoadingState() {
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

function ErrorState({ error }: { error: string }) {
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

function Breadcrumb({ providerName }: { providerName: string }) {
  return (
    <nav className="mb-6">
      <ol className="flex items-center gap-2 text-sm text-gray-500">
        <li><Link href="/" className="hover:text-primary-600">Home</Link></li>
        <li>/</li>
        <li><Link href="/search" className="hover:text-primary-600">Search</Link></li>
        <li>/</li>
        <li className="text-gray-900 font-medium truncate max-w-[200px]">{providerName}</li>
      </ol>
    </nav>
  );
}

function ProviderHeader({ provider, specialty }: { provider: ProviderWithPlans; specialty: string }) {
  return (
    <div className="card">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{provider.displayName}</h1>
              <p className="text-xl text-primary-600 font-medium mb-2">{specialty}</p>

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
            <p className="flex items-start gap-2">
              <LocationIcon className="text-gray-400 mt-0.5" />
              <span>
                {provider.addressLine1}
                {provider.addressLine2 && <><br />{provider.addressLine2}</>}
                <br />
                {provider.city}, {provider.state} {provider.zip}
              </span>
            </p>
            {provider.phone && (
              <p className="flex items-center gap-2">
                <PhoneIcon className="text-gray-400" />
                <a href={`tel:${provider.phone}`} className="text-primary-600 hover:text-primary-700">
                  {provider.phone}
                </a>
              </p>
            )}
          </div>
        </div>

        <div className="flex-shrink-0">
          <VerificationButton npi={provider.npi} providerName={provider.displayName} />
        </div>
      </div>
    </div>
  );
}

function AcceptedPlansSection({
  acceptedPlans,
  provider,
  specialty,
}: {
  acceptedPlans: PlanAcceptanceDisplay[];
  provider: ProviderWithPlans;
  specialty: string;
}) {
  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Accepted Insurance Plans</h2>

      {acceptedPlans.length > 0 ? (
        <div className="space-y-6">
          {acceptedPlans.map(pa => (
            <PlanAcceptanceCard
              key={pa.id}
              planAcceptance={pa}
              providerNpi={provider.npi}
              providerName={provider.displayName}
              providerSpecialty={provider.specialtyCategory}
              providerTaxonomy={provider.taxonomyDescription}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <p className="text-gray-600 mb-4">No verified insurance plans yet.</p>
          <VerificationButton npi={provider.npi} providerName={provider.displayName} />
        </div>
      )}
    </div>
  );
}

function ProviderDetailsCard({ provider }: { provider: ProviderWithPlans }) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Provider Details</h3>
      <dl className="space-y-3">
        <DetailRow label="NPI Number" value={provider.npi} mono />
        <DetailRow
          label="Entity Type"
          value={provider.entityType === 'INDIVIDUAL' ? 'Individual' : 'Organization'}
        />
        {provider.taxonomyCode && (
          <DetailRow label="Taxonomy Code" value={provider.taxonomyCode} mono />
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
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className={`text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function DisclaimerCard() {
  return (
    <div className="card bg-yellow-50 border-yellow-200">
      <h3 className="text-lg font-semibold text-yellow-900 mb-2">Important Note</h3>
      <p className="text-yellow-800 text-sm">
        Insurance acceptance can change. Always call the provider to confirm they accept your specific plan before your visit.
      </p>
    </div>
  );
}
