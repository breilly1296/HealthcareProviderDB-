import { Router, Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { cleanupExpiredVerifications, getExpirationStats, getDisputedVerifications } from '../services/verificationService';
import { detectAnomalies } from '../services/anomalyDetectionService';
import { paginationSchema } from '../schemas/commonSchemas';
import { recalculateAllConfidenceScores } from '../services/confidenceDecayService';
import { getEnrichmentStats } from '../services/locationEnrichment';
import { cleanupExpiredSessions, cleanupExpiredMagicLinkTokens } from '../services/authService';
import { cacheClear, getCacheStats } from '../utils/cache';
import { getRedisStatus } from '../lib/redis';
import { decryptCardPii, encryptCardPii, hasPreviousKey } from '../lib/encryption';
import prisma from '../lib/prisma';
import { adminTimeout } from '../middleware/requestTimeout';
import { adminRateLimiter } from '../middleware/rateLimiter';
import { adminAudit } from '../middleware/adminAudit';
import logger from '../utils/logger';

const router = Router();

/**
 * Optional IP allowlist for admin endpoints. Set ADMIN_IP_ALLOWLIST to a
 * comma-separated list of IPs to restrict admin access to known callers
 * (e.g. Cloud Scheduler egress, office VPN). Unset / empty = no restriction
 * (backwards compatible). Matches on exact string equality; CIDR is out of
 * scope for this MVP — add a proper parser if range support is needed.
 *
 * Example: ADMIN_IP_ALLOWLIST="35.187.132.4,104.132.100.5"
 *
 * Cloud Scheduler's egress IPs for a given project/region can be found via
 * `gcloud compute addresses list` or the GCP console. (IM-28 / LOW-02)
 */
const ADMIN_IP_ALLOWLIST = process.env.ADMIN_IP_ALLOWLIST
  ? process.env.ADMIN_IP_ALLOWLIST.split(',').map(ip => ip.trim()).filter(Boolean)
  : null;

if (ADMIN_IP_ALLOWLIST) {
  logger.info({ count: ADMIN_IP_ALLOWLIST.length }, 'Admin IP allowlist configured');
}

function adminIpCheck(req: Request, _res: Response, next: NextFunction): void {
  // Not configured — allow all (default, matches pre-IM-28 behavior).
  if (!ADMIN_IP_ALLOWLIST) {
    return next();
  }
  const clientIp = req.ip || '';
  if (ADMIN_IP_ALLOWLIST.includes(clientIp)) {
    return next();
  }
  // Logged distinctly from auth failures so operators can tell "unauthorized
  // IP" from "bad secret" when tuning the allowlist.
  logger.warn(
    { ip: clientIp, path: req.path },
    'Admin request from non-allowlisted IP rejected'
  );
  throw AppError.forbidden('Access denied');
}

// IP allowlist runs FIRST so non-allowlisted callers never consume rate-limit
// budget and never reach the audit table — they just get a 403 and a log
// line. (IM-28)
router.use(adminIpCheck);

// Brute-force throttle on the X-Admin-Secret header — applied at the router
// level so every admin endpoint is covered, and BEFORE adminAuthMiddleware
// so failed auth attempts count against the per-IP budget.
router.use(adminRateLimiter);

// Append-only audit trail for every admin invocation. Applied before the
// route handlers so both successful and failed (post-auth) calls are
// recorded with their source IP, request ID, and result count.
router.use(adminAudit);

// ============================================================================
// Query-param validation schemas
// ============================================================================
// Shared Zod schemas for admin query params. Replace previous manual
// parseInt / === 'true' parsing so bounds and types are validated uniformly
// and invalid input produces a consistent 400 via the errorHandler's
// built-in ZodError handling. All fields are optional — defaults match the
// historical manual parsing behavior so operator muscle memory still works.

/** Base schema shared by every admin cleanup/maintenance endpoint. */
const dryRunQuerySchema = z.object({
  dryRun: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
});

/** Used by /cleanup-expired. Default batchSize 1000. */
const cleanupQuerySchema = dryRunQuerySchema.extend({
  batchSize: z.coerce.number().int().min(1).max(10000).optional().default(1000),
});

/**
 * Used by /rotate-encryption-key. Crypto re-encryption is slower per row
 * than a plain DELETE, so the batch default is intentionally lower (50).
 */
const rotationQuerySchema = dryRunQuerySchema.extend({
  batchSize: z.coerce.number().int().min(1).max(10000).optional().default(50),
});

/** Used by /cleanup/sync-logs and /cleanup-admin-actions. Default 90 days. */
const retentionQuerySchema = dryRunQuerySchema.extend({
  retentionDays: z.coerce.number().int().min(1).max(365).optional().default(90),
});

/** Used by /recalculate-confidence. `limit` stays optional (no default). */
const confidenceQuerySchema = dryRunQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100000).optional(),
});

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

  // Hash both sides before comparing. SHA-256 always emits 32 bytes, so the
  // length pre-check that `timingSafeEqual` otherwise requires is gone — and
  // with it the timing channel that previously leaked the secret's length
  // when attackers submitted probes of varying size. (IM-30 / LOW-04)
  const providedHash = createHash('sha256').update(String(providedSecret || '')).digest();
  const secretHash = createHash('sha256').update(adminSecret).digest();
  const isValid = timingSafeEqual(providedHash, secretHash);

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
  adminTimeout,
  asyncHandler(async (req, res) => {
    const { dryRun, batchSize } = cleanupQuerySchema.parse(req.query);

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
 * POST /api/v1/admin/cleanup-sessions
 * Delete expired sessions from the database.
 *
 * Protected by X-Admin-Secret header
 * Designed to be called by Cloud Scheduler
 *
 * Query params:
 *   - dryRun: If 'true', only return count without deleting (default: false)
 */
router.post(
  '/cleanup-sessions',
  adminAuthMiddleware,
  adminTimeout,
  asyncHandler(async (req, res) => {
    const { dryRun } = dryRunQuerySchema.parse(req.query);

    logger.info({ dryRun }, 'Admin cleanup expired sessions started');

    const result = await cleanupExpiredSessions({ dryRun });

    logger.info({ result }, 'Admin session cleanup complete');

    res.json({
      success: true,
      data: {
        ...result,
        message: dryRun
          ? `Dry run complete. ${result.expiredCount} expired sessions would be deleted.`
          : `Cleanup complete. ${result.deletedCount} expired sessions deleted.`,
      },
    });
  })
);

/**
 * POST /api/v1/admin/cleanup-magic-links
 * Delete expired or already-used magic link tokens from the database.
 *
 * Protected by X-Admin-Secret header
 * Designed to be called by Cloud Scheduler
 *
 * Query params:
 *   - dryRun: If 'true', only return count without deleting (default: false)
 */
router.post(
  '/cleanup-magic-links',
  adminAuthMiddleware,
  adminTimeout,
  asyncHandler(async (req, res) => {
    const { dryRun } = dryRunQuerySchema.parse(req.query);

    logger.info({ dryRun }, 'Admin cleanup expired magic link tokens started');

    const result = await cleanupExpiredMagicLinkTokens({ dryRun });

    logger.info({ result }, 'Admin magic link token cleanup complete');

    res.json({
      success: true,
      data: {
        ...result,
        message: dryRun
          ? `Dry run complete. ${result.expiredCount} expired/used magic link tokens would be deleted.`
          : `Cleanup complete. ${result.deletedCount} expired/used magic link tokens deleted.`,
      },
    });
  })
);

/**
 * POST /api/v1/admin/cleanup-admin-actions
 * Retention trim for the admin_actions audit table. Keeps the last 90 days
 * of entries by default — long enough to investigate any incident reported
 * within a quarter, short enough to keep the table small.
 *
 * Protected by X-Admin-Secret header. Wired to Cloud Scheduler as the
 * `cleanup-admin-actions` job (Saturday 05:30 UTC weekly) — see
 * infra/scheduler/cloud-scheduler-jobs.sh.
 *
 * Query params:
 *   - dryRun: If 'true', only return count without deleting (default: false)
 *   - retentionDays: override the default 90-day window (1..365)
 */
router.post(
  '/cleanup-admin-actions',
  adminAuthMiddleware,
  adminTimeout,
  asyncHandler(async (req, res) => {
    const { dryRun, retentionDays } = retentionQuerySchema.parse(req.query);

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const where = { createdAt: { lt: cutoff } };

    logger.info({ dryRun, retentionDays }, 'Admin cleanup admin_actions started');

    let deletedCount = 0;
    let expiredCount = 0;
    if (dryRun) {
      expiredCount = await prisma.adminAction.count({ where });
    } else {
      const result = await prisma.adminAction.deleteMany({ where });
      deletedCount = result.count;
      expiredCount = result.count;
    }

    logger.info({ dryRun, retentionDays, deletedCount, expiredCount }, 'Admin admin_actions cleanup complete');

    res.json({
      success: true,
      data: {
        dryRun,
        retentionDays,
        deletedCount,
        expiredCount,
        message: dryRun
          ? `Dry run complete. ${expiredCount} admin_actions rows older than ${retentionDays} days would be deleted.`
          : `Cleanup complete. ${deletedCount} admin_actions rows older than ${retentionDays} days deleted.`,
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
 * GET /api/v1/admin/verifications/disputed
 * Review queue for provider-plan pairs stuck in active dispute — 3+
 * crowdsourced verifications, both accepted and not-accepted present, and
 * neither side holding a 2:1 majority (so `determineAcceptanceStatus` keeps
 * the pair in PENDING).
 *
 * Useful for spotting Sybil-shaped attacks: look for pairs where
 * `totalVerifications` is high but `uniqueIps` / `uniqueUsers` is low
 * relative to it.
 *
 * Read-only, no PII — aggregate counts only. Protected by X-Admin-Secret.
 *
 * Query params:
 *   - page  (default 1)
 *   - limit (default 20, max 100 — enforced by paginationSchema)
 *
 * (IM-45 / Sybil M2)
 */
router.get(
  '/verifications/disputed',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const { disputes, total } = await getDisputedVerifications({ page, limit });

    res.json({
      success: true,
      data: {
        disputes,
        total,
        pagination: {
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total,
        },
      },
    });
  })
);

/**
 * GET /api/v1/admin/anomalies
 * Subnet-level anomaly detection over verification_logs (F-20).
 *
 * Scans the last `window` hours (default 24, max 168 = 7 days) for three
 * abuse-shaped patterns — subnet concentration, velocity spike, provider
 * targeting — and returns a structured report. Detection only, no
 * blocking. Report carries /24 subnet prefixes only (never full IPs).
 *
 * Read-only. Protected by X-Admin-Secret. See anomalyDetectionService.ts
 * for thresholds and detector details.
 *
 * Query params:
 *   - window: hours to look back (default 24, max 168)
 */
router.get(
  '/anomalies',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    // z.coerce.number keeps the value aligned with the rest of the admin
    // surface's coerce-from-query style; the service also clamps internally
    // so a missing/NaN param still produces a safe 24h window.
    const schema = z.object({
      window: z.coerce.number().int().min(1).max(168).optional().default(24),
    });
    const { window: windowHours } = schema.parse(req.query);

    const report = await detectAnomalies(windowHours);

    res.json({ success: true, data: report });
  })
);

/**
 * GET /api/v1/admin/health
 * Health check endpoint for monitoring with retention metrics
 *
 * Protected by X-Admin-Secret header
 */
router.get(
  '/health',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const cacheStats = getCacheStats();

    // Get retention metrics — success doubles as our DB liveness signal. If
    // these queries fail the DB is unhealthy and we still want to respond
    // with a structured body rather than a raw 500 (this endpoint is an
    // operator diagnostic, so partial data is more useful than a stack
    // trace). (F-06)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    let dbHealthy = false;
    let retention: {
      verificationLogs: { total: number; expiringIn7Days: number; oldestRecord: string | null };
      syncLogs: { total: number; oldestRecord: string | null };
      voteLogs: { total: number };
    } | null = null;

    try {
      const [
        verificationLogTotal,
        verificationLogExpiringSoon,
        verificationLogOldest,
        syncLogTotal,
        syncLogOldest,
        voteTotal,
      ] = await Promise.all([
        prisma.verificationLog.count(),
        prisma.verificationLog.count({ where: { expiresAt: { lte: sevenDaysFromNow } } }),
        prisma.verificationLog.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        prisma.syncLog.count(),
        prisma.syncLog.findFirst({
          orderBy: { startedAt: 'asc' },
          select: { startedAt: true },
        }),
        prisma.voteLog.count(),
      ]);

      dbHealthy = true;
      retention = {
        verificationLogs: {
          total: verificationLogTotal,
          expiringIn7Days: verificationLogExpiringSoon,
          oldestRecord: verificationLogOldest?.createdAt?.toISOString() || null,
        },
        syncLogs: {
          total: syncLogTotal,
          oldestRecord: syncLogOldest?.startedAt?.toISOString() || null,
        },
        voteLogs: {
          total: voteTotal,
        },
      };
    } catch (err) {
      logger.error({ err }, 'admin/health: DB queries failed');
    }

    // Redis state — reuses the same normalization as GET /health and
    // GET /admin/redis/status.
    const redisStatus = getRedisStatus();
    const redisHealthy = !redisStatus.configured || redisStatus.connected;

    // Config presence checks — boolean-only, never the secret value. Safe
    // to expose here because this endpoint is behind X-Admin-Secret auth.
    const secretConfigured = (name: string) => !!process.env[name];

    res.json({
      success: true,
      data: {
        // `status` kept for backwards compatibility; new `overallStatus`
        // adds a degraded state when a dependency is down.
        status: 'healthy',
        overallStatus: dbHealthy && redisHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        cache: cacheStats,
        checks: {
          database: dbHealthy ? 'healthy' : 'unhealthy',
          redis: {
            status: redisStatus.configured
              ? (redisStatus.connected ? 'connected' : 'disconnected')
              : 'not-configured',
            mode: process.env.REDIS_URL ? 'redis' : 'memory',
            tlsEnabled: process.env.REDIS_URL?.startsWith('rediss://') ?? false,
          },
          secrets: {
            adminSecret: secretConfigured('ADMIN_SECRET') ? 'configured' : 'missing',
            jwt: secretConfigured('JWT_SECRET') ? 'configured' : 'missing',
            encryption: secretConfigured('INSURANCE_ENCRYPTION_KEY') ? 'configured' : 'missing',
            resend: secretConfigured('RESEND_API_KEY') ? 'configured' : 'missing',
            captcha: secretConfigured('RECAPTCHA_SECRET_KEY') ? 'configured' : 'missing',
            csrf: secretConfigured('CSRF_SECRET') ? 'configured' : 'missing',
          },
        },
        // Retention metrics are null when DB is down; shape is preserved
        // for existing consumers that only read the per-table `total`.
        retention: retention ?? {
          verificationLogs: { total: null, expiringIn7Days: null, oldestRecord: null },
          syncLogs: { total: null, oldestRecord: null },
          voteLogs: { total: null },
        },
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

/**
 * GET /api/v1/admin/redis/status
 * Admin-level detail on the Redis connection: configured-ness, connection
 * state, ioredis status, and whether TLS was negotiated. Complements the
 * coarser `/health` check by exposing the internal fields operators need
 * to distinguish "unconfigured" from "configured-but-down" from "connected
 * but not over TLS". (F-21)
 *
 * Protected by X-Admin-Secret header
 */
router.get(
  '/redis/status',
  adminAuthMiddleware,
  asyncHandler(async (_req, res) => {
    const status = getRedisStatus();
    const redisUrl = process.env.REDIS_URL;

    res.json({
      success: true,
      data: {
        ...status,
        mode: redisUrl ? 'redis' : 'memory',
        tlsEnabled: redisUrl?.startsWith('rediss://') ?? false,
      },
    });
  })
);

// ============================================================================
// Location Enrichment Endpoints
// ============================================================================

/**
 * GET /api/v1/admin/enrichment/stats
 * Get location enrichment statistics (practice_locations + provider_hospitals)
 *
 * Protected by X-Admin-Secret header
 */
router.get(
  '/enrichment/stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const stats = await getEnrichmentStats();

    res.json({
      success: true,
      data: stats,
    });
  })
);

// ============================================================================
// Log Retention Cleanup Endpoints
// ============================================================================

/**
 * POST /api/v1/admin/cleanup/sync-logs
 * Clean up sync_logs older than 90 days
 *
 * Protected by X-Admin-Secret header
 * Designed to be called by Cloud Scheduler daily
 *
 * Query params:
 *   - dryRun: If 'true', only return what would be deleted (default: false)
 *   - retentionDays: Number of days to retain (default: 90)
 */
router.post(
  '/cleanup/sync-logs',
  adminAuthMiddleware,
  adminTimeout,
  asyncHandler(async (req, res) => {
    const { dryRun, retentionDays } = retentionQuerySchema.parse(req.query);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    logger.info(
      { dryRun, retentionDays, cutoffDate: cutoffDate.toISOString() },
      'Admin sync_logs cleanup started'
    );

    if (dryRun) {
      // Count records that would be deleted
      const count = await prisma.syncLog.count({
        where: {
          startedAt: { lt: cutoffDate },
        },
      });

      logger.info({ count, dryRun: true }, 'Admin sync_logs cleanup dry run complete');

      res.json({
        success: true,
        data: {
          dryRun: true,
          recordsToDelete: count,
          olderThan: cutoffDate.toISOString(),
          message: `Dry run complete. ${count} sync_logs records would be deleted.`,
        },
      });
    } else {
      // Actually delete the records
      const result = await prisma.syncLog.deleteMany({
        where: {
          startedAt: { lt: cutoffDate },
        },
      });

      logger.info(
        {
          action: 'sync_logs_cleanup',
          deletedCount: result.count,
          olderThan: cutoffDate.toISOString(),
        },
        'Admin sync_logs cleanup complete'
      );

      res.json({
        success: true,
        data: {
          dryRun: false,
          deletedCount: result.count,
          olderThan: cutoffDate.toISOString(),
          message: `Cleanup complete. ${result.count} sync_logs records deleted.`,
        },
      });
    }
  })
);

/**
 * GET /api/v1/admin/retention/stats
 * Get comprehensive retention statistics for all log types
 *
 * Protected by X-Admin-Secret header
 */
router.get(
  '/retention/stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Sync log retention boundary (90 days ago)
    const syncLogCutoff = new Date(now);
    syncLogCutoff.setDate(syncLogCutoff.getDate() - 90);

    const [
      // Verification logs
      verificationLogTotal,
      verificationLogExpiring7Days,
      verificationLogExpiring30Days,
      verificationLogOldest,
      verificationLogNewest,
      // Sync logs
      syncLogTotal,
      syncLogOldOlderThan90Days,
      syncLogOldest,
      syncLogNewest,
      // Plan acceptance (with expiration)
      planAcceptanceTotal,
      planAcceptanceExpiring7Days,
      planAcceptanceExpiring30Days,
      // Votes
      voteTotal,
    ] = await Promise.all([
      // Verification logs
      prisma.verificationLog.count(),
      prisma.verificationLog.count({
        where: { expiresAt: { lte: sevenDaysFromNow } },
      }),
      prisma.verificationLog.count({
        where: { expiresAt: { lte: thirtyDaysFromNow } },
      }),
      prisma.verificationLog.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.verificationLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      // Sync logs
      prisma.syncLog.count(),
      prisma.syncLog.count({
        where: { startedAt: { lt: syncLogCutoff } },
      }),
      prisma.syncLog.findFirst({
        orderBy: { startedAt: 'asc' },
        select: { startedAt: true },
      }),
      prisma.syncLog.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      }),
      // Plan acceptances
      prisma.providerPlanAcceptance.count(),
      prisma.providerPlanAcceptance.count({
        where: { expiresAt: { lte: sevenDaysFromNow } },
      }),
      prisma.providerPlanAcceptance.count({
        where: { expiresAt: { lte: thirtyDaysFromNow } },
      }),
      // Votes
      prisma.voteLog.count(),
    ]);

    res.json({
      success: true,
      data: {
        timestamp: now.toISOString(),
        verificationLogs: {
          total: verificationLogTotal,
          expiringIn7Days: verificationLogExpiring7Days,
          expiringIn30Days: verificationLogExpiring30Days,
          oldestRecord: verificationLogOldest?.createdAt?.toISOString() || null,
          newestRecord: verificationLogNewest?.createdAt?.toISOString() || null,
          retentionPolicy: '6 months (TTL via expiresAt)',
        },
        syncLogs: {
          total: syncLogTotal,
          olderThan90Days: syncLogOldOlderThan90Days,
          oldestRecord: syncLogOldest?.startedAt?.toISOString() || null,
          newestRecord: syncLogNewest?.startedAt?.toISOString() || null,
          retentionPolicy: '90 days (manual cleanup)',
        },
        planAcceptances: {
          total: planAcceptanceTotal,
          expiringIn7Days: planAcceptanceExpiring7Days,
          expiringIn30Days: planAcceptanceExpiring30Days,
          retentionPolicy: '6 months (TTL via expiresAt)',
        },
        voteLogs: {
          total: voteTotal,
          retentionPolicy: 'Follows plan acceptance TTL',
        },
      },
    });
  })
);

/**
 * POST /api/v1/admin/recalculate-confidence
 * Recalculate confidence scores for all provider-plan acceptance records
 * with time-based decay applied proactively.
 *
 * Protected by X-Admin-Secret header
 *
 * Query parameters:
 *   - dryRun: 'true' to preview changes without writing (default: false)
 *   - limit: max records to process (default: all)
 */
router.post(
  '/recalculate-confidence',
  adminAuthMiddleware,
  adminTimeout,
  asyncHandler(async (req, res) => {
    const { dryRun, limit } = confidenceQuerySchema.parse(req.query);

    logger.info({ dryRun, limit }, 'Admin: starting confidence recalculation');

    const stats = await recalculateAllConfidenceScores({
      dryRun,
      limit,
      batchSize: 100,
    });

    res.json({
      success: true,
      data: {
        dryRun,
        processed: stats.processed,
        updated: stats.updated,
        unchanged: stats.unchanged,
        errors: stats.errors,
        durationMs: stats.durationMs,
        duration: `${(stats.durationMs / 1000).toFixed(1)}s`,
        message: dryRun
          ? `Dry run complete. ${stats.updated} of ${stats.processed} records would be updated.`
          : `Recalculation complete. ${stats.updated} of ${stats.processed} records updated.`,
      },
    });
  })
);

// ============================================================================
// Encryption Key Rotation
// ============================================================================

/**
 * POST /api/v1/admin/rotate-encryption-key
 * Re-encrypt all insurance card PII fields with the current primary key.
 *
 * Workflow:
 *   1. Set INSURANCE_ENCRYPTION_KEY to the NEW key
 *   2. Set INSURANCE_ENCRYPTION_KEY_PREVIOUS to the OLD key
 *   3. Deploy — decrypt will auto-fallback to the previous key
 *   4. Call this endpoint to re-encrypt everything under the new key
 *   5. Remove INSURANCE_ENCRYPTION_KEY_PREVIOUS from env
 *
 * Protected by X-Admin-Secret header
 *
 * Query params:
 *   - dryRun: If 'true', only count records without re-encrypting (default: false)
 *   - batchSize: Records per batch (default: 50)
 */
router.post(
  '/rotate-encryption-key',
  adminAuthMiddleware,
  adminTimeout,
  asyncHandler(async (req, res) => {
    const { dryRun, batchSize } = rotationQuerySchema.parse(req.query);

    // Count total cards with any encrypted field
    const total = await prisma.userInsuranceCard.count({
      where: {
        OR: [
          { subscriberIdEnc: { not: null } },
          { groupNumberEnc: { not: null } },
          { rxbinEnc: { not: null } },
          { rxpcnEnc: { not: null } },
          { rxgrpEnc: { not: null } },
        ],
      },
    });

    logger.info(
      { dryRun, batchSize, total, hasPreviousKey: hasPreviousKey() },
      'Admin: encryption key rotation started'
    );

    if (dryRun) {
      res.json({
        success: true,
        data: {
          dryRun: true,
          totalRecords: total,
          hasPreviousKey: hasPreviousKey(),
          message: `Dry run complete. ${total} records would be re-encrypted.`,
        },
      });
      return;
    }

    // Acquire a Postgres advisory lock so two concurrent rotation attempts
    // can't read-then-write the same rows under inconsistent key assumptions
    // (e.g. accidental double-click, duplicate Cloud Scheduler job). We use
    // pg_try_advisory_lock so a second caller gets an immediate 409 instead
    // of blocking indefinitely. Lock ID is arbitrary but stable across the
    // process — any other rotation using ROTATION_LOCK_ID will conflict.
    // (F-07 / FINDING-38-05)
    const ROTATION_LOCK_ID = 4820173905;
    const lockResult = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`
      SELECT pg_try_advisory_lock(${ROTATION_LOCK_ID})
    `;
    if (!lockResult[0]?.pg_try_advisory_lock) {
      throw AppError.conflict('Encryption key rotation is already in progress');
    }

    let processed = 0;
    let errors = 0;
    let cursor: string | undefined;

    try {

    while (true) {
      const cards = await prisma.userInsuranceCard.findMany({
        where: {
          OR: [
            { subscriberIdEnc: { not: null } },
            { groupNumberEnc: { not: null } },
            { rxbinEnc: { not: null } },
            { rxpcnEnc: { not: null } },
            { rxgrpEnc: { not: null } },
          ],
        },
        take: batchSize,
        ...(cursor
          ? { skip: 1, cursor: { id: cursor } }
          : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          subscriberIdEnc: true,
          groupNumberEnc: true,
          rxbinEnc: true,
          rxpcnEnc: true,
          rxgrpEnc: true,
        },
      });

      if (cards.length === 0) break;
      cursor = cards[cards.length - 1].id;

      for (const card of cards) {
        try {
          // Decrypt with primary (or fallback to previous) key
          const plaintext = decryptCardPii({
            subscriberIdEnc: card.subscriberIdEnc,
            groupNumberEnc: card.groupNumberEnc,
            rxbinEnc: card.rxbinEnc,
            rxpcnEnc: card.rxpcnEnc,
            rxgrpEnc: card.rxgrpEnc,
          });

          // Re-encrypt with primary key
          const reEncrypted = encryptCardPii(plaintext);

          await prisma.userInsuranceCard.update({
            where: { id: card.id },
            data: reEncrypted,
          });

          processed++;
        } catch (err) {
          errors++;
          logger.error(
            { cardId: card.id, error: err instanceof Error ? err.message : 'Unknown' },
            'Failed to re-encrypt insurance card'
          );
        }
      }
    }

    logger.info(
      { processed, errors, total },
      'Admin: encryption key rotation complete'
    );

    res.json({
      success: true,
      data: {
        dryRun: false,
        totalRecords: total,
        processed,
        errors,
        message: `Re-encryption complete. ${processed} records re-encrypted, ${errors} errors.`,
      },
    });

    } finally {
      // Release the advisory lock on both success and error paths. Postgres
      // also auto-releases at session end, but we free it explicitly so
      // another rotation can run immediately after this returns.
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${ROTATION_LOCK_ID})`;
    }
  })
);

export default router;
