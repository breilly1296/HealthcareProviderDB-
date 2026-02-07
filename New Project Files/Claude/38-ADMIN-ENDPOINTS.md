# Admin Endpoints

**Last Updated:** 2026-02-07

## Overview

The HealthcareProviderDB backend exposes a set of administrative endpoints under `/api/v1/admin/` for system maintenance, data retention, cache management, and monitoring. All admin endpoints are protected by a shared secret header (`X-Admin-Secret`) and are designed to be called by Cloud Scheduler jobs or internal tooling -- never by end users.

The admin route module is defined in `packages/backend/src/routes/admin.ts` and registered via `packages/backend/src/routes/index.ts`:

```typescript
// packages/backend/src/routes/index.ts
import adminRouter from './admin';
router.use('/admin', adminRouter);
```

This mounts all admin handlers under the `/api/v1/admin` prefix.

---

## Endpoints

| # | Method | Path | Purpose | Timeout | Status |
|---|--------|------|---------|---------|--------|
| 1 | POST | `/admin/cleanup-expired` | Delete expired verification records and plan acceptances | 120s (admin) | Implemented |
| 2 | GET | `/admin/expiration-stats` | Expiration statistics for verification logs and plan acceptances | 30s (default) | Implemented |
| 3 | GET | `/admin/health` | Admin health check with retention metrics and cache stats | 30s (default) | Implemented |
| 4 | POST | `/admin/cache/clear` | Clear all cached data (memory + Redis) | 30s (default) | Implemented |
| 5 | GET | `/admin/cache/stats` | Cache hit/miss statistics with hit rate calculation | 30s (default) | Implemented |
| 6 | GET | `/admin/enrichment/stats` | Location enrichment statistics (practice_locations + provider_hospitals) | 30s (default) | Implemented |
| 7 | POST | `/admin/cleanup/sync-logs` | Clean up sync_logs older than N days | 120s (admin) | Implemented |
| 8 | GET | `/admin/retention/stats` | Comprehensive retention statistics across all log types | 30s (default) | Implemented |
| 9 | POST | `/admin/recalculate-confidence` | Recalculate confidence scores with time-based decay | 120s (admin) | Implemented |

---

## Authentication

### X-Admin-Secret Header

All admin endpoints are gated by a single middleware function, `adminAuthMiddleware`, defined at the top of `packages/backend/src/routes/admin.ts` (lines 22-56).

```typescript
// packages/backend/src/routes/admin.ts (lines 22-56)
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
```

### Security Properties

| Property | Implementation | Details |
|----------|---------------|---------|
| **Timing-safe comparison** | `crypto.timingSafeEqual()` | Prevents timing attacks on secret validation. Buffer lengths are compared first (timingSafeEqual requires equal-length buffers), then constant-time comparison is used. |
| **Graceful degradation** | Returns HTTP 503 with `ADMIN_NOT_CONFIGURED` code | If `ADMIN_SECRET` environment variable is not set, all admin endpoints return 503 instead of failing silently. A warning is logged via the structured logger. |
| **Generic error messages** | `AppError.unauthorized('Invalid or missing admin secret')` | Returns a 401 with no indication of whether the secret was close, wrong length, or absent -- preventing information leakage. |
| **Secret configuration** | Environment variable `ADMIN_SECRET` | Recommended generation: `openssl rand -hex 32` (per `.env.example`). Never hardcoded. |

### Secret Configuration

From `packages/backend/.env.example` (line 23):

```bash
# Admin API secret for protected endpoints (Cloud Scheduler, cleanup jobs)
# Generate with: openssl rand -hex 32
ADMIN_SECRET=your-secure-admin-secret-here
```

---

## Endpoint Details

### 1. POST `/api/v1/admin/cleanup-expired`

**Purpose:** Deletes verification records and plan acceptances that have exceeded their 6-month TTL. Designed to be called by Cloud Scheduler on a recurring basis.

**Authentication:** `X-Admin-Secret` header required

**Timeout:** 120 seconds (`adminTimeout` middleware from `packages/backend/src/middleware/requestTimeout.ts`)

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `dryRun` | string | `'false'` | If `'true'`, returns counts of what would be deleted without actually deleting |
| `batchSize` | number | `1000` | Records to process per batch (used as a safety check for infinite loop prevention) |

**Implementation:** Delegates to `cleanupExpiredVerifications()` in `packages/backend/src/services/verificationService.ts` (lines 767-854). The cleanup logic:

1. Counts expired `verificationLog` records where `expiresAt < now AND expiresAt IS NOT NULL`
2. Counts expired `providerPlanAcceptance` records with the same filter
3. If `dryRun`, returns counts immediately
4. Otherwise, deletes in batches with infinite loop protection (breaks if `deleteResult.count === 0` or `deleteResult.count < batchSize`)

```typescript
// verificationService.ts - cleanup logic
const [expiredLogsCount, expiredAcceptanceCount] = await Promise.all([
  prisma.verificationLog.count({
    where: { expiresAt: { lt: now, not: null } },
  }),
  prisma.providerPlanAcceptance.count({
    where: { expiresAt: { lt: now, not: null } },
  }),
]);
```

**Response (dry run):**
```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "expiredPlanAcceptances": 150,
    "expiredVerificationLogs": 500,
    "deletedPlanAcceptances": 0,
    "deletedVerificationLogs": 0,
    "message": "Dry run complete. 650 records would be deleted."
  }
}
```

**Response (actual run):**
```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "expiredPlanAcceptances": 150,
    "expiredVerificationLogs": 500,
    "deletedPlanAcceptances": 150,
    "deletedVerificationLogs": 500,
    "message": "Cleanup complete. 650 records deleted."
  }
}
```

**Example Request:**
```bash
curl -X POST "https://api.verifymyprovider.com/api/v1/admin/cleanup-expired?dryRun=true" \
  -H "X-Admin-Secret: your-secret"
```

---

### 2. GET `/api/v1/admin/expiration-stats`

**Purpose:** Returns detailed statistics about data expiration across verification logs and plan acceptances, including counts of records with TTL, already expired, and expiring within 7 and 30 days.

**Authentication:** `X-Admin-Secret` header required

**Implementation:** Delegates to `getExpirationStats()` in `packages/backend/src/services/verificationService.ts` (lines 859-919). Runs 10 parallel Prisma queries covering total counts, TTL presence, expired counts, and records expiring within 7-day and 30-day windows for both `verificationLog` and `providerPlanAcceptance` tables.

**Response:**
```json
{
  "success": true,
  "data": {
    "verificationLogs": {
      "total": 50000,
      "withTTL": 49500,
      "expired": 500,
      "expiringWithin7Days": 200,
      "expiringWithin30Days": 1000
    },
    "planAcceptances": {
      "total": 10000,
      "withTTL": 9800,
      "expired": 150,
      "expiringWithin7Days": 50,
      "expiringWithin30Days": 200
    }
  }
}
```

**Example Request:**
```bash
curl "https://api.verifymyprovider.com/api/v1/admin/expiration-stats" \
  -H "X-Admin-Secret: your-secret"
```

---

### 3. GET `/api/v1/admin/health`

**Purpose:** Admin-authenticated health check that goes beyond a simple ping. Returns system uptime, cache statistics, and retention metrics for verification logs, sync logs, and vote logs.

**Authentication:** `X-Admin-Secret` header required

**Implementation:** Directly in `packages/backend/src/routes/admin.ts` (lines 123-184). Runs 6 parallel Prisma queries:

1. `verificationLog.count()` - total verification logs
2. `verificationLog.count({ where: { expiresAt: { lte: sevenDaysFromNow } } })` - expiring soon
3. `verificationLog.findFirst({ orderBy: { createdAt: 'asc' } })` - oldest record
4. `syncLog.count()` - total sync logs
5. `syncLog.findFirst({ orderBy: { startedAt: 'asc' } })` - oldest sync log
6. `voteLog.count()` - total votes

Also calls `getCacheStats()` from `packages/backend/src/utils/cache.ts` for cache hit/miss/size data.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-07T12:00:00.000Z",
    "uptime": 86400,
    "cache": {
      "hits": 150,
      "misses": 30,
      "sets": 200,
      "deletes": 5,
      "size": 42,
      "mode": "memory"
    },
    "retention": {
      "verificationLogs": {
        "total": 50000,
        "expiringIn7Days": 200,
        "oldestRecord": "2025-08-01T00:00:00.000Z"
      },
      "syncLogs": {
        "total": 500,
        "oldestRecord": "2025-11-01T00:00:00.000Z"
      },
      "voteLogs": {
        "total": 3000
      }
    }
  }
}
```

**Example Request:**
```bash
curl "https://api.verifymyprovider.com/api/v1/admin/health" \
  -H "X-Admin-Secret: your-secret"
```

---

### 4. POST `/api/v1/admin/cache/clear`

**Purpose:** Clears all cached data. Useful after data imports, schema changes, or when stale cached responses need to be purged. Works with both the in-memory cache and Redis (when configured).

**Authentication:** `X-Admin-Secret` header required

**Implementation:** Calls `cacheClear()` from `packages/backend/src/utils/cache.ts` (lines 249-271). The clear operation:

1. If Redis is connected, uses `SCAN`-based pattern deletion to clear all `cache:*` keys
2. Clears the in-memory `Map` store
3. Returns the total count of deleted entries

The cache module (`packages/backend/src/utils/cache.ts`) supports dual-mode operation:
- **In-memory** (`Map<string, CacheEntry>`) with 60-second periodic cleanup of expired entries
- **Redis** (via `REDIS_URL` env var) using `setex` for TTL and `SCAN` for safe pattern deletion

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Cache cleared. 42 entries removed.",
    "deletedCount": 42
  }
}
```

**Example Request:**
```bash
curl -X POST "https://api.verifymyprovider.com/api/v1/admin/cache/clear" \
  -H "X-Admin-Secret: your-secret"
```

---

### 5. GET `/api/v1/admin/cache/stats`

**Purpose:** Returns cache performance statistics including hit count, miss count, hit rate percentage, and current cache size.

**Authentication:** `X-Admin-Secret` header required

**Implementation:** Calls `getCacheStats()` from `packages/backend/src/utils/cache.ts` (lines 276-279), then computes the hit rate in the route handler. The stats object tracks `hits`, `misses`, `sets`, `deletes`, `size`, and `mode` ('redis' or 'memory').

**Response:**
```json
{
  "success": true,
  "data": {
    "hits": 150,
    "misses": 30,
    "sets": 200,
    "deletes": 5,
    "size": 42,
    "mode": "memory",
    "hitRate": "83.33%"
  }
}
```

The `hitRate` is calculated as:
```typescript
hitRate: stats.hits + stats.misses > 0
  ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%'
  : '0%',
```

**Example Request:**
```bash
curl "https://api.verifymyprovider.com/api/v1/admin/cache/stats" \
  -H "X-Admin-Secret: your-secret"
```

---

### 6. GET `/api/v1/admin/enrichment/stats`

**Purpose:** Returns location enrichment statistics showing how many practice locations exist, how many providers have hospital affiliations, and geographic distribution by state.

**Authentication:** `X-Admin-Secret` header required

**Implementation:** Delegates to `getEnrichmentStats()` in `packages/backend/src/services/locationEnrichment.ts` (lines 66-112). Runs 4 parallel queries:

1. `practice_locations.count()` - total locations
2. `provider_hospitals.groupBy({ by: ['npi'] })` - providers with hospital affiliations
3. `provider_hospitals.groupBy({ by: ['hospital_system'] })` - distinct hospital systems
4. `practice_locations.groupBy({ by: ['state'] })` - locations by state

Then performs a secondary query to compute how many location NPIs lack hospital affiliations.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalLocations": 50000,
    "providersWithHospitalAffiliations": 8000,
    "providersWithoutHospitalAffiliations": 12000,
    "distinctHospitalSystems": 250,
    "byState": [
      { "state": "CA", "count": 5000 },
      { "state": "NY", "count": 4500 },
      { "state": "TX", "count": 4000 }
    ]
  }
}
```

**Example Request:**
```bash
curl "https://api.verifymyprovider.com/api/v1/admin/enrichment/stats" \
  -H "X-Admin-Secret: your-secret"
```

---

### 7. POST `/api/v1/admin/cleanup/sync-logs`

**Purpose:** Clean up `sync_logs` records older than N days. Designed to be called by Cloud Scheduler daily to enforce a 90-day default retention policy.

**Authentication:** `X-Admin-Secret` header required

**Timeout:** 120 seconds (`adminTimeout` middleware)

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `dryRun` | string | `'false'` | If `'true'`, only return counts without deleting |
| `retentionDays` | number | `90` | Delete sync logs older than this many days |

**Implementation:** Directly in `packages/backend/src/routes/admin.ts` (lines 275-338). Calculates a cutoff date (`now - retentionDays`), then either counts or deletes `syncLog` records where `startedAt < cutoffDate`.

```typescript
// admin.ts - sync-logs cleanup
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

// Dry run: count only
const count = await prisma.syncLog.count({
  where: { startedAt: { lt: cutoffDate } },
});

// Actual run: delete
const result = await prisma.syncLog.deleteMany({
  where: { startedAt: { lt: cutoffDate } },
});
```

**Response (dry run):**
```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "recordsToDelete": 150,
    "olderThan": "2025-11-09T00:00:00.000Z",
    "message": "Dry run complete. 150 sync_logs records would be deleted."
  }
}
```

**Response (actual run):**
```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "deletedCount": 150,
    "olderThan": "2025-11-09T00:00:00.000Z",
    "message": "Cleanup complete. 150 sync_logs records deleted."
  }
}
```

**Example Request:**
```bash
curl -X POST "https://api.verifymyprovider.com/api/v1/admin/cleanup/sync-logs?dryRun=true&retentionDays=90" \
  -H "X-Admin-Secret: your-secret"
```

---

### 8. GET `/api/v1/admin/retention/stats`

**Purpose:** Comprehensive retention statistics across all four log/data types: verification logs, sync logs, plan acceptances, and vote logs. Includes expiration windows (7-day and 30-day lookahead), oldest/newest records, and documented retention policies.

**Authentication:** `X-Admin-Secret` header required

**Implementation:** Directly in `packages/backend/src/routes/admin.ts` (lines 346-452). Runs 13 parallel Prisma queries covering counts, expiration windows, and date boundaries for each data type.

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-02-07T12:00:00.000Z",
    "verificationLogs": {
      "total": 50000,
      "expiringIn7Days": 200,
      "expiringIn30Days": 1000,
      "oldestRecord": "2025-08-01T00:00:00.000Z",
      "newestRecord": "2026-02-07T11:30:00.000Z",
      "retentionPolicy": "6 months (TTL via expiresAt)"
    },
    "syncLogs": {
      "total": 500,
      "olderThan90Days": 50,
      "oldestRecord": "2025-11-01T00:00:00.000Z",
      "newestRecord": "2026-02-07T06:00:00.000Z",
      "retentionPolicy": "90 days (manual cleanup)"
    },
    "planAcceptances": {
      "total": 10000,
      "expiringIn7Days": 50,
      "expiringIn30Days": 200,
      "retentionPolicy": "6 months (TTL via expiresAt)"
    },
    "voteLogs": {
      "total": 3000,
      "retentionPolicy": "Follows plan acceptance TTL"
    }
  }
}
```

**Retention Policies by Data Type:**

| Data Type | Retention | Mechanism |
|-----------|-----------|-----------|
| Verification Logs | 6 months | `expiresAt` column, cleaned by `cleanup-expired` |
| Plan Acceptances | 6 months | `expiresAt` column, cleaned by `cleanup-expired` |
| Sync Logs | 90 days | `startedAt` comparison, cleaned by `cleanup/sync-logs` |
| Vote Logs | Follows plan acceptance | Cascading from plan acceptance lifecycle |

**Example Request:**
```bash
curl "https://api.verifymyprovider.com/api/v1/admin/retention/stats" \
  -H "X-Admin-Secret: your-secret"
```

---

### 9. POST `/api/v1/admin/recalculate-confidence`

**Purpose:** Proactively recalculate confidence scores with time-based decay for all `ProviderPlanAcceptance` records that have at least 1 verification. This ensures search results display accurate (decayed) scores rather than only applying decay on individual page views.

**Authentication:** `X-Admin-Secret` header required

**Timeout:** 120 seconds (`adminTimeout` middleware)

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `dryRun` | string | `'false'` | If `'true'`, preview changes without writing to the database |
| `limit` | number | all records | Maximum records to process (must be a positive integer) |

**Implementation:** Delegates to `recalculateAllConfidenceScores()` in `packages/backend/src/services/confidenceDecayService.ts` (lines 33-168). The recalculation process:

1. Counts total `providerPlanAcceptance` records with `verificationCount >= 1`
2. Iterates in cursor-based batches (default batch size: 100)
3. For each record:
   - Fetches the provider's `primary_specialty` for specialty-specific decay rates
   - Aggregates `upvotes`/`downvotes` from related non-expired `verificationLog` entries
   - Recalculates score via `calculateConfidenceScore()` (from `packages/backend/src/services/confidenceService.ts`)
   - Updates the record if the score has changed (skips update if unchanged)
4. Returns statistics: `processed`, `updated`, `unchanged`, `errors`, `durationMs`

The confidence scoring system (`confidenceService.ts`) uses a 4-factor model (max 100 points):

| Factor | Max Points | Description |
|--------|-----------|-------------|
| Data Source | 25 | CMS/official data scores highest |
| Recency | 30 | Tiered decay with specialty-specific thresholds |
| Verification Count | 25 | Optimal at 3+ verifications (research-based) |
| Agreement | 20 | Community consensus via upvote/downvote ratio |

Specialty-specific freshness thresholds (based on Ndumele et al. 2018):
- Mental Health: 30 days (43% Medicaid acceptance, high churn)
- Primary Care: 60 days (12% annual turnover)
- Specialist: 60 days
- Hospital-Based: 90 days (more stable)

**Response:**
```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "processed": 10000,
    "updated": 3500,
    "unchanged": 6450,
    "errors": 50,
    "durationMs": 45000,
    "duration": "45.0s",
    "message": "Recalculation complete. 3500 of 10000 records updated."
  }
}
```

**Example Request:**
```bash
# Dry run - preview changes
curl -X POST "https://api.verifymyprovider.com/api/v1/admin/recalculate-confidence?dryRun=true" \
  -H "X-Admin-Secret: your-secret"

# Limit to first 500 records
curl -X POST "https://api.verifymyprovider.com/api/v1/admin/recalculate-confidence?limit=500" \
  -H "X-Admin-Secret: your-secret"
```

---

## Cloud Scheduler Integration

### Recommended Scheduler Jobs

#### Cleanup Expired Verifications (Hourly)

```yaml
Name: cleanup-expired-verifications
Schedule: 0 * * * *   # Every hour
Target: HTTP POST
URL: https://backend-xxx.run.app/api/v1/admin/cleanup-expired
Headers:
  X-Admin-Secret: ${ADMIN_SECRET}
  Content-Type: application/json
Body: {}
```

```bash
gcloud scheduler jobs create http cleanup-expired \
  --location=us-central1 \
  --schedule="0 * * * *" \
  --uri="https://backend-xxx.run.app/api/v1/admin/cleanup-expired" \
  --http-method=POST \
  --headers="X-Admin-Secret=${ADMIN_SECRET}"
```

#### Cleanup Sync Logs (Daily)

```yaml
Name: cleanup-sync-logs
Schedule: 0 3 * * *   # Daily at 3 AM
Target: HTTP POST
URL: https://backend-xxx.run.app/api/v1/admin/cleanup/sync-logs
Headers:
  X-Admin-Secret: ${ADMIN_SECRET}
  Content-Type: application/json
Body: {}
```

```bash
gcloud scheduler jobs create http cleanup-sync-logs \
  --location=us-central1 \
  --schedule="0 3 * * *" \
  --uri="https://backend-xxx.run.app/api/v1/admin/cleanup/sync-logs" \
  --http-method=POST \
  --headers="X-Admin-Secret=${ADMIN_SECRET}"
```

#### Recalculate Confidence Scores (Daily)

```yaml
Name: recalculate-confidence
Schedule: 0 4 * * *   # Daily at 4 AM
Target: HTTP POST
URL: https://backend-xxx.run.app/api/v1/admin/recalculate-confidence
Headers:
  X-Admin-Secret: ${ADMIN_SECRET}
  Content-Type: application/json
Body: {}
```

```bash
gcloud scheduler jobs create http recalculate-confidence \
  --location=us-central1 \
  --schedule="0 4 * * *" \
  --uri="https://backend-xxx.run.app/api/v1/admin/recalculate-confidence" \
  --http-method=POST \
  --headers="X-Admin-Secret=${ADMIN_SECRET}" \
  --attempt-deadline=120s
```

### Testing Scheduler Jobs

```bash
# Test cleanup job
gcloud scheduler jobs run cleanup-expired --location=us-central1

# Test sync log cleanup
gcloud scheduler jobs run cleanup-sync-logs --location=us-central1

# Test confidence recalculation
gcloud scheduler jobs run recalculate-confidence --location=us-central1
```

---

## Timeout Configuration

Admin endpoints that perform batch database operations use a dedicated 120-second timeout, defined in `packages/backend/src/middleware/requestTimeout.ts`:

```typescript
// packages/backend/src/middleware/requestTimeout.ts
export const adminTimeout = requestTimeout(120_000);  // 120 seconds
export const generalTimeout = requestTimeout(30_000); // 30 seconds (default)
export const searchTimeout = requestTimeout(15_000);  // 15 seconds
```

The timeout middleware returns HTTP 408 with a structured error if the response is not sent within the limit:

```json
{
  "success": false,
  "error": {
    "message": "Request timed out",
    "code": "REQUEST_TIMEOUT",
    "statusCode": 408,
    "requestId": "..."
  }
}
```

Endpoints using `adminTimeout` (120s): `cleanup-expired`, `cleanup/sync-logs`, `recalculate-confidence`

All other admin endpoints use the default Express timeout (no explicit `adminTimeout` middleware applied).

---

## Error Handling

All admin route handlers are wrapped in `asyncHandler()` from `packages/backend/src/middleware/errorHandler.ts`, which catches Promise rejections and passes them to the global error handler. Key error scenarios:

| Scenario | Status Code | Error Code | Source |
|----------|-------------|------------|--------|
| `ADMIN_SECRET` not configured | 503 | `ADMIN_NOT_CONFIGURED` | `adminAuthMiddleware` |
| Invalid/missing secret header | 401 | - | `AppError.unauthorized()` |
| Invalid `limit` param (recalculate) | 400 | - | `AppError.badRequest()` |
| Request timeout (120s for batch ops) | 408 | `REQUEST_TIMEOUT` | `requestTimeout` middleware |
| Database connection pool timeout | 503 | `DATABASE_TIMEOUT` | Global error handler (Prisma P2024) |
| Database unavailable | 503 | `DATABASE_UNAVAILABLE` | Global error handler (PrismaClientInitializationError) |

---

## Logging

All admin endpoints produce structured log entries via the project's `logger` utility (`packages/backend/src/utils/logger.ts`). Key log events:

| Endpoint | Log Level | Log Message |
|----------|-----------|-------------|
| `cleanup-expired` | `info` | `'Admin cleanup expired verifications started'` with `{ dryRun, batchSize }` |
| `cleanup-expired` | `info` | `'Admin cleanup complete'` with full result object |
| `cache/clear` | `info` | `'Admin cache clear requested'` |
| `cache/clear` | `info` | `'Admin cache clear complete'` with `{ deletedCount }` |
| `cleanup/sync-logs` | `info` | `'Admin sync_logs cleanup started'` with `{ dryRun, retentionDays, cutoffDate }` |
| `cleanup/sync-logs` | `info` | `'Admin sync_logs cleanup complete'` / `'...dry run complete'` |
| `recalculate-confidence` | `info` | `'Admin: starting confidence recalculation'` with `{ dryRun, limit }` |
| `recalculate-confidence` | `info` | `'Confidence score recalculation complete'` with full stats |
| `recalculate-confidence` | `error` | `'Error recalculating confidence for record'` with `{ err, recordId }` |
| Auth failure | `warn` | `'ADMIN_SECRET not configured - admin endpoints disabled'` |

---

## Cleanup Stats (Last Run)

These values can only be obtained by calling the admin endpoints. Use the following to inspect current state:

```bash
# Check what would be cleaned up (dry run)
curl -X POST "https://api.verifymyprovider.com/api/v1/admin/cleanup-expired?dryRun=true" \
  -H "X-Admin-Secret: $ADMIN_SECRET"

# Get comprehensive retention stats
curl "https://api.verifymyprovider.com/api/v1/admin/retention/stats" \
  -H "X-Admin-Secret: $ADMIN_SECRET"

# Check cache performance
curl "https://api.verifymyprovider.com/api/v1/admin/cache/stats" \
  -H "X-Admin-Secret: $ADMIN_SECRET"
```

---

## Issues

1. **No audit logging for admin actions.** Admin operations (cleanup, cache clear, recalculation) are logged via the application logger but not persisted to a dedicated audit table. There is no record of *who* triggered an action (the secret is shared, not per-user).

2. **No IP allowlisting.** Admin endpoints are accessible from any IP that knows the secret. There is no restriction to Cloud Scheduler IPs or office networks.

3. **Cloud Scheduler not yet confirmed configured.** The code is ready for scheduled invocation, but actual Cloud Scheduler job creation requires manual GCP setup (see commands in Cloud Scheduler section above).

4. **No monitoring/alerting on cleanup failures.** If a scheduler job fails (e.g., timeout on large batch), there is no alerting mechanism beyond Cloud Scheduler's built-in retry behavior.

5. **Shared secret authentication.** All admin callers (Cloud Scheduler, manual ops) use the same `ADMIN_SECRET`. There is no per-caller identity, role differentiation, or secret rotation mechanism.

6. **Batch deletion not truly bounded by `batchSize`.** In `cleanupExpiredVerifications()`, the Prisma `deleteMany` does not use `take`/`limit` -- it deletes all matching records in a single query. The `batchSize` parameter is only used as an infinite loop guard (`if (deleteResult.count < batchSize) break`). This means the first batch may delete all records at once regardless of `batchSize`.

7. **Vote logs lack independent cleanup.** Vote logs follow plan acceptance TTL implicitly (as documented in retention stats), but there is no explicit cleanup endpoint or cascade delete for orphaned vote logs.

---

## Recommendations

1. **Set up Cloud Scheduler jobs** for `cleanup-expired` (hourly), `cleanup/sync-logs` (daily), and `recalculate-confidence` (daily) using the gcloud commands provided above.

2. **Add IP allowlisting** for admin endpoints. Restrict to Google Cloud Scheduler source IPs (`35.187.0.0/16`, `35.198.0.0/16` ranges) and any known office/VPN IPs using middleware.

3. **Implement audit logging.** Create an `admin_audit_log` table that records the endpoint called, timestamp, request parameters, result summary, and caller identity (e.g., a caller-id header for different scheduler jobs).

4. **Set up Cloud Monitoring alerts** on scheduler job failure rates and admin endpoint error responses (5xx).

5. **Consider per-endpoint or per-caller secrets** to enable rotation without downtime and to distinguish between automated (scheduler) and manual (operator) callers in logs.

6. **Fix batch deletion to use actual Prisma `take`** to prevent large single-query deletes that could cause database load spikes. Currently `batchSize` does not limit the delete query itself.

7. **Add explicit vote log cleanup** either as a cascade from plan acceptance deletion or as a separate admin cleanup endpoint.

8. **Consider moving admin endpoints to a separate service** for better isolation, independent scaling, and stricter network policies.

---

## Source Files

| File | Description |
|------|-------------|
| `packages/backend/src/routes/admin.ts` | All 9 admin route handlers and `adminAuthMiddleware` |
| `packages/backend/src/routes/index.ts` | Route registration (`router.use('/admin', adminRouter)`) |
| `packages/backend/src/services/verificationService.ts` | `cleanupExpiredVerifications()` and `getExpirationStats()` |
| `packages/backend/src/services/confidenceDecayService.ts` | `recalculateAllConfidenceScores()` |
| `packages/backend/src/services/confidenceService.ts` | `calculateConfidenceScore()` - 4-factor scoring model |
| `packages/backend/src/services/locationEnrichment.ts` | `getEnrichmentStats()` |
| `packages/backend/src/utils/cache.ts` | `cacheClear()`, `getCacheStats()` - dual-mode cache (memory/Redis) |
| `packages/backend/src/middleware/requestTimeout.ts` | `adminTimeout` (120s) middleware |
| `packages/backend/src/middleware/errorHandler.ts` | `asyncHandler()`, `AppError`, global error handler |
| `packages/backend/src/config/constants.ts` | `VERIFICATION_TTL_MS` (6 months), `SYBIL_PREVENTION_WINDOW_MS` |
| `packages/backend/.env.example` | `ADMIN_SECRET` configuration template |
