import { Prisma, VerificationType, VerificationSource } from '@prisma/client';
import prisma from '../lib/prisma';
import { calculateConfidenceScore } from './confidenceService';
import { AppError } from '../middleware/errorHandler';

/**
 * Research-based verification input
 * Based on Mortensen et al. (2015), JAMIA: Simple binary questions achieve highest accuracy
 */
export interface SubmitVerificationInput {
  npi: string;
  planId: string;

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

  // Find provider
  const provider = await prisma.provider.findUnique({
    where: { npi },
    select: { npi: true },
  });

  if (!provider) {
    throw AppError.notFound(`Provider with NPI ${npi} not found`);
  }

  // Find plan (planId is now the primary key)
  const plan = await prisma.insurancePlan.findUnique({
    where: { planId },
    select: { planId: true },
  });

  if (!plan) {
    throw AppError.notFound(`Plan with ID ${planId} not found`);
  }

  // Find or create acceptance record
  let acceptance = await prisma.providerPlanAcceptance.findUnique({
    where: {
      providerNpi_planId: {
        providerNpi: provider.npi,
        planId: plan.planId,
      },
    },
  });

  const previousValue = acceptance ? {
    acceptanceStatus: acceptance.acceptanceStatus,
    confidenceScore: acceptance.confidenceScore,
  } : null;

  const newStatus = acceptsInsurance ? 'ACCEPTED' : 'NOT_ACCEPTED';

  // Create verification log
  const verification = await prisma.verificationLog.create({
    data: {
      providerNpi: provider.npi,
      planId: plan.planId,
      acceptanceId: acceptance?.id.toString(),
      verificationType: VerificationType.PLAN_ACCEPTANCE,
      verificationSource: VerificationSource.CROWDSOURCE,
      previousValue: previousValue as Prisma.InputJsonValue,
      newValue: {
        acceptanceStatus: newStatus,
        acceptsNewPatients,
        // Research-based contact verification
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
    },
  });

  // Update or create acceptance record
  if (acceptance) {
    // Get existing verification stats
    const verificationCount = (acceptance.verificationCount || 0) + 1;

    // Query all past verifications for this provider-plan pair to count agreement
    const pastVerifications = await prisma.verificationLog.findMany({
      where: {
        providerNpi: provider.npi,
        planId: plan.planId,
        verificationType: VerificationType.PLAN_ACCEPTANCE,
      },
      select: {
        newValue: true,
      },
    });

    // Count how many past verifications agree with the NEW status
    // Agreement means their newValue.acceptanceStatus matches our newStatus
    let upvotes = 1; // Start with 1 for the current verification (it agrees with itself)
    let downvotes = 0;

    for (const v of pastVerifications) {
      const pastValue = v.newValue as { acceptanceStatus?: string } | null;
      if (pastValue?.acceptanceStatus === newStatus) {
        upvotes++;
      } else if (pastValue?.acceptanceStatus) {
        downvotes++;
      }
    }

    // Calculate new confidence score with accurate agreement data
    const { score, factors } = calculateConfidenceScore({
      dataSource: VerificationSource.CROWDSOURCE,
      lastVerifiedAt: new Date(),
      verificationCount,
      upvotes,
      downvotes,
    });

    // Security fix: Only change acceptanceStatus when consensus is reached
    // Requires: verificationCount >= 3, score >= 60, and clear majority (2:1 ratio)
    const hasClearMajority = upvotes > downvotes * 2 || downvotes > upvotes * 2;
    const shouldUpdateStatus = verificationCount >= 3 && score >= 60 && hasClearMajority;

    let finalStatus: string;
    if (shouldUpdateStatus) {
      // Consensus reached - update status based on majority
      finalStatus = upvotes > downvotes ? 'ACCEPTED' : 'NOT_ACCEPTED';
    } else {
      // No consensus - keep existing status, or set to PENDING if currently UNKNOWN
      finalStatus = acceptance.acceptanceStatus === 'UNKNOWN'
        ? 'PENDING'
        : acceptance.acceptanceStatus || 'PENDING';
    }

    acceptance = await prisma.providerPlanAcceptance.update({
      where: { id: acceptance.id },
      data: {
        acceptanceStatus: finalStatus,
        lastVerified: new Date(),
        verificationCount,
        confidenceScore: score,
      },
    });
  } else {
    const { score, factors } = calculateConfidenceScore({
      dataSource: VerificationSource.CROWDSOURCE,
      lastVerifiedAt: new Date(),
      verificationCount: 1,
      upvotes: 1,
      downvotes: 0,
    });

    // Security fix: First verification cannot set ACCEPTED/NOT_ACCEPTED
    // Status starts as PENDING until consensus threshold is reached
    acceptance = await prisma.providerPlanAcceptance.create({
      data: {
        providerNpi: provider.npi,
        planId: plan.planId,
        acceptanceStatus: 'PENDING',
        lastVerified: new Date(),
        verificationCount: 1,
        confidenceScore: score,
      },
    });

    // Update verification with acceptance ID
    await prisma.verificationLog.update({
      where: { id: verification.id },
      data: { acceptanceId: acceptance.id.toString() },
    });
  }

  return {
    verification: stripVerificationPII(verification),
    acceptance,
  };
}

/**
 * Vote on a verification
 */
export async function voteOnVerification(
  verificationId: string,
  vote: 'up' | 'down'
) {
  const verification = await prisma.verificationLog.update({
    where: { id: verificationId },
    data: {
      upvotes: vote === 'up' ? { increment: 1 } : undefined,
      downvotes: vote === 'down' ? { increment: 1 } : undefined,
    },
  });

  // Update confidence score on the acceptance
  if (verification.acceptanceId) {
    const acceptanceRecord = await prisma.providerPlanAcceptance.findUnique({
      where: { id: parseInt(verification.acceptanceId) },
    });

    if (acceptanceRecord) {
      const { score, factors } = calculateConfidenceScore({
        dataSource: VerificationSource.CROWDSOURCE,
        lastVerifiedAt: acceptanceRecord.lastVerified,
        verificationCount: acceptanceRecord.verificationCount || 0,
        upvotes: verification.upvotes,
        downvotes: verification.downvotes,
      });

      await prisma.providerPlanAcceptance.update({
        where: { id: acceptanceRecord.id },
        data: {
          confidenceScore: score,
        },
      });
    }
  }

  return stripVerificationPII(verification);
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
} = {}) {
  const { limit = 20, npi, planId } = options;

  const where: Prisma.VerificationLogWhereInput = {};

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
export async function getVerificationsForPair(npi: string, planId: string) {
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

  const [acceptance, verifications] = await Promise.all([
    prisma.providerPlanAcceptance.findUnique({
      where: {
        providerNpi_planId: {
          providerNpi: provider.npi,
          planId: plan.planId,
        },
      },
    }),
    // Security: Exclude PII fields (sourceIp, userAgent, submittedBy)
    prisma.verificationLog.findMany({
      where: {
        providerNpi: provider.npi,
        planId: plan.planId,
      },
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
          upvotes: true,
        downvotes: true,
        // Exclude: sourceIp, userAgent, submittedBy
      },
    }),
  ]);

  return {
    acceptance,
    verifications,
    summary: {
      totalVerifications: verifications.length,
      totalUpvotes: verifications.reduce((sum, v) => sum + v.upvotes, 0),
      totalDownvotes: verifications.reduce((sum, v) => sum + v.downvotes, 0),
    },
  };
}
