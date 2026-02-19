# Rate Limiting Review

**Generated:** 2026-02-18
**Prompt:** 08-rate-limiting.md
**Status:** TIER 1 COMPLETE, TIER 2 PARTIALLY COMPLETE -- dual-mode rate limiter (Redis + in-memory) with sliding window algorithm, CAPTCHA on write endpoints, honeypot bot detection. Production-ready for current scale.

---

## Executive Summary

The rate limiting system is well-engineered with a dual-mode architecture (Redis for distributed deployments, in-memory for single-instance). The sliding window algorithm prevents burst attacks at window boundaries. CAPTCHA (reCAPTCHA v3) protects verification and vote endpoints. A honeypot field provides additional bot detection. One off-by-one discrepancy was found between Redis and in-memory boundary conditions. The `magicLinkRateLimiter` is a newer addition not mentioned in the prompt.

---

## Rate Limiter Architecture (`middleware/rateLimiter.ts`)

### Dual-Mode Selection

The `createRateLimiter()` factory function (line 299) auto-selects the implementation based on whether `REDIS_URL` is set:

```
if (getRedisClient()) -> createRedisRateLimiter()
else                  -> createInMemoryRateLimiter()
```

Mode selection is logged once per limiter name via the `limiterModes` Map (line 287).

### Pre-Configured Limiters Verified

| Limiter | Name | Window | Max | Message | Line |
|---------|------|--------|-----|---------|------|
| `defaultRateLimiter` | 'default' | 1 hour | 200 | "Too many requests. Please try again in 1 hour." | 329 |
| `verificationRateLimiter` | 'verification' | 1 hour | 10 | "You've submitted too many verifications. Please try again in 1 hour." | 340 |
| `voteRateLimiter` | 'vote' | 1 hour | 10 | "You've submitted too many votes. Please try again in 1 hour." | 351 |
| `searchRateLimiter` | 'search' | 1 hour | 100 | "Too many search requests. Please try again in 1 hour." | 362 |
| `magicLinkRateLimiter` | 'magic-link' | 15 min | 5 | "Too many login requests. Please try again in 15 minutes." | 373 |

**Additional rate limiter in insuranceCard.ts:**
| Limiter | Name | Window | Max | Key Generator | Line |
|---------|------|--------|-----|---------------|------|
| `scanRateLimiter` | 'insurance-card-scan' | 1 hour | 10 | `req.user?.id \|\| req.ip \|\| 'unknown'` | insuranceCard.ts:22 |

### Rate Limiter Application by Endpoint

| Endpoint | Limiter Applied | Layer |
|----------|----------------|-------|
| ALL routes | `defaultRateLimiter` (200/hr) | Global (`index.ts` line 154) |
| GET `/api/v1/providers/search` | `searchRateLimiter` (100/hr) | Route-level |
| GET `/api/v1/providers/map` | `searchRateLimiter` (100/hr) | Route-level |
| GET `/api/v1/providers/cities` | `defaultRateLimiter` (200/hr) | Route-level |
| GET `/api/v1/providers/:npi` | `defaultRateLimiter` (200/hr) | Route-level |
| GET `/api/v1/providers/:npi/colocated` | `defaultRateLimiter` (200/hr) | Route-level |
| GET `/api/v1/providers/:npi/plans` | `defaultRateLimiter` (200/hr) | Route-level |
| GET `/api/v1/plans/search` | `searchRateLimiter` (100/hr) | Route-level |
| GET `/api/v1/plans/:planId/providers` | `searchRateLimiter` (100/hr) | Route-level |
| GET `/api/v1/plans/*` (others) | `defaultRateLimiter` (200/hr) | Route-level |
| POST `/api/v1/verify` | `verificationRateLimiter` (10/hr) | Route-level |
| POST `/api/v1/verify/:id/vote` | `voteRateLimiter` (10/hr) | Route-level |
| GET `/api/v1/verify/*` | `defaultRateLimiter` (200/hr) | Route-level |
| GET `/api/v1/locations/search` | `searchRateLimiter` (100/hr) | Route-level |
| GET `/api/v1/locations/*` (others) | `defaultRateLimiter` (200/hr) | Route-level |
| POST `/api/v1/auth/magic-link` | `magicLinkRateLimiter` (5/15min) | Route-level |
| GET/POST `/api/v1/auth/*` (others) | `defaultRateLimiter` (200/hr) | Global only |
| ALL `/api/v1/saved-providers/*` | `defaultRateLimiter` (200/hr) | Route-level |
| POST `/api/v1/me/insurance-card/scan` | `scanRateLimiter` (10/hr per user) | Route-level |
| ALL `/api/v1/me/insurance-card/*` (others) | `defaultRateLimiter` (200/hr) | Route-level |
| ALL `/api/v1/admin/*` | `defaultRateLimiter` (200/hr) | Global only (admin auth provides protection) |
| GET `/health` | NONE | Before rate limiter in middleware chain |
| GET `/` | `defaultRateLimiter` (200/hr) | Global |

**Double rate limiting:** Endpoints with route-level rate limiters are ALSO subject to the global `defaultRateLimiter`. For example, a search request counts against both `searchRateLimiter` (100/hr) and `defaultRateLimiter` (200/hr). The `searchRateLimiter` is the effective limit since it is stricter and applied first at the route level. The global rate limiter acts as a catch-all for endpoints that do not have a specific limiter.

### Sliding Window Algorithm

**In-Memory Implementation (lines 117-179):**
1. Get timestamps array for client key (or empty)
2. Filter out timestamps older than `now - windowMs`
3. If filtered count >= maxRequests, reject with 429
4. Otherwise add current timestamp and allow

**Redis Implementation (lines 189-280):**
1. `ZREMRANGEBYSCORE` to remove entries outside window
2. `ZADD` with `timestamp-randomSuffix` as both score and member
3. `ZCARD` to count remaining entries
4. `EXPIRE` on the key for automatic cleanup
5. All four commands in a single `multi()` transaction

**Boundary condition discrepancy:**
- In-memory (line 163): `if (requestCount >= maxRequests)` -- rejects at exactly the limit
- Redis (line 262): `if (requestCount > maxRequests)` -- rejects only ABOVE the limit

This means the Redis implementation allows `maxRequests + 1` requests (one extra) because it adds the request BEFORE checking the count, then uses `>` instead of `>=`. The in-memory version adds AFTER checking, so the check is correct. In practice, the difference of 1 request per window is negligible, but it is technically inconsistent.

### Fail-Open Behavior

When Redis is unavailable:

1. **At startup:** If `REDIS_URL` is not set, in-memory mode is selected permanently. No Redis connection attempted.

2. **Mid-operation (Redis down):**
   - `isRedisConnected()` returns false -> request allowed with `X-RateLimit-Status: degraded` header (line 209-213)
   - Redis transaction fails -> request allowed with degraded header (line 243-247)
   - Redis throws -> caught, request allowed with degraded header (lines 273-278)
   - Warning logged in all cases

This is documented and intentional: availability is prioritized over strict rate limiting.

### Standard Headers

Both implementations set these headers on every response:

| Header | Purpose |
|--------|---------|
| `X-RateLimit-Limit` | Maximum requests allowed in window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds until retry is allowed (429 responses only) |

### In-Memory Cleanup

A `setInterval` runs every 60 seconds (line 88) to clean up expired entries from all memory stores. Uses a conservative 1-hour max window for cleanup (line 93), which matches all current limiter configurations.

### Key Generator

Default key generator: `(req: Request) => req.ip || 'unknown'` (lines 123, 196).

The `scanRateLimiter` overrides this to use `req.user?.id || req.ip || 'unknown'`, providing per-user rate limiting for authenticated endpoints.

`trust proxy` is set to `1` in `index.ts` line 39, so `req.ip` correctly extracts the client IP from Cloud Run's `X-Forwarded-For` header.

---

## CAPTCHA Integration (`middleware/captcha.ts`)

### Configuration

| Setting | Value | Source |
|---------|-------|--------|
| Secret key | `RECAPTCHA_SECRET_KEY` env var | Line 47 |
| Min score | 0.5 | `CAPTCHA_MIN_SCORE` from constants.ts |
| API timeout | 5 seconds | `CAPTCHA_API_TIMEOUT_MS` from constants.ts |
| Fallback max requests | 3/hour | `CAPTCHA_FALLBACK_MAX_REQUESTS` from constants.ts |
| Fail mode | 'open' (default) or 'closed' | `CAPTCHA_FAIL_MODE` env var |

### Token Extraction

Token is read from `req.body.captchaToken` OR `req.headers['x-captcha-token']` (line 134). Missing token returns 400 `"CAPTCHA token required"`.

### Score Threshold

reCAPTCHA v3 returns a score from 0.0 (likely bot) to 1.0 (likely human). Scores below 0.5 are rejected with 403 `"Request blocked due to suspicious activity"` (lines 173-181).

### Fail-Open with Fallback Rate Limiting

When Google's reCAPTCHA API is unavailable (network error, timeout, outage) and `CAPTCHA_FAIL_MODE=open`:

1. Stricter fallback rate limit is applied: 3 requests/hour per IP (vs normal 10/hour for verifications)
2. Response headers indicate degraded security:
   - `X-Security-Degraded: captcha-unavailable`
   - `X-Fallback-RateLimit-Limit`, `X-Fallback-RateLimit-Remaining`, `X-Fallback-RateLimit-Reset`
3. If fallback limit exceeded, returns 429

This provides defense in depth: even if CAPTCHA is bypassed, the stricter rate limit constrains abuse.

### Fallback Store Cleanup

A `setInterval` runs every 60 seconds (line 67, using `RATE_LIMIT_CLEANUP_INTERVAL_MS`) to purge expired entries from the in-memory fallback store.

### Skip Conditions

CAPTCHA verification is skipped when:
- `NODE_ENV` is 'development' or 'test' (line 121)
- `RECAPTCHA_SECRET_KEY` is not set (line 126, with warning log)

### Where Applied

| Endpoint | CAPTCHA | Honeypot | Rate Limiter |
|----------|---------|----------|--------------|
| POST `/api/v1/verify` | YES | YES | verificationRateLimiter (10/hr) |
| POST `/api/v1/verify/:id/vote` | YES | YES | voteRateLimiter (10/hr) |
| All other endpoints | NO | NO | Various |

---

## Honeypot Integration (`middleware/honeypot.ts`)

The honeypot middleware adds a hidden form field (`website`) that real users never fill in but bots auto-populate. Applied to both POST verify endpoints.

**Behavior when triggered:**
- Returns HTTP 200 with `{ success: true, data: { id: 'submitted' } }` -- silently "accepts" the request so the bot does not know it was caught
- Logs a warning with IP, field name, and path
- Does NOT proceed to CAPTCHA verification or the route handler

**Middleware chain order:** `rateLimiter` -> `honeypotCheck` -> `verifyCaptcha` -> handler. Honeypot is checked before CAPTCHA to avoid unnecessary Google API calls for obvious bots.

---

## Attack Scenario Coverage

### Checklist from Prompt

| Attack Scenario | Mitigations | Residual Risk |
|----------------|-------------|---------------|
| Competitor sabotage (flood fake "doesn't accept") | 10/hr rate limit + CAPTCHA + Sybil detection (30-day IP/email dedup) + honeypot | Low at current scale. At high scale, consider user-account-based limits (Tier 3) |
| Provider manipulation (false in-network claims) | Same as above + consensus algorithm requires MIN_VERIFICATIONS_FOR_CONSENSUS (3) + MIN_CONFIDENCE_FOR_STATUS_CHANGE (60) | Low. A single bad verification cannot change status |
| Insurance gaming | Same mitigations apply | Low |
| Bot spam | CAPTCHA v3 score threshold (0.5) + honeypot + rate limiting | Low. reCAPTCHA v3 is effective against standard bots |
| Vote manipulation | 10/hr vote rate limit + CAPTCHA + unique constraint `[verificationId, sourceIp]` in `vote_logs` | Low. Same IP cannot vote twice on same verification |

### Sybil Attack Prevention (in `verificationService.ts`)

Beyond rate limiting, the verification service has its own Sybil detection:
- Same IP cannot submit a verification for the same provider-plan pair within 30 days (uses `verification_logs.sourceIp` index)
- Same email cannot submit a verification for the same provider-plan pair within 30 days (uses `verification_logs.submittedBy` index)
- Dedicated database indexes: `idx_vl_sybil_ip` and `idx_vl_sybil_email`

### Confidence Score Protection

From `config/constants.ts`:
- `MIN_VERIFICATIONS_FOR_CONSENSUS = 3` -- status does not change until 3 verifications exist
- `MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60` -- low-confidence data cannot alter acceptance status
- `VERIFICATION_TTL_MS = 6 months` -- old verifications expire, preventing historical accumulation attacks

---

## Implementation Status Verification

### Tier 1 (IP-Based Rate Limiting) -- COMPLETE

- [x] Custom dual-mode rate limiter middleware (Redis + in-memory) -- `rateLimiter.ts`
- [x] Sliding window algorithm (not fixed window) -- lines 62-84 (docs), implementation in both modes
- [x] IP-based limits on verification endpoints -- `verificationRateLimiter` (10/hr)
- [x] IP-based limits on vote endpoints -- `voteRateLimiter` (10/hr)
- [x] IP-based limits on search endpoints -- `searchRateLimiter` (100/hr)
- [x] Standard rate limit headers -- `X-RateLimit-Limit`, `Remaining`, `Reset`
- [x] Retry-After on 429 responses -- set in both implementations
- [x] Fail-open behavior when Redis unavailable -- with `X-RateLimit-Status: degraded`
- [x] Automatic cleanup of old entries -- 60-second interval for in-memory; Redis key expiration

### Tier 2 (CAPTCHA + Bot Detection) -- PARTIALLY COMPLETE

- [x] Google reCAPTCHA v3 on verification and vote endpoints -- `captcha.ts`
- [x] CAPTCHA fail-open/fail-closed modes -- configurable via `CAPTCHA_FAIL_MODE`
- [x] CAPTCHA fallback rate limiting (3/hr when API unavailable) -- `checkFallbackRateLimit()`
- [x] Honeypot field on verification and vote endpoints -- `honeypot.ts`
- [x] Magic link rate limiting (5/15min) -- `magicLinkRateLimiter`
- [x] Insurance card scan rate limiting (10/hr per user) -- `scanRateLimiter`
- [ ] Device fingerprinting (IP + User Agent) -- NOT implemented
- [ ] API docs documenting rate limits -- NOT implemented

### Tier 3 (Scale) -- FUTURE

- [ ] User account-based graduated limits
- [ ] Anomaly detection
- [ ] Evidence requirements for disputed verifications
- [ ] Admin panel for allowlist/blocklist management
- [ ] IP allowlisting for trusted sources
- [ ] Monitoring dashboard for rate limit hits

---

## Findings

### Finding 1: Redis vs In-Memory Boundary Condition (Minor)

In-memory uses `>=` to reject (line 163), Redis uses `>` (line 262). Redis also adds the request before checking, while in-memory checks before adding. The net effect is that Redis allows one extra request per window. This is a minor inconsistency that does not pose a security risk at the current limits (10-200 requests/hour).

### Finding 2: Global + Route-Level Double Counting

Every request passes through the global `defaultRateLimiter` AND any route-level rate limiter. For search endpoints (100/hr limit), a user who makes 100 searches uses 100 of their 200 global requests. This means they have 100 remaining requests for other endpoints. This is actually reasonable behavior -- it prevents a user from consuming all 200 global requests on searches alone.

### Finding 3: Admin Endpoints Not Separately Rate-Limited

Admin endpoints are protected by the `X-Admin-Secret` header and the global 200/hr rate limit, but do not have their own stricter rate limiter. Since admin access requires a secret, this is acceptable. However, an attacker who obtains the admin secret could make 200 admin requests per hour.

### Finding 4: `magicLinkRateLimiter` Not in Prompt

The prompt's rate limiter inventory does not list the `magicLinkRateLimiter` (5 requests per 15 minutes). This was added as part of the auth system and is correctly applied to `POST /api/v1/auth/magic-link` in `auth.ts` line 87. Similarly, the `scanRateLimiter` in `insuranceCard.ts` is not listed in the prompt.

### Finding 5: No Rate Limit on Auth Verify (Magic Link Click)

`GET /api/v1/auth/verify` (the magic link click endpoint) only has the global 200/hr rate limit. A brute-force attack against magic link tokens would need to guess a CUID token within 15 minutes. CUIDs are sufficiently random that this is not a practical concern, but a dedicated rate limiter could be added for defense in depth.

---

## Monitoring Gaps (From Prompt Checklist)

| Item | Status |
|------|--------|
| Track rate limit hits in logs | PARTIAL -- `requestLogger.ts` logs `rateLimited: true` flag, but no dedicated alerting |
| Alert on >10 IPs hitting limit/hour | NOT IMPLEMENTED -- requires Cloud Monitoring setup |
| Dashboard: rate limit hits per endpoint | NOT IMPLEMENTED |
| Dashboard: blocked IPs | NOT IMPLEMENTED |
| Dashboard: verification velocity by provider | NOT IMPLEMENTED |
| Dashboard: conflicting verification patterns | NOT IMPLEMENTED |

These are Tier 3 items appropriate for when traffic grows.

---

## Files Reviewed

- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\rateLimiter.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\captcha.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\honeypot.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\config\constants.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\verify.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\providers.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\auth.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\insuranceCard.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\index.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\verificationService.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\prisma\schema.prisma`
