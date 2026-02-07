# Sybil Attack Prevention

**Last Updated:** 2026-02-07

## Overview

A Sybil attack is when an attacker creates multiple fake identities to manipulate a system. In VerifyMyProvider, this could manifest as:

1. **Verification Spam:** Same person submitting many fake verifications to skew provider acceptance data
2. **Vote Manipulation:** Same person voting multiple times on a verification to inflate or deflate credibility
3. **Confidence Score Poisoning:** Artificially inflating or deflating provider confidence scores through coordinated fake submissions

VerifyMyProvider implements a **five-layer defense-in-depth** strategy to prevent Sybil attacks. Each layer operates independently so that if one layer is bypassed, subsequent layers still provide protection.

---

## Protection Layers

| Layer | Mechanism | Status | Configuration | Source File |
|-------|-----------|--------|---------------|-------------|
| 1 - Rate Limiting | IP-based sliding window | Implemented | 10/hr verify, 10/hr vote, 100/hr search | `packages/backend/src/middleware/rateLimiter.ts` |
| 2 - Honeypot | Hidden form field bot trap | Implemented | `website` field, fake 200 OK | `packages/backend/src/middleware/honeypot.ts` |
| 3 - CAPTCHA | Google reCAPTCHA v3 | Implemented | Score >= 0.5 required | `packages/backend/src/middleware/captcha.ts` |
| 4 - Vote Deduplication | Database unique constraint | Implemented | 1 vote per IP per verification | `prisma/schema.prisma` (VoteLog) |
| 5 - Verification Windows | 30-day IP + email check | Implemented | `checkSybilAttack()` with sybil indexes | `packages/backend/src/services/verificationService.ts` |

---

## Layer 1: Rate Limiting (IP-Based Sliding Window)

### How It Works

The rate limiter uses a **sliding window algorithm** rather than fixed windows. This prevents burst attacks at window boundaries where an attacker could send 10 requests at 12:59, wait for a fixed window reset at 13:00, and send 10 more -- effectively doubling their allowed rate.

With sliding windows, each request is tracked individually, so the 11th request within ANY 60-minute rolling period is rejected.

### Dual-Mode Architecture

The rate limiter supports two modes that are automatically selected based on environment configuration:

- **Redis Mode (distributed):** Used when `REDIS_URL` is configured. Sorted sets track request timestamps across all application instances, enabling true horizontal scaling.
- **In-Memory Mode (process-local):** Fallback when Redis is unavailable. Each process maintains independent counters. Only safe for single-instance deployments.

Both modes implement identical sliding window logic. The Redis implementation uses `ZRANGEBYSCORE`, `ZADD`, `ZCARD`, and `EXPIRE` within a `MULTI` transaction to atomically track and count requests.

### Fail-Open Behavior

If Redis becomes unavailable mid-operation, the rate limiter **fails open** (allows the request) with a warning logged and an `X-RateLimit-Status: degraded` header set. This prioritizes availability over strict rate limiting.

### Pre-Configured Limiters

From `packages/backend/src/middleware/rateLimiter.ts`:

```typescript
// Verification submissions: 10 requests per hour
export const verificationRateLimiter = createRateLimiter({
  name: 'verification',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've submitted too many verifications. Please try again in 1 hour.",
});

// Votes: 10 requests per hour
export const voteRateLimiter = createRateLimiter({
  name: 'vote',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've submitted too many votes. Please try again in 1 hour.",
});

// Search: 100 requests per hour
export const searchRateLimiter = createRateLimiter({
  name: 'search',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 100,
  message: 'Too many search requests. Please try again in 1 hour.',
});

// General API: 200 requests per hour
export const defaultRateLimiter = createRateLimiter({
  name: 'default',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 200,
  message: 'Too many requests. Please try again in 1 hour.',
});
```

### Response Headers

Every rate-limited response includes standard headers:
- `X-RateLimit-Limit` -- maximum requests allowed in the window
- `X-RateLimit-Remaining` -- remaining requests in the current window
- `X-RateLimit-Reset` -- Unix timestamp when the window resets
- `Retry-After` -- seconds to wait (only on 429 responses)

### Memory Cleanup

In-memory stores are cleaned up every 60 seconds by a `setInterval` that filters out timestamps older than 1 hour. This prevents unbounded memory growth from long-running processes.

---

## Layer 2: Honeypot (Bot Detection)

### How It Works

A hidden form field named `website` is included in both the verification submission and voting forms. Real users (who interact via the rendered UI) never see or fill this field. Automated scripts that blindly populate all form fields will fill it, triggering detection.

From `packages/backend/src/middleware/honeypot.ts`:

```typescript
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

### Key Design Decisions

- **Fake 200 OK response:** The middleware returns `{ success: true, data: { id: 'submitted' } }` rather than a 4xx error. This prevents the bot from detecting that it was caught and adapting its strategy.
- **Structured logging:** The bot detection event is logged with `ip`, `field`, and `path` for monitoring and forensic analysis.
- **Configurable field name:** The honeypot field name defaults to `website` but can be changed per route if needed.

### Schema Integration

The honeypot field is included in Zod validation schemas in `packages/backend/src/routes/verify.ts` so it passes through validation but is intercepted by the middleware before reaching business logic:

```typescript
const submitVerificationSchema = npiParamSchema.merge(planIdParamSchema).extend({
  // ... other fields
  website: z.string().optional(), // honeypot field -- should always be empty
});

const voteSchema = z.object({
  vote: z.enum(['up', 'down']),
  captchaToken: z.string().optional(),
  website: z.string().optional(), // honeypot field -- should always be empty
});
```

---

## Layer 3: CAPTCHA (Google reCAPTCHA v3)

### How It Works

Google reCAPTCHA v3 runs silently in the background and assigns a score from 0.0 (likely bot) to 1.0 (likely human). Requests with a score below 0.5 are blocked with a 403 Forbidden response.

From `packages/backend/src/middleware/captcha.ts`:

```typescript
// reCAPTCHA v3 returns a score (0.0 - 1.0)
if (data.score !== undefined && data.score < CAPTCHA_MIN_SCORE) {
  logger.warn({
    ip: clientIp,
    score: data.score,
    threshold: CAPTCHA_MIN_SCORE,
    action: data.action,
    endpoint: req.path,
  }, 'CAPTCHA low score - possible bot');
  return next(AppError.forbidden('Request blocked due to suspicious activity'));
}
```

### Configuration Constants

From `packages/backend/src/config/constants.ts`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `CAPTCHA_MIN_SCORE` | 0.5 | Minimum reCAPTCHA v3 score to pass |
| `CAPTCHA_API_TIMEOUT_MS` | 5000 (5s) | Timeout for Google API call |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | 3 | Max requests when CAPTCHA API is down |
| `CAPTCHA_FALLBACK_WINDOW_MS` | 3600000 (1hr) | Window for fallback rate limiting |

### Fail-Open vs Fail-Closed

The CAPTCHA middleware supports two failure modes, configured via the `CAPTCHA_FAIL_MODE` environment variable:

**Fail-Open (default):**
- When Google's reCAPTCHA API is unavailable, requests are allowed through but subject to a **stricter fallback rate limit** of 3 requests per hour (vs. the normal 10).
- An `X-Security-Degraded: captcha-unavailable` header is set on degraded responses.
- Fallback rate limit headers (`X-Fallback-RateLimit-Limit`, `X-Fallback-RateLimit-Remaining`, `X-Fallback-RateLimit-Reset`) are included.

**Fail-Closed:**
- All requests are blocked with a 503 Service Unavailable when the Google API fails.
- Provides maximum security at the cost of availability.

```typescript
if (CAPTCHA_FAIL_MODE === 'closed') {
  return next(AppError.serviceUnavailable(
    'Security verification temporarily unavailable. Please try again in a few minutes.'
  ));
}

// FAIL-OPEN: Allow request but apply stricter fallback rate limiting
const fallbackResult = checkFallbackRateLimit(clientIp);
```

### Environment Behavior

- **Development/Test:** CAPTCHA is automatically skipped (`process.env.NODE_ENV === 'development' || 'test'`).
- **Production without key:** If `RECAPTCHA_SECRET_KEY` is not set, CAPTCHA is skipped with a warning logged.

### Token Sources

The CAPTCHA token is accepted from either:
- `req.body.captchaToken` (form body)
- `req.headers['x-captcha-token']` (HTTP header)

---

## Layer 4: Vote Deduplication (Database Constraint)

### How It Works

The `VoteLog` table enforces a **unique composite constraint** on `(verificationId, sourceIp)`, guaranteeing at the database level that each IP address can only have one vote per verification.

From `prisma/schema.prisma`:

```prisma
model VoteLog {
  id               String           @id @default(cuid())
  verificationId   String           @map("verification_id")
  sourceIp         String           @map("source_ip") @db.VarChar(50)
  vote             String           @db.VarChar(10)
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  verification     VerificationLog  @relation(fields: [verificationId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([verificationId, sourceIp])
  @@index([sourceIp], map: "idx_vote_logs_source_ip")
  @@index([verificationId], map: "idx_vote_logs_verification_id")
  @@map("vote_logs")
}
```

### Vote Change Logic

The system allows a user to **change** their vote (e.g., from "up" to "down") but not to submit a duplicate vote in the same direction. This is handled in `voteOnVerification()`:

```typescript
// Check for existing vote from this IP
const existingVote = await prisma.voteLog.findUnique({
  where: {
    verificationId_sourceIp: {
      verificationId,
      sourceIp,
    },
  },
});

if (existingVote) {
  // If same vote direction, reject as duplicate
  if (existingVote.vote === vote) {
    throw AppError.conflict('You have already voted on this verification');
  }

  // Changing vote direction - update existing vote and adjust counts
  voteChanged = true;
  await prisma.$transaction(async (tx) => {
    await tx.voteLog.update({
      where: { verificationId_sourceIp: { verificationId, sourceIp } },
      data: { vote },
    });

    // Adjust counts atomically: remove old vote, add new vote
    if (vote === 'up') {
      await tx.verificationLog.update({
        where: { id: verificationId },
        data: { upvotes: { increment: 1 }, downvotes: { decrement: 1 } },
      });
    } else {
      await tx.verificationLog.update({
        where: { id: verificationId },
        data: { upvotes: { decrement: 1 }, downvotes: { increment: 1 } },
      });
    }
  });
}
```

All vote operations (create and update) use **Prisma transactions** (`prisma.$transaction`) to ensure atomicity -- the vote log entry and the verification counters are always updated together or not at all.

### Confidence Score Update on Vote

After a vote is recorded, the confidence score on the associated `ProviderPlanAcceptance` record is recalculated using the updated upvote/downvote counts:

```typescript
if (updatedVerification.acceptanceId) {
  const acceptanceRecord = await prisma.providerPlanAcceptance.findUnique({
    where: { id: parseInt(updatedVerification.acceptanceId) },
  });

  if (acceptanceRecord) {
    const { score } = calculateConfidenceScore({
      dataSource: VerificationSource.CROWDSOURCE,
      lastVerifiedAt: acceptanceRecord.lastVerified,
      verificationCount: acceptanceRecord.verificationCount || 0,
      upvotes: updatedVerification.upvotes,
      downvotes: updatedVerification.downvotes,
    });

    await prisma.providerPlanAcceptance.update({
      where: { id: acceptanceRecord.id },
      data: { confidenceScore: score },
    });
  }
}
```

---

## Layer 5: Verification Windows (30-Day Sybil Prevention)

### How It Works

The `checkSybilAttack()` function in `packages/backend/src/services/verificationService.ts` prevents the same IP address or email from submitting multiple verifications for the same provider-plan pair within a 30-day window.

```typescript
async function checkSybilAttack(
  providerNpi: string,
  planId: string,
  sourceIp?: string,
  submittedBy?: string
): Promise<void> {
  const cutoffDate = new Date(Date.now() - SYBIL_PREVENTION_WINDOW_MS);

  // Check for duplicate verification from same IP
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
      throw AppError.conflict(
        'You have already submitted a verification for this provider-plan pair within the last 30 days.'
      );
    }
  }

  // Check for duplicate verification from same email
  if (submittedBy) {
    const existingFromEmail = await prisma.verificationLog.findFirst({
      where: {
        providerNpi,
        planId,
        submittedBy,
        createdAt: { gte: cutoffDate },
      },
    });

    if (existingFromEmail) {
      throw AppError.conflict(
        'This email has already submitted a verification for this provider-plan pair within the last 30 days.'
      );
    }
  }
}
```

### Sybil Prevention Window

From `packages/backend/src/config/constants.ts`:

```typescript
export const SYBIL_PREVENTION_WINDOW_MS = 30 * MS_PER_DAY; // 30 days
```

This means:
- Same IP cannot verify the same NPI + plan pair more than once per 30 days
- Same email cannot verify the same NPI + plan pair more than once per 30 days
- Both checks run independently -- if either matches, the submission is blocked

### Database Indexes for Performance

The Prisma schema includes dedicated composite indexes that make sybil checks performant even at scale:

```prisma
model VerificationLog {
  // ... fields ...

  // Sybil prevention indexes -- composite for fast lookups
  @@index([providerNpi, planId, sourceIp, createdAt], map: "idx_vl_sybil_ip")
  @@index([providerNpi, planId, submittedBy, createdAt], map: "idx_vl_sybil_email")

  @@map("verification_logs")
}
```

These indexes ensure that the `findFirst` queries in `checkSybilAttack()` can use index scans rather than full table scans, even when the verification log table grows to millions of rows.

### Integration in Submit Flow

The sybil check is called as Step 2 in the `submitVerification()` function, immediately after validating that the provider and plan exist:

```typescript
export async function submitVerification(input: SubmitVerificationInput) {
  // Step 1: Validate provider and plan exist
  const { providerNpi, planId: validPlanId } = await validateProviderAndPlan(npi, planId);

  // Step 2: Check for Sybil attack patterns
  await checkSybilAttack(providerNpi, validPlanId, sourceIp, submittedBy);

  // Step 3-5: Proceed with verification creation...
}
```

---

## Middleware Chain Order

The route definitions in `packages/backend/src/routes/verify.ts` show the exact order in which protection layers are applied:

### POST /api/v1/verify (Submit Verification)

```
Request -> verificationRateLimiter -> honeypotCheck('website') -> verifyCaptcha -> [Handler -> checkSybilAttack()]
```

1. **Rate Limiter** (Layer 1) -- blocks if IP exceeds 10/hour
2. **Honeypot** (Layer 2) -- catches bots that auto-fill hidden fields
3. **CAPTCHA** (Layer 3) -- verifies reCAPTCHA v3 score >= 0.5
4. **Sybil Check** (Layer 5) -- called inside the handler; blocks duplicate IP/email within 30 days

### POST /api/v1/verify/:verificationId/vote (Vote)

```
Request -> voteRateLimiter -> honeypotCheck('website') -> verifyCaptcha -> [Handler -> voteOnVerification()]
```

1. **Rate Limiter** (Layer 1) -- blocks if IP exceeds 10/hour
2. **Honeypot** (Layer 2) -- catches bots that auto-fill hidden fields
3. **CAPTCHA** (Layer 3) -- verifies reCAPTCHA v3 score >= 0.5
4. **Vote Dedup** (Layer 4) -- called inside the handler; unique constraint prevents duplicate votes

---

## Additional Security Measures

### PII Stripping

The `stripVerificationPII()` function removes sensitive fields (`sourceIp`, `userAgent`, `submittedBy`) from API responses, preventing attackers from discovering what identifiers the system tracks:

```typescript
function stripVerificationPII<T extends Record<string, unknown>>(
  verification: T
): Omit<T, 'sourceIp' | 'userAgent' | 'submittedBy'> {
  const { sourceIp, userAgent, submittedBy, ...safe } = verification;
  return safe;
}
```

This function is applied in:
- `submitVerification()` return value
- `voteOnVerification()` return value
- `getRecentVerifications()` uses a Prisma `select` clause that excludes PII fields entirely
- `getVerificationsForPair()` uses a Prisma `select` clause that excludes PII fields entirely

### Consensus Requirements for Status Changes

Even if an attacker manages to submit verifications, the system requires strong consensus before changing a provider's acceptance status. From `determineAcceptanceStatus()`:

```typescript
const hasClearMajority = acceptedCount > notAcceptedCount * 2 || notAcceptedCount > acceptedCount * 2;
const shouldUpdateStatus =
  verificationCount >= MIN_VERIFICATIONS_FOR_CONSENSUS &&  // >= 3 verifications
  confidenceScore >= MIN_CONFIDENCE_FOR_STATUS_CHANGE &&   // >= 60 confidence
  hasClearMajority;                                         // 2:1 ratio required
```

This means:
- A minimum of **3 verifications** is required before any status change (based on Mortensen et al. 2015 research)
- The confidence score must be at least **60** (out of 100)
- A clear **2:1 majority** is required (e.g., 3 accepts vs 1 reject would not trigger a change)
- New records start as **PENDING** rather than immediately reflecting the submitted status

### Verification TTL

Verifications expire after 6 months (180 days), based on research showing 12% annual provider turnover. This limits the long-term impact of any successful attack:

```typescript
export const VERIFICATION_TTL_MS = 6 * 30 * MS_PER_DAY; // ~180 days
```

### Input Validation

All inputs are validated through Zod schemas before reaching any business logic:
- `npi` -- validated as a 10-digit NPI number
- `planId` -- validated against a schema
- `vote` -- restricted to enum `['up', 'down']`
- `submittedBy` -- validated as email format, max 200 characters
- `notes` -- max 1000 characters
- `evidenceUrl` -- validated as URL format, max 500 characters

---

## Attack Scenarios & Mitigations

### Scenario 1: Bot Spam

**Attack:** An automated script sends 1000 verifications per minute.

**Defense sequence:**
1. Rate limiter blocks after 10 requests in the first minute (Layer 1)
2. If the bot fills the honeypot field, it gets a fake 200 OK immediately (Layer 2)
3. reCAPTCHA v3 detects automated behavior and assigns low scores (Layer 3)
4. Even if some get through, the 30-day window blocks duplicates for the same NPI+plan (Layer 5)

**Result:** Maximum 10 verifications per hour per IP. Each requires passing CAPTCHA, and duplicates for the same provider-plan pair are blocked for 30 days.

### Scenario 2: Vote Manipulation

**Attack:** Same user votes 100 times on their own verification to inflate its credibility.

**Defense sequence:**
1. Rate limiter blocks after 10 vote requests per hour (Layer 1)
2. Database unique constraint `@@unique([verificationId, sourceIp])` blocks duplicate votes (Layer 4)
3. User can change their vote direction but cannot add additional votes

**Result:** Only 1 vote counted per IP per verification. Vote direction can change but count stays at 1.

### Scenario 3: VPN/Proxy IP Rotation

**Attack:** Attacker rotates through 100 VPN IP addresses to bypass IP-based limits.

**Defense sequence:**
1. Each new IP is still limited to 10/hour (Layer 1)
2. CAPTCHA score may detect suspicious behavioral patterns across IPs (Layer 3)
3. If the same email is used, the email-based sybil check catches it (Layer 5)
4. Consensus thresholds require a 2:1 ratio and 3+ verifications, limiting impact

**Result:** Maximum 1000 verifications/hour across 100 IPs (10 per IP). Each requires passing CAPTCHA. Email deduplication catches coordinated attacks using the same identity. The consensus requirement makes it difficult to flip a provider's status.

### Scenario 4: Coordinated Attack (Multiple Real Users)

**Attack:** Multiple real people coordinate to submit false verifications for a provider.

**Defense sequence:**
1. Each person is limited to 10/hour and 1 per provider-plan per 30 days (Layers 1, 5)
2. Conflicting verifications (some saying ACCEPTED, others NOT_ACCEPTED) result in low confidence scores and weak consensus
3. The 2:1 majority requirement means a few attackers cannot override legitimate data
4. Anomalous patterns are detectable in logs (many verifications from different IPs for the same provider in a short period)

**Result:** Attacks are visible in the data. Low agreement scores suppress confidence. Manual review can catch coordinated patterns.

---

## Monitoring Queries

### IPs with Suspicious Verification Volume

```sql
SELECT source_ip, COUNT(*) as count
FROM verification_logs
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY source_ip
HAVING COUNT(*) > 20
ORDER BY count DESC;
```

### Provider-Plans with Conflicting Verifications

```sql
SELECT provider_npi, plan_id,
       SUM(CASE WHEN new_value->>'acceptanceStatus' = 'ACCEPTED' THEN 1 ELSE 0 END) as accepts,
       SUM(CASE WHEN new_value->>'acceptanceStatus' = 'NOT_ACCEPTED' THEN 1 ELSE 0 END) as rejects
FROM verification_logs
GROUP BY provider_npi, plan_id
HAVING SUM(CASE WHEN new_value->>'acceptanceStatus' = 'ACCEPTED' THEN 1 ELSE 0 END) > 0
   AND SUM(CASE WHEN new_value->>'acceptanceStatus' = 'NOT_ACCEPTED' THEN 1 ELSE 0 END) > 0;
```

### Honeypot Trigger Frequency

Monitor `Honeypot triggered -- likely bot` log entries by querying structured logs for entries with the `Honeypot triggered` message. The log includes `ip`, `field`, and `path` for forensic analysis.

### CAPTCHA Failure Rate

Monitor logs for `CAPTCHA low score - possible bot` (score-based rejections) and `CAPTCHA Google API error` (API failures triggering fallback mode). High volumes of either indicate potential attack activity or service degradation.

---

## Metrics (Operational)

The following metrics should be monitored in production:

- **Verifications blocked (rate limit):** Count of 429 responses from `verificationRateLimiter`
- **Votes blocked (duplicate):** Count of 409 responses from `voteOnVerification()` conflict detection
- **CAPTCHA failures:** Count of 403 responses from `verifyCaptcha` low-score rejections
- **Honeypot triggers:** Count of fake 200 OK responses from `honeypotCheck`
- **Sybil blocks:** Count of 409 responses from `checkSybilAttack()` (IP and email duplicates)
- **CAPTCHA degraded mode:** Count of requests allowed with `X-Security-Degraded` header

---

## Issues

### Not Yet Implemented

1. **Suspicious pattern monitoring queries** -- The SQL queries exist in documentation but are not yet automated as scheduled jobs or dashboard queries.
2. **Alerting on high volumes** -- No automated alerting when suspicious patterns are detected (e.g., many verifications from a single IP, sudden spike in honeypot triggers).
3. **Admin review queue** -- No admin interface for reviewing flagged verifications or disputed provider-plan pairs.

### Known Limitations

1. **IP-based only:** All five layers use IP addresses as the primary identity signal. Users behind shared NAT (corporate networks, universities) may be unfairly limited. Users with rotating IPs (mobile networks) may bypass some protections.
2. **No VPN/proxy detection:** The system does not check incoming IPs against known VPN, proxy, or Tor exit node lists. An attacker with access to VPN services can rotate IPs freely.
3. **CAPTCHA dependency on Google:** The CAPTCHA layer depends on Google's reCAPTCHA API. During Google outages, fail-open mode reduces the CAPTCHA layer to a stricter rate limit (3/hour vs 10/hour), but does not block entirely.
4. **Email is optional:** The `submittedBy` field is optional in the verification schema. If no email is provided, the email-based sybil check is skipped entirely, leaving only IP-based deduplication.
5. **No device fingerprinting:** The system does not use browser fingerprinting or device-level identifiers to detect unique users.

---

## Recommendations

### Short-Term

1. **Make `submittedBy` (email) required** for verification submissions to ensure both IP and email sybil checks always run. This adds friction but significantly strengthens the email deduplication layer.
2. **Implement automated suspicious pattern queries** as a daily cron job that writes results to the `DataQualityAudit` table or a dedicated alerts table.
3. **Add VPN/proxy detection** using a service like IPQualityScore, IP2Location, or MaxMind to flag requests from known VPN/proxy/Tor IPs. These requests could receive stricter rate limits or require additional verification.

### Medium-Term

4. **Build an admin review queue** for disputed verifications -- provider-plan pairs where conflicting data exists (both ACCEPTED and NOT_ACCEPTED verifications) should surface for manual review.
5. **Implement reputation scoring** for submitters. Track accuracy over time (how often a user's verifications align with consensus). Weight verifications from trusted users higher in the confidence score calculation.
6. **Add device fingerprinting** as a supplementary identity signal, using libraries like FingerprintJS, to detect repeat users across IP changes.

### Long-Term

7. **Require email verification** (confirmation link) before counting a verification, eliminating fake email submissions entirely.
8. **Implement progressive trust** -- new users start with lower submission limits (e.g., 3/hour) that increase as their verification history proves reliable.
9. **Add geographic consistency checks** -- flag verifications where the submitter's IP geolocation is far from the provider's practice location, as these may be less likely to represent genuine patient experiences.

---

## Source Files Reference

| File | Purpose |
|------|---------|
| `packages/backend/src/middleware/rateLimiter.ts` | Dual-mode (Redis/memory) sliding window rate limiters |
| `packages/backend/src/middleware/honeypot.ts` | Hidden form field bot detection |
| `packages/backend/src/middleware/captcha.ts` | Google reCAPTCHA v3 with fail-open/fail-closed modes |
| `packages/backend/src/middleware/errorHandler.ts` | `AppError` class with typed HTTP status helpers |
| `packages/backend/src/services/verificationService.ts` | `checkSybilAttack()`, `submitVerification()`, `voteOnVerification()` |
| `packages/backend/src/services/confidenceService.ts` | Confidence scoring with agreement ratio calculations |
| `packages/backend/src/config/constants.ts` | All tunable constants (windows, thresholds, timeouts) |
| `packages/backend/src/routes/verify.ts` | Route definitions with middleware chain ordering |
| `packages/backend/src/lib/redis.ts` | Redis singleton client for distributed rate limiting |
| `prisma/schema.prisma` | Database schema with sybil prevention indexes and unique constraints |
