import { VerificationSource, VerificationType } from './enums';

// Base verification log type
export interface VerificationLog {
  id: string;
  providerId: string | null;
  planId: string | null;
  acceptanceId: string | null;

  // Verification details
  verificationType: VerificationType;
  verificationSource: VerificationSource;

  // Before/after state
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;

  // Source information
  sourceIp: string | null;
  userAgent: string | null;
  submittedBy: string | null;

  // Crowdsource specific
  upvotes: number;
  downvotes: number;
  isApproved: boolean | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;

  // Additional context
  notes: string | null;
  evidenceUrl: string | null;

  // Timestamp
  createdAt: Date;
}

// Verification submission input (for crowdsource)
export interface SubmitVerificationInput {
  providerId?: string;
  planId?: string;
  acceptanceId?: string;
  verificationType: VerificationType;

  // For plan acceptance verification
  acceptsInsurance?: boolean;
  acceptsNewPatients?: boolean;

  // Evidence
  notes?: string;
  evidenceUrl?: string;
  submittedBy?: string;
}

// Vote on verification
export interface VerificationVoteInput {
  verificationId: string;
  vote: 'up' | 'down';
}

// Verification review (for admins)
export interface ReviewVerificationInput {
  verificationId: string;
  isApproved: boolean;
  reviewedBy: string;
  notes?: string;
}

// Verification with computed properties
export interface VerificationWithScore extends VerificationLog {
  netVotes: number;
  voteRatio: number;
}

// Calculate verification score
export function calculateVerificationScore(verification: VerificationLog): number {
  const netVotes = verification.upvotes - verification.downvotes;
  const totalVotes = verification.upvotes + verification.downvotes;

  if (totalVotes === 0) return 0;

  // Score based on net votes and total engagement
  const voteScore = (netVotes / totalVotes) * 100;
  const engagementBonus = Math.min(totalVotes * 2, 20);

  return Math.round(voteScore + engagementBonus);
}

// Check if verification is trustworthy
export function isVerificationTrustworthy(verification: VerificationLog): boolean {
  const netVotes = verification.upvotes - verification.downvotes;
  const totalVotes = verification.upvotes + verification.downvotes;

  // Must have at least 3 votes
  if (totalVotes < 3) return false;

  // Must have positive net votes
  if (netVotes <= 0) return false;

  // Must have at least 60% upvote ratio
  const upvoteRatio = verification.upvotes / totalVotes;
  return upvoteRatio >= 0.6;
}
