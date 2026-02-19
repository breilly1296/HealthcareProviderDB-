# Database Schema Review

**Generated:** 2026-02-18
**Prompt:** 01-database-schema.md
**Status:** VERIFIED -- Schema is well-structured with comprehensive indexing, proper relationships, and appropriate conventions.

---

## Files Reviewed

| File | Path |
|------|------|
| Prisma Schema | `packages/backend/prisma/schema.prisma` |
| Prisma Client Singleton | `packages/backend/src/lib/prisma.ts` |
| Auth Service | `packages/backend/src/services/authService.ts` |

---

## 1. Schema Security

- [x] **All tables have appropriate indexes for query performance** -- VERIFIED. 60+ indexes defined across all models. Provider has 7 indexes for specialty, name, credential, gender, and taxonomy lookups. Practice locations have 9 indexes including composite indexes for state+city, npi+addressType, and lat+lng geo queries. VerificationLog has 9 indexes including 2 composite Sybil prevention indexes.

- [x] **Foreign keys properly defined with ON DELETE behavior** -- VERIFIED. All provider child tables (practice_locations, provider_cms_details, provider_hospitals, provider_insurance, provider_medicare, provider_taxonomies) use `onDelete: NoAction` to preserve data integrity. User child tables (Session, SavedProvider, UserInsuranceCard) use `onDelete: Cascade` for cleanup. VoteLog cascades on VerificationLog deletion.

- [x] **NO PHI stored** -- VERIFIED. Provider data is sourced from the public NPI Registry and CMS. The only user-linked data is insurance card fields (subscriber ID, group number, pharmacy IDs), which are encrypted at rest and identify an insurance plan, not health conditions or treatments.

- [x] **NPI used for primary keys on provider-related tables** -- VERIFIED. `Provider.npi` is the PK (VarChar(10)). All provider child tables reference `npi` as a foreign key. ProviderCmsDetails uses `npi` as both PK and FK (one-to-one).

- [x] **Sybil prevention indexes on VerificationLog** -- VERIFIED. Two composite indexes exist:
  - `idx_vl_sybil_email`: `(providerNpi, planId, submittedBy, createdAt)`
  - `idx_vl_sybil_ip`: `(providerNpi, planId, sourceIp, createdAt)`

## 2. Row-Level Security

- [x] **RLS NOT required** -- VERIFIED. User data access is enforced via `requireAuth` middleware in Express routes (routes/auth.ts, routes/savedProviders.ts, routes/insuranceCard.ts). All user-specific queries filter by `req.user.id`, which is extracted from a verified JWT.

- [x] **User accounts exist with saved providers and encrypted insurance cards, but access control is handled in Express middleware** -- VERIFIED. The `extractUser` middleware in `middleware/auth.ts` verifies the JWT, looks up the session in the DB, and sets `req.user`. The `requireAuth` guard rejects requests where `req.user` is null.

- [x] **Verification data is anonymous** -- VERIFIED. `VerificationLog` stores `sourceIp` and optional `submittedBy` (email) but has no `userId` foreign key. Verifications cannot be linked to user accounts.

- [x] **Public provider data accessible without RLS** -- VERIFIED. Provider search, detail, plans, and location endpoints are all public routes with no auth required.

## 3. Core Models (21 total)

### Provider Data (7 models)

- [x] **Provider** (`providers`) -- VERIFIED. Fields confirmed: `npi` (PK, VarChar(10)), `entityType`, `lastName`, `firstName`, `middleName`, `namePrefix`, `nameSuffix`, `credential`, `organizationName`, `gender`, `enumerationDate`, `lastUpdateDate`, `deactivationDate`, `reactivationDate`, `isSoleProprietor`, `isOrganizationSubpart`, `parentOrganizationLbn`, `primaryTaxonomyCode`, `primarySpecialty`, `specialtyCategory`, `nppesLastSynced`, `dataSource` (default 'nppes'), `providerProfileUrl`, `profileUrlVerified`, `profileUrlVerifiedAt`, `confidenceScore`, `verificationCount` (default 0). Relations: `savedBy SavedProvider[]`, `practiceLocations[]`, `providerCmsDetails?`, `providerHospitals[]`, `providerInsurance[]`, `providerMedicare[]`, `providerPlanAcceptances[]`, `providerTaxonomies[]`, `verificationLogs[]`, `dataQualityAudits[]`.

- [x] **PracticeLocation** (`practice_locations`) -- VERIFIED. Integer autoincrement PK. NPI FK with `onDelete: NoAction`. Fields include `addressType` (default 'practice'), full address fields, `phone`, `fax`, `address_hash`, `geocoded_at`, `latitude`, `longitude`, `dataSource` (default 'nppes'), `enrichedAt`, `enrichmentSource`. Unique constraint: `@@unique([npi, addressLine1, city, state, zipCode])`.

- [x] **ProviderCmsDetails** (`provider_cms_details`) -- VERIFIED. NPI as PK and FK. Fields: `groupPracticeName`, `medicalSchool`, `graduationYear`, `medicareAssignment`, `telehealth`, `source` (default 'cms_national').

- [x] **ProviderHospital** (`provider_hospitals`) -- VERIFIED. Autoincrement PK. Fields: `npi` FK, `hospitalSystem`, `hospitalName`, `ccn`, `source`, `confidence` (default 'MEDIUM').

- [x] **ProviderInsurance** (`provider_insurance`) -- VERIFIED. Autoincrement PK. Fields: `npi` FK, `networkName`, `identifierId`, `source` (default 'npi_other_id'), `confidence` (default 'MEDIUM').

- [x] **ProviderMedicare** (`provider_medicare`) -- VERIFIED. Autoincrement PK. Fields: `npi` FK, `medicareId`, `medicareState`, `source` (default 'npi_other_id').

- [x] **ProviderTaxonomy** (`provider_taxonomies`) -- VERIFIED. Autoincrement PK. Fields: `npi` FK, `taxonomyCode`, `isPrimary`, `slotNumber`.

### Reference Data (2 models)

- [x] **TaxonomyReference** (`taxonomy_reference`) -- VERIFIED. `taxonomyCode` as PK. Fields: `displayName`, `groupingName`, `classification`, `specialization`, `standardizedName`, `providerCount`.

- [x] **Hospital** (`hospitals`) -- VERIFIED. `ccn` as PK (VarChar(20)). Fields: `hospitalName`, `hospitalSystem`, `address`, `city`, `state`, `zipCode`, `phone`. Note: No relation defined to ProviderHospital (standalone reference table).

### Insurance & Verification (4 models)

- [x] **InsurancePlan** (`insurance_plans`) -- VERIFIED. `planId` as PK. Fields: `planName`, `issuerName`, `planType`, `state`, `carrier`, `planVariant`, `rawName`, `sourceHealthSystem`, `providerCount` (default 0), `carrierId`, `healthSystemId`, `createdAt`. Relations: `providerAcceptances[]`, `verificationLogs[]`, `userInsuranceCards[]`.

- [x] **ProviderPlanAcceptance** (`provider_plan_acceptance`) -- VERIFIED. Autoincrement PK. Fields: `providerNpi` FK, `planId` FK, `acceptanceStatus` (default 'UNKNOWN'), `confidenceScore` (default 0), `lastVerified`, `verificationCount` (default 0), `createdAt`, `updatedAt`, `expiresAt`, `locationId` FK to PracticeLocation. Note: No `@@unique([providerNpi, planId])` constraint is present in the actual schema -- the prompt's checklist says this exists but the schema has separate indexes for `idx_ppa_npi_status` and `idx_ppa_plan_status` instead.

- [x] **VerificationLog** (`verification_logs`) -- VERIFIED. CUID PK. Fields: `providerNpi` FK, `planId` FK, `acceptanceId`, `verificationType` (enum), `verificationSource` (enum), `previousValue` (Json), `newValue` (Json), `sourceIp`, `userAgent`, `submittedBy`, `upvotes` (default 0), `downvotes` (default 0), `isApproved`, `reviewedAt`, `reviewedBy`, `notes`, `evidenceUrl`, `createdAt`, `expiresAt`. Relation to VoteLog[].

- [x] **VoteLog** (`vote_logs`) -- VERIFIED. CUID PK. Fields: `verificationId` FK, `sourceIp`, `vote`, `createdAt`. `onDelete: Cascade` on verification. Unique constraint: `@@unique([verificationId, sourceIp])`.

### System (3 models)

- [x] **SyncLog** (`sync_logs`) -- VERIFIED. Autoincrement PK. Fields: `syncType`, `state`, `recordsProcessed` (default 0), `status`, `errorMessage`, `startedAt` (default now), `completedAt`.

- [x] **DataQualityAudit** (`data_quality_audit`) -- VERIFIED. Autoincrement PK. Fields: `npi` FK, `auditType`, `severity`, `field`, `currentValue`, `expectedValue`, `details`, `resolved` (default false), `resolvedAt`, `createdAt`. Indexes on npi, severity, auditType, resolved.

- [x] **ImportConflict** (`import_conflicts`) -- VERIFIED. Autoincrement PK. Fields: `npi`, `tableName`, `fieldName`, `currentValue`, `incomingValue`, `currentSource`, `incomingSource`, `resolution` (default 'pending'), `resolvedAt`, `createdAt`. Indexes on npi, resolution. Note: no FK to Provider (standalone tracking table).

### User Authentication & Profiles (4 models)

- [x] **User** (`users`) -- VERIFIED. CUID PK. Fields: `email` (unique), `emailVerified` (DateTime?), `createdAt`, `updatedAt` (auto). Relations: `savedProviders[]`, `sessions[]`, `insuranceCard?`.

- [x] **Session** (`sessions`) -- VERIFIED. CUID PK. Fields: `userId` FK (Cascade delete), `refreshToken` (unique, VarChar(500) -- stores SHA-256 hash), `expiresAt`, `createdAt`, `ipAddress`, `userAgent`, `lastUsedAt`. Indexes on userId and expiresAt.

- [x] **MagicLinkToken** (`magic_link_tokens`) -- VERIFIED. CUID PK. Fields: `email`, `token` (unique, VarChar(500)), `expiresAt`, `usedAt`, `createdAt`. Indexes on email, token, expiresAt.

- [x] **SavedProvider** (`saved_providers`) -- VERIFIED. CUID PK. Fields: `userId` FK (Cascade), `providerNpi` FK (Cascade on provider delete), `createdAt`. Unique: `(userId, providerNpi)`. Indexes on userId and providerNpi.

### User Data (1 model)

- [x] **UserInsuranceCard** (`user_insurance_cards`) -- VERIFIED. CUID PK. `userId` unique FK (Cascade, one card per user). Encrypted fields: `subscriberIdEnc`, `groupNumberEnc`, `rxbinEnc`, `rxpcnEnc`, `rxgrpEnc` (all VarChar(500)). Plain fields: `insuranceCompany`, `planName`, `planType`, `providerNetwork`, `networkNotes`, `subscriberName`, `effectiveDate`, copay fields x4, deductible fields x2, OOP max fields x2, `matchedPlanId` FK, `confidenceScore`, `cardSide`, `scannedAt`, `updatedAt`. Index on matchedPlanId.

## 4. Key Relationships

Verified relationship tree matches the actual schema:

```
Provider (npi PK)
  +-- practiceLocations[] (npi FK, onDelete: NoAction)
  +-- providerCmsDetails? (npi PK/FK, onDelete: NoAction)
  +-- providerHospitals[] (npi FK, onDelete: NoAction)
  +-- providerInsurance[] (npi FK, onDelete: NoAction)
  +-- providerMedicare[] (npi FK, onDelete: NoAction)
  +-- providerTaxonomies[] (npi FK, onDelete: NoAction)
  +-- providerPlanAcceptances[] (providerNpi FK, onUpdate: NoAction)
  +-- verificationLogs[] (providerNpi FK, onUpdate: NoAction)
  +-- dataQualityAudits[] (npi FK, onDelete: NoAction)
  +-- savedBy SavedProvider[] (providerNpi FK, onDelete: Cascade)

InsurancePlan (planId PK)
  +-- providerAcceptances ProviderPlanAcceptance[] (planId FK)
  +-- verificationLogs VerificationLog[] (planId FK)
  +-- userInsuranceCards UserInsuranceCard[] (matchedPlanId FK)

VerificationLog (cuid PK)
  +-- votes VoteLog[] (verificationId FK, onDelete: Cascade)

User (cuid PK)
  +-- sessions Session[] (userId FK, onDelete: Cascade)
  +-- savedProviders SavedProvider[] (userId FK, onDelete: Cascade)
  +-- insuranceCard UserInsuranceCard? (userId FK, unique, onDelete: Cascade)
```

**Additional relationship found in schema:** `ProviderPlanAcceptance.locationId` FK to `PracticeLocation` (onUpdate: NoAction, no onDelete specified -- defaults to NoAction).

## 5. Indexes

All indexes listed in the prompt checklist have been verified against the actual schema. Notable findings:

**Provider indexes (7):** All confirmed -- `idx_providers_category`, `idx_providers_credential`, `idx_providers_gender`, `idx_providers_last_name`, `idx_provider_name`, `idx_providers_specialty`, `idx_providers_taxonomy`.

**practice_locations indexes (9 + 1 unique):** All confirmed. Index names differ slightly from prompt in some cases:
- `idx_locations_npi_address_type` (prompt says `npi_address_type`)
- `idx_locations_state_city` (prompt says `state_city`)
- `idx_locations_address_hash` (prompt says `address_hash`)
- `idx_locations_lat_lng` (prompt says `lat_lng`)
- `idx_locations_geocoded_at` (prompt says `geocoded_at`)

**ProviderPlanAcceptance indexes:** The prompt lists `@@unique([providerNpi, planId])` but this is NOT present in the actual schema. Instead, there are two composite indexes: `idx_ppa_npi_status (providerNpi, acceptanceStatus)` and `idx_ppa_plan_status (planId, acceptanceStatus)`, plus an `idx_ppa_location_id` index not listed in the prompt.

**All other index groups verified as listed.**

### Discrepancy: Missing Unique Constraint on ProviderPlanAcceptance

The prompt checklist marks `@@unique([providerNpi, planId])` as checked, but the actual schema does NOT have this constraint. This means duplicate provider+plan acceptance records are possible at the database level. This is worth investigating -- it may be intentional to allow multiple acceptance records per location, or it may be an oversight.

## 6. Enums

All three enums verified against the schema:

```prisma
enum AcceptanceStatus { ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN }
enum VerificationSource { CMS_DATA, CARRIER_DATA, PROVIDER_PORTAL, PHONE_CALL, CROWDSOURCE, AUTOMATED, NPPES_SYNC, CARRIER_SCRAPE, NETWORK_CROSSREF }
enum VerificationType { PLAN_ACCEPTANCE, PROVIDER_INFO, CONTACT_INFO, STATUS_CHANGE, NEW_PLAN }
```

Note: `ProviderPlanAcceptance.acceptanceStatus` is stored as `VarChar(20)` with a default of `"UNKNOWN"`, NOT as the `AcceptanceStatus` enum type. The enum is defined but not directly used by the `acceptanceStatus` field. This is a minor inconsistency.

## 7. Data Quality Fields

- [x] **Confidence scoring** -- VERIFIED. `ProviderPlanAcceptance.confidenceScore` (Int, default 0), `Provider.confidenceScore` (Float?), `UserInsuranceCard.confidenceScore` (Int?), `ProviderHospital.confidence` (VarChar(10), default 'MEDIUM'), `ProviderInsurance.confidence` (VarChar(10), default 'MEDIUM').

- [x] **Source tracking** -- VERIFIED. `VerificationSource` enum used on `VerificationLog.verificationSource`. Additionally `Provider.dataSource`, `PracticeLocation.dataSource`, `PracticeLocation.enrichmentSource`, `ProviderCmsDetails.source`, `ProviderHospital.source`, `ProviderInsurance.source`, `ProviderMedicare.source`.

- [x] **TTL fields** -- VERIFIED. `expiresAt` on both `ProviderPlanAcceptance` and `VerificationLog`.

- [x] **Profile URL verification** -- VERIFIED. `Provider.providerProfileUrl`, `Provider.profileUrlVerified`, `Provider.profileUrlVerifiedAt`.

## 8. Schema Conventions

- [x] PascalCase model names with `@@map("snake_case_table")` -- VERIFIED on all 21 models.
- [x] camelCase fields with `@map("snake_case")` -- VERIFIED for most fields. Exception: `PracticeLocation.address_hash` uses snake_case in the Prisma field name (should be `addressHash`).
- [x] `@db.VarChar(N)` for string fields with explicit length limits -- VERIFIED.
- [x] `@db.Timestamptz(6)` for all timestamps -- VERIFIED.
- [x] `@default(cuid())` for application-generated TEXT PKs -- VERIFIED on User, Session, MagicLinkToken, SavedProvider, UserInsuranceCard, VerificationLog, VoteLog.
- [x] `@default(autoincrement())` for integer PKs -- VERIFIED on PracticeLocation, ProviderHospital, ProviderInsurance, ProviderMedicare, ProviderTaxonomy, SyncLog, DataQualityAudit, ImportConflict, ProviderPlanAcceptance.

## 9. Known Schema Issues

- [x] `practice_locations` replaced the old `Location` model -- VERIFIED. The schema only contains `PracticeLocation` mapped to `practice_locations`.

- [ ] **No `state` or `city` index directly on Provider** -- CONFIRMED. Address data lives in `practice_locations`. Provider searches join through practice_locations.

- [ ] **`provider_cms_details` source defaults to `"cms_national"`** -- CONFIRMED in schema line 115.

- [ ] **Several Provider fields use raw snake_case without `@map`** -- PARTIALLY CONFIRMED. Most fields DO have `@map`, but `PracticeLocation.address_hash` still uses snake_case as the Prisma field name while having `@map("address_hash")`. The `credential`, `gender` fields on Provider have no `@map` but are already single-word names that don't need one.

## 10. Prisma Client Singleton

`packages/backend/src/lib/prisma.ts` -- VERIFIED:
- Uses global variable pattern to prevent multiple Prisma Client instances in development (hot reload)
- Development logging: `['query', 'error', 'warn']`
- Production logging: `['error']` only
- Exports both named (`prisma`) and default exports

## Additional Findings

1. **ProviderPlanAcceptance uses `onUpdate: NoAction` instead of `onDelete`** for provider and plan FKs. The prompt says `NoAction` on delete, which is technically the Prisma default when `onDelete` is not specified, so the behavior matches. However, the actual schema specifies `onUpdate: NoAction` explicitly and omits `onDelete`.

2. **PracticeLocation has a relation to ProviderPlanAcceptance** via `locationId` FK, enabling location-specific plan acceptance tracking. This is documented in the relationship tree but worth highlighting as an important join path.

3. **ImportConflict has no FK to Provider** -- the `npi` field is a plain VarChar, not a foreign key. This means conflicts can reference providers that don't exist in the database (e.g., deleted or not-yet-imported providers).

4. **Hospital model is standalone** -- despite `ProviderHospital` having a `ccn` field, there is no Prisma relation between `ProviderHospital` and `Hospital`. The `ccn` field on `ProviderHospital` is a plain string, not a FK.

---

## Questions to Ask

1. **Should `ProviderPlanAcceptance` have a unique constraint on `(providerNpi, planId)`?** The prompt says it does, but the schema does not. If location-specific acceptances are intended, perhaps `(providerNpi, planId, locationId)` should be unique instead.

2. **Should `ProviderHospital.ccn` be a FK to `Hospital.ccn`?** Currently they are disconnected.

3. **Should `PracticeLocation.address_hash` be renamed to `addressHash` for consistency?** The `@map` annotation is correct but the Prisma field name itself uses snake_case.

4. Are there any missing indexes causing slow queries in production?
5. Should deactivated providers be soft-deleted or hard-deleted?
6. Are there any N+1 query patterns in the service layer?
7. Should Provider fields be normalized to consistent camelCase with `@map`?
