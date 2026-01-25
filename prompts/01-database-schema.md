---
tags:
  - security
  - database
  - critical
type: prompt
priority: 1
---

# Database Schema Review

## Files to Review
- `prisma/schema.prisma` (primary - root level)
- `prisma/migrations/` (migration history)
- `packages/backend/src/lib/prisma.ts` (Prisma client singleton)
- `packages/backend/src/services/` (service layer using Prisma)

## VerifyMyProvider Database Architecture
- **ORM**: Prisma with PostgreSQL
- **Hosting**: Cloud SQL (verifymyprovider-db, us-central1)
- **Security**: NO row-level security needed (no PHI)
- **Encryption**: NOT required (public data only)
- **Size**: ~2.1M provider records currently

## Checklist

### 1. Schema Security
- [ ] All tables have appropriate indexes for query performance
- [ ] Foreign keys properly defined with ON DELETE behavior
- [ ] NO PHI stored (VerifyMyProvider only stores public data)
- [ ] NPI used for primary keys (10-digit national identifier)

### 2. Row-Level Security
- [ ] RLS NOT required (no user-owned data, no PHI)
- [ ] Verification data is anonymous (no user_id linkage)
- [ ] Public data accessible without RLS

### 3. Core Tables
- [ ] `Provider` - NPI registry data (name, address, specialty, locationId)
- [ ] `Location` - Physical locations (hospitals, offices, clinics) - **NEW Jan 2026**
- [ ] `InsurancePlan` - Plan metadata (name, issuer, state)
- [ ] `ProviderPlanAcceptance` - Acceptance status + confidence score
- [ ] `VerificationLog` - Anonymous user verifications with upvotes/downvotes
- [ ] `SyncLog` - Data import tracking

### 4. Indexes (as implemented in schema.prisma)
- [x] Provider indexes:
  - `Provider(state)` - state filtering
  - `Provider(specialtyCode)` - specialty search
  - `Provider(lastName)` - name search
  - `Provider(firstName)` - name search
  - `Provider(city)` - location filtering
  - `Provider(organizationName)` - org search
  - `Provider(state, specialtyCode)` - combined search
  - `Provider(locationId)` - location lookup
- [x] ProviderPlanAcceptance indexes:
  - `@@unique([providerNpi, planId])` - acceptance lookup
  - `(acceptanceStatus)` - status filtering
  - `(confidenceScore)` - quality filtering
  - `(lastVerified)` - recency queries
  - `(expiresAt)` - TTL cleanup
- [x] VerificationLog indexes:
  - `(providerNpi)` - provider lookups
  - `(planId)` - plan lookups
  - `(verificationType)` - type filtering
  - `(createdAt)` - recent verifications
  - `(isApproved)` - moderation queries
  - `(expiresAt)` - TTL cleanup
  - `(providerNpi, createdAt)` - combined
- [x] Location indexes:
  - `(state)` - state-based search
  - `(city, state)` - city-based search
  - `(zipCode)` - ZIP-based search
- [x] No missing indexes on foreign keys

### 5. Data Quality Fields
- [ ] Confidence scoring fields present (0-100 integer)
- [ ] Source tracking (CMS_DATA, USER_VERIFIED, INSURER_API)
- [ ] Timestamp fields (createdAt, updatedAt, lastVerified)
- [ ] Verification count tracking

### 5b. Location Model Fields (NEW Jan 2026)
- [ ] `Location` table groups providers by shared address
- [ ] Address components: addressLine1, addressLine2, city, state, zipCode
- [ ] Location details: name, healthSystem, facilityType
- [ ] providerCount - denormalized count for performance
- [ ] Unique constraint on (addressLine1, city, state, zipCode)
- [ ] Provider → Location relationship via locationId

### 6. Migration Safety
- [ ] No destructive migrations without data backup plan
- [ ] `CREATE INDEX CONCURRENTLY` used for production indexes
- [ ] Migrations are idempotent where possible

## Questions to Ask
1. Are there any missing indexes causing slow queries?
2. Should deactivated providers be soft-deleted or hard-deleted?
3. Are there any N+1 query patterns in the codebase?
4. What's the plan for handling 9M+ providers (full NPI dataset)?
5. Should verifications have a TTL (auto-expire after X months)?
