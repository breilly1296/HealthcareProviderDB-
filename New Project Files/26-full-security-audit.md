# VerifyMyProvider Full Security Audit

**Generated:** 2026-02-18
**Audit Type:** Comprehensive codebase review
**Scope:** All backend source, frontend components, middleware, scripts, and configuration

---

## Executive Summary

VerifyMyProvider has a strong security posture for a pre-beta application. All critical and high-severity findings from the January 2026 ZeroPath scan have been resolved. The application implements defense-in-depth with 10 security layers on write endpoints. Two low-severity items and one informational item remain as accepted risks.

**Overall Grade: B+**

Key strengths: Comprehensive rate limiting, multi-layer bot prevention, PII-free logging, timing-safe admin auth, AES-256-GCM encryption for sensitive data, structured error handling that never leaks stack traces in production.

Key areas for improvement: CI/CD security automation, frontend CAPTCHA integration completion, email delivery configuration, and external penetration testing before public launch.

---

## Audit Checklist by Security Domain

### 1. Database Schema Security

**File:** `packages/backend/prisma/schema.prisma`
**Status:** PASS

| Check | Result | Notes |
|-------|--------|-------|
| Primary keys on all tables | PASS | All 20 models have explicit PKs |
| Foreign key constraints | PASS | Proper relations with `onDelete`/`onUpdate` policies |
| Unique constraints for dedup | PASS | Location address, vote dedup, saved provider, user email, session token |
| Indexes for query performance | PASS | 50+ indexes covering search, Sybil checks, TTL cleanup |
| Sybil prevention indexes | PASS | `idx_vl_sybil_ip` and `idx_vl_sybil_email` composite indexes |
| TTL indexes for cleanup | PASS | `idx_ppa_expires_at` and `idx_vl_expires_at` |
| PII field encryption | PASS | Insurance card fields (`subscriber_id_enc`, etc.) encrypted at application layer |
| No plaintext secrets in schema | PASS | No password fields; auth via magic link tokens |
| Row-Level Security (RLS) | N/A | Not needed -- all data access through application layer with auth middleware |

**Finding:** No issues. Schema is well-designed with appropriate constraints and indexes.

---

### 2. HIPAA Compliance Position

**Status:** PASS (Not Applicable)

| Check | Result | Notes |
|-------|--------|-------|
| PHI stored in database | NO | Only public NPI data, crowdsourced verifications |
| Patient health records | NO | Insurance card PII is user-provided, not PHI |
| HIPAA BAAs required | NO | No covered entity relationships |
| Audit trail for PHI access | N/A | No PHI to audit |

**Conclusion:** VerifyMyProvider correctly positions itself as handling only public provider data. The insurance card feature stores user-provided plan information (encrypted), not protected health information. No HIPAA compliance is required.

---

### 3. Authentication Security

**Files:** `packages/backend/src/middleware/auth.ts`, `packages/backend/src/routes/auth.ts`, `packages/backend/src/services/authService.ts`
**Status:** PASS

| Check | Result | Notes |
|-------|--------|-------|
| Password storage | N/A | Passwordless (magic link) -- no passwords stored |
| Magic link token security | PASS | CUID tokens, 15-minute expiry, single-use (`usedAt` marks as consumed) |
| JWT implementation | PASS | Uses `jose` library, HS256 signing, 15-minute access token lifetime |
| Refresh token rotation | PASS | New refresh token on each refresh; old token invalidated |
| Session management | PASS | 30-day sliding sessions, max 5 per user, oldest deleted on overflow |
| Cookie security | PASS | `httpOnly: true`, `secure: true` in production, `sameSite: 'lax'` |
| Token in cookie (not localStorage) | PASS | Access token in `vmp_access_token` cookie |
| Refresh token scoped path | PASS | Cookie path restricted to `/api/v1/auth` |
| Admin auth timing-safe | PASS | Uses `crypto.timingSafeEqual()` for `X-Admin-Secret` comparison |
| Email enumeration prevention | PASS | Magic link endpoint always returns success regardless of email validity |
| Rate limiting on auth | PASS | `magicLinkRateLimiter`: 5 requests per 15 minutes per IP |
| Session activity tracking | PASS | `lastUsedAt` updated with 5-minute debounce |
| Logout invalidates session | PASS | Session deleted from DB on logout |
| Logout-all functionality | PASS | Deletes all sessions for user |

**Finding:** Authentication system is well-implemented. The magic link approach eliminates password-related vulnerabilities entirely.

---

### 4. CSRF Protection

**File:** `packages/backend/src/middleware/csrf.ts`
**Status:** PASS

| Check | Result | Notes |
|-------|--------|-------|
| CSRF protection on state-changing routes | PASS | Applied to `/saved-providers` and `/me/insurance-card` |
| Double-submit cookie pattern | PASS | Uses `csrf-csrf` library with `vmp_csrf` cookie |
| GET/HEAD/OPTIONS excluded | PASS | `ignoredMethods: ['GET', 'HEAD', 'OPTIONS']` |
| Session-bound tokens | PASS | `getSessionIdentifier` uses session ID, falls back to IP |
| Token in header | PASS | Read from `X-CSRF-Token` header |
| Cookie domain scoped | PASS | `.verifymyprovider.com` in production |

**Note:** CSRF is not applied to verification/vote endpoints because they use reCAPTCHA + honeypot instead (no auth cookies needed for anonymous submissions). This is correct -- CSRF is only needed on cookie-authenticated endpoints.

---

### 5. Audit Logging

**File:** `packages/backend/src/middleware/requestLogger.ts`, `packages/backend/src/utils/logger.ts`
**Status:** PASS

| Check | Result | Notes |
|-------|--------|-------|
| PII excluded from application logs | PASS | `requestLogger.ts` explicitly documents "Excludes PII (no IP, user agent, or identifying information)" |
| Structured JSON logging | PASS | Pino logger with JSON output in production |
| Request ID correlation | PASS | UUID assigned to every request via `requestId` middleware |
| No stack traces in production | PASS | `errorHandler.ts` returns generic message in production mode |
| IPs stored in DB for anti-abuse | PASS | `sourceIp` in `verification_logs` and `vote_logs` for Sybil prevention |
| Log level configurable | PASS | `LOG_LEVEL` environment variable |

**Finding:** Good separation between application-level PII-free logs and database-level anti-abuse IP storage.

---

### 6. API Route Security

**Files:** `packages/backend/src/routes/*.ts`
**Status:** PASS

| Endpoint | Auth | Rate Limit | CAPTCHA | Honeypot | Validation | CSRF |
|----------|------|------------|---------|----------|------------|------|
| `GET /health` | None | None (pre-limiter) | No | No | No | No |
| `GET /api/v1/providers/search` | None | search (100/hr) | No | No | Zod | No |
| `GET /api/v1/providers/:npi` | None | default (200/hr) | No | No | Zod | No |
| `GET /api/v1/providers/map` | None | search (100/hr) | No | No | Zod | No |
| `GET /api/v1/plans/*` | None | default (200/hr) | No | No | Zod | No |
| `POST /api/v1/verify` | None | verify (10/hr) | Yes | Yes | Zod | No |
| `POST /api/v1/verify/:id/vote` | None | vote (10/hr) | Yes | Yes | Zod | No |
| `GET /api/v1/verify/*` | None | default (200/hr) | No | No | Zod | No |
| `POST /api/v1/auth/magic-link` | None | magic-link (5/15min) | No | No | Zod | Yes |
| `GET /api/v1/auth/verify` | None | None | No | No | Zod | No |
| `POST /api/v1/auth/refresh` | None | None | No | No | No | Yes |
| `POST /api/v1/auth/logout` | Required | None | No | No | No | Yes |
| `GET /api/v1/auth/me` | Required | None | No | No | No | No |
| `GET /api/v1/auth/export` | Required | None | No | No | No | No |
| `POST /api/v1/saved-providers` | Required | default (200/hr) | No | No | Zod | Yes |
| `DELETE /api/v1/saved-providers/:npi` | Required | default (200/hr) | No | No | Zod | Yes |
| `POST /api/v1/me/insurance-card/scan` | Required | scan (10/hr) | No | No | Zod | Yes |
| `POST /api/v1/admin/*` | Admin secret | default | No | No | Varies | No |

**Analysis:** Security is well-layered. Write endpoints either require authentication + CSRF or use CAPTCHA + honeypot + rate limiting for anonymous submissions. All input is validated with Zod schemas.

**Minor finding:** `POST /api/v1/auth/refresh` has CSRF protection but no rate limiting. An attacker with a stolen refresh token cookie could call this repeatedly. However, the token is `httpOnly` and path-scoped, so theft requires XSS or physical access.

---

### 7. Input Validation

**Files:** `packages/backend/src/schemas/commonSchemas.ts`, route-level Zod schemas
**Status:** PASS

| Check | Result | Notes |
|-------|--------|-------|
| All endpoints validated | PASS | Zod `parse()` used on all request bodies and query params |
| NPI format validated | PASS | `z.string().length(10).regex(/^\d+$/)` |
| Pagination bounded | PASS | `page >= 1`, `limit >= 1 && limit <= 100` |
| String length limits | PASS | All string fields have `.max()` limits |
| URL validation | PASS | Evidence URLs validated with `z.string().url()` |
| Body size limits | PASS | 100KB default, 16MB for insurance card scan |
| SQL injection prevention | PASS | Prisma parameterized queries (no raw SQL in API routes) |

---

### 8. Rate Limiting

**File:** `packages/backend/src/middleware/rateLimiter.ts`
**Status:** PASS

| Check | Result | Notes |
|-------|--------|-------|
| Sliding window algorithm | PASS | Prevents burst attacks at window boundaries |
| Dual-mode (Redis/in-memory) | PASS | Auto-selects based on `REDIS_URL` presence |
| Rate limit headers | PASS | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |
| Fail-open on Redis error | PASS | Logs warning, allows request with `X-RateLimit-Status: degraded` |
| Cleanup of expired entries | PASS | Periodic cleanup every 60 seconds for in-memory stores |
| Per-endpoint configuration | PASS | 5 pre-configured limiters (default, verification, vote, search, magic-link) |
| IP-based key generation | PASS | `req.ip` used as default key |
| Trust proxy configured | PASS | `app.set('trust proxy', 1)` for Cloud Run |

| Limiter | Window | Max Requests | Purpose |
|---------|--------|-------------|---------|
| default | 1 hour | 200 | General API routes |
| verification | 1 hour | 10 | Verification submissions |
| vote | 1 hour | 10 | Vote submissions |
| search | 1 hour | 100 | Provider search |
| magic-link | 15 min | 5 | Login requests |
| insurance-card-scan | 1 hour | 10 | AI card scanning |

---

### 9. CAPTCHA Integration

**Files:** `packages/backend/src/middleware/captcha.ts`, `packages/frontend/src/components/ReCaptchaProvider.tsx`
**Status:** PASS (backend) / PARTIAL (frontend)

| Check | Result | Notes |
|-------|--------|-------|
| reCAPTCHA v3 integration | PASS | Score-based (0.0-1.0), threshold 0.5 |
| Token validation with Google API | PASS | Server-side verification with timeout |
| Fail-open with fallback rate limiting | PASS | 3 requests/hour fallback when Google API unavailable |
| Fail-closed mode available | PASS | Configurable via `CAPTCHA_FAIL_MODE` env var |
| Development mode bypass | PASS | Skipped in development/test environments |
| Configurable score threshold | PASS | `CAPTCHA_MIN_SCORE` constant (default 0.5) |
| API timeout | PASS | 5-second timeout with AbortController |
| Frontend ReCaptchaProvider | PASS | Graceful degradation when site key not set |
| Frontend token generation | PARTIAL | `useCaptcha` hook exists; prompt checklist marks frontend token sending as incomplete |

**Recommendation:** Verify end-to-end CAPTCHA flow before beta launch. Confirm `useCaptcha().getToken()` is called before every verification/vote submission.

---

### 10. Sybil Attack Prevention

**Status:** PASS

| Layer | Implementation | Location |
|-------|---------------|----------|
| Rate Limiting | 10 verifications/hour per IP | `rateLimiter.ts` |
| Honeypot | Hidden form field traps bots (returns fake 200 OK) | `honeypot.ts` |
| CAPTCHA | reCAPTCHA v3 score check (>= 0.5) | `captcha.ts` |
| Vote Dedup | Unique constraint on (verificationId, sourceIp) | `vote_logs` table |
| Verification Dedup | 30-day window per IP and per email per provider-plan pair | `verificationService.ts` |
| Consensus Threshold | 3 verifications + 60 confidence + 2:1 majority required for status change | `verificationService.ts` |

**Analysis:** The 4-layer approach (plus consensus thresholds) provides strong protection against automated and manual manipulation. Even if an attacker bypasses CAPTCHA and rate limiting, the Sybil prevention window and consensus requirements prevent a single actor from changing provider acceptance status.

---

### 11. Environment & Secret Management

**Status:** PASS

| Check | Result | Notes |
|-------|--------|-------|
| Secrets in env vars (not hardcoded) | PASS | All secrets via `process.env.*` |
| GCP Secret Manager | PASS | Referenced in setup scripts and docs |
| No secrets in source code | PASS | Searched for `sk-ant`, `password.*=.*['"]` patterns -- none found |
| No console.log with sensitive data | PASS | Pino structured logger used; no raw console.log in production code |
| .env not committed | PASS | Standard .gitignore pattern |

**Secrets inventory:**
1. `DATABASE_URL` -- PostgreSQL connection string
2. `ADMIN_SECRET` -- Admin API authentication
3. `RECAPTCHA_SECRET_KEY` -- Google reCAPTCHA
4. `JWT_SECRET` -- JWT signing
5. `CSRF_SECRET` -- CSRF token generation
6. `INSURANCE_ENCRYPTION_KEY` -- AES-256-GCM encryption
7. `INSURANCE_ENCRYPTION_KEY_PREVIOUS` -- Key rotation fallback
8. `REDIS_URL` -- Redis connection
9. `ANTHROPIC_API_KEY` -- Claude AI for card extraction (in `@anthropic-ai/sdk`)

---

### 12. Confidence Scoring Integrity

**File:** `packages/backend/src/services/confidenceService.ts`
**Status:** PASS

| Check | Result | Notes |
|-------|--------|-------|
| Score bounded (0-100) | PASS | `Math.min(100, ...)` |
| Research-based thresholds | PASS | Based on Mortensen et al. (2015), Ndumele et al. (2018) |
| Specialty-specific freshness | PASS | Mental health 30 days, primary care 60, hospital-based 90 |
| Under-3 verifications capped | PASS | Forces MEDIUM or lower regardless of other factors |
| Time-based decay | PASS | Tiered recency scoring with 180-day cutoff |
| Score manipulation resistance | PASS | Requires 3 verifications + 60 confidence + 2:1 majority for status change |

---

### 13. Encryption

**File:** `packages/backend/src/lib/encryption.ts`
**Status:** PASS

| Check | Result | Notes |
|-------|--------|-------|
| Algorithm | PASS | AES-256-GCM (authenticated encryption) |
| Key length | PASS | 32 bytes (256 bits) enforced |
| IV randomness | PASS | `randomBytes(12)` per encryption |
| Auth tag | PASS | 16-byte GCM authentication tag |
| Key rotation support | PASS | Primary + previous key fallback on decrypt |
| Admin rotation endpoint | PASS | `/api/v1/admin/rotate-encryption-key` with batch processing |
| No crypto error details leaked | PASS | Throws generic "Decryption failed" on all failures |
| Null handling | PASS | `encrypt(null)` returns `null`; `decrypt(null)` returns `null` |

---

### 14. Error Handling

**File:** `packages/backend/src/middleware/errorHandler.ts`
**Status:** PASS

| Check | Result | Notes |
|-------|--------|-------|
| No stack traces in production | PASS | Generic "Internal server error" message when `NODE_ENV=production` |
| Structured error responses | PASS | Consistent `{ success, error: { message, code, statusCode, requestId } }` format |
| Zod errors handled | PASS | Returns field-level validation details |
| Prisma errors handled | PASS | P2002 (duplicate), P2025 (not found), P2003 (FK), P2024 (pool timeout), P2010 (query) |
| Async error catching | PASS | `asyncHandler` wrapper prevents unhandled rejections |
| 404 handler | PASS | Custom `notFoundHandler` with route info |
| Database unavailable | PASS | Returns 503 with `DATABASE_UNAVAILABLE` code |

---

### 15. HTTP Security Headers

**File:** `packages/backend/src/index.ts` (Helmet configuration)
**Status:** PASS

| Header | Value | Notes |
|--------|-------|-------|
| Content-Security-Policy | `default-src 'none'` | Strict CSP for JSON API |
| X-Content-Type-Options | `nosniff` | Helmet default |
| X-Frame-Options | `DENY` (via frameAncestors) | Cannot be embedded |
| X-XSS-Protection | Removed (modern best practice) | Helmet default |
| Referrer-Policy | `no-referrer` | No referrer leaked |
| Cross-Origin-Embedder-Policy | `require-corp` | Enabled |
| Cross-Origin-Opener-Policy | `same-origin` | Enabled |
| Cross-Origin-Resource-Policy | `same-origin` | Enabled |
| Strict-Transport-Security | Helmet default | HSTS enabled |

---

## New Findings (This Audit)

### Finding 1: Auth Refresh Endpoint Missing Rate Limiting

**Severity:** Low
**Location:** `packages/backend/src/routes/auth.ts`, `POST /api/v1/auth/refresh`

The refresh endpoint has CSRF protection but no rate limiting. While the refresh token cookie is `httpOnly` and path-scoped (mitigating theft), adding rate limiting would provide defense-in-depth.

**Recommendation:** Add `defaultRateLimiter` or a custom limiter to the refresh endpoint.

### Finding 2: Insurance Card Scan Uses AI-Generated Content Without Sanitization Review

**Severity:** Info
**Location:** `packages/backend/src/services/insuranceCardExtractor.ts`

The insurance card scan extracts structured data from images using the Claude AI API. The extracted data is stored in the database. While the data is typed via Zod schemas, there is no explicit sanitization of AI-generated text content before storage.

**Recommendation:** Review the extraction pipeline for potential injection vectors in AI-generated field values.

### Finding 3: Graceful Shutdown Does Not Close Redis

**Severity:** Info
**Location:** `packages/backend/src/index.ts`, shutdown handler

The shutdown handler disconnects from Prisma but does not call `closeRedisConnection()`. While Redis connections time out naturally, explicit cleanup is best practice.

**Recommendation:** Add `closeRedisConnection()` to the shutdown handler.

---

## Security Audit Summary

### Resolved Issues (All from Jan 2026 ZeroPath + Code Review)

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| VMP-2026-001 | Medium | Unauthenticated verification spam | Rate limiting + CAPTCHA + honeypot |
| VMP-2026-002 | Critical | Verification threshold bypass | Consensus requirements (3 verifications, 60 confidence, 2:1 majority) |
| VMP-2026-003 | Medium | PII in public responses | Public select constant + stripPII function |
| VMP-2026-004 | High | Legacy vulnerable endpoint | Removed entirely |

### Open Items

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| VMP-2026-005 | Low | CAPTCHA bypass when secret key missing | Accepted (startup warning recommended) |
| VMP-2026-006 | Low | In-memory rate limits not shared across instances | Mitigated (Redis in production) |
| VMP-2026-007 | Info | Health endpoint public | Accepted (standard practice) |
| NEW-001 | Low | Auth refresh missing rate limit | Open |
| NEW-002 | Info | AI extraction content sanitization | Open |
| NEW-003 | Info | Redis not closed on shutdown | Open |

---

## Recommendations

### Before Beta Launch (Critical)
1. Verify frontend CAPTCHA token integration end-to-end
2. Configure email delivery service for magic links
3. Add rate limiting to auth refresh endpoint

### Before Public Launch (High)
4. Commission external penetration test
5. Set up automated npm audit in CI pipeline
6. Add startup validation for required environment variables in production
7. Add Redis to graceful shutdown handler

### Ongoing (Medium)
8. Monthly `npm audit` runs
9. Review Cloud Run IAM permissions quarterly
10. Monitor CAPTCHA pass/fail rates for threshold tuning
11. Review and rotate `ADMIN_SECRET` and `JWT_SECRET` annually
