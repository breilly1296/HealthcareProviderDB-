# Audit Logging Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/05-audit-logging.md
**Status:** Well implemented -- Structured logging, PII separation, and database audit trail are all in place

---

## Findings

### 1. What to Log (Simpler Than OwnMyHealth)

- **Verification submissions (NPI, plan, accepted, IP):**
  Verified. `verificationService.ts` creates a `VerificationLog` record for every submission containing `providerNpi`, `planId`, `newValue` (with acceptanceStatus), `sourceIp`, `userAgent`, `submittedBy`, plus timestamps and TTL. The database schema (`schema.prisma` lines 198-233) stores all these fields.

- **Vote submissions (verification ID, vote, IP):**
  Verified. `voteOnVerification()` creates `VoteLog` records with `verificationId`, `sourceIp`, and `vote` direction. The `VoteLog` model has a unique constraint on `(verificationId, sourceIp)` for deduplication.

- **Rate limit hits (IP, endpoint, timestamp):**
  Verified. The `requestLogger.ts` middleware logs rate limit info for every request: `rateLimited` boolean, plus `rateLimitInfo.limit` and `rateLimitInfo.remaining` when rate limit headers are present. The rate limiter itself returns 429 responses that are captured in the structured logs.

- **API errors (endpoint, error type, not full stack):**
  Verified. The `httpLogger.ts` middleware (pino-http) logs errors at `error` level with `customErrorMessage` that includes method, URL, and error message. The serializers strip down request/response objects to only `id`, `method`, `url`, and `statusCode` -- no full stack traces in production output.

- **Authentication events (when auth is added):**
  Not applicable yet. Admin auth events are logged: `adminAuthMiddleware` logs a warning when `ADMIN_SECRET` is not configured, and failed auth attempts throw `AppError.unauthorized` which gets caught by the error handler and logged.

### 2. What NOT to Log

- **User passwords (never):**
  Verified. No password fields exist in the schema. No password handling code exists.

- **Full stack traces in production:**
  Verified. The `httpLogger.ts` serializers reduce request/response objects to minimal fields. The `errorHandler.ts` middleware (referenced in `index.ts`) handles error formatting. The pino logger in production outputs structured JSON without verbose stack traces.

- **Database query results (can be large):**
  Verified. No route handler or service function logs raw database query results. Logging statements log metadata (counts, IDs, dry run flags) but not full result sets.

- **CSRF tokens:**
  Not applicable. No CSRF implementation exists.

- **Session IDs:**
  Not applicable. No sessions exist.

### 3. Current Logging Implementation (Verified)

- **Structured JSON logging via `requestLogger.ts` middleware:**
  Verified. The `RequestLogEntry` interface defines a clean structure: `requestId`, `timestamp`, `method`, `path`, `statusCode`, `responseTimeMs`, `rateLimited`, and optional `rateLimitInfo`. Logged via pino as structured JSON.

- **Cloud Run compatible (structured for Cloud Logging):**
  Verified. The `logger.ts` pino configuration outputs structured JSON in production with ISO timestamps. In development, it uses `pino-pretty` for colored console output. Cloud Logging natively parses pino JSON format.

- **Request ID generation and correlation (X-Request-ID header):**
  Verified. `requestId.ts` middleware generates a `crypto.randomUUID()` for each request, attaches it to `req.id`, and sets the `X-Request-ID` response header. If an incoming request already has `X-Request-ID`, it reuses that value (enabling distributed tracing across services). Both `requestLogger.ts` and `httpLogger.ts` include the request ID in every log entry.

- **Response time tracking:**
  Verified. `requestLogger.ts` calculates `responseTimeMs` as `Date.now() - startTime` by monkey-patching `res.end`.

- **Rate limit info extraction and logging:**
  Verified. `requestLogger.ts` extracts `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers from the response (set by the rate limiter middleware) and includes them in the log entry. The `rateLimited` flag is derived from `res.statusCode === 429`.

- **PII exclusion in application logs (no IP addresses, user agents in request logs):**
  Verified. The `RequestLogEntry` interface in `requestLogger.ts` explicitly does NOT include `req.ip`, `req.get('User-Agent')`, or any identifying information. The `httpLogger.ts` serializer for `req` only includes `id`, `method`, and `url` -- no IP, no headers, no user agent.

- **In-memory buffer for statistics (last 1000 logs):**
  Verified. `requestLogger.ts` maintains a `logBuffer` array with `MAX_BUFFER_SIZE = 1000` (note: the prompt says "last 20 logs" but the buffer is 1000; `getRequestStats()` returns the last 20 via `logBuffer.slice(-20)`). The buffer rotates via `shift()` when full.

- **Production JSON format, development colored console:**
  Verified. `logger.ts` uses `pino-pretty` in development and raw JSON in production.

### 4. Privacy-Preserving Design (Critical Distinction)

The prompt correctly identifies a crucial architectural distinction:

**Application Logs (`requestLogger.ts`, `httpLogger.ts`) -- NO PII:**
- Verified. Zero IP addresses, zero user agents, zero email addresses in structured log output.
- The `httpLogger.ts` serializer explicitly strips request objects down to `{ id, method, url }`.
- The `requestLogger.ts` `RequestLogEntry` interface has no PII fields.

**Database Audit Tables -- PII Stored for Anti-Abuse:**

- **`VerificationLog.sourceIp`:**
  Verified. Stored as `VarChar(50)` in the schema. Populated from `req.ip` in the verify route handler (`verify.ts` line 63: `sourceIp: req.ip`). Used by `checkSybilAttack()` for 30-day duplicate detection per provider-plan pair.

- **`VerificationLog.userAgent`:**
  Verified. Stored as `VarChar(500)` in the schema. Populated from `req.get('User-Agent')` in the verify route handler (line 64). Used for abuse analysis.

- **`VerificationLog.submittedBy`:**
  Verified. Stored as `VarChar(200)`. Optional email field for users who want to be identified. Used by `checkSybilAttack()` for email-based duplicate detection.

- **`VoteLog.sourceIp`:**
  Verified. Stored as `VarChar(50)`, required (not nullable). Used as part of the unique constraint `(verificationId, sourceIp)` for vote deduplication.

**API Responses -- PII Stripped:**

- **`stripVerificationPII()` function:**
  Verified in `verificationService.ts` (lines 304-307). Destructures out `sourceIp`, `userAgent`, and `submittedBy` from verification objects before returning them in API responses. Applied in both `submitVerification()` (line 391) and `voteOnVerification()` (line 530).

- **Query-level PII exclusion:**
  Verified. `getRecentVerifications()` (lines 607-645) and `getVerificationsForPair()` (lines 692-714) use Prisma `select` clauses that explicitly exclude `sourceIp`, `userAgent`, and `submittedBy`. Comments in the code confirm this is intentional: `// Exclude: sourceIp, userAgent, submittedBy`.

- **Sybil prevention indexes:**
  Verified. The schema includes composite indexes specifically for Sybil detection queries:
  - `idx_vl_sybil_ip`: `(providerNpi, planId, sourceIp, createdAt)`
  - `idx_vl_sybil_email`: `(providerNpi, planId, submittedBy, createdAt)`

### 5. Log Retention

- **Verification logs:** 6-month TTL via `expiresAt` field. Cleanup via `cleanupExpiredVerifications()` called through admin endpoint `POST /admin/cleanup-expired`.
- **Sync logs:** 90-day retention with manual cleanup via `POST /admin/cleanup/sync-logs`.
- **Plan acceptances:** 6-month TTL via `expiresAt` field, cleaned up alongside verification logs.
- **Vote logs:** Follow plan acceptance TTL (cascade delete in schema: `onDelete: Cascade`).
- **Application logs (stdout):** Not retained by the application itself; retention depends on Cloud Logging configuration.
- **In-memory request buffer:** 1000 entries, process-local, lost on restart.

- **Retention stats endpoint:**
  Verified. `GET /admin/retention/stats` provides comprehensive retention statistics for all log types, including expiring-in-7-days and expiring-in-30-days counts.

### 6. Logging Infrastructure

- **Pino logger:** Structured JSON logging library. Configured in `packages/backend/src/utils/logger.ts`.
- **Pino-http:** HTTP request/response logging middleware. Configured in `packages/backend/src/middleware/httpLogger.ts`.
- **Request ID middleware:** UUID-based request correlation. `packages/backend/src/middleware/requestId.ts`.
- **Custom request logger:** Application-level request stats. `packages/backend/src/middleware/requestLogger.ts`.

The logging stack is layered:
1. `requestIdMiddleware` -- assigns/propagates request ID (first in chain)
2. `httpLogger` (pino-http) -- logs HTTP request/response lifecycle
3. `requestLogger` -- captures application-level stats (after rate limiter, so it can capture rate limit info)

### 7. CAPTCHA Logging

The CAPTCHA middleware (`captcha.ts`) has its own logging that deserves mention:
- Logs warnings for failed CAPTCHA verifications (includes IP -- note this is in application logs, not the structured request logs)
- Logs errors for Google API failures with fail mode context
- Logs warnings for low-score detections (possible bots)
- Logs fallback rate limit events in fail-open mode

**PII concern:** The CAPTCHA middleware logs `ip: clientIp` in its warning/error messages. This is a minor inconsistency with the PII-free application log principle established in `requestLogger.ts`. The CAPTCHA logs include IP addresses for security investigation purposes, which is reasonable but should be documented as an intentional exception.

---

## Summary

The audit logging implementation is thorough and well-architected. The three-layer separation is clean and intentional:

1. **Application logs (stdout via pino):** PII-free structured JSON, suitable for Cloud Logging ingestion, development debugging, and performance monitoring. Includes request IDs for correlation, response times, rate limit info, and status codes.

2. **Database audit tables (VerificationLog, VoteLog):** Store PII (IP, user agent, email) strictly for anti-abuse purposes -- Sybil attack detection, vote deduplication, and abuse investigation. This data has defined retention periods (6 months for verifications, 90 days for sync logs).

3. **API responses:** PII is stripped before returning to clients via both `stripVerificationPII()` helper and Prisma `select` clauses that exclude sensitive fields.

HIPAA compliance is not required since no PHI (Protected Health Information) is stored. Provider data (NPI, name, specialty) is public registry information, not PHI.

---

## Recommendations

1. **Document the CAPTCHA IP logging exception:** The CAPTCHA middleware logs IP addresses in its warning/error messages, which is an intentional exception to the PII-free application log principle. Add a comment or documentation noting this design decision.

2. **Consider IP hashing for database storage:** For enhanced privacy, consider storing a SHA-256 hash of the IP address instead of the raw IP in `VerificationLog.sourceIp` and `VoteLog.sourceIp`. Hashed IPs still work for deduplication (same IP produces same hash) but cannot be reversed to identify users. Trade-off: makes abuse investigation harder since you cannot look up the raw IP.

3. **Add structured logging to admin operations:** Admin route handlers log actions (e.g., "Admin cleanup started"), but consider adding more structured context -- for instance, log which admin action was requested and the outcome in a consistent format for monitoring dashboards.

4. **Automate expired record cleanup:** The cleanup endpoints (`POST /admin/cleanup-expired`, `POST /admin/cleanup/sync-logs`) are designed for Cloud Scheduler. Ensure these scheduled jobs are configured in the Cloud Run deployment. If not yet set up, this should be a deployment task.

5. **Monitor in-memory buffer in production:** The `logBuffer` in `requestLogger.ts` holds up to 1000 entries in process memory. On a high-traffic instance, this is fine, but monitor memory usage. The buffer is not persisted across restarts, which is acceptable for debugging stats.

6. **Consider log levels for CAPTCHA events:** The CAPTCHA middleware uses `logger.warn` for failed verifications and `logger.error` for API failures. These levels are appropriate, but in high-traffic scenarios, failed CAPTCHA attempts (bots) could generate significant warn-level noise. Consider using `info` level for expected bot rejections and reserving `warn` for unexpected failures.
