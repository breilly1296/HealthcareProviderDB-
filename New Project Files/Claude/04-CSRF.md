# CSRF Protection Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/04-csrf.md
**Status:** Not needed currently -- No authentication means no sessions to hijack. Correctly deferred.

---

## Findings

### 1. Current State (No CSRF Protection)

- **No authentication = no CSRF risk:**
  Verified. CSRF attacks work by tricking an authenticated user's browser into making unwanted requests using the user's existing session credentials (cookies). Since VerifyMyProvider has zero authentication, there are no session credentials to exploit.

- **All endpoints are public:**
  Verified. Every public endpoint (`/api/v1/providers/*`, `/api/v1/plans/*`, `/api/v1/verify/*`) has no auth middleware. The admin endpoints use header-based auth (`X-Admin-Secret`), not cookie-based auth, so they are also not vulnerable to CSRF.

- **No cookies used for authentication:**
  Verified. A thorough grep of the entire backend `src/` directory for "cookie", "Cookie", "session", and "Session" returned zero relevant results. No `express-session`, `cookie-parser`, or any cookie-setting middleware is installed or used.

- **No sessions to hijack:**
  Verified. No session store (Redis, in-memory, or database) is configured. No session IDs are generated or tracked.

**Why No CSRF Currently:**

- **CSRF attacks target authenticated sessions:**
  Correct assessment. The attack vector requires the victim to have an active authenticated session with the target application.

- **Without auth, there's nothing to hijack:**
  Correct. An attacker could craft a malicious page that makes POST requests to the API, but those requests would be the same as any anonymous request -- they carry no elevated privileges.

- **Once auth is added, CSRF becomes critical:**
  Correct. This is the key trigger for implementing CSRF protection.

### 2. When CSRF Protection Is Needed

**Triggers (all confirmed as NOT YET present):**

- **Adding email verification (Phase 2 auth):** Not implemented. No `/auth/*` routes exist.
- **Adding user accounts (Phase 3 auth):** Not implemented. No User model in Prisma schema.
- **Adding session cookies:** Not implemented. No cookie-setting code anywhere.
- **Adding premium features with payment:** Not implemented.

**Timeline assessment:**

- **Not needed now (no auth):** Correct. Implementing CSRF protection now would add complexity with zero security benefit.
- **Required before Phase 2 beta launch:** Correct -- if Phase 2 introduces any form of cookie-based session.
- **Critical before Phase 3 (full accounts):** Correct.

### 3. Current Protections Against Cross-Origin Abuse

While CSRF is not a concern, the codebase does have cross-origin protections that are relevant:

- **CORS whitelist (strict):**
  Verified in `packages/backend/src/index.ts`. Only specific origins are allowed:
  - `https://verifymyprovider.com`
  - `https://www.verifymyprovider.com`
  - `https://verifymyprovider-frontend-741434145252.us-central1.run.app`
  - `process.env.FRONTEND_URL` (additional Cloud Run URL)
  - `http://localhost:3000` and `http://localhost:3001` (development only)

  Requests with no `Origin` header are allowed (for curl, mobile apps, Postman). Blocked origins are logged.

- **Helmet security headers:**
  Verified. `helmet()` is configured with strict CSP for JSON API:
  - `frameAncestors: ["'none'"]` -- prevents clickjacking
  - `formAction: ["'none'"]` -- blocks form submissions to the API
  - `crossOriginEmbedderPolicy: true`
  - `crossOriginOpenerPolicy: { policy: 'same-origin' }`
  - `crossOriginResourcePolicy: { policy: 'same-origin' }`
  - `referrerPolicy: { policy: 'no-referrer' }`

- **`credentials: true` in CORS:**
  This setting is present but has no effect currently since no cookies are set. This will need attention when auth is added -- it enables browsers to send cookies cross-origin, which is necessary for cookie-based auth but also enables CSRF if not paired with CSRF tokens.

### 4. Routes That Would Need CSRF Protection (Future)

Based on current mutating endpoints, the following would need CSRF protection once cookie-based auth is added:

**Currently existing mutating endpoints:**
- `POST /api/v1/verify` -- Submit verification
- `POST /api/v1/verify/:verificationId/vote` -- Vote on verification
- `POST /api/v1/admin/cleanup-expired` -- Admin cleanup (header auth, not cookie -- may not need CSRF)
- `POST /api/v1/admin/cache/clear` -- Admin cache clear (header auth)
- `POST /api/v1/admin/cleanup/sync-logs` -- Admin log cleanup (header auth)

**Future endpoints (per prompt Phase 2/3):**
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `PUT /users/me/settings`
- `DELETE /users/me/account`

**Note on admin routes:** The admin routes use `X-Admin-Secret` header auth, not cookies. If this pattern is maintained, admin routes do not need CSRF protection. CSRF only applies to cookie-based authentication.

### 5. CSRF Library Choice (Future)

The prompt suggests `csurf` library. Note: The `csurf` npm package was deprecated in September 2022 due to design issues. When the time comes, consider alternatives:
- `csrf-csrf` (double-submit cookie pattern, actively maintained)
- `lusca` (includes CSRF among other security middleware)
- Custom implementation using `crypto.randomBytes` + double-submit cookie pattern

### 6. No CSRF Middleware File Exists

Verified. There is no `csrf.ts` file in `packages/backend/src/middleware/`. The prompt correctly notes this with "(no csrf.ts yet - not needed without auth)".

---

## Summary

CSRF protection is correctly absent from the codebase. The application has no authentication, no cookies, and no sessions -- the three prerequisites for CSRF vulnerability. The existing CORS whitelist, Helmet security headers, and `Content-Type` enforcement (JSON body parsing) provide a solid foundation for when CSRF protection will be needed.

The admin routes use header-based authentication (`X-Admin-Secret`), which is inherently resistant to CSRF since browsers do not automatically send custom headers. This is a good architectural choice.

The decision to defer CSRF implementation until authentication is added is the correct one. Implementing it prematurely would add complexity, maintenance burden, and potential for bugs with no security benefit.

---

## Recommendations

1. **Do not implement CSRF protection now.** There is nothing to protect. Wait until cookie-based authentication is added.

2. **Do not use `csurf` when the time comes.** The `csurf` npm package is deprecated. Use `csrf-csrf` or a custom double-submit cookie implementation instead.

3. **Review `credentials: true` before adding auth.** When cookie-based auth is introduced, the existing `credentials: true` CORS setting will allow cookies to be sent cross-origin. At that point, CSRF protection becomes mandatory for all mutating endpoints that rely on cookie-based auth.

4. **Keep admin routes on header-based auth.** The `X-Admin-Secret` header pattern is CSRF-resistant by design. Even after user auth is added, admin routes should continue using header-based auth (or a separate admin JWT mechanism), not cookies.

5. **Add CSRF implementation to the Phase 2 checklist.** When planning the Phase 2 beta with email verification, include CSRF as a prerequisite task alongside the auth implementation. The two must be deployed together.

6. **Consider SameSite cookie attribute.** When implementing auth cookies in the future, use `SameSite=Strict` or `SameSite=Lax` as a defense-in-depth measure alongside CSRF tokens. Modern browsers support this, and it provides an additional layer of protection.
