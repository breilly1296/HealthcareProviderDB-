# Redis Caching & Rate Limiting Review

**Generated:** 2026-02-18
**Prompt:** 31-redis-caching.md
**Status:** Fully Implemented -- Dual-mode (Redis/in-memory) with fail-open behavior; caching layer also implemented

---

## Summary

The Redis integration serves two purposes: (1) distributed rate limiting and (2) general-purpose caching. Both systems support dual-mode operation -- Redis when `REDIS_URL` is configured, in-memory fallback otherwise. The implementation uses ioredis with singleton pattern, retry logic, and fail-open behavior that prioritizes availability over strict enforcement. A full caching layer (`cache.ts`) provides TTL-based get/set/delete with search key generation, also with Redis/memory dual-mode support.

---

## Verified Checklist

### Redis Client (`packages/backend/src/lib/redis.ts`)
- [x] Singleton pattern (`getRedisClient()` creates once per process)
- [x] `connectionAttempted` flag prevents repeated connection attempts
- [x] ioredis with configuration:
  - `maxRetriesPerRequest: 3`
  - `connectTimeout: 10000` (10s)
  - `commandTimeout: 5000` (5s)
  - Exponential backoff retry: `min(times * 200, 3000)` up to 5 attempts
  - `enableReadyCheck: true`, `lazyConnect: false`
- [x] Event handlers: connect, ready, error, close, reconnecting, end
- [x] `isRedisConnected()` -- checks `isConnected && status === 'ready'`
- [x] `getRedisStatus()` -- returns configured/connected/status object
- [x] `closeRedisConnection()` -- graceful shutdown with quit(), fallback to disconnect()
- [x] Structured logging via pino logger

### Rate Limiting (`packages/backend/src/middleware/rateLimiter.ts`)
- [x] Auto-selecting factory: `createRateLimiter()` picks Redis or in-memory based on `getRedisClient()` result
- [x] Logs mode selection once per limiter name
- [x] Sliding window algorithm (not fixed window) for both modes

#### In-Memory Rate Limiter
- [x] `SlidingWindowStore`: Map of client keys to arrays of request timestamps
- [x] Periodic cleanup every 60 seconds (filters timestamps older than 1 hour)
- [x] Per-request: filters out-of-window timestamps, counts remaining, allows or rejects
- [x] Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [x] `Retry-After` header on 429 responses
- [x] Custom key generator support (defaults to `req.ip`)
- [x] Skip function support

#### Redis Rate Limiter
- [x] Sliding window via sorted sets (ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE)
- [x] Atomic transaction with `redis.multi()`
- [x] Unique member: `${timestamp}-${random7chars}`
- [x] Key format: `ratelimit:{name}:{clientKey}`
- [x] TTL on Redis key: `windowMs/1000 + 1` seconds

#### Fail-Open Behavior
- [x] If Redis unavailable at request time: allow request with `X-RateLimit-Status: degraded` header
- [x] If transaction fails: allow request with degraded status
- [x] If Redis throws error: allow request with degraded status
- [x] Warning logged on every fail-open event
- [x] In-memory limiter is NOT used as fallback mid-request (documented design choice to avoid inconsistent state)

### Pre-Configured Rate Limiters
| Name | Limit | Window | Use Case | File Reference |
|------|-------|--------|----------|----------------|
| `defaultRateLimiter` | 200 req | 1 hour | General API endpoints | rateLimiter.ts line 329 |
| `searchRateLimiter` | 100 req | 1 hour | Search endpoints | rateLimiter.ts line 362 |
| `verificationRateLimiter` | 10 req | 1 hour | Verification submission | rateLimiter.ts line 340 |
| `voteRateLimiter` | 10 req | 1 hour | Voting | rateLimiter.ts line 351 |
| `magicLinkRateLimiter` | 5 req | 15 min | Login requests | rateLimiter.ts line 373 |
| `scanRateLimiter` | 10 req | 1 hour | Insurance card scans (keyed by userId) | insuranceCard.ts line 22 |

### Cache Layer (`packages/backend/src/utils/cache.ts`)
- [x] `cacheGet<T>()` -- tries Redis first, falls back to in-memory
- [x] `cacheSet<T>()` -- stores in Redis (via SETEX) or in-memory with TTL
- [x] `cacheDelete()` -- deletes from both Redis and in-memory
- [x] `cacheDeletePattern()` -- uses Redis SCAN (not KEYS) for production safety
- [x] `cacheClear()` -- clears all cache entries
- [x] `getCacheStats()` -- returns hits, misses, sets, deletes, size, mode
- [x] `resetCacheStats()` -- resets counters
- [x] Default TTL: 300 seconds (5 minutes)
- [x] Key prefix: `cache:` for all entries, `search:` for search cache keys
- [x] Periodic cleanup of expired in-memory entries (every 60 seconds)

### Search Cache Key Generation
- [x] `generateSearchCacheKey()` -- deterministic, normalized cache keys
- [x] Normalization: lowercase, trim all string values
- [x] Key format: `search:{state}:{city}:{specialty}:{page}:{limit}:{hash}`
- [x] Additional params (cities, zip, healthSystem, specialtyCategory, name, npi, entityType, insurancePlanId) hashed via simple hash function
- [x] `invalidateSearchCache()` -- deletes all `search:*` keys (called after verification submissions)

### Admin Cache Endpoints (from `packages/backend/src/routes/admin.ts`)
- [x] `POST /api/v1/admin/cache/clear` -- clears all cache entries, returns count
- [x] `GET /api/v1/admin/cache/stats` -- returns hit/miss/set/delete counts, size, hit rate percentage
- [x] Both protected by `adminAuthMiddleware`

---

## Architecture Assessment

### Strengths
1. **Fail-open is the right choice**: For a healthcare provider directory, availability matters more than strict rate limiting. The degraded header allows monitoring dashboards to detect when Redis is down.
2. **Sliding window over fixed window**: Prevents the burst-at-boundary attack that fixed windows are vulnerable to. Well-documented in code comments with examples.
3. **Dual-mode with no code changes**: The `createRateLimiter()` factory automatically selects the right implementation. Application code never needs to know which mode is active.
4. **Cache layer is comprehensive**: Goes beyond just rate limiting -- full get/set/delete/pattern-delete with search-specific key generation and invalidation.
5. **SCAN over KEYS**: The pattern delete uses Redis SCAN with COUNT 100, which is production-safe and won't block Redis on large key sets.
6. **Singleton Redis**: One connection per process, not per request. Connection state tracked with event handlers.

### Gaps
1. **Redis not deployed in production**: The prompt's checklist shows Memorystore not configured, no TLS, no monitoring alerts. Currently running in in-memory mode.
2. **No Redis-based session storage**: Sessions are stored in PostgreSQL. Redis could reduce DB load for session lookups.
3. **No cache warming**: Cold cache on server restart means first requests always hit the database.
4. **No cache statistics dashboard**: Stats are available via admin endpoint but not visualized.
5. **Cleanup interval hardcoded**: Both rate limiter and cache use 60-second cleanup intervals, not configurable.

### Production Readiness
- [ ] Redis deployed (Memorystore or equivalent)
- [ ] Connection string in GCP Secret Manager
- [ ] TLS enabled for Redis connection
- [ ] Memory limits configured
- [ ] Monitoring alerts for connection failures
- [ ] Load tested rate limits
- [ ] Redis persistence configured (optional for rate limiting, useful for cache)

### Testing
- [x] Rate limiter in-memory mode tested (12 tests in `rateLimiter.test.ts`)
- [x] Tests mock Redis to null (forces in-memory mode)
- [ ] Redis mode not tested (would require Redis in test environment)
- [ ] Failover behavior not tested
- [ ] Cache layer not tested

---

## Recommendations

1. **Deploy Redis (Memorystore)**: This is the primary production gap. Without Redis, rate limiting is per-process only, making it ineffective with multiple instances. Google Cloud Memorystore with automatic failover is recommended.

2. **Add TLS**: When deploying Memorystore, enable in-transit encryption. The ioredis client supports TLS via the connection URL (`rediss://` scheme).

3. **Add monitoring**: Set up alerts for:
   - Redis connection failures (log pattern: `Redis error`)
   - Fail-open events (log pattern: `allowing request (fail-open)`)
   - High rate limit rejection rates
   - Cache hit rate dropping below threshold

4. **Consider cache warming**: For frequently accessed data (state lists, specialty lists), pre-populate the cache on server startup.

5. **Test Redis mode**: Add integration tests that run with a real Redis instance (e.g., via Docker in CI) to test distributed rate limiting and cache behavior.

---

## Key Files

| File | Path | Purpose |
|------|------|---------|
| Redis Client | `packages/backend/src/lib/redis.ts` | Singleton ioredis client |
| Rate Limiter | `packages/backend/src/middleware/rateLimiter.ts` | Dual-mode rate limiting |
| Cache Utility | `packages/backend/src/utils/cache.ts` | Dual-mode caching with search keys |
| Rate Limiter Tests | `packages/backend/src/middleware/__tests__/rateLimiter.test.ts` | 12 in-memory mode tests |
| Admin Cache Routes | `packages/backend/src/routes/admin.ts` (lines 230-272) | Cache clear and stats |
| Constants | `packages/backend/src/config/constants.ts` | Rate limit cleanup interval |
