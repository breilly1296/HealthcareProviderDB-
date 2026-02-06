# VerifyMyProvider Authentication

**Last Updated:** 2026-02-06
**Current State:** No user authentication (all public endpoints); admin endpoints protected by shared secret
**Security Risk:** Medium (spam vulnerability mitigated by rate limiting + CAPTCHA + honeypot + Sybil prevention)

---

## Current State

### No User Authentication

- [x] **All public endpoints are unauthenticated** -- Verified in `routes/index.ts` (lines 10-14): providers, plans, verify, locations, and admin routes are registered without any auth middleware on the router level. Individual admin routes use `adminAuthMiddleware`.
- [x] **No JWT, no sessions, no cookies** -- No session middleware, no passport.js, no JWT libraries found. `index.ts` has no session/cookie middleware. The `credentials: true` CORS setting (line 84) is present but unused since no cookies are sent.
- [x] **Verifications are anonymous** -- `verify.ts` line 63-69: submissions include only `req.ip` and `req.get('User-Agent')` for tracking, no user identity. The `submittedBy` email field is optional.
- [x] **No user accounts exist** -- No `User` model in `schema.prisma`. No registration, login, or profile endpoints.

### Why No Auth Initially

- [x] **Reduce friction for verifications** -- The verification endpoint (`POST /api/v1/verify`) requires only NPI, planId, and acceptsInsurance boolean. No signup needed.
- [x] **Cold start problem** -- Need data flowing quickly. Anonymous contributions lower the barrier.
- [x] **Speed prioritized** -- The entire API is public-read, anonymous-write with anti-abuse measures.

### Risks

- [x] **Spam verifications** -- Mitigated by: rate limiting (10 verifications/hour per IP in `rateLimiter.ts` line 340-345), CAPTCHA (reCAPTCHA v3 on POST endpoints in `captcha.ts`), honeypot fields (`honeypot.ts` -- catches bots that fill hidden fields), and Sybil prevention (30-day duplicate check per IP/email per provider-plan pair in `verificationService.ts` lines 72-115).
- [x] **Vote manipulation** -- Mitigated by: unique constraint `[verificationId, sourceIp]` on VoteLog (`schema.prisma` line 253), vote rate limiter (10/hour in `rateLimiter.ts` line 351-356), and CAPTCHA on vote endpoint.
- [ ] **No user reputation system** -- Not implemented. No way to weight verifications by contributor quality.
- [ ] **Can't offer premium features** -- No user accounts means no saved providers, alerts, or payment integration.

---

## Admin Authentication (Implemented)

### X-Admin-Secret Header Authentication

**File:** `packages/backend/src/routes/admin.ts` lines 21-55

**Implementation details:**
- Uses `X-Admin-Secret` HTTP header for authentication
- Secret stored in `ADMIN_SECRET` environment variable
- **Timing-safe comparison** using `crypto.timingSafeEqual` (line 48) to prevent timing attacks
- Returns 503 if `ADMIN_SECRET` not configured (graceful disable, line 27)
- Returns 401 if secret is invalid (line 51)
- Length check before `timingSafeEqual` (line 46-47) since the function requires equal-length buffers

**Protected endpoints (9 total):**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/admin/cleanup-expired` | Delete expired verification records |
| GET | `/admin/expiration-stats` | Verification expiration statistics |
| GET | `/admin/health` | Admin health check with retention metrics |
| POST | `/admin/cache/clear` | Clear all cached data |
| GET | `/admin/cache/stats` | Cache statistics |
| GET | `/admin/enrichment/stats` | Location enrichment statistics |
| POST | `/admin/cleanup/sync-logs` | Clean up old sync_logs |
| GET | `/admin/retention/stats` | Comprehensive retention stats |
| POST | `/admin/recalculate-confidence` | Recalculate confidence scores with decay |

**Security assessment of admin auth:**
- [x] Timing-safe comparison prevents timing attacks
- [x] Graceful disable when not configured (503 vs exposing unprotected endpoints)
- [ ] No IP allowlisting on admin endpoints
- [ ] No rate limiting specific to admin endpoints (uses global default 200/hr)
- [ ] Single shared secret (not per-user admin keys)
- [ ] Secret transmitted in header (could be logged by proxies -- mitigated by HTTPS)

---

## Authentication Roadmap

### Phase 1: No Auth (Current)
**Features implemented:**
- IP-based rate limiting (4 tiers: default 200/hr, search 100/hr, verify 10/hr, vote 10/hr)
- reCAPTCHA v3 on POST verify and vote endpoints
- Honeypot fields on verification and vote submissions
- Sybil prevention (30-day window per IP/email per provider-plan)
- Anonymous contributions allowed

**Security stack verified in code:**
1. `rateLimiter.ts` -- Dual-mode (Redis distributed / in-memory fallback), sliding window algorithm
2. `captcha.ts` -- Google reCAPTCHA v3 with configurable fail-open/fail-closed mode
3. `honeypot.ts` -- Hidden field detection, returns fake 200 to fool bots
4. `verificationService.ts` `checkSybilAttack()` -- Database-backed duplicate detection

### Phase 2: Lightweight Auth (Planned -- Not Implemented)
**No code exists for this phase.** Planned features:
- Email verification for identified submissions
- Optional accounts (not required for basic use)
- One verification per email per provider/plan
- CAPTCHA on anonymous submissions
- Progressive disclosure: anonymous -> email -> full account

### Phase 3: Full Auth (Planned -- Not Implemented)
**No code exists for this phase.** Planned features:
- Full user accounts (email/password)
- OAuth (Google, Facebook) optional
- JWT access/refresh tokens
- User reputation system
- Premium features (saved providers, alerts)
- API keys for B2B customers

---

## Technical Implementation

### Auth Library Choice
**Not yet selected.** No authentication library dependencies found in `package.json`.

### Session Management
**Current:** No sessions. All requests are stateless.

### Password Security
**Not applicable.** No passwords exist in the system.

### CORS Configuration
**File:** `packages/backend/src/index.ts` lines 22-85

Allowed origins:
- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- `https://verifymyprovider-frontend-741434145252.us-central1.run.app`
- `process.env.FRONTEND_URL`
- `localhost:3000`, `localhost:3001` (development only)

Requests with no origin are allowed (line 69-71) for mobile apps, curl, Postman.
X-Admin-Secret is in the `allowedHeaders` list (line 83).

---

## Integration with OwnMyHealth

**Approach:** Not yet decided. No shared authentication code found.

**Current state:** The API is structured as a standalone service. CORS whitelist can be extended to include OwnMyHealth domains. The admin secret could theoretically be shared for server-to-server calls, but no such integration exists.

---

## Anonymous vs Authenticated Verifications

**Current strategy:** All verifications are anonymous with anti-abuse measures.

**Current limits (code-verified):**

| Protection Layer | Limit | File:Line |
|---|---|---|
| Rate limiting (verify) | 10/hour per IP | `rateLimiter.ts:340-345` |
| Rate limiting (vote) | 10/hour per IP | `rateLimiter.ts:351-356` |
| Sybil prevention | 1 per IP per provider-plan per 30 days | `verificationService.ts:72-96` |
| Sybil prevention | 1 per email per provider-plan per 30 days | `verificationService.ts:99-114` |
| CAPTCHA | reCAPTCHA v3, score >= 0.5 | `captcha.ts:173`, `constants.ts:52` |
| CAPTCHA fallback | 3/hour when Google API down | `constants.ts:62` |
| Honeypot | Silent rejection of bot submissions | `honeypot.ts:11-25` |
| Consensus threshold | 3 verifications + score >= 60 + 2:1 ratio | `constants.ts:36-42` |

---

## Premium Features

**Not implemented.** Requires user accounts (Phase 3).

---

## Next Steps

1. **Immediate (before beta launch):**
   - [ ] Current anti-abuse stack (rate limiting + CAPTCHA + honeypot + Sybil) should be sufficient
   - [ ] Consider adding admin IP allowlisting
   - [ ] Consider admin-specific rate limiting (separate from default)

2. **Short-term (Phase 2):**
   - [ ] Choose auth library (Passport.js, Clerk, or custom JWT)
   - [ ] Implement optional email verification
   - [ ] Add user table to schema
   - [ ] Implement CSRF protection (see 04-csrf.md)

3. **Long-term (Phase 3):**
   - [ ] Full user accounts with OAuth
   - [ ] JWT access/refresh tokens with HttpOnly cookies
   - [ ] User reputation system
   - [ ] Premium tier with payment integration
   - [ ] API keys for B2B consumers
