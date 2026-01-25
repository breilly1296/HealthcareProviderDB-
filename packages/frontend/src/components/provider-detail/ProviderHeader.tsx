import Link from 'next/link';
import { VerificationButton } from '@/components/VerificationButton';
import type { ProviderDisplay } from '@/types';

const SPECIALTY_LABELS: Record<string, string> = {
  ENDOCRINOLOGY: 'Endocrinology',
  RHEUMATOLOGY: 'Rheumatology',
  ORTHOPEDICS: 'Orthopedics',
  INTERNAL_MEDICINE: 'Internal Medicine',
  FAMILY_MEDICINE: 'Family Medicine',
  GERIATRICS: 'Geriatrics',
  OTHER: 'Other Specialty',
};

interface ProviderHeaderProps {
  provider: ProviderDisplay;
}

export function ProviderHeader({ provider }: ProviderHeaderProps) {
  const specialty = provider.specialtyCategory
    ? SPECIALTY_LABELS[provider.specialtyCategory] || provider.specialtyCategory
    : provider.taxonomyDescription || 'Healthcare Provider';

  return (
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
  );
}
