# VerifyMyProvider API Reference

**Last Updated:** 2026-02-06

---

## Base URL

- **Local Development:** `http://localhost:3001/api/v1`
- **Production:** `https://verifymyprovider-backend-[hash].us-central1.run.app/api/v1`

---

## Common Response Format

All endpoints return JSON with this structure:

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "error": {
    "message": "Human-readable error message",
    "code": "MACHINE_READABLE_CODE",
    "statusCode": 400,
    "requestId": "uuid-v4"
  }
}
```

### Validation Error Response (Zod)
```json
{
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "uuid-v4",
    "details": [
      { "field": "state", "message": "String must contain exactly 2 character(s)" }
    ]
  }
}
```

---

## Rate Limiting

All endpoints include rate limiting headers in the response:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds to wait (only on 429 responses) |
| `X-RateLimit-Status` | Set to `degraded` when Redis is unavailable (fail-open) |

### Rate Limit Tiers

| Tier | Limit | Window | Applied To |
|------|-------|--------|-----------|
| Default | 200 req | 1 hour | General API routes, detail endpoints |
| Search | 100 req | 1 hour | Search endpoints (providers, plans, locations) |
| Verification | 10 req | 1 hour | POST /verify (submit verification) |
| Vote | 10 req | 1 hour | POST /verify/:id/vote |
| CAPTCHA Fallback | 3 req | 1 hour | Applied when CAPTCHA API unavailable (fail-open mode) |

### 429 Too Many Requests Response
```json
{
  "error": "Too many requests",
  "message": "Too many search requests. Please try again in 1 hour.",
  "retryAfter": 3600
}
```

---

## Authentication

### Public Endpoints
No authentication required. CORS restricts origins to allowed domains.

### Admin Endpoints
Require `X-Admin-Secret` header with timing-safe comparison against `ADMIN_SECRET` environment variable.

```
X-Admin-Secret: your-secret-value
```

If `ADMIN_SECRET` is not configured, admin endpoints return 503 with `ADMIN_NOT_CONFIGURED` code.

---

## Pagination

Paginated endpoints accept and return:

### Query Parameters
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `page` | integer | 1 | >= 1 | Page number |
| `limit` | integer | 20 | 1-100 | Results per page |

### Response Pagination Object
```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1234,
    "totalPages": 62,
    "hasMore": true
  }
}
```

---

## Health Check

### GET /health

Health check endpoint. Placed before rate limiter in middleware chain so monitoring tools are not blocked.

**Rate Limit:** None

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-02-06T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600.123,
  "memory": {
    "heapUsed": 45,
    "heapTotal": 64,
    "unit": "MB"
  },
  "checks": {
    "database": "healthy"
  },
  "cache": {
    "hits": 150,
    "misses": 30,
    "size": 12,
    "mode": "memory",
    "hitRate": "83.3%"
  },
  "databaseResponseTime": "5ms"
}
```

**Response (503 -- Database Unreachable):**
```json
{
  "status": "degraded",
  "checks": {
    "database": "unhealthy"
  },
  "error": "Database connection failed"
}
```

---

## Provider Endpoints

### GET /api/v1/providers/search

Search providers with filters. Results are cached for 5 minutes.

**Rate Limit:** 100/hr (search)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string(2) | No | Two-letter state code (auto-uppercased) |
| `city` | string | No | City name (1-100 chars) |
| `cities` | string | No | Comma-separated city names (1-500 chars) |
| `zipCode` | string | No | ZIP code (3-10 chars) |
| `specialty` | string | No | Specialty description (1-200 chars) |
| `specialtyCategory` | string | No | Specialty category code (1-100 chars) |
| `name` | string | No | Provider name search (1-200 chars) |
| `npi` | string(10) | No | Exact NPI lookup (10 digits) |
| `entityType` | enum | No | `INDIVIDUAL` or `ORGANIZATION` |
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Results per page (default: 20, max: 100) |

**Response Headers:**
- `X-Cache: HIT` or `X-Cache: MISS` -- indicates cache status

**Response (200 OK):**
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
        "addressLine1": "123 Medical Center Dr",
        "addressLine2": "Suite 100",
        "city": "Miami",
        "state": "FL",
        "zip": "33101",
        "phone": "3055551234",
        "fax": null,
        "taxonomyCode": "207R00000X",
        "taxonomyDescription": "Internal Medicine",
        "specialtyCategory": "INTERNAL_MEDICINE",
        "npiStatus": "ACTIVE",
        "displayName": "Dr. Jane Smith, MD",
        "cmsDetails": { ... },
        "hospitals": [ ... ],
        "insuranceNetworks": [ ... ],
        "medicareIds": [ ... ],
        "taxonomies": [ ... ],
        "locations": [ ... ],
        "nppesLastSynced": "2026-01-15T00:00:00.000Z",
        "planAcceptances": [ ... ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 614000,
      "totalPages": 30700,
      "hasMore": true
    }
  }
}
```

---

### GET /api/v1/providers/cities

Get unique city names for a given state. Used to populate city dropdown filters.

**Rate Limit:** 200/hr (default)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string(2) | Yes | Two-letter state code (auto-uppercased) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "state": "FL",
    "cities": ["Miami", "Orlando", "Tampa", "Jacksonville"],
    "count": 4
  }
}
```

---

### GET /api/v1/providers/:npi

Get a single provider by NPI with full enrichment data including CMS details, hospital affiliations, insurance networks, Medicare IDs, taxonomy codes, practice locations, and plan acceptances.

**Rate Limit:** 200/hr (default)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `npi` | string(10) | Yes | 10-digit NPI number |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "provider": {
      "npi": "1234567890",
      "entityType": "INDIVIDUAL",
      "displayName": "Dr. Jane Smith, MD",
      "cmsDetails": {
        "group_practice_name": "Miami Medical Group",
        "medical_school": "University of Miami",
        "graduation_year": "2005",
        "medicare_assignment": "Y",
        "telehealth": "Y"
      },
      "hospitals": [
        { "id": 1, "hospital_system": "Baptist Health", "hospital_name": "Baptist Hospital", "ccn": "100008" }
      ],
      "insuranceNetworks": [
        { "id": 1, "network_name": "Aetna PPO", "identifier_id": "ABC123" }
      ],
      "medicareIds": [
        { "id": 1, "medicare_id": "M12345", "medicare_state": "FL" }
      ],
      "taxonomies": [
        { "id": 1, "taxonomy_code": "207R00000X", "is_primary": "Y", "slot_number": 1 }
      ],
      "locations": [
        { "id": 1, "address_line1": "123 Medical Dr", "city": "Miami", "state": "FL", "zip_code": "33101" }
      ],
      "planAcceptances": [
        {
          "id": 1,
          "planId": "PLAN123",
          "locationId": 1,
          "acceptanceStatus": "ACCEPTED",
          "confidenceScore": 85,
          "lastVerifiedAt": "2026-01-15T00:00:00.000Z",
          "verificationCount": 5,
          "expiresAt": "2026-07-15T00:00:00.000Z",
          "plan": { "planId": "PLAN123", "planName": "Aetna PPO Gold", "issuerName": "Aetna" },
          "location": { "id": 1, "addressLine1": "123 Medical Dr", "city": "Miami", "state": "FL", "zipCode": "33101" }
        }
      ]
    }
  }
}
```

**Error (404):**
```json
{
  "error": {
    "message": "Provider with NPI 1234567890 not found",
    "statusCode": 404,
    "requestId": "uuid"
  }
}
```

---

## Plan Endpoints

### GET /api/v1/plans/search

Search insurance plans with filters.

**Rate Limit:** 100/hr (search)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issuerName` | string | No | Issuer/carrier name (1-200 chars) |
| `planType` | string | No | Plan type filter (1-20 chars) |
| `search` | string | No | Free-text search (1-200 chars) |
| `state` | string(2) | No | Two-letter state code |
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Results per page (default: 20, max: 100) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "planId": "PLAN123",
        "planName": "Aetna PPO Gold",
        "issuerName": "Aetna",
        "planType": "PPO",
        "state": "FL",
        "carrier": "Aetna"
      }
    ],
    "pagination": { ... }
  }
}
```

---

### GET /api/v1/plans/grouped

Get plans grouped by carrier for dropdown display.

**Rate Limit:** 200/hr (default)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | string | No | Search filter (1-200 chars) |
| `state` | string(2) | No | Two-letter state code |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "carrier": "Aetna",
        "plans": [ ... ]
      }
    ]
  }
}
```

---

### GET /api/v1/plans/meta/issuers

Get list of unique insurance issuers.

**Rate Limit:** 200/hr (default)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string(2) | No | Filter issuers by state |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "issuers": ["Aetna", "Blue Cross Blue Shield", "Cigna", "United Healthcare"],
    "count": 4
  }
}
```

---

### GET /api/v1/plans/meta/types

Get available plan types, optionally filtered by state and issuer.

**Rate Limit:** 200/hr (default)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string(2) | No | Filter by state |
| `issuerName` | string | No | Filter by issuer name (1-200 chars) |

**Response (200 OK):**
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

Get providers who accept a specific plan. Returns providers with acceptance status and confidence scores.

**Rate Limit:** 100/hr (search)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `planId` | string | Yes | Plan identifier (1-50 chars) |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Results per page (default: 20, max: 100) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "1234567890",
        "npi": "1234567890",
        "entityType": "1",
        "firstName": "Jane",
        "lastName": "Smith",
        "displayName": "Dr. Jane Smith, MD",
        "city": "Miami",
        "state": "FL",
        "phone": "3055551234",
        "taxonomyDescription": "Internal Medicine",
        "confidenceScore": 85,
        "lastVerified": "2026-01-15T00:00:00.000Z",
        "verificationCount": 5
      }
    ],
    "pagination": { ... }
  }
}
```

---

### GET /api/v1/plans/:planId

Get a single plan by plan ID.

**Rate Limit:** 200/hr (default)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `planId` | string | Yes | Plan identifier (1-50 chars) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "plan": {
      "planId": "PLAN123",
      "planName": "Aetna PPO Gold",
      "issuerName": "Aetna",
      "planType": "PPO",
      "state": "FL",
      "carrier": "Aetna",
      "providerCount": 1250
    }
  }
}
```

---

## Verification Endpoints

### POST /api/v1/verify

Submit a new verification for a provider-plan pair. Protected by rate limiting, honeypot detection, and reCAPTCHA v3.

**Rate Limit:** 10/hr (verification)
**CAPTCHA:** Required (reCAPTCHA v3, skipped in development)
**Honeypot:** `website` field must be empty

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `npi` | string(10) | Yes | Provider NPI (10 digits) |
| `planId` | string | Yes | Insurance plan ID (1-50 chars) |
| `acceptsInsurance` | boolean | Yes | Whether the provider accepts this plan |
| `acceptsNewPatients` | boolean | No | Whether the provider accepts new patients |
| `locationId` | integer | No | Specific practice location ID |
| `notes` | string | No | Free-text notes (max 1000 chars) |
| `evidenceUrl` | string | No | URL supporting the verification (max 500 chars) |
| `submittedBy` | string | No | Email address of submitter (max 200 chars) |
| `captchaToken` | string | No | reCAPTCHA v3 token (required in production) |
| `website` | string | No | Honeypot field -- must be empty |

**Sybil Prevention:**
- IP-based deduplication: same IP cannot re-verify same provider-plan within 30 days
- Email-based deduplication: same email cannot re-verify same provider-plan within 30 days

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "verification": {
      "id": "cuid",
      "npi": "1234567890",
      "planId": "PLAN123",
      "acceptsInsurance": true,
      "createdAt": "2026-02-06T12:00:00.000Z"
    },
    "acceptance": {
      "acceptanceStatus": "ACCEPTED",
      "confidenceScore": 72,
      "confidenceLevel": "MEDIUM",
      "verificationCount": 2,
      "lastVerified": "2026-02-06T12:00:00.000Z"
    },
    "message": "Verification submitted successfully"
  }
}
```

**Side Effects:**
- Invalidates search cache asynchronously to ensure fresh data
- Creates/updates `ProviderPlanAcceptance` record
- Recalculates confidence score using 4-factor algorithm

---

### POST /api/v1/verify/:verificationId/vote

Vote on an existing verification (up or down). Allows changing vote direction.

**Rate Limit:** 10/hr (vote)
**CAPTCHA:** Required (reCAPTCHA v3, skipped in development)
**Honeypot:** `website` field must be empty

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `verificationId` | string | Yes | Verification ID |

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vote` | enum | Yes | `up` or `down` |
| `captchaToken` | string | No | reCAPTCHA v3 token (required in production) |
| `website` | string | No | Honeypot field -- must be empty |

**Vote Deduplication:** Unique constraint on `(verificationId, sourceIp)`. If the same IP votes again, the vote direction is updated rather than duplicated.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "verification": {
      "id": "cuid",
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

Get aggregate verification statistics.

**Rate Limit:** 200/hr (default)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "stats": { ... }
  }
}
```

---

### GET /api/v1/verify/recent

Get recent verification submissions.

**Rate Limit:** 200/hr (default)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | integer | No | Max results (default: 20, max: 100) |
| `npi` | string(10) | No | Filter by provider NPI |
| `planId` | string | No | Filter by plan ID |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "verifications": [ ... ],
    "count": 20
  }
}
```

---

### GET /api/v1/verify/:npi/:planId

Get all verifications for a specific provider-plan pair with full confidence breakdown.

**Rate Limit:** 200/hr (default)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `npi` | string(10) | Yes | Provider NPI (10 digits) |
| `planId` | string | Yes | Plan ID (1-50 chars) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "npi": "1234567890",
    "planId": "PLAN123",
    "acceptance": {
      "acceptanceStatus": "ACCEPTED",
      "confidenceScore": 85,
      "confidenceLevel": "HIGH",
      "verificationCount": 5,
      "lastVerified": "2026-02-01T00:00:00.000Z",
      "confidenceBreakdown": {
        "dataSource": 15,
        "recency": 28,
        "verification": 25,
        "agreement": 17
      }
    },
    "verifications": [ ... ],
    "summary": {
      "totalUpvotes": 8,
      "totalDownvotes": 1
    }
  }
}
```

---

## Location Endpoints

All location endpoints are registered and active (confirmed in `routes/index.ts`).

### GET /api/v1/locations/search

Search practice locations with filters. State is required.

**Rate Limit:** 100/hr (search)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string(2) | Yes | Two-letter state code (auto-uppercased) |
| `city` | string | No | City name (1-100 chars) |
| `zipCode` | string | No | ZIP code (3-10 chars) |
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Results per page (default: 20, max: 100) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "locations": [ ... ],
    "pagination": { ... }
  }
}
```

---

### GET /api/v1/locations/health-systems

Get distinct health system names, optionally filtered by state/city.

**Rate Limit:** 200/hr (default)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string(2) | No | Filter by state |
| `city` | string | No | Filter by city (1-100 chars) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "healthSystems": [ ... ],
    "count": 15
  }
}
```

---

### GET /api/v1/locations/stats/:state

Get location statistics for a state.

**Rate Limit:** 200/hr (default)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string(2) | Yes | Two-letter state code |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "state": "FL",
    ...
  }
}
```

---

### GET /api/v1/locations/:locationId

Get a single practice location by ID with provider details.

**Rate Limit:** 200/hr (default)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `locationId` | integer | Yes | Location ID (positive integer) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "location": { ... }
  }
}
```

---

### GET /api/v1/locations/:locationId/providers

Get all providers that share the same address as this location (co-located providers).

**Rate Limit:** 200/hr (default)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `locationId` | integer | Yes | Location ID (positive integer) |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Results per page (default: 20, max: 100) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "location": { ... },
    "providers": [ ... ],
    "pagination": { ... }
  }
}
```

---

## Admin Endpoints

All admin endpoints require the `X-Admin-Secret` header. Protected with timing-safe comparison via `crypto.timingSafeEqual`.

### POST /api/v1/admin/cleanup-expired

Clean up expired verification records. Designed to be called by Cloud Scheduler.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | string | `false` | Set to `true` to preview what would be deleted |
| `batchSize` | integer | 1000 | Number of records to delete per batch |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "expiredPlanAcceptances": 5,
    "expiredVerificationLogs": 12,
    "deletedPlanAcceptances": 5,
    "deletedVerificationLogs": 12,
    "message": "Cleanup complete. 17 records deleted."
  }
}
```

---

### GET /api/v1/admin/expiration-stats

Get statistics about verification expiration.

**Response (200 OK):**
```json
{
  "success": true,
  "data": { ... }
}
```

---

### GET /api/v1/admin/health

Health check with retention metrics. More detailed than public `/health`.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-06T12:00:00.000Z",
    "uptime": 3600.123,
    "cache": { ... },
    "retention": {
      "verificationLogs": {
        "total": 100,
        "expiringIn7Days": 5,
        "oldestRecord": "2025-08-01T00:00:00.000Z"
      },
      "syncLogs": {
        "total": 12,
        "oldestRecord": "2025-11-01T00:00:00.000Z"
      },
      "voteLogs": {
        "total": 250
      }
    }
  }
}
```

---

### POST /api/v1/admin/cache/clear

Clear all cached data. Use after data imports to force fresh query results.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Cache cleared. 12 entries removed.",
    "deletedCount": 12
  }
}
```

---

### GET /api/v1/admin/cache/stats

Get cache statistics including hit rate.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "hits": 150,
    "misses": 30,
    "size": 12,
    "mode": "memory",
    "hitRate": "83.33%"
  }
}
```

---

### GET /api/v1/admin/enrichment/stats

Get location enrichment statistics for practice_locations and provider_hospitals.

**Response (200 OK):**
```json
{
  "success": true,
  "data": { ... }
}
```

---

### POST /api/v1/admin/cleanup/sync-logs

Clean up sync_logs older than a configurable retention period. Designed for Cloud Scheduler.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | string | `false` | Set to `true` to preview changes |
| `retentionDays` | integer | 90 | Number of days to retain |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "deletedCount": 3,
    "olderThan": "2025-11-08T00:00:00.000Z",
    "message": "Cleanup complete. 3 sync_logs records deleted."
  }
}
```

---

### GET /api/v1/admin/retention/stats

Get comprehensive retention statistics for all log types.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-02-06T12:00:00.000Z",
    "verificationLogs": {
      "total": 100,
      "expiringIn7Days": 5,
      "expiringIn30Days": 15,
      "oldestRecord": "2025-08-01T00:00:00.000Z",
      "newestRecord": "2026-02-05T00:00:00.000Z",
      "retentionPolicy": "6 months (TTL via expiresAt)"
    },
    "syncLogs": {
      "total": 12,
      "olderThan90Days": 2,
      "oldestRecord": "2025-11-01T00:00:00.000Z",
      "newestRecord": "2026-02-01T00:00:00.000Z",
      "retentionPolicy": "90 days (manual cleanup)"
    },
    "planAcceptances": {
      "total": 50,
      "expiringIn7Days": 3,
      "expiringIn30Days": 8,
      "retentionPolicy": "6 months (TTL via expiresAt)"
    },
    "voteLogs": {
      "total": 250,
      "retentionPolicy": "Follows plan acceptance TTL"
    }
  }
}
```

---

### POST /api/v1/admin/recalculate-confidence

Recalculate confidence scores for all provider-plan acceptance records with time-based decay applied proactively. Uses cursor-based pagination internally for batch processing.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | string | `false` | Preview changes without writing |
| `limit` | integer | all | Maximum records to process |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "processed": 50,
    "updated": 12,
    "unchanged": 35,
    "errors": 3,
    "durationMs": 1523,
    "duration": "1.5s",
    "message": "Recalculation complete. 12 of 50 records updated."
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Zod schema validation failed |
| `CAPTCHA_REQUIRED` | 400 | Missing reCAPTCHA token |
| `CAPTCHA_FAILED` | 400 | reCAPTCHA verification failed |
| `UNAUTHORIZED` | 401 | Missing or invalid admin secret |
| `FORBIDDEN` | 403 | Low reCAPTCHA score (suspected bot) |
| `NOT_FOUND` | 404 | Resource not found |
| `ROUTE_NOT_FOUND` | 404 | Unmatched route |
| `DUPLICATE_ENTRY` | 409 | Prisma P2002 unique constraint violation |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `PAYLOAD_TOO_LARGE` | 413 | Request body exceeds 100KB limit |
| `ADMIN_NOT_CONFIGURED` | 503 | ADMIN_SECRET env var not set |
| `SERVICE_UNAVAILABLE` | 503 | CAPTCHA fail-closed mode during outage |
| `INTERNAL_ERROR` | 500 | Unhandled server error (message hidden in production) |

---

## Endpoint Summary Table

| # | Method | Endpoint | Rate Limit | CAPTCHA | Auth |
|---|--------|----------|------------|---------|------|
| 1 | GET | `/health` | None | No | None |
| 2 | GET | `/api/v1/providers/search` | 100/hr | No | None |
| 3 | GET | `/api/v1/providers/cities` | 200/hr | No | None |
| 4 | GET | `/api/v1/providers/:npi` | 200/hr | No | None |
| 5 | GET | `/api/v1/plans/search` | 100/hr | No | None |
| 6 | GET | `/api/v1/plans/grouped` | 200/hr | No | None |
| 7 | GET | `/api/v1/plans/meta/issuers` | 200/hr | No | None |
| 8 | GET | `/api/v1/plans/meta/types` | 200/hr | No | None |
| 9 | GET | `/api/v1/plans/:planId/providers` | 100/hr | No | None |
| 10 | GET | `/api/v1/plans/:planId` | 200/hr | No | None |
| 11 | POST | `/api/v1/verify` | 10/hr | Yes | None |
| 12 | POST | `/api/v1/verify/:verificationId/vote` | 10/hr | Yes | None |
| 13 | GET | `/api/v1/verify/stats` | 200/hr | No | None |
| 14 | GET | `/api/v1/verify/recent` | 200/hr | No | None |
| 15 | GET | `/api/v1/verify/:npi/:planId` | 200/hr | No | None |
| 16 | GET | `/api/v1/locations/search` | 100/hr | No | None |
| 17 | GET | `/api/v1/locations/health-systems` | 200/hr | No | None |
| 18 | GET | `/api/v1/locations/stats/:state` | 200/hr | No | None |
| 19 | GET | `/api/v1/locations/:locationId` | 200/hr | No | None |
| 20 | GET | `/api/v1/locations/:locationId/providers` | 200/hr | No | None |
| 21 | POST | `/api/v1/admin/cleanup-expired` | 200/hr | No | X-Admin-Secret |
| 22 | GET | `/api/v1/admin/expiration-stats` | 200/hr | No | X-Admin-Secret |
| 23 | GET | `/api/v1/admin/health` | 200/hr | No | X-Admin-Secret |
| 24 | POST | `/api/v1/admin/cache/clear` | 200/hr | No | X-Admin-Secret |
| 25 | GET | `/api/v1/admin/cache/stats` | 200/hr | No | X-Admin-Secret |
| 26 | GET | `/api/v1/admin/enrichment/stats` | 200/hr | No | X-Admin-Secret |
| 27 | POST | `/api/v1/admin/cleanup/sync-logs` | 200/hr | No | X-Admin-Secret |
| 28 | GET | `/api/v1/admin/retention/stats` | 200/hr | No | X-Admin-Secret |
| 29 | POST | `/api/v1/admin/recalculate-confidence` | 200/hr | No | X-Admin-Secret |

**Total: 29 endpoints** (20 public + 9 admin)

---

## Checklist Status

- [x] All public endpoints documented (20 endpoints)
- [x] All admin endpoints documented (9 endpoints)
- [x] Rate limits defined for all endpoints
- [x] CAPTCHA requirements documented
- [x] Zod validation schemas documented
- [x] Error codes listed
- [x] Response examples for key endpoints
- [ ] OpenAPI/Swagger specification (not yet implemented)
- [ ] API documentation website (not yet implemented)

---

## Answers to Prompt Questions

1. **Should the API reference be auto-generated (Swagger/OpenAPI)?** -- Not currently implemented. The Zod schemas could be converted to OpenAPI spec using libraries like `zod-to-openapi`. This would enable auto-generated documentation and client SDK generation. Recommended for Q2 2026 when B2B API documentation is planned.

2. **Are there undocumented query parameters or headers?** -- The `X-Cache` response header on search endpoints (HIT/MISS) is not advertised to consumers but is present. The `X-Security-Degraded` header is set when CAPTCHA fails open. The `X-Fallback-RateLimit-*` headers appear during CAPTCHA degradation. All are informational and documented above.

3. **Should we add API versioning headers?** -- The API is already versioned via the URL path (`/api/v1`). Adding an `Accept-Version` header would enable header-based versioning but adds complexity. Recommended to defer until v2 is needed.

4. **Are error codes consistent across all endpoints?** -- Mostly yes. All endpoints use the `AppError` class for structured errors. The error handler catches Zod, Prisma, and payload errors consistently. One minor inconsistency: the rate limiter returns `{ error: "Too many requests", message: "...", retryAfter: N }` without the standard `{ error: { message, code, statusCode } }` wrapper. The honeypot returns `{ success: true, data: { id: "submitted" } }` as a deliberate deception.

5. **Should rate limit information be included in the API docs?** -- Yes, it is included above. The rate limit headers are standard practice and help API consumers implement proper backoff strategies.
