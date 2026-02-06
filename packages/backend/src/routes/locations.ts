import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { searchRateLimiter, defaultRateLimiter } from '../middleware/rateLimiter';
import {
  searchLocations,
  getLocationById,
  getProvidersAtLocation,
  getHealthSystems,
  getLocationStats,
} from '../services/locationService';
import { paginationSchema } from '../schemas/commonSchemas';
import { buildPaginationMeta, sendSuccess } from '../utils/responseHelpers';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase(),
  city: z.string().min(1).max(100).optional(),
  zipCode: z.string().min(3).max(10).optional(),
}).merge(paginationSchema);

const locationIdSchema = z.object({
  locationId: z.coerce.number().int().positive(),
});

const stateParamSchema = z.object({
  state: z.string().length(2).toUpperCase(),
});

const healthSystemsQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/locations/search
 * Search practice locations with filters (state required)
 */
router.get(
  '/search',
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const query = searchQuerySchema.parse(req.query);

    const result = await searchLocations({
      state: query.state,
      city: query.city,
      zipCode: query.zipCode,
      page: query.page,
      limit: query.limit,
    });

    res.json({
      success: true,
      data: {
        locations: result.locations,
        pagination: buildPaginationMeta(result.total, result.page, result.limit),
      },
    });
  })
);

/**
 * GET /api/v1/locations/health-systems
 * Get distinct health system names, optionally filtered by state/city
 */
router.get(
  '/health-systems',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const query = healthSystemsQuerySchema.parse(req.query);
    const healthSystems = await getHealthSystems(query);
    sendSuccess(res, { healthSystems, count: healthSystems.length });
  })
);

/**
 * GET /api/v1/locations/stats/:state
 * Get location statistics for a state
 */
router.get(
  '/stats/:state',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { state } = stateParamSchema.parse(req.params);
    const stats = await getLocationStats(state);
    sendSuccess(res, { state: state.toUpperCase(), ...stats });
  })
);

/**
 * GET /api/v1/locations/:locationId
 * Get a single practice location by ID with provider details
 */
router.get(
  '/:locationId',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { locationId } = locationIdSchema.parse(req.params);
    const location = await getLocationById(locationId);

    if (!location) {
      throw AppError.notFound(`Location with ID ${locationId} not found`);
    }

    sendSuccess(res, { location });
  })
);

/**
 * GET /api/v1/locations/:locationId/providers
 * Get all providers that share the same address as this location
 */
router.get(
  '/:locationId/providers',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { locationId } = locationIdSchema.parse(req.params);
    const query = paginationSchema.parse(req.query);

    const result = await getProvidersAtLocation(locationId, {
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
        providers: result.providers,
        pagination: buildPaginationMeta(result.total, result.page, result.limit),
      },
    });
  })
);

export default router;
