import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getPaginationValues } from './utils';

export interface PlanSearchParams {
  issuerName?: string;
  carrier?: string;
  planType?: string;
  planVariant?: string;
  search?: string;
  state?: string;
  sourceHealthSystem?: string;
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
    carrier,
    planType,
    planVariant,
    search,
    state,
    sourceHealthSystem,
  } = params;
  const { take, skip, page } = getPaginationValues(params.page, params.limit);

  const where: Prisma.InsurancePlanWhereInput = {
    ...(issuerName && { issuerName: { contains: issuerName, mode: 'insensitive' as const } }),
    ...(carrier && { carrier: { contains: carrier, mode: 'insensitive' as const } }),
    ...(planType && { planType: { contains: planType, mode: 'insensitive' as const } }),
    ...(planVariant && { planVariant: { contains: planVariant, mode: 'insensitive' as const } }),
    ...(state && { state: state.toUpperCase() }),
    ...(sourceHealthSystem && { sourceHealthSystem: { contains: sourceHealthSystem, mode: 'insensitive' as const } }),
  };

  // Add search filter (searches across carrier, issuerName, planName, rawName)
  if (search) {
    where.OR = [
      { carrier: { contains: search, mode: 'insensitive' } },
      { issuerName: { contains: search, mode: 'insensitive' } },
      { planName: { contains: search, mode: 'insensitive' } },
      { rawName: { contains: search, mode: 'insensitive' } },
      { planId: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [plans, total] = await Promise.all([
    prisma.insurancePlan.findMany({
      where,
      take,
      skip,
      orderBy: [{ carrier: 'asc' }, { planName: 'asc' }],
    }),
    prisma.insurancePlan.count({ where }),
  ]);

  return { plans, total, page, limit: take, totalPages: Math.ceil(total / take) };
}

/**
 * Get plan by planId
 */
export async function getPlanByPlanId(planId: string) {
  const plan = await prisma.insurancePlan.findUnique({
    where: { planId },
    include: {
      _count: {
        select: {
          providerAcceptances: true,
        },
      },
    },
  });

  if (!plan) return null;

  return {
    ...plan,
    // Use stored providerCount, fallback to _count if not set
    providerCount: plan.providerCount || plan._count.providerAcceptances,
  };
}

/**
 * Get all unique carriers
 */
export async function getCarriers(options: {
  state?: string;
  sourceHealthSystem?: string;
} = {}) {
  const { state, sourceHealthSystem } = options;

  const where: Prisma.InsurancePlanWhereInput = {
    carrier: { not: null },
  };

  if (state) {
    where.state = state.toUpperCase();
  }

  if (sourceHealthSystem) {
    where.sourceHealthSystem = { contains: sourceHealthSystem, mode: 'insensitive' };
  }

  const plans = await prisma.insurancePlan.findMany({
    where,
    select: {
      carrier: true,
    },
    distinct: ['carrier'],
    orderBy: { carrier: 'asc' },
  });

  return plans
    .filter(p => p.carrier)
    .map(p => p.carrier!);
}

/**
 * Get all unique plan variants
 */
export async function getPlanVariants(options: {
  state?: string;
  carrier?: string;
} = {}) {
  const { state, carrier } = options;

  const where: Prisma.InsurancePlanWhereInput = {
    planVariant: { not: null },
  };

  if (state) {
    where.state = state.toUpperCase();
  }

  if (carrier) {
    where.carrier = { contains: carrier, mode: 'insensitive' };
  }

  const plans = await prisma.insurancePlan.findMany({
    where,
    select: {
      planVariant: true,
    },
    distinct: ['planVariant'],
    orderBy: { planVariant: 'asc' },
  });

  return plans
    .filter(p => p.planVariant)
    .map(p => p.planVariant!);
}

/**
 * Get all unique source health systems
 */
export async function getSourceHealthSystems() {
  const plans = await prisma.insurancePlan.findMany({
    where: {
      sourceHealthSystem: { not: null },
    },
    select: {
      sourceHealthSystem: true,
    },
    distinct: ['sourceHealthSystem'],
    orderBy: { sourceHealthSystem: 'asc' },
  });

  return plans
    .filter(p => p.sourceHealthSystem)
    .map(p => p.sourceHealthSystem!);
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
 * Get plans grouped by carrier for dropdown display
 */
export interface GroupedPlansResult {
  carriers: {
    carrier: string;
    plans: {
      planId: string;
      planName: string | null;
      planType: string | null;
    }[];
  }[];
  totalPlans: number;
}

export async function getGroupedPlans(options: {
  search?: string;
  state?: string;
} = {}): Promise<GroupedPlansResult> {
  const { search, state } = options;

  const where: Prisma.InsurancePlanWhereInput = {
    carrier: { not: null },
  };

  if (state) {
    where.state = state.toUpperCase();
  }

  if (search) {
    where.OR = [
      { carrier: { contains: search, mode: 'insensitive' } },
      { planName: { contains: search, mode: 'insensitive' } },
      { rawName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const plans = await prisma.insurancePlan.findMany({
    where,
    select: {
      planId: true,
      planName: true,
      planType: true,
      carrier: true,
    },
    orderBy: [{ carrier: 'asc' }, { planName: 'asc' }],
  });

  // Group plans by carrier
  const carrierMap = new Map<string, { planId: string; planName: string | null; planType: string | null }[]>();

  for (const plan of plans) {
    if (!plan.carrier) continue;

    const existing = carrierMap.get(plan.carrier) || [];
    existing.push({
      planId: plan.planId,
      planName: plan.planName,
      planType: plan.planType,
    });
    carrierMap.set(plan.carrier, existing);
  }

  const carriers = Array.from(carrierMap.entries()).map(([carrier, carrierPlans]) => ({
    carrier,
    plans: carrierPlans,
  }));

  return {
    carriers,
    totalPlans: plans.length,
  };
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
