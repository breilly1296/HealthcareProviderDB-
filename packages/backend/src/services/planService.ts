import { Prisma, PlanType, MetalLevel, MarketType } from '@prisma/client';
import prisma from '../lib/prisma';

export interface PlanSearchParams {
  carrierName?: string;
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
    planType,
    metalLevel,
    marketType,
    state,
    planYear,
    isActive = true,
    page = 1,
    limit = 20,
  } = params;

  const take = Math.min(limit, 100);
  const skip = (page - 1) * take;

  const where: Prisma.InsurancePlanWhereInput = {};

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (carrierName) {
    where.carrierName = { contains: carrierName, mode: 'insensitive' };
  }

  if (planType) {
    where.planType = planType;
  }

  if (metalLevel) {
    where.metalLevel = metalLevel;
  }

  if (marketType) {
    where.marketType = marketType;
  }

  if (state) {
    where.statesCovered = { has: state.toUpperCase() };
  }

  if (planYear) {
    where.planYear = planYear;
  }

  const [plans, total] = await Promise.all([
    prisma.insurancePlan.findMany({
      where,
      take,
      skip,
      orderBy: [
        { carrierName: 'asc' },
        { planName: 'asc' },
      ],
    }),
    prisma.insurancePlan.count({ where }),
  ]);

  return {
    plans,
    total,
    page,
    limit: take,
    totalPages: Math.ceil(total / take),
  };
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
 * Get plan by internal ID
 */
export async function getPlanById(id: string) {
  return prisma.insurancePlan.findUnique({
    where: { id },
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
