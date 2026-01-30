'use client';

import { MapPin, Phone, BadgeCheck, Navigation } from 'lucide-react';
import { ConfidenceGauge } from './ConfidenceGauge';

interface Provider {
  npi: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  specialty?: string | null;
  specialtyCategory?: string | null;
  taxonomyDescription?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  organizationName?: string | null;
  entityType?: string | null;
}

interface ProviderHeroCardProps {
  provider: Provider;
  confidenceScore: number;
  verificationCount?: number;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(n => !['Dr.', 'MD', 'DO', 'PhD', 'NP', 'PA', 'Jr.', 'Sr.', 'II', 'III'].includes(n))
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'DR';
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

function getGoogleMapsUrl(provider: Provider): string {
  const parts = [
    provider.addressLine1,
    provider.addressLine2,
    provider.city,
    provider.state,
    provider.zip
  ].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`;
}

export function ProviderHeroCard({ provider, confidenceScore, verificationCount = 0 }: ProviderHeroCardProps) {
  const initials = getInitials(provider.displayName);
  const specialty = provider.specialty || provider.specialtyCategory || provider.taxonomyDescription || 'Healthcare Provider';
  const isVerified = confidenceScore >= 70;

  // Build full address
  const streetAddress = [provider.addressLine1, provider.addressLine2].filter(Boolean).join(', ');
  const cityStateZip = [
    provider.city,
    provider.state ? `${provider.state}${provider.zip ? ` ${provider.zip}` : ''}` : null
  ].filter(Boolean).join(', ');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700 p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-8">
        {/* Left section: Avatar and Info */}
        <div className="flex items-start gap-4 flex-1">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#137fec] to-[#0d5bb5] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-2xl">{initials}</span>
          </div>

          {/* Provider Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl md:text-2xl font-bold text-stone-800 dark:text-white truncate">
                {provider.displayName}
              </h1>
              {isVerified && (
                <BadgeCheck className="w-5 h-5 text-[#137fec] flex-shrink-0" />
              )}
            </div>

            <p className="text-[#137fec] font-medium mb-3">{specialty}</p>

            {/* Organization name if different */}
            {provider.organizationName && provider.entityType !== 'ORGANIZATION' && (
              <p className="text-sm text-stone-600 dark:text-gray-400 mb-2">
                {provider.organizationName}
              </p>
            )}

            {/* Address */}
            <div className="space-y-1 text-sm text-stone-600 dark:text-gray-300 mb-3">
              {streetAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-stone-400 dark:text-gray-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p>{streetAddress}</p>
                    {cityStateZip && <p>{cityStateZip}</p>}
                  </div>
                </div>
              )}
            </div>

            {/* Phone and Actions */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {provider.phone && (
                <a
                  href={`tel:${provider.phone}`}
                  className="inline-flex items-center gap-2 text-stone-600 dark:text-gray-300 hover:text-[#137fec] dark:hover:text-[#137fec] transition-colors"
                >
                  <Phone className="w-4 h-4 text-stone-400 dark:text-gray-500" />
                  <span className="font-medium">{formatPhone(provider.phone)}</span>
                </a>
              )}

              {(streetAddress || cityStateZip) && (
                <a
                  href={getGoogleMapsUrl(provider)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[#137fec] hover:text-[#0d6edb] font-medium transition-colors"
                >
                  <Navigation className="w-4 h-4" />
                  Get Directions
                </a>
              )}
            </div>

            {/* NPI - subtle below */}
            <p className="text-xs text-stone-400 dark:text-gray-500 mt-3">
              NPI: {provider.npi}
            </p>
          </div>
        </div>

        {/* Right section: Confidence Gauge */}
        <div className="flex justify-center md:justify-end">
          <ConfidenceGauge
            score={confidenceScore}
            size={140}
            verificationCount={verificationCount}
          />
        </div>
      </div>
    </div>
  );
}
