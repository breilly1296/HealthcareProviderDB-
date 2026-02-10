# API Reference - VerifyMyProvider

## Overview

VerifyMyProvider exposes a RESTful API served by an Express backend. All public endpoints are rate-limited per IP address using a dual-mode system (Redis when available, in-memory fallback). Admin endpoints require a shared secret via the `X-Admin-Secret` header.

**Base URL (Production):** `https://verifymyprovider-<hash>.run.app/api`
**Base URL (Local):** `http://localhost:3001/api`

---

## Rate Limit Headers

All rate-limited responses include these headers:

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds until the next request is allowed (only on 429 responses) |

When the rate limit is exceeded, the API returns:

```json
{
  "error": "Too many requests",
  "retryAfter": 3600
}
```

**HTTP Status:** `429 Too Many Requests`

---

## Error Response Format

All errors follow a consistent structure:

```json
{
  "error": "Human-readable error message",
  "details": "Optional additional context"
}
```

Common HTTP status codes:

| Status | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request / validation error |
| `403` | Forbidden (CAPTCHA failed, admin auth failed) |
| `404` | Resource not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `503` | Service unavailable (e.g., ADMIN_SECRET not configured) |

---

## CAPTCHA Requirements

Endpoints that accept user-generated content require a **reCAPTCHA v3** token:

- Token must be sent in the request body as `captchaToken`
- Minimum score threshold is enforced server-side
- Failed CAPTCHA returns `403` with `"error": "CAPTCHA verification failed"`
- CAPTCHA-protected endpoints: `POST /api/verifications`, `POST /api/verifications/:id/vote`

---

## Public Endpoints (21 Total)

### Provider Routes (4 endpoints)

#### GET /api/providers/search

Search for providers by name, specialty, location, or NPI.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | No | Free-text search (name, NPI, specialty) |
| `specialty` | string | No | Filter by specialty category |
| `state` | string | No | Filter by state (2-letter code) |
| `city` | string | No | Filter by city name |
| `zip` | string | No | Filter by ZIP code |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (default: 20, max: 100) |

**Rate Limit:** 100 requests/hour per IP

**Response:**
```json
{
  "providers": [
    {
      "npi": "1234567890",
      "firstName": "Jane",
      "lastName": "Smith",
      "credential": "MD",
      "primarySpecialty": "Internal Medicine",
      "specialtyCategory": "Internal Medicine",
      "confidenceScore": 0.85,
      "verificationCount": 12,
      "practiceLocations": [...]
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

---

#### GET /api/providers/cities

Get a list of cities with provider counts, optionally filtered by state.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `state` | string | No | Filter by state (2-letter code) |

**Rate Limit:** 200 requests/hour per IP

**Response:**
```json
{
  "cities": [
    { "city": "New York", "state": "NY", "count": 45000 },
    { "city": "Brooklyn", "state": "NY", "count": 12000 }
  ]
}
```

---

#### GET /api/providers/:npi/colocated

Get providers who share a practice location with the given provider.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `npi` | path | Yes | 10-digit NPI number |

**Rate Limit:** 200 requests/hour per IP

**Response:**
```json
{
  "colocatedProviders": [
    {
      "npi": "9876543210",
      "firstName": "John",
      "lastName": "Doe",
      "primarySpecialty": "Cardiology",
      "sharedLocation": {
        "addressLine1": "123 Main St",
        "city": "New York",
        "state": "NY"
      }
    }
  ]
}
```

---

#### GET /api/providers/:npi

Get detailed information for a single provider by NPI.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `npi` | path | Yes | 10-digit NPI number |

**Rate Limit:** 200 requests/hour per IP

**Response:**
```json
{
  "npi": "1234567890",
  "firstName": "Jane",
  "lastName": "Smith",
  "credential": "MD",
  "gender": "F",
  "entityType": "Individual",
  "primarySpecialty": "Internal Medicine",
  "primaryTaxonomyCode": "207R00000X",
  "specialtyCategory": "Internal Medicine",
  "providerProfileUrl": "https://example.com/dr-smith",
  "profileUrlVerified": true,
  "confidenceScore": 0.85,
  "verificationCount": 12,
  "lastUpdated": "2026-01-15T00:00:00.000Z",
  "practiceLocations": [...],
  "cmsDetails": {...},
  "hospitals": [...],
  "taxonomies": [...],
  "medicare": [...]
}
```

---

### Plan Routes (6 endpoints)

#### GET /api/plans/search

Search for insurance plans by name, issuer, state, or type.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | No | Free-text search (plan name, issuer) |
| `state` | string | No | Filter by state (2-letter code) |
| `type` | string | No | Filter by plan type (HMO, PPO, EPO, POS) |
| `metalLevel` | string | No | Filter by metal level (Bronze, Silver, Gold, Platinum, Catastrophic) |
| `issuer` | string | No | Filter by issuer name |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (default: 20, max: 100) |

**Rate Limit:** 100 requests/hour per IP

---

#### GET /api/plans/grouped

Get plans grouped by issuer.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `state` | string | No | Filter by state |

**Rate Limit:** 200 requests/hour per IP

---

#### GET /api/plans/meta/issuers

Get a list of all insurance issuers.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `state` | string | No | Filter by state |

**Rate Limit:** 200 requests/hour per IP

**Response:**
```json
{
  "issuers": [
    { "issuerName": "Aetna", "planCount": 45 },
    { "issuerName": "UnitedHealthcare", "planCount": 120 }
  ]
}
```

---

#### GET /api/plans/meta/types

Get a list of all plan types with counts.

**Rate Limit:** 200 requests/hour per IP

**Response:**
```json
{
  "types": [
    { "type": "PPO", "count": 500 },
    { "type": "HMO", "count": 300 }
  ]
}
```

---

#### GET /api/plans/:planId/providers

Get providers associated with a specific plan.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `planId` | path | Yes | Plan identifier |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (default: 20) |

**Rate Limit:** 100 requests/hour per IP

---

#### GET /api/plans/:planId

Get detailed information for a specific plan.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `planId` | path | Yes | Plan identifier |

**Rate Limit:** 200 requests/hour per IP

---

### Verification Routes (5 endpoints)

#### POST /api/verifications

Submit a new verification for a provider-plan relationship.

**Requires CAPTCHA:** Yes

| Body Field | Type | Required | Description |
|---|---|---|---|
| `npi` | string | Yes | 10-digit NPI number |
| `planId` | string | Yes | Plan identifier |
| `acceptsInsurance` | boolean | Yes | Whether the provider accepts this plan |
| `notes` | string | No | Optional notes (max 500 chars) |
| `evidenceUrl` | string | No | URL to supporting evidence |
| `captchaToken` | string | Yes | reCAPTCHA v3 token |

**Rate Limit:** 10 requests/hour per IP

**Response (201):**
```json
{
  "id": "clxyz...",
  "npi": "1234567890",
  "planId": "12345NY0010001",
  "acceptsInsurance": true,
  "notes": "Confirmed via phone call",
  "createdAt": "2026-01-20T12:00:00.000Z"
}
```

---

#### POST /api/verifications/:id/vote

Vote on an existing verification (agree or disagree).

**Requires CAPTCHA:** Yes

| Body Field | Type | Required | Description |
|---|---|---|---|
| `vote` | string | Yes | `"agree"` or `"disagree"` |
| `captchaToken` | string | Yes | reCAPTCHA v3 token |

**Rate Limit:** 10 requests/hour per IP

**Response (201):**
```json
{
  "id": "clxyz...",
  "verificationId": "clabc...",
  "vote": "agree",
  "createdAt": "2026-01-20T12:30:00.000Z"
}
```

---

#### GET /api/verifications/stats

Get global verification statistics.

**Rate Limit:** 200 requests/hour per IP

**Response:**
```json
{
  "totalVerifications": 1500,
  "totalVotes": 4200,
  "verifiedProviderPlans": 800,
  "averageConfidence": 0.72
}
```

---

#### GET /api/verifications/recent

Get recently submitted verifications.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `limit` | number | No | Number of results (default: 10, max: 50) |

**Rate Limit:** 200 requests/hour per IP

---

#### GET /api/verifications/:npi/:planId

Get verification status for a specific provider-plan pair.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `npi` | path | Yes | 10-digit NPI number |
| `planId` | path | Yes | Plan identifier |

**Rate Limit:** 200 requests/hour per IP

**Response:**
```json
{
  "npi": "1234567890",
  "planId": "12345NY0010001",
  "verifications": [...],
  "aggregated": {
    "totalVerifications": 5,
    "acceptsCount": 4,
    "rejectsCount": 1,
    "confidenceScore": 0.80,
    "lastVerified": "2026-01-20T12:00:00.000Z"
  }
}
```

---

### Location Routes (5 endpoints)

#### GET /api/locations/search

Search for practice locations.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | No | Free-text search (address, city) |
| `state` | string | No | Filter by state |
| `city` | string | No | Filter by city |
| `zip` | string | No | Filter by ZIP code |

**Rate Limit:** 200 requests/hour per IP

---

#### GET /api/locations/health-systems

Get a list of health systems.

**Rate Limit:** 200 requests/hour per IP

---

#### GET /api/locations/stats/:state

Get location statistics for a given state.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `state` | path | Yes | 2-letter state code |

**Rate Limit:** 200 requests/hour per IP

---

#### GET /api/locations/:locationId

Get details for a specific practice location.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `locationId` | path | Yes | Location identifier |

**Rate Limit:** 200 requests/hour per IP

---

#### GET /api/locations/:locationId/providers

Get providers at a specific practice location.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `locationId` | path | Yes | Location identifier |

**Rate Limit:** 200 requests/hour per IP

---

### Health Check (1 endpoint)

#### GET /api/health

Returns basic health status. No rate limit applied.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-20T12:00:00.000Z"
}
```

---

## Admin Endpoints (9 Total)

All admin endpoints require the `X-Admin-Secret` header matching the `ADMIN_SECRET` environment variable. If `ADMIN_SECRET` is not configured on the server, all admin endpoints return `503 Service Unavailable` (this is intentional -- admin functionality is disabled until explicitly configured).

Authentication uses timing-safe string comparison to prevent timing attacks.

**Failed auth response (403):**
```json
{
  "error": "Unauthorized"
}
```

**ADMIN_SECRET not configured response (503):**
```json
{
  "error": "Admin functionality not available"
}
```

---

#### POST /api/admin/cleanup-expired

Manually trigger cleanup of expired verifications (those past their 6-month TTL).

**Response:**
```json
{
  "cleaned": 42,
  "message": "Expired verifications cleaned up"
}
```

---

#### GET /api/admin/expiration-stats

Get statistics about verification expiration status.

**Response:**
```json
{
  "total": 1500,
  "expired": 42,
  "expiringIn30Days": 15,
  "active": 1443
}
```

---

#### GET /api/admin/health

Detailed health check including database connectivity, Redis status, and system metrics.

**Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "uptime": 86400,
  "memoryUsage": {...}
}
```

---

#### POST /api/admin/cache/clear

Clear the application cache (Redis or in-memory).

**Response:**
```json
{
  "message": "Cache cleared",
  "keysRemoved": 150
}
```

---

#### GET /api/admin/cache/stats

Get cache statistics (hit rate, size, keys).

**Response:**
```json
{
  "hits": 5000,
  "misses": 200,
  "hitRate": 0.96,
  "keys": 150,
  "memoryUsage": "2.5MB"
}
```

---

#### GET /api/admin/enrichment/stats

Get statistics about provider data enrichment (profile URLs, specialty mapping).

**Response:**
```json
{
  "totalProviders": 2100000,
  "enrichedUrls": 15000,
  "verifiedUrls": 8000,
  "specialtiesMapped": 2050000
}
```

---

#### POST /api/admin/cleanup/sync-logs

Clean up old synchronization logs.

**Response:**
```json
{
  "cleaned": 100,
  "message": "Sync logs cleaned up"
}
```

---

#### GET /api/admin/retention/stats

Get data retention statistics (verification TTLs, data age).

**Response:**
```json
{
  "verifications": {
    "total": 1500,
    "averageAge": "45 days",
    "oldestActive": "2025-08-01T00:00:00.000Z"
  }
}
```

---

#### POST /api/admin/recalculate-confidence

Trigger recalculation of confidence scores across all provider-plan pairs.

**Response:**
```json
{
  "recalculated": 800,
  "message": "Confidence scores recalculated"
}
```

---

## Summary Table

| Category | Endpoint | Method | Rate Limit | Auth |
|---|---|---|---|---|
| **Providers** | `/api/providers/search` | GET | 100/hr | None |
| | `/api/providers/cities` | GET | 200/hr | None |
| | `/api/providers/:npi/colocated` | GET | 200/hr | None |
| | `/api/providers/:npi` | GET | 200/hr | None |
| **Plans** | `/api/plans/search` | GET | 100/hr | None |
| | `/api/plans/grouped` | GET | 200/hr | None |
| | `/api/plans/meta/issuers` | GET | 200/hr | None |
| | `/api/plans/meta/types` | GET | 200/hr | None |
| | `/api/plans/:planId/providers` | GET | 100/hr | None |
| | `/api/plans/:planId` | GET | 200/hr | None |
| **Verifications** | `/api/verifications` | POST | 10/hr | CAPTCHA |
| | `/api/verifications/:id/vote` | POST | 10/hr | CAPTCHA |
| | `/api/verifications/stats` | GET | 200/hr | None |
| | `/api/verifications/recent` | GET | 200/hr | None |
| | `/api/verifications/:npi/:planId` | GET | 200/hr | None |
| **Locations** | `/api/locations/search` | GET | 200/hr | None |
| | `/api/locations/health-systems` | GET | 200/hr | None |
| | `/api/locations/stats/:state` | GET | 200/hr | None |
| | `/api/locations/:locationId` | GET | 200/hr | None |
| | `/api/locations/:locationId/providers` | GET | 200/hr | None |
| **Health** | `/api/health` | GET | None | None |
| **Admin** | `/api/admin/cleanup-expired` | POST | None | X-Admin-Secret |
| | `/api/admin/expiration-stats` | GET | None | X-Admin-Secret |
| | `/api/admin/health` | GET | None | X-Admin-Secret |
| | `/api/admin/cache/clear` | POST | None | X-Admin-Secret |
| | `/api/admin/cache/stats` | GET | None | X-Admin-Secret |
| | `/api/admin/enrichment/stats` | GET | None | X-Admin-Secret |
| | `/api/admin/cleanup/sync-logs` | POST | None | X-Admin-Secret |
| | `/api/admin/retention/stats` | GET | None | X-Admin-Secret |
| | `/api/admin/recalculate-confidence` | POST | None | X-Admin-Secret |
