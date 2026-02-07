# TTL & Data Expiration

**Last Updated:** 2026-02-07
**TTL Duration:** 6 months (180 days)

---

## Current Status

| Metric | Value |
|--------|-------|
| TTL Duration | 6 months from `last_verified` or `created_at` |
| Research Basis | 12% annual provider turnover (Ndumele et al. 2018) |
| Tables with TTL | `provider_plan_acceptance`, `verification_logs` |
| Cleanup Schedule | Hourly via Cloud Scheduler |
| Backfill Script | Available (`scripts/backfill-verification-ttl.ts`) |
| Admin Endpoints | `POST /cleanup-expired`, `GET /expiration-stats`, `GET /retention/stats` |
| Confidence Decay | Daily recalculation at 4 AM ET |

---

## 1. Research Basis

The 6-month TTL is grounded in academic research on healthcare provider network accuracy:

- **12% annual provider turnover**: Research by Ndumele et al. (2018, *Health Affairs*) shows that roughly 12% of healthcare providers change their practice or network participation each year.
- **Average verification useful for ~6 months**: At a 12% annual churn rate, data older than 6 months becomes increasingly unreliable.
- **Specialty-specific decay**: Mental health providers show even higher turnover (only 43% accept Medicaid), while hospital-based providers are more stable.
- **3-verification threshold**: Mortensen et al. (2015, *JAMIA*) found that 3 crowdsourced verifications achieve expert-level accuracy (kappa = 0.58).

The TTL strategy balances data retention with accuracy -- keeping stale verification data provides a false sense of reliability that could mislead patients.

---

## 2. Database Schema

### 2.1 ProviderPlanAcceptance

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\prisma\schema.prisma` (lines 181-206)

```prisma
model ProviderPlanAcceptance {
  id                 Int                @id @default(autoincrement())
  providerNpi        String?            @map("npi") @db.VarChar(10)
  planId             String?            @map("plan_id") @db.VarChar(50)
  locationId         Int?               @map("location_id")
  acceptanceStatus   String             @default("UNKNOWN") @map("acceptance_status") @db.VarChar(20)
  confidenceScore    Int                @default(0) @map("confidence_score")
  lastVerified       DateTime?          @map("last_verified") @db.Timestamptz(6)
  verificationCount  Int                @default(0) @map("verification_count")
  createdAt          DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime           @default(now()) @map("updated_at") @db.Timestamptz(6)
  expiresAt          DateTime?          @map("expires_at") @db.Timestamptz(6)
  // ... relations omitted

  @@index([expiresAt], map: "idx_ppa_expires_at")
  @@map("provider_plan_acceptance")
}
```

Key points:
- `expiresAt` is nullable (`DateTime?`) for backwards compatibility with legacy records.
- A dedicated index `idx_ppa_expires_at` enables efficient cleanup queries.
- TTL is set to `last_verified + 6 months`. If `last_verified` is null, falls back to `created_at + 6 months`.
- The `lastVerified` timestamp is updated on each new verification submission.

### 2.2 VerificationLog

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\prisma\schema.prisma` (lines 208-243)

```prisma
model VerificationLog {
  id                 String             @id @default(cuid())
  providerNpi        String?            @map("provider_npi") @db.VarChar(10)
  planId             String?            @map("plan_id") @db.VarChar(50)
  // ... other fields
  createdAt          DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  expiresAt          DateTime?          @map("expires_at") @db.Timestamptz(6)
  // ... relations omitted

  @@index([expiresAt], map: "idx_vl_expires_at")
  @@map("verification_logs")
}
```

Key points:
- Uses CUID for primary key (`@default(cuid())`).
- TTL is always `created_at + 6 months`.
- Dedicated index `idx_vl_expires_at` for efficient cleanup.
- Related `VoteLog` records cascade on delete (`onDelete: Cascade` on the `VoteLog` model).

### 2.3 Additional Tables with Retention

| Table | Retention Policy | Mechanism |
|-------|-----------------|-----------|
| `provider_plan_acceptance` | 6 months (TTL via `expires_at`) | Hourly cleanup |
| `verification_logs` | 6 months (TTL via `expires_at`) | Hourly cleanup |
| `vote_logs` | Follows parent verification TTL | Cascade delete |
| `sync_logs` | 90 days | Daily cleanup at 3 AM ET |

---

## 3. TTL Constant Definition

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\config\constants.ts` (lines 14-19)

```typescript
/**
 * Verification TTL (6 months)
 * Based on 12% annual provider turnover research - verifications older than
 * 6 months are considered stale and need re-verification.
 */
export const VERIFICATION_TTL_MS = 6 * 30 * MS_PER_DAY;
```

This constant calculates the TTL as `6 * 30 * 86,400,000 ms = 15,552,000,000 ms` (approximately 180 days). It is imported by the verification service for all TTL calculations.

---

## 4. TTL Calculation in Application Code

### 4.1 Expiration Date Function

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\verificationService.ts` (lines 18-20)

```typescript
export function getExpirationDate(): Date {
  return new Date(Date.now() + VERIFICATION_TTL_MS);
}
```

This is the single source of truth for computing expiration dates at the application level.

### 4.2 Setting TTL on New Verifications

When a new verification is submitted via `submitVerification()`, TTL is set on both the `VerificationLog` and the `ProviderPlanAcceptance` records.

**VerificationLog creation** (lines 375-399):

```typescript
const verification = await prisma.verificationLog.create({
  data: {
    providerNpi,
    planId: validPlanId,
    // ... other fields
    expiresAt: getExpirationDate(),
  },
});
```

**ProviderPlanAcceptance upsert** (lines 222-253):

For existing acceptance records:
```typescript
return prisma.providerPlanAcceptance.update({
  where: { id: existingAcceptance.id },
  data: {
    acceptanceStatus: finalStatus,
    lastVerified: new Date(),
    verificationCount,
    confidenceScore: score,
    expiresAt: getExpirationDate(),  // Refreshes TTL on re-verification
  },
});
```

For new acceptance records:
```typescript
const acceptance = await prisma.providerPlanAcceptance.create({
  data: {
    providerNpi,
    planId,
    locationId: locationId ?? null,
    acceptanceStatus: 'PENDING',
    lastVerified: new Date(),
    verificationCount: 1,
    confidenceScore: score,
    expiresAt: getExpirationDate(),  // 6 months from now
  },
});
```

**Important behavior:** When a provider-plan pair is re-verified, the `expiresAt` on the acceptance record is refreshed to 6 months from the current date. This means active verification keeps data alive indefinitely.

### 4.3 Filtering Expired Records from Queries

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\verificationService.ts` (lines 26-33)

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

This filter is applied in the following query functions to exclude expired data at read time:

| Function | Location | Applied |
|----------|----------|---------|
| `countVerificationConsensus()` | verificationService.ts:121 | Yes |
| `getRecentVerifications()` | verificationService.ts:592 | Yes (default, opt-out via `includeExpired`) |
| `getVerificationsForPair()` | verificationService.ts:672 | Yes (default, opt-out via `includeExpired`) |

**Legacy compatibility:** Records with `expiresAt: null` (created before TTL was implemented) are included in queries. This prevents data loss from the backfill transition period.

### 4.4 Acceptance Expiration Check

The `getVerificationsForPair()` function also checks and reports whether the acceptance record itself is expired (lines 738-740):

```typescript
const isAcceptanceExpired = acceptance?.expiresAt
  ? new Date(acceptance.expiresAt) < new Date()
  : false;
```

This `isAcceptanceExpired` flag is returned in the API response, allowing the frontend to display a warning to users.

### 4.5 Confidence Decay Integration

The confidence decay service (`confidenceDecayService.ts`) only considers non-expired verification logs when recalculating scores:

```typescript
const voteAgg = await prisma.verificationLog.aggregate({
  where: {
    providerNpi: record.providerNpi,
    planId: record.planId,
    expiresAt: { gt: new Date() }, // Only non-expired verifications
  },
  _sum: {
    upvotes: true,
    downvotes: true,
  },
});
```

This ensures that expired verifications do not contribute to confidence score calculations even before they are physically deleted by the cleanup process.

---

## 5. Cleanup Process

### 5.1 Admin Endpoints

All admin endpoints are protected by `X-Admin-Secret` header authentication using timing-safe comparison.

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\admin.ts`

#### `POST /api/v1/admin/cleanup-expired`

Deletes expired verification records. Designed to be called by Cloud Scheduler hourly.

**Authentication:** `X-Admin-Secret` header (timing-safe comparison)
**Timeout:** 120 seconds (`adminTimeout` middleware)

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | `string` | `'false'` | If `'true'`, returns counts without deleting |
| `batchSize` | `number` | `1000` | Records to process per batch |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "expiredPlanAcceptances": 150,
    "expiredVerificationLogs": 500,
    "deletedPlanAcceptances": 150,
    "deletedVerificationLogs": 500,
    "message": "Cleanup complete. 650 records deleted."
  }
}
```

#### `GET /api/v1/admin/expiration-stats`

Returns detailed expiration statistics with TTL coverage metrics.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "verificationLogs": {
      "total": 50000,
      "withTTL": 49500,
      "expired": 500,
      "expiringWithin7Days": 200,
      "expiringWithin30Days": 1000
    },
    "planAcceptances": {
      "total": 10000,
      "withTTL": 9800,
      "expired": 150,
      "expiringWithin7Days": 50,
      "expiringWithin30Days": 200
    }
  }
}
```

#### `GET /api/v1/admin/retention/stats`

Comprehensive retention statistics across all log types.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-02-07T00:00:00.000Z",
    "verificationLogs": {
      "total": 50000,
      "expiringIn7Days": 200,
      "expiringIn30Days": 1000,
      "oldestRecord": "2025-07-01T00:00:00.000Z",
      "newestRecord": "2026-02-07T00:00:00.000Z",
      "retentionPolicy": "6 months (TTL via expiresAt)"
    },
    "syncLogs": {
      "total": 500,
      "olderThan90Days": 50,
      "oldestRecord": "2025-10-01T00:00:00.000Z",
      "newestRecord": "2026-02-07T00:00:00.000Z",
      "retentionPolicy": "90 days (manual cleanup)"
    },
    "planAcceptances": {
      "total": 10000,
      "expiringIn7Days": 50,
      "expiringIn30Days": 200,
      "retentionPolicy": "6 months (TTL via expiresAt)"
    },
    "voteLogs": {
      "total": 5000,
      "retentionPolicy": "Follows plan acceptance TTL"
    }
  }
}
```

#### `POST /api/v1/admin/cleanup/sync-logs`

Cleans up `sync_logs` older than the retention period (default 90 days).

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | `string` | `'false'` | If `'true'`, returns counts without deleting |
| `retentionDays` | `number` | `90` | Days of logs to retain |

#### `GET /api/v1/admin/health`

Health check endpoint that includes retention metrics for monitoring:
- Verification logs expiring in 7 days
- Oldest verification log
- Total sync logs and vote logs

### 5.2 Cleanup Implementation

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\verificationService.ts` (lines 767-854)

```typescript
export async function cleanupExpiredVerifications(options: {
  dryRun?: boolean;
  batchSize?: number;
} = {}): Promise<{
  dryRun: boolean;
  expiredVerificationLogs: number;
  expiredPlanAcceptances: number;
  deletedVerificationLogs: number;
  deletedPlanAcceptances: number;
}> {
  const { dryRun = false, batchSize = 1000 } = options;
  const now = new Date();

  // Count expired records
  const [expiredLogsCount, expiredAcceptanceCount] = await Promise.all([
    prisma.verificationLog.count({
      where: { expiresAt: { lt: now, not: null } },
    }),
    prisma.providerPlanAcceptance.count({
      where: { expiresAt: { lt: now, not: null } },
    }),
  ]);

  if (dryRun) {
    return { dryRun, expiredVerificationLogs: expiredLogsCount, ... };
  }

  // Delete expired verification logs in batches
  let deletedLogs = 0;
  while (deletedLogs < expiredLogsCount) {
    const deleteResult = await prisma.verificationLog.deleteMany({
      where: { expiresAt: { lt: now, not: null } },
    });
    if (deleteResult.count === 0) break;
    deletedLogs += deleteResult.count;
    if (deleteResult.count < batchSize) break;  // Safety check
  }

  // Delete expired plan acceptances in batches
  let deletedAcceptances = 0;
  while (deletedAcceptances < expiredAcceptanceCount) {
    const deleteResult = await prisma.providerPlanAcceptance.deleteMany({
      where: { expiresAt: { lt: now, not: null } },
    });
    if (deleteResult.count === 0) break;
    deletedAcceptances += deleteResult.count;
    if (deleteResult.count < batchSize) break;  // Safety check
  }

  return { ... };
}
```

**Design decisions:**
- Records with `expiresAt: null` are never deleted (legacy compatibility).
- Deletion happens in batches with safety breaks to prevent infinite loops.
- Both tables are cleaned in a single invocation.
- `VoteLog` records cascade-delete automatically when their parent `VerificationLog` is deleted.
- Expired counts are computed before deletion begins, providing accurate "before" metrics.

---

## 6. Cascade Behavior

### 6.1 On Verification Log Deletion (TTL cleanup)

| Child Table | Relationship | On Delete |
|-------------|-------------|-----------|
| `vote_logs` | `verificationId` -> `VerificationLog.id` | **Cascade** (automatic) |

When a `VerificationLog` record is deleted by the TTL cleanup, all associated `VoteLog` records are automatically cascade-deleted. This is defined in the Prisma schema:

```prisma
model VoteLog {
  verification  VerificationLog  @relation(fields: [verificationId], references: [id], onDelete: Cascade)
}
```

### 6.2 On Provider Deletion

| Child Table | Relationship | On Delete |
|-------------|-------------|-----------|
| `ProviderPlanAcceptance.providerNpi` | -> `Provider.npi` | **SetNull** (implicit) |
| `VerificationLog.providerNpi` | -> `Provider.npi` | **SetNull** (implicit) |

The `providerNpi` fields are nullable (`String?`), and relations use `onUpdate: NoAction` without explicit `onDelete`, meaning the default PostgreSQL behavior applies. This preserves the audit trail even when a provider is removed from the system.

### 6.3 On Plan Deletion

| Child Table | Relationship | On Delete |
|-------------|-------------|-----------|
| `ProviderPlanAcceptance.planId` | -> `InsurancePlan.planId` | **SetNull** (implicit) |
| `VerificationLog.planId` | -> `InsurancePlan.planId` | **SetNull** (implicit) |

Similarly, plan references are nullable, preserving verification history even if an insurance plan is removed.

---

## 7. Cloud Scheduler Configuration

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\setup-cloud-scheduler.sh`

The setup script configures three Cloud Scheduler jobs:

### Job 1: Expired Verifications Cleanup (Hourly)

```
Name:        cleanup-expired-verifications
Schedule:    0 * * * * (every hour, UTC)
Target:      POST ${BACKEND_URL}/api/v1/admin/cleanup-expired
Headers:     X-Admin-Secret: ${ADMIN_SECRET}, Content-Type: application/json
Timeout:     300s (5 minutes)
Description: Hourly cleanup of expired verification records and plan acceptances
```

### Job 2: Sync Logs Cleanup (Daily)

```
Name:        cleanup-sync-logs
Schedule:    0 3 * * * (daily at 3 AM Eastern)
Target:      POST ${BACKEND_URL}/api/v1/admin/cleanup/sync-logs
Headers:     X-Admin-Secret: ${ADMIN_SECRET}, Content-Type: application/json
Timeout:     300s
Description: Daily cleanup of sync_logs older than 90-day retention period
```

### Job 3: Confidence Score Recalculation (Daily)

```
Name:        recalculate-confidence-scores
Schedule:    0 4 * * * (daily at 4 AM Eastern)
Target:      POST ${BACKEND_URL}/api/v1/admin/recalculate-confidence
Headers:     X-Admin-Secret: ${ADMIN_SECRET}, Content-Type: application/json
Timeout:     300s
Description: Daily confidence score recalculation with time-based decay
```

### Setup Prerequisites

1. **gcloud CLI** authenticated with `roles/cloudscheduler.admin` and `roles/secretmanager.secretAccessor`.
2. **App Engine application** in the project (required by Cloud Scheduler, even if unused).
3. **ADMIN_SECRET** stored in Google Cloud Secret Manager.

### Setup Command

```bash
chmod +x scripts/setup-cloud-scheduler.sh
./scripts/setup-cloud-scheduler.sh
```

The script is idempotent -- it creates new jobs or updates existing ones, and is safe to re-run.

### Useful Management Commands

```bash
# List all scheduler jobs
gcloud scheduler jobs list --location=us-central1 --project=verifymyprovider-prod

# Manually trigger a job
gcloud scheduler jobs run cleanup-expired-verifications --location=us-central1 --project=verifymyprovider-prod

# View job details and last execution
gcloud scheduler jobs describe cleanup-expired-verifications --location=us-central1 --project=verifymyprovider-prod

# Pause / resume a job
gcloud scheduler jobs pause cleanup-expired-verifications --location=us-central1 --project=verifymyprovider-prod
gcloud scheduler jobs resume cleanup-expired-verifications --location=us-central1 --project=verifymyprovider-prod

# View recent execution logs
gcloud logging read 'resource.type="cloud_scheduler_job"' \
  --project=verifymyprovider-prod --limit=20 --format=json
```

---

## 8. Backfill Script

For records created before the TTL system was implemented, the backfill script sets `expires_at` on all existing records.

### 8.1 TypeScript Script

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\backfill-verification-ttl.ts`

**Usage:**
```bash
# Dry run (preview only, no changes)
npx tsx scripts/backfill-verification-ttl.ts

# Apply changes
npx tsx scripts/backfill-verification-ttl.ts --apply
```

**Logic:**

1. **provider_plan_acceptance**: Sets `expires_at = last_verified + 6 months`. For records without `last_verified`, uses `created_at + 6 months`.
2. **verification_logs**: Sets `expires_at = created_at + 6 months`.

The script:
- Uses a raw `pg.Pool` connection (not Prisma) for efficient bulk updates.
- Wraps all updates in a single transaction for atomicity.
- Reports before/after statistics including:
  - Total records, records with/without TTL
  - Expiry breakdown (already expired, expiring < 1 month, 1-3 months, > 3 months)
- Only updates records where `expires_at IS NULL` (safe to re-run).

### 8.2 SQL Script

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\backfill-verification-ttl.sql`

A standalone SQL version for direct execution via `psql`:

```bash
psql $DATABASE_URL -f scripts/backfill-verification-ttl.sql
```

Contains the same logic wrapped in a `BEGIN`/`COMMIT` transaction with inline verification queries.

### 8.3 Backfill SQL Details

```sql
-- Records with last_verified
UPDATE provider_plan_acceptance
SET expires_at = last_verified + INTERVAL '6 months'
WHERE last_verified IS NOT NULL AND expires_at IS NULL;

-- Records without last_verified (fallback)
UPDATE provider_plan_acceptance
SET expires_at = created_at + INTERVAL '6 months'
WHERE last_verified IS NULL AND expires_at IS NULL;

-- Verification logs
UPDATE verification_logs
SET expires_at = created_at + INTERVAL '6 months'
WHERE expires_at IS NULL;
```

---

## 9. Related Data Cleanup Scripts

### 9.1 Deactivated Provider Cleanup

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\cleanup-deactivated-providers.ts`

A separate cleanup mechanism that hard-deletes deactivated NPI providers and their related records (verification logs, plan acceptances). This is not TTL-based but complements the TTL system by removing providers who are no longer practicing.

```bash
npx tsx scripts/cleanup-deactivated-providers.ts          # Dry run
npx tsx scripts/cleanup-deactivated-providers.ts --apply   # Apply
```

### 9.2 Confidence Decay Recalculation

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\recalculate-confidence.ts`

A standalone CLI script that applies time-based confidence decay proactively (same logic as the Cloud Scheduler endpoint):

```bash
npx tsx scripts/recalculate-confidence.ts --dry-run           # Preview
npx tsx scripts/recalculate-confidence.ts --dry-run --limit 50 # Preview first 50
npx tsx scripts/recalculate-confidence.ts --apply              # Apply
```

Also available as a shell script wrapper:
```bash
./scripts/run-confidence-decay.sh
```

---

## 10. Data Flow Diagram

```
                          User submits verification
                                    |
                                    v
                       +---------------------------+
                       | submitVerification()      |
                       | Sets expiresAt on:        |
                       |  - VerificationLog        |
                       |  - ProviderPlanAcceptance  |
                       +---------------------------+
                                    |
                     +--------------+--------------+
                     |                             |
                     v                             v
          +-------------------+         +-------------------+
          | verification_logs |         | provider_plan_    |
          | expires_at = now  |         | acceptance        |
          | + 6 months        |         | expires_at = now  |
          +-------------------+         | + 6 months        |
                     |                  +-------------------+
                     |                             |
                     +------------ + -------------+
                                   |
               Read path:          |          Cleanup path:
               notExpiredFilter()  |          cleanupExpiredVerifications()
               filters out         |          Hourly via Cloud Scheduler
               expired records     |          POST /admin/cleanup-expired
                                   |
                                   v
                        +-------------------+
                        | Confidence Decay  |
                        | Daily at 4 AM ET  |
                        | Only considers    |
                        | non-expired logs  |
                        +-------------------+
```

---

## 11. Expiration Lifecycle

### Phase 1: Record Creation
- New verification submitted -> `expiresAt = now + 6 months`
- Both `VerificationLog` and `ProviderPlanAcceptance` get TTL

### Phase 2: Re-verification (TTL Refresh)
- Existing provider-plan pair re-verified -> `expiresAt` refreshed to `now + 6 months`
- Active verification keeps records alive indefinitely

### Phase 3: Read-time Filtering
- API queries use `notExpiredFilter()` to exclude expired records
- Legacy records (`expiresAt: null`) are included for backwards compatibility
- `isAcceptanceExpired` flag returned for frontend display

### Phase 4: Confidence Decay
- Daily recalculation only aggregates votes from non-expired verification logs
- Expired verifications no longer contribute to confidence scores
- Scores naturally decrease as supporting verifications expire

### Phase 5: Physical Deletion
- Hourly Cloud Scheduler job calls `POST /admin/cleanup-expired`
- Batch deletion of records where `expiresAt < now` and `expiresAt IS NOT NULL`
- `VoteLog` records cascade-delete with their parent `VerificationLog`

---

## 12. Security Considerations

### Admin Endpoint Protection

```typescript
function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;

  // If not configured, return 503 (not 401) - allows deployment without secret
  if (!adminSecret) {
    return res.status(503).json({ ... });
  }

  // Timing-safe comparison prevents secret extraction via timing attacks
  const providedBuffer = Buffer.from(String(providedSecret || ''));
  const secretBuffer = Buffer.from(adminSecret);
  const isValid =
    providedBuffer.length === secretBuffer.length &&
    timingSafeEqual(providedBuffer, secretBuffer);

  if (!isValid) {
    throw AppError.unauthorized('Invalid or missing admin secret');
  }
}
```

- Uses `crypto.timingSafeEqual` to prevent timing-based secret extraction.
- Returns 503 if `ADMIN_SECRET` is not configured (graceful degradation).
- Returns 401 for invalid/missing secrets.
- 120-second timeout on cleanup operations prevents resource exhaustion.

### Cloud Scheduler Secret Management

The `ADMIN_SECRET` is stored in Google Cloud Secret Manager and passed to Cloud Scheduler jobs via HTTP headers. The setup script reads it at configuration time:

```bash
ADMIN_SECRET=$(gcloud secrets versions access latest \
  --secret=ADMIN_SECRET \
  --project="$PROJECT_ID")
```

---

## 13. Implementation Checklist

### Schema
- [x] `expiresAt` field on `ProviderPlanAcceptance`
- [x] `expiresAt` field on `VerificationLog`
- [x] Index on `expiresAt` for efficient cleanup (`idx_ppa_expires_at`, `idx_vl_expires_at`)
- [x] Cascade delete on `VoteLog` when parent `VerificationLog` is deleted
- [x] Nullable `expiresAt` for legacy record compatibility

### Application Logic
- [x] `VERIFICATION_TTL_MS` constant (6 months in milliseconds)
- [x] `getExpirationDate()` helper function
- [x] TTL set on new `VerificationLog` creation
- [x] TTL set on new `ProviderPlanAcceptance` creation
- [x] TTL refreshed on re-verification (acceptance update)
- [x] `notExpiredFilter()` applied to read queries
- [x] `includeExpired` opt-in parameter for query functions
- [x] `isAcceptanceExpired` flag in API responses
- [x] Confidence decay only considers non-expired verifications

### Admin Endpoints
- [x] `POST /api/v1/admin/cleanup-expired`
- [x] `GET /api/v1/admin/expiration-stats`
- [x] `GET /api/v1/admin/retention/stats`
- [x] `GET /api/v1/admin/health` (includes retention metrics)
- [x] `POST /api/v1/admin/cleanup/sync-logs` (90-day retention)
- [x] `POST /api/v1/admin/recalculate-confidence`
- [x] Dry run mode on all cleanup endpoints
- [x] Batch size configuration
- [x] Timing-safe authentication
- [x] 120-second admin timeout

### Automation
- [x] Cloud Scheduler setup script (`scripts/setup-cloud-scheduler.sh`)
- [x] Hourly cleanup job configured
- [x] Daily sync log cleanup job configured
- [x] Daily confidence recalculation job configured
- [x] Setup script is idempotent (safe to re-run)
- [ ] Monitoring/alerting on cleanup failures
- [ ] Alerting on large expiration backlogs

### Backfill
- [x] TypeScript backfill script (`scripts/backfill-verification-ttl.ts`)
- [x] SQL backfill script (`scripts/backfill-verification-ttl.sql`)
- [x] Dry run mode
- [x] Transaction-wrapped updates
- [x] Before/after statistics reporting
- [x] Expiry breakdown analysis

---

## 14. Open Questions & Recommendations

### Questions

1. **Has Cloud Scheduler been deployed?** The setup script exists but deployment status is unknown. Run the setup script or verify via:
   ```bash
   gcloud scheduler jobs list --location=us-central1 --project=verifymyprovider-prod
   ```

2. **Has the backfill been run?** Check TTL coverage via the admin endpoint:
   ```bash
   curl -H "X-Admin-Secret: $SECRET" \
     https://backend.../api/v1/admin/expiration-stats
   ```
   If `withTTL < total` for either table, the backfill needs to be run.

3. **What is the current expiration backlog?** The `/admin/retention/stats` endpoint will show records pending cleanup.

4. **Should TTL be configurable per-source?** Currently all records use a flat 6-month TTL. CMS-sourced data may warrant a longer TTL (e.g., 12 months) since official data changes less frequently than crowdsourced data.

5. **Should users be notified before expiration?** Implementing email notifications 30 days before expiration could encourage re-verification and keep data fresh.

### Recommendations

1. **Deploy Cloud Scheduler if not already done.** Without it, expired records accumulate indefinitely, wasting storage and potentially confusing read-time filtering.

2. **Run the backfill script.** Legacy records without `expiresAt` will never be cleaned up and bypass the `notExpiredFilter()` (they are included as legacy data).

3. **Add monitoring.** Set up alerts when:
   - The cleanup job fails (Cloud Scheduler execution status != SUCCESS)
   - The expiration backlog exceeds a threshold (e.g., > 10,000 records)
   - TTL coverage drops below 100% (new records without `expiresAt`)

4. **Consider differential TTL by source.** Official CMS/NPPES data could use a 12-month TTL, while crowdsourced data keeps the 6-month TTL. This would require changes to `getExpirationDate()` to accept a `verificationSource` parameter.

5. **Add a TTL refresh endpoint.** Allow users to "re-verify" without submitting new data, simply confirming existing data is still accurate. This would reset the TTL without requiring a full verification submission.

6. **Implement soft-delete before hard-delete.** Consider marking records as "expired" with a status change before physically deleting them after an additional grace period (e.g., 30 days). This provides a recovery window.

---

## 15. File Reference

| File | Description |
|------|-------------|
| `packages/backend/prisma/schema.prisma` | Database schema with `expiresAt` fields and indexes |
| `packages/backend/src/config/constants.ts` | `VERIFICATION_TTL_MS` constant definition |
| `packages/backend/src/services/verificationService.ts` | TTL logic, cleanup, expiration stats, read-time filtering |
| `packages/backend/src/services/confidenceDecayService.ts` | Confidence recalculation (filters expired records) |
| `packages/backend/src/services/confidenceService.ts` | Confidence scoring with specialty-based freshness thresholds |
| `packages/backend/src/routes/admin.ts` | Admin endpoints for cleanup and monitoring |
| `packages/backend/src/routes/verify.ts` | Verification submission route (sets TTL) |
| `packages/backend/src/routes/providers.ts` | Provider detail route (exposes `expiresAt` in API) |
| `packages/backend/src/middleware/requestTimeout.ts` | 120-second admin timeout middleware |
| `scripts/backfill-verification-ttl.ts` | TypeScript backfill script |
| `scripts/backfill-verification-ttl.sql` | SQL backfill script |
| `scripts/setup-cloud-scheduler.sh` | Cloud Scheduler setup (3 jobs) |
| `scripts/cleanup-deactivated-providers.ts` | Related: deactivated provider cleanup |
| `scripts/recalculate-confidence.ts` | CLI confidence recalculation script |
| `scripts/run-confidence-decay.sh` | Shell wrapper for confidence recalculation |
