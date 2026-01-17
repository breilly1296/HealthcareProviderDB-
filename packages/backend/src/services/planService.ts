import { Prisma, PlanType, MetalLevel, MarketType } from '@prisma/client';
import prisma from '../lib/prisma';
import { getPaginationValues } from './utils';

export interface PlanSearchParams {
  carrierName?: string;
  carrier?: string;
  planVariant?: string;
  search?: string;
  planType?: PlanType;
  metalLevel?: MetalLevel;
  marketType?: MarketType;
  state?: string;
  planYear?: number;
  isActive?: boolean;
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
    carrierName,
    carrier,
    planVariant,
    search,
    planType,
    metalLevel,
    marketType,
    state,
    planYear,
    isActive = true,
  } = params;
  const { take, skip, page } = getPaginationValues(params.page, params.limit);

  const where: Prisma.InsurancePlanWhereInput = {
    ...(isActive !== undefined && { isActive }),
    ...(carrierName && { carrierName: { contains: carrierName, mode: 'insensitive' as const } }),
    ...(carrier && { carrier: { contains: carrier, mode: 'insensitive' as const } }),
    ...(planVariant && { planVariant: { contains: planVariant, mode: 'insensitive' as const } }),
    ...(planType && { planType }),
    ...(metalLevel && { metalLevel }),
    ...(marketType && { marketType }),
    ...(state && { statesCovered: { has: state.toUpperCase() } }),
    ...(planYear && { planYear }),
  };

  // Add search filter (searches across carrier, planName, rawName)
  if (search) {
    where.OR = [
      { carrier: { contains: search, mode: 'insensitive' } },
      { carrierName: { contains: search, mode: 'insensitive' } },
      { planName: { contains: search, mode: 'insensitive' } },
      { rawName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [plans, total] = await Promise.all([
    prisma.insurancePlan.findMany({
      where,
      take,
      skip,
      orderBy: [{ providerCount: 'desc' }, { carrierName: 'asc' }, { planName: 'asc' }],
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
 * Get all unique issuers/carriers
 */
export async function getIssuers(options: {
  state?: string;
  planYear?: number;
  isActive?: boolean;
} = {}) {
  const { state, planYear, isActive = true } = options;

  const where: Prisma.InsurancePlanWhereInput = {};

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (state) {
    where.statesCovered = { has: state.toUpperCase() };
  }

  if (planYear) {
    where.planYear = planYear;
  }

  const plans = await prisma.insurancePlan.findMany({
    where,
    select: {
      carrierId: true,
      carrierName: true,
    },
    distinct: ['carrierName'],
    orderBy: { carrierName: 'asc' },
  });

  return plans.map(p => ({
    carrierId: p.carrierId,
    carrierName: p.carrierName,
  }));
}

/**
 * Get plan types available
 */
export async function getPlanTypes(options: {
  state?: string;
  carrierName?: string;
  isActive?: boolean;
} = {}) {
  const { state, carrierName, isActive = true } = options;

  const where: Prisma.InsurancePlanWhereInput = {};

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (state) {
    where.statesCovered = { has: state.toUpperCase() };
  }

  if (carrierName) {
    where.carrierName = { contains: carrierName, mode: 'insensitive' };
  }

  const plans = await prisma.insurancePlan.findMany({
    where,
    select: {
      planType: true,
    },
    distinct: ['planType'],
  });

  return plans.map(p => p.planType);
}

/**
 * Get available plan years
 */
export async function getPlanYears(options: { isActive?: boolean } = {}) {
  const { isActive = true } = options;

  const where: Prisma.InsurancePlanWhereInput = {};

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  const plans = await prisma.insurancePlan.findMany({
    where,
    select: {
      planYear: true,
    },
    distinct: ['planYear'],
    orderBy: { planYear: 'desc' },
  });

  return plans.map(p => p.planYear);
}

/**
 * Get unique carriers (normalized)
 */
export async function getCarriers(options: {
  state?: string;
  isActive?: boolean;
} = {}) {
  const { state, isActive = true } = options;

  const where: Prisma.InsurancePlanWhereInput = {
    carrier: { not: null },
  };

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (state) {
    where.statesCovered = { has: state.toUpperCase() };
  }

  const plans = await prisma.insurancePlan.findMany({
    where,
    select: {
      carrier: true,
      _count: {
        select: { providerAcceptances: true },
      },
    },
    distinct: ['carrier'],
    orderBy: { carrier: 'asc' },
  });

  return plans
    .filter(p => p.carrier)
    .map(p => ({
      carrier: p.carrier!,
      providerCount: p._count.providerAcceptances,
    }));
}

/**
 * Get plan variants
 */
export async function getPlanVariants(options: {
  carrier?: string;
  isActive?: boolean;
} = {}) {
  const { carrier, isActive = true } = options;

  const where: Prisma.InsurancePlanWhereInput = {
    planVariant: { not: null },
  };

  if (isActive !== undefined) {
    where.isActive = isActive;
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
 * Get providers who accept a specific plan
 */
export async function getProvidersForPlan(
  planId: string,
  options: { page?: number; limit?: number } = {}
) {
  const { take, skip, page } = getPaginationValues(options.page, options.limit);

  // First get the plan's internal ID
  const plan = await prisma.insurancePlan.findUnique({
    where: { planId },
    select: { id: true },
  });

  if (!plan) {
    return null;
  }

  const where: Prisma.ProviderPlanAcceptanceWhereInput = {
    planId: plan.id,
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
