import Link from 'next/link';
import { VerificationButton } from '@/components/VerificationButton';
import type { ProviderDisplay } from '@/types';
import { DocumentIcon, LocationIcon, PhoneIcon } from '@/components/icons';

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
                <DocumentIcon className="w-3.5 h-3.5" />
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
              <LocationIcon className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 mt-0.5 flex-shrink-0" />
              <span>
                {provider.addressLine1}
                {provider.addressLine2 && <><br />{provider.addressLine2}</>}
                <br />
                {provider.city}, {provider.state} {provider.zip}
                <span className="text-xs ml-1 opacity-75">(opens in new tab)</span>
              </span>
            </a>
            {provider.phone && (
              <a
                href={`tel:${provider.phone}`}
                className="flex items-center gap-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                <PhoneIcon className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
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
