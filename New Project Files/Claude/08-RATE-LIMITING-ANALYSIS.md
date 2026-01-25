# VerifyMyProvider Rate Limiting Review

**Last Updated:** January 25, 2026
**Priority:** Critical
**Status:** Tier 1 IMPLEMENTED (January 2026)
**Previous Issue:** ZeroPath Security Scan - CVSS 7.1 (RESOLVED)

---

## Executive Summary

Rate limiting has been implemented to address the critical spam vulnerability identified by ZeroPath. The current implementation uses IP-based rate limiting with in-memory storage. **This is sufficient for single-instance deployment but will not scale horizontally.**

---

## Current Implementation

### Rate Limits by Endpoint

| Endpoint | Limit | Window | Status |
|----------|-------|--------|--------|
| POST /api/v1/verify | 10/hour | 1 hour | IMPLEMENTED |
| POST /api/v1/verify/:id/vote | 10/hour | 1 hour | IMPLEMENTED |
| GET /api/v1/providers/search | 100/hour | 1 hour | IMPLEMENTED |
| GET /api/v1/providers/:npi | 200/hour | 1 hour | IMPLEMENTED |
| Other endpoints | 200/hour | 1 hour | IMPLEMENTED |

### Implementation Location
`packages/backend/src/middleware/rateLimiter.ts`

```typescript
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
  message: "You've submitted too many votes. Please try again in 1 hour.",
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

### Features Implemented
- [x] IP-based rate limiting
- [x] Standard rate limit headers (X-RateLimit-*)
- [x] Retry-After header on 429 responses
- [x] Automatic cleanup of old entries (every 60 seconds)
- [x] Skip function support for bypassing limits
- [x] Human-friendly error messages

---

## CRITICAL: Architecture Limitation

### In-Memory Rate Limiting Problem

**Issue:** The rate limiter uses in-memory storage per Express.js instance.

**Impact in Horizontal Scaling:**
```
If maxInstances=5:
- Attacker distributes requests across 5 instances
- Each instance limit: 10 verifications/hour
- Actual effective limit: 50 verifications/hour (5× bypass)
```

**Current Mitigation:**
- Cloud Run configured with maxInstances=1
- Documented in rateLimiter.ts with clear warnings

**Required for Scaling:**
1. Redis-based rate limiting (Cloud Memorystore)
2. Or GCP Cloud Armor at load balancer level
3. Or keep min/maxInstances = 1

---

## Attack Scenarios Addressed

### Scenario 1: Competitor Sabotage
**Attack:** Flood fake "doesn't accept" verifications
**Mitigation:** 10 verifications/hour per IP

### Scenario 2: Provider Manipulation
**Attack:** Create false in-network claims
**Mitigation:** Rate limiting + consensus requirements

### Scenario 3: Insurance Gaming
**Attack:** Confuse users about acceptance
**Mitigation:** Confidence scoring + verification thresholds

### Scenario 4: Bot Spam
**Attack:** Automated attacks poison scores
**Mitigation:** Rate limiting + CAPTCHA

### Scenario 5: Vote Manipulation
**Attack:** Upvote bad, downvote good
**Mitigation:** 10 votes/hour + vote deduplication by IP

---

## Impact on Confidence Scores

| Attack | Impact Without Limits | Impact With Limits |
|--------|----------------------|-------------------|
| 10 fake "No" verifications | Score drops 80 → 40 | Limited to 10/hour |
| 100 fake verifications | Data completely poisoned | Would take 10 hours |
| Continuous spam | Crowdsource moat destroyed | Severely limited |

---

## Rate Limiting Tiers

### Tier 1: IP-Based (CURRENT)
**Status:** COMPLETE

- IP-based tracking
- In-memory storage
- Works for single instance

### Tier 2: Fingerprinting (NEXT)
**Status:** PLANNED

```typescript
import Fingerprint from 'express-fingerprint';

app.use(Fingerprint({
  parameters: [
    Fingerprint.useragent,
    Fingerprint.geoip,
  ]
}));

const verifyLimiter = rateLimit({
  keyGenerator: (req) => req.fingerprint.hash,
  windowMs: 60 * 60 * 1000,
  max: 5, // Tighter with fingerprinting
});
```

### Tier 3: User-Based (FUTURE)
**Status:** PLANNED (requires authentication)

```typescript
const verifyLimiter = rateLimit({
  keyGenerator: (req) => req.user?.id || req.ip,
  windowMs: 60 * 60 * 1000,
  max: (req) => {
    if (req.user?.verificationCount > 50) return 20; // Trusted
    if (req.user?.verificationCount > 10) return 10; // Regular
    return 5; // New users
  },
});
```

---

## Response Headers

### On Successful Request
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 8
X-RateLimit-Reset: 1706180000
```

### On Rate Limited (429)
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706180000
Retry-After: 3500
```

### Error Response Body
```json
{
  "success": false,
  "error": "You've submitted too many verifications. Please try again in 1 hour."
}
```

---

## Monitoring & Alerts

### Current
- Rate limit info logged with requests
- Can query Cloud Logging for 429 responses

### Recommended
- [ ] Track rate limit hits in dashboard
- [ ] Alert when >10 IPs hit limit per hour
- [ ] Monitor verification velocity by provider
- [ ] Detect conflicting verification patterns

---

## Testing Strategy

### Local Testing
```bash
# Hit endpoint 11 times, verify 429 on 11th
for i in {1..11}; do
  curl -X POST http://localhost:3001/api/v1/verify \
    -H "Content-Type: application/json" \
    -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true}'
  echo ""
done
```

### Production Testing
- Allowlist own IP for testing
- Use special header or test environment

### Automated Tests
```typescript
describe('Rate Limiting', () => {
  it('allows up to 10 verifications', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/v1/verify')
        .send(validPayload);
      expect(res.status).not.toBe(429);
    }
  });

  it('blocks 11th verification', async () => {
    // After 10 requests...
    const res = await request(app)
      .post('/api/v1/verify')
      .send(validPayload);
    expect(res.status).toBe(429);
  });
});
```

---

## Questions Addressed

### 1. What's the DEADLINE?
Before beta launch to r/osteoporosis - **COMPLETED**

### 2. Redis available?
Not currently - using in-memory (OK for single instance)

### 3. Initial limits appropriate?
- Verifications: 10/hour (appropriate)
- Votes: 10/hour (appropriate)
- Search: 100/hour (appropriate)

### 4. CAPTCHA immediate or Tier 2?
Implemented immediately alongside rate limiting

### 5. Allowlist for testing?
Can be configured via environment or skip function

---

## Implementation Checklist

### Tier 1 (COMPLETE)
- [x] Custom rate limiter middleware
- [x] IP-based limits on verification endpoints
- [x] IP-based limits on vote endpoints
- [x] IP-based limits on search endpoints
- [x] Deployed to production
- [x] Rate limiting verified working

### Tier 2 (NEXT)
- [ ] Add fingerprinting (IP + User Agent)
- [ ] Tighten limits based on observed traffic
- [ ] Add monitoring/logging for rate limit hits
- [ ] Document rate limits in API docs

### Tier 3 (FUTURE)
- [ ] Add CAPTCHA integration (with auth)
- [ ] Implement allowlist for trusted IPs
- [ ] Create admin panel for blocked attempts
- [ ] Run penetration test
- [ ] User account-based limits

---

## Redis Migration Plan

When scaling beyond single instance:

```typescript
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const limiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  }),
  windowMs: 60 * 60 * 1000,
  max: 10,
});
```

**Requirements:**
- Cloud Memorystore (Redis) instance
- Update environment variables
- Test distributed rate limiting

---

## Summary

| Status | Item |
|--------|------|
| FIXED | ZeroPath CVSS 7.1 vulnerability |
| IMPLEMENTED | Tier 1 IP-based rate limiting |
| CURRENT | Single instance deployment (safe) |
| REQUIRED | Redis before horizontal scaling |
| PLANNED | Tier 2 fingerprinting |
| FUTURE | Tier 3 user-based limits |

**Overall Assessment:** Rate limiting is functional and addresses the critical vulnerability. Pre-scaling work (Redis) is documented and planned.

---

*Rate limiting must be upgraded to Redis before deploying multiple instances*
