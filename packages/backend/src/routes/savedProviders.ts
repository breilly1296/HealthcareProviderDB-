import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { defaultRateLimiter } from '../middleware/rateLimiter';
import {
  getSavedProviders,
  saveProvider,
  unsaveProvider,
  isProviderSaved,
} from '../services/savedProviderService';
import { paginationSchema, npiParamSchema } from '../schemas/commonSchemas';
import { buildPaginationMeta } from '../utils/responseHelpers';

const router = Router();

/**
 * GET /api/v1/saved-providers
 * List the current user's saved providers (paginated).
 * Requires authentication.
 */
router.get(
  '/',
  defaultRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);

    const result = await getSavedProviders(req.user!.id, page, limit);

    res.json({
      success: true,
      data: {
        providers: result.providers,
        pagination: buildPaginationMeta(result.total, result.page, limit),
      },
    });
  })
);

/**
 * POST /api/v1/saved-providers
 * Save (bookmark) a provider. Idempotent — saving twice returns the existing record.
 * Requires authentication.
 */
router.post(
  '/',
  defaultRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const { npi } = npiParamSchema.parse(req.body);

    const saved = await saveProvider(req.user!.id, npi);

    res.status(201).json({
      success: true,
      data: { provider: saved },
    });
  })
);

/**
 * DELETE /api/v1/saved-providers/:npi
 * Remove a saved provider. Idempotent — deleting a non-saved provider returns success.
 * Requires authentication.
 */
router.delete(
  '/:npi',
  defaultRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const { npi } = npiParamSchema.parse(req.params);

    await unsaveProvider(req.user!.id, npi);

    res.json({ success: true });
  })
);

/**
 * GET /api/v1/saved-providers/:npi/status
 * Check whether a provider is saved by the current user.
 * Returns { saved: false } for anonymous users instead of 401.
 */
router.get(
  '/:npi/status',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { npi } = npiParamSchema.parse(req.params);

    if (!req.user) {
      res.json({ success: true, data: { saved: false } });
      return;
    }

    const result = await isProviderSaved(req.user.id, npi);

    res.json({ success: true, data: result });
  })
);

export default router;
