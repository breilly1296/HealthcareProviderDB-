'use client';

import { memo, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ProviderDisplay } from '@/types';
import { getSpecialtyDisplay } from '@/lib/provider-utils';
import { toDisplayCase, toAddressCase, toTitleCase } from '@/lib/formatName';
import { LocationIcon, PhoneIcon, ChevronRightIcon } from '@/components/icons';
import { CheckCircle, BadgeCheck } from 'lucide-react';

interface ProviderCardProps {
  provider: ProviderDisplay;
  showConfidence?: boolean;
  index?: number;
}

// Standard credentials to keep (uppercase for matching)
const VALID_CREDENTIALS = new Set([
  'MD', 'DO', 'PhD', 'PharmD', 'DDS', 'DMD', 'DPM', 'DC', 'OD', 'DPT', 'DNP', 'DrPH',
  'NP', 'PA', 'PA-C', 'RN', 'LPN', 'APRN', 'CNM', 'CRNA', 'CNS',
  'LCSW', 'LMHC', 'LMFT', 'LPC', 'LCPC', 'LMSW', 'LSW', 'LICSW',
  'PsyD', 'BCBA', 'BCABA', 'RBT',
  'CRC', 'CASAC', 'CADC', 'CDCA', 'CAP', 'MAC',
  'PT', 'OT', 'OTR', 'SLP', 'CCC-SLP', 'AuD',
  'RD', 'RDN', 'LD', 'CDN',
  'FACP', 'FACS', 'FACOG', 'FAAP', 'FAAN',
  'MBA', 'MPH', 'MS', 'MA', 'MSW', 'MEd',
]);

/**
 * Clean provider name by removing license numbers and keeping only valid credentials
 * Examples:
 * - "Mani Mullen, Crc # 00002984" → "Mani Mullen, CRC"
 * - "John Smith, Nys 007110" → "John Smith"
 * - "Jane Doe, Casac 02/04/2010" → "Jane Doe, CASAC"
 */
function cleanProviderName(name: string): string {
  if (!name) return name;

  // Split by comma to separate name from credentials
  const parts = name.split(',').map(p => p.trim());
  if (parts.length < 2) return name;

  const namePart: string = parts[0] || name;
  const credentialsPart = parts.slice(1).join(', ');

  // Extract valid credentials from the credentials part
  // Remove patterns like "# 00002984", "007110", "02/04/2010", "Nys", etc.
  const tokens = credentialsPart.split(/[\s,]+/);
  const validCreds: string[] = [];

  for (const token of tokens) {
    // Skip empty tokens
    if (!token) continue;

    // Skip tokens that are just numbers or dates
    if (/^\d+$/.test(token)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(token)) continue;

    // Skip tokens starting with # or containing mostly numbers
    if (token.startsWith('#')) continue;
    if (/^\d+[A-Za-z]*$/.test(token) || /^[A-Za-z]*\d+$/.test(token)) continue;

    // Skip state abbreviations used as license prefixes (Nys, Ny, etc.)
    if (/^(Nys|Ny|Ca|Tx|Fl|Il|Pa|Oh|Ga|Nc|Nj|Mi|Va|Wa|Az|Ma|In|Tn|Mo|Md|Wi|Co|Mn|Sc|Al|La|Ky|Or|Ok|Ct|Ut|Ia|Nv|Ar|Ms|Ks|Nm|Ne|Wv|Id|Hi|Nh|Me|Mt|Ri|De|Sd|Nd|Ak|Dc|Wy|Vt|Pr)$/i.test(token)) continue;

    // Check if it's a valid credential (case-insensitive)
    const upperToken = token.toUpperCase().replace(/[^A-Z-]/g, '');
    if (VALID_CREDENTIALS.has(upperToken)) {
      validCreds.push(upperToken);
    }
  }

  // Return cleaned name
  if (validCreds.length > 0) {
    return `${namePart}, ${validCreds.join(', ')}`;
  }
  return namePart;
}

/**
 * Clean organization name - handle truncation gracefully
 */
function cleanOrganizationName(name: string): string {
  if (!name) return name;

  // If name ends with '&' or other incomplete patterns, it was likely truncated
  const trimmed = name.trim();
  if (trimmed.endsWith('&') || trimmed.endsWith('And') || trimmed.endsWith(',')) {
    // Remove the trailing incomplete word
    return trimmed.slice(0, -1).trim();
  }
  return trimmed;
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
function getConfidenceColor(score: number): { bg: string; bar: string; text: string; border: string; ring: string } {
  if (score >= 70) {
    return {
      bg: 'bg-green-50 dark:bg-green-900/30',
      bar: 'bg-green-500',
      text: 'text-green-700 dark:text-green-300 font-extrabold',
      border: 'border-green-300 dark:border-green-700',
      ring: 'ring-1 ring-green-200 dark:ring-green-800/50',
    };
  }
  if (score >= 50) {
    return {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      bar: 'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-800',
      ring: '',
    };
  }
  return {
    bg: 'bg-stone-50 dark:bg-gray-700/40',
    bar: 'bg-stone-400 dark:bg-gray-500',
    text: 'text-stone-500 dark:text-gray-400',
    border: 'border-stone-200 dark:border-gray-600',
    ring: '',
  };
}

/**
 * Memoized provider card for search results
 */
function ProviderCardComponent({
  provider,
  showConfidence = true,
  index = 0,
}: ProviderCardProps) {
  const router = useRouter();

  // Allow Space key to activate the card link (links only respond to Enter natively)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault();
      router.push(`/provider/${provider.npi}`);
    }
  }, [router, provider.npi]);
  // Get confidence and plan data from provider object
  const confidenceScore = provider.confidenceScore ?? null;
  const planAcceptances = provider.planAcceptances ?? [];

  // Clean and format the display name
  const displayName = useMemo(() => {
    if (provider.entityType === 'ORGANIZATION' && provider.organizationName) {
      return toDisplayCase(cleanOrganizationName(provider.organizationName));
    }
    return toDisplayCase(cleanProviderName(provider.displayName));
  }, [provider.entityType, provider.organizationName, provider.displayName]);

  // Memoize computed specialty
  const specialty = useMemo(
    () => getSpecialtyDisplay(provider.specialtyCategory, provider.taxonomyDescription),
    [provider.specialtyCategory, provider.taxonomyDescription]
  );

  // Get initials for avatar
  const initials = useMemo(() => getInitials(provider), [provider]);

  // Format address - handle missing zip gracefully
  const formattedAddress = useMemo(() => {
    const city = toTitleCase(provider.city);
    const cityState = `${city}, ${provider.state}`;
    const zipPart = provider.zip && provider.zip !== 'undefined' ? ` ${provider.zip}` : '';
    const street = toAddressCase(provider.addressLine1) + (provider.addressLine2 ? `, ${toAddressCase(provider.addressLine2)}` : '');
    return {
      street,
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
    <Link
      href={`/provider/${provider.npi}`}
      onKeyDown={handleKeyDown}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
    >
      <article
        className="bg-white dark:bg-gray-800 rounded-xl border border-stone-200 dark:border-gray-700 p-4 sm:p-5 hover:-translate-y-0.5 hover:shadow-lg hover:border-stone-300 dark:hover:border-gray-600 transition-all duration-150 cursor-pointer animate-fade-up"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="flex gap-3 sm:gap-4">
          {/* Avatar - smaller on mobile */}
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#137fec] to-[#0d5bb5] flex items-center justify-center">
              <span className="text-white font-bold text-base sm:text-lg">{initials}</span>
            </div>
            {isVerified && (
              <div className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 fill-green-500" aria-hidden="true" />
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Top row: Name and Confidence */}
            <div className="flex items-start justify-between gap-2 sm:gap-4 mb-1">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <h3 className="text-lg sm:text-xl font-bold text-stone-800 dark:text-white line-clamp-2" title={displayName}>
                  {displayName}
                </h3>
                {isVerified && (
                  <BadgeCheck className="w-5 h-5 text-[#137fec] flex-shrink-0 mt-0.5" aria-hidden="true" />
                )}
              </div>

              {/* Confidence Score - compact on mobile */}
              {hasConfidence && confidenceColors && (
                <div
                  className={`flex-shrink-0 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg ${confidenceColors.bg} border ${confidenceColors.border} ${confidenceColors.ring}`}
                  aria-label={`Confidence score: ${confidenceScore} out of 100, ${confidenceScore! >= 70 ? 'high' : confidenceScore! >= 50 ? 'medium' : 'low'} confidence`}
                  role="img"
                >
                  <div className={`text-xs ${confidenceColors.text} text-center`} aria-hidden="true">
                    {confidenceScore}%
                  </div>
                  <div className="hidden sm:block w-20 h-1.5 bg-stone-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
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
            <div className="space-y-1 text-sm text-stone-600 dark:text-gray-300">
              <div className="flex items-start gap-2">
                <LocationIcon className="w-4 h-4 text-stone-400 dark:text-gray-500 mt-0.5 flex-shrink-0" aria-hidden={true} />
                <span>
                  {formattedAddress.street}, {formattedAddress.cityStateZip}
                </span>
              </div>

              {formattedPhone && (
                <div className="flex items-center gap-2">
                  <PhoneIcon className="w-4 h-4 text-stone-400 dark:text-gray-500 flex-shrink-0" aria-hidden={true} />
                  <span>{formattedPhone}</span>
                </div>
              )}
            </div>

            {/* NPI - hidden on mobile */}
            <p className="hidden sm:block text-xs text-stone-400 dark:text-gray-500 mt-2">
              NPI: {provider.npi}
            </p>
          </div>
        </div>

        {/* Insurance Preview Section */}
        <div className="mt-4 pt-4 border-t border-stone-100 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Insurance badges - vertical on mobile, horizontal on desktop */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 sm:flex-wrap">
              {acceptedPlans.length > 0 ? (
                <>
                  {acceptedPlans.map((plan, idx) => {
                    const fullName = plan.planName || plan.issuerName || 'Plan';
                    return (
                      <span
                        key={idx}
                        title={fullName}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-medium rounded-full border border-green-200 dark:border-green-700 max-w-[200px] sm:max-w-[150px]"
                      >
                        <CheckCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                        <span className="truncate">{fullName}</span>
                      </span>
                    );
                  })}
                  {remainingPlansCount > 0 && (
                    <span className="px-2 py-0.5 bg-stone-100 dark:bg-gray-700/60 text-stone-600 dark:text-gray-200 text-xs font-medium rounded-full border border-stone-200 dark:border-gray-500 w-fit">
                      +{remainingPlansCount} more
                    </span>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    No verifications yet
                  </span>
                  <span className="text-blue-500 hover:text-blue-400 font-medium">
                    Be the first to verify →
                  </span>
                </div>
              )}
            </div>

            {/* View Details - full width tap target on mobile */}
            <span className="flex items-center justify-center sm:justify-end gap-1 text-[#137fec] font-medium text-sm py-2 sm:py-0 bg-blue-50 sm:bg-transparent rounded-lg sm:rounded-none hover:gap-2 transition-all">
              View Details
              <ChevronRightIcon className="w-4 h-4" aria-hidden={true} />
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
  const displayName = useMemo(() => {
    if (provider.entityType === 'ORGANIZATION' && provider.organizationName) {
      return toDisplayCase(cleanOrganizationName(provider.organizationName));
    }
    return toDisplayCase(cleanProviderName(provider.displayName));
  }, [provider.entityType, provider.organizationName, provider.displayName]);

  return (
    <div className="flex items-center justify-between p-4 bg-stone-50 dark:bg-gray-800 rounded-lg">
      <div>
        <h4 className="font-medium text-stone-800 dark:text-white">{displayName}</h4>
        <p className="text-sm text-stone-600 dark:text-gray-400">
          {toTitleCase(provider.city)}, {provider.state}
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
