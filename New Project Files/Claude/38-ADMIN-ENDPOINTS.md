# Admin Endpoints

**Last Updated:** 2026-02-06

## Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/v1/admin/cleanup-expired` | POST | TTL cleanup of expired verifications & acceptances | VERIFIED |
| `/api/v1/admin/expiration-stats` | GET | Verification expiration statistics | VERIFIED |
| `/api/v1/admin/health` | GET | Health check with retention metrics | VERIFIED |
| `/api/v1/admin/cache/clear` | POST | Clear all cached data | VERIFIED |
| `/api/v1/admin/cache/stats` | GET | Cache statistics with hit rate | VERIFIED |
| `/api/v1/admin/enrichment/stats` | GET | Location enrichment statistics | VERIFIED |
| `/api/v1/admin/cleanup/sync-logs` | POST | Sync log retention cleanup | VERIFIED |
| `/api/v1/admin/retention/stats` | GET | Comprehensive retention statistics | VERIFIED |
| `/api/v1/admin/recalculate-confidence` | POST | Confidence score recalculation with time decay | VERIFIED |

**Total: 9 endpoints** -- all verified in `packages/backend/src/routes/admin.ts`

## Authentication

### Method: X-Admin-Secret Header
- **Implementation**: `adminAuthMiddleware` function in `admin.ts` (lines 21-55)
- **Secret source**: `process.env.ADMIN_SECRET`
- **Comparison**: Timing-safe via `crypto.timingSafeEqual()` -- VERIFIED
- **Buffer handling**: Both provided and expected values are converted to `Buffer` before comparison
- **Length check**: Verifies buffer lengths match before `timingSafeEqual()` to prevent crashes (timingSafeEqual requires equal-length buffers)

### Security Features Verified
- [x] **Timing-safe comparison**: Uses `timingSafeEqual` from Node.js `crypto` module
- [x] **Graceful degradation**: Returns 503 with `ADMIN_NOT_CONFIGURED` code if `ADMIN_SECRET` environment variable is not set
- [x] **No information leakage**: Returns generic "Invalid or missing admin secret" message on failure
- [x] **All endpoints protected**: Every route in admin.ts uses `adminAuthMiddleware` as the first middleware

## Endpoint Details

### POST /admin/cleanup-expired

**Purpose**: Delete verification records and plan acceptances that have exceeded their TTL.

**Query Parameters**:
| Param | Type | Default | Verified |
|-------|------|---------|----------|
| `dryRun` | string | `'false'` | YES -- returns counts without deleting |
| `batchSize` | number | `1000` | YES -- passed to service function |

**Implementation verified in `verificationService.ts`** (`cleanupExpiredVerifications`):
- Counts expired records first
- In dry-run mode: returns counts only
- In delete mode: deletes in batches with safety checks to prevent infinite loops
- Deletes verification logs first, then plan acceptances
- Uses `expiresAt < now AND expiresAt IS NOT NULL` filter (preserves legacy records without TTL)

**Response format**:
```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "expiredVerificationLogs": 500,
    "expiredPlanAcceptances": 150,
    "deletedVerificationLogs": 500,
    "deletedPlanAcceptances": 150,
    "message": "Cleanup complete. 650 records deleted."
  }
}
```

### GET /admin/expiration-stats

**Purpose**: Monitor data freshness and upcoming expirations.

**Implementation verified in `verificationService.ts`** (`getExpirationStats`):
- Runs 10 parallel queries for comprehensive stats
- Reports for both verification logs and plan acceptances:
  - Total records
  - Records with TTL set
  - Currently expired
  - Expiring within 7 days
  - Expiring within 30 days

### GET /admin/health

**Purpose**: Health check with retention metrics.

**Verified to return**:
- Server status ("healthy")
- Timestamp and uptime
- Cache statistics
- Retention metrics:
  - Verification logs: total, expiring in 7 days, oldest record
  - Sync logs: total, oldest record
  - Vote logs: total count

### POST /admin/cache/clear

**Purpose**: Force clear all cached data.

**Implementation**: Calls `cacheClear()` from `utils/cache`. Returns count of deleted entries. Useful after data imports or manual corrections.

### GET /admin/cache/stats

**Purpose**: Monitor cache performance.

**Returns**:
- Hit count
- Miss count
- Hit rate (computed as percentage)
- Cache size (number of entries)

### GET /admin/enrichment/stats

**Purpose**: Monitor location enrichment coverage.

**Implementation**: Calls `getEnrichmentStats()` from `services/locationEnrichment`. Returns statistics about practice_locations and provider_hospitals enrichment.

### POST /admin/cleanup/sync-logs

**Purpose**: Clean up old sync_logs for retention compliance.

**Query Parameters**:
| Param | Type | Default | Verified |
|-------|------|---------|----------|
| `dryRun` | string | `'false'` | YES |
| `retentionDays` | number | `90` | YES -- deletes logs older than this |

**Implementation**:
- Computes cutoff date from retentionDays
- Dry run: counts records that would be deleted
- Delete mode: uses `prisma.syncLog.deleteMany()` with `startedAt < cutoffDate`
- Logs actions via pino logger

### GET /admin/retention/stats

**Purpose**: Comprehensive retention overview across all log types.

**Returns statistics for**:
- **Verification logs**: total, expiring in 7/30 days, oldest/newest records, retention policy
- **Sync logs**: total, records older than 90 days, oldest/newest records, retention policy
- **Plan acceptances**: total, expiring in 7/30 days, retention policy
- **Vote logs**: total count, retention policy

**Retention policies reported**:
- Verification logs: "6 months (TTL via expiresAt)"
- Sync logs: "90 days (manual cleanup)"
- Plan acceptances: "6 months (TTL via expiresAt)"
- Vote logs: "Follows plan acceptance TTL"

### POST /admin/recalculate-confidence

**Purpose**: Proactively apply time-based decay to all confidence scores.

**Query Parameters**:
| Param | Type | Default | Verified |
|-------|------|---------|----------|
| `dryRun` | string | `'false'` | YES |
| `limit` | number | all records | YES -- validated as positive integer |

**Implementation**: Calls `recalculateAllConfidenceScores()` from `confidenceDecayService` with batch processing (100 records per batch).

**Returns**: processed count, updated count, unchanged count, errors count, duration in ms.

## Cloud Scheduler Integration

**Status**: Configuration documented in prompt but not verified in code. The cleanup endpoint is designed to be called by Cloud Scheduler (as noted in code comments).

**Recommended configuration** (from source code comments):
```
Job: cleanup-expired-verifications
Schedule: 0 * * * * (hourly)
Target: POST /api/v1/admin/cleanup-expired
Headers: X-Admin-Secret: ${ADMIN_SECRET}
```

## Checklist Verification

### Authentication
- [x] X-Admin-Secret header required -- VERIFIED: `adminAuthMiddleware` applied to all routes
- [x] Timing-safe comparison -- VERIFIED: `timingSafeEqual()` from Node.js crypto
- [x] Graceful 503 if not configured -- VERIFIED: returns `ADMIN_NOT_CONFIGURED` if env var missing
- [x] All 9 endpoints protected -- VERIFIED: every route uses adminAuthMiddleware
- [ ] Audit logging for admin actions -- PARTIAL: pino logger captures cleanup/cache actions but no dedicated audit log table

### Endpoints (9 total)
- [x] POST /admin/cleanup-expired -- VERIFIED with dry-run support
- [x] GET /admin/expiration-stats -- VERIFIED with comprehensive stats
- [x] GET /admin/health -- VERIFIED with cache + retention metrics
- [x] POST /admin/cache/clear -- VERIFIED with deletion count
- [x] GET /admin/cache/stats -- VERIFIED with hit rate computation
- [x] GET /admin/enrichment/stats -- VERIFIED (calls enrichment service)
- [x] POST /admin/cleanup/sync-logs -- VERIFIED with retention days parameter
- [x] GET /admin/retention/stats -- VERIFIED with multi-table statistics
- [x] POST /admin/recalculate-confidence -- VERIFIED with batch processing

### Automation
- [ ] Cloud Scheduler configured -- Cannot verify from code
- [ ] Monitoring on job failures -- Not implemented
- [ ] Alerting on cleanup errors -- Not implemented

### Security
- [x] No rate limiting on admin (auth required) -- VERIFIED: no rate limiters on admin routes
- [x] Secret in environment variable -- VERIFIED: `process.env.ADMIN_SECRET`
- [ ] IP allowlist for admin endpoints -- NOT implemented
- [ ] Audit log for admin actions -- NOT implemented (uses standard pino logging only)

## Questions Answered

### 1. Is Cloud Scheduler configured?
**Cannot verify from code alone.** The admin routes are designed for Cloud Scheduler integration (as documented in code comments), but the actual scheduler configuration is an infrastructure concern. The endpoint accepts the expected parameters (dryRun, batchSize) and returns structured results suitable for monitoring.

### 2. What additional admin endpoints are needed?
Based on code analysis, these would be valuable additions:
- `GET /admin/stats` -- Overall system statistics (provider count, plan count, verification count)
- `GET /admin/providers/flagged` -- Providers with conflicting verifications (ACCEPTED vs NOT_ACCEPTED)
- `POST /admin/providers/:npi/review` -- Mark a provider's data as manually reviewed
- `GET /admin/rate-limits` -- Current rate limit status per IP
- `GET /admin/verifications/review-queue` -- Verifications pending manual review (`isApproved: null`)
- `POST /admin/verifications/:id/approve` -- Approve/reject a verification

### 3. Should we add IP allowlisting?
**Recommended for production.** Options:
- Allow only Cloud Scheduler IP ranges (Google publishes these)
- Use Cloud Run IAM authentication instead of/in addition to X-Admin-Secret
- Add a simple IP allowlist middleware checking against `ADMIN_ALLOWED_IPS` env var
- The current timing-safe secret comparison is good but could be supplemented with IP restrictions

### 4. Is there audit logging for admin actions?
**Partial.** Admin actions are logged via pino with context (e.g., `logger.info({ dryRun, batchSize }, 'Admin cleanup expired verifications started')`). However, there is no dedicated audit log table in the database. All cleanup operations log before and after execution with result counts. This provides basic traceability through log analysis but not queryable audit history.

### 5. Should admin endpoints be separate service?
For the current scale, keeping admin endpoints in the same service is appropriate. Separation would be beneficial when:
- Admin operations cause performance impact on user-facing routes
- Different scaling requirements (admin is low-traffic, bursty)
- Different security policies needed (network isolation)
- **Recommendation**: Not needed now, but keep the `admin.ts` router isolated for easy extraction later

## Issues

1. **No input validation on batchSize**: The `batchSize` parameter in cleanup-expired is parsed with `parseInt()` but not validated against a maximum. A very large batchSize could cause memory issues.
2. **No pagination on retention/stats**: The retention stats endpoint runs many aggregate queries simultaneously. Under high load, this could be slow.
3. **Cleanup-expired batch logic**: The batch deletion loop checks `if (deleteResult.count < batchSize) break` but `deleteMany` in Prisma does not accept a `take` parameter, so ALL matching records are deleted in a single query -- the batchSize parameter effectively has no effect.
4. **No CORS restriction on admin routes**: Admin routes inherit the same CORS policy as public routes.
5. **Enrichment stats import issue**: The admin route imports `getEnrichmentStats` from `locationEnrichment`, but `locationEnrichment.ts` is excluded from the backend tsconfig compilation. This could cause build issues.

## Recommendations

1. **Add batchSize validation**: Cap batchSize at a reasonable maximum (e.g., 10000) and validate it as a positive integer.
2. **Implement true batch deletion**: Use `findMany({ take: batchSize })` then `deleteMany({ where: { id: { in: ids } } })` to actually batch the deletions.
3. **Add audit log table**: Create a `admin_audit_log` table to record admin actions (endpoint, parameters, result, timestamp) for compliance and debugging.
4. **Add IP allowlisting**: Implement `ADMIN_ALLOWED_IPS` environment variable for additional security layer.
5. **Add scheduled job monitoring**: Create an endpoint that Cloud Scheduler health checks can use to verify job completion status.
