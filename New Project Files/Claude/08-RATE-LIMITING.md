# VerifyMyProvider Rate Limiting & CAPTCHA Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

Rate limiting and CAPTCHA are fully implemented (Tier 1 + Tier 2 complete). The system uses dual-mode rate limiting (Redis or in-memory) with Google reCAPTCHA v3 for bot protection.

---

## Implementation Status

| Tier | Status | Components |
|------|--------|------------|
| Tier 1 | ✅ Complete | IP-based rate limiting |
| Tier 2 | ✅ Complete | CAPTCHA protection |
| Tier 3 | 🔄 Future | User account-based limits |

---

## Rate Limiting Architecture

### Dual-Mode Design

```
┌─────────────────────────────────────────────────────────────┐
│                     Rate Limiter                             │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Redis Mode    │ OR │  In-Memory Mode  │                │
│  │  (distributed)  │    │ (single-instance)│                │
│  │                 │    │                  │                │
│  │ - Sorted sets   │    │ - Map counters   │                │
│  │ - Sliding window│    │ - Periodic cleanup│               │
│  │ - Shared state  │    │ - Process-local  │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                              │
│  Fail-Open: If Redis unavailable, allow with warning        │
└─────────────────────────────────────────────────────────────┘
```

### Configuration

```typescript
// packages/backend/src/middleware/rateLimiter.ts

export const verificationRateLimiter = createRateLimiter({
  name: 'verification',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've submitted too many verifications. Please try again in 1 hour.",
});

export const voteRateLimiter = createRateLimiter({
  name: 'vote',
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
});

export const searchRateLimiter = createRateLimiter({
  name: 'search',
  windowMs: 60 * 60 * 1000,
  maxRequests: 100,
});

export const defaultRateLimiter = createRateLimiter({
  name: 'default',
  windowMs: 60 * 60 * 1000,
  maxRequests: 200,
});
```

---

## Rate Limit Assignments

| Endpoint | Limiter | Limit | Window |
|----------|---------|-------|--------|
| POST /verify | verificationRateLimiter | 10/hr | 1 hour |
| POST /verify/:id/vote | voteRateLimiter | 10/hr | 1 hour |
| GET /providers/search | searchRateLimiter | 100/hr | 1 hour |
| GET /providers/:npi | defaultRateLimiter | 200/hr | 1 hour |
| GET /providers/:npi/plans | defaultRateLimiter | 200/hr | 1 hour |
| GET /verify/stats | defaultRateLimiter | 200/hr | 1 hour |
| GET /health | None | Unlimited | - |
| Admin endpoints | None | Protected by auth | - |

---

## CAPTCHA Implementation

### Google reCAPTCHA v3

```typescript
// packages/backend/src/middleware/captcha.ts

export async function verifyCaptcha(req, res, next) {
  // Skip in development
  if (process.env.NODE_ENV === 'development') return next();

  // Skip if not configured
  if (!RECAPTCHA_SECRET) {
    console.warn('[CAPTCHA] Not configured');
    return next();
  }

  const captchaToken = req.body.captchaToken;
  if (!captchaToken) {
    return next(AppError.badRequest('CAPTCHA token required'));
  }

  // Verify with Google
  const response = await fetch(RECAPTCHA_VERIFY_URL, {
    method: 'POST',
    body: new URLSearchParams({
      secret: RECAPTCHA_SECRET,
      response: captchaToken,
      remoteip: req.ip,
    }),
  });

  const data = await response.json();

  // Check score (0 = bot, 1 = human)
  if (data.score < CAPTCHA_MIN_SCORE) {
    return next(AppError.forbidden('Suspicious activity blocked'));
  }

  next();
}
```

### Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `RECAPTCHA_SECRET_KEY` | Required | Google secret key |
| `CAPTCHA_FAIL_MODE` | `open` | Behavior on API failure |
| `CAPTCHA_MIN_SCORE` | `0.5` | Minimum score (0-1) |
| `CAPTCHA_API_TIMEOUT_MS` | `5000` | API timeout |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | `3` | Fallback rate limit |

### Protected Endpoints

- `POST /api/v1/verify` - Submit verification
- `POST /api/v1/verify/:id/vote` - Vote on verification

---

## Fail Modes

### FAIL-OPEN (Default)

When Google API is unavailable:
1. Log warning
2. Apply stricter fallback rate limit (3/hr instead of 10/hr)
3. Set `X-Security-Degraded: captcha-unavailable` header
4. Allow request if within fallback limit

```typescript
if (CAPTCHA_FAIL_MODE === 'open') {
  const fallbackResult = checkFallbackRateLimit(clientIp);
  if (!fallbackResult.allowed) {
    return next(AppError.tooManyRequests('Fallback limit exceeded'));
  }
  res.setHeader('X-Security-Degraded', 'captcha-unavailable');
  next();
}
```

### FAIL-CLOSED

When Google API is unavailable:
1. Log error
2. Block all requests
3. Return 503 Service Unavailable

```typescript
if (CAPTCHA_FAIL_MODE === 'closed') {
  return next(AppError.serviceUnavailable(
    'Security verification temporarily unavailable'
  ));
}
```

---

## Response Headers

### Rate Limit Headers

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1706745600
Retry-After: 3600  (on 429)
```

### Degraded Mode Headers

```
X-RateLimit-Status: degraded  (Redis unavailable)
X-Security-Degraded: captcha-unavailable  (Google API down)
X-Fallback-RateLimit-Limit: 3
X-Fallback-RateLimit-Remaining: 2
```

---

## Attack Mitigation

### Scenario 1: Bot Spam

**Attack:** Script sends 1000 verifications/minute

**Mitigation:**
1. Rate limit: 10/hour per IP
2. CAPTCHA: Bot score < 0.5 blocked
3. Result: Max 10 verifications per IP

### Scenario 2: VPN Rotation

**Attack:** User rotates through 100 VPN IPs

**Mitigation:**
1. Each IP still limited to 10/hour
2. CAPTCHA detects suspicious behavior
3. Result: Costly attack, limited impact

### Scenario 3: Google API Outage

**Attack:** Exploit CAPTCHA outage

**Mitigation:**
1. Fail-open with 3/hour limit (vs normal 10)
2. 70% reduction in throughput
3. Result: Attack throttled, service available

---

## Monitoring

### Log Patterns

```
# Rate limit hit
[RateLimit:verification] 429 Too Many Requests - IP: 1.2.3.4

# CAPTCHA low score
[CAPTCHA] Low score - possible bot: 0.3, IP: 1.2.3.4

# Redis unavailable
[RateLimit] Redis unavailable, allowing request (fail-open)

# Google API error
[CAPTCHA] Google API error - using fallback rate limiting
```

### Metrics to Track

- Rate limit hits per endpoint
- CAPTCHA pass/fail rate
- Average CAPTCHA score
- Redis connection failures
- Google API errors

---

## Checklist Status

### Tier 1: IP-Based Rate Limiting ✅
- [x] Custom rate limiter middleware
- [x] Verification: 10/hr
- [x] Voting: 10/hr
- [x] Search: 100/hr
- [x] Default: 200/hr
- [x] Rate limit headers
- [x] Dual-mode (Redis + in-memory)
- [x] Fail-open behavior

### Tier 2: CAPTCHA Protection ✅
- [x] Google reCAPTCHA v3 integrated
- [x] Score threshold: 0.5
- [x] Protected endpoints: verify, vote
- [x] Fail-open with fallback
- [x] Fallback rate limit: 3/hr
- [x] API timeout: 5 seconds

### Tier 3: User-Based Limits (Future)
- [ ] User accounts
- [ ] Graduated limits by trust
- [ ] IP allowlist for trusted
- [ ] Anomaly detection

---

## Recommendations

### Immediate
1. ✅ All critical protections in place
2. Add monitoring dashboard for rate limits
3. Set up alerts for high rejection rates

### Future
1. Implement user accounts for trusted verifiers
2. Add fingerprinting (IP + User Agent)
3. Build admin panel for blocklist management

---

## Conclusion

The rate limiting and CAPTCHA implementation is **production-ready**:

- ✅ Multi-layer protection (rate limit + CAPTCHA)
- ✅ Graceful degradation (fail-open)
- ✅ Horizontal scaling support (Redis mode)
- ✅ Comprehensive headers for debugging
- ✅ Configurable via environment variables

The crowdsource verification system is protected against spam attacks.
