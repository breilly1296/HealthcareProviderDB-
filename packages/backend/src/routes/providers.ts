import { Router } from 'express';
import { z } from 'zod';
import { SpecialtyCategory, EntityType, AcceptanceStatus } from '@prisma/client';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { searchRateLimiter } from '../middleware/rateLimiter';
import {
  searchProviders,
  getProviderByNpi,
  getProviderAcceptedPlans,
  getProviderDisplayName,
} from '../services/providerService';
import { getConfidenceLevel, getConfidenceLevelDescription } from '../services/confidenceService';

const router = Router();

// Validation schemas
const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  zip: z.string().min(3).max(10).optional(),
  specialty: z.nativeEnum(SpecialtyCategory).optional(),
  name: z.string().min(1).max(200).optional(),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  entityType: z.nativeEnum(EntityType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const npiParamSchema = z.object({
  npi: z.string().length(10).regex(/^\d+$/, 'NPI must be exactly 10 digits'),
});

const plansQuerySchema = z.object({
  status: z.nativeEnum(AcceptanceStatus).optional(),
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
      zip: query.zip,
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
            confidenceLevel: getConfidenceLevel(pa.confidenceScore),
            confidenceDescription: getConfidenceLevelDescription(pa.confidenceScore),
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
          confidenceLevel: getConfidenceLevel(a.confidenceScore),
          confidenceDescription: getConfidenceLevelDescription(a.confidenceScore),
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
