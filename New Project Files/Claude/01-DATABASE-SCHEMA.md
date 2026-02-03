# VerifyMyProvider Database Schema Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

The database schema is well-designed for the VerifyMyProvider use case with proper indexing, relationship management, and TTL-based data expiration. No PHI is stored, eliminating HIPAA concerns.

---

## Schema Overview

### Core Tables

| Table | Records | Purpose |
|-------|---------|---------|
| `providers` | ~2.1M | NPI registry data |
| `locations` | TBD | Physical locations (hospitals, clinics) |
| `insurance_plans` | TBD | Plan metadata |
| `provider_plan_acceptance` | TBD | Acceptance status + confidence |
| `verification_logs` | TBD | Audit trail for verifications |
| `vote_logs` | TBD | Vote deduplication |
| `sync_logs` | TBD | Import tracking |

---

## Provider Table

```prisma
model Provider {
  npi                   String    @id @db.VarChar(10)
  id                    Int?      @unique @default(autoincrement())
  entityType            String    @db.VarChar(20)
  firstName             String?   @db.VarChar(100)
  lastName              String?   @db.VarChar(100)
  credential            String?   @db.VarChar(50)
  organizationName      String?   @db.VarChar(200)
  specialty             String?   @db.VarChar(200)
  specialtyCode         String?   @db.VarChar(20)
  addressLine1          String    @db.VarChar(200)
  addressLine2          String?   @db.VarChar(200)
  city                  String    @db.VarChar(100)
  state                 String    @db.VarChar(2)
  zipCode               String    @db.VarChar(10)
  phone                 String?   @db.VarChar(20)
  locationId            Int?

  @@index([state])
  @@index([specialtyCode])
  @@index([lastName])
  @@index([firstName])
  @@index([city])
  @@index([organizationName])
  @@index([state, specialtyCode])
  @@index([locationId])
}
```

**Analysis:**
- ✅ NPI as primary key (correct - unique national identifier)
- ✅ Comprehensive indexes for common query patterns
- ✅ Composite index for state+specialty (most common search)
- ✅ Location relationship for grouping

---

## Location Table (NEW Jan 2026)

```prisma
model Location {
  id            Int       @id @default(autoincrement())
  addressLine1  String    @db.VarChar(200)
  addressLine2  String?   @db.VarChar(200)
  city          String    @db.VarChar(100)
  state         String    @db.VarChar(2)
  zipCode       String    @db.VarChar(10)
  name          String?   @db.VarChar(200)
  healthSystem  String?   @db.VarChar(100)
  facilityType  String?   @db.VarChar(100)
  providerCount Int?      @default(0)

  @@unique([addressLine1, city, state, zipCode])
  @@index([state])
  @@index([city, state])
  @@index([zipCode])
}
```

**Analysis:**
- ✅ Unique constraint prevents duplicate locations
- ✅ Denormalized providerCount for performance
- ✅ Proper indexes for geographic searches

---

## ProviderPlanAcceptance Table

```prisma
model ProviderPlanAcceptance {
  id                    Int      @id @default(autoincrement())
  providerNpi           String?  @db.VarChar(10)
  planId                String?  @db.VarChar(50)
  acceptanceStatus      String   @default("UNKNOWN")
  confidenceScore       Int      @default(0)
  lastVerified          DateTime?
  verificationCount     Int      @default(0)
  expiresAt             DateTime?  // TTL: 6 months

  @@unique([providerNpi, planId])
  @@index([acceptanceStatus])
  @@index([confidenceScore])
  @@index([lastVerified])
  @@index([expiresAt])
}
```

**Analysis:**
- ✅ Unique constraint on provider-plan pair
- ✅ SetNull cascade preserves audit trail
- ✅ TTL field for automatic expiration
- ✅ Confidence scoring integrated

---

## VerificationLog Table

```prisma
model VerificationLog {
  id                    String   @id @default(cuid())
  providerNpi           String?
  planId                String?
  verificationType      VerificationType
  verificationSource    VerificationSource
  sourceIp              String?  @db.VarChar(50)
  upvotes               Int      @default(0)
  downvotes             Int      @default(0)
  expiresAt             DateTime?  // TTL: 6 months

  @@index([providerNpi])
  @@index([planId])
  @@index([createdAt])
  @@index([expiresAt])
  @@index([providerNpi, planId, sourceIp, createdAt])  // Sybil prevention
  @@index([providerNpi, planId, submittedBy, createdAt])  // Sybil prevention
}
```

**Analysis:**
- ✅ Sybil attack prevention indexes
- ✅ TTL for automatic cleanup
- ✅ Upvote/downvote tracking

---

## VoteLog Table (NEW Jan 2026)

```prisma
model VoteLog {
  id             String   @id @default(cuid())
  verificationId String
  sourceIp       String   @db.VarChar(50)
  vote           String   // 'up' or 'down'

  @@unique([verificationId, sourceIp])  // One vote per IP
  @@index([verificationId])
  @@index([sourceIp])
}
```

**Analysis:**
- ✅ Unique constraint prevents duplicate votes
- ✅ Allows vote changes (update existing)
- ✅ Cascade delete when verification removed

---

## Index Analysis

### Existing Indexes: ✅ Complete

| Table | Index | Purpose | Status |
|-------|-------|---------|--------|
| providers | state | State filtering | ✅ |
| providers | specialtyCode | Specialty search | ✅ |
| providers | lastName | Name search | ✅ |
| providers | firstName | Name search | ✅ |
| providers | city | Location filtering | ✅ |
| providers | organizationName | Org search | ✅ |
| providers | state, specialtyCode | Combined search | ✅ |
| providers | locationId | Location lookup | ✅ |
| provider_plan_acceptance | providerNpi, planId | Unique lookup | ✅ |
| provider_plan_acceptance | acceptanceStatus | Status filter | ✅ |
| provider_plan_acceptance | confidenceScore | Quality filter | ✅ |
| provider_plan_acceptance | expiresAt | TTL cleanup | ✅ |
| verification_logs | providerNpi, planId, sourceIp, createdAt | Sybil prevention | ✅ |
| vote_logs | verificationId, sourceIp | Deduplication | ✅ |

### Missing Indexes: None identified

---

## Security Assessment

### Data Classification
- ✅ **No PHI stored** - All data is public (NPI registry, plan info)
- ✅ **No PII in responses** - IP addresses used only for rate limiting
- ✅ **Anonymous verifications** - No user accounts required

### Row-Level Security
- ✅ **Not required** - No user-owned data, all public

### Cascade Behavior
- ✅ **SetNull on delete** - Preserves audit trail when provider/plan removed

---

## TTL Strategy

### Implementation
- **Duration:** 6 months from last verification
- **Basis:** 12% annual provider turnover research
- **Cleanup:** Cloud Scheduler calls admin endpoint hourly

### Affected Tables
| Table | TTL Field | Cleanup |
|-------|-----------|---------|
| provider_plan_acceptance | expiresAt | Hourly |
| verification_logs | expiresAt | Hourly |

---

## Recommendations

### Immediate
- None - schema is well-designed

### Future Considerations
1. **Query performance monitoring** - Add slow query logging
2. **Partition large tables** - Consider partitioning providers by state if performance degrades
3. **Archive old data** - Move expired records to archive table instead of deleting

---

## Checklist Status

- [x] All tables have appropriate indexes
- [x] Foreign keys defined with proper cascade behavior
- [x] No PHI stored
- [x] NPI used for primary keys
- [x] RLS not required (public data)
- [x] TTL implemented for verifications
- [x] Sybil prevention indexes in place
- [x] Vote deduplication enforced
