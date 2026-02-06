# VerifyMyProvider Audit Logging

**Last Updated:** 2026-02-06
**HIPAA Required:** NO
**Purpose:** Debugging, spam detection, and operational monitoring
**Implementation Status:** Fully implemented (structured logging + database audit trail)

---

## What Is Logged

### 1. Verification Submissions (NPI, plan, accepted, IP)

- [x] **Verified.** `verificationService.ts` lines 375-398: Every verification creates a `VerificationLog` record containing `providerNpi`, `planId`, `sourceIp`, `userAgent`, `submittedBy`, `verificationType`, `verificationSource`, `previousValue`, `newValue` (acceptance status), `notes`, `evidenceUrl`.
- [x] IP address stored in `VerificationLog.sourceIp` (`schema.prisma` line 217) for Sybil prevention.
- [x] User agent stored in `VerificationLog.userAgent` (`schema.prisma` line 218) for abuse analysis.

### 2. Vote Submissions (verification ID, vote, IP)

- [x] **Verified.** `verificationService.ts` lines 496-514: Every vote creates a `VoteLog` record with `verificationId`, `sourceIp`, `vote` (up/down), `createdAt`.
- [x] IP stored in `VoteLog.sourceIp` for deduplication via unique constraint `[verificationId, sourceIp]`.

### 3. Rate Limit Hits (IP, endpoint, timestamp)

- [x] **Verified.** `requestLogger.ts` lines 50-68: The `RequestLogEntry` tracks `rateLimited: boolean` and `rateLimitInfo` (limit, remaining) on every request. Rate-limited requests (429 status) are clearly flagged.
- [x] `rateLimiter.ts` lines 163-170 (in-memory) and 262-269 (Redis): Rate-limited requests return 429 with `Retry-After` header.

### 4. API Errors (endpoint, error type)

- [x] **Verified.** `errorHandler.ts` lines 80-85: Global error handler logs `requestId`, `err`, `path`, `method` via pino logger for every error.
- [x] `httpLogger.ts` lines 17-19: Status codes >= 500 logged at `error` level, >= 400 at `warn` level.
- [x] Production error responses hide internal details (`errorHandler.ts` line 162-163): `process.env.NODE_ENV === 'production'` returns generic "Internal server error" instead of stack traces.

### 5. Authentication Events

- [x] **Partially verified.** Admin auth failures are logged: `adminAuthMiddleware` logs `ADMIN_SECRET not configured` warning (`admin.ts` line 26). Auth failures throw `AppError.unauthorized` which is caught by the error handler and logged.
- [ ] No user authentication events to log (no user auth exists).

---

## What Is NOT Logged

### 1. User Passwords

- [x] **Verified.** No passwords exist in the system. No user accounts, no password fields in schema.

### 2. Full Stack Traces in Production

- [x] **Verified.** `errorHandler.ts` line 162-163: Production error messages are genericized. The `err` object is logged to pino (for Cloud Logging), but the API response to the client contains only "Internal server error" in production.

### 3. Database Query Results

- [x] **Verified.** Prisma client logging is configured in `prisma.ts` lines 10-12: development logs `['query', 'error', 'warn']`, production logs only `['error']`. Query results are not logged.

### 4. CSRF Tokens

- [x] **N/A.** No CSRF tokens exist in the system.

### 5. Session IDs

- [x] **N/A.** No sessions exist in the system.

---

## Current Logging Implementation (Detailed)

### Layer 1: Request ID Correlation

**File:** `packages/backend/src/middleware/requestId.ts`

- Generates UUID per request via `crypto.randomUUID()` (line 22)
- Uses existing `X-Request-ID` header if present (for cross-service tracing)
- Attaches to `req.id` and sets `X-Request-ID` response header
- Position in middleware chain: **first** (before all other middleware)

### Layer 2: HTTP Request/Response Logging

**File:** `packages/backend/src/middleware/httpLogger.ts`

- Uses `pino-http` for structured JSON logging
- Correlates via `req.id` from requestId middleware (line 14)
- Log levels: error (500+), warn (400+), info (success)
- **Excludes `/health` endpoint** from logging (line 46) to reduce noise
- **Serializers strip PII** (lines 33-42): Only logs `req.id`, `req.method`, `req.url` and `res.statusCode`. No IP, no user agent, no headers.

### Layer 3: Application Request Logger

**File:** `packages/backend/src/middleware/requestLogger.ts`

- Tracks per-request metrics: requestId, timestamp, method, path, statusCode, responseTimeMs, rateLimited
- **Explicitly excludes PII** (lines 7-19): `RequestLogEntry` interface has no IP, user agent, or identifying fields
- In-memory buffer of last 1000 entries (line 27, `MAX_BUFFER_SIZE`)
- `getRequestStats()` function (lines 101-135) provides aggregated stats: total requests, rate-limited count, average response time, status code distribution, endpoint counts, last 20 logs
- Logs to stdout via pino (picked up by Cloud Logging in production)

### Layer 4: Database Audit Trail

**Files:** `schema.prisma` (VerificationLog, VoteLog, SyncLog, DataQualityAudit)

| Table | Purpose | Retention | PII Fields |
|-------|---------|-----------|------------|
| `verification_logs` | Verification audit trail | 6 months (TTL via `expiresAt`) | `sourceIp`, `userAgent`, `submittedBy` |
| `vote_logs` | Vote audit trail | Follows verification TTL (cascade delete) | `sourceIp` |
| `sync_logs` | Data import tracking | 90 days (manual cleanup via admin endpoint) | None |
| `data_quality_audit` | Data quality issues | No TTL (persistent) | None |

### Layer 5: Error Logging

**File:** `packages/backend/src/middleware/errorHandler.ts`

- Global error handler (line 73-174) logs all errors with `requestId`, error details, path, method
- Handles: AppError (custom), ZodError (validation), PayloadTooLargeError, PrismaClientKnownRequestError (P2002 duplicate, P2025 not found)
- CAPTCHA failures logged with IP and score (`captcha.ts` lines 163-169, 174-181)
- Honeypot triggers logged with IP (`honeypot.ts` lines 15-19)
- Admin operations logged (`admin.ts` lines 75, 82, 196, 199, etc.)

---

## Privacy-Preserving Design (Verified)

**Critical distinction between application logs and database storage:**

| Layer | Contains IP? | Contains User Agent? | Reason |
|-------|---|---|---|
| Application logs (`requestLogger.ts`) | **No** | **No** | Privacy by design |
| HTTP logs (`httpLogger.ts`) | **No** | **No** | Custom serializers strip these |
| Database (`VerificationLog`, `VoteLog`) | **Yes** | **Yes** (VerificationLog only) | Anti-abuse (Sybil prevention) |
| API responses | **No** | **No** | `stripVerificationPII()` in `verificationService.ts` lines 307-310 |

**Exceptions where IP IS logged:**
- CAPTCHA failures: `captcha.ts` lines 164, 176, 192, 202, 220, 231 -- IP logged in warn/error messages for security monitoring
- Honeypot triggers: `honeypot.ts` line 16 -- IP logged to identify bot sources
- CORS violations: `index.ts` line 78 -- origin logged (not IP) for monitoring

---

## Retention Policy

| Data Type | Retention | Mechanism | Admin Endpoint |
|-----------|-----------|-----------|----------------|
| Verification logs | 6 months | `expiresAt` TTL field + cleanup job | `POST /admin/cleanup-expired` |
| Vote logs | Follows verification | Cascade delete when verification deleted | (automatic) |
| Plan acceptances | 6 months | `expiresAt` TTL field + cleanup job | `POST /admin/cleanup-expired` |
| Sync logs | 90 days | Manual cleanup | `POST /admin/cleanup/sync-logs` |
| Data quality audits | Permanent | No TTL | None |
| Application logs (stdout) | Cloud Logging default | GCP retention settings | N/A |

**Cleanup implementation:**
- `verificationService.ts` `cleanupExpiredVerifications()` (lines 767-854): Batch deletion with `dryRun` support
- `admin.ts` sync-log cleanup (lines 273-335): Configurable `retentionDays` with `dryRun` support
- Both designed for Cloud Scheduler (cron job) invocation

---

## Questions Answered

### 1. Is any logging currently implemented?

**Yes, comprehensively.** Five layers of logging are in place:
1. Request ID correlation (`requestId.ts`)
2. HTTP request/response logging via pino-http (`httpLogger.ts`)
3. Application-level request tracking (`requestLogger.ts`)
4. Database audit trail (VerificationLog, VoteLog, SyncLog, DataQualityAudit)
5. Error logging with request context (`errorHandler.ts`)

### 2. Should we implement audit logging now or later?

**Already implemented.** The database audit trail (VerificationLog with full change tracking including `previousValue` and `newValue`) plus structured application logging is in place.

### 3. What events are most important to track?

**Currently tracked (verified):**
- Verification submissions (full audit trail in VerificationLog)
- Vote submissions (VoteLog)
- Rate limit violations (requestLogger + rateLimiter)
- CAPTCHA failures (captcha.ts warning logs)
- Bot detections (honeypot.ts warning logs)
- API errors (errorHandler.ts)
- Admin operations (admin.ts info logs)
- Data sync operations (SyncLog)

**Not tracked but potentially useful:**
- Admin endpoint access patterns (currently only logged on error)
- Cache hit/miss rates over time (in-memory only via `getCacheStats()`)
- Search query patterns (logged but not aggregated beyond in-memory buffer)

### 4. How long should logs be retained?

**Current retention policy (verified in code):**
- Verification/vote logs: 6 months (`VERIFICATION_TTL_MS = 6 * 30 * MS_PER_DAY` in `constants.ts` line 19)
- Sync logs: 90 days (configurable via admin endpoint, `admin.ts` line 278)
- Application logs: determined by Cloud Logging retention settings (not in application code)
- Data quality audits: permanent (no TTL, no cleanup endpoint)

### 5. Should verifications be logged for spam detection?

**Already implemented.** The Sybil prevention system uses VerificationLog records to detect:
- Same IP submitting for same provider-plan within 30 days (`verificationService.ts` lines 81-96)
- Same email submitting for same provider-plan within 30 days (`verificationService.ts` lines 99-114)
- Dedicated indexes: `idx_vl_sybil_ip` and `idx_vl_sybil_email` for fast lookups

---

## Next Steps

1. **Monitoring:**
   - [ ] Set up Cloud Logging alerts for high volumes of CAPTCHA failures
   - [ ] Set up alerts for high rates of 429 (rate limited) responses
   - [ ] Set up alerts for honeypot trigger frequency

2. **Aggregation:**
   - [ ] Consider persisting request stats (currently in-memory buffer, lost on restart)
   - [ ] Add daily/weekly aggregation of verification patterns

3. **Security:**
   - [ ] Add admin access audit trail (log which admin endpoints are called, when)
   - [ ] Consider IP-based anomaly detection for verification submissions
