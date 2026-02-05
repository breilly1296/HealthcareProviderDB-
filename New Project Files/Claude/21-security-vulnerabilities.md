# VerifyMyProvider Security Vulnerabilities

**Last Updated:** 2026-02-05
**Generated From:** prompts/21-security-vulnerabilities.md
**Last Audit:** January 2026 by ZeroPath (automated scan) + manual code review

---

## Critical Summary

| Severity | Open | In Progress | Fixed |
|----------|------|-------------|-------|
| Critical | 0    | 0           | 1     |
| High     | 0    | 0           | 1     |
| Medium   | 0    | 0           | 2     |
| Low      | 0    | 0           | 0     |

**Overall Status:** All known vulnerabilities from the January 2026 ZeroPath audit have been resolved. No new open vulnerabilities identified in the current codebase review.

---

## Open Vulnerabilities

None. All identified vulnerabilities have been fixed as of January 2026.

---

## In Progress

None.

---

## Fixed Vulnerabilities

### [VMP-2026-001] Unauthenticated Verification Spam

**Fixed:** January 2026
**Severity:** Medium (CVSS 7.1)
**Found:** ZeroPath scan

**Description:** No rate limiting existed on verification and vote endpoints, allowing unlimited automated spam. An attacker could submit unlimited verifications and votes, poisoning crowdsourced confidence scores and destroying the integrity of the verification system.

**Exploit Scenario:**
1. Attacker identifies `POST /api/v1/verify` and `POST /api/v1/verify/:id/vote` endpoints
2. Automated script submits thousands of fake verifications per minute
3. Confidence scores are manipulated to show incorrect insurance acceptance data
4. Database fills with spam records, degrading search quality

**Fix:** Multi-layered defense implemented:

- **Rate Limiting (Layer 1):** IP-based sliding window rate limiting added via `rateLimiter.ts`
  - Verification submissions: 10 requests/hour per IP
  - Vote submissions: 10 requests/hour per IP
  - Search: 100 requests/hour per IP
  - Default API: 200 requests/hour per IP
  - Dual-mode: Redis (distributed) or in-memory (single-instance)
  - Fail-open behavior prioritizes availability

- **CAPTCHA (Layer 2):** Google reCAPTCHA v3 integration via `captcha.ts`
  - Score threshold: 0.5 (configurable via `CAPTCHA_MIN_SCORE`)
  - Configurable fail mode: `CAPTCHA_FAIL_MODE=open|closed`
  - Fallback rate limiting when Google API unavailable (3 requests/hour vs normal 10)
  - Skipped in development/test environments

**Files changed:**
- Added: `packages/backend/src/middleware/rateLimiter.ts`
- Added: `packages/backend/src/middleware/captcha.ts`
- Modified: `packages/backend/src/routes/verify.ts` (rate limiters + CAPTCHA applied to POST routes)
- Added: `packages/backend/src/config/constants.ts` (security-related constants)

**Verification:** Rate limit headers are returned on all responses (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`). Exceeding the limit returns HTTP 429 with `Retry-After` header.

---

### [VMP-2026-002] Verification Threshold Bypass

**Fixed:** January 2026
**Severity:** Critical (CVSS 9.2)
**Found:** ZeroPath scan

**Description:** Provider acceptance status could be changed by a single verification submission without meeting the required consensus threshold. This allowed a single user to flip a provider's insurance acceptance status.

**Exploit Scenario:**
1. Attacker submits a single false verification claiming a provider does/does not accept insurance
2. Without threshold checks, the provider's acceptance status immediately changes
3. Users see incorrect insurance acceptance data

**Fix:** Consensus threshold enforcement implemented in `verificationService.ts`:
- Minimum of 3 verifications required before any status change (`MIN_VERIFICATIONS_FOR_CONSENSUS = 3`)
- Minimum confidence score of 60 required for status change (`MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60`)
- Consensus counting considers only non-expired verifications (6-month TTL)

**Files changed:**
- `packages/backend/src/services/verificationService.ts`
- `packages/backend/src/config/constants.ts`

---

### [VMP-2026-003] PII in Public Responses

**Fixed:** January 2026
**Severity:** Medium
**Found:** Manual code review

**Description:** Public verification API responses included personally identifiable information (PII) fields such as submitter email addresses and source IP addresses that should not be exposed to end users.

**Fix:** PII fields (`sourceIp`, `submittedBy`, `userAgent`) excluded from public-facing API response objects in verification service. Only non-PII fields (verification ID, votes, timestamps) are returned.

**Files changed:**
- `packages/backend/src/services/verificationService.ts`

---

### [VMP-2026-004] Legacy Vulnerable Endpoint

**Fixed:** January 2026
**Severity:** High
**Found:** Manual code review

**Description:** A legacy verification endpoint at `src/api/routes.ts` existed without any security controls (no rate limiting, no CAPTCHA, no input validation). This endpoint predated the security overhaul and provided an unprotected path to the verification system.

**Fix:** Legacy endpoint removed entirely. All verification traffic now goes through the secured `packages/backend/src/routes/verify.ts` with full middleware stack.

**Files changed:**
- Removed: `src/api/routes.ts`
- Modified: `src/index.ts` (removed legacy route registration)

---

## Current Security Posture

### Security Middleware Stack (Applied in Order)

Based on analysis of `packages/backend/src/index.ts`:

| Layer | Middleware | Purpose | File |
|-------|-----------|---------|------|
| 1 | Request ID | Log correlation for incident investigation | `middleware/requestId.ts` |
| 2 | HTTP Logger | Structured request logging via pino | `middleware/httpLogger.ts` |
| 3 | Helmet | Security headers (CSP, COEP, COOP, CORP, Referrer-Policy) | `index.ts` |
| 4 | CORS | Origin allowlist (production domains only) | `index.ts` |
| 5 | Body Parser | 100KB payload size limit | `index.ts` |
| 6 | Rate Limiter | 200 req/hour default, stricter for write endpoints | `middleware/rateLimiter.ts` |
| 7 | CAPTCHA | reCAPTCHA v3 on verification/vote endpoints | `middleware/captcha.ts` |
| 8 | Zod Validation | Input schema validation on all routes | Route files |
| 9 | Error Handler | Sanitized error responses (no stack traces in production) | `middleware/errorHandler.ts` |

### Helmet Security Headers

The backend is configured with strict Content Security Policy for a JSON-only API:

```
default-src: 'none'
script-src: 'none'
style-src: 'none'
frame-ancestors: 'none'
form-action: 'none'
upgrade-insecure-requests: enabled
cross-origin-embedder-policy: true
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
referrer-policy: no-referrer
```

### CORS Configuration

- **Production origins:** `verifymyprovider.com`, `www.verifymyprovider.com`, Cloud Run frontend URL
- **Development:** `localhost:3000`, `localhost:3001` added only when `NODE_ENV=development`
- **Blocked origins:** Logged with `CORS blocked request from origin` warning
- **Allowed headers:** `Content-Type`, `Authorization`, `X-Request-ID`, `X-Admin-Secret`

### Admin Endpoint Security

File: `packages/backend/src/routes/admin.ts`

- **Authentication:** `X-Admin-Secret` header validated using `crypto.timingSafeEqual()` to prevent timing attacks
- **Graceful degradation:** Returns 503 if `ADMIN_SECRET` env var not configured (endpoints disabled)
- **Buffer length check:** Handles unequal-length buffers before `timingSafeEqual` (which requires equal lengths)
- **All admin routes** (`/cleanup-expired`, `/expiration-stats`, `/health`, `/cache/clear`, `/cache/stats`, `/cleanup/sync-logs`, `/retention/stats`) are protected by `adminAuthMiddleware`

### Sybil Attack Prevention (4 Layers)

File: `packages/backend/src/services/verificationService.ts`

1. **IP-based deduplication:** Same IP cannot submit multiple verifications for the same provider-plan pair within 30 days
2. **Email-based deduplication:** Same email cannot submit duplicates within 30 days
3. **Rate limiting:** Max 10 verification submissions per hour per IP
4. **CAPTCHA:** reCAPTCHA v3 bot detection with score threshold

### Error Handling Security

File: `packages/backend/src/middleware/errorHandler.ts`

- **Production mode:** Generic "Internal server error" message returned for unhandled errors (no stack traces, no internal details)
- **Development mode:** Full error messages returned for debugging
- **Typed error handling:** Separate handlers for `AppError`, `ZodError`, `PayloadTooLargeError`, `PrismaClientKnownRequestError`
- **Request IDs:** Included in all error responses for log correlation

---

## Security Scan Results

### Hardcoded Secrets Scan

**Scan Date:** 2026-02-05
**Method:** Pattern search for `sk-ant`, `password=`, hardcoded API keys

**Result:** No hardcoded secrets found in `packages/backend/src/`.

All secrets are loaded from environment variables:
- `ADMIN_SECRET` (admin authentication)
- `RECAPTCHA_SECRET_KEY` (CAPTCHA verification)
- `DATABASE_URL` (database connection)
- `REDIS_URL` (rate limiter backend)
- `FRONTEND_URL` (CORS origin)

### Sensitive Data Logging Scan

**Scan Date:** 2026-02-05
**Method:** Pattern search for `console.log` with password/token/secret

**Result:** No sensitive data logging found. The codebase uses structured pino logging (`logger.info/warn/error`) instead of `console.log`, and no patterns were found that log passwords, tokens, or secrets.

### Security TODO Scan

**Scan Date:** 2026-02-05
**Method:** Pattern search for `TODO.*security` and `FIXME.*security`

**Result:** No open security TODOs found in `packages/backend/src/`.

---

## npm Audit Results

**Last Run:** Manual (run `cd packages/backend && npm audit` for current results)

**Action Items:**
- [ ] Run `npm audit` as part of CI/CD pipeline
- [ ] Address any critical/high severity findings

---

## False Positives

| Finding | Tool | Reason for FP |
|---------|------|---------------|
| None identified | - | - |

---

## Accepted Risks

| Vulnerability | Severity | Rationale | Mitigation |
|---------------|----------|-----------|------------|
| Rate limiter fail-open behavior | Low | Availability prioritized over strict rate limiting when Redis unavailable | Warning logged, `X-RateLimit-Status: degraded` header set. In-memory fallback for single-instance deployments. |
| CAPTCHA fail-open (default mode) | Low | Users should not be blocked during Google API outages | Fallback rate limiting (3 req/hour vs normal 10), `X-Security-Degraded` header set, configurable to `CAPTCHA_FAIL_MODE=closed` for higher security |
| No-origin CORS requests allowed | Low | Mobile apps, curl, and monitoring tools send requests without Origin header | Rate limiting still applies; all authenticated admin routes require `X-Admin-Secret` |
| Admin auth via shared secret (not user accounts) | Medium | Pre-launch product; user account system not yet built | Timing-safe comparison, secret from environment variable, endpoints return 503 if not configured |

---

## Security Improvements Made

**January 2026:**
- Added IP-based sliding window rate limiting (Redis + in-memory dual-mode)
- Added Google reCAPTCHA v3 integration with configurable fail mode
- Added Sybil attack prevention (IP + email deduplication with 30-day window)
- Added verification consensus thresholds (min 3 verifications + min 60 confidence score)
- Removed PII from public API responses
- Removed legacy unprotected verification endpoint
- Added Helmet with strict CSP for JSON API
- Added CORS origin allowlist
- Added timing-safe admin secret comparison
- Added body parser size limits (100KB)
- Added structured logging with request ID correlation
- Added `trust proxy` for correct client IP behind Cloud Run load balancer
- Added graceful shutdown with timeout protection

---

## Recommendations for Next Security Audit

**Scheduled:** Before public beta launch
**Tool:** ZeroPath (re-scan) + manual penetration testing
**Focus Areas:**
1. **Authentication system:** When user accounts are added, review session management, password hashing, and token handling
2. **CAPTCHA effectiveness:** Monitor reCAPTCHA v3 score distribution to tune threshold
3. **Rate limit effectiveness:** Review rate limit windows/thresholds based on actual traffic patterns
4. **Dependency audit:** Run `npm audit` in CI/CD and address any new findings
5. **SQL injection:** Verify all Prisma queries use parameterized inputs (currently enforced by Prisma ORM)
6. **CORS policy review:** Ensure no new origins need to be added/removed as deployment changes
7. **Redis security:** If Redis is deployed in production, ensure TLS and authentication are configured
