# VerifyMyProvider CSRF Protection Review

**Last Updated:** January 25, 2026
**Priority:** Medium
**Current State:** Not needed (no authentication)
**Future Need:** Required for Phase 2+

---

## Current State

### No CSRF Protection Needed
- No authentication = no sessions to hijack
- All endpoints are public
- No cookies used for authentication
- CSRF attacks target authenticated sessions

**Why No CSRF Currently:**
- CSRF attacks require an authenticated session to hijack
- Without auth, there's nothing to exploit
- Once auth is added, CSRF becomes critical

---

## When CSRF Protection Is Needed

### Triggers
- Adding email verification (Phase 2)
- Adding user accounts (Phase 3)
- Adding session cookies
- Adding premium features with payment

### Timeline
- **Now:** Not needed
- **Phase 2 (Beta):** Required
- **Phase 3 (Scale):** Critical

---

## CSRF Implementation Plan

### Method: Double-Submit Cookie

**Backend Implementation:**
```typescript
import csrf from 'csurf';

const csrfProtection = csrf({
  cookie: {
    httpOnly: false, // JS needs to read this
    secure: true,    // HTTPS only
    sameSite: 'strict'
  }
});

// Apply to mutating routes
app.use('/api/v1/providers/:npi/verify', csrfProtection);
app.use('/api/v1/verifications/:id/vote', csrfProtection);
app.use('/api/v1/auth/*', csrfProtection);
```

**Frontend Implementation:**
```typescript
// Read CSRF token from cookie
const csrfToken = document.cookie
  .split('; ')
  .find(row => row.startsWith('csrf_token='))
  ?.split('=')[1];

// Include in all POST/PUT/DELETE requests
fetch('/api/v1/providers/:npi/verify', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
});
```

---

## Routes Requiring CSRF Protection

### Once Auth Is Added (Phase 2+)

**Must Protect:**
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `POST /providers/:npi/verify` (if auth required)
- `POST /verifications/:id/vote` (if auth required)
- `PUT /users/me/settings`
- `DELETE /users/me/account`

**Can Remain Unprotected:**
- All GET requests (safe by default)
- Public search endpoints

---

## Token Lifecycle

### Generation
- Token generated on page load
- Token sent as cookie (readable by JS)
- Token regenerated on login

### Validation
- Token in cookie must match token in header
- Validated on every mutating request
- Invalid token returns 403 Forbidden

### Expiration
- Token expires with session
- Token regenerated on logout/login

---

## Error Handling

### On CSRF Failure

**Backend:**
```typescript
if (!validCSRFToken) {
  return res.status(403).json({
    success: false,
    error: 'Invalid CSRF token',
    code: 'CSRF_INVALID'
  });
}
```

**Frontend:**
```typescript
if (response.status === 403) {
  // Refresh page to get new token
  // Or show friendly error message
  showError('Your session may have expired. Please refresh.');
}
```

---

## Testing CSRF Protection

### Manual Tests
```bash
# Should succeed (with token)
curl -X POST https://api.verifymyprovider.com/providers/1234567890/verify \
  -H "X-CSRF-Token: abc123" \
  -H "Cookie: csrf_token=abc123" \
  -d '{"accepted": true}'

# Should fail 403 (without token)
curl -X POST https://api.verifymyprovider.com/providers/1234567890/verify \
  -d '{"accepted": true}'

# Should fail 403 (mismatched token)
curl -X POST https://api.verifymyprovider.com/providers/1234567890/verify \
  -H "X-CSRF-Token: wrong" \
  -H "Cookie: csrf_token=abc123" \
  -d '{"accepted": true}'
```

### Automated Tests
```typescript
describe('CSRF Protection', () => {
  it('rejects requests without token', async () => {
    const res = await request(app)
      .post('/api/v1/verify')
      .send({ npi: '1234567890' });
    expect(res.status).toBe(403);
  });

  it('accepts requests with valid token', async () => {
    // Get token first, then test
  });
});
```

---

## Common CSRF Issues

### Issue 1: Token Not Readable
```javascript
// WRONG - httpOnly prevents JS from reading
cookie: { httpOnly: true }

// RIGHT - JS needs to read token
cookie: { httpOnly: false }
```

### Issue 2: Missing Header
```javascript
// WRONG - no CSRF header
fetch('/api/verify', { method: 'POST', body: data })

// RIGHT - include CSRF header
fetch('/api/verify', {
  method: 'POST',
  headers: { 'X-CSRF-Token': token },
  body: data
})
```

### Issue 3: Token Not Refreshed
```javascript
// Cache token once on page load
const token = getCsrfToken();

// Use same token for all requests
// (Don't re-read on each request - unnecessary)
```

---

## Implementation Timeline

| Phase | Status | Action |
|-------|--------|--------|
| Phase 1 (Now) | Not needed | No action |
| Phase 2 (Beta) | Required | Implement with email verification |
| Phase 3 (Scale) | Critical | Full CSRF protection |

---

## Before Phase 2 Checklist

- [ ] Install csurf middleware
- [ ] Add CSRF token generation
- [ ] Update frontend API client
- [ ] Test CSRF protection
- [ ] Document bypass for development

---

## Development Bypass

```typescript
// Skip CSRF in development/testing
if (process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test') {
  // Skip CSRF validation
  return next();
}
```

**Warning:** Never skip in production!

---

## Recommendations

### Immediate
- No action needed (no auth)

### Before Phase 2
1. Install `csurf` package
2. Add middleware to auth/verification routes
3. Update frontend to include CSRF header
4. Add tests for CSRF protection

### Best Practices
1. Use SameSite=strict cookies
2. Regenerate token on login
3. Clear token on logout
4. Log CSRF failures for security monitoring

---

*CSRF protection should be implemented before adding user authentication*
