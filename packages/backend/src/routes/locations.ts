import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { searchRateLimiter, defaultRateLimiter } from '../middleware/rateLimiter';
import {
  searchLocations,
  getLocationById,
  getLocationStatsByState,
  getHealthSystems,
  getLocationDisplayName,
} from '../services/locationService';
import { getProviderDisplayName } from '../services/providerService';
import { paginationSchema, stateQuerySchema } from '../schemas/commonSchemas';
import { buildPaginationMeta, sendSuccess } from '../utils/responseHelpers';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  search: z.string().min(1).max(200).optional(),
  city: z.string().min(1).max(100).optional(),
  cities: z.string().min(1).max(500).optional(), // Comma-separated cities
  zipCode: z.string().min(3).max(10).optional(),
  healthSystem: z.string().min(1).max(200).optional(),
  minProviders: z.coerce.number().int().min(1).optional(),
}).merge(stateQuerySchema).merge(paginationSchema);

const locationIdSchema = z.object({
  locationId: z.coerce.number().int().positive(),
});

const stateParamSchema = z.object({
  state: stateQuerySchema.shape.state.unwrap(), // Required state (not optional)
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
        locations: result.locations.map((loc) => ({
          ...loc,
          displayName: getLocationDisplayName(loc),
        })),
        pagination: buildPaginationMeta(result.total, result.page, result.limit),
      },
    });
  })
);

/**
 * GET /api/v1/locations/health-systems
 * Get list of distinct health systems
 * Optionally filtered by state and/or cities
 */
router.get(
  '/health-systems',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const query = stateQuerySchema.extend({
      cities: z.string().min(1).max(500).optional(), // Comma-separated cities
    }).parse(req.query);

    const healthSystems = await getHealthSystems({
      state: query.state,
      cities: query.cities,
    });

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
    const stats = await getLocationStatsByState(state);
    sendSuccess(res, { state, ...stats });
  })
);

/**
 * GET /api/v1/locations/:locationId
 * Get location details
 */
router.get(
  '/:locationId',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { locationId } = locationIdSchema.parse(req.params);

    const result = await getLocationById(locationId, { includeProviders: false });

    if (!result) {
      throw AppError.notFound(`Location with ID ${locationId} not found`);
    }

    sendSuccess(res, {
      location: {
        ...result.location,
        displayName: getLocationDisplayName(result.location),
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
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { locationId } = locationIdSchema.parse(req.params);
    const query = paginationSchema.parse(req.query);

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
        location: {
          ...result.location,
          displayName: getLocationDisplayName(result.location),
        },
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
        pagination: buildPaginationMeta(result.total ?? 0, result.page ?? 1, result.limit ?? 20),
      },
    });
  })
);

export default router;
