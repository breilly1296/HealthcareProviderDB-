# 31 - Redis Caching and Rate Limiting

## Overview

The application uses a dual-mode approach for rate limiting: Redis for distributed deployments and an in-memory fallback for single-instance or development environments. The system automatically falls back to in-memory when Redis is unavailable.

## Dual-Mode Architecture

### Redis Mode (Distributed)
Activated when `REDIS_URL` is set in the environment. Suitable for multi-instance deployments where rate limit state must be shared across servers.

### In-Memory Mode (Fallback)
Used when `REDIS_URL` is not set or when Redis becomes unavailable at runtime. Suitable for single-instance deployments and local development.

## Redis Client Configuration

The Redis client is created using `ioredis` with the following settings:

- **Lazy connect**: Connection is established on first use, not at import time
- **Max retries**: 3 attempts before giving up on a command
- **Retry delay**: 100ms between retry attempts
- **Reconnect strategy**: Automatic reconnection with exponential backoff

## Rate Limiting Algorithm

### Redis: Sliding Window with Sorted Sets

The sliding window algorithm uses Redis sorted sets to track requests per key within a time window:

1. **`ZREMRANGEBYSCORE`** - Remove all entries older than the window start time
2. **`ZADD`** - Add the current request timestamp as both score and member
3. **`ZCARD`** - Count the remaining entries (current request count in window)
4. **`EXPIRE`** - Set a TTL on the key for automatic cleanup

This provides accurate per-second granularity without the boundary issues of fixed windows.

### In-Memory: Simple Counter with Reset

The in-memory implementation uses a `Map<string, { count: number, resetAt: number }>`:

- Each key tracks a request count and a reset timestamp
- When `resetAt` is reached, the counter resets to zero
- A cleanup interval runs every 60 seconds to remove expired entries from the map

## Fail-Open Behavior

When Redis is unavailable (connection error, timeout, or command failure):

- Requests are **allowed** to proceed
- The response includes an `X-RateLimit-Status: degraded` header
- The failure is logged for monitoring
- The system continues to attempt Redis reconnection in the background

This ensures that a Redis outage does not cause a complete service disruption.

## Rate Limit Tiers

| Tier          | Limit        | Window  | Applied To                          |
|---------------|--------------|---------|-------------------------------------|
| Default       | 200 requests | 1 hour  | All endpoints not otherwise limited |
| Search        | 100 requests | 1 hour  | GET /providers/search, GET /locations/search |
| Verification  | 10 requests  | 1 hour  | POST /verify                        |
| Vote          | 10 requests  | 1 hour  | POST /:id/vote                      |

Rate limit headers are included in all responses:

- `X-RateLimit-Limit` - Maximum requests allowed in the window
- `X-RateLimit-Remaining` - Requests remaining in the current window
- `X-RateLimit-Reset` - Unix timestamp when the window resets

When the limit is exceeded, the response is `429 Too Many Requests` with a `Retry-After` header.

## Future Enhancements

- **Search result caching** - Cache frequently searched queries with short TTLs to reduce database load
- **Provider detail caching** - Cache individual provider records to speed up detail page loads
- **TTL-based expiration** - Fine-grained cache invalidation based on data freshness requirements
- **Cache warming** - Pre-populate cache for popular queries during off-peak hours
