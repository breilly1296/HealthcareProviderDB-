import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { searchRateLimiter } from '../middleware/rateLimiter';
import {
  searchLocations,
  getLocationById,
  getLocationStatsByState,
  getHealthSystems,
} from '../services/locationService';
import { getProviderDisplayName } from '../services/providerService';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  search: z.string().min(1).max(200).optional(),
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  cities: z.string().min(1).max(500).optional(), // Comma-separated cities
  zipCode: z.string().min(3).max(10).optional(),
  healthSystem: z.string().min(1).max(200).optional(),
  minProviders: z.coerce.number().int().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const locationIdSchema = z.object({
  locationId: z.coerce.number().int().positive(),
});

const providersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const stateParamSchema = z.object({
  state: z.string().length(2).toUpperCase(),
});

/**
 * GET /api/v1/locations/search
 * Search locations with filters
 */
router.get(
  '/search',
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const query = searchQuerySchema.parse(req.query);

    const result = await searchLocations({
      search: query.search,
      state: query.state,
      city: query.city,
      cities: query.cities,
      zipCode: query.zipCode,
      healthSystem: query.healthSystem,
      minProviders: query.minProviders,
      page: query.page,
      limit: query.limit,
    });

    res.json({
      success: true,
      data: {
        locations: result.locations,
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
 * GET /api/v1/locations/health-systems
 * Get list of distinct health systems
 */
router.get(
  '/health-systems',
  asyncHandler(async (req, res) => {
    const healthSystems = await getHealthSystems();

    res.json({
      success: true,
      data: {
        healthSystems,
        count: healthSystems.length,
      },
    });
  })
);

/**
 * GET /api/v1/locations/stats/:state
 * Get location statistics for a state
 */
router.get(
  '/stats/:state',
  asyncHandler(async (req, res) => {
    const { state } = stateParamSchema.parse(req.params);

    const stats = await getLocationStatsByState(state);

    res.json({
      success: true,
      data: {
        state,
        ...stats,
      },
    });
  })
);

/**
 * GET /api/v1/locations/:locationId
 * Get location details
 */
router.get(
  '/:locationId',
  asyncHandler(async (req, res) => {
    const { locationId } = locationIdSchema.parse(req.params);

    const result = await getLocationById(locationId, { includeProviders: false });

    if (!result) {
      throw AppError.notFound(`Location with ID ${locationId} not found`);
    }

    res.json({
      success: true,
      data: {
        location: result.location,
      },
    });
  })
);

/**
 * GET /api/v1/locations/:locationId/providers
 * Get all providers at a specific location
 */
router.get(
  '/:locationId/providers',
  asyncHandler(async (req, res) => {
    const { locationId } = locationIdSchema.parse(req.params);
    const query = providersQuerySchema.parse(req.query);

    const result = await getLocationById(locationId, {
      includeProviders: true,
      page: query.page,
      limit: query.limit,
    });

    if (!result) {
      throw AppError.notFound(`Location with ID ${locationId} not found`);
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
