---
tags:
  - security
  - authentication
  - high
type: prompt
priority: 2
---

# Authentication Review

## Files to Review
- `packages/backend/src/routes/admin.ts` (admin auth via X-Admin-Secret header)
- `packages/backend/src/routes/` (check for auth middleware usage)
- `packages/backend/src/index.ts` (CORS and middleware configuration)
- `packages/frontend/src/` (frontend - Next.js app)

## Current Admin Authentication (Implemented Jan 2026)
The admin routes (`/api/v1/admin/*`) use header-based authentication via `adminAuthMiddleware`:
```typescript
// In routes/admin.ts - uses timing-safe comparison
const adminSecret = process.env.ADMIN_SECRET;
if (!adminSecret) return res.status(503).json({ ... code: 'ADMIN_NOT_CONFIGURED' });
// Uses crypto.timingSafeEqual to prevent timing attacks
const isValid = providedBuffer.length === secretBuffer.length && timingSafeEqual(providedBuffer, secretBuffer);
```
Protected endpoints (9 total):
- `POST /api/v1/admin/cleanup-expired` — Delete expired verification records (dryRun, batchSize params)
- `GET /api/v1/admin/expiration-stats` — View verification expiration statistics
- `GET /api/v1/admin/health` — Admin health check with retention metrics (uptime, cache stats, log counts)
- `POST /api/v1/admin/cache/clear` — Clear all cached data (for post-import refresh)
- `GET /api/v1/admin/cache/stats` — Cache statistics with hit rate
- `GET /api/v1/admin/enrichment/stats` — Location enrichment statistics for practice_locations and provider_hospitals
- `POST /api/v1/admin/cleanup/sync-logs` — Clean up sync_logs older than N days (dryRun, retentionDays params)
- `GET /api/v1/admin/retention/stats` — Comprehensive retention stats for all log types (verification, sync, plan acceptance, vote)
- `POST /api/v1/admin/recalculate-confidence` — Recalculate confidence scores with time-based decay (dryRun, limit params)

## VerifyMyProvider Auth Architecture
- **Current State:** NO authentication (all endpoints public/anonymous)
- **Problem:** Creates spam vulnerability (see 08-rate-limiting)
- **Evolution:** None → Lightweight → Full accounts

## Checklist

### 1. Current State (No Authentication)
- [ ] All endpoints are public
- [ ] No JWT, no sessions, no cookies
- [ ] Verifications are anonymous
- [ ] No user accounts exist

**Why Started This Way:**
- [ ] Reduce friction for verifications
- [ ] Solve cold start problem (get data flowing)
- [ ] Prioritize speed over security initially

**Risks:**
- [ ] Spam verifications (CRITICAL - see 08-rate-limiting)
- [ ] Vote manipulation
- [ ] No user reputation system
- [ ] Can't offer premium features

### 2. Planned Authentication Strategy

**Phase 1 (Before Beta Launch):**
- [ ] NO auth yet
- [ ] Rate limiting only (IP-based)
- [ ] Honeypot fields
- [ ] Anonymous contributions still allowed

**Phase 2 (Beta Launch):**
- [ ] Lightweight email verification
- [ ] Optional accounts (not required)
- [ ] One verification per email per provider/plan
- [ ] CAPTCHA on anonymous submissions
- [ ] Progressive disclosure: anonymous → email → full account

**Phase 3 (Scale):**
- [ ] Full user accounts (email/password)
- [ ] OAuth (Google, Facebook) optional
- [ ] Phone verification for high-value actions
- [ ] User reputation system
- [ ] Premium features (saved providers, alerts)
- [ ] API keys for B2B customers

### 3. Technical Implementation Plan

**Phase 2: Lightweight Auth**
```typescript
// Email verification only
POST /auth/verify-email
{
  email: "user@example.com"
}
// Returns: verification code via email

POST /providers/:npi/verify
{
  npi: "1234567890",
  planId: "BCBS_FL_PPO",
  accepted: true,
  verificationCode: "123456" // optional, if user wants to be identified
}
```

**Phase 3: Full Auth**
```typescript
// JWT-based authentication
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout

// Protected endpoints
GET /users/me
GET /users/me/verifications
PUT /users/me/settings
```

### 4. Auth Library Selection

**Options:**
- [ ] Passport.js (flexible, mature)
- [ ] Auth0 (managed, expensive)
- [ ] Clerk (modern, good DX)
- [ ] Firebase Auth (Google ecosystem)
- [ ] Roll our own (JWT + bcrypt)

**Decision Criteria:**
- Cost (low budget)
- Complexity (need speed)
- Integration with OwnMyHealth (shared SSO?)

### 5. Integration with OwnMyHealth

**Option A: Shared Authentication**
- Pros: Seamless user experience, single account
- Cons: Tighter coupling, complexity
- Implementation: Shared JWT secret, same auth service

**Option B: Separate Authentication**
- Pros: Simple, independent products
- Cons: Users need two accounts
- Implementation: Link accounts via email matching

**Decision Needed:** Which approach?

### 6. Session Management

**Current:** N/A (no sessions)

**Phase 2:** 
- [ ] Verification codes stored in Redis (15 min TTL)
- [ ] No persistent sessions

**Phase 3:**
- [ ] JWT access tokens (15 min expiration)
- [ ] JWT refresh tokens (7 day expiration)
- [ ] HttpOnly cookies (no localStorage)
- [ ] CSRF protection (see 04-csrf)

### 7. Password Security (Phase 3)

- [ ] bcrypt hashing (cost factor ≥10)
- [ ] Password requirements (8+ chars, complexity)
- [ ] Rate limit login attempts
- [ ] Password reset flow via email
- [ ] No password in logs

### 8. Anonymous vs Authenticated Verifications

**Design Decision:**
- [ ] Always allow anonymous verifications? (lower friction)
- [ ] OR require email for all verifications? (higher quality)
- [ ] OR graduated system: anonymous limited, authenticated unlimited?

**Proposal:**
- Anonymous: 5 verifications/day (IP-based)
- Email verified: 20 verifications/day
- Full account: 50 verifications/day

### 9. Premium Features (Phase 3)

**Free Tier:**
- Basic search
- View confidence scores
- Anonymous verifications (limited)

**Pro Tier ($4.99/month):**
- Unlimited verifications
- Save favorite providers
- Email alerts on provider changes
- Export to calendar/contacts
- Priority support

**Requires:** User accounts + payment integration

## Questions to Ask

### Immediate Needs
1. **What's the timeline for adding authentication?**
   - Before beta launch?
   - After we have users?
   - When spam becomes a problem?

2. **Can we launch beta with NO auth, just rate limiting?**
   - Is that secure enough?
   - What's the risk?

### Architecture Decisions
3. **Should VerifyMyProvider and OwnMyHealth share authentication?**
   - Same JWT secret?
   - Shared user database?
   - Or completely separate?

4. **What auth library should we use?**
   - Roll our own (JWT + bcrypt)?
   - Use Auth0/Clerk (expensive)?
   - Use Passport.js (flexible)?

5. **Should we always allow anonymous verifications?**
   - Or require email after X verifications?
   - Trade-off: friction vs quality

### User Experience
6. **How do we balance security vs friction?**
   - Users hate signup forms
   - But we need to prevent spam
   - Progressive disclosure strategy?

7. **What should the signup flow look like?**
   - Email + password?
   - Magic links (passwordless)?
   - Social login (Google, Facebook)?

### Premium Features
8. **When should we add premium features?**
   - After beta?
   - After profitability?
   - Need accounts first

9. **What premium features would users pay for?**
   - Saved providers?
   - Alerts?
   - API access?

## Output Format

```markdown
# VerifyMyProvider Authentication

**Last Updated:** [Date]
**Current State:** No authentication (all public)
**Security Risk:** High (spam vulnerability)

---

## Current State

### No Authentication
[Description of current state]

### Why No Auth Initially
[Rationale]

### Risks
[List of risks]

---

## Authentication Roadmap

### Phase 1: No Auth (Current)
**Timeline:** [dates]
**Features:**
- [list]

**Security:**
- Rate limiting only
- Honeypot fields

### Phase 2: Lightweight Auth (Beta)
**Timeline:** [dates]
**Features:**
- [list]

**Implementation:**
```typescript
[code examples]
```

### Phase 3: Full Auth (Scale)
**Timeline:** [dates]
**Features:**
- [list]

**Implementation:**
```typescript
[code examples]
```

---

## Technical Implementation

### Auth Library Choice
**Selected:** [library]
**Rationale:** [why]

### Session Management
[Description]

### Password Security
[Implementation details]

---

## Integration with OwnMyHealth

**Approach:** [Shared vs Separate]

**Rationale:** [why]

**Implementation:**
[Details]

---

## Anonymous vs Authenticated

**Strategy:** [approach]

**Limits:**
| User Type | Verifications/Day |
|-----------|-------------------|
| Anonymous | 5 |
| Email Verified | 20 |
| Full Account | 50 |

---

## Premium Features

**Free Tier:**
- [features]

**Pro Tier ($4.99/mo):**
- [features]

**Requirements:**
- User accounts
- Payment integration

---

## Next Steps

1. **Immediate:**
   - [ ] [task]

2. **Short-term:**
   - [ ] [task]

3. **Long-term:**
   - [ ] [task]
```
