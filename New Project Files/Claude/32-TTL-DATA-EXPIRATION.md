# TTL & Data Expiration

**Last Updated:** 2026-02-06
**TTL Duration:** 6 months (180 days, `VERIFICATION_TTL_MS = 6 * 30 * MS_PER_DAY`)

## Current Status

| Metric | Value |
|--------|-------|
| TTL constant | `VERIFICATION_TTL_MS` = 15,552,000,000 ms (180 days) |
| Schema: expiresAt on VerificationLog | Present, nullable, indexed |
| Schema: expiresAt on ProviderPlanAcceptance | Present, nullable, indexed |
| Admin cleanup endpoint | Active, secured with X-Admin-Secret |
| Admin stats endpoint | Active, secured with X-Admin-Secret |
| Backfill script | Complete, supports dry-run and apply modes |

## Cleanup Schedule
- Frequency: Designed for hourly (via Cloud Scheduler)
- Cloud Scheduler: **Not configured** (no Cloud Scheduler job found in codebase)
- Last run: Unknown
- Records cleaned: Unknown

## Backfill Status
- Backfill script: Complete (`scripts/backfill-verification-ttl.ts`)
- Records with TTL: Unknown (requires database query)
- Backfill needed: Likely yes (script exists specifically for this purpose)

---

## Schema Verification

### ProviderPlanAcceptance (lines 181-206 of schema.prisma)
```prisma
expiresAt DateTime? @map("expires_at") @db.Timestamptz(6)
```
- **Index**: `idx_ppa_expires_at` -- **VERIFIED** for efficient cleanup queries
- **Also indexed**: `lastVerified` (`idx_ppa_last_verified`) for recency queries

### VerificationLog (lines 208-243 of schema.prisma)
```prisma
expiresAt DateTime? @map("expires_at") @db.Timestamptz(6)
```
- **Index**: `idx_vl_expires_at` -- **VERIFIED** for efficient cleanup queries
- **Also indexed**: `createdAt` (`idx_vl_created_at`) for ordering

### Cascade Behavior
- `ProviderPlanAcceptance.provider` -> `onUpdate: NoAction` (no cascade set for onDelete, defaults to Prisma behavior)
- `VerificationLog.provider` -> `onUpdate: NoAction`
- `VoteLog.verification` -> `onDelete: Cascade` -- votes are deleted when their parent verification is deleted
- **Finding**: The prompt mentions `SetNull` cascades, but the actual schema uses `NoAction` for provider and plan relations. The `VoteLog` -> `VerificationLog` cascade is `onDelete: Cascade`, meaning vote logs are automatically cleaned up when expired verification logs are deleted.

---

## TTL Calculation -- VERIFIED

**Location**: `packages/backend/src/services/verificationService.ts`

```typescript
export const VERIFICATION_TTL_MS = 6 * 30 * MS_PER_DAY; // From constants.ts

export function getExpirationDate(): Date {
  return new Date(Date.now() + VERIFICATION_TTL_MS);
}
```

**Where TTL is applied:**
1. **New verifications** (`submitVerification`): `expiresAt: getExpirationDate()` on both `verificationLog.create()` and `providerPlanAcceptance.create()`/`update()`
2. **Acceptance updates** (`upsertAcceptance`): TTL is refreshed on every new verification: `expiresAt: getExpirationDate()`

**Finding**: The TTL is refreshed (extended) every time a new verification is submitted for the same provider-plan pair. This means actively verified data never expires -- only stale, unverified data expires after 6 months.

---

## Expired Record Filtering -- VERIFIED

The `notExpiredFilter()` helper function handles both legacy records (no TTL) and active TTL:

```typescript
function notExpiredFilter(): Prisma.VerificationLogWhereInput {
  return {
    OR: [
      { expiresAt: null },              // Legacy records without TTL
      { expiresAt: { gt: new Date() } }, // Not yet expired
    ],
  };
}
```

This filter is applied in:
- `countVerificationConsensus()` -- only counts non-expired verifications for consensus
- `getRecentVerifications()` -- excludes expired by default (`includeExpired` option)
- `getVerificationsForPair()` -- excludes expired by default (`includeExpired` option)

**Finding**: The filter correctly handles backward compatibility with records that predate TTL implementation by treating `expiresAt: null` as non-expired.

---

## Admin Endpoints -- VERIFIED

### `POST /api/v1/admin/cleanup-expired`
- **Authentication**: `adminAuthMiddleware` with timing-safe comparison of `X-Admin-Secret`
- **Query params**: `dryRun=true`, `batchSize=1000`
- **Implementation**: Calls `cleanupExpiredVerifications()` from verificationService
- **Response**: Counts of expired and deleted records for both tables

### `GET /api/v1/admin/expiration-stats`
- **Authentication**: Same admin auth
- **Response**: Total, withTTL, expired, expiringWithin7Days, expiringWithin30Days for both tables

### `GET /api/v1/admin/retention/stats` (additional, not in prompt)
- Comprehensive retention statistics across all log types
- Includes verification logs, sync logs, plan acceptances, and vote logs
- Shows oldest/newest records, expiring counts at 7 and 30 day horizons

### `GET /api/v1/admin/health` (additional, not in prompt)
- Includes retention metrics: verification log total, expiring in 7 days, oldest record
- Also shows sync log and vote log totals

---

## Cleanup Implementation -- VERIFIED

**Location**: `verificationService.ts`, `cleanupExpiredVerifications()` (lines 767-854)

```typescript
export async function cleanupExpiredVerifications(options) {
  // 1. Count expired records (both tables)
  // 2. If dryRun, return counts only
  // 3. Delete expired verification logs in batches
  // 4. Delete expired plan acceptances in batches
  // 5. Return cleanup statistics
}
```

**Key implementation details:**
- **Batch deletion**: Uses `while` loop with `deleteMany()`, breaks when `count === 0` or `count < batchSize`
- **Safety**: `expiresAt: { lt: now, not: null }` -- only deletes records with explicit TTL that have expired, never legacy records
- **VoteLog cascade**: Deleting a `VerificationLog` automatically cascades to its `VoteLog` entries (confirmed in schema)
- **Dry run**: Returns counts without executing any deletes

**Potential issue**: The `batchSize` parameter is accepted but not used as a `take` limit in the `deleteMany()` query. The `deleteMany()` call deletes all matching records in one operation, and the `batchSize` is only used as a loop break condition. This means the "batching" is not truly batched -- it relies on Prisma's `deleteMany` to handle all records at once, then checks if fewer than `batchSize` were deleted as a termination condition.

---

## Backfill Script -- VERIFIED

**Location**: `scripts/backfill-verification-ttl.ts` (271 lines)

**Quality: Excellent.** Production-ready script with:
- **Dry run mode** (default): `npx tsx scripts/backfill-verification-ttl.ts`
- **Apply mode**: `npx tsx scripts/backfill-verification-ttl.ts --apply`
- **Transaction safety**: All updates wrapped in `BEGIN`/`COMMIT` with `ROLLBACK` on error
- **Before/after reporting**: Shows table stats before and after backfill
- **Expiry breakdown**: Shows already-expired, expiring < 1 month, 1-3 months, > 3 months
- **Two-phase PPA update**: First updates records with `last_verified` (uses `last_verified + 6 months`), then updates records without `last_verified` (uses `created_at + 6 months`)
- **VL update**: Updates all records missing TTL with `created_at + 6 months`
- **Direct SQL**: Uses `pg` Pool (not Prisma) for raw SQL performance

**Corresponding SQL file also exists**: `scripts/backfill-verification-ttl.sql`

---

## Checklist Verification

### Schema
- [x] expiresAt field on ProviderPlanAcceptance -- **VERIFIED**: `expires_at` Timestamptz(6), nullable
- [x] expiresAt field on VerificationLog -- **VERIFIED**: `expires_at` Timestamptz(6), nullable
- [x] Index on expiresAt for efficient cleanup -- **VERIFIED**: `idx_ppa_expires_at` and `idx_vl_expires_at`
- [x] Cascade behavior -- **PARTIALLY VERIFIED**: VoteLog cascades on VerificationLog delete. Provider/Plan relations use `NoAction` (not `SetNull` as prompt states)

### Admin Endpoints
- [x] POST /admin/cleanup-expired -- **VERIFIED**: With dry run, batch size, admin auth
- [x] GET /admin/expiration-stats -- **VERIFIED**: Comprehensive stats with 7-day and 30-day horizons
- [x] Dry run mode -- **VERIFIED**: Returns counts without deleting
- [x] Batch size configuration -- **PARTIALLY VERIFIED**: Parameter accepted but not used as true batch limit

### Automation
- [ ] Cloud Scheduler job configured -- **NOT CONFIGURED**: No Cloud Scheduler config found
- [ ] Monitoring on cleanup failures -- **NOT CONFIGURED**: No alerting found
- [ ] Alerting on large backlogs -- **NOT CONFIGURED**

### Backfill
- [ ] TTL backfill script run -- **SCRIPT EXISTS** but execution status unknown
- [ ] All records have expiresAt -- **UNKNOWN**: Requires database query

---

## Questions Answered

### 1. Is Cloud Scheduler configured?
**No.** No Cloud Scheduler configuration was found in the codebase. The admin cleanup endpoint is ready to be called by a scheduler (accepts POST with admin secret header), but the scheduler job itself has not been set up. The endpoint documentation in `admin.ts` says "Designed to be called by Cloud Scheduler" confirming the intent.

### 2. Has backfill been run?
**Unknown from code alone.** The backfill script (`scripts/backfill-verification-ttl.ts`) is complete and production-ready. It supports dry-run mode for safe preview. The script's existence of the "nothing to do" early exit path suggests it was designed to be idempotent and run multiple times.

### 3. What's the current expiration backlog?
**Unknown from code alone.** The `GET /api/v1/admin/expiration-stats` endpoint provides this information at runtime. The `GET /api/v1/admin/retention/stats` endpoint provides even more detailed breakdown including 7-day and 30-day horizons.

### 4. Should TTL be configurable?
**Currently hardcoded at 6 months.** The constant `VERIFICATION_TTL_MS` in `constants.ts` is well-documented with research justification (12% annual provider turnover). Making it configurable via environment variable would be low-effort:
```typescript
export const VERIFICATION_TTL_MS = parseInt(process.env.VERIFICATION_TTL_DAYS || '180') * MS_PER_DAY;
```

**Different TTL per source**: Not currently implemented but would add value. CMS data (government-verified) could have a longer TTL (12 months) while crowdsource data keeps the 6-month TTL. The `dataSource` field on VerificationLog already supports this differentiation.

### 5. Should we notify before expiration?
**Not currently implemented.** The `recommendReVerification` metadata from the confidence scoring service already identifies records approaching staleness (80% of freshness threshold). This could be surfaced in the UI to encourage re-verification before expiration. Email notification would require user authentication (currently absent).

---

## Issues

1. **No Cloud Scheduler**: The cleanup endpoint exists but no automated scheduling is configured. Expired records accumulate until manually cleaned.

2. **Batch deletion is not truly batched**: The `cleanupExpiredVerifications` function uses a while loop but `deleteMany()` deletes all matching records in one call. For large backlogs, this could be a heavy database operation.

3. **Cascade behavior differs from documentation**: The prompt states `SetNull` cascades for Provider/Plan deletes, but the actual schema uses `NoAction`. This means deleting a provider would fail if they have verification logs or plan acceptances (foreign key constraint), rather than setting the FK to null.

4. **Legacy records never expire**: The `notExpiredFilter()` treats `expiresAt: null` as non-expired. Until the backfill script is run, all pre-TTL records remain indefinitely.

5. **No confidence recalculation on TTL refresh**: When `expiresAt` is extended via a new verification, the TTL is refreshed but the confidence score recalculation uses the new verification data. However, the admin `recalculate-confidence` endpoint exists for bulk recalculation with time-based decay.

---

## Recommendations

1. **Configure Cloud Scheduler**: Create the hourly cleanup job targeting `POST /api/v1/admin/cleanup-expired` with the admin secret. Start with `dryRun=true` to verify before enabling actual deletion.

2. **Run the backfill script**: Execute `npx tsx scripts/backfill-verification-ttl.ts` in dry-run mode first, review the output, then run with `--apply`.

3. **Implement true batch deletion**: Replace the current `deleteMany()` loop with `DELETE ... LIMIT $batchSize` using raw SQL, or use Prisma's `findMany` + `deleteMany` with `take` to truly batch the operation.

4. **Add monitoring**: Set up alerts on the `GET /api/v1/admin/expiration-stats` endpoint. Alert when expired records exceed a threshold (e.g., > 1000) indicating the cleanup job may not be running.

5. **Make TTL configurable**: Move from hardcoded constant to environment variable to enable per-environment tuning without code changes.

6. **Add source-based TTL**: Implement different TTL durations based on verification source (CMS: 12 months, carrier: 9 months, crowdsource: 6 months).
