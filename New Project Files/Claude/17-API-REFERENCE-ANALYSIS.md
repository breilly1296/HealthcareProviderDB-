# VerifyMyProvider API Reference

**Last Updated:** January 25, 2026
**Base URL:** `https://verifymyprovider-backend-*.run.app/api/v1`
**Version:** v1

---

## Authentication

### Public Endpoints
All endpoints are public except admin routes.

### Admin Endpoints
Require `X-Admin-Secret` header.

```bash
curl -H "X-Admin-Secret: your-secret" \
  https://api.verifymyprovider.com/api/v1/admin/health
```

---

## Rate Limits

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Verification submission | 10 | 1 hour |
| Vote submission | 10 | 1 hour |
| Search endpoints | 100 | 1 hour |
| Other endpoints | 200 | 1 hour |

### Headers
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Reset` - Reset timestamp (Unix)
- `Retry-After` - Seconds until retry (on 429)

---

## Provider Endpoints

### Search Providers
```
GET /api/v1/providers/search
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| state | string(2) | No | State code (e.g., "FL") |
| city | string | No | City name |
| cities | string | No | Comma-separated cities |
| zipCode | string | No | ZIP code |
| specialty | string | No | Specialty name |
| name | string | No | Provider name |
| npi | string(10) | No | NPI number |
| entityType | enum | No | INDIVIDUAL or ORGANIZATION |
| healthSystem | string | No | Health system name |
| page | number | No | Page number (default: 1) |
| limit | number | No | Results per page (1-100, default: 20) |

**Response:**
```json
{
  "success": true,
  "data": {
    "providers": [...],
    "total": 1500,
    "page": 1,
    "limit": 20,
    "totalPages": 75
  }
}
```

### Get Provider Details
```
GET /api/v1/providers/:npi
```

**Response:**
```json
{
  "success": true,
  "data": {
    "npi": "1234567890",
    "firstName": "John",
    "lastName": "Smith",
    "credential": "MD",
    "specialty": "Internal Medicine",
    "addressLine1": "123 Medical Center Dr",
    "city": "Miami",
    "state": "FL",
    "zipCode": "33101",
    "phone": "3055551234"
  }
}
```

### Get Provider's Plans
```
GET /api/v1/providers/:npi/plans
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | No | Filter by acceptance status |
| minConfidence | number | No | Minimum confidence score |
| page | number | No | Page number |
| limit | number | No | Results per page |

### Get Colocated Providers
```
GET /api/v1/providers/:npi/colocated
```

Returns providers at the same location.

### Get Cities by State
```
GET /api/v1/providers/cities
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| state | string(2) | Yes | State code |

---

## Plan Endpoints

### Search Plans
```
GET /api/v1/plans/search
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| issuerName | string | No | Insurance company |
| planType | string | No | Plan type |
| search | string | No | Free text search |
| state | string(2) | No | State code |
| page | number | No | Page number |
| limit | number | No | Results per page |

### Get Plans Grouped by Carrier
```
GET /api/v1/plans/grouped
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| search | string | No | Filter by name |
| state | string(2) | No | State code |

### Get Insurance Issuers
```
GET /api/v1/plans/meta/issuers
```

### Get Plan Types
```
GET /api/v1/plans/meta/types
```

### Get Plan Details
```
GET /api/v1/plans/:planId
```

### Get Providers Accepting Plan
```
GET /api/v1/plans/:planId/providers
```

---

## Verification Endpoints

### Submit Verification
```
POST /api/v1/verify
```

**Rate Limit:** 10/hour + CAPTCHA required

**Request Body:**
```json
{
  "npi": "1234567890",
  "planId": "BCBS_FL_PPO",
  "acceptsInsurance": true,
  "notes": "Called office on 1/15, confirmed acceptance",
  "evidenceUrl": "https://example.com/evidence",
  "submittedBy": "user@example.com",
  "captchaToken": "token-from-recaptcha"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "verificationId": "clx123abc...",
    "status": "PENDING",
    "confidenceScore": 45
  }
}
```

### Vote on Verification
```
POST /api/v1/verify/:verificationId/vote
```

**Rate Limit:** 10/hour + CAPTCHA required

**Request Body:**
```json
{
  "vote": "up"
}
```

**Valid votes:** `"up"` or `"down"`

### Get Verification Statistics
```
GET /api/v1/verify/stats
```

### Get Recent Verifications
```
GET /api/v1/verify/recent
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| limit | number | No | Max results (1-100) |
| npi | string | No | Filter by NPI |
| planId | string | No | Filter by plan |

### Get Verifications for Provider-Plan Pair
```
GET /api/v1/verify/:npi/:planId
```

---

## Location Endpoints

### Search Locations
```
GET /api/v1/locations/search
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| search | string | No | Free text search |
| state | string(2) | No | State code |
| city | string | No | City name |
| zipCode | string | No | ZIP code |
| healthSystem | string | No | Health system name |
| minProviders | number | No | Minimum provider count |
| page | number | No | Page number |
| limit | number | No | Results per page |

### Get Health Systems
```
GET /api/v1/locations/health-systems
```

### Get Location Stats by State
```
GET /api/v1/locations/stats/:state
```

### Get Location Details
```
GET /api/v1/locations/:locationId
```

### Get Providers at Location
```
GET /api/v1/locations/:locationId/providers
```

---

## Admin Endpoints

### Cleanup Expired Records
```
POST /api/v1/admin/cleanup-expired
```

**Headers:** `X-Admin-Secret: your-secret`

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| dryRun | boolean | No | Preview only (default: false) |
| batchSize | number | No | Records per batch (default: 1000) |

### Get Expiration Statistics
```
GET /api/v1/admin/expiration-stats
```

### Admin Health Check
```
GET /api/v1/admin/health
```

---

## Health Check

### Public Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T10:30:00.000Z"
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": {
    "message": "Human-readable message",
    "code": "MACHINE_READABLE_CODE",
    "statusCode": 400,
    "requestId": "uuid-for-correlation"
  }
}
```

### Validation Error Format
```json
{
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "uuid",
    "details": [
      { "field": "npi", "message": "NPI must be exactly 10 digits" }
    ]
  }
}
```

### Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | Invalid input |
| 401 | UNAUTHORIZED | Missing/invalid auth |
| 403 | FORBIDDEN | Access denied |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Duplicate vote |
| 429 | TOO_MANY_REQUESTS | Rate limited |
| 500 | INTERNAL_ERROR | Server error |

---

## Request ID

All requests include a correlation ID:
- **Header:** `X-Request-ID`
- **Auto-generated** if not provided
- **Included in error responses**

---

*API follows REST conventions with JSON responses*
