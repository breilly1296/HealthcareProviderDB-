import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { cleanupExpiredVerifications, getExpirationStats } from '../services/verificationService';

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
    console.warn('[Admin] ADMIN_SECRET not configured - admin endpoints disabled');
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

  if (!providedSecret || providedSecret !== adminSecret) {
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

    console.log(`[Admin] Cleanup expired verifications - dryRun: ${dryRun}, batchSize: ${batchSize}`);

    const result = await cleanupExpiredVerifications({
      dryRun,
      batchSize,
    });

    console.log(`[Admin] Cleanup complete:`, result);

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
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  })
);

export default router;
