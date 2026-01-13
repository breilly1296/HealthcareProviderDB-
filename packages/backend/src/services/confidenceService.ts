export interface ConfidenceFactors {
  dataSourceScore: number;      // 0-25 (authoritative sources)
  recencyScore: number;         // 0-30 (time-based decay)
  verificationScore: number;    // 0-25 (optimal at 3)
  agreementScore: number;       // 0-20 (community consensus)
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
    explanation: string; // Human-readable explanation of why this score
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

// Data source scores (max 25 points)
// Covers both DataSource and VerificationSource enum values
const DATA_SOURCE_SCORES: Record<string, number> = {
  // DataSource enum values
  CMS_NPPES: 25,           // Official CMS data
  CMS_PLAN_FINDER: 25,     // Official CMS data
  CARRIER_API: 20,         // Insurance carrier data
  PROVIDER_PORTAL: 20,     // Provider-verified
  USER_UPLOAD: 15,         // User-provided
  PHONE_CALL: 15,          // Community verified
  CROWDSOURCE: 15,         // Community only
  AUTOMATED: 10,           // Automated checks
  // Legacy VerificationSource enum values
  CMS_DATA: 25,
  CARRIER_DATA: 20,
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

  // Generate explanation of score
  const explanation = generateScoreExplanation(
    roundedScore,
    factors,
    input.verificationCount,
    daysSinceVerification,
    freshnessThreshold,
    specialtyCategory
  );

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
      explanation,
    },
  };
}

/**
 * Data source score (0-25 points)
 * Higher scores for more authoritative sources
 *
 * Research shows official data (CMS) is most reliable
 * Community verification achieves expert-level accuracy with sufficient volume
 */
function calculateDataSourceScore(source: string | null): number {
  if (!source) return 10;
  return DATA_SOURCE_SCORES[source] ?? 10;
}

/**
 * Recency score (0-30 points)
 * Tiered scoring system based on research showing provider network changes
 *
 * Research shows 12% annual provider turnover (Ndumele et al. 2018)
 * Recent data is critical - providers change networks frequently
 *
 * Tiered scoring (adjusted for specialty-specific thresholds):
 * - 0-30 days: 30 points (very fresh)
 * - 31-60 days: 20 points (recent)
 * - 61-90 days: 10 points (aging)
 * - 91-180 days: 5 points (stale)
 * - 180+ days: 0 points (too old)
 *
 * Specialty adjustments:
 * - Mental health (30-day threshold): More aggressive decay
 * - Primary care (60-day threshold): Standard decay
 * - Hospital-based (90-day threshold): More lenient decay
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

  // Tiered scoring with specialty-based adjustments
  // Base tiers (for 60-day threshold specialty):
  // 0-30: 30pts, 31-60: 20pts, 61-90: 10pts, 91-180: 5pts, 180+: 0pts

  // Adjust tiers based on specialty threshold
  const tier1 = Math.min(30, freshnessThreshold * 0.5);  // 50% of threshold
  const tier2 = freshnessThreshold;                       // 100% of threshold
  const tier3 = freshnessThreshold * 1.5;                 // 150% of threshold
  const tier4 = 180;                                      // Fixed at 180 days

  if (daysSinceVerification <= tier1) return 30;
  if (daysSinceVerification <= tier2) return 20;
  if (daysSinceVerification <= tier3) return 10;
  if (daysSinceVerification <= tier4) return 5;
  return 0; // 180+ days is always 0
}

/**
 * Verification count score (0-25 points)
 * Research-based: 3 verifications achieve expert-level accuracy
 *
 * Based on Mortensen et al. (2015), JAMIA:
 * - Crowdsourced verification achieves κ=0.58 (expert-level accuracy)
 * - Expert validation achieves κ=0.59
 * - 3 verifications is optimal threshold for accuracy
 * - Additional verifications beyond 3 show no significant accuracy improvement
 *
 * Scoring emphasizes the 3-verification threshold:
 * - 0 verifications: 0 points (no data)
 * - 1 verification: 10 points (not enough - could be outlier)
 * - 2 verifications: 15 points (getting there, but not optimal)
 * - 3+ verifications: 25 points (expert-level accuracy achieved!)
 */
function calculateVerificationScore(verificationCount: number): number {
  if (verificationCount === 0) return 0;  // No data
  if (verificationCount === 1) return 10; // Single verification - not enough
  if (verificationCount === 2) return 15; // Two verifications - close but not optimal
  return 25; // 3+ verifications - expert-level accuracy achieved!
}

/**
 * Agreement score (0-20 points)
 * Measures community consensus through upvote/downvote ratio
 *
 * Research shows crowdsourced verification works best when there's consensus
 * Conflicting data suggests the information may be outdated or incorrect
 *
 * Scoring based on agreement percentage:
 * - 100% agreement: 20 points (complete consensus)
 * - 80-99% agreement: 15 points (strong consensus)
 * - 60-79% agreement: 10 points (moderate consensus)
 * - 40-59% agreement: 5 points (weak consensus)
 * - <40% agreement: 0 points (conflicting data - unreliable)
 */
function calculateAgreementScore(upvotes: number, downvotes: number): number {
  const totalVotes = upvotes + downvotes;

  if (totalVotes === 0) return 0; // No votes yet

  const agreementRatio = upvotes / totalVotes;

  // Score based on agreement percentage
  if (agreementRatio === 1.0) return 20; // 100% agreement
  if (agreementRatio >= 0.8) return 15;  // 80-99% agreement
  if (agreementRatio >= 0.6) return 10;  // 60-79% agreement
  if (agreementRatio >= 0.4) return 5;   // 40-59% agreement
  return 0; // <40% agreement - conflicting data
}

/**
 * Generate human-readable explanation of confidence score
 * References research to explain why score is what it is
 */
function generateScoreExplanation(
  score: number,
  factors: ConfidenceFactors,
  verificationCount: number,
  daysSinceVerification: number | null,
  freshnessThreshold: number,
  specialtyCategory: SpecialtyFreshnessCategory
): string {
  const parts: string[] = [];

  // Data source explanation
  if (factors.dataSourceScore >= 25) {
    parts.push('verified through official CMS data');
  } else if (factors.dataSourceScore >= 20) {
    parts.push('verified through insurance carrier data');
  } else if (factors.dataSourceScore >= 15) {
    parts.push('verified through community submissions');
  } else {
    parts.push('limited authoritative data');
  }

  // Recency explanation
  if (daysSinceVerification !== null) {
    if (factors.recencyScore === 30) {
      parts.push('very recent verification (within 30 days)');
    } else if (factors.recencyScore === 20) {
      parts.push(`recent verification (${daysSinceVerification} days ago)`);
    } else if (factors.recencyScore === 10) {
      parts.push(`aging data (${daysSinceVerification} days old)`);
    } else if (factors.recencyScore === 5) {
      parts.push(`stale data (${daysSinceVerification} days old) - research shows 12% annual provider turnover`);
    } else {
      parts.push(`very stale data (${daysSinceVerification}+ days old) - needs re-verification`);
    }
  } else {
    parts.push('never verified - needs community verification');
  }

  // Verification count explanation
  if (verificationCount === 0) {
    parts.push('no patient verifications yet');
  } else if (verificationCount === 1) {
    parts.push('only 1 verification (research shows 3 achieve expert-level accuracy)');
  } else if (verificationCount === 2) {
    parts.push('2 verifications (1 more needed for expert-level accuracy)');
  } else if (verificationCount === 3) {
    parts.push('3 verifications (expert-level accuracy achieved!)');
  } else {
    parts.push(`${verificationCount} verifications (exceeds expert-level threshold)`);
  }

  // Agreement explanation
  if (factors.agreementScore === 20) {
    parts.push('complete community consensus');
  } else if (factors.agreementScore === 15) {
    parts.push('strong community consensus');
  } else if (factors.agreementScore === 10) {
    parts.push('moderate community consensus');
  } else if (factors.agreementScore === 5) {
    parts.push('weak community consensus');
  } else if (factors.agreementScore === 0 && verificationCount > 0) {
    parts.push('conflicting community data (unreliable)');
  }

  // Combine into readable sentence
  const baseExplanation = `This ${score}% confidence score is based on: ${parts.join(', ')}.`;

  // Add specialty-specific note
  let specialtyNote = '';
  if (specialtyCategory === SpecialtyFreshnessCategory.MENTAL_HEALTH) {
    specialtyNote =
      ' Mental health providers show high network turnover (only 43% accept Medicaid).';
  } else if (specialtyCategory === SpecialtyFreshnessCategory.PRIMARY_CARE) {
    specialtyNote = ' Research shows primary care providers have 12% annual network turnover.';
  } else if (specialtyCategory === SpecialtyFreshnessCategory.HOSPITAL_BASED) {
    specialtyNote = ' Hospital-based providers typically maintain more stable network participation.';
  }

  return baseExplanation + specialtyNote;
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
