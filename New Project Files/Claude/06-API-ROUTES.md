# API Routes Security Review

**Last Updated:** 2026-02-06
**Total Routes:** 26 (3 provider + 6 plan + 5 verify + 9 admin + 5 location + 2 infrastructure)
**Authentication:** None for public endpoints; X-Admin-Secret for admin endpoints
**Input Validation:** Zod schemas on all endpoints

---

## Complete Route Inventory (Verified Against Code)

### Provider Routes (`/api/v1/providers`)
**File:** `packages/backend/src/routes/providers.ts`

| Method | Path | Rate Limit | Auth | Middleware | Description |
|--------|------|-----------|------|------------|-------------|
| GET | `/search` | searchRateLimiter (100/hr) | None | Zod validation (`searchQuerySchema`), caching (5 min TTL) | Search providers with filters |
| GET | `/cities` | defaultRateLimiter (200/hr) | None | Zod validation (`stateSchema`) | Get unique cities for a state |
| GET | `/:npi` | defaultRateLimiter (200/hr) | None | NPI param validation (`npiParamSchema`) | Get provider by NPI with full enrichment |

**Search query parameters (validated by Zod, `providers.ts` lines 20-30):**
- `state` -- 2 chars, uppercased
- `city` -- 1-100 chars
- `cities` -- 1-500 chars, comma-separated
- `zipCode` -- 3-10 chars
- `specialty` -- 1-200 chars
- `specialtyCategory` -- 1-100 chars
- `name` -- 1-200 chars (fuzzy search with medical title stripping)
- `npi` -- exactly 10 digits
- `entityType` -- enum: INDIVIDUAL or ORGANIZATION
- `page`, `limit` -- pagination

**Caching:** Search results cached for 5 minutes via `generateSearchCacheKey()` (`providers.ts` lines 211-223). Cache returns include `X-Cache: HIT/MISS` header (lines 235, 245). Only results with providers are cached (line 268).

**Response transform:** `transformProvider()` function (lines 45-196) maps DB shape to API shape including all enrichment data (CMS details, hospitals, insurance networks, Medicare IDs, taxonomies, locations, plan acceptances).

### Plan Routes (`/api/v1/plans`)
**File:** `packages/backend/src/routes/plans.ts`

| Method | Path | Rate Limit | Auth | Middleware | Description |
|--------|------|-----------|------|------------|-------------|
| GET | `/search` | searchRateLimiter (100/hr) | None | Zod validation | Search insurance plans |
| GET | `/grouped` | defaultRateLimiter (200/hr) | None | Zod validation | Plans grouped by carrier |
| GET | `/meta/issuers` | defaultRateLimiter (200/hr) | None | Zod validation | Unique issuers |
| GET | `/meta/types` | defaultRateLimiter (200/hr) | None | Zod validation | Available plan types |
| GET | `/:planId/providers` | searchRateLimiter (100/hr) | None | Zod validation | Providers accepting a plan |
| GET | `/:planId` | defaultRateLimiter (200/hr) | None | planId validation | Plan details |

**Route order:** `/:planId/providers` defined BEFORE `/:planId` (lines 121-168 vs 174-196) to prevent route conflict. Verified correct.

**Search query parameters (validated by Zod, `plans.ts` lines 19-24):**
- `issuerName` -- 1-200 chars
- `planType` -- 1-20 chars
- `search` -- 1-200 chars (cross-field search)
- `state` -- 2 chars, uppercased
- `page`, `limit` -- pagination

### Verification Routes (`/api/v1/verify`)
**File:** `packages/backend/src/routes/verify.ts`

| Method | Path | Rate Limit | Auth | Middleware | Description |
|--------|------|-----------|------|------------|-------------|
| POST | `/` | verificationRateLimiter (10/hr) | None | **honeypotCheck**, **verifyCaptcha**, Zod validation | Submit verification |
| POST | `/:verificationId/vote` | voteRateLimiter (10/hr) | None | **honeypotCheck**, **verifyCaptcha**, Zod validation | Vote on verification |
| GET | `/stats` | defaultRateLimiter (200/hr) | None | None | Verification statistics |
| GET | `/recent` | defaultRateLimiter (200/hr) | None | Zod validation | Recent verifications |
| GET | `/:npi/:planId` | defaultRateLimiter (200/hr) | None | NPI + planId validation | Provider-plan verifications |

**CAPTCHA protection (verified):** Both POST endpoints use `verifyCaptcha` middleware (`captcha.ts`):
- reCAPTCHA v3 token required via `captchaToken` body field or `x-captcha-token` header
- Minimum score: 0.5 (`constants.ts` line 52)
- Skipped in development/test mode (`captcha.ts` line 121)
- Configurable fail-open/fail-closed mode via `CAPTCHA_FAIL_MODE` env var
- Fail-open includes fallback rate limiting (3/hour)

**Honeypot protection (verified):** Both POST endpoints use `honeypotCheck('website')`:
- Hidden `website` field in request body
- Bots that fill it get a fake 200 OK response (`honeypot.ts` lines 14-21)
- Real users never see or fill this field

**Verification body (validated by Zod, `verify.ts` lines 23-32):**
- `npi` -- 10 digits (required)
- `planId` -- min 1 char (required)
- `acceptsInsurance` -- boolean (required)
- `acceptsNewPatients` -- boolean (optional)
- `locationId` -- positive integer (optional)
- `notes` -- max 1000 chars (optional)
- `evidenceUrl` -- valid URL, max 500 chars (optional)
- `submittedBy` -- valid email, max 200 chars (optional)
- `captchaToken` -- string (optional in schema, enforced by middleware)
- `website` -- string (honeypot, should be empty)

**Vote body (validated by Zod, `verify.ts` lines 34-38):**
- `vote` -- enum: "up" or "down" (required)
- `captchaToken` -- string (optional in schema, enforced by middleware)
- `website` -- string (honeypot)

**Cache invalidation:** POST `/` asynchronously invalidates search cache (`verify.ts` lines 73-76).

### Admin Routes (`/api/v1/admin`)
**File:** `packages/backend/src/routes/admin.ts`

**All endpoints require `X-Admin-Secret` header** (timing-safe comparison via `adminAuthMiddleware`).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cleanup-expired` | Delete expired verifications. Query: `dryRun`, `batchSize` |
| GET | `/expiration-stats` | Verification expiration statistics |
| GET | `/health` | Admin health check with retention metrics |
| POST | `/cache/clear` | Clear all cached data |
| GET | `/cache/stats` | Cache statistics with hit rate |
| GET | `/enrichment/stats` | Location enrichment statistics |
| POST | `/cleanup/sync-logs` | Clean up old sync_logs. Query: `dryRun`, `retentionDays` |
| GET | `/retention/stats` | Comprehensive retention stats |
| POST | `/recalculate-confidence` | Recalculate confidence scores with decay. Query: `dryRun`, `limit` |

**Admin auth behavior (verified in `admin.ts` lines 21-55):**
- 503 if `ADMIN_SECRET` env var not configured (graceful disable)
- 401 if secret is wrong (timing-safe comparison)
- Uses `crypto.timingSafeEqual` to prevent timing-based secret extraction
- Length check before comparison (required by `timingSafeEqual`)

### Location Routes (`/api/v1/locations`)
**File:** `packages/backend/src/routes/locations.ts`

| Method | Path | Rate Limit | Auth | Description |
|--------|------|-----------|------|-------------|
| GET | `/search` | searchRateLimiter (100/hr) | None | Search practice locations (state required) |
| GET | `/health-systems` | defaultRateLimiter (200/hr) | None | Distinct health system names |
| GET | `/stats/:state` | defaultRateLimiter (200/hr) | None | Location statistics by state |
| GET | `/:locationId` | defaultRateLimiter (200/hr) | None | Location details |
| GET | `/:locationId/providers` | defaultRateLimiter (200/hr) | None | Providers at a location |

**Status:** Active and registered in `routes/index.ts` line 13.

### Infrastructure Endpoints
**File:** `packages/backend/src/index.ts`

| Method | Path | Rate Limit | Description |
|--------|------|-----------|-------------|
| GET | `/health` | **None** (before rate limiter, line 92) | Health check with DB status, cache stats, memory, uptime |
| GET | `/` | defaultRateLimiter (200/hr) | API info with endpoint directory |

---

## Middleware Chain (Verified Order)

**File:** `packages/backend/src/index.ts`

```
1. requestIdMiddleware       (line 39)  -- UUID per request, X-Request-ID header
2. httpLogger                (line 42)  -- Pino HTTP logging (excludes /health)
3. helmet                    (line 46)  -- Security headers (strict CSP for JSON API)
4. cors                      (line 67)  -- Origin whitelist (verifymyprovider.com, Cloud Run, localhost)
5. express.json              (line 88)  -- Body parsing, 100kb limit
6. express.urlencoded        (line 89)  -- URL-encoded parsing, 100kb limit
7. /health endpoint          (line 92)  -- Health check BEFORE rate limiter
8. defaultRateLimiter        (line 138) -- 200 req/hr global rate limit
9. requestLogger             (line 141) -- Usage tracking (no PII)
10. / endpoint               (line 144) -- API info page
11. /api/v1/* routes          (line 176) -- Route handlers with per-route middleware
12. notFoundHandler           (line 179) -- 404 handler
13. errorHandler              (line 182) -- Global error handler
```

**Per-route middleware (applied within route handlers):**
- `searchRateLimiter` (100/hr) -- applied on search endpoints
- `verificationRateLimiter` (10/hr) -- applied on POST /verify
- `voteRateLimiter` (10/hr) -- applied on POST /vote
- `honeypotCheck('website')` -- applied on POST /verify and POST /vote
- `verifyCaptcha` -- applied on POST /verify and POST /vote
- `adminAuthMiddleware` -- applied on all /admin/* endpoints

---

## Security Status (Verified)

- [x] **Rate limiting** -- All endpoints rate-limited. 4 tiers: default (200/hr), search (100/hr), verify (10/hr), vote (10/hr). Dual-mode: Redis (distributed) or in-memory (single instance). Sliding window algorithm prevents burst attacks. (`rateLimiter.ts`)
- [x] **CAPTCHA** -- reCAPTCHA v3 on POST verify and vote. Configurable fail mode (open/closed). Fallback rate limiting (3/hr) when Google API unavailable. (`captcha.ts`)
- [x] **Honeypot** -- Bot detection on POST verify and vote. Silent fake 200 response to fool bots. (`honeypot.ts`)
- [x] **Input validation** -- Zod schemas on all endpoints. Type coercion, length limits, format validation (email, URL, NPI). (`verify.ts`, `providers.ts`, `plans.ts`, `locations.ts`)
- [x] **Error handling** -- Centralized via `asyncHandler` + `AppError`. Handles Zod, Prisma, payload too large errors. Production hides internal error details. (`errorHandler.ts`)
- [x] **Security headers** -- Helmet with strict CSP (`defaultSrc: 'none'`, `scriptSrc: 'none'`, etc.). CORS whitelist. `crossOriginEmbedderPolicy`, `crossOriginOpenerPolicy`, `crossOriginResourcePolicy`, `referrerPolicy: 'no-referrer'`. (`index.ts` lines 46-66)
- [x] **Request ID correlation** -- UUID per request via `crypto.randomUUID()`. Honors incoming `X-Request-ID` header. (`requestId.ts`)
- [x] **Body size limit** -- 100kb max for JSON and URL-encoded bodies. (`index.ts` lines 88-89)
- [x] **Admin auth** -- Timing-safe secret comparison. Graceful disable when unconfigured. (`admin.ts` lines 21-55)
- [x] **Sybil prevention** -- 30-day duplicate check per IP and email per provider-plan. (`verificationService.ts` lines 72-115)
- [x] **PII stripping** -- `stripVerificationPII()` removes IP, user agent, email from API responses. (`verificationService.ts` lines 307-310)
- [x] **Trust proxy** -- Set to 1 for Cloud Run (correct client IP). (`index.ts` line 36)
- [ ] **User authentication** -- Not implemented (all public routes)
- [ ] **CSRF** -- Not needed until auth adds cookies
- [x] **Locations route** -- Active and registered (`routes/index.ts` line 13)

---

## Potential Security Concerns

### 1. CORS allows null origin
`index.ts` lines 69-71: Requests with no `origin` header are allowed (`callback(null, true)`). This is intentional for mobile apps, curl, and Postman, but means the CORS whitelist can be bypassed by any non-browser client.

### 2. `/` endpoint listing may drift from actual routes
The API info at `GET /` (`index.ts` lines 144-173) hardcodes endpoint paths. It lists `GET /api/v1/providers/:npi/plans` which does not appear to exist as a route. It also omits the locations routes and admin routes. This endpoint is informational only and not a security concern, but could confuse API consumers.

### 3. Admin endpoints share global rate limiter
Admin endpoints use the global `defaultRateLimiter` (200/hr) rather than a dedicated admin rate limiter. An attacker who knows the admin path structure could use up rate limit budget shared with normal users, or conversely, automated admin operations could consume normal user quota. Consider a separate rate limiter or exempting admin requests.

### 4. No IP allowlisting on admin endpoints
Admin endpoints are accessible from any IP with the correct secret. For a header-based secret that could be intercepted (e.g., in proxy logs), IP allowlisting would provide defense-in-depth.

### 5. `batchSize` and `retentionDays` admin parameters not Zod-validated
`admin.ts` lines 73 and 278: `batchSize` and `retentionDays` are parsed with `parseInt()` without Zod validation. While `parseInt` returns `NaN` for invalid input (caught by `|| 1000` and `|| 90` defaults), explicit Zod validation would be more consistent and prevent edge cases (e.g., negative numbers).

### 6. `dryRun` parameter accepts any truthy string as false
`admin.ts` lines 72, 277, 466: `dryRun` is checked with `=== 'true'`, meaning `dryRun=1` or `dryRun=yes` would be treated as `false` (not a dry run). This is technically correct behavior but could surprise callers.

---

## Questions Answered

### 1. Should the `/` endpoint listing be kept in sync with actual routes automatically?

**Finding:** The `/` endpoint (`index.ts` lines 144-173) is manually maintained and already out of sync. It lists `GET /api/v1/providers/:npi/plans` which doesn't exist as a route, and omits locations and admin routes. Options: auto-generate from route registration, or accept it as approximate and add a note.

### 2. Are there any endpoints that should require authentication before beta launch?

**Finding:** The current anti-abuse stack (rate limiting + CAPTCHA + honeypot + Sybil prevention) provides reasonable protection for a beta launch. The POST endpoints (`/verify` and `/:verificationId/vote`) are the most sensitive but already have 4 layers of protection. No endpoint critically requires user authentication for beta.

### 3. Should admin endpoints have IP allowlisting in addition to the secret?

**Finding:** Yes, recommended. The admin secret is transmitted in the `X-Admin-Secret` header. While HTTPS encrypts this in transit, proxy logs or request inspection could expose it. IP allowlisting (e.g., Cloud Scheduler IPs for cron jobs, developer IPs for manual access) would provide defense-in-depth. Implementation: add an `ADMIN_ALLOWED_IPS` env var checked in `adminAuthMiddleware`.

### 4. Should plan search results be cached like provider search results?

**Finding:** Plan search results are NOT cached (no caching code in `plans.ts`). Provider search results ARE cached for 5 minutes (`providers.ts` lines 211-270). Plan data changes less frequently than verification data, so caching plan searches would be beneficial for performance, especially for the `/grouped` endpoint which returns all plans grouped by carrier.

### 5. Should the disabled locations route file be removed or kept for reference?

**Finding:** The locations route is NOT disabled -- it is active and registered. `routes/index.ts` line 13: `router.use('/locations', locationsRouter)`. The locations route (`locations.ts`, 150 lines) is fully functional with 5 endpoints. This question appears to be outdated; the route has been re-enabled with the new `practice_locations` model.
