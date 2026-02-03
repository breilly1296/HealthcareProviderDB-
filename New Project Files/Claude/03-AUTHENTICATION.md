# VerifyMyProvider Authentication Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

VerifyMyProvider intentionally has **minimal authentication** by design. The MVP uses anonymous crowdsourcing with CAPTCHA and rate limiting instead of user accounts. Admin endpoints are protected with a shared secret.

---

## Authentication Architecture

### Current State

```
┌─────────────────────────────────────────────────────────────┐
│                    Authentication Layers                     │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  Public Routes  │    │  Admin Routes   │                │
│  │                 │    │                 │                │
│  │ - No auth       │    │ - X-Admin-Secret│                │
│  │ - Rate limited  │    │ - Timing-safe   │                │
│  │ - CAPTCHA (POST)│    │ - 503 if unset  │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                              │
│  User Accounts: NOT IMPLEMENTED (by design)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Public Endpoints (No Auth)

All public endpoints are protected by rate limiting and (for write operations) CAPTCHA:

| Endpoint Type | Protection | Rationale |
|---------------|------------|-----------|
| GET (read) | Rate limiting | Public data, anonymous access OK |
| POST (write) | Rate limiting + CAPTCHA | Prevent spam, allow anonymous |

**Why No User Auth:**
1. Data is publicly available (NPI registry)
2. Anonymous verification encourages participation
3. CAPTCHA + rate limiting prevents abuse
4. Reduced friction = more verifications

---

## Admin Authentication

### Implementation

```typescript
// packages/backend/src/routes/admin.ts

function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;

  // Graceful degradation if not configured
  if (!adminSecret) {
    return res.status(503).json({
      error: 'Admin endpoints not configured'
    });
  }

  const providedSecret = req.headers['x-admin-secret'];

  // Timing-safe comparison prevents timing attacks
  const secretBuffer = Buffer.from(adminSecret);
  const providedBuffer = Buffer.from(String(providedSecret || ''));

  // Must be same length for timing-safe compare
  if (secretBuffer.length !== providedBuffer.length) {
    throw AppError.unauthorized('Invalid admin secret');
  }

  const isValid = crypto.timingSafeEqual(secretBuffer, providedBuffer);

  if (!isValid) {
    throw AppError.unauthorized('Invalid admin secret');
  }

  next();
}
```

### Security Features

| Feature | Status | Notes |
|---------|--------|-------|
| Timing-safe comparison | ✅ | Prevents timing attacks |
| Environment variable | ✅ | Secret not in code |
| Graceful 503 | ✅ | Clear error if not configured |
| No rate limiting | ⚠️ | Admin assumed trusted |

---

## Protected Admin Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/admin/health` | Database health check |
| POST | `/api/v1/admin/cleanup-expired` | Trigger TTL cleanup |
| GET | `/api/v1/admin/expiration-stats` | View expiration metrics |

---

## CAPTCHA as Authentication Proxy

For public write endpoints, CAPTCHA serves as a "soft authentication":

```typescript
// packages/backend/src/middleware/captcha.ts

export async function verifyCaptcha(req, res, next) {
  // Development bypass
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  // Graceful degradation
  if (!process.env.RECAPTCHA_SECRET_KEY) {
    console.warn('[CAPTCHA] Not configured');
    return next();
  }

  const token = req.body.captchaToken;
  if (!token) {
    return next(AppError.badRequest('CAPTCHA token required'));
  }

  // Verify with Google
  const result = await verifyWithGoogle(token, req.ip);

  // Score check (0 = bot, 1 = human)
  if (result.score < CAPTCHA_MIN_SCORE) {
    return next(AppError.forbidden('Suspicious activity blocked'));
  }

  next();
}
```

---

## Future Authentication (Not Planned for MVP)

If user accounts are added later:

### Recommended Approach

| Component | Recommendation |
|-----------|----------------|
| Provider | Auth0 or Clerk |
| Sessions | JWT with refresh tokens |
| Storage | httpOnly cookies |
| MFA | Optional for trusted verifiers |

### Graduated Trust Model

```
New User → Verified Email → Trusted Verifier → Power User
   ↓            ↓                 ↓                ↓
 10/hr        50/hr            200/hr          Unlimited
```

---

## Security Checklist

### Current Authentication
- [x] Admin endpoints protected
- [x] Timing-safe secret comparison
- [x] Environment-based secrets
- [x] Graceful degradation
- [x] CAPTCHA on write endpoints
- [x] Rate limiting everywhere

### Not Implemented (By Design)
- [ ] User registration
- [ ] User login
- [ ] Password management
- [ ] Session management
- [ ] OAuth/SSO
- [ ] API keys

---

## Recommendations

### Immediate
- ✅ Current implementation is appropriate for MVP
- Monitor abuse patterns to validate approach

### If Abuse Increases
1. Add fingerprinting (IP + User Agent + Browser)
2. Implement progressive CAPTCHA (harder after failures)
3. Consider lightweight user accounts

### For B2B Features
1. Add API key authentication
2. Per-customer rate limits
3. Usage tracking and billing

---

## Conclusion

The authentication model is **appropriate for the MVP**:

- ✅ Public data doesn't require user auth
- ✅ Admin endpoints properly protected
- ✅ CAPTCHA + rate limiting prevents abuse
- ✅ Low friction encourages participation

No immediate changes needed.
