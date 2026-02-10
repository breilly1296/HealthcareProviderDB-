# CSRF Protection - VerifyMyProvider

## Current Status: NOT NEEDED

VerifyMyProvider currently does **not** implement CSRF protection because it is **not needed**. CSRF (Cross-Site Request Forgery) attacks exploit the browser's automatic inclusion of session cookies on cross-origin requests. Since VerifyMyProvider has **no authentication cookies and no user sessions**, there is nothing for a CSRF attack to exploit.

---

## Why CSRF Does Not Apply Today

### CSRF Attack Prerequisites (All Must Be True)

| Prerequisite | VerifyMyProvider Status | Result |
|---|---|---|
| Application uses cookies for authentication | No cookies -- no user auth at all | Not vulnerable |
| Browser automatically sends credentials | No credentials to send | Not vulnerable |
| Attacker can forge a request that performs an action on behalf of a user | No user identity to impersonate | Not vulnerable |

### Current Security Model

- **Public endpoints**: No authentication, protected by rate limiting + CAPTCHA
- **Admin endpoints**: Use `X-Admin-Secret` header (custom headers are NOT automatically sent by browsers, so CSRF is inherently blocked for admin routes)
- **Verification submissions**: Rate-limited by IP + require CAPTCHA token (CAPTCHA tokens are single-use and domain-bound)
- **Vote submissions**: Rate-limited by IP + require CAPTCHA token + unique constraint on (verificationId, sourceIp)

Custom headers like `X-Admin-Secret` cannot be set by cross-origin HTML forms or simple cross-origin JavaScript (blocked by CORS preflight), which makes admin endpoints inherently CSRF-safe.

---

## Triggers for Implementation

CSRF protection must be added when **any** of these features are introduced:

| Trigger | Phase | Why CSRF Becomes Necessary |
|---|---|---|
| Email verification with session | Phase 2 | Session cookie would be sent automatically by browser |
| User accounts with login | Phase 3 | Authentication cookies enable impersonation |
| Session cookies of any kind | Phase 2+ | Cookies are the attack vector for CSRF |
| Payment/subscription features | Phase 3 | Financial actions must not be forgeable |
| Profile management (PUT/DELETE) | Phase 3 | Destructive actions tied to user identity |

---

## Planned Implementation: Double-Submit Cookie Pattern

When user authentication is added, CSRF protection will use the **double-submit cookie** pattern. This is preferred over the synchronizer token pattern because it is stateless and works well with JWT-based authentication.

### How Double-Submit Cookie Works

1. **Server generates a CSRF token** on page load and sends it as both:
   - A cookie (`csrf-token`, httpOnly: false so JavaScript can read it)
   - Part of the rendered page (meta tag or injected into the DOM)

2. **Client includes the token** in a custom header (`X-CSRF-Token`) on every mutating request

3. **Server validates** that the header value matches the cookie value

4. **Attacker cannot forge this** because:
   - Cross-origin JavaScript cannot read cookies from another domain (Same-Origin Policy)
   - The attacker can cause the cookie to be sent automatically, but cannot read its value to include in the header

### Token Lifecycle

```
Page Load          --> Server generates CSRF token, sets cookie + meta tag
Mutating Request   --> Client reads cookie, sends value in X-CSRF-Token header
Server Validation  --> Compare cookie value with header value
Login              --> Regenerate CSRF token (prevents session fixation)
Logout             --> Clear CSRF token cookie
```

---

## Routes Requiring CSRF (When Auth Is Added)

### Mutating Routes (CSRF Required)

These routes perform state-changing operations and will need CSRF protection once session cookies exist:

| Route | Method | Action |
|---|---|---|
| `/auth/login` | POST | Authenticate user |
| `/auth/logout` | POST | End session |
| `/auth/register` | POST | Create account |
| `/auth/verify-email` | POST | Verify email token |
| `/auth/refresh` | POST | Refresh JWT token |
| `/providers/:npi/verify` | POST | Submit verification (when tied to user account) |
| `/verify/:id/vote` | POST | Vote on verification (when tied to user account) |
| `/users/me/profile` | PUT | Update user profile |
| `/users/me/saved-providers` | POST/DELETE | Manage saved providers |
| `/users/me/preferences` | PUT | Update notification preferences |
| `/users/me/account` | DELETE | Delete user account |
| `/billing/subscribe` | POST | Start subscription |
| `/billing/cancel` | POST | Cancel subscription |

### Safe Routes (No CSRF Needed)

These routes are inherently safe from CSRF because they do not change server state:

| Route Pattern | Method | Reason |
|---|---|---|
| `/api/v1/providers/*` | GET | Read-only |
| `/api/v1/plans/*` | GET | Read-only |
| `/api/v1/verify/stats` | GET | Read-only |
| `/api/v1/verify/recent` | GET | Read-only |
| `/api/v1/locations/*` | GET | Read-only |
| `/health` | GET | Read-only |
| All search endpoints | GET | Read-only |

---

## Implementation Details (Future)

### Library

The implementation will use the `csurf` library (or a maintained successor such as `csrf-csrf`):

```typescript
// Future CSRF middleware configuration
import { doubleCsrf } from 'csrf-csrf';

const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: 'csrf-token',
  cookieOptions: {
    httpOnly: false,   // JavaScript must be able to read the cookie value
    secure: true,      // Only sent over HTTPS
    sameSite: 'strict', // Strict same-site policy
    path: '/',
  },
  size: 64,            // Token length in bytes
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'], // Safe methods excluded
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});
```

### Cookie Settings

| Setting | Value | Rationale |
|---|---|---|
| `httpOnly` | `false` | Client-side JavaScript must read the cookie to include it in the header |
| `secure` | `true` | Prevent transmission over insecure connections |
| `sameSite` | `strict` | Additional layer: browser will not send cookie on cross-site requests |
| `path` | `/` | Token valid for all routes |
| `maxAge` | Session-scoped | Token expires when browser session ends |

### Frontend Integration

```typescript
// Future: Frontend CSRF token extraction
function getCsrfToken(): string {
  const match = document.cookie.match(/csrf-token=([^;]+)/);
  return match ? match[1] : '';
}

// Include in fetch requests
fetch('/api/v1/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCsrfToken(),
  },
  credentials: 'include', // Send cookies
  body: JSON.stringify(verificationData),
});
```

### Error Response

When CSRF validation fails:

```json
{
  "success": false,
  "error": {
    "message": "Invalid or missing CSRF token",
    "code": "CSRF_ERROR",
    "statusCode": 403
  }
}
```

---

## SameSite Cookie as Defense-in-Depth

Even before implementing CSRF tokens, the `sameSite` cookie attribute (when cookies are eventually introduced) provides significant protection:

- `sameSite: 'strict'` -- Browser never sends the cookie on cross-site requests
- `sameSite: 'lax'` -- Browser sends cookie on top-level navigations but not on cross-origin POSTs

However, `sameSite` alone is not sufficient because:
- Older browsers may not support it
- Subdomain attacks can bypass it
- The double-submit cookie pattern is the defense-in-depth standard

---

## Relationship to CORS

CORS and CSRF protection serve complementary but different purposes:

| Mechanism | Protects Against | Current Status |
|---|---|---|
| **CORS** | Unauthorized cross-origin JavaScript requests | Implemented (whitelist of allowed origins) |
| **CSRF tokens** | Forged requests using the browser's automatic cookie inclusion | Not needed yet (no cookies) |

CORS prevents a malicious site's JavaScript from reading the response of a cross-origin request, but does not prevent the request from being sent (for simple requests). CSRF tokens prevent the request from being accepted. Both are needed when session cookies are present.
