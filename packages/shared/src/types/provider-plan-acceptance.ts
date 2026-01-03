import { AcceptanceStatus, VerificationSource } from './enums';
import { InsurancePlan } from './insurance-plan';
import { Provider } from './provider';

// Confidence score breakdown
export interface ConfidenceFactors {
  dataSourceScore: number;      // 0-30
  recencyScore: number;         // 0-25
  verificationScore: number;    // 0-25
  crowdsourceScore: number;     // 0-20
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

// Confidence score interpretation
export type ConfidenceLevel = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 91) return 'VERY_HIGH';
  if (score >= 76) return 'HIGH';
  if (score >= 51) return 'MEDIUM';
  if (score >= 26) return 'LOW';
  return 'VERY_LOW';
}

export function getConfidenceLevelDescription(level: ConfidenceLevel): string {
  switch (level) {
    case 'VERY_HIGH':
      return 'Verified through multiple sources';
    case 'HIGH':
      return 'Verified through one source';
    case 'MEDIUM':
      return 'Reasonable but not verified';
    case 'LOW':
      return 'Needs verification';
    case 'VERY_LOW':
      return 'Likely inaccurate';
  }
}
