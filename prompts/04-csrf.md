---
tags:
  - security
  - csrf
  - high
type: prompt
priority: 2
---

# CSRF Protection Review

## Files to Review
- `packages/backend/src/middleware/csrf.ts` (CSRF middleware using csrf-csrf)
- `packages/backend/src/routes/index.ts` (route-level CSRF application)
- `packages/backend/src/index.ts` (middleware registration)
- `packages/frontend/src/` (frontend Next.js app, X-CSRF-Token header usage)

## VerifyMyProvider CSRF Architecture
- **Current State:** Fully implemented using double-submit cookie pattern
- **Library:** `csrf-csrf` (doubleCsrf)
- **Method:** Double-submit cookie -- server sets `vmp_csrf` cookie, frontend reads token from JSON response and sends it back via `X-CSRF-Token` header on mutating requests

## Checklist

### 1. Middleware Implementation (`middleware/csrf.ts`)
- [x] Uses `csrf-csrf` library (`doubleCsrf`)
- [x] `CSRF_SECRET` env var required (throws `Error` if missing)
- [x] Session identifier derived from `req.user.sessionId`, falling back to `req.ip`, then `'anonymous'`
- [x] Cookie name: `vmp_csrf`
- [x] Cookie `httpOnly: false` (JS must read for double-submit pattern)
- [x] Cookie `secure: true` in production, `false` in development
- [x] Cookie `sameSite: 'lax'`
- [x] Cookie `domain` set to `.verifymyprovider.com` in production
- [x] Token size: 64 bytes
- [x] Ignored methods: `GET`, `HEAD`, `OPTIONS`
- [x] Token extracted from `req.headers['x-csrf-token']`
- [x] Exports `csrfProtection` middleware and `generateCsrfToken` function

### 2. CSRF Token Endpoint
- [x] `GET /api/v1/auth/csrf-token` issues a new CSRF token
- [x] Sets `vmp_csrf` cookie on the response
- [x] Returns the token in the JSON response body
- [x] Frontend retrieves the token from the response and stores it for subsequent requests

### 3. Protected Routes (`routes/index.ts`)
- [x] `POST /api/v1/auth/magic-link` -- csrfProtection in route handler
- [x] `POST /api/v1/auth/refresh` -- csrfProtection in route handler
- [x] `POST /api/v1/auth/logout` -- csrfProtection in route handler
- [x] `POST /api/v1/auth/logout-all` -- csrfProtection in route handler
- [x] `/saved-providers` -- csrfProtection applied at router level (all methods)
- [x] `/me/insurance-card` -- csrfProtection applied at router level (all methods)

**Unprotected (by design):**
- [x] All `GET` requests (safe by default, excluded via `ignoredMethods`)
- [x] `HEAD` and `OPTIONS` requests (excluded via `ignoredMethods`)
- [x] Public search and read-only endpoints

### 4. Frontend Flow
- [x] Frontend calls `GET /api/v1/auth/csrf-token` to obtain a token
- [x] Server sets `vmp_csrf` cookie and returns the token in the JSON body
- [x] Frontend includes the token in the `X-CSRF-Token` header on `POST`, `PATCH`, and `DELETE` requests
- [x] Server validates that the cookie value matches the header value (double-submit cookie pattern)

### 5. Environment Configuration
- [x] `CSRF_SECRET` -- Required env var; application throws on startup if missing
- [x] Production cookie domain: `.verifymyprovider.com`
- [x] Production cookie `secure: true` (HTTPS only)
- [x] Development cookie `secure: false` (allows HTTP on localhost)

### 6. Reference Implementation

**Backend middleware (`middleware/csrf.ts`):**
```typescript
import { doubleCsrf } from 'csrf-csrf';

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  getSessionIdentifier: (req) => req?.user?.sessionId || req?.ip || 'anonymous',
  cookieName: 'vmp_csrf',
  cookieOptions: {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    domain: COOKIE_DOMAIN,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

export { doubleCsrfProtection as csrfProtection, generateCsrfToken };
```

**Frontend usage:**
```typescript
// 1. Fetch CSRF token
const res = await fetch('/api/v1/auth/csrf-token', { credentials: 'include' });
const { token } = await res.json();

// 2. Include token on mutating requests
await fetch('/api/v1/auth/magic-link', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token,
  },
  body: JSON.stringify({ email }),
});
```

### 7. Token Lifecycle

**Generation:**
- [x] Token generated via `GET /api/v1/auth/csrf-token`
- [x] Token sent as `vmp_csrf` cookie (readable by JS, `httpOnly: false`)
- [x] Token also returned in JSON response body for frontend storage

**Validation:**
- [x] Cookie value must match `X-CSRF-Token` header value
- [x] Validated on every `POST`, `PATCH`, `DELETE` request to protected routes
- [x] Invalid or missing token returns `403 Forbidden`

**Session Binding:**
- [x] Token tied to session identifier (`sessionId` > `ip` > `'anonymous'`)
- [x] Token invalidated if session identifier changes

### 8. Error Handling

**On CSRF Failure (403):**
- [x] Server returns 403 status with CSRF validation error
- [x] Frontend should catch 403, re-fetch a token from `/api/v1/auth/csrf-token`, and retry

### 9. Testing CSRF Protection

**Manual Tests:**
```bash
# 1. Get a CSRF token
curl -c cookies.txt https://api.verifymyprovider.com/api/v1/auth/csrf-token

# 2. Should succeed (valid token + cookie)
curl -b cookies.txt -X POST https://api.verifymyprovider.com/api/v1/auth/magic-link \
  -H "X-CSRF-Token: <token-from-step-1>" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# 3. Should fail 403 (no token header)
curl -b cookies.txt -X POST https://api.verifymyprovider.com/api/v1/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# 4. Should fail 403 (mismatched token)
curl -b cookies.txt -X POST https://api.verifymyprovider.com/api/v1/auth/magic-link \
  -H "X-CSRF-Token: wrong-token-value" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

### 10. Common CSRF Issues

**Issue 1: Cookie Not Readable by JS**
```javascript
// WRONG - httpOnly prevents JS from reading the cookie
cookieOptions: { httpOnly: true }

// CORRECT - httpOnly: false so JS can read (required for double-submit)
cookieOptions: { httpOnly: false }
```

**Issue 2: Missing X-CSRF-Token Header**
```javascript
// WRONG - no CSRF header sent
fetch('/api/v1/auth/logout', { method: 'POST' })

// CORRECT - include X-CSRF-Token header
fetch('/api/v1/auth/logout', {
  method: 'POST',
  headers: { 'X-CSRF-Token': token },
})
```

**Issue 3: Credentials Not Included**
```javascript
// WRONG - cookie not sent cross-origin without credentials
fetch('/api/v1/auth/csrf-token')

// CORRECT - include credentials so cookie is sent/received
fetch('/api/v1/auth/csrf-token', { credentials: 'include' })
```

**Issue 4: Missing CSRF_SECRET Env Var**
```
// Application throws on startup if CSRF_SECRET is not set
Error: CSRF_SECRET environment variable is required
```

## Implementation Status

- [x] `csrf-csrf` library installed and configured
- [x] `middleware/csrf.ts` exports `csrfProtection` and `generateCsrfToken`
- [x] `GET /api/v1/auth/csrf-token` endpoint serves tokens
- [x] Auth routes protected: magic-link, refresh, logout, logout-all
- [x] Data-mutation routes protected: saved-providers, insurance-card
- [x] Frontend sends `X-CSRF-Token` header on mutating requests
- [x] `CSRF_SECRET` required in environment
- [x] Production cookies scoped to `.verifymyprovider.com` with `secure: true`
