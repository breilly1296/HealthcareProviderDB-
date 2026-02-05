# Rate Limiting Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/08-rate-limiting.md
**Status:** Tier 1 COMPLETE, Tier 2 PARTIALLY COMPLETE -- implementation is solid and matches prompt specifications

---

## Findings

### 1. Endpoints -- Rate Limiting Status

- **POST /api/v1/verify** (submit verification):
  Verified. `packages/backend/src/routes/verify.ts` line 56 applies `verificationRateLimiter` as the first middleware on the `POST /` route. The limiter is configured at 10 requests/hour per IP, matching the prompt specification.

- **POST /api/v1/verify/:id/vote** (upvote/downvote):
  Verified. `packages/backend/src/routes/verify.ts` line 90 applies `voteRateLimiter` on the `POST /:verificationId/vote` route. Configured at 10 requests/hour per IP, matching the prompt.

- **GET /api/v1/providers/search** (provider search):
  Verified. `packages/backend/src/routes/providers.ts` line 153 applies `searchRateLimiter` on the `GET /search` route. Configured at 100 requests/hour per IP, matching the prompt.

- **GET /api/v1/providers/:npi** (provider detail):
  Verified. `packages/backend/src/routes/providers.ts` line 251 applies `defaultRateLimiter` on the `GET /:npi` route. Configured at 200 requests/hour per IP, matching the prompt.

- **GET /api/v1/verify/stats** and **GET /api/v1/verify/recent**:
  Verified. Both also apply `defaultRateLimiter` (200/hour), providing protection on read-only verification endpoints.

- **GET /api/v1/providers/cities**:
  Verified. Also uses `defaultRateLimiter` (200/hour).

### 2. Dual-Mode Architecture

- **Redis Mode (distributed):**
  Verified. `createRedisRateLimiter()` in `rateLimiter.ts` (lines 189-280) implements a Redis-based sliding window using sorted sets. The key format is `ratelimit:{name}:{clientIP}`, matching the prompt. Request IDs use `{timestamp}-{random7chars}` for uniqueness within the sorted set. Key expiration is set via `EXPIRE` after each transaction.

- **In-Memory Mode (process-local):**
  Verified. `createInMemoryRateLimiter()` in `rateLimiter.ts` (lines 117-179) implements the same sliding window algorithm using a `Map<string, number[]>`. Used automatically when `REDIS_URL` is not set.

- **Auto-selection factory:**
  Verified. `createRateLimiter()` (lines 299-319) checks `getRedisClient()` and selects the appropriate implementation. Mode is logged once per limiter name.

### 3. Sliding Window Algorithm

- **In-Memory implementation:**
  Verified. Lines 141-175: Filters timestamps older than `now - windowMs`, counts remaining timestamps, rejects if count >= maxRequests, otherwise adds current timestamp. This correctly prevents the fixed-window boundary attack described in the prompt.

- **Redis implementation:**
  Verified. Lines 220-278: Uses a Redis `MULTI` transaction with `ZREMRANGEBYSCORE` (remove old entries), `ZADD` (add current request), `ZCARD` (count requests), and `EXPIRE` (auto-cleanup). The sorted set score is the timestamp.

- **Boundary condition difference:**
  The in-memory limiter checks `requestCount >= maxRequests` (line 163), while the Redis limiter checks `requestCount > maxRequests` (line 262). This is because the Redis implementation adds the current request to the sorted set BEFORE checking the count (via the atomic MULTI transaction), so the count already includes the current request. The in-memory implementation checks BEFORE adding. Both correctly allow exactly `maxRequests` requests per window.

### 4. Rate Limit Headers

- **X-RateLimit-Limit:**
  Verified in both modes. Set to `maxRequests`.

- **X-RateLimit-Remaining:**
  Verified in both modes. Calculated as `max(0, maxRequests - requestCount)`.

- **X-RateLimit-Reset:**
  Verified in both modes. In-memory uses the oldest timestamp + windowMs; Redis uses `now + windowMs`.

- **Retry-After on 429:**
  Verified in both modes. Set to `Math.ceil(windowMs / 1000)` seconds.

- **429 Response Body:**
  Verified. Returns JSON with `error`, `message`, and `retryAfter` fields.

### 5. Fail-Open Behavior

- **Redis unavailable at request time:**
  Verified. Lines 207-213: If `!redis || !isRedisConnected()`, the request is allowed with `X-RateLimit-Status: degraded` header and a warning logged.

- **Redis transaction failure:**
  Verified. Lines 241-247: If `multi.exec()` returns null, the request is allowed with degraded header.

- **Redis error during operation:**
  Verified. Lines 273-278: Catch block allows the request, sets degraded header, and logs the error.

- **In-memory NOT used as fallback mid-request:**
  Verified. The documentation states this explicitly and the code confirms it -- once Redis mode is selected, a Redis failure results in fail-open, not a switch to in-memory.

### 6. Cleanup of Old Entries

- **In-memory cleanup:**
  Verified. Lines 88-108: `setInterval` runs every 60 seconds (matching `RATE_LIMIT_CLEANUP_INTERVAL_MS`), iterating all stores and removing timestamps older than 1 hour. Empty client entries are deleted entirely.

- **Redis cleanup:**
  Verified. Each request transaction includes `ZREMRANGEBYSCORE` to prune old entries, plus `EXPIRE` with `windowMs/1000 + 1` seconds to auto-delete idle keys.

### 7. CAPTCHA Integration (Tier 2)

- **Applied to verification and vote endpoints:**
  Verified. `packages/backend/src/routes/verify.ts` applies `verifyCaptcha` middleware AFTER the rate limiter on both `POST /` (line 57) and `POST /:verificationId/vote` (line 91). This ordering is correct: rate limiting runs first to block floods before incurring CAPTCHA API calls.

- **reCAPTCHA v3 implementation:**
  Verified. `packages/backend/src/middleware/captcha.ts` sends POST to `https://www.google.com/recaptcha/api/siteverify` with secret key, token, and client IP. Uses `AbortController` with 5-second timeout.

- **Score threshold:**
  Verified. `CAPTCHA_MIN_SCORE` is 0.5 (from `constants.ts` line 52), matching the prompt specification.

- **Fail-open mode:**
  Verified. Default `CAPTCHA_FAIL_MODE=open` allows requests when Google API fails but applies stricter fallback rate limiting of 3 requests/hour per IP (`CAPTCHA_FALLBACK_MAX_REQUESTS` from `constants.ts` line 62).

- **Fail-closed mode:**
  Verified. `CAPTCHA_FAIL_MODE=closed` blocks all requests with 503 when Google API is unavailable.

- **Development/test skip:**
  Verified. Lines 121-123: Skips in `development` and `test` environments. Also skips with a warning if `RECAPTCHA_SECRET_KEY` is not set.

- **Fallback rate limit headers:**
  Verified. When in fail-open mode, the response includes `X-Security-Degraded`, `X-Fallback-RateLimit-Limit`, `X-Fallback-RateLimit-Remaining`, and `X-Fallback-RateLimit-Reset`.

### 8. Rate Limit Values

| Endpoint | Prompt Spec | Actual | Match |
|----------|------------|--------|-------|
| POST /api/v1/verify | 10/hour | 10/hour | Yes |
| POST /api/v1/verify/:id/vote | 10/hour | 10/hour | Yes |
| GET /api/v1/providers/search | 100/hour | 100/hour | Yes |
| GET /api/v1/providers/:npi | 200/hour | 200/hour | Yes |
| CAPTCHA fallback | 3/hour | 3/hour | Yes |

### 9. Skip Function Support

- Verified. The `RateLimiterOptions` interface includes `skip?: (req: Request) => boolean` and both implementations check it at the start of each request.

### 10. Attack Scenarios

- **Competitor sabotage / Provider manipulation / Bot spam:**
  Warning. IP-based rate limiting at 10/hour limits but does not fully prevent distributed attacks (multiple IPs). CAPTCHA provides additional defense. Tier 3 (user accounts, anomaly detection) would provide stronger protection.

- **Vote manipulation:**
  Warning. Votes are limited to 10/hour per IP, and CAPTCHA adds bot detection, but no per-verification vote deduplication beyond the existing Sybil prevention in the verification service.

### 11. Monitoring and Alerts

- **Rate limit hits logged:**
  Partially verified. The Redis rate limiter logs warnings on fail-open scenarios and errors. However, successful 429 rejections are NOT explicitly logged with structured data -- they return the 429 response but do not emit a specific log entry for monitoring dashboards.

- **Dashboard / alerting:**
  Not implemented. The prompt lists this as unchecked items under section 8.

### 12. Testing Strategy

- Not implemented. The prompt lists all testing items (local testing, production testing, load testing, bypass for automated tests) as unchecked.

### 13. Tier 3 Implementation

- Not implemented. User account-based limits, anomaly detection, and evidence requirements are documented as future work requiring authentication (prompt 03).

---

## Summary

The rate limiting implementation is robust and well-architected. All Tier 1 objectives are met: four distinct rate limiters cover all API endpoints with appropriate limits, a dual-mode architecture supports both single-instance and distributed deployments, and the sliding window algorithm prevents boundary-burst attacks. Tier 2 CAPTCHA integration is properly wired into the verification and vote submission routes with configurable fail-open/fail-closed modes and stricter fallback rate limiting. The code quality is high with extensive documentation, proper TypeScript typing, and comprehensive error handling.

Key strengths:
- Atomic Redis transactions prevent race conditions in the distributed limiter
- Fail-open behavior ensures availability even during Redis outages
- CAPTCHA fallback rate limiting (3/hour vs 10/hour) mitigates the risk of CAPTCHA bypass
- Middleware ordering (rate limit -> CAPTCHA -> handler) is correct and efficient

---

## Recommendations

1. **Add structured logging for 429 rejections.** When a request is rate-limited (429 response), emit a structured log entry with the limiter name, client IP, and endpoint. This is critical for attack detection and the monitoring dashboard planned in section 8.

2. **Implement at least basic testing.** The prompt's testing checklist (section 9) is entirely unchecked. A simple integration test that hits an endpoint `maxRequests + 1` times and asserts a 429 on the last call would verify the rate limiter works end-to-end.

3. **Consider logging rate-limited CAPTCHA fallback entries to Redis/database.** Currently the CAPTCHA fallback rate limiter is in-memory only, even when Redis is available. This means each Cloud Run instance has independent fallback counters.

4. **Document rate limits in API responses or documentation.** The prompt notes (section 5, Tier 2) that API docs should document rate limits. This is still unchecked.

5. **Plan for Tier 3 anomaly detection.** With only IP-based limiting, a determined attacker using a botnet or VPN rotation could bypass the 10/hour verification limit. Fingerprinting and user-account-based limits (Tier 3) would significantly strengthen defenses.

6. **Minor: Hardcoded 1-hour cleanup window in in-memory store.** The cleanup interval in lines 93-94 uses a hardcoded `maxWindowMs = 60 * 60 * 1000` rather than reading from the actual limiter configuration. This works because all current limiters use 1-hour windows, but would become incorrect if a limiter with a longer window were added.
