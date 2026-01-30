'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import type { ProviderDisplay } from '@/types';
import { getSpecialtyDisplay } from '@/lib/provider-utils';
import { LocationIcon, PhoneIcon, ChevronRightIcon } from '@/components/icons';
import { CheckCircle, BadgeCheck } from 'lucide-react';

interface ProviderCardProps {
  provider: ProviderDisplay;
  showConfidence?: boolean;
}

// Helper to format phone numbers
function formatPhoneNumber(phone: string | null): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

// Helper to get initials from provider name
function getInitials(provider: ProviderDisplay): string {
  if (provider.entityType === 'ORGANIZATION' && provider.organizationName) {
    return provider.organizationName
      .split(' ')
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
  }

  const first = provider.firstName?.[0] || '';
  const last = provider.lastName?.[0] || '';

  if (first && last) {
    return (first + last).toUpperCase();
  }

  // Fallback to displayName
  return provider.displayName
    .split(' ')
    .filter(n => !['Dr.', 'MD', 'DO', 'PhD', 'NP', 'PA'].includes(n))
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'DR';
}

// Helper to get confidence color
function getConfidenceColor(score: number): { bg: string; bar: string; text: string } {
  if (score >= 70) {
    return {
      bg: 'bg-green-50 dark:bg-green-900/20',
      bar: 'bg-green-500',
      text: 'text-green-700 dark:text-green-400',
    };
  }
  if (score >= 50) {
    return {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      bar: 'bg-yellow-500',
      text: 'text-yellow-700 dark:text-yellow-400',
    };
  }
  return {
    bg: 'bg-red-50 dark:bg-red-900/20',
    bar: 'bg-red-500',
    text: 'text-red-700 dark:text-red-400',
  };
}

/**
 * Memoized provider card for search results
 */
function ProviderCardComponent({
  provider,
  showConfidence = true,
}: ProviderCardProps) {
  // Get confidence and plan data from provider object
  const confidenceScore = provider.confidenceScore ?? null;
  const planAcceptances = provider.planAcceptances ?? [];

  // Memoize computed specialty
  const specialty = useMemo(
    () => getSpecialtyDisplay(provider.specialtyCategory, provider.taxonomyDescription),
    [provider.specialtyCategory, provider.taxonomyDescription]
  );

  // Get initials for avatar
  const initials = useMemo(() => getInitials(provider), [provider]);

  // Format address - handle missing zip gracefully
  const formattedAddress = useMemo(() => {
    const cityState = `${provider.city}, ${provider.state}`;
    const zipPart = provider.zip && provider.zip !== 'undefined' ? ` ${provider.zip}` : '';
    return {
      street: provider.addressLine1 + (provider.addressLine2 ? `, ${provider.addressLine2}` : ''),
      cityStateZip: cityState + zipPart,
    };
  }, [provider.addressLine1, provider.addressLine2, provider.city, provider.state, provider.zip]);

  // Format phone
  const formattedPhone = useMemo(
    () => formatPhoneNumber(provider.phone),
    [provider.phone]
  );

  // Confidence display
  const hasConfidence = showConfidence && confidenceScore !== null && confidenceScore > 0;
  const isVerified = (confidenceScore ?? 0) >= 70;
  const confidenceColors = hasConfidence && confidenceScore !== null ? getConfidenceColor(confidenceScore) : null;

  // Get top accepted plans for preview (already filtered by backend, but double-check)
  const acceptedPlans = planAcceptances
    .filter(p => p.acceptanceStatus === 'ACCEPTED')
    .slice(0, 3);
  const totalAcceptedCount = planAcceptances.filter(p => p.acceptanceStatus === 'ACCEPTED').length;
  const remainingPlansCount = Math.max(0, totalAcceptedCount - 3);

  return (
    <Link href={`/provider/${provider.npi}`}>
      <article className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 cursor-pointer">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#137fec] to-[#0d5bb5] flex items-center justify-center">
              <span className="text-white font-bold text-lg">{initials}</span>
            </div>
            {isVerified && (
              <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 rounded-full p-0.5">
                <CheckCircle className="w-5 h-5 text-green-500 fill-green-500" />
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Top row: Name and Confidence */}
            <div className="flex items-start justify-between gap-4 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                  {provider.displayName}
                </h3>
                {isVerified && (
                  <BadgeCheck className="w-5 h-5 text-[#137fec] flex-shrink-0" />
                )}
              </div>

              {/* Confidence Score */}
              {hasConfidence && confidenceColors && (
                <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg ${confidenceColors.bg} border ${confidenceColors.bg.includes('green') ? 'border-green-200 dark:border-green-800' : confidenceColors.bg.includes('yellow') ? 'border-yellow-200 dark:border-yellow-800' : 'border-red-200 dark:border-red-800'}`}>
                  <div className={`text-xs font-bold ${confidenceColors.text}`}>
                    {confidenceScore}% Confidence
                  </div>
                  <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-1 overflow-hidden">
                    <div
                      className={`h-full ${confidenceColors.bar} rounded-full transition-all`}
                      style={{ width: `${confidenceScore}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Specialty */}
            <p className="text-[#137fec] font-medium text-sm mb-2">{specialty}</p>

            {/* Address and Phone */}
            <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-2">
                <LocationIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                <span>
                  {formattedAddress.street}, {formattedAddress.cityStateZip}
                </span>
              </div>

              {formattedPhone && (
                <div className="flex items-center gap-2">
                  <PhoneIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                  <span>{formattedPhone}</span>
                </div>
              )}
            </div>

            {/* NPI - smaller */}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              NPI: {provider.npi}
            </p>
          </div>
        </div>

        {/* Insurance Preview Section */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              {acceptedPlans.length > 0 ? (
                <>
                  {acceptedPlans.map((plan, idx) => {
                    const fullName = plan.planName || plan.issuerName || 'Plan';
                    const displayName = fullName.length > 18 ? `${fullName.slice(0, 18)}...` : fullName;
                    return (
                      <span
                        key={idx}
                        title={fullName}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors cursor-default"
                      >
                        <CheckCircle className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{displayName}</span>
                      </span>
                    );
                  })}
                  {remainingPlansCount > 0 && (
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-full border border-slate-200 dark:border-slate-600">
                      +{remainingPlansCount} more
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  View insurance details
                </span>
              )}
            </div>

            {/* View Details */}
            <span className="flex items-center gap-1 text-[#137fec] font-medium text-sm hover:gap-2 transition-all">
              View Details
              <ChevronRightIcon className="w-4 h-4" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

// Custom comparison function for memo
function arePropsEqual(prevProps: ProviderCardProps, nextProps: ProviderCardProps): boolean {
  if (prevProps.provider.npi !== nextProps.provider.npi) return false;
  if (prevProps.provider.displayName !== nextProps.provider.displayName) return false;
  if (prevProps.provider.phone !== nextProps.provider.phone) return false;
  if (prevProps.provider.addressLine1 !== nextProps.provider.addressLine1) return false;
  if (prevProps.provider.city !== nextProps.provider.city) return false;
  if (prevProps.provider.state !== nextProps.provider.state) return false;
  if (prevProps.provider.zip !== nextProps.provider.zip) return false;
  if (prevProps.provider.confidenceScore !== nextProps.provider.confidenceScore) return false;
  if (prevProps.showConfidence !== nextProps.showConfidence) return false;
  if (prevProps.provider.planAcceptances?.length !== nextProps.provider.planAcceptances?.length) return false;
  return true;
}

export const ProviderCard = memo(ProviderCardComponent, arePropsEqual);

/**
 * Compact version for listing in provider detail.
 */
function ProviderCardCompactComponent({
  provider,
}: {
  provider: ProviderDisplay;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
      <div>
        <h4 className="font-medium text-slate-900 dark:text-white">{provider.displayName}</h4>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {provider.city}, {provider.state}
        </p>
      </div>
      <Link
        href={`/provider/${provider.npi}`}
        className="text-[#137fec] hover:text-[#0d6edb] font-medium text-sm"
      >
        View →
      </Link>
    </div>
  );
}

export const ProviderCardCompact = memo(
  ProviderCardCompactComponent,
  (prevProps, nextProps) => prevProps.provider.npi === nextProps.provider.npi
);
