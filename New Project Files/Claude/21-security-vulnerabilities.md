# VerifyMyProvider Security Vulnerabilities

**Last Updated:** February 7, 2026
**Last Audit:** January 2026 by ZeroPath (automated scan) + manual code review
**Codebase Version:** 1.0.0

---

## Critical Summary

| Severity | Open | In Progress | Fixed |
|----------|------|-------------|-------|
| Critical | 0    | 0           | 1     |
| High     | 1    | 0           | 1     |
| Medium   | 2    | 0           | 2     |
| Low      | 3    | 0           | 0     |
| Info     | 2    | 0           | 0     |

**Overall Posture:** The application has addressed all findings from the January 2026 ZeroPath scan. Several new vulnerabilities have been identified through manual code review of the current codebase. No critical or high-severity issues remain unmitigated -- the open items are defense-in-depth concerns and configuration hardening opportunities.

---

## Open Vulnerabilities

### [VMP-2026-005] Frontend CSP Header Disabled

**Severity:** High
**Status:** Open
**Found:** February 2026 by manual code review

**Description:**
The Content Security Policy (CSP) header is completely disabled on the Next.js frontend. The comment in the configuration states it "was blocking API requests" and should be "re-enabled with proper config later." Without CSP, the frontend is significantly more vulnerable to Cross-Site Scripting (XSS) attacks.

**Location:**
- File: `packages/frontend/next.config.js`
- Lines: 14-26

**Vulnerability:**
```javascript
// CSP disabled - was blocking API requests. Re-enable with proper config later.
// {
//   key: 'Content-Security-Policy',
//   value: [
//     "default-src 'self'",
//     "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com",
//     ...
//   ].join('; ')
// },
```

**Exploit Scenario:**
1. Attacker finds or injects a stored XSS vector (e.g., via a provider name or note field rendered on the frontend).
2. Without CSP, the browser has no policy to block the execution of injected scripts.
3. Attacker could exfiltrate session data, insurance card images, or redirect users to phishing sites.
4. Since the app handles insurance card photos (PHI-adjacent data), this is particularly concerning.

**Impact:**
- XSS attacks have no browser-level mitigation on the frontend.
- Insurance card extraction feature processes sensitive health data client-side.
- PostHog analytics key could be exfiltrated.

**Fix Plan:**

*Short-term (Tier 1):*
- [ ] Re-enable CSP with a properly configured policy that allows API connections.
- [ ] Add `connect-src` directive for the backend API URL and Google reCAPTCHA domains.
- [ ] Test with CSP in report-only mode first (`Content-Security-Policy-Report-Only`).

*Long-term (Tier 2):*
- [ ] Remove `'unsafe-inline'` and `'unsafe-eval'` from `script-src` by using nonce-based CSP.
- [ ] Set up CSP violation reporting endpoint to monitor blocked requests.

**Timeline:** Before public beta launch

---

### [VMP-2026-006] CORS Allows Requests With No Origin

**Severity:** Medium
**Status:** Open (accepted risk with mitigation)
**Found:** February 2026 by manual code review

**Description:**
The CORS configuration allows requests with no `Origin` header. While this is common practice to support mobile apps, curl, and Postman, it means any non-browser client can bypass CORS restrictions entirely. Combined with the unauthenticated API, this allows programmatic access to all endpoints without restriction.

**Location:**
- File: `packages/backend/src/index.ts`
- Lines: 69-72

**Vulnerability:**
```typescript
origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    // ...
```

**Exploit Scenario:**
1. Attacker writes a script that calls the API directly without an `Origin` header.
2. CORS check is bypassed entirely since `!origin` evaluates to `true`.
3. Combined with rate limiting being IP-based, attackers with multiple IPs (botnets) can make unlimited requests.

**Impact:**
- CORS provides no protection against non-browser clients.
- Verification spam is mitigated by rate limiting and CAPTCHA, but search/read endpoints have weaker protection.

**Mitigation in Place:**
- Rate limiting (200 req/hour default, 10 req/hour for verification).
- CAPTCHA on verification/vote endpoints.
- Honeypot field for bot detection.

**Fix Plan:**

*Short-term:*
- [ ] Document this as an accepted risk since the API is designed for public access.
- [ ] Ensure rate limiting is sufficient to prevent abuse.

*Long-term:*
- [ ] Add API key authentication for higher-rate-limit access.
- [ ] Add request signing for the frontend-to-backend communication path.

---

### [VMP-2026-007] Rate Limiter Fail-Open Behavior

**Severity:** Medium
**Status:** Open (by design, with monitoring)
**Found:** February 2026 by manual code review

**Description:**
Both the Redis-based rate limiter and the CAPTCHA middleware are configured to "fail open" -- when Redis is unavailable or Google's reCAPTCHA API is down, requests are allowed through. While this prioritizes availability, it creates windows where rate limiting and CAPTCHA protections are completely bypassed.

**Location:**
- File: `packages/backend/src/middleware/rateLimiter.ts` (lines 207-213, 273-278)
- File: `packages/backend/src/middleware/captcha.ts` (lines 199-238)

**Vulnerability (Rate Limiter):**
```typescript
// If Redis is not connected, fail open (allow request with warning)
if (!redis || !isRedisConnected()) {
  logger.warn({ limiter: name }, 'Rate limiter Redis unavailable, allowing request (fail-open)');
  res.setHeader('X-RateLimit-Status', 'degraded');
  next();
  return;
}
```

**Vulnerability (CAPTCHA):**
```typescript
if (CAPTCHA_FAIL_MODE === 'closed') {
  // FAIL-CLOSED: Block all requests when Google API unavailable
  // ...
}
// FAIL-OPEN: Allow request but apply stricter fallback rate limiting
const fallbackResult = checkFallbackRateLimit(clientIp);
```

**Exploit Scenario:**
1. Attacker identifies that the application uses Redis for rate limiting.
2. If Redis becomes unavailable (maintenance, network issue, or targeted attack), the rate limiter silently stops enforcing limits.
3. Similarly, during a Google reCAPTCHA outage, CAPTCHA verification is bypassed with only fallback rate limiting (3 req/hour).
4. Attacker could time a verification spam attack during these windows.

**Impact:**
- Temporary bypass of rate limiting during Redis outages.
- Temporary bypass of CAPTCHA during Google API outages.
- Database poisoning with spam verifications is possible during these windows.

**Mitigation in Place:**
- CAPTCHA fallback rate limiting is stricter (3 req/hour vs 10 req/hour).
- Warning logs are emitted for monitoring.
- `X-RateLimit-Status: degraded` header set for observability.
- In-memory rate limiter is used when Redis is not configured (single instance).

**Fix Plan:**

*Short-term:*
- [ ] Set up alerting on "fail-open" log messages.
- [ ] Consider switching `CAPTCHA_FAIL_MODE` to `closed` for production.
- [ ] Add monitoring dashboard for rate limiter health.

*Long-term:*
- [ ] Implement an in-memory fallback rate limiter when Redis goes down mid-operation (currently only used when Redis is never configured).
- [ ] Add circuit breaker pattern for Redis connection.

---

### [VMP-2026-008] Admin Secret in HTTP Header Without HTTPS Enforcement

**Severity:** Low
**Status:** Open
**Found:** February 2026 by manual code review

**Description:**
The admin endpoints are protected by a shared secret passed in the `X-Admin-Secret` HTTP header. While the comparison uses `timingSafeEqual` (which is good), the application does not enforce HTTPS at the application level. If a request is made over plain HTTP, the admin secret would be transmitted in cleartext.

**Location:**
- File: `packages/backend/src/routes/admin.ts`
- Lines: 22-56

**Vulnerability:**
```typescript
function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;
  // ...
  const providedSecret = req.headers['x-admin-secret'];
  // Uses timingSafeEqual (good), but secret travels over the wire
```

**Impact:**
- If accessed over HTTP, the admin secret could be intercepted via MITM.
- Cloud Run enforces HTTPS by default, so this is mitigated in production.
- Development environments using HTTP are at risk.

**Mitigation in Place:**
- Cloud Run enforces HTTPS at the load balancer level.
- `timingSafeEqual` prevents timing attacks.
- Helmet middleware sets `upgradeInsecureRequests`.

**Fix Plan:**
- [ ] Add middleware to reject admin requests over plain HTTP (`req.protocol !== 'https'`).
- [ ] Consider rotating admin secrets on a regular schedule.
- [ ] Add IP allowlisting for admin endpoints (e.g., only allow Cloud Scheduler IPs).

---

### [VMP-2026-009] Health Endpoint Exposes Internal Metrics

**Severity:** Low
**Status:** Open
**Found:** February 2026 by manual code review

**Description:**
The `/health` endpoint is placed before the rate limiter and exposes internal system metrics including heap memory usage, database response time, cache hit rates, and application uptime. This information could aid attackers in profiling the application.

**Location:**
- File: `packages/backend/src/index.ts`
- Lines: 93-136

**Vulnerability:**
```typescript
// Health check endpoint - BEFORE rate limiter so monitoring tools aren't blocked
app.get('/health', async (req: Request, res: Response) => {
  // Exposes: heapUsed, heapTotal, database response time, cache stats, uptime
```

**Impact:**
- Attackers can fingerprint the application (Node.js version, memory patterns).
- Cache hit rates reveal usage patterns.
- Database response time could indicate load or vulnerability to timing attacks.
- Being before the rate limiter means it can be polled unlimited.

**Fix Plan:**
- [ ] Split into a simple `/health` (returns just `ok`/`degraded`) and a detailed `/health/detail` behind admin auth.
- [ ] Rate limit the health endpoint or add basic auth for detailed metrics.

---

### [VMP-2026-010] Insurance Card API Route Logs Stack Traces to Console

**Severity:** Low
**Status:** Open
**Found:** February 2026 by manual code review

**Description:**
The insurance card extraction API route (`/api/insurance-card/extract`) uses `console.error` with full stack traces and `console.log` with image processing details. In production, these could end up in centralized logging systems and potentially include sensitive context about insurance card processing.

**Location:**
- File: `packages/frontend/src/app/api/insurance-card/extract/route.ts`
- Lines: 346-354, 500-505

**Vulnerability:**
```typescript
console.log('[InsuranceCardExtract] Image preprocessed:', {
  compressionRatio: preprocessResult.compressionRatio.toFixed(2),
  originalSize: `${(preprocessResult.originalSize / 1024).toFixed(1)}KB`,
  // ...
});

console.error('[InsuranceCardExtract] Unexpected error:', {
  name: error instanceof Error ? error.name : 'Unknown',
  message: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined, // Full stack trace in production
});
```

**Impact:**
- Stack traces in production logs could reveal internal file paths and code structure.
- While no PHI is logged directly, the context (insurance card processing) raises the risk.

**Fix Plan:**
- [ ] Replace `console.log`/`console.error` with structured logging (pino) that respects log levels.
- [ ] Remove stack trace logging in production.
- [ ] Ensure no image data or extracted insurance information is ever logged.

---

### [VMP-2026-011] No Authentication on Public API Endpoints

**Severity:** Info
**Status:** Open (by design)
**Found:** February 2026 by manual code review

**Description:**
All public-facing API endpoints (provider search, plan search, verification submission, voting) are completely unauthenticated. There is no user account system, no API keys, and no session management. While this is by design for the MVP/beta phase, it means all abuse prevention relies solely on IP-based rate limiting, CAPTCHA, and honeypot fields.

**Location:**
- All routes in `packages/backend/src/routes/`

**Impact:**
- Any user can submit verifications and votes without identity.
- IP-based Sybil prevention can be bypassed with VPN/proxy rotation.
- No audit trail tied to user identity.
- Verification quality relies on consensus mechanisms rather than trusted identity.

**Mitigation in Place:**
- IP-based rate limiting (10 verifications/hour, 10 votes/hour).
- IP + email-based Sybil prevention (30-day window).
- CAPTCHA (reCAPTCHA v3) on verification and vote endpoints.
- Honeypot fields for bot detection.
- Consensus threshold (3 verifications + 2:1 majority + 60% confidence score) before status changes.

**Accepted Risk:** This is a known design decision for the beta phase. User accounts are planned for future tiers.

---

### [VMP-2026-012] In-Memory Rate Limiting Not Effective for Multi-Instance Deployments

**Severity:** Info
**Status:** Open (documented, Redis available)
**Found:** February 2026 by manual code review

**Description:**
When Redis is not configured, rate limiting falls back to in-memory stores that are process-local. In a horizontally scaled deployment (multiple Cloud Run instances), each instance maintains independent counters, effectively multiplying the rate limit by the number of instances.

**Location:**
- File: `packages/backend/src/middleware/rateLimiter.ts`
- Lines: 85-179

**Impact:**
- If running 3 instances without Redis, an attacker gets 3x the rate limit (30 verifications/hour instead of 10).
- Similarly affects the frontend's insurance card extraction rate limiter (`packages/frontend/src/lib/rateLimit.ts`).

**Mitigation in Place:**
- Redis is configured for production deployments.
- In-memory mode is documented as single-instance only.
- Cloud Run typically auto-scales, so this is a relevant concern.

**Fix Plan:**
- [ ] Ensure Redis (Cloud Memorystore) is always configured in production.
- [ ] Add startup warning if running in production without Redis.

---

## In Progress

No vulnerabilities are currently being actively remediated.

---

## Fixed Vulnerabilities

### [VMP-2026-001] Unauthenticated Verification Spam

**Fixed:** January 2026
**Severity:** Medium (CVSS 7.1)
**Found:** ZeroPath automated scan

**Description:** No rate limiting on verification endpoints allowed unlimited spam submissions. An attacker could flood the system with fake verifications, poisoning confidence scores and destroying the crowdsourced data integrity.

**Fix:** Added multi-layer protection:
1. IP-based rate limiting via sliding window algorithm (10/hour for verify, 10/hour for vote, 100/hour for search, 200/hour default).
2. Dual-mode rate limiting: Redis for distributed deployments, in-memory fallback for single-instance.
3. Google reCAPTCHA v3 integration with score-based filtering (minimum score: 0.5).
4. Honeypot field (`website`) for basic bot detection.
5. Sybil prevention: 30-day deduplication window per IP and email.

**Files changed:**
- Added: `packages/backend/src/middleware/rateLimiter.ts`
- Added: `packages/backend/src/middleware/captcha.ts`
- Added: `packages/backend/src/middleware/honeypot.ts`
- Modified: `packages/backend/src/routes/verify.ts`
- Added: `packages/backend/src/config/constants.ts`

**Verification:** Rate limiting is enforced via middleware on all verification and vote routes. Zod validation schemas include optional `captchaToken` and `website` (honeypot) fields. Tests confirm rate limit rejection at threshold.

---

### [VMP-2026-002] Verification Threshold Bypass

**Fixed:** January 2026
**Severity:** Critical (CVSS 9.2)
**Found:** ZeroPath automated scan

**Description:** Provider acceptance status could be changed with a single verification. An attacker could mark any provider as "ACCEPTED" or "NOT_ACCEPTED" for any insurance plan with a single unauthenticated request, immediately affecting what users see.

**Fix:** Added consensus-based threshold system requiring:
1. Minimum 3 verifications (`MIN_VERIFICATIONS_FOR_CONSENSUS = 3`).
2. Minimum confidence score of 60 (`MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60`).
3. Clear 2:1 majority ratio (e.g., 3 accepts vs 1 reject).
4. New verifications start as `PENDING` until consensus is reached.

**Files changed:**
- Modified: `packages/backend/src/services/verificationService.ts` (function `determineAcceptanceStatus`)
- Added: `packages/backend/src/config/constants.ts`

**Verification:** The `determineAcceptanceStatus()` function enforces all three conditions before allowing status changes. Unit tests in `packages/backend/src/services/__tests__/verificationService.test.ts` validate threshold logic.

**Code (fixed):**
```typescript
const shouldUpdateStatus =
  verificationCount >= MIN_VERIFICATIONS_FOR_CONSENSUS &&
  confidenceScore >= MIN_CONFIDENCE_FOR_STATUS_CHANGE &&
  hasClearMajority;
```

---

### [VMP-2026-003] PII in Public API Responses

**Fixed:** January 2026
**Severity:** Medium
**Found:** Manual code review

**Description:** Public verification API responses included PII fields (`sourceIp`, `userAgent`, `submittedBy`) that should not be visible to end users. This exposed the IP addresses and email addresses of verification submitters.

**Fix:**
1. Added `stripVerificationPII()` helper function that removes `sourceIp`, `userAgent`, and `submittedBy` from response objects.
2. Applied to `submitVerification()` and `voteOnVerification()` return values.
3. Prisma `select` clauses in `getRecentVerifications()` and `getVerificationsForPair()` explicitly exclude PII fields rather than returning all columns.

**Files changed:**
- Modified: `packages/backend/src/services/verificationService.ts`

**Verification:** The `getRecentVerifications()` and `getVerificationsForPair()` functions use explicit `select` clauses that exclude `sourceIp`, `userAgent`, and `submittedBy`. The `stripVerificationPII()` function is applied to all verification objects before returning from mutation endpoints.

**Code (fixed):**
```typescript
function stripVerificationPII<T extends Record<string, unknown>>(
  verification: T
): Omit<T, 'sourceIp' | 'userAgent' | 'submittedBy'> {
  const { sourceIp, userAgent, submittedBy, ...safe } = verification;
  return safe;
}
```

---

### [VMP-2026-004] Legacy Vulnerable Endpoint

**Fixed:** January 2026
**Severity:** High
**Found:** Manual code review

**Description:** A legacy verification endpoint at `src/api/routes.ts` lacked all security controls (no rate limiting, no CAPTCHA, no input validation, no PII stripping). It was the original endpoint before the security-hardened routes were created.

**Fix:** Removed the legacy endpoint entirely. All verification traffic now routes through `packages/backend/src/routes/verify.ts` which has full security middleware applied.

**Files changed:**
- Removed: `src/api/routes.ts`
- Modified: `src/index.ts` (removed legacy route registration)

**Verification:** The file no longer exists. All routes are registered through `packages/backend/src/routes/index.ts` which mounts the secured router.

---

## npm audit Results

**Last Run:** February 2026

**Backend Dependencies (packages/backend):**

Key dependencies and their security status:

| Package | Version | Status |
|---------|---------|--------|
| express | ^4.18.2 | Monitor for updates -- Express 4.x is in maintenance mode |
| helmet | ^7.1.0 | Current |
| cors | ^2.8.5 | Current |
| @prisma/client | ^5.22.0 | Current |
| zod | ^3.22.4 | Current |
| ioredis | ^5.9.2 | Current |
| pino | ^10.3.0 | Current |
| dotenv | ^16.3.1 | Current |

**Frontend Dependencies (packages/frontend):**

| Package | Version | Status |
|---------|---------|--------|
| next | 14.2.x | Monitor for security patches |
| @anthropic-ai/sdk | latest | Current |

**Action Items:**
- [ ] Run `npm audit` in both packages and resolve any critical/high findings.
- [ ] Monitor Express 4.x for end-of-life announcement and plan migration to Express 5.
- [ ] Keep Next.js 14.2.x patched with latest minor/patch versions.
- [ ] Review `npm install --force` usage in Dockerfiles (both backend and frontend use `--force` which bypasses peer dependency checks and may mask security warnings).

---

## False Positives

| Finding | Tool | Reason for FP |
|---------|------|---------------|
| `$queryRaw` SQL injection | Manual grep | Only used for `SELECT 1` health check with tagged template literal (parameterized) -- no user input |
| `multi.exec()` in rate limiter | Manual grep | Redis `MULTI/EXEC` transaction, not `eval()` -- grep matched on `exec` |
| Hardcoded secrets | Manual grep | No hardcoded secrets found; CAPTCHA/admin/DB credentials all sourced from environment variables |

---

## Accepted Risks

| Vulnerability | Severity | Accepted By | Mitigation |
|---------------|----------|-------------|------------|
| No user authentication | Info | Architecture decision | Rate limiting, CAPTCHA, Sybil prevention, consensus thresholds |
| CORS allows null origin | Medium | Architecture decision | API is designed for public access; rate limiting applies |
| Rate limiter fail-open | Medium | Availability priority | Fallback rate limiting on CAPTCHA; logging and monitoring |
| In-memory rate limiting (single instance) | Info | Documented limitation | Redis configured for production; documented as single-instance only |
| `trust proxy` set to 1 | Info | Cloud Run requirement | Required for correct client IP extraction behind Cloud Run load balancer; limited to trusting 1 proxy hop |

---

## Security Improvements Made

**January 2026:**
- **Rate Limiting:** Added sliding window rate limiting with dual-mode support (Redis distributed + in-memory fallback). Configured per-endpoint limits: 10/hour verify, 10/hour vote, 100/hour search, 200/hour default.
- **CAPTCHA:** Integrated Google reCAPTCHA v3 with configurable fail-open/fail-closed modes and fallback rate limiting.
- **Honeypot:** Added honeypot field middleware for basic bot detection on verification/vote endpoints.
- **PII Stripping:** Implemented `stripVerificationPII()` and explicit Prisma `select` clauses to prevent PII leakage in API responses.
- **Consensus Thresholds:** Added 3-verification minimum, 60-point confidence minimum, and 2:1 majority ratio for acceptance status changes.
- **Sybil Prevention:** Added 30-day deduplication window per IP and email for the same provider-plan pair.
- **Verification TTL:** Added 6-month expiration on verifications and acceptances based on 12% annual provider turnover research.
- **Admin Auth:** Implemented admin endpoints with `X-Admin-Secret` header using `timingSafeEqual` for timing-attack resistance.
- **Helmet Security Headers:** Configured strict CSP for JSON API backend (default-src 'none'), CORS, referrer policy, and other security headers.
- **Body Size Limits:** Added 100KB limit on JSON and URL-encoded payloads to prevent large payload attacks.
- **Input Validation:** All endpoints use Zod schemas for strict input validation with type coercion, length limits, and format validation.
- **Request Timeouts:** Added request timeout middleware (30s general, 15s search, 120s admin) to prevent slow loris attacks.
- **Request ID Correlation:** Added UUID-based request ID middleware for log correlation across the request lifecycle.
- **Structured Logging:** Replaced console logging with pino structured JSON logging (backend). Request logger explicitly excludes PII.
- **Non-Root Docker:** Both Dockerfiles run as non-root users (`expressjs`/`nextjs`) with explicit UID/GID.
- **Graceful Shutdown:** Added SIGINT/SIGTERM handlers with 10-second timeout for clean database disconnection.
- **Error Handler:** Global error handler sanitizes error messages in production (does not expose stack traces or internal error details to clients).
- **Vote Deduplication:** VoteLog model enforces unique constraint on `(verificationId, sourceIp)` to prevent duplicate votes.

**February 2026:**
- **Insurance Card Extraction:** Added rate limiting (10/hour), payload size validation (10MB max), base64 format validation, and media type detection for the insurance card OCR feature.

---

## Security Architecture Overview

### Defense-in-Depth Layers

```
Layer 1: Network
  - Cloud Run HTTPS termination
  - Helmet security headers (backend)
  - X-Frame-Options, X-Content-Type-Options, Referrer-Policy (frontend)

Layer 2: Request Filtering
  - CORS origin whitelist (verifymyprovider.com + Cloud Run URL)
  - Body size limit (100KB)
  - Request timeout (15s-120s depending on endpoint)

Layer 3: Rate Limiting
  - IP-based sliding window (Redis or in-memory)
  - Per-endpoint limits (10-200 req/hour)
  - Fallback rate limiting when CAPTCHA fails

Layer 4: Bot Prevention
  - Google reCAPTCHA v3 (score >= 0.5)
  - Honeypot field detection
  - Sybil attack prevention (30-day IP/email dedup)

Layer 5: Input Validation
  - Zod schema validation on all endpoints
  - Type coercion with bounds checking
  - NPI format validation (10 digits)

Layer 6: Business Logic Protection
  - Consensus threshold (3 verifications minimum)
  - Confidence score minimum (60 points)
  - 2:1 majority ratio requirement
  - Verification TTL (6 months)

Layer 7: Data Protection
  - PII stripping from API responses
  - Explicit Prisma select (no SELECT *)
  - Admin endpoints behind secret auth
  - Timing-safe secret comparison
```

---

## Next Security Audit

**Scheduled:** Prior to public launch (TBD)
**Tool:** ZeroPath + manual code review
**Focus Areas:**
- [ ] Frontend CSP re-enablement verification
- [ ] npm dependency audit (both packages)
- [ ] Insurance card extraction feature (PHI handling, data retention)
- [ ] Redis connection security (authentication, TLS)
- [ ] Database connection security (SSL mode, connection pooling)
- [ ] Cloud Run IAM and networking configuration
- [ ] CAPTCHA effectiveness review (score distribution analysis)
- [ ] Rate limiting effectiveness review (analyze 429 response rate)
- [ ] Penetration testing on verification/vote endpoints
