---
tags:
  - feature
  - authentication
  - implemented
type: prompt
priority: 2
created: 2026-02-18
---

# User Accounts & Saved Providers

## Files to Review
- `packages/backend/src/routes/auth.ts` (auth endpoints — magic link, JWT, sessions)
- `packages/backend/src/routes/savedProviders.ts` (saved provider bookmarks)
- `packages/backend/src/services/authService.ts` (magic link generation, JWT, session management)
- `packages/backend/src/services/savedProviderService.ts` (bookmark CRUD)
- `packages/backend/src/middleware/auth.ts` (extractUser, requireAuth)
- `packages/backend/src/middleware/csrf.ts` (CSRF double-submit cookie)
- `packages/backend/prisma/schema.prisma` (User, Session, MagicLinkToken, SavedProvider models)
- `packages/frontend/src/app/login/page.tsx` (login page)
- `packages/frontend/src/app/login/LoginForm.tsx` (login form component)
- `packages/frontend/src/app/saved-providers/page.tsx` (saved providers page)
- `packages/frontend/src/app/saved-providers/SavedProvidersList.tsx` (saved providers list)
- `packages/frontend/src/components/BookmarkButton.tsx` (save/unsave toggle)
- `packages/frontend/src/components/SaveProfileButton.tsx` (sidebar save button)
- `packages/frontend/src/components/Header.tsx` (user dropdown menu)

## Feature Overview

User account system with passwordless magic link authentication, JWT session management, and provider bookmarking.

### User Flow — Authentication
1. User clicks "Sign In" in header
2. Enters email on `/login` page
3. Frontend calls `POST /auth/magic-link` with email
4. Backend generates magic link token, sends email via Resend API
5. User clicks link in email → `GET /auth/verify?token=...`
6. Backend verifies token, creates User (if new), creates Session
7. Sets `vmp_access_token` (15min) and `vmp_refresh_token` (30d) HttpOnly cookies
8. Redirects to `/saved-providers`

### User Flow — Saved Providers
1. Authenticated user views provider detail page
2. Clicks BookmarkButton to save provider
3. Frontend calls `POST /saved-providers` with NPI
4. Provider appears on `/saved-providers` page
5. User can remove bookmarks via DELETE endpoint

## Backend Architecture

### Auth Routes (`/api/v1/auth`)

| Method | Path | Auth | Middleware | Description |
|--------|------|------|------------|-------------|
| GET | `/csrf-token` | None | — | Issue CSRF token |
| POST | `/magic-link` | None | csrfProtection, magicLinkRateLimiter | Request magic link email |
| GET | `/verify` | None | Zod validation | Verify magic link → set cookies → redirect |
| POST | `/refresh` | None | csrfProtection | Refresh access token |
| POST | `/logout` | requireAuth | csrfProtection | Clear session + cookies |
| POST | `/logout-all` | requireAuth | csrfProtection | Invalidate ALL sessions |
| GET | `/me` | requireAuth | — | Get user profile |
| GET | `/export` | requireAuth | — | GDPR data export |

### Saved Provider Routes (`/api/v1/saved-providers`)
CSRF protection applied at router level.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | requireAuth | List saved providers (paginated) |
| POST | `/` | requireAuth | Bookmark a provider (idempotent) |
| DELETE | `/:npi` | requireAuth | Remove bookmark (idempotent) |
| GET | `/:npi/status` | Optional | Check if saved (anonymous → `{saved: false}`) |

### Auth Middleware

**`extractUser` (global, runs on ALL requests):**
- Reads `vmp_access_token` cookie
- Verifies JWT via `jose` library
- Looks up session in database
- Sets `req.user = { id, email, sessionId }` on success
- Sets `req.user = null` on failure (never throws)
- Debounced `lastUsedAt` update (SESSION_ACTIVITY_DEBOUNCE_MS)

**`requireAuth` (route-level guard):**
- Returns 401 if `req.user` is null

### Cookie Configuration

| Cookie | HttpOnly | Secure | SameSite | MaxAge | Path |
|--------|----------|--------|----------|--------|------|
| `vmp_access_token` | Yes | Prod only | lax | 15 min | / |
| `vmp_refresh_token` | Yes | Prod only | lax | 30 days | /api/v1/auth |
| `vmp_csrf` | No (JS reads) | Prod only | lax | — | / |

Domain: `.verifymyprovider.com` in production, undefined in dev.

### authService.ts Functions

| Function | Purpose |
|----------|---------|
| `sendMagicLink(email, ip)` | Generate token, send email via Resend |
| `verifyMagicLink(token, ip, userAgent)` | Verify token, create user/session, return JWTs |
| `refreshSession(refreshToken)` | Rotate refresh token, issue new access token |
| `logout(sessionId)` | Delete single session |
| `invalidateAllSessions(userId)` | Delete ALL user sessions |
| `getMe(userId)` | Get user profile |
| `exportUserData(userId)` | GDPR export (user + sessions + saved providers + insurance card) |

## Database Models

### User
```prisma
model User {
  id             String             @id @default(cuid())
  email          String             @unique @db.VarChar(255)
  emailVerified  DateTime?          @map("email_verified")
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  savedProviders SavedProvider[]
  sessions       Session[]
  insuranceCard  UserInsuranceCard?
  @@map("users")
}
```

### Session
```prisma
model Session {
  id           String    @id @default(cuid())
  userId       String    @map("user_id")
  refreshToken String    @unique @db.VarChar(500)
  expiresAt    DateTime
  createdAt    DateTime  @default(now())
  ipAddress    String?   @db.VarChar(50)
  userAgent    String?   @db.VarChar(500)
  lastUsedAt   DateTime?
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([expiresAt])
  @@map("sessions")
}
```

### MagicLinkToken
```prisma
model MagicLinkToken {
  id        String    @id @default(cuid())
  email     String    @db.VarChar(255)
  token     String    @unique @db.VarChar(500)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  @@index([email])
  @@index([token])
  @@index([expiresAt])
  @@map("magic_link_tokens")
}
```

### SavedProvider
```prisma
model SavedProvider {
  id          String   @id @default(cuid())
  userId      String   @map("user_id")
  providerNpi String   @map("provider_npi") @db.VarChar(10)
  createdAt   DateTime @default(now())
  provider    Provider @relation(fields: [providerNpi], references: [npi], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, providerNpi])
  @@map("saved_providers")
}
```

## Frontend Components

### Login Page (`/login`)
- `LoginForm.tsx` — Email input, "Send Magic Link" button
- Error handling for expired/used/invalid tokens (via URL params)
- Redirect to `/saved-providers` after successful auth

### Saved Providers Page (`/saved-providers`)
- `SavedProvidersList.tsx` — Paginated list of bookmarked providers
- ProviderCard display for each saved provider
- Remove bookmark action

### BookmarkButton
- Appears on provider detail page and provider cards
- Shows filled/outline bookmark icon based on saved state
- Prompts login if user is anonymous
- Optimistic UI update on toggle
- Uses `GET /saved-providers/:npi/status` for initial state

### Header User Dropdown
- Shows "Sign In" for anonymous users
- Shows user email + dropdown for authenticated users
- Dropdown: Saved Providers, Insurance Card, Sign Out

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Secret for JWT signing (64+ hex chars) |
| `RESEND_API_KEY` | Yes | Resend API key for magic link emails |
| `MAGIC_LINK_BASE_URL` | No | Base URL for links (default: https://verifymyprovider.com) |
| `CSRF_SECRET` | Yes | CSRF token signing secret |

## Security Considerations

- [x] Magic links expire (configurable TTL)
- [x] Magic links single-use (usedAt timestamp)
- [x] Refresh token rotation on each refresh
- [x] Session invalidation on logout
- [x] "Logout everywhere" support (invalidateAllSessions)
- [x] CSRF protection on all mutating auth routes
- [x] Rate limiting on magic link requests (magicLinkRateLimiter)
- [x] No password storage (passwordless)
- [x] HttpOnly cookies prevent XSS token theft
- [x] Session lastUsedAt tracking
- [x] Email enumeration prevention (always returns success on magic-link)
- [x] IP + user agent stored per session for audit
- [x] GDPR data export endpoint

## Checklist

### Authentication
- [x] Magic link flow (request → email → verify → session)
- [x] JWT access tokens (15 min, jose library)
- [x] Refresh tokens (30 day, rotated on use)
- [x] HttpOnly secure cookies
- [x] CSRF double-submit cookie protection
- [x] Session management (create, refresh, logout, logout-all)
- [x] extractUser global middleware
- [x] requireAuth route guard
- [x] Rate limiting on magic link endpoint

### Saved Providers
- [x] Save/unsave provider bookmarks
- [x] List saved providers (paginated)
- [x] Check saved status (works for anonymous)
- [x] Idempotent save/unsave
- [x] Cascade delete on user or provider deletion

### Frontend
- [x] Login page with magic link form
- [x] Saved providers page with list
- [x] BookmarkButton on provider detail
- [x] SaveProfileButton in sidebar
- [x] Header user dropdown menu
- [x] Auth state detection (cookie-based)

### Missing / Future
- [ ] Email change flow
- [ ] Account deletion (GDPR right to erasure)
- [ ] OAuth providers (Google, Apple)
- [ ] Session activity dashboard
- [ ] Notification preferences

## Questions to Ask
1. Should expired sessions be cleaned up automatically (like verification TTL)?
2. Is the magic link expiration time appropriate?
3. Should we add OAuth (Google sign-in) for lower-friction auth?
4. Should the saved providers list have filtering/sorting?
5. Should there be a limit on saved providers per user?
