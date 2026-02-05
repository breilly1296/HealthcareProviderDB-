# Redis Caching & Rate Limiting — Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/31-redis-caching.md
**Status:** Fully Implemented -- Dual-mode rate limiting and caching with Redis/in-memory fallback

---

## Findings

### Redis Client (`packages/backend/src/lib/redis.ts`)
- [x] **Singleton pattern** -- `getRedisClient()` uses a `connectionAttempted` flag to ensure only one connection attempt per process. Returns cached `redisClient` on subsequent calls.
- [x] **ioredis dependency** -- Uses `ioredis` (v5.9.2) as the Redis client library.
- [x] **Retry logic with exponential backoff** -- `retryStrategy` retries up to 5 times with `Math.min(times * 200, 3000)` delay (200ms, 400ms, 600ms... capped at 3s). Returns `null` after 5 attempts to stop retrying.
- [x] **Connection state tracking** -- Maintains `isConnected` boolean updated by `ready`, `error`, `close`, and `end` event handlers. Exposed via `isRedisConnected()`.
- [x] **Status reporting** -- `getRedisStatus()` returns `{ configured, connected, status }` for health checks.
- [x] **Graceful shutdown** -- `closeRedisConnection()` calls `redis.quit()` with fallback to `redis.disconnect()` on error. Resets singleton state.
- [x] **Connection timeouts** -- `connectTimeout: 10000` (10s), `commandTimeout: 5000` (5s).
- [x] **Structured logging** -- Uses pino logger with context objects (not console.log).
- [ ] **TLS support** -- Not explicitly configured. The connection URL would need to use `rediss://` protocol for TLS, but no explicit TLS options are set in the client config.

### Rate Limiting (`packages/backend/src/middleware/rateLimiter.ts`)
- [x] **Dual-mode architecture** -- `createRateLimiter()` auto-selects Redis or in-memory based on `getRedisClient()` return value. Mode selection logged once per limiter name.
- [x] **Sliding window algorithm (both modes)** -- In-memory uses array of timestamps per client key; Redis uses sorted sets (`ZADD` with timestamp scores, `ZREMRANGEBYSCORE` to prune, `ZCARD` to count).
- [x] **Redis sorted set transactions** -- Uses `redis.multi()` pipeline: (1) remove old entries, (2) add current request with `now-randomId` member, (3) count entries, (4) set TTL. Atomic execution.
- [x] **Fail-open behavior** -- Three fail-open paths: (a) Redis not connected at request time, (b) Redis transaction returns null, (c) Redis throws exception. All set `X-RateLimit-Status: degraded` header and call `next()`.
- [x] **Rate limit response headers** -- Both modes set `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. On 429, also sets `Retry-After`.
- [x] **Periodic in-memory cleanup** -- `setInterval` every 60s removes timestamps older than 1 hour from all stores. Prevents memory leaks for long-running processes.
- [x] **Skip function support** -- Both modes support `skip: (req) => boolean` to bypass rate limiting per request.
- [x] **Custom key generator** -- Both modes support `keyGenerator: (req) => string`. Defaults to `req.ip || 'unknown'`.
- [x] **429 JSON response** -- Returns `{ error, message, retryAfter }` on rate limit exceeded.

### Pre-Configured Rate Limiters
| Name | Limit | Window | Verified |
|------|-------|--------|----------|
| `defaultRateLimiter` | 200 req | 1 hour | Matches prompt |
| `searchRateLimiter` | 100 req | 1 hour | Matches prompt |
| `verificationRateLimiter` | 10 req | 1 hour | Matches prompt |
| `voteRateLimiter` | 10 req | 1 hour | Matches prompt |

### Cache Utility (`packages/backend/src/utils/cache.ts`)
- [x] **Dual-mode caching** -- `cacheGet`/`cacheSet`/`cacheDelete` try Redis first, fall back to in-memory Map. This extends Redis beyond rate limiting as the prompt's "Future Considerations" suggested.
- [x] **TTL-based expiration** -- Default TTL is 300 seconds (5 minutes). Redis uses `SETEX`; in-memory stores `expiresAt` timestamp.
- [x] **Cache statistics** -- Tracks hits, misses, sets, deletes, size, and mode. Exposed via `getCacheStats()`.
- [x] **Pattern deletion** -- `cacheDeletePattern()` uses Redis `SCAN` (not `KEYS`) for production safety. Falls back to regex matching on in-memory Map.
- [x] **Search cache key generation** -- `generateSearchCacheKey()` normalizes search params (lowercase, trim) and generates deterministic keys with a simple hash for additional params.
- [x] **Search cache invalidation** -- `invalidateSearchCache()` clears all `search:*` keys, called when verifications are submitted.
- [x] **Periodic cleanup** -- 60-second interval removes expired entries from in-memory cache.

### Docker Compose (`docker-compose.yml`)
- [ ] **No Redis service** -- The `docker-compose.yml` only defines `db` (PostgreSQL), `backend`, and `frontend` services. No Redis container is configured. This is consistent with the fallback design but means local development always uses in-memory mode.

### Admin Cache Endpoints (`packages/backend/src/routes/admin.ts`)
- [x] **POST /admin/cache/clear** -- Clears all cache entries, returns deleted count.
- [x] **GET /admin/cache/stats** -- Returns cache statistics including hit rate calculation.

## Summary

The Redis integration is well-implemented with a robust dual-mode architecture. The rate limiting middleware uses a proper sliding window algorithm in both Redis (sorted sets) and in-memory (timestamp arrays) modes, with consistent fail-open behavior across three potential failure points. The cache utility extends Redis beyond rate limiting to support search result caching with TTL, pattern deletion, and invalidation on verification submission.

The implementation exceeds what the prompt describes as "Not Implemented" under "Additional Caching" -- search result caching and cache invalidation are actually already built in `cache.ts`. The code is production-quality with structured logging, connection state tracking, graceful shutdown, and comprehensive error handling.

## Recommendations

1. **Add Redis to docker-compose** -- Add a Redis service to `docker-compose.yml` and `docker-compose.dev.yml` so developers can test distributed rate limiting locally:
   ```yaml
   redis:
     image: redis:7-alpine
     ports:
       - "6379:6379"
   ```

2. **Configure TLS for production Redis** -- If using Google Cloud Memorystore, enable in-transit encryption. Add explicit TLS options to the ioredis config when `REDIS_URL` uses `rediss://` protocol.

3. **Add Redis health to admin endpoints** -- The `/admin/health` endpoint includes cache stats but does not report Redis connection status. Include `getRedisStatus()` in the health response for monitoring.

4. **Consider provider detail caching** -- `cache.ts` supports arbitrary key-value caching. Provider detail pages (by NPI) are read-heavy and could benefit from short-TTL caching to reduce database load.

5. **Add rate limiter tests** -- Both Redis and in-memory modes have zero test coverage. Test the sliding window behavior, fail-open paths, header values, and 429 responses.

6. **Monitor in-memory cache size** -- The in-memory fallback has no size limit. Under sustained load without Redis, the Map could grow unbounded. Consider adding a max-size eviction policy (LRU) for the in-memory fallback.

7. **Clarify Redis deployment status** -- The prompt's checklist shows "Redis deployed (Memorystore)" as unchecked. Confirm whether Redis is deployed in production or if the system is running entirely in in-memory mode.
