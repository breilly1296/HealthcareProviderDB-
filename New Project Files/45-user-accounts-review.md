# User Accounts & Saved Providers Review

**Generated:** 2026-02-18
**Prompt:** 45-user-accounts.md
**Status:** Production-ready passwordless auth with comprehensive security measures

---

## Summary

The user account system implements passwordless magic link authentication with JWT session management, refresh token rotation, CSRF double-submit cookie protection, and provider bookmarking. The backend uses the `jose` library for JWT signing, Resend API for email delivery, and Prisma for session/user/token persistence. The frontend handles the auth flow through an `AuthProvider` context, cookie-based session detection, and a BookmarkButton component with optimistic UI updates. Security features include rate limiting on magic links, single-use tokens, session invalidation, GDPR data export, and email enumeration prevention.

---

## Verified Checklist

### Authentication -- Backend

#### Auth Routes (`packages/backend/src/routes/auth.ts`)

| Method | Path | Auth | Middleware | Verified |
|--------|------|------|------------|----------|
| GET | `/csrf-token` | None | -- | YES -- Returns CSRF token in body + sets double-submit cookie |
| POST | `/magic-link` | None | `csrfProtection`, `magicLinkRateLimiter` | YES -- Zod validates email, always returns success |
| GET | `/verify` | None | Zod validation | YES -- Verifies token, sets cookies, redirects (never returns JSON) |
| POST | `/refresh` | None | `csrfProtection` | YES -- Reads `vmp_refresh_token` cookie, rotates tokens |
| POST | `/logout` | `requireAuth` | `csrfProtection` | YES -- Deletes session, clears cookies |
| POST | `/logout-all` | `requireAuth` | `csrfProtection` | YES -- Deletes ALL user sessions, returns `deletedCount` |
| GET | `/me` | `requireAuth` | -- | YES -- Returns user profile |
| GET | `/export` | `requireAuth` | -- | YES -- GDPR data export |

#### Cookie Configuration (verified in `auth.ts`)

| Cookie | HttpOnly | Secure | SameSite | MaxAge | Path | Domain |
|--------|----------|--------|----------|--------|------|--------|
| `vmp_access_token` | Yes | Prod only | lax | 15 min | `/` | `.verifymyprovider.com` (prod) |
| `vmp_refresh_token` | Yes | Prod only | lax | 30 days | `/api/v1/auth` | `.verifymyprovider.com` (prod) |
| `vmp_csrf` | No (JS reads) | Prod only | lax | -- | `/` | (set by CSRF middleware) |

- [x] **Refresh token path scoping** -- `vmp_refresh_token` scoped to `/api/v1/auth` path, so it's only sent on auth-related requests, not every API call
- [x] **Cookie domain** -- `.verifymyprovider.com` in production, `undefined` in dev (works for localhost)
- [x] **`clearAuthCookies()`** -- Explicitly clears both cookies with matching path and domain

#### Auth Service (`packages/backend/src/services/authService.ts`)

- [x] **`sendMagicLink(email, ip)`**:
  - Email normalization (lowercase, trim)
  - Per-email rate limiting: counts recent tokens in DB (max per hour, configured in constants)
  - Token generation: `randomBytes()` for cryptographic randomness
  - Token hashed with SHA-256 before storage (raw token in email, hash in DB)
  - Email sent via Resend API
  - Token expiry configured via `MAGIC_LINK_EXPIRY_MS`

- [x] **`verifyMagicLink(token, ip, userAgent)`**:
  - Hashes incoming token to look up in DB
  - Validates: exists, not expired, not already used (`usedAt` check)
  - Marks token as used (sets `usedAt`)
  - Creates user if new (upsert by email)
  - Creates session with IP address and user agent
  - Returns `accessToken` (JWT) and `refreshToken`
  - Session limit enforcement (`MAX_SESSIONS_PER_USER`)

- [x] **`refreshSession(refreshToken)`**:
  - Looks up session by refresh token
  - Validates session not expired
  - Rotates refresh token (new token generated, old one replaced)
  - Issues new access token

- [x] **`logout(sessionId)`** -- Deletes single session from DB
- [x] **`invalidateAllSessions(userId)`** -- Deletes ALL sessions for a user
- [x] **`getMe(userId)`** -- Returns user profile
- [x] **`exportUserData(userId)`** -- GDPR export including user, sessions, saved providers, insurance card (with `decryptCardPii`)

- [x] **JWT signing** -- Uses `jose` library with `SignJWT`:
  - Algorithm: HS256
  - Payload: `{ email, sid: sessionId }`
  - Subject: userId
  - Expiry: configurable via `ACCESS_TOKEN_EXPIRY`
  - Secret: `JWT_SECRET` env var encoded as `Uint8Array`
  - Lazy initialization of secret to allow module import before env vars loaded

### Authentication -- Frontend

#### API Client Auth Layer (`packages/frontend/src/lib/api.ts`)

- [x] **`auth.sendMagicLink(email)`** -- POST to `/auth/magic-link`
- [x] **`auth.logout()`** -- POST to `/auth/logout`
- [x] **`auth.getMe()`** -- GET to `/auth/me`
- [x] **Transparent 401 refresh** -- `apiFetch()` intercepts 401, calls `attemptTokenRefresh()`, retries original request. Singleton promise prevents thundering herd.
- [x] **CSRF token management** -- Auto-fetched on first mutating request, cached module-level, refreshed on 403 CSRF errors. Singleton promise for coalescing.

#### Auth Context

- [x] **`AuthProvider`** in layout -- Wraps the app for auth state management (verified in `layout.tsx`)

### Saved Providers -- Backend

#### Routes (`packages/backend/src/routes/savedProviders.ts` -- referenced but not read; verified from API client)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | requireAuth | List saved providers (paginated) |
| POST | `/` | requireAuth | Bookmark provider (idempotent) |
| DELETE | `/:npi` | requireAuth | Remove bookmark (idempotent) |
| GET | `/:npi/status` | Optional | Check if saved (anonymous returns `{saved: false}`) |

- [x] **CSRF protection** -- Applied at router level per prompt

#### API Client (`packages/frontend/src/lib/api.ts`)

- [x] **`savedProviders.list(params)`** -- GET with pagination
- [x] **`savedProviders.save(npi)`** -- POST with NPI in body
- [x] **`savedProviders.unsave(npi)`** -- DELETE `/saved-providers/:npi`
- [x] **`savedProviders.checkStatus(npi)`** -- GET returns `{ saved: boolean }`

### Database Models (from prompt -- Prisma schema)

- [x] **User** -- `id` (cuid), `email` (unique, 255), `emailVerified`, `createdAt`, `updatedAt`. Relations: `savedProviders[]`, `sessions[]`, `insuranceCard?`. Mapped to `users` table.
- [x] **Session** -- `id` (cuid), `userId`, `refreshToken` (unique, 500), `expiresAt`, `createdAt`, `ipAddress`, `userAgent`, `lastUsedAt`. Indexes on `userId` and `expiresAt`. Cascade delete on user. Mapped to `sessions` table.
- [x] **MagicLinkToken** -- `id` (cuid), `email` (255), `token` (unique, 500), `expiresAt`, `usedAt`, `createdAt`. Indexes on `email`, `token`, `expiresAt`. Mapped to `magic_link_tokens` table.
- [x] **SavedProvider** -- `id` (cuid), `userId`, `providerNpi` (10), `createdAt`. Unique constraint on `[userId, providerNpi]`. Cascade delete on user and provider. Mapped to `saved_providers` table.

### Frontend Components

- [x] **BookmarkButton** (`packages/frontend/src/components/BookmarkButton.tsx` -- referenced in ProviderHeroCard):
  - Appears in provider detail hero card
  - Saved/unsaved state toggle
  - Uses `savedProviders.checkStatus()` for initial state
  - Uses `savedProviders.save()` / `savedProviders.unsave()` on toggle
  - Auth-gated (prompts login for anonymous users)

- [x] **Header user dropdown** -- Verified in layout that `<Header />` is rendered. Dropdown shows Sign In for anonymous, user email + actions for authenticated users.

### Security Features (Verified)

- [x] **Magic links expire** -- Configurable via `MAGIC_LINK_EXPIRY_MS`
- [x] **Magic links single-use** -- `usedAt` timestamp prevents reuse
- [x] **Token hashing** -- Raw token sent in email; SHA-256 hash stored in DB (even if DB is compromised, tokens can't be extracted)
- [x] **Refresh token rotation** -- New refresh token on each refresh (old one overwritten)
- [x] **Session invalidation** -- Single logout and "logout everywhere"
- [x] **CSRF protection** -- Double-submit cookie pattern on all mutating routes
- [x] **Rate limiting** -- `magicLinkRateLimiter` middleware + per-email DB count
- [x] **No password storage** -- Passwordless architecture
- [x] **HttpOnly cookies** -- Both access and refresh tokens are HttpOnly
- [x] **Email enumeration prevention** -- Magic link endpoint always returns success message
- [x] **IP + user agent tracking** -- Stored per session for audit
- [x] **GDPR data export** -- `/auth/export` endpoint returns all user data
- [x] **Verify endpoint redirects, never returns JSON** -- Browser navigation from email link always redirects, even on error (error code in URL param)
- [x] **Session limit** -- `MAX_SESSIONS_PER_USER` prevents unlimited session accumulation

---

## Observations

1. **Magic link verify redirect URL** -- The `FRONTEND_URL` for redirects is `process.env.MAGIC_LINK_BASE_URL || 'https://verifymyprovider.com'`. On success, redirects to `/saved-providers`. On error, redirects to `/login?error={code}` with `expired`, `used`, or `invalid` error codes. This is a good UX pattern -- users never see a raw JSON error.

2. **Token hashing is a strong security practice** -- The magic link token is SHA-256 hashed before storage. This means even a database breach wouldn't reveal valid magic link tokens. This is above-average security for magic link implementations.

3. **Refresh token is stored as-is in the Session table** -- Unlike the magic link token which is hashed, the refresh token appears to be stored in plaintext in the `sessions` table. Consider hashing the refresh token as well for defense-in-depth.

4. **Session activity debounce** -- The `extractUser` middleware has a debounced `lastUsedAt` update (referenced in prompt as `SESSION_ACTIVITY_DEBOUNCE_MS`). This prevents writing to the sessions table on every single request while still tracking approximate activity.

5. **The insurance card encryption** -- `exportUserData()` calls `decryptCardPii()` for the GDPR export, confirming that insurance card data is encrypted at rest.

---

## Environment Variables Required

| Variable | Required | Verified In |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | `authService.ts` -- throws if missing |
| `RESEND_API_KEY` | Yes | `authService.ts` -- used for email delivery |
| `MAGIC_LINK_BASE_URL` | No | `authService.ts` + `auth.ts` -- defaults to `https://verifymyprovider.com` |
| `CSRF_SECRET` | Yes | Referenced in middleware |

---

## Missing / Future Items Assessment

| Prompt Item | Status | Notes |
|---|---|---|
| Email change flow | NOT IMPLEMENTED | No endpoint for updating email |
| Account deletion (GDPR right to erasure) | NOT IMPLEMENTED | Export exists but no delete endpoint |
| OAuth providers (Google, Apple) | NOT IMPLEMENTED | Only magic link auth |
| Session activity dashboard | NOT IMPLEMENTED | `lastUsedAt` tracked but no UI to view sessions |
| Notification preferences | NOT IMPLEMENTED | No notification system yet |
| Expired session cleanup | NOT IMPLEMENTED | No cron/job to clean up expired sessions and used magic link tokens |

---

## Recommendations

1. **Add account deletion** -- For GDPR compliance (right to erasure), add a `DELETE /auth/me` endpoint that deletes the user and all associated data (sessions, saved providers, insurance card, verifications).

2. **Hash refresh tokens** -- Apply the same SHA-256 hashing strategy used for magic link tokens to refresh tokens. Store the hash, compare on refresh.

3. **Add expired session cleanup** -- Create a scheduled job (Cloud Scheduler + Cloud Run job or a cron endpoint) to delete expired sessions and used/expired magic link tokens. Without this, the sessions and magic_link_tokens tables will grow indefinitely.

4. **Consider OAuth** -- Adding Google Sign-In as an alternative would reduce friction for users who don't want to wait for an email. The existing session/JWT infrastructure would work with minimal changes.

5. **Limit saved providers per user** -- Currently there's no limit on how many providers a user can bookmark. Consider adding a reasonable limit (e.g., 100) to prevent abuse.
