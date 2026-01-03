import { Prisma, VerificationType, VerificationSource, AcceptanceStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { calculateConfidenceScore } from './confidenceService';

export interface SubmitVerificationInput {
  npi: string;
  planId: string;
  acceptsInsurance: boolean;
  acceptsNewPatients?: boolean;
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
 * Submit a new verification
 */
export async function submitVerification(input: SubmitVerificationInput) {
  const { npi, planId, acceptsInsurance, acceptsNewPatients, notes, evidenceUrl, submittedBy, sourceIp, userAgent } = input;

  // Find provider
  const provider = await prisma.provider.findUnique({
    where: { npi },
    select: { id: true },
  });

  if (!provider) {
    throw new Error(`Provider with NPI ${npi} not found`);
  }

  // Find plan
  const plan = await prisma.insurancePlan.findUnique({
    where: { planId },
    select: { id: true },
  });

  if (!plan) {
    throw new Error(`Plan with ID ${planId} not found`);
  }

  // Find or create acceptance record
  let acceptance = await prisma.providerPlanAcceptance.findUnique({
    where: {
      providerId_planId: {
        providerId: provider.id,
        planId: plan.id,
      },
    },
  });

  const previousValue = acceptance ? {
    acceptanceStatus: acceptance.acceptanceStatus,
    acceptsNewPatients: acceptance.acceptsNewPatients,
    confidenceScore: acceptance.confidenceScore,
  } : null;

  const newStatus = acceptsInsurance ? AcceptanceStatus.ACCEPTED : AcceptanceStatus.NOT_ACCEPTED;

  // Create verification log
  const verification = await prisma.verificationLog.create({
    data: {
      providerId: provider.id,
      planId: plan.id,
      acceptanceId: acceptance?.id,
      verificationType: VerificationType.PLAN_ACCEPTANCE,
      verificationSource: VerificationSource.CROWDSOURCE,
      previousValue: previousValue as Prisma.InputJsonValue,
      newValue: {
        acceptanceStatus: newStatus,
        acceptsNewPatients,
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
    const verificationCount = acceptance.verificationCount + 1;

    // Query all past verifications for this provider-plan pair to count agreement
    const pastVerifications = await prisma.verificationLog.findMany({
      where: {
        providerId: provider.id,
        planId: plan.id,
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

    acceptance = await prisma.providerPlanAcceptance.update({
      where: { id: acceptance.id },
      data: {
        acceptanceStatus: newStatus,
        acceptsNewPatients: acceptsNewPatients ?? acceptance.acceptsNewPatients,
        lastVerifiedAt: new Date(),
        verificationSource: VerificationSource.CROWDSOURCE,
        verificationCount,
        confidenceScore: score,
        confidenceFactors: factors as Prisma.InputJsonValue,
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

    acceptance = await prisma.providerPlanAcceptance.create({
      data: {
        providerId: provider.id,
        planId: plan.id,
        acceptanceStatus: newStatus,
        acceptsNewPatients,
        lastVerifiedAt: new Date(),
        verificationSource: VerificationSource.CROWDSOURCE,
        verificationCount: 1,
        confidenceScore: score,
        confidenceFactors: factors as Prisma.InputJsonValue,
      },
    });

    // Update verification with acceptance ID
    await prisma.verificationLog.update({
      where: { id: verification.id },
      data: { acceptanceId: acceptance.id },
    });
  }

  return {
    verification,
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
    const acceptance = await prisma.providerPlanAcceptance.findUnique({
      where: { id: verification.acceptanceId },
    });

    if (acceptance) {
      const { score, factors } = calculateConfidenceScore({
        dataSource: acceptance.verificationSource || VerificationSource.CROWDSOURCE,
        lastVerifiedAt: acceptance.lastVerifiedAt,
        verificationCount: acceptance.verificationCount,
        upvotes: verification.upvotes,
        downvotes: verification.downvotes,
      });

      await prisma.providerPlanAcceptance.update({
        where: { id: acceptance.id },
        data: {
          confidenceScore: score,
          confidenceFactors: factors as Prisma.InputJsonValue,
        },
      });
    }
  }

  return verification;
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
      select: { id: true },
    });
    if (provider) {
      where.providerId = provider.id;
    }
  }

  if (planId) {
    const plan = await prisma.insurancePlan.findUnique({
      where: { planId },
      select: { id: true },
    });
    if (plan) {
      where.planId = plan.id;
    }
  }

  return prisma.verificationLog.findMany({
    where,
    take: Math.min(limit, 100),
    orderBy: { createdAt: 'desc' },
    include: {
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
          carrierName: true,
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
    select: { id: true },
  });

  const plan = await prisma.insurancePlan.findUnique({
    where: { planId },
    select: { id: true },
  });

  if (!provider || !plan) {
    return null;
  }

  const [acceptance, verifications] = await Promise.all([
    prisma.providerPlanAcceptance.findUnique({
      where: {
        providerId_planId: {
          providerId: provider.id,
          planId: plan.id,
        },
      },
    }),
    prisma.verificationLog.findMany({
      where: {
        providerId: provider.id,
        planId: plan.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
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
