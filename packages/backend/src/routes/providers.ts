import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { searchRateLimiter, defaultRateLimiter } from '../middleware/rateLimiter';
import {
  searchProviders,
  getProviderByNpi,
  getProviderDisplayName,
  getCitiesByState,
  getPrimaryLocation,
  PROVIDER_INCLUDE,
} from '../services/providerService';
import { getColocatedNpis } from '../services/locationService';
import { getProvidersForMap } from '../services/mapService';
import { getLocationHealthSystem } from '../services/locationEnrichment';
import { enrichAcceptanceWithConfidence } from '../services/confidenceService';
import { mapEntityTypeToApi } from '../services/utils';
import prisma from '../lib/prisma';
import { paginationSchema, npiParamSchema } from '../schemas/commonSchemas';
import { buildPaginationMeta, sendSuccess } from '../utils/responseHelpers';
import { cacheGet, cacheSet, generateSearchCacheKey } from '../utils/cache';
import { searchTimeout } from '../middleware/requestTimeout';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  cities: z.string().min(1).max(500).optional(), // Comma-separated cities
  zipCode: z.string().min(3).max(10).optional(),
  specialty: z.string().min(1).max(200).optional(),
  specialtyCategory: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
}).merge(paginationSchema);

const mapQuerySchema = z.object({
  north: z.coerce.number().min(-90).max(90),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  west: z.coerce.number().min(-180).max(180),
  specialty: z.string().min(1).max(200).optional(),
  specialtyCategory: z.string().min(1).max(100).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

// mapEntityTypeToApi imported from services/utils

/**
 * Transform a provider record from DB shape to API response shape.
 * Pulls address from practiceLocations, maps field names for frontend compatibility.
 *
 * When `options.preferredState` is provided the displayed address will prefer
 * a practice_location matching that state (and optionally cities), so search
 * results show the address relevant to the user's filter.
 */
function transformProvider(
  p: Record<string, unknown>,
  options?: { preferredState?: string; preferredCities?: string[] },
) {
  const provider = p as typeof p & {
    practiceLocations?: Array<{
      id: number;
      addressType?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      zipCode?: string | null;
      phone?: string | null;
      fax?: string | null;
    }>;
    providerCmsDetails?: {
      groupPracticeName?: string | null;
      medicalSchool?: string | null;
      graduationYear?: string | null;
      medicareAssignment?: string | null;
      telehealth?: string | null;
    } | null;
    providerHospitals?: Array<{
      id: number;
      hospitalSystem?: string | null;
      hospitalName?: string | null;
      ccn?: string | null;
      confidence?: string | null;
    }>;
    providerInsurance?: Array<{
      id: number;
      networkName?: string | null;
      identifierId?: string | null;
      confidence?: string | null;
    }>;
    providerMedicare?: Array<{
      id: number;
      medicareId?: string | null;
      medicareState?: string | null;
    }>;
    providerTaxonomies?: Array<{
      id: number;
      taxonomyCode?: string | null;
      isPrimary?: string | null;
      slotNumber?: number | null;
    }>;
    providerPlanAcceptances?: Array<{
      id: number;
      planId?: string | null;
      locationId?: number | null;
      acceptanceStatus: string;
      confidenceScore: number;
      lastVerified?: Date | null;
      verificationCount: number;
      expiresAt?: Date | null;
      insurancePlan?: {
        planId: string;
        planName?: string | null;
        issuerName?: string | null;
        planType?: string | null;
        state?: string | null;
        carrier?: string | null;
      } | null;
      location?: {
        id: number;
        addressLine1?: string | null;
        city?: string | null;
        state?: string | null;
        zipCode?: string | null;
      } | null;
    }>;
    npi: string;
    entityType?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    middleName?: string | null;
    namePrefix?: string | null;
    nameSuffix?: string | null;
    credential?: string | null;
    organizationName?: string | null;
    gender?: string | null;
    primaryTaxonomyCode?: string | null;
    primarySpecialty?: string | null;
    specialtyCategory?: string | null;
    deactivationDate?: string | null;
    enumerationDate?: string | null;
    nppes_last_synced?: Date | null;
  };

  const loc = getPrimaryLocation(provider.practiceLocations, options);

  return {
    id: provider.npi,
    npi: provider.npi,
    entityType: mapEntityTypeToApi(provider.entityType),
    firstName: provider.firstName,
    lastName: provider.lastName,
    middleName: provider.middleName || null,
    namePrefix: provider.namePrefix || null,
    nameSuffix: provider.nameSuffix || null,
    credential: provider.credential,
    organizationName: provider.organizationName,
    gender: provider.gender || null,
    // Address from primary practice location
    addressLine1: loc?.addressLine1 || null,
    addressLine2: loc?.addressLine2 || null,
    city: loc?.city || null,
    state: loc?.state || null,
    zip: loc?.zipCode || null,
    phone: loc?.phone || null,
    fax: loc?.fax || null,
    // Specialty
    taxonomyCode: provider.primaryTaxonomyCode,
    taxonomyDescription: provider.primarySpecialty,
    specialtyCategory: provider.specialtyCategory || null,
    // Status
    npiStatus: provider.deactivationDate ? 'DEACTIVATED' : 'ACTIVE',
    displayName: getProviderDisplayName(provider),
    // Enrichment data from new tables
    cmsDetails: provider.providerCmsDetails || null,
    hospitals: provider.providerHospitals || [],
    insuranceNetworks: provider.providerInsurance || [],
    medicareIds: provider.providerMedicare || [],
    taxonomies: provider.providerTaxonomies || [],
    locations: provider.practiceLocations || [],
    locationCount: provider.practiceLocations?.length ?? 0,
    nppesLastSynced: provider.nppes_last_synced || null,
    // Plan acceptances with location data
    planAcceptances: (provider.providerPlanAcceptances || []).map(pa => ({
      id: pa.id,
      planId: pa.planId,
      locationId: pa.locationId,
      acceptanceStatus: pa.acceptanceStatus,
      confidenceScore: pa.confidenceScore,
      lastVerifiedAt: pa.lastVerified,
      verificationCount: pa.verificationCount,
      expiresAt: pa.expiresAt,
      plan: pa.insurancePlan ? {
        planId: pa.insurancePlan.planId,
        planName: pa.insurancePlan.planName,
        issuerName: pa.insurancePlan.issuerName,
        planType: pa.insurancePlan.planType,
        state: pa.insurancePlan.state,
        carrier: pa.insurancePlan.carrier,
      } : null,
      location: pa.location ? {
        id: pa.location.id,
        addressLine1: pa.location.addressLine1,
        city: pa.location.city,
        state: pa.location.state,
        zipCode: pa.location.zipCode,
      } : null,
    })),
  };
}

/**
 * GET /api/v1/providers/search
 * Search providers with filters
 *
 * Caching: Results are cached for 5 minutes to improve performance.
 */
router.get(
  '/search',
  searchTimeout,
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const query = searchQuerySchema.parse(req.query);

    // Generate cache key from search params
    const cacheKey = generateSearchCacheKey({
      state: query.state,
      city: query.city,
      cities: query.cities,
      zipCode: query.zipCode,
      specialty: query.specialty,
      specialtyCategory: query.specialtyCategory,
      name: query.name,
      npi: query.npi,
      entityType: query.entityType,
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
      specialty: query.specialty,
      specialtyCategory: query.specialtyCategory,
      name: query.name,
      npi: query.npi,
      entityType: query.entityType,
      page: query.page,
      limit: query.limit,
    });

    // Transform result for response — pass search state/cities so the
    // displayed address matches the location the user filtered by
    const transformOpts = {
      preferredState: query.state,
      preferredCities: query.cities?.split(',').map(c => c.trim()).filter(Boolean),
    };
    const responseData = {
      providers: result.providers.map(p => transformProvider(p, transformOpts)),
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
 * GET /api/v1/providers/:npi/colocated
 * Get providers at the same practice address as the given NPI
 */
router.get(
  '/:npi/colocated',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { npi } = npiParamSchema.parse(req.params);
    const { page, limit } = paginationSchema.parse(req.query);

    const provider = await getProviderByNpi(npi);
    if (!provider) {
      throw AppError.notFound(`Provider with NPI ${npi} not found`);
    }

    const primaryLoc = getPrimaryLocation(provider.practiceLocations);
    const emptyResponse = {
      location: null,
      providers: [],
      pagination: buildPaginationMeta(0, page, limit),
    };

    if (!primaryLoc?.addressLine1) {
      sendSuccess(res, emptyResponse);
      return;
    }

    const [colocatedResult, healthSystem] = await Promise.all([
      getColocatedNpis(
        primaryLoc.addressLine1,
        primaryLoc.city ?? null,
        primaryLoc.state ?? null,
        primaryLoc.zipCode ?? null,
        npi,
        { page, limit }
      ),
      getLocationHealthSystem(npi),
    ]);

    let colocatedProviders: Array<Record<string, unknown>> = [];
    if (colocatedResult.npis.length > 0) {
      colocatedProviders = await prisma.provider.findMany({
        where: { npi: { in: colocatedResult.npis } },
        include: PROVIDER_INCLUDE,
      });
    }

    const location = {
      id: 0,
      addressLine1: primaryLoc.addressLine1,
      addressLine2: primaryLoc.addressLine2 || null,
      city: primaryLoc.city || '',
      state: primaryLoc.state || '',
      zipCode: primaryLoc.zipCode || '',
      name: null,
      healthSystem,
      facilityType: null,
      providerCount: colocatedResult.total + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sendSuccess(res, {
      location,
      providers: colocatedProviders.map(p => transformProvider(p)),
      pagination: buildPaginationMeta(colocatedResult.total, colocatedResult.page, colocatedResult.limit),
    });
  })
);

/**
 * GET /api/v1/providers/:npi/plans
 * Get insurance plan acceptances for a provider
 */
const plansQuerySchema = paginationSchema.extend({
  status: z.string().min(1).max(20).optional(),
  minConfidence: z.coerce.number().int().min(0).max(100).optional(),
});

router.get(
  '/:npi/plans',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { npi } = npiParamSchema.parse(req.params);
    const { page, limit, status, minConfidence } = plansQuerySchema.parse(req.query);

    // Verify provider exists
    const provider = await getProviderByNpi(npi);
    if (!provider) {
      throw AppError.notFound(`Provider with NPI ${npi} not found`);
    }

    // Build where clause
    const where: Record<string, unknown> = { providerNpi: npi };
    if (status) {
      where.acceptanceStatus = status;
    }
    if (minConfidence !== undefined) {
      where.confidenceScore = { gte: minConfidence };
    }

    const [acceptances, total] = await Promise.all([
      prisma.providerPlanAcceptance.findMany({
        where,
        include: {
          insurancePlan: true,
          location: true,
        },
        orderBy: [
          { confidenceScore: 'desc' },
          { lastVerified: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.providerPlanAcceptance.count({ where }),
    ]);

    const enrichedAcceptances = acceptances.map((pa) => {
      const enriched = enrichAcceptanceWithConfidence(pa);
      return {
        id: String(enriched.id),
        providerId: enriched.providerNpi,
        planId: enriched.planId,
        locationId: enriched.locationId,
        acceptanceStatus: enriched.acceptanceStatus,
        acceptsNewPatients: null,
        confidenceScore: enriched.confidenceScore,
        confidenceLevel: enriched.confidenceLevel,
        confidenceDescription: enriched.confidenceDescription,
        lastVerifiedAt: enriched.lastVerified?.toISOString() ?? null,
        verificationCount: enriched.verificationCount,
        plan: enriched.insurancePlan ? {
          planId: enriched.insurancePlan.planId,
          planName: enriched.insurancePlan.planName,
          issuerName: enriched.insurancePlan.issuerName,
          planType: enriched.insurancePlan.planType,
          state: enriched.insurancePlan.state,
          carrier: enriched.insurancePlan.carrier,
        } : null,
        location: enriched.location ? {
          id: enriched.location.id,
          addressLine1: enriched.location.addressLine1,
          city: enriched.location.city,
          state: enriched.location.state,
          zipCode: enriched.location.zipCode,
        } : null,
        confidence: enriched.confidence,
      };
    });

    sendSuccess(res, {
      npi,
      acceptances: enrichedAcceptances,
      pagination: buildPaginationMeta(total, page, limit),
    });
  })
);

/**
 * GET /api/v1/providers/map
 * Get providers within a geographic bounding box for map display.
 * Returns lightweight data optimized for map pins.
 */
router.get(
  '/map',
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const query = mapQuerySchema.parse(req.query);

    // Check cache first
    const cacheKey = `map:${JSON.stringify(query)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached });
      return;
    }

    res.setHeader('X-Cache', 'MISS');

    const result = await getProvidersForMap({
      north: query.north,
      south: query.south,
      east: query.east,
      west: query.west,
      specialty: query.specialty,
      specialtyCategory: query.specialtyCategory,
      entityType: query.entityType,
      limit: query.limit,
    });

    if (result.pins.length > 0) {
      await cacheSet(cacheKey, result, 300); // 5 minute TTL
    }

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/v1/providers/:npi
 * Get provider by NPI with full enrichment data
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
        provider: transformProvider(provider),
      },
    });
  })
);

export default router;
