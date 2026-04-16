# Full Security Audit — Executive Overview

**Last Updated:** 2026-04-16
**Reviewer:** automated-audit
**Scope:** Meta-audit across prompts 01–13, `packages/backend/src`
**Codebase snapshot:** Node 24 / Express / Prisma / PostgreSQL / Redis (optional) / Cloud Run

---

## Overall Security Posture: STRONG (with finite gaps)

VerifyMyProvider ships a layered defense model appropriate for a public-data,
crowdsourced healthcare directory without PHI. All four ZeroPath Medium
findings have been resolved. The biggest remaining risks are (a) operational
(Cloud Scheduler IaC not in repo), (b) observability (no alerting or admin
action audit log), and (c) a small number of correctness bugs around rate
limiter boundaries and email logging PII.

**Rating matrix:**

| Domain | Rating | Notes |
|---|---|---|
| Authentication | STRONG | Magic-link + JWT (jose) + rotating refresh + session cap |
| Authorization | STRONG | Admin secret constant-time; no privilege tiers yet |
| CSRF | STRONG | `csrf-csrf` double-submit on all authenticated mutations |
| Rate limiting | STRONG | Dual-mode sliding-window; 4 tiers defined |
| CAPTCHA | STRONG | v3 with explicit fail-open/fail-closed |
| Input validation | STRONG | Zod on every route (some admin endpoints manual) |
| Secrets | STRONG | Env vars only; no hardcoded secrets found |
| Encryption at rest | STRONG | AES-256-GCM for insurance card PII; rotation supported |
| Logging | STRONG | pino JSON + PII exclusion; minor email-redaction gap |
| Error handling | STRONG | `AppError` class; prod stack stripping |
| Sybil / anti-abuse | STRONG | 4-layer defense (rate limit + CAPTCHA + honeypot + 30d dedup) |
| Admin audit trail | WEAK | Operational logs only; no append-only audit table |
| Operational IaC | WEAK | Cloud Scheduler & Cloud Run deploy not in repo |
| HIPAA | N/A | Public data only |

---

## Prompt-by-Prompt Summary

### 01 — Database Schema (STRONG)
- 21 Prisma models covering providers, plans, verifications, votes, sessions,
  users, insurance cards, admin-relevant artifacts
  (`prisma/schema.prisma:1-460`).
- Indexes on all hot query paths incl. composite Sybil indexes
  (`schema.prisma:270-271`). `@@unique([verificationId, sourceIp])` prevents
  vote stuffing (`schema.prisma:284`).
- PII columns (`verification_logs.source_ip`, `user_agent`, `submitted_by`)
  intentional for abuse checks; excluded from public selects via
  `VERIFICATION_PUBLIC_SELECT` (`services/verificationService.ts:19-35`).
- No Postgres Row-Level Security — acceptable since no multi-tenant data.

### 02 — HIPAA Non-Compliance (STRONG / N/A)
- No PHI collected. Provider data is NPPES public registry.
- Insurance card scan stores some PII (subscriber ID etc) encrypted with
  AES-256-GCM (`lib/encryption.ts:3-60`), per-user row (`schema.prisma:399-432`),
  with rotation endpoint (`routes/admin.ts:561-679`).

### 03 — Authentication (STRONG)
- Magic-link only. Tokens SHA-256 hashed in DB (`authService.ts:45`).
- Refresh token rotated on every refresh (`authService.ts:263-273`).
- JWT via jose, HS256, 15-min access, 30-day refresh, sliding window.
- Concurrent session cap `MAX_SESSIONS_PER_USER=5`; oldest evicted
  (`authService.ts:201-214`).
- Session `lastUsedAt` debounced 5 min to reduce DB writes (`middleware/auth.ts:79`).
- Gap: email logged plaintext (`authService.ts:137`) — see 05-01.

### 04 — CSRF (STRONG)
- `csrf-csrf` (double-submit) on all authenticated mutations
  (`routes/index.ts:21-22`, `routes/auth.ts:86,139,161,179`).
- Cookie: `vmp_csrf`, HttpOnly=false (required for JS to read), SameSite=Lax,
  Secure in prod (`middleware/csrf.ts:17-25`).
- Session identifier uses `req.user.sessionId` when authenticated, else IP
  (`csrf.ts:15-16`). Anonymous CSRF is still rate-limited by the outer
  limiter.
- Not required on public `/verify` endpoints (no auth cookies).

### 05 — Audit Logging (STRONG, see separate output)
- pino structured JSON, Cloud-Logging compatible.
- App logs PII-free (no IP/UA/email in `RequestLogEntry`).
- Sybil IPs in DB only. See `05-audit-logging-output.md` for full checklist.

### 06 — API Routes (STRONG)
- Routes registered in `routes/index.ts`. CSRF applied at router level for
  authenticated namespaces (`saved-providers`, `me/insurance-card`).
- Helmet with strict CSP (JSON-only API, `default-src 'none'`)
  (`index.ts:49-69`).
- CORS allowlist with prod domains + env-driven `FRONTEND_URL`
  (`index.ts:25-30`).

### 07 — Input Validation (STRONG)
- Zod schemas on every user-facing route: `providers.ts:28-49`,
  `verify.ts:22-50`, `auth.ts:24-31`, `locations.ts`, `plans.ts`, etc.
- Common schemas extracted (`schemas/commonSchemas.ts`).
- Body size 100 kB global, 16 MB route-specific for insurance card scan
  (`index.ts:93-98`).
- **Minor gap:** admin endpoints mix Zod and manual `parseInt` for query
  params.

### 08 — Rate Limiting (STRONG, see separate output)
- See `08-rate-limiting-output.md`. Tier 1 complete, Tier 2 partial
  (CAPTCHA implemented, fingerprinting pending).

### 09 — External APIs (STRONG)
- Google reCAPTCHA v3: `https://www.google.com/recaptcha/api/siteverify`
  with 5-s timeout & `AbortController` (`middleware/captcha.ts:150-156`).
- Resend: bearer-token, fetch with error logging but no retry
  (`authService.ts:109-135`).
- Redis (optional): ioredis via `lib/redis.ts`. Rate limiter gracefully
  falls back to in-memory.
- NPPES data: offline import via `scripts/` — no live external call at
  request time.
- Anthropic Claude: `services/insuranceCardExtractor.ts` (OCR path) — out
  of scope for this audit.

### 10 — Frontend Structure (OUT OF SCOPE for this meta-audit)
- Next.js 14.2 (see CLAUDE memory). Deferred.

### 11 — Environment Secrets (STRONG)
Confirmed env vars referenced in backend:
`DATABASE_URL`, `REDIS_URL`, `PORT`, `NODE_ENV`, `FRONTEND_URL`,
`JWT_SECRET`, `CSRF_SECRET`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`,
`CAPTCHA_FAIL_MODE`, `INSURANCE_ENCRYPTION_KEY`,
`INSURANCE_ENCRYPTION_KEY_PREVIOUS`, `RESEND_API_KEY`,
`MAGIC_LINK_BASE_URL`, `LOG_LEVEL`.
- None hardcoded. None logged. Grep confirmed no `process.env.*` usage
  outputs the value to a log.
- Gap: no `.env.example` at root verified in this sweep; recommend
  canonical template.

### 12 — Confidence Scoring (STRONG)
- Status change requires: `verificationCount >= 3`, `confidenceScore >= 60`,
  AND clear 2:1 majority (`services/verificationService.ts:194-198`).
- Scoring in `confidenceService.ts` (4-factor: source, recency, count,
  upvote ratio).
- Time-based decay via `confidenceDecayService.ts`, admin-triggered
  recalculation (`routes/admin.ts:502`).
- Manipulation resistance: combined with rate limit + CAPTCHA + 30-day
  Sybil window + unique-vote constraint = no single-IP attacker can flip
  a provider without many days of effort + IP rotation + CAPTCHA bypass.

### 13 — NPI Data Pipeline (OUT OF SCOPE at runtime)
- Offline import scripts (`scripts/import-npi*.ts`) with conflict table
  (`schema.prisma:324-340`). Protected by pre-import check. See CLAUDE
  memory Phase 6.

---

## Cross-Cutting Findings (Ranked)

### CRITICAL — none
No critical gaps observed.

### HIGH — none
No high-severity gaps observed.

### MEDIUM-01 — Plaintext emails in auth logs
- `services/authService.ts:137,141,106` logs `{ email: normalizedEmail }`.
- Pivot from [[05-audit-logging]]. Affects GDPR posture.
- **Fix:** hash or partially redact.

### MEDIUM-02 — Rate limiter off-by-one between Redis and memory
- `rateLimiter.ts:163` (`>= maxRequests`) vs `:262` (`> maxRequests`).
- Behavioral delta = 1 request. Pivot from [[08-rate-limiting]].

### MEDIUM-03 — `/api/v1/auth/refresh` lacks dedicated limit
- Only 200/hr global default. Pivot from [[08-rate-limiting]] FINDING-08-02.

### MEDIUM-04 — No admin-action audit trail
- Shared secret = no "who ran it?" Pivot from [[38-admin-endpoints]].

### MEDIUM-05 — Cloud Scheduler IaC absent from repo
- Cleanup/retention jobs depend on out-of-repo GCP config.
- Pivot from [[38-admin-endpoints]] FINDING-38-03.

### LOW-01 — `magic_link_tokens` never purged
- No scheduled cleanup; they expire but accumulate.

### LOW-02 — No IP allowlist for admin endpoints
- Defense-in-depth gap.

### LOW-03 — sessionId included in auth info logs
- Low risk but best-practice violation.

### LOW-04 — Length pre-check leaks admin-secret length
- `admin.ts:49-51`. Minor timing-side channel.

### LOW-05 — In-memory rate-limit cleanup window too conservative
- Hardcoded 60 min regardless of actual `windowMs`.

### LOW-06 — Admin query params not all Zod-validated
- `cleanup-expired`, `rotate-encryption-key` use manual `parseInt`.

### INFO — Prompt doc discrepancies
- In-memory ring buffer: prompt says 20, code has 1000 + surfaces last 20.
- Admin endpoint count: prompt says 9, code has 11.

---

## Defense-in-Depth Layers (Verified)

For a write request to `POST /api/v1/verify`:

1. **Network / GCP LB** — HTTPS only, `trust proxy = 1`
2. **helmet** — strict CSP, frame-ancestors none (`index.ts:49-69`)
3. **CORS allowlist** — production domains only (`index.ts:70-88`)
4. **Body size limit** — 100 kB (`index.ts:97`)
5. **cookie-parser** — parses but no auth cookie required here
6. **extractUser** — optional auth; anonymous allowed
7. **defaultRateLimiter (global 200/hr)** — `index.ts:154`
8. **verificationRateLimiter (10/hr)** — `routes/verify.ts:60`
9. **honeypotCheck('website')** — fake-submit if triggered (`verify.ts:61`)
10. **verifyCaptcha** — reCAPTCHA v3 with fail-open fallback (`verify.ts:62`)
11. **Zod body parse** — `submitVerificationSchema.parse` (`verify.ts:64`)
12. **Sybil check** — 30-day IP & email duplicate detection
    (`services/verificationService.ts:94-137`)
13. **Consensus gate** — 3 verifications + score 60 + 2:1 majority
    (`verificationService.ts:194-207`)
14. **Structured log** — PII-free app log + DB audit row with TTL

For a write request to `POST /api/v1/saved-providers`:
Adds **requireAuth** + **csrfProtection** before the handler.

For admin `POST /api/v1/admin/cleanup-expired`:
- adminAuthMiddleware (timing-safe secret) + adminTimeout (long timeout) +
  asyncHandler. **Does not** get an audit-trail DB row (gap MEDIUM-04).

---

## Open Questions (From Prompt 26)

1. **When was the last full security review?** — This audit (2026-04-16).
2. **Security incidents or near-misses?** — No incident log in repo; rely on
   pino warn/error logs piped to Cloud Logging.
3. **External penetration tester?** — Recommended once Tier 3 auth limits
   are in place (post-user-adoption).
4. **Compliance beyond documented?** — Likely need privacy policy + DPA if
   EU users access the site. GDPR applies to emails + insurance card PII.
   `exportUserData` at `authService.ts:360` already implements data
   portability.
5. **Automated SAST/DAST in CI?** — No CI security scanner observed.
   Recommend GitHub Actions `github/codeql-action` + a scheduled ZAP scan
   against a staging environment.

---

## Top-10 Recommendations (Consolidated)

1. Hash/redact emails in auth logs (MEDIUM-01).
2. Align rate-limiter boundary across Redis/memory modes (MEDIUM-02).
3. Add `refreshRateLimiter` to `/auth/refresh` (MEDIUM-03).
4. Add `admin_actions` audit table + middleware (MEDIUM-04).
5. Commit Cloud Scheduler IaC / Terraform / YAML (MEDIUM-05).
6. Add cleanup for expired `magic_link_tokens` (LOW-01).
7. Add optional `ADMIN_IP_ALLOWLIST` env var (LOW-02).
8. Convert admin query parsing to Zod (LOW-06).
9. Add CI SAST (CodeQL) + scheduled DAST (LOW-addition).
10. Update prompts 05 and 38 to match the code (INFO items).

---

## Summary Table (Security Posture Feb→Apr 2026)

- Authentication: unchanged (magic-link, jose JWT)
- Rate limiting: unchanged (4 tiers, dual-mode)
- CAPTCHA: unchanged (v3 with fail-open)
- Input validation: unchanged (Zod)
- Secrets: unchanged (GCP Secret Manager + env vars)
- Logging: unchanged (pino PII-free)
- Error handling: unchanged (AppError; stack strip in prod)
- Sybil prevention: unchanged (4 layers, verified)
- HIPAA: N/A

**Net posture:** no regressions. Small backlog of medium/low hygiene items
documented above.
