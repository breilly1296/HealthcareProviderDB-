import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { searchRateLimiter, defaultRateLimiter } from '../middleware/rateLimiter';
import {
  searchProviders,
  getProviderByNpi,
  getProviderAcceptedPlans,
  getProviderDisplayName,
  getCitiesByState,
} from '../services/providerService';
import { enrichAcceptanceWithConfidence } from '../services/confidenceService';
import { getColocatedProviders } from '../services/locationService';
import { paginationSchema, npiParamSchema } from '../schemas/commonSchemas';
import { buildPaginationMeta, sendSuccess } from '../utils/responseHelpers';
import { cacheGet, cacheSet, generateSearchCacheKey } from '../utils/cache';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  cities: z.string().min(1).max(500).optional(), // Comma-separated cities
  zipCode: z.string().min(3).max(10).optional(),
  healthSystem: z.string().min(1).max(200).optional(),
  specialty: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
  insurancePlanId: z.string().min(1).max(100).optional(),
}).merge(paginationSchema);

const plansQuerySchema = z.object({
  status: z.enum(['ACCEPTED', 'NOT_ACCEPTED', 'PENDING', 'UNKNOWN']).optional(),
  minConfidence: z.coerce.number().min(0).max(100).optional(),
}).merge(paginationSchema);

/**
 * GET /api/v1/providers/search
 * Search providers with filters
 *
 * Caching: Results are cached for 5 minutes to improve performance.
 * Cache is invalidated when new verifications are submitted.
 */
router.get(
  '/search',
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const query = searchQuerySchema.parse(req.query);

    // Generate cache key from search params
    const cacheKey = generateSearchCacheKey({
      state: query.state,
      city: query.city,
      cities: query.cities,
      zipCode: query.zipCode,
      healthSystem: query.healthSystem,
      specialty: query.specialty,
      name: query.name,
      npi: query.npi,
      entityType: query.entityType,
      insurancePlanId: query.insurancePlanId,
      page: query.page,
      limit: query.limit,
    });

    // Check cache first
    interface CachedSearchResult {
      providers: Array<Record<string, unknown>>;
      pagination: ReturnType<typeof buildPaginationMeta>;
    }

    const cachedResult = await cacheGet<CachedSearchResult>(cacheKey);

    if (cachedResult) {
      logger.debug({ cacheKey }, 'Search cache hit');
      res.setHeader('X-Cache', 'HIT');
      res.json({
        success: true,
        data: cachedResult,
      });
      return;
    }

    // Cache miss - query database
    logger.debug({ cacheKey }, 'Search cache miss');
    res.setHeader('X-Cache', 'MISS');

    const result = await searchProviders({
      state: query.state,
      city: query.city,
      cities: query.cities,
      zipCode: query.zipCode,
      healthSystem: query.healthSystem,
      specialty: query.specialty,
      name: query.name,
      npi: query.npi,
      entityType: query.entityType,
      insurancePlanId: query.insurancePlanId,
      page: query.page,
      limit: query.limit,
    });

    // Transform result for response
    const responseData = {
      providers: result.providers.map((p) => {
        // Get highest confidence score from accepted plans
        // Type assertion needed because Prisma include types aren't reflected in service return type
        const providerWithPlans = p as typeof p & {
          planAcceptances?: Array<{
            id: number;
            planId: string | null;
            acceptanceStatus: string;
            confidenceScore: number;
            plan?: { planId: string; planName: string | null; issuerName: string | null } | null;
          }>;
        };
        const acceptedPlans = providerWithPlans.planAcceptances || [];
        const highestConfidence = acceptedPlans.length > 0
          ? Math.max(...acceptedPlans.map((pa) => pa.confidenceScore))
          : null;

        return {
          id: p.npi,
          npi: p.npi,
          entityType: p.entityType,
          firstName: p.firstName,
          lastName: p.lastName,
          middleName: null,
          credential: p.credential,
          organizationName: p.organizationName,
          addressLine1: p.addressLine1,
          addressLine2: p.addressLine2,
          city: p.city,
          state: p.state,
          zip: p.zipCode,
          phone: p.phone,
          // Map backend fields to frontend expected names
          taxonomyCode: p.specialtyCode,
          taxonomyDescription: p.specialty,
          specialtyCategory: null,
          npiStatus: 'ACTIVE',
          displayName: getProviderDisplayName(p),
          // Include confidence and plan data for card preview
          confidenceScore: highestConfidence,
          planAcceptances: acceptedPlans.map((pa) => ({
            id: pa.id,
            planId: pa.planId,
            planName: pa.plan?.planName || null,
            issuerName: pa.plan?.issuerName || null,
            acceptanceStatus: pa.acceptanceStatus,
            confidenceScore: pa.confidenceScore,
          })),
        };
      }),
      pagination: buildPaginationMeta(result.total, result.page, result.limit),
    };

    // Only cache if we have results
    if (result.providers.length > 0) {
      await cacheSet(cacheKey, responseData, 300); // 5 minute TTL
    }

    res.json({
      success: true,
      data: responseData,
    });
  })
);

/**
 * GET /api/v1/providers/cities
 * Get unique cities for a state
 */
router.get(
  '/cities',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const stateSchema = z.object({
      state: z.string().length(2).toUpperCase(),
    });

    const { state } = stateSchema.parse(req.query);
    const cities = await getCitiesByState(state);

    sendSuccess(res, { state, cities, count: cities.length });
  })
);

/**
 * GET /api/v1/providers/:npi
 * Get provider by NPI with full confidence breakdown
 */
router.get(
  '/:npi',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { npi } = npiParamSchema.parse(req.params);

    const provider = await getProviderByNpi(npi);

    if (!provider) {
      throw AppError.notFound(`Provider with NPI ${npi} not found`);
    }

    res.json({
      success: true,
      data: {
        provider: {
          id: provider.npi,
          npi: provider.npi,
          entityType: provider.entityType,
          firstName: provider.firstName,
          lastName: provider.lastName,
          middleName: null,
          credential: provider.credential,
          organizationName: provider.organizationName,
          addressLine1: provider.addressLine1,
          addressLine2: provider.addressLine2,
          city: provider.city,
          state: provider.state,
          zip: provider.zipCode,
          phone: provider.phone,
          taxonomyCode: provider.specialtyCode,
          taxonomyDescription: provider.specialty,
          specialtyCategory: null,
          npiStatus: 'ACTIVE',
          displayName: getProviderDisplayName(provider),
          planAcceptances: provider.planAcceptances.map((pa) =>
            enrichAcceptanceWithConfidence(pa, { specialty: provider.specialty })
          ),
        },
      },
    });
  })
);

/**
 * GET /api/v1/providers/:npi/plans
 * Get accepted plans for a provider with full confidence breakdown
 */
router.get(
  '/:npi/plans',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { npi } = npiParamSchema.parse(req.params);
    const query = plansQuerySchema.parse(req.query);

    const result = await getProviderAcceptedPlans(npi, {
      status: query.status,
      minConfidence: query.minConfidence,
      page: query.page,
      limit: query.limit,
    });

    if (!result) {
      throw AppError.notFound(`Provider with NPI ${npi} not found`);
    }

    res.json({
      success: true,
      data: {
        npi,
        acceptances: result.acceptances.map((a) =>
          enrichAcceptanceWithConfidence(a, { specialty: a.plan?.planType })
        ),
        pagination: buildPaginationMeta(result.total, result.page, result.limit),
      },
    });
  })
);

/**
 * GET /api/v1/providers/:npi/colocated
 * Get other providers at the same location as this provider
 */
router.get(
  '/:npi/colocated',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { npi } = npiParamSchema.parse(req.params);
    const query = plansQuerySchema.parse(req.query);

    const result = await getColocatedProviders(npi, {
      page: query.page,
      limit: query.limit,
    });

    if (!result) {
      throw AppError.notFound(`Provider with NPI ${npi} not found or has no location`);
    }

    res.json({
      success: true,
      data: {
        location: result.location,
        providers: result.providers.map((p) => ({
          id: p.npi,
          npi: p.npi,
          entityType: p.entityType,
          firstName: p.firstName,
          lastName: p.lastName,
          middleName: null,
          credential: p.credential,
          organizationName: p.organizationName,
          addressLine1: p.addressLine1,
          addressLine2: p.addressLine2,
          city: p.city,
          state: p.state,
          zip: p.zipCode,
          phone: p.phone,
          taxonomyCode: p.specialtyCode,
          taxonomyDescription: p.specialty,
          specialtyCategory: null,
          npiStatus: 'ACTIVE',
          displayName: getProviderDisplayName(p),
        })),
        pagination: buildPaginationMeta(result.total, result.page, result.limit),
      },
    });
  })
);

export default router;
