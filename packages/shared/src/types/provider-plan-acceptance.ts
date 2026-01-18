import { AcceptanceStatus, VerificationSource } from './enums';
import { InsurancePlan } from './insurance-plan';
import { Provider } from './provider';

// Confidence score breakdown
// Based on research: Mortensen et al. (2015) and Ndumele et al. (2018)
export interface ConfidenceFactors {
  dataSourceScore: number;      // 0-25 (authoritative sources)
  recencyScore: number;         // 0-30 (time-based decay)
  verificationScore: number;    // 0-25 (optimal at 3 verifications)
  agreementScore: number;       // 0-20 (community consensus)
  [key: string]: number;        // Index signature for JSON compatibility
}

// Confidence metadata with research-based insights
export interface ConfidenceMetadata {
  daysUntilStale: number;
  isStale: boolean;
  recommendReVerification: boolean;
  daysSinceVerification: number | null;
  freshnessThreshold: number;
  researchNote: string;
  explanation: string;
}

// Confidence score interpretation
export type ConfidenceLevel = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';

// Complete confidence result
export interface ConfidenceDetails {
  score: number;
  level: ConfidenceLevel;
  description: string;
  factors: ConfidenceFactors;
  metadata: ConfidenceMetadata;
}

// Base provider-plan acceptance type
export interface ProviderPlanAcceptance {
  id: string;
  providerId: string;
  planId: string;

  // Acceptance status
  acceptanceStatus: AcceptanceStatus;
  acceptsNewPatients: boolean | null;

  // Confidence scoring
  confidenceScore: number;
  confidenceFactors: ConfidenceFactors | null;

  // Verification
  lastVerifiedAt: Date | null;
  verificationSource: VerificationSource | null;
  verificationCount: number;

  // TTL (Time To Live) - 6 months based on 12% annual provider turnover
  expiresAt: Date | null;

  // Full confidence details (computed)
  confidence?: ConfidenceDetails;

  // Effective dates
  effectiveDate: Date | null;
  terminationDate: Date | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Provider-plan acceptance with relations
export interface ProviderPlanAcceptanceWithRelations extends ProviderPlanAcceptance {
  provider?: Provider;
  plan?: InsurancePlan;
}

// Create acceptance input
export interface CreateProviderPlanAcceptanceInput {
  providerId: string;
  planId: string;
  acceptanceStatus?: AcceptanceStatus;
  acceptsNewPatients?: boolean | null;
  confidenceScore?: number;
  confidenceFactors?: ConfidenceFactors | null;
  verificationSource?: VerificationSource | null;
  effectiveDate?: Date | null;
  terminationDate?: Date | null;
}

// Update acceptance input
export interface UpdateProviderPlanAcceptanceInput {
  acceptanceStatus?: AcceptanceStatus;
  acceptsNewPatients?: boolean | null;
  confidenceScore?: number;
  confidenceFactors?: ConfidenceFactors | null;
  lastVerifiedAt?: Date | null;
  verificationSource?: VerificationSource | null;
  effectiveDate?: Date | null;
  terminationDate?: Date | null;
}

// Acceptance search filters
export interface ProviderPlanAcceptanceSearchFilters {
  providerId?: string;
  planId?: string;
  acceptanceStatus?: AcceptanceStatus;
  minConfidenceScore?: number;
  maxConfidenceScore?: number;
  verificationSource?: VerificationSource;
}

// Research shows 3 verifications achieve expert-level accuracy (κ=0.58)
// Mortensen et al. (2015), JAMIA
const MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE = 3;

export function getConfidenceLevel(score: number, verificationCount: number = 0): ConfidenceLevel {
  // Research shows 3 verifications achieve expert-level accuracy
  // Force lower confidence if below threshold, regardless of score
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

export function getConfidenceLevelDescription(level: ConfidenceLevel, verificationCount: number = 0): string {
  const basedOnResearch = verificationCount < MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE
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
  }
}
