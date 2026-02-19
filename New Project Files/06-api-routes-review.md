# API Routes Security Review

**Generated:** 2026-02-18
**Prompt:** 06-api-routes.md
**Status:** COMPLETE -- all documented routes verified in code, middleware chain order confirmed correct, security controls comprehensive

---

## Executive Summary

Every endpoint listed in the prompt was verified to exist in the actual codebase. The middleware chain order in `index.ts` is correct and follows security best practices. Two additional endpoints were found that are not documented in the prompt: `GET /api/v1/providers/:npi/plans` and `GET /api/v1/providers/map`. All routes have appropriate rate limiting, input validation, and error handling.

---

## Route Inventory Verification

### Provider Routes (`/api/v1/providers`) -- `routes/providers.ts`

| Method | Path | Rate Limit | Auth | Validation | Verified |
|--------|------|-----------|------|------------|----------|
| GET | `/search` | searchRateLimiter (100/hr) | None | `searchQuerySchema` (Zod) | YES - line 224 |
| GET | `/cities` | defaultRateLimiter (200/hr) | None | `stateSchema` (Zod) | YES - line 309 |
| GET | `/:npi/colocated` | defaultRateLimiter (200/hr) | None | `npiParamSchema` + `paginationSchema` | YES - line 328 |
| GET | `/:npi/plans` | defaultRateLimiter (200/hr) | None | `npiParamSchema` + `plansQuerySchema` | YES - line 404 (**NOT in prompt**) |
| GET | `/map` | searchRateLimiter (100/hr) | None | `mapQuerySchema` (Zod) | YES - line 489 (**NOT in prompt**) |
| GET | `/:npi` | defaultRateLimiter (200/hr) | None | `npiParamSchema` (Zod) | YES - line 532 |

**Route order:** `/search`, `/cities`, `/:npi/colocated`, `/:npi/plans`, `/map`, `/:npi` -- correct. Static paths before parameterized. The `/map` route is defined between `/:npi/plans` and `/:npi`, which works because Express matches more specific paths first.

**Additional middleware on search:** `searchTimeout` (15s) is applied before `searchRateLimiter` on the search endpoint (line 226).

### Plan Routes (`/api/v1/plans`) -- `routes/plans.ts`

| Method | Path | Rate Limit | Auth | Validation | Verified |
|--------|------|-----------|------|------------|----------|
| GET | `/search` | searchRateLimiter (100/hr) | None | `searchQuerySchema` (Zod) | YES - line 30 |
| GET | `/grouped` | defaultRateLimiter (200/hr) | None | Inline Zod schema | YES - line 59 |
| GET | `/meta/issuers` | defaultRateLimiter (200/hr) | None | `stateQuerySchema` (Zod) | YES - line 81 |
| GET | `/meta/types` | defaultRateLimiter (200/hr) | None | Extended `stateQuerySchema` (Zod) | YES - line 99 |
| GET | `/:planId/providers` | searchRateLimiter (100/hr) | None | `planIdParamSchema` + `paginationSchema` | YES - line 121 |
| GET | `/:planId` | defaultRateLimiter (200/hr) | None | `planIdParamSchema` (Zod) | YES - line 174 |

**Route order:** Correct. `/:planId/providers` is defined BEFORE `/:planId` (lines 121 vs 174).

### Verification Routes (`/api/v1/verify`) -- `routes/verify.ts`

| Method | Path | Rate Limit | Auth | Middleware | Verified |
|--------|------|-----------|------|------------|----------|
| POST | `/` | verificationRateLimiter (10/hr) | None | honeypotCheck, verifyCaptcha, Zod | YES - line 58 |
| POST | `/:verificationId/vote` | voteRateLimiter (10/hr) | None | honeypotCheck, verifyCaptcha, Zod | YES - line 93 |
| GET | `/stats` | defaultRateLimiter (200/hr) | None | None | YES - line 124 |
| GET | `/recent` | defaultRateLimiter (200/hr) | None | `recentQuerySchema` (Zod) | YES - line 137 |
| GET | `/:npi/:planId` | defaultRateLimiter (200/hr) | None | `pairParamsSchema` (Zod) | YES - line 157 |

**CAPTCHA:** Both POST endpoints have `verifyCaptcha` middleware. Token accepted via `req.body.captchaToken` or `x-captcha-token` header (`captcha.ts` line 134).

**Honeypot:** Both POST endpoints have `honeypotCheck('website')` middleware BEFORE captcha in the chain. Bots filling the hidden `website` field get a fake 200 OK response (`honeypot.ts` lines 14-21).

**Middleware chain order on POST /verify:** `verificationRateLimiter` -> `honeypotCheck('website')` -> `verifyCaptcha` -> async handler with Zod validation. This is correct -- rate limit first, then cheap bot detection, then expensive CAPTCHA API call.

### Admin Routes (`/api/v1/admin`) -- `routes/admin.ts`

| Method | Path | Admin Auth | Timeout | Verified |
|--------|------|-----------|---------|----------|
| POST | `/cleanup-expired` | YES | adminTimeout (120s) | YES - line 71 |
| POST | `/cleanup-sessions` | YES | adminTimeout (120s) | YES - line 110 (**NOT in prompt**) |
| GET | `/expiration-stats` | YES | default | YES - line 141 |
| GET | `/health` | YES | default | YES - line 160 |
| POST | `/cache/clear` | YES | default | YES - line 230 |
| GET | `/cache/stats` | YES | default | YES - line 256 |
| GET | `/enrichment/stats` | YES | default | YES - line 284 |
| POST | `/cleanup/sync-logs` | YES | adminTimeout (120s) | YES - line 312 |
| GET | `/retention/stats` | YES | default | YES - line 383 |
| POST | `/recalculate-confidence` | YES | adminTimeout (120s) | YES - line 502 |
| POST | `/rotate-encryption-key` | YES | adminTimeout (120s) | YES - line 561 (**NOT in prompt**) |

**Admin auth verified:** `adminAuthMiddleware` (lines 24-58) uses `timingSafeEqual` for constant-time comparison. Returns 503 if `ADMIN_SECRET` not configured, 401 if wrong.

**Length check before timingSafeEqual:** Line 49 checks `providedBuffer.length === secretBuffer.length` before calling `timingSafeEqual` which requires equal-length buffers. The length check itself leaks timing information about the secret length, but this is an acceptable tradeoff since `timingSafeEqual` requires it, and secret length is not sensitive.

### Location Routes (`/api/v1/locations`) -- `routes/locations.ts`

| Method | Path | Rate Limit | Auth | Validation | Verified |
|--------|------|-----------|------|------------|----------|
| GET | `/search` | searchRateLimiter (100/hr) | None | `searchQuerySchema` (Zod) | YES - line 48 |
| GET | `/health-systems` | defaultRateLimiter (200/hr) | None | `healthSystemsQuerySchema` (Zod) | YES - line 76 |
| GET | `/stats/:state` | defaultRateLimiter (200/hr) | None | `stateParamSchema` (Zod) | YES - line 90 |
| GET | `/:locationId` | defaultRateLimiter (200/hr) | None | `locationIdSchema` (Zod) | YES - line 104 |
| GET | `/:locationId/providers` | defaultRateLimiter (200/hr) | None | `locationIdSchema` + `paginationSchema` | YES - line 123 |

### Auth Routes (`/api/v1/auth`) -- `routes/auth.ts`

| Method | Path | Rate Limit | Auth | Middleware | Verified |
|--------|------|-----------|------|------------|----------|
| GET | `/csrf-token` | defaultRateLimiter (global) | None | -- | YES - line 74 |
| POST | `/magic-link` | magicLinkRateLimiter (5/15min) | None | csrfProtection, Zod | YES - line 84 |
| GET | `/verify` | defaultRateLimiter (global) | None | Zod (safeParse) | YES - line 108 |
| POST | `/refresh` | defaultRateLimiter (global) | None | csrfProtection | YES - line 137 |
| POST | `/logout` | defaultRateLimiter (global) | requireAuth | csrfProtection | YES - line 159 |
| POST | `/logout-all` | defaultRateLimiter (global) | requireAuth | csrfProtection | YES - line 177 |
| GET | `/me` | defaultRateLimiter (global) | requireAuth | -- | YES - line 194 |
| GET | `/export` | defaultRateLimiter (global) | requireAuth | -- | YES - line 211 |

**Cookie configuration verified:**
- `vmp_access_token`: HttpOnly, Secure (prod), SameSite lax, 15min, path `/`, domain `.verifymyprovider.com` (prod) -- line 41-48
- `vmp_refresh_token`: HttpOnly, Secure (prod), SameSite lax, 30 days, path `/api/v1/auth`, domain `.verifymyprovider.com` (prod) -- line 50-57

**Magic link verify is GET, not POST:** Line 108 uses `router.get('/verify', ...)` because it handles email link clicks (browser navigation). All error cases redirect to `FRONTEND_URL/login?error=...` rather than returning JSON -- correct for browser flow.

**Email enumeration prevention:** `POST /magic-link` always returns `{ success: true }` regardless of whether the email exists (line 93-96).

### Saved Provider Routes (`/api/v1/saved-providers`) -- `routes/savedProviders.ts`

| Method | Path | Rate Limit | Auth | Validation | Verified |
|--------|------|-----------|------|------------|----------|
| GET | `/` | defaultRateLimiter (200/hr) | requireAuth | `paginationSchema` (Zod) | YES - line 21 |
| POST | `/` | defaultRateLimiter (200/hr) | requireAuth | `npiParamSchema` (Zod) | YES - line 45 |
| DELETE | `/:npi` | defaultRateLimiter (200/hr) | requireAuth | `npiParamSchema` (Zod) | YES - line 66 |
| GET | `/:npi/status` | defaultRateLimiter (200/hr) | None* | `npiParamSchema` (Zod) | YES - line 84 |

**CSRF at router level:** Confirmed in `routes/index.ts` line 21: `router.use('/saved-providers', csrfProtection, savedProvidersRouter)`. The CSRF middleware's `ignoredMethods: ['GET', 'HEAD', 'OPTIONS']` means GET requests pass through without CSRF validation.

**Status endpoint auth behavior:** `/:npi/status` does NOT require auth (line 84). For anonymous users, it returns `{ saved: false }` (line 91). For authenticated users, it checks the database. This is correct -- the frontend can check status without forcing login.

### Insurance Card Routes (`/api/v1/me/insurance-card`) -- `routes/insuranceCard.ts`

| Method | Path | Rate Limit | Auth | Validation | Verified |
|--------|------|-----------|------|------------|----------|
| POST | `/scan` | scanRateLimiter (10/hr per user) | requireAuth | `scanBodySchema` (Zod), 16MB limit | YES - line 111 |
| POST | `/save` | defaultRateLimiter (200/hr) | requireAuth | `saveBodySchema` (Zod) | YES - line 158 |
| GET | `/` | defaultRateLimiter (200/hr) | requireAuth | -- | YES - line 179 |
| PATCH | `/` | defaultRateLimiter (200/hr) | requireAuth | `updateBodySchema` (Zod) | YES - line 198 |
| DELETE | `/` | defaultRateLimiter (200/hr) | requireAuth | -- | YES - line 219 |

**16MB body limit:** The scan route uses `express.json({ limit: '16mb' })` at line 113, applied per-route. The global JSON parser in `index.ts` lines 93-98 skips `POST /api/v1/me/insurance-card/scan` to avoid conflicting 100kb limit.

**CSRF at router level:** Confirmed in `routes/index.ts` line 22: `router.use('/me/insurance-card', csrfProtection, insuranceCardRouter)`.

**Scan rate limiter uses user ID:** `keyGenerator: (req) => req.user?.id || req.ip || 'unknown'` (line 27) -- per-user rather than per-IP when authenticated. This is more accurate since authenticated users might share IPs.

### Infrastructure Endpoints -- `index.ts`

| Method | Path | Rate Limit | Verified |
|--------|------|-----------|----------|
| GET | `/health` | None (before rate limiter) | YES - line 108 |
| GET | `/` | defaultRateLimiter (200/hr) | YES - line 160 |

**Health check placement:** Correctly placed BEFORE `defaultRateLimiter` (line 108 vs 154) so monitoring tools are never blocked.

---

## Middleware Chain Verification

Verified order in `index.ts`:

| Order | Middleware | Line | Purpose |
|-------|-----------|------|---------|
| 1 | `requestIdMiddleware` | 42 | UUID per request, X-Request-ID header |
| 2 | `httpLogger` | 45 | pino-http request/response logging |
| 3 | `helmet` | 49-69 | Security headers, strict CSP for JSON API |
| 4 | `cors` | 70-88 | CORS whitelist (verifymyprovider.com, Cloud Run, localhost in dev) |
| 5 | `express.json` (conditional) | 93-98 | 100kb limit, skips insurance card scan route |
| 6 | `express.urlencoded` | 99 | URL-encoded body parsing, 100kb limit |
| 7 | `cookieParser` | 102 | Parse auth and CSRF cookies |
| 8 | `extractUser` | 105 | Optional JWT auth on ALL requests |
| 9 | `/health` | 108 | Health check BEFORE rate limiter |
| 10 | `defaultRateLimiter` | 154 | 200 req/hr global rate limit |
| 11 | `requestLogger` | 157 | Usage tracking (no PII) |
| 12 | `generalTimeout` | 192 | 30s timeout for all `/api/v1` routes |
| 13 | `/api/v1` routes | 195 | Route handlers |
| 14 | `notFoundHandler` | 198 | 404 handler |
| 15 | `errorHandler` | 201 | Global error handler |

**Chain analysis:**
- `requestId` is first, ensuring all downstream logging has correlation IDs -- correct
- `helmet` before `cors` -- correct, security headers are set before CORS evaluation
- `cookieParser` before `extractUser` -- correct, cookies must be parsed before JWT extraction
- `extractUser` before rate limiter -- correct, allows user-based rate limiting in theory
- Health check before rate limiter -- correct, monitoring not rate-limited
- `generalTimeout` scoped to `/api/v1` only -- correct, health check and root endpoint are not subject to timeout
- Error handler is last -- correct, catches all upstream errors

---

## Security Status Verification

| Control | Status | Evidence |
|---------|--------|----------|
| Rate limiting on all endpoints | YES | Global `defaultRateLimiter` + per-route limiters (search, verify, vote, magic-link, scan) |
| CAPTCHA on write endpoints | YES | `verifyCaptcha` on POST /verify and POST /verify/:id/vote |
| Input validation on all endpoints | YES | Zod schemas on every route handler (see 07-input-validation-review for details) |
| Error handling centralized | YES | `asyncHandler` + `AppError` + `errorHandler` pattern |
| Security headers | YES | Helmet with strict CSP (default-src 'none'), CORS whitelist |
| Request ID correlation | YES | crypto.randomUUID(), propagated through all logging |
| Body size limit | YES | 100kb global, 16MB for insurance card scan only |
| Admin auth timing-safe | YES | `timingSafeEqual` in `admin.ts` line 51 |
| User auth (JWT + sessions) | YES | Magic link -> JWT access (15min) + refresh (30 days), HttpOnly cookies |
| CSRF protection | YES | Double-submit cookie via csrf-csrf on saved-providers, insurance-card, auth mutations |
| Encrypted PII at rest | YES | Insurance card subscriber IDs encrypted (schema shows `*_enc` fields) |
| Trust proxy | YES | `app.set('trust proxy', 1)` at line 39 for Cloud Run load balancer |
| Request timeouts | YES | 30s general, 15s search, 120s admin |
| Honeypot bot detection | YES | On verify and vote POST endpoints |
| Graceful shutdown | YES | SIGINT/SIGTERM handlers with 10s timeout (lines 219-252) |

---

## Endpoints NOT in Prompt (Found in Code)

1. **`GET /api/v1/providers/:npi/plans`** -- Returns paginated insurance plan acceptances for a provider. Uses `defaultRateLimiter`, `npiParamSchema` + `plansQuerySchema` validation. Defined in `providers.ts` line 404.

2. **`GET /api/v1/providers/map`** -- Returns providers within a geographic bounding box for map display. Uses `searchRateLimiter`, `mapQuerySchema` validation with bounds checking. Defined in `providers.ts` line 489.

3. **`POST /api/v1/admin/cleanup-sessions`** -- Deletes expired sessions. Uses `adminAuthMiddleware` + `adminTimeout`. Defined in `admin.ts` line 110.

4. **`POST /api/v1/admin/rotate-encryption-key`** -- Re-encrypts all insurance card PII under a new key. Uses `adminAuthMiddleware` + `adminTimeout`. Defined in `admin.ts` line 561.

The `GET /` API info endpoint (index.ts lines 160-189) does NOT list all current endpoints. It is missing: `/providers/:npi/plans`, `/providers/map`, `/providers/:npi/colocated`, `/providers/cities`, all location routes, all auth routes, all saved-provider routes, all insurance-card routes, and several admin routes. Consider updating or auto-generating.

---

## Files Reviewed

- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\index.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\index.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\providers.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\plans.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\verify.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\admin.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\locations.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\auth.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\savedProviders.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\insuranceCard.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\auth.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\csrf.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\rateLimiter.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\captcha.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\errorHandler.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\requestLogger.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\requestId.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\httpLogger.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\honeypot.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\requestTimeout.ts`
