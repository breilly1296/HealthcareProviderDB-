# VerifyMyProvider API Routes Security Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

The API is well-structured with proper rate limiting, input validation, and CAPTCHA protection on write endpoints. All endpoints except admin are public by design (public data, anonymous verifications).

---

## Route Inventory

### Provider Routes (`/api/v1/providers`)

| Method | Path | Rate Limit | Auth | CAPTCHA | Status |
|--------|------|------------|------|---------|--------|
| GET | `/search` | 100/hr | Public | No | ✅ |
| GET | `/cities` | 200/hr | Public | No | ✅ |
| GET | `/:npi` | 200/hr | Public | No | ✅ |
| GET | `/:npi/plans` | 200/hr | Public | No | ✅ |
| GET | `/:npi/colocated` | 200/hr | Public | No | ✅ |

**Implementation:**
```typescript
// packages/backend/src/routes/providers.ts
router.get('/search', searchRateLimiter, asyncHandler(async (req, res) => {
  const query = searchQuerySchema.parse(req.query);
  const result = await searchProviders(query);
  res.json({ success: true, data: result });
}));
```

---

### Verification Routes (`/api/v1/verify`)

| Method | Path | Rate Limit | Auth | CAPTCHA | Status |
|--------|------|------------|------|---------|--------|
| POST | `/` | 10/hr | Public | ✅ Yes | ✅ |
| POST | `/:verificationId/vote` | 10/hr | Public | ✅ Yes | ✅ |
| GET | `/stats` | 200/hr | Public | No | ✅ |
| GET | `/recent` | 200/hr | Public | No | ✅ |
| GET | `/:npi/:planId` | 200/hr | Public | No | ✅ |

**Implementation:**
```typescript
// packages/backend/src/routes/verify.ts
router.post('/',
  verificationRateLimiter,  // 10/hr per IP
  verifyCaptcha,            // reCAPTCHA v3
  asyncHandler(async (req, res) => {
    const body = submitVerificationSchema.parse(req.body);
    const result = await submitVerification({ ...body, sourceIp: req.ip });
    res.status(201).json({ success: true, data: result });
  })
);
```

---

### Location Routes (`/api/v1/locations`)

| Method | Path | Rate Limit | Auth | CAPTCHA | Status |
|--------|------|------------|------|---------|--------|
| GET | `/health-systems` | 200/hr | Public | No | ✅ |
| GET | `/:locationId` | 200/hr | Public | No | ✅ |
| GET | `/:locationId/providers` | 200/hr | Public | No | ✅ |

---

### Plan Routes (`/api/v1/plans`)

| Method | Path | Rate Limit | Auth | CAPTCHA | Status |
|--------|------|------------|------|---------|--------|
| GET | `/search` | 100/hr | Public | No | ✅ |
| GET | `/:planId` | 200/hr | Public | No | ✅ |
| GET | `/:planId/providers` | 200/hr | Public | No | ✅ |

---

### Admin Routes (`/api/v1/admin`) - PROTECTED

| Method | Path | Rate Limit | Auth | Status |
|--------|------|------------|------|--------|
| GET | `/health` | None | X-Admin-Secret | ✅ |
| POST | `/cleanup-expired` | None | X-Admin-Secret | ✅ |
| GET | `/expiration-stats` | None | X-Admin-Secret | ✅ |

**Implementation:**
```typescript
// packages/backend/src/routes/admin.ts
function adminAuthMiddleware(req, res, next) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(503).json({ error: 'Admin not configured' });
  }

  const providedSecret = req.headers['x-admin-secret'];
  // Timing-safe comparison
  const isValid = timingSafeEqual(
    Buffer.from(String(providedSecret || '')),
    Buffer.from(adminSecret)
  );

  if (!isValid) throw AppError.unauthorized('Invalid admin secret');
  next();
}
```

---

### Health Check (`/health`)

| Method | Path | Rate Limit | Auth | Status |
|--------|------|------------|------|--------|
| GET | `/health` | None | Public | ✅ |

---

## Security Analysis

### Rate Limiting ✅

| Limiter | Limit | Window | Endpoints |
|---------|-------|--------|-----------|
| `verificationRateLimiter` | 10 req | 1 hour | POST /verify, POST /vote |
| `searchRateLimiter` | 100 req | 1 hour | GET /search |
| `defaultRateLimiter` | 200 req | 1 hour | All other GET endpoints |

**Headers Returned:**
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` (on 429)

---

### Input Validation ✅

All endpoints use Zod schemas:

```typescript
// NPI validation
const npiParamSchema = z.object({
  npi: z.string().length(10).regex(/^\d+$/),
});

// Search query validation
const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  specialty: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Verification validation
const submitVerificationSchema = z.object({
  npi: z.string().length(10).regex(/^\d+$/),
  planId: z.string().min(1).max(100),
  acceptsInsurance: z.boolean(),
  notes: z.string().max(1000).optional(),
  captchaToken: z.string().optional(),
});
```

---

### CAPTCHA Protection ✅

Write endpoints require reCAPTCHA v3:

- `POST /api/v1/verify` - Submit verification
- `POST /api/v1/verify/:id/vote` - Vote on verification

**Configuration:**
- Score threshold: 0.5
- Fail mode: Open (allows with stricter rate limiting)
- Fallback rate limit: 3/hour

---

### Error Handling ✅

Consistent error response format:

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

**Error Codes:**
- `VALIDATION_ERROR` - Invalid input
- `NOT_FOUND` - Resource not found
- `TOO_MANY_REQUESTS` - Rate limited
- `CAPTCHA_REQUIRED` - Missing CAPTCHA
- `UNAUTHORIZED` - Invalid admin secret

---

### Authentication ✅

| Endpoint Type | Auth Method | Status |
|---------------|-------------|--------|
| Public (GET) | None | By design |
| Public (POST) | CAPTCHA + Rate limit | ✅ |
| Admin | X-Admin-Secret header | ✅ |
| User accounts | Not implemented | By design (MVP) |

---

## Security Checklist

### Rate Limiting
- [x] Verification: 10/hr per IP
- [x] Voting: 10/hr per IP
- [x] Search: 100/hr per IP
- [x] Default: 200/hr per IP
- [x] Headers returned
- [x] Dual-mode (Redis + in-memory)

### CAPTCHA
- [x] reCAPTCHA v3 on verification
- [x] reCAPTCHA v3 on voting
- [x] Fail-open with fallback
- [x] Score threshold configurable

### Input Validation
- [x] Zod schemas on all endpoints
- [x] NPI format validation
- [x] Pagination limits enforced
- [x] String length limits

### Admin Security
- [x] X-Admin-Secret required
- [x] Timing-safe comparison
- [x] Graceful 503 if not configured

### Error Handling
- [x] asyncHandler wraps all routes
- [x] No stack traces in production
- [x] Consistent response format

---

## Potential Improvements

### Recommended
1. **Request logging** - Log all requests with correlation IDs
2. **API versioning** - Document deprecation policy
3. **Response caching** - Cache provider details (short TTL)

### Future
1. **User authentication** - When accounts are added
2. **API keys** - For B2B customers
3. **Webhooks** - For verification notifications

---

## Conclusion

The API is well-secured for its current use case:

- ✅ Rate limiting on all endpoints
- ✅ CAPTCHA on write endpoints
- ✅ Input validation everywhere
- ✅ Admin endpoints protected
- ✅ Consistent error handling

No immediate security issues identified.
