# VerifyMyProvider Authentication Review

**Last Updated:** January 25, 2026
**Priority:** High
**Current State:** No user authentication (admin only)
**Security Risk:** Medium (spam vulnerability mitigated by rate limiting)

---

## Current State

### No User Authentication
- All public endpoints are anonymous
- No JWT, sessions, or cookies for users
- Verifications are anonymous (IP-based tracking only)
- No user accounts exist

### Admin Authentication (Implemented)
```typescript
// In routes/admin.ts
const adminSecret = process.env.ADMIN_SECRET;
if (req.headers['x-admin-secret'] !== adminSecret) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

**Protected Admin Endpoints:**
- `POST /api/v1/admin/cleanup-expired` - Delete expired records
- `GET /api/v1/admin/expiration-stats` - View expiration statistics
- `GET /api/v1/admin/health` - Admin health check

---

## Why No Auth Initially

| Reason | Benefit |
|--------|---------|
| Reduce friction | Lower barrier for verifications |
| Cold start problem | Get data flowing quickly |
| Speed to market | Prioritize launch over security |
| Simplicity | No auth infrastructure needed |

---

## Current Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Spam verifications | High | Rate limiting (10/hour) |
| Vote manipulation | Medium | Vote deduplication by IP |
| No user reputation | Medium | Confidence scoring algorithm |
| No premium features | Low | Future phase |

---

## Authentication Roadmap

### Phase 1: No Auth (Current)
**Status:** Implemented

**Features:**
- All endpoints public
- IP-based rate limiting (10 verifications/hour)
- Honeypot fields (potential)
- Anonymous contributions allowed

**Security:**
- Rate limiting only
- CAPTCHA on submissions

---

### Phase 2: Lightweight Auth (Beta)
**Status:** Planned

**Features:**
- Optional email verification
- Email-based verification linking
- CAPTCHA on anonymous submissions
- Progressive disclosure

**Implementation:**
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
  verificationCode: "123456" // optional
}
```

**Limits:**
| User Type | Verifications/Day |
|-----------|-------------------|
| Anonymous | 5 |
| Email Verified | 20 |

---

### Phase 3: Full Auth (Scale)
**Status:** Future

**Features:**
- Full user accounts (email/password)
- OAuth (Google, Facebook) optional
- Phone verification for high-value actions
- User reputation system
- Premium features (saved providers, alerts)
- API keys for B2B customers

**Implementation:**
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

**Session Management:**
- JWT access tokens (15 min expiration)
- JWT refresh tokens (7 day expiration)
- HttpOnly cookies (no localStorage)
- CSRF protection required

---

## Auth Library Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Passport.js | Flexible, mature | Complex | Good for Phase 3 |
| Auth0 | Managed, secure | Expensive | Budget dependent |
| Clerk | Modern, good DX | Cost | Consider for scale |
| Firebase Auth | Google ecosystem | Vendor lock-in | If using GCP |
| Roll own | Full control | Security risk | Not recommended |

---

## Current Admin Auth Security Issues

### Issue 1: String Comparison Timing Attack
**Location:** `packages/backend/src/routes/admin.ts` line 33

```typescript
// CURRENT (vulnerable)
if (providedSecret !== adminSecret)

// RECOMMENDED
import { timingSafeEqual } from 'crypto';
const providedBuffer = Buffer.from(providedSecret);
const secretBuffer = Buffer.from(adminSecret);
if (!timingSafeEqual(providedBuffer, secretBuffer))
```

**Risk:** Low (timing attacks are difficult to exploit)
**Priority:** Medium

### Issue 2: No Rate Limiting on Admin
- Admin endpoints use default rate limiter (200/hr)
- Should have stricter limits or separate limiter

### Issue 3: No Audit Trail
- Admin actions not specifically logged
- Should log who triggered cleanup operations

---

## Anonymous vs Authenticated Strategy

### Recommended Approach: Graduated System

| Tier | Requirement | Daily Limit | Features |
|------|-------------|-------------|----------|
| Anonymous | None | 5 verifications | Basic search |
| Email Verified | Email code | 20 verifications | Track history |
| Full Account | Registration | 50 verifications | All features |

**Rationale:**
- Lower friction for casual users
- Reduces spam without blocking legitimate users
- Incentivizes account creation

---

## Premium Features (Phase 3)

### Free Tier
- Basic search
- View confidence scores
- Anonymous verifications (limited)

### Pro Tier ($4.99/month)
- Unlimited verifications
- Save favorite providers
- Email alerts on provider changes
- Export to calendar/contacts
- Priority support

**Requirements:**
- User accounts
- Payment integration (Stripe)

---

## Integration with OwnMyHealth

### Option A: Shared Authentication
**Pros:** Seamless UX, single account
**Cons:** Tighter coupling, complexity

### Option B: Separate Authentication (Recommended)
**Pros:** Simple, independent products
**Cons:** Users need two accounts
**Implementation:** Link accounts via email matching

---

## Recommendations

### Immediate (Pre-Beta)
1. Use `crypto.timingSafeEqual` for admin auth
2. Add stricter rate limiting for admin endpoints
3. Log admin actions with timestamps

### Short-term (Beta Launch)
1. Implement email verification (Phase 2)
2. Add CAPTCHA after N anonymous submissions
3. Track verification history by email

### Long-term (Scale)
1. Full user accounts
2. OAuth integration
3. User reputation system
4. Premium subscription features

---

## Security Checklist

### Current State
- [x] Admin endpoints protected
- [x] Rate limiting on all endpoints
- [x] CAPTCHA on verification submissions
- [ ] Timing-safe secret comparison
- [ ] Admin action audit logging

### Phase 2 Requirements
- [ ] Email verification flow
- [ ] Email-based rate limiting
- [ ] Graduated limits by verification tier

### Phase 3 Requirements
- [ ] Full user registration
- [ ] Password hashing (bcrypt, cost 10+)
- [ ] JWT token management
- [ ] CSRF protection
- [ ] OAuth providers

---

*Authentication strategy should be reviewed before beta launch*
