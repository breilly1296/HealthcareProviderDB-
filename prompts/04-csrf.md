---
tags:
  - security
  - csrf
  - medium
type: prompt
priority: 3
---

# CSRF Protection Review

## Files to Review
- `packages/backend/src/middleware/csrf.ts` (if exists)
- `packages/backend/src/app.ts` (middleware registration)
- `packages/frontend/src/services/api.ts` (frontend API client)

## VerifyMyProvider CSRF Architecture
- **Current State:** NO CSRF protection (no auth = no sessions to hijack)
- **Future Need:** Required when authentication is added
- **Method:** Double-submit cookie pattern (same as OwnMyHealth)

## Checklist

### 1. Current State (No CSRF Protection)
- [ ] No authentication = no CSRF risk
- [ ] All endpoints are public
- [ ] No cookies used for authentication
- [ ] No sessions to hijack

**Why No CSRF Currently:**
- [ ] CSRF attacks target authenticated sessions
- [ ] Without auth, there's nothing to hijack
- [ ] Once auth is added, CSRF becomes critical

### 2. When CSRF Protection Is Needed

**Triggers:**
- [ ] Adding email verification (Phase 2 auth)
- [ ] Adding user accounts (Phase 3 auth)
- [ ] Adding session cookies
- [ ] Adding premium features with payment

**Timeline:**
- [ ] Not needed now (no auth)
- [ ] Required before Phase 2 beta launch
- [ ] Critical before Phase 3 (full accounts)

### 3. CSRF Implementation Plan

**Method: Double-Submit Cookie**
```typescript
// Backend middleware
import csrf from 'csurf';

const csrfProtection = csrf({ 
  cookie: {
    httpOnly: false, // JS needs to read this
    secure: true, // HTTPS only
    sameSite: 'strict'
  }
});

// Apply to mutating routes
app.use('/api/v1/providers/:npi/verify', csrfProtection);
app.use('/api/v1/verifications/:id/vote', csrfProtection);
app.use('/api/v1/auth/*', csrfProtection);
```

**Frontend:**
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

### 4. Routes That Need CSRF Protection

**Once Auth Is Added:**
- [ ] POST /auth/register
- [ ] POST /auth/login
- [ ] POST /auth/logout
- [ ] POST /auth/refresh
- [ ] POST /providers/:npi/verify (if auth required)
- [ ] POST /verifications/:id/vote (if auth required)
- [ ] PUT /users/me/settings
- [ ] DELETE /users/me/account

**Can Remain Unprotected:**
- [ ] GET requests (safe by default)
- [ ] Public search endpoints

### 5. CSRF Token Lifecycle

**Generation:**
- [ ] Token generated on page load
- [ ] Token sent as cookie (readable by JS)
- [ ] Token regenerated on login

**Validation:**
- [ ] Token in cookie must match token in header
- [ ] Token validated on every mutating request
- [ ] Invalid token returns 403 Forbidden

**Expiration:**
- [ ] Token expires with session
- [ ] Token regenerated on logout/login

### 6. Error Handling

**On CSRF Failure:**
```typescript
// Backend
if (!validCSRFToken) {
  return res.status(403).json({
    success: false,
    error: 'Invalid CSRF token'
  });
}

// Frontend
if (response.status === 403) {
  // Refresh page to get new token
  // Or show friendly error message
}
```

### 7. Testing CSRF Protection

**Manual Test:**
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

### 8. Common CSRF Issues

**Issue 1: Token Not Readable**
```javascript
// WRONG - httpOnly prevents JS from reading
cookie: { httpOnly: true }

// RIGHT - JS needs to read token
cookie: { httpOnly: false }
```

**Issue 2: Missing Header**
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

**Issue 3: Token Not Refreshed**
```javascript
// Cache token once on page load
const token = getCsrfToken();

// Use same token for all requests
// (Don't re-read on each request - unnecessary)
```

## Questions to Ask

### Timing
1. **When should we implement CSRF protection?**
   - Before Phase 2 beta launch?
   - Before Phase 3 full auth?
   - Can wait until auth is added?

2. **What's the priority relative to other security items?**
   - Rate limiting is more urgent?
   - CSRF can wait until auth is implemented?

### Implementation
3. **Should we use csurf library or roll our own?**
   - csurf is mature and battle-tested
   - Or implement double-submit cookie manually?

4. **What should happen when CSRF validation fails?**
   - Return 403 error?
   - Refresh token automatically?
   - Show friendly error to user?

### Testing
5. **How should we test CSRF protection?**
   - Manual curl tests?
   - Automated integration tests?
   - Penetration testing?

6. **Should we have a way to bypass CSRF in development?**
   - Environment variable?
   - Test endpoint?

## Output Format

```markdown
# VerifyMyProvider CSRF Protection

**Last Updated:** [Date]
**Current State:** Not needed (no auth)
**Future Need:** Required for Phase 2+

---

## Current State

### No CSRF Protection
[Why not needed currently]

### When CSRF Becomes Critical
[Triggers for implementation]

---

## CSRF Implementation Plan

### Method: Double-Submit Cookie
[Description]

### Backend Implementation
```typescript
[code example]
```

### Frontend Implementation
```typescript
[code example]
```

---

## Protected Routes

### Mutating Endpoints (Need CSRF)
- [ ] POST /auth/*
- [ ] POST /providers/:npi/verify
- [ ] PUT /users/me/*
- [ ] DELETE /users/me/*

### Safe Endpoints (No CSRF)
- [ ] GET requests (all)
- [ ] Public search endpoints

---

## Token Lifecycle

**Generation:** [when]
**Validation:** [how]
**Expiration:** [when]

---

## Error Handling

**On CSRF Failure:**
```typescript
[code example]
```

---

## Testing Strategy

**Manual Tests:**
```bash
[curl commands]
```

**Automated Tests:**
[Strategy]

---

## Common Issues

1. **[Issue]**
   - Problem: [description]
   - Solution: [fix]

---

## Implementation Timeline

- [ ] **Phase 1 (Now):** Not needed
- [ ] **Phase 2 (Beta):** Implement with email verification
- [ ] **Phase 3 (Scale):** Critical for full auth

---

## Next Steps

1. **Before Phase 2:**
   - [ ] Install csurf middleware
   - [ ] Add CSRF token generation
   - [ ] Update frontend API client
   - [ ] Test CSRF protection
```
