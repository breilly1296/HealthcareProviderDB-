# API Reference

**Last Updated:** 2026-02-05
**Generated From:** prompts/17-api-reference-doc.md

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Common Response Format](#3-common-response-format)
4. [Error Handling](#4-error-handling)
5. [Rate Limiting](#5-rate-limiting)
6. [CAPTCHA Protection](#6-captcha-protection)
7. [Provider Endpoints](#7-provider-endpoints)
8. [Plan Endpoints](#8-plan-endpoints)
9. [Verification Endpoints](#9-verification-endpoints)
10. [Admin Endpoints](#10-admin-endpoints)
11. [Health Check](#11-health-check)
12. [Validation Schemas](#12-validation-schemas)

---

## 1. Overview

**Base URL:** `/api/v1`

The VerifyMyProvider API is a RESTful JSON API built on Express.js. All endpoints are prefixed with `/api/v1/` except the health check (`/health`) and root info (`/`).

### Endpoint Summary

| Method | Endpoint | Rate Limit | CAPTCHA | Auth | Purpose |
|--------|----------|------------|---------|------|---------|
| GET | `/health` | None | No | None | Health check |
| GET | `/` | 200/hr | No | None | API info |
| GET | `/api/v1/providers/search` | 100/hr | No | None | Search providers |
| GET | `/api/v1/providers/cities` | 200/hr | No | None | Cities by state |
| GET | `/api/v1/providers/:npi` | 200/hr | No | None | Provider detail |
| GET | `/api/v1/plans/search` | 100/hr | No | None | Search plans |
| GET | `/api/v1/plans/grouped` | 200/hr | No | None | Plans grouped by carrier |
| GET | `/api/v1/plans/meta/issuers` | 200/hr | No | None | Issuer list |
| GET | `/api/v1/plans/meta/types` | 200/hr | No | None | Plan type list |
| GET | `/api/v1/plans/:planId/providers` | 100/hr | No | None | Providers for a plan |
| GET | `/api/v1/plans/:planId` | 200/hr | No | None | Plan detail |
| POST | `/api/v1/verify` | 10/hr | Yes | None | Submit verification |
| POST | `/api/v1/verify/:verificationId/vote` | 10/hr | Yes | None | Vote on verification |
| GET | `/api/v1/verify/stats` | 200/hr | No | None | Verification statistics |
| GET | `/api/v1/verify/recent` | 200/hr | No | None | Recent verifications |
| GET | `/api/v1/verify/:npi/:planId` | 200/hr | No | None | Pair verifications |
| POST | `/api/v1/admin/cleanup-expired` | 200/hr | No | Admin | Clean expired records |
| GET | `/api/v1/admin/expiration-stats` | 200/hr | No | Admin | Expiration statistics |
| GET | `/api/v1/admin/health` | 200/hr | No | Admin | Admin health + metrics |
| POST | `/api/v1/admin/cache/clear` | 200/hr | No | Admin | Clear cache |
| GET | `/api/v1/admin/cache/stats` | 200/hr | No | Admin | Cache statistics |
| POST | `/api/v1/admin/cleanup/sync-logs` | 200/hr | No | Admin | Clean old sync logs |
| GET | `/api/v1/admin/retention/stats` | 200/hr | No | Admin | Retention statistics |

---

## 2. Authentication

### Public Endpoints

Most endpoints require no authentication. All provider, plan, and verification read endpoints are publicly accessible.

### Admin Endpoints

Admin endpoints require the `X-Admin-Secret` header:

```
X-Admin-Secret: <your-admin-secret>
```

The secret is validated using timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing attacks. If `ADMIN_SECRET` is not configured on the server, admin endpoints return `503 Service Unavailable`.

**Error responses:**

| Scenario | Status | Code |
|----------|--------|------|
| ADMIN_SECRET not set on server | 503 | `ADMIN_NOT_CONFIGURED` |
| Header missing or invalid | 401 | (Unauthorized) |

---

## 3. Common Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    // Endpoint-specific data
  }
}
```

### Paginated Response

```json
{
  "success": true,
  "data": {
    "providers": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### Cache Headers

Search endpoints include a cache indicator header:

| Header | Value | Meaning |
|--------|-------|---------|
| `X-Cache` | `HIT` | Response served from cache |
| `X-Cache` | `MISS` | Response served from database |

---

## 4. Error Handling

### Error Response Format

```json
{
  "error": {
    "message": "Human-readable error description",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "requestId": "abc-123"
  }
}
```

### Validation Error Format (Zod)

```json
{
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "abc-123",
    "details": [
      {
        "field": "state",
        "message": "String must contain exactly 2 character(s)"
      }
    ]
  }
}
```

### Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `VALIDATION_ERROR` | Zod validation failed (includes field-level details) |
| 400 | (varies) | Bad request (invalid CAPTCHA token, etc.) |
| 401 | (varies) | Invalid or missing admin secret |
| 403 | (varies) | CAPTCHA score too low (suspected bot) |
| 404 | `NOT_FOUND` | Resource not found |
| 404 | `ROUTE_NOT_FOUND` | Route does not exist |
| 409 | `DUPLICATE_ENTRY` | Prisma unique constraint violation |
| 413 | `PAYLOAD_TOO_LARGE` | Request body exceeds 100kb |
| 429 | (varies) | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `ADMIN_NOT_CONFIGURED` | ADMIN_SECRET env var not set |

### Rate Limit Error

```json
{
  "error": "Too many requests",
  "message": "Too many search requests. Please try again in 1 hour.",
  "retryAfter": 3600
}
```

Rate limit headers are always included on every response:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds to wait (only on 429 responses) |

---

## 5. Rate Limiting

The API uses a sliding window algorithm for rate limiting. Two backends are supported:

- **Redis** (distributed): When `REDIS_URL` is configured. Uses sorted sets for sliding window. Supports horizontal scaling.
- **In-Memory** (process-local): Fallback when Redis is unavailable. Only safe for single-instance deployments.

If Redis becomes unavailable during operation, the rate limiter **fails open** (allows requests with `X-RateLimit-Status: degraded` header).

### Rate Limit Tiers

| Tier | Limit | Window | Applied To |
|------|-------|--------|------------|
| `default` | 200 requests | 1 hour | General API routes |
| `search` | 100 requests | 1 hour | Search endpoints |
| `verification` | 10 requests | 1 hour | Verification submission |
| `vote` | 10 requests | 1 hour | Vote submission |

The health check endpoint (`GET /health`) is exempt from rate limiting.

---

## 6. CAPTCHA Protection

Endpoints that modify data require a Google reCAPTCHA v3 token.

### Sending the Token

Include the token in the request body or as a header:

- **Body:** `{ "captchaToken": "<token>" }`
- **Header:** `X-Captcha-Token: <token>`

### Behavior by Environment

| Environment | Behavior |
|-------------|----------|
| `development` | CAPTCHA check skipped |
| `test` | CAPTCHA check skipped |
| Production (no `RECAPTCHA_SECRET_KEY`) | CAPTCHA check skipped with warning |
| Production (configured) | Full verification against Google API |

### Score Threshold

reCAPTCHA v3 returns a score from 0.0 (likely bot) to 1.0 (likely human). Requests below the configured minimum score (`CAPTCHA_MIN_SCORE`) receive a `403 Forbidden` response.

### Fail Mode

When Google's reCAPTCHA API is unavailable:

| Mode | Behavior |
|------|----------|
| `open` (default) | Allow request with stricter fallback rate limiting (3 req/hr) |
| `closed` | Block all requests with `503 Service Unavailable` |

Configure via `CAPTCHA_FAIL_MODE=open|closed` environment variable.

---

## 7. Provider Endpoints

### GET /api/v1/providers/search

Search providers with filters. Results are cached for 5 minutes.

**Rate Limit:** 100 req/hr (search tier)

**Query Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `state` | string | No | Exactly 2 chars, uppercased | State code (e.g., `CA`, `NY`) |
| `city` | string | No | 1-100 chars | City name |
| `cities` | string | No | 1-500 chars | Comma-separated city list |
| `zipCode` | string | No | 3-10 chars | ZIP code |
| `specialty` | string | No | 1-200 chars | Specialty / taxonomy description |
| `specialtyCategory` | string | No | 1-100 chars | Specialty category |
| `name` | string | No | 1-200 chars | Provider name (first, last, or organization) |
| `npi` | string | No | Exactly 10 digits | NPI number |
| `entityType` | string | No | `INDIVIDUAL` or `ORGANIZATION` | Provider type |
| `page` | number | No | Min 1, default 1 | Page number |
| `limit` | number | No | 1-100, default 20 | Results per page |

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
        "addressLine1": "123 Medical Dr",
        "addressLine2": "Suite 100",
        "city": "Los Angeles",
        "state": "CA",
        "zip": "90001",
        "phone": "3105551234",
        "fax": null,
        "taxonomyCode": "207R00000X",
        "taxonomyDescription": "Internal Medicine",
        "specialtyCategory": "Allopathic & Osteopathic Physicians",
        "npiStatus": "ACTIVE",
        "displayName": "Dr. John Smith, MD",
        "cmsDetails": {
          "group_practice_name": "Smith Medical Group",
          "medical_school": "Johns Hopkins",
          "graduation_year": "2005",
          "medicare_assignment": "Y",
          "telehealth": "Y"
        },
        "hospitals": [],
        "insuranceNetworks": [],
        "medicareIds": [],
        "taxonomies": [],
        "locations": []
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "totalPages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

---

### GET /api/v1/providers/cities

Get unique cities for a state (used for search autocomplete).

**Rate Limit:** 200 req/hr (default tier)

**Query Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `state` | string | Yes | Exactly 2 chars, uppercased | State code |

**Response:**

```json
{
  "success": true,
  "data": {
    "state": "CA",
    "cities": ["Los Angeles", "San Francisco", "San Diego", "..."],
    "count": 482
  }
}
```

---

### GET /api/v1/providers/:npi

Get a single provider by NPI with full enrichment data.

**Rate Limit:** 200 req/hr (default tier)

**Path Parameters:**

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `npi` | string | Exactly 10 digits | National Provider Identifier |

**Response:** Same provider object shape as search results, wrapped in `{ success: true, data: { provider: {...} } }`.

**Error:** `404` if provider not found.

---

## 8. Plan Endpoints

### GET /api/v1/plans/search

Search insurance plans with filters.

**Rate Limit:** 100 req/hr (search tier)

**Query Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `issuerName` | string | No | 1-200 chars | Insurance issuer/carrier name |
| `planType` | string | No | 1-20 chars | Plan type (e.g., `HMO`, `PPO`) |
| `search` | string | No | 1-200 chars | Free-text search across plan fields |
| `state` | string | No | Exactly 2 chars, uppercased | State code |
| `page` | number | No | Min 1, default 1 | Page number |
| `limit` | number | No | 1-100, default 20 | Results per page |

**Response:**

```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "planId": "12345CA0010001",
        "planName": "Blue Shield Gold PPO",
        "issuerName": "Blue Shield of California",
        "planType": "PPO",
        "state": "CA",
        "carrier": "Blue Shield",
        "planVariant": "Gold",
        "rawName": "Blue Shield Gold PPO 250/30",
        "sourceHealthSystem": null,
        "providerCount": 15420,
        "carrierId": 1,
        "healthSystemId": null,
        "createdAt": "2025-01-15T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 85,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

---

### GET /api/v1/plans/grouped

Get plans grouped by carrier for dropdown/select UI components.

**Rate Limit:** 200 req/hr (default tier)

**Query Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `search` | string | No | 1-200 chars | Filter plans by name |
| `state` | string | No | Exactly 2 chars, uppercased | Filter by state |

**Response:**

```json
{
  "success": true,
  "data": {
    // Grouped plan data (structure depends on planService implementation)
  }
}
```

---

### GET /api/v1/plans/meta/issuers

Get list of unique insurance issuers.

**Rate Limit:** 200 req/hr (default tier)

**Query Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `state` | string | No | Exactly 2 chars, uppercased | Filter issuers by state |

**Response:**

```json
{
  "success": true,
  "data": {
    "issuers": ["Aetna", "Blue Cross", "Cigna", "UnitedHealthcare", "..."],
    "count": 42
  }
}
```

---

### GET /api/v1/plans/meta/types

Get list of available plan types.

**Rate Limit:** 200 req/hr (default tier)

**Query Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `state` | string | No | Exactly 2 chars, uppercased | Filter by state |
| `issuerName` | string | No | 1-200 chars | Filter by issuer |

**Response:**

```json
{
  "success": true,
  "data": {
    "planTypes": ["EPO", "HMO", "POS", "PPO"],
    "count": 4
  }
}
```

---

### GET /api/v1/plans/:planId/providers

Get providers who accept a specific plan. Includes confidence score and verification data.

**Rate Limit:** 100 req/hr (search tier)

**Path Parameters:**

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `planId` | string | 1-50 chars | Insurance plan identifier |

**Query Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `page` | number | No | Min 1, default 1 | Page number |
| `limit` | number | No | 1-100, default 20 | Results per page |

**Response:**

```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "1234567890",
        "npi": "1234567890",
        "entityType": "1",
        "firstName": "John",
        "lastName": "Smith",
        "middleName": null,
        "credential": null,
        "organizationName": null,
        "addressLine1": null,
        "addressLine2": null,
        "city": "Los Angeles",
        "state": "CA",
        "zip": null,
        "phone": "3105551234",
        "taxonomyCode": null,
        "taxonomyDescription": "Internal Medicine",
        "specialtyCategory": null,
        "npiStatus": "ACTIVE",
        "displayName": "Dr. John Smith",
        "confidenceScore": 75,
        "lastVerified": "2026-01-20T00:00:00.000Z",
        "verificationCount": 3
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

**Error:** `404` if plan not found.

---

### GET /api/v1/plans/:planId

Get a single plan by its plan ID.

**Rate Limit:** 200 req/hr (default tier)

**Path Parameters:**

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `planId` | string | 1-50 chars | Insurance plan identifier |

**Response:**

```json
{
  "success": true,
  "data": {
    "plan": {
      "planId": "12345CA0010001",
      "planName": "Blue Shield Gold PPO",
      "issuerName": "Blue Shield of California",
      "planType": "PPO",
      "state": "CA",
      "carrier": "Blue Shield",
      "planVariant": "Gold",
      "rawName": "Blue Shield Gold PPO 250/30",
      "sourceHealthSystem": null,
      "providerCount": 15420,
      "carrierId": 1,
      "healthSystemId": null,
      "createdAt": "2025-01-15T00:00:00.000Z"
    }
  }
}
```

**Error:** `404` if plan not found.

---

## 9. Verification Endpoints

### POST /api/v1/verify

Submit a new verification for a provider-plan pair. Creates or updates the acceptance record and calculates a confidence score.

**Rate Limit:** 10 req/hr (verification tier)
**CAPTCHA:** Required (reCAPTCHA v3)

**Request Body:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `npi` | string | Yes | Exactly 10 digits | Provider NPI |
| `planId` | string | Yes | 1-50 chars | Insurance plan ID |
| `acceptsInsurance` | boolean | Yes | - | Does the provider accept this plan? |
| `acceptsNewPatients` | boolean | No | - | Accepting new patients? |
| `locationId` | number | No | Positive integer | Specific practice location |
| `notes` | string | No | Max 1000 chars | Additional notes |
| `evidenceUrl` | string | No | Valid URL, max 500 chars | Supporting evidence link |
| `submittedBy` | string | No | Valid email, max 200 chars | Submitter email (optional) |
| `captchaToken` | string | No* | - | reCAPTCHA v3 token (*required in production) |

**Response:**

```json
{
  "success": true,
  "data": {
    "verification": {
      "id": "clxxxx...",
      "providerNpi": "1234567890",
      "planId": "12345CA0010001",
      "verificationType": "PLAN_ACCEPTANCE",
      "verificationSource": "CROWDSOURCE",
      "upvotes": 0,
      "downvotes": 0,
      "createdAt": "2026-02-05T12:00:00.000Z",
      "expiresAt": "2026-08-05T12:00:00.000Z"
    },
    "acceptance": {
      "id": 1,
      "providerNpi": "1234567890",
      "planId": "12345CA0010001",
      "acceptanceStatus": "ACCEPTED",
      "confidenceScore": 50,
      "lastVerified": "2026-02-05T12:00:00.000Z",
      "verificationCount": 1,
      "expiresAt": "2026-08-05T12:00:00.000Z"
    },
    "message": "Verification submitted successfully"
  }
}
```

**Side Effects:**
- Invalidates the search cache (async, non-blocking)
- Source IP and User-Agent are recorded for Sybil detection (not returned in response)

---

### POST /api/v1/verify/:verificationId/vote

Vote on an existing verification (upvote or downvote).

**Rate Limit:** 10 req/hr (vote tier)
**CAPTCHA:** Required (reCAPTCHA v3)

**Path Parameters:**

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `verificationId` | string | Min 1 char | Verification log ID |

**Request Body:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `vote` | string | Yes | `up` or `down` | Vote direction |
| `captchaToken` | string | No* | - | reCAPTCHA v3 token (*required in production) |

**Response:**

```json
{
  "success": true,
  "data": {
    "verification": {
      "id": "clxxxx...",
      "upvotes": 3,
      "downvotes": 1,
      "netVotes": 2
    },
    "message": "Vote recorded: up"
  }
}
```

**Notes:**
- Each IP can vote once per verification (unique constraint on `verificationId` + `sourceIp`)
- Changing vote direction returns message `"Vote changed to: down"`

---

### GET /api/v1/verify/stats

Get aggregate verification statistics.

**Rate Limit:** 200 req/hr (default tier)

**Response:**

```json
{
  "success": true,
  "data": {
    "stats": {
      // Aggregate verification statistics
    }
  }
}
```

---

### GET /api/v1/verify/recent

Get recent verification submissions.

**Rate Limit:** 200 req/hr (default tier)

**Query Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `limit` | number | No | 1-100, default 20 | Number of results |
| `npi` | string | No | Exactly 10 digits | Filter by provider NPI |
| `planId` | string | No | 1-50 chars | Filter by plan ID |

**Response:**

```json
{
  "success": true,
  "data": {
    "verifications": [...],
    "count": 20
  }
}
```

---

### GET /api/v1/verify/:npi/:planId

Get all verifications for a specific provider-plan pair with full confidence breakdown.

**Rate Limit:** 200 req/hr (default tier)

**Path Parameters:**

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `npi` | string | Exactly 10 digits | Provider NPI |
| `planId` | string | 1-50 chars | Insurance plan ID |

**Response:**

```json
{
  "success": true,
  "data": {
    "npi": "1234567890",
    "planId": "12345CA0010001",
    "acceptance": {
      "id": 1,
      "acceptanceStatus": "ACCEPTED",
      "confidenceScore": 75,
      "lastVerified": "2026-02-05T12:00:00.000Z",
      "verificationCount": 3,
      "expiresAt": "2026-08-05T12:00:00.000Z"
    },
    "verifications": [
      {
        "id": "clxxxx...",
        "verificationType": "PLAN_ACCEPTANCE",
        "verificationSource": "CROWDSOURCE",
        "upvotes": 3,
        "downvotes": 0,
        "notes": "Confirmed by phone",
        "createdAt": "2026-02-01T10:00:00.000Z"
      }
    ],
    "summary": {
      "totalUpvotes": 5,
      "totalDownvotes": 1
    }
  }
}
```

**Error:** `404` if provider or plan not found.

---

## 10. Admin Endpoints

All admin endpoints require the `X-Admin-Secret` header.

### POST /api/v1/admin/cleanup-expired

Clean up expired verification records. Designed to be called by Cloud Scheduler.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dryRun` | string | No | `false` | Set to `true` to preview without deleting |
| `batchSize` | number | No | 1000 | Records to delete per batch |

**Response:**

```json
{
  "success": true,
  "data": {
    "expiredPlanAcceptances": 15,
    "expiredVerificationLogs": 42,
    "deletedPlanAcceptances": 15,
    "deletedVerificationLogs": 42,
    "message": "Cleanup complete. 57 records deleted."
  }
}
```

In dry run mode, `deleted*` fields are replaced with `expired*` counts and the message indicates a dry run.

---

### GET /api/v1/admin/expiration-stats

Get statistics about verification expiration.

**Response:**

```json
{
  "success": true,
  "data": {
    // Expiration statistics from verificationService
  }
}
```

---

### GET /api/v1/admin/health

Extended health check with cache and retention metrics.

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-05T12:00:00.000Z",
    "uptime": 86400,
    "cache": {
      "hits": 1500,
      "misses": 300,
      "size": 42,
      "mode": "memory"
    },
    "retention": {
      "verificationLogs": {
        "total": 5000,
        "expiringIn7Days": 12,
        "oldestRecord": "2025-08-05T00:00:00.000Z"
      },
      "syncLogs": {
        "total": 90,
        "oldestRecord": "2025-11-01T00:00:00.000Z"
      },
      "voteLogs": {
        "total": 1200
      }
    }
  }
}
```

---

### POST /api/v1/admin/cache/clear

Clear all cached data. Use after data imports to force fresh queries.

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Cache cleared. 42 entries removed.",
    "deletedCount": 42
  }
}
```

---

### GET /api/v1/admin/cache/stats

Get cache statistics.

**Response:**

```json
{
  "success": true,
  "data": {
    "hits": 1500,
    "misses": 300,
    "size": 42,
    "mode": "memory",
    "hitRate": "83.33%"
  }
}
```

---

### POST /api/v1/admin/cleanup/sync-logs

Clean up sync_logs older than the retention period. Designed to be called by Cloud Scheduler daily.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dryRun` | string | No | `false` | Set to `true` to preview without deleting |
| `retentionDays` | number | No | 90 | Number of days to retain |

**Response (actual run):**

```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "deletedCount": 25,
    "olderThan": "2025-11-07T00:00:00.000Z",
    "message": "Cleanup complete. 25 sync_logs records deleted."
  }
}
```

**Response (dry run):**

```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "recordsToDelete": 25,
    "olderThan": "2025-11-07T00:00:00.000Z",
    "message": "Dry run complete. 25 sync_logs records would be deleted."
  }
}
```

---

### GET /api/v1/admin/retention/stats

Get comprehensive retention statistics for all log types.

**Response:**

```json
{
  "success": true,
  "data": {
    "timestamp": "2026-02-05T12:00:00.000Z",
    "verificationLogs": {
      "total": 5000,
      "expiringIn7Days": 12,
      "expiringIn30Days": 85,
      "oldestRecord": "2025-08-05T00:00:00.000Z",
      "newestRecord": "2026-02-05T11:00:00.000Z",
      "retentionPolicy": "6 months (TTL via expiresAt)"
    },
    "syncLogs": {
      "total": 90,
      "olderThan90Days": 5,
      "oldestRecord": "2025-11-01T00:00:00.000Z",
      "newestRecord": "2026-02-05T06:00:00.000Z",
      "retentionPolicy": "90 days (manual cleanup)"
    },
    "planAcceptances": {
      "total": 3000,
      "expiringIn7Days": 8,
      "expiringIn30Days": 45,
      "retentionPolicy": "6 months (TTL via expiresAt)"
    },
    "voteLogs": {
      "total": 1200,
      "retentionPolicy": "Follows plan acceptance TTL"
    }
  }
}
```

---

## 11. Health Check

### GET /health

Public health check endpoint. Not rate-limited to allow monitoring tools unrestricted access.

**Response (healthy):**

```json
{
  "status": "ok",
  "timestamp": "2026-02-05T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600.5,
  "memory": {
    "heapUsed": 45,
    "heapTotal": 65,
    "unit": "MB"
  },
  "checks": {
    "database": "healthy"
  },
  "databaseResponseTime": "2ms",
  "cache": {
    "hits": 150,
    "misses": 30,
    "size": 42,
    "mode": "memory",
    "hitRate": "83.3%"
  }
}
```

**Response (degraded -- database unreachable):**

HTTP `503 Service Unavailable`

```json
{
  "status": "degraded",
  "timestamp": "2026-02-05T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600.5,
  "memory": { "heapUsed": 45, "heapTotal": 65, "unit": "MB" },
  "checks": {
    "database": "unhealthy"
  },
  "error": "Connection refused",
  "cache": { "hits": 0, "misses": 0, "size": 0, "mode": "memory", "hitRate": "0%" }
}
```

### GET /

API information endpoint. Returns a list of available endpoints.

**Response:**

```json
{
  "name": "HealthcareProviderDB API",
  "version": "1.0.0",
  "description": "Healthcare provider database with NPI registry integration and insurance plan matching",
  "documentation": "/api/v1",
  "endpoints": {
    "health": "GET /health",
    "providers": {
      "search": "GET /api/v1/providers/search",
      "getByNpi": "GET /api/v1/providers/:npi",
      "getPlans": "GET /api/v1/providers/:npi/plans"
    },
    "plans": {
      "search": "GET /api/v1/plans/search",
      "getByPlanId": "GET /api/v1/plans/:planId",
      "issuers": "GET /api/v1/plans/meta/issuers",
      "types": "GET /api/v1/plans/meta/types",
      "years": "GET /api/v1/plans/meta/years"
    },
    "verify": {
      "submit": "POST /api/v1/verify",
      "vote": "POST /api/v1/verify/:verificationId/vote",
      "stats": "GET /api/v1/verify/stats",
      "recent": "GET /api/v1/verify/recent",
      "getPair": "GET /api/v1/verify/:npi/:planId"
    }
  }
}
```

---

## 12. Validation Schemas

All request parameters are validated using Zod schemas before reaching route handlers. Invalid input returns a `400` response with field-level error details.

### Common Schemas

**File:** `packages/backend/src/schemas/commonSchemas.ts`

| Schema | Fields | Used By |
|--------|--------|---------|
| `paginationSchema` | `page` (int, min 1, default 1), `limit` (int, 1-100, default 20) | providers, plans |
| `npiParamSchema` | `npi` (string, exactly 10 digits) | providers, verify |
| `stateQuerySchema` | `state` (string, exactly 2 chars, uppercased, optional) | plans |
| `planIdParamSchema` | `planId` (string, 1-50 chars) | plans, verify |

### Provider Search Schema

| Field | Type | Validation |
|-------|------|------------|
| `state` | string | 2 chars, uppercased, optional |
| `city` | string | 1-100 chars, optional |
| `cities` | string | 1-500 chars (comma-separated), optional |
| `zipCode` | string | 3-10 chars, optional |
| `specialty` | string | 1-200 chars, optional |
| `specialtyCategory` | string | 1-100 chars, optional |
| `name` | string | 1-200 chars, optional |
| `npi` | string | 10 digits, optional |
| `entityType` | enum | `INDIVIDUAL` or `ORGANIZATION`, optional |
| + pagination | - | Merged from `paginationSchema` |

### Plan Search Schema

| Field | Type | Validation |
|-------|------|------------|
| `issuerName` | string | 1-200 chars, optional |
| `planType` | string | 1-20 chars, optional |
| `search` | string | 1-200 chars, optional |
| `state` | string | 2 chars, uppercased, optional |
| + pagination | - | Merged from `paginationSchema` |

### Verification Submission Schema

| Field | Type | Validation |
|-------|------|------------|
| `npi` | string | Exactly 10 digits (from `npiParamSchema`) |
| `planId` | string | 1-50 chars (from `planIdParamSchema`) |
| `acceptsInsurance` | boolean | Required |
| `acceptsNewPatients` | boolean | Optional |
| `locationId` | number | Positive integer, optional |
| `notes` | string | Max 1000 chars, optional |
| `evidenceUrl` | string | Valid URL, max 500 chars, optional |
| `submittedBy` | string | Valid email, max 200 chars, optional |
| `captchaToken` | string | Optional (required in production) |

### Vote Schema

| Field | Type | Validation |
|-------|------|------------|
| `vote` | enum | `up` or `down` |
| `captchaToken` | string | Optional (required in production) |

### Recent Verifications Query Schema

| Field | Type | Validation |
|-------|------|------------|
| `limit` | number | 1-100, default 20 |
| `npi` | string | 10 digits, optional |
| `planId` | string | 1-50 chars, optional |

---

## Disabled Endpoints

### /api/v1/locations (DISABLED)

The locations router is commented out in `packages/backend/src/routes/index.ts`. It depends on the old `Location` model which has been replaced by `practice_locations`. A rewrite is pending.
