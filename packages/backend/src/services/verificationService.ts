import { Prisma, VerificationType, VerificationSource } from '@prisma/client';
import prisma from '../lib/prisma';
import { calculateConfidenceScore } from './confidenceService';
import { AppError } from '../middleware/errorHandler';
import {
  VERIFICATION_TTL_MS,
  SYBIL_PREVENTION_WINDOW_MS,
  MIN_VERIFICATIONS_FOR_CONSENSUS,
  MIN_CONFIDENCE_FOR_STATUS_CHANGE,
} from '../config/constants';

// Re-export for consumers that import from this file
export { VERIFICATION_TTL_MS };

/**
 * Calculate expiration date for new verifications
 */
export function getExpirationDate(): Date {
  return new Date(Date.now() + VERIFICATION_TTL_MS);
}

/**
 * Build a WHERE clause that filters out expired records
 * Includes legacy records (expiresAt: null) for backwards compatibility
 */
function notExpiredFilter(): Prisma.VerificationLogWhereInput {
  return {
    OR: [
      { expiresAt: null },           // Legacy records without TTL
      { expiresAt: { gt: new Date() } }, // Not yet expired
    ],
  };
}

// ============================================================================
// Helper Functions for submitVerification
// ============================================================================

/**
 * Validate that both provider and plan exist in the database
 * @throws AppError.notFound if either doesn't exist
 */
async function validateProviderAndPlan(
  npi: string,
  planId: string
): Promise<{ providerNpi: string; planId: string }> {
  const provider = await prisma.provider.findUnique({
    where: { npi },
    select: { npi: true },
  });

  if (!provider) {
    throw AppError.notFound(`Provider with NPI ${npi} not found`);
  }

  const plan = await prisma.insurancePlan.findUnique({
    where: { planId },
    select: { planId: true },
  });

  if (!plan) {
    throw AppError.notFound(`Plan with ID ${planId} not found`);
  }

  return { providerNpi: provider.npi, planId: plan.planId };
}

/**
 * Check for Sybil attack patterns - duplicate verifications from same IP or email
 * @throws AppError.conflict if duplicate found within prevention window
 */
async function checkSybilAttack(
  providerNpi: string,
  planId: string,
  sourceIp?: string,
  submittedBy?: string
): Promise<void> {
  const cutoffDate = new Date(Date.now() - SYBIL_PREVENTION_WINDOW_MS);

  // Check for duplicate verification from same IP
  if (sourceIp) {
    const existingFromIp = await prisma.verificationLog.findFirst({
      where: {
        providerNpi,
        planId,
        sourceIp,
        createdAt: { gte: cutoffDate },
      },
    });

    if (existingFromIp) {
      throw AppError.conflict(
        'You have already submitted a verification for this provider-plan pair within the last 30 days.'
      );
    }
  }

  // Check for duplicate verification from same email
  if (submittedBy) {
    const existingFromEmail = await prisma.verificationLog.findFirst({
      where: {
        providerNpi,
        planId,
        submittedBy,
        createdAt: { gte: cutoffDate },
      },
    });

    if (existingFromEmail) {
      throw AppError.conflict(
        'This email has already submitted a verification for this provider-plan pair within the last 30 days.'
      );
    }
  }
}

/**
 * Count verification consensus - how many ACCEPTED vs NOT_ACCEPTED verifications exist
 * @param includeNewStatus - whether to include a new submission in the count
 */
async function countVerificationConsensus(
  providerNpi: string,
  planId: string,
  newStatus?: 'ACCEPTED' | 'NOT_ACCEPTED'
): Promise<{ acceptedCount: number; notAcceptedCount: number }> {
  const pastVerifications = await prisma.verificationLog.findMany({
    where: {
      providerNpi,
      planId,
      verificationType: VerificationType.PLAN_ACCEPTANCE,
      ...notExpiredFilter(),
    },
    select: { newValue: true },
  });

  let acceptedCount = 0;
  let notAcceptedCount = 0;

  // Include new submission in the count if provided
  if (newStatus === 'ACCEPTED') {
    acceptedCount++;
  } else if (newStatus === 'NOT_ACCEPTED') {
    notAcceptedCount++;
  }

  // Count past verifications by their actual acceptanceStatus value
  for (const v of pastVerifications) {
    const pastValue = v.newValue as { acceptanceStatus?: string } | null;
    if (pastValue?.acceptanceStatus === 'ACCEPTED') {
      acceptedCount++;
    } else if (pastValue?.acceptanceStatus === 'NOT_ACCEPTED') {
      notAcceptedCount++;
    }
  }

  return { acceptedCount, notAcceptedCount };
}

/**
 * Determine the final acceptance status based on consensus logic
 * Security: Requires 3+ verifications, score >= 60, and clear 2:1 majority ratio
 */
function determineAcceptanceStatus(
  currentStatus: string | null,
  verificationCount: number,
  confidenceScore: number,
  counts: { acceptedCount: number; notAcceptedCount: number }
): string {
  const { acceptedCount, notAcceptedCount } = counts;

  // Check if consensus requirements are met
  const hasClearMajority = acceptedCount > notAcceptedCount * 2 || notAcceptedCount > acceptedCount * 2;
  const shouldUpdateStatus =
    verificationCount >= MIN_VERIFICATIONS_FOR_CONSENSUS &&
    confidenceScore >= MIN_CONFIDENCE_FOR_STATUS_CHANGE &&
    hasClearMajority;

  if (shouldUpdateStatus) {
    // Consensus reached - update status based on majority
    return acceptedCount > notAcceptedCount ? 'ACCEPTED' : 'NOT_ACCEPTED';
  }

  // No consensus - keep existing status, or set to PENDING if currently UNKNOWN
  return currentStatus === 'UNKNOWN' ? 'PENDING' : (currentStatus || 'PENDING');
}

/**
 * Create or update the ProviderPlanAcceptance record
 */
async function upsertAcceptance(
  providerNpi: string,
  planId: string,
  newStatus: 'ACCEPTED' | 'NOT_ACCEPTED',
  verificationId: string,
  existingAcceptance: Awaited<ReturnType<typeof prisma.providerPlanAcceptance.findUnique>> | null,
  locationId?: number
): Promise<NonNullable<Awaited<ReturnType<typeof prisma.providerPlanAcceptance.findUnique>>>> {
  if (existingAcceptance) {
    // Update existing acceptance
    const verificationCount = (existingAcceptance.verificationCount || 0) + 1;
    const counts = await countVerificationConsensus(providerNpi, planId, newStatus);

    // For confidence scoring, upvotes = majority count, downvotes = minority count
    const upvotes = Math.max(counts.acceptedCount, counts.notAcceptedCount);
    const downvotes = Math.min(counts.acceptedCount, counts.notAcceptedCount);

    const { score } = calculateConfidenceScore({
      dataSource: VerificationSource.CROWDSOURCE,
      lastVerifiedAt: new Date(),
      verificationCount,
      upvotes,
      downvotes,
    });

    const finalStatus = determineAcceptanceStatus(
      existingAcceptance.acceptanceStatus,
      verificationCount,
      score,
      counts
    );

    return prisma.providerPlanAcceptance.update({
      where: { id: existingAcceptance.id },
      data: {
        acceptanceStatus: finalStatus,
        lastVerified: new Date(),
        verificationCount,
        confidenceScore: score,
        expiresAt: getExpirationDate(),
      },
    });
  } else {
    // Create new acceptance - starts as PENDING until consensus threshold is reached
    const { score } = calculateConfidenceScore({
      dataSource: VerificationSource.CROWDSOURCE,
      lastVerifiedAt: new Date(),
      verificationCount: 1,
      upvotes: 1,
      downvotes: 0,
    });

    const acceptance = await prisma.providerPlanAcceptance.create({
      data: {
        providerNpi,
        planId,
        locationId: locationId ?? null,
        acceptanceStatus: 'PENDING',
        lastVerified: new Date(),
        verificationCount: 1,
        confidenceScore: score,
        expiresAt: getExpirationDate(),
      },
    });

    // Update verification with acceptance ID
    await prisma.verificationLog.update({
      where: { id: verificationId },
      data: { acceptanceId: acceptance.id.toString() },
    });

    return acceptance;
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Research-based verification input
 * Based on Mortensen et al. (2015), JAMIA: Simple binary questions achieve highest accuracy
 */
export interface SubmitVerificationInput {
  npi: string;
  planId: string;
  locationId?: number;

  // Insurance acceptance
  acceptsInsurance: boolean;
  acceptsNewPatients?: boolean;

  // Contact verification (36% of errors are contact information)
  phoneReached?: boolean;
  phoneCorrect?: boolean;
  scheduledAppointment?: boolean;

  // Evidence
  notes?: string;
  evidenceUrl?: string;
  submittedBy?: string;
  sourceIp?: string;
  userAgent?: string;
}

export interface VerificationStats {
  total: number;
  approved: number;
  pending: number;
  byType: Record<VerificationType, number>;
  recentCount: number;
}

/**
 * Strip PII fields from verification object before returning in API responses
 * Security: Prevents exposure of sourceIp, userAgent, submittedBy
 */
function stripVerificationPII<T extends Record<string, unknown>>(verification: T): Omit<T, 'sourceIp' | 'userAgent' | 'submittedBy'> {
  const { sourceIp, userAgent, submittedBy, ...safe } = verification;
  return safe;
}

/**
 * Submit a new verification
 * Research-based: Captures binary verification data for expert-level accuracy
 */
export async function submitVerification(input: SubmitVerificationInput) {
  const {
    npi,
    planId,
    locationId,
    acceptsInsurance,
    acceptsNewPatients,
    phoneReached,
    phoneCorrect,
    scheduledAppointment,
    notes,
    evidenceUrl,
    submittedBy,
    sourceIp,
    userAgent,
  } = input;

  // Step 1: Validate provider and plan exist
  const { providerNpi, planId: validPlanId } = await validateProviderAndPlan(npi, planId);

  // Step 2: Check for Sybil attack patterns
  await checkSybilAttack(providerNpi, validPlanId, sourceIp, submittedBy);

  // Step 3: Get existing acceptance record for previousValue
  // If locationId is provided, look for a location-specific record first
  let existingAcceptance: Awaited<ReturnType<typeof prisma.providerPlanAcceptance.findUnique>> | null = null;

  if (locationId) {
    // Look for location-specific record
    existingAcceptance = await prisma.providerPlanAcceptance.findFirst({
      where: {
        providerNpi,
        planId: validPlanId,
        locationId,
      },
    });
  }

  if (!existingAcceptance) {
    // Fall back to NPI-level (legacy) record
    existingAcceptance = await prisma.providerPlanAcceptance.findFirst({
      where: {
        providerNpi,
        planId: validPlanId,
        locationId: locationId ?? null,
      },
    });
  }

  const previousValue = existingAcceptance
    ? {
        acceptanceStatus: existingAcceptance.acceptanceStatus,
        confidenceScore: existingAcceptance.confidenceScore,
      }
    : null;

  const newStatus = acceptsInsurance ? 'ACCEPTED' : 'NOT_ACCEPTED';

  // Step 4: Create verification log with TTL
  const verification = await prisma.verificationLog.create({
    data: {
      providerNpi,
      planId: validPlanId,
      acceptanceId: existingAcceptance?.id.toString(),
      verificationType: VerificationType.PLAN_ACCEPTANCE,
      verificationSource: VerificationSource.CROWDSOURCE,
      previousValue: previousValue as Prisma.InputJsonValue,
      newValue: {
        acceptanceStatus: newStatus,
        acceptsNewPatients,
        phoneReached,
        phoneCorrect,
        scheduledAppointment,
      } as Prisma.InputJsonValue,
      notes,
      evidenceUrl,
      submittedBy,
      sourceIp,
      userAgent,
      upvotes: 0,
      downvotes: 0,
      expiresAt: getExpirationDate(),
    },
  });

  // Step 5: Create or update acceptance record
  const acceptance = await upsertAcceptance(
    providerNpi,
    validPlanId,
    newStatus,
    verification.id,
    existingAcceptance,
    locationId
  );

  return {
    verification: stripVerificationPII(verification),
    acceptance,
  };
}

/**
 * Vote on a verification
 * Prevents duplicate votes from the same IP
 */
export async function voteOnVerification(
  verificationId: string,
  vote: 'up' | 'down',
  sourceIp?: string
) {
  // Validate sourceIp is provided
  if (!sourceIp) {
    throw AppError.badRequest('Source IP is required for voting');
  }

  // Check if verification exists
  const existingVerification = await prisma.verificationLog.findUnique({
    where: { id: verificationId },
  });

  if (!existingVerification) {
    throw AppError.notFound('Verification not found');
  }

  // Check for existing vote from this IP
  const existingVote = await prisma.voteLog.findUnique({
    where: {
      verificationId_sourceIp: {
        verificationId,
        sourceIp,
      },
    },
  });

  let updatedVerification;
  let voteChanged = false;

  if (existingVote) {
    // If same vote direction, reject as duplicate
    if (existingVote.vote === vote) {
      throw AppError.conflict('You have already voted on this verification');
    }

    // Changing vote direction - update existing vote and adjust counts
    voteChanged = true;
    await prisma.$transaction(async (tx) => {
      // Update the vote record
      await tx.voteLog.update({
        where: {
          verificationId_sourceIp: {
            verificationId,
            sourceIp,
          },
        },
        data: { vote },
      });

      // Adjust the counts: remove old vote, add new vote
      if (vote === 'up') {
        // Changed from down to up
        await tx.verificationLog.update({
          where: { id: verificationId },
          data: {
            upvotes: { increment: 1 },
            downvotes: { decrement: 1 },
          },
        });
      } else {
        // Changed from up to down
        await tx.verificationLog.update({
          where: { id: verificationId },
          data: {
            upvotes: { decrement: 1 },
            downvotes: { increment: 1 },
          },
        });
      }
    });
  } else {
    // No existing vote - create new vote
    await prisma.$transaction(async (tx) => {
      // Create vote log entry
      await tx.voteLog.create({
        data: {
          verificationId,
          sourceIp,
          vote,
        },
      });

      // Increment the appropriate counter
      await tx.verificationLog.update({
        where: { id: verificationId },
        data: {
          upvotes: vote === 'up' ? { increment: 1 } : undefined,
          downvotes: vote === 'down' ? { increment: 1 } : undefined,
        },
      });
    });
  }

  // Fetch updated verification
  updatedVerification = await prisma.verificationLog.findUnique({
    where: { id: verificationId },
  });

  if (!updatedVerification) {
    throw AppError.notFound('Verification not found after update');
  }

  // Update confidence score on the acceptance
  if (updatedVerification.acceptanceId) {
    const acceptanceRecord = await prisma.providerPlanAcceptance.findUnique({
      where: { id: parseInt(updatedVerification.acceptanceId) },
    });

    if (acceptanceRecord) {
      const { score } = calculateConfidenceScore({
        dataSource: VerificationSource.CROWDSOURCE,
        lastVerifiedAt: acceptanceRecord.lastVerified,
        verificationCount: acceptanceRecord.verificationCount || 0,
        upvotes: updatedVerification.upvotes,
        downvotes: updatedVerification.downvotes,
      });

      await prisma.providerPlanAcceptance.update({
        where: { id: acceptanceRecord.id },
        data: {
          confidenceScore: score,
        },
      });
    }
  }

  return {
    ...stripVerificationPII(updatedVerification),
    voteChanged,
  };
}

/**
 * Get verification stats
 */
export async function getVerificationStats(): Promise<VerificationStats> {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [total, approved, pending, recentCount, byTypeResults] = await Promise.all([
    prisma.verificationLog.count(),
    prisma.verificationLog.count({ where: { isApproved: true } }),
    prisma.verificationLog.count({ where: { isApproved: null } }),
    prisma.verificationLog.count({ where: { createdAt: { gte: last24Hours } } }),
    prisma.verificationLog.groupBy({
      by: ['verificationType'],
      _count: true,
    }),
  ]);

  const byType = Object.values(VerificationType).reduce((acc, type) => {
    const result = byTypeResults.find(r => r.verificationType === type);
    acc[type] = result?._count ?? 0;
    return acc;
  }, {} as Record<VerificationType, number>);

  return {
    total,
    approved,
    pending,
    byType,
    recentCount,
  };
}

/**
 * Get recent verifications
 */
export async function getRecentVerifications(options: {
  limit?: number;
  npi?: string;
  planId?: string;
  includeExpired?: boolean; // Default false - filter out expired
} = {}) {
  const { limit = 20, npi, planId, includeExpired = false } = options;

  const where: Prisma.VerificationLogWhereInput = {};

  // Filter out expired verifications unless explicitly requested
  if (!includeExpired) {
    Object.assign(where, notExpiredFilter());
  }

  if (npi) {
    const provider = await prisma.provider.findUnique({
      where: { npi },
      select: { npi: true },
    });
    if (provider) {
      where.providerNpi = provider.npi;
    }
  }

  if (planId) {
    const plan = await prisma.insurancePlan.findUnique({
      where: { planId },
      select: { planId: true },
    });
    if (plan) {
      where.planId = plan.planId;
    }
  }

  // Security: Exclude PII fields (sourceIp, userAgent, submittedBy)
  return prisma.verificationLog.findMany({
    where,
    take: Math.min(limit, 100),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      providerNpi: true,
      planId: true,
      acceptanceId: true,
      verificationType: true,
      verificationSource: true,
      previousValue: true,
      newValue: true,
      notes: true,
      evidenceUrl: true,
      isApproved: true,
      createdAt: true,
      expiresAt: true, // Include TTL for transparency
      upvotes: true,
      downvotes: true,
      // Exclude: sourceIp, userAgent, submittedBy
      provider: {
        select: {
          npi: true,
          firstName: true,
          lastName: true,
          organizationName: true,
          entityType: true,
        },
      },
      plan: {
        select: {
          planId: true,
          planName: true,
          issuerName: true,
        },
      },
    },
  });
}

/**
 * Get verifications for a specific provider-plan pair
 */
export async function getVerificationsForPair(
  npi: string,
  planId: string,
  options: { includeExpired?: boolean } = {}
) {
  const { includeExpired = false } = options;

  const provider = await prisma.provider.findUnique({
    where: { npi },
    select: { npi: true },
  });

  const plan = await prisma.insurancePlan.findUnique({
    where: { planId },
    select: { planId: true },
  });

  if (!provider || !plan) {
    return null;
  }

  // Build where clause with optional TTL filter
  const verificationWhere: Prisma.VerificationLogWhereInput = {
    providerNpi: provider.npi,
    planId: plan.planId,
  };

  if (!includeExpired) {
    Object.assign(verificationWhere, notExpiredFilter());
  }

  const [acceptance, verifications] = await Promise.all([
    prisma.providerPlanAcceptance.findFirst({
      where: {
        providerNpi: provider.npi,
        planId: plan.planId,
        locationId: null,
      },
    }),
    // Security: Exclude PII fields (sourceIp, userAgent, submittedBy)
    prisma.verificationLog.findMany({
      where: verificationWhere,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        providerNpi: true,
        planId: true,
        acceptanceId: true,
        verificationType: true,
        verificationSource: true,
        previousValue: true,
        newValue: true,
        notes: true,
        evidenceUrl: true,
        isApproved: true,
        createdAt: true,
        expiresAt: true, // Include TTL for transparency
        upvotes: true,
        downvotes: true,
        // Exclude: sourceIp, userAgent, submittedBy
      },
    }),
  ]);

  // Check if acceptance record is expired
  const isAcceptanceExpired = acceptance?.expiresAt
    ? new Date(acceptance.expiresAt) < new Date()
    : false;

  return {
    acceptance,
    isAcceptanceExpired,
    verifications,
    summary: {
      totalVerifications: verifications.length,
      totalUpvotes: verifications.reduce((sum, v) => sum + v.upvotes, 0),
      totalDownvotes: verifications.reduce((sum, v) => sum + v.downvotes, 0),
    },
  };
}

/**
 * Cleanup expired verifications
 *
 * This function should be run as a scheduled job (e.g., daily cron)
 * to remove verification records that have exceeded their TTL.
 *
 * Based on 12% annual provider turnover research, keeping expired
 * verifications serves no purpose and wastes storage.
 *
 * @param options.dryRun - If true, returns counts without deleting
 * @param options.batchSize - Number of records to delete per batch (default 1000)
 * @returns Cleanup statistics
 */
export async function cleanupExpiredVerifications(options: {
  dryRun?: boolean;
  batchSize?: number;
} = {}): Promise<{
  dryRun: boolean;
  expiredVerificationLogs: number;
  expiredPlanAcceptances: number;
  deletedVerificationLogs: number;
  deletedPlanAcceptances: number;
}> {
  const { dryRun = false, batchSize = 1000 } = options;
  const now = new Date();

  // Count expired records
  const [expiredLogsCount, expiredAcceptanceCount] = await Promise.all([
    prisma.verificationLog.count({
      where: {
        expiresAt: {
          lt: now,
          not: null,
        },
      },
    }),
    prisma.providerPlanAcceptance.count({
      where: {
        expiresAt: {
          lt: now,
          not: null,
        },
      },
    }),
  ]);

  const result = {
    dryRun,
    expiredVerificationLogs: expiredLogsCount,
    expiredPlanAcceptances: expiredAcceptanceCount,
    deletedVerificationLogs: 0,
    deletedPlanAcceptances: 0,
  };

  if (dryRun) {
    return result;
  }

  // Delete expired verification logs in batches
  let deletedLogs = 0;
  while (deletedLogs < expiredLogsCount) {
    const deleteResult = await prisma.verificationLog.deleteMany({
      where: {
        expiresAt: {
          lt: now,
          not: null,
        },
      },
    });

    if (deleteResult.count === 0) break;
    deletedLogs += deleteResult.count;

    // Safety check to prevent infinite loops
    if (deleteResult.count < batchSize) break;
  }
  result.deletedVerificationLogs = deletedLogs;

  // Delete expired plan acceptances in batches
  // Note: Only delete acceptances that have no non-expired verifications
  let deletedAcceptances = 0;
  while (deletedAcceptances < expiredAcceptanceCount) {
    const deleteResult = await prisma.providerPlanAcceptance.deleteMany({
      where: {
        expiresAt: {
          lt: now,
          not: null,
        },
      },
    });

    if (deleteResult.count === 0) break;
    deletedAcceptances += deleteResult.count;

    // Safety check to prevent infinite loops
    if (deleteResult.count < batchSize) break;
  }
  result.deletedPlanAcceptances = deletedAcceptances;

  return result;
}

/**
 * Get expiration statistics for monitoring
 */
export async function getExpirationStats(): Promise<{
  verificationLogs: {
    total: number;
    withTTL: number;
    expired: number;
    expiringWithin7Days: number;
    expiringWithin30Days: number;
  };
  planAcceptances: {
    total: number;
    withTTL: number;
    expired: number;
    expiringWithin7Days: number;
    expiringWithin30Days: number;
  };
}> {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    totalLogs,
    logsWithTTL,
    expiredLogs,
    logsExpiring7Days,
    logsExpiring30Days,
    totalAcceptances,
    acceptancesWithTTL,
    expiredAcceptances,
    acceptancesExpiring7Days,
    acceptancesExpiring30Days,
  ] = await Promise.all([
    prisma.verificationLog.count(),
    prisma.verificationLog.count({ where: { expiresAt: { not: null } } }),
    prisma.verificationLog.count({ where: { expiresAt: { lt: now, not: null } } }),
    prisma.verificationLog.count({ where: { expiresAt: { gte: now, lt: in7Days } } }),
    prisma.verificationLog.count({ where: { expiresAt: { gte: now, lt: in30Days } } }),
    prisma.providerPlanAcceptance.count(),
    prisma.providerPlanAcceptance.count({ where: { expiresAt: { not: null } } }),
    prisma.providerPlanAcceptance.count({ where: { expiresAt: { lt: now, not: null } } }),
    prisma.providerPlanAcceptance.count({ where: { expiresAt: { gte: now, lt: in7Days } } }),
    prisma.providerPlanAcceptance.count({ where: { expiresAt: { gte: now, lt: in30Days } } }),
  ]);

  return {
    verificationLogs: {
      total: totalLogs,
      withTTL: logsWithTTL,
      expired: expiredLogs,
      expiringWithin7Days: logsExpiring7Days,
      expiringWithin30Days: logsExpiring30Days,
    },
    planAcceptances: {
      total: totalAcceptances,
      withTTL: acceptancesWithTTL,
      expired: expiredAcceptances,
      expiringWithin7Days: acceptancesExpiring7Days,
      expiringWithin30Days: acceptancesExpiring30Days,
    },
  };
}
