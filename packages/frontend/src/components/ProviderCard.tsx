'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import type { ProviderDisplay } from '@/types';
import { ConfidenceBadge, ConfidenceIndicator } from './ConfidenceBadge';
import FreshnessWarning from './FreshnessWarning';
import { getSpecialtyDisplay } from '@/lib/provider-utils';
import { CompareCheckbox } from './compare';
import { useCompare, CompareProvider } from '@/hooks/useCompare';
import { LocationIcon, PhoneIcon, ChevronRightIcon } from '@/components/icons';

interface ProviderCardProps {
  provider: ProviderDisplay;
  confidenceScore?: number;
  showConfidence?: boolean;
  lastVerifiedAt?: Date | null;
  planId?: string;
  planName?: string;
}

/**
 * Memoized to prevent re-renders when parent list updates but this provider hasn't changed.
 * Uses custom comparison to check only relevant props for equality.
 */
function ProviderCardComponent({
  provider,
  confidenceScore,
  showConfidence = false,
  lastVerifiedAt,
  planId,
  planName,
}: ProviderCardProps) {
  const { isSelected } = useCompare();
  const selected = isSelected(provider.npi);

  // Memoize computed specialty to avoid recalculating on every render
  const specialty = useMemo(
    () => getSpecialtyDisplay(provider.specialtyCategory, provider.taxonomyDescription),
    [provider.specialtyCategory, provider.taxonomyDescription]
  );

  // Memoize the CompareProvider object to maintain referential equality
  const compareProvider: CompareProvider = useMemo(
    () => ({
      npi: provider.npi,
      name: provider.displayName,
      specialty: specialty,
      healthSystem: provider.organizationName || null,
      address: provider.addressLine1 + (provider.addressLine2 ? ` ${provider.addressLine2}` : ''),
      city: provider.city,
      state: provider.state,
      zip: provider.zip,
      confidenceScore: confidenceScore,
      phone: provider.phone || null,
    }),
    [
      provider.npi,
      provider.displayName,
      specialty,
      provider.organizationName,
      provider.addressLine1,
      provider.addressLine2,
      provider.city,
      provider.state,
      provider.zip,
      confidenceScore,
      provider.phone,
    ]
  );

  // Memoize the Google Maps URL to avoid recalculating on every render
  const mapsUrl = useMemo(
    () => {
      const address = `${provider.addressLine1}${provider.addressLine2 ? ' ' + provider.addressLine2 : ''}, ${provider.city}, ${provider.state} ${provider.zip}`;
      return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    },
    [provider.addressLine1, provider.addressLine2, provider.city, provider.state, provider.zip]
  );

  // Memoize the formatted address for display
  const formattedAddress = useMemo(
    () => ({
      line1: provider.addressLine1,
      line2: provider.addressLine2 ? `, ${provider.addressLine2}` : '',
      cityStateZip: `${provider.city}, ${provider.state} ${provider.zip}`,
    }),
    [provider.addressLine1, provider.addressLine2, provider.city, provider.state, provider.zip]
  );

  return (
    <Link href={`/provider/${provider.npi}`}>
      <article className={`card-hover cursor-pointer transition-all duration-200 ${
        selected ? 'ring-2 ring-primary-500 dark:ring-primary-400' : ''
      }`}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Provider Info */}
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
              {provider.displayName}
            </h3>
            <p className="text-primary-600 dark:text-primary-400 font-medium mb-2">
              {specialty}
            </p>
            <div className="text-gray-600 dark:text-gray-300 space-y-1 text-sm sm:text-base">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <LocationIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                <span>
                  {formattedAddress.line1}
                  {formattedAddress.line2}
                  <br />
                  {formattedAddress.cityStateZip}
                </span>
              </a>
              {provider.phone && (
                <a
                  href={`tel:${provider.phone}`}
                  className="flex items-center gap-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PhoneIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <span>{provider.phone}</span>
                </a>
              )}
            </div>
          </div>

          {/* Confidence, Compare & NPI */}
          <div className="flex flex-col items-end gap-2">
            <CompareCheckbox provider={compareProvider} />
            {showConfidence && confidenceScore !== undefined && (
              <ConfidenceBadge score={confidenceScore} size="sm" />
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              NPI: {provider.npi}
            </span>
          </div>
        </div>

        {/* Freshness Warning - Compact Card Variant */}
        {lastVerifiedAt !== undefined && (
          <div className="mt-4">
            <FreshnessWarning
              lastVerifiedAt={lastVerifiedAt}
              specialty={provider.specialtyCategory}
              taxonomyDescription={provider.taxonomyDescription}
              providerNpi={provider.npi}
              providerName={provider.displayName}
              planId={planId}
              planName={planName}
              variant="card"
              showVerifyButton={true}
            />
          </div>
        )}

        {/* View Details Link */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
          <span className="text-primary-600 dark:text-primary-400 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
            View Details
            <ChevronRightIcon className="w-4 h-4" />
          </span>
        </div>
      </article>
    </Link>
  );
}

// Custom comparison function for memo - only re-render if relevant data changes
function arePropsEqual(prevProps: ProviderCardProps, nextProps: ProviderCardProps): boolean {
  // Compare provider by NPI (primary identifier) and key display fields
  if (prevProps.provider.npi !== nextProps.provider.npi) return false;
  if (prevProps.provider.displayName !== nextProps.provider.displayName) return false;
  if (prevProps.provider.phone !== nextProps.provider.phone) return false;
  if (prevProps.provider.addressLine1 !== nextProps.provider.addressLine1) return false;
  if (prevProps.provider.city !== nextProps.provider.city) return false;
  if (prevProps.provider.state !== nextProps.provider.state) return false;

  // Compare other props
  if (prevProps.confidenceScore !== nextProps.confidenceScore) return false;
  if (prevProps.showConfidence !== nextProps.showConfidence) return false;
  if (prevProps.planId !== nextProps.planId) return false;
  if (prevProps.planName !== nextProps.planName) return false;

  // Compare lastVerifiedAt (handle Date comparison)
  const prevDate = prevProps.lastVerifiedAt?.getTime?.() ?? prevProps.lastVerifiedAt;
  const nextDate = nextProps.lastVerifiedAt?.getTime?.() ?? nextProps.lastVerifiedAt;
  if (prevDate !== nextDate) return false;

  return true;
}

export const ProviderCard = memo(ProviderCardComponent, arePropsEqual);

/**
 * Compact version for listing in provider detail.
 * Memoized to prevent unnecessary re-renders in lists.
 */
function ProviderCardCompactComponent({
  provider,
}: {
  provider: ProviderDisplay;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div>
        <h4 className="font-medium text-gray-900 dark:text-white">{provider.displayName}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {provider.city}, {provider.state}
        </p>
      </div>
      <Link
        href={`/provider/${provider.npi}`}
        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium text-sm"
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
