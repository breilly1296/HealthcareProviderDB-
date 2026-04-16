# VerifyMyProvider Security Vulnerabilities

**Last Updated:** 2026-04-16
**Last Audit:** January 2026 (ZeroPath) + this manual review (April 2026)

---

## Critical Summary

| Severity | Open | In Progress | Fixed |
|----------|------|-------------|-------|
| Critical | 0 | 0 | 1 |
| High | 1 | 0 | 1 |
| Medium | 3 | 0 | 2 |
| Low | 4 | 0 | 0 |

---

## Open Vulnerabilities

### [VMP-2026-005] Magic Link Tokens Stored in Plaintext

**Severity:** High
**Status:** Open
**Found:** 2026-04-16 (manual code review)

**Description:**
Magic-link tokens are generated with `randomBytes(32).toString('hex')` and persisted as plaintext to the `magic_link_tokens.token` column. A database breach or read-only SQL leak would expose every unexpired token (15-minute window).

**Location:**
- File: `packages/backend/src/services/authService.ts`
- Lines 88-97 (creation), 155-158 (lookup by raw token)

**Exploit Scenario:**
1. Attacker obtains a DB dump or executes a read query via another vuln (SQLi, backup leak).
2. Attacker selects all `magic_link_tokens` where `usedAt IS NULL AND expiresAt > now()`.
3. Attacker clicks `https://verifymyprovider.com/api/v1/auth/verify?token=<stolen>` and is logged in as the token's email owner.

**Impact:**
- Account takeover for any user with an outstanding login link.
- GDPR PII exposure (saved providers list, insurance card decryption endpoint access).

**Fix Plan:**
- Hash token with SHA-256 before persistence (mirror refresh-token storage pattern).
- Keep raw token only in memory for the email body.
- Change verify lookup to `findUnique({ where: { token: sha256(rawToken) } })`.

**Timeline:** Short (1-hour change + migration).

---

### [VMP-2026-006] No Rate Limiting on `/auth/verify`

**Severity:** Medium
**Status:** Open
**Found:** 2026-04-16

**Description:**
`GET /api/v1/auth/verify?token=` has no rate limiter. Combined with plaintext token storage (VMP-2026-005), this slightly increases the window for online token-guessing (though 256-bit entropy makes blind guessing impractical).

**Location:**
- File: `packages/backend/src/routes/auth.ts:108-131`

**Fix Plan:**
- Add a per-IP limiter (e.g., 30 attempts / hour) to the verify route.

---

### [VMP-2026-007] No Scheduled Cleanup for Expired Magic Link Tokens

**Severity:** Medium
**Status:** Open
**Found:** 2026-04-16

**Description:**
`magic_link_tokens` table accumulates indefinitely. There is a session cleanup admin endpoint (`POST /admin/cleanup-sessions`) but no equivalent for magic link tokens. Minor storage / performance issue at scale, not an exploit.

**Location:**
- File: `packages/backend/src/routes/admin.ts`
- File: `packages/backend/prisma/schema.prisma:371-383`

**Fix Plan:**
- Extend admin cleanup route or add `POST /admin/cleanup-magic-links`.
- Schedule via Cloud Scheduler (same cron pattern as session cleanup).

---

### [VMP-2026-008] No JWT Secret Rotation Mechanism

**Severity:** Medium
**Status:** Open
**Found:** 2026-04-16

**Description:**
`JWT_SECRET` is read once via `getJwtSecret()` and never rotated. There is rotation support for insurance card encryption keys (`/admin/rotate-encryption-key`) but nothing comparable for JWT signing. If the secret is ever compromised, every active session token remains valid until expiry.

**Location:**
- File: `packages/backend/src/middleware/auth.ts:22-30`
- File: `packages/backend/src/services/authService.ts:28-38`

**Fix Plan:**
- Support `JWT_SECRET_PREVIOUS`; try both on verify, sign only with primary.
- Deploy with new secret -> wait 15 minutes (access token max life) -> remove previous.

---

### [VMP-2026-009] Honeypot Returns Fake Success But Uses Static ID

**Severity:** Low
**Status:** Open
**Found:** 2026-04-16

**Description:**
`middleware/honeypot.ts:21` returns `{ success: true, data: { id: 'submitted' } }` on bot detection. The static `id: 'submitted'` string is easily fingerprintable by bot developers who run the form once with a honeypot value and once without, then diff responses.

**Location:**
- File: `packages/backend/src/middleware/honeypot.ts:14-24`

**Fix Plan:**
- Generate a random-looking cuid/uuid in the fake response.
- Match the shape of a real verification response (include `createdAt`, etc.) more closely.

---

### [VMP-2026-010] No `DELETE /auth/me` Endpoint (GDPR Right-to-Erasure)

**Severity:** Low
**Status:** Open
**Found:** 2026-04-16

**Description:**
GDPR export exists (`GET /auth/export`) but no self-service delete. Article 17 of GDPR requires the right to erasure. Users currently must contact support.

**Location:**
- File: `packages/backend/src/routes/auth.ts` (missing route)

**Fix Plan:**
- Add `DELETE /auth/me` with CSRF + requireAuth + cascade delete.
- Cascade already defined on Session, SavedProvider (`schema.prisma:365, 390-391`). UserInsuranceCard needs verification.

---

### [VMP-2026-011] Session IP/User-Agent Captured but Never Validated

**Severity:** Low
**Status:** Open
**Found:** 2026-04-16

**Description:**
`sessions.ipAddress` and `sessions.userAgent` are stored at creation time (`authService.ts:222-223`) but never compared against subsequent requests. A stolen refresh token works from any IP/UA.

**Location:**
- File: `packages/backend/src/services/authService.ts:243-284`

**Fix Plan:**
- Soft-detect drastic changes (IP /24 delta, UA family change), log, potentially require re-auth. Trade-off: UX for mobile/laptop roaming.

---

### [VMP-2026-012] SameSite `lax` on Refresh Cookie

**Severity:** Low
**Status:** Open
**Found:** 2026-04-16

**Description:**
Refresh token cookie uses `sameSite: 'lax'`. Since the refresh endpoint is POST-only and CSRF-protected, this is not actively exploitable, but `strict` is a defense-in-depth improvement.

**Location:**
- File: `packages/backend/src/routes/auth.ts:53`

---

## In Progress

(none)

---

## Fixed Vulnerabilities

### [VMP-2026-001] Unauthenticated Verification Spam

**Fixed:** January 2026
**Severity:** Medium (CVSS 7.1)
**Found:** ZeroPath scan

**Description:** No rate limiting on verification endpoints allowed unlimited spam.

**Fix:** Added `verificationRateLimiter` (10/hr) and `voteRateLimiter` (10/hr); `searchRateLimiter` 100/hr.

**Files changed:**
- Added: `packages/backend/src/middleware/rateLimiter.ts`
- Modified: `packages/backend/src/routes/verify.ts:58-63, 93-98`

---

### [VMP-2026-002] Verification Threshold Bypass

**Fixed:** January 2026
**Severity:** Critical (CVSS 9.2)
**Found:** ZeroPath scan

**Description:** Could change provider acceptance status without meeting verification threshold.

**Fix:** Added `MIN_VERIFICATIONS_FOR_CONSENSUS = 3` + `MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60` + 2:1 majority ratio check in `determineAcceptanceStatus`.

**Files changed:**
- `packages/backend/src/services/verificationService.ts:183-207`
- `packages/backend/src/config/constants.ts:36, 42`

---

### [VMP-2026-003] PII in Public Responses

**Fixed:** January 2026
**Severity:** Medium
**Found:** Code review

**Description:** Public verification responses included `sourceIp`, `userAgent`, `submittedBy` PII fields.

**Fix:** Added `VERIFICATION_PUBLIC_SELECT` allowlist and `stripVerificationPII()` helper. All public reads and POST responses filtered.

**Files changed:**
- `packages/backend/src/services/verificationService.ts:19-35, 329-332, 434, 573, 650-673, 723`

---

### [VMP-2026-004] Legacy Vulnerable Endpoint

**Fixed:** January 2026
**Severity:** High
**Found:** Code review

**Description:** Legacy verification endpoint at `src/api/routes.ts` lacked rate limits, CAPTCHA, and input validation.

**Fix:** Removed legacy endpoint entirely. Confirmed no references remain (`grep "api/routes.ts"` returns 0 hits in `packages/`).

**Files changed:**
- Removed: `packages/backend/src/api/routes.ts`
- Modified: `packages/backend/src/index.ts` (no import)

---

## npm audit Results

**Last Run:** Not executed in this review (Bash permission denied for `npm audit`).

**Action Items:**
- [ ] Run `npm audit --json` in `packages/backend` and `packages/frontend` as part of the CI pipeline.
- [ ] Set up Dependabot or Renovate for automated PR-based updates.

---

## False Positives

| Finding | Tool | Reason for FP |
|---------|------|---------------|
| Insurance card encryption key in source | ZeroPath (hypothetical) | Keys come from `INSURANCE_ENCRYPTION_KEY` env, not hardcoded (`lib/encryption.ts`). |
| Magic link email HTML injection | Manual | `magicLink` variable is a server-built URL; email does not interpolate user input. |

---

## Accepted Risks

| Vulnerability | Severity | Mitigation |
|---------------|----------|------------|
| Honeypot fake success uses static id `'submitted'` | Low | See VMP-2026-009; fix queued but not blocker. |
| No IP-based session binding on refresh | Low | UX trade-off; see VMP-2026-011. |
| Shared `ADMIN_SECRET` (no per-admin audit) | Info | Roles planned for later phase; current admin surface is small (11 endpoints) and secret is in Secret Manager. |

---

## Security Improvements Made

**2026:**
- January: ZeroPath scan remediations (VMP-2026-001 through -004).
- February: Centralized pg SSL handling (`createPool()` in `scripts/pre-import-check.ts`) — prevents Cloud SQL cert-validation errors.
- February: Enrichment protection (Phase 6) — `data_source` column, `import_conflicts` review queue, field allowlists in imports.
- March/April (current schema): Sybil prevention indexes on `verification_logs` `(npi, planId, sourceIp, createdAt)` and `(npi, planId, submittedBy, createdAt)` — see `schema.prisma:270-271`.
- CSRF protection via `csrf-csrf` double-submit cookie pattern — see `middleware/csrf.ts`.

---

## Automated Scan Results (this review)

- **Hardcoded secrets scan** (`password.*=.*['\"]`): 0 matches in `packages/backend/src`.
- **console.log with secrets** (`console\.log.*password|token|secret`): 0 matches.
- **TODO/FIXME security**: 1 match (comment-only, in `middleware/captcha.ts:31` describing fail-closed mode). No actionable TODOs.
- **Legacy routes**: `grep api/routes.ts` matches only documentation files, confirming removal.

---

## Next Security Audit

**Scheduled:** Before beta launch (TBD)
**Tool:** ZeroPath (re-run) + `npm audit` in CI
**Focus Areas:**
- Magic link token hashing (VMP-2026-005)
- Rate limiter coverage on auth endpoints (VMP-2026-006)
- JWT rotation design (VMP-2026-008)
- Frontend XSS / dependency audit (not covered in this backend-focused review)
