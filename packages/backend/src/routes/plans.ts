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
  getGroupedPlans,
} from '../services/planService';
import { paginationSchema, planIdParamSchema, stateQuerySchema } from '../schemas/commonSchemas';
import { buildPaginationMeta, sendSuccess } from '../utils/responseHelpers';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  issuerName: z.string().min(1).max(200).optional(),
  planType: z.string().min(1).max(20).optional(),
  search: z.string().min(1).max(200).optional(),
  state: z.string().length(2).toUpperCase().optional(),
}).merge(paginationSchema);

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
        pagination: buildPaginationMeta(result.total, result.page, result.limit),
      },
    });
  })
);

/**
 * GET /api/v1/plans/grouped
 * Get plans grouped by carrier for dropdown display
 */
router.get(
  '/grouped',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const query = z.object({
      search: z.string().min(1).max(200).optional(),
      state: z.string().length(2).toUpperCase().optional(),
    }).parse(req.query);

    const result = await getGroupedPlans({
      search: query.search,
      state: query.state,
    });

    sendSuccess(res, result);
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
    const query = stateQuerySchema.parse(req.query);

    const issuers = await getIssuers({
      state: query.state,
    });

    sendSuccess(res, { issuers, count: issuers.length });
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
    const query = stateQuerySchema.extend({
      issuerName: z.string().min(1).max(200).optional(),
    }).parse(req.query);

    const types = await getPlanTypes({
      state: query.state,
      issuerName: query.issuerName,
    });

    sendSuccess(res, { planTypes: types, count: types.length });
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
    const query = paginationSchema.parse(req.query);

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
        providers: result.providers.map((p) => ({
          id: p.npi,
          npi: p.npi,
          entityType: p.entityType,
          firstName: p.firstName,
          lastName: p.lastName,
          middleName: null,
          credential: null,
          organizationName: p.organizationName,
          addressLine1: null,
          addressLine2: null,
          city: p.city,
          state: p.state,
          zip: null,
          phone: p.phone,
          taxonomyCode: null,
          taxonomyDescription: p.specialty,
          specialtyCategory: null,
          npiStatus: 'ACTIVE',
          displayName: p.displayName,
          confidenceScore: p.confidenceScore,
          lastVerified: p.lastVerified,
          verificationCount: p.verificationCount,
        })),
        pagination: buildPaginationMeta(result.total, result.page, result.limit),
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
