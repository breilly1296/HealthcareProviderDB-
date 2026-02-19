# VerifyMyProvider Security Vulnerabilities

**Last Updated:** 2026-02-18
**Last Audit:** February 2026 (Codebase Review)

---

## Critical Summary

| Severity | Open | In Progress | Fixed |
|----------|------|-------------|-------|
| Critical | 0 | 0 | 1 |
| High | 0 | 0 | 1 |
| Medium | 0 | 0 | 2 |
| Low | 2 | 0 | 0 |
| Info | 1 | 0 | 0 |

**Overall Security Posture:** Good. All critical/high vulnerabilities from the ZeroPath scan (Jan 2026) have been fixed. Two low-severity items and one informational item remain open.

---

## Open Vulnerabilities

### [VMP-2026-005] CAPTCHA Secret Key Bypass in Non-Production

**Severity:** Low
**Status:** Open (accepted risk)
**Found:** 2026-02-18, Codebase Review

**Description:**
When `RECAPTCHA_SECRET_KEY` is not configured, the CAPTCHA middleware logs a warning and allows all requests through without verification. While this is intentional for development/staging, a misconfigured production deployment without the secret would silently disable bot protection.

**Location:**
- File: `packages/backend/src/middleware/captcha.ts`, lines 126-132

**Vulnerability:**
```typescript
if (!RECAPTCHA_SECRET) {
  logger.warn({
    endpoint: req.path,
    method: req.method,
  }, 'CAPTCHA not configured - RECAPTCHA_SECRET_KEY missing, skipping verification');
  return next();
}
```

**Exploit Scenario:**
1. Production deployment missing `RECAPTCHA_SECRET_KEY` environment variable
2. All CAPTCHA checks silently bypassed
3. Bots can spam verification/vote endpoints without CAPTCHA challenge

**Impact:** Verification spam possible if env var misconfigured in production

**Fix Plan:**
- *Short-term:* Add a startup health check that verifies `RECAPTCHA_SECRET_KEY` is set in production and fails loudly (log CRITICAL, return degraded health)
- *Long-term:* Pre-deploy checks in CI/CD pipeline to validate all required secrets are configured

---

### [VMP-2026-006] In-Memory Rate Limit State Not Shared Across Instances

**Severity:** Low
**Status:** Open (mitigated)
**Found:** 2026-02-18, Codebase Review

**Description:**
When Redis is not configured, rate limiting falls back to in-memory stores that are process-local. If Cloud Run scales to multiple instances, each instance maintains independent counters, effectively multiplying the rate limit by the number of instances.

**Location:**
- File: `packages/backend/src/middleware/rateLimiter.ts`, lines 85-108

**Exploit Scenario:**
1. Application running on 3 Cloud Run instances without Redis
2. Attacker sends requests distributed across instances
3. Effective rate limit becomes 3x the configured limit (e.g., 30 verifications/hour instead of 10)

**Impact:** Rate limits less effective during horizontal scaling without Redis. Currently mitigated because Redis is configured in production.

**Mitigation:**
- Redis is configured in production (distributed rate limiting active)
- CAPTCHA provides an additional layer of bot protection
- Sybil prevention (30-day IP/email dedup) limits repeated abuse

**Fix Plan:**
- Ensure Redis is always provisioned in production environments
- Consider adding a startup warning when running multi-instance without Redis

---

### [VMP-2026-007] Health Endpoint Exposes Internal State Without Authentication

**Severity:** Info
**Status:** Open (accepted risk)
**Found:** 2026-02-18, Codebase Review

**Description:**
The `/health` endpoint is publicly accessible (intentionally placed before rate limiting and auth) and returns memory usage, database response times, cache hit rates, and uptime. While standard for monitoring, this provides reconnaissance data.

**Location:**
- File: `packages/backend/src/index.ts`, lines 108-151

**Impact:** Minimal. Information useful for monitoring but could help an attacker understand infrastructure timing.

**Mitigation:**
- This is industry-standard for health checks used by load balancers and monitoring tools
- No PII or secrets exposed
- Detailed health data is behind admin auth at `/api/v1/admin/health`

---

## In Progress

None.

---

## Fixed Vulnerabilities

### [VMP-2026-001] Unauthenticated Verification Spam

**Fixed:** January 2026
**Severity:** Medium (CVSS 7.1)
**Found:** ZeroPath scan

**Description:** No rate limiting on verification endpoints allowed unlimited spam submissions that could poison the crowdsourced data.

**Fix:** Added comprehensive multi-layer protection:
- IP-based sliding window rate limiting (10 verifications/hour, 10 votes/hour)
- Dual-mode rate limiter: Redis (distributed) with in-memory fallback
- Honeypot field on verification form to silently catch bots
- reCAPTCHA v3 score-based verification (threshold: 0.5)
- 30-day Sybil prevention window (IP + email deduplication)

**Files changed:**
- Added: `packages/backend/src/middleware/rateLimiter.ts`
- Added: `packages/backend/src/middleware/captcha.ts`
- Added: `packages/backend/src/middleware/honeypot.ts`
- Modified: `packages/backend/src/routes/verify.ts`
- Added: `packages/frontend/src/components/ReCaptchaProvider.tsx`

**Verification:** Rate limiters tested via `packages/backend/src/middleware/__tests__/rateLimiter.test.ts`. Honeypot tested via `packages/backend/src/middleware/__tests__/honeypot.test.ts`. CAPTCHA tested via `packages/backend/src/middleware/__tests__/captcha.test.ts`.

---

### [VMP-2026-002] Verification Threshold Bypass

**Fixed:** January 2026
**Severity:** Critical (CVSS 9.2)
**Found:** ZeroPath scan

**Description:** Could change provider acceptance status to ACCEPTED or NOT_ACCEPTED without meeting the minimum verification threshold, allowing a single user to manipulate provider data.

**Fix:** Added consensus requirements in `verificationService.ts`:
- Minimum 3 verifications required (`MIN_VERIFICATIONS_FOR_CONSENSUS`)
- Minimum confidence score of 60 (`MIN_CONFIDENCE_FOR_STATUS_CHANGE`)
- Clear 2:1 majority ratio required before status change
- New records start as `PENDING` until consensus reached

**Files changed:**
- `packages/backend/src/services/verificationService.ts` (consensus logic)
- `packages/backend/src/config/constants.ts` (threshold constants)

---

### [VMP-2026-003] PII in Public Responses

**Fixed:** January 2026
**Severity:** Medium
**Found:** Code review

**Description:** Public verification API responses included PII fields (`sourceIp`, `userAgent`, `submittedBy`) that should not be exposed.

**Fix:**
- Created `VERIFICATION_PUBLIC_SELECT` constant that explicitly lists only safe fields
- Added `stripVerificationPII()` helper function
- All public queries use the restricted select or strip PII before returning

**Files changed:**
- `packages/backend/src/services/verificationService.ts`

---

### [VMP-2026-004] Legacy Vulnerable Endpoint

**Fixed:** January 2026
**Severity:** High
**Found:** Code review

**Description:** Legacy verification endpoint at `src/api/routes.ts` lacked rate limiting, CAPTCHA, honeypot, and Sybil prevention controls. It provided a direct bypass of all security measures added to the new routes.

**Fix:** Removed legacy endpoint entirely. All verification traffic now routes through `packages/backend/src/routes/verify.ts` with full security stack.

**Files changed:**
- Removed: `src/api/routes.ts`
- Modified: `src/index.ts` (removed legacy route registration)

---

## npm Audit Results

**Last Run:** 2026-02-18

**Dependencies (from package.json review):**

| Package | Version | Status |
|---------|---------|--------|
| express | ^4.18.2 | Current stable |
| helmet | ^7.1.0 | Current stable |
| cors | ^2.8.5 | Current stable |
| zod | ^3.22.4 | Current stable |
| ioredis | ^5.9.2 | Current stable |
| jose | ^6.1.3 | Current stable |
| csrf-csrf | ^4.0.3 | Current stable |
| @prisma/client | ^5.22.0 | Current stable |
| next | ^14.2.35 | Current stable for 14.x |

**Action Items:**
- [ ] Run `npm audit` periodically (monthly recommended)
- [ ] Monitor for express 5.x migration path when stable

---

## False Positives

| Finding | Tool | Reason for FP |
|---------|------|---------------|
| CORS allows null origin | Manual review | By design -- mobile apps and direct API clients send no Origin header; CORS whitelist blocks unknown origins |

---

## Accepted Risks

| Vulnerability | Severity | Accepted By | Mitigation |
|---------------|----------|-------------|------------|
| Health endpoint public | Info | Architecture decision | Standard for LB health checks; detailed stats behind admin auth |
| CAPTCHA fail-open default | Low | Availability priority | Fallback rate limiting (3/hour vs 10/hour) applied when CAPTCHA unavailable |
| In-memory rate limit on single instance | Low | Ops decision | Redis configured in production; documented in SCALING.md |

---

## Security Improvements Made

**January 2026:**
- Added dual-mode rate limiting (Redis/in-memory) with sliding window algorithm
- Added Google reCAPTCHA v3 integration with configurable fail-open/fail-closed modes
- Added honeypot bot detection on verification forms
- Added 30-day Sybil attack prevention (IP + email deduplication)
- Added verification consensus thresholds (3 verifications, 60 confidence, 2:1 majority)
- Removed PII from public API responses
- Removed legacy unprotected endpoints

**February 2026:**
- Added magic-link passwordless authentication (JWT + refresh tokens)
- Added CSRF protection (double-submit cookie pattern via csrf-csrf)
- Added AES-256-GCM encryption for insurance card PII with key rotation support
- Added Helmet security headers with strict CSP for JSON API
- Added timing-safe admin secret comparison
- Added request timeouts (30s general, 15s search, 120s admin)
- Added structured PII-free logging with pino
- Added enrichment data protection (field allowlists on import scripts)

---

## Current Security Architecture

### Defense-in-Depth Layers (Verification Endpoints)

```
Request
  |
  v
[1] Helmet Security Headers (CSP, HSTS, X-Frame-Options)
  |
  v
[2] CORS Whitelist (verifymyprovider.com + Cloud Run URL)
  |
  v
[3] Body Size Limit (100KB)
  |
  v
[4] Default Rate Limiter (200 req/hour)
  |
  v
[5] Endpoint-Specific Rate Limiter (10 req/hour for verify/vote)
  |
  v
[6] Honeypot Check (silent bot trap)
  |
  v
[7] reCAPTCHA v3 (score >= 0.5)
  |
  v
[8] Zod Input Validation
  |
  v
[9] Sybil Prevention (30-day IP + email dedup)
  |
  v
[10] Consensus Thresholds (3 verifications, 60 confidence, 2:1 majority)
  |
  v
[Response] PII stripped from output
```

---

## Next Security Audit

**Recommended:** Q2 2026
**Tool:** External penetration test recommended before public launch
**Focus Areas:**
- Authentication flow (magic link token security, session management)
- Insurance card encryption key rotation procedure
- API endpoint fuzzing
- Rate limit bypass testing under horizontal scaling
- CSRF token validation edge cases
