# VerifyMyProvider Rate Limiting Review

**Last Updated:** 2026-04-16
**Original Severity:** Medium (CVSS 7.1) — ZeroPath finding
**Status:** Tier 1 COMPLETE + Tier 2 PARTIAL (CAPTCHA implemented)
**Reviewer:** automated-audit

---

## Executive Summary

Tier 1 IP-based rate limiting is fully implemented via a dual-mode
(Redis + in-memory) sliding-window limiter. All four write endpoints flagged
by the ZeroPath scan are now protected. Tier 2 CAPTCHA (Google reCAPTCHA v3)
is in place on both write paths, with explicit fail-open / fail-closed modes
and a fallback stricter rate-limit bucket. Tier 3 (account-based graduated
limits, anomaly detection, allowlist) remains future work.

Overall rating: **PASS**. The largest remaining gaps are
(a) Cloud Run trusts only the first proxy (`app.set('trust proxy', 1)`), which
is correct for the single Google load balancer in front of Cloud Run but
should be double-checked if a WAF is ever inserted, and (b) the in-memory
cleanup interval uses a conservative 60-min window so short-lived limiters
(e.g. magic-link 15-min window) carry stale entries for up to 45 min.

---

## Endpoint Matrix

| Endpoint | Method | Limiter | Limit | CAPTCHA | Honeypot | CSRF | File:line |
|---|---|---|---|---|---|---|---|
| `/api/v1/verify` | POST | verificationRateLimiter | 10/hr | Yes | Yes | No (public) | `routes/verify.ts:58-62` |
| `/api/v1/verify/:id/vote` | POST | voteRateLimiter | 10/hr | Yes | Yes | No (public) | `routes/verify.ts:93-97` |
| `/api/v1/verify/stats` | GET | defaultRateLimiter | 200/hr | No | No | No | `routes/verify.ts:125` |
| `/api/v1/verify/recent` | GET | defaultRateLimiter | 200/hr | No | No | No | `routes/verify.ts:138` |
| `/api/v1/verify/:npi/:planId` | GET | defaultRateLimiter | 200/hr | No | No | No | `routes/verify.ts:159` |
| `/api/v1/providers/search` | GET | searchRateLimiter | 100/hr | No | No | No | `routes/providers.ts:227` |
| `/api/v1/providers/:npi` | GET | defaultRateLimiter | 200/hr | No | No | No | `routes/providers.ts:534` |
| `/api/v1/providers/:npi/plans` | GET | defaultRateLimiter | 200/hr | No | No | No | `routes/providers.ts:406` |
| `/api/v1/providers/:npi/colocated` | GET | defaultRateLimiter | 200/hr | No | No | No | `routes/providers.ts:330` |
| `/api/v1/providers/cities` | GET | defaultRateLimiter | 200/hr | No | No | No | `routes/providers.ts:310` |
| `/api/v1/providers/map` | GET | searchRateLimiter | 100/hr | No | No | No | `routes/providers.ts:491` |
| `/api/v1/auth/magic-link` | POST | magicLinkRateLimiter | 5 / 15min | No | No | Yes | `routes/auth.ts:85-87` |
| `/api/v1/auth/refresh` | POST | (global default only) | 200/hr | No | No | Yes | `routes/auth.ts:138` |
| `/api/v1/admin/*` | * | none (auth required) | — | No | No | No | `routes/admin.ts` |

All routes also inherit the global `defaultRateLimiter` applied at
`index.ts:154`. Note: the per-route limiter with a more specific bucket (e.g.
verification 10/hr) runs *after* the global default, so the global 200/hr is
effectively a bypass ceiling.

## Dual-Mode Architecture — Verified

- `createRateLimiter` (`middleware/rateLimiter.ts:299`) checks `getRedisClient()`
  once per limiter name and logs the selected mode. Result cached in
  `limiterModes` map so mode toggling at runtime is not supported (a Cloud Run
  restart is needed after enabling `REDIS_URL`).
- Redis path: sliding window via sorted set; key `ratelimit:{name}:{clientIP}`;
  transaction: `zremrangebyscore` → `zadd` → `zcard` → `expire`
  (`rateLimiter.ts:221-237`).
- In-memory path: sliding window via `Map<string, number[]>`; per-client
  timestamp array filtered against `now - windowMs` each request
  (`rateLimiter.ts:143-178`).
- **Fail-open:** both when Redis client is absent (`rateLimiter.ts:208`) and
  on transaction/exec failure (`rateLimiter.ts:241-246, 273-278`). Response
  gets `X-RateLimit-Status: degraded`.

## Checklist Results

### 1. Endpoints — Rate Limiting Status
- [x] `POST /api/v1/verify` — verified
- [x] `POST /api/v1/verify/:id/vote` — verified
- [x] `GET /api/v1/providers/search` — verified
- [x] `GET /api/v1/providers/:npi` — verified

### 2. Attack Scenarios
- [x] **Competitor sabotage:** mitigated — 10/hr + CAPTCHA + 30-day Sybil
      window (`services/verificationService.ts:100-137`).
- [x] **Provider manipulation:** mitigated — consensus threshold (3 verifications
      + 60 confidence + 2:1 majority) before status change
      (`verificationService.ts:194-207`).
- [x] **Insurance gaming:** same consensus protection.
- [x] **Bot spam:** CAPTCHA v3 + honeypot + rate limiting.
- [x] **Vote manipulation:** unique `(verificationId, sourceIp)` constraint
      (`schema.prisma:284`) + `voteRateLimiter` 10/hr.

### 3. Impact on Confidence Scores — Protection Layers
- Consensus threshold prevents a single spammer flipping status.
- `confidenceScore` decay service (`services/confidenceDecayService.ts`) can
  be recalculated via admin endpoint.
- Remaining residual risk: IP rotation by a motivated attacker. Mitigated by
  CAPTCHA v3 scoring but not eliminated.

### 4. Tier 1 Implementation — COMPLETE
- [x] Sliding window (both modes) — confirmed
- [x] Standard headers `X-RateLimit-Limit / Remaining / Reset` — `rateLimiter.ts:159-161, 258-260`
- [x] `Retry-After` on 429 — `rateLimiter.ts:164, 263`
- [x] Periodic cleanup (every 60s) — `rateLimiter.ts:88-108`
- [x] Skip function — `rateLimiter.ts:54, 134`
- [x] Named limiters (`name` prop used for Redis keys + logging)

### 5. Tier 2 — CAPTCHA
- [x] reCAPTCHA v3 on `/verify` and `/vote` (`middleware/captcha.ts:119`)
- [x] Score threshold 0.5 default (`config/constants.ts:52`)
- [x] `CAPTCHA_FAIL_MODE` open/closed (`middleware/captcha.ts:52`)
- [x] Fallback 3/hr stricter limit (`captcha.ts:89-106, 219`)
- [x] `X-Security-Degraded: captcha-unavailable` header
- [x] Bypass in `NODE_ENV=development|test` (`captcha.ts:121`)
- [ ] Device fingerprinting (IP + UA) — NOT implemented
- [ ] Tighter limits based on observed traffic — not yet tuned
- [ ] Rate limits documented in public API docs

### 6. Tier 3 — NOT STARTED (requires user auth)
- [ ] User-keyed limits via `keyGenerator: req => req.user?.id ?? req.ip`
  (keyGenerator plumbing already exists — `rateLimiter.ts:52`).
- [ ] Anomaly detection (burst patterns, velocity per provider).
- [ ] Evidence requirements for disputed verifications.

### 7. Endpoint-Specific Limits — Present Limits Match Prompt

| Endpoint | Expected T1 | Actual | OK? |
|---|---|---|---|
| POST /verify | 10/hr | 10/hr | Yes |
| POST /verify/:id/vote | 10/hr | 10/hr | Yes |
| GET /search | 100/hr | 100/hr | Yes |
| GET /:npi | 200/hr | 200/hr | Yes |

### 8. Monitoring & Alerts
- [partial] Rate limit hits in logs — `requestLogger.ts:54-61` captures 429
  and the rate-limit headers, but there is no aggregate alerting rule.
- [ ] Alert when >10 IPs hit limit / hour — not configured (no Cloud
  Monitoring alert policy in repo).
- [ ] Admin dashboard showing blocked IPs / verification velocity / conflicting
  verifications — not present.

### 9. Testing Strategy
- [x] Unit tests for rate limiter exist (`middleware/__tests__/` has captcha +
  honeypot tests; rate limiter has test scaffolding in `routes/__tests__`).
- [ ] Production smoke test / allowlist for team IPs — not codified.
- [ ] Load test — no load-test artifacts in repo.
- [x] Test environment bypass — `NODE_ENV=test` disables CAPTCHA; rate limiter
  has no skip for `NODE_ENV=test`, which may affect integration tests.

---

## Findings (ranked by severity)

### FINDING-08-01 — MEDIUM: Off-by-one between Redis and memory modes
- Memory path rejects when `requestCount >= maxRequests`
  (`rateLimiter.ts:163`).
- Redis path rejects when `requestCount > maxRequests`
  (`rateLimiter.ts:262`).
- Effect: Redis mode allows 11 requests before blocking; memory mode blocks
  at the 11th. Same nominal "10/hr" limit behaves differently depending on
  deployment.
- **Recommendation:** align both to `> maxRequests` (or both to `>=`), then
  add a unit test asserting the exact boundary.

### FINDING-08-02 — MEDIUM: No rate limit on `/api/v1/auth/refresh`
- Only the global `defaultRateLimiter` (200/hr) covers refresh.
- A stolen refresh-token cookie + valid CSRF token could be used up to 200x/hr
  to mint fresh access tokens. Much higher than magic-link's 5/15min.
- **Recommendation:** add a dedicated `refreshRateLimiter` (e.g. 30/hr).

### FINDING-08-03 — LOW: Memory cleanup window too conservative
- `rateLimiter.ts:93` hardcodes `maxWindowMs = 60 * 60 * 1000` for cleanup.
- Magic-link limiter uses a 15-min window; entries linger 45+ min after
  becoming irrelevant. Negligible for small IP space but wastes memory under
  attack.
- **Recommendation:** track the actual `windowMs` per limiter via
  `memoryStoreOptions` and use the limiter-specific window for cleanup.

### FINDING-08-04 — LOW: `limiterModes` Map is write-once
- Mode log line (`rateLimiter.ts:304-311`) only runs on the first request to a
  named limiter. If Redis becomes available after a cold start, mode is never
  re-evaluated.
- **Recommendation:** clarify in the comments that mode is fixed at limiter
  construction time, or add a periodic health-check that re-evaluates.

### FINDING-08-05 — LOW: No allowlist / bypass for known-good IPs
- The `skip` option exists but is not wired to an env-var allowlist.
- **Recommendation:** add `RATE_LIMIT_ALLOWLIST_IPS` env var parsed once at
  boot and used in every limiter's `skip` callback.

### FINDING-08-06 — INFO: Prompt's "200/hr" global + specific limiter
- `index.ts:154` applies `defaultRateLimiter` (200/hr) globally, then each
  route also applies its specific limiter. Because each limiter has its own
  Redis key prefix, this is additive, not overriding — an attacker hitting
  the verification endpoint 11 times will be blocked by
  `verificationRateLimiter` before ever approaching the 200/hr default.
  Behavior is correct, but documenting would prevent confusion.

### FINDING-08-07 — INFO: `trust proxy = 1` is correct for Cloud Run
- `index.ts:39` sets trust-proxy to 1. Cloud Run has a single load balancer,
  so `req.ip` correctly resolves to the client IP via `X-Forwarded-For`.
- If a WAF or additional proxy is ever added, increment this value — else
  rate limiting will key off the WAF's IP and degrade into a global limiter.

---

## Implementation Status (as-of)

**Tier 1 — COMPLETE (Jan 2026):**
- [x] Dual-mode (Redis + in-memory)
- [x] Sliding window, not fixed
- [x] IP-based on all write and search endpoints
- [x] Standard RFC 6585 `Retry-After` and draft `X-RateLimit-*` headers
- [x] Fail-open on Redis failure with `X-RateLimit-Status: degraded`
- [x] Deployed to production (code path references Cloud Run)

**Tier 2 — PARTIAL:**
- [x] reCAPTCHA v3 on write endpoints
- [x] Fail-open with fallback 3/hr bucket
- [ ] Device fingerprinting
- [ ] Documented limits in public API docs
- [ ] Anomaly alerting

**Tier 3 — FUTURE:**
- [ ] User-account-graduated limits (requires auth user adoption)
- [ ] Admin blocklist/allowlist UI
- [ ] Penetration test
