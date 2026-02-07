# Redis & Caching

**Last Updated:** 2026-02-07
**Mode:** Dual-Mode (Redis when `REDIS_URL` configured, In-Memory fallback)

---

## Table of Contents

1. [Configuration](#configuration)
2. [Architecture Overview](#architecture-overview)
3. [Redis Client Setup](#redis-client-setup)
4. [Rate Limiting System](#rate-limiting-system)
5. [Data Caching System](#data-caching-system)
6. [CAPTCHA Fallback Rate Limiting](#captcha-fallback-rate-limiting)
7. [Route-Level Rate Limiter Assignment](#route-level-rate-limiter-assignment)
8. [Response Headers](#response-headers)
9. [Health Monitoring](#health-monitoring)
10. [Docker / Infrastructure](#docker--infrastructure)
11. [Issues](#issues)
12. [Recommendations](#recommendations)

---

## Configuration

| Setting | Value | Source |
|---------|-------|--------|
| `REDIS_URL` | Not configured by default (commented out in `.env.example`) | `packages/backend/.env.example`, root `.env.example` |
| Redis Provider | None currently deployed | `docker-compose.yml` has no Redis service |
| TLS | Not configured | No TLS options passed to ioredis constructor |
| ioredis Version | `^5.9.2` | `packages/backend/package.json` |

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `REDIS_URL` | No | Not set | Redis connection string; enables distributed rate limiting and caching |

### Example Values

```bash
# Local development
REDIS_URL=redis://localhost:6379

# Google Cloud Memorystore
REDIS_URL=redis://10.0.0.3:6379

# With authentication
REDIS_URL=redis://:password@host:6379
```

**Source:** `packages/backend/.env.example` (lines 28-31)

---

## Architecture Overview

The system implements a **dual-mode architecture** across two independent subsystems: **rate limiting** and **data caching**. Both subsystems follow the same pattern:

1. Check if `REDIS_URL` is configured and Redis is connected
2. If yes, use Redis for shared/distributed state
3. If no, fall back to process-local in-memory storage
4. If Redis becomes unavailable mid-operation, **fail open** (allow requests, log warnings)

```
                    +-------------------+
                    |   Request Enters  |
                    +--------+----------+
                             |
                    +--------v----------+
                    |  Rate Limiter     |
                    |  (middleware)      |
                    +--------+----------+
                             |
              +--------------+--------------+
              |                             |
     +--------v---------+        +---------v--------+
     | Redis Connected? |  YES   | Redis Mode       |
     | (REDIS_URL set)  +------->| Sorted Set       |
     +--------+---------+        | Sliding Window   |
              | NO               +------------------+
     +--------v---------+
     | In-Memory Mode   |
     | Array-based      |
     | Sliding Window   |
     +------------------+
```

**Key design decision:** When Redis fails mid-request, the system does **not** fall back to in-memory limiting. Instead, it allows the request through (fail-open) to avoid inconsistent state between the two storage backends. This is explicitly documented in the rate limiter header comment:

> "The in-memory limiter is NOT used as fallback mid-request to avoid inconsistent state."

**Source:** `packages/backend/src/middleware/rateLimiter.ts` (lines 20-24)

---

## Redis Client Setup

**File:** `packages/backend/src/lib/redis.ts`

The Redis client uses the **singleton pattern** -- one connection per process, created on first access.

### Key Implementation Details

```typescript
// Singleton state
let redisClient: Redis | null = null;
let isConnected = false;
let connectionAttempted = false;
```

The `connectionAttempted` flag ensures the connection is only attempted once per process lifecycle, even if the first attempt fails.

### Connection Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `maxRetriesPerRequest` | 3 | Max retries per individual Redis command |
| `connectTimeout` | 10,000 ms | TCP connection timeout |
| `commandTimeout` | 5,000 ms | Per-command execution timeout |
| `enableReadyCheck` | true | Waits for Redis `INFO` check before accepting commands |
| `lazyConnect` | false | Connects immediately on client creation |

### Retry Strategy

Exponential backoff with a maximum of 5 reconnection attempts:

```typescript
retryStrategy: (times) => {
  if (times > 5) {
    logger.error({ attempts: times }, 'Redis max reconnection attempts reached, giving up');
    return null; // Stop retrying
  }
  const delay = Math.min(times * 200, 3000);
  return delay;
}
```

This produces delays of: 200ms, 400ms, 600ms, 800ms, 1000ms (capped at 3000ms). After 5 failed attempts, the client stops retrying and the system operates in degraded mode.

### Event Handling

The module tracks six connection events:

| Event | Action |
|-------|--------|
| `connect` | Logs TCP connection established |
| `ready` | Sets `isConnected = true`, logs ready state |
| `error` | Sets `isConnected = false`, logs error |
| `close` | Sets `isConnected = false`, logs warning |
| `reconnecting` | Logs reconnection attempt with delay |
| `end` | Sets `isConnected = false`, logs connection ended |

### Exported Functions

| Function | Return Type | Purpose |
|----------|-------------|---------|
| `getRedisClient()` | `Redis \| null` | Get or create the singleton; returns null if `REDIS_URL` not set |
| `isRedisConnected()` | `boolean` | True only if connected AND `status === 'ready'` |
| `getRedisStatus()` | `{ configured, connected, status }` | Diagnostic info for health checks |
| `closeRedisConnection()` | `Promise<void>` | Graceful shutdown with `quit()`, fallback to `disconnect()` |

### Graceful Shutdown

```typescript
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();       // Graceful: waits for pending commands
    } catch (error) {
      redisClient.disconnect();       // Forced: immediate close
    }
    redisClient = null;
    isConnected = false;
    connectionAttempted = false;       // Allows reconnection if process restarts
  }
}
```

**Note:** `closeRedisConnection()` is exported but is **not currently called** during the application's shutdown sequence in `packages/backend/src/index.ts`. The shutdown handler (lines 204-234) only closes the HTTP server and disconnects Prisma. This means Redis connections may not be cleanly closed on SIGINT/SIGTERM.

---

## Rate Limiting System

**File:** `packages/backend/src/middleware/rateLimiter.ts`

### Pre-Configured Rate Limiters

| Name | Limit | Window | Use Case |
|------|-------|--------|----------|
| `defaultRateLimiter` | 200 req | 1 hour | General API routes, applied globally via `app.use()` |
| `searchRateLimiter` | 100 req | 1 hour | Search endpoints (`/providers/search`, `/plans/search`, `/locations/search`) |
| `verificationRateLimiter` | 10 req | 1 hour | Verification submission (`POST /verify`) |
| `voteRateLimiter` | 10 req | 1 hour | Voting (`POST /verify/:id/vote`) |

### Algorithm: Sliding Window

Both Redis and in-memory implementations use the **sliding window** algorithm rather than fixed windows. This prevents the "boundary burst" vulnerability where a user could send `maxRequests` at the end of one window and `maxRequests` at the start of the next, effectively doubling their allowed rate.

#### Redis Implementation (Sorted Sets)

Uses a Redis transaction (`MULTI/EXEC`) with four atomic operations:

```typescript
const redisKey = `ratelimit:${name}:${clientIp}`;
const now = Date.now();
const windowStart = now - windowMs;

const multi = redis.multi();
multi.zremrangebyscore(redisKey, 0, windowStart);          // 1. Remove expired entries
multi.zadd(redisKey, now, `${now}-${randomId}`);            // 2. Add current request
multi.zcard(redisKey);                                       // 3. Count in window
multi.expire(redisKey, Math.ceil(windowMs / 1000) + 1);    // 4. Set TTL for cleanup
```

**Key format:** `ratelimit:<limiter-name>:<client-ip>`
**Member format:** `<timestamp>-<random-7-char-alphanumeric>` (ensures uniqueness for concurrent requests)

The `+1` second on the expire ensures the key outlives the window to prevent race conditions during cleanup.

#### In-Memory Implementation (Array-based)

Stores timestamps in a `Map<string, number[]>` per limiter, per client:

```typescript
const memoryStores: Map<string, SlidingWindowStore> = new Map();  // limiter -> clients
type SlidingWindowStore = Map<string, number[]>;                   // client -> timestamps
```

On each request:
1. Filter timestamps to keep only those within `windowStart..now`
2. Count remaining timestamps
3. If under limit, push current `now` and allow
4. If at/over limit, return 429

**Memory trade-off:** O(n) per client where n = maxRequests. For the strictest limiter (10 req/hr), this is 10 timestamps per IP. For the default limiter (200 req/hr), up to 200 timestamps per IP.

### Periodic Cleanup (In-Memory)

A `setInterval` runs every 60 seconds to clean up expired entries:

```typescript
setInterval(() => {
  const now = Date.now();
  memoryStores.forEach((store, storeName) => {
    const maxWindowMs = 60 * 60 * 1000; // Conservative 1 hour max
    store.forEach((timestamps, clientKey) => {
      const validTimestamps = timestamps.filter(ts => ts > now - maxWindowMs);
      if (validTimestamps.length === 0) {
        store.delete(clientKey);
      } else if (validTimestamps.length < timestamps.length) {
        store.set(clientKey, validTimestamps);
      }
    });
  });
}, 60000);
```

**Source:** `packages/backend/src/middleware/rateLimiter.ts` (lines 88-108)

### Fail-Open Behavior

When Redis is unavailable during a request that was configured for Redis mode:

```typescript
if (!redis || !isRedisConnected()) {
  logger.warn({ limiter: name }, 'Rate limiter Redis unavailable, allowing request (fail-open)');
  res.setHeader('X-RateLimit-Status', 'degraded');
  next();
  return;
}
```

This also applies when the Redis `MULTI/EXEC` transaction fails:

```typescript
if (!results) {
  logger.warn({ limiter: name }, 'Rate limiter Redis transaction failed, allowing request');
  res.setHeader('X-RateLimit-Status', 'degraded');
  next();
  return;
}
```

And in the catch block for Redis errors:

```typescript
catch (error) {
  logger.error({ limiter: name, error }, 'Rate limiter Redis error, allowing request');
  res.setHeader('X-RateLimit-Status', 'degraded');
  next();
}
```

All three failure paths set `X-RateLimit-Status: degraded` to signal the condition to monitoring systems and downstream consumers.

### Auto-Selection Factory

The `createRateLimiter()` factory function automatically selects the implementation:

```typescript
export function createRateLimiter(options: RateLimiterOptions): RateLimiterMiddleware {
  const redis = getRedisClient();
  if (redis) {
    return createRedisRateLimiter(options);
  }
  return createInMemoryRateLimiter(options);
}
```

Mode selection is logged once per limiter name to avoid log spam. A `limiterModes` map tracks which mode was selected for each named limiter.

### Customization Options

The `RateLimiterOptions` interface supports:

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `windowMs` | `number` | Required | Time window in milliseconds |
| `maxRequests` | `number` | Required | Max requests per window |
| `name` | `string` | `'unnamed'` | Used in Redis key prefix and logging |
| `message` | `string` | Generic 429 message | Custom error message for rate-limited responses |
| `keyGenerator` | `(req) => string` | `req.ip` | Custom client identifier (e.g., API key, user ID) |
| `skip` | `(req) => boolean` | `() => false` | Skip rate limiting for specific requests |

---

## Data Caching System

**File:** `packages/backend/src/utils/cache.ts`

In addition to rate limiting, the project implements a general-purpose **data caching layer** that uses the same dual-mode Redis/in-memory pattern.

### Cache Configuration

| Setting | Value |
|---------|-------|
| Default TTL | 300 seconds (5 minutes) |
| Key prefix | `cache:` (all keys) |
| Search prefix | `search:` (within the `cache:` namespace) |
| Cleanup interval | 60 seconds |

### Cache Operations

| Function | Purpose |
|----------|---------|
| `cacheGet<T>(key)` | Retrieve cached value; tries Redis first, falls back to memory |
| `cacheSet<T>(key, value, ttlSeconds?)` | Store value; writes to Redis if available, otherwise memory |
| `cacheDelete(key)` | Delete from both Redis and memory |
| `cacheDeletePattern(pattern)` | Delete by pattern using Redis `SCAN` (production-safe, not `KEYS`) |
| `cacheClear()` | Clear all cache entries from both stores |
| `getCacheStats()` | Return hit/miss/set/delete counts and current mode |
| `resetCacheStats()` | Reset statistics counters |

### Search Result Caching

The provider search endpoint (`GET /api/v1/providers/search`) uses caching with normalized keys:

```typescript
// packages/backend/src/routes/providers.ts, lines 217-276
const cacheKey = generateSearchCacheKey({
  state, city, cities, zipCode, specialty,
  specialtyCategory, name, npi, entityType, page, limit,
});

const cachedResult = await cacheGet<CachedSearchResult>(cacheKey);
if (cachedResult) {
  res.setHeader('X-Cache', 'HIT');
  res.json({ success: true, data: cachedResult });
  return;
}

// ... query database ...

if (result.providers.length > 0) {
  await cacheSet(cacheKey, responseData, 300); // 5 minute TTL
}
```

**Key generation** (`generateSearchCacheKey`) normalizes all input:
- Lowercases and trims string values
- Orders components deterministically: `search:<state>:<city>:<specialty>:<page>:<limit>`
- Additional parameters (zip, health system, name, NPI, entity type, plan ID) are hashed using a simple 32-bit hash function

### Cache Invalidation

Search cache is invalidated when a new verification is submitted:

```typescript
// packages/backend/src/routes/verify.ts, lines 73-76
invalidateSearchCache().catch((err) => {
  logger.warn({ err }, 'Failed to invalidate search cache after verification');
});
```

This calls `cacheDeletePattern('search:*')` which uses Redis `SCAN` (not `KEYS`) for production safety, iterating with `COUNT 100` per scan iteration.

### Health Endpoint Integration

Cache statistics are exposed via the `/health` endpoint:

```typescript
// packages/backend/src/index.ts, lines 94-117
cache: {
  hits: cacheStats.hits,
  misses: cacheStats.misses,
  size: cacheStats.size,
  mode: cacheStats.mode,
  hitRate: ((hits / (hits + misses)) * 100).toFixed(1) + '%',
}
```

---

## CAPTCHA Fallback Rate Limiting

**File:** `packages/backend/src/middleware/captcha.ts`

The CAPTCHA middleware implements its own separate rate limiting specifically for when Google's reCAPTCHA API becomes unavailable. This is independent of the main rate limiting system.

### Configuration

| Setting | Value | Source |
|---------|-------|--------|
| Fallback max requests | 3 per window | `CAPTCHA_FALLBACK_MAX_REQUESTS` constant |
| Fallback window | 1 hour | `CAPTCHA_FALLBACK_WINDOW_MS` constant |
| Cleanup interval | 1 minute | `RATE_LIMIT_CLEANUP_INTERVAL_MS` constant |
| Fail mode | `open` (default) or `closed` | `CAPTCHA_FAIL_MODE` env var |

**Source:** `packages/backend/src/config/constants.ts`

### How It Works

When Google's reCAPTCHA API fails (network error, timeout, outage) and `CAPTCHA_FAIL_MODE=open`:

1. The request is allowed through, but with a much stricter rate limit (3/hour vs the normal 10/hour verification limit)
2. A simple fixed-window counter tracks requests per IP
3. Response headers signal the degraded state:
   - `X-Security-Degraded: captcha-unavailable`
   - `X-Fallback-RateLimit-Limit`
   - `X-Fallback-RateLimit-Remaining`
   - `X-Fallback-RateLimit-Reset`

This fallback store is **always in-memory** (not Redis-backed), using a `Map<string, { count: number; resetAt: number }>`.

---

## Route-Level Rate Limiter Assignment

### Global Application Level

| Limiter | Scope | Source |
|---------|-------|--------|
| `defaultRateLimiter` (200/hr) | All routes below this middleware | `packages/backend/src/index.ts` line 139 |

The health check endpoint (`/health`) is registered **before** the default rate limiter, so monitoring tools are never blocked.

### Provider Routes (`/api/v1/providers`)

**File:** `packages/backend/src/routes/providers.ts`

| Endpoint | Limiter | Notes |
|----------|---------|-------|
| `GET /search` | `searchRateLimiter` (100/hr) | Also uses data caching (5 min TTL) |
| `GET /cities` | `defaultRateLimiter` (200/hr) | |
| `GET /:npi/colocated` | `defaultRateLimiter` (200/hr) | |
| `GET /:npi` | `defaultRateLimiter` (200/hr) | |

### Plan Routes (`/api/v1/plans`)

**File:** `packages/backend/src/routes/plans.ts`

| Endpoint | Limiter |
|----------|---------|
| `GET /search` | `searchRateLimiter` (100/hr) |
| `GET /grouped` | `defaultRateLimiter` (200/hr) |
| `GET /meta/issuers` | `defaultRateLimiter` (200/hr) |
| `GET /meta/types` | `defaultRateLimiter` (200/hr) |
| `GET /:planId/providers` | `searchRateLimiter` (100/hr) |
| `GET /:planId` | `defaultRateLimiter` (200/hr) |

### Verification Routes (`/api/v1/verify`)

**File:** `packages/backend/src/routes/verify.ts`

| Endpoint | Limiter | Additional Protection |
|----------|---------|----------------------|
| `POST /` | `verificationRateLimiter` (10/hr) | Honeypot + CAPTCHA |
| `POST /:id/vote` | `voteRateLimiter` (10/hr) | Honeypot + CAPTCHA |
| `GET /stats` | `defaultRateLimiter` (200/hr) | |
| `GET /recent` | `defaultRateLimiter` (200/hr) | |
| `GET /:npi/:planId` | `defaultRateLimiter` (200/hr) | |

### Location Routes (`/api/v1/locations`)

**File:** `packages/backend/src/routes/locations.ts`

| Endpoint | Limiter |
|----------|---------|
| `GET /search` | `searchRateLimiter` (100/hr) |
| `GET /health-systems` | `defaultRateLimiter` (200/hr) |
| `GET /stats/:state` | `defaultRateLimiter` (200/hr) |
| `GET /:locationId` | `defaultRateLimiter` (200/hr) |
| `GET /:locationId/providers` | `defaultRateLimiter` (200/hr) |

---

## Response Headers

### Rate Limiting Headers (Standard)

Set by all rate limiters on every response:

| Header | Value | Description |
|--------|-------|-------------|
| `X-RateLimit-Limit` | e.g., `200` | Maximum requests allowed in window |
| `X-RateLimit-Remaining` | e.g., `195` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp | When the window resets (seconds) |
| `Retry-After` | Seconds | Only set when rate limited (429) |

### Degraded Mode Headers

| Header | Value | Condition |
|--------|-------|-----------|
| `X-RateLimit-Status` | `degraded` | Redis unavailable, fail-open activated |
| `X-Security-Degraded` | `captcha-unavailable` | Google reCAPTCHA API unavailable |
| `X-Fallback-RateLimit-Limit` | `3` | CAPTCHA fallback limit |
| `X-Fallback-RateLimit-Remaining` | `0-3` | CAPTCHA fallback remaining |
| `X-Fallback-RateLimit-Reset` | Unix timestamp | CAPTCHA fallback window reset |

### Cache Headers

| Header | Value | Condition |
|--------|-------|-----------|
| `X-Cache` | `HIT` | Search result served from cache |
| `X-Cache` | `MISS` | Search result fetched from database |

---

## Health Monitoring

### Health Check Endpoint

`GET /health` returns cache statistics:

```json
{
  "status": "ok",
  "cache": {
    "hits": 42,
    "misses": 18,
    "size": 15,
    "mode": "memory",
    "hitRate": "70.0%"
  }
}
```

### Redis Health Check (Manual)

```bash
# Check connection
redis-cli -u $REDIS_URL ping

# Check rate limit keys
redis-cli -u $REDIS_URL keys "ratelimit:*"

# Check cache keys
redis-cli -u $REDIS_URL keys "cache:*"

# Check specific IP's rate limit window
redis-cli -u $REDIS_URL zrange "ratelimit:verification:1.2.3.4" 0 -1 WITHSCORES

# Check memory usage
redis-cli -u $REDIS_URL info memory
```

### Log Patterns to Monitor

```
# Redis mode selected at startup
Rate limiter using Redis (distributed mode)

# In-memory mode selected at startup
Rate limiter using in-memory (single-instance mode)

# Redis unavailable during operation (fail-open)
Rate limiter Redis unavailable, allowing request (fail-open)

# Redis transaction failure
Rate limiter Redis transaction failed, allowing request

# Redis command error
Rate limiter Redis error, allowing request

# Redis connection lifecycle
Redis TCP connection established
Redis ready - accepting commands
Redis error
Redis connection closed
Redis reconnecting
Redis max reconnection attempts reached, giving up

# Cache operations
Redis cache get failed, falling back to memory
Redis cache set failed, falling back to memory
Cache cleanup: removed expired entries
Cache pattern delete completed

# CAPTCHA fallback
CAPTCHA FAIL-OPEN: Allowing request with fallback rate limiting
CAPTCHA FAIL-OPEN: Fallback rate limit exceeded
```

### Request Logger Integration

The `requestLogger` middleware (`packages/backend/src/middleware/requestLogger.ts`) captures rate limit information from response headers and includes it in structured log output:

```typescript
{
  rateLimited: true,        // true when status is 429
  rateLimitInfo: {
    limit: 10,              // from X-RateLimit-Limit
    remaining: 0            // from X-RateLimit-Remaining
  }
}
```

The `getRequestStats()` function provides aggregated counts including `rateLimitedRequests`.

---

## Docker / Infrastructure

**File:** `docker-compose.yml`

The current `docker-compose.yml` defines three services:
1. `db` (PostgreSQL 15 Alpine)
2. `backend` (Express API)
3. `frontend` (Next.js)

**Redis is not included** in the Docker Compose configuration. The backend service does not set `REDIS_URL` in its environment block, meaning containerized deployments currently run in **in-memory mode only**.

---

## Issues

### 1. Redis Not in Docker Compose
The `docker-compose.yml` does not define a Redis service, and the backend container does not have `REDIS_URL` configured. This means local Docker development always uses in-memory mode.

### 2. Redis Connection Not Closed on Shutdown
The `closeRedisConnection()` function is exported from `packages/backend/src/lib/redis.ts` but is **never called** in the shutdown handler at `packages/backend/src/index.ts` (lines 204-237). The shutdown sequence only closes the HTTP server and disconnects Prisma. This could result in unclean Redis disconnections.

### 3. No TLS Configuration
The Redis client does not configure TLS options. When connecting to Google Cloud Memorystore or other cloud Redis instances that support in-transit encryption, connections would be unencrypted.

### 4. CAPTCHA Fallback is Always In-Memory
The CAPTCHA fallback rate limiter (`packages/backend/src/middleware/captcha.ts`) uses a simple in-memory `Map` and does not integrate with Redis. In a multi-instance deployment, each instance independently tracks fallback rate limits, meaning a user could potentially get `3 * N` requests through during a CAPTCHA outage (where N is the number of instances).

### 5. Rate Limiter Comparison Inconsistency
The Redis rate limiter checks `requestCount > maxRequests` (line 262), while the in-memory rate limiter checks `requestCount >= maxRequests` (line 163). This means the Redis implementation allows one extra request compared to the in-memory implementation. This is because the Redis implementation adds the current request to the sorted set before checking the count, so the count already includes the current request.

### 6. Cache Statistics Not Reset on Clear
The `cacheClear()` function resets `stats.size` to 0 but does not reset hit/miss/set/delete counters. The `resetCacheStats()` function exists but is not called by `cacheClear()`. This means cache statistics accumulate across the full process lifetime even through cache clears.

### 7. No Redis Readiness Check Before First Rate Limit
The Redis client uses `lazyConnect: false`, so it begins connecting immediately. However, the rate limiters are created at module load time (lines 329-367 in `rateLimiter.ts`), which calls `getRedisClient()`. If the module loads before Redis is fully connected, the client exists but `isRedisConnected()` returns false, causing the first few requests to fail-open until the `ready` event fires.

---

## Recommendations

### Short-Term (Development/Single Instance)

1. **Add Redis to Docker Compose** -- Add a Redis 7 Alpine service and set `REDIS_URL` in the backend environment for local development parity with production:
   ```yaml
   redis:
     image: redis:7-alpine
     ports:
       - "6379:6379"
     healthcheck:
       test: ["CMD", "redis-cli", "ping"]
   ```

2. **Call `closeRedisConnection()` in the shutdown handler** -- Add the Redis cleanup to the existing graceful shutdown sequence in `packages/backend/src/index.ts`.

3. **Fix the off-by-one in Redis rate limiter** -- Change `requestCount > maxRequests` to `requestCount > maxRequests` is actually correct since it counts after adding the current request. Both implementations should be documented to clarify the behavior.

### Medium-Term (Production Readiness)

4. **Deploy Google Cloud Memorystore** -- For the production Cloud Run deployment, provision a Memorystore for Redis instance in the same VPC as the Cloud Run service. Use a Basic tier (no HA needed for rate limiting since data is ephemeral).

5. **Enable TLS** -- Pass `tls: {}` in the ioredis constructor options when connecting to Memorystore with in-transit encryption.

6. **Add Redis to health check** -- Include `getRedisStatus()` output in the `/health` endpoint response so monitoring can detect Redis connectivity issues.

7. **Make CAPTCHA fallback Redis-aware** -- Integrate the CAPTCHA fallback rate limiter with the Redis client so it shares state across instances.

### Long-Term (Optimization)

8. **Cache provider detail pages** -- The `GET /providers/:npi` endpoint queries the database on every request. This is a candidate for Redis caching with a 5-10 minute TTL, invalidated on verification submission.

9. **Cache cities list by state** -- The `GET /providers/cities` endpoint returns relatively static data. A longer TTL (30-60 minutes) would reduce database load.

10. **Cache plan metadata** -- The `/plans/meta/issuers` and `/plans/meta/types` endpoints return slowly-changing data that could be cached for 15-30 minutes.

11. **Add monitoring alerts** -- Set up alerts for:
    - Redis connection failures (log pattern: `Redis error`)
    - High fail-open rate (log pattern: `fail-open`)
    - Cache hit rate dropping below threshold
    - Memory usage approaching limits

12. **Consider Redis persistence configuration** -- For rate limiting and caching, persistence (RDB/AOF) is optional since all data is ephemeral with TTLs. Disabling persistence reduces I/O and improves performance.

---

## Implementation Checklist

### Implemented
- [x] Redis client with singleton pattern and retry logic
- [x] Sliding window rate limiting (both Redis sorted sets and in-memory arrays)
- [x] In-memory fallback when Redis unavailable
- [x] Fail-open behavior with degraded headers
- [x] Rate limit response headers (Limit, Remaining, Reset, Retry-After)
- [x] Automatic cleanup of expired entries (both stores)
- [x] Data caching with dual-mode Redis/memory
- [x] Search result caching with normalized keys
- [x] Cache invalidation on verification submission
- [x] Pattern-based cache deletion using SCAN (not KEYS)
- [x] Cache statistics on health endpoint
- [x] CAPTCHA fallback rate limiting
- [x] Per-limiter mode logging (once per limiter)
- [x] Graceful Redis shutdown function

### Not Yet Implemented
- [ ] Redis deployed in production (Memorystore)
- [ ] Redis in Docker Compose for local development
- [ ] Redis connection string in Cloud Run secrets
- [ ] TLS for Redis connections
- [ ] Redis memory limits configured
- [ ] Monitoring alerts for Redis failures
- [ ] Redis status in health check endpoint
- [ ] `closeRedisConnection()` called during shutdown
- [ ] CAPTCHA fallback using Redis
- [ ] Provider detail caching
- [ ] Cities list caching
- [ ] Plan metadata caching
- [ ] Load testing of rate limits

---

## Questions for Operations Team

1. **Is Redis deployed in production?** Is Google Cloud Memorystore provisioned, or is the production Cloud Run service using in-memory mode only?

2. **What are the Redis resource limits?** Memory allocation and max connections for the Memorystore instance (if deployed).

3. **Is Redis persistence enabled?** For rate limiting and caching, persistence is not required. Data loss on Redis restart is acceptable since all entries have TTLs.

4. **Are there monitoring alerts?** Alerts for Redis connection failures, memory usage, and latency.

5. **Should additional data be cached?** Provider details, city lists, and plan metadata are candidates for Redis caching to reduce database query load.

6. **Is the current fail-open policy acceptable?** During Redis outages, all requests pass without rate limiting. The alternative (fail-closed) would block all traffic when Redis is down.
