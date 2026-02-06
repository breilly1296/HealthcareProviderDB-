---
tags:
  - security
  - api
  - high
type: prompt
priority: 2
updated: 2026-02-05
---

# API Routes Security Review

## Files to Review
- `packages/backend/src/routes/index.ts` (route registry)
- `packages/backend/src/routes/providers.ts` (provider search, details, cities)
- `packages/backend/src/routes/plans.ts` (insurance plan search, metadata, providers-for-plan)
- `packages/backend/src/routes/verify.ts` (verification submissions, votes, stats)
- `packages/backend/src/routes/admin.ts` (admin cleanup, stats, cache — requires X-Admin-Secret)
- `packages/backend/src/routes/locations.ts` (location/geographic endpoints)
- `packages/backend/src/middleware/rateLimiter.ts` (rate limiting)
- `packages/backend/src/middleware/captcha.ts` (reCAPTCHA v3 on verify/vote)
- `packages/backend/src/middleware/errorHandler.ts` (error handling)
- `packages/backend/src/middleware/requestLogger.ts` (structured logging)
- `packages/backend/src/middleware/requestId.ts` (request ID correlation)
- `packages/backend/src/middleware/httpLogger.ts` (Pino HTTP logging)
- `packages/backend/src/index.ts` (middleware chain, CORS, health check)

## Complete Route Inventory

### Provider Routes (`/api/v1/providers`)
File: `routes/providers.ts`

| Method | Path | Rate Limit | Auth | Middleware | Description |
|--------|------|-----------|------|------------|-------------|
| GET | `/search` | searchRateLimiter (100/hr) | None | Zod validation, caching | Search providers with filters (state, city, specialty, name, NPI, entityType) |
| GET | `/cities` | defaultRateLimiter (200/hr) | None | Zod validation | Get unique cities for a state |
| GET | `/:npi` | defaultRateLimiter (200/hr) | None | NPI param validation | Get provider by NPI with full enrichment data |

**Search query parameters:** `state`, `city`, `cities` (comma-separated), `zipCode`, `specialty`, `specialtyCategory`, `name`, `npi`, `entityType` (INDIVIDUAL/ORGANIZATION), `page`, `limit`

**Caching:** Search results cached for 5 minutes via `generateSearchCacheKey()`. Cache invalidated after verification submissions. Response includes `X-Cache: HIT/MISS` header.

**Response transform:** `transformProvider()` maps DB shape to API shape, pulling address from primary `practice_locations` record and including enrichment data (CMS details, hospitals, insurance networks, Medicare IDs, taxonomies).

### Plan Routes (`/api/v1/plans`)
File: `routes/plans.ts`

| Method | Path | Rate Limit | Auth | Middleware | Description |
|--------|------|-----------|------|------------|-------------|
| GET | `/search` | searchRateLimiter (100/hr) | None | Zod validation | Search insurance plans with filters |
| GET | `/grouped` | defaultRateLimiter (200/hr) | None | Zod validation | Get plans grouped by carrier (for dropdown display) |
| GET | `/meta/issuers` | defaultRateLimiter (200/hr) | None | Zod validation | Get unique insurance issuers (optional state filter) |
| GET | `/meta/types` | defaultRateLimiter (200/hr) | None | Zod validation | Get available plan types (optional state + issuer filter) |
| GET | `/:planId/providers` | searchRateLimiter (100/hr) | None | Zod validation | Get providers who accept a specific plan (paginated) |
| GET | `/:planId` | defaultRateLimiter (200/hr) | None | Plan ID validation | Get plan by planId with provider count |

**Search query parameters:** `issuerName`, `planType`, `search`, `state`, `page`, `limit`

**Route order note:** `/:planId/providers` is defined BEFORE `/:planId` to avoid route conflicts.

### Verification Routes (`/api/v1/verify`)
File: `routes/verify.ts`

| Method | Path | Rate Limit | Auth | Middleware | Description |
|--------|------|-----------|------|------------|-------------|
| POST | `/` | verificationRateLimiter (10/hr) | None | **verifyCaptcha**, Zod validation | Submit a new verification |
| POST | `/:verificationId/vote` | voteRateLimiter (10/hr) | None | **verifyCaptcha**, Zod validation | Vote on a verification (up/down) |
| GET | `/stats` | defaultRateLimiter (200/hr) | None | None | Get verification statistics |
| GET | `/recent` | defaultRateLimiter (200/hr) | None | Zod validation | Get recent verifications |
| GET | `/:npi/:planId` | defaultRateLimiter (200/hr) | None | NPI + planId validation | Get verifications for a provider-plan pair with confidence breakdown |

**CAPTCHA:** Both POST endpoints require reCAPTCHA v3 token via `captchaToken` body field or `x-captcha-token` header. Skipped in development/test mode.

**Cache invalidation:** POST `/` invalidates search cache asynchronously after verification submission.

**Verification body:** `npi`, `planId`, `acceptsInsurance` (boolean), `acceptsNewPatients` (optional boolean), `notes` (max 1000), `evidenceUrl` (optional URL), `submittedBy` (optional email), `captchaToken`

**Vote body:** `vote` ("up" or "down"), `captchaToken`

### Admin Routes (`/api/v1/admin`)
File: `routes/admin.ts`

**All endpoints require `X-Admin-Secret` header** (timing-safe comparison via `timingSafeEqual`).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cleanup-expired` | Delete expired verification records. Query: `dryRun=true`, `batchSize=1000`. For Cloud Scheduler. |
| GET | `/expiration-stats` | Get verification expiration statistics |
| GET | `/health` | Admin health check with retention metrics (verification logs, sync logs, vote logs) |
| POST | `/cache/clear` | Clear all cached data. Returns deleted count. |
| GET | `/cache/stats` | Get cache statistics with hit rate |
| POST | `/cleanup/sync-logs` | Clean up sync_logs older than N days. Query: `dryRun=true`, `retentionDays=90`. |
| GET | `/retention/stats` | Comprehensive retention stats for all log types (verification, sync, plan acceptance, votes) |

**Admin auth behavior:**
- 503 if `ADMIN_SECRET` env var not configured (graceful disable)
- 401 if secret is wrong (timing-safe to prevent extraction)

### Location Routes (`/api/v1/locations`) — ACTIVE
File: `routes/locations.ts` (registered in `routes/index.ts`)

| Method | Path | Rate Limit | Auth | Description |
|--------|------|-----------|------|-------------|
| GET | `/search` | defaultRateLimiter (200/hr) | None | Search locations with filters |
| GET | `/health-systems` | defaultRateLimiter (200/hr) | None | Get distinct health systems |
| GET | `/stats/:state` | defaultRateLimiter (200/hr) | None | Location statistics by state |
| GET | `/:locationId` | defaultRateLimiter (200/hr) | None | Location details |
| GET | `/:locationId/providers` | defaultRateLimiter (200/hr) | None | Providers at a location |

### Infrastructure Endpoints (not under `/api/v1`)
File: `index.ts`

| Method | Path | Rate Limit | Description |
|--------|------|-----------|-------------|
| GET | `/health` | None (before rate limiter) | Health check with DB status, cache stats, memory, uptime |
| GET | `/` | defaultRateLimiter (200/hr) | API info with endpoint directory |

## Middleware Chain (Order)

```
1. requestIdMiddleware     — Unique request ID for log correlation
2. httpLogger              — Pino HTTP request/response logging
3. helmet                  — Security headers (strict CSP for JSON API)
4. cors                    — CORS with whitelist (verifymyprovider.com, Cloud Run, localhost)
5. express.json            — Body parsing (100kb limit)
6. express.urlencoded      — URL-encoded body parsing (100kb limit)
7. /health endpoint        — Health check (BEFORE rate limiter)
8. defaultRateLimiter      — 200 req/hr global rate limit
9. requestLogger           — Usage tracking (searches, verifications, votes)
10. /api/v1/* routes       — Route handlers (with per-route: honeypot, captcha, specific rate limiters)
11. notFoundHandler        — 404 handler
12. errorHandler           — Global error handler
```

## Security Status

- [x] **Rate limiting:** All endpoints rate-limited (search 100/hr, verify 10/hr, vote 10/hr, default 200/hr)
- [x] **CAPTCHA:** reCAPTCHA v3 on POST verify and vote endpoints
- [x] **Input validation:** Zod schemas on all endpoints
- [x] **Error handling:** Centralized via asyncHandler + AppError
- [x] **Security headers:** Helmet with strict CSP, CORS whitelist
- [x] **Request ID correlation:** Unique ID per request for log tracing
- [x] **Body size limit:** 100kb max
- [x] **Admin auth:** Timing-safe secret comparison
- [ ] **User authentication:** Not implemented (all routes public)
- [ ] **CSRF:** Not needed until auth is added
- [x] **Locations route:** Active and registered

## Questions to Ask
1. Should the `/` endpoint listing be kept in sync with actual routes automatically?
2. Are there any endpoints that should require authentication before beta launch?
3. Should admin endpoints have IP allowlisting in addition to the secret?
4. Should plan search results be cached like provider search results?
5. Should the disabled locations route file be removed or kept for reference?
