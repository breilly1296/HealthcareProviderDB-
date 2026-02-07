# VerifyMyProvider Authentication

**Last Updated:** 2026-02-07
**Current State:** No user authentication (all public endpoints are anonymous)
**Admin State:** Header-based secret authentication for admin endpoints (9 endpoints)
**Security Risk:** High (spam and vote manipulation vulnerability on public endpoints)

---

## Current State

### No User Authentication

VerifyMyProvider currently operates with **zero user authentication** on all consumer-facing endpoints. There are no JWT tokens, no sessions, no cookies, and no user accounts. Every API endpoint under `/api/v1/providers`, `/api/v1/plans`, `/api/v1/verify`, and `/api/v1/locations` is fully public and anonymous.

The frontend (`packages/frontend/src/lib/api.ts`) makes plain `fetch` calls to the backend with no authentication headers:

```typescript
// packages/frontend/src/lib/api.ts (lines 312-329)
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const response = await fetchWithRetry(
    url,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    },
    retryOptions
  );
  // ...
}
```

There is no `Authorization` header, no bearer token, and no session cookie attached to any request. The CORS configuration in `packages/backend/src/index.ts` does allow `Authorization` in `allowedHeaders`, but it is not currently used by any consumer endpoint:

```typescript
// packages/backend/src/index.ts (lines 83-86)
allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Admin-Secret'],
credentials: true,
```

### Admin Authentication (Implemented January 2026)

The only authenticated endpoints in the system are the 9 admin routes under `/api/v1/admin/*`. These use a custom `adminAuthMiddleware` defined in `packages/backend/src/routes/admin.ts` that validates an `X-Admin-Secret` HTTP header against the `ADMIN_SECRET` environment variable.

**Key security features of admin auth:**

1. **Timing-safe comparison** using `crypto.timingSafeEqual` to prevent timing attacks:

```typescript
// packages/backend/src/routes/admin.ts (lines 22-56)
function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;

  // If ADMIN_SECRET is not configured, disable admin endpoints gracefully
  if (!adminSecret) {
    logger.warn('ADMIN_SECRET not configured - admin endpoints disabled');
    res.status(503).json({
      success: false,
      error: {
        message: 'Admin endpoints not configured. Set ADMIN_SECRET environment variable to enable.',
        code: 'ADMIN_NOT_CONFIGURED',
        statusCode: 503,
      },
    });
    return;
  }

  const providedSecret = req.headers['x-admin-secret'];

  // Use timing-safe comparison to prevent timing attacks
  const providedBuffer = Buffer.from(String(providedSecret || ''));
  const secretBuffer = Buffer.from(adminSecret);

  // timingSafeEqual requires equal length buffers, so check length first
  // Then use constant-time comparison to prevent timing-based secret extraction
  const isValid =
    providedBuffer.length === secretBuffer.length &&
    timingSafeEqual(providedBuffer, secretBuffer);

  if (!isValid) {
    throw AppError.unauthorized('Invalid or missing admin secret');
  }

  next();
}
```

2. **Graceful degradation**: If `ADMIN_SECRET` is not set, admin endpoints return `503 ADMIN_NOT_CONFIGURED` rather than failing silently or allowing unauthenticated access.

3. **All 9 admin endpoints are protected:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/admin/cleanup-expired` | POST | Delete expired verification records |
| `/api/v1/admin/expiration-stats` | GET | View verification expiration statistics |
| `/api/v1/admin/health` | GET | Admin health check with retention metrics |
| `/api/v1/admin/cache/clear` | POST | Clear all cached data |
| `/api/v1/admin/cache/stats` | GET | Cache statistics with hit rate |
| `/api/v1/admin/enrichment/stats` | GET | Location enrichment statistics |
| `/api/v1/admin/cleanup/sync-logs` | POST | Clean up old sync_logs |
| `/api/v1/admin/retention/stats` | GET | Comprehensive retention stats |
| `/api/v1/admin/recalculate-confidence` | POST | Recalculate confidence scores with decay |

### Why No User Auth Initially

The decision to launch without user authentication was intentional and follows a deliberate strategy:

- **Reduce friction for verifications:** The core product value is community-submitted insurance verification data. Requiring login would dramatically reduce the number of contributions during the critical early phase.
- **Solve the cold-start problem:** VerifyMyProvider needs data to be useful. Making it as easy as possible to submit verifications gets data flowing into the system faster.
- **Prioritize speed over security initially:** The project follows an iterative approach, adding security layers as needed rather than building everything upfront.

### Risks of No Authentication

| Risk | Severity | Current Mitigation |
|------|----------|-------------------|
| Spam verifications | **CRITICAL** | Rate limiting (10/hour), honeypot, reCAPTCHA v3, Sybil prevention |
| Vote manipulation | **HIGH** | Rate limiting (10/hour), honeypot, reCAPTCHA v3, IP-based duplicate vote prevention |
| No user reputation system | MEDIUM | Confidence scoring algorithm with time decay |
| Cannot offer premium features | LOW | N/A - not needed yet |
| Data quality concerns | MEDIUM | Consensus thresholds (min 3 verifications, min 60 confidence) |

---

## Existing Security Layers (Pre-Authentication)

Despite having no user authentication, the application implements several security mechanisms that serve as the current defense-in-depth strategy.

### 1. Rate Limiting (Dual-Mode)

Defined in `packages/backend/src/middleware/rateLimiter.ts`, the rate limiter automatically selects between Redis-based (distributed) and in-memory (single-instance) implementations based on whether `REDIS_URL` is configured.

**Algorithm:** Sliding window (not fixed window) to prevent burst attacks at window boundaries.

```typescript
// packages/backend/src/middleware/rateLimiter.ts (lines 329-367)
// Default: 200 requests per hour
export const defaultRateLimiter = createRateLimiter({
  name: 'default',
  windowMs: 60 * 60 * 1000,
  maxRequests: 200,
});

// Verifications: 10 requests per hour (strict)
export const verificationRateLimiter = createRateLimiter({
  name: 'verification',
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
});

// Votes: 10 requests per hour (strict)
export const voteRateLimiter = createRateLimiter({
  name: 'vote',
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
});

// Search: 100 requests per hour
export const searchRateLimiter = createRateLimiter({
  name: 'search',
  windowMs: 60 * 60 * 1000,
  maxRequests: 100,
});
```

**Rate limits by endpoint category:**

| Category | Limit | Window | Endpoints |
|----------|-------|--------|-----------|
| Default | 200 req | 1 hour | GET routes (stats, recent, cities, meta) |
| Search | 100 req | 1 hour | Provider search, plan search, location search |
| Verification | 10 req | 1 hour | POST /verify |
| Vote | 10 req | 1 hour | POST /verify/:id/vote |

**Fail-open behavior:** If Redis becomes unavailable, requests are allowed with a warning logged. This prioritizes availability over strict rate enforcement.

### 2. Honeypot Bot Detection

Defined in `packages/backend/src/middleware/honeypot.ts`, a hidden form field (`website`) is included in verification and vote submission forms. Real users never fill it in, but automated bots typically do.

```typescript
// packages/backend/src/middleware/honeypot.ts (lines 11-25)
export function honeypotCheck(fieldName: string = 'website') {
  return (req: Request, res: Response, next: NextFunction) => {
    const honeypotValue = req.body?.[fieldName];
    if (honeypotValue) {
      logger.warn({
        ip: req.ip,
        field: fieldName,
        path: req.path,
      }, 'Honeypot triggered - likely bot');
      // Return 200 to not alert the bot that it was caught
      return res.json({ success: true, data: { id: 'submitted' } });
    }
    next();
  };
}
```

Key design: Returns `200 OK` with a fake success response to avoid tipping off the bot.

Applied to:
- `POST /api/v1/verify` (verification submissions)
- `POST /api/v1/verify/:verificationId/vote` (votes)

The frontend schema explicitly defines the honeypot field:

```typescript
// packages/backend/src/routes/verify.ts (lines 31, 37)
website: z.string().optional(), // honeypot field - should always be empty
```

### 3. Google reCAPTCHA v3

Defined in `packages/backend/src/middleware/captcha.ts`, this middleware verifies a `captchaToken` from the request body or `x-captcha-token` header against Google's reCAPTCHA v3 API.

**Configuration constants** (from `packages/backend/src/config/constants.ts`):

| Constant | Value | Purpose |
|----------|-------|---------|
| `CAPTCHA_MIN_SCORE` | 0.5 | Minimum score (0.0 = bot, 1.0 = human) |
| `CAPTCHA_API_TIMEOUT_MS` | 5000ms | Timeout for Google API calls |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | 3 | Stricter limit when CAPTCHA is unavailable |
| `CAPTCHA_FALLBACK_WINDOW_MS` | 1 hour | Fallback rate limit window |

**Fail-mode behavior** (configurable via `CAPTCHA_FAIL_MODE` environment variable):

- **`open` (default):** Allows requests through when Google API fails, but applies stricter fallback rate limiting (3/hour instead of normal 10/hour)
- **`closed`:** Blocks all requests when Google API is unavailable (higher security, lower availability)

**Graceful degradation chain:**
1. Skips entirely in `development` and `test` environments
2. Skips with warning if `RECAPTCHA_SECRET_KEY` is not configured
3. On Google API failure: behavior depends on `CAPTCHA_FAIL_MODE`
4. On low score (< 0.5): Returns `403 Forbidden` ("suspicious activity")

Applied to the same endpoints as honeypot:
- `POST /api/v1/verify` (verification submissions)
- `POST /api/v1/verify/:verificationId/vote` (votes)

### 4. Sybil Attack Prevention

Defined in `packages/backend/src/services/verificationService.ts`, the system prevents duplicate verifications from the same source within a 30-day window.

**Two checks run for each verification:**

1. **IP-based:** Has this IP already verified this exact provider-plan pair within 30 days?
2. **Email-based:** Has this email already verified this exact provider-plan pair within 30 days?

```typescript
// packages/backend/src/config/constants.ts (lines 22-26)
export const SYBIL_PREVENTION_WINDOW_MS = 30 * MS_PER_DAY;
```

**Database indexes support efficient Sybil checks:**

```prisma
// packages/backend/prisma/schema.prisma (lines 239-240)
@@index([providerNpi, planId, submittedBy, createdAt], map: "idx_vl_sybil_email")
@@index([providerNpi, planId, sourceIp, createdAt], map: "idx_vl_sybil_ip")
```

**Vote deduplication:** Votes use a unique constraint on `(verificationId, sourceIp)` in the `vote_logs` table, preventing the same IP from voting twice on the same verification. Vote changes (up to down, or down to up) are allowed.

### 5. PII Stripping

The verification service explicitly strips sensitive fields before returning data to clients:

```typescript
// packages/backend/src/services/verificationService.ts (lines 305-309)
function stripVerificationPII<T extends Record<string, unknown>>(
  verification: T
): Omit<T, 'sourceIp' | 'userAgent' | 'submittedBy'> {
  const { sourceIp, userAgent, submittedBy, ...safe } = verification;
  return safe;
}
```

### 6. Additional Security Headers (Helmet)

The backend uses Helmet with a strict Content Security Policy (`packages/backend/src/index.ts`, lines 47-67):

- `defaultSrc: ["'none'"]` -- deny all by default
- `scriptSrc: ["'none'"]` -- no scripts (JSON API only)
- `frameAncestors: ["'none'"]` -- cannot be embedded in iframes
- `upgradeInsecureRequests: []` -- force HTTPS
- Cross-Origin policies: `same-origin` for embedder, opener, and resource
- Referrer policy: `no-referrer`

### 7. Request Size Limits

```typescript
// packages/backend/src/index.ts (lines 89-90)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
```

Payloads exceeding 100KB are rejected with a `413 Payload Too Large` error.

### 8. Request Timeouts

```typescript
// packages/backend/src/middleware/requestTimeout.ts (lines 42-44)
export const generalTimeout = requestTimeout(30_000);   // 30s for general API
export const searchTimeout = requestTimeout(15_000);     // 15s for search
export const adminTimeout = requestTimeout(120_000);     // 2 min for admin ops
```

### 9. CORS Configuration

```typescript
// packages/backend/src/index.ts (lines 23-28)
const ALLOWED_ORIGINS: string[] = [
  'https://verifymyprovider.com',
  'https://www.verifymyprovider.com',
  'https://verifymyprovider-frontend-741434145252.us-central1.run.app',
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));
```

In development, `localhost:3000` and `localhost:3001` are also allowed. Blocked CORS attempts are logged for monitoring.

### 10. Frontend API Route Protection

The Next.js frontend has its own API route (`/api/insurance-card/extract`) for insurance card OCR via Claude. This route has independent rate limiting:

```typescript
// packages/frontend/src/app/api/insurance-card/extract/route.ts (lines 28-29)
const RATE_LIMIT_PER_HOUR = 10; // 10 extractions per hour per IP
```

---

## Middleware Execution Order for Write Endpoints

For verification and vote submission endpoints, the middleware chain enforces security in this order:

```
Request
  -> requestIdMiddleware (correlate logs)
  -> httpLogger (log request)
  -> helmet (security headers)
  -> cors (origin validation)
  -> express.json (body parsing, 100kb limit)
  -> defaultRateLimiter (200/hour global)
  -> generalTimeout (30s)
  -> verificationRateLimiter or voteRateLimiter (10/hour)
  -> honeypotCheck('website') (bot detection)
  -> verifyCaptcha (reCAPTCHA v3 verification)
  -> route handler (Zod validation + Sybil prevention + business logic)
```

---

## Authentication Roadmap

### Phase 1: No Auth (Current)

**Timeline:** Launch through initial beta
**Status:** Active

**Features:**
- All consumer endpoints are public and anonymous
- Admin endpoints secured with `X-Admin-Secret` header
- No user accounts, no sessions, no cookies

**Security (current):**
- IP-based rate limiting (sliding window, dual-mode Redis/memory)
- Honeypot fields on write endpoints
- Google reCAPTCHA v3 on write endpoints
- Sybil attack prevention (30-day IP/email deduplication window)
- Consensus thresholds (min 3 verifications, min 60 confidence score)
- PII stripping on all verification responses
- Strict CORS, CSP, and Helmet headers
- Request size limits (100kb) and timeouts (15-30s)

### Phase 2: Lightweight Auth (Beta Launch)

**Timeline:** Before or at beta launch
**Status:** Planned

**Features:**
- Lightweight email verification (not full accounts)
- Optional accounts -- not required for basic usage
- One verification per email per provider/plan pair
- CAPTCHA on anonymous submissions (already partially implemented)
- Progressive disclosure: anonymous -> email -> full account

**Implementation (planned):**

```typescript
// Email verification only
POST /auth/verify-email
{
  email: "user@example.com"
}
// Returns: verification code via email

POST /providers/:npi/verify
{
  npi: "1234567890",
  planId: "BCBS_FL_PPO",
  accepted: true,
  verificationCode: "123456" // optional, if user wants to be identified
}
```

**Proposed verification limits:**

| User Type | Verifications/Day |
|-----------|-------------------|
| Anonymous | 5 |
| Email Verified | 20 |
| Full Account | 50 |

**Infrastructure needed:**
- Redis for verification code storage (15 min TTL)
- Email sending service (SES, SendGrid, or similar)
- No persistent sessions needed

### Phase 3: Full Auth (Scale)

**Timeline:** When scaling requires it
**Status:** Planned

**Features:**
- Full user accounts (email/password)
- OAuth (Google, Facebook) optional
- Phone verification for high-value actions
- User reputation system
- Premium features (saved providers, alerts)
- API keys for B2B customers

**Implementation (planned):**

```typescript
// JWT-based authentication
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout

// Protected endpoints
GET /users/me
GET /users/me/verifications
PUT /users/me/settings
```

**Session management (planned):**
- JWT access tokens (15 min expiration)
- JWT refresh tokens (7 day expiration)
- HttpOnly cookies (no localStorage)
- CSRF protection

**Password security (planned):**
- bcrypt hashing (cost factor >= 10)
- Password requirements (8+ chars, complexity)
- Rate-limited login attempts
- Password reset flow via email
- No password in logs

---

## Technical Implementation Plan

### Auth Library Choice

**Decision needed.** Options under consideration:

| Library | Pros | Cons | Cost |
|---------|------|------|------|
| Passport.js | Flexible, mature, many strategies | More configuration | Free |
| Auth0 | Managed, secure, fast to integrate | Expensive at scale | $$$ |
| Clerk | Modern, good DX, React components | Vendor lock-in | $$ |
| Firebase Auth | Google ecosystem, free tier | Google dependency | Free-$ |
| Roll own (JWT + bcrypt) | Full control, no vendor lock-in | More work, security risk | Free |

**Decision criteria:**
- Cost (low budget project)
- Complexity (need development speed)
- Integration with future OwnMyHealth product (shared SSO?)

### Session Management

**Current:** N/A (no sessions). The frontend uses `sessionStorage` only for the provider comparison feature (`CompareContext.tsx`), which is purely client-side and contains no authentication state.

**Phase 2:** Verification codes stored in Redis with 15 min TTL. No persistent sessions.

**Phase 3:** JWT tokens in HttpOnly cookies with CSRF protection.

---

## Integration with OwnMyHealth

**Decision needed.** Two approaches under consideration:

### Option A: Shared Authentication
- **Pros:** Seamless user experience, single account across products
- **Cons:** Tighter coupling, more complex architecture
- **Implementation:** Shared JWT secret, same auth service

### Option B: Separate Authentication
- **Pros:** Simple, products are independent
- **Cons:** Users need two accounts
- **Implementation:** Link accounts via email matching

---

## Anonymous vs Authenticated Verifications

**Current strategy:** All verifications are anonymous, with IP-based tracking for Sybil prevention and rate limiting.

**Proposed graduated system:**

| User Type | Verifications/Day | Additional Privileges |
|-----------|-------------------|-----------------------|
| Anonymous | 5 | Basic search, view scores |
| Email Verified | 20 | Identified contributions |
| Full Account | 50 | Save providers, alerts, export |

**Trade-off analysis:**
- Requiring auth reduces spam but increases friction (fewer contributions)
- The cold-start problem means friction is especially costly early on
- Current mitigations (rate limiting + honeypot + CAPTCHA + Sybil prevention) provide reasonable protection for the beta phase

---

## Premium Features (Phase 3)

**Free Tier:**
- Basic search and provider lookup
- View confidence scores
- Anonymous verifications (limited)
- Insurance card scanning (10/hour)

**Pro Tier ($4.99/month):**
- Unlimited verifications
- Save favorite providers
- Email alerts on provider changes
- Export to calendar/contacts
- Priority support

**Requirements:**
- User accounts (Phase 3)
- Payment integration (Stripe recommended)

---

## Endpoint Authentication Summary

| Route Pattern | Auth Required | Protection Layers |
|---------------|---------------|-------------------|
| `GET /health` | None | None (monitoring) |
| `GET /api/v1/providers/*` | None | Default rate limit (200/hr), search rate limit (100/hr) |
| `GET /api/v1/plans/*` | None | Default rate limit (200/hr), search rate limit (100/hr) |
| `GET /api/v1/locations/*` | None | Default rate limit (200/hr), search rate limit (100/hr) |
| `GET /api/v1/verify/*` | None | Default rate limit (200/hr) |
| `POST /api/v1/verify` | None | Verification rate limit (10/hr) + honeypot + CAPTCHA + Sybil prevention |
| `POST /api/v1/verify/:id/vote` | None | Vote rate limit (10/hr) + honeypot + CAPTCHA + IP dedup |
| `* /api/v1/admin/*` | X-Admin-Secret header | Timing-safe secret comparison + admin timeout (2 min) |
| `POST /api/insurance-card/extract` | None | Frontend rate limit (10/hr) + payload validation |

---

## Next Steps

1. **Immediate (before beta launch):**
   - [ ] Verify reCAPTCHA v3 is fully operational in production (currently skips if `RECAPTCHA_SECRET_KEY` is not set)
   - [ ] Monitor honeypot trigger rates and rate limit hits to assess spam levels
   - [ ] Ensure `ADMIN_SECRET` is configured in all deployed environments
   - [ ] Consider `CAPTCHA_FAIL_MODE=closed` for production to prevent bypass during Google outages

2. **Short-term (beta launch):**
   - [ ] Implement email verification flow (Phase 2)
   - [ ] Add per-email rate limiting tiers (anonymous: 5/day, verified: 20/day)
   - [ ] Select auth library (Passport.js recommended for flexibility and cost)
   - [ ] Add CSRF protection for any cookie-based flows
   - [ ] Create user table in PostgreSQL schema

3. **Long-term (scale):**
   - [ ] Implement full JWT-based authentication (Phase 3)
   - [ ] Add OAuth providers (Google, Facebook)
   - [ ] Build user reputation system based on verification history
   - [ ] Implement premium tier with payment integration
   - [ ] Decide on shared vs. separate auth with OwnMyHealth
   - [ ] Add API key management for B2B partners
