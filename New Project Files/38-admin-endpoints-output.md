# Admin Endpoints Review

**Last Updated:** 2026-04-16
**Reviewer:** automated-audit
**Module:** `packages/backend/src/routes/admin.ts`
**Auth model:** shared-secret header (`X-Admin-Secret`) + timing-safe compare

---

## Executive Summary

Admin endpoints are gated by a single `adminAuthMiddleware`
(`routes/admin.ts:24-58`) that performs a constant-time comparison against
`process.env.ADMIN_SECRET`. Graceful degradation returns HTTP 503 when the
secret is not configured. All 10 endpoints (prompt listed 9; code has 10 —
`rotate-encryption-key` is present but not listed in the prompt) apply this
middleware. Request-timeout middleware (`adminTimeout`) is applied to
long-running operations.

Overall rating: **PASS**. Major gaps are (1) no append-only audit log of
admin actions, (2) no IP allowlist, (3) no Cloud Scheduler manifest checked
into the repo, (4) admin endpoints inherit the global `defaultRateLimiter`
(200/hr) but have no dedicated brute-force protection on the shared secret.

---

## Endpoints

| # | Method | Path | Handler | Timeout | File:line |
|---|---|---|---|---|---|
| 1 | POST | `/admin/cleanup-expired` | `cleanupExpiredVerifications` | adminTimeout | `admin.ts:71` |
| 2 | POST | `/admin/cleanup-sessions` | `cleanupExpiredSessions` | adminTimeout | `admin.ts:110` |
| 3 | GET | `/admin/expiration-stats` | `getExpirationStats` | — | `admin.ts:141` |
| 4 | GET | `/admin/health` | inline (retention + cache metrics) | — | `admin.ts:160` |
| 5 | POST | `/admin/cache/clear` | `cacheClear` | — | `admin.ts:230` |
| 6 | GET | `/admin/cache/stats` | `getCacheStats` | — | `admin.ts:256` |
| 7 | GET | `/admin/enrichment/stats` | `getEnrichmentStats` | — | `admin.ts:284` |
| 8 | POST | `/admin/cleanup/sync-logs` | inline (Prisma deleteMany) | adminTimeout | `admin.ts:312` |
| 9 | GET | `/admin/retention/stats` | inline (5 Prisma queries) | — | `admin.ts:383` |
| 10 | POST | `/admin/recalculate-confidence` | `recalculateAllConfidenceScores` | adminTimeout | `admin.ts:502` |
| 11 | POST | `/admin/rotate-encryption-key` | inline (re-encrypt `user_insurance_cards`) | adminTimeout | `admin.ts:561` |

> Prompt checklist lists 9 endpoints; actual count is **11** (including
> `cleanup-sessions` and `rotate-encryption-key`). Prompt doc should be
> updated.

## Authentication

### X-Admin-Secret Flow
```ts
// admin.ts:24-58
const adminSecret = process.env.ADMIN_SECRET;
if (!adminSecret) return 503 ADMIN_NOT_CONFIGURED;
const providedBuffer = Buffer.from(String(providedSecret || ''));
const secretBuffer = Buffer.from(adminSecret);
const isValid = providedBuffer.length === secretBuffer.length &&
                timingSafeEqual(providedBuffer, secretBuffer);
if (!isValid) throw AppError.unauthorized(...);
```

- [x] Timing-safe comparison (`timingSafeEqual` from `node:crypto`)
- [x] Length pre-check avoids `timingSafeEqual` throwing on unequal buffers
- [x] 503 when `ADMIN_SECRET` unset — no accidental open admin
- [x] Generic 401 message (no header vs secret distinction)
- [ ] No rate limit on wrong-secret attempts — global 200/hr default only
- [ ] No admin user identity; shared secret = no "who ran cleanup" trail

## Cloud Scheduler Integration

### Status: UNVERIFIED
- Prompt shows example YAML / gcloud commands.
- **No `cloud-scheduler.yaml`, Terraform module, or `scripts/` file in the
  repo creates the scheduler job.** (Confirmed via Glob over backend pkg.)
- **No Cloud Run deployment manifest** committed either.
- This is the largest operational gap: cleanup will not run automatically
  unless configured manually in GCP console.

## Security Features

| Control | Status | Evidence |
|---|---|---|
| Timing-safe secret compare | Yes | `admin.ts:49-51` |
| Secret via env var only | Yes | `admin.ts:25` |
| Graceful degradation | Yes | `admin.ts:28-39` |
| Helmet / CSP applied | Yes (global) | `index.ts:49-69` |
| CORS | Yes | only same-origin allowed; `X-Admin-Secret` is explicitly in `allowedHeaders` (`index.ts:86`) |
| Request timeout | Yes (on long ops) | `adminTimeout` middleware |
| IP allowlist | No | — |
| Rate limit on bad secret | Partial | inherits 200/hr global default |
| Admin action audit log | No | operational pino logs only |
| Body size limit | Yes (100kb global) | `index.ts:97` |

## Exposure of Secret

- `ADMIN_SECRET` referenced only in `routes/admin.ts:25` — no accidental
  leak into logs, prompts, or test fixtures (Grep confirmed).
- Frontend code does not reference `ADMIN_SECRET` (it's a server-only env
  var).
- `X-Admin-Secret` is in the CORS `allowedHeaders` list (`index.ts:86`) —
  necessary, but consider restricting CORS to exclude this header for the
  public frontend origin. Currently any allowed origin can send it; only the
  secret's correctness matters.

## Query Parameter Validation

| Endpoint | Validation | Gaps |
|---|---|---|
| cleanup-expired | `dryRun==='true'`, `parseInt(batchSize)\|\|1000` | `batchSize` not upper-bounded |
| cleanup-sessions | `dryRun` only | — |
| cleanup/sync-logs | `dryRun`, `retentionDays` defaulting to 90 | `retentionDays` negative value accepted (subtracts future) |
| recalculate-confidence | `dryRun`, `limit` validated >0 with `AppError.badRequest` | Good |
| rotate-encryption-key | `dryRun`, `batchSize` defaulting to 50 | Not upper-bounded |

Recommendation: use Zod for admin query validation like the other routes.

## Admin Endpoints Checklist Status

### Authentication
- [x] X-Admin-Secret required
- [x] Timing-safe comparison
- [x] Graceful 503 if not configured
- [ ] Audit logging for admin actions

### Endpoints
- [x] POST /admin/cleanup-expired
- [x] POST /admin/cleanup-sessions (NOT in prompt list)
- [x] GET /admin/expiration-stats
- [x] GET /admin/health
- [x] POST /admin/cache/clear
- [x] GET /admin/cache/stats
- [x] GET /admin/enrichment/stats
- [x] POST /admin/cleanup/sync-logs
- [x] GET /admin/retention/stats
- [x] POST /admin/recalculate-confidence
- [x] POST /admin/rotate-encryption-key (NOT in prompt list)

### Automation
- [ ] Cloud Scheduler configured in repo
- [ ] Monitoring on job failures
- [ ] Alerting on cleanup errors

### Security
- [x] No rate limiting on admin (auth required) — correct design choice
- [x] Secret in environment variable
- [ ] IP allowlist for admin endpoints
- [ ] Audit log for admin actions

---

## Findings (ranked by severity)

### FINDING-38-01 — MEDIUM: No brute-force protection on admin secret
- The global `defaultRateLimiter` (200/hr) is the only gate on wrong-secret
  attempts. An attacker can try 200 secrets/hr/IP forever.
- 256-bit secrets make this astronomically safe, BUT if `ADMIN_SECRET` were
  a weak value (8-char alphanum = ~48 bits), 200/hr is not negligible.
- **Recommendation:** add a dedicated strict limiter on `/api/v1/admin/*`
  routes keyed off failed attempts (e.g. `adminFailRateLimiter` 10
  failed/hr) applied *before* the auth middleware.

### FINDING-38-02 — MEDIUM: No admin-action audit trail
- All 11 admin endpoints write operational pino logs, but no persistent,
  append-only record of "admin X ran cleanup at Y with params Z" exists.
- Because the auth model is a shared secret, the "who" dimension is lost
  entirely — any later investigation cannot distinguish legitimate Cloud
  Scheduler invocations from a leaked secret.
- **Recommendation:** add an `admin_actions` table logging endpoint, params
  (minus secret), requestId, timestamp, and source IP. Write middleware that
  runs after `adminAuthMiddleware`.

### FINDING-38-03 — MEDIUM: Cloud Scheduler not codified
- Repo has no IaC for the scheduler job. Manual setup risks drift and
  missing jobs.
- Cleanup depends entirely on external configuration.
- **Recommendation:** commit a `cloud-scheduler.yaml` or Terraform stanza
  that defines the cron for `/admin/cleanup-expired`,
  `/admin/cleanup-sessions`, `/admin/cleanup/sync-logs`, and optionally
  `/admin/recalculate-confidence`.

### FINDING-38-04 — LOW: No IP allowlist
- Only legitimate callers are Cloud Scheduler (from known GCP IP ranges) and
  developer runbooks. A secret compromise would give attackers full access
  from any IP.
- **Recommendation:** add optional `ADMIN_IP_ALLOWLIST` env var; if set,
  require `req.ip` to match. GCP documents Cloud Scheduler egress ranges.

### FINDING-38-05 — LOW: `rotate-encryption-key` lacks concurrency guard
- Two concurrent runs would race each other re-encrypting the same card and
  could produce mixed-key state. The `cursor` pagination reduces risk but
  doesn't eliminate it.
- **Recommendation:** take a Postgres advisory lock (`pg_try_advisory_lock`)
  at the start of the endpoint; return 409 if already running.

### FINDING-38-06 — LOW: `batchSize` / `retentionDays` not upper-bounded
- `cleanup-expired` `batchSize` could be passed as `1e9` — the Prisma
  `deleteMany` loop would still work but drops an oversized limit intent.
- `cleanup/sync-logs` `retentionDays` accepts negative / non-integer values
  via `parseInt`, leading to unexpected cutoff dates.
- **Recommendation:** validate with Zod:
  `z.coerce.number().int().min(1).max(10000)`.

### FINDING-38-07 — LOW: `timingSafeEqual` length pre-check leaks length
- The `providedBuffer.length === secretBuffer.length` check short-circuits
  before `timingSafeEqual`, which means the response time differs for
  wrong-length inputs vs same-length-wrong-value inputs. This technically
  leaks the secret's length.
- **Recommendation:** construct a second buffer of secret length from the
  provided value (e.g. via `createHash('sha256').update(provided)` and
  `createHash('sha256').update(secret)` then compare both 32-byte digests).

### FINDING-38-08 — INFO: Prompt doc lists 9 endpoints; actual is 11
- `cleanup-sessions` and `rotate-encryption-key` are missing from the
  prompt's endpoint list in `38-admin-endpoints.md`. Add them.

### FINDING-38-09 — INFO: No admin health "deep" check
- `/admin/health` returns uptime + retention counts, but does not verify
  Redis connectivity, Resend reachability, or reCAPTCHA secret presence.
  Cloud Scheduler and uptime probes would benefit from a deep-check mode.

---

## Recommendations (ordered)

1. Add `admin_actions` append-only table + middleware (FINDING-38-02).
2. Commit Cloud Scheduler IaC for all four cleanup jobs (FINDING-38-03).
3. Add brute-force limiter on admin routes (FINDING-38-01).
4. Migrate admin query validation to Zod (FINDING-38-06).
5. Add optional `ADMIN_IP_ALLOWLIST` (FINDING-38-04).
6. Add advisory-lock guard on `rotate-encryption-key` (FINDING-38-05).
7. Harden timing-safe compare by hashing both sides (FINDING-38-07).
8. Update prompt doc to list all 11 endpoints (FINDING-38-08).
9. Add deep-check mode to `/admin/health` (FINDING-38-09).

---

## Output Summary

| Section | Status |
|---|---|
| Authentication | PASS |
| Endpoints (11 total) | All present & gated |
| Automation | GAP (not in repo) |
| Security | GAP (audit log + IP allowlist + brute-force limiter) |
| Validation | PARTIAL (Zod on some; manual parseInt on others) |
