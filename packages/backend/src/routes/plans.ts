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
 * Search insurance plans with filters.
 *
 * Caching: 5-min TTL (CACHE_TTL.DEFAULT) — same window as
 * /providers/search. Plan rows are import-driven so they barely shift
 * between imports; a short cache absorbs the dropdown chatter from the
 * frontend without serving stale data after a fresh plan import.
 *
 * Cache key sits under the `plans:` namespace (same as /plans/grouped),
 * so POST /api/v1/admin/cache/clear — which wipes the entire `cache:*`
 * keyspace — automatically catches plan-search entries.
 */
router.get(
  '/search',
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const query = searchQuerySchema.parse(req.query);

    // Deterministic key: lowercase + trim string params, '_' for missing.
    // All four string params are Zod-bounded to <=200 chars so the joined
    // key stays well under any Redis key-length limit; no hash needed.
    const norm = (v: string | undefined) => (v ? v.toLowerCase().trim() : '_');
    const cacheKey = [
      'plans:search',
      norm(query.search),
      norm(query.issuerName),
      norm(query.planType),
      query.state ?? '_',
      query.page,
      query.limit,
    ].join(':');

    interface CachedPlanSearch {
      plans: Awaited<ReturnType<typeof searchPlans>>['plans'];
      pagination: ReturnType<typeof buildPaginationMeta>;
    }

    const cached = await cacheGet<CachedPlanSearch>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached });
      return;
    }
    res.setHeader('X-Cache', 'MISS');

    const result = await searchPlans({
      issuerName: query.issuerName,
      planType: query.planType,
      search: query.search,
      state: query.state,
      page: query.page,
      limit: query.limit,
    });

    const responseData: CachedPlanSearch = {
      plans: result.plans,
      pagination: buildPaginationMeta(result.total, result.page, result.limit),
    };

    // Skip caching empty result sets so a typo doesn't lock in a "no
    // plans" response for 5 minutes — mirrors the /providers/search
    // policy at routes/providers.ts:295.
    if (result.plans.length > 0) {
      await cacheSet(cacheKey, responseData, CACHE_TTL.DEFAULT);
    }

    res.json({ success: true, data: responseData });
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
 * Get providers who accept a specific plan.
 * Note: This route must be defined BEFORE /:planId to avoid route conflicts
 *
 * Caching: 5-min TTL (CACHE_TTL.DEFAULT). Cache key includes pagination
 * params because different pages return different result sets. Sits in the
 * `plans:` namespace so POST /api/v1/admin/cache/clear catches it via the
 * global `cache:*` wipe.
 */
router.get(
  '/:planId/providers',
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const { planId } = planIdParamSchema.parse(req.params);
    const query = paginationSchema.parse(req.query);

    // Cache key versioned (`v2`) so the rollout that enriched this response
    // shape (real addressLine1/zip/credential/specialtyCategory/npiStatus
    // instead of hardcoded nulls) auto-invalidates any v1 entries left in
    // Redis from a prior deploy. v1 entries orphan and expire naturally at
    // their 5-min TTL; no runtime cache-clear needed.
    const cacheKey = `plans:providers:v2:${planId}:${query.page}:${query.limit}`;

    interface CachedPlanProviders {
      providers: Array<Record<string, unknown>>;
      pagination: ReturnType<typeof buildPaginationMeta>;
    }

    const cached = await cacheGet<CachedPlanProviders>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached });
      return;
    }
    res.setHeader('X-Cache', 'MISS');

    const result = await getProvidersForPlan(planId, {
      page: query.page,
      limit: query.limit,
    });

    if (!result) {
      // Don't cache 404s — same policy as /:planId. A plan that's missing
      // today might exist after the next import.
      throw AppError.notFound(`Plan with ID ${planId} not found`);
    }

    const responseData: CachedPlanProviders = {
      providers: result.providers.map((p) => ({
        id: p.npi,
        npi: p.npi,
        entityType: p.entityType,
        firstName: p.firstName,
        lastName: p.lastName,
        middleName: null, // not selected by getProvidersForPlan; add to service if ProviderCard needs it
        credential: p.credential,
        organizationName: p.organizationName,
        addressLine1: p.addressLine1,
        addressLine2: p.addressLine2,
        city: p.city,
        state: p.state,
        zip: p.zipCode,
        phone: p.phone,
        taxonomyCode: p.primaryTaxonomyCode,
        taxonomyDescription: p.specialty,
        specialtyCategory: p.specialtyCategory,
        // Schema's deactivationDate is VarChar(10); a non-empty string means
        // the provider is currently deactivated. (Doesn't model the rare
        // deactivate-then-reactivate case — same simplification used
        // elsewhere; the routes/providers.ts transform behaves the same way.)
        npiStatus: p.deactivationDate ? 'INACTIVE' : 'ACTIVE',
        displayName: p.displayName,
        confidenceScore: p.confidenceScore,
        lastVerified: p.lastVerified,
        verificationCount: p.verificationCount,
      })),
      pagination: buildPaginationMeta(result.total, result.page, result.limit),
    };

    // Skip caching empty result sets — mirrors the /search and /:planId
    // policies. A typo or pathological page request shouldn't pin "no
    // providers" for 5 minutes.
    if (responseData.providers.length > 0) {
      await cacheSet(cacheKey, responseData, CACHE_TTL.DEFAULT);
    }

    res.json({ success: true, data: responseData });
  })
);

/**
 * GET /api/v1/plans/:planId
 * Get plan by planId.
 *
 * Caching: 5-min TTL (CACHE_TTL.DEFAULT) — same window as /plans/search.
 * Plan rows are import-driven so a short cache absorbs detail-page reload
 * chatter without serving stale data after a fresh plan import. Cache
 * key sits under the `plans:` namespace, so POST /api/v1/admin/cache/clear
 * — which wipes the entire `cache:*` keyspace — automatically catches
 * plan-detail entries.
 */
router.get(
  '/:planId',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { planId } = planIdParamSchema.parse(req.params);

    const cacheKey = `plans:detail:${planId}`;

    interface CachedPlanDetail {
      plan: ReturnType<typeof buildPlanResponse>;
    }

    const cached = await cacheGet<CachedPlanDetail>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached });
      return;
    }
    res.setHeader('X-Cache', 'MISS');

    const plan = await getPlanByPlanId(planId);

    if (!plan) {
      // Don't cache 404s — a plan that's missing today might exist after
      // the next import; we'd rather pay the DB miss than pin a 404.
      throw AppError.notFound(`Plan with ID ${planId} not found`);
    }

    const responseData: CachedPlanDetail = {
      plan: buildPlanResponse(plan),
    };

    await cacheSet(cacheKey, responseData, CACHE_TTL.DEFAULT);

    res.json({ success: true, data: responseData });
  })
);

// Local helper kept beside the route so the cached payload shape and the
// fresh-DB payload shape can never drift. `getPlanByPlanId` returns the
// raw Prisma row with `_count.providerAcceptances`; the API exposes the
// same row plus a flat `providerCount`.
function buildPlanResponse(
  plan: NonNullable<Awaited<ReturnType<typeof getPlanByPlanId>>>
) {
  return {
    ...plan,
    providerCount: plan._count.providerAcceptances,
  };
}

export default router;
