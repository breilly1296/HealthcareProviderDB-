---
tags:
  - data
  - ttl
  - maintenance
type: prompt
priority: 2
---

# TTL & Data Expiration Strategy

## Files to Review
- `packages/backend/prisma/schema.prisma` (expiresAt fields)
- `packages/backend/src/routes/admin.ts` (cleanup endpoints)
- `packages/backend/src/services/verificationService.ts` (TTL logic)
- `scripts/backfill-verification-ttl.ts` (TTL backfill)
- Cloud Scheduler configuration

## TTL Strategy Overview

Based on research showing 12% annual provider turnover, verification data expires after 6 months to maintain accuracy.

### Research Basis
- 12% of providers change practice yearly
- Average verification useful for ~6 months
- Older data increasingly inaccurate
- Balance between data retention and accuracy

## Database Schema

### ProviderPlanAcceptance
```prisma
model ProviderPlanAcceptance {
  // ... other fields
  lastVerified  DateTime?  @map("last_verified")
  expiresAt     DateTime?  @map("expires_at")
  // TTL: 6 months from last_verified
}
```

### VerificationLog
```prisma
model VerificationLog {
  // ... other fields
  createdAt     DateTime  @default(now())
  expiresAt     DateTime? @map("expires_at")
  // TTL: 6 months from created_at
}
```

## TTL Calculation

```typescript
// When creating/updating verification
const TTL_MONTHS = 6;
const expiresAt = new Date();
expiresAt.setMonth(expiresAt.getMonth() + TTL_MONTHS);

await prisma.verificationLog.create({
  data: {
    // ... other fields
    expiresAt,
  }
});
```

## Cleanup Process

### Admin Endpoints

#### `POST /api/v1/admin/cleanup-expired`
Deletes expired records.

**Headers Required:** `X-Admin-Secret`

**Query Parameters:**
- `dryRun=true` - Preview without deleting
- `batchSize=1000` - Records per batch

**Response:**
```json
{
  "success": true,
  "data": {
    "expiredPlanAcceptances": 150,
    "expiredVerificationLogs": 500,
    "deletedPlanAcceptances": 150,
    "deletedVerificationLogs": 500,
    "message": "Cleanup complete. 650 records deleted."
  }
}
```

#### `GET /api/v1/admin/expiration-stats`
Get statistics about expiring data.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPlanAcceptances": 10000,
    "expiredPlanAcceptances": 150,
    "totalVerificationLogs": 50000,
    "expiredVerificationLogs": 500,
    "expiringNext30Days": {
      "planAcceptances": 200,
      "verificationLogs": 1000
    }
  }
}
```

### Cloud Scheduler

Automated cleanup runs hourly:

```bash
# Cloud Scheduler job configuration
Name: cleanup-expired-verifications
Frequency: 0 * * * *  # Every hour
Target: HTTP
URL: https://backend.../api/v1/admin/cleanup-expired
Method: POST
Headers:
  X-Admin-Secret: ${ADMIN_SECRET}
```

## Cleanup Implementation

```typescript
// packages/backend/src/services/verificationService.ts
export async function cleanupExpiredVerifications(options: {
  dryRun?: boolean;
  batchSize?: number;
}) {
  const { dryRun = false, batchSize = 1000 } = options;
  const now = new Date();

  // Count expired records
  const expiredAcceptances = await prisma.providerPlanAcceptance.count({
    where: { expiresAt: { lte: now } }
  });

  const expiredLogs = await prisma.verificationLog.count({
    where: { expiresAt: { lte: now } }
  });

  if (dryRun) {
    return {
      expiredPlanAcceptances: expiredAcceptances,
      expiredVerificationLogs: expiredLogs,
      deletedPlanAcceptances: 0,
      deletedVerificationLogs: 0,
    };
  }

  // Delete in batches
  const { count: deletedAcceptances } = await prisma.providerPlanAcceptance.deleteMany({
    where: { expiresAt: { lte: now } }
  });

  const { count: deletedLogs } = await prisma.verificationLog.deleteMany({
    where: { expiresAt: { lte: now } }
  });

  return {
    expiredPlanAcceptances: expiredAcceptances,
    expiredVerificationLogs: expiredLogs,
    deletedPlanAcceptances: deletedAcceptances,
    deletedVerificationLogs: deletedLogs,
  };
}
```

## Backfill Script

For existing records without TTL:

```bash
npm run backfill:verification-ttl
```

```typescript
// scripts/backfill-verification-ttl.ts
// Sets expiresAt = created_at + 6 months for records missing TTL
await prisma.$executeRaw`
  UPDATE provider_plan_acceptance
  SET expires_at = last_verified + INTERVAL '6 months'
  WHERE expires_at IS NULL AND last_verified IS NOT NULL
`;

await prisma.$executeRaw`
  UPDATE verification_logs
  SET expires_at = created_at + INTERVAL '6 months'
  WHERE expires_at IS NULL
`;
```

## Cascade Behavior

### On Provider Delete
- `ProviderPlanAcceptance.providerNpi` → `SetNull`
- `VerificationLog.providerNpi` → `SetNull`
- Preserves audit trail even when provider removed

### On Plan Delete
- `ProviderPlanAcceptance.planId` → `SetNull`
- `VerificationLog.planId` → `SetNull`

## Checklist

### Schema
- [x] expiresAt field on ProviderPlanAcceptance
- [x] expiresAt field on VerificationLog
- [x] Index on expiresAt for efficient cleanup
- [x] SetNull cascade (preserve audit trail)

### Admin Endpoints
- [x] POST /admin/cleanup-expired
- [x] GET /admin/expiration-stats
- [x] Dry run mode
- [x] Batch size configuration

### Automation
- [ ] Cloud Scheduler job configured
- [ ] Monitoring on cleanup failures
- [ ] Alerting on large backlogs

### Backfill
- [ ] TTL backfill script run
- [ ] All records have expiresAt

## Questions to Ask

1. **Is Cloud Scheduler configured?**
   - Running hourly?
   - Admin secret mounted?

2. **Has backfill been run?**
   - All records have expiresAt?

3. **What's the current expiration backlog?**
   - Records pending cleanup?

4. **Should TTL be configurable?**
   - 6 months appropriate?
   - Different TTL per source?

5. **Should we notify before expiration?**
   - Email users to re-verify?

## Output Format

```markdown
# TTL & Data Expiration

**Last Updated:** [Date]
**TTL Duration:** 6 months

## Current Status
| Metric | Value |
|--------|-------|
| Total verifications | X |
| Expired (pending cleanup) | X |
| Expiring next 30 days | X |

## Cleanup Schedule
- Frequency: Hourly
- Cloud Scheduler: [Configured/Not Configured]
- Last run: [Date]
- Records cleaned: X

## Backfill Status
- Records with TTL: X%
- Backfill needed: [Yes/No]

## Issues
[List any issues]

## Recommendations
[List recommendations]
```
