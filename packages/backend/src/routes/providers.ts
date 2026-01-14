import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { searchRateLimiter } from '../middleware/rateLimiter';
import {
  searchProviders,
  getProviderByNpi,
  getProviderAcceptedPlans,
  getProviderDisplayName,
  getCitiesByState,
} from '../services/providerService';
import { getConfidenceLevel, getConfidenceLevelDescription } from '../services/confidenceService';
import { getColocatedProviders } from '../services/locationService';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  zipCode: z.string().min(3).max(10).optional(),
  specialty: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const npiParamSchema = z.object({
  npi: z.string().length(10).regex(/^\d+$/, 'NPI must be exactly 10 digits'),
});

const plansQuerySchema = z.object({
  status: z.enum(['ACCEPTED', 'NOT_ACCEPTED', 'PENDING', 'UNKNOWN']).optional(),
  minConfidence: z.coerce.number().min(0).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/v1/providers/search
 * Search providers with filters
 */
router.get(
  '/search',
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const query = searchQuerySchema.parse(req.query);

    const result = await searchProviders({
      state: query.state,
      city: query.city,
      zipCode: query.zipCode,
      specialty: query.specialty,
      name: query.name,
      npi: query.npi,
      entityType: query.entityType,
      page: query.page,
      limit: query.limit,
    });

    res.json({
      success: true,
      data: {
        providers: result.providers.map((p) => ({
          ...p,
          displayName: getProviderDisplayName(p),
        })),
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
 * GET /api/v1/providers/cities
 * Get unique cities for a state
 */
router.get(
  '/cities',
  asyncHandler(async (req, res) => {
    const stateSchema = z.object({
      state: z.string().length(2).toUpperCase(),
    });

    const { state } = stateSchema.parse(req.query);
    const cities = await getCitiesByState(state);

    res.json({
      success: true,
      data: {
        state,
        cities,
        count: cities.length,
      },
    });
  })
);

/**
 * GET /api/v1/providers/:npi
 * Get provider by NPI
 */
router.get(
  '/:npi',
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
          ...provider,
          displayName: getProviderDisplayName(provider),
          planAcceptances: provider.planAcceptances.map((pa) => ({
            ...pa,
            confidenceLevel: getConfidenceLevel(pa.confidenceScore, pa.verificationCount),
            confidenceDescription: getConfidenceLevelDescription(
              getConfidenceLevel(pa.confidenceScore, pa.verificationCount),
              pa.verificationCount
            ),
          })),
        },
      },
    });
  })
);

/**
 * GET /api/v1/providers/:npi/plans
 * Get accepted plans for a provider
 */
router.get(
  '/:npi/plans',
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
        acceptances: result.acceptances.map((a) => ({
          ...a,
          confidenceLevel: getConfidenceLevel(a.confidenceScore, a.verificationCount),
          confidenceDescription: getConfidenceLevelDescription(
            getConfidenceLevel(a.confidenceScore, a.verificationCount),
            a.verificationCount
          ),
        })),
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
 * GET /api/v1/providers/:npi/colocated
 * Get other providers at the same location as this provider
 */
router.get(
  '/:npi/colocated',
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
          ...p,
          displayName: getProviderDisplayName(p),
        })),
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

export default router;
