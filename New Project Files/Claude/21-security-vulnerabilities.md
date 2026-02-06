# VerifyMyProvider Security Vulnerabilities

**Last Updated:** 2026-02-06
**Last Audit:** January 2026 by ZeroPath + Manual Code Review

---

## Critical Summary

| Severity | Open | In Progress | Fixed |
|----------|------|-------------|-------|
| Critical | 0 | 0 | 1 |
| High | 0 | 0 | 1 |
| Medium | 0 | 0 | 2 |
| Low | 0 | 0 | 0 |

**All known vulnerabilities are resolved as of February 2026.**

---

## Open Vulnerabilities

None. All identified vulnerabilities have been fixed.

---

## In Progress

None.

---

## Fixed Vulnerabilities

### [VMP-2026-001] Unauthenticated Verification Spam

**Fixed:** January 2026
**Severity:** Medium (CVSS 7.1)
**Found:** ZeroPath automated scan

**Description:** No rate limiting existed on verification endpoints (`POST /api/v1/verify` and `POST /api/v1/verify/:id/vote`), allowing unlimited spam submissions that could poison crowdsourced data and manipulate confidence scores.

**Fix:** Added comprehensive multi-layer protection:
1. **IP-based rate limiting** via sliding window algorithm (10/hour for verify, 10/hour for vote, 100/hour for search, 200/hour for general)
2. **Dual-mode implementation** - Redis for distributed deployments, in-memory fallback for single-instance
3. **Fail-open behavior** when Redis is unavailable, with degraded headers logged

**Files changed:**
- Added: `packages/backend/src/middleware/rateLimiter.ts` (368 lines, sliding window algorithm)
- Modified: `packages/backend/src/routes/verify.ts` (rate limiters applied to all endpoints)

**Verification:** Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are returned on every response. 429 status returned when limit exceeded.

---

### [VMP-2026-002] Verification Threshold Bypass

**Fixed:** January 2026
**Severity:** Critical (CVSS 9.2)
**Found:** ZeroPath automated scan

**Description:** Provider acceptance status could be changed without meeting the minimum verification threshold, allowing a single malicious verification to flip a provider's acceptance status.

**Fix:** Added consensus requirements before status changes in `determineAcceptanceStatus()`:
- Minimum 3 verifications required (`MIN_VERIFICATIONS_FOR_CONSENSUS = 3`)
- Minimum 60 confidence score required (`MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60`)
- Clear 2:1 majority ratio required (`hasClearMajority` check)
- New records start as `PENDING` until consensus is reached

**Files changed:**
- `packages/backend/src/services/verificationService.ts` - lines 163-185, `determineAcceptanceStatus()` function
- `packages/backend/src/config/constants.ts` - threshold constants defined

**Code snippet (fix):**
```typescript
const shouldUpdateStatus =
  verificationCount >= MIN_VERIFICATIONS_FOR_CONSENSUS &&
  confidenceScore >= MIN_CONFIDENCE_FOR_STATUS_CHANGE &&
  hasClearMajority;
```

---

### [VMP-2026-003] PII in Public Responses

**Fixed:** January 2026
**Severity:** Medium
**Found:** Manual code review

**Description:** Public API responses for verification queries included PII fields (`sourceIp`, `userAgent`, `submittedBy`) that should not be exposed to end users.

**Fix:** Implemented PII stripping at two levels:
1. **`stripVerificationPII()` function** in `verificationService.ts` (line 307-310) - strips `sourceIp`, `userAgent`, `submittedBy` from verification objects before returning
2. **Prisma `select` clauses** in `getRecentVerifications()` and `getVerificationsForPair()` - explicitly exclude PII columns at the query level

**Files changed:**
- `packages/backend/src/services/verificationService.ts` - `stripVerificationPII()` helper, plus explicit `select` clauses on lines 632-666 and 716-734

**Code snippet (fix):**
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

**Description:** A legacy verification endpoint at `src/api/routes.ts` lacked all security controls (no rate limiting, no input validation, no CAPTCHA, no Sybil prevention). This was the original route file before the security hardening of the `routes/verify.ts` replacement.

**Fix:** Removed the legacy endpoint entirely. All verification traffic now goes through `packages/backend/src/routes/verify.ts` which has full security controls.

**Files changed:**
- Removed: `src/api/routes.ts`
- Verified: `packages/backend/src/routes/index.ts` only references the secured routes

---

## npm audit Results

**Last Run:** 2026-02-06 (analysis of package.json)

**Backend Dependencies (production):**
- `express@^4.18.2` - Well-maintained, check for latest patches
- `helmet@^7.1.0` - Security headers middleware
- `cors@^2.8.5` - CORS handling
- `zod@^3.22.4` - Input validation
- `@prisma/client@^5.22.0` - ORM
- `ioredis@^5.9.2` - Redis client
- `pino@^10.3.0` - Structured logging
- `dotenv@^16.3.1` - Environment loading

**Action Items:**
- [ ] Run `npm audit` in CI pipeline to catch new CVEs automatically
- [ ] The `security-scan.yml` GitHub Action runs Gitleaks for secret detection on every push/PR
- [ ] Consider adding `npm audit --audit-level=high` as a CI gate

---

## False Positives

| Finding | Tool | Reason for FP |
|---------|------|---------------|
| None identified | - | - |

---

## Accepted Risks

| Vulnerability | Severity | Accepted By | Mitigation |
|---------------|----------|-------------|------------|
| CAPTCHA fail-open default | Low | Architecture decision | Fallback rate limit of 3 req/hour applied when Google API unavailable; `X-Security-Degraded` header set for monitoring |
| Rate limiter fail-open on Redis failure | Low | Architecture decision | Availability prioritized over strict limiting; `X-RateLimit-Status: degraded` header logged for monitoring |
| No user authentication for public API | Medium | Product decision | Public data only (no PHI); rate limiting + CAPTCHA + honeypot + Sybil prevention provide layered defense |
| IP addresses stored in DB for anti-abuse | Low | Privacy trade-off | Required for Sybil prevention (30-day dedup window); not exposed in API responses |

---

## Security Improvements Made

**January 2026:**
- Rate limiting middleware added (dual-mode Redis/in-memory, 4 tiers)
- CAPTCHA integration (reCAPTCHA v3, fail-open with fallback rate limiting)
- Honeypot middleware for bot detection (silent 200 response to not alert bots)
- Sybil attack prevention (IP dedup + email dedup + 30-day window)
- Verification threshold enforcement (3 verifications + 60 confidence + 2:1 majority)
- PII stripped from public API responses
- Legacy vulnerable endpoint removed
- Timing-safe comparison for admin secret (`timingSafeEqual` in `admin.ts`)
- Helmet.js with strict CSP for JSON API
- CORS whitelist (only verifymyprovider.com and Cloud Run URLs)
- Request body size limits (100kb via `express.json({ limit: '100kb' })`)
- Zod input validation on all endpoints
- Structured logging with pino (PII-free request logs)
- Request ID middleware for log correlation
- Gitleaks GitHub Action for secret scanning

**February 2026:**
- `security-scan.yml` CI workflow running on every push/PR
- DataQualityAudit model added for tracking data integrity

---

## Current Security Architecture

```
Request Flow:
  Client -> CORS Check -> Helmet (CSP) -> Request ID -> Body Size Limit
    -> Rate Limiter (4 tiers) -> Honeypot Check -> CAPTCHA (reCAPTCHA v3)
      -> Zod Validation -> Route Handler -> Sybil Check -> DB
        -> PII Strip -> Response
```

**Layers of defense on write endpoints (verify/vote):**
1. CORS whitelist
2. Body size limit (100kb)
3. IP-based rate limiting (10/hour)
4. Honeypot field check
5. reCAPTCHA v3 score check (>= 0.5)
6. Zod schema validation
7. Sybil prevention (IP + email dedup, 30-day window)
8. Consensus threshold (3 verifications, 60 confidence, 2:1 majority)

---

## Next Security Audit

**Scheduled:** Before beta launch
**Recommended Tool:** External penetration test or repeat ZeroPath scan
**Focus Areas:**
- Verify rate limiting effectiveness under load
- Test CAPTCHA bypass scenarios
- Review admin secret rotation
- Evaluate need for CSRF protection (currently not needed - no auth cookies)
- Consider automated SAST/DAST in CI pipeline
