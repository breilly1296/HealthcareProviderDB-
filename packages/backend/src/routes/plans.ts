import { Router } from 'express';
import { z } from 'zod';
import { PlanType, MetalLevel, MarketType } from '@prisma/client';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { searchRateLimiter, defaultRateLimiter } from '../middleware/rateLimiter';
import {
  searchPlans,
  getPlanByPlanId,
  getIssuers,
  getPlanTypes,
  getPlanYears,
} from '../services/planService';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  carrierName: z.string().min(1).max(200).optional(),
  planType: z.nativeEnum(PlanType).optional(),
  metalLevel: z.nativeEnum(MetalLevel).optional(),
  marketType: z.nativeEnum(MarketType).optional(),
  state: z.string().length(2).toUpperCase().optional(),
  planYear: z.coerce.number().int().min(2020).max(2030).optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const planIdParamSchema = z.object({
  planId: z.string().min(1).max(50),
});

const issuersQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  planYear: z.coerce.number().int().min(2020).max(2030).optional(),
  isActive: z.coerce.boolean().optional(),
});

/**
 * GET /api/v1/plans/search
 * Search insurance plans with filters
 */
router.get(
  '/search',
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const query = searchQuerySchema.parse(req.query);

    const result = await searchPlans({
      carrierName: query.carrierName,
      planType: query.planType,
      metalLevel: query.metalLevel,
      marketType: query.marketType,
      state: query.state,
      planYear: query.planYear,
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });

    res.json({
      success: true,
      data: {
        plans: result.plans,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
          hasMore: result.page < result.totalPages,
        },
      },
    });
  })
);

/**
 * GET /api/v1/plans/meta/issuers
 * Get list of unique insurance issuers/carriers
 */
router.get(
  '/meta/issuers',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const query = issuersQuerySchema.parse(req.query);

    const issuers = await getIssuers({
      state: query.state,
      planYear: query.planYear,
      isActive: query.isActive,
    });

    res.json({
      success: true,
      data: {
        issuers,
        count: issuers.length,
      },
    });
  })
);

/**
 * GET /api/v1/plans/meta/types
 * Get list of available plan types
 */
router.get(
  '/meta/types',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const query = issuersQuerySchema.parse(req.query);

    const types = await getPlanTypes({
      state: query.state,
      isActive: query.isActive,
    });

    res.json({
      success: true,
      data: {
        planTypes: types,
        count: types.length,
      },
    });
  })
);

/**
 * GET /api/v1/plans/meta/years
 * Get list of available plan years
 */
router.get(
  '/meta/years',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const query = z.object({
      isActive: z.coerce.boolean().optional(),
    }).parse(req.query);

    const years = await getPlanYears({
      isActive: query.isActive,
    });

    res.json({
      success: true,
      data: {
        planYears: years,
        count: years.length,
      },
    });
  })
);

/**
 * GET /api/v1/plans/:planId
 * Get plan by planId
 */
router.get(
  '/:planId',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { planId } = planIdParamSchema.parse(req.params);

    const plan = await getPlanByPlanId(planId);

    if (!plan) {
      throw AppError.notFound(`Plan with ID ${planId} not found`);
    }

    res.json({
      success: true,
      data: {
        plan: {
          ...plan,
          providerCount: plan._count.providerAcceptances,
        },
      },
    });
  })
);

export default router;
