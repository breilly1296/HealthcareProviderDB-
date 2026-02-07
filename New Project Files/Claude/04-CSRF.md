# VerifyMyProvider CSRF Protection

**Last Updated:** 2026-02-07
**Current State:** Not needed (no authentication, no sessions, no cookies)
**Future Need:** Required for Phase 2+ (email verification / magic links)
**Reviewed By:** Claude Opus 4.6 (automated security audit)

---

## Current State

### No CSRF Protection Implemented

VerifyMyProvider currently has **zero CSRF protection** -- and this is correct for the current architecture. Here is the evidence from the codebase:

1. **No CSRF middleware exists.** The middleware directory (`packages/backend/src/middleware/`) contains eight middleware files -- none of which implement CSRF:

   | File | Purpose |
   |------|---------|
   | `captcha.ts` | Google reCAPTCHA v3 verification |
   | `errorHandler.ts` | Error handling and `AppError` class |
   | `honeypot.ts` | Hidden field bot detection |
   | `httpLogger.ts` | Pino HTTP request logging |
   | `index.ts` | Re-exports errorHandler and rateLimiter |
   | `rateLimiter.ts` | Dual-mode (Redis/in-memory) rate limiting |
   | `requestId.ts` | UUID-based request correlation |
   | `requestLogger.ts` | Usage analytics without PII |
   | `requestTimeout.ts` | Per-route timeout enforcement |

2. **No CSRF-related dependencies.** The backend `package.json` does not include `csurf`, `csrf-csrf`, `cookie-parser`, `express-session`, or any session/CSRF library.

3. **No cookies are set.** The backend sets no `Set-Cookie` headers. The CORS configuration in `packages/backend/src/index.ts` includes `credentials: true`, but this is forward-looking -- no cookies are actually exchanged:

   ```typescript
   // packages/backend/src/index.ts (lines 68-86)
   app.use(cors({
     origin: (origin, callback) => {
       if (!origin) {
         return callback(null, true);
       }
       if (ALLOWED_ORIGINS.includes(origin)) {
         callback(null, true);
       } else {
         logger.warn({ origin }, 'CORS blocked request from origin');
         callback(new Error('Not allowed by CORS'));
       }
     },
     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
     allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Admin-Secret'],
     credentials: true,
   }));
   ```

4. **No user sessions.** There is no session store, no `express-session`, no JWT token issuance, and no user login/logout flow.

5. **Admin authentication is header-based, not cookie-based.** The admin routes in `packages/backend/src/routes/admin.ts` authenticate using `X-Admin-Secret` header with timing-safe comparison -- not cookies:

   ```typescript
   // packages/backend/src/routes/admin.ts (lines 22-56)
   function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
     const adminSecret = process.env.ADMIN_SECRET;
     if (!adminSecret) { /* ... return 503 ... */ }

     const providedSecret = req.headers['x-admin-secret'];
     const providedBuffer = Buffer.from(String(providedSecret || ''));
     const secretBuffer = Buffer.from(adminSecret);

     const isValid =
       providedBuffer.length === secretBuffer.length &&
       timingSafeEqual(providedBuffer, secretBuffer);

     if (!isValid) {
       throw AppError.unauthorized('Invalid or missing admin secret');
     }
     next();
   }
   ```

   This is immune to CSRF because browsers cannot set custom headers (`X-Admin-Secret`) via cross-origin form submissions or image tags.

### Why No CSRF Is Currently Safe

CSRF (Cross-Site Request Forgery) attacks exploit **authenticated sessions** -- they trick a user's browser into sending a request that carries the user's session cookie, causing the server to execute actions with the user's identity and privileges.

In the current VerifyMyProvider architecture, there is **nothing to forge**:

| CSRF Prerequisite | VerifyMyProvider Status | Risk |
|---|---|---|
| Authentication cookies | None -- no auth system exists | None |
| Session state | None -- stateless API | None |
| User identity | Anonymous IP-based tracking only | None |
| Privileged actions tied to identity | None -- all actions are anonymous | None |
| Cookie-based admin auth | No -- uses `X-Admin-Secret` header | None |

**Current protection layers against abuse (in lieu of CSRF):**

- **Rate limiting** -- All mutating endpoints have strict per-IP rate limits (10 verifications/hour, 10 votes/hour) via sliding-window algorithm in `packages/backend/src/middleware/rateLimiter.ts`
- **CAPTCHA** -- Google reCAPTCHA v3 protects verification and vote submissions in `packages/backend/src/middleware/captcha.ts`
- **Honeypot** -- Hidden `website` field catches bots in `packages/backend/src/middleware/honeypot.ts`
- **CORS** -- Strict origin allowlist prevents unauthorized cross-origin requests
- **Helmet** -- Full CSP headers with `formAction: ["'none'"]` and `frameAncestors: ["'none'"]` prevent embedding and form hijacking
- **Input validation** -- Zod schemas validate all request payloads

### When CSRF Becomes Critical

CSRF protection is **not needed now** but becomes **mandatory** when any of these triggers occur:

| Trigger | Phase | Why CSRF Is Needed |
|---------|-------|--------------------|
| Email verification (magic links) | Phase 2 | Session cookies will authenticate users |
| User accounts with trust tiers | Phase 2 | Actions are tied to identity/reputation |
| Session cookies (JWT in httpOnly cookie) | Phase 2 | Browser will auto-send cookies on cross-origin requests |
| Premium features with payment | Phase 3 | Financial actions must be protected from forgery |
| OAuth (Google/Apple login) | Phase 3 | Session persistence via cookies |

According to `docs/AUTH-IMPLEMENTATION-PLAN.md`, Phase 2 uses custom JWT + Oslo tokens + Resend for magic-link email verification. Once JWTs are stored in cookies (which is the plan per the auth design), CSRF protection becomes critical.

---

## Current Mutating Endpoints Inventory

### Endpoints That Will Need CSRF Protection (Post-Auth)

All current POST/PUT/DELETE endpoints, plus future auth endpoints:

| Method | Route | Current Protection | CSRF Needed When Auth Added? |
|--------|-------|-------------------|------------------------------|
| POST | `/api/v1/verify` | Rate limit (10/hr) + CAPTCHA + Honeypot | Yes |
| POST | `/api/v1/verify/:verificationId/vote` | Rate limit (10/hr) + CAPTCHA + Honeypot | Yes |
| POST | `/api/v1/admin/cleanup-expired` | `X-Admin-Secret` header | No (header-based auth is CSRF-immune) |
| POST | `/api/v1/admin/cache/clear` | `X-Admin-Secret` header | No |
| POST | `/api/v1/admin/cleanup/sync-logs` | `X-Admin-Secret` header | No |
| POST | `/api/v1/admin/recalculate-confidence` | `X-Admin-Secret` header | No |

**Future endpoints that will need CSRF from day one:**

| Method | Route | Notes |
|--------|-------|-------|
| POST | `/api/v1/auth/register` | Magic link registration |
| POST | `/api/v1/auth/login` | Magic link login |
| POST | `/api/v1/auth/logout` | Session destruction |
| POST | `/api/v1/auth/refresh` | Token refresh |
| PUT | `/api/v1/users/me/settings` | User preferences |
| DELETE | `/api/v1/users/me/account` | Account deletion |

### Endpoints That Remain CSRF-Free

| Method | Route | Why |
|--------|-------|-----|
| GET | All GET routes | Safe by definition (idempotent, no side effects) |
| POST | Admin routes with `X-Admin-Secret` | Custom header requirement makes CSRF impossible |

---

## CSRF Implementation Plan

### Recommended Method: Double-Submit Cookie Pattern

The double-submit cookie pattern is recommended because:
- It is **stateless** -- no server-side token storage needed (fits the current stateless API design)
- It works with the existing **Express + separate frontend** architecture
- It is compatible with the planned **JWT-in-httpOnly-cookie** auth strategy from `AUTH-IMPLEMENTATION-PLAN.md`

### How It Works

1. Server generates a random CSRF token and sets it as a cookie (readable by JavaScript, NOT httpOnly)
2. Frontend reads the cookie and includes the token value in a custom header (`X-CSRF-Token`) on every mutating request
3. Server middleware compares the cookie value to the header value
4. If they match, the request is legitimate (only same-origin JavaScript can read same-site cookies)
5. If they differ or the header is missing, return 403

### Backend Implementation

```typescript
// packages/backend/src/middleware/csrf.ts (TO BE CREATED in Phase 2)
import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { AppError } from './errorHandler';
import logger from '../utils/logger';

const CSRF_COOKIE_NAME = '_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32; // 256-bit token

/**
 * Generate a new CSRF token and set it as a cookie.
 * Called on initial page load or after login.
 */
export function csrfTokenGenerator(req: Request, res: Response, next: NextFunction): void {
  // Only generate if no valid token exists
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    const token = randomBytes(CSRF_TOKEN_LENGTH).toString('hex');

    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,    // JS must read this to include in headers
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', // Prevents cookie from being sent cross-origin
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
  next();
}

/**
 * Validate CSRF token on mutating requests.
 * Compares cookie value to header value.
 *
 * Skip conditions:
 * - Safe methods (GET, HEAD, OPTIONS)
 * - Admin routes (authenticated via X-Admin-Secret header)
 * - Development mode (optional, controlled by env var)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe methods don't need CSRF protection
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Admin routes use header-based auth, which is CSRF-immune
  if (req.path.startsWith('/admin')) {
    return next();
  }

  // Optional: skip in development
  if (process.env.NODE_ENV === 'development' && process.env.CSRF_SKIP_DEV === 'true') {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

  if (!cookieToken || !headerToken) {
    logger.warn({
      ip: req.ip,
      path: req.path,
      method: req.method,
      hasCookie: !!cookieToken,
      hasHeader: !!headerToken,
    }, 'CSRF validation failed: missing token');

    throw AppError.forbidden('Invalid or missing CSRF token');
  }

  // Use timing-safe comparison to prevent timing attacks
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);

  if (
    cookieBuffer.length !== headerBuffer.length ||
    !require('crypto').timingSafeEqual(cookieBuffer, headerBuffer)
  ) {
    logger.warn({
      ip: req.ip,
      path: req.path,
      method: req.method,
    }, 'CSRF validation failed: token mismatch');

    throw AppError.forbidden('Invalid CSRF token');
  }

  next();
}
```

**Middleware registration in `packages/backend/src/index.ts`:**

```typescript
// After cookie-parser (new dependency required)
import cookieParser from 'cookie-parser';
import { csrfTokenGenerator, csrfProtection } from './middleware/csrf';

app.use(cookieParser());
app.use(csrfTokenGenerator);  // Generate tokens for all requests
app.use(csrfProtection);       // Validate on mutating requests
```

**New dependency required:**
```
cookie-parser  -- Parse Cookie headers into req.cookies
```

### Frontend Implementation

The frontend API client at `packages/frontend/src/lib/api.ts` would need to read the CSRF cookie and include it in headers. The existing `apiFetch` function is the single point of change:

```typescript
// packages/frontend/src/lib/api.ts -- modification to apiFetch()

/**
 * Read CSRF token from cookie
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null; // SSR safety

  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith('_csrf='));

  return match ? match.split('=')[1] : null;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const csrfToken = getCsrfToken();

  const response = await fetchWithRetry(
    url,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...options.headers,
      },
      credentials: 'include', // Ensure cookies are sent
    },
    retryOptions
  );

  // ... rest of existing error handling
}
```

The `ProviderVerificationForm` component (`packages/frontend/src/components/ProviderVerificationForm.tsx`) makes a direct `fetch('/api/verifications', ...)` call at line 104. This would also need the CSRF header:

```typescript
// packages/frontend/src/components/ProviderVerificationForm.tsx (line 104)
// Current:
const response = await fetch('/api/verifications', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ /* ... */ }),
});

// Updated with CSRF:
const csrfToken = document.cookie
  .split('; ')
  .find(row => row.startsWith('_csrf='))
  ?.split('=')[1];

const response = await fetch('/api/verifications', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
  },
  credentials: 'include',
  body: JSON.stringify({ /* ... */ }),
});
```

**Recommendation:** Refactor `ProviderVerificationForm` to use the centralized `api.verify.submit()` from `packages/frontend/src/lib/api.ts` instead of direct `fetch` calls, so CSRF headers are handled in one place.

---

## Token Lifecycle

### Generation

| Event | Action |
|-------|--------|
| First request to backend (any route) | `csrfTokenGenerator` middleware generates token if cookie not present |
| After login (Phase 2) | Regenerate token to bind it to the new session |
| After logout | Clear the CSRF cookie along with the session cookie |

### Validation

| Check | Result |
|-------|--------|
| Cookie present AND header present AND values match (timing-safe) | Request allowed |
| Cookie missing | 403 Forbidden |
| Header missing | 403 Forbidden |
| Cookie and header mismatch | 403 Forbidden |
| GET/HEAD/OPTIONS request | Skipped (safe methods) |
| Admin route with `X-Admin-Secret` | Skipped (header auth is CSRF-immune) |

### Expiration

| Condition | Behavior |
|-----------|----------|
| Cookie `maxAge` | 24 hours (configurable) |
| Session expiration | CSRF token invalidated when session cookie expires |
| Login | Token regenerated |
| Logout | Token cleared |

---

## Error Handling

### Backend Response on CSRF Failure

The error handling follows the existing `AppError` pattern from `packages/backend/src/middleware/errorHandler.ts`:

```typescript
// Consistent with existing error format
{
  "success": false,
  "error": {
    "message": "Invalid or missing CSRF token",
    "code": "CSRF_VALIDATION_FAILED",
    "statusCode": 403,
    "requestId": "abc-123-def"
  }
}
```

### Frontend Handling of CSRF Errors

The existing `ApiError` class in `packages/frontend/src/lib/api.ts` already handles 403 responses via `isUnauthorized()`:

```typescript
// packages/frontend/src/lib/api.ts (lines 83-86)
isUnauthorized(): boolean {
  return this.statusCode === 401 || this.statusCode === 403;
}
```

For CSRF-specific 403 errors, the frontend should:

1. Attempt to fetch a fresh CSRF token (reload page or call a token endpoint)
2. Retry the original request once
3. If still failing, show a user-friendly error: "Your session may have expired. Please refresh the page and try again."

---

## Existing Security Layers (Defense in Depth)

Even without CSRF, the current architecture has multiple overlapping security controls:

### 1. CORS Origin Allowlist

```typescript
// packages/backend/src/index.ts (lines 23-28)
const ALLOWED_ORIGINS: string[] = [
  'https://verifymyprovider.com',
  'https://www.verifymyprovider.com',
  'https://verifymyprovider-frontend-741434145252.us-central1.run.app',
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));
```

This prevents cross-origin requests from unauthorized domains. However, CORS alone does **not** prevent CSRF for simple POST requests with `Content-Type: application/x-www-form-urlencoded`, which browsers allow without preflight.

### 2. Content-Type Requirement

The backend requires `Content-Type: application/json` (enforced via `express.json()` at line 89). Simple CSRF attacks using HTML forms can only send `application/x-www-form-urlencoded` or `multipart/form-data`. A `Content-Type: application/json` header triggers a CORS preflight, which would be blocked.

**However:** This is NOT a reliable CSRF defense on its own. Some browser extensions, Flash (legacy), and specific exploit scenarios can forge JSON content types. It is a useful defense-in-depth layer but should not be relied upon as the sole protection.

### 3. Helmet CSP Headers

```typescript
// packages/backend/src/index.ts (lines 49-60)
formAction: ["'none'"],       // No form submissions accepted
frameAncestors: ["'none'"],   // Cannot be embedded in iframes
```

These headers prevent the API from being targeted by form-based CSRF or clickjacking. Since this is a JSON API (no HTML responses), forms submitted to it would fail regardless.

### 4. Rate Limiting

Even if a CSRF attack succeeded, the rate limiter at 10 requests/hour per IP for verifications and votes would limit the damage.

### 5. reCAPTCHA v3

CAPTCHA tokens are required for all verification and vote submissions. A CSRF attack would need to also obtain a valid reCAPTCHA token, which requires JavaScript execution on the attacker's page -- significantly raising the attack complexity.

---

## Testing Strategy

### Manual Tests (Post-Implementation)

```bash
# Should SUCCEED (valid CSRF token in both cookie and header)
curl -X POST https://api.verifymyprovider.com/api/v1/verify \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: abc123def456" \
  -H "Cookie: _csrf=abc123def456" \
  -d '{"npi":"1234567890","planId":"12345AA0010001","acceptsInsurance":true}'

# Should FAIL with 403 (no CSRF header)
curl -X POST https://api.verifymyprovider.com/api/v1/verify \
  -H "Content-Type: application/json" \
  -H "Cookie: _csrf=abc123def456" \
  -d '{"npi":"1234567890","planId":"12345AA0010001","acceptsInsurance":true}'

# Should FAIL with 403 (no CSRF cookie)
curl -X POST https://api.verifymyprovider.com/api/v1/verify \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: abc123def456" \
  -d '{"npi":"1234567890","planId":"12345AA0010001","acceptsInsurance":true}'

# Should FAIL with 403 (mismatched tokens)
curl -X POST https://api.verifymyprovider.com/api/v1/verify \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: wrong_token" \
  -H "Cookie: _csrf=abc123def456" \
  -d '{"npi":"1234567890","planId":"12345AA0010001","acceptsInsurance":true}'

# Admin routes should BYPASS CSRF (uses X-Admin-Secret instead)
curl -X POST https://api.verifymyprovider.com/api/v1/admin/cache/clear \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $ADMIN_SECRET"

# GET requests should NOT require CSRF token
curl https://api.verifymyprovider.com/api/v1/providers/search?state=CA
```

### Automated Tests

```typescript
// packages/backend/src/__tests__/csrf.test.ts (TO BE CREATED)
describe('CSRF Protection', () => {
  it('should allow GET requests without CSRF token', async () => {
    const res = await request(app).get('/api/v1/providers/search?state=CA');
    expect(res.status).not.toBe(403);
  });

  it('should reject POST without CSRF cookie', async () => {
    const res = await request(app)
      .post('/api/v1/verify')
      .set('X-CSRF-Token', 'token')
      .send({ npi: '1234567890', planId: '12345', acceptsInsurance: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_VALIDATION_FAILED');
  });

  it('should reject POST without CSRF header', async () => {
    const res = await request(app)
      .post('/api/v1/verify')
      .set('Cookie', '_csrf=validtoken')
      .send({ npi: '1234567890', planId: '12345', acceptsInsurance: true });
    expect(res.status).toBe(403);
  });

  it('should reject POST with mismatched CSRF tokens', async () => {
    const res = await request(app)
      .post('/api/v1/verify')
      .set('Cookie', '_csrf=token_a')
      .set('X-CSRF-Token', 'token_b')
      .send({ npi: '1234567890', planId: '12345', acceptsInsurance: true });
    expect(res.status).toBe(403);
  });

  it('should allow POST with matching CSRF tokens', async () => {
    const token = 'valid_csrf_token_here';
    const res = await request(app)
      .post('/api/v1/verify')
      .set('Cookie', `_csrf=${token}`)
      .set('X-CSRF-Token', token)
      .send({ npi: '1234567890', planId: '12345', acceptsInsurance: true });
    expect(res.status).not.toBe(403);
  });

  it('should skip CSRF for admin routes with X-Admin-Secret', async () => {
    const res = await request(app)
      .post('/api/v1/admin/cache/clear')
      .set('X-Admin-Secret', process.env.ADMIN_SECRET!);
    expect(res.status).not.toBe(403);
  });
});
```

---

## Common Issues and Mitigations

### 1. CSRF Cookie Must NOT Be httpOnly

**Problem:** Setting `httpOnly: true` on the CSRF cookie prevents JavaScript from reading it, making the double-submit pattern impossible.

**Solution:**
```typescript
// CORRECT
res.cookie(CSRF_COOKIE_NAME, token, {
  httpOnly: false,  // JS must read this
  secure: true,
  sameSite: 'strict',
});

// WRONG - breaks double-submit pattern
res.cookie(CSRF_COOKIE_NAME, token, {
  httpOnly: true,  // JS cannot read this
});
```

### 2. SameSite Cookie Attribute

**Problem:** Without `SameSite=Strict`, the CSRF cookie could be sent on cross-origin requests.

**Solution:** Always set `sameSite: 'strict'` on the CSRF cookie. This is the strongest SameSite protection, preventing the cookie from being sent on any cross-site request.

### 3. Frontend Must Send Credentials

**Problem:** The `fetch` API does not send cookies by default for cross-origin requests.

**Solution:** The `apiFetch` function in `packages/frontend/src/lib/api.ts` must include `credentials: 'include'`. The CORS config already has `credentials: true` (line 85 of index.ts), so the backend is ready.

### 4. CORS AllowedHeaders Must Include CSRF Header

**Problem:** The `X-CSRF-Token` custom header will trigger a CORS preflight. If not in the allowlist, it will be blocked.

**Solution:** Add `'X-CSRF-Token'` to the `allowedHeaders` array in `packages/backend/src/index.ts`:

```typescript
// Current (line 84):
allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Admin-Secret'],

// Updated:
allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Admin-Secret', 'X-CSRF-Token'],
```

### 5. Token Regeneration on Login

**Problem:** If the CSRF token is not regenerated after login, a token obtained before authentication could be used to forge requests after login (session fixation variant).

**Solution:** Regenerate the CSRF token on every authentication state change (login, logout, session refresh).

### 6. csurf Library Is Deprecated

**Problem:** The popular `csurf` npm package was deprecated in September 2022 due to design flaws.

**Solution:** Implement the double-submit cookie pattern manually (as shown above) or use the maintained `csrf-csrf` package which addresses the flaws. The manual implementation is recommended for this project since it has minimal dependencies and the pattern is straightforward.

---

## Library Recommendation

| Option | Status | Recommendation |
|--------|--------|----------------|
| `csurf` | **Deprecated** (Sep 2022) | Do NOT use |
| `csrf-csrf` | Active, maintained | Good option for drop-in middleware |
| Custom double-submit cookie | N/A | **Recommended** -- matches existing middleware pattern, zero new dependencies beyond `cookie-parser` |

The custom approach is recommended because:
- The existing codebase already follows a custom middleware pattern (see `captcha.ts`, `honeypot.ts`, `rateLimiter.ts`)
- It requires only `cookie-parser` as a new dependency
- It gives full control over token generation, validation, and error handling
- It integrates naturally with the existing `AppError` error handling framework

---

## Implementation Timeline

- [x] **Phase 1 (Now):** No CSRF needed -- no auth, no sessions, no cookies
  - Current protections (rate limiting, CAPTCHA, honeypot, CORS, Helmet) are sufficient
  - All endpoints are either anonymous or protected by `X-Admin-Secret` header

- [ ] **Phase 2 (Email Verification / Magic Links):** CSRF required
  - Install `cookie-parser`
  - Create `packages/backend/src/middleware/csrf.ts`
  - Register CSRF middleware in `packages/backend/src/index.ts`
  - Add `X-CSRF-Token` to CORS `allowedHeaders`
  - Update `packages/frontend/src/lib/api.ts` to include CSRF token
  - Refactor `ProviderVerificationForm.tsx` to use centralized API client
  - Write automated tests
  - Token regeneration on login/logout

- [ ] **Phase 3 (Full Accounts + OAuth):** CSRF critical
  - Ensure CSRF token lifecycle is integrated with OAuth session management
  - Add CSRF to all new authenticated endpoints (user settings, account deletion, payment)
  - Penetration testing for CSRF bypass attempts
  - Consider adding `SameSite=Lax` fallback for OAuth redirect flows (which break `Strict`)

---

## Next Steps

### Before Phase 2 Beta Launch

1. **Install dependency:**
   ```bash
   cd packages/backend && npm install cookie-parser && npm install -D @types/cookie-parser
   ```

2. **Create CSRF middleware:** `packages/backend/src/middleware/csrf.ts`

3. **Register middleware in Express pipeline:**
   - After `express.json()` and `cookieParser()`
   - Before API routes

4. **Update CORS allowedHeaders:**
   - Add `'X-CSRF-Token'` to the allowlist in `packages/backend/src/index.ts`

5. **Update frontend API client:**
   - Add CSRF token reading and header injection to `apiFetch()` in `packages/frontend/src/lib/api.ts`
   - Refactor `ProviderVerificationForm.tsx` to use `api.verify.submit()` instead of direct `fetch`

6. **Write tests:**
   - Unit tests for CSRF middleware
   - Integration tests for protected routes
   - Edge cases: expired tokens, mismatched tokens, missing tokens

7. **Update `packages/backend/src/middleware/index.ts`:**
   - Export CSRF middleware for use in route-specific protection

---

## References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Double-Submit Cookie Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie)
- [csurf Deprecation Notice](https://github.com/expressjs/csurf#deprecated)
- Project auth plan: `docs/AUTH-IMPLEMENTATION-PLAN.md`
