# Sybil Attack Prevention

**Last Updated:** 2026-02-06

## Protection Layers

| Layer | Status | Implementation | Notes |
|-------|--------|----------------|-------|
| Rate Limiting | VERIFIED | `rateLimiter.ts` | 10/hr verify, 10/hr vote, 100/hr search, 200/hr default |
| Honeypot | VERIFIED | `honeypot.ts` | Hidden "website" field, fake 200 OK response |
| CAPTCHA | VERIFIED | `captcha.ts` | reCAPTCHA v3, score >= 0.5, fail-open/closed configurable |
| Vote Dedup | VERIFIED | `schema.prisma` + `verificationService.ts` | Unique constraint on (verificationId, sourceIp) |
| Verification Window | VERIFIED | `verificationService.ts` | 30-day IP + email check via `checkSybilAttack()` |
| PII Stripping | VERIFIED | `verificationService.ts` | `stripVerificationPII()` removes sourceIp, userAgent, submittedBy from API responses |

## Detailed Findings

### Layer 1: Rate Limiting (`rateLimiter.ts`)

**Dual-mode implementation** supporting both Redis (distributed) and in-memory (single-instance):

| Limiter | Max Requests | Window | Used By |
|---------|-------------|--------|---------|
| `defaultRateLimiter` | 200/hr | 1 hour | General API routes |
| `verificationRateLimiter` | 10/hr | 1 hour | Verification submissions |
| `voteRateLimiter` | 10/hr | 1 hour | Vote endpoints |
| `searchRateLimiter` | 100/hr | 1 hour | Search endpoints |

**Algorithm**: Sliding window (not fixed window) -- prevents burst attacks at window boundaries.

**Key features verified in code**:
- [x] Rate limit headers returned (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- [x] `Retry-After` header on 429 responses
- [x] Fail-open behavior when Redis is unavailable (logs warning, sets `X-RateLimit-Status: degraded`)
- [x] IP-based key generation: `req.ip || 'unknown'`
- [x] Periodic cleanup of in-memory store (every 60 seconds)
- [x] Redis sliding window uses sorted sets with `ZREMRANGEBYSCORE` for efficient cleanup

### Layer 2: Honeypot (`honeypot.ts`)

**Verified implementation**:
- Hidden `website` form field that real users never fill
- Bots that auto-populate fields will trigger the trap
- Returns fake `{ success: true, data: { id: 'submitted' } }` -- returns 200 to not alert the bot
- Logs bot detection with IP and path via pino logger
- Applied via `honeypotCheck('website')` middleware

**Frontend integration verified**:
- `InsuranceList.tsx` (line 349): Hidden honeypot input with `position: absolute; left: -9999px; opacity: 0; height: 0; overflow: hidden`
- `api.ts` `VerificationSubmission` type includes `website?: string` honeypot field
- Both verification submit and vote endpoints include the honeypot field

### Layer 3: CAPTCHA (`captcha.ts`)

**Verified implementation**:
- Google reCAPTCHA v3 with configurable fail mode
- Score threshold: `CAPTCHA_MIN_SCORE = 0.5` (from `constants.ts`)
- Token accepted from `req.body.captchaToken` or `x-captcha-token` header
- API timeout: 5 seconds (`CAPTCHA_API_TIMEOUT_MS`)

**Fail mode behavior**:
- `CAPTCHA_FAIL_MODE=open` (default): Allows requests through with fallback rate limiting (3 requests/hour vs normal 10)
- `CAPTCHA_FAIL_MODE=closed`: Blocks all requests when Google API unavailable
- Skips in development/test environments
- Skips if `RECAPTCHA_SECRET_KEY` not configured (with warning log)

**Fallback rate limiting** when CAPTCHA fails (fail-open mode):
- Separate `fallbackStore` tracking: 3 requests per hour per IP
- Periodic cleanup of expired entries
- Sets `X-Security-Degraded: captcha-unavailable` header

### Layer 4: Vote Deduplication

**Database constraint verified in `schema.prisma`**:
```prisma
model VoteLog {
  @@unique([verificationId, sourceIp])
}
```

**Service logic verified in `verificationService.ts`** (`voteOnVerification` function):
1. Looks up existing vote by `verificationId_sourceIp` composite key
2. If same direction: throws `AppError.conflict('You have already voted on this verification')`
3. If different direction: updates vote in a transaction (adjusts upvotes/downvotes atomically)
4. If new vote: creates vote log and increments appropriate counter in a transaction
5. After vote, recalculates confidence score on the associated acceptance record

**Source IP required**: `if (!sourceIp) throw AppError.badRequest('Source IP is required for voting')`

### Layer 5: Verification Windows

**Sybil prevention indexes verified in `schema.prisma`**:
```
@@index([providerNpi, planId, sourceIp, createdAt], map: "idx_vl_sybil_ip")
@@index([providerNpi, planId, submittedBy, createdAt], map: "idx_vl_sybil_email")
```

**`checkSybilAttack()` function verified** (lines 72-115 of verificationService.ts):
- **IP check**: Queries for existing verification from same IP for same NPI+plan within 30 days
- **Email check**: Queries for existing verification from same email (submittedBy) for same NPI+plan within 30 days
- Window configured via `SYBIL_PREVENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000` (30 days exactly)
- Throws `AppError.conflict()` with descriptive message if duplicate found

**Consensus thresholds** (from `constants.ts`):
- `MIN_VERIFICATIONS_FOR_CONSENSUS = 3` -- minimum verifications before status can change
- `MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60` -- minimum confidence score required
- `determineAcceptanceStatus()` also requires a clear 2:1 majority ratio

### PII Protection

**`stripVerificationPII()` function verified** (line 307-310):
- Strips `sourceIp`, `userAgent`, `submittedBy` from verification objects before API responses
- Applied in `submitVerification()` return value
- Applied in `voteOnVerification()` return value
- `getRecentVerifications()` uses Prisma `select` to exclude PII fields entirely
- `getVerificationsForPair()` also uses Prisma `select` to exclude PII fields

## Checklist Verification

### Rate Limiting
- [x] Verification: 10/hour per IP -- VERIFIED: `verificationRateLimiter` in `rateLimiter.ts`
- [x] Voting: 10/hour per IP -- VERIFIED: `voteRateLimiter` in `rateLimiter.ts`
- [x] Search: 100/hour per IP -- VERIFIED: `searchRateLimiter` in `rateLimiter.ts`
- [x] Rate limit headers returned -- VERIFIED: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
- [x] Retry-After on 429 -- VERIFIED in both Redis and in-memory implementations

### Honeypot
- [x] Hidden "website" field -- VERIFIED in `honeypot.ts` and `InsuranceList.tsx`
- [x] Fake 200 OK response -- VERIFIED: returns `{ success: true, data: { id: 'submitted' } }`
- [x] Bot detection logged -- VERIFIED: `logger.warn()` with IP and path

### CAPTCHA
- [x] reCAPTCHA v3 on verification -- VERIFIED in `captcha.ts`
- [x] reCAPTCHA v3 on voting -- VERIFIED: applied as middleware on vote routes
- [x] Score threshold: 0.5 -- VERIFIED: `CAPTCHA_MIN_SCORE = 0.5` in `constants.ts`
- [x] Fallback rate limiting -- VERIFIED: 3 requests/hour fallback when Google API fails

### Vote Deduplication
- [x] VoteLog table -- VERIFIED in `schema.prisma`
- [x] Unique constraint on (verificationId, sourceIp) -- VERIFIED: `@@unique([verificationId, sourceIp])`
- [x] Vote change allowed -- VERIFIED: direction change handled in transaction
- [x] Duplicate prevention -- VERIFIED: same direction throws conflict error

### Verification Windows
- [x] Sybil prevention indexes -- VERIFIED: `idx_vl_sybil_ip` and `idx_vl_sybil_email`
- [x] 30-day window check -- VERIFIED: `checkSybilAttack()` using `SYBIL_PREVENTION_WINDOW_MS`
- [x] Duplicate IP check -- VERIFIED: blocks same IP for same NPI+plan within 30 days
- [x] Duplicate email check -- VERIFIED: blocks same email for same NPI+plan within 30 days

### Monitoring
- [ ] Suspicious pattern queries -- NOT implemented in code (SQL examples in prompt only)
- [ ] Alerting on high volumes -- NOT implemented
- [ ] Admin review queue -- NOT implemented

## Questions Answered

### 1. Is the 30-day window check implemented?
**YES** -- Fully implemented in `checkSybilAttack()` (verificationService.ts lines 72-115). The function checks both IP and email within `SYBIL_PREVENTION_WINDOW_MS` (30 days, defined in `constants.ts` line 26). The function also uses dedicated database indexes (`idx_vl_sybil_ip` and `idx_vl_sybil_email`) for fast lookups.

### 2. What happens with VPN/proxy usage?
**No VPN/proxy detection is currently implemented.** Each unique IP address gets its own rate limit budget and Sybil window. A user rotating through 100 VPN IPs could submit 100 verifications (one per IP within the 30-day window), though each would still be rate-limited to 10/hour per IP. The CAPTCHA score may help detect some automated VPN rotation, but this is a known gap.

### 3. Should we require email for verification?
Email is **optional** but supported. The `submittedBy` field in `VerificationLog` is nullable, and `checkSybilAttack()` only checks email if `submittedBy` is provided. Requiring email would:
- Strengthen Sybil prevention (email + IP double-check)
- Add friction that may reduce legitimate verification submissions
- Require email verification to be truly effective
- **Recommendation**: Keep optional but incentivize (e.g., "verified with email" badge)

### 4. Is there a manual review process?
**Partially.** The schema supports manual review with `isApproved`, `reviewedAt`, and `reviewedBy` fields on `VerificationLog`. The shared types include `ReviewVerificationInput` interface. However, there are no admin endpoints for reviewing/approving verifications, and no admin UI for a review queue. The `POST /admin/recalculate-confidence` endpoint provides indirect moderation via confidence score recalculation.

### 5. Should we implement reputation scoring?
Not currently implemented. The consensus mechanism uses equal weighting for all verifications. Implementing reputation scoring would require:
- User accounts (currently no auth system)
- Tracking verification accuracy over time
- Weighting votes by user reputation
- **Recommendation**: Defer until user accounts are added

## Issues

1. **No VPN/proxy detection**: Users can bypass IP-based rate limits and Sybil checks by rotating IP addresses.
2. **Email check is optional**: Sybil prevention is weaker when `submittedBy` is not provided.
3. **No monitoring/alerting**: The monitoring SQL queries in the prompt are not implemented in the codebase. Suspicious patterns can only be detected by manually querying the database.
4. **Rate limiter fail-open risk**: When Redis is unavailable, rate limits are not enforced, though a warning is logged.
5. **In-memory rate limiter not scaled**: In multi-instance deployments without Redis, each instance has independent counters, allowing 10 * N requests per hour (where N = number of instances).

## Recommendations

1. **Add admin endpoint for suspicious pattern detection**: Implement the SQL queries from the prompt as admin API endpoints to surface IPs with excessive verifications and providers with conflicting data.
2. **Implement basic VPN detection**: Use a VPN/proxy IP database (e.g., IP2Proxy) to flag or rate-limit requests from known VPN IPs more aggressively.
3. **Add monitoring alerts**: Set up logging-based alerts for high verification volumes from single IPs or high CAPTCHA failure rates.
4. **Consider browser fingerprinting**: As a defense-in-depth measure against VPN rotation, browser fingerprinting (hashing user agent + screen resolution + timezone) could supplement IP-based tracking.
5. **Build admin review queue**: Expose `isApproved` field through admin endpoints and add an admin UI to review flagged verifications.
