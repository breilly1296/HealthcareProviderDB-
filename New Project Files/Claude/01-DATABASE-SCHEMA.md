# Database Schema Review

**Last Updated:** 2026-02-06
**ORM:** Prisma 5.22.0 with PostgreSQL (binary engine)
**Hosting:** Cloud SQL (`verifymyprovider-db`, `us-central1`)
**Size:** ~2.1M provider records
**PHI:** None -- public data only

---

## Checklist Results (Verified Against Code)

### 1. Schema Security

- [x] **All tables have appropriate indexes for query performance** -- Verified in `schema.prisma` lines 44-49 (Provider), 79-83 (practice_locations), 107-108 (provider_hospitals), 120-121 (provider_insurance), 132 (provider_medicare), 143-144 (provider_taxonomies), 174-178 (InsurancePlan), 200-205 (ProviderPlanAcceptance), 233-241 (VerificationLog), 253-255 (VoteLog), 286-289 (DataQualityAudit). Total: 35+ indexes across 11 tables.
- [x] **Foreign keys properly defined with ON DELETE behavior** -- All provider sub-tables use `onDelete: NoAction` (lines 76, 94, 105, 118, 130, 141). VoteLog uses `onDelete: Cascade` (line 251). ProviderPlanAcceptance uses `onUpdate: NoAction` with no explicit onDelete (lines 193-195).
- [x] **NO PHI stored** -- Schema stores only NPI numbers, provider names, addresses, specialties, insurance plan data, and anonymous verification records. No patient data fields exist anywhere.
- [x] **NPI used for primary keys** -- `Provider.npi` is `@id @db.VarChar(10)` (line 13). All provider-related tables FK to `npi`.
- [x] **Sybil prevention indexes on VerificationLog** -- `idx_vl_sybil_email` on `(providerNpi, planId, submittedBy, createdAt)` (line 239) and `idx_vl_sybil_ip` on `(providerNpi, planId, sourceIp, createdAt)` (line 240).

### 2. Row-Level Security

- [x] **RLS NOT required** -- No user-owned data exists. Verifications are anonymous (no user_id field). All data is public NPI registry information.
- [x] **Verification data is anonymous** -- `VerificationLog` stores `sourceIp` and optional `submittedBy` for Sybil prevention, but has no user account linkage.

### 3. Core Models (15 total -- verified)

#### Provider Data (7 models)
- [x] `Provider` (`providers`) -- line 12, NPI PK, 6 indexes
- [x] `practice_locations` -- line 64, autoincrement PK, FK to Provider via `npi`, 5 indexes (including `address_hash`)
- [x] `provider_cms_details` -- line 86, NPI as PK (one-to-one), source defaults to `"cms_national"`
- [x] `provider_hospitals` -- line 97, autoincrement PK, FK to Provider, 2 indexes
- [x] `provider_insurance` -- line 111, autoincrement PK, FK to Provider, 2 indexes
- [x] `provider_medicare` -- line 124, autoincrement PK, FK to Provider, 1 index
- [x] `provider_taxonomies` -- line 135, autoincrement PK, FK to Provider, 2 indexes

#### Reference Data (2 models)
- [x] `taxonomy_reference` -- line 148, `taxonomy_code` as PK, includes `provider_count`
- [x] `hospitals` -- line 53, `ccn` as PK

#### Insurance & Verification (4 models)
- [x] `InsurancePlan` (`insurance_plans`) -- line 157, `plan_id` as PK, 4 indexes
- [x] `ProviderPlanAcceptance` (`provider_plan_acceptance`) -- line 181, autoincrement PK, partial unique indexes via raw SQL (noted in comments lines 197-199), 5 indexes
- [x] `VerificationLog` (`verification_logs`) -- line 208, CUID PK, 9 indexes
- [x] `VoteLog` (`vote_logs`) -- line 245, CUID PK, unique constraint on `[verificationId, sourceIp]`, 2 indexes

#### System (2 models)
- [x] `SyncLog` (`sync_logs`) -- line 259, autoincrement PK
- [x] `DataQualityAudit` (`data_quality_audit`) -- line 272, autoincrement PK, 4 indexes

### 4. Key Relationships -- Verified

All relationships confirmed in `schema.prisma`:
- Provider has 8 one-to-many relations: practice_locations, provider_hospitals, provider_insurance, provider_medicare, provider_taxonomies, providerPlanAcceptances, verificationLogs, dataQualityAudits
- Provider has 1 one-to-one: provider_cms_details
- InsurancePlan has 2 one-to-many: providerAcceptances, verificationLogs
- VerificationLog has 1 one-to-many: votes (VoteLog)
- ProviderPlanAcceptance has optional FK to practice_locations via `locationId` (line 195)

**ON DELETE behavior verified:**
- All provider sub-tables: `NoAction` (confirmed lines 76, 94, 105, 118, 130, 141)
- ProviderPlanAcceptance: No explicit `onDelete` on Provider/Plan FKs, `onUpdate: NoAction`
- VoteLog: `onDelete: Cascade` on VerificationLog FK (line 251)

### 5. Indexes -- All Verified

All 35+ indexes listed in the prompt are present and confirmed in `schema.prisma`. Notable addition not in the prompt checklist:
- `idx_locations_address_hash` on `practice_locations.address_hash` (line 83)
- `idx_ppa_location_id` on `ProviderPlanAcceptance.locationId` (line 204)
- 4 indexes on `DataQualityAudit` (npi, severity, auditType, resolved) at lines 286-289

### 6. Enums -- Verified

All three enums present at lines 293-318:
- `AcceptanceStatus`: ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN
- `VerificationSource`: CMS_DATA, CARRIER_DATA, PROVIDER_PORTAL, PHONE_CALL, CROWDSOURCE, AUTOMATED, NPPES_SYNC, CARRIER_SCRAPE, NETWORK_CROSSREF
- `VerificationType`: PLAN_ACCEPTANCE, PROVIDER_INFO, CONTACT_INFO, STATUS_CHANGE, NEW_PLAN

**Note:** `AcceptanceStatus` enum is defined but `ProviderPlanAcceptance.acceptanceStatus` is typed as `String @db.VarChar(20)` (line 186), not the enum. The field stores enum-like values but uses string type.

### 7. Data Quality Fields -- Verified

- [x] `ProviderPlanAcceptance.confidenceScore` -- `Int @default(0)` (line 187)
- [x] `VerificationSource` enum covers 9 source types (lines 300-310)
- [x] Timestamps: `createdAt`, `updatedAt`, `lastVerified` on ProviderPlanAcceptance (lines 190-191, 188)
- [x] `ProviderPlanAcceptance.verificationCount` -- `Int @default(0)` (line 189)
- [x] TTL fields: `expiresAt` on ProviderPlanAcceptance (line 192) and VerificationLog (line 228)
- [x] Confidence on enriched data: `provider_hospitals.confidence` (line 104), `provider_insurance.confidence` (line 117)

### 8. Schema Conventions -- Verified with Exceptions

- [x] PascalCase model names with `@@map` for most models (InsurancePlan, ProviderPlanAcceptance, VerificationLog, VoteLog, SyncLog, DataQualityAudit)
- [ ] **INCONSISTENCY:** `practice_locations`, `provider_cms_details`, `provider_hospitals`, `provider_insurance`, `provider_medicare`, `provider_taxonomies`, `taxonomy_reference`, `hospitals` are lowercase without `@@map` -- they use raw DB table names as model names
- [x] `@db.VarChar(N)` for all string fields
- [x] `@db.Timestamptz(6)` for timestamps
- [x] `@default(cuid())` for VerificationLog and VoteLog PKs
- [x] `@default(autoincrement())` for integer PKs

### 9. Known Schema Issues -- Verified

- [x] `practice_locations` is active and used throughout (providerService.ts, locationService.ts)
- [ ] **No state/city index on Provider** -- confirmed. Address data lives in `practice_locations` which has its own state/city indexes
- [ ] **`provider_cms_details.source` defaults to `"cms_national"`** -- confirmed at line 93
- [ ] **Inconsistent field naming** -- confirmed. Provider has mixed conventions: `lastName` (camelCase with @map), `middle_name` (snake_case, no @map), `name_prefix` (snake_case, no @map), etc. Fields without @map at lines 17-28: `middle_name`, `name_prefix`, `name_suffix`, `last_update_date`, `deactivation_date`, `reactivation_date`, `is_sole_proprietor`, `is_organization_subpart`, `parent_organization_lbn`, `primary_taxonomy_code`, `primary_specialty`, `specialty_category`

### 10. Migration Safety

- [ ] No evidence of destructive migration safeguards in reviewed files
- [ ] No evidence of `CREATE INDEX CONCURRENTLY` usage
- [ ] No migration idempotency checks found

---

## Questions Answered

### 1. Are there any missing indexes causing slow queries in production?

**Finding:** The indexing coverage is comprehensive. The main potential performance concern is:
- **Provider name search** uses `contains` (LIKE '%term%') which cannot use B-tree indexes efficiently. The `idx_providers_last_name` index only helps with prefix matches. For 2.1M+ records, `contains` queries with `mode: 'insensitive'` on `firstName`, `lastName`, and `organizationName` (see `providerService.ts` lines 103-106, 131-135) will result in sequential scans. A trigram index (`pg_trgm`) or full-text search index would significantly improve name search performance.
- **Provider search ordering** by `providerPlanAcceptances: { _count: 'desc' }` (providerService.ts line 283) requires a subquery count on every row, which may be slow on large result sets.

### 2. Should deactivated providers be soft-deleted or hard-deleted?

**Finding:** Currently, deactivation is tracked via `Provider.deactivation_date` (a string field, line 25). The `transformProvider` function in `providers.ts` (line 159) maps this to `npiStatus: 'DEACTIVATED'`. There is no soft-delete mechanism (no `deletedAt` field). Deactivated providers remain fully queryable. This is appropriate since the NPI registry itself tracks deactivation status.

### 3. Are there any N+1 query patterns in the service layer?

**Finding:** No N+1 patterns detected. The codebase uses Prisma `include` consistently:
- `searchProviders` uses `PROVIDER_INCLUDE` constant (providerService.ts line 176-197) which eagerly loads all relations in a single query
- `getProviderByNpi` uses the same include (line 300-303)
- `getProvidersForPlan` uses targeted includes (planService.ts lines 313-339)
- `getVerificationsForPair` uses `Promise.all` for parallel queries (verificationService.ts lines 703-735)
- `getRecentVerifications` uses `select` with nested relations (verificationService.ts lines 628-666)

### 4. What's the plan for handling 9M+ providers (full NPI dataset)?

**Finding:** No explicit scaling plan found in the reviewed code. Current schema indexes are appropriate for the full dataset. The `PROVIDER_INCLUDE` constant eagerly loads ALL relations which may become expensive at scale. Consider: adding composite indexes for common filter combinations, implementing cursor-based pagination, and limiting `include` depth for search results.

### 5. Should `practice_locations` have a unique constraint on address fields?

**Finding:** There is an `address_hash` field (line 75, `@db.VarChar(64)`) with an index (`idx_locations_address_hash`, line 83) that could serve this purpose. However, there is no unique constraint on it. The `getProvidersAtLocation` function in `locationService.ts` (lines 110-151) relies on address field matching, not a unique constraint. Multiple providers can share the same address (e.g., medical office buildings), so a unique constraint on address fields alone would be incorrect. A unique constraint on `(npi, address_hash)` might be more appropriate to prevent duplicate location records per provider.

### 6. Should Provider fields be normalized to consistent camelCase with @map?

**Finding:** Yes. 12 fields on Provider use raw snake_case without `@map` directives (lines 17-32). This creates inconsistency in TypeScript code where some fields are accessed as `provider.lastName` (camelCase) and others as `provider.middle_name` (snake_case). The `transformProvider` function in `providers.ts` already handles the mapping (e.g., `middleName: provider.middle_name`, line 140), but normalizing at the schema level would be cleaner.
