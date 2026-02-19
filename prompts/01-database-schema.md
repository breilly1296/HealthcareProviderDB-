---
tags:
  - security
  - database
  - critical
type: prompt
priority: 1
updated: 2026-02-18
---

# Database Schema Review

## Files to Review
- `packages/backend/prisma/schema.prisma` (primary schema definition)
- `packages/backend/src/lib/prisma.ts` (Prisma client singleton)
- `packages/backend/src/services/` (service layer using Prisma)

## VerifyMyProvider Database Architecture
- **ORM**: Prisma 5.22.0 with PostgreSQL
- **Hosting**: Cloud SQL (`verifymyprovider-db`, `us-central1`)
- **Security**: NO row-level security needed — user data access enforced via application-level auth (`requireAuth` middleware)
- **Encryption**: Insurance card PII fields encrypted at rest (subscriberIdEnc, groupNumberEnc, rxbinEnc, rxpcnEnc, rxgrpEnc); all other data is public
- **Size**: ~2.1M provider records currently
- **Engine**: Prisma binary engine (`engineType = "binary"`)

## Checklist

### 1. Schema Security
- [x] All tables have appropriate indexes for query performance
- [x] Foreign keys properly defined with ON DELETE behavior
- [x] NO PHI stored (VerifyMyProvider only stores public data)
- [x] NPI used for primary keys on provider-related tables (10-digit national identifier)
- [x] Sybil prevention indexes on VerificationLog

### 2. Row-Level Security
- [x] RLS NOT required — user data access enforced via application-level auth (`requireAuth` middleware)
- [x] User accounts exist with saved providers and encrypted insurance cards, but access control is handled in Express middleware, not Postgres RLS
- [x] Verification data is anonymous (no user_id linkage)
- [x] Public provider data accessible without RLS

### 3. Core Models (21 total)

#### Provider Data (7 models)
- [x] `Provider` (`providers`) — NPI registry data (name, specialty, entity type, taxonomy, dataSource default 'nppes', providerProfileUrl, profileUrlVerified, profileUrlVerifiedAt, confidenceScore, verificationCount default 0). Relations: savedBy SavedProvider[]
- [x] `practice_locations` — Provider addresses (one-to-many via NPI FK, not a grouped location model). Fields include dataSource (default 'nppes'), enrichedAt, enrichmentSource. Unique constraint: `@@unique([npi, addressLine1, city, state, zipCode])`
- [x] `provider_cms_details` — CMS enrichment (medical school, graduation year, telehealth, Medicare assignment)
- [x] `provider_hospitals` — Hospital affiliations (hospital system, name, CCN, confidence)
- [x] `provider_insurance` — Insurance network memberships (network name, identifier)
- [x] `provider_medicare` — Medicare identifiers (medicare ID, state)
- [x] `provider_taxonomies` — All taxonomy codes per provider (code, isPrimary, slot number)

#### Reference Data (2 models)
- [x] `taxonomy_reference` — Taxonomy code lookup (display name, grouping, classification, specialization, provider count)
- [x] `hospitals` — Hospital master list (CCN as PK, name, system, address)

#### Insurance & Verification (4 models)
- [x] `InsurancePlan` (`insurance_plans`) — Plan metadata (name, issuer, type, state, carrier, variant). Relations: userInsuranceCards UserInsuranceCard[]
- [x] `ProviderPlanAcceptance` (`provider_plan_acceptance`) — Acceptance status + confidence score + TTL
- [x] `VerificationLog` (`verification_logs`) — Anonymous user verifications with upvotes/downvotes + TTL
- [x] `VoteLog` (`vote_logs`) — Individual votes on verifications (one per IP per verification)

#### System (3 models)
- [x] `SyncLog` (`sync_logs`) — Data import/sync tracking
- [x] `DataQualityAudit` (`data_quality_audit`) — Data quality issues per provider (auditType, severity, field, currentValue, expectedValue, resolved status). Indexes on npi, severity, auditType, resolved.
- [x] `ImportConflict` (`import_conflicts`) — Enrichment conflict tracking (id autoincrement PK, npi, tableName, fieldName, currentValue, incomingValue, currentSource, incomingSource, resolution default "pending", resolvedAt, createdAt). Indexes: npi, resolution

#### User Authentication & Profiles (4 models)
- [x] `User` (`users`) — User accounts (id cuid PK, email unique, emailVerified, createdAt, updatedAt). Relations: savedProviders[], sessions[], insuranceCard?
- [x] `Session` (`sessions`) — Auth sessions (id cuid PK, userId FK, refreshToken unique, expiresAt, createdAt, ipAddress, userAgent, lastUsedAt). Cascade delete on user. Indexes: userId, expiresAt
- [x] `MagicLinkToken` (`magic_link_tokens`) — Passwordless login tokens (id cuid PK, email, token unique, expiresAt, usedAt, createdAt). Indexes: email, token, expiresAt
- [x] `SavedProvider` (`saved_providers`) — Provider bookmarks (id cuid PK, userId FK, providerNpi FK, createdAt). Unique: (userId, providerNpi). Cascade delete on user/provider. Indexes: userId, providerNpi

#### User Data (1 model)
- [x] `UserInsuranceCard` (`user_insurance_cards`) — Encrypted insurance card data (id cuid PK, userId unique FK, insuranceCompany, planName, planType, providerNetwork, networkNotes, subscriberIdEnc, groupNumberEnc, rxbinEnc, rxpcnEnc, rxgrpEnc, subscriberName, effectiveDate, copay fields x4, deductible fields x2, oopMax fields x2, matchedPlanId FK, confidenceScore, cardSide, scannedAt, updatedAt). One card per user. Cascade delete on user. Index: matchedPlanId

### 4. Key Relationships

```
Provider (npi PK)
  ├── practice_locations[] (npi FK, one-to-many)
  ├── provider_cms_details? (npi FK, one-to-one)
  ├── provider_hospitals[] (npi FK, one-to-many)
  ├── provider_insurance[] (npi FK, one-to-many)
  ├── provider_medicare[] (npi FK, one-to-many)
  ├── provider_taxonomies[] (npi FK, one-to-many)
  ├── ProviderPlanAcceptance[] (npi FK)
  ├── VerificationLog[] (provider_npi FK)
  ├── DataQualityAudit[] (npi FK, one-to-many)
  └── SavedProvider[] (providerNpi FK, cascade delete)

InsurancePlan (plan_id PK)
  ├── ProviderPlanAcceptance[] (plan_id FK)
  ├── VerificationLog[] (plan_id FK)
  └── UserInsuranceCard[] (matchedPlanId FK, optional)

VerificationLog (cuid PK)
  └── VoteLog[] (verification_id FK, cascade delete)

User (cuid PK)
  ├── Session[] (userId FK, cascade delete)
  ├── SavedProvider[] (userId FK, cascade delete)
  └── UserInsuranceCard? (userId FK, unique, cascade delete)

SavedProvider
  └── Provider (providerNpi FK, cascade delete)

UserInsuranceCard
  └── InsurancePlan? (matchedPlanId FK, optional)
```

**ON DELETE behavior:**
- `practice_locations`, `provider_cms_details`, `provider_hospitals`, `provider_insurance`, `provider_medicare`, `provider_taxonomies` → `NoAction` (preserve data if provider deleted)
- `ProviderPlanAcceptance` → `NoAction` on provider/plan (preserve audit trail)
- `VerificationLog` → `NoAction` on provider/plan (preserve audit trail)
- `VoteLog` → `Cascade` on verification delete (votes deleted with verification)
- `Session` → `Cascade` on user delete (sessions cleaned up with user)
- `SavedProvider` → `Cascade` on user delete AND `Cascade` on provider delete (bookmarks cleaned up from both sides)
- `UserInsuranceCard` → `Cascade` on user delete (insurance card deleted with user)

### 5. Indexes (as implemented in schema.prisma)

**Provider indexes:**
- [x] `idx_providers_category` — `specialty_category` (specialty filtering)
- [x] `idx_providers_credential` — `credential` (credential search)
- [x] `idx_providers_gender` — `gender` (gender filtering)
- [x] `idx_providers_last_name` — `lastName` (name search)
- [x] `idx_provider_name` — `(lastName, firstName)` (combined name search)
- [x] `idx_providers_specialty` — `primary_specialty` (specialty search)
- [x] `idx_providers_taxonomy` — `primary_taxonomy_code` (taxonomy lookup)

**practice_locations indexes:**
- [x] `idx_locations_city` — `city`
- [x] `idx_locations_npi` — `npi` (provider lookup)
- [x] `idx_locations_state` — `state`
- [x] `idx_locations_zip` — `zip_code`
- [x] `npi_address_type` — `(npi, addressPurpose)` (address type lookup)
- [x] `state_city` — `(state, city)` (location search)
- [x] `address_hash` — `addressHash` (dedup)
- [x] `lat_lng` — `(latitude, longitude)` (geo queries)
- [x] `geocoded_at` — `geocodedAt` (geocoding tracking)
- [x] `@@unique([npi, addressLine1, city, state, zipCode])` — address dedup constraint

**provider_hospitals indexes:**
- [x] `idx_hospitals_npi` — `npi`
- [x] `idx_hospitals_system` — `hospital_system`

**provider_insurance indexes:**
- [x] `idx_insurance_network` — `network_name`
- [x] `idx_insurance_npi` — `npi`

**provider_medicare / provider_taxonomies indexes:**
- [x] `idx_medicare_npi` — `npi`
- [x] `idx_taxonomies_code` — `taxonomy_code`
- [x] `idx_taxonomies_npi` — `npi`

**InsurancePlan indexes:**
- [x] `idx_insurance_plans_carrier` — `carrier`
- [x] `idx_insurance_plans_carrier_id` — `carrierId`
- [x] `idx_insurance_plans_health_system_id` — `healthSystemId`
- [x] `idx_insurance_plans_plan_variant` — `planVariant`
- [x] `idx_insurance_plans_state_carrier` — `(state, carrier)` (state+carrier lookup)

**ProviderPlanAcceptance indexes:**
- [x] `@@unique([providerNpi, planId])` — acceptance lookup
- [x] `idx_ppa_acceptance_status` — `acceptanceStatus`
- [x] `idx_ppa_confidence_score` — `confidenceScore`
- [x] `idx_ppa_expires_at` — `expiresAt` (TTL cleanup)
- [x] `idx_ppa_last_verified` — `lastVerified`

**VerificationLog indexes:**
- [x] `idx_vl_created_at` — `createdAt`
- [x] `idx_vl_expires_at` — `expiresAt` (TTL cleanup)
- [x] `idx_vl_is_approved` — `isApproved`
- [x] `idx_vl_plan_id` — `planId`
- [x] `idx_vl_provider_npi` — `providerNpi`
- [x] `idx_vl_provider_created` — `(providerNpi, createdAt)` (combined)
- [x] `idx_vl_sybil_email` — `(providerNpi, planId, submittedBy, createdAt)` (Sybil prevention)
- [x] `idx_vl_sybil_ip` — `(providerNpi, planId, sourceIp, createdAt)` (Sybil prevention)
- [x] `idx_vl_verification_type` — `verificationType`

**VoteLog indexes:**
- [x] `@@unique([verificationId, sourceIp])` — one vote per IP per verification
- [x] `idx_vote_logs_source_ip` — `sourceIp`
- [x] `idx_vote_logs_verification_id` — `verificationId`

**Session indexes:**
- [x] `userId` — user lookup
- [x] `expiresAt` — TTL cleanup

**MagicLinkToken indexes:**
- [x] `email` — email lookup
- [x] `token` — token validation (unique)
- [x] `expiresAt` — TTL cleanup

**SavedProvider indexes:**
- [x] `@@unique([userId, providerNpi])` — one bookmark per user per provider
- [x] `userId` — user's saved providers lookup
- [x] `providerNpi` — provider's bookmark count

**UserInsuranceCard indexes:**
- [x] `userId` — unique (one card per user)
- [x] `matchedPlanId` — plan matching lookup

**ImportConflict indexes:**
- [x] `npi` — provider conflict lookup
- [x] `resolution` — pending conflicts filter

### 6. Enums

```prisma
enum AcceptanceStatus {
  ACCEPTED
  NOT_ACCEPTED
  PENDING
  UNKNOWN
}

enum VerificationSource {
  CMS_DATA
  CARRIER_DATA
  PROVIDER_PORTAL
  PHONE_CALL
  CROWDSOURCE
  AUTOMATED
  NPPES_SYNC
  CARRIER_SCRAPE
  NETWORK_CROSSREF
}

enum VerificationType {
  PLAN_ACCEPTANCE
  PROVIDER_INFO
  CONTACT_INFO
  STATUS_CHANGE
  NEW_PLAN
}
```

### 7. Data Quality Fields
- [x] Confidence scoring: `ProviderPlanAcceptance.confidenceScore` (0-100 integer), `Provider.confidenceScore`, `UserInsuranceCard.confidenceScore`
- [x] Source tracking: `VerificationSource` enum (CMS_DATA, CARRIER_DATA, PROVIDER_PORTAL, PHONE_CALL, CROWDSOURCE, AUTOMATED, NPPES_SYNC, CARRIER_SCRAPE, NETWORK_CROSSREF)
- [x] Data source tracking: `Provider.dataSource` (default 'nppes'), `PracticeLocation.dataSource` (default 'nppes'), `PracticeLocation.enrichmentSource`
- [x] Timestamps: `createdAt`, `updatedAt`, `lastVerified` on ProviderPlanAcceptance; `enrichedAt` on PracticeLocation; `profileUrlVerifiedAt` on Provider
- [x] Verification count: `ProviderPlanAcceptance.verificationCount`, `Provider.verificationCount` (default 0)
- [x] TTL fields: `expiresAt` on both ProviderPlanAcceptance and VerificationLog
- [x] Confidence on enriched data: `provider_hospitals.confidence`, `provider_insurance.confidence`
- [x] Profile URL verification: `Provider.providerProfileUrl`, `Provider.profileUrlVerified`, `Provider.profileUrlVerifiedAt`

### 8. Schema Conventions
- PascalCase model names with `@@map("snake_case_table")` for Prisma compatibility
- camelCase fields with `@map("snake_case")` for TypeScript access
- `@db.VarChar(N)` for all string fields with explicit length limits
- `@db.Timestamptz(6)` for all timestamps (timezone-aware)
- `@default(cuid())` for application-generated TEXT primary keys (verification_logs, vote_logs)
- `@default(autoincrement())` for integer primary keys (practice_locations, provider_hospitals, etc.)

### 9. Known Schema Issues
- [x] `practice_locations` replaced the old `Location` model — locations route has been re-enabled
- [ ] No `state` or `city` index directly on Provider — address data lives in `practice_locations`
- [ ] `provider_cms_details` source defaults to `"cms_national"` — may need source diversification
- [ ] Several Provider fields use raw snake_case (`middle_name`, `name_prefix`, etc.) without `@map` — inconsistent with camelCase convention

### 10. Migration Safety
- [ ] No destructive migrations without data backup plan
- [ ] `CREATE INDEX CONCURRENTLY` used for production indexes
- [ ] Migrations are idempotent where possible

## Questions to Ask
1. Are there any missing indexes causing slow queries in production?
2. Should deactivated providers be soft-deleted or hard-deleted?
3. Are there any N+1 query patterns in the service layer?
4. What's the plan for handling 9M+ providers (full NPI dataset)?
5. ~~Should the `practice_locations` table have a unique constraint on address fields?~~ **Done** — `@@unique([npi, addressLine1, city, state, zipCode])` added
6. Should Provider fields be normalized to consistent camelCase with `@map`?
