---
tags:
  - infrastructure
  - caching
  - scaling
type: prompt
priority: 2
---

# Redis Caching & Rate Limiting Review

## Files to Review
- `packages/backend/src/lib/redis.ts` (Redis client setup)
- `packages/backend/src/middleware/rateLimiter.ts` (rate limiting)
- `packages/backend/src/middleware/captcha.ts` (fallback rate limiting)
- `docker-compose.yml` (Redis service)

## Architecture: Dual-Mode Rate Limiting

The rate limiting system supports two modes:

### 1. Redis Mode (Distributed)
- **When:** `REDIS_URL` environment variable is set
- **Use Case:** Production with multiple instances
- **Algorithm:** Sliding window with sorted sets
- **State:** Shared across all instances

### 2. In-Memory Mode (Fallback)
- **When:** `REDIS_URL` not set or Redis unavailable
- **Use Case:** Development or single-instance deployment
- **Algorithm:** Simple counter with cleanup
- **State:** Process-local (not shared)

## Redis Client Setup

```typescript
// packages/backend/src/lib/redis.ts
import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function initRedis(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('[Redis] REDIS_URL not configured, using in-memory rate limiting');
    return null;
  }

  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  return redisClient;
}
```

## Rate Limiting Implementation

### Redis Rate Limiter
```typescript
// Sliding window algorithm using sorted sets
const redisKey = `ratelimit:${name}:${clientIp}`;
const now = Date.now();
const windowStart = now - windowMs;

// Transaction:
// 1. Remove entries outside window
// 2. Add current request
// 3. Count requests in window
// 4. Set TTL for cleanup
const multi = redis.multi();
multi.zremrangebyscore(redisKey, 0, windowStart);
multi.zadd(redisKey, now, `${now}-${randomId}`);
multi.zcard(redisKey);
multi.expire(redisKey, Math.ceil(windowMs / 1000) + 1);
```

### In-Memory Rate Limiter
```typescript
// Simple counter with periodic cleanup
const store: Map<string, { count: number; resetAt: number }> = new Map();

// Cleanup every minute
setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (entry.resetAt < now) store.delete(key);
  });
}, 60000);
```

## Fail-Open Behavior

When Redis becomes unavailable during operation:

```typescript
if (!redis || !isRedisConnected()) {
  console.warn(`[RateLimit] Redis unavailable, allowing request (fail-open)`);
  res.setHeader('X-RateLimit-Status', 'degraded');
  next(); // Allow request through
  return;
}
```

**Why Fail-Open:**
- Prioritizes availability over strict rate limiting
- Prevents Redis issues from causing outages
- Degraded mode indicated in response headers

## Configuration

### Environment Variables
| Variable | Required | Purpose |
|----------|----------|---------|
| `REDIS_URL` | No | Redis connection string |

### Example Values
```bash
# Local development
REDIS_URL=redis://localhost:6379

# Cloud Memorystore
REDIS_URL=redis://10.0.0.1:6379

# With authentication
REDIS_URL=redis://:password@host:6379
```

## Pre-Configured Rate Limiters

| Name | Limit | Window | Use Case |
|------|-------|--------|----------|
| `defaultRateLimiter` | 200 req | 1 hour | General API |
| `searchRateLimiter` | 100 req | 1 hour | Search endpoints |
| `verificationRateLimiter` | 10 req | 1 hour | Verification submission |
| `voteRateLimiter` | 10 req | 1 hour | Voting |

## Monitoring

### Redis Health Check
```bash
# Check connection
redis-cli -u $REDIS_URL ping

# Check rate limit keys
redis-cli -u $REDIS_URL keys "ratelimit:*"

# Check specific IP's requests
redis-cli -u $REDIS_URL zrange "ratelimit:verification:1.2.3.4" 0 -1
```

### Log Patterns
```
# Redis mode selected
[RateLimit] "verification" using Redis (distributed mode)

# In-memory mode selected
[RateLimit] "verification" using in-memory (single-instance mode)

# Redis unavailable (fail-open)
[RateLimit:verification] Redis unavailable, allowing request (fail-open)

# Redis error
[RateLimit:verification] Redis error, allowing request: Connection refused
```

## Checklist

### Implementation
- [x] Redis client with retry logic
- [x] Sliding window algorithm
- [x] In-memory fallback
- [x] Fail-open behavior
- [x] Rate limit headers
- [x] Automatic cleanup

### Production Readiness
- [ ] Redis deployed (Memorystore)
- [ ] Connection string in secrets
- [ ] TLS enabled
- [ ] Memory limits configured
- [ ] Monitoring alerts

### Testing
- [ ] Test Redis mode
- [ ] Test in-memory mode
- [ ] Test failover behavior
- [ ] Load test rate limits

## Questions to Ask

1. **Is Redis deployed in production?**
   - Memorystore?
   - Self-hosted?
   - Or using in-memory only?

2. **What are the Redis resource limits?**
   - Memory allocation
   - Max connections

3. **Is Redis persistence enabled?**
   - For rate limiting, persistence is optional
   - Data can be lost on restart

4. **Are there Redis monitoring alerts?**
   - Connection failures
   - Memory usage
   - Latency

5. **Should we use Redis for other caching?**
   - Search results?
   - Provider details?
   - Session data?

## Future Considerations

### Additional Caching (Not Implemented)
- **Search results:** Cache common searches
- **Provider details:** Cache by NPI
- **Cities list:** Cache by state

### Cache Invalidation
- TTL-based expiration
- Manual invalidation on data updates

## Output Format

```markdown
# Redis & Caching

**Last Updated:** [Date]
**Mode:** Redis | In-Memory

## Configuration
- REDIS_URL: [Configured/Not Configured]
- Redis Provider: [Memorystore/Self-hosted/None]
- TLS: [Enabled/Disabled]

## Rate Limiters
| Limiter | Limit | Window | Mode |
|---------|-------|--------|------|
| default | 200/hr | 1 hour | Redis |
| search | 100/hr | 1 hour | Redis |
| verify | 10/hr | 1 hour | Redis |
| vote | 10/hr | 1 hour | Redis |

## Health Status
- Redis connected: [Yes/No]
- Failover events (24h): X
- Current keys: X

## Issues
[List any issues]

## Recommendations
[List recommendations]
```
