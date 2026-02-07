# Rate Limiting Review

## Document Overview

This document provides a comprehensive review of the rate limiting and anti-abuse infrastructure in the VerifyMyProvider (HealthcareProviderDB) backend API. It covers the dual-mode rate limiter, CAPTCHA integration, honeypot bot detection, Sybil attack prevention, and the complete middleware defense chain applied to every endpoint.

---

## 1. Executive Summary

Rate limiting was identified as a **Medium severity (CVSS 7.1)** finding in a ZeroPath Security Scan. The original `packages/backend/src/api/routes.ts` (since removed) exposed unauthenticated verification endpoints with no rate limiting, enabling spam attacks that could poison the crowdsourced verification database.

**Current Status:**
- **Tier 1 (IP-based rate limiting):** COMPLETE -- deployed to production
- **Tier 2 (CAPTCHA + honeypot):** PARTIALLY COMPLETE -- reCAPTCHA v3 and honeypot fields are live; device fingerprinting is not yet implemented
- **Tier 3 (user accounts, anomaly detection):** NOT STARTED -- requires authentication system

The implementation uses a custom dual-mode rate limiter (Redis or in-memory) with a sliding window algorithm, Google reCAPTCHA v3 middleware, a honeypot bot trap, and application-level Sybil attack prevention.

---

## 2. Architecture Overview

### 2.1 Defense-in-Depth Middleware Chain

Every request passes through multiple layers of protection. The middleware stack, as assembled in `packages/backend/src/index.ts`, executes in this order:

```
Request
  |
  v
[1] requestIdMiddleware      -- Assigns unique request ID for log correlation
  |
  v
[2] httpLogger               -- Logs request metadata
  |
  v
[3] helmet                   -- Security headers (CSP, CORS policy, etc.)
  |
  v
[4] cors                     -- Origin validation against allowlist
  |
  v
[5] express.json({limit})    -- Body parsing with 100kb size limit
  |
  v
[6] defaultRateLimiter       -- Global rate limit: 200 req/hour per IP
  |
  v
[7] requestLogger            -- Usage tracking (no PII)
  |
  v
[8] generalTimeout (30s)     -- Request timeout for /api/v1 routes
  |
  v
[9] Route-specific middleware -- Per-endpoint rate limiters, CAPTCHA, honeypot
  |
  v
[10] Route handler           -- Business logic
  |
  v
[11] errorHandler            -- Centralized error handling
```

**Source:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\index.ts`, lines 36-186.

### 2.2 Trust Proxy Configuration

Cloud Run deploys behind a load balancer, so the application must trust the proxy to extract the real client IP from `X-Forwarded-For`:

```typescript
// From packages/backend/src/index.ts, line 37
app.set('trust proxy', 1);
```

Setting `trust proxy` to `1` means only the first proxy (Cloud Run's load balancer) is trusted. This prevents IP spoofing through chained `X-Forwarded-For` headers.

---

## 3. Rate Limiter Implementation

### 3.1 Source File

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\rateLimiter.ts`

The rate limiter is a custom implementation (not `express-rate-limit`). It supports two operational modes, automatically selected based on the environment.

### 3.2 Dual-Mode Architecture

#### Redis Mode (Distributed)

Enabled when the `REDIS_URL` environment variable is set. Uses the `ioredis` library (v5.9.2).

**Redis Client:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\lib\redis.ts`

Key characteristics:
- Singleton pattern with lazy initialization
- Connection retry with exponential backoff (up to 5 attempts, max 3s delay)
- 10-second connect timeout, 5-second command timeout
- Event-based connection state tracking (`ready`, `error`, `close`, `reconnecting`)
- Graceful shutdown via `closeRedisConnection()`

**Algorithm (Redis Sorted Sets):**

```typescript
// From rateLimiter.ts, lines 220-239
const multi = redis.multi();

// 1. Remove entries outside the current window
multi.zremrangebyscore(redisKey, 0, windowStart);

// 2. Add current request with timestamp as score
const requestId = `${now}-${Math.random().toString(36).substring(2, 9)}`;
multi.zadd(redisKey, now, requestId);

// 3. Count requests in current window
multi.zcard(redisKey);

// 4. Set key expiration (cleanup after window passes)
multi.expire(redisKey, Math.ceil(windowMs / 1000) + 1);

const results = await multi.exec();
```

- **Key format:** `ratelimit:{name}:{clientIP}` (e.g., `ratelimit:verification:203.0.113.42`)
- All four operations are executed atomically in a single Redis `MULTI/EXEC` transaction
- Each request member is uniquely identified by `{timestamp}-{random7chars}` to avoid collisions
- Keys auto-expire after the window passes (+1 second safety margin)

**Fail-Open Behavior:**

When Redis becomes unavailable mid-operation, requests are **allowed** (not blocked):

```typescript
// From rateLimiter.ts, lines 207-213
if (!redis || !isRedisConnected()) {
  logger.warn({ limiter: name }, 'Rate limiter Redis unavailable, allowing request (fail-open)');
  res.setHeader('X-RateLimit-Status', 'degraded');
  next();
  return;
}
```

This also applies to transaction failures and Redis errors (lines 241-278). The `X-RateLimit-Status: degraded` header signals to monitoring that rate limiting is not enforcing.

#### In-Memory Mode (Process-Local)

Fallback when `REDIS_URL` is not configured. Each Cloud Run instance maintains independent counters.

**Algorithm (Sliding Window):**

```typescript
// From rateLimiter.ts, lines 133-178
const clientKey = keyGenerator(req);
const now = Date.now();
const windowStart = now - windowMs;

// Get existing timestamps, filter to current window
let timestamps = store.get(clientKey) || [];
timestamps = timestamps.filter(ts => ts > windowStart);

const requestCount = timestamps.length;

if (requestCount >= maxRequests) {
  res.setHeader('Retry-After', retryAfterSeconds);
  res.status(429).json({ ... });
  return;
}

// Add current request timestamp
timestamps.push(now);
store.set(clientKey, timestamps);
```

**Why Sliding Window, Not Fixed Window:**

The codebase documentation (lines 66-84) explains the rationale:

> Unlike fixed windows which reset at specific intervals (allowing burst attacks at window boundaries), sliding windows track individual request timestamps.
>
> Example with 10 req/hour limit:
> - Fixed window: User sends 10 requests at 12:59, window resets at 13:00, user sends 10 more = 20 requests in 2 minutes (vulnerability)
> - Sliding window: Each request is tracked individually, so the 11th request within ANY 60-minute period is rejected (secure)

**Memory Cleanup:**

A `setInterval` runs every 60 seconds to garbage-collect expired entries:

```typescript
// From rateLimiter.ts, lines 88-108
setInterval(() => {
  const now = Date.now();
  memoryStores.forEach((store, storeName) => {
    const maxWindowMs = 60 * 60 * 1000; // 1 hour conservative max

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

**Limitation:** In-memory mode is only safe for single-instance deployments. With multiple Cloud Run instances, each instance tracks its own counters independently, meaning an attacker could multiply effective limits by targeting different instances.

### 3.3 Auto-Selecting Factory

The `createRateLimiter()` function (line 299) automatically selects the appropriate implementation based on whether a Redis client is available:

```typescript
// From rateLimiter.ts, lines 299-319
export function createRateLimiter(options: RateLimiterOptions): RateLimiterMiddleware {
  const name = options.name || 'unnamed';
  const redis = getRedisClient();

  if (!limiterModes.has(name)) {
    if (redis) {
      logger.info({ limiter: name, mode: 'redis' }, 'Rate limiter using Redis (distributed mode)');
      limiterModes.set(name, 'redis');
    } else {
      logger.info({ limiter: name, mode: 'memory' }, 'Rate limiter using in-memory (single-instance mode)');
      limiterModes.set(name, 'memory');
    }
  }

  if (redis) {
    return createRedisRateLimiter(options);
  }
  return createInMemoryRateLimiter(options);
}
```

Mode selection is logged once per limiter name on first creation.

### 3.4 Response Headers

All rate-limited responses include standard headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets |
| `Retry-After` | Seconds to wait before retrying (only on 429) |
| `X-RateLimit-Status` | Set to `degraded` when Redis is unavailable |

### 3.5 429 Response Format

```json
{
  "error": "Too many requests",
  "message": "You've submitted too many verifications. Please try again in 1 hour.",
  "retryAfter": 3600
}
```

### 3.6 Configuration Options

The `RateLimiterOptions` interface supports:

| Option | Type | Description |
|--------|------|-------------|
| `windowMs` | `number` | Time window in milliseconds |
| `maxRequests` | `number` | Maximum requests allowed per window |
| `name` | `string` | Identifier for the limiter (used in Redis keys and logs) |
| `message` | `string` | Custom error message for 429 responses |
| `keyGenerator` | `(req) => string` | Custom function to generate client keys (defaults to `req.ip`) |
| `skip` | `(req) => boolean` | Function to conditionally bypass rate limiting |

---

## 4. Pre-Configured Rate Limiters

Four named rate limiters are exported from `rateLimiter.ts` (lines 329-367):

| Limiter | Name | Max Requests | Window | Message |
|---------|------|-------------|--------|---------|
| `defaultRateLimiter` | `default` | 200/hour | 1 hour | "Too many requests. Please try again in 1 hour." |
| `verificationRateLimiter` | `verification` | 10/hour | 1 hour | "You've submitted too many verifications. Please try again in 1 hour." |
| `voteRateLimiter` | `vote` | 10/hour | 1 hour | "You've submitted too many votes. Please try again in 1 hour." |
| `searchRateLimiter` | `search` | 100/hour | 1 hour | "Too many search requests. Please try again in 1 hour." |

Additionally, the `defaultRateLimiter` is applied globally at the application level (line 139 of `index.ts`), so all requests pass through the 200/hour limit even before reaching route-specific limiters.

---

## 5. Endpoint-to-Limiter Mapping

### 5.1 Verification Routes (`verify.ts`)

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\verify.ts`

| Endpoint | Method | Rate Limiter | CAPTCHA | Honeypot | Effective Limits |
|----------|--------|-------------|---------|----------|-----------------|
| `/api/v1/verify` | POST | `verificationRateLimiter` (10/hr) | Yes | Yes (`website`) | 10/hr + CAPTCHA + honeypot |
| `/api/v1/verify/:verificationId/vote` | POST | `voteRateLimiter` (10/hr) | Yes | Yes (`website`) | 10/hr + CAPTCHA + honeypot |
| `/api/v1/verify/stats` | GET | `defaultRateLimiter` (200/hr) | No | No | 200/hr |
| `/api/v1/verify/recent` | GET | `defaultRateLimiter` (200/hr) | No | No | 200/hr |
| `/api/v1/verify/:npi/:planId` | GET | `defaultRateLimiter` (200/hr) | No | No | 200/hr |

The POST verification endpoint middleware chain is:

```typescript
// From verify.ts, lines 58-62
router.post(
  '/',
  verificationRateLimiter,   // 10 req/hour per IP
  honeypotCheck('website'),   // Silent bot trap
  verifyCaptcha,              // Google reCAPTCHA v3
  asyncHandler(async (req, res) => { ... })
);
```

The POST vote endpoint middleware chain is:

```typescript
// From verify.ts, lines 93-97
router.post(
  '/:verificationId/vote',
  voteRateLimiter,            // 10 req/hour per IP
  honeypotCheck('website'),   // Silent bot trap
  verifyCaptcha,              // Google reCAPTCHA v3
  asyncHandler(async (req, res) => { ... })
);
```

### 5.2 Provider Routes (`providers.ts`)

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\providers.ts`

| Endpoint | Method | Rate Limiter | Additional |
|----------|--------|-------------|-----------|
| `/api/v1/providers/search` | GET | `searchRateLimiter` (100/hr) | `searchTimeout` (15s) |
| `/api/v1/providers/cities` | GET | `defaultRateLimiter` (200/hr) | -- |
| `/api/v1/providers/:npi/colocated` | GET | `defaultRateLimiter` (200/hr) | -- |
| `/api/v1/providers/:npi` | GET | `defaultRateLimiter` (200/hr) | -- |

### 5.3 Plan Routes (`plans.ts`)

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\plans.ts`

| Endpoint | Method | Rate Limiter |
|----------|--------|-------------|
| `/api/v1/plans/search` | GET | `searchRateLimiter` (100/hr) |
| `/api/v1/plans/grouped` | GET | `defaultRateLimiter` (200/hr) |
| `/api/v1/plans/meta/issuers` | GET | `defaultRateLimiter` (200/hr) |
| `/api/v1/plans/meta/types` | GET | `defaultRateLimiter` (200/hr) |
| `/api/v1/plans/:planId/providers` | GET | `searchRateLimiter` (100/hr) |
| `/api/v1/plans/:planId` | GET | `defaultRateLimiter` (200/hr) |

### 5.4 Location Routes (`locations.ts`)

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\locations.ts`

| Endpoint | Method | Rate Limiter |
|----------|--------|-------------|
| `/api/v1/locations/search` | GET | `searchRateLimiter` (100/hr) |
| `/api/v1/locations/health-systems` | GET | `defaultRateLimiter` (200/hr) |
| `/api/v1/locations/stats/:state` | GET | `defaultRateLimiter` (200/hr) |
| `/api/v1/locations/:locationId` | GET | `defaultRateLimiter` (200/hr) |
| `/api/v1/locations/:locationId/providers` | GET | `defaultRateLimiter` (200/hr) |

### 5.5 Admin Routes (`admin.ts`)

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\admin.ts`

| Endpoint | Method | Rate Limiter | Auth |
|----------|--------|-------------|------|
| `/api/v1/admin/cleanup-expired` | POST | Global default only (200/hr) | `X-Admin-Secret` (timing-safe) |
| `/api/v1/admin/expiration-stats` | GET | Global default only (200/hr) | `X-Admin-Secret` |
| `/api/v1/admin/health` | GET | Global default only (200/hr) | `X-Admin-Secret` |
| `/api/v1/admin/cache/clear` | POST | Global default only (200/hr) | `X-Admin-Secret` |
| `/api/v1/admin/cache/stats` | GET | Global default only (200/hr) | `X-Admin-Secret` |
| `/api/v1/admin/enrichment/stats` | GET | Global default only (200/hr) | `X-Admin-Secret` |
| `/api/v1/admin/cleanup/sync-logs` | POST | Global default only (200/hr) | `X-Admin-Secret` |
| `/api/v1/admin/retention/stats` | GET | Global default only (200/hr) | `X-Admin-Secret` |
| `/api/v1/admin/recalculate-confidence` | POST | Global default only (200/hr) | `X-Admin-Secret` |

Admin routes do not have route-specific rate limiters beyond the global `defaultRateLimiter` applied at the app level. They are protected by the `adminAuthMiddleware` which validates the `X-Admin-Secret` header using `crypto.timingSafeEqual()` to prevent timing attacks.

### 5.6 Special Endpoints

| Endpoint | Method | Rate Limiter | Notes |
|----------|--------|-------------|-------|
| `/health` | GET | **None** | Deliberately placed BEFORE the global rate limiter so monitoring tools are not blocked |
| `/` | GET | Global default (200/hr) | API info/docs endpoint |

---

## 6. CAPTCHA Integration

### 6.1 Source File

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\captcha.ts`

### 6.2 Google reCAPTCHA v3

The middleware verifies a `captchaToken` submitted in the request body or `x-captcha-token` header against the Google reCAPTCHA v3 API.

**Configuration Constants** (from `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\config\constants.ts`):

| Constant | Value | Description |
|----------|-------|-------------|
| `CAPTCHA_MIN_SCORE` | `0.5` | Minimum score to pass (0.0 = bot, 1.0 = human) |
| `CAPTCHA_API_TIMEOUT_MS` | `5000` (5s) | Timeout for Google API calls |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | `3` | Max requests when CAPTCHA is unavailable (much stricter than normal 10/hr) |
| `CAPTCHA_FALLBACK_WINDOW_MS` | `3600000` (1 hour) | Fallback rate limit window |

### 6.3 Verification Flow

```
Client sends captchaToken
       |
       v
  [Skip if dev/test?] ----yes----> next()
       |no
       v
  [RECAPTCHA_SECRET set?] --no---> next() (with warning log)
       |yes
       v
  [Token present?] --------no---> 400 "CAPTCHA token required"
       |yes
       v
  [Call Google API with 5s timeout]
       |
       +--success--> [Score >= 0.5?] --yes--> next()
       |                    |no
       |                    v
       |             403 "Request blocked due to suspicious activity"
       |
       +--failure--> [CAPTCHA_FAIL_MODE?]
                          |
                    +-----+-----+
                    |           |
                 "closed"    "open"
                    |           |
                    v           v
          503 "Security    [Fallback rate limit check]
           unavailable"       |
                         +----+----+
                         |         |
                      allowed    exceeded
                         |         |
                         v         v
                      next()    429 "Too many requests
                   (degraded)   while security verification
                                is unavailable"
```

### 6.4 Fail-Open vs. Fail-Closed

The middleware supports two failure modes controlled by `CAPTCHA_FAIL_MODE` environment variable:

**Fail-Open (default):**
- When Google's reCAPTCHA API is unavailable (timeout, network error, outage), requests are allowed through
- A **stricter fallback rate limit** of 3 requests/hour per IP is applied (vs. the normal 10/hour)
- Headers `X-Security-Degraded: captcha-unavailable`, `X-Fallback-RateLimit-Limit`, `X-Fallback-RateLimit-Remaining`, and `X-Fallback-RateLimit-Reset` are set
- Rationale: Prioritizes availability for user-facing features

**Fail-Closed:**
- All requests are blocked with a 503 when Google API is unavailable
- Rationale: Prioritizes security over availability

### 6.5 Fallback Rate Limiting Store

The CAPTCHA middleware maintains its own independent in-memory rate limit store (`fallbackStore`) with periodic cleanup every 60 seconds (matching the `RATE_LIMIT_CLEANUP_INTERVAL_MS` constant). This store is entirely separate from the main rate limiter and only activates during Google API failures in fail-open mode.

### 6.6 Applied Endpoints

CAPTCHA is applied to exactly two endpoints:
1. `POST /api/v1/verify` -- submit verification
2. `POST /api/v1/verify/:verificationId/vote` -- vote on verification

### 6.7 Frontend Integration Status

The frontend (`packages/frontend`) currently has:
- Privacy policy text referencing Google reCAPTCHA (in `src/app/privacy/page.tsx`)
- CSP configuration in `next.config.js` allowing Google reCAPTCHA script and frame sources

However, the frontend verification/voting components do not yet appear to send `captchaToken` in request bodies. The backend gracefully handles this: when `RECAPTCHA_SECRET_KEY` is not set, the CAPTCHA middleware is skipped with a warning log.

---

## 7. Honeypot Bot Detection

### 7.1 Source File

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\honeypot.ts`

### 7.2 How It Works

A hidden form field named `website` is included in verification and vote forms. Real users never fill it in, but automated bots that blindly populate all form fields will set a value.

```typescript
// From honeypot.ts, lines 11-25
export function honeypotCheck(fieldName: string = 'website') {
  return (req: Request, res: Response, next: NextFunction) => {
    const honeypotValue = req.body?.[fieldName];
    if (honeypotValue) {
      logger.warn({
        ip: req.ip,
        field: fieldName,
        path: req.path,
      }, 'Honeypot triggered -- likely bot');
      // Return 200 to not alert the bot that it was caught
      return res.json({ success: true, data: { id: 'submitted' } });
    }
    next();
  };
}
```

Key design decision: The middleware returns a **200 OK with a fake success response** rather than a 403/429. This prevents the bot from knowing it was detected, avoiding adaptation.

### 7.3 Validation Schema Integration

Both the verification and vote request schemas include the `website` field as optional:

```typescript
// From verify.ts, line 31
website: z.string().optional(), // honeypot field -- should always be empty

// From verify.ts, line 37
website: z.string().optional(), // honeypot field -- should always be empty
```

---

## 8. Sybil Attack Prevention

### 8.1 Application-Level Protection

Beyond rate limiting, the verification service includes a Sybil attack prevention mechanism at the application layer.

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\verificationService.ts`

**Configuration** (from `constants.ts`):

```typescript
// SYBIL_PREVENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 (30 days)
```

The `checkSybilAttack()` function prevents the same IP address from submitting multiple verifications for the same provider-plan pair within a 30-day window:

```typescript
// From verificationService.ts
async function checkSybilAttack(
  providerNpi: string,
  planId: string,
  sourceIp?: string,
  submittedBy?: string
): Promise<void> {
  const cutoffDate = new Date(Date.now() - SYBIL_PREVENTION_WINDOW_MS);

  if (sourceIp) {
    const existingFromIp = await prisma.verificationLog.findFirst({
      where: {
        providerNpi,
        planId,
        sourceIp,
        createdAt: { gte: cutoffDate },
      },
    });

    if (existingFromIp) {
      // Throws 409 Conflict
    }
  }
}
```

This is called at step 2 of the verification submission flow, before any database writes.

### 8.2 Duplicate Vote Prevention

Votes are also protected against duplicates using a unique constraint on `(verificationId, sourceIp)`:

```typescript
// From verificationService.ts
const existingVote = await prisma.voteLog.findUnique({
  where: {
    verificationId_sourceIp: {
      verificationId,
      sourceIp,
    },
  },
});
```

If a user changes their vote (e.g., from "up" to "down"), the existing vote record is updated rather than creating a new one, and the counters are adjusted accordingly.

### 8.3 PII Protection

The verification service strips sensitive fields (`sourceIp`, `userAgent`, `submittedBy`) from all API responses using `stripVerificationPII()`, and explicit `select` clauses in Prisma queries exclude these fields from read-only endpoints.

---

## 9. Layered Rate Limiting Summary

A single `POST /api/v1/verify` request passes through all of these checks:

| Layer | Type | Limit | Scope |
|-------|------|-------|-------|
| 1 | Global rate limit | 200/hr per IP | All routes |
| 2 | Verification rate limit | 10/hr per IP | POST /verify only |
| 3 | Honeypot | Binary (pass/fail) | POST /verify, POST /vote |
| 4 | reCAPTCHA v3 | Score >= 0.5 | POST /verify, POST /vote |
| 5 | CAPTCHA fallback rate limit | 3/hr per IP | Only when Google API down |
| 6 | Sybil prevention | 1 per 30 days per IP per provider-plan | POST /verify only |
| 7 | Duplicate vote detection | 1 vote per IP per verification | POST /vote only |
| 8 | Body size limit | 100kb | All routes |
| 9 | Request timeout | 30s | All /api/v1 routes |

---

## 10. Consistency Check: In-Memory vs. Redis Comparison

There is a subtle difference in how the two modes check the threshold:

- **In-memory mode** (line 163): `if (requestCount >= maxRequests)` -- rejects at exactly the limit
- **Redis mode** (line 262): `if (requestCount > maxRequests)` -- rejects one request after the limit

This means the Redis mode effectively allows `maxRequests + 1` requests (since ZADD runs before ZCARD in the transaction, the count includes the current request, so `>` is correct). The in-memory mode adds the timestamp only after the check passes, so `>=` is the correct comparison there. Both approaches are functionally equivalent in practice.

---

## 11. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | _(none)_ | Redis connection string; enables distributed rate limiting |
| `RECAPTCHA_SECRET_KEY` | No | _(none)_ | Google reCAPTCHA v3 secret key; CAPTCHA disabled without it |
| `CAPTCHA_FAIL_MODE` | No | `open` | Behavior when Google API fails: `open` or `closed` |
| `NODE_ENV` | No | _(none)_ | Set to `development` or `test` to skip CAPTCHA |
| `ADMIN_SECRET` | No | _(none)_ | Secret for admin endpoints; admin routes return 503 without it |

---

## 12. Attack Scenarios and Mitigations

### 12.1 Competitor Sabotage (Flood Fake Verifications)

**Attack:** Submit hundreds of "does not accept" verifications to lower a provider's confidence score.

**Mitigations:**
- Rate limiter: 10 verifications/hour per IP
- CAPTCHA: Score-based bot filtering
- Sybil prevention: 1 verification per provider-plan per IP per 30 days
- Consensus threshold: Requires 3+ verifications and 60%+ confidence before status changes (from `constants.ts`: `MIN_VERIFICATIONS_FOR_CONSENSUS = 3`, `MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60`)

### 12.2 Vote Manipulation

**Attack:** Mass upvote fraudulent verifications or downvote legitimate ones.

**Mitigations:**
- Rate limiter: 10 votes/hour per IP
- CAPTCHA on vote endpoints
- Duplicate vote prevention: 1 vote per IP per verification (composite unique constraint)
- Vote changes are tracked (not duplicated)

### 12.3 Bot Spam

**Attack:** Automated scripts flooding all endpoints.

**Mitigations:**
- Honeypot field silently traps naive bots
- reCAPTCHA v3 scores detect sophisticated bots
- IP-based rate limiting blocks high-volume sources
- 100kb body size limit prevents payload-based attacks
- Request timeouts prevent slowloris-style attacks

### 12.4 VPN/IP Rotation

**Attack:** Rotate through VPN/proxy IPs to circumvent IP-based limits.

**Current gap:** This is only partially mitigated. CAPTCHA helps, but device fingerprinting (planned for Tier 2) is not yet implemented. The Sybil check only works per-IP, so different IPs can submit verifications for the same provider-plan pair.

### 12.5 Redis Unavailability Exploitation

**Attack:** If an attacker could cause Redis to become unavailable, the fail-open behavior would disable rate limiting.

**Mitigations:**
- The `X-RateLimit-Status: degraded` header enables monitoring/alerting
- CAPTCHA still enforces its own limits (independent of Redis)
- Sybil prevention runs at the application/database layer (independent of Redis)
- Redis reconnection with exponential backoff (up to 5 attempts)

---

## 13. Monitoring and Observability

### 13.1 Structured Logging

All rate limiting events are logged using the `pino` structured logger:

| Event | Log Level | Fields |
|-------|-----------|--------|
| Limiter mode selected | INFO | `limiter`, `mode` |
| Redis unavailable (fail-open) | WARN | `limiter` |
| Redis transaction failed | WARN | `limiter` |
| Redis error | ERROR | `limiter`, `error` |
| CAPTCHA verification failed | WARN | `ip`, `errors`, `action`, `endpoint` |
| CAPTCHA low score | WARN | `ip`, `score`, `threshold`, `action`, `endpoint` |
| CAPTCHA API error | ERROR | `ip`, `error`, `isTimeout`, `failMode`, `endpoint` |
| CAPTCHA fail-closed block | WARN | `ip`, `endpoint` |
| CAPTCHA fail-open allow | WARN | `ip`, `remaining`, `limit`, `endpoint` |
| CAPTCHA fallback limit exceeded | WARN | `ip`, `limit`, `window`, `endpoint` |
| Honeypot triggered | WARN | `ip`, `field`, `path` |

### 13.2 Not Yet Implemented

The following monitoring capabilities are planned but not yet built:
- Dashboard showing rate limit hits per endpoint
- Alert when more than 10 IPs hit rate limits per hour
- Blocked IP tracking
- Verification velocity monitoring by provider
- Conflicting verification pattern detection

---

## 14. Testing Considerations

### 14.1 Current Test Infrastructure

The backend has a test directory structure (`src/services/__tests__/verificationService.test.ts` exists in coverage reports), but no dedicated rate limiter or CAPTCHA test files were found.

### 14.2 CAPTCHA Test Bypass

CAPTCHA is automatically skipped in development and test environments:

```typescript
// From captcha.ts, lines 121-123
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  return next();
}
```

### 14.3 Rate Limiter Skip Function

The `skip` option in `RateLimiterOptions` provides a mechanism for bypassing rate limits in specific conditions (e.g., test headers), though it is not currently used by any of the pre-configured limiters.

### 14.4 Recommended Tests (Not Yet Implemented)

- Verify 429 response on the 11th verification request within 1 hour
- Verify CAPTCHA token requirement on POST endpoints
- Verify honeypot detection returns fake 200 response
- Verify Sybil prevention blocks duplicate submissions
- Load test to ensure legitimate traffic is not impacted
- Verify rate limit headers are present on all responses

---

## 15. Implementation Status Summary

| Category | Feature | Status |
|----------|---------|--------|
| **Tier 1** | Custom dual-mode rate limiter (Redis + in-memory) | COMPLETE |
| **Tier 1** | Sliding window algorithm | COMPLETE |
| **Tier 1** | IP-based limits on all endpoints | COMPLETE |
| **Tier 1** | Standard rate limit headers | COMPLETE |
| **Tier 1** | Retry-After on 429 | COMPLETE |
| **Tier 1** | Fail-open when Redis unavailable | COMPLETE |
| **Tier 1** | Production deployment | COMPLETE |
| **Tier 2** | Google reCAPTCHA v3 (verification + vote endpoints) | COMPLETE |
| **Tier 2** | CAPTCHA fail-open/fail-closed modes | COMPLETE |
| **Tier 2** | CAPTCHA fallback rate limiting | COMPLETE |
| **Tier 2** | Honeypot bot detection | COMPLETE |
| **Tier 2** | Device fingerprinting | NOT STARTED |
| **Tier 2** | Traffic-based limit tuning | NOT STARTED |
| **Tier 2** | API docs for rate limits | NOT STARTED |
| **Tier 3** | User account-based limits | NOT STARTED (requires auth) |
| **Tier 3** | Trusted IP allowlist | NOT STARTED |
| **Tier 3** | Admin panel for blocked attempts | NOT STARTED |
| **Tier 3** | Anomaly detection | NOT STARTED |
| **Tier 3** | Evidence requirements for disputed verifications | NOT STARTED |
| **Other** | Sybil attack prevention (30-day window) | COMPLETE |
| **Other** | Duplicate vote prevention | COMPLETE |
| **Other** | PII stripping from API responses | COMPLETE |
| **Other** | Body size limit (100kb) | COMPLETE |
| **Other** | Request timeouts (15s search, 30s general, 120s admin) | COMPLETE |
| **Other** | Rate limit monitoring dashboard | NOT STARTED |
| **Other** | Automated rate limit testing | NOT STARTED |

---

## 16. Recommendations for Future Work

1. **Device fingerprinting** -- Add `express-fingerprint` or similar to detect VPN/IP rotation attacks that bypass IP-based limits. This was planned for Tier 2.

2. **Frontend CAPTCHA integration** -- The backend CAPTCHA middleware is functional but the frontend does not yet appear to send `captchaToken` values. Integrate `react-google-recaptcha-v3` in the verification and voting components.

3. **Dedicated rate limiter tests** -- Add unit and integration tests for the rate limiter middleware, CAPTCHA middleware, and honeypot middleware.

4. **Admin route rate limiting** -- Admin routes currently rely only on the global 200/hr limit plus secret-based auth. Consider adding a stricter admin-specific rate limiter (e.g., 20/hr) to limit brute-force attempts against the admin secret.

5. **Monitoring dashboard** -- Build or integrate a dashboard to visualize rate limit hits, blocked IPs, and verification velocity patterns.

6. **Redis health check** -- Add Redis connection status to the `/health` endpoint response for operational visibility.

7. **Graduated user limits (Tier 3)** -- Once authentication is implemented, replace flat IP-based limits with trust-based graduated limits where established users get higher thresholds.

---

## 17. File Reference

| File | Purpose |
|------|---------|
| `packages/backend/src/middleware/rateLimiter.ts` | Dual-mode rate limiter (Redis + in-memory), pre-configured limiters |
| `packages/backend/src/middleware/captcha.ts` | Google reCAPTCHA v3 middleware with fail-open/closed modes |
| `packages/backend/src/middleware/honeypot.ts` | Hidden field bot detection |
| `packages/backend/src/middleware/errorHandler.ts` | AppError class (includes `tooManyRequests`, `serviceUnavailable` statics) |
| `packages/backend/src/middleware/requestTimeout.ts` | Request timeouts (15s/30s/120s) |
| `packages/backend/src/lib/redis.ts` | Redis client singleton with retry logic |
| `packages/backend/src/config/constants.ts` | CAPTCHA thresholds, Sybil window, rate limit cleanup interval |
| `packages/backend/src/routes/verify.ts` | Verification + vote endpoints with full middleware chain |
| `packages/backend/src/routes/providers.ts` | Provider endpoints with search and default limiters |
| `packages/backend/src/routes/plans.ts` | Plan endpoints with search and default limiters |
| `packages/backend/src/routes/locations.ts` | Location endpoints with search and default limiters |
| `packages/backend/src/routes/admin.ts` | Admin endpoints with secret-based auth |
| `packages/backend/src/routes/index.ts` | Route registration |
| `packages/backend/src/index.ts` | Application entry point, global middleware setup |
| `packages/backend/src/services/verificationService.ts` | Sybil prevention, duplicate vote detection, PII stripping |
