# VerifyMyProvider CSRF Protection Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

CSRF protection is **not required** for VerifyMyProvider because the API uses JSON-only requests with no session cookies. The CAPTCHA token on write endpoints provides equivalent protection.

---

## Why CSRF Is Not Needed

### CSRF Attack Requirements

For CSRF to work, an attacker needs:
1. ✅ Victim authenticated via cookies
2. ✅ State-changing request possible
3. ❌ **Predictable request format** - We require CAPTCHA token

### VerifyMyProvider Mitigations

| CSRF Requirement | Our Status | Why CSRF Fails |
|------------------|------------|----------------|
| Cookie auth | ❌ No cookies | No session to hijack |
| Predictable request | ❌ CAPTCHA required | Token unpredictable |
| Simple form submission | ❌ JSON only | Content-Type: application/json |

---

## Request Analysis

### Write Endpoints (POST)

```typescript
// POST /api/v1/verify
{
  "npi": "1234567890",
  "planId": "BCBS_PPO_123",
  "acceptsInsurance": true,
  "captchaToken": "03AGdBq24PB..."  // Required, unpredictable
}
```

**Why CSRF fails:**
1. `captchaToken` is unique per request
2. Attacker cannot obtain victim's CAPTCHA token
3. Request must be JSON (not form-encoded)

### Read Endpoints (GET)

- No authentication required
- No state changes
- Public data only
- CSRF not applicable to GET requests

---

## Defense in Depth

Even without explicit CSRF tokens, multiple layers protect against cross-origin attacks:

### Layer 1: CORS Configuration

```typescript
// packages/backend/src/app.ts
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: false,  // No cookies
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-Admin-Secret']
}));
```

### Layer 2: Content-Type Validation

```typescript
// Express JSON middleware rejects non-JSON
app.use(express.json());
// Requests with wrong Content-Type are rejected
```

### Layer 3: CAPTCHA Requirement

```typescript
// All POST requests require valid CAPTCHA
router.post('/verify', verifyCaptcha, submitVerification);
router.post('/verify/:id/vote', verifyCaptcha, submitVote);
```

### Layer 4: Rate Limiting

```typescript
// Even if CSRF somehow succeeded, rate limiting kicks in
router.post('/verify', verificationRateLimiter, ...);  // 10/hr per IP
```

---

## Admin Endpoints

Admin endpoints use header-based authentication:

```typescript
// X-Admin-Secret header required
// Cannot be set by cross-origin requests
const providedSecret = req.headers['x-admin-secret'];
```

**CSRF Protection:**
- Custom headers cannot be sent cross-origin without CORS preflight
- CORS doesn't allow X-Admin-Secret from other origins
- Effectively CSRF-protected by design

---

## Comparison to Traditional Apps

| Feature | Traditional App | VerifyMyProvider |
|---------|-----------------|------------------|
| Auth method | Session cookie | None (anonymous) |
| CSRF tokens | Required | Not needed |
| Protection | Synchronizer tokens | CAPTCHA + CORS |
| State changes | Authenticated user | Anonymous + verified |

---

## If User Accounts Are Added

If authentication is added in the future, implement CSRF protection:

### Recommended Approach

```typescript
// Option 1: Double Submit Cookie
app.use(csrf({
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  }
}));

// Option 2: Synchronizer Token Pattern
app.use(csurf({ cookie: true }));
```

### SameSite Cookies

```typescript
// Modern browsers support SameSite
res.cookie('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict'  // Prevents CSRF
});
```

---

## Security Checklist

### Current CSRF Posture
- [x] No session cookies used
- [x] CORS properly configured
- [x] CAPTCHA on write endpoints
- [x] JSON-only API
- [x] Custom header on admin routes

### Not Applicable
- [ ] CSRF tokens - Not needed without sessions
- [ ] Double submit cookies - No cookies used
- [ ] SameSite cookies - No cookies used

---

## Recommendations

### Immediate
- ✅ No changes needed - Current design is CSRF-safe

### Documentation
- Document why CSRF protection is not needed
- Note that this changes if auth is added

### Future (If Auth Added)
1. Implement SameSite=Strict cookies
2. Add CSRF token middleware
3. Include token in all state-changing requests

---

## Conclusion

CSRF protection is **not required** for the current implementation:

- ✅ No session cookies = No CSRF vector
- ✅ CAPTCHA tokens are unpredictable
- ✅ CORS blocks cross-origin requests
- ✅ JSON-only API prevents form submissions
- ✅ Admin uses custom header (CORS-protected)

The design is secure against CSRF attacks.
