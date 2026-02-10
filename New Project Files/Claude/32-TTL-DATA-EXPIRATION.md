# 32 - TTL and Data Expiration

## Overview

Provider verification data has a limited shelf life. Research indicates approximately 12% annual provider turnover in healthcare networks, making a 6-month verification TTL a reasonable balance between data freshness and verification volume requirements.

## Research Basis

- **12% annual provider turnover** across insurance networks (providers joining, leaving, or changing network participation)
- **6-month TTL** ensures that at worst, a verification is only one turnover cycle behind
- Expired verifications are not deleted immediately; they are marked expired and excluded from active confidence calculations

## Schema

### ProviderPlanAcceptance

```prisma
model ProviderPlanAcceptance {
  // ... other fields
  expiresAt   DateTime?  @map("expires_at")
}
```

### VerificationLog

```prisma
model VerificationLog {
  // ... other fields
  expiresAt   DateTime?  @map("expires_at")
}
```

The `expiresAt` field is nullable to support legacy records that were created before TTL was implemented.

## TTL Calculation

```
expiresAt = created_at + 6 months
```

For verification renewals:

```
expiresAt = verified_at + 6 months
```

The TTL is set at record creation time and updated when a verification is renewed.

## Admin Endpoints

### POST /admin/cleanup-expired

Processes expired records in batches. Supports dry-run mode for previewing what would be cleaned up.

**Parameters:**

| Parameter  | Type    | Default | Description                              |
|------------|---------|---------|------------------------------------------|
| `dryRun`   | boolean | `true`  | If true, report counts without modifying data |
| `batchSize`| number  | 100     | Number of records to process per batch   |

**Response:**

```json
{
  "expiredVerifications": 42,
  "expiredAcceptances": 18,
  "dryRun": true
}
```

### GET /admin/expiration-stats

Returns statistics about upcoming and past expirations.

**Response:**

```json
{
  "totalVerifications": 1250,
  "expiredVerifications": 42,
  "expiringWithin30Days": 87,
  "expiringWithin90Days": 215,
  "missingTTL": 3
}
```

## Automated Cleanup

A Google Cloud Scheduler job triggers the cleanup endpoint on an hourly schedule:

- **Schedule**: `0 * * * *` (every hour at minute 0)
- **Authentication**: `X-Admin-Secret` header with the admin secret from GCP Secret Manager
- **Endpoint**: `POST /admin/cleanup-expired` with `dryRun: false`
- **Batch size**: 100 records per invocation (configurable)

The hourly cadence ensures that expired records are cleaned up promptly without placing excessive load on the database.

## Backfill Script

For records created before TTL was implemented, a backfill script sets the `expiresAt` field retroactively:

**Location**: `scripts/backfill-verification-ttl.ts`

**Logic**:
```
expiresAt = created_at + 6 months
```

The script targets only records where `expiresAt` is null, ensuring it is safe to run multiple times (idempotent).

**Usage**:
```bash
npx ts-node scripts/backfill-verification-ttl.ts
```

## Cascade Behavior

| Relationship                     | On Delete  | Rationale                                    |
|----------------------------------|------------|----------------------------------------------|
| Provider -> VerificationLog      | NoAction   | Preserve audit trail even if provider removed |
| InsurancePlan -> ProviderPlanAcceptance | NoAction | Preserve historical acceptance records  |
| VerificationLog -> VoteLog       | Cascade    | Votes are meaningless without their parent verification |

The `NoAction` cascade on provider and plan deletes ensures that historical verification and acceptance data is never silently lost. If a provider is removed from the NPI registry, their verification history remains for audit purposes.
