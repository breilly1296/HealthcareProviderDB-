# VerifyMyProvider Full Security Audit

**Last Updated:** 2026-02-06
**Audit Type:** Comprehensive code review of all security-related components
**Scope:** Backend API, frontend verification form, CI/CD pipeline, database schema

---

## Executive Summary

The VerifyMyProvider application has a strong security posture for a pre-beta product. All 4 findings from the January 2026 ZeroPath scan have been resolved. The application implements defense-in-depth with 8 layers of protection on write endpoints. No critical or high-severity open vulnerabilities were identified during this audit.

**Overall Security Grade: B+**

Key strengths: Multi-layer Sybil prevention, timing-safe admin auth, PII stripping, structured error handling.
Key gaps: Frontend CAPTCHA integration incomplete, no SAST/DAST in CI, no automated secret rotation.

---

## Audit Results by Category

### 1. Database Schema Security (Prompt 01)

**Status: PASS**

**Findings:**
- 15 models with proper indexes for performance and security
- Sybil prevention indexes verified: `idx_vl_sybil_ip` and `idx_vl_sybil_email` on `verification_logs`
- Vote deduplication: `@@unique([verificationId, sourceIp])` on `VoteLog` model
- Partial unique indexes on `provider_plan_acceptance` (managed via raw SQL)
- `DataQualityAudit` model for tracking data integrity issues
- No Row-Level Security (RLS) needed - single-tenant application with no user roles

**Schema file:** `packages/backend/prisma/schema.prisma` (319 lines)

**Checklist:**
- [x] Primary keys defined on all models
- [x] Indexes on frequently queried columns (city, state, zip, npi, taxonomy)
- [x] Unique constraints on vote deduplication
- [x] Foreign keys with appropriate onDelete/onUpdate behavior
- [x] `expiresAt` indexed on verification_logs and provider_plan_acceptance for TTL queries
- [x] No sensitive data stored without purpose (IPs stored only for anti-abuse)

---

### 2. HIPAA Compliance Position (Prompt 02)

**Status: PASS - HIPAA NOT REQUIRED**

**Findings:**
- Application stores only public NPI data from CMS NPPES registry
- No Protected Health Information (PHI) stored
- No patient records, diagnoses, or treatment information
- Provider names, addresses, and NPI numbers are public data
- Verification submissions contain no health information
- `sourceIp` and `userAgent` stored for anti-abuse only (not health data)

---

### 3. Authentication (Prompt 03)

**Status: PASS with notes**

**Findings:**
- **Admin authentication:** `X-Admin-Secret` header validated with `crypto.timingSafeEqual()` in `packages/backend/src/routes/admin.ts` (lines 21-55)
- **Timing-safe comparison:** Correctly uses `Buffer.from()` and length check before `timingSafeEqual`
- **No user authentication:** Public API by design - no user accounts yet
- **Secret storage:** `ADMIN_SECRET` stored in GCP Secret Manager, injected at deploy time
- **Graceful degradation:** Returns 503 if `ADMIN_SECRET` not configured (prevents accidental exposure)

**Code verified:**
```typescript
const isValid =
  providedBuffer.length === secretBuffer.length &&
  timingSafeEqual(providedBuffer, secretBuffer);
```

**Checklist:**
- [x] Timing-safe comparison prevents timing attacks
- [x] Secret not hardcoded in source
- [x] Secret injected via GCP Secret Manager
- [x] 503 returned when secret not configured (fail-safe)
- [x] 401 returned for invalid/missing secret
- [ ] No secret rotation mechanism documented

---

### 4. CSRF Protection (Prompt 04)

**Status: PASS - NOT NEEDED YET**

**Findings:**
- No authentication cookies are used
- API is stateless with header-based auth (X-Admin-Secret)
- CORS whitelist prevents cross-origin requests from unauthorized domains
- When user accounts are added, CSRF tokens will be needed

---

### 5. Audit Logging (Prompt 05)

**Status: PASS**

**Findings:**
- **Pino structured logger** (`packages/backend/src/utils/logger.ts`): JSON output in production, pretty-print in development
- **Request logger** (`packages/backend/src/middleware/requestLogger.ts`): Logs method, path, status, response time, rate limit info - **explicitly excludes PII** (no IP, no user agent, no identifying info)
- **HTTP logger** via pino-http middleware for all requests
- **Request ID middleware** for log correlation across the request lifecycle
- **Admin actions logged:** All admin endpoints log actions with structured context
- **CAPTCHA events logged:** Pass, fail, low score, API errors all logged with structured data
- **Rate limit events logged:** Redis unavailable, transaction failures

**PII handling:**
- Application logs: PII-free (confirmed in `requestLogger.ts` interface definition)
- Database: `sourceIp`, `userAgent`, `submittedBy` stored in `verification_logs` for anti-abuse
- API responses: PII stripped via `stripVerificationPII()` before returning

---

### 6. API Routes Security (Prompt 06)

**Status: PASS**

**All routes verified in `packages/backend/src/routes/`:**

| Route | Methods | Rate Limit | Auth | CAPTCHA | Honeypot | Validation |
|-------|---------|------------|------|---------|----------|------------|
| `/api/v1/providers/search` | GET | searchRateLimiter (100/hr) | None (public) | No | No | Zod |
| `/api/v1/providers/cities` | GET | defaultRateLimiter (200/hr) | None | No | No | Zod |
| `/api/v1/providers/:npi` | GET | defaultRateLimiter (200/hr) | None | No | No | Zod |
| `/api/v1/verify` | POST | verificationRateLimiter (10/hr) | None | Yes | Yes | Zod |
| `/api/v1/verify/:id/vote` | POST | voteRateLimiter (10/hr) | None | Yes | Yes | Zod |
| `/api/v1/verify/stats` | GET | defaultRateLimiter (200/hr) | None | No | No | None |
| `/api/v1/verify/recent` | GET | defaultRateLimiter (200/hr) | None | No | No | Zod |
| `/api/v1/verify/:npi/:planId` | GET | defaultRateLimiter (200/hr) | None | No | No | Zod |
| `/api/v1/admin/*` | Various | defaultRateLimiter (200/hr) | X-Admin-Secret | No | No | Zod |

**Global middleware chain (in order from `index.ts`):**
1. `requestIdMiddleware` - UUID per request
2. `httpLogger` - pino-http request logging
3. `helmet()` - Security headers with strict CSP
4. `cors()` - Whitelist-based CORS
5. `express.json({ limit: '100kb' })` - Body size limit
6. `express.urlencoded({ limit: '100kb' })` - URL-encoded body limit
7. `defaultRateLimiter` - 200 req/hour global limit (applied after health check)
8. `requestLogger` - PII-free request logging

---

### 7. Input Validation (Prompt 07)

**Status: PASS**

**Findings:**
- **Zod schemas** on all endpoints that accept user input
- **Verification submission** (`verify.ts`): NPI validated, planId validated, notes max 1000 chars, evidenceUrl max 500 chars, email validated, captchaToken and honeypot field
- **Vote** (`verify.ts`): vote enum `['up', 'down']`, captchaToken, honeypot
- **Search** (`providers.ts`): state 2-char uppercase, city 1-100 chars, zipCode 3-10 chars, name 1-200 chars, NPI 10-digit regex, entityType enum
- **Pagination** limits enforced (1-100 range in `recentQuerySchema`)

**Zod error handling:** `errorHandler.ts` catches `ZodError` by name and returns structured 400 with field-level error messages.

---

### 8. Rate Limiting (Prompt 08)

**Status: PASS**

**Findings from `packages/backend/src/middleware/rateLimiter.ts` (368 lines):**

| Tier | Name | Limit | Window | Applied To |
|------|------|-------|--------|------------|
| 1 | default | 200/hr | 1 hour | All API routes |
| 2 | search | 100/hr | 1 hour | Provider search |
| 3 | verification | 10/hr | 1 hour | Verification submission |
| 4 | vote | 10/hr | 1 hour | Vote submission |

**Implementation details:**
- **Sliding window algorithm** (not fixed window) prevents burst attacks at window boundaries
- **Dual-mode:** Redis sorted sets for distributed deployments, in-memory Map for single-instance
- **Fail-open:** Redis unavailable -> request allowed with `X-RateLimit-Status: degraded` header
- **Standard headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
- **Memory cleanup:** `setInterval` every 60 seconds removes expired entries
- **Key generation:** Default `req.ip`, with `trust proxy: 1` set for Cloud Run

---

### 9. External APIs (Prompt 09)

**Status: PASS**

**External API dependencies identified:**
1. **Google reCAPTCHA v3** - Token verification, 5s timeout, fail-open with fallback rate limiting
2. **Google Cloud SQL** - PostgreSQL, connection via Cloud SQL proxy
3. **Redis (ioredis)** - Optional, for distributed rate limiting
4. **PostHog** - Frontend analytics (client-side only, `NEXT_PUBLIC_POSTHOG_KEY`)
5. **Anthropic Claude API** - Used by frontend (`ANTHROPIC_API_KEY` in frontend deployment)

**Security for each:**
- reCAPTCHA: Secret key in GCP Secret Manager, not exposed to client
- Cloud SQL: Connection string in GCP Secret Manager
- Redis: Connection via `REDIS_URL` env var
- PostHog: Public key only (no secret)
- Anthropic: API key in GCP Secret Manager

---

### 10. Confidence Scoring Integrity (Prompt 12)

**Status: PASS**

**Findings from `packages/backend/src/services/confidenceService.ts` (512 lines):**

**Manipulation resistance:**
- Score requires 3+ verifications for HIGH confidence (research-based: Mortensen et al. 2015, JAMIA)
- Agreement score penalizes conflicting data (0 points for <40% agreement)
- Specialty-specific freshness thresholds prevent gaming via stale data
- Sybil prevention prevents one actor from submitting multiple verifications

**4-factor scoring (0-100):**
1. Data source (0-25): CMS=25, Carrier=20, Crowdsource=15
2. Recency (0-30): Tiered decay based on specialty freshness threshold
3. Verification count (0-25): 0=0, 1=10, 2=15, 3+=25
4. Agreement (0-20): Based on upvote/downvote ratio

---

### 11. CAPTCHA Integration (Prompt 27)

**Status: PARTIAL PASS - Backend complete, frontend incomplete**

**Backend (`packages/backend/src/middleware/captcha.ts`, 241 lines):**
- [x] reCAPTCHA v3 verification with score threshold (0.5)
- [x] 5-second API timeout with AbortController
- [x] Fail-open mode with fallback rate limiting (3 req/hour)
- [x] Fail-closed mode available via `CAPTCHA_FAIL_MODE=closed`
- [x] Development/test bypass
- [x] Structured logging for all outcomes
- [x] Token from request body (`captchaToken`) or header (`x-captcha-token`)

**Frontend (`packages/frontend/src/components/ProviderVerificationForm.tsx`, 800 lines):**
- [ ] Does NOT send `captchaToken` in the POST body (line 107-115)
- [ ] Does NOT import or use `react-google-recaptcha-v3`
- [ ] Posts to `/api/verifications` instead of `/api/v1/verify`
- [x] Honeypot field `website` is defined in Zod schema but not in the form

**CRITICAL GAP:** The frontend verification form will fail in production because:
1. No CAPTCHA token is generated or sent
2. The API URL is wrong (`/api/verifications` vs `/api/v1/verify`)

---

### 12. Sybil Attack Prevention (Prompt 36)

**Status: PASS**

**4 layers verified:**

1. **Rate Limiting** - 10 verifications/hour, 10 votes/hour per IP (sliding window)
2. **Honeypot** - Hidden `website` field; bots that fill it get silent 200 response (`packages/backend/src/middleware/honeypot.ts`)
3. **CAPTCHA** - reCAPTCHA v3 score >= 0.5 required in production
4. **Vote Deduplication** - Unique constraint `[verificationId, sourceIp]` on VoteLog; Sybil check in `verificationService.ts` with 30-day window for same IP or email per provider-plan pair

**Additional protections:**
- Consensus threshold: 3 verifications + 60 confidence + 2:1 majority required to change status
- Verification TTL: 6-month expiration prevents stale data accumulation

---

### 13. Error Handling Security (Prompt 37)

**Status: PASS**

**Findings from `packages/backend/src/middleware/errorHandler.ts` (189 lines):**
- [x] `AppError` class with `isOperational` flag for expected vs unexpected errors
- [x] Zod validation errors return 400 with field-level messages
- [x] Prisma P2002 (duplicate) returns 409, P2025 (not found) returns 404
- [x] Payload too large returns 413
- [x] Default 500 error: Message hidden in production (`'Internal server error'`), shown in development
- [x] **No stack traces in production** - only `err.message` used in non-production
- [x] Request ID included in all error responses for correlation
- [x] All errors logged with structured context via pino

---

## Security Architecture Summary

```
EXTERNAL REQUEST
     |
     v
[1] CORS Whitelist (verifymyprovider.com, Cloud Run URLs)
     |
     v
[2] Helmet.js (CSP: default-src 'none', frame-ancestors 'none', HSTS)
     |
     v
[3] Body Size Limit (100kb)
     |
     v
[4] Rate Limiting (4 tiers: 200/100/10/10 per hour)
     |
     v
[5] Honeypot Check (silent 200 for bots)
     |
     v
[6] reCAPTCHA v3 (score >= 0.5, fail-open with fallback)
     |
     v
[7] Zod Input Validation (type-safe schemas on all inputs)
     |
     v
[8] Business Logic (Sybil check, consensus threshold)
     |
     v
[9] Prisma ORM (parameterized queries - SQL injection safe)
     |
     v
[10] PII Stripping (sourceIp, userAgent, submittedBy removed)
     |
     v
RESPONSE
```

---

## CI/CD Security

**GitHub Actions security measures verified:**
- [x] Gitleaks secret scanning on every push/PR (`.github/workflows/security-scan.yml`)
- [x] Workload Identity Federation for GCP auth (no long-lived service account keys)
- [x] Secrets stored in GitHub Secrets and GCP Secret Manager
- [x] Docker image tags include git SHA for traceability
- [x] Smoke test on `/health` after backend deploy
- [x] Minimal permissions (`contents: read`, `id-token: write`)
- [ ] No `npm audit` in CI pipeline
- [ ] No SAST/DAST tools in CI pipeline
- [ ] No dependency vulnerability scanning (Dependabot/Renovate)

---

## Questions Answered

### 1. When was the last full security review?
January 2026 - ZeroPath automated scan + manual code review. All 4 findings resolved.

### 2. Have there been any security incidents or near-misses?
No incidents reported. The ZeroPath scan was proactive, not reactive.

### 3. Should we engage an external penetration tester?
Recommended before public launch (Phase 3). For beta, the current layered defense is adequate. Focus areas: rate limiting bypass, CAPTCHA bypass, admin secret enumeration.

### 4. Are there any compliance requirements beyond what's documented?
No. The application handles only public NPI data. No HIPAA, GDPR (no EU users targeted), or PCI requirements apply.

### 5. Should we implement automated security scanning (SAST/DAST) in CI?
Yes. Recommended additions:
- `npm audit --audit-level=high` as a CI gate
- CodeQL or Semgrep for SAST
- Dependabot for dependency updates
- OWASP ZAP for DAST (after staging environment is active)

---

## Recommendations (Priority Order)

1. **HIGH:** Complete frontend CAPTCHA integration before beta launch
2. **HIGH:** Fix frontend API URL mismatch (`/api/verifications` -> `/api/v1/verify`)
3. **MEDIUM:** Add `npm audit` to CI pipeline
4. **MEDIUM:** Add Dependabot/Renovate for dependency updates
5. **MEDIUM:** Document admin secret rotation procedure
6. **LOW:** Add SAST tool (CodeQL/Semgrep) to CI
7. **LOW:** Consider CAPTCHA fail-closed for production launch
8. **LOW:** Add OWASP ZAP DAST scanning to staging environment
