'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, AlertTriangle, Info } from 'lucide-react';

/**
 * Freshness Warning Component
 *
 * Based on research from Ndumele et al. (2018), Health Affairs:
 * - Mental health providers: 30-day re-verification threshold (43% Medicaid acceptance, high churn)
 * - Primary care: 60-day threshold (12% annual turnover)
 * - Specialists: 60-day threshold
 * - Hospital-based: 90-day threshold (more stable)
 */

export enum SpecialtyFreshnessCategory {
  MENTAL_HEALTH = 'MENTAL_HEALTH',
  PRIMARY_CARE = 'PRIMARY_CARE',
  SPECIALIST = 'SPECIALIST',
  HOSPITAL_BASED = 'HOSPITAL_BASED',
  OTHER = 'OTHER',
}

// Specialty-specific freshness thresholds (in days)
const VERIFICATION_FRESHNESS: Record<SpecialtyFreshnessCategory, number> = {
  [SpecialtyFreshnessCategory.MENTAL_HEALTH]: 30,
  [SpecialtyFreshnessCategory.PRIMARY_CARE]: 60,
  [SpecialtyFreshnessCategory.SPECIALIST]: 60,
  [SpecialtyFreshnessCategory.HOSPITAL_BASED]: 90,
  [SpecialtyFreshnessCategory.OTHER]: 60,
};

type WarningLevel = 'GREEN' | 'YELLOW' | 'RED' | 'NONE';

interface FreshnessWarningProps {
  lastVerifiedAt: Date | null;
  specialty?: string | null;
  taxonomyDescription?: string | null;
  providerNpi: string;
  providerName: string;
  planId?: string;
  planName?: string;
  variant?: 'card' | 'detail'; // card = compact, detail = prominent
  showVerifyButton?: boolean;
  className?: string;
}

/**
 * Map provider specialty to freshness category
 */
function getSpecialtyFreshnessCategory(
  specialty?: string | null,
  taxonomyDescription?: string | null
): SpecialtyFreshnessCategory {
  const searchText = `${specialty || ''} ${taxonomyDescription || ''}`.toLowerCase();

  // Mental health specialties - highest churn
  if (
    searchText.includes('psychiatr') ||
    searchText.includes('psycholog') ||
    searchText.includes('mental health') ||
    searchText.includes('behavioral health') ||
    searchText.includes('counselor') ||
    searchText.includes('therapist')
  ) {
    return SpecialtyFreshnessCategory.MENTAL_HEALTH;
  }

  // Primary care - 12% annual turnover
  if (
    searchText.includes('family medicine') ||
    searchText.includes('family practice') ||
    searchText.includes('internal medicine') ||
    searchText.includes('general practice') ||
    searchText.includes('primary care')
  ) {
    return SpecialtyFreshnessCategory.PRIMARY_CARE;
  }

  // Hospital-based - more stable
  if (
    searchText.includes('hospital') ||
    searchText.includes('radiology') ||
    searchText.includes('anesthesiology') ||
    searchText.includes('pathology') ||
    searchText.includes('emergency medicine')
  ) {
    return SpecialtyFreshnessCategory.HOSPITAL_BASED;
  }

  // All other specialists
  return SpecialtyFreshnessCategory.SPECIALIST;
}

/**
 * Calculate warning level based on days since verification and specialty threshold
 */
function calculateWarningLevel(
  daysSinceVerification: number | null,
  threshold: number
): WarningLevel {
  if (daysSinceVerification === null) return 'RED';
  if (daysSinceVerification <= threshold) return 'GREEN';
  if (daysSinceVerification <= threshold * 2) return 'YELLOW';
  return 'RED';
}

/**
 * Get research-based explanation for specialty
 */
function getResearchExplanation(category: SpecialtyFreshnessCategory): string {
  switch (category) {
    case SpecialtyFreshnessCategory.MENTAL_HEALTH:
      return 'Research shows mental health providers change insurance networks more frequently, with only 43% accepting Medicaid. (Ndumele et al. 2018)';
    case SpecialtyFreshnessCategory.PRIMARY_CARE:
      return 'Research shows primary care providers have 12% annual turnover in insurance networks. (Ndumele et al. 2018)';
    case SpecialtyFreshnessCategory.HOSPITAL_BASED:
      return 'Hospital-based providers typically have more stable network participation than other specialties.';
    default:
      return 'Research shows providers change insurance networks at approximately 12% annually. (Ndumele et al. 2018)';
  }
}

export default function FreshnessWarning({
  lastVerifiedAt,
  specialty,
  taxonomyDescription,
  providerNpi,
  providerName,
  planId,
  planName,
  variant = 'card',
  showVerifyButton = true,
  className = '',
}: FreshnessWarningProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const specialtyCategory = getSpecialtyFreshnessCategory(specialty, taxonomyDescription);
  const threshold = VERIFICATION_FRESHNESS[specialtyCategory];

  const daysSinceVerification = lastVerifiedAt
    ? Math.floor((new Date().getTime() - lastVerifiedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const warningLevel = calculateWarningLevel(daysSinceVerification, threshold);

  // Don't show anything for GREEN in card variant (to avoid clutter)
  if (warningLevel === 'GREEN' && variant === 'card') {
    return (
      <aside role="status" className={`flex items-center gap-1 text-sm text-green-600 ${className}`}>
        <Check className="w-4 h-4" aria-hidden="true" />
        <span>Recently verified</span>
      </aside>
    );
  }

  if (warningLevel === 'NONE') return null;

  const researchExplanation = getResearchExplanation(specialtyCategory);

  // Build verification URL with pre-filled params
  const verifyUrl = `/verify?npi=${providerNpi}&name=${encodeURIComponent(providerName)}${
    planId ? `&planId=${planId}` : ''
  }${planName ? `&planName=${encodeURIComponent(planName)}` : ''}`;

  // Card variant (compact)
  if (variant === 'card') {
    if (warningLevel === 'YELLOW') {
      return (
        <aside role="status" className={`flex items-start gap-2 ${className}`}>
          <div className="flex-1">
            <div className="flex items-center gap-1 text-sm text-yellow-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="font-medium">Last verified {daysSinceVerification} days ago</span>
              {/* Tooltip */}
              <div className="relative inline-block">
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onFocus={() => setShowTooltip(true)}
                  onBlur={() => setShowTooltip(false)}
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="text-yellow-600 hover:text-yellow-700 focus-visible:ring-2 focus-visible:ring-yellow-500 rounded"
                  aria-label="More information about verification freshness"
                >
                  <Info className="w-4 h-4" aria-hidden="true" />
                </button>
                {showTooltip && (
                  <div className="absolute z-10 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg -top-2 left-6">
                    {researchExplanation}
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              Research shows providers change networks frequently.
            </p>
          </div>
          {showVerifyButton && (
            <Link
              href={verifyUrl}
              className="text-xs font-medium text-yellow-700 hover:text-yellow-800 whitespace-nowrap"
            >
              Verify Now →
            </Link>
          )}
        </aside>
      );
    }

    if (warningLevel === 'RED') {
      return (
        <aside role="status" className={`flex items-start gap-2 ${className}`}>
          <div className="flex-1">
            <div className="flex items-center gap-1 text-sm text-red-700 font-medium">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>
                {daysSinceVerification !== null
                  ? `Not verified in ${daysSinceVerification} days`
                  : 'Not verified'}
              </span>
              {/* Tooltip */}
              <div className="relative inline-block">
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onFocus={() => setShowTooltip(true)}
                  onBlur={() => setShowTooltip(false)}
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="text-red-600 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-500 rounded"
                  aria-label="More information about verification freshness"
                >
                  <Info className="w-4 h-4" aria-hidden="true" />
                </button>
                {showTooltip && (
                  <div className="absolute z-10 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg -top-2 left-6">
                    {researchExplanation}
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              Research shows 12% annual turnover. Please re-verify.
            </p>
          </div>
          {showVerifyButton && (
            <Link
              href={verifyUrl}
              className="text-xs font-medium text-red-700 hover:text-red-800 whitespace-nowrap"
            >
              Verify Now →
            </Link>
          )}
        </aside>
      );
    }
  }

  // Detail variant (prominent)
  if (variant === 'detail') {
    if (warningLevel === 'GREEN') {
      return (
        <aside role="status" className={`bg-green-50 border border-green-200 rounded-lg p-4 ${className}`}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Check className="w-6 h-6 text-green-600" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-green-900 mb-1">Recently Verified</p>
              <p className="text-sm text-green-800 mb-2">
                Last verified <strong>{daysSinceVerification} days ago</strong> (within {threshold}-day recommendation)
              </p>
              <p className="text-xs text-green-700">
                {researchExplanation}
              </p>
            </div>
          </div>
        </aside>
      );
    }

    if (warningLevel === 'YELLOW') {
      return (
        <aside role="status" className={`bg-yellow-50 border border-yellow-200 rounded-lg p-4 ${className}`}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-yellow-600" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-yellow-900 mb-1">Verification Needed</p>
              <p className="text-sm text-yellow-800 mb-2">
                Last verified <strong>{daysSinceVerification} days ago</strong>. Research shows providers change
                networks frequently.
              </p>
              <p className="text-xs text-yellow-700 mb-3">
                {researchExplanation}
              </p>
              {showVerifyButton && (
                <Link href={verifyUrl} className="btn-outline text-sm">
                  Verify This Provider Now
                </Link>
              )}
            </div>
          </div>
        </aside>
      );
    }

    if (warningLevel === 'RED') {
      return (
        <aside role="status" className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-900 mb-1">Stale Verification - Re-verify Needed</p>
              <p className="text-sm text-red-800 mb-2">
                {daysSinceVerification !== null ? (
                  <>
                    Not verified in <strong>{daysSinceVerification} days</strong>. Research shows 12% annual provider
                    turnover in insurance networks.
                  </>
                ) : (
                  <>No verification on record. Research shows 12% annual provider turnover in insurance networks.</>
                )}
              </p>
              <p className="text-xs text-red-700 mb-3">
                {researchExplanation}
              </p>
              {showVerifyButton && (
                <Link href={verifyUrl} className="btn-primary text-sm">
                  Verify This Provider Now
                </Link>
              )}
            </div>
          </div>
        </aside>
      );
    }
  }

  return null;
}
