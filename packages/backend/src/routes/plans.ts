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
import { cacheGet, cacheSet, CACHE_TTL } from '../utils/cache';

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

    // 15 min TTL — grouped plans change less often than raw search but more
    // often than pure metadata (a new carrier joining a state's exchange).
    const cacheKey = `plans:grouped:${query.search?.toLowerCase() ?? '_'}:${query.state ?? '_'}`;
    const cached = await cacheGet<Awaited<ReturnType<typeof getGroupedPlans>>>(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    const result = await getGroupedPlans({
      search: query.search,
      state: query.state,
    });
    await cacheSet(cacheKey, result, CACHE_TTL.AGGREGATION);

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

    // 30 min TTL — issuer list only moves when plan data is imported.
    const cacheKey = `meta:issuers:${query.state ?? 'ALL'}`;
    const cached = await cacheGet<{ issuers: unknown; count: number }>(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    const issuers = await getIssuers({
      state: query.state,
    });
    const payload = { issuers, count: issuers.length };
    await cacheSet(cacheKey, payload, CACHE_TTL.METADATA);

    sendSuccess(res, payload);
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

    // 30 min TTL — plan types are a closed enum per (state, issuer) pair.
    const cacheKey = `meta:types:${query.state ?? 'ALL'}:${query.issuerName?.toLowerCase() ?? 'ALL'}`;
    const cached = await cacheGet<{ planTypes: string[]; count: number }>(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    const types = await getPlanTypes({
      state: query.state,
      issuerName: query.issuerName,
    });
    const payload = { planTypes: types, count: types.length };
    await cacheSet(cacheKey, payload, CACHE_TTL.METADATA);

    sendSuccess(res, payload);
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
