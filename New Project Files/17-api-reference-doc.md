# VerifyMyProvider API Reference

**Generated:** 2026-02-18
**Base URL:** `https://verifymyprovider-backend-741434145252.us-central1.run.app`
**API Version:** v1
**Prefix:** `/api/v1`

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Error Handling](#error-handling)
5. [Provider Endpoints](#provider-endpoints)
6. [Plan Endpoints](#plan-endpoints)
7. [Verification Endpoints](#verification-endpoints)
8. [Location Endpoints](#location-endpoints)
9. [Auth Endpoints](#auth-endpoints)
10. [Saved Provider Endpoints](#saved-provider-endpoints)
11. [Insurance Card Endpoints](#insurance-card-endpoints)
12. [Admin Endpoints](#admin-endpoints)
13. [Health Check](#health-check)

---

## Overview

### Base URL

All API endpoints are prefixed with `/api/v1`. For example:

```
GET /api/v1/providers/search?state=NY&specialty=Cardiology
```

### Response Format

All successful responses follow the format:

```json
{
  "success": true,
  "data": { ... }
}
```

All error responses follow:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "requestId": "abc123",
    "details": []
  }
}
```

### Content Type

- **Request:** `application/json` (100kb limit; 16mb for insurance card scan)
- **Response:** `application/json`

### Request Timeout

All `/api/v1` routes have a **30-second timeout**. Search endpoints have a shorter search-specific timeout. Admin endpoints have extended timeouts for batch operations.

---

## Authentication

### Cookie-Based JWT

Authentication uses httpOnly cookies. No `Authorization` header is needed -- the cookies are sent automatically.

| Cookie | Purpose | Lifetime | Path |
|--------|---------|----------|------|
| `vmp_access_token` | JWT access token | 15 minutes | `/` |
| `vmp_refresh_token` | Refresh token | 30 days | `/api/v1/auth` |

### CSRF Protection

Mutating requests (POST, PUT, PATCH, DELETE) to protected routes require a CSRF token:

1. Fetch token: `GET /api/v1/auth/csrf-token`
2. Include header: `X-CSRF-Token: {token}`

Routes protected by CSRF:
- `/api/v1/saved-providers/*`
- `/api/v1/me/insurance-card/*`
- `/api/v1/auth/magic-link`
- `/api/v1/auth/refresh`
- `/api/v1/auth/logout`
- `/api/v1/auth/logout-all`

### Admin Authentication

Admin endpoints require the `X-Admin-Secret` header:

```
X-Admin-Secret: your-admin-secret
```

---

## Rate Limiting

Rate limits are enforced per IP address using a sliding window algorithm.

| Limiter | Limit | Window | Applied To |
|---------|-------|--------|------------|
| Default | 200 req | 1 hour | Most GET endpoints |
| Search | 100 req | 1 hour | Search endpoints |
| Verification | 10 req | 1 hour | POST /verify |
| Vote | 10 req | 1 hour | POST /verify/:id/vote |
| Magic Link | 5 req | 15 min | POST /auth/magic-link |
| Insurance Card Scan | 10 req | 1 hour | POST /me/insurance-card/scan |

### Rate Limit Headers

All rate-limited responses include:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests in window |
| `X-RateLimit-Remaining` | Requests remaining |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds until retry (only on 429) |

### 429 Response

```json
{
  "error": "Too many requests",
  "message": "Too many search requests. Please try again in 1 hour.",
  "retryAfter": 3600
}
```

---

## Error Handling

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body/params failed Zod validation |
| `DUPLICATE_ENTRY` | 409 | Record with this value already exists (Prisma P2002) |
| `NOT_FOUND` | 404 | Requested record not found |
| `ROUTE_NOT_FOUND` | 404 | API route does not exist |
| `FOREIGN_KEY_VIOLATION` | 400 | Referenced record not found (Prisma P2003) |
| `DATABASE_TIMEOUT` | 503 | Database connection pool exhausted (Prisma P2024) |
| `DATABASE_UNAVAILABLE` | 503 | Database connection failed |
| `QUERY_ERROR` | 500 | Raw query execution failed |
| `PAYLOAD_TOO_LARGE` | 413 | Request body exceeds size limit |
| `ADMIN_NOT_CONFIGURED` | 503 | ADMIN_SECRET env var not set |
| `EXTRACTION_FAILED` | 400 | Insurance card AI extraction failed |
| `INTERNAL_ERROR` | 500 | Unhandled server error |

### Validation Error Detail

```json
{
  "success": false,
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "abc123",
    "details": [
      { "field": "state", "message": "String must contain exactly 2 character(s)" },
      { "field": "page", "message": "Expected number, received nan" }
    ]
  }
}
```

---

## Provider Endpoints

### GET /api/v1/providers/search

Search providers with filters. Results cached for 5 minutes.

**Rate Limit:** 100 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| state | string(2) | No | Two-letter state code (e.g., "NY") |
| city | string | No | City name |
| cities | string | No | Comma-separated city names |
| zipCode | string | No | ZIP code (3-10 chars) |
| specialty | string | No | Specialty name |
| specialtyCategory | string | No | Specialty category |
| name | string | No | Provider name (first, last, or organization) |
| npi | string(10) | No | 10-digit NPI number |
| entityType | string | No | "INDIVIDUAL" or "ORGANIZATION" |
| page | number | No | Page number (default: 1) |
| limit | number | No | Results per page (default: 20, max: 100) |

**Response:**

```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "1234567890",
        "npi": "1234567890",
        "entityType": "INDIVIDUAL",
        "firstName": "John",
        "lastName": "Smith",
        "middleName": null,
        "namePrefix": "Dr.",
        "nameSuffix": null,
        "credential": "MD",
        "organizationName": null,
        "gender": "M",
        "addressLine1": "123 Main St",
        "addressLine2": "Suite 100",
        "city": "New York",
        "state": "NY",
        "zip": "10001",
        "phone": "2125551234",
        "fax": null,
        "taxonomyCode": "207RC0000X",
        "taxonomyDescription": "Cardiovascular Disease",
        "specialtyCategory": "Cardiology",
        "npiStatus": "ACTIVE",
        "displayName": "Dr. John Smith, MD",
        "cmsDetails": { ... },
        "hospitals": [ ... ],
        "insuranceNetworks": [ ... ],
        "medicareIds": [ ... ],
        "taxonomies": [ ... ],
        "locations": [ ... ],
        "locationCount": 2,
        "planAcceptances": [ ... ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8,
      "hasMore": true
    }
  }
}
```

**Headers:** `X-Cache: HIT` or `X-Cache: MISS`

---

### GET /api/v1/providers/cities

Get unique city names for a state.

**Rate Limit:** 200 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| state | string(2) | Yes | Two-letter state code |

**Response:**

```json
{
  "success": true,
  "data": {
    "state": "NY",
    "cities": ["New York", "Brooklyn", "Bronx", "Queens", "Staten Island"],
    "count": 5
  }
}
```

---

### GET /api/v1/providers/:npi

Get a provider by NPI with full enrichment data.

**Rate Limit:** 200 req/hr

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| npi | string(10) | Provider NPI number |

**Response:**

```json
{
  "success": true,
  "data": {
    "provider": { ... }
  }
}
```

**Errors:** 404 if provider not found.

---

### GET /api/v1/providers/:npi/colocated

Get providers at the same practice address as the given NPI.

**Rate Limit:** 200 req/hr

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| npi | string(10) | Provider NPI number |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| page | number | No | Page number (default: 1) |
| limit | number | No | Results per page (default: 20) |

**Response:**

```json
{
  "success": true,
  "data": {
    "location": {
      "addressLine1": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "healthSystem": "NYU Langone",
      "providerCount": 15
    },
    "providers": [ ... ],
    "pagination": { ... }
  }
}
```

---

### GET /api/v1/providers/:npi/plans

Get insurance plan acceptances for a provider with confidence breakdowns.

**Rate Limit:** 200 req/hr

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| npi | string(10) | Provider NPI number |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | No | Filter by acceptance status |
| minConfidence | number | No | Minimum confidence score (0-100) |
| page | number | No | Page number (default: 1) |
| limit | number | No | Results per page (default: 20) |

**Response:**

```json
{
  "success": true,
  "data": {
    "npi": "1234567890",
    "acceptances": [
      {
        "id": "123",
        "planId": "PLAN001",
        "acceptanceStatus": "ACCEPTED",
        "confidenceScore": 75,
        "confidenceLevel": "HIGH",
        "confidenceDescription": "Verified through authoritative sources...",
        "lastVerifiedAt": "2026-01-15T10:00:00Z",
        "verificationCount": 3,
        "plan": { "planId": "PLAN001", "planName": "Blue Cross PPO", ... },
        "location": { ... },
        "confidence": {
          "score": 75,
          "level": "HIGH",
          "factors": {
            "dataSourceScore": 20,
            "recencyScore": 30,
            "verificationScore": 25,
            "agreementScore": 0
          },
          "metadata": { ... }
        }
      }
    ],
    "pagination": { ... }
  }
}
```

---

### GET /api/v1/providers/map

Get providers within a geographic bounding box for map display.

**Rate Limit:** 100 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| north | number | Yes | North latitude boundary (-90 to 90) |
| south | number | Yes | South latitude boundary (-90 to 90) |
| east | number | Yes | East longitude boundary (-180 to 180) |
| west | number | Yes | West longitude boundary (-180 to 180) |
| specialty | string | No | Filter by specialty |
| specialtyCategory | string | No | Filter by specialty category |
| entityType | string | No | "INDIVIDUAL" or "ORGANIZATION" |
| limit | number | No | Max results (default: 200, max: 500) |

---

## Plan Endpoints

### GET /api/v1/plans/search

Search insurance plans.

**Rate Limit:** 100 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| issuerName | string | No | Filter by issuer name |
| planType | string | No | Filter by plan type (HMO, PPO, etc.) |
| search | string | No | Free-text search |
| state | string(2) | No | Filter by state |
| page | number | No | Page number |
| limit | number | No | Results per page |

---

### GET /api/v1/plans/grouped

Get plans grouped by carrier for dropdown display.

**Rate Limit:** 200 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| search | string | No | Filter carriers by name |
| state | string(2) | No | Filter by state |

---

### GET /api/v1/plans/meta/issuers

Get list of unique insurance issuers.

**Rate Limit:** 200 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| state | string(2) | No | Filter by state |

---

### GET /api/v1/plans/meta/types

Get available plan types.

**Rate Limit:** 200 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| state | string(2) | No | Filter by state |
| issuerName | string | No | Filter by issuer |

---

### GET /api/v1/plans/:planId

Get plan details by plan ID.

**Rate Limit:** 200 req/hr

---

### GET /api/v1/plans/:planId/providers

Get providers who accept a specific plan.

**Rate Limit:** 100 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| page | number | No | Page number |
| limit | number | No | Results per page |

---

## Verification Endpoints

### POST /api/v1/verify

Submit a verification for a provider-plan pair.

**Rate Limit:** 10 req/hr
**CAPTCHA:** Required (reCAPTCHA v3)
**Honeypot:** `website` field must be empty

**Request Body:**

```json
{
  "npi": "1234567890",
  "planId": "PLAN001",
  "acceptsInsurance": true,
  "acceptsNewPatients": true,
  "locationId": 123,
  "notes": "Called office and confirmed",
  "evidenceUrl": "https://example.com/evidence",
  "submittedBy": "user@email.com",
  "captchaToken": "recaptcha-token",
  "website": ""
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "verification": {
      "id": "clx...",
      "providerNpi": "1234567890",
      "planId": "PLAN001",
      "verificationType": "PLAN_ACCEPTANCE",
      "verificationSource": "CROWDSOURCE",
      "upvotes": 0,
      "downvotes": 0,
      "createdAt": "2026-02-18T12:00:00Z"
    },
    "acceptance": {
      "confidenceScore": 45,
      "confidenceLevel": "MEDIUM",
      "confidence": { ... }
    },
    "message": "Verification submitted successfully"
  }
}
```

---

### POST /api/v1/verify/:verificationId/vote

Vote on an existing verification (upvote or downvote).

**Rate Limit:** 10 req/hr
**CAPTCHA:** Required
**Honeypot:** `website` field must be empty

**Request Body:**

```json
{
  "vote": "up",
  "captchaToken": "recaptcha-token",
  "website": ""
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "verification": {
      "id": "clx...",
      "upvotes": 5,
      "downvotes": 1,
      "netVotes": 4
    },
    "message": "Vote recorded: up"
  }
}
```

---

### GET /api/v1/verify/stats

Get verification statistics.

**Rate Limit:** 200 req/hr

---

### GET /api/v1/verify/recent

Get recent verifications.

**Rate Limit:** 200 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| limit | number | No | Max results (default: 20, max: 100) |
| npi | string(10) | No | Filter by provider NPI |
| planId | string | No | Filter by plan ID |

---

### GET /api/v1/verify/:npi/:planId

Get verifications for a specific provider-plan pair with confidence breakdown.

**Rate Limit:** 200 req/hr

---

## Location Endpoints

### GET /api/v1/locations/search

Search practice locations.

**Rate Limit:** 100 req/hr (search limiter)

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| state | string(2) | Yes | Two-letter state code |
| city | string | No | City name |
| zipCode | string | No | ZIP code |
| page | number | No | Page number |
| limit | number | No | Results per page |

---

### GET /api/v1/locations/health-systems

Get distinct health system names.

**Rate Limit:** 200 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| state | string(2) | No | Filter by state |
| city | string | No | Filter by city |

---

### GET /api/v1/locations/stats/:state

Get location statistics for a state.

**Rate Limit:** 200 req/hr

---

### GET /api/v1/locations/:locationId

Get a practice location by ID.

**Rate Limit:** 200 req/hr

---

### GET /api/v1/locations/:locationId/providers

Get all providers at a location.

**Rate Limit:** 200 req/hr

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| page | number | No | Page number |
| limit | number | No | Results per page |

---

## Auth Endpoints

### GET /api/v1/auth/csrf-token

Get a CSRF token for mutating requests.

**Response:**

```json
{
  "success": true,
  "csrfToken": "token-value"
}
```

---

### POST /api/v1/auth/magic-link

Request a magic link login email.

**Rate Limit:** 5 req/15 min
**CSRF:** Required

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Response:** Always returns success (prevents email enumeration).

```json
{
  "success": true,
  "message": "If this email is valid, you'll receive a login link."
}
```

---

### GET /api/v1/auth/verify

Verify a magic link token (browser navigation from email link). Redirects to frontend.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | Magic link token |

**Success:** Redirects to `/saved-providers` with auth cookies set.
**Failure:** Redirects to `/login?error=expired|used|invalid`.

---

### POST /api/v1/auth/refresh

Refresh the access token using the refresh token cookie.

**CSRF:** Required

---

### POST /api/v1/auth/logout

Log out the current session.

**Auth:** Required
**CSRF:** Required

---

### POST /api/v1/auth/logout-all

Invalidate all sessions for the current user.

**Auth:** Required
**CSRF:** Required

---

### GET /api/v1/auth/me

Get the current authenticated user's profile.

**Auth:** Required

---

### GET /api/v1/auth/export

Export all user data (GDPR data portability).

**Auth:** Required

---

## Saved Provider Endpoints

All endpoints require CSRF protection on mutating requests.

### GET /api/v1/saved-providers

List saved providers (paginated).

**Auth:** Required
**Rate Limit:** 200 req/hr

---

### POST /api/v1/saved-providers

Save (bookmark) a provider. Idempotent.

**Auth:** Required
**CSRF:** Required
**Rate Limit:** 200 req/hr

**Request Body:**

```json
{
  "npi": "1234567890"
}
```

---

### DELETE /api/v1/saved-providers/:npi

Remove a saved provider. Idempotent.

**Auth:** Required
**CSRF:** Required
**Rate Limit:** 200 req/hr

---

### GET /api/v1/saved-providers/:npi/status

Check if a provider is saved. Returns `{ saved: false }` for anonymous users (no 401).

**Rate Limit:** 200 req/hr

---

## Insurance Card Endpoints

All endpoints require CSRF protection and authentication.

### POST /api/v1/me/insurance-card/scan

Scan a card image and extract data via Claude AI.

**Auth:** Required
**CSRF:** Required
**Rate Limit:** 10 req/hr per user
**Body Limit:** 16mb

**Request Body:**

```json
{
  "imageBase64": "base64-encoded-image-data",
  "mimeType": "image/jpeg"
}
```

Supported MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`

---

### POST /api/v1/me/insurance-card/save

Save already-extracted card data.

**Auth:** Required
**CSRF:** Required

---

### GET /api/v1/me/insurance-card

Get the user's saved insurance card.

**Auth:** Required

---

### PATCH /api/v1/me/insurance-card

Update specific fields on the saved card.

**Auth:** Required
**CSRF:** Required

---

### DELETE /api/v1/me/insurance-card

Delete the saved insurance card.

**Auth:** Required
**CSRF:** Required

---

## Admin Endpoints

All admin endpoints require the `X-Admin-Secret` header. Returns 503 if `ADMIN_SECRET` is not configured.

### POST /api/v1/admin/cleanup-expired

Clean up expired verification records.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| dryRun | string | "false" | Set to "true" for preview only |
| batchSize | number | 1000 | Records per batch |

---

### POST /api/v1/admin/cleanup-sessions

Delete expired sessions.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| dryRun | string | "false" | Set to "true" for preview only |

---

### GET /api/v1/admin/expiration-stats

Get verification expiration statistics.

---

### GET /api/v1/admin/health

Detailed health check with retention metrics, cache stats, and database status.

---

### POST /api/v1/admin/cache/clear

Clear all cached data. Use after data imports.

---

### GET /api/v1/admin/cache/stats

Get cache hit/miss statistics and hit rate.

---

### GET /api/v1/admin/enrichment/stats

Get location enrichment statistics.

---

### POST /api/v1/admin/cleanup/sync-logs

Clean up sync logs older than retention period.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| dryRun | string | "false" | Preview only |
| retentionDays | number | 90 | Days to retain |

---

### GET /api/v1/admin/retention/stats

Get comprehensive retention statistics for all log types.

---

### POST /api/v1/admin/recalculate-confidence

Recalculate confidence scores with time-based decay.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| dryRun | string | "false" | Preview only |
| limit | number | all | Max records to process |

---

### POST /api/v1/admin/rotate-encryption-key

Re-encrypt all insurance card PII with the current primary key.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| dryRun | string | "false" | Preview only |
| batchSize | number | 50 | Records per batch |

---

## Health Check

### GET /health

System health check. Not rate-limited.

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2026-02-18T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "memory": {
    "heapUsed": 45,
    "heapTotal": 65,
    "unit": "MB"
  },
  "checks": {
    "database": "healthy"
  },
  "databaseResponseTime": "5ms",
  "cache": {
    "hits": 150,
    "misses": 30,
    "size": 25,
    "mode": "memory",
    "hitRate": "83.3%"
  }
}
```

**Response (503) -- Degraded:**

```json
{
  "status": "degraded",
  "checks": {
    "database": "unhealthy"
  },
  "error": "Database connection failed"
}
```
