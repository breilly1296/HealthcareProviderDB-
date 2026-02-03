# VerifyMyProvider API Reference

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

**Base URL:** `https://api.verifymyprovider.com/api/v1`

---

## Overview

The VerifyMyProvider API provides access to provider data, verification submission, and voting functionality. All endpoints return JSON responses.

---

## Authentication

| Endpoint Type | Authentication |
|---------------|----------------|
| Public (most endpoints) | None required |
| Admin endpoints | `X-Admin-Secret` header |

---

## Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Verification POST | 10 requests | 1 hour |
| Vote POST | 10 requests | 1 hour |
| Search GET | 100 requests | 1 hour |
| Other GET | 200 requests | 1 hour |

Rate limit headers included in all responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Response Format

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
  "success": false,
  "error": {
    "message": "Human-readable message",
    "code": "ERROR_CODE",
    "statusCode": 400
  }
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

## Providers

### Search Providers

Search for healthcare providers by various criteria.

```
GET /providers/search
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string | No | 2-letter state code (e.g., "CA") |
| `city` | string | No | City name |
| `specialty` | string | No | Provider specialty |
| `name` | string | No | Provider name (first or last) |
| `zipCode` | string | No | ZIP code (5 or 9 digit) |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (default: 20, max: 100) |

**Example Request:**

```bash
curl "https://api.verifymyprovider.com/api/v1/providers/search?state=CA&specialty=cardiology&limit=10"
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "npi": "1234567890",
      "entityType": "INDIVIDUAL",
      "firstName": "John",
      "lastName": "Smith",
      "credential": "MD",
      "specialty": "Cardiovascular Disease",
      "addressLine1": "123 Medical Center Dr",
      "city": "Los Angeles",
      "state": "CA",
      "zipCode": "90001",
      "phone": "3105551234",
      "locationId": 456
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 547,
    "pages": 55
  }
}
```

---

### Get Provider by NPI

Get detailed information for a specific provider.

```
GET /providers/:npi
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `npi` | string | 10-digit NPI number |

**Example Request:**

```bash
curl "https://api.verifymyprovider.com/api/v1/providers/1234567890"
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "npi": "1234567890",
    "entityType": "INDIVIDUAL",
    "firstName": "John",
    "lastName": "Smith",
    "credential": "MD",
    "organizationName": null,
    "specialty": "Cardiovascular Disease",
    "specialtyCode": "207RC0000X",
    "addressLine1": "123 Medical Center Dr",
    "addressLine2": "Suite 500",
    "city": "Los Angeles",
    "state": "CA",
    "zipCode": "90001",
    "phone": "3105551234",
    "locationId": 456,
    "location": {
      "id": 456,
      "name": "LA Medical Center",
      "providerCount": 125
    }
  }
}
```

---

### Get Provider Plans

Get insurance plan acceptance status for a provider.

```
GET /providers/:npi/plans
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "planId": "BCBS_PPO_CA",
      "planName": "Blue Cross Blue Shield PPO",
      "carrier": "Blue Cross",
      "acceptanceStatus": "ACCEPTS",
      "confidenceScore": 85,
      "confidenceLevel": "HIGH",
      "lastVerified": "2026-01-28T10:30:00Z",
      "verificationCount": 12
    },
    {
      "planId": "AETNA_HMO_CA",
      "planName": "Aetna HMO California",
      "carrier": "Aetna",
      "acceptanceStatus": "UNKNOWN",
      "confidenceScore": 0,
      "confidenceLevel": "UNKNOWN",
      "lastVerified": null,
      "verificationCount": 0
    }
  ]
}
```

---

### Get Colocated Providers

Get other providers at the same location.

```
GET /providers/:npi/colocated
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Max results (default: 10) |

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "npi": "0987654321",
      "firstName": "Jane",
      "lastName": "Doe",
      "specialty": "Internal Medicine"
    }
  ]
}
```

---

## Verifications

### Submit Verification

Submit a new insurance acceptance verification.

```
POST /verify
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `npi` | string | Yes | 10-digit provider NPI |
| `planId` | string | Yes | Insurance plan ID |
| `acceptsInsurance` | boolean | Yes | Whether provider accepts plan |
| `notes` | string | No | Optional notes (max 1000 chars) |
| `captchaToken` | string | Prod | reCAPTCHA v3 token |

**Example Request:**

```bash
curl -X POST "https://api.verifymyprovider.com/api/v1/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "npi": "1234567890",
    "planId": "BCBS_PPO_CA",
    "acceptsInsurance": true,
    "notes": "Confirmed via phone call Jan 2026",
    "captchaToken": "03AGdBq24..."
  }'
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "clv1abc123def456",
    "providerNpi": "1234567890",
    "planId": "BCBS_PPO_CA",
    "verificationType": "ACCEPTS",
    "verificationSource": "CROWDSOURCE",
    "upvotes": 0,
    "downvotes": 0,
    "createdAt": "2026-01-31T15:30:00Z"
  }
}
```

---

### Vote on Verification

Upvote or downvote an existing verification.

```
POST /verify/:verificationId/vote
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `verificationId` | string | Verification CUID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vote` | string | Yes | "up" or "down" |
| `captchaToken` | string | Prod | reCAPTCHA v3 token |

**Example Request:**

```bash
curl -X POST "https://api.verifymyprovider.com/api/v1/verify/clv1abc123def456/vote" \
  -H "Content-Type: application/json" \
  -d '{
    "vote": "up",
    "captchaToken": "03AGdBq24..."
  }'
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "verificationId": "clv1abc123def456",
    "upvotes": 5,
    "downvotes": 1,
    "yourVote": "up"
  }
}
```

---

### Get Verification Stats

Get aggregate verification statistics.

```
GET /verify/stats
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "totalVerifications": 15234,
    "verificationsLast24h": 127,
    "verificationsLast7d": 892,
    "uniqueProviders": 8456,
    "uniquePlans": 234,
    "averageConfidence": 67.3
  }
}
```

---

### Get Recent Verifications

Get most recent verifications.

```
GET /verify/recent
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Max results (default: 10, max: 50) |

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "clv1abc123def456",
      "providerNpi": "1234567890",
      "providerName": "Dr. John Smith",
      "planId": "BCBS_PPO_CA",
      "planName": "Blue Cross PPO",
      "verificationType": "ACCEPTS",
      "createdAt": "2026-01-31T15:30:00Z"
    }
  ]
}
```

---

## Locations

### Get Location Details

```
GET /locations/:id
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": 456,
    "addressLine1": "123 Medical Center Dr",
    "city": "Los Angeles",
    "state": "CA",
    "zipCode": "90001",
    "name": "LA Medical Center",
    "healthSystem": "Cedars-Sinai",
    "facilityType": "Hospital",
    "providerCount": 125
  }
}
```

---

### Get Location Providers

```
GET /locations/:id/providers
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `specialty` | string | No | Filter by specialty |
| `page` | number | No | Page number |
| `limit` | number | No | Results per page |

---

### Get Health Systems

```
GET /locations/health-systems
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string | No | Filter by state |

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "name": "Kaiser Permanente",
      "locationCount": 45,
      "totalProviders": 12345
    },
    {
      "name": "Cedars-Sinai",
      "locationCount": 12,
      "totalProviders": 3456
    }
  ]
}
```

---

## Plans

### Search Plans

```
GET /plans/search
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | No | Plan name search |
| `carrier` | string | No | Insurance carrier |
| `state` | string | No | State availability |

---

## Admin Endpoints

All admin endpoints require `X-Admin-Secret` header.

### Health Check

```
GET /admin/health
```

### Cleanup Expired Data

```
POST /admin/cleanup-expired
```

### Get Expiration Stats

```
GET /admin/expiration-stats
```

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `NOT_FOUND` | 404 | Resource not found |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `CAPTCHA_REQUIRED` | 400 | CAPTCHA token missing |
| `CAPTCHA_FAILED` | 403 | CAPTCHA verification failed |
| `UNAUTHORIZED` | 401 | Invalid admin secret |
| `INTERNAL_ERROR` | 500 | Server error |

---

## SDKs and Examples

### JavaScript/TypeScript

```typescript
const api = {
  baseUrl: 'https://api.verifymyprovider.com/api/v1',

  async searchProviders(query: SearchQuery) {
    const params = new URLSearchParams(query);
    const response = await fetch(`${this.baseUrl}/providers/search?${params}`);
    return response.json();
  },

  async submitVerification(data: VerificationData) {
    const response = await fetch(`${this.baseUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  }
};
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-31 | Initial API release |
