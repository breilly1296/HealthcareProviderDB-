import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { searchRateLimiter, defaultRateLimiter } from '../middleware/rateLimiter';
import {
  searchPlans,
  getPlanByPlanId,
  getIssuers,
  getPlanTypes,
  getProvidersForPlan,
} from '../services/planService';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  issuerName: z.string().min(1).max(200).optional(),
  planType: z.string().min(1).max(20).optional(),
  search: z.string().min(1).max(200).optional(),
  state: z.string().length(2).toUpperCase().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const planIdParamSchema = z.object({
  planId: z.string().min(1).max(50),
});

const issuersQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
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
      issuerName: query.issuerName,
      planType: query.planType,
      search: query.search,
      state: query.state,
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
 * Get list of unique insurance issuers
 */
router.get(
  '/meta/issuers',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const query = issuersQuerySchema.parse(req.query);

    const issuers = await getIssuers({
      state: query.state,
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
    const query = z.object({
      state: z.string().length(2).toUpperCase().optional(),
      issuerName: z.string().min(1).max(200).optional(),
    }).parse(req.query);

    const types = await getPlanTypes({
      state: query.state,
      issuerName: query.issuerName,
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
 * GET /api/v1/plans/:planId/providers
 * Get providers who accept a specific plan
 * Note: This route must be defined BEFORE /:planId to avoid route conflicts
 */
router.get(
  '/:planId/providers',
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const { planId } = planIdParamSchema.parse(req.params);
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(req.query);

    const result = await getProvidersForPlan(planId, {
      page: query.page,
      limit: query.limit,
    });

    if (!result) {
      throw AppError.notFound(`Plan with ID ${planId} not found`);
    }

    res.json({
      success: true,
      data: {
        providers: result.providers,
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
