# API Routes - VerifyMyProvider

## Overview

VerifyMyProvider exposes a RESTful API under the `/api/v1` prefix. All endpoints return JSON responses with a consistent envelope format. The API is served by an Express.js backend deployed on Google Cloud Run.

### Response Envelope

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 100, "page": 1, "limit": 20 }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "details": [...]
  }
}
```

---

## Middleware Chain (Execution Order)

Middleware is applied in this exact order for every request:

| Order | Middleware | Purpose |
|---|---|---|
| 1 | `requestId` | Generate or extract `X-Request-ID` for correlation |
| 2 | `httpLogger` | HTTP-level access logging (morgan or similar) |
| 3 | `helmet` | Security headers (CSP, HSTS, X-Frame-Options, etc.) |
| 4 | `cors` | CORS whitelist enforcement |
| 5 | `express.json({ limit: '100kb' })` | Body parsing with 100kb size limit |
| 6 | `/health` route | Health check (before rate limiting) |
| 7 | `defaultRateLimiter` | Default rate limiter (200/hr) applied to all other routes |
| 8 | `requestLogger` | Structured JSON request logging |
| 9 | Route handlers | Actual endpoint logic |
| 10 | `notFound` | 404 handler for unmatched routes |
| 11 | `errorHandler` | Global error handler (formats error responses) |

**Note**: The `/health` endpoint is placed before the rate limiter so health checks from load balancers and monitoring services are never rate-limited.

---

## Provider Routes

**Base path**: `/api/v1/providers`

| Method | Path | Rate Limit | Auth | Description |
|---|---|---|---|---|
| GET | `/search` | 100/hr | None | Search providers by name, specialty, location, NPI |
| GET | `/cities` | 200/hr | None | List distinct cities with provider counts (for autocomplete) |
| GET | `/:npi/colocated` | 200/hr | None | Find providers at the same practice location |
| GET | `/:npi` | 200/hr | None | Get full provider details by NPI |

### GET /search

Search parameters (all optional, Zod-validated):

| Parameter | Type | Description |
|---|---|---|
| `name` | string | Provider name (partial match, first or last) |
| `firstName` | string | First name (partial match) |
| `lastName` | string | Last name (partial match) |
| `specialty` | string | Primary specialty (partial match) |
| `specialtyCategory` | string | Specialty category (exact match) |
| `taxonomyCode` | string | Taxonomy code (exact match) |
| `city` | string | City (exact match, case-insensitive) |
| `state` | string | State (2-letter code) |
| `zipCode` | string | ZIP code (5-digit prefix match) |
| `gender` | string | Gender filter |
| `credential` | string | Credential filter (e.g., "MD", "DO") |
| `npi` | string | Exact NPI lookup |
| `page` | number | Page number (default 1) |
| `limit` | number | Results per page (default 20, max 100) |
| `sortBy` | string | Sort field |
| `sortOrder` | string | "asc" or "desc" |

### GET /:npi

Returns full provider details including:
- Provider demographics and credentials
- All practice locations
- CMS details (enumeration date, etc.)
- Hospital affiliations
- Taxonomy classifications
- Medicare participation
- Insurance information
- Confidence score and verification count
- Recent verifications (with PII stripped)

---

## Plan Routes

**Base path**: `/api/v1/plans`

| Method | Path | Rate Limit | Auth | Description |
|---|---|---|---|---|
| GET | `/search` | 100/hr | None | Search insurance plans by name, issuer, state |
| GET | `/grouped` | 200/hr | None | Get plans grouped by issuer |
| GET | `/meta/issuers` | 200/hr | None | List distinct issuer names |
| GET | `/meta/types` | 200/hr | None | List distinct plan types |
| GET | `/:planId/providers` | 100/hr | None | Find providers associated with a plan |
| GET | `/:planId` | 200/hr | None | Get plan details by planId |

### GET /search

| Parameter | Type | Description |
|---|---|---|
| `query` | string | Plan name or issuer name (partial match) |
| `issuer` | string | Issuer name (partial match) |
| `state` | string | State (2-letter code) |
| `planType` | string | Plan type filter (HMO, PPO, EPO, POS) |
| `metalLevel` | string | Metal level (Bronze, Silver, Gold, Platinum, Catastrophic) |
| `year` | number | Plan year |
| `page` | number | Page number (default 1) |
| `limit` | number | Results per page (default 20, max 100) |

---

## Verification Routes

**Base path**: `/api/v1/verify`

| Method | Path | Rate Limit | Auth | CAPTCHA | Description |
|---|---|---|---|---|---|
| POST | `/` | 10/hr | None | Required | Submit a new verification |
| POST | `/:id/vote` | 10/hr | None | Required | Vote on an existing verification |
| GET | `/stats` | 200/hr | None | No | Get verification statistics |
| GET | `/recent` | 200/hr | None | No | Get recent verifications |
| GET | `/:npi/:planId` | 200/hr | None | No | Get verifications for a specific provider-plan pair |

### POST /

Submit a new community verification:

**Request body (Zod-validated):**

| Field | Type | Required | Validation |
|---|---|---|---|
| `npi` | string | Yes | 10-digit format |
| `planId` | string | Yes | Non-empty string |
| `acceptsInsurance` | boolean | Yes | true/false |
| `notes` | string | No | Max 1000 characters |
| `evidenceUrl` | string | No | Valid URL format |
| `submittedBy` | string | No | Valid email format |
| `captchaToken` | string | Yes | reCAPTCHA v3 token |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clx1abc123...",
    "npi": "1234567890",
    "planId": "12345NY0010001",
    "acceptsInsurance": true,
    "notes": "Confirmed by phone with office",
    "source": "COMMUNITY",
    "verificationType": "INSURANCE_ACCEPTANCE",
    "upvotes": 0,
    "downvotes": 0,
    "createdAt": "2026-01-15T14:30:00.000Z"
  }
}
```

**Note**: `sourceIp` and `userAgent` are captured server-side but stripped from the response by `stripVerificationPII()`.

### POST /:id/vote

Vote on a verification:

**Request body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `vote` | string | Yes | "up" or "down" |
| `captchaToken` | string | Yes | reCAPTCHA v3 token |

**Constraints**: One vote per IP per verification (enforced by unique constraint on `vote_logs(verification_id, source_ip)`).

---

## Admin Routes

**Base path**: `/api/v1/admin`

**All endpoints require**: `X-Admin-Secret` header with valid admin secret.

| Method | Path | Description |
|---|---|---|
| POST | `/cleanup-expired` | Mark expired verifications and clean up old data |
| GET | `/expiration-stats` | Statistics on verification expiration (active, expired, expiring soon) |
| GET | `/health` | Detailed system health (database connection, cache status, uptime) |
| POST | `/cache/clear` | Clear all application caches (query cache, plan cache, etc.) |
| GET | `/cache/stats` | Cache hit/miss rates and memory usage |
| GET | `/enrichment/stats` | Data enrichment pipeline statistics |
| POST | `/cleanup/sync-logs` | Delete old sync log entries beyond retention period |
| GET | `/retention/stats` | Data retention statistics (table sizes, age distributions) |
| POST | `/recalculate-confidence` | Trigger recalculation of provider confidence scores |

### Admin Authentication Flow

```
Client sends: X-Admin-Secret: <secret>
  |
  v
Is ADMIN_SECRET env var set?
  |-- No  --> 503 "Admin functionality not configured"
  |-- Yes --> Does header match? (timing-safe comparison)
                |-- No  --> 401 "Invalid admin secret"
                |-- Yes --> Proceed to handler
```

---

## Location Routes

**Base path**: `/api/v1/locations`

| Method | Path | Rate Limit | Auth | Description |
|---|---|---|---|---|
| GET | `/search` | 200/hr | None | Search practice locations by city, state, ZIP |
| GET | `/health-systems` | 200/hr | None | List health systems with location counts |
| GET | `/stats/:state` | 200/hr | None | Provider/location statistics for a state |
| GET | `/:locationId` | 200/hr | None | Get location details by ID |
| GET | `/:locationId/providers` | 200/hr | None | List providers at a specific location |

---

## Infrastructure Routes

| Method | Path | Rate Limit | Auth | Description |
|---|---|---|---|---|
| GET | `/health` | None | None | Basic health check (placed before rate limiter) |
| GET | `/` | 200/hr | None | API root / welcome message |

### GET /health

Returns:
```json
{
  "status": "ok",
  "timestamp": "2026-01-15T14:30:00.000Z",
  "uptime": 86400
}
```

This endpoint is intentionally lightweight (no database queries) and exempt from rate limiting for use by load balancers and uptime monitors.

---

## Security Summary

| Security Measure | Status | Scope |
|---|---|---|
| Rate limiting | Implemented | All endpoints (varying limits) |
| CAPTCHA (reCAPTCHA v3) | Implemented | POST verify, POST vote |
| Zod input validation | Implemented | All endpoints with parameters |
| Helmet security headers | Implemented | All responses |
| Strict CSP | Implemented | All responses |
| CORS whitelist | Implemented | All responses |
| Request ID correlation | Implemented | All requests |
| 100kb body size limit | Implemented | All POST/PUT requests |
| Timing-safe admin auth | Implemented | Admin endpoints |
| PII stripping | Implemented | Verification responses |
| SQL injection prevention | Implemented | Via Prisma ORM (parameterized queries) |

---

## Rate Limit Summary

| Endpoint Group | Limit | Window |
|---|---|---|
| Verification submit (POST /verify) | 10 requests | 1 hour |
| Vote submit (POST /verify/:id/vote) | 10 requests | 1 hour |
| Search endpoints (providers, plans) | 100 requests | 1 hour |
| All other endpoints | 200 requests | 1 hour |
| Health check (GET /health) | No limit | -- |

All rate limits are per-IP using a sliding window algorithm. See `08-rate-limiting.md` for implementation details.

---

## Error Codes

| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request failed Zod schema validation |
| `NOT_FOUND` | 404 | Resource (provider, plan, verification) not found |
| `RATE_LIMIT_EXCEEDED` | 429 | IP has exceeded rate limit for this endpoint |
| `CAPTCHA_FAILED` | 400 | reCAPTCHA verification failed or token missing |
| `DUPLICATE_VOTE` | 409 | IP has already voted on this verification |
| `ADMIN_REQUIRED` | 401 | Admin secret missing or invalid |
| `ADMIN_NOT_CONFIGURED` | 503 | ADMIN_SECRET env var not set |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
