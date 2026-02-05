# API Routes Security Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/06-api-routes.md
**Status:** Strong implementation. All active routes verified with rate limiters, CAPTCHA, validation, and proper middleware chain. Minor discrepancies between the root `/` endpoint listing and actual routes.

---

## Findings

### Route Inventory Verification

#### Provider Routes (`/api/v1/providers`) -- `routes/providers.ts`

| Endpoint | Status | Details |
|----------|--------|---------|
| GET `/search` | Verified | `searchRateLimiter` (100/hr), Zod `searchQuerySchema`, caching (5 min TTL), `X-Cache` header |
| GET `/cities` | Verified | `defaultRateLimiter` (200/hr), inline Zod schema (state: 2-char uppercase required) |
| GET `/:npi` | Verified | `defaultRateLimiter` (200/hr), `npiParamSchema` validation (10-digit regex) |

- Verified: `searchQuerySchema` merges with `paginationSchema` and includes `state`, `city`, `cities`, `zipCode`, `specialty`, `specialtyCategory`, `name`, `npi`, `entityType` -- matches prompt exactly.
- Verified: `transformProvider()` maps DB shape to API shape, pulls address from primary `practice_locations`, includes all enrichment data (CMS details, hospitals, insurance networks, Medicare IDs, taxonomies).
- Verified: Cache invalidation for search results happens asynchronously after verification submissions in `verify.ts`.

#### Plan Routes (`/api/v1/plans`) -- `routes/plans.ts`

| Endpoint | Status | Details |
|----------|--------|---------|
| GET `/search` | Verified | `searchRateLimiter` (100/hr), Zod `searchQuerySchema` |
| GET `/grouped` | Verified | `defaultRateLimiter` (200/hr), inline Zod schema |
| GET `/meta/issuers` | Verified | `defaultRateLimiter` (200/hr), `stateQuerySchema` |
| GET `/meta/types` | Verified | `defaultRateLimiter` (200/hr), `stateQuerySchema.extend()` with `issuerName` |
| GET `/:planId/providers` | Verified | `searchRateLimiter` (100/hr), `planIdParamSchema` + `paginationSchema` |
| GET `/:planId` | Verified | `defaultRateLimiter` (200/hr), `planIdParamSchema` |

- Verified: `/:planId/providers` is defined BEFORE `/:planId` (line 121 vs line 174) to avoid route conflicts -- matches prompt note.
- Verified: Search query parameters (`issuerName`, `planType`, `search`, `state`, `page`, `limit`) match prompt.

#### Verification Routes (`/api/v1/verify`) -- `routes/verify.ts`

| Endpoint | Status | Details |
|----------|--------|---------|
| POST `/` | Verified | `verificationRateLimiter` (10/hr), **`verifyCaptcha`**, Zod `submitVerificationSchema` |
| POST `/:verificationId/vote` | Verified | `voteRateLimiter` (10/hr), **`verifyCaptcha`**, Zod `voteSchema` + `verificationIdParamSchema` |
| GET `/stats` | Verified | `defaultRateLimiter` (200/hr), no Zod (no params needed) |
| GET `/recent` | Verified | `defaultRateLimiter` (200/hr), Zod `recentQuerySchema` |
| GET `/:npi/:planId` | Verified | `defaultRateLimiter` (200/hr), `pairParamsSchema` (npiParamSchema + planIdParamSchema) |

- Verified: CAPTCHA middleware (`verifyCaptcha`) is applied to both POST endpoints, placed after rate limiter but before the handler.
- Verified: `captchaToken` accepted via `req.body.captchaToken` or `req.headers['x-captcha-token']` (line 134 of captcha.ts).
- Verified: Skipped in development/test mode (line 121 of captcha.ts).
- Verified: Verification body fields match prompt: `npi`, `planId`, `acceptsInsurance`, `acceptsNewPatients` (optional), `notes` (max 1000), `evidenceUrl` (optional URL), `submittedBy` (optional email), `captchaToken`.
- Verified: Vote body fields match prompt: `vote` (enum "up"/"down"), `captchaToken`.
- Verified: Cache invalidation runs async after POST `/` (line 69 of verify.ts).

#### Admin Routes (`/api/v1/admin`) -- `routes/admin.ts`

| Endpoint | Status | Details |
|----------|--------|---------|
| POST `/cleanup-expired` | Verified | `adminAuthMiddleware`, supports `dryRun` and `batchSize` query params |
| GET `/expiration-stats` | Verified | `adminAuthMiddleware` |
| GET `/health` | Verified | `adminAuthMiddleware`, returns retention metrics |
| POST `/cache/clear` | Verified | `adminAuthMiddleware`, returns deleted count |
| GET `/cache/stats` | Verified | `adminAuthMiddleware`, includes calculated hit rate |
| POST `/cleanup/sync-logs` | Verified | `adminAuthMiddleware`, supports `dryRun` and `retentionDays` params |
| GET `/retention/stats` | Verified | `adminAuthMiddleware`, comprehensive retention stats |

- Verified: All 7 admin endpoints use `adminAuthMiddleware`.
- Verified: `adminAuthMiddleware` uses `timingSafeEqual` from `crypto` (line 2, 48 of admin.ts).
- Verified: Returns 503 if `ADMIN_SECRET` not configured (line 27), 401 if wrong (line 51).
- Verified: Length check before `timingSafeEqual` (line 46-47) is correct -- `timingSafeEqual` requires equal-length buffers.

#### Location Routes (`/api/v1/locations`) -- DISABLED

- Verified: `routes/locations.ts` file exists with 5 endpoints (`/search`, `/health-systems`, `/stats/:state`, `/:locationId`, `/:locationId/providers`).
- Verified: Import is commented out in `routes/index.ts` (line 6: `// import locationsRouter from './locations';`).
- Verified: Registration is commented out (line 14: `// router.use('/locations', locationsRouter);`).
- Verified: TODO comment present: "locations route depends on old Location model - needs rewrite for practice_locations".

#### Infrastructure Endpoints -- `index.ts`

| Endpoint | Status | Details |
|----------|--------|---------|
| GET `/health` | Verified | No rate limiter (defined at line 92, before `defaultRateLimiter` at line 138). Includes DB check, cache stats, memory, uptime. |
| GET `/` | Verified | After `defaultRateLimiter` (200/hr). Returns API info with endpoint directory. |

### Middleware Chain (Order) Verification

Checking `packages/backend/src/index.ts` line by line:

| Order | Middleware | Line | Status |
|-------|-----------|------|--------|
| 1 | `requestIdMiddleware` | 39 | Verified -- UUID generation via `crypto.randomUUID()` |
| 2 | `httpLogger` (pino-http) | 42 | Verified -- Skips `/health` via autoLogging.ignore |
| 3 | `helmet` | 46 | Verified -- Strict CSP for JSON API, all `'none'` directives |
| 4 | `cors` | 67 | Verified -- Whitelist: verifymyprovider.com, Cloud Run, localhost (dev only) |
| 5 | `express.json` | 88 | Verified -- 100kb limit |
| 6 | `/health` endpoint | 92 | Verified -- Before rate limiter |
| 7 | `defaultRateLimiter` | 138 | Verified -- 200 req/hr global |
| 8 | `requestLogger` | 141 | Verified -- Usage tracking without PII |
| 9 | `/api/v1/*` routes | 176 | Verified -- `app.use('/api/v1', routes)` |
| 10 | `notFoundHandler` | 179 | Verified -- 404 handler |
| 11 | `errorHandler` | 182 | Verified -- Global error handler |

All 11 middleware chain items match the prompt specification exactly.

### Security Status Checklist

| Item | Status | Details |
|------|--------|---------|
| Rate limiting on all endpoints | Verified | 4 tiers: search (100/hr), verify (10/hr), vote (10/hr), default (200/hr). Dual-mode: Redis (distributed) or in-memory (single-instance). Fail-open on Redis failure. |
| CAPTCHA on POST verify and vote | Verified | reCAPTCHA v3 with score threshold (0.5). Fail-open with fallback rate limiting (3/hr) or fail-closed (configurable). |
| Input validation (Zod) on all endpoints | Verified | All endpoints use Zod `.parse()`. GET `/verify/stats` has no params to validate -- acceptable. |
| Error handling (asyncHandler + AppError) | Verified | All async handlers wrapped with `asyncHandler`. `errorHandler` catches ZodError, AppError, PrismaClientKnownRequestError, PayloadTooLargeError. |
| Security headers (Helmet + CORS) | Verified | Strict CSP with all `'none'` directives. CORS whitelist. `crossOriginEmbedderPolicy`, `crossOriginOpenerPolicy`, `crossOriginResourcePolicy`, `referrerPolicy: no-referrer`. |
| Request ID correlation | Verified | `crypto.randomUUID()`. Respects incoming `X-Request-ID` header for cross-service tracing. |
| Body size limit | Verified | `express.json({ limit: '100kb' })` and `express.urlencoded({ limit: '100kb' })` at line 88-89. |
| Admin auth (timing-safe) | Verified | `timingSafeEqual` with length pre-check. 503 when unconfigured, 401 when invalid. |
| User authentication | Not implemented | All routes are public. Noted in prompt as expected. |
| CSRF | Not needed | Correctly noted: not needed until auth is added. |
| Locations route | Disabled | Pending practice_locations rewrite as noted. |

### Discrepancies Found

#### 1. Root `/` Endpoint Listing vs Actual Routes

| Listed in `/` response | Actual route | Status |
|------------------------|-------------|--------|
| `GET /api/v1/providers/:npi/plans` | Does not exist | Issue |
| `GET /api/v1/plans/meta/years` | Does not exist | Issue |
| `GET /api/v1/plans/grouped` | Not listed in `/` response | Missing from listing |
| `GET /api/v1/plans/:planId/providers` | Not listed in `/` response | Missing from listing |
| `GET /api/v1/providers/cities` | Not listed in `/` response | Missing from listing |

The root endpoint at `index.ts` lines 144-173 lists `GET /api/v1/providers/:npi/plans` and `GET /api/v1/plans/meta/years` which do not exist in the codebase. Conversely, three actual routes (`/plans/grouped`, `/:planId/providers`, `/providers/cities`) are omitted from the listing.

#### 2. Admin Endpoints Not Rate Limited Individually

Admin endpoints rely on `adminAuthMiddleware` but do not apply any route-level rate limiter (e.g., `defaultRateLimiter`). They do inherit the global `defaultRateLimiter` from `index.ts` line 138, but an attacker attempting to brute-force the `X-Admin-Secret` would only be subject to the global 200 req/hr limit.

#### 3. `batchSize` and `retentionDays` Not Zod-Validated in Admin Routes

In `admin.ts`, the `cleanup-expired` endpoint parses `batchSize` with `parseInt()` (line 73) and `cleanup/sync-logs` parses `retentionDays` with `parseInt()` (line 260). These are not validated through Zod and could accept non-numeric or negative values (though `parseInt` would return `NaN` and fall back to the default via `|| 1000` / `|| 90`).

---

## Summary

The API route implementation is comprehensive and well-secured. All 18 active endpoints (3 provider, 6 plan, 5 verify, 7 admin) plus 2 infrastructure endpoints are correctly registered with appropriate rate limiters, validation, and middleware. The CAPTCHA integration on write endpoints is properly implemented with configurable fail-open/fail-closed behavior. The middleware chain order is correct, with health checks bypassing rate limiting. The only notable issues are the stale endpoint listing in the root `/` response, the lack of Zod validation on admin query parameters, and the absence of admin-specific rate limiting for secret brute-force protection.

## Recommendations

1. **Update the root `/` endpoint listing** (`index.ts` lines 144-173) to match actual routes. Remove `providers/:npi/plans` and `plans/meta/years` references. Add `plans/grouped`, `plans/:planId/providers`, and `providers/cities`.

2. **Add a stricter rate limiter to admin routes** to protect against brute-force attacks on `X-Admin-Secret`. Consider a dedicated `adminRateLimiter` with something like 10 requests per hour per IP, independent of the global limiter.

3. **Apply Zod validation to admin query parameters** (`batchSize`, `retentionDays`, `dryRun`) for consistency with the rest of the codebase. Example: `z.coerce.number().int().min(1).max(10000).default(1000)` for batchSize.

4. **Consider IP allowlisting for admin endpoints** as an additional layer of defense, as suggested in the prompt's questions. This could be implemented as middleware that checks `req.ip` against a configured allowlist.

5. **Decide on the disabled locations route** -- either delete `routes/locations.ts` to reduce code surface area, or prioritize the `practice_locations` rewrite. The dead code could cause confusion for future contributors.

6. **Consider adding caching to plan search results** similar to provider search caching. Currently only provider search uses the 5-minute cache TTL pattern.
