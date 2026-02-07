# VerifyMyProvider API Reference

**Base URL:** `https://verifymyprovider.com/api/v1`
**Version:** 1.0.0
**Last Updated:** 2026-02-07

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Common Conventions](#common-conventions)
4. [Rate Limiting](#rate-limiting)
5. [CAPTCHA Protection](#captcha-protection)
6. [Error Handling](#error-handling)
7. [Pagination](#pagination)
8. [Provider Endpoints](#provider-endpoints)
9. [Plan Endpoints](#plan-endpoints)
10. [Verification Endpoints](#verification-endpoints)
11. [Location Endpoints](#location-endpoints)
12. [Admin Endpoints](#admin-endpoints)
13. [Infrastructure Endpoints](#infrastructure-endpoints)
14. [Enums and Constants](#enums-and-constants)
15. [Shared Type Definitions](#shared-type-definitions)

---

## Overview

The VerifyMyProvider API is a RESTful JSON API that provides access to healthcare provider data sourced from the CMS NPPES registry, insurance plan information, and crowdsourced verification data. It powers the VerifyMyProvider frontend application and is built on Express.js with Prisma ORM connecting to a PostgreSQL database hosted on Google Cloud SQL.

All API routes are served under the `/api/v1` prefix. The API uses standard HTTP methods and returns JSON responses with a consistent envelope format.

### Technology Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| ORM | Prisma |
| Database | PostgreSQL (Google Cloud SQL) |
| Validation | Zod |
| Caching | Redis (distributed) or in-memory (single-instance) |
| Rate Limiting | Sliding window algorithm (Redis or in-memory) |
| Bot Protection | Google reCAPTCHA v3 + honeypot fields |
| Logging | Pino |

### CORS Policy

The API allows requests from the following origins:

- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- `https://verifymyprovider-frontend-741434145252.us-central1.run.app`
- Value of `FRONTEND_URL` environment variable (if set)
- `http://localhost:3000` and `http://localhost:3001` (development only)

Allowed methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`
Allowed headers: `Content-Type`, `Authorization`, `X-Request-ID`, `X-Admin-Secret`
Credentials: Enabled

### Request Size Limits

Request bodies are limited to **100 KB** for both JSON and URL-encoded payloads. Payloads exceeding this limit receive a `413 Payload Too Large` response.

### Request Timeouts

| Route Category | Timeout |
|----------------|---------|
| General API routes | 30 seconds |
| Search endpoints | 15 seconds |
| Admin operations | 120 seconds |

Timed-out requests return HTTP `408 Request Timeout`.

---

## Authentication

### Public Endpoints

Most API endpoints are publicly accessible and require no authentication. They are protected by rate limiting and, for write operations, CAPTCHA verification.

### Admin Endpoints

All endpoints under `/api/v1/admin/*` require the `X-Admin-Secret` header.

```
X-Admin-Secret: <your-admin-secret>
```

The secret is validated using a timing-safe comparison against the `ADMIN_SECRET` environment variable to prevent timing attacks.

**Authentication Responses:**

| Scenario | Status | Code |
|----------|--------|------|
| `ADMIN_SECRET` not configured on server | `503 Service Unavailable` | `ADMIN_NOT_CONFIGURED` |
| Missing or invalid `X-Admin-Secret` header | `401 Unauthorized` | -- |

---

## Common Conventions

### Response Envelope

All successful responses use this envelope format:

```json
{
  "success": true,
  "data": { ... }
}
```

All error responses use this envelope format:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "MACHINE_READABLE_CODE",
    "statusCode": 400,
    "requestId": "unique-request-id"
  }
}
```

### Request IDs

Every request is assigned a unique `X-Request-ID` header. If the client provides one, it is used; otherwise the server generates one. This ID appears in error responses and server logs for correlation.

### Caching Headers

Search endpoints that use server-side caching include:

```
X-Cache: HIT | MISS
```

This header indicates whether the response was served from cache (5-minute TTL for provider search results).

---

## Rate Limiting

Rate limiting uses a **sliding window algorithm** implemented with either Redis sorted sets (distributed deployments) or in-memory stores (single-instance deployments).

### Rate Limit Tiers

| Tier | Limit | Window | Applied To |
|------|-------|--------|------------|
| **Default** | 200 requests | 1 hour | General read endpoints |
| **Search** | 100 requests | 1 hour | Search endpoints (providers, plans, locations) |
| **Verification** | 10 requests | 1 hour | Verification submission (`POST /verify`) |
| **Vote** | 10 requests | 1 hour | Vote submission (`POST /verify/:id/vote`) |

### Rate Limit Response Headers

All rate-limited responses include:

```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 195
X-RateLimit-Reset: 1707350400
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window |
| `X-RateLimit-Remaining` | Remaining requests in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the rate limit window resets |
| `Retry-After` | Seconds until the limit resets (only on 429 responses) |

### Rate Limit Exceeded Response (HTTP 429)

```json
{
  "error": "Too many requests",
  "message": "Too many requests. Please try again in 1 hour.",
  "retryAfter": 3600
}
```

### Fail-Open Behavior

If the Redis rate limiter becomes unavailable, requests are **allowed through** (fail-open) with the following header added:

```
X-RateLimit-Status: degraded
```

Source: `packages/backend/src/middleware/rateLimiter.ts`

---

## CAPTCHA Protection

Write operations (verification submission and voting) are protected by **Google reCAPTCHA v3** and a **honeypot field**.

### How to Submit a CAPTCHA Token

Include the reCAPTCHA v3 token in either:

1. **Request body** as `captchaToken`
2. **Request header** as `X-Captcha-Token`

### Honeypot Field

Include the `website` field in request bodies, but leave it **empty**. This is a hidden field that real users never fill in. If a value is detected, the request is silently accepted with a fake success response (HTTP 200) so automated bots do not know they were blocked.

### CAPTCHA Validation

| Score | Result |
|-------|--------|
| >= 0.5 | Passed |
| < 0.5 | Blocked (HTTP 403, "Request blocked due to suspicious activity") |
| Token missing | Blocked (HTTP 400, "CAPTCHA token required for verification submissions") |
| Verification failed | Blocked (HTTP 400, "CAPTCHA verification failed") |

### CAPTCHA Fail Mode

When the Google reCAPTCHA API is unavailable:

| Mode | Behavior |
|------|----------|
| `open` (default) | Requests allowed with stricter fallback rate limiting (3 requests/hour) |
| `closed` | All requests blocked (HTTP 503) |

Controlled by the `CAPTCHA_FAIL_MODE` environment variable.

When operating in fail-open mode, these headers are added:

```
X-Security-Degraded: captcha-unavailable
X-Fallback-RateLimit-Limit: 3
X-Fallback-RateLimit-Remaining: 2
X-Fallback-RateLimit-Reset: 1707350400
```

### CAPTCHA Skip Conditions

CAPTCHA verification is skipped when:
- `NODE_ENV` is `development` or `test`
- `RECAPTCHA_SECRET_KEY` is not configured

Source: `packages/backend/src/middleware/captcha.ts`

---

## Error Handling

### Error Response Format

All errors return:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable description",
    "code": "MACHINE_READABLE_CODE",
    "statusCode": 400,
    "requestId": "req-abc123"
  }
}
```

### HTTP Status Codes

| Status | Description | Error Code |
|--------|-------------|------------|
| `200` | Success | -- |
| `201` | Created (verification submitted) | -- |
| `400` | Bad Request / Validation Error | `VALIDATION_ERROR`, `FOREIGN_KEY_VIOLATION` |
| `401` | Unauthorized (missing/invalid admin secret) | -- |
| `403` | Forbidden (CAPTCHA low score) | -- |
| `404` | Resource Not Found | `NOT_FOUND`, `ROUTE_NOT_FOUND` |
| `408` | Request Timeout | `REQUEST_TIMEOUT` |
| `409` | Conflict (duplicate record) | `DUPLICATE_ENTRY` |
| `413` | Payload Too Large (>100KB) | `PAYLOAD_TOO_LARGE` |
| `429` | Too Many Requests | -- |
| `500` | Internal Server Error | `INTERNAL_ERROR`, `QUERY_ERROR` |
| `503` | Service Unavailable (database down, admin not configured) | `DATABASE_TIMEOUT`, `DATABASE_UNAVAILABLE`, `ADMIN_NOT_CONFIGURED` |

### Validation Error Details

Zod validation errors include detailed field-level information:

```json
{
  "success": false,
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "req-abc123",
    "details": [
      {
        "field": "state",
        "message": "String must contain exactly 2 character(s)"
      },
      {
        "field": "page",
        "message": "Number must be greater than or equal to 1"
      }
    ]
  }
}
```

### 404 Route Not Found

```json
{
  "success": false,
  "error": {
    "message": "Route GET /api/v1/nonexistent not found",
    "code": "ROUTE_NOT_FOUND",
    "statusCode": 404,
    "requestId": "req-abc123"
  }
}
```

Source: `packages/backend/src/middleware/errorHandler.ts`

---

## Pagination

Paginated endpoints accept the following query parameters:

| Parameter | Type | Default | Min | Max | Description |
|-----------|------|---------|-----|-----|-------------|
| `page` | integer | `1` | 1 | -- | Page number (1-indexed) |
| `limit` | integer | `20` | 1 | 100 | Results per page |

### Pagination Response Object

```json
{
  "pagination": {
    "total": 1250,
    "page": 2,
    "limit": 20,
    "totalPages": 63,
    "hasMore": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer | Total number of records matching the query |
| `page` | integer | Current page number |
| `limit` | integer | Number of records per page |
| `totalPages` | integer | Total number of pages |
| `hasMore` | boolean | Whether more pages are available |

Source: `packages/backend/src/schemas/commonSchemas.ts`, `packages/backend/src/utils/responseHelpers.ts`

---

## Provider Endpoints

### GET /api/v1/providers/search

Search healthcare providers with filters. Results are cached for 5 minutes.

**Rate Limit:** 100 requests/hour (search tier)
**Timeout:** 15 seconds

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `state` | string | No | Exactly 2 characters, auto-uppercased | State code (e.g., `CA`, `NY`) |
| `city` | string | No | 1-100 characters | City name |
| `cities` | string | No | 1-500 characters | Comma-separated list of city names |
| `zipCode` | string | No | 3-10 characters | ZIP code or ZIP prefix |
| `specialty` | string | No | 1-200 characters | Specialty / taxonomy description |
| `specialtyCategory` | string | No | 1-100 characters | Specialty category grouping |
| `name` | string | No | 1-200 characters | Provider name search |
| `npi` | string | No | Exactly 10 digits | NPI number |
| `entityType` | string | No | `INDIVIDUAL` or `ORGANIZATION` | Entity type filter |
| `page` | integer | No | Min 1, default 1 | Page number |
| `limit` | integer | No | 1-100, default 20 | Results per page |

#### Response (200 OK)

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
        "middleName": null,
        "namePrefix": "Dr.",
        "nameSuffix": null,
        "credential": "MD",
        "organizationName": null,
        "gender": "F",
        "addressLine1": "123 Medical Dr",
        "addressLine2": "Suite 200",
        "city": "Los Angeles",
        "state": "CA",
        "zip": "90001",
        "phone": "3105551234",
        "fax": "3105551235",
        "taxonomyCode": "207RE0101X",
        "taxonomyDescription": "Endocrinology, Diabetes & Metabolism",
        "specialtyCategory": "ENDOCRINOLOGY",
        "npiStatus": "ACTIVE",
        "displayName": "Jane Smith, MD",
        "cmsDetails": {
          "group_practice_name": "LA Medical Group",
          "medical_school": "Johns Hopkins University",
          "graduation_year": "2005",
          "medicare_assignment": "Y",
          "telehealth": "Y"
        },
        "hospitals": [
          {
            "id": 1,
            "hospital_system": "Cedars-Sinai Health System",
            "hospital_name": "Cedars-Sinai Medical Center",
            "ccn": "050625",
            "confidence": "HIGH"
          }
        ],
        "insuranceNetworks": [
          {
            "id": 1,
            "network_name": "Blue Shield PPO",
            "identifier_id": "BSC-PPO-001",
            "confidence": "HIGH"
          }
        ],
        "medicareIds": [
          {
            "id": 1,
            "medicare_id": "PAC12345",
            "medicare_state": "CA"
          }
        ],
        "taxonomies": [
          {
            "id": 1,
            "taxonomy_code": "207RE0101X",
            "is_primary": "Y",
            "slot_number": 1
          }
        ],
        "locations": [
          {
            "id": 1,
            "address_type": "PRACTICE",
            "address_line1": "123 Medical Dr",
            "address_line2": "Suite 200",
            "city": "Los Angeles",
            "state": "CA",
            "zip_code": "90001",
            "phone": "3105551234",
            "fax": "3105551235"
          }
        ],
        "nppesLastSynced": "2026-01-15T00:00:00.000Z",
        "planAcceptances": [
          {
            "id": 42,
            "planId": "12345CA0010001",
            "locationId": 1,
            "acceptanceStatus": "ACCEPTED",
            "confidenceScore": 85.5,
            "lastVerifiedAt": "2026-01-10T12:00:00.000Z",
            "verificationCount": 4,
            "expiresAt": "2026-07-10T12:00:00.000Z",
            "plan": {
              "planId": "12345CA0010001",
              "planName": "Blue Shield PPO Gold",
              "issuerName": "Blue Shield of California",
              "planType": "PPO",
              "state": "CA",
              "carrier": "Blue Shield"
            },
            "location": {
              "id": 1,
              "addressLine1": "123 Medical Dr",
              "city": "Los Angeles",
              "state": "CA",
              "zipCode": "90001"
            }
          }
        ]
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

#### Response Headers

| Header | Value | Description |
|--------|-------|-------------|
| `X-Cache` | `HIT` or `MISS` | Whether the response was served from cache |

---

### GET /api/v1/providers/cities

Get unique city names for a given state. Useful for populating city filter dropdowns.

**Rate Limit:** 200 requests/hour (default tier)

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `state` | string | **Yes** | Exactly 2 characters, auto-uppercased | State code |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "state": "CA",
    "cities": ["Los Angeles", "San Francisco", "San Diego", "Sacramento"],
    "count": 4
  }
}
```

---

### GET /api/v1/providers/:npi

Get a single provider by NPI number with full enrichment data including CMS details, hospital affiliations, insurance networks, Medicare IDs, taxonomies, practice locations, and plan acceptances.

**Rate Limit:** 200 requests/hour (default tier)

#### Path Parameters

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `npi` | string | Exactly 10 digits | NPI number |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "provider": {
      "id": "1234567890",
      "npi": "1234567890",
      "entityType": "INDIVIDUAL",
      "firstName": "Jane",
      "lastName": "Smith",
      "middleName": null,
      "namePrefix": "Dr.",
      "nameSuffix": null,
      "credential": "MD",
      "organizationName": null,
      "gender": "F",
      "addressLine1": "123 Medical Dr",
      "addressLine2": "Suite 200",
      "city": "Los Angeles",
      "state": "CA",
      "zip": "90001",
      "phone": "3105551234",
      "fax": "3105551235",
      "taxonomyCode": "207RE0101X",
      "taxonomyDescription": "Endocrinology, Diabetes & Metabolism",
      "specialtyCategory": "ENDOCRINOLOGY",
      "npiStatus": "ACTIVE",
      "displayName": "Jane Smith, MD",
      "cmsDetails": { ... },
      "hospitals": [ ... ],
      "insuranceNetworks": [ ... ],
      "medicareIds": [ ... ],
      "taxonomies": [ ... ],
      "locations": [ ... ],
      "nppesLastSynced": "2026-01-15T00:00:00.000Z",
      "planAcceptances": [ ... ]
    }
  }
}
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `400` | Invalid NPI format (not exactly 10 digits) |
| `404` | Provider with given NPI not found |

---

### GET /api/v1/providers/:npi/colocated

Get providers co-located at the same practice address as the given NPI. Includes health system information for the practice location.

**Rate Limit:** 200 requests/hour (default tier)

#### Path Parameters

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `npi` | string | Exactly 10 digits | NPI number of the reference provider |

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `page` | integer | No | Min 1, default 1 | Page number |
| `limit` | integer | No | 1-100, default 20 | Results per page |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "location": {
      "id": 0,
      "addressLine1": "123 Medical Dr",
      "addressLine2": "Suite 200",
      "city": "Los Angeles",
      "state": "CA",
      "zipCode": "90001",
      "name": null,
      "healthSystem": "Cedars-Sinai Health System",
      "facilityType": null,
      "providerCount": 15,
      "createdAt": "2026-02-07T00:00:00.000Z",
      "updatedAt": "2026-02-07T00:00:00.000Z"
    },
    "providers": [ ... ],
    "pagination": {
      "total": 14,
      "page": 1,
      "limit": 20,
      "totalPages": 1,
      "hasMore": false
    }
  }
}
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `400` | Invalid NPI format |
| `404` | Provider with given NPI not found |

If the provider has no primary practice address, the response returns `location: null` with an empty `providers` array.

Source: `packages/backend/src/routes/providers.ts`

---

## Plan Endpoints

### GET /api/v1/plans/search

Search insurance plans with filters.

**Rate Limit:** 100 requests/hour (search tier)

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `issuerName` | string | No | 1-200 characters | Filter by insurance issuer name |
| `planType` | string | No | 1-20 characters | Filter by plan type (e.g., `HMO`, `PPO`) |
| `search` | string | No | 1-200 characters | Free-text search across plan name and issuer |
| `state` | string | No | Exactly 2 characters, auto-uppercased | State code filter |
| `page` | integer | No | Min 1, default 1 | Page number |
| `limit` | integer | No | 1-100, default 20 | Results per page |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "planId": "12345CA0010001",
        "planName": "Blue Shield PPO Gold",
        "issuerName": "Blue Shield of California",
        "planType": "PPO",
        "metalLevel": "GOLD",
        "state": "CA",
        "carrier": "Blue Shield",
        "isActive": true
      }
    ],
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 20,
      "totalPages": 3,
      "hasMore": true
    }
  }
}
```

---

### GET /api/v1/plans/grouped

Get plans grouped by carrier for dropdown display. Useful for building cascading plan selection UIs.

**Rate Limit:** 200 requests/hour (default tier)

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `search` | string | No | 1-200 characters | Free-text search filter |
| `state` | string | No | Exactly 2 characters, auto-uppercased | State code filter |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "carriers": [
      {
        "carrier": "Blue Shield",
        "plans": [
          {
            "planId": "12345CA0010001",
            "planName": "Blue Shield PPO Gold"
          }
        ]
      }
    ],
    "totalCarriers": 15,
    "totalPlans": 200
  }
}
```

---

### GET /api/v1/plans/meta/issuers

Get a list of unique insurance issuer names.

**Rate Limit:** 200 requests/hour (default tier)

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `state` | string | No | Exactly 2 characters, auto-uppercased | Filter issuers by state |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "issuers": [
      "Aetna",
      "Anthem Blue Cross",
      "Blue Shield of California",
      "Cigna",
      "UnitedHealthcare"
    ],
    "count": 5
  }
}
```

---

### GET /api/v1/plans/meta/types

Get a list of available plan types.

**Rate Limit:** 200 requests/hour (default tier)

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `state` | string | No | Exactly 2 characters, auto-uppercased | Filter plan types by state |
| `issuerName` | string | No | 1-200 characters | Filter plan types by issuer |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "planTypes": ["EPO", "HMO", "PPO"],
    "count": 3
  }
}
```

---

### GET /api/v1/plans/:planId

Get a single insurance plan by plan ID.

**Rate Limit:** 200 requests/hour (default tier)

#### Path Parameters

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `planId` | string | 1-50 characters | The plan identifier |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "plan": {
      "planId": "12345CA0010001",
      "planName": "Blue Shield PPO Gold",
      "issuerName": "Blue Shield of California",
      "planType": "PPO",
      "metalLevel": "GOLD",
      "state": "CA",
      "carrier": "Blue Shield",
      "isActive": true,
      "providerCount": 2500
    }
  }
}
```

The `providerCount` field is computed from the plan's `_count.providerAcceptances` value.

#### Error Responses

| Status | Condition |
|--------|-----------|
| `400` | Invalid plan ID format |
| `404` | Plan with given ID not found |

---

### GET /api/v1/plans/:planId/providers

Get providers who accept a specific insurance plan.

**Rate Limit:** 100 requests/hour (search tier)

#### Path Parameters

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `planId` | string | 1-50 characters | The plan identifier |

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `page` | integer | No | Min 1, default 1 | Page number |
| `limit` | integer | No | 1-100, default 20 | Results per page |

#### Response (200 OK)

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
        "taxonomyDescription": "Endocrinology, Diabetes & Metabolism",
        "specialtyCategory": null,
        "npiStatus": "ACTIVE",
        "displayName": "Jane Smith, MD",
        "confidenceScore": 85.5,
        "lastVerified": "2026-01-10T12:00:00.000Z",
        "verificationCount": 4
      }
    ],
    "pagination": {
      "total": 250,
      "page": 1,
      "limit": 20,
      "totalPages": 13,
      "hasMore": true
    }
  }
}
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404` | Plan with given ID not found |

Source: `packages/backend/src/routes/plans.ts`

---

## Verification Endpoints

### POST /api/v1/verify

Submit a new verification for a provider-plan pair. Requires CAPTCHA token. Creates a verification log and updates or creates a provider-plan acceptance record with a computed confidence score.

**Rate Limit:** 10 requests/hour (verification tier)
**CAPTCHA:** Required
**Honeypot:** `website` field (must be empty)

#### Request Body

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `npi` | string | **Yes** | Exactly 10 digits | Provider NPI number |
| `planId` | string | **Yes** | 1-50 characters | Insurance plan ID |
| `acceptsInsurance` | boolean | **Yes** | -- | Whether the provider accepts this plan |
| `acceptsNewPatients` | boolean | No | -- | Whether the provider accepts new patients |
| `locationId` | integer | No | Positive integer | Specific practice location ID |
| `notes` | string | No | Max 1000 characters | Additional notes or context |
| `evidenceUrl` | string | No | Valid URL, max 500 characters | URL of supporting evidence |
| `submittedBy` | string | No | Valid email, max 200 characters | Submitter email |
| `captchaToken` | string | No* | -- | reCAPTCHA v3 token (*required in production) |
| `website` | string | No | -- | Honeypot field (must be empty) |

#### Response (201 Created)

```json
{
  "success": true,
  "data": {
    "verification": {
      "id": "clx123abc",
      "npi": "1234567890",
      "planId": "12345CA0010001",
      "acceptsInsurance": true,
      "acceptsNewPatients": true,
      "notes": "Called office, confirmed acceptance",
      "evidenceUrl": null,
      "upvotes": 0,
      "downvotes": 0,
      "createdAt": "2026-02-07T12:00:00.000Z",
      "expiresAt": "2026-08-07T12:00:00.000Z"
    },
    "acceptance": {
      "id": 42,
      "npi": "1234567890",
      "planId": "12345CA0010001",
      "acceptanceStatus": "ACCEPTED",
      "confidenceScore": 65.0,
      "verificationCount": 2,
      "lastVerified": "2026-02-07T12:00:00.000Z",
      "expiresAt": "2026-08-07T12:00:00.000Z",
      "confidence": {
        "score": 65.0,
        "level": "MEDIUM",
        "description": "Some verification exists, but may need confirmation.",
        "factors": {
          "dataSourceScore": 10,
          "recencyScore": 30,
          "verificationScore": 15,
          "agreementScore": 10
        },
        "metadata": {
          "daysUntilStale": 58,
          "isStale": false,
          "recommendReVerification": false,
          "daysSinceVerification": 0,
          "freshnessThreshold": 60,
          "researchNote": "Based on Mortensen et al. (2015) and Ndumele et al. (2018)",
          "explanation": "Score breakdown: ..."
        }
      }
    },
    "message": "Verification submitted successfully"
  }
}
```

#### Side Effects

- Invalidates search cache to ensure fresh data on subsequent searches.
- The submission records `sourceIp` and `userAgent` from the request for Sybil attack prevention (30-day window).

#### Error Responses

| Status | Condition |
|--------|-----------|
| `400` | Validation error (missing/invalid fields, CAPTCHA failed) |
| `403` | CAPTCHA low score (suspected bot) |
| `429` | Rate limit exceeded |

---

### POST /api/v1/verify/:verificationId/vote

Vote on an existing verification (upvote or downvote). Votes are tracked by IP address; a second vote from the same IP changes the previous vote rather than adding a new one.

**Rate Limit:** 10 requests/hour (vote tier)
**CAPTCHA:** Required
**Honeypot:** `website` field (must be empty)

#### Path Parameters

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `verificationId` | string | Min 1 character | The verification log ID |

#### Request Body

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `vote` | string | **Yes** | `up` or `down` | Vote direction |
| `captchaToken` | string | No* | -- | reCAPTCHA v3 token (*required in production) |
| `website` | string | No | -- | Honeypot field (must be empty) |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "verification": {
      "id": "clx123abc",
      "upvotes": 5,
      "downvotes": 1,
      "netVotes": 4
    },
    "message": "Vote recorded: up"
  }
}
```

If the voter's IP previously voted on this verification, the message changes:

```json
{
  "message": "Vote changed to: down"
}
```

---

### GET /api/v1/verify/stats

Get aggregate verification statistics.

**Rate Limit:** 200 requests/hour (default tier)

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "stats": {
      "totalVerifications": 1500,
      "totalVotes": 4200,
      "totalProviderPlanPairs": 800,
      "averageConfidenceScore": 72.5,
      "recentVerifications24h": 25
    }
  }
}
```

---

### GET /api/v1/verify/recent

Get recent verifications, optionally filtered by NPI and/or plan ID.

**Rate Limit:** 200 requests/hour (default tier)

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `limit` | integer | No | 1-100, default 20 | Number of recent verifications to return |
| `npi` | string | No | Exactly 10 digits | Filter by provider NPI |
| `planId` | string | No | 1-50 characters | Filter by plan ID |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "verifications": [
      {
        "id": "clx123abc",
        "npi": "1234567890",
        "planId": "12345CA0010001",
        "acceptsInsurance": true,
        "upvotes": 5,
        "downvotes": 1,
        "createdAt": "2026-02-07T12:00:00.000Z"
      }
    ],
    "count": 1
  }
}
```

---

### GET /api/v1/verify/:npi/:planId

Get all verifications for a specific provider-plan pair, including the current acceptance record with full confidence breakdown.

**Rate Limit:** 200 requests/hour (default tier)

#### Path Parameters

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `npi` | string | Exactly 10 digits | Provider NPI number |
| `planId` | string | 1-50 characters | Insurance plan ID |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "npi": "1234567890",
    "planId": "12345CA0010001",
    "acceptance": {
      "id": 42,
      "npi": "1234567890",
      "planId": "12345CA0010001",
      "acceptanceStatus": "ACCEPTED",
      "confidenceScore": 85.5,
      "verificationCount": 4,
      "lastVerified": "2026-02-01T12:00:00.000Z",
      "expiresAt": "2026-08-01T12:00:00.000Z",
      "confidence": {
        "score": 85.5,
        "level": "HIGH",
        "description": "Verified through authoritative sources or multiple community verifications.",
        "factors": {
          "dataSourceScore": 15,
          "recencyScore": 28,
          "verificationScore": 25,
          "agreementScore": 17.5
        },
        "metadata": {
          "daysUntilStale": 54,
          "isStale": false,
          "recommendReVerification": false,
          "daysSinceVerification": 6,
          "freshnessThreshold": 60,
          "researchNote": "Based on Mortensen et al. (2015) and Ndumele et al. (2018)",
          "explanation": "Score breakdown: ..."
        }
      }
    },
    "verifications": [
      {
        "id": "clx123abc",
        "acceptsInsurance": true,
        "upvotes": 5,
        "downvotes": 1,
        "createdAt": "2026-02-01T12:00:00.000Z"
      }
    ],
    "summary": {
      "totalVerifications": 4,
      "totalUpvotes": 12,
      "totalDownvotes": 2,
      "acceptCount": 3,
      "rejectCount": 1
    }
  }
}
```

If `acceptance` is `null`, no provider-plan acceptance record exists yet.

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404` | Provider or plan not found |

Source: `packages/backend/src/routes/verify.ts`

---

## Location Endpoints

### GET /api/v1/locations/search

Search practice locations with filters. State is required.

**Rate Limit:** 100 requests/hour (search tier)

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `state` | string | **Yes** | Exactly 2 characters, auto-uppercased | State code |
| `city` | string | No | 1-100 characters | City name |
| `zipCode` | string | No | 3-10 characters | ZIP code or prefix |
| `page` | integer | No | Min 1, default 1 | Page number |
| `limit` | integer | No | 1-100, default 20 | Results per page |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "locations": [
      {
        "id": 1,
        "addressLine1": "123 Medical Dr",
        "addressLine2": "Suite 200",
        "city": "Los Angeles",
        "state": "CA",
        "zipCode": "90001",
        "name": "LA Medical Center",
        "healthSystem": "Cedars-Sinai Health System",
        "facilityType": "CLINIC",
        "providerCount": 15
      }
    ],
    "pagination": {
      "total": 500,
      "page": 1,
      "limit": 20,
      "totalPages": 25,
      "hasMore": true
    }
  }
}
```

---

### GET /api/v1/locations/health-systems

Get distinct health system names, optionally filtered by state and/or city.

**Rate Limit:** 200 requests/hour (default tier)

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `state` | string | No | Exactly 2 characters, auto-uppercased | State code |
| `city` | string | No | 1-100 characters | City name |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "healthSystems": [
      "Cedars-Sinai Health System",
      "Kaiser Permanente",
      "Providence Health"
    ],
    "count": 3
  }
}
```

---

### GET /api/v1/locations/stats/:state

Get location statistics for a state, including counts of locations, providers, and health systems.

**Rate Limit:** 200 requests/hour (default tier)

#### Path Parameters

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `state` | string | Exactly 2 characters, auto-uppercased | State code |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "state": "CA",
    "totalLocations": 5000,
    "totalProviders": 25000,
    "totalHealthSystems": 150,
    "topCities": [
      { "city": "Los Angeles", "locationCount": 800 },
      { "city": "San Francisco", "locationCount": 500 }
    ]
  }
}
```

---

### GET /api/v1/locations/:locationId

Get a single practice location by ID with provider details.

**Rate Limit:** 200 requests/hour (default tier)

#### Path Parameters

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `locationId` | integer | Positive integer | The location ID |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "location": {
      "id": 1,
      "addressLine1": "123 Medical Dr",
      "addressLine2": "Suite 200",
      "city": "Los Angeles",
      "state": "CA",
      "zipCode": "90001",
      "name": "LA Medical Center",
      "healthSystem": "Cedars-Sinai Health System",
      "facilityType": "CLINIC",
      "providerCount": 15
    }
  }
}
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `400` | Invalid location ID (not a positive integer) |
| `404` | Location with given ID not found |

---

### GET /api/v1/locations/:locationId/providers

Get all providers that share the same address as this location.

**Rate Limit:** 200 requests/hour (default tier)

#### Path Parameters

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `locationId` | integer | Positive integer | The location ID |

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `page` | integer | No | Min 1, default 1 | Page number |
| `limit` | integer | No | 1-100, default 20 | Results per page |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "location": {
      "id": 1,
      "addressLine1": "123 Medical Dr",
      "city": "Los Angeles",
      "state": "CA",
      "zipCode": "90001"
    },
    "providers": [
      {
        "npi": "1234567890",
        "displayName": "Jane Smith, MD",
        "specialty": "Endocrinology"
      }
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "limit": 20,
      "totalPages": 1,
      "hasMore": false
    }
  }
}
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `400` | Invalid location ID |
| `404` | Location with given ID not found |

Source: `packages/backend/src/routes/locations.ts`

---

## Admin Endpoints

All admin endpoints require the `X-Admin-Secret` header. See [Authentication](#authentication).

### POST /api/v1/admin/cleanup-expired

Clean up expired verification records and provider-plan acceptances. Designed to be called by Cloud Scheduler.

**Timeout:** 120 seconds

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dryRun` | string | No | `false` | Set to `true` to preview deletions without executing |
| `batchSize` | integer | No | `1000` | Number of records to delete per batch |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "expiredPlanAcceptances": 50,
    "expiredVerificationLogs": 120,
    "deletedPlanAcceptances": 50,
    "deletedVerificationLogs": 120,
    "message": "Cleanup complete. 170 records deleted."
  }
}
```

**Dry Run Response:**

```json
{
  "success": true,
  "data": {
    "expiredPlanAcceptances": 50,
    "expiredVerificationLogs": 120,
    "message": "Dry run complete. 170 records would be deleted."
  }
}
```

---

### GET /api/v1/admin/expiration-stats

Get statistics about verification expiration, including counts of records expiring soon.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "totalPlanAcceptances": 5000,
    "expiredPlanAcceptances": 50,
    "expiringIn7Days": 25,
    "expiringIn30Days": 100,
    "totalVerificationLogs": 8000,
    "expiredVerificationLogs": 120
  }
}
```

---

### GET /api/v1/admin/health

Admin-level health check with detailed retention metrics. More comprehensive than the public `/health` endpoint.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-07T12:00:00.000Z",
    "uptime": 86400.5,
    "cache": {
      "hits": 1500,
      "misses": 300,
      "size": 45,
      "mode": "redis"
    },
    "retention": {
      "verificationLogs": {
        "total": 8000,
        "expiringIn7Days": 25,
        "oldestRecord": "2025-08-07T00:00:00.000Z"
      },
      "syncLogs": {
        "total": 500,
        "oldestRecord": "2025-11-07T00:00:00.000Z"
      },
      "voteLogs": {
        "total": 4200
      }
    }
  }
}
```

---

### POST /api/v1/admin/cache/clear

Clear all cached data. Use after data imports or when stale data is suspected.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "message": "Cache cleared. 45 entries removed.",
    "deletedCount": 45
  }
}
```

---

### GET /api/v1/admin/cache/stats

Get cache statistics including hit/miss counts and hit rate.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "hits": 1500,
    "misses": 300,
    "size": 45,
    "mode": "redis",
    "hitRate": "83.33%"
  }
}
```

---

### GET /api/v1/admin/enrichment/stats

Get location enrichment statistics for practice_locations and provider_hospitals tables.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "practiceLocations": {
      "total": 50000,
      "withHealthSystem": 12000,
      "enrichmentRate": "24.0%"
    },
    "providerHospitals": {
      "total": 8000,
      "uniqueHospitals": 500
    }
  }
}
```

---

### POST /api/v1/admin/cleanup/sync-logs

Clean up sync_logs older than a specified retention period. Designed to be called by Cloud Scheduler daily.

**Timeout:** 120 seconds

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dryRun` | string | No | `false` | Set to `true` to preview deletions |
| `retentionDays` | integer | No | `90` | Number of days to retain |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "deletedCount": 150,
    "olderThan": "2025-11-09T12:00:00.000Z",
    "message": "Cleanup complete. 150 sync_logs records deleted."
  }
}
```

**Dry Run Response:**

```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "recordsToDelete": 150,
    "olderThan": "2025-11-09T12:00:00.000Z",
    "message": "Dry run complete. 150 sync_logs records would be deleted."
  }
}
```

---

### GET /api/v1/admin/retention/stats

Get comprehensive retention statistics for all log types including verification logs, sync logs, plan acceptances, and vote logs.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "timestamp": "2026-02-07T12:00:00.000Z",
    "verificationLogs": {
      "total": 8000,
      "expiringIn7Days": 25,
      "expiringIn30Days": 100,
      "oldestRecord": "2025-08-07T00:00:00.000Z",
      "newestRecord": "2026-02-07T11:00:00.000Z",
      "retentionPolicy": "6 months (TTL via expiresAt)"
    },
    "syncLogs": {
      "total": 500,
      "olderThan90Days": 150,
      "oldestRecord": "2025-08-01T00:00:00.000Z",
      "newestRecord": "2026-02-07T06:00:00.000Z",
      "retentionPolicy": "90 days (manual cleanup)"
    },
    "planAcceptances": {
      "total": 5000,
      "expiringIn7Days": 25,
      "expiringIn30Days": 100,
      "retentionPolicy": "6 months (TTL via expiresAt)"
    },
    "voteLogs": {
      "total": 4200,
      "retentionPolicy": "Follows plan acceptance TTL"
    }
  }
}
```

---

### POST /api/v1/admin/recalculate-confidence

Recalculate confidence scores for all provider-plan acceptance records with time-based decay applied proactively.

**Timeout:** 120 seconds

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dryRun` | string | No | `false` | Set to `true` to preview changes without writing |
| `limit` | integer | No | All records | Maximum number of records to process |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "processed": 5000,
    "updated": 1200,
    "unchanged": 3800,
    "errors": 0,
    "durationMs": 15432,
    "duration": "15.4s",
    "message": "Recalculation complete. 1200 of 5000 records updated."
  }
}
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `400` | `limit` is not a positive integer |

Source: `packages/backend/src/routes/admin.ts`

---

## Infrastructure Endpoints

### GET /health

Public health check endpoint. Placed before rate limiting middleware so monitoring tools are never blocked.

**Rate Limit:** None
**Timeout:** None (separate from API routes)

#### Response (200 OK -- Healthy)

```json
{
  "status": "ok",
  "timestamp": "2026-02-07T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 86400.5,
  "memory": {
    "heapUsed": 128,
    "heapTotal": 256,
    "unit": "MB"
  },
  "checks": {
    "database": "healthy"
  },
  "cache": {
    "hits": 1500,
    "misses": 300,
    "size": 45,
    "mode": "redis",
    "hitRate": "83.3%"
  },
  "databaseResponseTime": "5ms"
}
```

#### Response (503 Service Unavailable -- Degraded)

```json
{
  "status": "degraded",
  "timestamp": "2026-02-07T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 86400.5,
  "memory": {
    "heapUsed": 128,
    "heapTotal": 256,
    "unit": "MB"
  },
  "checks": {
    "database": "unhealthy"
  },
  "cache": { ... },
  "error": "Connection refused"
}
```

---

### GET /

API information endpoint with available endpoint listing.

**Rate Limit:** 200 requests/hour (default tier)

#### Response (200 OK)

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

Source: `packages/backend/src/index.ts`

---

## Enums and Constants

### Entity Types

| Value | Description |
|-------|-------------|
| `INDIVIDUAL` | Individual healthcare provider |
| `ORGANIZATION` | Healthcare organization |

### NPI Status

| Value | Description |
|-------|-------------|
| `ACTIVE` | Active NPI registration |
| `DEACTIVATED` | Deactivated NPI |

### Specialty Categories

| Value | Description |
|-------|-------------|
| `ENDOCRINOLOGY` | Endocrinology |
| `RHEUMATOLOGY` | Rheumatology |
| `ORTHOPEDICS` | Orthopedics |
| `INTERNAL_MEDICINE` | Internal Medicine |
| `FAMILY_MEDICINE` | Family Medicine |
| `GERIATRICS` | Geriatrics |
| `OTHER` | Other specialties |

### Plan Types

| Value | Description |
|-------|-------------|
| `HMO` | Health Maintenance Organization |
| `PPO` | Preferred Provider Organization |
| `EPO` | Exclusive Provider Organization |
| `POS` | Point of Service |
| `HDHP` | High Deductible Health Plan |
| `MEDICARE_ADVANTAGE` | Medicare Advantage |
| `MEDICAID` | Medicaid |
| `OTHER` | Other plan types |

### Metal Levels (ACA)

| Value | Description |
|-------|-------------|
| `BRONZE` | Bronze tier |
| `SILVER` | Silver tier |
| `GOLD` | Gold tier |
| `PLATINUM` | Platinum tier |
| `CATASTROPHIC` | Catastrophic tier |

### Market Types

| Value | Description |
|-------|-------------|
| `INDIVIDUAL` | Individual market |
| `SMALL_GROUP` | Small group market |
| `LARGE_GROUP` | Large group market |
| `MEDICARE` | Medicare |
| `MEDICAID` | Medicaid |

### Acceptance Status

| Value | Description |
|-------|-------------|
| `ACCEPTED` | Provider accepts the plan |
| `NOT_ACCEPTED` | Provider does not accept the plan |
| `PENDING` | Verification pending |
| `UNKNOWN` | Status unknown |

### Confidence Levels

| Level | Score Range | Description |
|-------|------------|-------------|
| `VERY_HIGH` | 91-100 | Verified through multiple authoritative sources with expert-level accuracy |
| `HIGH` | 76-90 | Verified through authoritative sources or multiple community verifications |
| `MEDIUM` | 51-75 | Some verification exists, but may need confirmation |
| `LOW` | 26-50 | Limited verification data -- call provider to confirm |
| `VERY_LOW` | 0-25 | Unverified or potentially inaccurate -- always call to confirm |

Note: With fewer than 3 community verifications, the maximum achievable level is `MEDIUM`, regardless of score. This is based on research by Mortensen et al. (2015) showing 3 verifications achieve expert-level accuracy (kappa = 0.58).

### Verification Sources

| Value | Description |
|-------|-------------|
| `CMS_DATA` | CMS official data |
| `CARRIER_DATA` | Insurance carrier data |
| `PROVIDER_PORTAL` | Provider self-reported |
| `PHONE_CALL` | Verified by phone call |
| `CROWDSOURCE` | Community-submitted verification |
| `AUTOMATED` | Automated verification |

### Data Sources

| Value | Description |
|-------|-------------|
| `CMS_NPPES` | CMS NPPES registry |
| `CMS_PLAN_FINDER` | CMS Plan Finder |
| `USER_UPLOAD` | User-uploaded data |
| `CARRIER_API` | Insurance carrier API |
| `CROWDSOURCE` | Community-submitted |

### Verification Types

| Value | Description |
|-------|-------------|
| `PLAN_ACCEPTANCE` | Provider-plan acceptance verification |
| `PROVIDER_INFO` | Provider information update |
| `CONTACT_INFO` | Contact information verification |
| `STATUS_CHANGE` | Provider status change |
| `NEW_PLAN` | New plan addition |

Source: `packages/shared/src/types/enums.ts`

---

## Shared Type Definitions

### Confidence Factors

The confidence scoring system uses four weighted factors totaling a maximum of 100 points:

| Factor | Max Points | Description |
|--------|-----------|-------------|
| `dataSourceScore` | 25 | Points based on the authority of the data source |
| `recencyScore` | 30 | Points based on how recently the data was verified (time-decay) |
| `verificationScore` | 25 | Points based on the number of verifications (optimal at 3) |
| `agreementScore` | 20 | Points based on community consensus (upvotes vs downvotes) |

### Confidence Metadata

| Field | Type | Description |
|-------|------|-------------|
| `daysUntilStale` | integer | Days until the verification is considered stale |
| `isStale` | boolean | Whether the verification has exceeded its freshness threshold |
| `recommendReVerification` | boolean | Whether re-verification is recommended |
| `daysSinceVerification` | integer or null | Days since last verification |
| `freshnessThreshold` | integer | Freshness threshold in days (specialty-specific) |
| `researchNote` | string | Research citation for the scoring methodology |
| `explanation` | string | Human-readable explanation of the score |

### Specialty-Specific Freshness Thresholds

Different specialties have different freshness thresholds based on provider network churn research (Ndumele et al. 2018, Health Affairs):

| Specialty Category | Threshold (days) | Rationale |
|-------------------|-------------------|-----------|
| Mental Health | 30 | High turnover; only 43% accept Medicaid |
| Primary Care | 60 | 12% annual turnover |
| Specialist | 60 | Similar to primary care |
| Hospital-Based | 90 | More stable positions |
| Other | 60 | Default threshold |

### Provider Response Shape

The full provider object returned by search and detail endpoints:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Same as NPI |
| `npi` | string | 10-digit NPI number |
| `entityType` | string | `INDIVIDUAL` or `ORGANIZATION` |
| `firstName` | string or null | First name (individuals) |
| `lastName` | string or null | Last name (individuals) |
| `middleName` | string or null | Middle name |
| `namePrefix` | string or null | Name prefix (e.g., Dr.) |
| `nameSuffix` | string or null | Name suffix |
| `credential` | string or null | Credential (e.g., MD, DO) |
| `organizationName` | string or null | Organization name (organizations) |
| `gender` | string or null | Gender |
| `addressLine1` | string or null | Primary practice address line 1 |
| `addressLine2` | string or null | Primary practice address line 2 |
| `city` | string or null | City |
| `state` | string or null | State |
| `zip` | string or null | ZIP code |
| `phone` | string or null | Phone number |
| `fax` | string or null | Fax number |
| `taxonomyCode` | string or null | Primary taxonomy code |
| `taxonomyDescription` | string or null | Primary specialty description |
| `specialtyCategory` | string or null | Specialty category |
| `npiStatus` | string | `ACTIVE` or `DEACTIVATED` |
| `displayName` | string | Computed display name |
| `cmsDetails` | object or null | CMS Physician Compare data |
| `hospitals` | array | Hospital affiliations |
| `insuranceNetworks` | array | Insurance network participations |
| `medicareIds` | array | Medicare identifiers |
| `taxonomies` | array | All taxonomy/specialty codes |
| `locations` | array | All practice locations |
| `nppesLastSynced` | string (ISO date) or null | Last NPPES sync date |
| `planAcceptances` | array | Insurance plan acceptance records |

### Pagination Input Schema

Validated by Zod in `packages/backend/src/schemas/commonSchemas.ts`:

```typescript
{
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}
```

### NPI Validation

```typescript
{
  npi: z.string().length(10).regex(/^\d+$/, 'NPI must be exactly 10 digits'),
}
```

### Plan ID Validation

```typescript
{
  planId: z.string().min(1).max(50),
}
```

### Application Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `VERIFICATION_TTL_MS` | 6 months | Time-to-live for verification records |
| `SYBIL_PREVENTION_WINDOW_MS` | 30 days | Window for duplicate submission prevention |
| `MIN_VERIFICATIONS_FOR_CONSENSUS` | 3 | Minimum verifications to change acceptance status |
| `MIN_CONFIDENCE_FOR_STATUS_CHANGE` | 60 | Minimum confidence score to change acceptance status |
| `CAPTCHA_MIN_SCORE` | 0.5 | Minimum reCAPTCHA v3 score |
| `CAPTCHA_API_TIMEOUT_MS` | 5 seconds | Timeout for Google reCAPTCHA API calls |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | 3 | Max requests per hour in CAPTCHA fallback mode |
| `DEFAULT_PAGE_SIZE` | 20 | Default pagination page size |
| `MAX_PAGE_SIZE` | 100 | Maximum pagination page size |
| `SHUTDOWN_TIMEOUT_MS` | 10 seconds | Graceful shutdown timeout |

Source: `packages/backend/src/config/constants.ts`, `packages/shared/src/types/`

---

## Endpoint Summary Table

### Public Endpoints

| Method | Endpoint | Rate Limit | CAPTCHA | Timeout | Purpose |
|--------|----------|------------|---------|---------|---------|
| GET | `/health` | None | No | None | Health check |
| GET | `/` | 200/hr | No | 30s | API info |
| GET | `/api/v1/providers/search` | 100/hr | No | 15s | Search providers |
| GET | `/api/v1/providers/cities` | 200/hr | No | 30s | Cities for state |
| GET | `/api/v1/providers/:npi` | 200/hr | No | 30s | Provider detail |
| GET | `/api/v1/providers/:npi/colocated` | 200/hr | No | 30s | Co-located providers |
| GET | `/api/v1/plans/search` | 100/hr | No | 30s | Search plans |
| GET | `/api/v1/plans/grouped` | 200/hr | No | 30s | Plans by carrier |
| GET | `/api/v1/plans/meta/issuers` | 200/hr | No | 30s | Issuer list |
| GET | `/api/v1/plans/meta/types` | 200/hr | No | 30s | Plan type list |
| GET | `/api/v1/plans/:planId` | 200/hr | No | 30s | Plan detail |
| GET | `/api/v1/plans/:planId/providers` | 100/hr | No | 30s | Providers for plan |
| POST | `/api/v1/verify` | 10/hr | Yes | 30s | Submit verification |
| POST | `/api/v1/verify/:id/vote` | 10/hr | Yes | 30s | Vote on verification |
| GET | `/api/v1/verify/stats` | 200/hr | No | 30s | Verification stats |
| GET | `/api/v1/verify/recent` | 200/hr | No | 30s | Recent verifications |
| GET | `/api/v1/verify/:npi/:planId` | 200/hr | No | 30s | Pair verifications |
| GET | `/api/v1/locations/search` | 100/hr | No | 30s | Search locations |
| GET | `/api/v1/locations/health-systems` | 200/hr | No | 30s | Health systems |
| GET | `/api/v1/locations/stats/:state` | 200/hr | No | 30s | Location stats |
| GET | `/api/v1/locations/:locationId` | 200/hr | No | 30s | Location details |
| GET | `/api/v1/locations/:locationId/providers` | 200/hr | No | 30s | Providers at location |

### Admin Endpoints (X-Admin-Secret required)

| Method | Endpoint | Timeout | Purpose |
|--------|----------|---------|---------|
| POST | `/api/v1/admin/cleanup-expired` | 120s | Clean expired records |
| GET | `/api/v1/admin/expiration-stats` | 30s | Expiration statistics |
| GET | `/api/v1/admin/health` | 30s | Admin health with metrics |
| POST | `/api/v1/admin/cache/clear` | 30s | Clear cache |
| GET | `/api/v1/admin/cache/stats` | 30s | Cache statistics |
| GET | `/api/v1/admin/enrichment/stats` | 30s | Enrichment statistics |
| POST | `/api/v1/admin/cleanup/sync-logs` | 120s | Clean old sync logs |
| GET | `/api/v1/admin/retention/stats` | 30s | Retention statistics |
| POST | `/api/v1/admin/recalculate-confidence` | 120s | Confidence recalculation |
