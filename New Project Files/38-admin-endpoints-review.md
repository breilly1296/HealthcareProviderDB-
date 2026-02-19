# Admin Endpoints Review

**Generated:** 2026-02-18
**Prompt:** `prompts/38-admin-endpoints.md`
**Status:** 11 Endpoints Implemented (Exceeds Prompt's 9) -- All Secured

---

## Files Reviewed

| File | Path | Lines | Status |
|------|------|-------|--------|
| admin.ts | `packages/backend/src/routes/admin.ts` | 682 | Verified |
| verificationService.ts | `packages/backend/src/services/verificationService.ts` | 910 | Verified (cleanup logic) |
| constants.ts | `packages/backend/src/config/constants.ts` | 120 | Verified |

---

## Admin Authentication

### `adminAuthMiddleware` -- Verified

```typescript
function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) {
    // Graceful 503 if not configured
    res.status(503).json({ ... code: 'ADMIN_NOT_CONFIGURED' ... });
    return;
  }

  const providedSecret = req.headers['x-admin-secret'];
  const providedBuffer = Buffer.from(String(providedSecret || ''));
  const secretBuffer = Buffer.from(adminSecret);

  const isValid =
    providedBuffer.length === secretBuffer.length &&
    timingSafeEqual(providedBuffer, secretBuffer);

  if (!isValid) {
    throw AppError.unauthorized('Invalid or missing admin secret');
  }

  next();
}
```

**Security features confirmed:**

| Feature | Status | Details |
|---------|--------|---------|
| Timing-safe comparison | Verified | `crypto.timingSafeEqual()` prevents timing attacks |
| Length check before comparison | Verified | `timingSafeEqual` requires equal-length buffers; length checked first |
| Graceful degradation | Verified | Returns 503 with `ADMIN_NOT_CONFIGURED` if `ADMIN_SECRET` not set |
| Generic error message | Verified | "Invalid or missing admin secret" -- does not reveal whether secret exists |
| Buffer conversion | Verified | `Buffer.from(String(providedSecret || ''))` handles null/undefined safely |

**Note on timing attack mitigation:** The length comparison (`providedBuffer.length === secretBuffer.length`) leaks the secret length via timing. However, this is a necessary prerequisite for `timingSafeEqual` which requires equal-length buffers. The length leak is considered acceptable because knowing the secret length alone is not exploitable.

---

## Endpoint Inventory

The prompt lists 9 endpoints. The actual implementation has **11 endpoints** (2 additional endpoints found beyond the prompt's list).

### Endpoint 1: POST /api/v1/admin/cleanup-expired -- VERIFIED

**Purpose:** Delete verification records past their TTL
**Middleware:** `adminAuthMiddleware`, `adminTimeout`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | query | `'false'` | Preview mode |
| `batchSize` | query | `1000` | Records per batch |

**Implementation:** Delegates to `cleanupExpiredVerifications()` in `verificationService.ts` which:
- Counts expired `VerificationLog` and `ProviderPlanAcceptance` records
- In dry run mode, returns counts without deleting
- In live mode, deletes in batches with safety checks (breaks on `deleteResult.count === 0` or `< batchSize` to prevent infinite loops)
- Returns `{ expiredVerificationLogs, expiredPlanAcceptances, deletedVerificationLogs, deletedPlanAcceptances }`

**Response format:**
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

---

### Endpoint 2: POST /api/v1/admin/cleanup-sessions -- NEW (Not in prompt)

**Purpose:** Delete expired user sessions from the database
**Middleware:** `adminAuthMiddleware`, `adminTimeout`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | query | `'false'` | Preview mode |

**Implementation:** Delegates to `cleanupExpiredSessions()` in `authService.ts`.

---

### Endpoint 3: GET /api/v1/admin/expiration-stats -- VERIFIED

**Purpose:** Get statistics about verification expiration
**Middleware:** `adminAuthMiddleware`

**Response:** Returns detailed expiration statistics for both `verificationLogs` and `planAcceptances`:
- Total count, with-TTL count, expired count
- Expiring within 7 days and 30 days

---

### Endpoint 4: GET /api/v1/admin/health -- VERIFIED

**Purpose:** Admin health check with retention metrics
**Middleware:** `adminAuthMiddleware`

**Response includes:**
- Server `status`, `timestamp`, `uptime`
- Cache statistics (hits, misses, size)
- Retention metrics:
  - `verificationLogs`: total, expiringIn7Days, oldestRecord
  - `syncLogs`: total, oldestRecord
  - `voteLogs`: total

This is more comprehensive than the prompt describes -- it combines health check with retention monitoring.

---

### Endpoint 5: POST /api/v1/admin/cache/clear -- VERIFIED

**Purpose:** Clear all cached data
**Middleware:** `adminAuthMiddleware`

**Response:**
```json
{
  "success": true,
  "data": { "message": "Cache cleared. 42 entries removed.", "deletedCount": 42 }
}
```

---

### Endpoint 6: GET /api/v1/admin/cache/stats -- VERIFIED

**Purpose:** Get cache statistics with hit rate
**Middleware:** `adminAuthMiddleware`

**Response:**
```json
{
  "success": true,
  "data": { "hits": 150, "misses": 30, "hitRate": "83.33%", "size": 42 }
}
```

The `hitRate` is calculated inline: `((hits / (hits + misses)) * 100).toFixed(2) + '%'`, with a `'0%'` fallback when there are no requests.

---

### Endpoint 7: GET /api/v1/admin/enrichment/stats -- VERIFIED

**Purpose:** Get location enrichment statistics for `practice_locations` and `provider_hospitals`
**Middleware:** `adminAuthMiddleware`

**Implementation:** Delegates to `getEnrichmentStats()` in `locationEnrichment.ts`.

---

### Endpoint 8: POST /api/v1/admin/cleanup/sync-logs -- VERIFIED

**Purpose:** Clean up sync_logs older than N days
**Middleware:** `adminAuthMiddleware`, `adminTimeout`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | query | `'false'` | Preview mode |
| `retentionDays` | query | `90` | Delete logs older than this |

**Implementation:** Directly uses Prisma to count/delete `syncLog` records where `startedAt < cutoffDate`. The 90-day default aligns with the retention policy documented in the retention stats endpoint.

---

### Endpoint 9: GET /api/v1/admin/retention/stats -- VERIFIED

**Purpose:** Comprehensive retention statistics across all log types
**Middleware:** `adminAuthMiddleware`

**Response covers 4 data categories:**

| Category | Metrics | Retention Policy |
|----------|---------|-----------------|
| verificationLogs | total, expiringIn7Days, expiringIn30Days, oldestRecord, newestRecord | 6 months (TTL via expiresAt) |
| syncLogs | total, olderThan90Days, oldestRecord, newestRecord | 90 days (manual cleanup) |
| planAcceptances | total, expiringIn7Days, expiringIn30Days | 6 months (TTL via expiresAt) |
| voteLogs | total | Follows plan acceptance TTL |

This endpoint runs **13 parallel queries** via `Promise.all()` for efficient data retrieval.

---

### Endpoint 10: POST /api/v1/admin/recalculate-confidence -- VERIFIED

**Purpose:** Recalculate confidence scores with time-based decay
**Middleware:** `adminAuthMiddleware`, `adminTimeout`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | query | `'false'` | Preview mode |
| `limit` | query | all | Max records to process |

**Implementation:**
- Validates `limit` is a positive integer
- Delegates to `recalculateAllConfidenceScores()` with batch size of 100
- Returns `{ processed, updated, unchanged, errors, durationMs, duration }`

---

### Endpoint 11: POST /api/v1/admin/rotate-encryption-key -- NEW (Not in prompt)

**Purpose:** Re-encrypt all insurance card PII fields with current primary encryption key
**Middleware:** `adminAuthMiddleware`, `adminTimeout`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | query | `'false'` | Preview mode |
| `batchSize` | query | `50` | Records per batch |

**Implementation:**
1. Counts total `userInsuranceCard` records with any encrypted field
2. In dry run: returns count and whether previous key exists
3. In live mode: iterates through cards using cursor-based pagination
4. For each card: decrypt with primary key (fallback to previous key), re-encrypt with primary key, update record
5. Tracks processed/error counts
6. Errors are caught per-record (one failure does not abort the entire rotation)

**Key rotation workflow documented in code:**
1. Set `INSURANCE_ENCRYPTION_KEY` to new key
2. Set `INSURANCE_ENCRYPTION_KEY_PREVIOUS` to old key
3. Deploy (decrypt auto-falls back to previous key)
4. Call this endpoint to re-encrypt everything
5. Remove `INSURANCE_ENCRYPTION_KEY_PREVIOUS`

---

## Request Timeout Middleware

All long-running admin operations (`cleanup-expired`, `cleanup-sessions`, `cleanup/sync-logs`, `recalculate-confidence`, `rotate-encryption-key`) use the `adminTimeout` middleware, which presumably applies a longer timeout than standard API requests.

---

## Checklist Verification

### Authentication
- [x] X-Admin-Secret header required -- `adminAuthMiddleware` on all routes
- [x] Timing-safe comparison -- `crypto.timingSafeEqual()`
- [x] Graceful 503 if not configured -- `ADMIN_NOT_CONFIGURED` response
- [ ] Audit logging for admin actions -- `logger.info()` calls exist but no persistent audit trail

### Endpoints (11 total -- 2 more than prompt's 9)
- [x] POST /admin/cleanup-expired -- verified with dryRun and batchSize
- [x] POST /admin/cleanup-sessions -- **NEW** session cleanup
- [x] GET /admin/expiration-stats -- verified
- [x] GET /admin/health -- verified with retention metrics
- [x] POST /admin/cache/clear -- verified
- [x] GET /admin/cache/stats -- verified with hitRate calculation
- [x] GET /admin/enrichment/stats -- verified
- [x] POST /admin/cleanup/sync-logs -- verified with retentionDays
- [x] GET /admin/retention/stats -- verified with 13 parallel queries
- [x] POST /admin/recalculate-confidence -- verified with dryRun and limit
- [x] POST /admin/rotate-encryption-key -- **NEW** key rotation

### Automation
- [ ] Cloud Scheduler configured -- configuration documented in prompt but not verifiable from code
- [ ] Monitoring on job failures -- not implemented
- [ ] Alerting on cleanup errors -- not implemented

### Security
- [x] No public rate limiting on admin (auth required instead) -- confirmed
- [x] Secret in environment variable -- `ADMIN_SECRET` env var
- [x] Admin timeout middleware on long operations -- `adminTimeout` applied
- [ ] IP allowlist for admin endpoints -- not implemented
- [ ] Audit log for admin actions -- logger.info() but no persistent audit table

---

## Endpoint Summary Table

| # | Method | Path | Purpose | dryRun | Timeout |
|---|--------|------|---------|--------|---------|
| 1 | POST | /admin/cleanup-expired | TTL cleanup | Yes | Yes |
| 2 | POST | /admin/cleanup-sessions | Session cleanup | Yes | Yes |
| 3 | GET | /admin/expiration-stats | Expiration stats | N/A | No |
| 4 | GET | /admin/health | Health + retention | N/A | No |
| 5 | POST | /admin/cache/clear | Clear cache | No | No |
| 6 | GET | /admin/cache/stats | Cache statistics | N/A | No |
| 7 | GET | /admin/enrichment/stats | Location enrichment | N/A | No |
| 8 | POST | /admin/cleanup/sync-logs | Sync log cleanup | Yes | Yes |
| 9 | GET | /admin/retention/stats | Retention overview | N/A | No |
| 10 | POST | /admin/recalculate-confidence | Confidence decay | Yes | Yes |
| 11 | POST | /admin/rotate-encryption-key | Key rotation | Yes | Yes |

---

## Issues

1. **No persistent audit trail:** Admin actions (cleanup, cache clear, key rotation, confidence recalculation) are logged via `logger.info()` to stdout, but there is no database-backed audit log. If logs are rotated or lost, there is no record of what admin operations were performed.

2. **No IP allowlisting:** Any client with the `ADMIN_SECRET` can access admin endpoints from any IP. In a production environment with Cloud Scheduler, restricting to known Google Cloud IP ranges would add an additional security layer.

3. **Encryption key rotation error resilience:** While per-record error handling is good, there is no way to resume a failed rotation from where it left off. If the process crashes at record 500/1000, the operator must re-run the entire rotation (records 1-500 would be re-encrypted with the same key, which is idempotent but wasteful).

4. **Prompt documentation is outdated:** The prompt lists 9 endpoints, but the actual implementation has 11. The `cleanup-sessions` and `rotate-encryption-key` endpoints are not documented in the prompt.

---

## Recommendations

1. **Create an `admin_audit_log` table** to persistently record admin operations:
   ```sql
   CREATE TABLE admin_audit_log (
     id SERIAL PRIMARY KEY,
     action VARCHAR(100) NOT NULL,
     parameters JSONB,
     result JSONB,
     source_ip VARCHAR(50),
     performed_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. **Add IP allowlisting** for admin endpoints. Accept a comma-separated `ADMIN_ALLOWED_IPS` environment variable and reject requests from unlisted IPs. Include Cloud Scheduler's IP ranges by default.

3. **Add a resumable cursor to the key rotation endpoint** so that a failed rotation can be restarted from the last successfully processed record.

4. **Configure Cloud Scheduler jobs** for the three cleanup endpoints:
   - `cleanup-expired`: Hourly (`0 * * * *`)
   - `cleanup-sessions`: Daily (`0 3 * * *`)
   - `cleanup/sync-logs`: Weekly (`0 4 * * 0`)

5. **Update the prompt documentation** to include the 2 new endpoints (`cleanup-sessions`, `rotate-encryption-key`).

6. **Add a `GET /admin/stats` dashboard endpoint** that aggregates key metrics in a single call: total providers, total plans, total verifications, cache hit rate, pending conflicts, expired records. This would serve as a one-stop admin overview.
