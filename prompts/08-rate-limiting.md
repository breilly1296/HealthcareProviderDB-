---
tags:
  - security
  - critical
type: prompt
priority: 1
---

# Rate Limiting Review

## ✅ Tier 1 IMPLEMENTED (January 2026)

**ZeroPath Security Scan Finding (RESOLVED):**
- **Severity:** Medium (CVSS 7.1)
- **Original File:** `packages/backend/src/api/routes.ts` (removed)
- **Issue:** Unauthenticated verification endpoints with NO rate limiting
- **Risk:** Spam attacks can poison database, undermine crowdsource moat
- **Status:** **FIXED** - Tier 1 IP-based rate limiting deployed

## Files to Review
- `packages/backend/src/routes/verify.ts` (verification endpoints)
- `packages/backend/src/routes/providers.ts` (provider endpoints)
- `packages/backend/src/middleware/rateLimiter.ts` (rate limiter implementation)

## VerifyMyProvider Rate Limiting Strategy
- **Current:** Tier 1 IP-based rate limiting IMPLEMENTED
- **Implementation:** Custom middleware in `rateLimiter.ts`
- **Next:** Tier 2 (fingerprinting, CAPTCHA) for additional protection

## Checklist

### 1. Endpoints - Rate Limiting Status
- [x] `POST /api/v1/verify` - Submit verification (10/hour via `verificationRateLimiter`)
- [x] `POST /api/v1/verify/:id/vote` - Upvote/downvote (10/hour via `voteRateLimiter`)
- [x] `GET /api/v1/providers/search` - Provider search (100/hour via `searchRateLimiter`)
- [x] `GET /api/v1/providers/:npi` - Provider detail (200/hour via `defaultRateLimiter`)

### 2. Attack Scenarios
- [ ] **Competitor sabotage:** Flood fake "doesn't accept" verifications
- [ ] **Provider manipulation:** Create false in-network claims
- [ ] **Insurance gaming:** Confuse users about which providers accept which plans
- [ ] **Bot spam:** Automated attacks poison confidence scores
- [ ] **Vote manipulation:** Upvote bad verifications, downvote good ones

### 3. Impact on Confidence Scores
- [ ] 10 fake "No" verifications can drop confidence from 80 → 40
- [ ] 100 fake verifications completely poison a provider's data
- [ ] Destroys competitive moat (crowdsource verification becomes worthless)
- [ ] Users lose trust in platform

### 4. Tier 1 Implementation ✅ COMPLETE

**Implementation:** Custom rate limiter in `packages/backend/src/middleware/rateLimiter.ts`

**Current Limits (as of January 2026):**
```typescript
// From rateLimiter.ts - IMPLEMENTED
export const verificationRateLimiter = createRateLimiter({
  name: 'verification',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've submitted too many verifications. Please try again in 1 hour.",
});

export const voteRateLimiter = createRateLimiter({
  name: 'vote',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've submitted too many votes. Please try again in 1 hour.",
});

export const searchRateLimiter = createRateLimiter({
  name: 'search',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 100,
});

export const defaultRateLimiter = createRateLimiter({
  name: 'default',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 200,
});
```

**Applied in routes:**
- `verify.ts`: Uses `verificationRateLimiter` and `voteRateLimiter`
- `providers.ts`: Uses `searchRateLimiter` for search endpoints

**Features implemented:**
- [x] IP-based rate limiting
- [x] Standard rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
- [x] Retry-After header on 429 responses
- [x] Automatic cleanup of old entries (every 60 seconds)
- [x] Skip function support for bypassing limits when needed

### 5. Tier 2 Implementation (Beta Launch)

**Fingerprinting (IP + User Agent + Canvas):**
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
  max: 5, // Tighter limit with fingerprinting
});
```

**CAPTCHA After N Attempts:**
```typescript
import { hCaptcha } from 'hcaptcha';

// If user hits rate limit, require CAPTCHA
// Implementation in frontend + backend validation
```

**Questions:**
- [ ] Which CAPTCHA service? (hCaptcha, reCAPTCHA, Cloudflare Turnstile?)
- [ ] At what point trigger CAPTCHA? (after 3 attempts? 5?)

### 6. Tier 3 Implementation (Scale)

**User Account-Based Limits:**
```typescript
// Once authentication is added
const verifyLimiter = rateLimit({
  keyGenerator: (req) => req.user?.id || req.ip,
  windowMs: 60 * 60 * 1000,
  max: (req) => {
    // Graduated limits based on user trust
    if (req.user?.verificationCount > 50) return 20; // Trusted users
    if (req.user?.verificationCount > 10) return 10; // Regular users
    return 5; // New users
  },
});
```

**Anomaly Detection:**
```typescript
// Flag suspicious patterns:
// - Same IP verifying many providers
// - Same provider getting many conflicting verifications
// - Burst patterns (100 verifications in 5 minutes)
```

**Evidence Requirements:**
```typescript
// For disputed verifications, require:
// - Photo of EOB (Explanation of Benefits)
// - Appointment confirmation
// - Phone call verification
```

### 7. Endpoint-Specific Limits

| Endpoint | Tier 1 (Current) | Tier 2 Target | Tier 3 Target |
|----------|------------------|---------------|---------------|
| POST /api/v1/verify | ✅ 10/hour | 5/hour + CAPTCHA | 5-20/hour (graduated) |
| POST /api/v1/verify/:id/vote | ✅ 10/hour | 10/hour + fingerprint | 10-30/hour (graduated) |
| GET /api/v1/providers/search | ✅ 100/hour | 200/hour | Lenient |
| GET /api/v1/providers/:npi | ✅ 200/hour | 500/hour | Lenient |

### 8. Monitoring & Alerts
- [ ] Track rate limit hits in logs
- [ ] Alert when >10 IPs hit limit per hour (potential attack)
- [ ] Dashboard showing:
  - Rate limit hits per endpoint
  - Blocked IPs
  - Verification velocity by provider
  - Conflicting verification patterns

### 9. Testing Strategy
- [ ] Local testing: Hit endpoint 11 times, verify 429 on 11th
- [ ] Production testing: Allowlist own IP for testing
- [ ] Load testing: Verify rate limits don't block legitimate traffic
- [ ] Bypass for automated tests (special header or test environment)

## Questions to Ask

1. **What's the ABSOLUTE DEADLINE for fixing this?** (Before beta launch to r/osteoporosis?)

2. **Do we have Redis available for distributed rate limiting?** (Cloud Run can use Memorystore, or start with in-memory)

3. **What should the initial limits be?**
   - Verifications: 5/hour? 10/hour? 20/hour?
   - Votes: 10/hour? 20/hour? 50/hour?
   - Too strict = frustrate users, too loose = still vulnerable

4. **Should we add CAPTCHA immediately (Tier 1) or wait for Tier 2?**

5. **Are there any known good IPs that should be allowlisted?**
   - Your home IP?
   - OwnMyHealth servers (for integration)?
   - Office IP?

6. **What should happen when rate limit is hit?**
   - 429 error with JSON message?
   - Friendly HTML page?
   - CAPTCHA challenge instead of block?

7. **Should we log the content of blocked verifications?** (to detect patterns)

8. **How do we test this works without breaking production?**

## Implementation Status

**Tier 1 ✅ COMPLETE (January 2026):**
- [x] Custom rate limiter middleware created
- [x] IP-based limits on verification endpoints
- [x] IP-based limits on vote endpoints
- [x] IP-based limits on search endpoints
- [x] Deployed to production
- [x] Rate limiting verified working

**Tier 2 - NEXT PRIORITIES:**
- [ ] Add fingerprinting (IP + User Agent)
- [ ] Tighten limits based on observed traffic
- [ ] Add monitoring/logging for rate limit hits
- [ ] Document rate limits in API docs

**Tier 3 - FUTURE (requires authentication):**
- [ ] Add CAPTCHA integration
- [ ] Implement allowlist for trusted IPs
- [ ] Create admin panel to view blocked attempts
- [ ] Run penetration test
- [ ] User account-based limits

## Related Issues
- [ ] Need authentication (03-authentication) for Tier 3
- [ ] Need monitoring dashboard (not yet implemented)
- [ ] Need admin panel to manage allowlist/blocklist
