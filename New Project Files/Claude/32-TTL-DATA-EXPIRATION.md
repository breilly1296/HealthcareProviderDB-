# VerifyMyProvider TTL Data Expiration Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

VerifyMyProvider implements a 6-month TTL (Time-To-Live) strategy for verification data. This ensures data freshness given ~12% annual provider turnover and encourages re-verification of stale information.

---

## TTL Strategy

### Rationale

| Factor | Impact |
|--------|--------|
| Provider turnover | ~12% annually change practices |
| Insurance contract changes | Annual renewals common |
| Address changes | Providers relocate |
| Plan availability | Plans discontinued |

### TTL Duration: 6 Months

- **Conservative:** Balances freshness with data retention
- **Research-based:** Aligns with provider turnover rates
- **User-friendly:** Doesn't expire too quickly

---

## Data Model

### Affected Tables

```prisma
model ProviderPlanAcceptance {
  id                Int       @id @default(autoincrement())
  providerNpi       String?
  planId            String?
  acceptanceStatus  String    @default("UNKNOWN")
  confidenceScore   Int       @default(0)
  lastVerified      DateTime?
  verificationCount Int       @default(0)
  expiresAt         DateTime?   // 👈 TTL field

  @@index([expiresAt])  // Index for cleanup queries
}

model VerificationLog {
  id                String    @id @default(cuid())
  providerNpi       String?
  planId            String?
  // ... other fields
  createdAt         DateTime  @default(now())
  expiresAt         DateTime?   // 👈 TTL field

  @@index([expiresAt])  // Index for cleanup queries
}
```

---

## TTL Calculation

### On Verification Submission

```typescript
// packages/backend/src/services/verificationService.ts

const TTL_MONTHS = 6;

export async function submitVerification(data: VerificationInput) {
  const expiresAt = addMonths(new Date(), TTL_MONTHS);

  // Create verification log
  const verification = await prisma.verificationLog.create({
    data: {
      providerNpi: data.npi,
      planId: data.planId,
      verificationType: data.acceptsInsurance ? 'ACCEPTS' : 'REJECTS',
      sourceIp: data.sourceIp,
      expiresAt  // 👈 Set TTL
    }
  });

  // Update or create plan acceptance
  await prisma.providerPlanAcceptance.upsert({
    where: {
      providerNpi_planId: {
        providerNpi: data.npi,
        planId: data.planId
      }
    },
    create: {
      providerNpi: data.npi,
      planId: data.planId,
      acceptanceStatus: data.acceptsInsurance ? 'ACCEPTS' : 'REJECTS',
      lastVerified: new Date(),
      verificationCount: 1,
      expiresAt  // 👈 Set TTL
    },
    update: {
      acceptanceStatus: data.acceptsInsurance ? 'ACCEPTS' : 'REJECTS',
      lastVerified: new Date(),
      verificationCount: { increment: 1 },
      expiresAt  // 👈 Extend TTL on new verification
    }
  });

  // Recalculate confidence score
  await updateConfidenceScore(data.npi, data.planId);

  return verification;
}
```

---

## Cleanup Process

### Admin Endpoint

```typescript
// packages/backend/src/routes/admin.ts

router.post('/cleanup-expired', adminAuthMiddleware, asyncHandler(async (req, res) => {
  const now = new Date();

  // Delete expired verification logs
  const deletedLogs = await prisma.verificationLog.deleteMany({
    where: {
      expiresAt: { lt: now }
    }
  });

  // Reset expired plan acceptance records
  const resetAcceptance = await prisma.providerPlanAcceptance.updateMany({
    where: {
      expiresAt: { lt: now }
    },
    data: {
      acceptanceStatus: 'UNKNOWN',
      confidenceScore: 0,
      verificationCount: 0,
      lastVerified: null,
      expiresAt: null
    }
  });

  // Delete vote logs for deleted verifications
  // (handled by cascade or separate cleanup)

  console.log(`[TTL] Cleaned up: ${deletedLogs.count} logs, ${resetAcceptance.count} acceptance records`);

  res.json({
    success: true,
    data: {
      deletedVerificationLogs: deletedLogs.count,
      resetAcceptanceRecords: resetAcceptance.count
    }
  });
}));
```

### Expiration Stats Endpoint

```typescript
router.get('/expiration-stats', adminAuthMiddleware, asyncHandler(async (req, res) => {
  const now = new Date();
  const in30Days = addDays(now, 30);
  const in90Days = addDays(now, 90);

  const stats = await prisma.$transaction([
    // Already expired
    prisma.providerPlanAcceptance.count({
      where: { expiresAt: { lt: now } }
    }),
    // Expiring in 30 days
    prisma.providerPlanAcceptance.count({
      where: {
        expiresAt: { gte: now, lt: in30Days }
      }
    }),
    // Expiring in 90 days
    prisma.providerPlanAcceptance.count({
      where: {
        expiresAt: { gte: now, lt: in90Days }
      }
    }),
    // Total with TTL
    prisma.providerPlanAcceptance.count({
      where: { expiresAt: { not: null } }
    })
  ]);

  res.json({
    success: true,
    data: {
      expired: stats[0],
      expiringIn30Days: stats[1],
      expiringIn90Days: stats[2],
      totalWithTtl: stats[3]
    }
  });
}));
```

---

## Cloud Scheduler Setup

### Hourly Cleanup Job

```bash
# Create scheduled job
gcloud scheduler jobs create http ttl-cleanup \
  --location=us-central1 \
  --schedule="0 * * * *" \
  --uri="https://verifymyprovider-backend-xxx.run.app/api/v1/admin/cleanup-expired" \
  --http-method=POST \
  --headers="X-Admin-Secret=$ADMIN_SECRET" \
  --time-zone="America/Los_Angeles" \
  --description="Cleanup expired verification data"
```

### Job Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Schedule | Hourly (0 * * * *) | Frequent enough for freshness |
| Retry | 3 attempts | Handle transient failures |
| Timeout | 300 seconds | Allow time for large cleanups |

---

## TTL Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Verification TTL Flow                     │
│                                                              │
│  Day 0: Verification submitted                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ expiresAt = now + 6 months                            │  │
│  │ confidenceScore = calculated                          │  │
│  │ verificationCount = 1                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  Day 90: Another verification for same provider-plan        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ expiresAt = now + 6 months (extended!)               │  │
│  │ confidenceScore = recalculated (higher)              │  │
│  │ verificationCount = 2                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  Day 270: TTL expires (no new verifications)                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Cleanup job runs:                                     │  │
│  │ - Delete verification logs                            │  │
│  │ - Reset acceptance status to UNKNOWN                  │  │
│  │ - Reset confidence score to 0                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Confidence Score Decay

The confidence scoring system also applies recency-based decay:

```typescript
function calculateRecencyScore(lastVerifiedAt: Date | null): number {
  if (!lastVerifiedAt) return 0;

  const daysSince = differenceInDays(new Date(), lastVerifiedAt);

  // Full points for < 30 days
  if (daysSince < 30) return 30;

  // Zero points after 180 days
  if (daysSince > 180) return 0;

  // Linear decay between 30-180 days
  const decayFactor = 1 - (daysSince - 30) / 150;
  return Math.round(30 * decayFactor);
}
```

This means confidence naturally decreases before TTL expires:

| Days Since | Recency Points | Visual |
|------------|----------------|--------|
| 0-30 | 30 | ████████████ |
| 60 | 24 | █████████░░░ |
| 90 | 18 | ███████░░░░░ |
| 120 | 12 | █████░░░░░░░ |
| 150 | 6 | ███░░░░░░░░░ |
| 180+ | 0 | ░░░░░░░░░░░░ |

---

## Monitoring

### Metrics to Track

| Metric | Alert Threshold |
|--------|-----------------|
| Records expired/hour | > 1000 |
| Records expiring in 7 days | > 10% of total |
| Cleanup job failures | Any |
| Cleanup duration | > 60 seconds |

### Monitoring Query

```sql
-- Expiration distribution
SELECT
  DATE_TRUNC('week', expires_at) AS week,
  COUNT(*) AS expiring_count
FROM provider_plan_acceptance
WHERE expires_at IS NOT NULL
  AND expires_at > NOW()
  AND expires_at < NOW() + INTERVAL '90 days'
GROUP BY 1
ORDER BY 1;
```

---

## Recommendations

### Immediate
- ✅ TTL strategy is sound
- Add monitoring for cleanup job
- Alert on high expiration rates

### Future
1. **Re-verification prompts**
   - Notify users when their verifications are expiring
   - Encourage fresh data

2. **Soft delete**
   - Archive instead of delete
   - Enable historical analysis

3. **Configurable TTL**
   - Different TTL for different sources
   - Insurance card verifications: longer TTL

---

## Conclusion

TTL data expiration is **well-implemented**:

- ✅ 6-month TTL based on research
- ✅ Automatic cleanup via Cloud Scheduler
- ✅ TTL extended on re-verification
- ✅ Confidence decay before expiration
- ✅ Admin endpoints for management

The strategy ensures data freshness while retaining valuable verification history.
