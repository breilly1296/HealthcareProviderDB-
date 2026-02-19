---
tags:
  - security
  - authentication
  - high
type: prompt
priority: 2
---

# Authentication Review

## Files to Review

| File | Purpose |
|------|---------|
| `packages/backend/src/routes/auth.ts` | Auth route handlers (magic link, verify, refresh, logout, me, export) |
| `packages/backend/src/middleware/auth.ts` | `extractUser` (global) and `requireAuth` (route guard) middleware |
| `packages/backend/src/services/authService.ts` | Auth business logic (magic link send/verify, session CRUD, GDPR export) |
| `packages/backend/src/middleware/csrf.ts` | CSRF double-submit cookie via `csrf-csrf` library |
| `packages/backend/src/middleware/rateLimiter.ts` | `magicLinkRateLimiter` (5 req / 15 min per IP) |
| `packages/backend/src/config/constants.ts` | Auth-related constants (token expiry, session duration, limits) |
| `packages/backend/src/routes/admin.ts` | Admin auth via `X-Admin-Secret` header + timing-safe comparison |
| `packages/backend/src/routes/index.ts` | Route mounting with CSRF protection on protected router groups |
| `packages/backend/src/routes/savedProviders.ts` | Saved providers (requireAuth on all routes) |
| `packages/backend/src/routes/insuranceCard.ts` | Insurance card CRUD + scan (requireAuth on all routes) |
| `packages/backend/prisma/schema.prisma` | User, Session, MagicLinkToken, SavedProvider, UserInsuranceCard models |
| `packages/backend/src/index.ts` | Global middleware chain: cookieParser -> extractUser -> routes |

---

## Architecture Overview

VerifyMyProvider uses two independent authentication systems:

### 1. Admin Authentication (X-Admin-Secret Header)

Server-to-server auth for operational endpoints. Used by Cloud Scheduler and manual admin calls.

```
Client                          Backend
  |                                |
  |  X-Admin-Secret: <secret>      |
  |------------------------------->|
  |                                | adminAuthMiddleware()
  |                                |   - 503 if ADMIN_SECRET env not set
  |                                |   - timing-safe compare via crypto.timingSafeEqual
  |                                |   - 401 if mismatch
  |  200 OK                        |
  |<-------------------------------|
```

- No cookies, no JWT, no sessions
- Single shared secret in `ADMIN_SECRET` env var
- Length check + `timingSafeEqual` prevents timing attacks

### 2. User Authentication (Passwordless Magic Link)

Cookie-based JWT auth for end users. No passwords stored anywhere.

```
User            Frontend         Backend            Resend API         Database
 |                 |                |                   |                 |
 | Enter email     |                |                   |                 |
 |---------------->| POST /auth/magic-link              |                 |
 |                 |--------------->| Validate + rate limit               |
 |                 |                |------------------------------------>| Create MagicLinkToken
 |                 |                |------------------>| Send email       |
 |                 | 200 OK         |                   |                 |
 |                 |<---------------|                   |                 |
 |                 |                |                   |                 |
 | Click link      |                |                   |                 |
 |-------------------------------------->|              |                 |
 |                 |                | GET /auth/verify?token=...          |
 |                 |                |------------------------------------>| Lookup token
 |                 |                |                   |                 | Mark used
 |                 |                |                   |                 | Upsert User
 |                 |                |                   |                 | Create Session
 |                 |                |<------------------------------------| Return session
 |                 |                | Sign JWT (access token)             |
 |                 |                | Set cookies                         |
 | 302 Redirect    |                |                   |                 |
 |<------------------------------------|              |                 |
 | /saved-providers|                |                   |                 |
```

---

## Magic Link Flow (Detailed)

### Step 1: Request Magic Link

**`POST /api/v1/auth/magic-link`** (CSRF protected, rate limited)

1. Validate email via Zod schema (`z.string().email().max(255)`)
2. Normalize email: `toLowerCase().trim()`
3. Per-email rate limit: max 5 magic link tokens per email per hour (DB query on `magic_link_tokens`)
4. Per-IP rate limit: max 5 requests per 15 minutes (`magicLinkRateLimiter` middleware)
5. Generate token: `randomBytes(32).toString('hex')` (64-char hex string)
6. Store in `magic_link_tokens` table with 15-minute expiry
7. Build link: `{MAGIC_LINK_BASE_URL}/api/v1/auth/verify?token={token}`
8. Send via Resend API (from: `login@verifymyprovider.com`)
9. Always return `200 { success: true }` to prevent email enumeration

### Step 2: Verify Token

**`GET /api/v1/auth/verify?token=`** (no auth required, browser navigation)

1. Parse `token` query param via Zod
2. Look up token in `magic_link_tokens` (unique index on `token` column)
3. Reject if: not found, already used (`usedAt` not null), or expired (`expiresAt < now`)
4. Mark token as used (`usedAt = now`)
5. Upsert user by email: create if new, update `emailVerified` timestamp if existing
6. Enforce session limit: if user has >= 5 sessions, delete oldest to make room
7. Generate refresh token: `randomBytes(32).toString('hex')`, store SHA-256 hash in `sessions`
8. Sign access token JWT (HS256, 15-min expiry, claims: `sub`, `email`, `sid`)
9. Set `vmp_access_token` and `vmp_refresh_token` cookies
10. Redirect to `{FRONTEND_URL}/saved-providers`
11. On any error, redirect to `/login?error={invalid|expired|used}`

All outcomes are 302 redirects (never JSON) since this is triggered by clicking an email link.

### Step 3: Authenticated Requests

1. `extractUser` middleware runs on every request (globally mounted in `index.ts`)
2. Reads `vmp_access_token` cookie
3. Verifies JWT via `jose.jwtVerify` with `JWT_SECRET`
4. Extracts `sub` (userId), `email`, `sid` (sessionId) from JWT payload
5. Looks up session in DB, validates: exists, userId matches, not expired
6. Sets `req.user = { id, email, sessionId }` on success, `null` on failure
7. Never throws -- unauthenticated requests proceed as anonymous

### Step 4: Token Refresh

**`POST /api/v1/auth/refresh`** (CSRF protected)

1. Read `vmp_refresh_token` cookie (scoped to `/api/v1/auth` path)
2. SHA-256 hash the raw token, look up session by hashed value
3. Reject if session not found or expired (delete expired session from DB)
4. **Rotate refresh token**: generate new random token, hash it, update session
5. Extend session expiry (sliding window: 30 days from now)
6. Sign new access token JWT
7. Set both cookies with new values

Refresh token rotation prevents token reuse attacks: each refresh token is single-use.

---

## Cookie & Session Management

### Cookies

| Cookie | HttpOnly | Secure | SameSite | Path | MaxAge | Domain (prod) |
|--------|----------|--------|----------|------|--------|----------------|
| `vmp_access_token` | Yes | Yes (prod) | lax | `/` | 15 min | `.verifymyprovider.com` |
| `vmp_refresh_token` | Yes | Yes (prod) | lax | `/api/v1/auth` | 30 days | `.verifymyprovider.com` |
| `vmp_csrf` | No | Yes (prod) | lax | `/` | (session) | `.verifymyprovider.com` |

- `vmp_csrf` is readable by JavaScript (HttpOnly: false) because the frontend must read it and send it back as the `X-CSRF-Token` header (double-submit pattern)
- In development, `secure` is false and `domain` is undefined (allows localhost)

### Session Lifecycle

- **Creation**: On magic link verification (upsert user + create session)
- **Max concurrent sessions**: 5 per user (oldest evicted on new login)
- **Session duration**: 30 days (sliding window, extended on each refresh)
- **Activity tracking**: `lastUsedAt` updated on each request, debounced to every 5 minutes to reduce DB writes
- **Logout**: Deletes the single session record from DB, clears both cookies
- **Logout all**: Deletes ALL sessions for the user (e.g., "sign out everywhere"), clears cookies on responding client
- **Expired session cleanup**: Admin endpoint `POST /api/v1/admin/cleanup-sessions` deletes sessions past `expiresAt`

### Cookie Clearing

The `clearAuthCookies` helper clears both `vmp_access_token` (path `/`) and `vmp_refresh_token` (path `/api/v1/auth`) with the correct domain, ensuring both cookies are properly removed on logout.

---

## JWT Implementation

### Library

[jose](https://github.com/panva/jose) -- Web Crypto API-based JWT library. Used for both signing (`SignJWT`) and verification (`jwtVerify`).

### Access Token Structure

```
Header:  { "alg": "HS256" }
Payload: {
  "sub": "<user.id (cuid)>",
  "email": "<user.email>",
  "sid": "<session.id (cuid)>",
  "iat": <unix timestamp>,
  "exp": <iat + 15 minutes>
}
```

- Algorithm: HS256 (HMAC-SHA256 symmetric)
- Secret: `JWT_SECRET` env var, encoded as `Uint8Array` via `TextEncoder`
- Expiry string: `'15m'` (jose format)

### Refresh Token

- Not a JWT -- raw `randomBytes(32).toString('hex')` (64-char hex)
- Stored in DB as SHA-256 hash (`refreshToken` column on `sessions` table)
- Rotated on every refresh (old hash replaced with new hash)
- Single-use: once used to refresh, the old token is invalid

### Secret Initialization

JWT secret is lazily initialized on first use via `getJwtSecret()`. This allows the module to be imported before environment variables are loaded (important for test environments).

---

## Prisma Models

### User

```prisma
model User {
  id             String             @id @default(cuid())
  email          String             @unique @db.VarChar(255)
  emailVerified  DateTime?          @map("email_verified") @db.Timestamptz(6)
  createdAt      DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)
  savedProviders SavedProvider[]
  sessions       Session[]
  insuranceCard  UserInsuranceCard?

  @@map("users")
}
```

- Created on first magic link verification (upsert by email)
- `emailVerified` set to current timestamp on each successful magic link verification
- One-to-many: sessions, savedProviders. One-to-one: insuranceCard

### Session

```prisma
model Session {
  id           String    @id @default(cuid())
  userId       String    @map("user_id")
  refreshToken String    @unique @map("refresh_token") @db.VarChar(500)
  expiresAt    DateTime  @map("expires_at") @db.Timestamptz(6)
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  ipAddress    String?   @map("ip_address") @db.VarChar(50)
  userAgent    String?   @map("user_agent") @db.VarChar(500)
  lastUsedAt   DateTime? @map("last_used_at") @db.Timestamptz(6)
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId], map: "idx_sessions_user_id")
  @@index([expiresAt], map: "idx_sessions_expires_at")
  @@map("sessions")
}
```

- `refreshToken` stores SHA-256 hash (not raw token)
- `onDelete: Cascade` -- deleting a user deletes all their sessions
- `userAgent` truncated to 500 chars on creation
- Indexed on `expiresAt` for efficient expired session cleanup

### MagicLinkToken

```prisma
model MagicLinkToken {
  id        String    @id @default(cuid())
  email     String    @db.VarChar(255)
  token     String    @unique @db.VarChar(500)
  expiresAt DateTime  @map("expires_at") @db.Timestamptz(6)
  usedAt    DateTime? @map("used_at") @db.Timestamptz(6)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([email], map: "idx_magic_link_email")
  @@index([token], map: "idx_magic_link_token")
  @@index([expiresAt], map: "idx_magic_link_expires_at")
  @@map("magic_link_tokens")
}
```

- `token` is the raw 64-char hex string (stored as plaintext, looked up on verify)
- `usedAt` set on verification to prevent reuse
- Indexed on `email` for per-email rate limiting, on `token` for lookup, on `expiresAt` for cleanup

---

## Protected Routes

### User-Authenticated Routes (requireAuth)

| Method | Path | Middleware | Description |
|--------|------|------------|-------------|
| `GET` | `/api/v1/auth/csrf-token` | (none) | Issue CSRF token |
| `POST` | `/api/v1/auth/magic-link` | CSRF, magicLinkRateLimiter | Request magic link email |
| `GET` | `/api/v1/auth/verify` | (none) | Verify magic link token, set cookies, redirect |
| `POST` | `/api/v1/auth/refresh` | CSRF | Refresh access token from refresh cookie |
| `POST` | `/api/v1/auth/logout` | CSRF, requireAuth | Clear current session + cookies |
| `POST` | `/api/v1/auth/logout-all` | CSRF, requireAuth | Invalidate all user sessions |
| `GET` | `/api/v1/auth/me` | requireAuth | Get current user profile + saved provider count |
| `GET` | `/api/v1/auth/export` | requireAuth | GDPR data export (account, saved providers, insurance card) |
| `GET` | `/api/v1/saved-providers` | CSRF (router-level), requireAuth, defaultRateLimiter | List saved providers (paginated) |
| `POST` | `/api/v1/saved-providers/:npi` | CSRF (router-level), requireAuth | Save a provider |
| `DELETE` | `/api/v1/saved-providers/:npi` | CSRF (router-level), requireAuth | Unsave a provider |
| `GET` | `/api/v1/saved-providers/:npi` | CSRF (router-level), requireAuth | Check if provider is saved |
| `*` | `/api/v1/me/insurance-card/*` | CSRF (router-level), requireAuth | All insurance card CRUD + scan routes |

### Admin-Authenticated Routes (X-Admin-Secret)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/admin/cleanup-expired` | Delete expired verification records |
| `POST` | `/api/v1/admin/cleanup-sessions` | Delete expired sessions |
| `GET` | `/api/v1/admin/expiration-stats` | Verification expiration statistics |
| `GET` | `/api/v1/admin/health` | Admin health check with retention metrics |
| `POST` | `/api/v1/admin/cache/clear` | Clear all cached data |
| `GET` | `/api/v1/admin/cache/stats` | Cache statistics |
| `GET` | `/api/v1/admin/enrichment/stats` | Location enrichment statistics |
| `POST` | `/api/v1/admin/cleanup/sync-logs` | Clean up old sync logs |
| `GET` | `/api/v1/admin/retention/stats` | Comprehensive retention stats |
| `POST` | `/api/v1/admin/recalculate-confidence` | Recalculate confidence scores with decay |
| `POST` | `/api/v1/admin/rotate-encryption-key` | Re-encrypt insurance card PII fields |

### Public Routes (no auth required)

All provider search, plan search, verification submission, and voting endpoints remain public. `extractUser` still runs on these requests (setting `req.user` if a valid cookie exists), but `requireAuth` is not applied.

---

## CSRF Integration

### Implementation

Uses the [`csrf-csrf`](https://github.com/Psifi-Solutions/csrf-csrf) library with the double-submit cookie pattern.

### How It Works

1. Frontend calls `GET /api/v1/auth/csrf-token`
2. Backend sets `vmp_csrf` cookie (readable by JS) and returns the token in JSON body
3. Frontend sends the token value as the `X-CSRF-Token` header on state-changing requests
4. `csrfProtection` middleware compares header value against cookie value
5. `ignoredMethods: ['GET', 'HEAD', 'OPTIONS']` -- only POST/PUT/DELETE/PATCH are checked

### Session Identifier

The CSRF token is bound to a session identifier:
- If authenticated: `req.user.sessionId` (from JWT)
- If anonymous: `req.ip`
- Fallback: `'anonymous'`

### Where CSRF Is Applied

- **Route-level**: `POST /auth/magic-link`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`
- **Router-level**: All `/saved-providers` and `/me/insurance-card` routes (applied via `router.use()` in `routes/index.ts`)

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes (for auth) | HMAC-SHA256 signing key for access tokens. In production: GCP Secret Manager |
| `CSRF_SECRET` | Yes (for CSRF) | Secret for CSRF token generation/validation |
| `RESEND_API_KEY` | Yes (for emails) | API key for Resend email service. If missing, magic link emails are skipped with a warning |
| `MAGIC_LINK_BASE_URL` | No | Base URL for magic link construction. Default: `https://verifymyprovider.com` |
| `ADMIN_SECRET` | Yes (for admin) | Shared secret for admin endpoints. If missing, admin endpoints return 503 |
| `REDIS_URL` | No | Redis connection for distributed rate limiting. Falls back to in-memory if not set |

---

## Auth Constants

Defined in `packages/backend/src/config/constants.ts`:

| Constant | Value | Description |
|----------|-------|-------------|
| `MAGIC_LINK_EXPIRY_MS` | 15 minutes | Magic link token lifetime |
| `MAGIC_LINK_MAX_PER_HOUR` | 5 | Max magic link requests per email per hour |
| `SESSION_DURATION_MS` | 30 days | Session lifetime (sliding window) |
| `ACCESS_TOKEN_EXPIRY` | `'15m'` | JWT access token lifetime (jose format) |
| `MAX_SESSIONS_PER_USER` | 5 | Max concurrent sessions before oldest is evicted |
| `SESSION_ACTIVITY_DEBOUNCE_MS` | 5 minutes | Min interval between session `lastUsedAt` DB updates |

---

## Checklist

### User Authentication (Passwordless Magic Link)
- [x] Magic link request endpoint with email validation
- [x] Magic link email delivery via Resend API
- [x] Email enumeration prevention (always returns success)
- [x] Token verification with single-use enforcement
- [x] User auto-creation on first login (upsert by email)
- [x] JWT access tokens (HS256, 15-min expiry, signed via jose)
- [x] Refresh tokens (random bytes, SHA-256 hashed in DB, rotated on use)
- [x] HttpOnly, Secure, SameSite cookies (no localStorage)
- [x] Sliding window session expiry (30 days, extended on refresh)
- [x] Concurrent session limit (5 per user, oldest evicted)
- [x] Session activity tracking with debounced DB writes
- [x] Logout (single session delete + cookie clear)
- [x] Logout all (delete all sessions for user)
- [x] User profile endpoint (`/auth/me` with saved provider count)
- [x] GDPR data export (`/auth/export` with decrypted insurance card PII)

### Middleware
- [x] `extractUser` global middleware (runs on all requests, never throws)
- [x] `requireAuth` route guard (returns 401 if `req.user` is null)
- [x] Graceful handling of expired/malformed JWTs (debug log, not error)
- [x] Lazy JWT secret initialization (safe for test environments)

### CSRF Protection
- [x] Double-submit cookie pattern via `csrf-csrf` library
- [x] `vmp_csrf` cookie (JS-readable) + `X-CSRF-Token` header
- [x] Session-bound CSRF tokens (tied to sessionId or IP)
- [x] Applied to all state-changing auth routes
- [x] Applied at router level to saved-providers and insurance-card routes
- [x] GET/HEAD/OPTIONS ignored (safe methods)

### Rate Limiting
- [x] Per-IP magic link rate limit: 5 req / 15 min (middleware)
- [x] Per-email magic link rate limit: 5 tokens / hour (DB query in authService)
- [x] Dual-mode: Redis (distributed) or in-memory (single-instance) with auto-selection
- [x] Fail-open behavior if Redis becomes unavailable

### Admin Authentication
- [x] `X-Admin-Secret` header validation
- [x] `crypto.timingSafeEqual` for timing-attack prevention
- [x] 503 response if `ADMIN_SECRET` not configured (graceful disable)
- [x] 401 response for invalid/missing secret
- [x] 11 admin endpoints protected

### Session Maintenance
- [x] Admin endpoint for expired session cleanup (`POST /admin/cleanup-sessions`)
- [x] Expired session auto-deletion on refresh attempt
- [x] `cleanupExpiredSessions` service function with dry-run support

### Security
- [x] No passwords stored (passwordless architecture)
- [x] Refresh token stored as SHA-256 hash (not plaintext)
- [x] Magic link tokens are single-use (marked with `usedAt` timestamp)
- [x] Cookie domain scoped to `.verifymyprovider.com` in production
- [x] Refresh token cookie path-scoped to `/api/v1/auth` (not sent on other requests)
- [x] CORS restricted to allowed origins with `credentials: true`
- [x] `X-CSRF-Token` in CORS `allowedHeaders`

---

## Questions to Ask

### Operational
1. **Is there a scheduled job for expired session cleanup?** The `POST /admin/cleanup-sessions` endpoint exists but needs a Cloud Scheduler trigger.
2. **Is there a scheduled job for expired magic link token cleanup?** Old tokens accumulate in the `magic_link_tokens` table. Consider adding an admin cleanup endpoint or a TTL-based purge.
3. **Are Resend email deliverability metrics being monitored?** Failed sends are logged but not alerted on.

### Security Hardening
4. **Should magic link tokens be hashed before DB storage?** Currently stored as plaintext hex. A DB breach would expose all unexpired tokens. SHA-256 hashing (like refresh tokens) would mitigate this.
5. **Should there be account lockout after repeated failed magic link verifications?** Currently no penalty for submitting invalid tokens repeatedly.
6. **Is the `JWT_SECRET` being rotated periodically?** There is no key rotation mechanism for JWT secrets (unlike the encryption key rotation for insurance cards).

### Feature Gaps
7. **Should verifications and votes be linked to user accounts?** Currently `verification_logs.submittedBy` and `vote_logs.source_ip` are anonymous. Linking to `users.id` would enable per-user reputation.
8. **Should there be an account deletion endpoint?** GDPR export exists but there is no `DELETE /auth/me` for account deletion (right to erasure).
9. **Should the admin panel move from header-based auth to user-based auth with roles?** The current `X-Admin-Secret` approach does not support audit trails per admin user.

### Scaling
10. **Are sessions and magic link tokens indexed correctly for high volume?** Indexes exist on `expiresAt`, `token`, and `email` but no composite indexes for the rate-limiting query pattern (`email + createdAt`).
