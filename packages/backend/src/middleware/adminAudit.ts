import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import logger from '../utils/logger';

/**
 * Audit middleware for admin endpoints.
 *
 * Every admin invocation is written to the `admin_actions` table with
 * endpoint, method, source IP, request ID, duration, and the result count
 * pulled from the response body. Writes are fire-and-forget — admin
 * responses are never delayed on audit I/O, and an audit write failure
 * never turns into a 5xx.
 *
 * Because admin auth is a shared secret (X-Admin-Secret), this table is
 * the only persistent trail distinguishing legitimate Cloud Scheduler
 * invocations from a leaked-secret attacker. See MEDIUM-04 / IM-11.
 *
 * Only a small allowlist of query params is persisted (dryRun, batchSize,
 * retentionDays, limit). Arbitrary query values and all headers — including
 * X-Admin-Secret itself — are never written. Request bodies are not
 * persisted at all.
 */

/**
 * Allowlist of query parameters that may be persisted to the
 * `admin_actions` audit table.
 *
 * - Only params in this list are stored; everything else (including
 *   secrets, free-form filters, debug toggles) is silently dropped.
 * - Defense-in-depth against accidentally auditing sensitive values that
 *   show up in admin URLs over time.
 * - If you add a new query param to any admin endpoint AND that param is
 *   safe to persist for incident review, add it here too. Otherwise leave
 *   it off and the audit row will simply omit it.
 *
 * Current list: dryRun, batchSize, retentionDays, limit.
 */
const SAFE_QUERY_PARAMS = ['dryRun', 'batchSize', 'retentionDays', 'limit'] as const;

type AdminResponseBody = {
  data?: {
    deletedCount?: unknown;
    deleted?: unknown;
    count?: unknown;
  };
};

function extractResultCount(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const data = (body as AdminResponseBody).data;
  if (!data) return null;
  for (const candidate of [data.deletedCount, data.deleted, data.count]) {
    if (typeof candidate === 'number') return candidate;
  }
  return null;
}

export function adminAudit(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    const durationMs = Date.now() - startTime;

    // Collect allowlisted string query params. Everything landing in `params`
    // is a plain string taken from req.query — JSON-safe by construction.
    const params: Record<string, string> = {};
    for (const key of SAFE_QUERY_PARAMS) {
      const value = req.query[key];
      if (typeof value === 'string') {
        params[key] = value;
      }
    }

    const resultCount = extractResultCount(body);

    // Fire-and-forget — don't await. If the DB is unavailable we log a
    // warning and let the admin response proceed unchanged.
    void prisma.adminAction
      .create({
        data: {
          endpoint: req.path,
          method: req.method,
          params: Object.keys(params).length > 0 ? (params as Prisma.InputJsonValue) : undefined,
          sourceIp: req.ip || null,
          requestId: req.id ? String(req.id) : null,
          dryRun: req.query.dryRun === 'true',
          resultCount,
          durationMs,
        },
      })
      .catch((err: unknown) => {
        logger.error(
          { err, endpoint: req.path },
          'Failed to write admin audit log'
        );
      });

    return originalJson(body);
  };

  next();
}
