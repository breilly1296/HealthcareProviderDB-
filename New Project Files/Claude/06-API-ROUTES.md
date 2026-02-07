# API Routes Security Review

> **Generated:** 2026-02-07
> **Source:** `packages/backend/src/` (Express + Prisma + PostgreSQL)
> **Base URL:** `/api/v1`

---

## Table of Contents

1. [Complete Route Inventory](#complete-route-inventory)
   - [Provider Routes](#provider-routes-apiv1providers)
   - [Plan Routes](#plan-routes-apiv1plans)
   - [Verification Routes](#verification-routes-apiv1verify)
   - [Admin Routes](#admin-routes-apiv1admin)
   - [Location Routes](#location-routes-apiv1locations)
   - [Infrastructure Endpoints](#infrastructure-endpoints-not-under-apiv1)
2. [Middleware Chain](#middleware-chain-order)
3. [Rate Limiting Configuration](#rate-limiting-configuration)
4. [CAPTCHA Protection](#captcha-protection)
5. [Input Validation](#input-validation)
6. [Caching Strategy](#caching-strategy)
7. [Error Handling](#error-handling)
8. [Security Status](#security-status)
9. [Questions to Ask](#questions-to-ask)

---

## Files Reviewed

| File | Purpose |
|------|---------|
| `packages/backend/src/routes/index.ts` | Route registry -- mounts all sub-routers under `/api/v1` |
| `packages/backend/src/routes/providers.ts` | Provider search, detail, cities, co-located providers |
| `packages/backend/src/routes/plans.ts` | Insurance plan search, metadata, providers-for-plan |
| `packages/backend/src/routes/verify.ts` | Verification submissions, votes, stats |
| `packages/backend/src/routes/admin.ts` | Admin cleanup, stats, cache -- requires `X-Admin-Secret` |
| `packages/backend/src/routes/locations.ts` | Location/geographic endpoints |
| `packages/backend/src/middleware/rateLimiter.ts` | Dual-mode rate limiting (Redis / in-memory) |
| `packages/backend/src/middleware/captcha.ts` | reCAPTCHA v3 with fail-open/fail-closed modes |
| `packages/backend/src/middleware/errorHandler.ts` | Centralized error handling, `AppError` class, `asyncHandler` |
| `packages/backend/src/middleware/requestLogger.ts` | Structured request logging (no PII) |
| `packages/backend/src/middleware/requestId.ts` | UUID request ID correlation via `X-Request-ID` |
| `packages/backend/src/middleware/httpLogger.ts` | Pino HTTP logging with custom log levels |
| `packages/backend/src/middleware/honeypot.ts` | Hidden-field bot detection on POST endpoints |
| `packages/backend/src/middleware/requestTimeout.ts` | Per-route request timeout (15s/30s/120s) |
| `packages/backend/src/schemas/commonSchemas.ts` | Shared Zod schemas (pagination, NPI, state, planId) |
| `packages/backend/src/utils/cache.ts` | Dual-mode cache (Redis/in-memory) with TTL and stats |
| `packages/backend/src/utils/responseHelpers.ts` | Standardized response builders |
| `packages/backend/src/config/constants.ts` | Application constants (TTLs, thresholds, limits) |
| `packages/backend/src/index.ts` | Express app setup, middleware chain, CORS, health check, graceful shutdown |

---

## Complete Route Inventory

### Provider Routes (`/api/v1/providers`)

**File:** `packages/backend/src/routes/providers.ts`

| Method | Path | Rate Limit | Timeout | Auth | Middleware | Description |
|--------|------|-----------|---------|------|------------|-------------|
| GET | `/search` | `searchRateLimiter` (100/hr) | 15s (`searchTimeout`) | None | Zod validation, caching | Search providers with filters |
| GET | `/cities` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | Zod validation | Get unique cities for a state |
| GET | `/:npi/colocated` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | NPI + pagination validation | Get co-located providers at same practice address |
| GET | `/:npi` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | NPI param validation | Get provider by NPI with full enrichment data |

#### GET `/api/v1/providers/search`

Search providers with filters. Results are cached for 5 minutes.

**Query Parameters (Zod-validated):**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `state` | string | Exactly 2 chars, auto-uppercased | No | Two-letter state code (e.g., `CA`) |
| `city` | string | 1--100 chars | No | City name |
| `cities` | string | 1--500 chars | No | Comma-separated city names |
| `zipCode` | string | 3--10 chars | No | ZIP code |
| `specialty` | string | 1--200 chars | No | Specialty or taxonomy description |
| `specialtyCategory` | string | 1--100 chars | No | Specialty category group |
| `name` | string | 1--200 chars | No | Provider name (first, last, or organization) |
| `npi` | string | Exactly 10 digits | No | National Provider Identifier |
| `entityType` | enum | `INDIVIDUAL` or `ORGANIZATION` | No | Provider entity type |
| `page` | number | Integer >= 1, default `1` | No | Page number |
| `limit` | number | Integer 1--100, default `20` | No | Results per page |

**Caching Behavior:**
- Cache key generated via `generateSearchCacheKey()` which normalizes all string params (lowercase, trimmed) and builds a deterministic key of format `search:<state>:<city>:<specialty>:<page>:<limit>:<hash>`.
- Cache TTL: 300 seconds (5 minutes).
- Only non-empty result sets are cached.
- Response includes `X-Cache: HIT` or `X-Cache: MISS` header.
- Cache is invalidated when a new verification is submitted (see `POST /api/v1/verify`).

**Response Transform (`transformProvider`):**
Maps the database record shape to the API response shape. The transform:
- Pulls address from the primary `practice_locations` record (via `getPrimaryLocation()`).
- Maps `entityType` from DB values (`'1'`/`'2'`) to `INDIVIDUAL`/`ORGANIZATION`.
- Computes `displayName` via `getProviderDisplayName()`.
- Computes `npiStatus` as `ACTIVE` or `DEACTIVATED` based on `deactivation_date`.
- Includes enrichment data: `cmsDetails`, `hospitals`, `insuranceNetworks`, `medicareIds`, `taxonomies`, `locations`.
- Includes `planAcceptances` array with nested `plan` and `location` objects.

**Example Response:**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "1234567890",
        "npi": "1234567890",
        "entityType": "INDIVIDUAL",
        "firstName": "Jane",
        "lastName": "Smith",
        "displayName": "Jane Smith, MD",
        "addressLine1": "123 Medical Dr",
        "city": "Los Angeles",
        "state": "CA",
        "zip": "90001",
        "taxonomyDescription": "Internal Medicine",
        "npiStatus": "ACTIVE",
        "cmsDetails": { ... },
        "hospitals": [ ... ],
        "planAcceptances": [ ... ]
      }
    ],
    "pagination": {
      "total": 150,
      "page": 1,
      "limit": 20,
      "totalPages": 8,
      "hasMore": true
    }
  }
}
```

---

#### GET `/api/v1/providers/cities`

Get unique cities for a given state. Used for populating city filter dropdowns.

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `state` | string | Exactly 2 chars, auto-uppercased | **Yes** | Two-letter state code |

**Example Response:**
```json
{
  "success": true,
  "data": {
    "state": "CA",
    "cities": ["Los Angeles", "San Francisco", "San Diego"],
    "count": 3
  }
}
```

---

#### GET `/api/v1/providers/:npi/colocated`

Get providers co-located at the same practice address as the given NPI. Useful for discovering group practices and facility rosters.

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `npi` | string | Exactly 10 digits | Provider NPI |

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `page` | number | Integer >= 1, default `1` | No | Page number |
| `limit` | number | Integer 1--100, default `20` | No | Results per page |

**Logic:**
1. Looks up the provider by NPI.
2. Finds the primary practice location address.
3. Concurrently calls `getColocatedNpis()` (address match) and `getLocationHealthSystem()` (enrichment).
4. Fetches full provider records for matching NPIs with `PROVIDER_INCLUDE`.
5. Returns the location info (with health system), transformed providers, and pagination.

**Error Cases:**
- 404 if the NPI does not exist.
- Returns empty `providers` array if no primary address is found.

---

#### GET `/api/v1/providers/:npi`

Get a single provider by NPI with full enrichment data.

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `npi` | string | Exactly 10 digits | Provider NPI |

**Error Cases:**
- 404 if the NPI does not exist.

**Response:** Full provider object via `transformProvider()` including all enrichment tables (CMS details, hospitals, insurance networks, Medicare IDs, taxonomies, locations, plan acceptances).

---

### Plan Routes (`/api/v1/plans`)

**File:** `packages/backend/src/routes/plans.ts`

| Method | Path | Rate Limit | Timeout | Auth | Middleware | Description |
|--------|------|-----------|---------|------|------------|-------------|
| GET | `/search` | `searchRateLimiter` (100/hr) | 30s (`generalTimeout`) | None | Zod validation | Search insurance plans with filters |
| GET | `/grouped` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | Zod validation | Get plans grouped by carrier for dropdown display |
| GET | `/meta/issuers` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | Zod validation | Get unique insurance issuers |
| GET | `/meta/types` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | Zod validation | Get available plan types |
| GET | `/:planId/providers` | `searchRateLimiter` (100/hr) | 30s (`generalTimeout`) | None | Zod validation | Get providers who accept a specific plan (paginated) |
| GET | `/:planId` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | Plan ID validation | Get plan by planId with provider count |

**Route Order Note:** `/:planId/providers` is defined **before** `/:planId` in the router to prevent Express from matching `providers` as a `planId` value.

#### GET `/api/v1/plans/search`

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `issuerName` | string | 1--200 chars | No | Insurance issuer/carrier name |
| `planType` | string | 1--20 chars | No | Plan type (e.g., `HMO`, `PPO`) |
| `search` | string | 1--200 chars | No | Free-text search across plan fields |
| `state` | string | Exactly 2 chars, auto-uppercased | No | Filter by state |
| `page` | number | Integer >= 1, default `1` | No | Page number |
| `limit` | number | Integer 1--100, default `20` | No | Results per page |

---

#### GET `/api/v1/plans/grouped`

Get plans grouped by carrier for dropdown/autocomplete display.

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `search` | string | 1--200 chars | No | Free-text search |
| `state` | string | Exactly 2 chars, auto-uppercased | No | Filter by state |

---

#### GET `/api/v1/plans/meta/issuers`

Get the list of distinct insurance issuers.

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `state` | string | Exactly 2 chars, auto-uppercased | No | Filter issuers by state |

---

#### GET `/api/v1/plans/meta/types`

Get the list of available plan types.

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `state` | string | Exactly 2 chars, auto-uppercased | No | Filter types by state |
| `issuerName` | string | 1--200 chars | No | Filter types by issuer |

---

#### GET `/api/v1/plans/:planId/providers`

Get providers who accept a specific insurance plan.

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `planId` | string | 1--50 chars | Plan identifier |

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `page` | number | Integer >= 1, default `1` | No | Page number |
| `limit` | number | Integer 1--100, default `20` | No | Results per page |

**Response:** Returns a simplified provider shape (no full enrichment) with `confidenceScore`, `lastVerified`, and `verificationCount` fields.

**Error Cases:**
- 404 if the plan ID does not exist.

---

#### GET `/api/v1/plans/:planId`

Get a single plan by its plan ID.

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `planId` | string | 1--50 chars | Plan identifier |

**Response:** Plan details with a `providerCount` computed from `_count.providerAcceptances`.

**Error Cases:**
- 404 if the plan ID does not exist.

---

### Verification Routes (`/api/v1/verify`)

**File:** `packages/backend/src/routes/verify.ts`

| Method | Path | Rate Limit | Timeout | Auth | Middleware | Description |
|--------|------|-----------|---------|------|------------|-------------|
| POST | `/` | `verificationRateLimiter` (10/hr) | 30s (`generalTimeout`) | None | **honeypotCheck**, **verifyCaptcha**, Zod validation | Submit a new verification |
| POST | `/:verificationId/vote` | `voteRateLimiter` (10/hr) | 30s (`generalTimeout`) | None | **honeypotCheck**, **verifyCaptcha**, Zod validation | Vote on a verification (up/down) |
| GET | `/stats` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | None | Get verification statistics |
| GET | `/recent` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | Zod validation | Get recent verifications |
| GET | `/:npi/:planId` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | NPI + planId validation | Get verifications for a provider-plan pair |

#### POST `/api/v1/verify`

Submit a new insurance acceptance verification for a provider-plan pair.

**Middleware Chain (in order):**
1. `verificationRateLimiter` -- 10 requests/hour per IP
2. `honeypotCheck('website')` -- bot detection (returns fake 200 if triggered)
3. `verifyCaptcha` -- reCAPTCHA v3 token validation

**Request Body (Zod-validated):**

| Field | Type | Constraints | Required | Description |
|-------|------|-------------|----------|-------------|
| `npi` | string | Exactly 10 digits | **Yes** | Provider NPI |
| `planId` | string | 1--50 chars | **Yes** | Insurance plan identifier |
| `acceptsInsurance` | boolean | -- | **Yes** | Whether provider accepts this plan |
| `acceptsNewPatients` | boolean | -- | No | Whether provider accepts new patients |
| `locationId` | number | Positive integer | No | Specific practice location ID |
| `notes` | string | Max 1000 chars | No | Free-text notes |
| `evidenceUrl` | string | Valid URL, max 500 chars | No | Supporting evidence link |
| `submittedBy` | string | Valid email, max 200 chars | No | Submitter email |
| `captchaToken` | string | -- | Conditionally | reCAPTCHA v3 token (required in production) |
| `website` | string | -- | No | Honeypot field (must be empty) |

**Side Effects:**
- Invalidates the search cache asynchronously after successful submission (non-blocking).
- The `sourceIp` and `userAgent` are extracted from the request and passed to the service layer for Sybil prevention.

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "verification": { "id": "...", "npi": "...", "planId": "..." },
    "acceptance": { "confidenceScore": 75, "acceptanceStatus": "ACCEPTED", ... },
    "message": "Verification submitted successfully"
  }
}
```

---

#### POST `/api/v1/verify/:verificationId/vote`

Vote on an existing verification (upvote or downvote).

**Middleware Chain (in order):**
1. `voteRateLimiter` -- 10 requests/hour per IP
2. `honeypotCheck('website')` -- bot detection
3. `verifyCaptcha` -- reCAPTCHA v3 token validation

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `verificationId` | string | Min 1 char | Verification record ID |

**Request Body:**

| Field | Type | Constraints | Required | Description |
|-------|------|-------------|----------|-------------|
| `vote` | enum | `"up"` or `"down"` | **Yes** | Vote direction |
| `captchaToken` | string | -- | Conditionally | reCAPTCHA v3 token (required in production) |
| `website` | string | -- | No | Honeypot field (must be empty) |

**Response:**
```json
{
  "success": true,
  "data": {
    "verification": {
      "id": "...",
      "upvotes": 5,
      "downvotes": 1,
      "netVotes": 4
    },
    "message": "Vote recorded: up"
  }
}
```

The message changes to `"Vote changed to: up"` if the user previously voted differently.

---

#### GET `/api/v1/verify/stats`

Get aggregate verification statistics. No parameters required.

---

#### GET `/api/v1/verify/recent`

Get recent verifications.

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `limit` | number | Integer 1--100, default `20` | No | Number of recent verifications |
| `npi` | string | Exactly 10 digits | No | Filter by provider NPI |
| `planId` | string | 1--50 chars | No | Filter by plan ID |

---

#### GET `/api/v1/verify/:npi/:planId`

Get all verifications for a specific provider-plan pair with a full confidence breakdown.

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `npi` | string | Exactly 10 digits | Provider NPI |
| `planId` | string | 1--50 chars | Plan identifier |

**Response:** Returns `acceptance` (with confidence breakdown via `enrichAcceptanceWithConfidence`), `verifications` array, and `summary` with totals.

**Error Cases:**
- 404 if the provider or plan is not found.

---

### Admin Routes (`/api/v1/admin`)

**File:** `packages/backend/src/routes/admin.ts`

**All endpoints require the `X-Admin-Secret` header.** Authentication is enforced by `adminAuthMiddleware` which applies to every route in this router.

| Method | Path | Timeout | Description |
|--------|------|---------|-------------|
| POST | `/cleanup-expired` | 120s (`adminTimeout`) | Delete expired verification records |
| GET | `/expiration-stats` | 30s (`generalTimeout`) | Get verification expiration statistics |
| GET | `/health` | 30s (`generalTimeout`) | Admin health check with retention metrics |
| POST | `/cache/clear` | 30s (`generalTimeout`) | Clear all cached data |
| GET | `/cache/stats` | 30s (`generalTimeout`) | Get cache statistics with hit rate |
| GET | `/enrichment/stats` | 30s (`generalTimeout`) | Location enrichment statistics |
| POST | `/cleanup/sync-logs` | 120s (`adminTimeout`) | Clean up old sync logs |
| GET | `/retention/stats` | 30s (`generalTimeout`) | Comprehensive retention stats for all log types |
| POST | `/recalculate-confidence` | 120s (`adminTimeout`) | Recalculate confidence scores with time-based decay |

#### Admin Authentication (`adminAuthMiddleware`)

Defined in `packages/backend/src/routes/admin.ts` (lines 22--56).

**Behavior:**
- **503** if `ADMIN_SECRET` environment variable is not configured (graceful disable -- allows deployment without enabling admin).
- **401** if the secret is configured but the `X-Admin-Secret` header is missing or incorrect.
- Uses `timingSafeEqual` from Node.js `crypto` to prevent timing-based secret extraction attacks.
- Length check is performed first (since `timingSafeEqual` requires equal-length buffers), then constant-time comparison.

```typescript
const isValid =
  providedBuffer.length === secretBuffer.length &&
  timingSafeEqual(providedBuffer, secretBuffer);
```

---

#### POST `/api/v1/admin/cleanup-expired`

Delete expired verification records. Designed to be called by Google Cloud Scheduler.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | string | `"false"` | Set to `"true"` to preview without deleting |
| `batchSize` | number | `1000` | Records to delete per batch |

---

#### GET `/api/v1/admin/expiration-stats`

Get statistics about how many verification records are expired or expiring.

---

#### GET `/api/v1/admin/health`

Admin health check with detailed retention metrics. Queries the database for counts and oldest records across:
- `verificationLog` (total, expiring in 7 days, oldest record)
- `syncLog` (total, oldest record)
- `voteLog` (total)

Also includes cache statistics and uptime.

---

#### POST `/api/v1/admin/cache/clear`

Force-clear all cached data. Returns the count of deleted entries. Useful after data imports or bulk operations.

---

#### GET `/api/v1/admin/cache/stats`

Get cache statistics including hits, misses, size, mode (`redis` or `memory`), and computed `hitRate` percentage.

---

#### GET `/api/v1/admin/enrichment/stats`

Get location enrichment statistics for `practice_locations` and `provider_hospitals` tables. Delegates to `getEnrichmentStats()` from `services/locationEnrichment.ts`.

---

#### POST `/api/v1/admin/cleanup/sync-logs`

Clean up `sync_logs` records older than a configurable retention period. Designed for daily Cloud Scheduler execution.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | string | `"false"` | Set to `"true"` to preview without deleting |
| `retentionDays` | number | `90` | Number of days to retain |

---

#### GET `/api/v1/admin/retention/stats`

Comprehensive retention statistics for all log types. Reports counts, expiration windows, oldest/newest records, and retention policies for:
- **Verification logs:** Total, expiring in 7/30 days, oldest/newest. Policy: 6 months TTL via `expiresAt`.
- **Sync logs:** Total, older than 90 days, oldest/newest. Policy: 90 days manual cleanup.
- **Plan acceptances:** Total, expiring in 7/30 days. Policy: 6 months TTL via `expiresAt`.
- **Vote logs:** Total. Policy: follows plan acceptance TTL.

---

#### POST `/api/v1/admin/recalculate-confidence`

Recalculate confidence scores for all `ProviderPlanAcceptance` records with time-based decay applied proactively.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | string | `"false"` | Set to `"true"` to preview changes |
| `limit` | number | All records | Maximum records to process |

**Response:**
```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "processed": 5000,
    "updated": 1234,
    "unchanged": 3766,
    "errors": 0,
    "durationMs": 8500,
    "duration": "8.5s",
    "message": "Recalculation complete. 1234 of 5000 records updated."
  }
}
```

---

### Location Routes (`/api/v1/locations`)

**File:** `packages/backend/src/routes/locations.ts`
**Status:** Active and registered in `routes/index.ts`.

| Method | Path | Rate Limit | Timeout | Auth | Middleware | Description |
|--------|------|-----------|---------|------|------------|-------------|
| GET | `/search` | `searchRateLimiter` (100/hr) | 30s (`generalTimeout`) | None | Zod validation | Search practice locations with filters |
| GET | `/health-systems` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | Zod validation | Get distinct health system names |
| GET | `/stats/:state` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | Zod validation | Location statistics by state |
| GET | `/:locationId` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | Zod validation | Get single location by ID |
| GET | `/:locationId/providers` | `defaultRateLimiter` (200/hr) | 30s (`generalTimeout`) | None | Zod validation | Get providers at a location |

#### GET `/api/v1/locations/search`

Search practice locations. State is required.

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `state` | string | Exactly 2 chars, auto-uppercased | **Yes** | Two-letter state code |
| `city` | string | 1--100 chars | No | City name filter |
| `zipCode` | string | 3--10 chars | No | ZIP code filter |
| `page` | number | Integer >= 1, default `1` | No | Page number |
| `limit` | number | Integer 1--100, default `20` | No | Results per page |

---

#### GET `/api/v1/locations/health-systems`

Get distinct health system names, optionally filtered.

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `state` | string | Exactly 2 chars, auto-uppercased | No | Filter by state |
| `city` | string | 1--100 chars | No | Filter by city |

---

#### GET `/api/v1/locations/stats/:state`

Get location statistics for a state (provider counts, facility types, etc.).

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `state` | string | Exactly 2 chars, auto-uppercased | State code |

---

#### GET `/api/v1/locations/:locationId`

Get a single practice location by its database ID.

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `locationId` | number | Positive integer (coerced from string) | Location ID |

**Error Cases:**
- 404 if the location ID does not exist.

---

#### GET `/api/v1/locations/:locationId/providers`

Get all providers that share the same address as the given location.

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `locationId` | number | Positive integer (coerced from string) | Location ID |

**Query Parameters:**

| Parameter | Type | Constraints | Required | Description |
|-----------|------|-------------|----------|-------------|
| `page` | number | Integer >= 1, default `1` | No | Page number |
| `limit` | number | Integer 1--100, default `20` | No | Results per page |

**Error Cases:**
- 404 if the location ID does not exist.

---

### Infrastructure Endpoints (not under `/api/v1`)

**File:** `packages/backend/src/index.ts`

| Method | Path | Rate Limit | Timeout | Description |
|--------|------|-----------|---------|-------------|
| GET | `/health` | **None** (before rate limiter) | None | Health check with DB status, cache stats, memory, uptime |
| GET | `/` | `defaultRateLimiter` (200/hr) | None | API info with endpoint directory |

#### GET `/health`

Health check endpoint positioned **before** the rate limiter in the middleware chain so monitoring tools and load balancers are never blocked.

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-02-07T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 86400,
  "memory": { "heapUsed": 45, "heapTotal": 128, "unit": "MB" },
  "checks": { "database": "healthy" },
  "databaseResponseTime": "5ms",
  "cache": {
    "hits": 1234,
    "misses": 567,
    "size": 42,
    "mode": "redis",
    "hitRate": "68.5%"
  }
}
```

**Degraded Response (503):** If the database `SELECT 1` probe fails, returns `status: "degraded"` with `checks.database: "unhealthy"` and the error message.

#### GET `/`

Returns API info and an endpoint directory. This is a static JSON response useful for API discovery.

---

## Middleware Chain (Order)

The middleware is applied in the following order in `packages/backend/src/index.ts`:

```
 1. requestIdMiddleware       - Generates UUID per request (crypto.randomUUID)
                                 Honors incoming X-Request-ID header for cross-service tracing
                                 Sets X-Request-ID response header

 2. httpLogger (pino-http)    - Structured HTTP request/response logging
                                 Custom log levels: 5xx=error, 4xx=warn, else=info
                                 Skips /health endpoint to reduce noise
                                 Uses req.id for log correlation

 3. helmet                    - Security headers with strict CSP for JSON API:
                                 defaultSrc: 'none', scriptSrc: 'none', styleSrc: 'none'
                                 frameAncestors: 'none', upgradeInsecureRequests
                                 crossOriginEmbedderPolicy, crossOriginOpenerPolicy,
                                 crossOriginResourcePolicy, referrerPolicy: no-referrer

 4. cors                      - CORS whitelist:
                                 - https://verifymyprovider.com
                                 - https://www.verifymyprovider.com
                                 - https://verifymyprovider-frontend-*.run.app (Cloud Run)
                                 - FRONTEND_URL env var
                                 - localhost:3000, localhost:3001 (development only)
                                 Allows methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
                                 Allowed headers: Content-Type, Authorization, X-Request-ID, X-Admin-Secret
                                 Credentials: enabled
                                 Logs blocked CORS attempts as warnings

 5. express.json              - Body parsing with 100kb limit
 6. express.urlencoded        - URL-encoded body parsing with 100kb limit

 7. GET /health               - Health check (BEFORE rate limiter)

 8. defaultRateLimiter        - 200 req/hr global rate limit (sliding window)
                                 Dual-mode: Redis (distributed) or in-memory (single-instance)
                                 Fail-open on Redis errors

 9. requestLogger             - Usage tracking (method, path, status, response time)
                                 Explicitly excludes PII (no IP, user agent)
                                 In-memory buffer (1000 entries max) for stats

10. generalTimeout            - 30s timeout for all /api/v1/* routes

11. /api/v1/* routes          - Route handlers with per-route middleware:
                                 - searchTimeout (15s) on provider search
                                 - adminTimeout (120s) on admin batch operations
                                 - searchRateLimiter (100/hr) on search endpoints
                                 - verificationRateLimiter (10/hr) on POST /verify
                                 - voteRateLimiter (10/hr) on POST /verify/:id/vote
                                 - honeypotCheck on POST endpoints
                                 - verifyCaptcha on POST endpoints

12. notFoundHandler           - 404 handler with request ID

13. errorHandler              - Global error handler:
                                 - AppError: returns structured JSON with status code
                                 - ZodError: returns 400 with field-level details
                                 - PayloadTooLargeError: returns 413
                                 - Prisma P2002: returns 409 DUPLICATE_ENTRY
                                 - Prisma P2025: returns 404 NOT_FOUND
                                 - Prisma P2003: returns 400 FOREIGN_KEY_VIOLATION
                                 - Prisma P2024: returns 503 DATABASE_TIMEOUT
                                 - Prisma P2010: returns 500 QUERY_ERROR
                                 - PrismaClientInitializationError: returns 503 DATABASE_UNAVAILABLE
                                 - Default: returns 500 (message hidden in production)
```

---

## Rate Limiting Configuration

**File:** `packages/backend/src/middleware/rateLimiter.ts`

### Dual-Mode Architecture

The rate limiter automatically selects its backend:

| Mode | Trigger | Use Case | State Scope |
|------|---------|----------|-------------|
| **Redis** | `REDIS_URL` env var is set | Multi-instance / Cloud Run | Shared across all instances |
| **In-memory** | `REDIS_URL` not set | Single-instance / development | Per-process only |

### Algorithm: Sliding Window

Both modes use the sliding window algorithm (not fixed windows) to prevent burst attacks at window boundaries:

- **Redis mode:** Uses sorted sets (`ZADD`/`ZREMRANGEBYSCORE`/`ZCARD`) in a multi/exec transaction.
- **In-memory mode:** Maintains arrays of request timestamps per client key, filtered on each request.

### Fail-Open Behavior

If Redis becomes unavailable during operation, requests are **allowed** with a `X-RateLimit-Status: degraded` header and a warning is logged. This prioritizes availability over strict rate enforcement.

### Pre-Configured Limiters

| Limiter Name | Max Requests | Window | Applied To |
|--------------|-------------|--------|------------|
| `defaultRateLimiter` | 200 | 1 hour | All routes (global middleware) |
| `searchRateLimiter` | 100 | 1 hour | Provider search, plan search, location search, providers-for-plan |
| `verificationRateLimiter` | 10 | 1 hour | `POST /api/v1/verify` |
| `voteRateLimiter` | 10 | 1 hour | `POST /api/v1/verify/:verificationId/vote` |

### Response Headers

All rate-limited responses include:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds to wait (only on 429 responses) |
| `X-RateLimit-Status` | Set to `degraded` if Redis is unavailable |

### 429 Response Format

```json
{
  "error": "Too many requests",
  "message": "Too many search requests. Please try again in 1 hour.",
  "retryAfter": 3600
}
```

---

## CAPTCHA Protection

**File:** `packages/backend/src/middleware/captcha.ts`

### Overview

Google reCAPTCHA v3 is used on all write endpoints (verification submission and voting). It is a score-based system (0.0 = likely bot, 1.0 = likely human) with no user-facing challenge.

### Token Submission

The CAPTCHA token can be provided in two ways:
- **Request body:** `captchaToken` field
- **Request header:** `x-captcha-token`

### Score Threshold

The minimum score to pass is `0.5` (configured in `config/constants.ts` as `CAPTCHA_MIN_SCORE`). Requests below this threshold receive a 403 Forbidden with `"Request blocked due to suspicious activity"`.

### Environment Behavior

| Environment | CAPTCHA Behavior |
|-------------|-----------------|
| `development` | Skipped entirely |
| `test` | Skipped entirely |
| Production without `RECAPTCHA_SECRET_KEY` | Skipped with warning logged |
| Production with `RECAPTCHA_SECRET_KEY` | Fully enforced |

### Fail Mode (`CAPTCHA_FAIL_MODE` env var)

| Mode | Behavior on Google API Failure | Risk |
|------|-------------------------------|------|
| `open` (default) | Allows request with fallback rate limiting (3/hr vs normal 10/hr) | Attackers could exploit outages |
| `closed` | Blocks all requests with 503 | Legitimate users blocked during outages |

When operating in fail-open mode:
- `X-Security-Degraded: captcha-unavailable` header is set.
- `X-Fallback-RateLimit-Limit`, `X-Fallback-RateLimit-Remaining`, and `X-Fallback-RateLimit-Reset` headers are added.
- Fallback rate limit: `3` requests per hour per IP (from `CAPTCHA_FALLBACK_MAX_REQUESTS` in `config/constants.ts`).

### API Call Timeout

The Google reCAPTCHA API call has a `5000ms` timeout (`CAPTCHA_API_TIMEOUT_MS`). If it times out, the fail mode behavior applies.

---

## Honeypot Bot Detection

**File:** `packages/backend/src/middleware/honeypot.ts`

A hidden form field (`website`) is included in POST request schemas for verification and voting. The honeypot middleware:

1. Checks if the `website` field in the request body has a value.
2. If it does (indicating a bot that auto-fills all fields), returns a **fake 200 OK** response: `{ success: true, data: { id: "submitted" } }`.
3. If it does not, passes the request to the next middleware.

The fake success response prevents bots from detecting they were caught.

---

## Input Validation

**File:** `packages/backend/src/schemas/commonSchemas.ts` and inline schemas in route files.

All input validation uses [Zod](https://zod.dev/) schemas. Validation is performed at the beginning of each route handler via `.parse()`. Failed validation throws a `ZodError` which is caught by the global `errorHandler` and returned as a 400 response with field-level details.

### Shared Schemas

| Schema | Fields | Used In |
|--------|--------|---------|
| `paginationSchema` | `page` (int >= 1, default 1), `limit` (int 1--100, default 20) | providers, plans, locations, verify |
| `npiParamSchema` | `npi` (string, exactly 10 digits) | providers, verify |
| `stateQuerySchema` | `state` (string, exactly 2 chars, auto-uppercased, optional) | plans, locations |
| `planIdParamSchema` | `planId` (string, 1--50 chars) | plans, verify |

### Validation Error Response (400)

```json
{
  "success": false,
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "abc123...",
    "details": [
      { "field": "state", "message": "String must contain exactly 2 character(s)" },
      { "field": "page", "message": "Number must be greater than or equal to 1" }
    ]
  }
}
```

---

## Caching Strategy

**File:** `packages/backend/src/utils/cache.ts`

### Dual-Mode Cache

Like the rate limiter, the cache operates in two modes:

| Mode | Trigger | Scope |
|------|---------|-------|
| **Redis** | `REDIS_URL` env var is set | Shared across instances |
| **In-memory** | `REDIS_URL` not set | Per-process only |

Redis is tried first. On failure, falls back to in-memory with a warning logged.

### Cached Endpoints

| Endpoint | TTL | Cache Key Pattern | Invalidation |
|----------|-----|-------------------|--------------|
| `GET /api/v1/providers/search` | 5 minutes (300s) | `cache:search:<state>:<city>:<specialty>:<page>:<limit>:<hash>` | On `POST /api/v1/verify` (all search keys invalidated) |

### Cache Key Normalization

The `generateSearchCacheKey()` function ensures deterministic keys by:
1. Lowercasing and trimming all string values.
2. Building a structured key from primary fields: `state`, `city`, `specialty`, `page`, `limit`.
3. Hashing additional parameters (`cities`, `zipCode`, `name`, `npi`, `entityType`, etc.) into a compact suffix via `simpleHash()`.

### Cache Statistics

Tracked metrics: `hits`, `misses`, `sets`, `deletes`, `size`, `mode`. Accessible via `GET /api/v1/admin/cache/stats`.

### Cleanup

In-memory expired entries are cleaned up every 60 seconds via `setInterval`.

---

## Request Timeouts

**File:** `packages/backend/src/middleware/requestTimeout.ts`

| Timeout Name | Duration | Applied To |
|-------------|----------|------------|
| `generalTimeout` | 30 seconds | All `/api/v1/*` routes (global) |
| `searchTimeout` | 15 seconds | `GET /api/v1/providers/search` |
| `adminTimeout` | 120 seconds | Admin batch operations (`cleanup-expired`, `cleanup/sync-logs`, `recalculate-confidence`) |

When a timeout fires, the client receives:

```json
{
  "success": false,
  "error": {
    "message": "Request timed out",
    "code": "REQUEST_TIMEOUT",
    "statusCode": 408,
    "requestId": "..."
  }
}
```

If response headers have already been sent, the timeout is silently ignored.

---

## Error Handling

**File:** `packages/backend/src/middleware/errorHandler.ts`

### `AppError` Class

A custom error class with static factory methods for common HTTP error codes:

| Factory Method | Status Code | Use Case |
|---------------|-------------|----------|
| `AppError.badRequest()` | 400 | Invalid input, missing fields |
| `AppError.unauthorized()` | 401 | Invalid admin secret |
| `AppError.forbidden()` | 403 | Low CAPTCHA score |
| `AppError.notFound()` | 404 | Provider/plan/location not found |
| `AppError.conflict()` | 409 | Duplicate entries |
| `AppError.tooManyRequests()` | 429 | Fallback rate limit exceeded |
| `AppError.serviceUnavailable()` | 503 | CAPTCHA API down (fail-closed) |
| `AppError.internal()` | 500 | Unexpected errors |

### `asyncHandler` Wrapper

All async route handlers are wrapped with `asyncHandler()` which catches rejected promises and forwards them to the error handler via `next(error)`.

### Error Response Format

All error responses follow a consistent structure:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "MACHINE_READABLE_CODE",
    "statusCode": 400,
    "requestId": "uuid-here"
  }
}
```

In production, generic 500 errors hide the actual error message, returning `"Internal server error"` instead.

### Prisma Error Mapping

| Prisma Code | HTTP Status | Error Code | Meaning |
|-------------|-------------|------------|---------|
| P2002 | 409 | `DUPLICATE_ENTRY` | Unique constraint violation |
| P2003 | 400 | `FOREIGN_KEY_VIOLATION` | Referenced record not found |
| P2025 | 404 | `NOT_FOUND` | Record not found (update/delete) |
| P2024 | 503 | `DATABASE_TIMEOUT` | Connection pool exhausted |
| P2010 | 500 | `QUERY_ERROR` | Raw query execution failed |
| `PrismaClientInitializationError` | 503 | `DATABASE_UNAVAILABLE` | Cannot connect to database |

---

## Graceful Shutdown

**File:** `packages/backend/src/index.ts` (lines 202--237)

The server handles `SIGINT` and `SIGTERM` signals:

1. Stop accepting new connections (`server.close()`).
2. Disconnect from the database (`prisma.$disconnect()`).
3. Exit with code 0 on success.
4. Force exit after `10000ms` timeout if graceful shutdown stalls.

---

## Security Status

- [x] **Rate limiting:** All endpoints rate-limited (search 100/hr, verify 10/hr, vote 10/hr, default 200/hr). Sliding window algorithm prevents burst attacks.
- [x] **CAPTCHA:** reCAPTCHA v3 on POST verify and vote endpoints. Configurable fail-open/fail-closed with fallback rate limiting.
- [x] **Honeypot:** Hidden `website` field on POST endpoints with silent fake-success response for bots.
- [x] **Input validation:** Zod schemas on all endpoints with field-level error details.
- [x] **Error handling:** Centralized via `asyncHandler` + `AppError` with Prisma-specific error mapping.
- [x] **Security headers:** Helmet with strict CSP (all sources `'none'` except `connectSrc: 'self'`), CORS whitelist, no-referrer policy.
- [x] **Request ID correlation:** UUID per request via `crypto.randomUUID()`. Honors incoming `X-Request-ID` for cross-service tracing.
- [x] **HTTP logging:** Pino-based structured logging with custom log levels per status code. No PII logged.
- [x] **Body size limit:** 100kb max for both JSON and URL-encoded bodies.
- [x] **Admin auth:** Timing-safe secret comparison via `timingSafeEqual`. Graceful 503 if not configured.
- [x] **Request timeouts:** Per-route timeouts (15s search, 30s general, 120s admin batch).
- [x] **Proxy trust:** `trust proxy` set to `1` for correct client IP behind Cloud Run load balancer.
- [x] **Locations route:** Active and registered in route index.
- [ ] **User authentication:** Not implemented (all public routes are unauthenticated).
- [ ] **CSRF:** Not needed until user authentication is added.
- [ ] **IP allowlisting for admin:** Not implemented (relies solely on shared secret).

---

## Questions to Ask

1. Should the `/` endpoint listing be kept in sync with actual routes automatically? (Currently it is a static JSON object that references some endpoints that do not exist in the code, such as `GET /api/v1/providers/:npi/plans` and `GET /api/v1/plans/meta/years`.)
2. Are there any endpoints that should require user authentication before beta launch?
3. Should admin endpoints have IP allowlisting in addition to the shared secret?
4. Should plan search results be cached like provider search results? (Currently only provider search is cached.)
5. Should the locations route search endpoint also use `searchTimeout` (15s) instead of the general 30s timeout?
6. The `POST /verify` endpoint currently invalidates **all** search cache entries. Should this be scoped to only invalidate entries related to the affected provider's state/city?
7. Should the admin secret be rotated on a schedule, and should the system support multiple valid secrets during rotation?
