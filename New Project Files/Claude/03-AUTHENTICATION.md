# Authentication Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/03-authentication.md
**Status:** Partially implemented -- Admin auth is solid; public endpoints remain unauthenticated by design (Phase 1)

---

## Findings

### 1. Current State (No Authentication)

- **All endpoints are public:**
  Verified. All routes under `/api/v1/providers`, `/api/v1/plans`, and `/api/v1/verify` have no authentication middleware. The only authenticated routes are under `/api/v1/admin/*`.

- **No JWT, no sessions, no cookies:**
  Verified. Grep across the entire backend `src/` directory confirms zero usage of cookies, sessions, JWTs, or any token-based auth for public endpoints. The `cors()` config sets `credentials: true` (which enables cookies in CORS preflight), but no cookies are actually set or read anywhere.

- **Verifications are anonymous:**
  Verified. `POST /api/v1/verify` accepts an optional `submittedBy` (email) field, but it is not required. Verifications and votes are tracked by IP address, not by authenticated user identity.

- **No user accounts exist:**
  Verified. The Prisma schema has no User model, no password fields, no auth tokens table.

**Why Started This Way:**

- **Reduce friction for verifications:**
  Confirmed. The verify endpoint allows immediate anonymous submissions with no signup.

- **Solve cold start problem:**
  Confirmed. Anonymous contributions allow data to flow before a user base is established.

- **Prioritize speed over security initially:**
  Confirmed. Rate limiting and CAPTCHA are the only protection layers.

**Risks:**

- **Spam verifications (CRITICAL):**
  Partially mitigated. Rate limiting is in place: `verificationRateLimiter` (10/hour), `voteRateLimiter` (10/hour), plus CAPTCHA middleware (`verifyCaptcha`) on both `POST /verify` and `POST /verify/:id/vote`. Sybil detection checks for duplicate IP + email within 30 days. However, without auth, a determined attacker can use rotating IPs/proxies to bypass these protections.

- **Vote manipulation:**
  Partially mitigated. Votes are deduplicated by `(verificationId, sourceIp)` unique constraint in the `VoteLog` model. IP-based deduplication is not foolproof against VPN/proxy rotation.

- **No user reputation system:**
  Confirmed. No mechanism to weight contributions by user trust level.

- **Can't offer premium features:**
  Confirmed. No user accounts means no personalization, saved providers, or payment integration.

### 2. Admin Authentication (Implemented)

- **`adminAuthMiddleware` in `routes/admin.ts`:**
  Well implemented. Uses `crypto.timingSafeEqual` for constant-time comparison of the `X-Admin-Secret` header against the `ADMIN_SECRET` environment variable. This prevents timing attacks.

- **Graceful degradation:**
  Verified. If `ADMIN_SECRET` is not configured, admin endpoints return 503 with `ADMIN_NOT_CONFIGURED` code rather than failing open. This is the correct behavior.

- **Protected endpoints (7 total):**
  - `POST /api/v1/admin/cleanup-expired` -- Verified, uses `adminAuthMiddleware`
  - `GET /api/v1/admin/expiration-stats` -- Verified, uses `adminAuthMiddleware`
  - `GET /api/v1/admin/health` -- Verified, uses `adminAuthMiddleware`
  - `POST /api/v1/admin/cache/clear` -- Verified, uses `adminAuthMiddleware`
  - `GET /api/v1/admin/cache/stats` -- Verified, uses `adminAuthMiddleware`
  - `POST /api/v1/admin/cleanup/sync-logs` -- Verified, uses `adminAuthMiddleware`
  - `GET /api/v1/admin/retention/stats` -- Verified, uses `adminAuthMiddleware`

- **Admin auth quality:**
  - Timing-safe comparison: Yes
  - Length check before `timingSafeEqual`: Yes (required since `timingSafeEqual` throws on unequal lengths)
  - Secret via environment variable: Yes
  - No secret in logs: Correct -- the logger only warns when the secret is not configured, never logs the secret value
  - Uses `AppError.unauthorized` for invalid secrets: Yes, returns 401

- **Minor observation:** The `X-Admin-Secret` header is included in the CORS `allowedHeaders` list in `index.ts`, which means browsers can send it cross-origin. This is acceptable since admin operations are likely done via CLI/scheduler, not the browser frontend.

### 3. Planned Authentication Strategy

- **Phase 1 (Before Beta Launch) -- Current state:**
  - No auth: Verified
  - Rate limiting (IP-based): Verified -- default (200/hr), search (100/hr), verification (10/hr), vote (10/hr)
  - Honeypot fields: NOT IMPLEMENTED -- No honeypot fields found in any route handler or frontend code
  - Anonymous contributions: Verified

- **Phase 2 and Phase 3:** Not implemented yet. These are planning items.

### 4. Auth Library Selection

No decision has been made yet. No auth libraries (Passport.js, Auth0, Clerk, etc.) are in `package.json`.

### 5. Integration with OwnMyHealth

No decision documented in code. No shared auth infrastructure exists.

### 6. Session Management

Current: N/A (no sessions). Verified -- no session middleware, no `express-session`, no Redis session store.

### 7. Password Security (Phase 3)

Not applicable yet. No bcrypt or argon2 dependencies found.

### 8. CAPTCHA Implementation (Additional Finding)

The CAPTCHA middleware (`packages/backend/src/middleware/captcha.ts`) is well-designed:
- Uses Google reCAPTCHA v3 with score-based detection (threshold configurable via `CAPTCHA_MIN_SCORE`)
- Configurable fail-open vs fail-closed behavior via `CAPTCHA_FAIL_MODE` env var
- Fallback rate limiting (3 requests/hour) when CAPTCHA API is unavailable in fail-open mode
- Skips in development/test environments
- Applied to both verification and vote endpoints

---

## Summary

The codebase is correctly in **Phase 1** of the authentication roadmap. Admin endpoints have strong header-based authentication with timing-safe secret comparison. All public-facing endpoints are unauthenticated by design, relying instead on IP-based rate limiting (sliding window algorithm, dual-mode Redis/in-memory), CAPTCHA verification, and Sybil attack detection as anti-abuse measures.

The implementation quality of what exists is high: timing-safe comparisons, proper error handling, graceful degradation when services are unconfigured. The main gaps are the planned but unimplemented items: honeypot fields, email verification, and user accounts.

---

## Recommendations

1. **Implement honeypot fields (Phase 1 gap):** The prompt checklist lists honeypot fields as a Phase 1 item, but they are not implemented. Add hidden form fields to the verification and vote submission forms that bots will fill in but real users won't.

2. **Document admin secret rotation procedure:** The admin auth works well, but there is no documented process for rotating the `ADMIN_SECRET`. Consider adding a runbook or admin guide.

3. **Consider admin auth rate limiting:** The admin routes use `adminAuthMiddleware` but do not have their own rate limiter. A brute-force attack against the admin secret header is theoretically possible. Add a strict rate limiter (e.g., 5 requests per minute) to the `/api/v1/admin/*` path.

4. **Evaluate `credentials: true` in CORS:** The CORS configuration enables `credentials: true`, which allows cookies to be sent cross-origin. Since no cookies are currently used, this setting has no security impact now but should be reviewed when auth is added.

5. **Plan Phase 2 timeline:** Rate limiting + CAPTCHA provide reasonable protection for a low-traffic beta, but spam risk will grow with traffic. Prioritize lightweight email verification before public launch.

6. **Track auth library decision:** The prompt lists several options (Passport.js, Auth0, Clerk, Firebase Auth, roll-your-own). Make this decision before Phase 2 implementation begins to avoid rework.
