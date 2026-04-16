# Authentication Review - Output

**Reviewed:** 2026-04-16
**Scope:** Passwordless magic link auth, admin auth, CSRF, sessions, cookies

---

## Summary

Two independent auth systems verified:
1. **User auth** — passwordless magic link + JWT access tokens + rotating refresh tokens, all protected via HttpOnly cookies. Robust and well-implemented.
2. **Admin auth** — shared `X-Admin-Secret` header with `crypto.timingSafeEqual` comparison. Minimal but correct for its purpose.

No critical findings. A handful of hardening opportunities identified.

---

## Checklist Results

### User Authentication (Passwordless Magic Link)
| Item | Status | Evidence |
|------|--------|----------|
| Magic link request endpoint with email validation | Verified | `routes/auth.ts:84-98`; Zod `z.string().email().max(255)` at line 25 |
| Magic link email via Resend API | Verified | `services/authService.ts:108-145` |
| Email enumeration prevention (always returns success) | Verified | `routes/auth.ts:93-96` — returns generic message regardless |
| Token verification + single-use enforcement | Verified | `services/authService.ts:164-176` checks `usedAt` and marks used |
| User auto-creation on first login (upsert) | Verified | `services/authService.ts:179-188` |
| JWT access tokens (HS256, 15m, jose) | Verified | `services/authService.ts:50-57` |
| Refresh tokens (random, SHA-256 hashed, rotated) | Verified | `services/authService.ts:191-192, 262-273` |
| HttpOnly / Secure / SameSite cookies | Verified | `routes/auth.ts:40-58` |
| Sliding 30-day session expiry | Verified | `services/authService.ts:60-62, 267-273` |
| Concurrent session limit (5 per user) | Verified | `services/authService.ts:194-214` |
| Session activity tracking (debounced) | Verified | `middleware/auth.ts:76-86` |
| Logout (single session) | Verified | `routes/auth.ts:159-170`, `services/authService.ts:317-327` |
| Logout all | Verified | `routes/auth.ts:177-188`, `services/authService.ts:291-298` |
| `/auth/me` with saved provider count | Verified | `services/authService.ts:333-354` |
| GDPR data export | Verified | `services/authService.ts:360-435` — includes encrypted PII decryption w/ audit log |

### Middleware
| Item | Status | Evidence |
|------|--------|----------|
| `extractUser` global, never throws | Verified | `middleware/auth.ts:41-97` — all catches swallow errors |
| `requireAuth` returns 401 if anonymous | Verified | `middleware/auth.ts:105-110` |
| Graceful handling of expired JWT | Verified | `middleware/auth.ts:87-94` — `debug` log for expected errors |
| Lazy JWT secret init | Verified | `middleware/auth.ts:22-30` and `services/authService.ts:28-38` |

### CSRF Protection
| Item | Status | Evidence |
|------|--------|----------|
| Double-submit cookie via `csrf-csrf` | Verified | `middleware/csrf.ts:1-32` |
| Session-bound tokens | Verified | `middleware/csrf.ts:15-16` — uses `sessionId` or `req.ip` |
| Applied to state-changing auth routes | Verified | `routes/auth.ts:86, 139, 161, 179` |
| Applied at router level to saved-providers + insurance-card | Verified | `routes/index.ts:21-22` |
| GET/HEAD/OPTIONS ignored | Verified | `middleware/csrf.ts:26` |

### Rate Limiting
| Item | Status | Evidence |
|------|--------|----------|
| Per-IP magic link rate limit (5 / 15m) | Verified | `middleware/rateLimiter.ts:373-378` |
| Per-email magic link rate limit (5 / hour) | Verified | `services/authService.ts:72-85` |
| Redis or in-memory dual-mode | Verified | `middleware/rateLimiter.ts:299-319` |
| Fail-open on Redis failure | Verified | `middleware/rateLimiter.ts:208-213, 273-278` |

### Admin Authentication
| Item | Status | Evidence |
|------|--------|----------|
| `X-Admin-Secret` header validation | Verified | `routes/admin.ts:24-58` |
| `crypto.timingSafeEqual` | Verified | `routes/admin.ts:49-51` with length-check guard |
| 503 if `ADMIN_SECRET` not configured | Verified | `routes/admin.ts:28-39` |
| 401 on invalid secret | Verified | `routes/admin.ts:53-55` |
| 11 admin endpoints protected | Verified | All `router.post`/`router.get` calls in `routes/admin.ts` pass `adminAuthMiddleware` |

### Session Maintenance
| Item | Status | Evidence |
|------|--------|----------|
| Admin endpoint for expired session cleanup | Verified | `routes/admin.ts:110-133` |
| Expired session auto-delete on refresh | Verified | `services/authService.ts:256-260` |
| `cleanupExpiredSessions` service w/ dry-run | Verified | `services/authService.ts:441-460` |

### Security
| Item | Status | Evidence |
|------|--------|----------|
| No passwords stored | Verified | Schema `User` has no password field (`schema.prisma:342-353`) |
| Refresh token SHA-256 in DB | Verified | `services/authService.ts:191-192, 220` |
| Magic link tokens single-use | Verified | `services/authService.ts:164-176` |
| Cookie domain `.verifymyprovider.com` in prod | Verified | `routes/auth.ts:38` |
| Refresh cookie path-scoped `/api/v1/auth` | Verified | `routes/auth.ts:55` |
| CORS restricted to allowed origins w/ credentials | Verified | `index.ts:25-88` |
| `X-CSRF-Token` in allowed CORS headers | Verified | `index.ts:86` |

---

## Findings (ranked by severity)

### HIGH

**H1 — Magic link tokens stored in plaintext**
- File: `services/authService.ts:88-97`
- Token is generated with `randomBytes(32).toString('hex')` and persisted as-is to `magic_link_tokens.token`.
- A DB dump/breach would let an attacker use any unexpired (15 min) token to sign in as the associated user.
- **Mitigation**: Store SHA-256 hash of the token (as done for refresh tokens). Look up by hash at verify time. 15-min window limits the blast radius but hashing is a cheap, significant hardening win.

### MEDIUM

**M1 — No account lockout on repeated invalid magic link submissions**
- File: `routes/auth.ts:108-131`, `services/authService.ts:154-171`
- Endpoint rejects bad tokens but does not throttle per-IP failed verify attempts. Combined with token plaintext storage (H1), this slightly extends offline brute-force attack surface.
- **Mitigation**: Add a rate limiter to `GET /auth/verify` keyed by IP (e.g., 20 failed verifies / hour). Already lightweight because `verifyMagicLink` throws quickly on bad input.

**M2 — No JWT key rotation mechanism**
- `JWT_SECRET` is read once (lazily) and never reloaded. There is encryption-key rotation for insurance cards but nothing comparable for JWT signing.
- **Mitigation**: Support a `JWT_SECRET_PREVIOUS` env var and try it on verify failure. Accept a maintenance window where old tokens remain valid after a rotation.

**M3 — No scheduled cleanup of expired magic link tokens**
- `MagicLinkToken` rows accumulate indefinitely. Only sessions have a cleanup admin endpoint (`routes/admin.ts:110-133`).
- **Mitigation**: Either extend `cleanup-expired` admin route to also purge `magic_link_tokens` older than 24 hours, or add a dedicated endpoint called by Cloud Scheduler.

### LOW

**L1 — SameSite `lax` on refresh cookie**
- File: `routes/auth.ts:53`
- `lax` is industry-common but a top-level GET to the refresh endpoint (which is POST-only anyway) would still send the cookie. Not exploitable given CSRF is enforced, but `strict` is stricter.
- **Mitigation**: Consider `sameSite: 'strict'` for `vmp_refresh_token` specifically.

**L2 — Session IP/user-agent stored but never validated on refresh**
- File: `services/authService.ts:243-284` and `middleware/auth.ts:66-86`
- `ipAddress` and `userAgent` are captured on session creation but never compared on subsequent use. A stolen refresh token can be used from any IP/UA.
- **Mitigation**: Optional: on refresh, soft-check if the IP's /24 or UA family changes drastically and either rotate sessions or alert the user. Balance against mobile/laptop roaming UX.

**L3 — No composite index on `(email, createdAt)` for magic link rate limit query**
- File: `schema.prisma:371-383`
- `sendMagicLink` filters by `email` and `createdAt >= oneHourAgo` (`services/authService.ts:74-79`). Current index is on `email` alone. At scale, a composite `(email, createdAt)` would speed this.

**L4 — No `DELETE /auth/me` (right-to-erasure)**
- GDPR export is implemented but no self-service delete. Users must contact support.
- **Mitigation**: Add authenticated delete endpoint that cascades `User.delete` (already defined `onDelete: Cascade` on sessions and savedProviders).

### INFORMATIONAL

**I1 — Admin auth is monolithic, no per-admin audit trail**
- Currently a single shared `ADMIN_SECRET`. Roles and per-user audit logs would be an improvement but require significant work and are appropriate for a later phase.

**I2 — Verifications/votes not linked to user accounts**
- `verification_logs.submittedBy` is a free-text email; `vote_logs.sourceIp` is the unique key. Linking to `users.id` would enable per-user reputation scoring.

**I3 — Resend delivery not alerted**
- Failed sends are logged (`services/authService.ts:135`) but no alert/pager integration.

---

## Answers to Prompt Questions

1. **Scheduled session cleanup?** Endpoint exists (`/admin/cleanup-sessions`); needs Cloud Scheduler trigger (not visible in repo).
2. **Scheduled magic-link token cleanup?** Not implemented — see M3.
3. **Resend deliverability monitoring?** Logged, not alerted — see I3.
4. **Hash magic link tokens?** Recommended — see H1.
5. **Account lockout on failed verifications?** Not implemented — see M1.
6. **JWT_SECRET rotation?** Not implemented — see M2.
7. **Link verifications/votes to accounts?** Not implemented — see I2.
8. **Account deletion endpoint?** Not implemented — see L4.
9. **Admin roles / audit?** Not implemented — see I1.
10. **Composite index for rate-limit query?** Not present — see L3.

---

## Recommendations (priority order)

1. Hash magic link tokens (H1) — 1-hour change, meaningful security improvement.
2. Add per-IP rate limit on `/auth/verify` (M1).
3. Schedule cleanup of expired magic link tokens (M3).
4. Plan JWT secret rotation story (M2).
5. Add `DELETE /auth/me` for GDPR right-to-erasure (L4).
6. Add `sameSite: 'strict'` on refresh cookie (L1).
7. Composite index `(email, createdAt)` on `magic_link_tokens` (L3).
