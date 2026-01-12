export interface ConfidenceFactors {
  dataSourceScore: number;      // 0-30
  recencyScore: number;         // 0-25
  verificationScore: number;    // 0-25
  agreementScore: number;       // 0-20
  [key: string]: number;        // Index signature for JSON compatibility
}

export interface ConfidenceInput {
  dataSource: string | null;
  lastVerifiedAt: Date | null;
  verificationCount: number;
  upvotes: number;
  downvotes: number;
  specialty?: string | null;     // Added for specialty-specific scoring
  taxonomyDescription?: string | null; // Added for specialty mapping
}

export interface ConfidenceResult {
  score: number;
  level: string;
  description: string;
  factors: ConfidenceFactors;
  metadata: {
    daysUntilStale: number;
    isStale: boolean;
    recommendReVerification: boolean;
    daysSinceVerification: number | null;
    freshnessThreshold: number;
    researchNote: string;
  };
}

// Research-based specialty categories for freshness thresholds
// Based on Query #4 findings (Ndumele et al. 2018, Health Affairs)
export enum SpecialtyFreshnessCategory {
  MENTAL_HEALTH = 'MENTAL_HEALTH',    // 30 days - 43% Medicaid acceptance, high churn
  PRIMARY_CARE = 'PRIMARY_CARE',      // 60 days - 12% annual turnover
  SPECIALIST = 'SPECIALIST',          // 60 days
  HOSPITAL_BASED = 'HOSPITAL_BASED',  // 90 days - more stable
  OTHER = 'OTHER',                    // 60 days default
}

// Specialty-specific freshness thresholds in days
// Based on research showing provider network churn rates
const VERIFICATION_FRESHNESS: Record<SpecialtyFreshnessCategory, number> = {
  [SpecialtyFreshnessCategory.MENTAL_HEALTH]: 30,  // High turnover, only 43% accept Medicaid
  [SpecialtyFreshnessCategory.PRIMARY_CARE]: 60,   // 12% annual turnover
  [SpecialtyFreshnessCategory.SPECIALIST]: 60,     // Similar to primary care
  [SpecialtyFreshnessCategory.HOSPITAL_BASED]: 90, // More stable positions
  [SpecialtyFreshnessCategory.OTHER]: 60,          // Default
};

// Research shows 3 verifications achieve expert-level accuracy (κ=0.58)
// Mortensen et al. (2015), JAMIA
const MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE = 3;

// Data source scores (max 30 points)
// Covers both DataSource and VerificationSource enum values
const DATA_SOURCE_SCORES: Record<string, number> = {
  // DataSource enum values
  CMS_NPPES: 30,
  CMS_PLAN_FINDER: 28,
  CARRIER_API: 26,
  USER_UPLOAD: 20,
  CROWDSOURCE: 10,
  // VerificationSource enum values (unique ones)
  CMS_DATA: 30,
  CARRIER_DATA: 28,
  PROVIDER_PORTAL: 25,
  PHONE_CALL: 22,
  AUTOMATED: 15,
};

/**
 * Map provider specialty to freshness category
 * Based on research showing different churn rates by specialty
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
 * Calculate confidence score based on multiple factors
 * Total score: 0-100
 *
 * Research-based implementation:
 * - Specialty-specific freshness thresholds (Ndumele et al. 2018)
 * - 3-verification minimum for high confidence (Mortensen et al. 2015)
 */
export function calculateConfidenceScore(input: ConfidenceInput): ConfidenceResult {
  const specialtyCategory = getSpecialtyFreshnessCategory(
    input.specialty,
    input.taxonomyDescription
  );
  const freshnessThreshold = VERIFICATION_FRESHNESS[specialtyCategory];

  // Calculate days since verification
  const daysSinceVerification = input.lastVerifiedAt
    ? Math.floor(
        (new Date().getTime() - input.lastVerifiedAt.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  const factors: ConfidenceFactors = {
    dataSourceScore: calculateDataSourceScore(input.dataSource),
    recencyScore: calculateRecencyScore(input.lastVerifiedAt, freshnessThreshold),
    verificationScore: calculateVerificationScore(input.verificationCount),
    agreementScore: calculateAgreementScore(input.upvotes, input.downvotes),
  };

  const score = Math.min(
    100,
    factors.dataSourceScore +
      factors.recencyScore +
      factors.verificationScore +
      factors.agreementScore
  );

  const roundedScore = Math.round(score * 100) / 100;
  const level = getConfidenceLevel(roundedScore, input.verificationCount);
  const description = getConfidenceLevelDescription(level, input.verificationCount);

  // Calculate metadata
  const isStale = daysSinceVerification !== null && daysSinceVerification > freshnessThreshold;
  const daysUntilStale = daysSinceVerification !== null
    ? Math.max(0, freshnessThreshold - daysSinceVerification)
    : freshnessThreshold;
  const recommendReVerification =
    isStale || daysSinceVerification === null || daysSinceVerification > freshnessThreshold * 0.8;

  // Research note based on specialty
  let researchNote: string;
  if (specialtyCategory === SpecialtyFreshnessCategory.MENTAL_HEALTH) {
    researchNote =
      'Mental health providers show high network turnover. Research shows only 43% accept Medicaid.';
  } else if (specialtyCategory === SpecialtyFreshnessCategory.PRIMARY_CARE) {
    researchNote = 'Based on research showing 12% annual provider turnover in primary care.';
  } else if (specialtyCategory === SpecialtyFreshnessCategory.HOSPITAL_BASED) {
    researchNote = 'Hospital-based providers typically have more stable network participation.';
  } else {
    researchNote =
      'Specialist network participation changes regularly. Research shows 12% annual turnover.';
  }

  if (input.verificationCount < MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE) {
    researchNote += ' Research shows 3 verifications achieve expert-level accuracy (κ=0.58).';
  }

  return {
    score: roundedScore,
    level,
    description,
    factors,
    metadata: {
      daysUntilStale,
      isStale,
      recommendReVerification,
      daysSinceVerification,
      freshnessThreshold,
      researchNote,
    },
  };
}

/**
 * Data source score (0-30 points)
 * Higher scores for more authoritative sources
 */
function calculateDataSourceScore(source: string | null): number {
  if (!source) return 10;
  return DATA_SOURCE_SCORES[source] ?? 10;
}

/**
 * Recency score (0-25 points)
 * Uses specialty-specific freshness thresholds based on research
 *
 * Research shows:
 * - Mental health: 30 days (high churn, 43% Medicaid acceptance)
 * - Primary care: 60 days (12% annual turnover)
 * - Hospital-based: 90 days (more stable)
 *
 * Decay strategy:
 * - Full points if < threshold (fresh data)
 * - Linear decay from threshold to 2x threshold (stale but usable)
 * - Zero points if > 2x threshold (too stale, needs re-verification)
 */
function calculateRecencyScore(
  lastVerifiedAt: Date | null,
  freshnessThreshold: number
): number {
  if (!lastVerifiedAt) return 0;

  const now = new Date();
  const daysSinceVerification = Math.floor(
    (now.getTime() - lastVerifiedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Full points if within threshold (fresh)
  if (daysSinceVerification <= freshnessThreshold) return 25;

  // Zero points if past 2x threshold (too stale)
  if (daysSinceVerification > freshnessThreshold * 2) return 0;

  // Linear decay between threshold and 2x threshold
  // Example: If threshold is 60 days
  //   - At 60 days: 25 points
  //   - At 90 days: 12.5 points
  //   - At 120 days: 0 points
  const daysIntoDecay = daysSinceVerification - freshnessThreshold;
  const decayRange = freshnessThreshold; // threshold to 2x threshold range
  const decayRatio = 1 - (daysIntoDecay / decayRange);

  return Math.round(25 * decayRatio);
}

/**
 * Verification count score (0-25 points)
 * Research-based: 3 verifications achieve expert-level accuracy
 *
 * Based on Mortensen et al. (2015), JAMIA:
 * - Crowdsourced verification achieves κ=0.58 (expert-level)
 * - 3 verifications is optimal balance
 */
function calculateVerificationScore(verificationCount: number): number {
  if (verificationCount === 0) return 0;
  if (verificationCount === 1) return 8;  // Low confidence
  if (verificationCount === 2) return 12; // Still below optimal
  if (verificationCount === 3) return 20; // Optimal - research shows expert-level accuracy
  if (verificationCount <= 5) return 23;  // Above optimal
  return 25; // 6+ verifications - very high confidence
}

/**
 * Agreement score (0-20 points)
 * Based on upvote/downvote ratio from crowdsource verifications
 */
function calculateAgreementScore(upvotes: number, downvotes: number): number {
  const totalVotes = upvotes + downvotes;

  if (totalVotes === 0) return 0;

  const ratio = upvotes / totalVotes;

  // Require minimum votes for full score
  const engagementMultiplier = Math.min(1, totalVotes / 5);

  // Score based on ratio
  let baseScore: number;
  if (ratio >= 0.9) baseScore = 20;
  else if (ratio >= 0.8) baseScore = 16;
  else if (ratio >= 0.7) baseScore = 12;
  else if (ratio >= 0.6) baseScore = 8;
  else if (ratio >= 0.5) baseScore = 4;
  else baseScore = 0;

  return Math.round(baseScore * engagementMultiplier);
}

/**
 * Get confidence level label
 * Research-based: < 3 verifications = LOW confidence
 */
export function getConfidenceLevel(score: number, verificationCount: number): string {
  // Research shows 3 verifications achieve expert-level accuracy
  // Force LOW confidence if below threshold, regardless of score
  if (verificationCount < MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE && verificationCount > 0) {
    // Only allow MEDIUM at best with < 3 verifications
    if (score >= 76) return 'MEDIUM';
    if (score >= 51) return 'MEDIUM';
    if (score >= 26) return 'LOW';
    return 'VERY_LOW';
  }

  // Standard scoring with sufficient verifications
  if (score >= 91) return 'VERY_HIGH';
  if (score >= 76) return 'HIGH';
  if (score >= 51) return 'MEDIUM';
  if (score >= 26) return 'LOW';
  return 'VERY_LOW';
}

/**
 * Get confidence level description
 * Includes research-based notes about verification count
 */
export function getConfidenceLevelDescription(level: string, verificationCount: number): string {
  const basedOnResearch =
    verificationCount < MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE
      ? ' Research shows 3 verifications achieve expert-level accuracy.'
      : '';

  switch (level) {
    case 'VERY_HIGH':
      return 'Verified through multiple authoritative sources with expert-level accuracy.' + basedOnResearch;
    case 'HIGH':
      return 'Verified through authoritative sources or multiple community verifications.' + basedOnResearch;
    case 'MEDIUM':
      return 'Some verification exists, but may need confirmation.' + basedOnResearch;
    case 'LOW':
      return 'Limited verification data. Call provider to confirm before visiting.' + basedOnResearch;
    case 'VERY_LOW':
      return 'Unverified or potentially inaccurate. Always call to confirm.' + basedOnResearch;
    default:
      return 'Unknown confidence level';
  }
}
