'use client';

import Link from 'next/link';
import { Provider } from '@/lib/api';
import { ConfidenceBadge, ConfidenceIndicator } from './ConfidenceBadge';

interface ProviderCardProps {
  provider: Provider & { displayName: string };
  confidenceScore?: number;
  showConfidence?: boolean;
}

export function ProviderCard({
  provider,
  confidenceScore,
  showConfidence = false,
}: ProviderCardProps) {
  const specialtyLabels: Record<string, string> = {
    ENDOCRINOLOGY: 'Endocrinology',
    RHEUMATOLOGY: 'Rheumatology',
    ORTHOPEDICS: 'Orthopedics',
    INTERNAL_MEDICINE: 'Internal Medicine',
    FAMILY_MEDICINE: 'Family Medicine',
    GERIATRICS: 'Geriatrics',
    OTHER: 'Other Specialty',
  };

  const specialty = provider.specialtyCategory
    ? specialtyLabels[provider.specialtyCategory] || provider.specialtyCategory
    : provider.taxonomyDescription || 'Healthcare Provider';

  return (
    <Link href={`/provider/${provider.npi}`}>
      <div className="card-hover cursor-pointer">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Provider Info */}
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900 mb-1">
              {provider.displayName}
            </h3>
            <p className="text-primary-600 font-medium mb-2">
              {specialty}
            </p>
            <div className="text-gray-600 space-y-1">
              <p className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>
                  {provider.addressLine1}
                  {provider.addressLine2 && `, ${provider.addressLine2}`}
                </span>
              </p>
              <p className="flex items-center gap-2 pl-6">
                {provider.city}, {provider.state} {provider.zip}
              </p>
              {provider.phone && (
                <p className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>{provider.phone}</span>
                </p>
              )}
            </div>
          </div>

          {/* Confidence & NPI */}
          <div className="flex flex-col items-end gap-2">
            {showConfidence && confidenceScore !== undefined && (
              <ConfidenceBadge score={confidenceScore} size="sm" />
            )}
            <span className="text-sm text-gray-500">
              NPI: {provider.npi}
            </span>
          </div>
        </div>

        {/* View Details Link */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
          <span className="text-primary-600 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
            View Details
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

// Compact version for listing in provider detail
export function ProviderCardCompact({
  provider,
}: {
  provider: Provider & { displayName: string };
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <div>
        <h4 className="font-medium text-gray-900">{provider.displayName}</h4>
        <p className="text-sm text-gray-600">
          {provider.city}, {provider.state}
        </p>
      </div>
      <Link
        href={`/provider/${provider.npi}`}
        className="text-primary-600 hover:text-primary-700 font-medium text-sm"
      >
        View →
      </Link>
    </div>
  );
}
