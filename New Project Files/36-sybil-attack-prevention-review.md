# Sybil Attack Prevention Review

**Generated:** 2026-02-18
**Prompt:** `prompts/36-sybil-attack-prevention.md`
**Status:** All 6 Prevention Layers Implemented and Verified

---

## Files Reviewed

| File | Path | Lines | Status |
|------|------|-------|--------|
| verificationService.ts | `packages/backend/src/services/verificationService.ts` | 910 | Verified |
| rateLimiter.ts | `packages/backend/src/middleware/rateLimiter.ts` | 379 | Verified |
| captcha.ts | `packages/backend/src/middleware/captcha.ts` | 241 | Verified |
| honeypot.ts | `packages/backend/src/middleware/honeypot.ts` | 25 | Verified |
| auth.ts | `packages/backend/src/middleware/auth.ts` | 111 | Verified |
| schema.prisma | `packages/backend/prisma/schema.prisma` | 459 | Verified |
| constants.ts | `packages/backend/src/config/constants.ts` | 120 | Verified |

---

## Layer-by-Layer Verification

### Layer 1: Rate Limiting (IP-based) -- VERIFIED

**File:** `packages/backend/src/middleware/rateLimiter.ts`

| Rate Limiter | Window | Max Requests | Applied To |
|-------------|--------|-------------|------------|
| `verificationRateLimiter` | 1 hour | 10 | Verification submission |
| `voteRateLimiter` | 1 hour | 10 | Vote endpoints |
| `searchRateLimiter` | 1 hour | 100 | Search endpoints |
| `defaultRateLimiter` | 1 hour | 200 | General API routes |
| `magicLinkRateLimiter` | 15 min | 5 | Auth magic link requests |

**Implementation quality:**

- **Dual-mode architecture:** Automatically selects Redis (distributed) or in-memory (single-instance) based on `REDIS_URL` availability. This is well-designed for scaling.
- **Sliding window algorithm:** Both Redis and in-memory modes use sliding windows (not fixed windows), preventing the boundary-burst vulnerability where an attacker could send 20 requests across a fixed window reset.
- **Redis implementation:** Uses sorted sets (`ZADD`/`ZCARD`/`ZREMRANGEBYSCORE`) in a `MULTI` transaction. Unique request IDs use `timestamp-random` format to prevent collisions.
- **Fail-open on Redis failure:** If Redis becomes unavailable mid-request, the limiter allows the request with a `X-RateLimit-Status: degraded` header and logs a warning. This prioritizes availability.
- **Rate limit headers returned:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response. `Retry-After` header on 429 responses.
- **Memory cleanup:** In-memory stores are cleaned every 60 seconds to prevent memory leaks.
- **Skip function:** Each limiter supports a `skip` option for bypassing (e.g., health checks).

---

### Layer 2: Honeypot (Bot Detection) -- VERIFIED

**File:** `packages/backend/src/middleware/honeypot.ts`

```typescript
export function honeypotCheck(fieldName: string = 'website') {
  return (req, res, next) => {
    if (req.body?.[fieldName]) {
      logger.warn({ ip: req.ip, field: fieldName, path: req.path }, 'Honeypot triggered');
      return res.json({ success: true, data: { id: 'submitted' } });
    }
    next();
  };
}
```

**Implementation quality:**

- [x] Hidden `website` field checked on form submissions
- [x] Returns fake `200 OK` with a plausible success response (`{ success: true, data: { id: 'submitted' } }`) to prevent bots from detecting the trap
- [x] Bot detection logged with IP address and request path for monitoring
- [x] Configurable field name (defaults to `'website'`)
- [x] Lightweight middleware -- no external dependencies, minimal overhead

**Effectiveness note:** Honeypots catch unsophisticated bots that auto-fill all form fields. They do not stop targeted attackers who inspect the form structure. The honeypot is correctly positioned as one layer in a defense-in-depth strategy.

---

### Layer 3: CAPTCHA (Google reCAPTCHA v3) -- VERIFIED

**File:** `packages/backend/src/middleware/captcha.ts`

**Configuration constants** (from `constants.ts`):
- `CAPTCHA_MIN_SCORE`: 0.5 (scores range 0.0-1.0)
- `CAPTCHA_API_TIMEOUT_MS`: 5 seconds
- `CAPTCHA_FALLBACK_MAX_REQUESTS`: 3 per hour
- `CAPTCHA_FALLBACK_WINDOW_MS`: 1 hour

**Implementation quality:**

- [x] reCAPTCHA v3 score verification with configurable threshold (0.5)
- [x] Token accepted from `req.body.captchaToken` or `x-captcha-token` header
- [x] 5-second timeout on Google API calls via `AbortController`
- [x] **Dual fail mode:** Configurable via `CAPTCHA_FAIL_MODE` env var:
  - `open` (default): Allows requests with stricter fallback rate limiting (3/hour vs normal 10/hour)
  - `closed`: Blocks all requests when Google API unavailable
- [x] Graceful degradation: Skips in development/test environments
- [x] Skips with warning if `RECAPTCHA_SECRET_KEY` not configured
- [x] Fallback rate limit store with periodic cleanup
- [x] Degraded security headers: `X-Security-Degraded`, `X-Fallback-RateLimit-*`

**Finding:** The fail-open fallback rate limit (3/hour) is significantly stricter than the normal verification rate limit (10/hour). This means even during a Google outage, an attacker gains very limited throughput.

---

### Layer 4: Vote Deduplication (Database) -- VERIFIED

**File:** `packages/backend/src/services/verificationService.ts` (function `voteOnVerification`)
**Schema:** `VoteLog` model in `schema.prisma`

**Database constraint:**
```prisma
model VoteLog {
  id             String          @id @default(cuid())
  verificationId String          @map("verification_id")
  sourceIp       String          @map("source_ip") @db.VarChar(50)
  vote           String          @db.VarChar(10)
  createdAt      DateTime        @default(now())
  verification   VerificationLog @relation(fields: [verificationId], references: [id], onDelete: Cascade)

  @@unique([verificationId, sourceIp])   // One vote per IP per verification
  @@index([sourceIp])
  @@index([verificationId])
}
```

**Implementation quality:**

- [x] Unique constraint `@@unique([verificationId, sourceIp])` enforced at database level -- cannot be bypassed by application bugs
- [x] Duplicate vote from same IP returns `409 Conflict` via `AppError.conflict('You have already voted on this verification')`
- [x] Vote direction change allowed: If existing vote is opposite direction, the vote is updated (not duplicated) and counts are adjusted atomically
- [x] Atomic count updates: Vote creation/update and verification log counter updates wrapped in `prisma.$transaction()` to prevent race conditions
- [x] Correct counter adjustment on vote change: Switching from down to up increments upvotes AND decrements downvotes in a single transaction
- [x] Confidence score recalculated after each vote via `calculateConfidenceScore()`
- [x] Source IP is required (`throw AppError.badRequest('Source IP is required for voting')`)
- [x] Cascade delete: `onDelete: Cascade` on the VoteLog-VerificationLog relation means expired verifications automatically clean up their votes

---

### Layer 5: Verification Windows (Database) -- VERIFIED

**File:** `packages/backend/src/services/verificationService.ts` (function `checkSybilAttack`)
**Schema:** Sybil prevention indexes in `schema.prisma`

**Database indexes:**
```prisma
@@index([providerNpi, planId, sourceIp, createdAt], map: "idx_vl_sybil_ip")
@@index([providerNpi, planId, submittedBy, createdAt], map: "idx_vl_sybil_email")
```

**Implementation quality:**

- [x] 30-day prevention window: `SYBIL_PREVENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000` (from `constants.ts`)
- [x] **Dual check -- IP and email:**
  - IP check: Queries `verificationLog` for matching `(providerNpi, planId, sourceIp)` within 30 days
  - Email check: Queries `verificationLog` for matching `(providerNpi, planId, submittedBy)` within 30 days
- [x] Both checks throw `AppError.conflict()` with descriptive messages
- [x] Dedicated composite indexes for fast lookups (both IP-based and email-based)
- [x] Called in `submitVerification()` at step 2, before any data is written

**Finding:** The implementation correctly checks BOTH IP and email independently. An attacker rotating IPs would still be caught by the email check, and an attacker using multiple emails would be caught by the IP check. Both must be circumvented simultaneously.

---

### Layer 6: User Authentication -- VERIFIED

**File:** `packages/backend/src/middleware/auth.ts`

**Implementation quality:**

- [x] **Magic link authentication:** JWT-based via `jose` library
- [x] **Optional auth middleware (`extractUser`):** Runs on ALL requests, never throws. Sets `req.user` to authenticated user info or `null` for anonymous.
- [x] **Route-level guard (`requireAuth`):** Rejects unauthenticated requests with 401
- [x] **Session tracking:** Sessions stored in database with:
  - `ipAddress` and `userAgent` for audit trail
  - `expiresAt` for session expiry (30-day sliding window from `constants.ts`)
  - `lastUsedAt` with 5-minute debounce to avoid excessive DB writes
- [x] **JWT claims:** `sub` (user ID), `email`, `sid` (session ID) -- session is verified against database on each request
- [x] **Expired session handling:** Sessions past `expiresAt` are treated as invalid (user becomes anonymous)
- [x] **CSRF protection:** `csrf-csrf` package is listed in backend dependencies
- [x] **Graceful degradation:** If `JWT_SECRET` not configured, token verification is skipped with a warning
- [x] **Session limits:** `MAX_SESSIONS_PER_USER = 5` (oldest session deleted on new login, from `constants.ts`)
- [x] **Expected error handling:** `JWTExpired` and `JWTClaimValidationFailed` logged at debug level (not error)

---

## Consensus Security Model -- Additional Finding

Beyond the 6 prevention layers, the `verificationService.ts` implements a **consensus-based status change** system that provides an additional defense against manipulation:

```typescript
const shouldUpdateStatus =
  verificationCount >= MIN_VERIFICATIONS_FOR_CONSENSUS &&  // >= 3 verifications
  confidenceScore >= MIN_CONFIDENCE_FOR_STATUS_CHANGE &&   // >= 60 confidence
  hasClearMajority;  // 2:1 ratio required
```

This means even if an attacker bypasses all prevention layers and submits a fraudulent verification, the acceptance status does not change until:
1. At least 3 independent verifications exist
2. The confidence score reaches 60+
3. There is a clear 2:1 majority in one direction

A single fraudulent verification only moves the status to `PENDING`, not `ACCEPTED` or `NOT_ACCEPTED`.

---

## PII Protection -- Additional Finding

The `verificationService.ts` includes a `stripVerificationPII()` function and a `VERIFICATION_PUBLIC_SELECT` constant that exclude `sourceIp`, `userAgent`, and `submittedBy` from all API responses. This prevents attackers from enumerating IP addresses or email addresses of other verifiers.

---

## Checklist Verification

### Rate Limiting
- [x] Verification: 10/hour per IP -- `verificationRateLimiter` confirmed
- [x] Voting: 10/hour per IP -- `voteRateLimiter` confirmed
- [x] Search: 100/hour per IP -- `searchRateLimiter` confirmed
- [x] Rate limit headers returned -- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [x] Retry-After on 429 -- confirmed in both Redis and in-memory implementations

### Honeypot
- [x] Hidden "website" field on verification and vote forms -- `honeypotCheck('website')`
- [x] Fake 200 OK response to confuse bots -- returns `{ success: true, data: { id: 'submitted' } }`
- [x] Bot detection logged with IP and path -- `logger.warn(...)` confirmed

### CAPTCHA
- [x] reCAPTCHA v3 on verification -- `verifyCaptcha` middleware confirmed
- [x] reCAPTCHA v3 on voting -- applied via middleware chain
- [x] Score threshold: 0.5 -- `CAPTCHA_MIN_SCORE = 0.5`
- [x] Fallback rate limiting -- 3/hour when Google API unavailable

### Vote Deduplication
- [x] VoteLog table -- confirmed in schema.prisma
- [x] Unique constraint on (verificationId, sourceIp) -- `@@unique([verificationId, sourceIp])`
- [x] Vote change allowed -- existing opposite vote updated with atomic counter adjustment
- [x] Duplicate prevention -- same direction vote returns 409

### Verification Windows
- [x] Sybil prevention indexes -- `idx_vl_sybil_ip` and `idx_vl_sybil_email` confirmed
- [x] 30-day window check implemented -- `checkSybilAttack()` with `SYBIL_PREVENTION_WINDOW_MS`
- [x] Duplicate IP check -- blocks same IP from verifying same NPI+plan within 30 days
- [x] Duplicate email check -- blocks same email from verifying same NPI+plan within 30 days

### User Authentication
- [x] Magic link authentication -- JWT via jose with session database lookup
- [x] Session tracking (IP, user agent) -- `ipAddress`, `userAgent` fields in Session model
- [x] CSRF protection -- `csrf-csrf` package in dependencies
- [x] Optional auth on all routes -- `extractUser` middleware never throws
- [x] Route-level guard -- `requireAuth` returns 401 for anonymous users

### Monitoring
- [ ] Suspicious pattern queries -- SQL provided in prompt but not automated
- [ ] Alerting on high volumes -- not implemented
- [ ] Admin review queue -- not implemented (import_conflicts table exists but not for verification disputes)

---

## Attack Scenario Assessment

| Attack | Prevention Layers | Effectiveness |
|--------|------------------|---------------|
| Bot spam (1000 verifications/min) | Rate limit (10/hr), CAPTCHA, Honeypot | Blocked: max 10/hr even with CAPTCHA bypass |
| Vote manipulation (100 votes on same verification) | VoteLog unique constraint | Blocked: exactly 1 vote per IP |
| VPN/proxy rotation (100 IPs) | Rate limit per IP, CAPTCHA score, Email check | Partially mitigated: each IP limited to 10/hr, email check catches same-email submissions |
| Coordinated real users | Consensus threshold (3+ verifications, 60+ confidence, 2:1 ratio) | Visible in data: conflicting verifications lower confidence |
| Session hijacking | JWT expiry (15min), session DB verification, session limits (5 max) | Mitigated: short-lived tokens, DB-backed sessions |

---

## Issues

1. **No proxy/VPN detection:** The system does not detect or flag requests from known VPN, proxy, or datacenter IP ranges. An attacker could rotate through VPN IPs to submit 10 verifications per IP per hour, potentially accumulating significant fraudulent data.

2. **No admin review queue for disputed verifications:** While the consensus model reduces impact, there is no mechanism for administrators to review and adjudicate disputed provider-plan pairs where conflicting verifications accumulate.

3. **No monitoring automation:** The suspicious pattern SQL queries exist in the prompt documentation but are not implemented as automated monitoring or alerting.

---

## Recommendations

1. **Add IP reputation checking** using a service like IPQualityScore or MaxMind to flag known VPN/proxy/datacenter IPs. These requests could receive stricter rate limits or require additional verification.

2. **Build an admin review queue** for disputed verifications -- provider-plan pairs where both ACCEPTED and NOT_ACCEPTED verifications exist above a threshold count.

3. **Implement automated monitoring** for the suspicious pattern queries:
   - IPs with >20 verifications/day
   - Provider-plan pairs with conflicting verifications
   - Alert thresholds configurable via admin dashboard

4. **Consider device fingerprinting** as an additional signal (not a blocking factor) to identify repeat visitors across IP changes. Libraries like FingerprintJS provide privacy-respecting device identification.

5. **Add audit logging for admin actions** -- currently admin endpoints have no audit trail of who performed cleanup or recalculation operations.
