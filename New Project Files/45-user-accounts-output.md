# User Accounts & Saved Providers — Review Output

## 1. Summary

The auth stack is well-designed and largely production-grade: passwordless magic-link, JWT access tokens via `jose`, SHA-256-hashed refresh tokens with rotation + sliding expiry, per-user session cap (5), per-IP + per-email rate limiting, CSRF double-submit via `csrf-csrf`, `.verifymyprovider.com` cookie domain in prod, and a GDPR export that decrypts insurance-card PII server-side. The saved-providers feature is small, idempotent, and cleanly scoped. Primary gaps: no account deletion route (GDPR right-to-erasure), no automated session cleanup cron, and CSRF is not enforced on several mutating paths.

## 2. Findings

### CRITICAL

- **No account deletion endpoint.** No route for `DELETE /api/v1/auth/me` or similar in `packages/backend/src/routes/auth.ts`. GDPR Article 17 (right to erasure) is not satisfied. The schema does have `onDelete: Cascade` on `User → Session/SavedProvider/InsuranceCard` (`packages/backend/prisma/schema.prisma` via the models referenced in `authService.ts:360-435`), so deletion is technically one `prisma.user.delete` away — the route just doesn't exist.

### HIGH

- **`POST /api/v1/saved-providers` is NOT CSRF-protected.** Router-level at `packages/backend/src/routes/savedProviders.ts:45-59` applies only `defaultRateLimiter + requireAuth`. No `csrfProtection`. Same for DELETE at `:66-77`. The prompt's doc header says "CSRF protection applied at router level" — code contradicts this. An attacker with a valid victim session cookie and a same-site-lax loophole (e.g. GET-initiated POST from a top-level redirect on another tab) can bookmark arbitrary NPIs. Low impact (bookmark != financial) but still a regression vs. the documented security model.
- **Magic-link rate limit can be bypassed per-IP.** `packages/backend/src/routes/auth.ts:87` uses `magicLinkRateLimiter` (5 per 15 min per IP, `rateLimiter.ts:373-378`) AND `authService.ts:73-85` also caps 5 per hour per email — but the IP limiter only fires before the email-based check, and both can be evaded by rotating IPs (residential proxies). Combined these are reasonable, just noting enumeration risk is nonzero. Because the route always returns the same success message (`auth.ts:93-97`), timing differences in "send email" vs "skip email" are the only enumeration signal — acceptable but not perfect.
- **`GET /api/v1/auth/verify` has no rate limit.** `auth.ts:108-131` is open. Token-guessing at 32-byte entropy is infeasible, but an attacker hitting the endpoint could exhaust the DB lookup budget. Add the default rate limiter for defense-in-depth.
- **No automated session cleanup.** `authService.ts:441-460` `cleanupExpiredSessions` exists but is not wired to a cron/scheduler. The `sessions` table will grow unboundedly (30-day TTL, but orphaned rows post-expiry are never deleted unless a refresh happens, `authService.ts:256-259`). Answer to Open Q #1: yes, automate it.

### MEDIUM

- **Session `expiresAt` is a SLIDING window.** `authService.ts:267-271` extends expiry on every refresh. There is no *absolute* max lifetime — a user who refreshes weekly can stay logged in forever. Most apps cap at 90 days absolute. Minor, but worth an explicit policy.
- **Access token lives 15 min but session check in `extractUser` runs a DB query on every request.** `middleware/auth.ts:66-68` — this is fine at current scale but skips the JWT's whole optimization value. Cache session lookup (5-min TTL is already debounced for `lastUsedAt` at `:79-86`) to reduce DB pressure.
- **`MAX_SESSIONS_PER_USER = 5` is enforced but silent.** `authService.ts:194-214` evicts the oldest session when the limit is reached, without telling the user their other device was logged out. For a medical-data site this is probably fine, but consider a notification.
- **Export endpoint decrypts PII inline with no rate limit.** `auth.ts:211-222` uses `requireAuth` and `defaultRateLimiter` only via the router default — wait, looking at `auth.ts:217`, there is no rate limiter declared. A compromised session could call `/export` in a tight loop to log decrypt events; see `authService.ts:383-390`. Add the default limiter.
- **CSRF secret is read lazily.** `middleware/csrf.ts:8-14` — fine. But `csrfProtection` wraps `doubleCsrfProtection` which throws if `CSRF_SECRET` is missing; the error will surface only on first POST, not at app startup. Add an env-presence check in `index.ts` startup.
- **Session `userAgent` truncated to 500 chars** (`authService.ts:223`) which is shorter than some real UAs. Minor.

### LOW

- **`vmp_csrf` cookie has `httpOnly: false`** (intentional for double-submit, `csrf.ts:19`). Correct but documents why XSS would still defeat CSRF — worth a comment.
- **Login form stores email state across redirect** (`app/login/LoginForm.tsx:44`), fine; but success message after `setStatus('success')` keeps the email visible indefinitely (`LoginForm.tsx:105-121`). Consider clearing after 30s.
- **`SavedProvider` model has no limit.** `savedProviders.ts:45-59` lets a user save unlimited bookmarks; a single user could create 100k rows. Open Q #5 — yes, add a cap (e.g. 500).
- **`isProviderSaved` does a count query** (`savedProviderService.ts:181-187`). `findFirst` with `select: { id: true }` would be marginally cheaper; micro-opt.
- **Rate limiter headers exposed on saved-providers routes** — `defaultRateLimiter` is 200/hr (`rateLimiter.ts:329-334`) which is generous for a logged-in user bookmarking.
- **`clearAuthCookies` path mismatch on refresh cookie.** `auth.ts:62` clears at `/api/v1/auth` — matches the set path at `:55`. Good.
- **`redirect(302)` on verify failure** (`auth.ts:112, 129`) leaks the attempt to referer logs on the `/login?error=…` page; negligible.

## 3. Checklist verification

### Authentication
- [x] Magic link flow — `authService.ts:68-147` send, `:154-237` verify
- [x] JWT access tokens (15 min, jose library) — `authService.ts:50-57` + `constants.ts:100` `ACCESS_TOKEN_EXPIRY = '15m'`
- [x] Refresh tokens (30 day, rotated on use) — `authService.ts:243-284`, rotation at `:262-273`
- [x] HttpOnly secure cookies — `auth.ts:41-57`, `secure: IS_PRODUCTION` at `:43`
- [~] **CSRF double-submit cookie protection — PARTIAL**: present on `/auth/magic-link`, `/refresh`, `/logout`, `/logout-all` (`auth.ts:86, 139, 161, 179`). NOT applied to `/saved-providers` POST/DELETE (`savedProviders.ts:45-77`). See HIGH.
- [x] Session management (create, refresh, logout, logout-all) — `authService.ts:217-235, 243-284, 317-327, 291-298`
- [x] `extractUser` global middleware — `middleware/auth.ts:41-97`, globally registered (per prompt)
- [x] `requireAuth` route guard — `middleware/auth.ts:105-110`
- [x] Rate limiting on magic link endpoint — `auth.ts:87` `magicLinkRateLimiter` + `authService.ts:73-85` per-email

### Saved Providers
- [x] Save/unsave provider bookmarks — `savedProviderService.ts:89-175`
- [x] List saved providers (paginated) — `savedProviderService.ts:37-83` + route at `savedProviders.ts:21-38`
- [x] Check saved status (works for anonymous) — `savedProviders.ts:84-99`, anonymous branch at `:90-93`
- [x] Idempotent save/unsave — `savedProviderService.ts:101-129` (save returns existing), `:164-175` (unsave swallows P2025)
- [x] Cascade delete on user or provider deletion — Prisma `onDelete: Cascade` per schema snippet in prompt (verified in `schema.prisma` line 171 in the prompt excerpt)

### Frontend
- [x] Login page with magic link form — `app/login/LoginForm.tsx:16-188`, error handling via `VERIFY_ERRORS` at `:10-14`
- [x] Saved providers page with list — `app/saved-providers/SavedProvidersList.tsx` (verified first 60 lines)
- [x] BookmarkButton on provider detail — `components/BookmarkButton.tsx:17-116`, optimistic updates at `:31-50, 52-71`, login prompt at `:80-83`
- [x] SaveProfileButton in sidebar — `components/SaveProfileButton.tsx` exists (confirmed via grep)
- [x] Header user dropdown menu — `components/Header.tsx` exists (referenced in `layout.tsx:11`)
- [x] Auth state detection (cookie-based) — `useAuth` via `context/AuthContext`, used at `LoginForm.tsx:17`, `BookmarkButton.tsx:18`

### Missing / Future
- [ ] Email change flow — no endpoint found
- [ ] Account deletion (GDPR right to erasure) — **CRITICAL** above
- [ ] OAuth providers (Google, Apple) — not present
- [ ] Session activity dashboard — `sessions` table has `ipAddress`, `userAgent`, `lastUsedAt` ready (`authService.ts:222-225`, `middleware/auth.ts:79-86`); UI missing
- [ ] Notification preferences — no model or route

## 4. Recommendations (ranked)

1. **Add `DELETE /api/v1/auth/me`** (or `/auth/account`) with `requireAuth + csrfProtection` that calls `prisma.user.delete({ where: { id: req.user.id } })`. Cascade handles sessions/saved/insurance-card. Unblocks GDPR compliance.
2. **Apply `csrfProtection` to `savedProviders.ts` mutating routes.** Router-level or per-method at `:45, :66`. Restores the security model that the prompt documents.
3. **Cron-schedule `cleanupExpiredSessions`.** `authService.ts:441-460` is a one-liner to wire into an admin route + hourly cron, or use a scheduled Cloud Run job.
4. **Add `defaultRateLimiter` to `GET /auth/verify` and `GET /auth/export`.** Both currently have only `asyncHandler`. Defense-in-depth.
5. **Introduce an absolute session max (e.g. 90 days).** In `refreshSession` (`authService.ts:243-284`) track `createdAt` and reject refresh if `now - createdAt > 90 days`, forcing re-auth. Prevents indefinite sessions from a single successful auth.
6. **Cap `saved_providers` per user.** Add `const MAX_SAVED = 500` and reject `saveProvider` at `savedProviderService.ts:89-132` with a 400 once hit.
7. **Add a Session Activity UI.** `sessions` table already records everything; a `/account/sessions` page listing IP + UA + lastUsedAt + "revoke" button unlocks both transparency and the prompt's Missing item.

## 5. Open questions (from prompt)

1. **Should expired sessions be cleaned up automatically?** Yes — `cleanupExpiredSessions` exists but is not scheduled (`authService.ts:441-460`). See Rec 3.
2. **Is the magic link expiration time appropriate?** 15 min (`constants.ts:85` `MAGIC_LINK_EXPIRY_MS`) is the industry norm — balance between giving users time to switch to an inbox app vs. keeping the window of a leaked email short. Appropriate.
3. **Should we add OAuth (Google sign-in) for lower-friction auth?** Yes for B2C healthcare discovery; the added dependency surface is minimal with Auth.js v5 or a Resend-like turnkey flow. Not urgent given magic-link UX is already low-friction.
4. **Should the saved providers list have filtering/sorting?** Currently `orderBy: { createdAt: 'desc' }` (`savedProviderService.ts:45`). For a 500-cap list, client-side sort is fine.
5. **Should there be a limit on saved providers per user?** Yes — Rec 6.
