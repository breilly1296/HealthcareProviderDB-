# Redis & Caching

**Last Updated:** 2026-02-06
**Mode:** Dual-mode (Redis when REDIS_URL configured, in-memory fallback otherwise)

## Configuration
- REDIS_URL: Not configured in docker-compose.yml (no Redis service defined)
- Redis Provider: None deployed (no Redis in docker-compose)
- TLS: Not configured (no TLS options in Redis client setup)

## Rate Limiters

| Limiter | Limit | Window | Applied To |
|---------|-------|--------|------------|
| `defaultRateLimiter` | 200/hr | 1 hour | General API routes, location detail/stats/health-systems |
| `searchRateLimiter` | 100/hr | 1 hour | Search endpoints (providers, locations) |
| `verificationRateLimiter` | 10/hr | 1 hour | Verification submission |
| `voteRateLimiter` | 10/hr | 1 hour | Voting on verifications |

## Health Status
- Redis connected: No (no REDIS_URL in docker-compose)
- Failover events (24h): N/A
- Current keys: N/A

---

## Redis Client (`redis.ts`) -- VERIFIED

**Implementation quality: Good.** Singleton pattern with proper lifecycle management.

Key findings:
- **Singleton pattern**: `getRedisClient()` attempts connection only once per process (`connectionAttempted` flag)
- **Connection settings**: `maxRetriesPerRequest: 3`, `connectTimeout: 10000ms`, `commandTimeout: 5000ms`
- **Retry strategy**: Exponential backoff (`times * 200`, capped at 3000ms), gives up after 5 attempts
- **Event handlers**: `connect`, `ready`, `error`, `close`, `reconnecting`, `end` -- all logged via structured logger
- **Connection state tracking**: `isConnected` boolean updated on `ready`/`error`/`close`/`end` events
- **Status check**: `isRedisConnected()` verifies `isConnected && redisClient !== null && redisClient.status === 'ready'`
- **Graceful shutdown**: `closeRedisConnection()` uses `quit()` with fallback to `disconnect()`, resets all state
- **Status reporting**: `getRedisStatus()` returns `{ configured, connected, status }` for health checks

### Difference from prompt description:
The prompt describes `initRedis()` with `lazyConnect: true`. The actual implementation uses `getRedisClient()` with `lazyConnect: false` and `enableReadyCheck: true`. This is better -- the client connects eagerly and validates the connection on startup rather than delaying connection issues to the first request.

---

## Rate Limiter (`rateLimiter.ts`) -- VERIFIED

**Implementation quality: Excellent.** Well-documented dual-mode system with proper algorithm choice.

### Architecture
```
createRateLimiter(options)
  |
  +-- REDIS_URL configured? --> createRedisRateLimiter() [distributed]
  |
  +-- No REDIS_URL?        --> createInMemoryRateLimiter() [process-local]
```

### In-Memory Rate Limiter
- **Algorithm**: Sliding window with timestamp arrays
- **Storage**: `Map<string, number[]>` per limiter name
- **Cleanup**: `setInterval` every 60 seconds, removes expired entries
- **Key generation**: Default is `req.ip`, customizable via `keyGenerator`
- **Skip function**: Optional `skip` callback to bypass rate limiting
- **Headers**: Sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Documentation**: Excellent inline comments explaining sliding window vs fixed window trade-offs

### Redis Rate Limiter
- **Algorithm**: Sliding window using Redis sorted sets
- **Transaction**: Atomic pipeline with `multi()`:
  1. `ZREMRANGEBYSCORE` -- remove entries outside window
  2. `ZADD` -- add current request with timestamp + random suffix
  3. `ZCARD` -- count requests in window
  4. `EXPIRE` -- set key TTL for cleanup
- **Key format**: `ratelimit:{name}:{clientIp}`
- **Fail-open**: If Redis unavailable or transaction fails, allows request with `X-RateLimit-Status: degraded` header
- **Error handling**: Catches Redis errors, logs with structured logger, fails open

### Auto-Selection
- `createRateLimiter()` factory checks `getRedisClient()` and selects mode
- Mode selection logged once per limiter name (avoids log spam)
- Tracks modes in `limiterModes` Map

---

## CAPTCHA Middleware (`captcha.ts`) -- VERIFIED

**Implementation quality: Excellent.** Comprehensive fallback system with configurable fail mode.

Key findings:
- **Dual fail mode**: `CAPTCHA_FAIL_MODE=open` (default) or `closed`, configurable via environment variable
- **Fail-open behavior**: When Google reCAPTCHA API is unavailable:
  - Applies stricter fallback rate limiting (3 requests/hour vs normal 10)
  - Sets `X-Security-Degraded: captcha-unavailable` header
  - Sets fallback rate limit headers
- **Fail-closed behavior**: Blocks all requests with 503 when API unavailable
- **Score threshold**: `CAPTCHA_MIN_SCORE = 0.5` (reCAPTCHA v3 scores 0.0-1.0)
- **API timeout**: 5 seconds via `AbortController`
- **Skips in dev/test**: Bypasses verification in development and test environments
- **Graceful when unconfigured**: Logs warning and passes through if `RECAPTCHA_SECRET_KEY` not set
- **Fallback store cleanup**: `setInterval` at `RATE_LIMIT_CLEANUP_INTERVAL_MS` (1 minute)

---

## Docker Compose -- VERIFIED

**Finding: No Redis service in docker-compose.yml.** The compose file defines only:
- `db` (PostgreSQL 15)
- `backend` (Node.js API)
- `frontend` (Next.js)

No `REDIS_URL` environment variable is passed to the backend service. This means:
- Production is running in **in-memory rate limiting mode**
- Rate limits are process-local and reset on container restart
- No distributed rate limiting across multiple backend instances

---

## Checklist Verification

### Implementation
- [x] Redis client with retry logic -- **VERIFIED**: Exponential backoff, 5 max attempts, structured logging
- [x] Sliding window algorithm -- **VERIFIED**: Both Redis (sorted sets) and in-memory (timestamp arrays)
- [x] In-memory fallback -- **VERIFIED**: Automatic selection when REDIS_URL not configured
- [x] Fail-open behavior -- **VERIFIED**: Redis unavailable = allow request + degraded header
- [x] Rate limit headers -- **VERIFIED**: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
- [x] Automatic cleanup -- **VERIFIED**: 60-second interval for in-memory, EXPIRE command for Redis

### Production Readiness
- [ ] Redis deployed (Memorystore) -- **NOT DEPLOYED**: No Redis service in docker-compose
- [ ] Connection string in secrets -- **NOT CONFIGURED**: No REDIS_URL in environment
- [ ] TLS enabled -- **NOT CONFIGURED**: No TLS options in Redis client
- [ ] Memory limits configured -- **N/A**: No Redis deployed
- [ ] Monitoring alerts -- **NOT CONFIGURED**: No alerting infrastructure found

### Testing
- [ ] Test Redis mode -- **NOT TESTED**: No test files for rateLimiter.ts
- [ ] Test in-memory mode -- **NOT TESTED**
- [ ] Test failover behavior -- **NOT TESTED**
- [ ] Load test rate limits -- **NOT DONE**

---

## Questions Answered

### 1. Is Redis deployed in production?
**No.** The docker-compose.yml has no Redis service, and no `REDIS_URL` is passed to the backend. The application is running entirely on in-memory rate limiting. This is sufficient for single-instance deployments but will not work correctly when scaling to multiple backend instances.

### 2. What are the Redis resource limits?
**N/A.** Redis is not deployed. When deployed, the sorted set approach uses O(n) memory per client per limiter, where n = maxRequests. For the current configuration: worst case per client = 200 entries (default limiter) * 4 limiters = 800 sorted set members per IP.

### 3. Is Redis persistence enabled?
**N/A.** Redis is not deployed. For rate limiting only, persistence is not needed -- data loss on restart is acceptable since rate limit windows will naturally refill.

### 4. Are there Redis monitoring alerts?
**No.** No monitoring or alerting infrastructure was found in the codebase. The Redis client logs connection events via the structured logger, but no external monitoring is configured.

### 5. Should we use Redis for other caching?
**Yes, when deployed.** The codebase already has an in-memory cache system (`packages/backend/src/utils/cache.ts` referenced in `admin.ts` via `cacheClear()` and `getCacheStats()`). Good candidates for Redis caching:
- **Search results**: Common state/city/specialty combinations
- **Provider details**: Cache by NPI (read-heavy, write-rare)
- **Cities/specialties lists**: Near-static reference data
- **Session data**: If authentication is added

---

## Issues

1. **No Redis in production**: The dual-mode system is well-implemented but running entirely in fallback mode. Rate limits are per-process and reset on restart.

2. **CAPTCHA fallback store is in-memory**: The CAPTCHA fallback rate limiting (`fallbackStore`) uses a process-local Map. If the backend scales to multiple instances without Redis, the fallback limits are ineffective.

3. **No Redis in docker-compose**: Developers cannot test Redis mode locally without manually adding a Redis service or running Redis separately.

4. **No TLS configuration**: The Redis client does not configure TLS options. When deploying to Google Cloud Memorystore, in-transit encryption may be required.

---

## Recommendations

1. **Add Redis to docker-compose**: Add a Redis service for local development and testing:
   ```yaml
   redis:
     image: redis:7-alpine
     ports:
       - "6379:6379"
   ```
   And add `REDIS_URL: redis://redis:6379` to the backend environment.

2. **Deploy Redis for production**: Use Google Cloud Memorystore (Basic tier, 1GB) for production. Configure `REDIS_URL` as a secret in Cloud Run/GKE.

3. **Add TLS support**: Add TLS options to the Redis client configuration for production connections:
   ```typescript
   tls: process.env.REDIS_TLS === 'true' ? {} : undefined
   ```

4. **Write rate limiter tests**: The sliding window algorithm has well-defined behavior that is straightforward to test. Mock the Redis client for Redis mode tests; test in-memory mode directly.

5. **Move to Redis-backed caching**: Replace the in-memory cache (`cache.ts`) with Redis-backed caching to share cached data across instances and survive restarts.

6. **Add Redis health to admin endpoint**: The admin health endpoint already reports cache stats. Add Redis connection status from `getRedisStatus()`.
