/**
 * REST API Routes
 *
 * Endpoints for healthcare provider database:
 *   GET  /providers              - Search providers by state/specialty
 *   GET  /providers/:npi         - Get provider details
 *   GET  /providers/:npi/plans   - Get provider's accepted plans
 *   POST /providers/:npi/verify  - Submit crowdsource verification
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient, Prisma, SpecialtyCategory, AcceptanceStatus, VerificationType, VerificationSource } from '@prisma/client';
import { calculateConfidenceScore, ProviderPlanData } from '../matching/confidence';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const searchProvidersSchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  specialty: z.enum(['endocrinology', 'rheumatology', 'orthopedics', 'internal_medicine', 'family_medicine', 'geriatrics']).optional(),
  city: z.string().min(1).optional(),
  zip: z.string().min(5).max(10).optional(),
  name: z.string().min(2).optional(),
  acceptsNewPatients: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

const verifyProviderSchema = z.object({
  planId: z.string().min(1),
  acceptsInsurance: z.boolean(),
  acceptsNewPatients: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
  evidenceUrl: z.string().url().optional(),
  submittedBy: z.string().email().optional(),
});

const voteSchema = z.object({
  verificationId: z.string().min(1),
  vote: z.enum(['up', 'down']),
});

// Specialty name to enum mapping
const SPECIALTY_MAP: Record<string, SpecialtyCategory> = {
  endocrinology: SpecialtyCategory.ENDOCRINOLOGY,
  rheumatology: SpecialtyCategory.RHEUMATOLOGY,
  orthopedics: SpecialtyCategory.ORTHOPEDICS,
  internal_medicine: SpecialtyCategory.INTERNAL_MEDICINE,
  family_medicine: SpecialtyCategory.FAMILY_MEDICINE,
  geriatrics: SpecialtyCategory.GERIATRICS,
};

// Error handler wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * GET /providers
 * Search providers with filters
 */
router.get('/providers', asyncHandler(async (req: Request, res: Response) => {
  const validation = searchProvidersSchema.safeParse(req.query);

  if (!validation.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: validation.error.issues,
    });
    return;
  }

  const { state, specialty, city, zip, name, acceptsNewPatients, page, limit } = validation.data;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100); // Max 100 per page
  const skip = (pageNum - 1) * limitNum;

  // Build where clause
  const where: Prisma.ProviderWhereInput = {
    npiStatus: 'ACTIVE',
  };

  if (state) {
    where.state = state;
  }

  if (specialty && SPECIALTY_MAP[specialty]) {
    where.specialtyCategory = SPECIALTY_MAP[specialty];
  }

  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }

  if (zip) {
    where.zip = { startsWith: zip.substring(0, 5) };
  }

  if (name) {
    where.OR = [
      { lastName: { contains: name, mode: 'insensitive' } },
      { firstName: { contains: name, mode: 'insensitive' } },
      { organizationName: { contains: name, mode: 'insensitive' } },
    ];
  }

  // Get total count and providers
  const [total, providers] = await Promise.all([
    prisma.provider.count({ where }),
    prisma.provider.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
      select: {
        id: true,
        npi: true,
        entityType: true,
        firstName: true,
        lastName: true,
        credential: true,
        organizationName: true,
        addressLine1: true,
        city: true,
        state: true,
        zip: true,
        phone: true,
        taxonomyCode: true,
        taxonomyDescription: true,
        specialtyCategory: true,
        npiStatus: true,
        _count: {
          select: { planAcceptances: true },
        },
      },
    }),
  ]);

  res.json({
    data: providers.map(p => ({
      ...p,
      planCount: p._count.planAcceptances,
      _count: undefined,
    })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
}));

/**
 * GET /providers/:npi
 * Get detailed provider information
 */
router.get('/providers/:npi', asyncHandler(async (req: Request, res: Response) => {
  const { npi } = req.params;

  if (!/^\d{10}$/.test(npi)) {
    res.status(400).json({ error: 'Invalid NPI format. Must be 10 digits.' });
    return;
  }

  const provider = await prisma.provider.findUnique({
    where: { npi },
    include: {
      planAcceptances: {
        include: {
          plan: {
            select: {
              id: true,
              planId: true,
              planName: true,
              carrierName: true,
              planType: true,
              metalLevel: true,
            },
          },
        },
        orderBy: { confidenceScore: 'desc' },
        take: 10,
      },
      _count: {
        select: {
          planAcceptances: true,
          verificationLogs: true,
        },
      },
    },
  });

  if (!provider) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }

  // Format response
  const response = {
    ...provider,
    planAcceptances: provider.planAcceptances.map(pa => ({
      plan: pa.plan,
      acceptanceStatus: pa.acceptanceStatus,
      acceptsNewPatients: pa.acceptsNewPatients,
      confidenceScore: pa.confidenceScore,
      lastVerifiedAt: pa.lastVerifiedAt,
    })),
    statistics: {
      totalPlansAccepted: provider._count.planAcceptances,
      totalVerifications: provider._count.verificationLogs,
    },
  };

  res.json(response);
}));

/**
 * GET /providers/:npi/plans
 * Get all insurance plans accepted by a provider
 */
router.get('/providers/:npi/plans', asyncHandler(async (req: Request, res: Response) => {
  const { npi } = req.params;
  const { status, minConfidence } = req.query;

  if (!/^\d{10}$/.test(npi)) {
    res.status(400).json({ error: 'Invalid NPI format. Must be 10 digits.' });
    return;
  }

  const provider = await prisma.provider.findUnique({
    where: { npi },
    select: { id: true, npi: true, firstName: true, lastName: true, organizationName: true },
  });

  if (!provider) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }

  // Build filter for plan acceptances
  const where: Prisma.ProviderPlanAcceptanceWhereInput = {
    providerId: provider.id,
  };

  if (status && Object.values(AcceptanceStatus).includes(status as AcceptanceStatus)) {
    where.acceptanceStatus = status as AcceptanceStatus;
  }

  if (minConfidence) {
    const minScore = parseFloat(minConfidence as string);
    if (!isNaN(minScore)) {
      where.confidenceScore = { gte: minScore };
    }
  }

  const planAcceptances = await prisma.providerPlanAcceptance.findMany({
    where,
    include: {
      plan: true,
    },
    orderBy: [
      { acceptanceStatus: 'asc' },
      { confidenceScore: 'desc' },
    ],
  });

  // Recalculate confidence scores with full context
  const plansWithConfidence = await Promise.all(
    planAcceptances.map(async (pa) => {
      // Get verification data for this acceptance
      const verifications = await prisma.verificationLog.aggregate({
        where: { acceptanceId: pa.id },
        _sum: { upvotes: true, downvotes: true },
        _count: true,
      });

      const confidenceData: ProviderPlanData = {
        dataSource: pa.verificationSource,
        dataSourceDate: pa.lastVerifiedAt,
        lastVerifiedAt: pa.lastVerifiedAt,
        verificationSource: pa.verificationSource,
        verificationCount: pa.verificationCount,
        upvotes: verifications._sum.upvotes || 0,
        downvotes: verifications._sum.downvotes || 0,
        userSubmissions: verifications._count,
        planEffectiveDate: pa.plan.effectiveDate,
        planTerminationDate: pa.plan.terminationDate,
        providerLastUpdateDate: null,
        providerStatus: 'ACTIVE',
        acceptanceStatus: pa.acceptanceStatus,
      };

      const confidence = calculateConfidenceScore(confidenceData);

      return {
        plan: {
          id: pa.plan.id,
          planId: pa.plan.planId,
          planName: pa.plan.planName,
          carrierName: pa.plan.carrierName,
          planType: pa.plan.planType,
          metalLevel: pa.plan.metalLevel,
          marketType: pa.plan.marketType,
          isActive: pa.plan.isActive,
        },
        acceptance: {
          status: pa.acceptanceStatus,
          acceptsNewPatients: pa.acceptsNewPatients,
          effectiveDate: pa.effectiveDate,
          terminationDate: pa.terminationDate,
        },
        confidence: {
          score: confidence.score,
          factors: confidence.factors,
          recommendation: confidence.recommendation,
          needsVerification: confidence.needsVerification,
        },
        lastVerifiedAt: pa.lastVerifiedAt,
      };
    })
  );

  res.json({
    provider: {
      npi: provider.npi,
      name: provider.organizationName || `${provider.firstName} ${provider.lastName}`,
    },
    plans: plansWithConfidence,
    summary: {
      total: plansWithConfidence.length,
      accepted: plansWithConfidence.filter(p => p.acceptance.status === 'ACCEPTED').length,
      needsVerification: plansWithConfidence.filter(p => p.confidence.needsVerification).length,
      averageConfidence: plansWithConfidence.length > 0
        ? Math.round(plansWithConfidence.reduce((sum, p) => sum + p.confidence.score, 0) / plansWithConfidence.length)
        : 0,
    },
  });
}));

/**
 * POST /providers/:npi/verify
 * Submit crowdsource verification for a provider's plan acceptance
 */
router.post('/providers/:npi/verify', asyncHandler(async (req: Request, res: Response) => {
  const { npi } = req.params;

  if (!/^\d{10}$/.test(npi)) {
    res.status(400).json({ error: 'Invalid NPI format. Must be 10 digits.' });
    return;
  }

  const validation = verifyProviderSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: validation.error.issues,
    });
    return;
  }

  const { planId, acceptsInsurance, acceptsNewPatients, notes, evidenceUrl, submittedBy } = validation.data;

  // Find provider
  const provider = await prisma.provider.findUnique({
    where: { npi },
    select: { id: true },
  });

  if (!provider) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }

  // Find plan
  const plan = await prisma.insurancePlan.findUnique({
    where: { planId },
    select: { id: true },
  });

  if (!plan) {
    res.status(404).json({ error: 'Insurance plan not found' });
    return;
  }

  // Find or create provider-plan acceptance record
  let acceptance = await prisma.providerPlanAcceptance.findUnique({
    where: {
      providerId_planId: {
        providerId: provider.id,
        planId: plan.id,
      },
    },
  });

  const previousStatus = acceptance?.acceptanceStatus || AcceptanceStatus.UNKNOWN;
  const newStatus = acceptsInsurance ? AcceptanceStatus.ACCEPTED : AcceptanceStatus.NOT_ACCEPTED;

  // Use transaction to update acceptance and create verification log
  const result = await prisma.$transaction(async (tx) => {
    // Upsert acceptance record
    const updatedAcceptance = await tx.providerPlanAcceptance.upsert({
      where: {
        providerId_planId: {
          providerId: provider.id,
          planId: plan.id,
        },
      },
      create: {
        providerId: provider.id,
        planId: plan.id,
        acceptanceStatus: newStatus,
        acceptsNewPatients: acceptsNewPatients ?? null,
        verificationSource: VerificationSource.CROWDSOURCE,
        lastVerifiedAt: new Date(),
        verificationCount: 1,
        confidenceScore: 10, // Initial crowdsource confidence
      },
      update: {
        acceptanceStatus: newStatus,
        acceptsNewPatients: acceptsNewPatients ?? undefined,
        verificationSource: VerificationSource.CROWDSOURCE,
        lastVerifiedAt: new Date(),
        verificationCount: { increment: 1 },
      },
    });

    // Create verification log
    const verificationLog = await tx.verificationLog.create({
      data: {
        providerId: provider.id,
        planId: plan.id,
        acceptanceId: updatedAcceptance.id,
        verificationType: VerificationType.PLAN_ACCEPTANCE,
        verificationSource: VerificationSource.CROWDSOURCE,
        previousValue: { status: previousStatus },
        newValue: {
          status: newStatus,
          acceptsNewPatients: acceptsNewPatients ?? null,
        },
        sourceIp: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
        submittedBy: submittedBy || null,
        notes: notes || null,
        evidenceUrl: evidenceUrl || null,
      },
    });

    return { acceptance: updatedAcceptance, verification: verificationLog };
  });

  res.status(201).json({
    message: 'Verification submitted successfully',
    verification: {
      id: result.verification.id,
      status: result.acceptance.acceptanceStatus,
      verificationCount: result.acceptance.verificationCount,
      submittedAt: result.verification.createdAt,
    },
    note: 'Crowdsource submissions are reviewed before affecting confidence scores.',
  });
}));

/**
 * POST /verifications/:id/vote
 * Vote on a verification submission
 */
router.post('/verifications/:id/vote', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const validation = voteSchema.safeParse({ ...req.body, verificationId: id });

  if (!validation.success) {
    res.status(400).json({
      error: 'Invalid request',
      details: validation.error.issues,
    });
    return;
  }

  const { vote } = validation.data;

  const verification = await prisma.verificationLog.findUnique({
    where: { id },
  });

  if (!verification) {
    res.status(404).json({ error: 'Verification not found' });
    return;
  }

  const updated = await prisma.verificationLog.update({
    where: { id },
    data: vote === 'up'
      ? { upvotes: { increment: 1 } }
      : { downvotes: { increment: 1 } },
  });

  res.json({
    message: 'Vote recorded',
    verification: {
      id: updated.id,
      upvotes: updated.upvotes,
      downvotes: updated.downvotes,
    },
  });
}));

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', asyncHandler(async (_req: Request, res: Response) => {
  const dbCheck = await prisma.$queryRaw`SELECT 1`;
  res.json({
    status: 'healthy',
    database: dbCheck ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /stats
 * Database statistics
 */
router.get('/stats', asyncHandler(async (_req: Request, res: Response) => {
  const [
    providerCount,
    planCount,
    acceptanceCount,
    verificationCount,
    specialtyCounts,
  ] = await Promise.all([
    prisma.provider.count(),
    prisma.insurancePlan.count(),
    prisma.providerPlanAcceptance.count(),
    prisma.verificationLog.count(),
    prisma.provider.groupBy({
      by: ['specialtyCategory'],
      _count: true,
      where: { specialtyCategory: { not: null } },
    }),
  ]);

  res.json({
    providers: providerCount,
    insurancePlans: planCount,
    planAcceptances: acceptanceCount,
    verifications: verificationCount,
    bySpecialty: specialtyCounts.reduce((acc, curr) => {
      if (curr.specialtyCategory) {
        acc[curr.specialtyCategory] = curr._count;
      }
      return acc;
    }, {} as Record<string, number>),
  });
}));

export default router;
