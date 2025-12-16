/**
 * Confidence Scoring Engine
 *
 * Calculates confidence scores for provider-plan acceptance relationships.
 * Scores range from 0-100, where:
 *   0-25:  Very low confidence (likely inaccurate)
 *   26-50: Low confidence (needs verification)
 *   51-75: Medium confidence (reasonable but not verified)
 *   76-90: High confidence (verified through one source)
 *   91-100: Very high confidence (verified through multiple sources)
 */

import { VerificationSource, AcceptanceStatus } from '@prisma/client';

export interface ConfidenceFactors {
  // Data source factors (0-30 points)
  dataSourceScore: number;
  dataSourceReason: string;

  // Recency factors (0-25 points)
  recencyScore: number;
  recencyReason: string;

  // Verification factors (0-25 points)
  verificationScore: number;
  verificationReason: string;

  // Crowdsource factors (0-20 points)
  crowdsourceScore: number;
  crowdsourceReason: string;
}

export interface ConfidenceResult {
  score: number;
  factors: ConfidenceFactors;
  recommendation: string;
  needsVerification: boolean;
}

export interface ProviderPlanData {
  // Data source information
  dataSource: VerificationSource | null;
  dataSourceDate: Date | null;

  // Verification information
  lastVerifiedAt: Date | null;
  verificationSource: VerificationSource | null;
  verificationCount: number;

  // Crowdsource information
  upvotes: number;
  downvotes: number;
  userSubmissions: number;

  // Plan information
  planEffectiveDate: Date | null;
  planTerminationDate: Date | null;

  // Provider information
  providerLastUpdateDate: Date | null;
  providerStatus: 'ACTIVE' | 'DEACTIVATED';

  // Current status
  acceptanceStatus: AcceptanceStatus;
}

// Data source reliability rankings (higher = more reliable)
const DATA_SOURCE_WEIGHTS: Record<VerificationSource, number> = {
  CMS_DATA: 30,
  CARRIER_DATA: 28,
  PROVIDER_PORTAL: 25,
  PHONE_CALL: 22,
  AUTOMATED: 15,
  CROWDSOURCE: 10,
};

/**
 * Calculate the data source component of the confidence score
 */
function calculateDataSourceScore(data: ProviderPlanData): { score: number; reason: string } {
  if (!data.dataSource) {
    return { score: 0, reason: 'No data source available' };
  }

  const baseScore = DATA_SOURCE_WEIGHTS[data.dataSource] || 0;

  // Adjust based on source date freshness
  if (data.dataSourceDate) {
    const ageInDays = Math.floor((Date.now() - data.dataSourceDate.getTime()) / (1000 * 60 * 60 * 24));

    if (ageInDays <= 30) {
      return { score: baseScore, reason: `${data.dataSource} data from within last 30 days` };
    } else if (ageInDays <= 90) {
      return { score: baseScore * 0.9, reason: `${data.dataSource} data from within last 90 days` };
    } else if (ageInDays <= 180) {
      return { score: baseScore * 0.75, reason: `${data.dataSource} data from within last 6 months` };
    } else if (ageInDays <= 365) {
      return { score: baseScore * 0.5, reason: `${data.dataSource} data is 6-12 months old` };
    } else {
      return { score: baseScore * 0.25, reason: `${data.dataSource} data is over 1 year old` };
    }
  }

  return { score: baseScore * 0.5, reason: `${data.dataSource} data (unknown date)` };
}

/**
 * Calculate the recency component of the confidence score
 */
function calculateRecencyScore(data: ProviderPlanData): { score: number; reason: string } {
  const now = new Date();
  let score = 0;
  const reasons: string[] = [];

  // Check verification recency (up to 15 points)
  if (data.lastVerifiedAt) {
    const daysSinceVerification = Math.floor(
      (now.getTime() - data.lastVerifiedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceVerification <= 7) {
      score += 15;
      reasons.push('Verified within last week');
    } else if (daysSinceVerification <= 30) {
      score += 12;
      reasons.push('Verified within last month');
    } else if (daysSinceVerification <= 90) {
      score += 8;
      reasons.push('Verified within last 3 months');
    } else if (daysSinceVerification <= 180) {
      score += 4;
      reasons.push('Verified within last 6 months');
    } else {
      score += 1;
      reasons.push('Verification is stale (>6 months)');
    }
  }

  // Check plan validity (up to 10 points)
  if (data.planEffectiveDate && data.planTerminationDate) {
    if (now >= data.planEffectiveDate && now <= data.planTerminationDate) {
      score += 10;
      reasons.push('Plan is currently active');
    } else if (now < data.planEffectiveDate) {
      score += 5;
      reasons.push('Plan not yet effective');
    } else {
      score += 0;
      reasons.push('Plan has terminated');
    }
  } else if (data.planEffectiveDate && now >= data.planEffectiveDate) {
    score += 7;
    reasons.push('Plan is effective (no termination date)');
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join('; ') : 'No recency data available',
  };
}

/**
 * Calculate the verification component of the confidence score
 */
function calculateVerificationScore(data: ProviderPlanData): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // Verification source quality (up to 15 points)
  if (data.verificationSource) {
    const sourceScore = Math.min(DATA_SOURCE_WEIGHTS[data.verificationSource] / 2, 15);
    score += sourceScore;
    reasons.push(`Verified via ${data.verificationSource}`);
  }

  // Verification count bonus (up to 10 points)
  if (data.verificationCount > 0) {
    const countBonus = Math.min(data.verificationCount * 2, 10);
    score += countBonus;
    reasons.push(`${data.verificationCount} verification(s) on record`);
  }

  // Provider status check
  if (data.providerStatus === 'DEACTIVATED') {
    score = Math.max(0, score - 10);
    reasons.push('Warning: Provider NPI is deactivated');
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join('; ') : 'No verification data',
  };
}

/**
 * Calculate the crowdsource component of the confidence score
 */
function calculateCrowdsourceScore(data: ProviderPlanData): { score: number; reason: string } {
  const { upvotes, downvotes, userSubmissions } = data;
  const totalVotes = upvotes + downvotes;

  if (totalVotes === 0 && userSubmissions === 0) {
    return { score: 0, reason: 'No crowdsource data' };
  }

  let score = 0;
  const reasons: string[] = [];

  // Vote-based scoring (up to 15 points)
  if (totalVotes > 0) {
    const voteRatio = upvotes / totalVotes;
    const volumeMultiplier = Math.min(Math.sqrt(totalVotes) / 5, 1); // More votes = more confidence

    if (voteRatio >= 0.8) {
      score += 15 * volumeMultiplier;
      reasons.push(`Strong positive feedback (${upvotes}/${totalVotes} upvotes)`);
    } else if (voteRatio >= 0.6) {
      score += 10 * volumeMultiplier;
      reasons.push(`Mostly positive feedback (${upvotes}/${totalVotes} upvotes)`);
    } else if (voteRatio >= 0.4) {
      score += 5 * volumeMultiplier;
      reasons.push(`Mixed feedback (${upvotes}/${totalVotes} upvotes)`);
    } else {
      score += 0;
      reasons.push(`Negative feedback (${downvotes}/${totalVotes} downvotes)`);
    }
  }

  // Submission bonus (up to 5 points)
  if (userSubmissions > 0) {
    const submissionBonus = Math.min(userSubmissions, 5);
    score += submissionBonus;
    reasons.push(`${userSubmissions} user submission(s)`);
  }

  return {
    score: Math.round(score),
    reason: reasons.join('; '),
  };
}

/**
 * Generate a recommendation based on the confidence score
 */
function generateRecommendation(score: number, data: ProviderPlanData): string {
  if (data.providerStatus === 'DEACTIVATED') {
    return 'Provider NPI is deactivated. Contact the practice directly to verify current status.';
  }

  if (data.acceptanceStatus === AcceptanceStatus.NOT_ACCEPTED) {
    if (score < 50) {
      return 'Provider likely does not accept this plan, but data is uncertain. Verify before scheduling.';
    }
    return 'Provider does not accept this plan based on available data.';
  }

  if (data.acceptanceStatus === AcceptanceStatus.UNKNOWN) {
    return 'No acceptance data available. Contact the provider to verify insurance acceptance.';
  }

  if (score >= 90) {
    return 'High confidence that provider accepts this plan. Data is well-verified.';
  } else if (score >= 75) {
    return 'Good confidence in plan acceptance. Consider calling to confirm for important visits.';
  } else if (score >= 50) {
    return 'Moderate confidence. Recommend calling the provider to verify insurance acceptance.';
  } else if (score >= 25) {
    return 'Low confidence in data accuracy. Strongly recommend verifying with the provider.';
  } else {
    return 'Very low confidence. Data may be outdated or incorrect. Verification required.';
  }
}

/**
 * Main function to calculate confidence score for a provider-plan relationship
 */
export function calculateConfidenceScore(data: ProviderPlanData): ConfidenceResult {
  const dataSourceResult = calculateDataSourceScore(data);
  const recencyResult = calculateRecencyScore(data);
  const verificationResult = calculateVerificationScore(data);
  const crowdsourceResult = calculateCrowdsourceScore(data);

  const totalScore = Math.min(
    100,
    Math.round(
      dataSourceResult.score +
      recencyResult.score +
      verificationResult.score +
      crowdsourceResult.score
    )
  );

  const factors: ConfidenceFactors = {
    dataSourceScore: Math.round(dataSourceResult.score),
    dataSourceReason: dataSourceResult.reason,
    recencyScore: Math.round(recencyResult.score),
    recencyReason: recencyResult.reason,
    verificationScore: Math.round(verificationResult.score),
    verificationReason: verificationResult.reason,
    crowdsourceScore: Math.round(crowdsourceResult.score),
    crowdsourceReason: crowdsourceResult.reason,
  };

  return {
    score: totalScore,
    factors,
    recommendation: generateRecommendation(totalScore, data),
    needsVerification: totalScore < 75,
  };
}

/**
 * Batch calculate confidence scores for multiple provider-plan relationships
 */
export function calculateBatchConfidenceScores(
  dataArray: ProviderPlanData[]
): ConfidenceResult[] {
  return dataArray.map(calculateConfidenceScore);
}

/**
 * Determine if a provider-plan relationship needs re-verification
 * based on age of data and confidence score
 */
export function needsReverification(
  lastVerifiedAt: Date | null,
  confidenceScore: number,
  daysSinceUpdate: number = 90
): boolean {
  if (!lastVerifiedAt) return true;

  const daysSinceVerification = Math.floor(
    (Date.now() - lastVerifiedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Higher confidence scores can go longer without re-verification
  const allowedDays = confidenceScore >= 90 ? daysSinceUpdate * 2
    : confidenceScore >= 75 ? daysSinceUpdate * 1.5
    : confidenceScore >= 50 ? daysSinceUpdate
    : daysSinceUpdate * 0.5;

  return daysSinceVerification >= allowedDays;
}

/**
 * Calculate aggregate confidence for a provider across all their plans
 */
export function calculateProviderAggregateConfidence(
  planConfidenceScores: number[]
): { average: number; min: number; max: number; needsAttention: boolean } {
  if (planConfidenceScores.length === 0) {
    return { average: 0, min: 0, max: 0, needsAttention: true };
  }

  const sum = planConfidenceScores.reduce((a, b) => a + b, 0);
  const average = Math.round(sum / planConfidenceScores.length);
  const min = Math.min(...planConfidenceScores);
  const max = Math.max(...planConfidenceScores);

  return {
    average,
    min,
    max,
    needsAttention: min < 50 || average < 60,
  };
}

export default {
  calculateConfidenceScore,
  calculateBatchConfidenceScores,
  needsReverification,
  calculateProviderAggregateConfidence,
};
