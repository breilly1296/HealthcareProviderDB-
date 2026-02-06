# Rate Limiting Review

## Implementation Status

**Tier 1: COMPLETE** -- Custom dual-mode rate limiter deployed with sliding window algorithm.
**Tier 2: PARTIALLY COMPLETE** -- CAPTCHA and honeypot implemented; fingerprinting not yet done.
**Tier 3: NOT STARTED** -- Requires user authentication.

## Architecture

**File:** `packages/backend/src/middleware/rateLimiter.ts`

The rate limiter auto-selects between two backends:

| Mode | When | State Scope | Algorithm |
|------|------|-------------|-----------|
| **Redis** | `REDIS_URL` env var set | Distributed across instances | Sorted set sliding window |
| **In-Memory** | No Redis configured | Process-local only | Array-based sliding window |

### Sliding Window Implementation

Both modes use a sliding window algorithm (not fixed windows). For each request:
1. Filter out timestamps older than `now - windowMs`
2. Count remaining timestamps in the window
3. If count < maxRequests, add current timestamp and allow
4. If count >= maxRequests, reject with 429

This prevents the burst-at-window-boundary attack that fixed windows allow.

### Fail-Open Behavior

When Redis becomes unavailable mid-operation (lines 207-213, 241-247, 273-278):
- Requests are ALLOWED (fail-open)
- `X-RateLimit-Status: degraded` header is set
- Warning logged for monitoring
- In-memory limiter is NOT used as fallback to avoid inconsistent state

## Endpoint Rate Limits

### Checklist: Endpoint Coverage

- [x] `POST /api/v1/verify` -- `verificationRateLimiter` (10/hour) + `honeypotCheck` + `verifyCaptcha` (verify.ts line 60)
- [x] `POST /api/v1/verify/:id/vote` -- `voteRateLimiter` (10/hour) + `honeypotCheck` + `verifyCaptcha` (verify.ts line 95)
- [x] `GET /api/v1/providers/search` -- `searchRateLimiter` (100/hour) (providers.ts line 206)
- [x] `GET /api/v1/providers/cities` -- `defaultRateLimiter` (200/hour) (providers.ts line 285)
- [x] `GET /api/v1/providers/:npi` -- `defaultRateLimiter` (200/hour) (providers.ts line 304)
- [x] `GET /api/v1/plans/search` -- `searchRateLimiter` (100/hour) (plans.ts line 32)
- [x] `GET /api/v1/plans/grouped` -- `defaultRateLimiter` (200/hour) (plans.ts line 62)
- [x] `GET /api/v1/plans/meta/*` -- `defaultRateLimiter` (200/hour) (plans.ts lines 84, 102)
- [x] `GET /api/v1/plans/:planId/providers` -- `searchRateLimiter` (100/hour) (plans.ts line 123)
- [x] `GET /api/v1/plans/:planId` -- `defaultRateLimiter` (200/hour) (plans.ts line 176)
- [x] `GET /api/v1/locations/search` -- `searchRateLimiter` (100/hour) (locations.ts line 50)
- [x] `GET /api/v1/locations/*` -- `defaultRateLimiter` (200/hour) (locations.ts lines 79, 93, 106, 125)
- [x] `GET /api/v1/verify/stats` -- `defaultRateLimiter` (200/hour) (verify.ts line 126)
- [x] `GET /api/v1/verify/recent` -- `defaultRateLimiter` (200/hour) (verify.ts line 139)
- [x] `GET /api/v1/verify/:npi/:planId` -- `defaultRateLimiter` (200/hour) (verify.ts line 159)
- [x] Global default -- `defaultRateLimiter` applied to all routes via `app.use(defaultRateLimiter)` (index.ts line 138)
- [x] `/health` -- Placed BEFORE rate limiter (index.ts line 92) so monitoring is not blocked
- [x] Insurance card extraction -- 10/hour per IP (frontend route.ts line 28, separate in-memory limiter)

### Pre-Configured Limiters (rateLimiter.ts lines 329-367)

| Limiter | Window | Max Requests | Applied To |
|---------|--------|-------------|-----------|
| `defaultRateLimiter` | 1 hour | 200 | Global + individual read endpoints |
| `verificationRateLimiter` | 1 hour | 10 | POST /verify |
| `voteRateLimiter` | 1 hour | 10 | POST /verify/:id/vote |
| `searchRateLimiter` | 1 hour | 100 | Search endpoints |

## Response Headers

All rate-limited responses include standard headers (in-memory: lines 159-161; Redis: lines 257-260):

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Max requests per window |
| `X-RateLimit-Remaining` | Requests remaining in window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds until retry (on 429 only) |

## Additional Security Layers

### CAPTCHA (`packages/backend/src/middleware/captcha.ts`)

- **Type:** Google reCAPTCHA v3
- **Applied to:** POST /verify, POST /verify/:id/vote
- **Score threshold:** 0.5 (configurable via `CAPTCHA_MIN_SCORE`)
- **Timeout:** 5 seconds (configurable via `CAPTCHA_API_TIMEOUT_MS`)
- **Fail mode:** Configurable open/closed via `CAPTCHA_FAIL_MODE`
- **Fallback rate limit:** 3/hour per IP when CAPTCHA API unavailable (vs normal 10/hour)
- **Skipped in:** development, test, and when `RECAPTCHA_SECRET_KEY` is not set

### Honeypot (`packages/backend/src/middleware/honeypot.ts`)

- Hidden `website` field that real users never fill in
- Bots that auto-populate it get a fake 200 OK success response (line 21)
- Applied to: POST /verify, POST /verify/:id/vote
- Logged with IP for analysis

### Sybil Prevention (`packages/backend/src/services/verificationService.ts` lines 72-115)

- Same IP cannot submit duplicate verifications for the same provider-plan pair within 30 days
- Same email cannot submit duplicate verifications for the same provider-plan pair within 30 days
- Returns 409 Conflict on duplicate detection

## Attack Scenario Analysis

### Checklist: Attack Coverage

- [x] **Competitor sabotage** (flood fake "doesn't accept" verifications): Mitigated by 10/hour IP rate limit + CAPTCHA + Sybil detection (30-day window per IP per provider-plan)
- [x] **Provider manipulation** (false in-network claims): Same mitigations as above + consensus requires 3+ verifications with 2:1 majority and score >= 60 (`verificationService.ts` lines 163-185)
- [x] **Bot spam**: Mitigated by CAPTCHA (score threshold 0.5) + honeypot + rate limiting
- [x] **Vote manipulation**: 10/hour vote rate limit + CAPTCHA + one-vote-per-IP per verification (`VoteLog` unique constraint on `verificationId_sourceIp`)
- [ ] **VPN rotation attacks**: Not mitigated -- IP-based only, no fingerprinting

### Impact on Confidence Scores

- 10 fake verifications from different IPs could still influence scores, but consensus requires 3+ with 2:1 ratio and confidence >= 60
- With current 10/hour limit, a single IP can only contribute 1 verification per 30 days per provider-plan (Sybil check)
- CAPTCHA score threshold of 0.5 blocks most automated tools

## Questions Answered

### 1. What's the absolute deadline for fixing this?
Rate limiting is already deployed (Tier 1 complete as of January 2026).

### 2. Do we have Redis available?
Optional. The system auto-selects Redis when `REDIS_URL` is set, falling back to in-memory. For single Cloud Run instance, in-memory is sufficient. For horizontal scaling, Redis (Memorystore) is needed.

### 3. What are the initial limits?
Already set: Verifications 10/hour, Votes 10/hour, Search 100/hour, Default 200/hour.

### 4. Should we add CAPTCHA?
Already implemented as Tier 2. Google reCAPTCHA v3 on verification and vote endpoints.

### 5. Are there known good IPs to allowlist?
Not implemented. The `skip` function in rate limiter options supports this but no allowlist is configured.

### 6. What happens when rate limit is hit?
429 JSON response with error message and `retryAfter` field. Frontend API client (`packages/frontend/src/lib/api.ts`) detects 429 and shows toast notification with retry time.

### 7. Should we log blocked verifications?
Rate limit hits are logged via the logger. CAPTCHA failures are logged with IP and score. Honeypot triggers are logged with IP.

### 8. How do we test without breaking production?
The `skip` function parameter on each rate limiter allows bypassing for test environments. CAPTCHA is skipped when `NODE_ENV=test` or `NODE_ENV=development`.

## Remaining Gaps

1. **No fingerprinting** -- VPN rotation can bypass IP-based limits
2. **No rate limit hit monitoring dashboard** -- Hits are logged but not aggregated
3. **No anomaly detection** -- No detection for patterns like "100 different IPs all verifying the same provider"
4. **No allowlist/blocklist management** -- No admin UI for managing trusted/blocked IPs
5. **In-memory mode not safe for multi-instance** -- If Cloud Run scales to multiple instances without Redis, each has independent counters
6. **TLS not configured for Redis** -- Needed for production Memorystore
