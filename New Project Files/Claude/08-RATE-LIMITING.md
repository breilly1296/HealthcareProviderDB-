# Rate Limiting - VerifyMyProvider

## Overview

VerifyMyProvider implements a three-tier anti-abuse strategy. Tier 1 (rate limiting) and Tier 2 (CAPTCHA) are implemented. Tier 3 (account-based limits and anomaly detection) is planned for when user accounts are added.

---

## Tier 1: Rate Limiting (Implemented - January 2026)

### Architecture: Custom Dual-Mode Middleware

The rate limiter is a custom Express middleware that operates in one of two modes depending on whether a Redis connection is available:

| Mode | Condition | Storage | Scope | Consistency |
|---|---|---|---|---|
| **Redis mode** | `REDIS_URL` environment variable is set and connection succeeds | Redis sorted sets | Distributed (shared across all Cloud Run instances) | Strong |
| **In-memory mode** | `REDIS_URL` not set, or Redis connection fails | Process-local Map | Single instance only | Process-local |

The middleware automatically selects the mode at startup and falls back from Redis to in-memory if Redis becomes unavailable during operation.

---

### Sliding Window Algorithm

Both modes implement a **sliding window** rate limiting algorithm, which is more accurate than fixed-window and simpler than token bucket:

```
Time Window: 1 hour (3,600,000 ms)
Limit: 100 requests

At request time T:
  1. Remove all timestamps older than (T - 3,600,000ms)
  2. Count remaining timestamps
  3. If count < limit: ALLOW, add T to the set
  4. If count >= limit: REJECT with 429
```

This means the window "slides" with each request rather than resetting at fixed intervals. A user who made 99 requests between 2:00 and 2:30 cannot suddenly make 100 more at 3:01 -- they must wait until the oldest requests fall outside the window.

---

### Redis Mode Details

**Data structure**: Redis sorted sets with score = timestamp

**Key format**: `ratelimit:{limiterName}:{ipAddress}`

```
Key:    ratelimit:search:203.0.113.42
Score:  1706025600000 (timestamp in ms)
Member: 1706025600000-{random} (unique per request)
```

**Operations per request**:
1. `ZREMRANGEBYSCORE` -- Remove entries older than window start
2. `ZCARD` -- Count remaining entries
3. `ZADD` -- Add new entry (if under limit)
4. `EXPIRE` -- Set TTL on key (auto-cleanup)

All four operations are executed in a Redis pipeline (single round-trip) for performance.

**Fail-open behavior**: If Redis becomes unreachable during a request, the rate limiter:
- Allows the request through (fail-open)
- Sets the `X-RateLimit-Status: degraded` response header
- Logs the Redis connection failure
- Continues attempting Redis on subsequent requests

This ensures that a Redis outage does not cause a complete service outage.

---

### In-Memory Mode Details

**Data structure**: `Map<string, number[]>` where key is `{limiterName}:{ip}` and value is an array of timestamps.

```typescript
const store = new Map<string, number[]>();

// Cleanup interval: every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of store.entries()) {
    const filtered = timestamps.filter(t => now - t < windowMs);
    if (filtered.length === 0) {
      store.delete(key);
    } else {
      store.set(key, filtered);
    }
  }
}, 60_000);
```

**Periodic cleanup**: A 60-second interval sweeps the store and removes keys with no active timestamps. This prevents memory growth from stale entries.

**Limitations**:
- Process-local only -- each Cloud Run instance has its own counter
- If Cloud Run scales to multiple instances, the effective rate limit is multiplied by the number of instances
- State is lost on process restart
- Not suitable for strict rate limiting at scale (use Redis mode for production)

---

### Rate Limit Tiers

| Limiter Name | Limit | Window | Applied To |
|---|---|---|---|
| `verification` | 10 requests | 1 hour | POST /api/v1/verify |
| `vote` | 10 requests | 1 hour | POST /api/v1/verify/:id/vote |
| `search` | 100 requests | 1 hour | GET /api/v1/providers/search, GET /api/v1/plans/search, GET /api/v1/plans/:planId/providers |
| `default` | 200 requests | 1 hour | All other endpoints |

The `default` limiter is applied as global middleware. Specific limiters are applied at the route level and override the default for their specific routes.

---

### Response Headers

Every response includes rate limit headers (regardless of mode):

| Header | Value | Example |
|---|---|---|
| `X-RateLimit-Limit` | Maximum requests allowed in the window | `100` |
| `X-RateLimit-Remaining` | Requests remaining in the current window | `87` |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets | `1706029200` |
| `X-RateLimit-Status` | Only present when degraded (Redis failure) | `degraded` |

### 429 Response

When a rate limit is exceeded:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 1847
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706029200
Content-Type: application/json

{
  "success": false,
  "error": {
    "message": "Too many requests. Please try again later.",
    "code": "RATE_LIMIT_EXCEEDED",
    "statusCode": 429,
    "retryAfter": 1847
  }
}
```

The `Retry-After` header value is in seconds and indicates how long the client should wait before retrying. It is calculated as the time until the oldest request in the window expires.

---

## Tier 2: CAPTCHA (Partially Implemented)

### reCAPTCHA v3 Integration

reCAPTCHA v3 is integrated on the two most abuse-sensitive endpoints:

| Endpoint | CAPTCHA Required | Minimum Score |
|---|---|---|
| POST /api/v1/verify | Yes | 0.5 |
| POST /api/v1/verify/:id/vote | Yes | 0.5 |
| All other endpoints | No | -- |

### How It Works

1. **Frontend**: Loads reCAPTCHA v3 script, generates a token on form submission
2. **Backend**: Validates token with Google's reCAPTCHA API, checks the score
3. **Decision**: Score >= 0.5 passes, score < 0.5 is rejected

```typescript
// CAPTCHA verification flow
async function verifyCaptcha(token: string): Promise<{ success: boolean; score: number }> {
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY!,
      response: token,
    }),
  });

  const data = await response.json();
  return { success: data.success && data.score >= 0.5, score: data.score };
}
```

### Score Thresholds

| Score Range | Interpretation | Action |
|---|---|---|
| 0.9 - 1.0 | Very likely human | Allow |
| 0.5 - 0.8 | Probably human | Allow |
| 0.3 - 0.4 | Suspicious | Reject |
| 0.0 - 0.2 | Very likely bot | Reject |

### Fail-Open vs Fail-Closed Modes

The CAPTCHA middleware supports two failure modes:

| Mode | Behavior When Google API Is Unreachable |
|---|---|
| **Fail-open** | Allow the request but apply fallback rate limiting (3/hr) |
| **Fail-closed** | Reject the request with a 503 error |

Currently configured as **fail-open** with fallback rate limiting to avoid blocking legitimate users during Google API outages.

### Fallback Rate Limiting

When CAPTCHA verification cannot be performed (Google API down, token validation timeout), a stricter fallback rate limit of **3 requests per hour** is applied to the requesting IP. This is significantly lower than the normal 10/hr limit, providing additional protection without completely blocking access.

---

## Tier 3: Account-Based Limits (Future)

### Graduated Limits by User Tier

When user accounts are implemented (Phase 2/3), rate limits will be tied to authentication status:

| User Tier | Verification Limit | Search Limit | How to Achieve |
|---|---|---|---|
| Anonymous | 5/day | 100/hr | Default (no account) |
| Email verified | 20/day | 200/hr | Verify email address |
| Full account | 50/day | 500/hr | Complete registration |
| Premium ($4.99/mo) | Unlimited | Unlimited | Paid subscription |

### Anomaly Detection (Planned)

Future implementation will include pattern-based detection:

| Pattern | Detection Method | Action |
|---|---|---|
| Same IP, many conflicting verifications | Compare `acceptsInsurance` values for same NPI from same IP | Flag for review, reduce trust score |
| Burst of verifications for same provider-plan | Count verifications per (NPI, planId) in short window | Require evidence URL |
| Geographic mismatch | IP geolocation vs. provider location | Additional verification step |
| Known VPN/proxy IPs | IP reputation database | Stricter limits, require CAPTCHA |

### Evidence Requirements (Planned)

For verifications that conflict with existing high-confidence data, future versions may require:

| Condition | Requirement |
|---|---|
| Conflicting with 3+ existing verifications | Must provide evidence URL |
| Provider has confidence score > 0.8 | Must provide evidence URL or submittedBy email |
| Same IP submitted conflicting data within 30 days | Verification held for manual review |

---

## IP Address Handling

### How IPs Are Extracted

The rate limiter extracts the client IP from:

1. `X-Forwarded-For` header (first value) -- set by Cloud Run / load balancer
2. `req.ip` -- Express's built-in IP extraction (fallback)

```typescript
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first.trim();
  }
  return req.ip || '0.0.0.0';
}
```

### Trust Proxy Configuration

Express is configured with `trust proxy: true` for Cloud Run deployments, ensuring that `req.ip` correctly reflects the client's IP rather than the Cloud Run ingress proxy's IP.

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | No | -- | Redis connection URL. If not set, in-memory mode is used |
| `RECAPTCHA_SECRET_KEY` | Yes (for CAPTCHA) | -- | Google reCAPTCHA v3 secret key |
| `RECAPTCHA_SITE_KEY` | Yes (frontend) | -- | Google reCAPTCHA v3 site key (public) |

### Tuning Parameters

Rate limit values are defined in the middleware configuration and can be adjusted without code changes by modifying the limiter definitions:

```typescript
// Current configuration
const RATE_LIMITS = {
  verification: { max: 10, windowMs: 60 * 60 * 1000 },  // 10/hr
  vote:         { max: 10, windowMs: 60 * 60 * 1000 },  // 10/hr
  search:       { max: 100, windowMs: 60 * 60 * 1000 }, // 100/hr
  default:      { max: 200, windowMs: 60 * 60 * 1000 }, // 200/hr
};
```

---

## Monitoring

### Rate Limit Headers in Logs

The request logger captures rate limit information from response headers for every request, enabling:

- **Dashboard metrics**: Track how many requests are near the limit
- **Abuse detection**: Identify IPs consistently hitting limits
- **Capacity planning**: Determine if limits need adjustment based on legitimate traffic patterns

### Admin Stats Endpoint

The admin health endpoint includes rate limiter status:

```json
{
  "rateLimiter": {
    "mode": "redis",
    "status": "connected",
    "activeKeys": 142
  }
}
```

In degraded mode:
```json
{
  "rateLimiter": {
    "mode": "in-memory",
    "status": "degraded (redis unavailable)",
    "activeKeys": 42,
    "storeSize": "12.3 KB"
  }
}
```
