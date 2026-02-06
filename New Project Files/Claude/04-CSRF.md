# VerifyMyProvider CSRF Protection

**Last Updated:** 2026-02-06
**Current State:** No CSRF protection implemented (not needed -- no auth)
**Future Need:** Required when authentication (Phase 2+) is added

---

## Current State

### No CSRF Protection

- [x] **No authentication = no CSRF risk** -- Verified: No session cookies, no JWT cookies, no authentication tokens stored in cookies. CSRF attacks require session-based authentication to exploit, and VerifyMyProvider has none.
- [x] **All endpoints are public** -- Verified in `routes/index.ts`: all route groups registered without auth middleware. Only admin routes have `adminAuthMiddleware` which uses a header-based secret (not cookie-based).
- [x] **No cookies used for authentication** -- Verified in `index.ts`: no `express-session`, no `cookie-session`, no `cookie-parser` middleware. CORS has `credentials: true` (line 84) but no cookies are actually set.
- [x] **No sessions to hijack** -- Verified: no session store, no session middleware, no session IDs.

### Why No CSRF Currently

- [x] **CSRF attacks target authenticated sessions** -- Without cookies carrying auth tokens, a cross-origin form submission cannot impersonate a user because there is no user identity to impersonate.
- [x] **Without auth, there's nothing to hijack** -- The worst a CSRF attack could do is submit a verification or vote, which is already possible directly via the public API. Rate limiting, CAPTCHA, and Sybil prevention mitigate this.
- [x] **Once auth is added, CSRF becomes critical** -- If JWT or session tokens are stored in cookies, CSRF protection must be in place before those features ship.

### Admin Endpoints and CSRF

The admin endpoints (`/api/v1/admin/*`) use `X-Admin-Secret` header authentication (`admin.ts` lines 21-55). This is inherently CSRF-resistant because:
1. The `X-Admin-Secret` header is a custom header
2. Browsers do not attach custom headers to cross-origin form submissions
3. The CORS `allowedHeaders` whitelist includes `X-Admin-Secret` (`index.ts` line 83), but cross-origin requests from non-whitelisted origins are blocked
4. Even if CORS were misconfigured, the browser's preflight (OPTIONS) check would prevent the custom header from being sent cross-origin without explicit server approval

**Assessment:** Admin endpoints do NOT need CSRF protection with the current header-based auth scheme.

---

## When CSRF Protection Is Needed

### Triggers

- [ ] **Adding email verification (Phase 2)** -- If verification codes are stored in cookies
- [ ] **Adding user accounts (Phase 3)** -- If JWT refresh tokens use HttpOnly cookies
- [ ] **Adding session cookies** -- Any cookie-based auth mechanism
- [ ] **Adding premium features with payment** -- Critical for financial transactions

### Timeline

- [x] **Not needed now** -- No cookies, no sessions, no auth
- [ ] **Required before Phase 2 beta** -- If Phase 2 uses cookie-based verification codes
- [ ] **Critical before Phase 3** -- Full accounts with cookie-based JWT

**Important caveat:** If Phase 2/3 uses header-based JWT (Authorization: Bearer) instead of cookie-based JWT, CSRF protection is still not required. CSRF only matters when the browser automatically attaches credentials (cookies) to requests.

---

## CSRF Implementation Plan

### Method: Double-Submit Cookie (Recommended)

**Why this method:**
- Works well with SPA (Next.js) + API (Express) architecture
- No server-side session storage needed
- Compatible with stateless JWT auth

### Backend Implementation (When Needed)

**File to create:** `packages/backend/src/middleware/csrf.ts`

```typescript
// Double-submit cookie pattern
import csrf from 'csurf';

const csrfProtection = csrf({
  cookie: {
    httpOnly: false,    // JS needs to read the token
    secure: true,       // HTTPS only
    sameSite: 'strict', // Prevents cross-site cookie sending
  }
});
```

**Alternative:** Since `csurf` is deprecated (npm), consider using `csrf-csrf` package or implementing the double-submit pattern manually.

### Frontend Implementation (When Needed)

The Next.js frontend would need to:
1. Read the CSRF token from the cookie on page load
2. Include it in the `X-CSRF-Token` header for all mutating requests
3. Handle 403 responses by refreshing the token

### SameSite Cookie as Additional Protection

Modern browsers support `SameSite=Strict` or `SameSite=Lax` cookies, which provide CSRF protection at the browser level. When auth is implemented:
- Set all auth cookies with `SameSite: 'strict'`
- This prevents cookies from being sent on cross-origin requests
- Use double-submit cookie as defense-in-depth

---

## Protected Routes (When Auth Is Added)

### Mutating Endpoints (Will Need CSRF)
- [ ] `POST /auth/register`
- [ ] `POST /auth/login`
- [ ] `POST /auth/logout`
- [ ] `POST /auth/refresh`
- [ ] `POST /api/v1/verify` (if auth-gated)
- [ ] `POST /api/v1/verify/:verificationId/vote` (if auth-gated)
- [ ] `PUT /users/me/settings`
- [ ] `DELETE /users/me/account`

### Safe Endpoints (No CSRF Needed)
- [x] All GET requests -- safe by HTTP specification
- [x] Public search endpoints -- no side effects
- [x] Admin endpoints -- use header-based auth (inherently CSRF-resistant)

---

## Token Lifecycle (When Implemented)

**Generation:**
- [ ] Token generated on first page load
- [ ] Token sent as cookie (readable by JS, `httpOnly: false`)
- [ ] Token regenerated on login/logout

**Validation:**
- [ ] Token in cookie must match token in `X-CSRF-Token` header
- [ ] Validated on every mutating request
- [ ] Invalid/missing token returns 403 Forbidden

**Expiration:**
- [ ] Token expires with session/auth cookie
- [ ] Token regenerated on authentication state changes

---

## Error Handling (When Implemented)

**On CSRF Failure:**
```typescript
// Backend: Return 403 with clear error
{
  error: {
    message: 'Invalid CSRF token',
    code: 'CSRF_TOKEN_INVALID',
    statusCode: 403,
    requestId: req.id  // Already available via requestId middleware
  }
}

// Frontend: Refresh page or fetch new token
if (response.status === 403 && response.data?.code === 'CSRF_TOKEN_INVALID') {
  // Refresh CSRF token and retry request
}
```

---

## Testing Strategy (When Implemented)

**Manual tests:**
```bash
# Should succeed (with valid token)
curl -X POST /api/v1/verify \
  -H "X-CSRF-Token: <token>" \
  -H "Cookie: csrf_token=<token>" \
  -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true}'

# Should fail 403 (no token)
curl -X POST /api/v1/verify \
  -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true}'

# Should fail 403 (mismatched token)
curl -X POST /api/v1/verify \
  -H "X-CSRF-Token: wrong" \
  -H "Cookie: csrf_token=<token>" \
  -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true}'
```

**Automated tests:**
- Integration tests verifying 403 on missing/invalid CSRF tokens
- Tests verifying CSRF not required for GET requests
- Tests verifying CSRF not required for admin endpoints (header auth)

---

## Common Issues to Avoid

1. **Token not readable by JavaScript**
   - Problem: Setting `httpOnly: true` on the CSRF cookie prevents JS from reading it
   - Solution: `httpOnly: false` for the CSRF cookie (it's not a secret -- the pattern relies on the Same-Origin Policy)

2. **Missing header in API client**
   - Problem: Frontend fetch calls without `X-CSRF-Token` header
   - Solution: Configure API client (axios/fetch wrapper) to always include the header on POST/PUT/DELETE

3. **Token not refreshed on login**
   - Problem: Using pre-login CSRF token after authentication
   - Solution: Regenerate token on any authentication state change

4. **csurf deprecation**
   - Problem: The `csurf` npm package is deprecated
   - Solution: Use `csrf-csrf`, `lusca`, or implement double-submit pattern manually (straightforward with `crypto.randomBytes`)

---

## Implementation Timeline

- [x] **Phase 1 (Now):** Not needed -- no auth, no cookies, no sessions
- [ ] **Phase 2 (Beta):** Implement if cookie-based verification codes are used
- [ ] **Phase 3 (Scale):** Critical -- must be in place before cookie-based JWT auth ships

---

## Questions Answered

### 1. When should we implement CSRF protection?
**Answer:** Only when authentication that uses cookies is implemented. If Phase 2/3 uses header-based JWT (Authorization: Bearer), CSRF is not needed. If HttpOnly cookies are used for refresh tokens, CSRF must be implemented simultaneously.

### 2. What's the priority relative to other security items?
**Answer:** Lower priority than rate limiting (already implemented), CAPTCHA (already implemented), and Sybil prevention (already implemented). CSRF is only relevant when auth introduces cookies.

### 3. Should we use csurf library or roll our own?
**Answer:** `csurf` is deprecated. Options: `csrf-csrf` package (maintained), `lusca` (Kraken.js ecosystem), or manual double-submit cookie (simple: generate random token, set as cookie, validate header matches cookie).

### 4. What should happen when CSRF validation fails?
**Answer:** Return 403 with error code `CSRF_TOKEN_INVALID`. Frontend should catch this and attempt token refresh before retrying.

### 5. How should we test CSRF protection?
**Answer:** Automated integration tests with three scenarios: valid token (200), missing token (403), mismatched token (403). Plus manual curl tests during development.

### 6. Should we have a way to bypass CSRF in development?
**Answer:** Follow the same pattern as CAPTCHA (`captcha.ts` line 121): skip in development/test environments via `process.env.NODE_ENV` check.
