'use client';

import { useState, useCallback, useMemo } from 'react';
import { MapPin, Phone, BadgeCheck, Navigation, Share2, Printer, Check } from 'lucide-react';
import { ConfidenceGauge } from './ConfidenceGauge';
import { toDisplayCase, toAddressCase, toTitleCase } from '@/lib/formatName';

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

interface ConfidenceBreakdown {
  score: number;
  level: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
  factors: {
    dataSourceScore: number;
    recencyScore: number;
    verificationScore: number;
    agreementScore: number;
  };
  metadata?: {
    researchNote?: string;
    isStale?: boolean;
    daysSinceVerification?: number | null;
    daysUntilStale?: number;
    freshnessThreshold?: number;
    recommendReVerification?: boolean;
    explanation?: string;
  };
}

interface ProviderHeroCardProps {
  provider: Provider;
  confidenceScore: number;
  verificationCount?: number;
  nppesLastSynced?: string | null;
  confidenceBreakdown?: ConfidenceBreakdown;
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

interface ConfidenceHighlight {
  label: string;
  strength: 'strong' | 'moderate';
  /** Normalized score 0–1 used for sorting */
  rank: number;
}

const FACTOR_MAX = { dataSource: 25, recency: 30, verification: 25, agreement: 20 } as const;

function getConfidenceHighlights(
  factors: ConfidenceBreakdown['factors'],
  verificationCount: number,
  metadata?: ConfidenceBreakdown['metadata'],
): ConfidenceHighlight[] {
  const highlights: ConfidenceHighlight[] = [];

  // Data source
  const dsRatio = factors.dataSourceScore / FACTOR_MAX.dataSource;
  if (factors.dataSourceScore > 0) {
    highlights.push({
      label: dsRatio >= 0.7 ? 'NPI active' : 'NPI on file',
      strength: dsRatio >= 0.7 ? 'strong' : 'moderate',
      rank: dsRatio,
    });
  }

  // Recency
  const recRatio = factors.recencyScore / FACTOR_MAX.recency;
  if (factors.recencyScore > 0) {
    const days = metadata?.daysSinceVerification;
    let label: string;
    if (days != null && days <= 365) {
      label = days === 0 ? 'Updated today' : `Updated ${days}d ago`;
    } else {
      label = recRatio >= 0.7 ? 'Recently updated' : 'Has update history';
    }
    highlights.push({ label, strength: recRatio >= 0.6 ? 'strong' : 'moderate', rank: recRatio });
  }

  // Verifications
  const verRatio = factors.verificationScore / FACTOR_MAX.verification;
  if (factors.verificationScore > 0) {
    highlights.push({
      label: `${verificationCount} verification${verificationCount !== 1 ? 's' : ''}`,
      strength: verRatio >= 0.6 ? 'strong' : 'moderate',
      rank: verRatio,
    });
  }

  // Agreement
  const agrRatio = factors.agreementScore / FACTOR_MAX.agreement;
  if (factors.agreementScore > 0) {
    highlights.push({
      label: agrRatio >= 0.7 ? 'Sources agree' : 'Partial agreement',
      strength: agrRatio >= 0.7 ? 'strong' : 'moderate',
      rank: agrRatio,
    });
  }

  // Sort strongest first, take top 3
  return highlights.sort((a, b) => b.rank - a.rank).slice(0, 3);
}

export function ProviderHeroCard({ provider, confidenceScore, verificationCount = 0, nppesLastSynced, confidenceBreakdown }: ProviderHeroCardProps) {
  const initials = getInitials(provider.displayName);
  const specialty = provider.specialty || provider.specialtyCategory || provider.taxonomyDescription || 'Healthcare Provider';
  const isVerified = confidenceScore >= 70;
  const [copied, setCopied] = useState(false);

  // Build full address (title-cased from NPPES ALL-CAPS)
  const streetAddress = [toAddressCase(provider.addressLine1), toAddressCase(provider.addressLine2)].filter(Boolean).join(', ');
  const cityStateZip = [
    toTitleCase(provider.city),
    provider.state ? `${provider.state}${provider.zip ? ` ${provider.zip}` : ''}` : null
  ].filter(Boolean).join(', ');

  const highlights = useMemo(
    () => confidenceBreakdown?.factors
      ? getConfidenceHighlights(confidenceBreakdown.factors, verificationCount, confidenceBreakdown.metadata)
      : [],
    [confidenceBreakdown, verificationCount],
  );

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const title = `${toDisplayCase(provider.displayName)} - VerifyMyProvider`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled or share failed — ignore
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [provider.displayName]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700 p-4 sm:p-6 md:p-8 relative">
      {/* Share & Print buttons */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-1.5 print:hidden">
        <button
          type="button"
          onClick={handleShare}
          aria-label={copied ? 'Link copied' : 'Share provider'}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-stone-500 dark:text-gray-400 hover:bg-stone-100 dark:hover:bg-gray-700 hover:text-stone-700 dark:hover:text-gray-200 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" /> : <Share2 className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={handlePrint}
          aria-label="Print provider details"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-stone-500 dark:text-gray-400 hover:bg-stone-100 dark:hover:bg-gray-700 hover:text-stone-700 dark:hover:text-gray-200 transition-colors"
        >
          <Printer className="w-4 h-4" />
        </button>
      </div>

      {/* Toast notification for copy */}
      {copied && (
        <div className="absolute top-14 right-3 sm:right-4 bg-stone-800 dark:bg-gray-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg animate-fade-in print:hidden">
          Link copied!
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-8">
        {/* Left section: Avatar and Info */}
        <div className="flex items-start gap-3 sm:gap-4 flex-1">
          {/* Avatar - smaller on mobile */}
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-[#137fec] to-[#0d5bb5] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xl sm:text-2xl">{initials}</span>
          </div>

          {/* Provider Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1">
              <h1 className="text-xl md:text-2xl font-bold text-stone-800 dark:text-white">
                {toDisplayCase(provider.displayName)}
              </h1>
              {isVerified && (
                <>
                  <BadgeCheck className="w-5 h-5 text-[#137fec] flex-shrink-0 mt-1" aria-hidden="true" />
                  <span className="sr-only">Verified</span>
                </>
              )}
            </div>

            <p className="text-[#137fec] font-medium mb-3">{specialty}</p>

            {/* Organization name if different */}
            {provider.organizationName && provider.entityType !== 'ORGANIZATION' && (
              <p className="text-sm text-stone-600 dark:text-gray-400 mb-2">
                {toDisplayCase(provider.organizationName)}
              </p>
            )}

            {/* Address */}
            <div className="space-y-1 text-sm text-stone-600 dark:text-gray-300 mb-3">
              {streetAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-stone-400 dark:text-gray-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
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
                  <Phone className="w-4 h-4 text-stone-400 dark:text-gray-500" aria-hidden="true" />
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
                  <Navigation className="w-4 h-4" aria-hidden="true" />
                  Get Directions
                </a>
              )}
            </div>

            {/* NPI and NPPES sync - subtle below */}
            <div className="flex items-center gap-3 mt-3">
              <p className="text-xs text-stone-400 dark:text-gray-500">
                NPI: {provider.npi}
              </p>
              {nppesLastSynced ? (
                (() => {
                  const syncDate = new Date(nppesLastSynced);
                  const daysSince = Math.floor((Date.now() - syncDate.getTime()) / (1000 * 60 * 60 * 24));
                  const isStale = daysSince > 90;
                  return (
                    <span className={`inline-flex items-center gap-1 text-xs ${isStale ? 'text-yellow-500' : 'text-stone-400 dark:text-gray-500'}`}>
                      {isStale && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />}
                      CMS verified: {syncDate.toLocaleDateString()}
                    </span>
                  );
                })()
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-stone-400 dark:text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-300 dark:bg-gray-600" />
                  Not yet synced with CMS
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right section: Confidence Gauge + factor highlights */}
        <div className="flex flex-col items-center md:items-end gap-3">
          <ConfidenceGauge
            score={confidenceScore}
            size={140}
            verificationCount={verificationCount}
            confidenceBreakdown={confidenceBreakdown}
          />

          {/* Inline factor summary pills */}
          {highlights.length > 0 && (
            <div className="flex flex-wrap justify-center md:justify-end gap-1.5">
              {highlights.map((h) => (
                <span
                  key={h.label}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                    h.strength === 'strong'
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  }`}
                >
                  <span className={`w-1 h-1 rounded-full ${
                    h.strength === 'strong'
                      ? 'bg-green-500 dark:bg-green-400'
                      : 'bg-amber-500 dark:bg-amber-400'
                  }`} />
                  {h.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
