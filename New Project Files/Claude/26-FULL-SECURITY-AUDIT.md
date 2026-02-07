# Full Security Audit - VerifyMyProvider

**Last Updated:** February 7, 2026
**Audit Scope:** Backend API, Frontend, Database Schema, Infrastructure
**Auditor:** Automated code review via Claude
**Project Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB`

---

## Executive Summary

VerifyMyProvider is a healthcare provider directory application that stores **publicly available provider data** (NPI registry, CMS data) and collects **crowdsourced insurance verification data**. The application does NOT store Protected Health Information (PHI) and HIPAA compliance is not required.

**Overall Security Posture: GOOD**

The application demonstrates thoughtful security design across all layers. All four ZeroPath findings from January 2026 have been resolved. The codebase implements defense-in-depth with rate limiting, CAPTCHA, honeypot detection, input validation, PII stripping, and timing-safe authentication. Notable remaining items are the disabled frontend CSP header and the absence of automated security scanning in CI/CD.

### Risk Summary

| Category | Status | Severity |
|----------|--------|----------|
| Authentication | Adequate for current scope | Low risk |
| Rate Limiting | Fully implemented, 4 tiers | Low risk |
| Input Validation | Zod on all endpoints | Low risk |
| CAPTCHA/Bot Prevention | reCAPTCHA v3 + honeypot | Low risk |
| Sybil Attack Prevention | 4 layers implemented | Low risk |
| Error Handling | Production-safe, no stack leaks | Low risk |
| Logging/PII | PII-free application logs | Low risk |
| Secrets Management | Environment variables, no hardcoded secrets | Low risk |
| Frontend CSP | **DISABLED** - commented out | Medium risk |
| CSRF | Not needed (no auth cookies) | Informational |
| HIPAA | Not required (public data only) | N/A |

---

## 1. Database Schema Security

**Reference:** Prompt 01 - Database Schema
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\prisma\schema.prisma`

### 1.1 Schema Overview

The database contains 15 models across three categories:
- **Provider data** (6 models): `Provider`, `practice_locations`, `provider_cms_details`, `provider_hospitals`, `provider_insurance`, `provider_medicare`, `provider_taxonomies`
- **Insurance data** (2 models): `InsurancePlan`, `ProviderPlanAcceptance`
- **Verification/audit** (4 models): `VerificationLog`, `VoteLog`, `SyncLog`, `DataQualityAudit`
- **Reference** (1 model): `taxonomy_reference`, `hospitals`

### 1.2 Findings

**PASS - Proper Indexing for Anti-Abuse Queries:**
The schema includes dedicated composite indexes for Sybil attack detection:
```prisma
@@index([providerNpi, planId, sourceIp, createdAt], map: "idx_vl_sybil_ip")
@@index([providerNpi, planId, submittedBy, createdAt], map: "idx_vl_sybil_email")
```
These indexes ensure the 30-day duplicate check in `checkSybilAttack()` performs efficiently.

**PASS - TTL Support:**
Both `VerificationLog` and `ProviderPlanAcceptance` have `expiresAt` fields with indexes (`idx_vl_expires_at`, `idx_ppa_expires_at`), supporting the 6-month verification TTL policy.

**PASS - Unique Constraints:**
- `ProviderPlanAcceptance`: `@@unique([providerNpi, planId])` prevents duplicate acceptance records.
- `VoteLog`: `@@unique([verificationId, sourceIp])` enforces one-vote-per-IP.

**PASS - No PHI Stored:**
The database stores only publicly available NPI data and crowdsourced verification data. IP addresses are stored in `VerificationLog.sourceIp` and `VoteLog.sourceIp` for anti-abuse purposes only, not returned in API responses.

**INFORMATIONAL - No Row-Level Security (RLS):**
PostgreSQL RLS is not implemented. This is acceptable because:
1. All data access goes through the application layer (Prisma ORM).
2. There are no multi-tenant isolation requirements.
3. Admin endpoints are protected by `X-Admin-Secret` middleware.

**INFORMATIONAL - VARCHAR Length Constraints:**
All string fields have appropriate `@db.VarChar(N)` length limits:
- NPI: `VarChar(10)` - enforces exactly 10 digits
- sourceIp: `VarChar(50)` - sufficient for IPv6
- notes: unlimited (TEXT) - validated at application layer (max 1000 chars via Zod)
- evidenceUrl: `VarChar(500)` - reasonable URL length

---

## 2. HIPAA Compliance Position

**Reference:** Prompt 02 - No HIPAA Compliance

### 2.1 Assessment

**CONFIRMED - HIPAA Not Required**

The application stores only:
1. **NPI Registry data** - Publicly available from CMS/NPPES
2. **Insurance plan metadata** - Public marketplace data (plan names, issuers, types)
3. **Crowdsourced verification data** - Binary "accepts/doesn't accept" status
4. **Anti-abuse data** - IP addresses and optional email for Sybil prevention

No Protected Health Information (PHI) is stored, processed, or transmitted. The system does not know which patients see which providers. Provider names and addresses are public NPI registry data, not PHI.

### 2.2 PII Handling

While not PHI, the application does handle limited PII:
- **IP addresses**: Stored in `verification_logs.sourceIp` and `vote_logs.sourceIp`
- **Email addresses**: Optionally stored in `verification_logs.submittedBy`
- **User agents**: Stored in `verification_logs.userAgent`

**Mitigation implemented:**
- `stripVerificationPII()` function in `verificationService.ts` (line 307) removes `sourceIp`, `userAgent`, and `submittedBy` before returning verification data in API responses.
- `getRecentVerifications()` and `getVerificationsForPair()` use explicit `select` clauses that exclude PII fields.
- Application logs (pino) exclude PII - the `requestLogger.ts` explicitly does not log IP or user agent.

---

## 3. Authentication

**Reference:** Prompt 03 - Authentication
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\admin.ts`

### 3.1 Current State

The application has two authentication modes:
1. **Public endpoints** (providers, plans, locations, verify) - No authentication required
2. **Admin endpoints** - Protected by `X-Admin-Secret` header

### 3.2 Admin Authentication Analysis

```typescript
// admin.ts lines 22-56
function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    // Returns 503 - admin disabled gracefully
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

**PASS - Timing-Safe Comparison:**
Uses `crypto.timingSafeEqual()` to prevent timing-based secret extraction attacks. The length check before `timingSafeEqual` is correct (the function requires equal-length buffers).

**PASS - Graceful Degradation:**
If `ADMIN_SECRET` is not configured, admin endpoints return 503 rather than silently allowing access.

**PASS - All Admin Routes Protected:**
Every admin route (`/cleanup-expired`, `/expiration-stats`, `/health`, `/cache/clear`, `/cache/stats`, `/enrichment/stats`, `/cleanup/sync-logs`, `/retention/stats`, `/recalculate-confidence`) applies `adminAuthMiddleware` as the first middleware.

**INFORMATIONAL - No Rate Limiting on Admin Endpoints:**
Admin endpoints are not rate-limited. This is acceptable because they are protected by the secret header and designed for Cloud Scheduler calls. However, brute-force attacks against the `X-Admin-Secret` header are possible (limited only by the global 200 req/hour rate limiter).

**INFORMATIONAL - No User Authentication:**
Public write endpoints (verify, vote) have no user authentication. This is by design -- the application uses rate limiting + CAPTCHA + honeypot + Sybil detection as the anti-abuse stack rather than requiring user accounts.

---

## 4. CSRF Protection

**Reference:** Prompt 04 - CSRF

### 4.1 Assessment

**NOT NEEDED - No Authentication Cookies**

CSRF attacks require the browser to automatically attach authentication credentials (cookies) to cross-origin requests. Since VerifyMyProvider:
1. Does not use authentication cookies
2. Does not use session-based authentication
3. Uses `X-Admin-Secret` header (not auto-attached by browsers)
4. Uses JSON API with `Content-Type: application/json` (not submitted via HTML forms)

CSRF protection is not currently required.

**FUTURE CONSIDERATION:** If user accounts with cookie-based sessions are added, CSRF tokens or `SameSite` cookie attributes will be needed.

---

## 5. Audit Logging

**Reference:** Prompt 05 - Audit Logging
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\requestLogger.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\httpLogger.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\requestId.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\utils\logger.ts`

### 5.1 Logging Architecture

The application uses a three-layer logging approach:

1. **HTTP Logger** (`httpLogger.ts`) - pino-http for request/response logging
   - Logs: request ID, method, URL, status code
   - Excludes: IP addresses, user agents, request bodies
   - Skips: health check endpoint (`/health`) to reduce noise

2. **Request Logger** (`requestLogger.ts`) - Custom middleware for usage analytics
   - PII-free `RequestLogEntry` interface: requestId, timestamp, method, path, statusCode, responseTimeMs, rateLimited
   - In-memory buffer (max 1000 entries) for development statistics

3. **Structured Logger** (`logger.ts`) - pino with environment-aware formatting
   - Development: pino-pretty with colorized output
   - Production: JSON structured logging for Cloud Logging ingestion

### 5.2 Findings

**PASS - PII-Free Application Logs:**
The `RequestLogEntry` interface (requestLogger.ts line 8) explicitly lists only non-PII fields. The HTTP logger serializer (httpLogger.ts lines 34-42) only captures `id`, `method`, `url`, `statusCode`.

**PASS - Request ID Correlation:**
`requestIdMiddleware` (requestId.ts) generates a UUID for each request using `crypto.randomUUID()` and attaches it to `req.id`. This enables log correlation across middleware layers without using PII as correlation keys.

**PASS - Accepts External Request IDs:**
The middleware honors incoming `X-Request-ID` headers for distributed tracing across services while generating new UUIDs for direct requests.

**INFORMATIONAL - Database Stores Anti-Abuse PII:**
IP addresses and user agents are stored in the database (`verification_logs`, `vote_logs`) for anti-abuse purposes. This is appropriate for Sybil detection but should be covered by a privacy policy.

---

## 6. API Route Security

**Reference:** Prompt 06 - API Routes
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\*.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\index.ts`

### 6.1 Route Inventory

| Route | Method | Rate Limiter | Auth | CAPTCHA | Honeypot | Timeout |
|-------|--------|-------------|------|---------|----------|---------|
| `/health` | GET | None (before limiter) | None | No | No | None |
| `/` | GET | Default (200/hr) | None | No | No | None |
| `/api/v1/providers/search` | GET | Search (100/hr) | None | No | No | 15s |
| `/api/v1/providers/cities` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/providers/:npi` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/providers/:npi/colocated` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/plans/search` | GET | Search (100/hr) | None | No | No | 30s |
| `/api/v1/plans/grouped` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/plans/meta/issuers` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/plans/meta/types` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/plans/:planId/providers` | GET | Search (100/hr) | None | No | No | 30s |
| `/api/v1/plans/:planId` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/verify` | POST | Verification (10/hr) | None | **Yes** | **Yes** | 30s |
| `/api/v1/verify/:id/vote` | POST | Vote (10/hr) | None | **Yes** | **Yes** | 30s |
| `/api/v1/verify/stats` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/verify/recent` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/verify/:npi/:planId` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/locations/search` | GET | Search (100/hr) | None | No | No | 30s |
| `/api/v1/locations/health-systems` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/locations/stats/:state` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/locations/:id` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/locations/:id/providers` | GET | Default (200/hr) | None | No | No | 30s |
| `/api/v1/admin/*` | GET/POST | Default (200/hr) | **X-Admin-Secret** | No | No | 30-120s |

### 6.2 Findings

**PASS - All Routes Rate Limited:**
Every route has at least the default 200 req/hour rate limiter. Write endpoints (verify, vote) have strict 10 req/hour limits.

**PASS - Write Endpoints Have Multi-Layer Protection:**
`POST /verify` and `POST /verify/:id/vote` apply three layers in order:
1. Rate limiter (10/hour)
2. Honeypot check
3. CAPTCHA verification

**PASS - Request Timeouts:**
All API routes have timeouts via `requestTimeout` middleware:
- Search endpoints: 15 seconds
- General endpoints: 30 seconds
- Admin endpoints: 120 seconds

**PASS - Body Size Limits:**
```typescript
// index.ts lines 89-90
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
```
Prevents large payload attacks. 100KB is sufficient for all API operations.

**PASS - CORS Configuration:**
```typescript
// index.ts lines 23-28
const ALLOWED_ORIGINS: string[] = [
  'https://verifymyprovider.com',
  'https://www.verifymyprovider.com',
  'https://verifymyprovider-frontend-741434145252.us-central1.run.app',
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));
```
Strict origin allowlist. Localhost only allowed in development mode.

**INFORMATIONAL - Null Origin Allowed:**
```typescript
// index.ts lines 69-73
if (!origin) {
  return callback(null, true);
}
```
Requests with no origin (curl, Postman, mobile apps, server-to-server) are allowed. This is standard for APIs but worth noting -- it means CORS is not a defense against non-browser clients.

**PASS - Security Headers (Backend):**
Helmet is configured with a strict CSP for the JSON API:
```typescript
// index.ts lines 47-67
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'none'"],
    scriptSrc: ["'none'"],
    frameAncestors: ["'none'"],
    // ...
  },
},
crossOriginEmbedderPolicy: true,
crossOriginOpenerPolicy: { policy: 'same-origin' },
referrerPolicy: { policy: 'no-referrer' },
```

**PASS - Trust Proxy Configuration:**
```typescript
// index.ts line 37
app.set('trust proxy', 1);
```
Set to `1` (trust only the first proxy) for Cloud Run's load balancer. This ensures `req.ip` correctly resolves to the client IP for rate limiting rather than the proxy IP.

---

## 7. Input Validation

**Reference:** Prompt 07 - Input Validation
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\schemas\commonSchemas.ts`
- All route files in `packages/backend/src/routes/`

### 7.1 Validation Coverage

Every endpoint uses Zod schema validation on input parameters:

| Schema | Validation Rules |
|--------|-----------------|
| `paginationSchema` | `page`: int, min 1; `limit`: int, min 1, max 100 |
| `npiParamSchema` | Exactly 10 digits: `z.string().length(10).regex(/^\d+$/)` |
| `planIdParamSchema` | String, 1-50 chars |
| `stateQuerySchema` | Exactly 2 chars, uppercased |
| `submitVerificationSchema` | NPI + planId + boolean fields + notes (max 1000) + URL (max 500) + email |
| `voteSchema` | `vote`: enum `['up', 'down']` |
| `searchQuerySchema` (providers) | state (2 chars), city (1-100), specialty (1-200), name (1-200), etc. |
| `searchQuerySchema` (locations) | state (2 chars, required), city (1-100), zipCode (3-10) |
| `searchQuerySchema` (plans) | issuerName (1-200), planType (1-20), search (1-200), state (2 chars) |

### 7.2 Findings

**PASS - Comprehensive Zod Validation:**
All request inputs (query params, URL params, request bodies) are validated through Zod schemas before processing. The `ZodError` type is handled by the global error handler (errorHandler.ts lines 102-118) which returns structured validation error details.

**PASS - Max Length Limits:**
All string inputs have maximum length constraints, preventing oversized payloads from reaching the database.

**PASS - Pagination Bounded:**
`MAX_PAGE_SIZE = 100` in constants and enforced via `z.coerce.number().int().min(1).max(100)` in paginationSchema, plus `Math.min(limit, MAX_LIMIT)` in `getPaginationValues()`.

**PASS - Type Coercion:**
Numeric query parameters use `z.coerce.number()` to safely convert string query params to numbers.

**PASS - NPI Validation:**
NPI is validated as exactly 10 digits via regex, matching the standard NPI format.

---

## 8. Rate Limiting

**Reference:** Prompt 08 - Rate Limiting
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\rateLimiter.ts`

### 8.1 Architecture

**Dual-Mode Implementation:**
- **Redis mode** (distributed): When `REDIS_URL` is configured; uses sorted sets for sliding window
- **In-memory mode** (fallback): When Redis unavailable; process-local sliding window

**4-Tier Rate Limits:**

| Tier | Name | Window | Max Requests | Applied To |
|------|------|--------|-------------|------------|
| Default | `default` | 1 hour | 200 | All routes (global) |
| Search | `search` | 1 hour | 100 | Search endpoints |
| Verification | `verification` | 1 hour | 10 | POST /verify |
| Vote | `vote` | 1 hour | 10 | POST /verify/:id/vote |

### 8.2 Findings

**PASS - Sliding Window Algorithm:**
Both Redis and in-memory implementations use sliding window rather than fixed window. This prevents the boundary-burst attack where a user sends max requests at the end of one window and the start of the next.

**PASS - Standard Rate Limit Headers:**
All responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on 429 responses.

**PASS - Fail-Open Behavior Documented:**
Redis rate limiter fails open (allows requests) with a warning log when Redis is unavailable. This prioritizes availability. The fail-open behavior is clearly documented in code comments and headers (`X-RateLimit-Status: degraded`).

**PASS - Memory Cleanup:**
In-memory stores are cleaned every 60 seconds (`setInterval` at line 88), removing timestamps older than 1 hour to prevent memory leaks.

**PASS - IP-Based Keying:**
Default key generator uses `req.ip || 'unknown'`, which relies on the `trust proxy: 1` setting to get the real client IP behind Cloud Run's load balancer.

---

## 9. External APIs

**Reference:** Prompt 09 - External APIs
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\captcha.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\lib\redis.ts`

### 9.1 External API Inventory

| API | Purpose | Secret | Fail Behavior |
|-----|---------|--------|---------------|
| Google reCAPTCHA v3 | Bot detection | `RECAPTCHA_SECRET_KEY` | Fail-open with fallback rate limit |
| Redis (Upstash/GCP) | Distributed rate limiting + caching | `REDIS_URL` | Fall back to in-memory |
| PostHog | Analytics | `NEXT_PUBLIC_POSTHOG_KEY` | Frontend-only, non-critical |
| NPI Registry (NPPES) | Provider data sync | None (public API) | Offline sync scripts |
| Anthropic Claude | Insurance card OCR | `ANTHROPIC_API_KEY` | Frontend feature only |

### 9.2 Findings

**PASS - CAPTCHA API Timeout:**
Google reCAPTCHA calls have a 5-second timeout (`CAPTCHA_API_TIMEOUT_MS`) via `AbortController`:
```typescript
// captcha.ts lines 149-150
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), CAPTCHA_API_TIMEOUT_MS);
```

**PASS - Redis Connection Resilience:**
```typescript
// redis.ts lines 56-63
retryStrategy: (times) => {
  if (times > 5) {
    return null; // Stop retrying after 5 attempts
  }
  return Math.min(times * 200, 3000); // Exponential backoff, max 3s
},
```
Redis client has retry logic with exponential backoff and maximum 5 reconnection attempts.

**PASS - Redis Command Timeout:**
`commandTimeout: 5000` prevents hanging on slow Redis commands.

**PASS - Singleton Pattern:**
Redis client uses a singleton (`connectionAttempted` flag) to prevent multiple connection attempts per process.

---

## 10. Confidence Scoring Integrity

**Reference:** Prompt 12 - Confidence Scoring
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\confidenceService.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\confidenceDecayService.ts`

### 10.1 Scoring Algorithm

4-factor scoring system (0-100 total):
1. **Data Source** (0-25): CMS data scores 25, crowdsource scores 15
2. **Recency** (0-30): Tiered decay with specialty-specific thresholds
3. **Verification Count** (0-25): Research-based -- 3 verifications = expert-level accuracy
4. **Agreement** (0-20): Upvote/downvote ratio consensus

### 10.2 Manipulation Resistance

**PASS - Consensus Threshold:**
Status changes require:
- Minimum 3 verifications (`MIN_VERIFICATIONS_FOR_CONSENSUS`)
- Minimum 60% confidence score (`MIN_CONFIDENCE_FOR_STATUS_CHANGE`)
- Clear 2:1 majority ratio (`acceptedCount > notAcceptedCount * 2`)

```typescript
// verificationService.ts lines 163-185
const shouldUpdateStatus =
  verificationCount >= MIN_VERIFICATIONS_FOR_CONSENSUS &&
  confidenceScore >= MIN_CONFIDENCE_FOR_STATUS_CHANGE &&
  hasClearMajority;
```

**PASS - Capped Scores:**
Score is capped at 100: `Math.min(100, factors.dataSourceScore + ...)` (confidenceService.ts line 157).

**PASS - Forced LOW Confidence Below Threshold:**
With fewer than 3 verifications, confidence level is capped at MEDIUM regardless of score:
```typescript
// confidenceService.ts lines 425-431
if (verificationCount < MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE && verificationCount > 0) {
  if (score >= 76) return 'MEDIUM';
  // ...
}
```

**PASS - Time-Based Decay:**
The `confidenceDecayService.ts` proactively recalculates scores with time decay via the admin endpoint `POST /api/v1/admin/recalculate-confidence`, ensuring search results show accurate (decayed) scores rather than stale high-confidence values.

---

## 11. Environment & Secrets Management

**Reference:** Prompt 11 - Environment Secrets

### 11.1 Environment Variables

| Variable | Purpose | Required | Sensitive |
|----------|---------|----------|-----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | **Yes** |
| `ADMIN_SECRET` | Admin endpoint authentication | Yes (production) | **Yes** |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA v3 | Yes (production) | **Yes** |
| `REDIS_URL` | Redis connection string | No | **Yes** |
| `ANTHROPIC_API_KEY` | Claude AI for card OCR | No | **Yes** |
| `PORT` | Server port | No | No |
| `NODE_ENV` | Environment mode | No | No |
| `FRONTEND_URL` | Additional CORS origin | No | No |
| `CAPTCHA_FAIL_MODE` | open/closed | No | No |
| `LOG_LEVEL` | Logging verbosity | No | No |
| `NEXT_PUBLIC_API_URL` | Frontend API base URL | No | No |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics | No | No |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | reCAPTCHA public key | No | No |

### 11.2 Findings

**PASS - No Hardcoded Secrets:**
A thorough search of the codebase found no hardcoded API keys, passwords, or secrets in source files.

**PASS - No .env Files Committed:**
No `.env` files exist in the repository. Secrets are managed through environment variables (Cloud Run configuration / GCP Secret Manager).

**INFORMATIONAL - Docker Compose Uses Default Credentials:**
```yaml
# docker-compose.yml lines 10-12
POSTGRES_USER: postgres
POSTGRES_PASSWORD: postgres
POSTGRES_DB: healthcare_providers
```
These are default development credentials. The production `DATABASE_URL` uses GCP Cloud SQL with proper credentials.

**PASS - Graceful Degradation Without Secrets:**
- Missing `ADMIN_SECRET`: Admin endpoints return 503 (disabled)
- Missing `RECAPTCHA_SECRET_KEY`: CAPTCHA skipped with warning log
- Missing `REDIS_URL`: Falls back to in-memory rate limiting and caching

---

## 12. CAPTCHA Integration

**Reference:** Prompt 27 - CAPTCHA Integration
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\captcha.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\config\constants.ts`

### 12.1 Implementation

- **Provider:** Google reCAPTCHA v3 (score-based, invisible)
- **Minimum Score:** 0.5 (`CAPTCHA_MIN_SCORE`)
- **Applied To:** `POST /verify` and `POST /verify/:id/vote`
- **Token Source:** `req.body.captchaToken` or `x-captcha-token` header

### 12.2 Findings

**PASS - Configurable Fail Mode:**
```typescript
// captcha.ts line 52
const CAPTCHA_FAIL_MODE: FailMode = (process.env.CAPTCHA_FAIL_MODE as FailMode) || 'open';
```
Default is fail-open with fallback rate limiting (3 req/hour vs normal 10 req/hour).

**PASS - Fallback Rate Limiting:**
When CAPTCHA fails open, a stricter rate limit is applied:
```typescript
// constants.ts lines 62-67
export const CAPTCHA_FALLBACK_MAX_REQUESTS = 3;
export const CAPTCHA_FALLBACK_WINDOW_MS = MS_PER_HOUR;
```

**PASS - API Timeout:**
reCAPTCHA API calls timeout after 5 seconds (`CAPTCHA_API_TIMEOUT_MS`).

**PASS - Score Logging:**
Low scores are logged with IP, score, threshold, and action for monitoring:
```typescript
// captcha.ts lines 174-181
logger.warn({
  ip: clientIp, score: data.score, threshold: CAPTCHA_MIN_SCORE,
  action: data.action, endpoint: req.path,
}, 'CAPTCHA low score - possible bot');
```

**PASS - Development/Test Skip:**
CAPTCHA is skipped in development/test environments (captcha.ts lines 121-123), preventing test suite failures.

**PASS - Degraded Security Header:**
When CAPTCHA fails open, the response includes `X-Security-Degraded: captcha-unavailable` header for monitoring.

---

## 13. Sybil Attack Prevention

**Reference:** Prompt 36 - Sybil Attack Prevention
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\verificationService.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\honeypot.ts`

### 13.1 Defense Layers

**Layer 1 - Rate Limiting:**
10 verifications/hour per IP, 10 votes/hour per IP.

**Layer 2 - Honeypot Field:**
```typescript
// honeypot.ts lines 11-25
export function honeypotCheck(fieldName: string = 'website') {
  return (req, res, next) => {
    if (req.body?.[fieldName]) {
      // Return 200 to not alert the bot
      return res.json({ success: true, data: { id: 'submitted' } });
    }
    next();
  };
}
```
The `website` field in the verification/vote schemas is a honeypot. Bots that auto-populate hidden fields are silently "accepted" with a fake success response (HTTP 200), making them unaware they were caught.

**Layer 3 - CAPTCHA (reCAPTCHA v3):**
Score-based bot detection as documented in Section 12.

**Layer 4 - Sybil Detection (30-Day Window):**
```typescript
// verificationService.ts lines 72-115
async function checkSybilAttack(providerNpi, planId, sourceIp, submittedBy) {
  const cutoffDate = new Date(Date.now() - SYBIL_PREVENTION_WINDOW_MS); // 30 days
  // Check duplicate from same IP
  if (sourceIp) {
    const existing = await prisma.verificationLog.findFirst({
      where: { providerNpi, planId, sourceIp, createdAt: { gte: cutoffDate } },
    });
    if (existing) throw AppError.conflict('...');
  }
  // Check duplicate from same email
  if (submittedBy) {
    const existing = await prisma.verificationLog.findFirst({
      where: { providerNpi, planId, submittedBy, createdAt: { gte: cutoffDate } },
    });
    if (existing) throw AppError.conflict('...');
  }
}
```

**Layer 5 - Vote Deduplication:**
```typescript
// VoteLog unique constraint
@@unique([verificationId, sourceIp])
```
One vote per IP per verification, enforced at the database level.

### 13.2 Findings

**PASS - All 4+ Layers Implemented:**
Rate limiting, honeypot, CAPTCHA, and Sybil detection are all active and correctly ordered in the middleware chain.

**PASS - Database-Level Enforcement:**
Vote deduplication is enforced via a unique constraint, not just application logic.

**PASS - Efficient Sybil Queries:**
Dedicated composite indexes (`idx_vl_sybil_ip`, `idx_vl_sybil_email`) ensure the 30-day lookback queries perform efficiently even with large datasets.

---

## 14. Error Handling Security

**Reference:** Prompt 37 - Error Handling
**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\errorHandler.ts`

### 14.1 Findings

**PASS - No Stack Traces in Production:**
```typescript
// errorHandler.ts lines 237-240
const message = process.env.NODE_ENV === 'production'
  ? 'Internal server error'
  : err.message;
```
Internal errors return generic messages in production, with actual error messages only shown in development.

**PASS - Structured Error Responses:**
All errors return a consistent JSON structure:
```json
{
  "success": false,
  "error": {
    "message": "...",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "requestId": "uuid"
  }
}
```

**PASS - Prisma Error Handling:**
Specific Prisma error codes are mapped to appropriate HTTP status codes:
- `P2002` (unique constraint) -> 409 Conflict
- `P2025` (not found) -> 404 Not Found
- `P2003` (foreign key) -> 400 Bad Request
- `P2024` (connection pool timeout) -> 503 Service Unavailable
- `P2010` (raw query failed) -> 500 with generic message in production

**PASS - Async Error Handling:**
The `asyncHandler` wrapper (errorHandler.ts lines 62-68) catches rejected promises and forwards them to the error handler, preventing unhandled rejections.

**PASS - Zod Validation Errors:**
Zod errors are caught specifically and return structured validation details:
```typescript
// errorHandler.ts lines 102-118
details: zodError.errors.map((e) => ({
  field: e.path.join('.'),
  message: e.message,
})),
```

**PASS - 404 Handler:**
```typescript
// errorHandler.ts lines 256-266
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { message: `Route ${req.method} ${req.path} not found`, ... },
  });
}
```
Unknown routes return structured JSON rather than Express's default HTML error page.

---

## 15. Known Vulnerabilities (Historical)

**Reference:** Prompt 21 - Security Vulnerabilities

### 15.1 ZeroPath Findings (January 2026)

All four findings from the ZeroPath scan have been resolved:

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| VMP-2026-001 | Unauthenticated verification spam (no rate limiting) | Medium (CVSS 7.1) | **FIXED** |
| VMP-2026-002 | Verification threshold bypass (status change without consensus) | Critical (CVSS 9.2) | **FIXED** |
| VMP-2026-003 | PII in public API responses | Medium | **FIXED** |
| VMP-2026-004 | Legacy vulnerable endpoint (`src/api/routes.ts`) | High | **FIXED** (file removed) |

### 15.2 Verification of Fixes

**VMP-2026-001 (Rate Limiting):** Verified -- `verificationRateLimiter` (10/hr) applied to POST /verify, `voteRateLimiter` (10/hr) applied to POST /verify/:id/vote. See `verify.ts` lines 58-60, 93-95.

**VMP-2026-002 (Threshold Bypass):** Verified -- `determineAcceptanceStatus()` requires `MIN_VERIFICATIONS_FOR_CONSENSUS` (3), `MIN_CONFIDENCE_FOR_STATUS_CHANGE` (60), and a 2:1 majority ratio before changing acceptance status. See `verificationService.ts` lines 163-185.

**VMP-2026-003 (PII Exposure):** Verified -- `stripVerificationPII()` removes sourceIp, userAgent, submittedBy. Query `select` clauses in `getRecentVerifications()` and `getVerificationsForPair()` explicitly exclude PII fields.

**VMP-2026-004 (Legacy Endpoint):** Verified -- No file exists at `src/api/routes.ts`. All routes are in `packages/backend/src/routes/`.

---

## 16. Frontend Security

**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\next.config.js`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\lib\api.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\lib\rateLimit.ts`

### 16.1 Findings

**FINDING - Frontend CSP Header DISABLED (Medium Risk):**
```javascript
// next.config.js lines 14-26
// CSP disabled - was blocking API requests. Re-enable with proper config later.
// {
//   key: 'Content-Security-Policy',
//   value: [...]
// },
```
The Content-Security-Policy header is commented out in the frontend Next.js config. The comment says it "was blocking API requests." This leaves the frontend without CSP protection against XSS injection.

**Mitigating factors:**
- The backend API returns JSON only (no HTML), so XSS via API injection is not possible on the backend.
- Next.js uses React which auto-escapes JSX expressions, providing baseline XSS protection.
- Other security headers ARE active: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy`, `Permissions-Policy`.

**Recommendation:** Re-enable CSP with a properly configured policy that allows the API domain, Google reCAPTCHA, and PostHog.

**PASS - Other Security Headers Active:**
```javascript
// next.config.js lines 27-47
{ key: 'X-Content-Type-Options', value: 'nosniff' },
{ key: 'X-Frame-Options', value: 'DENY' },
{ key: 'X-XSS-Protection', value: '1; mode=block' },
{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
```

**PASS - API Error Handling:**
The frontend `api.ts` properly handles rate limit errors with user-friendly toast messages and supports automatic retry with exponential backoff for transient failures.

**PASS - Frontend Rate Limiting:**
The frontend includes its own in-memory rate limiter (`rateLimit.ts`) for Next.js API routes, providing an additional defense layer.

**PASS - Honeypot Integration:**
The `VerificationSubmission` interface includes the `website` honeypot field, and the frontend correctly passes it through to the API.

---

## 17. Infrastructure Security

### 17.1 Docker Configuration

**Files Audited:**
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\docker-compose.yml`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\docker-compose.dev.yml`

**INFORMATIONAL - Development Docker Uses Default Credentials:**
Both docker-compose files use `POSTGRES_USER: postgres` and `POSTGRES_PASSWORD: postgres`. These are acceptable for local development only.

**PASS - Production Uses Cloud SQL:**
The production `DATABASE_URL` connects to Google Cloud SQL PostgreSQL, which provides:
- Encrypted connections (SSL)
- IAM-based access control
- Automated backups
- Network isolation via VPC

### 17.2 Graceful Shutdown

```typescript
// index.ts lines 202-237
const SHUTDOWN_TIMEOUT_MS = 10000;
const shutdown = async (signal: string) => {
  const forceExitTimer = setTimeout(() => {
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Stop accepting new connections, then disconnect database
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

**PASS - Graceful Shutdown:** The application handles SIGINT and SIGTERM signals, stops accepting new connections, disconnects from the database, and has a 10-second forced exit timeout to prevent zombie processes.

---

## 18. Dependency Security

### 18.1 Backend Dependencies

| Package | Version | Purpose | Security Notes |
|---------|---------|---------|---------------|
| `express` | ^4.18.2 | HTTP framework | Mature, well-maintained |
| `helmet` | ^7.1.0 | Security headers | Up to date |
| `cors` | ^2.8.5 | CORS middleware | Standard |
| `zod` | ^3.22.4 | Input validation | Type-safe validation |
| `@prisma/client` | ^5.22.0 | ORM | Parameterized queries (SQL injection safe) |
| `ioredis` | ^5.9.2 | Redis client | Production-grade |
| `pino` | ^10.3.0 | Structured logging | No PII exposure |
| `dotenv` | ^16.3.1 | Environment loading | Standard |

### 18.2 Frontend Dependencies

| Package | Version | Purpose | Security Notes |
|---------|---------|---------|---------------|
| `next` | ^14.2.35 | React framework | Auto-escapes XSS |
| `react` | ^18.3.1 | UI library | Standard |
| `zod` | ^3.25.76 | Client-side validation | Type-safe |
| `@anthropic-ai/sdk` | ^0.71.2 | Insurance card OCR | API key required |
| `posthog-js` | ^1.321.2 | Analytics | Public key only |

### 18.3 Findings

**PASS - No Known Vulnerable Patterns:**
- Prisma ORM uses parameterized queries, preventing SQL injection.
- No use of `eval()`, `Function()`, or other code execution patterns.
- No use of `dangerouslySetInnerHTML` patterns detected in the search query handling.

**INFORMATIONAL - Node.js Version:**
`"engines": { "node": ">=20.0.0" }` -- requires Node.js 20+, which is LTS and actively maintained.

**RECOMMENDATION:** Run `npm audit` periodically and integrate it into CI/CD pipeline.

---

## 19. Cross-Cutting Security Concerns

### 19.1 SQL Injection

**PASS - Prisma ORM Protection:**
All database queries use Prisma's query builder which automatically parameterizes values. There is one raw query in the health check:
```typescript
// index.ts line 122
await prisma.$queryRaw`SELECT 1`;
```
This is a static query with no user input -- safe.

### 19.2 NoSQL Injection

**N/A:** PostgreSQL is used. No NoSQL databases.

### 19.3 Denial of Service

**PASS - Multiple DoS Mitigations:**
1. Rate limiting on all endpoints (4 tiers)
2. Request body size limit (100KB)
3. Request timeouts (15s search, 30s general, 120s admin)
4. Pagination limits (max 100 results per page)
5. Database connection pool (Prisma manages this)
6. Redis command timeout (5s)

### 19.4 Information Disclosure

**PASS - Minimal Error Information:**
- Production errors return generic "Internal server error" messages
- No stack traces exposed
- PII stripped from API responses
- Request IDs included for support correlation

**INFORMATIONAL - API Info Endpoint:**
The root endpoint (`GET /`) returns a list of all available API endpoints. This is useful for developers but provides API discovery information to attackers. This is low risk since the API is public by design.

### 19.5 Cache Security

**PASS - Cache Invalidation on Write:**
```typescript
// verify.ts lines 73-76
invalidateSearchCache().catch((err) => {
  logger.warn({ err }, 'Failed to invalidate search cache after verification');
});
```
Search cache is invalidated when new verifications are submitted, preventing stale data from being served.

**PASS - Cache Key Normalization:**
`generateSearchCacheKey()` normalizes all string values to lowercase and trimmed, preventing cache poisoning via case variations.

---

## 20. Audit Checklist Summary

### Critical Priority Items

| # | Area | Status | Notes |
|---|------|--------|-------|
| 01 | Database Schema | PASS | Proper indexes, constraints, no PHI |
| 02 | HIPAA Position | PASS | Public data only, correctly documented |
| 08 | Rate Limiting | PASS | 4 tiers, dual-mode, sliding window |
| 11 | Environment Secrets | PASS | No hardcoded secrets, graceful degradation |

### High Priority Items

| # | Area | Status | Notes |
|---|------|--------|-------|
| 03 | Authentication | PASS | Timing-safe admin auth, appropriate for scope |
| 06 | API Routes | PASS | All rate-limited, CORS configured, body limits |
| 07 | Input Validation | PASS | Zod on all endpoints |
| 12 | Confidence Scoring | PASS | Manipulation-resistant, consensus requirements |
| 27 | CAPTCHA | PASS | reCAPTCHA v3, fail-open with fallback |
| 36 | Sybil Prevention | PASS | 4 layers, database-enforced dedup |

### Medium Priority Items

| # | Area | Status | Notes |
|---|------|--------|-------|
| 04 | CSRF | N/A | Not needed (no auth cookies) |
| 05 | Audit Logging | PASS | PII-free logs, request ID correlation |
| 09 | External APIs | PASS | Timeouts, retry logic, graceful fallback |
| 21 | Known Vulnerabilities | PASS | All 4 ZeroPath findings resolved |
| 37 | Error Handling | PASS | No stack traces, structured responses |

---

## 21. New Findings (This Audit)

### Finding 1: Frontend CSP Disabled

**Severity:** Medium
**Location:** `packages/frontend/next.config.js` lines 14-26
**Description:** Content-Security-Policy header is commented out with the note "was blocking API requests."
**Impact:** Without CSP, the frontend is more vulnerable to XSS attacks if a code injection vulnerability is found.
**Recommendation:** Re-enable CSP with proper directives that allow the API domain, Google reCAPTCHA domains (`www.google.com`, `www.gstatic.com`), and PostHog (`us.i.posthog.com`). Test thoroughly before deploying.

### Finding 2: No Automated Security Scanning in CI/CD

**Severity:** Low
**Description:** No evidence of automated SAST/DAST tools, `npm audit`, or dependency scanning in CI/CD pipeline.
**Recommendation:** Add `npm audit --audit-level=high` to CI pipeline. Consider integrating a SAST tool (e.g., Semgrep, CodeQL) for automated code scanning on pull requests.

### Finding 3: Admin Endpoints Not Rate-Limited Independently

**Severity:** Low
**Location:** `packages/backend/src/routes/admin.ts`
**Description:** Admin endpoints rely only on the global default rate limiter (200/hr) and the X-Admin-Secret for protection. There is no separate rate limiter for failed authentication attempts.
**Impact:** An attacker could make 200 brute-force attempts per hour against the admin secret.
**Recommendation:** Add a stricter rate limiter (e.g., 5 failed attempts per 15 minutes) specifically for admin authentication failures. Alternatively, add IP-based lockout after consecutive failures.

### Finding 4: Redis Connection String Exposure Risk

**Severity:** Informational
**Description:** If `REDIS_URL` contains authentication credentials (password), it could appear in error logs from the Redis client initialization.
**Mitigation:** The current code logs `'Initializing Redis connection'` without the URL. Error handlers log the error object which may include connection details. Consider redacting connection strings from error logs.

---

## 22. Recommendations Summary

### Immediate Actions (Priority 1)

1. **Re-enable Frontend CSP** - Configure Content-Security-Policy with proper directives for API, reCAPTCHA, and PostHog domains.

### Short-Term Actions (Priority 2)

2. **Add `npm audit` to CI/CD** - Catch vulnerable dependencies before deployment.
3. **Add admin-specific rate limiting** - Limit failed authentication attempts per IP.

### Long-Term Actions (Priority 3)

4. **Consider SAST/DAST integration** - Automated security scanning on pull requests.
5. **Implement automated penetration testing** - Periodic testing for new vulnerabilities.
6. **User authentication** - When user accounts are added, implement CSRF protection and session management.
7. **Security monitoring/alerting** - Set up alerts for high volumes of:
   - Rate-limited requests
   - Failed CAPTCHA verifications
   - Honeypot triggers
   - Admin authentication failures

---

## 23. Questions for the Team

1. When was the last full security review beyond the ZeroPath scan?
2. Have there been any security incidents or near-misses since the ZeroPath findings were resolved?
3. Should an external penetration tester be engaged before public launch?
4. Are there any compliance requirements beyond what's documented (e.g., state-specific data privacy laws)?
5. Should automated security scanning (SAST/DAST) be added to the CI/CD pipeline?
6. What is the plan for re-enabling the frontend Content-Security-Policy?
7. Is there a process for monitoring and responding to `npm audit` alerts?

---

## Appendix A: File Index

All security-relevant files audited in this review:

**Middleware:**
- `packages/backend/src/middleware/rateLimiter.ts` - Rate limiting (dual-mode)
- `packages/backend/src/middleware/captcha.ts` - reCAPTCHA v3 verification
- `packages/backend/src/middleware/honeypot.ts` - Bot detection
- `packages/backend/src/middleware/errorHandler.ts` - Error handling + async wrapper
- `packages/backend/src/middleware/requestLogger.ts` - PII-free request logging
- `packages/backend/src/middleware/httpLogger.ts` - HTTP request logging (pino-http)
- `packages/backend/src/middleware/requestId.ts` - Request ID generation
- `packages/backend/src/middleware/requestTimeout.ts` - Request timeout enforcement

**Routes:**
- `packages/backend/src/routes/admin.ts` - Admin endpoints with auth
- `packages/backend/src/routes/verify.ts` - Verification + voting endpoints
- `packages/backend/src/routes/providers.ts` - Provider search/lookup
- `packages/backend/src/routes/plans.ts` - Plan search/lookup
- `packages/backend/src/routes/locations.ts` - Location search/lookup

**Services:**
- `packages/backend/src/services/verificationService.ts` - Verification logic + Sybil detection
- `packages/backend/src/services/confidenceService.ts` - 4-factor confidence scoring
- `packages/backend/src/services/confidenceDecayService.ts` - Proactive score decay
- `packages/backend/src/services/providerService.ts` - Provider queries
- `packages/backend/src/services/utils.ts` - Pagination utilities

**Configuration:**
- `packages/backend/src/config/constants.ts` - Security constants
- `packages/backend/src/schemas/commonSchemas.ts` - Shared Zod schemas
- `packages/backend/src/lib/redis.ts` - Redis client singleton
- `packages/backend/src/lib/prisma.ts` - Prisma client singleton
- `packages/backend/src/utils/logger.ts` - Pino logger configuration
- `packages/backend/src/utils/cache.ts` - Cache utility (dual-mode)
- `packages/backend/src/index.ts` - Express app setup + CORS + Helmet

**Frontend:**
- `packages/frontend/next.config.js` - Security headers
- `packages/frontend/src/lib/api.ts` - API client with retry logic
- `packages/frontend/src/lib/rateLimit.ts` - Frontend rate limiting

**Schema:**
- `prisma/schema.prisma` - Database schema

**Infrastructure:**
- `docker-compose.yml` - Production Docker setup
- `docker-compose.dev.yml` - Development Docker setup
- `package.json` - Root workspace configuration
