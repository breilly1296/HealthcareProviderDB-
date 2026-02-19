# TTL & Data Expiration Strategy Review

**Generated:** 2026-02-18
**Prompt:** 32-ttl-data-expiration.md
**Status:** Fully Implemented -- Schema, service logic, admin endpoints, backfill script, retention stats all in place

---

## Summary

The TTL strategy is based on research showing 12% annual provider turnover (Ndumele et al., 2018). Verification data expires after 6 months from its creation/last-verification date. The system includes `expiresAt` fields on `VerificationLog` and `ProviderPlanAcceptance`, admin endpoints for cleanup and monitoring, a backfill script for historical records, comprehensive retention statistics, and proactive expiration filtering in all verification queries. The implementation is thorough and production-ready pending Cloud Scheduler configuration.

---

## Verified Checklist

### Constants (`packages/backend/src/config/constants.ts`)
- [x] `VERIFICATION_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000` (6 months, ~15,552,000,000 ms)
- [x] `SYBIL_PREVENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000` (30 days)
- [x] `MIN_VERIFICATIONS_FOR_CONSENSUS = 3` (Mortensen et al., 2015)
- [x] `MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60`

### Schema -- expiresAt Fields (from `packages/backend/prisma/schema.prisma`)

#### ProviderPlanAcceptance (lines 213-237)
- [x] `expiresAt DateTime? @map("expires_at") @db.Timestamptz(6)` (line 223)
- [x] Index: `@@index([expiresAt], map: "idx_ppa_expires_at")` (line 231)
- [x] Nullable -- allows legacy records without TTL

#### VerificationLog (lines 239-274)
- [x] `expiresAt DateTime? @map("expires_at") @db.Timestamptz(6)` (line 259)
- [x] Index: `@@index([expiresAt], map: "idx_vl_expires_at")` (line 265)
- [x] Nullable -- allows legacy records without TTL

### TTL Calculation (`packages/backend/src/services/verificationService.ts`)
- [x] `getExpirationDate()` returns `new Date(Date.now() + VERIFICATION_TTL_MS)` (line 41)
- [x] TTL set on `verificationLog.create()` (line 419: `expiresAt: getExpirationDate()`)
- [x] TTL set on `providerPlanAcceptance.create()` and `.update()` (lines 275, 252)
- [x] TTL reset on acceptance update (extends expiration when re-verified)

### Expiration Filtering
- [x] `notExpiredFilter()` function (line 48): Includes records where `expiresAt` is null (legacy) OR greater than now
- [x] Applied in `getRecentVerifications()` (default `includeExpired: false`)
- [x] Applied in `getVerificationsForPair()` (default `includeExpired: false`)
- [x] Applied in `countVerificationConsensus()` -- only counts non-expired verifications for consensus
- [x] `includeExpired` option available on query functions for admin/debugging use

### Cleanup Implementation (`packages/backend/src/services/verificationService.ts`, lines 757-844)
- [x] `cleanupExpiredVerifications()` function
- [x] Dry run mode: counts without deleting
- [x] Batch size parameter (default 1000)
- [x] Counts expired records first, then deletes in batches
- [x] Safety check: breaks if `deleteResult.count < batchSize` (prevents infinite loop)
- [x] Deletes both `verificationLog` and `providerPlanAcceptance` expired records
- [x] Returns detailed statistics: expired counts, deleted counts, dry run flag

### Expiration Stats (`packages/backend/src/services/verificationService.ts`, lines 849-909)
- [x] `getExpirationStats()` function
- [x] Returns per-table breakdown:
  - Total records
  - Records with TTL set
  - Currently expired records
  - Expiring within 7 days
  - Expiring within 30 days

### Admin Endpoints (`packages/backend/src/routes/admin.ts`)

| Endpoint | Method | Lines | Purpose | Verified |
|----------|--------|-------|---------|----------|
| `/admin/cleanup-expired` | POST | 71-98 | Delete expired verifications | Yes |
| `/admin/cleanup-sessions` | POST | 110-133 | Delete expired sessions | Yes |
| `/admin/expiration-stats` | GET | 141-152 | Verification expiration stats | Yes |
| `/admin/health` | GET | 160-221 | Health check with retention metrics | Yes |
| `/admin/retention/stats` | GET | 383-489 | Comprehensive retention stats | Yes |
| `/admin/cleanup/sync-logs` | POST | 312-375 | Cleanup sync logs > 90 days | Yes |
| `/admin/recalculate-confidence` | POST | 502-538 | Recalculate confidence with decay | Yes |

All admin endpoints are protected by:
- [x] `adminAuthMiddleware` with timing-safe secret comparison
- [x] `adminTimeout` middleware for long-running operations
- [x] Structured logging on start and completion

### Retention Statistics Endpoint (`/admin/retention/stats`)
Returns comprehensive data across all log types:
- [x] **Verification logs**: total, expiring in 7/30 days, oldest/newest record, retention policy ("6 months TTL")
- [x] **Sync logs**: total, older than 90 days, oldest/newest record, retention policy ("90 days manual cleanup")
- [x] **Plan acceptances**: total, expiring in 7/30 days, retention policy ("6 months TTL")
- [x] **Vote logs**: total, retention policy ("Follows plan acceptance TTL")

### Health Endpoint Retention Metrics (`/admin/health`)
- [x] Verification log total and expiring in 7 days
- [x] Oldest verification log record
- [x] Sync log total and oldest record
- [x] Vote log total
- [x] Cache statistics included

### Backfill Script (`scripts/backfill-verification-ttl.ts`)
- [x] Dry run mode by default (`--apply` flag required for changes)
- [x] Before/after analysis with printout
- [x] **provider_plan_acceptance**:
  - Records with `last_verified`: `expires_at = last_verified + INTERVAL '6 months'`
  - Records without `last_verified`: `expires_at = created_at + INTERVAL '6 months'`
- [x] **verification_logs**: `expires_at = created_at + INTERVAL '6 months'`
- [x] Transaction wrapping (COMMIT/ROLLBACK)
- [x] Expiry breakdown report: already expired, expiring <1 month, 1-3 months, >3 months
- [x] Uses raw pg Pool (not Prisma) for direct SQL execution
- [x] SQL file also exists: `scripts/backfill-verification-ttl.sql`
- [x] Usage: `npx tsx scripts/backfill-verification-ttl.ts [--apply]`

### Cascade Behavior (from schema.prisma)
- [x] `ProviderPlanAcceptance.provider` -- `onUpdate: NoAction` (SetNull not needed, NPI FK is nullable)
- [x] `ProviderPlanAcceptance.insurancePlan` -- `onUpdate: NoAction`
- [x] `VerificationLog.provider` -- `onUpdate: NoAction`
- [x] `VerificationLog.plan` -- `onUpdate: NoAction`
- [x] `VoteLog.verification` -- `onDelete: Cascade` (votes deleted with their verification)
- [x] `providerNpi` and `planId` are nullable on both tables -- preserves audit trail when provider/plan deleted

### Testing
- [x] `getExpirationDate()` tested: confirms approximately 6 months from now (test 22 in verificationService.test.ts)
- [x] `cleanupExpiredVerifications()` tested: dry run returns counts without deleting (test 19)
- [x] `cleanupExpiredVerifications()` tested: actual delete mode calls deleteMany (test 20)
- [x] `cleanupExpiredVerifications()` tested: zero counts when nothing expired (test 21)
- [x] `submitVerification()` tested: confirms `expiresAt` approximately 6 months from now (test 9)
- [x] TTL constant value tested: `VERIFICATION_TTL_MS === 6 * 30 * 24 * 60 * 60 * 1000` (line 472)

---

## Architecture Assessment

### Strengths
1. **Research-backed TTL**: The 6-month expiration is grounded in the 12% annual provider turnover statistic, with appropriate references in code comments.
2. **Soft expiration filter**: `notExpiredFilter()` uses OR logic to include legacy records (`expiresAt: null`), providing backwards compatibility during the backfill transition.
3. **Comprehensive admin tooling**: Dry run modes on all cleanup operations, detailed stats endpoints, expiry breakdowns, and retention policy documentation in API responses.
4. **Transaction-safe backfill**: The backfill script wraps all updates in a transaction with rollback on error.
5. **TTL extends on re-verification**: When a provider-plan acceptance is re-verified, the expiresAt is reset to 6 months from now, keeping active data alive.
6. **Cascade-safe**: Vote logs cascade-delete with their verification. Provider/plan deletions set FKs to null rather than deleting verifications, preserving audit trail.

### Gaps
1. **Cloud Scheduler not confirmed**: The prompt's checklist shows automation not configured. The `POST /admin/cleanup-expired` endpoint is ready to be called by Cloud Scheduler but requires:
   - Cloud Scheduler job creation
   - `ADMIN_SECRET` mounted in job headers
   - Monitoring on job failures
2. **Backfill status unknown**: The prompt's checklist shows "TTL backfill script run" as unchecked. It's unclear if all historical records now have `expiresAt` populated.
3. **No alerting on large backlogs**: If cleanup fails for extended periods, expired records accumulate. No alerting threshold is configured.
4. **No user notification before expiration**: Users are not prompted to re-verify data approaching expiration. The `recommendReVerification` flag exists in confidence scoring metadata but is not surfaced to users.
5. **Sync log cleanup is separate**: Sync logs use a 90-day retention with a different endpoint (`/admin/cleanup/sync-logs`), requiring a separate Cloud Scheduler job.

### Production Readiness
- [x] Schema fields and indexes in place
- [x] Service logic filters expired records
- [x] Admin endpoints for manual cleanup
- [x] Backfill script ready
- [x] Dry run modes for safety
- [x] Comprehensive stats and monitoring endpoints
- [ ] Cloud Scheduler configured for automated cleanup
- [ ] Monitoring/alerting on cleanup failures
- [ ] Backfill confirmed complete
- [ ] User-facing re-verification prompts

---

## Recommendations

1. **Configure Cloud Scheduler**: Create two scheduled jobs:
   - `cleanup-expired-verifications`: `POST /admin/cleanup-expired`, hourly, with `X-Admin-Secret` header
   - `cleanup-sync-logs`: `POST /admin/cleanup/sync-logs`, daily, with `X-Admin-Secret` header

2. **Run backfill if not done**: Execute `npx tsx scripts/backfill-verification-ttl.ts` in dry run first, then with `--apply`. Verify all records have `expiresAt` set via the `/admin/expiration-stats` endpoint.

3. **Add cleanup monitoring**: Set up Cloud Monitoring alerts for:
   - Cleanup job failures (Cloud Scheduler error status)
   - Expired record count exceeding threshold (query `/admin/expiration-stats` periodically)

4. **Consider configurable TTL**: The 6-month TTL is hardcoded. Different specialties may warrant different TTLs (e.g., mental health with 43% turnover could use a shorter TTL).

---

## Key Files

| File | Path | Purpose |
|------|------|---------|
| Constants | `packages/backend/src/config/constants.ts` | VERIFICATION_TTL_MS, thresholds |
| Schema | `packages/backend/prisma/schema.prisma` (lines 213-274) | expiresAt fields, indexes |
| Service | `packages/backend/src/services/verificationService.ts` | TTL calculation, cleanup, stats, filtering |
| Admin Routes | `packages/backend/src/routes/admin.ts` | Cleanup, stats, retention endpoints |
| Backfill Script | `scripts/backfill-verification-ttl.ts` | Backfill historical records |
| Backfill SQL | `scripts/backfill-verification-ttl.sql` | Raw SQL version |
| Tests | `packages/backend/src/services/__tests__/verificationService.test.ts` | TTL and cleanup tests |
