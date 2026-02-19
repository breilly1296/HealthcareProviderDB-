# Authentication Review

**Generated:** 2026-02-18
**Prompt:** 03-authentication.md
**Status:** VERIFIED -- Authentication system is fully implemented with passwordless magic link flow, JWT access tokens, rotated refresh tokens, CSRF protection, dual-mode rate limiting, and admin header-based auth. All checklist items confirmed against source code.

---

## Files Reviewed

| File | Purpose | Lines |
|------|---------|-------|
| `packages/backend/src/routes/auth.ts` | Auth route handlers | 224 lines |
| `packages/backend/src/middleware/auth.ts` | `extractUser` + `requireAuth` middleware | 110 lines |
| `packages/backend/src/services/authService.ts` | Auth business logic | 461 lines |
| `packages/backend/src/middleware/csrf.ts` | CSRF double-submit cookie | 31 lines |
| `packages/backend/src/middleware/rateLimiter.ts` | Rate limiting (Redis + in-memory) | 379 lines |
| `packages/backend/src/config/constants.ts` | Auth constants | 120 lines |
| `packages/backend/src/routes/admin.ts` | Admin auth middleware | 682 lines |
| `packages/backend/src/routes/index.ts` | Route mounting with CSRF | 24 lines |
| `packages/backend/src/routes/savedProviders.ts` | Saved providers (requireAuth) | 101 lines |
| `packages/backend/src/routes/insuranceCard.ts` | Insurance card CRUD (requireAuth) | 231 lines |
| `packages/backend/prisma/schema.prisma` | User, Session, MagicLinkToken models | 460 lines |
| `packages/backend/src/index.ts` | Global middleware chain | 255 lines |
| `packages/frontend/src/lib/api.ts` | Frontend CSRF + auth integration | 881 lines |

---

## Architecture Overview

Two independent authentication systems confirmed:

### 1. Admin Authentication (X-Admin-Secret Header)

**VERIFIED** in `routes/admin.ts` lines 24-58.

- `adminAuthMiddleware` function validates `X-Admin-Secret` header
- Returns 503 if `ADMIN_SECRET` env var is not set (graceful disable)
- Uses `crypto.timingSafeEqual` for timing-attack prevention (line 51)
- Length check before `timingSafeEqual` (line 49: `providedBuffer.length === secretBuffer.length`)
- Returns 401 via `AppError.unauthorized()` on mismatch
- Applied to all 11 admin endpoints

### 2. User Authentication (Passwordless Magic Link)

**VERIFIED** across `routes/auth.ts`, `services/authService.ts`, and `middleware/auth.ts`.

---

## Magic Link Flow (Verified Step-by-Step)

### Step 1: Request Magic Link

**`POST /api/v1/auth/magic-link`** -- `routes/auth.ts` lines 84-98

1. **CSRF protection** -- `csrfProtection` middleware applied (line 86). VERIFIED.
2. **Rate limiting** -- `magicLinkRateLimiter` applied (line 87). 5 req / 15 min per IP. VERIFIED in `rateLimiter.ts` lines 373-378.
3. **Email validation** -- `z.string().email().max(255)` via Zod (line 25). VERIFIED.
4. **Email normalization** -- `toLowerCase().trim()` in `authService.ts` line 70. VERIFIED.
5. **Per-email rate limit** -- Max 5 tokens per email per hour. DB count query on `magic_link_tokens` with `createdAt >= oneHourAgo` (`authService.ts` lines 73-85). VERIFIED.
6. **Token generation** -- `randomBytes(32).toString('hex')` = 64-char hex (`authService.ts` line 88). VERIFIED.
7. **Token storage** -- Created in `magic_link_tokens` table with 15-minute expiry (`authService.ts` lines 91-97). VERIFIED.
8. **Link construction** -- `{MAGIC_LINK_BASE_URL}/api/v1/auth/verify?token={token}` (`authService.ts` line 102). VERIFIED.
9. **Email delivery** -- Via Resend API from `login@verifymyprovider.com` (`authService.ts` lines 105-145). VERIFIED. Graceful skip with warning if `RESEND_API_KEY` not set.
10. **Enumeration prevention** -- Always returns `{ success: true }` regardless of email validity (`authService.ts` line 147, `routes/auth.ts` lines 93-96). VERIFIED.

### Step 2: Verify Token

**`GET /api/v1/auth/verify?token=`** -- `routes/auth.ts` lines 108-131

1. **Token parsing** -- Zod validation with `safeParse` (`routes/auth.ts` lines 110-114). VERIFIED.
2. **Token lookup** -- `prisma.magicLinkToken.findUnique({ where: { token } })` (`authService.ts` line 157). Uses unique index on `token` column. VERIFIED.
3. **Rejection checks** -- Not found, already used (`usedAt` not null), or expired (`expiresAt < now`) (`authService.ts` lines 160-169). VERIFIED.
4. **Mark token used** -- `usedAt = new Date()` (`authService.ts` lines 173-176). VERIFIED.
5. **User upsert** -- `prisma.user.upsert` by email. Creates new user or updates `emailVerified` timestamp (`authService.ts` lines 179-188). VERIFIED.
6. **Session limit enforcement** -- If >= 5 sessions, delete oldest to make room (`authService.ts` lines 195-214). VERIFIED. Uses `MAX_SESSIONS_PER_USER` from constants.
7. **Refresh token generation** -- `randomBytes(32).toString('hex')`, stored as SHA-256 hash (`authService.ts` lines 191-192). VERIFIED.
8. **Session creation** -- New session with hashed refresh token, expiry, IP, truncated user agent (`authService.ts` lines 217-225). VERIFIED. User agent truncated to 500 chars (line 223).
9. **Access token signing** -- HS256 JWT via jose `SignJWT`. Claims: `sub` (userId), `email`, `sid` (sessionId). 15-minute expiry (`authService.ts` lines 50-57). VERIFIED.
10. **Cookie setting** -- `vmp_access_token` (path `/`, 15 min) and `vmp_refresh_token` (path `/api/v1/auth`, 30 days). Both HttpOnly, Secure in production, SameSite lax (`routes/auth.ts` lines 40-58). VERIFIED.
11. **Redirect** -- 302 to `{FRONTEND_URL}/saved-providers` on success (`routes/auth.ts` line 123). VERIFIED.
12. **Error handling** -- All errors redirect to `/login?error={invalid|expired|used}` (`routes/auth.ts` lines 124-130). VERIFIED -- never returns JSON for this browser-navigation endpoint.

### Step 3: Authenticated Requests

**`extractUser` middleware** -- `middleware/auth.ts` lines 41-97

1. **Global mounting** -- `app.use(extractUser)` in `index.ts` line 105. Runs on ALL requests. VERIFIED.
2. **Cookie reading** -- `req.cookies?.vmp_access_token` (line 44). VERIFIED. Requires `cookieParser()` which is mounted earlier (index.ts line 102).
3. **JWT verification** -- `jose.jwtVerify(token, secret)` (line 56). VERIFIED.
4. **Claim extraction** -- `sub` (userId), `email`, `sid` (sessionId) from payload (lines 58-60). VERIFIED.
5. **Session validation** -- DB lookup by sessionId, checks userId match and expiry (lines 66-71). VERIFIED.
6. **User setting** -- `req.user = { id, email, sessionId }` (line 74). VERIFIED.
7. **Activity tracking** -- `lastUsedAt` updated with 5-minute debounce (lines 77-86). Fire-and-forget with `.catch()`. VERIFIED.
8. **Never throws** -- All errors caught, `req.user` stays null, `next()` called (lines 87-96). VERIFIED. Expected JWT expiry/validation errors logged at debug level, not error.

### Step 4: Token Refresh

**`POST /api/v1/auth/refresh`** -- `routes/auth.ts` lines 137-153, `authService.ts` lines 243-284

1. **CSRF protection** -- Applied (line 139). VERIFIED.
2. **Cookie reading** -- `req.cookies?.vmp_refresh_token` (line 141). VERIFIED.
3. **Token lookup** -- SHA-256 hash the raw token, find session by hash (authService lines 244-250). VERIFIED.
4. **Expiry check** -- Expired sessions deleted from DB and error thrown (authService lines 256-259). VERIFIED.
5. **Token rotation** -- New random token generated, hashed, session updated (authService lines 263-273). VERIFIED. Old hash overwritten with new hash.
6. **Sliding window** -- Session `expiresAt` extended to 30 days from now (authService line 271). VERIFIED.
7. **New access token** -- Signed with same claims (authService line 276). VERIFIED.
8. **Both cookies reset** -- `setAuthCookies` called with new tokens (routes/auth.ts line 149). VERIFIED.

---

## Cookie Configuration (Verified)

| Cookie | HttpOnly | Secure | SameSite | Path | MaxAge | Domain (prod) |
|--------|----------|--------|----------|------|--------|----------------|
| `vmp_access_token` | Yes | Yes (prod) | lax | `/` | 15 min | `.verifymyprovider.com` |
| `vmp_refresh_token` | Yes | Yes (prod) | lax | `/api/v1/auth` | 30 days | `.verifymyprovider.com` |
| `vmp_csrf` | No | Yes (prod) | lax | `/` | (session) | `.verifymyprovider.com` |

Verified in `routes/auth.ts` lines 40-58 (auth cookies) and `middleware/csrf.ts` lines 18-24 (CSRF cookie).

- In development: `secure: false`, `domain: undefined`. VERIFIED.
- `clearAuthCookies` correctly specifies path and domain for both cookies (routes/auth.ts lines 60-63). VERIFIED.

---

## Session Lifecycle (Verified)

- **Creation**: On magic link verification -- VERIFIED (authService lines 217-225).
- **Max concurrent sessions**: 5 per user, oldest evicted -- VERIFIED (authService lines 195-214, constants line 106).
- **Session duration**: 30 days sliding window -- VERIFIED (constants line 95, extended on refresh at authService line 271).
- **Activity tracking**: `lastUsedAt` debounced to 5 minutes -- VERIFIED (middleware/auth.ts lines 77-86, constants line 112).
- **Logout (single)**: Deletes session record, clears cookies -- VERIFIED (authService lines 317-327, routes/auth.ts lines 159-170).
- **Logout all**: Deletes ALL sessions for user, clears cookies -- VERIFIED (authService lines 291-298, routes/auth.ts lines 177-188).
- **Expired session cleanup**: Admin endpoint `POST /admin/cleanup-sessions` -- VERIFIED (admin.ts lines 110-133, authService lines 441-460). Supports dry run.

---

## JWT Implementation (Verified)

- **Library**: `jose` (panva/jose) -- VERIFIED. Uses `SignJWT` for signing (authService line 51) and `jwtVerify` for verification (middleware/auth.ts line 56).
- **Algorithm**: HS256 (HMAC-SHA256) -- VERIFIED (authService line 52).
- **Secret**: `JWT_SECRET` env var encoded as `Uint8Array` via `TextEncoder` -- VERIFIED in both authService (lines 30-38) and middleware/auth.ts (lines 24-29).
- **Lazy initialization**: `getJwtSecret()` function -- VERIFIED. authService version throws if missing (line 34), middleware version returns null and skips verification (line 27).
- **Access token claims**: `sub` (userId cuid), `email`, `sid` (sessionId cuid), `iat`, `exp` (15 min) -- VERIFIED (authService line 51-56).
- **Refresh token**: Not a JWT. `randomBytes(32).toString('hex')`, stored as SHA-256 hash -- VERIFIED (authService line 191, stored at line 220).

---

## Protected Routes (Verified)

### User-Authenticated Routes

| Method | Path | Middleware | Verified |
|--------|------|------------|----------|
| `GET` | `/api/v1/auth/csrf-token` | (none) | Yes -- routes/auth.ts line 74 |
| `POST` | `/api/v1/auth/magic-link` | CSRF, magicLinkRateLimiter | Yes -- lines 86-87 |
| `GET` | `/api/v1/auth/verify` | (none) | Yes -- line 108 |
| `POST` | `/api/v1/auth/refresh` | CSRF | Yes -- line 139 |
| `POST` | `/api/v1/auth/logout` | CSRF, requireAuth | Yes -- lines 161-162 |
| `POST` | `/api/v1/auth/logout-all` | CSRF, requireAuth | Yes -- lines 179-180 |
| `GET` | `/api/v1/auth/me` | requireAuth | Yes -- line 196 |
| `GET` | `/api/v1/auth/export` | requireAuth | Yes -- line 213 |
| `GET` | `/api/v1/saved-providers` | CSRF (router), defaultRateLimiter, requireAuth | Yes -- routes/index.ts line 21, savedProviders.ts lines 23-24 |
| `POST` | `/api/v1/saved-providers` | CSRF (router), defaultRateLimiter, requireAuth | Yes -- savedProviders.ts lines 47-48 |
| `DELETE` | `/api/v1/saved-providers/:npi` | CSRF (router), defaultRateLimiter, requireAuth | Yes -- savedProviders.ts lines 68-69 |
| `GET` | `/api/v1/saved-providers/:npi/status` | CSRF (router), defaultRateLimiter | Yes -- savedProviders.ts line 86. NOTE: Does NOT use requireAuth -- returns `{ saved: false }` for anonymous users (line 90) |
| `POST` | `/api/v1/me/insurance-card/scan` | CSRF (router), scanRateLimiter, requireAuth | Yes -- routes/index.ts line 22, insuranceCard.ts lines 113-115 |
| `POST` | `/api/v1/me/insurance-card/save` | CSRF (router), defaultRateLimiter, requireAuth | Yes -- insuranceCard.ts lines 160-161 |
| `GET` | `/api/v1/me/insurance-card` | CSRF (router), defaultRateLimiter, requireAuth | Yes -- insuranceCard.ts lines 181-182 |
| `PATCH` | `/api/v1/me/insurance-card` | CSRF (router), defaultRateLimiter, requireAuth | Yes -- insuranceCard.ts lines 200-201 |
| `DELETE` | `/api/v1/me/insurance-card` | CSRF (router), defaultRateLimiter, requireAuth | Yes -- insuranceCard.ts lines 221-222 |

### Admin-Authenticated Routes (11 endpoints)

All protected by `adminAuthMiddleware` in `routes/admin.ts`. VERIFIED:

| Method | Path | Verified |
|--------|------|----------|
| `POST` | `/admin/cleanup-expired` | Yes -- line 73 |
| `POST` | `/admin/cleanup-sessions` | Yes -- line 112 |
| `GET` | `/admin/expiration-stats` | Yes -- line 143 |
| `GET` | `/admin/health` | Yes -- line 162 |
| `POST` | `/admin/cache/clear` | Yes -- line 232 |
| `GET` | `/admin/cache/stats` | Yes -- line 258 |
| `GET` | `/admin/enrichment/stats` | Yes -- line 286 |
| `POST` | `/admin/cleanup/sync-logs` | Yes -- line 314 |
| `GET` | `/admin/retention/stats` | Yes -- line 385 |
| `POST` | `/admin/recalculate-confidence` | Yes -- line 504 |
| `POST` | `/admin/rotate-encryption-key` | Yes -- line 563 |

### Public Routes (no auth)

All provider search, plan search, verification submission, voting, and location endpoints are public. `extractUser` runs globally (sets `req.user` if valid cookie exists) but `requireAuth` is not applied. VERIFIED in `routes/providers.ts`, `routes/verify.ts`, `routes/plans.ts`.

---

## CSRF Integration (Verified)

- **Library**: `csrf-csrf` (`doubleCsrf`) -- VERIFIED in `middleware/csrf.ts`.
- **Token endpoint**: `GET /api/v1/auth/csrf-token` issues token and sets `vmp_csrf` cookie -- VERIFIED (routes/auth.ts lines 74-77).
- **Session binding**: Token tied to `req.user.sessionId || req.ip || 'anonymous'` -- VERIFIED (csrf.ts lines 15-16).
- **Route-level application**: `csrfProtection` middleware on magic-link, refresh, logout, logout-all -- VERIFIED in routes/auth.ts.
- **Router-level application**: Applied to `/saved-providers` and `/me/insurance-card` via `router.use()` in routes/index.ts lines 21-22 -- VERIFIED.
- **Ignored methods**: `GET`, `HEAD`, `OPTIONS` -- VERIFIED (csrf.ts line 26).

---

## Frontend CSRF Integration (Verified)

The frontend API client (`packages/frontend/src/lib/api.ts`) implements full CSRF token management:

1. **Token caching** -- `csrfToken` variable caches the token (line 324). VERIFIED.
2. **Lazy fetch** -- `ensureCsrfToken()` fetches on first mutating request (line 351). VERIFIED.
3. **Singleton promise** -- `csrfFetchPromise` coalesces concurrent fetches (line 327). VERIFIED.
4. **Auto-include** -- `X-CSRF-Token` header added to POST/PUT/PATCH/DELETE (lines 407-412). VERIFIED.
5. **403 retry** -- On CSRF failure (403), token is cleared, re-fetched, and request retried once (lines 428-434). VERIFIED.
6. **Token refresh interceptor** -- On 401, `attemptTokenRefresh()` is called transparently (lines 439-443). VERIFIED.
7. **Credentials** -- `credentials: 'include'` on all requests (line 418). VERIFIED.

---

## Rate Limiting (Verified)

- [x] **Per-IP magic link rate limit**: 5 req / 15 min -- VERIFIED (rateLimiter.ts lines 373-378).
- [x] **Per-email magic link rate limit**: 5 tokens / hour -- VERIFIED (authService.ts lines 73-85, constants line 90).
- [x] **Dual-mode**: Redis (distributed) or in-memory (single-instance) with auto-selection -- VERIFIED (rateLimiter.ts lines 299-318). Mode logged once per limiter on initialization.
- [x] **Fail-open behavior**: If Redis unavailable, request allowed with warning and `X-RateLimit-Status: degraded` header -- VERIFIED (rateLimiter.ts lines 207-213, 273-278).

---

## Auth Constants (Verified)

| Constant | Value | Location | Verified |
|----------|-------|----------|----------|
| `MAGIC_LINK_EXPIRY_MS` | 15 minutes (900,000 ms) | constants.ts line 85 | Yes |
| `MAGIC_LINK_MAX_PER_HOUR` | 5 | constants.ts line 90 | Yes |
| `SESSION_DURATION_MS` | 30 days (2,592,000,000 ms) | constants.ts line 95 | Yes |
| `ACCESS_TOKEN_EXPIRY` | `'15m'` | constants.ts line 100 | Yes |
| `MAX_SESSIONS_PER_USER` | 5 | constants.ts line 106 | Yes |
| `SESSION_ACTIVITY_DEBOUNCE_MS` | 5 minutes (300,000 ms) | constants.ts line 112 | Yes |

---

## Environment Variables (Verified)

| Variable | Required | Verified In |
|----------|----------|-------------|
| `JWT_SECRET` | Yes (auth) | authService.ts line 33, middleware/auth.ts line 26 |
| `CSRF_SECRET` | Yes (CSRF) | csrf.ts line 10 |
| `RESEND_API_KEY` | Yes (emails) | authService.ts line 20 |
| `MAGIC_LINK_BASE_URL` | No (default: `https://verifymyprovider.com`) | authService.ts line 21, routes/auth.ts line 37 |
| `ADMIN_SECRET` | Yes (admin) | admin.ts line 25 |
| `REDIS_URL` | No (fallback to in-memory) | rateLimiter.ts (via lib/redis) |

---

## Global Middleware Chain (Verified)

Order in `packages/backend/src/index.ts`:

1. `requestIdMiddleware` (line 42) -- Request ID for log correlation
2. `httpLogger` (line 45) -- Pino HTTP logging
3. `helmet()` (line 49) -- Security headers with strict CSP
4. `cors()` (line 70) -- CORS with `credentials: true`, `X-CSRF-Token` in allowedHeaders (line 86)
5. `express.json()` (line 93) -- Body parsing with 100kb limit (skipped for insurance card scan)
6. `cookieParser()` (line 102) -- Cookie parsing (required for JWT extraction)
7. `extractUser` (line 105) -- Global auth extraction (sets `req.user`)
8. Health check endpoint (line 108) -- Before rate limiter
9. `defaultRateLimiter` (line 154) -- 200 req/hour
10. `requestLogger` (line 157) -- Usage tracking without PII
11. API routes (line 195)
12. `notFoundHandler` (line 198)
13. `errorHandler` (line 201)

CORS configuration confirmed: allowed origins include `verifymyprovider.com`, `www.verifymyprovider.com`, Cloud Run frontend URL, and `FRONTEND_URL` env var. Localhost origins added in development. `X-CSRF-Token` explicitly in `allowedHeaders`.

---

## Checklist Verification

### User Authentication (Passwordless Magic Link)
- [x] Magic link request endpoint with email validation -- VERIFIED
- [x] Magic link email delivery via Resend API -- VERIFIED
- [x] Email enumeration prevention (always returns success) -- VERIFIED
- [x] Token verification with single-use enforcement -- VERIFIED
- [x] User auto-creation on first login (upsert by email) -- VERIFIED
- [x] JWT access tokens (HS256, 15-min expiry, signed via jose) -- VERIFIED
- [x] Refresh tokens (random bytes, SHA-256 hashed in DB, rotated on use) -- VERIFIED
- [x] HttpOnly, Secure, SameSite cookies (no localStorage) -- VERIFIED
- [x] Sliding window session expiry (30 days, extended on refresh) -- VERIFIED
- [x] Concurrent session limit (5 per user, oldest evicted) -- VERIFIED
- [x] Session activity tracking with debounced DB writes -- VERIFIED
- [x] Logout (single session delete + cookie clear) -- VERIFIED
- [x] Logout all (delete all sessions for user) -- VERIFIED
- [x] User profile endpoint (`/auth/me` with saved provider count) -- VERIFIED
- [x] GDPR data export (`/auth/export` with decrypted insurance card PII) -- VERIFIED

### Middleware
- [x] `extractUser` global middleware (runs on all requests, never throws) -- VERIFIED
- [x] `requireAuth` route guard (returns 401 if `req.user` is null) -- VERIFIED
- [x] Graceful handling of expired/malformed JWTs (debug log, not error) -- VERIFIED
- [x] Lazy JWT secret initialization (safe for test environments) -- VERIFIED

### CSRF Protection
- [x] Double-submit cookie pattern via `csrf-csrf` library -- VERIFIED
- [x] `vmp_csrf` cookie (JS-readable) + `X-CSRF-Token` header -- VERIFIED
- [x] Session-bound CSRF tokens (tied to sessionId or IP) -- VERIFIED
- [x] Applied to all state-changing auth routes -- VERIFIED
- [x] Applied at router level to saved-providers and insurance-card routes -- VERIFIED
- [x] GET/HEAD/OPTIONS ignored (safe methods) -- VERIFIED

### Rate Limiting
- [x] Per-IP magic link rate limit: 5 req / 15 min (middleware) -- VERIFIED
- [x] Per-email magic link rate limit: 5 tokens / hour (DB query in authService) -- VERIFIED
- [x] Dual-mode: Redis (distributed) or in-memory (single-instance) -- VERIFIED
- [x] Fail-open behavior if Redis becomes unavailable -- VERIFIED

### Admin Authentication
- [x] `X-Admin-Secret` header validation -- VERIFIED
- [x] `crypto.timingSafeEqual` for timing-attack prevention -- VERIFIED
- [x] 503 response if `ADMIN_SECRET` not configured -- VERIFIED
- [x] 401 response for invalid/missing secret -- VERIFIED
- [x] 11 admin endpoints protected -- VERIFIED (counted all 11)

### Session Maintenance
- [x] Admin endpoint for expired session cleanup -- VERIFIED
- [x] Expired session auto-deletion on refresh attempt -- VERIFIED
- [x] `cleanupExpiredSessions` service function with dry-run support -- VERIFIED

### Security
- [x] No passwords stored (passwordless architecture) -- VERIFIED
- [x] Refresh token stored as SHA-256 hash (not plaintext) -- VERIFIED
- [x] Magic link tokens are single-use (marked with `usedAt` timestamp) -- VERIFIED
- [x] Cookie domain scoped to `.verifymyprovider.com` in production -- VERIFIED
- [x] Refresh token cookie path-scoped to `/api/v1/auth` -- VERIFIED
- [x] CORS restricted to allowed origins with `credentials: true` -- VERIFIED
- [x] `X-CSRF-Token` in CORS `allowedHeaders` -- VERIFIED

---

## Additional Findings

1. **`invalidateOtherSessions` function exists but is not exposed via any route** -- `authService.ts` lines 301-311 defines this function for "log out other devices" functionality, but no route handler calls it. This could be a future feature or dead code.

2. **Frontend `attemptTokenRefresh` does not include CSRF token** -- In `api.ts` line 368, the refresh POST request does not include `X-CSRF-Token`. This may cause CSRF validation failure since `/auth/refresh` has `csrfProtection` middleware. However, the `vmp_csrf` cookie is sent with `credentials: 'include'`, and the `csrf-csrf` library may validate using the cookie alone. Worth testing to confirm.

3. **`GET /saved-providers/:npi/status` intentionally skips `requireAuth`** -- This endpoint returns `{ saved: false }` for anonymous users (savedProviders.ts line 90) rather than 401, enabling the frontend to check save status without requiring login first.

4. **Insurance card scan has elevated body size limit** -- The global JSON parser is skipped for `/me/insurance-card/scan` (index.ts lines 93-98), and a route-level parser with 16MB limit is applied instead (insuranceCard.ts line 112). This is necessary for base64-encoded card images.

---

## Questions to Ask

1. **Is there a scheduled job for expired session cleanup?** The endpoint exists but needs a Cloud Scheduler trigger.
2. **Is there a scheduled job for expired magic link token cleanup?** Tokens accumulate indefinitely.
3. **Should magic link tokens be hashed before DB storage?** Currently plaintext hex. SHA-256 hashing (like refresh tokens) would prevent exposure in a DB breach.
4. **Should there be account lockout after repeated failed magic link verifications?**
5. **Is the `JWT_SECRET` being rotated periodically?** No key rotation mechanism exists.
6. **Should verifications be linked to user accounts?** Currently anonymous.
7. **Should there be a `DELETE /auth/me` account deletion endpoint?** GDPR export exists but not right to erasure.
8. **Does `attemptTokenRefresh` need to include the CSRF token?** See Finding #2 above.
