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
}

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
 * Calculate confidence score based on multiple factors
 * Total score: 0-100
 */
export function calculateConfidenceScore(input: ConfidenceInput): {
  score: number;
  factors: ConfidenceFactors;
} {
  const factors: ConfidenceFactors = {
    dataSourceScore: calculateDataSourceScore(input.dataSource),
    recencyScore: calculateRecencyScore(input.lastVerifiedAt),
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

  return { score: Math.round(score * 100) / 100, factors };
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
 * Full points for data verified within 30 days
 * Decays over time
 */
function calculateRecencyScore(lastVerifiedAt: Date | null): number {
  if (!lastVerifiedAt) return 0;

  const now = new Date();
  const daysSinceVerification = Math.floor(
    (now.getTime() - lastVerifiedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceVerification <= 30) return 25;
  if (daysSinceVerification <= 60) return 20;
  if (daysSinceVerification <= 90) return 15;
  if (daysSinceVerification <= 180) return 10;
  if (daysSinceVerification <= 365) return 5;
  return 2;
}

/**
 * Verification count score (0-25 points)
 * More verifications = higher confidence
 */
function calculateVerificationScore(verificationCount: number): number {
  if (verificationCount === 0) return 0;
  if (verificationCount === 1) return 10;
  if (verificationCount === 2) return 15;
  if (verificationCount <= 4) return 20;
  return 25;
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
 */
export function getConfidenceLevel(score: number): string {
  if (score >= 91) return 'VERY_HIGH';
  if (score >= 76) return 'HIGH';
  if (score >= 51) return 'MEDIUM';
  if (score >= 26) return 'LOW';
  return 'VERY_LOW';
}

/**
 * Get confidence level description
 */
export function getConfidenceLevelDescription(score: number): string {
  const level = getConfidenceLevel(score);
  switch (level) {
    case 'VERY_HIGH': return 'Verified through multiple authoritative sources';
    case 'HIGH': return 'Verified through one authoritative source';
    case 'MEDIUM': return 'Reasonable confidence but needs verification';
    case 'LOW': return 'Limited data, verification recommended';
    case 'VERY_LOW': return 'Unverified or potentially inaccurate';
    default: return 'Unknown confidence level';
  }
}
