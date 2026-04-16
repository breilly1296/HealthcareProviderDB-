# Redis & Caching — 2026-04-16

**Mode:** In-Memory (Redis client exists but REDIS_URL not set in production deploy.yml)

## Configuration

| Item | Status | Evidence |
|------|--------|----------|
| REDIS_URL | Not configured in production | Absent from deploy.yml env_vars / secrets |
| Redis Provider | None deployed | No Memorystore reference in deploy.yml or infra scripts |
| TLS | Not enforced in code | `packages/backend/src/lib/redis.ts:49` (no TLS config on `new Redis(...)`) |
| Client | `ioredis` singleton | `packages/backend/src/lib/redis.ts:20-38` |
| Connect timeout | 10 s | `packages/backend/src/lib/redis.ts:52` |
| Command timeout | 5 s | `packages/backend/src/lib/redis.ts:53` |
| Max retries/request | 3 | `packages/backend/src/lib/redis.ts:51` |
| Retry strategy | exponential, max 5 attempts | `packages/backend/src/lib/redis.ts:56-64` |
| Graceful shutdown | Yes | `packages/backend/src/lib/redis.ts:134-148` |

## Rate Limiters

All defined in `packages/backend/src/middleware/rateLimiter.ts`:

| Limiter | Limit | Window | File:Line | Mode Selected |
|---------|-------|--------|-----------|---------------|
| default | 200/hr | 3,600,000 ms | rateLimiter.ts:329-334 | Redis if REDIS_URL set, else memory |
| search | 100/hr | 3,600,000 ms | rateLimiter.ts:362-367 | same |
| verification | 10/hr | 3,600,000 ms | rateLimiter.ts:340-345 | same |
| vote | 10/hr | 3,600,000 ms | rateLimiter.ts:351-356 | same |
| magic-link | 5/15min | 900,000 ms | rateLimiter.ts:373-378 | same |
| captcha-fallback | 3/hr | 3,600,000 ms | captcha.ts:89-106 | **always in-memory** (dedicated store, captcha.ts:64) |

Algorithm: sliding window with sorted sets (`ZREMRANGEBYSCORE` + `ZADD` + `ZCARD`
+ `EXPIRE`) in Redis mode (rateLimiter.ts:222-246), or array-of-timestamps
filtered per request in memory mode (rateLimiter.ts:140-177). Both approaches
mirror each other so behaviour is identical between modes.

Mode is chosen **at middleware construction time** (rateLimiter.ts:299-319)
via `getRedisClient()`. If the first `getRedisClient()` call returns null
(no REDIS_URL), every limiter in the process uses the in-memory path for
the lifetime of that process — including after Redis later comes online.
Switching requires a restart.

## Cache (General Purpose)

File: `packages/backend/src/utils/cache.ts`.

| Feature | File:Line |
|---------|-----------|
| `cacheGet/Set/Delete` | cache.ts:86-184 |
| Default TTL | 300 s (5 min) — cache.ts:22 |
| Key prefix | `cache:` — cache.ts:23 |
| Search key helper | `generateSearchCacheKey` — cache.ts:322-357 |
| Pattern delete (SCAN-based) | cache.ts:195-242 |
| Stats (hits/misses/size/mode) | cache.ts:48-55 |
| In-memory cleanup interval | 60 s — cache.ts:58-74 |
| Invalidation on verification | verify.ts:74, `invalidateSearchCache()` |

Callers:
- `packages/backend/src/routes/providers.ts:232,252,295` — provider search (5-min TTL)
- `packages/backend/src/routes/providers.ts:497,518` — provider detail (5-min TTL)
- `packages/backend/src/routes/verify.ts:74` — invalidate search cache on new verification

## Fail-Open Behavior

Rate limiter when Redis unavailable (rateLimiter.ts:208-213):

```ts
if (!redis || !isRedisConnected()) {
  logger.warn({ limiter: name }, 'Rate limiter Redis unavailable, allowing request (fail-open)');
  res.setHeader('X-RateLimit-Status', 'degraded');
  next();
  return;
}
```

Cache on Redis error (cache.ts:101-103, 148-150) logs and falls back to
in-memory cache transparently — callers do not see failures.

## Redis Mode Never Selected

Because no limiter sees `REDIS_URL`, the current production deployment runs
entirely on in-memory rate limiters and cache. Implications:
- Each Cloud Run instance keeps its own counters (`max-instances=10` in deploy.yml:144).
- An attacker distributing across 10 instances gets 10x the effective limit.
- Cache cold-start on every container boot.
- `cacheStats` and `/admin/cache/stats` always report `mode: memory`.

## Health / Observability Hooks

- `/health` returns `cache.mode` + hit rate (index.ts:124-132)
- `/api/v1/admin/cache/stats` (admin.ts:256-272) — same stats, secret-gated
- `getRedisStatus()` exists (redis.ts:118-128) but **not exposed** through
  any endpoint today
- `/api/v1/admin/cache/clear` invalidates both Redis and memory (admin.ts:230-248)

## Findings (Ranked)

1. **HIGH** — Redis not deployed. All rate limiting is per-instance. With `max-instances=10` (deploy.yml:144), effective verification limit becomes 100/hr across the fleet rather than 10/hr. Decision point: either set `max-instances=1` (degrades scaling) or provision Memorystore + set `REDIS_URL` secret.
2. **MEDIUM** — Redis mode is locked at first-load (rateLimiter.ts:301-311). If REDIS_URL is configured mid-lifetime, a restart is needed. Consider resolving per request or adding a SIGHUP refresh.
3. **MEDIUM** — No TLS enforcement when connecting (redis.ts:49). Memorystore supports TLS — fix by detecting `redis://` vs `rediss://` in production and logging a warning.
4. **MEDIUM** — `getRedisStatus()` exists but is not exposed; `/health` only shows cache mode, not Redis connection state (index.ts:108-151).
5. **LOW** — Cache statistics are not persisted — resets every process. No centralized hit-rate metrics reach Cloud Monitoring.
6. **LOW** — `captcha-fallback` store (captcha.ts:64) is always in-memory even when Redis is available. Low severity: it only kicks in when Google's reCAPTCHA is down.
7. **LOW** — In-memory rate limiter cleanup interval runs per `storeName` but uses a fixed 1-hour max-window assumption (rateLimiter.ts:89-108). Works today because all configured limiters have <=1h windows, but would silently break if someone added a longer window.

## Checklist

### Implementation
- [x] Redis client with retry logic (redis.ts:50-64)
- [x] Sliding window algorithm (rateLimiter.ts:221-240)
- [x] In-memory fallback (rateLimiter.ts:117-179)
- [x] Fail-open on Redis failure (rateLimiter.ts:208-213)
- [x] Rate limit headers (`X-RateLimit-*`)
- [x] Automatic cleanup (rateLimiter.ts:87-108)

### Production Readiness
- [ ] Redis deployed (Memorystore)
- [ ] `REDIS_URL` secret configured on backend Cloud Run
- [ ] TLS enforced (`rediss://` scheme)
- [ ] Connection/memory limits tuned
- [ ] Monitoring alerts on Redis connection drops

### Testing
- [x] Unit tests for in-memory limiter behavior
- [ ] Integration test against a real Redis instance
- [ ] Failover smoke test (Redis down mid-request)
- [ ] Load test confirming sliding-window enforcement

## Recommendations

1. Provision Memorystore Standard tier in the same region as Cloud Run (us-central1). Use private VPC connector to reach it.
2. Add `REDIS_URL` to Secret Manager and mount into backend service in `deploy.yml:150-157`.
3. Export `/api/v1/admin/redis/status` calling `getRedisStatus()` for dashboard wiring.
4. Add a cache-hit-rate metric (either PostHog event for backend or Cloud Monitoring custom metric) so we notice cache regressions.
5. Use `rediss://` URL scheme and set `tls: {}` in ioredis options when production is detected.
6. Consider adding a second cache layer (e.g., 30-min TTL) for metadata endpoints (`/plans/meta/issuers`, `/plans/meta/years`) that rarely change.
