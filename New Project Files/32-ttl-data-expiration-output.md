# TTL & Data Expiration — 2026-04-16

**TTL Duration:** 6 months (based on 12% annual provider turnover research)

## TTL Strategy

Core constant: `VERIFICATION_TTL_MS = 6 * 30 * MS_PER_DAY`
(`packages/backend/src/config/constants.ts:19`).

Calculation applied on every create/update via `getExpirationDate()`
(`packages/backend/src/services/verificationService.ts:40-42`).

## Tables with `expires_at`

From `packages/backend/prisma/schema.prisma`:

| Table | Line | Index |
|-------|------|-------|
| `provider_plan_acceptance.expires_at` | schema.prisma:223 | `idx_ppa_expires_at` (schema.prisma:231) |
| `verification_logs.expires_at` | schema.prisma:259 | `idx_vl_expires_at` (schema.prisma:265) |
| `sessions.expires_at` | schema.prisma:359 | `idx_sessions_expires_at` (schema.prisma:367) |
| `magic_link_tokens.expires_at` | schema.prisma:375 | `idx_magic_link_expires_at` (schema.prisma:381) |

All `expires_at` columns are `Timestamptz(6)` nullable (legacy rows may have null).

## Write Paths

### `submitVerification` (verificationService.ts:338-437)
- Sets `expiresAt: getExpirationDate()` on both:
  - `verificationLog.create` (line 419)
  - `providerPlanAcceptance.update` (line 251) / `.create` (line 273)
- Legacy rows without `expiresAt` are treated as non-expired via `notExpiredFilter()` (line 48-55): `OR: [{expiresAt: null}, {expiresAt: {gt: now}}]`.

### Auth sessions / magic links
- Sessions: `authService.ts` (not deeply inspected here) uses `SESSION_DURATION_MS = 30 * MS_PER_DAY` (constants.ts:95)
- Magic links: `MAGIC_LINK_EXPIRY_MS = 15 * MS_PER_MINUTE` (constants.ts:85)

## Cleanup Path

### Admin endpoints
File: `packages/backend/src/routes/admin.ts`

| Endpoint | Line | Purpose |
|----------|------|---------|
| `POST /admin/cleanup-expired` | admin.ts:71-98 | Deletes expired verification_logs + provider_plan_acceptance |
| `POST /admin/cleanup-sessions` | admin.ts:110-133 | Deletes expired sessions |
| `POST /admin/cleanup/sync-logs` | admin.ts:312-375 | Deletes sync_logs older than `retentionDays` (default 90) |
| `GET /admin/expiration-stats` | admin.ts:141-152 | Current counts |
| `GET /admin/retention/stats` | admin.ts:383-489 | Broader multi-table retention view |
| `GET /admin/health` | admin.ts:160-221 | Includes retention metrics |

### Core cleanup logic (verificationService.ts:757-844)
- Counts `expiresAt < now, not null` for logs + acceptances (lines 771-788)
- Dry-run mode returns counts without deleting (lines 798-799)
- Deletes in loops (lines 803-841) — but note: single `deleteMany` doesn't
  actually batch; the `while` loop will exit after the first pass since
  Prisma deletes all matching rows at once. `batchSize` parameter is
  unused in practice.

### Cloud Scheduler wiring
File: `scripts/setup-cloud-scheduler.sh`

Three jobs defined:

| Job | Schedule | Endpoint |
|-----|----------|----------|
| `cleanup-expired-verifications` | `0 * * * *` UTC (hourly) | `POST /api/v1/admin/cleanup-expired` (lines 187-193) |
| `cleanup-sync-logs` | `0 3 * * *` America/New_York (3am ET daily) | `POST /api/v1/admin/cleanup/sync-logs` (lines 199-205) |
| `recalculate-confidence-scores` | `0 4 * * *` America/New_York (4am ET daily) | `POST /api/v1/admin/recalculate-confidence` (lines 211-217) |

Auth via `X-Admin-Secret` header (setup-cloud-scheduler.sh:163).
**Missing:** no scheduler job calls `POST /admin/cleanup-sessions` — expired
sessions accumulate until manual invocation.

## Backfill

File: `scripts/backfill-verification-ttl.ts` (272 lines)

- Dry-run by default (`--apply` to execute) — lines 143-156
- Backfills in a single transaction (lines 204-225):
  - `provider_plan_acceptance`: `last_verified + 6 months`, or `created_at + 6 months` if null (lines 92-112)
  - `verification_logs`: `created_at + 6 months` (lines 114-121)
- Reports before/after + expiry breakdown buckets
- Per project memory, Phase 5/6 work already ran backfills — status of verification TTL backfill unknown to this review

SQL version at `scripts/backfill-verification-ttl.sql` (complementary).

## Read Filtering

`notExpiredFilter()` (verificationService.ts:48-55) applied in:
- `getRecentVerifications` (verificationService.ts:626)
- `getVerificationsForPair` (verificationService.ts:706)
- `countVerificationConsensus` (verificationService.ts:153)

`getVerificationsForPair` also computes `isAcceptanceExpired` separately
(lines 728-730) — callers must handle it.

## Cascade Behavior

From schema.prisma:
- `verification_logs.providerNpi` -> `provider(npi)` `onUpdate: NoAction`
  (line 261) — default is `SetNull` on delete (no explicit `onDelete` set).
- `provider_plan_acceptance.providerNpi` -> same (line 226).
- `vote_logs.verificationId` -> `verification_logs(id)` `onDelete: Cascade`
  (line 282) — votes are removed when the parent verification is deleted.

## Findings (Ranked)

1. **MEDIUM** — `cleanupExpiredVerifications` has a dead `batchSize` parameter (admin.ts:77, verificationService.ts:767). `deleteMany` deletes all matching rows at once; the `while` loop in lines 803-819 is misleading. Fix: either implement true batching (`take` + `deleteMany` with `id IN (...)`) or remove the parameter.
2. **MEDIUM** — No scheduler job for `cleanup-sessions` (setup-cloud-scheduler.sh lists 3 jobs; session cleanup endpoint exists at admin.ts:110 but is unscheduled). Expired `sessions` rows accumulate indefinitely.
3. **MEDIUM** — `sync_logs` retention is documented as "90 days (manual cleanup)" (admin.ts:474) but the scheduler calls it daily (scripts/setup-cloud-scheduler.sh:200-205). Update the `retentionPolicy` string to "90 days (automated via Cloud Scheduler)".
4. **LOW** — No alerting on cleanup failure. Cloud Scheduler will retry per attempt-deadline (setup-cloud-scheduler.sh:165) but a sustained failure won't page anyone.
5. **LOW** — `getExpirationStats` counts "expiring within 7 / 30 days" but there's no dashboard surfacing these values. `/admin/health` shows them but that endpoint is only accessible via admin secret.
6. **LOW** — No notification to re-verify. A user who submitted a verification 5 months ago gets no email prompt before their entry expires.
7. **LOW** — `magic_link_tokens` has `expires_at` + `used_at` + index, but no cleanup endpoint. Used tokens sit with `used_at != null` + expired `expires_at` indefinitely. Low risk (small table) but worth adding to the hourly cleanup.
8. **LOW** — Legacy null-`expiresAt` rows are treated as non-expired via `notExpiredFilter()` (verificationService.ts:48-55). After backfill, this fallback is dead code; consider removing once all rows have TTL.

## Checklist

### Schema
- [x] `expires_at` on `provider_plan_acceptance` (schema.prisma:223)
- [x] `expires_at` on `verification_logs` (schema.prisma:259)
- [x] `expires_at` on `sessions` (schema.prisma:359)
- [x] `expires_at` on `magic_link_tokens` (schema.prisma:375)
- [x] Index on every `expires_at` column
- [x] `SetNull` cascade on provider delete (default Prisma behavior preserves audit trail)

### Admin Endpoints
- [x] `POST /admin/cleanup-expired` (admin.ts:71)
- [x] `GET /admin/expiration-stats` (admin.ts:141)
- [x] `POST /admin/cleanup-sessions` (admin.ts:110)
- [x] `POST /admin/cleanup/sync-logs` (admin.ts:312)
- [x] `GET /admin/retention/stats` (admin.ts:383)
- [x] Dry-run mode supported
- [ ] `batchSize` actually implemented (currently no-op)
- [ ] `POST /admin/cleanup/magic-link-tokens` (not implemented)

### Automation
- [x] Cloud Scheduler script available (scripts/setup-cloud-scheduler.sh)
- [x] Hourly cleanup-expired job
- [x] Daily sync-logs cleanup job
- [x] Daily confidence recalculation job
- [ ] Session cleanup job
- [ ] Magic-link token cleanup job
- [ ] Alerting on repeated scheduler failures

### Backfill
- [x] Backfill script exists (scripts/backfill-verification-ttl.ts)
- [x] Dry-run by default
- [x] Transaction-safe
- [ ] Confirmed applied in production (unknown from this review)

## Recommendations

1. Add a scheduler job for `cleanup-sessions` with a daily cadence.
2. Add a cleanup endpoint + scheduler job for `magic_link_tokens` (used + expired).
3. Fix or remove `batchSize` in `cleanupExpiredVerifications`; current implementation is misleading.
4. Expose `expiration-stats` (non-sensitive counts only) via a public metrics endpoint or emit as Cloud Monitoring custom metric.
5. Consider a 14-day pre-expiry email reminder for users with accounts.
6. After confirming backfill ran, drop the `expiresAt: null` branch of `notExpiredFilter()`.

## Output Status

- TTL Duration: 6 months
- Automated cleanup: Yes (hourly via Cloud Scheduler)
- Backfill script: Available; production status unknown
- Indexes: Present on all relevant tables
