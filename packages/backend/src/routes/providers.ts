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
} from '../services/providerService';
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
  specialty: z.string().min(1).max(200).optional(),
  specialtyCategory: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
}).merge(paginationSchema);

/**
 * Map entity type from DB value ('1'/'2') to API value
 */
function mapEntityType(dbValue: string | null | undefined): string {
  if (dbValue === '1') return 'INDIVIDUAL';
  if (dbValue === '2') return 'ORGANIZATION';
  return dbValue || 'UNKNOWN';
}

/**
 * Transform a provider record from DB shape to API response shape.
 * Pulls address from practice_locations, maps field names for frontend compatibility.
 */
function transformProvider(p: Record<string, unknown>) {
  const provider = p as typeof p & {
    practice_locations?: Array<{
      id: number;
      address_type?: string | null;
      address_line1?: string | null;
      address_line2?: string | null;
      city?: string | null;
      state?: string | null;
      zip_code?: string | null;
      phone?: string | null;
      fax?: string | null;
    }>;
    provider_cms_details?: {
      group_practice_name?: string | null;
      medical_school?: string | null;
      graduation_year?: string | null;
      medicare_assignment?: string | null;
      telehealth?: string | null;
    } | null;
    provider_hospitals?: Array<{
      id: number;
      hospital_system?: string | null;
      hospital_name?: string | null;
      ccn?: string | null;
      confidence?: string | null;
    }>;
    provider_insurance?: Array<{
      id: number;
      network_name?: string | null;
      identifier_id?: string | null;
      confidence?: string | null;
    }>;
    provider_medicare?: Array<{
      id: number;
      medicare_id?: string | null;
      medicare_state?: string | null;
    }>;
    provider_taxonomies?: Array<{
      id: number;
      taxonomy_code?: string | null;
      is_primary?: string | null;
      slot_number?: number | null;
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
        address_line1?: string | null;
        city?: string | null;
        state?: string | null;
        zip_code?: string | null;
      } | null;
    }>;
    npi: string;
    entityType?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    middle_name?: string | null;
    name_prefix?: string | null;
    name_suffix?: string | null;
    credential?: string | null;
    organizationName?: string | null;
    gender?: string | null;
    primary_taxonomy_code?: string | null;
    primary_specialty?: string | null;
    specialty_category?: string | null;
    deactivation_date?: string | null;
    enumerationDate?: string | null;
    nppes_last_synced?: Date | null;
  };

  const loc = getPrimaryLocation(provider.practice_locations);

  return {
    id: provider.npi,
    npi: provider.npi,
    entityType: mapEntityType(provider.entityType),
    firstName: provider.firstName,
    lastName: provider.lastName,
    middleName: provider.middle_name || null,
    namePrefix: provider.name_prefix || null,
    nameSuffix: provider.name_suffix || null,
    credential: provider.credential,
    organizationName: provider.organizationName,
    gender: provider.gender || null,
    // Address from primary practice location
    addressLine1: loc?.address_line1 || null,
    addressLine2: loc?.address_line2 || null,
    city: loc?.city || null,
    state: loc?.state || null,
    zip: loc?.zip_code || null,
    phone: loc?.phone || null,
    fax: loc?.fax || null,
    // Specialty
    taxonomyCode: provider.primary_taxonomy_code,
    taxonomyDescription: provider.primary_specialty,
    specialtyCategory: provider.specialty_category || null,
    // Status
    npiStatus: provider.deactivation_date ? 'DEACTIVATED' : 'ACTIVE',
    displayName: getProviderDisplayName(provider),
    // Enrichment data from new tables
    cmsDetails: provider.provider_cms_details || null,
    hospitals: provider.provider_hospitals || [],
    insuranceNetworks: provider.provider_insurance || [],
    medicareIds: provider.provider_medicare || [],
    taxonomies: provider.provider_taxonomies || [],
    locations: provider.practice_locations || [],
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
        addressLine1: pa.location.address_line1,
        city: pa.location.city,
        state: pa.location.state,
        zipCode: pa.location.zip_code,
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

    // Transform result for response
    const responseData = {
      providers: result.providers.map(transformProvider),
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
