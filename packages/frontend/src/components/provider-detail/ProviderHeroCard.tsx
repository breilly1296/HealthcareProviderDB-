'use client';

import { MapPin, Phone, BadgeCheck } from 'lucide-react';
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
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  organizationName?: string | null;
}

interface ProviderHeroCardProps {
  provider: Provider;
  confidenceScore: number;
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

export function ProviderHeroCard({ provider, confidenceScore }: ProviderHeroCardProps) {
  const initials = getInitials(provider.displayName);
  const specialty = provider.specialty || provider.specialtyCategory || provider.taxonomyDescription || 'Healthcare Provider';
  const isVerified = confidenceScore >= 70;

  // Format location
  const location = provider.city && provider.state
    ? `${provider.city}, ${provider.state}${provider.zip ? ` ${provider.zip}` : ''}`
    : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
        {/* Left section: Avatar and Info */}
        <div className="flex items-start gap-4 flex-1">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#137fec] to-[#0d5bb5] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-2xl">{initials}</span>
          </div>

          {/* Provider Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
                {provider.displayName}
              </h1>
              {isVerified && (
                <BadgeCheck className="w-5 h-5 text-[#137fec] flex-shrink-0" />
              )}
            </div>

            <p className="text-[#137fec] font-medium mb-3">{specialty}</p>

            <div className="space-y-1.5 text-sm text-gray-600">
              {provider.organizationName && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span>{provider.organizationName}</span>
                </div>
              )}

              {location && (
                <div className="flex items-center gap-2">
                  <div className="w-4" />
                  <span>{location}</span>
                </div>
              )}

              {provider.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <a
                    href={`tel:${provider.phone}`}
                    className="hover:text-[#137fec] transition-colors"
                  >
                    {formatPhone(provider.phone)}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right section: Confidence Gauge */}
        <div className="flex justify-center md:justify-end">
          <ConfidenceGauge score={confidenceScore} size={140} />
        </div>
      </div>
    </div>
  );
}
