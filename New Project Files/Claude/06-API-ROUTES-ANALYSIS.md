# VerifyMyProvider API Routes Security Review

**Last Updated:** January 25, 2026
**Priority:** High
**Total Endpoints:** 25+
**Authentication:** Public (Admin endpoints protected)

---

## Executive Summary

The VerifyMyProvider API implements a solid security baseline with:
- Rate limiting on all endpoints
- Input validation via Zod schemas
- CORS protection
- CAPTCHA verification on submissions
- Admin endpoint protection

**Critical Considerations:**
- Rate limiting uses in-memory storage (won't scale horizontally)
- Admin auth uses basic string comparison (timing attack risk)

---

## Route Inventory

### Health & System Endpoints

| Method | Path | Rate Limit | Auth | Notes |
|--------|------|------------|------|-------|
| GET | `/health` | None (exempted) | None | Monitoring tools |
| GET | `/` | default (200/hr) | None | API info |

### Provider Endpoints (`/api/v1/providers`)

| Method | Path | Rate Limit | Auth | Input Validation |
|--------|------|------------|------|------------------|
| GET | `/search` | search (100/hr) | None | state, city, specialty, NPI, pagination |
| GET | `/cities` | default (200/hr) | None | State code (2 chars) |
| GET | `/:npi` | default (200/hr) | None | NPI (10 digits) |
| GET | `/:npi/plans` | default (200/hr) | None | NPI + status, minConfidence |
| GET | `/:npi/colocated` | default (200/hr) | None | NPI + pagination |

### Plan Endpoints (`/api/v1/plans`)

| Method | Path | Rate Limit | Auth | Input Validation |
|--------|------|------------|------|------------------|
| GET | `/search` | search (100/hr) | None | issuerName, planType, state |
| GET | `/grouped` | default (200/hr) | None | search, state |
| GET | `/meta/issuers` | default (200/hr) | None | Optional state |
| GET | `/meta/types` | default (200/hr) | None | Optional state/issuer |
| GET | `/:planId/providers` | search (100/hr) | None | planId (1-50 chars) |
| GET | `/:planId` | default (200/hr) | None | planId validation |

### Verification Endpoints (`/api/v1/verify`)

| Method | Path | Rate Limit | CAPTCHA | Input Validation |
|--------|------|------------|---------|------------------|
| POST | `/` | verification (10/hr) | Yes | NPI, planId, acceptance, notes |
| POST | `/:verificationId/vote` | vote (10/hr) | Yes | vote enum (up/down) |
| GET | `/stats` | default (200/hr) | No | None |
| GET | `/recent` | default (200/hr) | No | limit (1-100), npi, planId |
| GET | `/:npi/:planId` | default (200/hr) | No | NPI + planId |

### Location Endpoints (`/api/v1/locations`)

| Method | Path | Rate Limit | Auth | Input Validation |
|--------|------|------------|------|------------------|
| GET | `/search` | search (100/hr) | None | search, state, city, healthSystem |
| GET | `/health-systems` | default (200/hr) | None | Optional state/cities |
| GET | `/stats/:state` | default (200/hr) | None | State code (2 chars) |
| GET | `/:locationId` | default (200/hr) | None | locationId (positive int) |
| GET | `/:locationId/providers` | default (200/hr) | None | locationId + pagination |

### Admin Endpoints (`/api/v1/admin`) - PROTECTED

| Method | Path | Rate Limit | Auth | Input Validation |
|--------|------|------------|------|------------------|
| POST | `/cleanup-expired` | default (200/hr) | X-Admin-Secret | dryRun, batchSize |
| GET | `/expiration-stats` | default (200/hr) | X-Admin-Secret | None |
| GET | `/health` | default (200/hr) | X-Admin-Secret | None |

---

## Rate Limiting Implementation

### Rate Limits by Category

| Category | Limit | Window | Applied To |
|----------|-------|--------|-----------|
| Default | 200/hr | 1 hour | Most GET endpoints |
| Search | 100/hr | 1 hour | Search endpoints |
| Verification | 10/hr | 1 hour | POST /verify |
| Vote | 10/hr | 1 hour | POST /vote |

### Implementation Details

**Location:** `packages/backend/src/middleware/rateLimiter.ts`

```typescript
// In-memory rate limiting with IP-based tracking
export const verificationRateLimiter = createRateLimiter({
  name: 'verification',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've submitted too many verifications..."
});
```

### Rate Limit Headers
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Reset` - Reset timestamp
- `Retry-After` - Seconds until retry (on 429)

### CRITICAL: Scaling Limitation

**Issue:** In-memory rate limiting per Express instance

**Impact:** In horizontal scaling (multiple Cloud Run instances):
- Each instance maintains independent counters
- Effective limit = limit × number of instances
- Example: 5 instances = 50 verifications/hour (5× bypass)

**Current Mitigation:** Cloud Run configured with maxInstances=1

**Recommended Fix:** Redis-based rate limiting or Cloud Armor

---

## Input Validation (Zod Schemas)

### Validation Strengths
- [x] Type coercion for numbers
- [x] Enum validation for status/vote values
- [x] Regex validation for NPIs (10 digits)
- [x] Max length constraints on all text inputs
- [x] Pagination limits (min 1, max 100)

### Validation Examples

**NPI Validation:**
```typescript
z.string().length(10).regex(/^\d+$/)
```

**Pagination:**
```typescript
page: z.coerce.number().int().positive().default(1),
limit: z.coerce.number().int().min(1).max(100).default(20)
```

**Verification Submission:**
```typescript
{
  npi: z.string().length(10).regex(/^\d+$/),
  planId: z.string().min(1).max(50),
  acceptsInsurance: z.boolean(),
  notes: z.string().max(1000).optional(),
  evidenceUrl: z.string().url().max(500).optional(),
  submittedBy: z.string().email().max(200).optional(),
  captchaToken: z.string().optional()
}
```

### Minor Validation Gaps

1. **verificationId:** Uses generic string validation, could be stricter
2. **Email validation:** Basic `.email()`, doesn't verify domain
3. **CAPTCHA token:** Just checks presence, no format validation
4. **Evidence URL:** Accepts any URL, could whitelist trusted domains

---

## Error Handling

### Error Handler Middleware

**Location:** `packages/backend/src/middleware/errorHandler.ts`

**Error Response Format:**
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

### Error Types

| Type | Status | Example |
|------|--------|---------|
| AppError.badRequest | 400 | Invalid input |
| AppError.unauthorized | 401 | Missing auth |
| AppError.forbidden | 403 | CAPTCHA failed |
| AppError.notFound | 404 | Provider not found |
| AppError.conflict | 409 | Duplicate vote |
| AppError.tooManyRequests | 429 | Rate limited |
| AppError.internal | 500 | Server error |

### Zod Validation Errors
```json
{
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      { "field": "npi", "message": "NPI must be exactly 10 digits" }
    ]
  }
}
```

---

## Admin Endpoint Security

### Authentication
```typescript
const adminSecret = process.env.ADMIN_SECRET;
if (req.headers['x-admin-secret'] !== adminSecret) {
  throw AppError.unauthorized('Invalid or missing admin secret');
}
```

### Security Issues

1. **String Comparison Vulnerability**
   - Uses basic `!==` comparison
   - Vulnerable to timing attacks
   - Should use `crypto.timingSafeEqual()`

2. **No Stricter Rate Limiting**
   - Uses default 200/hr limit
   - Should have dedicated admin limiter

3. **No Audit Logging**
   - Admin actions not specifically logged
   - Should track cleanup operations

---

## Security Headers (Helmet.js)

**Location:** `packages/backend/src/index.ts`

```typescript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      // Very restrictive for JSON API
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' }
})
```

---

## CORS Configuration

### Allowed Origins
- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- `https://verifymyprovider-frontend-*.run.app`
- `process.env.FRONTEND_URL`
- Development: `localhost:3000`, `localhost:3001`

### Allowed Headers
- Content-Type
- Authorization
- X-Request-ID
- X-Admin-Secret

---

## CAPTCHA Protection

**Location:** `packages/backend/src/middleware/captcha.ts`

**Implementation:** Google reCAPTCHA v3

**Applied To:**
- POST /api/v1/verify (submit verification)
- POST /api/v1/verify/:verificationId/vote

**Bot Detection:**
- Score threshold: 0.5 (0 = bot, 1.0 = human)
- Scores < 0.5 → 403 Forbidden

**Graceful Degradation:**
- Skips in development/test environments
- Skips if RECAPTCHA_SECRET_KEY not configured
- **Fails open on Google API errors** (allows request through)

---

## Security Summary

| Category | Status | Risk Level |
|----------|--------|-----------|
| Rate Limiting | Implemented | Medium (scaling) |
| Input Validation | Comprehensive | Low |
| Error Handling | Good | Low |
| Authentication | Admin Only | Medium |
| CORS | Well-configured | Low |
| Security Headers | Excellent | Low |
| CAPTCHA | Good | Low |

---

## Recommendations

### High Priority
1. Pre-scaling: Implement Redis-based rate limiting
2. Use `crypto.timingSafeEqual()` for admin secret
3. Add stricter rate limit for admin endpoints

### Medium Priority
1. Add audit logging for admin actions
2. Consider not failing open on CAPTCHA errors
3. Add UUID validation for verificationId

### Low Priority
1. Whitelist trusted domains for evidence URLs
2. Add email domain validation
3. Consider CAPTCHA on GET endpoints (discovery abuse)

---

*API security is appropriate for current deployment but requires changes before horizontal scaling*
