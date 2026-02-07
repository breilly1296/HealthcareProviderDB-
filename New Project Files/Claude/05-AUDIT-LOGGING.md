# VerifyMyProvider Audit Logging

**Last Updated:** 2026-02-07
**HIPAA Required:** NO (no PHI stored or processed)
**Purpose:** Debugging, spam/abuse detection, operational monitoring

---

## What to Log

### Currently Logged

| Event Category | What Is Logged | Where | Source File |
|---|---|---|---|
| **HTTP Requests** | Method, URL, status code, response time, request ID | stdout (Cloud Logging) | `requestLogger.ts`, `httpLogger.ts` |
| **Rate Limit Hits** | Limit value, remaining count, 429 status | stdout via requestLogger | `requestLogger.ts` lines 50-69 |
| **Verification Submissions** | NPI, plan ID, acceptance status, previous value, new value, timestamps | `verification_logs` table | `verificationService.ts` lines 375-399 |
| **Vote Submissions** | Verification ID, vote direction, source IP | `vote_logs` table | `verificationService.ts` lines 496-514 |
| **Anti-Abuse Data** | Source IP, user agent, submitter email (database only) | `verification_logs` table | `verificationService.ts` lines 393-395 |
| **Sybil Attack Detection** | Duplicate verification attempts by IP or email | AppError.conflict thrown | `verificationService.ts` lines 72-115 |
| **Honeypot Triggers** | IP, field name, request path | stdout (pino warn) | `honeypot.ts` lines 15-19 |
| **CAPTCHA Events** | Failures, low scores, API errors, fail-open/closed decisions | stdout (pino warn/error) | `captcha.ts` lines 163-236 |
| **Admin Actions** | Cleanup operations, cache clears, confidence recalculations | stdout (pino info) | `admin.ts` lines 77-84, 197-201, 477 |
| **CORS Violations** | Blocked origin | stdout (pino warn) | `index.ts` line 79 |
| **Sync Operations** | Sync type, state, records processed, status, errors | `sync_logs` table | Prisma schema `SyncLog` model |
| **Data Quality Issues** | NPI, audit type, severity, field, current/expected values | `data_quality_audit` table | Prisma schema `DataQualityAudit` model |
| **API Errors** | Request ID, error object, path, method | stdout (pino error) | `errorHandler.ts` lines 80-85 |
| **Database Errors** | Prisma error codes (P2002, P2024, P2025, P2003, P2010) | stdout (pino error) | `errorHandler.ts` lines 134-214 |
| **Server Lifecycle** | Startup, shutdown signals, database disconnection | stdout (pino info) | `index.ts` lines 190-226 |
| **Request Timeouts** | Request ID, path, method, timeout duration | stdout (pino warn) | `requestTimeout.ts` lines 16-21 |
| **Rate Limiter Mode** | Redis vs in-memory selection per limiter | stdout (pino info) | `rateLimiter.ts` lines 304-312 |
| **Cache Activity** | Cache hits, misses, invalidation failures | stdout (pino debug/warn) | `providers.ts` lines 240-251 |

### Recommended Future Logging

| Event | Priority | Reason |
|---|---|---|
| Authentication events | High | When user auth is added, track login/logout/failures |
| Admin endpoint access attempts (failed auth) | High | Already partially covered by `AppError.unauthorized` in `adminAuthMiddleware` |
| Expired record cleanup results | Medium | Already logged in admin routes, consider adding scheduled job logging |
| Confidence score decay recalculations | Low | Admin-triggered, already logged |

---

## What NOT to Log

### Explicitly Excluded from Application Logs

| Data Type | Reason | Enforcement |
|---|---|---|
| **IP Addresses** | PII - excluded from request/application logs | `requestLogger.ts` interface `RequestLogEntry` has no IP field |
| **User Agents** | PII - excluded from request logs | `requestLogger.ts` does not capture user agent |
| **Full Stack Traces (production)** | Security - could expose internals | `errorHandler.ts` line 238: production returns generic "Internal server error" |
| **Database Query Results** | Can be large, could contain sensitive data | Not included in any log statements |
| **CSRF Tokens** | Security token, should never appear in logs | Not applicable (API uses CORS, not CSRF tokens) |
| **Session IDs** | Not applicable (stateless API) | No session middleware in use |
| **Passwords** | Never log credentials | No user auth system yet; admin secret checked via timing-safe comparison only |
| **CAPTCHA Tokens** | Security tokens | Not logged; only verification result is logged |
| **Admin Secret Values** | Critical credential | `admin.ts` uses `timingSafeEqual` comparison; secret value never logged |

### Important: Application Logs vs Database Storage Distinction

The project maintains a deliberate separation between what appears in application logs (stdout/Cloud Logging) and what is stored in database audit tables:

```
Application Logs (requestLogger.ts, httpLogger.ts):
  - NO IP addresses
  - NO user agents
  - NO identifying information
  - Only: method, path, status, response time, request ID, rate limit info

Database Audit Tables (verification_logs, vote_logs):
  - YES: sourceIp (for Sybil attack prevention, 30-day duplicate check)
  - YES: userAgent (for abuse analysis)
  - YES: submittedBy (email for duplicate detection)
  - These are NEVER returned in API responses (stripped by stripVerificationPII())
```

This is intentional: IPs are needed for anti-abuse logic but are not exposed in logs or API responses.

---

## Current Implementation

### 1. Structured Logging Infrastructure

**Logger:** Pino (`packages/backend/src/utils/logger.ts`)

```typescript
// Production: structured JSON with ISO timestamps for Cloud Logging
// Development: pino-pretty with colorized, human-readable output
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Production formatters output JSON to stdout
  // Development uses pino-pretty transport
});
```

**Log Level:** Configurable via `LOG_LEVEL` environment variable (default: `info`).

**Environments:**
- **Production:** JSON format to stdout, picked up by Google Cloud Logging
- **Development:** Colorized console output via `pino-pretty`

### 2. Request ID Correlation (`packages/backend/src/middleware/requestId.ts`)

Every request gets a unique UUID for end-to-end log correlation:

```typescript
// Uses incoming X-Request-ID header if present (cross-service tracing)
// Otherwise generates a new UUID via crypto.randomUUID()
const requestId = (req.headers['x-request-id'] as string) || randomUUID();
req.id = requestId;
res.setHeader('X-Request-ID', requestId);
```

The request ID appears in:
- All pino log entries (via `httpLogger.ts` using `genReqId: (req) => req.id`)
- Error responses (returned as `requestId` field in error JSON)
- The `requestLogger.ts` structured log entries

### 3. Dual HTTP Logging Layer

**Layer 1: pino-http (`httpLogger.ts`)** -- Automatic request/response logging:
- Uses `req.id` for correlation
- Custom log levels: 500+ = error, 400+ = warn, else info
- Custom serializers exclude PII (only logs `id`, `method`, `url`, `statusCode`)
- Skips `/health` endpoint to reduce noise

**Layer 2: requestLogger (`requestLogger.ts`)** -- Application-level metrics:
- Captures response time via `res.end` override
- Extracts rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)
- Maintains in-memory buffer (max 1000 entries) for stats endpoint
- Exposes `getRequestStats()` for aggregated monitoring data:
  - Total requests, rate-limited count, average response time
  - Status code distribution, endpoint frequency
  - Last 20 log entries

### 4. Database Audit Trail

#### VerificationLog Model (`verification_logs` table)

Primary audit record for all verification submissions. Schema from `packages/backend/prisma/schema.prisma`:

```prisma
model VerificationLog {
  id                 String             @id @default(cuid())
  providerNpi        String?            @map("provider_npi")
  planId             String?            @map("plan_id")
  acceptanceId       String?
  verificationType   VerificationType   // PLAN_ACCEPTANCE, PROVIDER_INFO, etc.
  verificationSource VerificationSource // CROWDSOURCE, CMS_DATA, etc.
  previousValue      Json?              // Snapshot of state before change
  newValue           Json?              // New verification data
  sourceIp           String?            // Anti-abuse (NOT in logs or API responses)
  userAgent          String?            // Abuse analysis (NOT in logs or API responses)
  submittedBy        String?            // Email for dedup (NOT in API responses)
  upvotes            Int                @default(0)
  downvotes          Int                @default(0)
  isApproved         Boolean?
  reviewedAt         DateTime?
  reviewedBy         String?
  notes              String?
  evidenceUrl        String?
  createdAt          DateTime           @default(now())
  expiresAt          DateTime?          // 6-month TTL
}
```

**Key design decisions:**
- `previousValue` / `newValue` as JSON fields capture the full state transition
- `cuid()` primary keys prevent enumeration attacks
- Sybil prevention indexes: `idx_vl_sybil_ip` (NPI + plan + IP + date), `idx_vl_sybil_email` (NPI + plan + email + date)
- 6-month TTL based on 12% annual provider turnover research

#### VoteLog Model (`vote_logs` table)

Tracks individual votes on verifications:

```prisma
model VoteLog {
  id               String           @id @default(cuid())
  verificationId   String
  sourceIp         String           // Required for vote deduplication
  vote             String           // 'up' or 'down'
  createdAt        DateTime         @default(now())

  @@unique([verificationId, sourceIp]) // One vote per IP per verification
}
```

**Anti-abuse:** The `@@unique([verificationId, sourceIp])` constraint at the database level prevents duplicate votes. Vote direction changes are allowed (up-to-down or vice versa) via transactional updates in `voteOnVerification()`.

#### SyncLog Model (`sync_logs` table)

Tracks data synchronization operations:

```prisma
model SyncLog {
  id                Int       @id @default(autoincrement())
  syncType          String?   // e.g., 'nppes', 'cms'
  state             String?
  recordsProcessed  Int?      @default(0)
  status            String?
  errorMessage      String?
  startedAt         DateTime? @default(now())
  completedAt       DateTime?
}
```

#### DataQualityAudit Model (`data_quality_audit` table)

Tracks data quality issues discovered during processing:

```prisma
model DataQualityAudit {
  id             Int       @id @default(autoincrement())
  npi            String
  auditType      String    // Type of quality issue
  severity       String    // Issue severity level
  field          String?   // Which data field has the issue
  currentValue   String?
  expectedValue  String?
  details        String?
  resolved       Boolean   @default(false)
  resolvedAt     DateTime?
  createdAt      DateTime  @default(now())
}
```

### 5. PII Stripping in API Responses

The `stripVerificationPII()` function in `verificationService.ts` removes sensitive fields before returning data:

```typescript
function stripVerificationPII<T extends Record<string, unknown>>(
  verification: T
): Omit<T, 'sourceIp' | 'userAgent' | 'submittedBy'> {
  const { sourceIp, userAgent, submittedBy, ...safe } = verification;
  return safe;
}
```

This is applied to:
- `submitVerification()` return value (line 412)
- `voteOnVerification()` return value (line 551)
- `getRecentVerifications()` uses Prisma `select` to exclude these fields entirely (lines 632-648)
- `getVerificationsForPair()` also uses Prisma `select` exclusion (lines 716-734)

### 6. Error Logging Architecture

The global error handler (`errorHandler.ts`) provides structured error logging:

```typescript
logger.error({
  requestId: req.id,
  err,
  path: req.path,
  method: req.method,
}, 'Request error');
```

**Error categorization:**
- `AppError` (operational): Logged and returned with appropriate status code + error code
- `ZodError` (validation): Returned as 400 with field-level details
- `PrismaClientKnownRequestError`: Mapped to appropriate HTTP status (409, 404, 400, 503, 500)
- `PrismaClientInitializationError`: Logged as CRITICAL, returned as 503
- `PayloadTooLargeError`: Returned as 413
- Unknown errors: 500 in production (generic message), detailed in development

**Production safety:** Full error messages are suppressed in production responses (line 238: `process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message`).

### 7. Security Event Logging

| Security Event | Log Level | Logger Location |
|---|---|---|
| Honeypot triggered (bot detection) | `warn` | `honeypot.ts` line 15 |
| CAPTCHA verification failed | `warn` | `captcha.ts` line 163 |
| CAPTCHA low score (possible bot) | `warn` | `captcha.ts` line 174 |
| CAPTCHA Google API error | `error` | `captcha.ts` line 191 |
| CAPTCHA fail-open with fallback limiting | `warn` | `captcha.ts` line 231 |
| CAPTCHA fail-closed blocking | `warn` | `captcha.ts` line 201 |
| CAPTCHA fallback rate limit exceeded | `warn` | `captcha.ts` line 222 |
| CORS blocked origin | `warn` | `index.ts` line 79 |
| Admin secret not configured | `warn` | `admin.ts` line 27 |
| Admin unauthorized access | via AppError | `admin.ts` line 52 |
| Rate limiter Redis unavailable | `warn` | `rateLimiter.ts` line 209 |
| Rate limiter Redis error | `error` | `rateLimiter.ts` line 275 |
| Request timeout | `warn` | `requestTimeout.ts` line 16 |
| Database connection pool timeout | `error` | `errorHandler.ts` line 177 |
| Database connection failure | `error` | `errorHandler.ts` line 219 |
| Forced shutdown timeout | `error` | `index.ts` line 210 |

### 8. Middleware Execution Order

The middleware chain in `index.ts` establishes the logging pipeline:

```
1. requestIdMiddleware    -- Assigns UUID (or uses incoming X-Request-ID)
2. httpLogger (pino-http) -- Logs HTTP request/response with request ID
3. helmet                 -- Security headers (no logging)
4. cors                   -- Logs CORS violations
5. express.json           -- Body parsing
6. defaultRateLimiter     -- Sets X-RateLimit-* headers
7. requestLogger          -- Captures response metrics, rate limit info
8. generalTimeout         -- Logs timeouts
9. API routes             -- Route-specific logging
10. notFoundHandler       -- Logs 404s
11. errorHandler          -- Catches and logs all unhandled errors
```

---

## Retention Policy

### Database Records

| Table | Retention | Mechanism | Cleanup Endpoint |
|---|---|---|---|
| `verification_logs` | **6 months** | TTL via `expiresAt` column | `POST /api/v1/admin/cleanup-expired` |
| `vote_logs` | **Follows parent** | Cascade delete from `verification_logs` | Automatic via `onDelete: Cascade` |
| `provider_plan_acceptance` | **6 months** | TTL via `expiresAt` column | `POST /api/v1/admin/cleanup-expired` |
| `sync_logs` | **90 days** | Manual cleanup | `POST /api/v1/admin/cleanup/sync-logs` |
| `data_quality_audit` | **Indefinite** | No TTL or cleanup mechanism | None (manual) |

**TTL Constants** (from `packages/backend/src/config/constants.ts`):
- `VERIFICATION_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000` (approximately 180 days)
- `SYBIL_PREVENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000` (30 days)

**Cleanup operations** are protected by admin authentication (`X-Admin-Secret` header with timing-safe comparison) and support dry-run mode. They are designed to be called by Google Cloud Scheduler.

### Application Logs (stdout)

| Destination | Retention | Notes |
|---|---|---|
| Cloud Logging (production) | Per GCP project settings | Configurable in Google Cloud Console |
| In-memory buffer | Rolling 1000 entries | `requestLogger.ts` MAX_BUFFER_SIZE, not persistent |
| Console (development) | Session only | Lost on restart |

### Retention Monitoring

The admin API provides comprehensive retention statistics:

- `GET /api/v1/admin/retention/stats` -- Shows totals, expiring-soon counts, oldest/newest records for all log types
- `GET /api/v1/admin/expiration-stats` -- Focused on verification expiration metrics
- `GET /api/v1/admin/health` -- Includes retention metrics alongside cache and uptime data

---

## Architecture Diagram

```
                            Incoming Request
                                  |
                                  v
                        +-------------------+
                        | requestId (UUID)  |  <-- Assigns req.id
                        +-------------------+
                                  |
                                  v
                        +-------------------+
                        | httpLogger        |  --> stdout (pino JSON)
                        | (pino-http)       |      method, url, statusCode, req.id
                        +-------------------+
                                  |
                                  v
                        +-------------------+
                        | rateLimiter       |  --> Sets X-RateLimit-* headers
                        | (Redis/memory)    |      Logs Redis errors to stdout
                        +-------------------+
                                  |
                                  v
                        +-------------------+
                        | requestLogger     |  --> stdout (pino JSON)
                        |                   |      path, status, responseTime,
                        |                   |      rateLimitInfo, requestId
                        |                   |  --> In-memory buffer (stats)
                        +-------------------+
                                  |
                                  v
                        +-------------------+
                        | Route Handlers    |
                        | + honeypotCheck   |  --> stdout: bot detection events
                        | + verifyCaptcha   |  --> stdout: CAPTCHA events
                        | + route logic     |  --> PostgreSQL: verification_logs,
                        |                   |      vote_logs, sync_logs,
                        |                   |      data_quality_audit
                        +-------------------+
                                  |
                                  v
                        +-------------------+
                        | errorHandler      |  --> stdout: structured error logs
                        |                   |      (requestId, path, method, err)
                        +-------------------+
                                  |
                                  v
                              Response
                         (X-Request-ID header)
```

---

## Answers to Key Questions

### 1. Is any logging currently implemented?

**Yes, extensively.** The project has a mature, multi-layered logging system:

- **Application-level structured logging** via Pino with Cloud Run/Cloud Logging compatibility
- **HTTP request/response logging** via pino-http with custom serializers
- **Request metrics tracking** via custom `requestLogger` middleware with in-memory aggregation
- **Database audit trail** via `verification_logs`, `vote_logs`, `sync_logs`, and `data_quality_audit` tables
- **Security event logging** for honeypot triggers, CAPTCHA events, CORS violations, and rate limiter degradation
- **Request ID correlation** across all log entries via UUID-based `X-Request-ID`

### 2. Should we implement audit logging now or later?

**Already implemented.** The current system covers the primary use cases. The main gap is authentication event logging, which should be added when user authentication is implemented.

### 3. What events are most important to track?

For this application (no PHI, crowdsourced data), the priority order is:

1. **Verification submissions** (already tracked in DB) -- core business event
2. **Vote submissions** (already tracked in DB) -- data quality signal
3. **Rate limit / abuse events** (already tracked in logs) -- spam prevention
4. **API errors** (already tracked in logs) -- debugging
5. **Authentication events** (future) -- when auth is added

### 4. How long should logs be retained?

**Not 7 years like HIPAA.** Current policy is appropriate:
- Verifications: 6 months (based on 12% annual provider turnover research)
- Sync logs: 90 days (operational data)
- Application logs: Per Cloud Logging project settings (typically 30 days)
- Data quality audits: Indefinite until resolved (consider adding TTL)

### 5. Should verifications be logged for spam detection?

**Yes, and they already are.** The system implements multiple anti-spam layers:
- Sybil attack detection (30-day window per IP and email per provider-plan pair)
- Honeypot fields on verification and vote forms
- reCAPTCHA v3 with score-based filtering
- Rate limiting (10 verifications/hour, 10 votes/hour per IP)
- Vote deduplication via unique constraint on `(verificationId, sourceIp)`
- Consensus requirements (3+ verifications, 60+ confidence, 2:1 majority ratio)

---

## Next Steps

### Short-Term (When Auth Is Added)

- [ ] Log authentication events (login, logout, failed attempts) with request ID correlation
- [ ] Log admin endpoint access (success and failure) beyond the current `AppError.unauthorized`
- [ ] Add user ID to structured log context for authenticated requests

### Medium-Term (Operational Improvements)

- [ ] Add TTL/cleanup for `data_quality_audit` table (currently indefinite retention)
- [ ] Set up Cloud Logging alerts for high-volume security events (honeypot triggers, CAPTCHA failures, CORS violations)
- [ ] Create a Cloud Scheduler job for automated daily cleanup of expired records (endpoints exist, scheduling not yet configured)
- [ ] Consider log-based metrics for monitoring verification submission rates and vote patterns

### Long-Term (If Scale Demands)

- [ ] Evaluate moving from in-memory request stats buffer to Redis for multi-instance visibility
- [ ] Consider structured audit log export (e.g., BigQuery) for longer-term trend analysis
- [ ] Add request sampling for high-traffic endpoints to reduce log volume while maintaining visibility
- [ ] Implement log-based anomaly detection for abuse pattern identification

---

## File Reference

| File | Path | Purpose |
|---|---|---|
| Logger utility | `packages/backend/src/utils/logger.ts` | Pino logger instance (JSON/pretty) |
| Request logger | `packages/backend/src/middleware/requestLogger.ts` | Structured request metrics, in-memory buffer |
| HTTP logger | `packages/backend/src/middleware/httpLogger.ts` | pino-http automatic request/response logging |
| Request ID | `packages/backend/src/middleware/requestId.ts` | UUID generation and X-Request-ID correlation |
| Error handler | `packages/backend/src/middleware/errorHandler.ts` | Global error logging and response formatting |
| Rate limiter | `packages/backend/src/middleware/rateLimiter.ts` | Dual-mode (Redis/memory) rate limiting with logging |
| CAPTCHA | `packages/backend/src/middleware/captcha.ts` | reCAPTCHA v3 with fail-open/closed logging |
| Honeypot | `packages/backend/src/middleware/honeypot.ts` | Bot detection with warning logs |
| Request timeout | `packages/backend/src/middleware/requestTimeout.ts` | Timeout logging |
| Verification service | `packages/backend/src/services/verificationService.ts` | Audit trail logic, PII stripping, Sybil detection |
| Verify routes | `packages/backend/src/routes/verify.ts` | Verification/vote endpoints with cache invalidation logging |
| Admin routes | `packages/backend/src/routes/admin.ts` | Cleanup, retention stats, admin action logging |
| App entrypoint | `packages/backend/src/index.ts` | Middleware chain, CORS logging, lifecycle logging |
| Prisma schema | `packages/backend/prisma/schema.prisma` | VerificationLog, VoteLog, SyncLog, DataQualityAudit models |
| Constants | `packages/backend/src/config/constants.ts` | TTL values, Sybil window, consensus thresholds |
