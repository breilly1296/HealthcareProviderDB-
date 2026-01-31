import { Router, Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { cleanupExpiredVerifications, getExpirationStats } from '../services/verificationService';
import { cacheClear, getCacheStats } from '../utils/cache';
import logger from '../utils/logger';

const router = Router();

/**
 * Admin secret authentication middleware
 * Validates X-Admin-Secret header against ADMIN_SECRET environment variable
 *
 * Returns 503 if ADMIN_SECRET is not configured (allows deployment without secret)
 * Returns 401 if secret is configured but header is missing/invalid
 */
function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;

  // If ADMIN_SECRET is not configured, disable admin endpoints gracefully
  if (!adminSecret) {
    logger.warn('ADMIN_SECRET not configured - admin endpoints disabled');
    res.status(503).json({
      success: false,
      error: {
        message: 'Admin endpoints not configured. Set ADMIN_SECRET environment variable to enable.',
        code: 'ADMIN_NOT_CONFIGURED',
        statusCode: 503,
      },
    });
    return;
  }

  const providedSecret = req.headers['x-admin-secret'];

  // Use timing-safe comparison to prevent timing attacks
  const providedBuffer = Buffer.from(String(providedSecret || ''));
  const secretBuffer = Buffer.from(adminSecret);

  // timingSafeEqual requires equal length buffers, so check length first
  // Then use constant-time comparison to prevent timing-based secret extraction
  const isValid =
    providedBuffer.length === secretBuffer.length &&
    timingSafeEqual(providedBuffer, secretBuffer);

  if (!isValid) {
    throw AppError.unauthorized('Invalid or missing admin secret');
  }

  next();
}

/**
 * POST /api/v1/admin/cleanup-expired
 * Clean up expired verification records
 *
 * Protected by X-Admin-Secret header
 * Designed to be called by Cloud Scheduler
 *
 * Query params:
 *   - dryRun: If 'true', only return what would be deleted (default: false)
 *   - batchSize: Number of records to delete per batch (default: 1000)
 */
router.post(
  '/cleanup-expired',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const dryRun = req.query.dryRun === 'true';
    const batchSize = parseInt(req.query.batchSize as string) || 1000;

    logger.info({ dryRun, batchSize }, 'Admin cleanup expired verifications started');

    const result = await cleanupExpiredVerifications({
      dryRun,
      batchSize,
    });

    logger.info({ result }, 'Admin cleanup complete');

    res.json({
      success: true,
      data: {
        ...result,
        message: dryRun
          ? `Dry run complete. ${result.expiredPlanAcceptances + result.expiredVerificationLogs} records would be deleted.`
          : `Cleanup complete. ${result.deletedPlanAcceptances + result.deletedVerificationLogs} records deleted.`,
      },
    });
  })
);

/**
 * GET /api/v1/admin/expiration-stats
 * Get statistics about verification expiration
 *
 * Protected by X-Admin-Secret header
 */
router.get(
  '/expiration-stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const stats = await getExpirationStats();

    res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * GET /api/v1/admin/health
 * Health check endpoint for monitoring
 *
 * Protected by X-Admin-Secret header
 */
router.get(
  '/health',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const cacheStats = getCacheStats();

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        cache: cacheStats,
      },
    });
  })
);

/**
 * POST /api/v1/admin/cache/clear
 * Clear all cached data
 *
 * Protected by X-Admin-Secret header
 * Use when you need to force fresh data (e.g., after data import)
 */
router.post(
  '/cache/clear',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    logger.info('Admin cache clear requested');

    const deletedCount = await cacheClear();

    logger.info({ deletedCount }, 'Admin cache clear complete');

    res.json({
      success: true,
      data: {
        message: `Cache cleared. ${deletedCount} entries removed.`,
        deletedCount,
      },
    });
  })
);

/**
 * GET /api/v1/admin/cache/stats
 * Get cache statistics
 *
 * Protected by X-Admin-Secret header
 */
router.get(
  '/cache/stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const stats = getCacheStats();

    res.json({
      success: true,
      data: {
        ...stats,
        hitRate: stats.hits + stats.misses > 0
          ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%'
          : '0%',
      },
    });
  })
);

export default router;
