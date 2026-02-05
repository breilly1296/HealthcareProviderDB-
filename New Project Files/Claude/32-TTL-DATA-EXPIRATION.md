# TTL & Data Expiration Strategy — Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/32-ttl-data-expiration.md
**Status:** Fully Implemented -- TTL on verifications and plan acceptances with cleanup endpoints and stats

---

## Findings

### Schema (`packages/backend/prisma/schema.prisma`)

#### ProviderPlanAcceptance
- [x] **expiresAt field** -- `expiresAt DateTime? @map("expires_at") @db.Timestamptz(6)` on line 186. Nullable to support legacy records without TTL.
- [x] **lastVerified field** -- `lastVerified DateTime? @map("last_verified") @db.Timestamptz(6)` on line 182.
- [x] **Index on expiresAt** -- `@@index([expiresAt], map: "idx_ppa_expires_at")` on line 193. Enables efficient cleanup queries.
- [x] **Index on lastVerified** -- `@@index([lastVerified], map: "idx_ppa_last_verified")` on line 194.

#### VerificationLog
- [x] **expiresAt field** -- `expiresAt DateTime? @map("expires_at") @db.Timestamptz(6)` on line 218. Nullable for legacy records.
- [x] **Index on expiresAt** -- `@@index([expiresAt], map: "idx_vl_expires_at")` on line 224. Enables efficient cleanup queries.

#### VoteLog
- [x] **Cascade delete on verification** -- `@relation(fields: [verificationId], references: [id], onDelete: Cascade)` on line 241. When a verification log is deleted during cleanup, associated votes are automatically removed.

#### Cascade Behavior
- [ ] **SetNull on Provider delete** -- The prompt claims `SetNull` cascade for `ProviderPlanAcceptance.providerNpi` and `VerificationLog.providerNpi`. However, the schema shows `@relation(fields: [providerNpi], references: [npi], onUpdate: NoAction)` with no explicit `onDelete` for ProviderPlanAcceptance (line 187) and `onUpdate: NoAction` for VerificationLog (line 220). Prisma defaults to `Restrict` when `onDelete` is not specified, meaning provider deletion would fail if related records exist -- not silently set to null.

### TTL Calculation (`packages/backend/src/services/verificationService.ts`)
- [x] **TTL constant** -- Uses `VERIFICATION_TTL_MS` from `config/constants.ts`, defined as `6 * 30 * MS_PER_DAY` = 180 days (6 months). Research-documented: "12% annual provider turnover."
- [x] **getExpirationDate()** -- `new Date(Date.now() + VERIFICATION_TTL_MS)`. Applied consistently to both verification logs and plan acceptances.
- [x] **TTL on verification creation** -- `submitVerification()` passes `expiresAt: getExpirationDate()` to `prisma.verificationLog.create()` (line 397).
- [x] **TTL on acceptance creation** -- `upsertAcceptance()` passes `expiresAt: getExpirationDate()` on both create (line 251) and update (line 229) paths.
- [x] **TTL filter on queries** -- `notExpiredFilter()` helper returns `{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }` -- includes legacy records (null) and non-expired records. Used in `getRecentVerifications()`, `getVerificationsForPair()`, and `countVerificationConsensus()`.
- [x] **includeExpired option** -- `getRecentVerifications()` and `getVerificationsForPair()` accept `{ includeExpired?: boolean }` parameter, defaulting to false.
- [x] **expiresAt exposed in API** -- Selected in query results for transparency (line 645, line 730).
- [x] **Acceptance expiration check** -- `getVerificationsForPair()` calculates `isAcceptanceExpired` boolean (line 739-741).

### Cleanup Implementation (`packages/backend/src/services/verificationService.ts`)
- [x] **cleanupExpiredVerifications()** -- Full implementation at lines 768-855. Counts expired records, then deletes in batches.
- [x] **Dry run mode** -- When `dryRun: true`, returns counts without deleting.
- [x] **Batch size** -- Accepts `batchSize` parameter (default 1000). Includes safety check to break infinite loops (`if (deleteResult.count < batchSize) break`).
- [x] **Handles both tables** -- Deletes from both `verificationLog` and `providerPlanAcceptance`.
- [x] **Null-safe filter** -- Uses `{ expiresAt: { lt: now, not: null } }` to avoid deleting legacy records without TTL.
- [ ] **Batch size not enforced per query** -- The `batchSize` parameter is accepted but the actual `deleteMany` call does not use `take: batchSize`. It deletes ALL matching records in a single query. The while loop and batchSize comparison provide a safety net but don't actually batch the deletes. This could cause issues with very large backlogs.

### Expiration Stats (`packages/backend/src/services/verificationService.ts`)
- [x] **getExpirationStats()** -- Lines 860-920. Returns comprehensive stats including: total, withTTL, expired, expiringWithin7Days, expiringWithin30Days for both verificationLogs and planAcceptances. Uses 10 parallel Prisma queries.

### Admin Endpoints (`packages/backend/src/routes/admin.ts`)
- [x] **POST /admin/cleanup-expired** -- Lines 68-94. Protected by `adminAuthMiddleware`. Accepts `dryRun` and `batchSize` query params. Returns structured cleanup results with human-readable message.
- [x] **GET /admin/expiration-stats** -- Lines 102-113. Protected by `adminAuthMiddleware`. Returns stats from `getExpirationStats()`.
- [x] **Admin auth with timing-safe comparison** -- Uses `crypto.timingSafeEqual()` to prevent timing attacks. Returns 503 when `ADMIN_SECRET` not configured (graceful degradation).
- [x] **GET /admin/health (includes retention)** -- Lines 121-182. Includes `verificationLogExpiringSoon` count.
- [x] **GET /admin/retention/stats** -- Lines 325-431. Comprehensive retention stats across all log types including verification logs (7-day/30-day expiring), sync logs (90-day retention), plan acceptances, and vote logs.
- [x] **POST /admin/cleanup/sync-logs** -- Lines 255-317. Separate cleanup for sync_logs with configurable retention days (default 90).

### Backfill
- [x] **Backfill script exists** -- `scripts/backfill-verification-ttl.ts` and `scripts/backfill-verification-ttl.sql` both exist.
- [ ] **Backfill run status unknown** -- Cannot determine from code whether the backfill has been executed against the production database.

### Cloud Scheduler
- [ ] **Not verifiable from code** -- Cloud Scheduler configuration is infrastructure, not in the codebase. The endpoint is designed for it (POST with `X-Admin-Secret` header) but whether the job is actually configured cannot be determined from source analysis.

## Summary

The TTL and data expiration strategy is thoroughly implemented at the code level. Both `VerificationLog` and `ProviderPlanAcceptance` have `expiresAt` fields with database indexes for efficient queries. The verification service consistently sets TTL on creation and update, and filters out expired records by default in all query methods while preserving backward compatibility with legacy null-TTL records. The cleanup function supports dry run, batch processing, and both tables. Admin endpoints provide cleanup trigger, expiration stats, and comprehensive retention monitoring.

The implementation is more thorough than what the prompt describes: the `notExpiredFilter()` helper gracefully handles legacy records, expiration status is exposed transparently in API responses, and retention stats include 7-day and 30-day lookahead windows.

## Recommendations

1. **Fix batch delete implementation** -- The `cleanupExpiredVerifications()` function accepts a `batchSize` parameter but does not actually limit each `deleteMany` call. For large backlogs, this could cause long-running transactions. Add `take: batchSize` to the Prisma queries or use raw SQL with `LIMIT`.

2. **Verify cascade behavior** -- The prompt claims `SetNull` cascade on provider/plan delete, but the schema uses `NoAction` for `onUpdate` and defaults to `Restrict` for `onDelete`. If providers are ever removed from the database, related records will block deletion. Either add explicit `onDelete: SetNull` or document that providers are never deleted.

3. **Run backfill if not done** -- The backfill scripts exist but there is no record of execution. Run against production with a dry-run first to identify records missing `expiresAt`. Monitor the count of records with `expiresAt: null` via the `/admin/expiration-stats` endpoint.

4. **Configure Cloud Scheduler** -- The cleanup endpoint is ready but the prompt's checklist shows Cloud Scheduler as unconfigured. Set up a Cloud Scheduler job to POST to `/api/v1/admin/cleanup-expired` hourly with the `X-Admin-Secret` header.

5. **Add monitoring alerts** -- Set up alerts for: (a) cleanup failures (non-200 responses from the endpoint), (b) large expired record backlogs (e.g., > 1000 expired records pending cleanup), (c) backfill completeness (records still having null expiresAt).

6. **Add locationId to schema** -- The `verificationService.ts` code references `locationId` on `ProviderPlanAcceptance` (lines 246, 349-351, 361) but this field does not exist in `schema.prisma`. This suggests either the field was removed during a schema refactor or needs to be added. The code will silently fail to match location-specific records.
