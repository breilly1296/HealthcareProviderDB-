# VerifyMyProvider Redis Caching Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

Redis is used optionally for distributed rate limiting across multiple Cloud Run instances. The system operates in dual-mode: Redis when available, in-memory fallback when not. This enables horizontal scaling while maintaining functionality in simpler deployments.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dual-Mode Rate Limiting                   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              REDIS_URL configured?                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                     │                                        │
│           ┌─────────┴─────────┐                             │
│           │                   │                             │
│           ▼                   ▼                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   Redis Mode    │  │ In-Memory Mode  │                  │
│  │  (Distributed)  │  │(Single Instance)│                  │
│  │                 │  │                 │                  │
│  │ • Sorted Sets   │  │ • Map counters  │                  │
│  │ • Sliding window│  │ • Fixed window  │                  │
│  │ • Shared state  │  │ • Local state   │                  │
│  │ • Auto-expire   │  │ • Manual cleanup│                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                              │
│  Graceful Degradation: Redis failure → In-memory fallback   │
└─────────────────────────────────────────────────────────────┘
```

---

## Redis Configuration

### Connection Setup

```typescript
// packages/backend/src/lib/redis.ts

import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('[Redis] Not configured - using in-memory rate limiting');
    return null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('[Redis] Max retries exceeded');
          return null;  // Stop retrying
        }
        return Math.min(times * 100, 3000);  // Exponential backoff
      },
      enableOfflineQueue: false,  // Fail fast when disconnected
      connectTimeout: 5000,
      commandTimeout: 1000
    });

    redis.on('connect', () => {
      console.log('[Redis] Connected');
    });

    redis.on('error', (error) => {
      console.error('[Redis] Error:', error.message);
    });

    redis.on('close', () => {
      console.warn('[Redis] Connection closed');
    });

    return redis;
  } catch (error) {
    console.error('[Redis] Failed to initialize:', error);
    return null;
  }
}

export function isRedisAvailable(): boolean {
  return redis?.status === 'ready';
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | - | Redis connection string |

### Connection String Format

```
redis://[:password@]host:port[/database]
redis://user:password@redis.example.com:6379/0
```

---

## Rate Limiting Implementation

### Redis Mode (Sliding Window)

```typescript
// packages/backend/src/middleware/rateLimiter.ts

async function checkRedisRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis || !isRedisAvailable()) {
    return checkInMemoryRateLimit(key, limit, windowMs);
  }

  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `ratelimit:${key}`;

  try {
    // Use sorted set for sliding window
    const multi = redis.multi();

    // Remove old entries
    multi.zremrangebyscore(redisKey, 0, windowStart);

    // Add current request
    multi.zadd(redisKey, now, `${now}-${Math.random()}`);

    // Count requests in window
    multi.zcard(redisKey);

    // Set expiry (cleanup after window)
    multi.pexpire(redisKey, windowMs);

    const results = await multi.exec();

    if (!results) {
      throw new Error('Redis transaction failed');
    }

    const count = results[2]?.[1] as number;

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: now + windowMs,
      mode: 'redis'
    };
  } catch (error) {
    console.error('[RateLimit] Redis error, falling back:', error);
    return checkInMemoryRateLimit(key, limit, windowMs);
  }
}
```

### In-Memory Mode (Fixed Window)

```typescript
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

// Cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of inMemoryStore) {
    if (value.resetAt < now) {
      inMemoryStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function checkInMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();

  let entry = inMemoryStore.get(key);

  // Create or reset window
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    inMemoryStore.set(key, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
    mode: 'memory'
  };
}
```

---

## Response Headers

### Normal Operation

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1706745600
```

### Degraded Mode (Redis unavailable)

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1706745600
X-RateLimit-Status: degraded
```

---

## Use Cases

### 1. Single Instance (Development)

```
┌──────────────┐     ┌──────────────┐
│  Cloud Run   │────→│  PostgreSQL  │
│  (1 instance)│     │              │
└──────────────┘     └──────────────┘
     │
     │ In-memory rate limiting
     │ (No Redis needed)
```

### 2. Multi-Instance (Production)

```
                    ┌──────────────┐
                    │    Redis     │
                    │   Memorystore│
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │Cloud Run │    │Cloud Run │    │Cloud Run │
    │Instance 1│    │Instance 2│    │Instance 3│
    └──────────┘    └──────────┘    └──────────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Cloud SQL   │
                    │  PostgreSQL  │
                    └──────────────┘
```

---

## GCP Memorystore Setup

### Create Instance

```bash
# Create Redis instance
gcloud redis instances create verifymyprovider-redis \
  --region=us-central1 \
  --tier=basic \
  --size=1 \
  --redis-version=redis_6_x

# Get connection info
gcloud redis instances describe verifymyprovider-redis \
  --region=us-central1 \
  --format="value(host,port)"
```

### Connect from Cloud Run

```bash
# Create VPC connector
gcloud compute networks vpc-access connectors create verifymyprovider-connector \
  --region=us-central1 \
  --network=default \
  --range=10.8.0.0/28

# Update Cloud Run service
gcloud run services update verifymyprovider-backend \
  --vpc-connector=verifymyprovider-connector \
  --set-env-vars=REDIS_URL=redis://REDIS_IP:6379
```

---

## Future Caching Opportunities

### Provider Data Caching

```typescript
// Not implemented yet - potential optimization

async function getCachedProvider(npi: string): Promise<Provider | null> {
  const redis = getRedis();
  if (!redis) return null;

  const cached = await redis.get(`provider:${npi}`);
  if (cached) {
    return JSON.parse(cached);
  }

  const provider = await prisma.provider.findUnique({ where: { npi } });
  if (provider) {
    await redis.setex(`provider:${npi}`, 300, JSON.stringify(provider));  // 5 min TTL
  }

  return provider;
}
```

### Search Results Caching

```typescript
// Not implemented yet - potential optimization

async function getCachedSearch(query: SearchQuery): Promise<Provider[] | null> {
  const redis = getRedis();
  if (!redis) return null;

  const key = `search:${JSON.stringify(query)}`;
  const cached = await redis.get(key);

  if (cached) {
    return JSON.parse(cached);
  }

  return null;
}
```

---

## Monitoring

### Health Check

```typescript
// packages/backend/src/routes/admin.ts

router.get('/health', adminAuthMiddleware, async (req, res) => {
  const redis = getRedis();

  const health = {
    database: await checkDatabaseHealth(),
    redis: redis && isRedisAvailable() ? 'connected' : 'unavailable'
  };

  res.json({ success: true, data: health });
});
```

### Metrics

| Metric | Description |
|--------|-------------|
| `redis_commands_total` | Total Redis commands |
| `redis_latency_ms` | Command latency |
| `ratelimit_mode` | redis or memory |
| `ratelimit_fallbacks` | Fallback count |

---

## Recommendations

### Immediate
- ✅ Dual-mode rate limiting works well
- Add Redis health to /health endpoint
- Monitor fallback frequency

### Future
1. **Add caching**
   - Cache provider lookups
   - Cache popular searches

2. **Redis Cluster**
   - For higher availability
   - For larger deployments

3. **Cache invalidation**
   - Invalidate on provider update
   - Invalidate on verification

---

## Conclusion

Redis integration is **well-implemented**:

- ✅ Optional dependency (graceful without it)
- ✅ Sliding window for accurate limits
- ✅ Automatic fallback on failure
- ✅ Clear degradation headers
- ✅ Ready for horizontal scaling

The dual-mode approach allows simple development while supporting production scale.
