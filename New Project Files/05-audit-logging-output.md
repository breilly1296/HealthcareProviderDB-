# VerifyMyProvider Audit Logging

**Last Updated:** 2026-04-16
**HIPAA Required:** NO (public provider data only)
**Purpose:** Debugging + spam detection + anti-abuse (Sybil prevention)
**Reviewer:** automated-audit
**Scope:** `packages/backend/src/**`

---

## Executive Summary

Structured JSON logging via pino is fully implemented across the backend. The
application-level logs are explicitly PII-free — no IP, no user agent, no email,
no session ID, no CSRF token. IPs are stored in `verification_logs.source_ip`
and `vote_logs.source_ip` strictly for Sybil/abuse checks, and in
`sessions.ip_address` for security, never in application logs. API responses
use `stripVerificationPII()` to remove IP/UA/email before returning.

Overall rating: **PASS with minor gaps**. The largest remaining gaps are
(a) no retention policy is enforced on the `sessions.ip_address` / `user_agent`
columns beyond session expiry, (b) several auth service logs include the full
normalized email address, which is PII under most privacy frameworks, and
(c) there is no dedicated admin-action audit trail (admin endpoints only
produce operational logs).

---

## What to Log

| Category | Event | Logged? | Location (file:line) |
|---|---|---|---|
| Verifications | Submission persisted | Yes (DB) | `services/verificationService.ts:397` |
| Verifications | Submitted (app log) | Via request log only (no body) | `middleware/requestLogger.ts:76` |
| Votes | Upvote/downvote | Yes (DB `vote_logs`) | `services/verificationService.ts:520` |
| Rate limits | 429 hits | Yes (response code captured) | `middleware/requestLogger.ts:52-62` |
| API errors | Global error handler | Yes (structured `logger.error`) | `middleware/errorHandler.ts:80` |
| Auth | Magic link email sent | Yes (email PLAINTEXT logged) | `services/authService.ts:137` |
| Auth | Magic link verified / session created | Yes (userId + sessionId) | `services/authService.ts:230` |
| Auth | Session refreshed | Yes | `services/authService.ts:278` |
| Auth | Logout / logout-all | Yes | `services/authService.ts:296, 324` |
| Captcha | Verification failure / low score / API error | Yes | `middleware/captcha.ts:162, 174, 191` |
| Honeypot | Hit | Yes (`honeypot triggered`) | `middleware/honeypot.ts:15` |
| Admin | Cleanup, cache, sync-logs, confidence recalc, key rotation | Yes (operational) | `routes/admin.ts:79, 117, 234, 355, 514, 582, 663` |
| CORS | Blocked origin | Yes | `index.ts:81` |
| Insurance card | PII decrypted for export | Yes (structured event) | `services/authService.ts:388` |

## What NOT to Log

| Category | Excluded? | Evidence |
|---|---|---|
| Passwords | N/A — magic link only | no password field exists |
| Full stack traces in prod | Yes | `middleware/errorHandler.ts:237-240` (message stripped in prod) |
| DB query results | Yes | no query-result logging anywhere in `services/` |
| CSRF tokens | Yes | only token presence checked (`middleware/csrf.ts:27`) |
| Session IDs in app logs | Partial | sessionId IS included in auth info logs (`authService.ts:230,278`) — this is low risk but worth flagging |
| IP addresses in app logs | Yes (intentional) | `middleware/requestLogger.ts:4-20` explicitly omits IP |
| User-Agent in app logs | Yes | `requestLogger.ts` interface excludes UA |
| Verification body | Yes | `requestLogger` captures metadata only |
| JWT secrets | Yes | `JWT_SECRET` read via env, never logged |
| Encryption keys | Yes | `lib/encryption` not referenced by logger |

## Current Implementation

- **Logger:** pino (`utils/logger.ts:11-31`)
  - Dev: `pino-pretty` colorized transport
  - Prod: JSON with ISO timestamp and `level` label formatter — Cloud Logging
    compatible
  - Level via `LOG_LEVEL` env var, default `info`
- **Request correlation:** `requestIdMiddleware` runs first (`index.ts:42`);
  every log entry carries `req.id` via pino-http (`middleware/httpLogger.ts:12`)
- **HTTP access logs:** pino-http (`middleware/httpLogger.ts`) with status-based
  level escalation (`>=500` error, `>=400` warn); `/health` excluded to cut noise
- **Application request log:** `requestLogger.ts` wraps `res.end` and records a
  PII-free `RequestLogEntry` + feeds a 1000-entry ring buffer for stats
  (`requestLogger.ts:26-27`). Note: documented as "last 20" in the prompt but
  the buffer is actually 1000, with only the last 20 surfaced via `getRequestStats`.
- **DB audit trail:**
  - `VerificationLog` stores `sourceIp`, `userAgent`, `submittedBy`,
    `upvotes`, `downvotes`, `expiresAt` (`prisma/schema.prisma:248-259`)
  - `VoteLog` stores `sourceIp` with `@@unique([verificationId, sourceIp])`
    (`prisma/schema.prisma:284`)
  - PII-stripping select: `VERIFICATION_PUBLIC_SELECT`
    (`services/verificationService.ts:19-35`) + `stripVerificationPII`
    (`verificationService.ts:329-332`)
- **Error logging:** `errorHandler.ts:80-85` logs requestId/path/method/err;
  production strips stack from the response body but retains it in logs.

## Retention Policy

| Data | Retention | Enforcement |
|---|---|---|
| `verification_logs` | 6 months via `expiresAt` (TTL) | `VERIFICATION_TTL_MS = 6 * 30d` (`config/constants.ts:19`) + hourly cron (`routes/admin.ts:71`) |
| `provider_plan_acceptance` | 6 months via `expiresAt` | same cron |
| `sync_logs` | 90 days | `routes/admin.ts:302-375` |
| `sessions` | 30 days rolling | `config/constants.ts:95` + `cleanupExpiredSessions` (`authService.ts:441`) |
| `magic_link_tokens` | 15 min expiry (`MAGIC_LINK_EXPIRY_MS`) | single-use, no explicit cleanup cron found |
| In-memory ring buffer | 1000 entries | `requestLogger.ts:27` |
| pino logs → Cloud Logging | Follows GCP default (30d) | **No explicit retention documented** |

## Checklist Status

### What to Log
- [x] Verification submissions — `VerificationLog` table (IP + UA in DB, not in app logs)
- [x] Vote submissions — `VoteLog` table
- [x] Rate limit hits — `requestLogger.ts:52` captures 429 status
- [x] API errors — `errorHandler.ts:80`
- [x] Auth events — magic link send/verify/refresh/logout all logged
- [partial] Admin actions — operational logs exist but no append-only audit trail

### What NOT to Log
- [x] Passwords — N/A
- [x] Full stack traces in prod — stripped in response; still logged server-side (acceptable)
- [x] DB query results — confirmed
- [x] CSRF tokens — confirmed
- [partial] Session IDs — not in request logs, BUT included in info logs at
  `authService.ts:230,278,296`. Low risk (not a secret; the cookie is HttpOnly)
  but best practice is to log only a prefix.
- [x] IP in app logs — confirmed (only in DB columns used for abuse checks)

### Current Implementation (Jan 2026 baseline)
- [x] Structured JSON logging (pino)
- [x] Cloud Run / Cloud Logging compatible
- [x] X-Request-ID generation + correlation
- [x] Response time tracking
- [x] Rate limit info extraction
- [x] PII exclusion in application logs
- [x] In-memory buffer (actually 1000, not 20 as prompt stated)
- [x] Prod JSON / dev pretty

---

## Findings (ranked by severity)

### FINDING-05-01 — MEDIUM: Plaintext email logged on magic link send
- `services/authService.ts:137` logs `{ email: normalizedEmail }` on
  successful send, and `authService.ts:135` logs it on Resend errors.
- Email is PII under GDPR/CCPA. Cloud Logging retains these for 30d by default.
- **Recommendation:** hash the email (`sha256(email).slice(0,12)`) or redact
  the local-part (`***@domain.com`). Also review `authService.ts:141,106`.

### FINDING-05-02 — LOW: Session IDs appear in info logs
- `authService.ts:230,278,296,309,324` log `sessionId`. Although the session
  cookie is HttpOnly and the ID is only meaningful alongside the refresh token
  hash, including it in logs enables a log-access insider to pivot into the
  DB to identify a user's session history.
- **Recommendation:** log `sessionId.slice(0,8)` or a separate correlation id.

### FINDING-05-03 — LOW: No admin-action audit trail
- Admin endpoints (9 total) produce operational logs via pino, but there is no
  persistent, append-only audit record of "admin X ran cleanup at Y" — the
  admin is effectively anonymous (there is no admin user; only a shared
  secret).
- **Recommendation:** add an `admin_actions` table logging endpoint, query
  params, dry-run flag, outcome, and requestId (no secret).

### FINDING-05-04 — LOW: Cloud Logging retention undocumented
- No explicit retention policy for pino stdout → Cloud Logging. GCP default
  is 30 days (OK for debugging, inadequate if a regulator asks for 12+ months
  of abuse history).
- **Recommendation:** document in `docs/LOGGING.md` or set a log bucket
  retention via `gcloud logging buckets update`.

### FINDING-05-05 — INFO: Prompt doc mismatch
- Prompt says "in-memory buffer for statistics (last 20 logs)" but code uses
  `MAX_BUFFER_SIZE = 1000` (`requestLogger.ts:27`). `getRequestStats()` does
  surface only the last 20 (`requestLogger.ts:133`). Update the prompt doc
  for accuracy.

### FINDING-05-06 — INFO: `magic_link_tokens` lacks cleanup cron
- Schema has `expiresAt` (`schema.prisma:375`) but no admin endpoint deletes
  expired tokens. They accumulate (one-shot but never purged after 15min).
- **Recommendation:** add `cleanupExpiredMagicLinks` to the existing hourly
  cleanup cron.

---

## Next Steps

1. Redact/hash emails in `authService.ts` log lines (FINDING-05-01).
2. Add `admin_actions` table + middleware hook (FINDING-05-03).
3. Truncate sessionId in logs (FINDING-05-02).
4. Add magic-link token cleanup to Cloud Scheduler (FINDING-05-06).
5. Document log retention policy (FINDING-05-04).
6. Correct prompt description of ring buffer size (FINDING-05-05).
