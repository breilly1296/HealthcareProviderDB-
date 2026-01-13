---
tags:
  - security
  - critical
  - urgent
type: prompt
priority: 1
---

# Rate Limiting Review (CRITICAL VULNERABILITY)

## ⚠️ URGENT SECURITY ISSUE ⚠️

**ZeroPath Security Scan Finding:**
- **Severity:** Medium (CVSS 7.1)
- **File:** `packages/backend/src/api/routes.ts` (lines 348-515)
- **Issue:** Unauthenticated verification endpoints with NO rate limiting
- **Risk:** Spam attacks can poison database, undermine crowdsource moat
- **Status:** **BLOCKING BETA LAUNCH**

## Files to Review
- `packages/backend/src/api/routes.ts` (vulnerable endpoints)
- `packages/backend/src/middleware/` (check if rate limiter exists)
- `packages/backend/package.json` (check for express-rate-limit)

## VerifyMyProvider Rate Limiting Strategy
- **Current:** NO rate limiting implemented
- **Problem:** Attackers can spam unlimited verifications
- **Solution:** Tiered rate limiting (IP → fingerprint → account-based)

## Checklist

### 1. Vulnerable Endpoints Identified
- [ ] `POST /providers/:npi/verify` - Submit verification (UNLIMITED)
- [ ] `POST /verifications/:id/vote` - Upvote/downvote (UNLIMITED)
- [ ] `GET /providers/search` - Provider search (UNLIMITED, less critical)
- [ ] `GET /providers/:npi` - Provider detail (UNLIMITED, less critical)

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

### 4. Tier 1 Implementation (IMMEDIATE - Before Launch)

**Install Dependencies:**
```bash
cd packages/backend
npm install express-rate-limit --save
```

**Basic IP-Based Rate Limiting:**
```typescript
import rateLimit from 'express-rate-limit';

// Strict limit for verifications
const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 verifications per hour per IP
  message: 'Too many verifications, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate limit for votes
const voteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 votes per hour per IP
  message: 'Too many votes, please try again later',
});

// Apply to vulnerable endpoints
app.post('/providers/:npi/verify', verifyLimiter, verifyHandler);
app.post('/verifications/:id/vote', voteLimiter, voteHandler);
```

**Questions:**
- [ ] What's the timeline for implementing this? (URGENT)
- [ ] Should we start more restrictive (5/hour) and loosen later?
- [ ] Should search endpoints also be rate limited?

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

| Endpoint | Current | Tier 1 Target | Tier 2 Target | Tier 3 Target |
|----------|---------|---------------|---------------|---------------|
| POST /providers/:npi/verify | ∞ | 10/hour | 5/hour + CAPTCHA | 5-20/hour (graduated) |
| POST /verifications/:id/vote | ∞ | 20/hour | 10/hour | 10-30/hour (graduated) |
| GET /providers/search | ∞ | 100/hour | 200/hour | Lenient |
| GET /providers/:npi | ∞ | 200/hour | 500/hour | Lenient |

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

## Implementation Priority

**TODAY (2-4 hours):**
- [ ] Install express-rate-limit
- [ ] Add basic IP-based limits to verification endpoints
- [ ] Test locally
- [ ] Deploy to production
- [ ] Verify rate limiting works

**THIS WEEK (1-2 days):**
- [ ] Add fingerprinting
- [ ] Tighten limits based on observed traffic
- [ ] Add monitoring dashboard
- [ ] Document rate limits in API docs

**BEFORE BETA LAUNCH (1-2 weeks):**
- [ ] Add CAPTCHA integration
- [ ] Implement allowlist for trusted IPs
- [ ] Create admin panel to view blocked attempts
- [ ] Run penetration test (try to spam yourself)

## Related Issues
- [ ] Need authentication (03-authentication) for Tier 3
- [ ] Need monitoring dashboard (not yet implemented)
- [ ] Need admin panel to manage allowlist/blocklist
