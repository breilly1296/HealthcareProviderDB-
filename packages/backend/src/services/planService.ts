import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getPaginationValues } from './utils';

export interface PlanSearchParams {
  issuerName?: string;
  planType?: string;
  search?: string;
  state?: string;
  page?: number;
  limit?: number;
}

export interface PlanSearchResult {
  plans: Awaited<ReturnType<typeof prisma.insurancePlan.findMany>>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Search insurance plans with filters and pagination
 */
export async function searchPlans(params: PlanSearchParams): Promise<PlanSearchResult> {
  const {
    issuerName,
    planType,
    search,
    state,
  } = params;
  const { take, skip, page } = getPaginationValues(params.page, params.limit);

  const where: Prisma.InsurancePlanWhereInput = {
    ...(issuerName && { issuerName: { contains: issuerName, mode: 'insensitive' as const } }),
    ...(planType && { planType: { contains: planType, mode: 'insensitive' as const } }),
    ...(state && { state: state.toUpperCase() }),
  };

  // Add search filter (searches across issuerName, planName)
  if (search) {
    where.OR = [
      { issuerName: { contains: search, mode: 'insensitive' } },
      { planName: { contains: search, mode: 'insensitive' } },
      { planId: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [plans, total] = await Promise.all([
    prisma.insurancePlan.findMany({
      where,
      take,
      skip,
      orderBy: [{ issuerName: 'asc' }, { planName: 'asc' }],
    }),
    prisma.insurancePlan.count({ where }),
  ]);

  return { plans, total, page, limit: take, totalPages: Math.ceil(total / take) };
}

/**
 * Get plan by planId
 */
export async function getPlanByPlanId(planId: string) {
  return prisma.insurancePlan.findUnique({
    where: { planId },
    include: {
      _count: {
        select: {
          providerAcceptances: true,
        },
      },
    },
  });
}

/**
 * Get all unique issuers
 */
export async function getIssuers(options: {
  state?: string;
} = {}) {
  const { state } = options;

  const where: Prisma.InsurancePlanWhereInput = {
    issuerName: { not: null },
  };

  if (state) {
    where.state = state.toUpperCase();
  }

  const plans = await prisma.insurancePlan.findMany({
    where,
    select: {
      issuerName: true,
    },
    distinct: ['issuerName'],
    orderBy: { issuerName: 'asc' },
  });

  return plans
    .filter(p => p.issuerName)
    .map(p => p.issuerName!);
}

/**
 * Get plan types available
 */
export async function getPlanTypes(options: {
  state?: string;
  issuerName?: string;
} = {}) {
  const { state, issuerName } = options;

  const where: Prisma.InsurancePlanWhereInput = {
    planType: { not: null },
  };

  if (state) {
    where.state = state.toUpperCase();
  }

  if (issuerName) {
    where.issuerName = { contains: issuerName, mode: 'insensitive' };
  }

  const plans = await prisma.insurancePlan.findMany({
    where,
    select: {
      planType: true,
    },
    distinct: ['planType'],
    orderBy: { planType: 'asc' },
  });

  return plans
    .filter(p => p.planType)
    .map(p => p.planType!);
}

/**
 * Get providers who accept a specific plan
 */
export async function getProvidersForPlan(
  planId: string,
  options: { page?: number; limit?: number } = {}
) {
  const { take, skip, page } = getPaginationValues(options.page, options.limit);

  // Verify plan exists
  const plan = await prisma.insurancePlan.findUnique({
    where: { planId },
    select: { planId: true },
  });

  if (!plan) {
    return null;
  }

  const where: Prisma.ProviderPlanAcceptanceWhereInput = {
    planId: planId,
    acceptanceStatus: 'ACCEPTED',
    provider: { isNot: null },
  };

  const [acceptances, total] = await Promise.all([
    prisma.providerPlanAcceptance.findMany({
      where,
      take,
      skip,
      orderBy: { confidenceScore: 'desc' },
      include: {
        provider: {
          select: {
            npi: true,
            firstName: true,
            lastName: true,
            organizationName: true,
            entityType: true,
            specialty: true,
            city: true,
            state: true,
            phone: true,
          },
        },
      },
    }),
    prisma.providerPlanAcceptance.count({ where }),
  ]);

  const providers = acceptances
    .filter(a => a.provider)
    .map(a => ({
      ...a.provider!,
      displayName: a.provider!.entityType === 'ORGANIZATION'
        ? a.provider!.organizationName || 'Unknown Organization'
        : `${a.provider!.firstName || ''} ${a.provider!.lastName || ''}`.trim() || 'Unknown Provider',
      confidenceScore: a.confidenceScore,
      lastVerified: a.lastVerified,
      verificationCount: a.verificationCount,
    }));

  return {
    providers,
    total,
    page,
    limit: take,
    totalPages: Math.ceil(total / take),
  };
}
