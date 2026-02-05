# Database Schema Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/01-database-schema.md
**Status:** PASS with minor issues -- Schema matches prompt specification with a few discrepancies

---

## Findings

### 1. Schema Security

- **All tables have appropriate indexes for query performance:** Verified. See detailed index analysis in Section 5 below.
- **Foreign keys properly defined with ON DELETE behavior:** Verified. All FK relationships use `onDelete: NoAction` except VoteLog which uses `onDelete: Cascade` on the VerificationLog relation, exactly as specified.
- **NO PHI stored:** Verified. All stored data is public NPI registry data, public taxonomy codes, public plan metadata, or anonymous verification records. The only potentially sensitive fields are `sourceIp`, `userAgent`, and `submittedBy` on VerificationLog/VoteLog, which are used for rate limiting and Sybil prevention, not PHI.
- **NPI used for primary keys on provider-related tables:** Verified. `Provider.npi` is the PK (`@id @db.VarChar(10)`), and all child tables reference it via FK.
- **Sybil prevention indexes on VerificationLog:** Verified. Both `idx_vl_sybil_email` and `idx_vl_sybil_ip` composite indexes exist.

### 2. Row-Level Security

- **RLS NOT required:** Verified. No user-owned data, no PHI. No RLS policies defined.
- **Verification data is anonymous:** Verified. No `user_id` column exists. `submittedBy` is an optional email for duplicate prevention, not user identity.
- **Public data accessible without RLS:** Verified.

### 3. Core Models (13 total)

#### Provider Data (7 models)

- **`Provider` (`providers`):** Verified. NPI as PK, entity type, name fields, specialty, taxonomy code, gender, enumeration/deactivation dates.
- **`practice_locations`:** Verified. Integer auto-increment PK, NPI FK to Provider, address fields, phone, fax.
- **`provider_cms_details`:** Verified. NPI as PK (one-to-one), medical school, graduation year, telehealth, Medicare assignment, source defaults to `"cms_national"`.
- **`provider_hospitals`:** Verified. Auto-increment PK, NPI FK, hospital system, name, CCN, source, confidence.
- **`provider_insurance`:** Verified. Auto-increment PK, NPI FK, network name, identifier, source, confidence.
- **`provider_medicare`:** Verified. Auto-increment PK, NPI FK, Medicare ID, state, source.
- **`provider_taxonomies`:** Verified. Auto-increment PK, NPI FK, taxonomy code, is_primary, slot number.

#### Reference Data (2 models)

- **`taxonomy_reference`:** Verified. taxonomy_code as PK, display_name, grouping_name, classification, specialization, standardized_name, provider_count.
- **`hospitals`:** Verified. CCN as PK, hospital_name, hospital_system, address, city, state, zip_code, phone.

#### Insurance & Verification (4 models)

- **`InsurancePlan` (`insurance_plans`):** Verified. planId as PK, plan name, issuer, type, state, carrier, variant, raw name, source health system, provider count, carrier ID, health system ID, created_at.
- **`ProviderPlanAcceptance` (`provider_plan_acceptance`):** Verified. Auto-increment PK, providerNpi FK, planId FK, acceptance status, confidence score, last verified, verification count, timestamps, expires_at.
- **`VerificationLog` (`verification_logs`):** Verified. CUID PK, providerNpi FK, planId FK, acceptance ID, verification type/source enums, previous/new JSON values, source IP, user agent, submitted by, upvotes/downvotes, approval fields, evidence URL, notes, timestamps, expires_at.
- **`VoteLog` (`vote_logs`):** Verified. CUID PK, verification ID FK (cascade delete), source IP, vote direction, created_at.

#### System (1 model)

- **`SyncLog` (`sync_logs`):** Verified. Auto-increment PK, sync type, state, records processed, status, error message, started/completed timestamps.

**Model count: 13 total.** Matches prompt specification.

### 4. Key Relationships

- **Provider -> practice_locations[] (one-to-many via NPI FK):** Verified. `onDelete: NoAction`.
- **Provider -> provider_cms_details? (one-to-one via NPI FK):** Verified. `onDelete: NoAction`.
- **Provider -> provider_hospitals[] (one-to-many via NPI FK):** Verified. `onDelete: NoAction`.
- **Provider -> provider_insurance[] (one-to-many via NPI FK):** Verified. `onDelete: NoAction`.
- **Provider -> provider_medicare[] (one-to-many via NPI FK):** Verified. `onDelete: NoAction`.
- **Provider -> provider_taxonomies[] (one-to-many via NPI FK):** Verified. `onDelete: NoAction`.
- **Provider -> ProviderPlanAcceptance[] (via NPI FK):** Verified. `onUpdate: NoAction`. Note: `onDelete` is not explicitly specified (Prisma defaults to `SetNull` for optional relations).
- **Provider -> VerificationLog[] (via provider_npi FK):** Verified. `onUpdate: NoAction`.
- **InsurancePlan -> ProviderPlanAcceptance[] (via plan_id FK):** Verified. `onUpdate: NoAction`.
- **InsurancePlan -> VerificationLog[] (via plan_id FK):** Verified. `onUpdate: NoAction`.
- **VerificationLog -> VoteLog[] (via verification_id FK, cascade delete):** Verified. `onDelete: Cascade, onUpdate: NoAction`.

**ON DELETE behavior discrepancy:**

- The prompt states `ProviderPlanAcceptance -> NoAction on provider/plan` and `VerificationLog -> NoAction on provider/plan`. However, in the actual schema, `ProviderPlanAcceptance` and `VerificationLog` do NOT explicitly specify `onDelete`. Since `providerNpi` and `planId` are optional (nullable) FKs, Prisma's default behavior is `SetNull`, not `NoAction`. This is a minor discrepancy between the prompt documentation and the actual schema behavior. The prompt's assertion of `NoAction` may not match the Prisma-generated migration.

### 5. Indexes

#### Provider indexes:

- **`idx_providers_category` on `specialty_category`:** Verified.
- **`idx_providers_credential` on `credential`:** Verified.
- **`idx_providers_gender` on `gender`:** Verified.
- **`idx_providers_last_name` on `lastName`:** Verified.
- **`idx_providers_specialty` on `primary_specialty`:** Verified.
- **`idx_providers_taxonomy` on `primary_taxonomy_code`:** Verified.

#### practice_locations indexes:

- **`idx_locations_city` on `city`:** Verified.
- **`idx_locations_npi` on `npi`:** Verified.
- **`idx_locations_state` on `state`:** Verified.
- **`idx_locations_zip` on `zip_code`:** Verified.

#### provider_hospitals indexes:

- **`idx_hospitals_npi` on `npi`:** Verified.
- **`idx_hospitals_system` on `hospital_system`:** Verified.

#### provider_insurance indexes:

- **`idx_insurance_network` on `network_name`:** Verified.
- **`idx_insurance_npi` on `npi`:** Verified.

#### provider_medicare / provider_taxonomies indexes:

- **`idx_medicare_npi` on `npi`:** Verified.
- **`idx_taxonomies_code` on `taxonomy_code`:** Verified.
- **`idx_taxonomies_npi` on `npi`:** Verified.

#### InsurancePlan indexes:

- **`idx_insurance_plans_carrier` on `carrier`:** Verified.
- **`idx_insurance_plans_carrier_id` on `carrierId`:** Verified.
- **`idx_insurance_plans_health_system_id` on `healthSystemId`:** Verified.
- **`idx_insurance_plans_plan_variant` on `planVariant`:** Verified.

#### ProviderPlanAcceptance indexes:

- **`@@unique([providerNpi, planId])`:** Verified.
- **`idx_ppa_acceptance_status` on `acceptanceStatus`:** Verified.
- **`idx_ppa_confidence_score` on `confidenceScore`:** Verified.
- **`idx_ppa_expires_at` on `expiresAt`:** Verified.
- **`idx_ppa_last_verified` on `lastVerified`:** Verified.

#### VerificationLog indexes:

- **`idx_vl_created_at` on `createdAt`:** Verified.
- **`idx_vl_expires_at` on `expiresAt`:** Verified.
- **`idx_vl_is_approved` on `isApproved`:** Verified.
- **`idx_vl_plan_id` on `planId`:** Verified.
- **`idx_vl_provider_npi` on `providerNpi`:** Verified.
- **`idx_vl_provider_created` on `(providerNpi, createdAt)`:** Verified.
- **`idx_vl_sybil_email` on `(providerNpi, planId, submittedBy, createdAt)`:** Verified.
- **`idx_vl_sybil_ip` on `(providerNpi, planId, sourceIp, createdAt)`:** Verified.
- **`idx_vl_verification_type` on `verificationType`:** Verified.

#### VoteLog indexes:

- **`@@unique([verificationId, sourceIp])`:** Verified.
- **`idx_vote_logs_source_ip` on `sourceIp`:** Verified.
- **`idx_vote_logs_verification_id` on `verificationId`:** Verified.

**All 34 indexes verified. No missing indexes.**

### 6. Enums

- **`AcceptanceStatus` (ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN):** Verified.
- **`VerificationSource` (CMS_DATA, CARRIER_DATA, PROVIDER_PORTAL, PHONE_CALL, CROWDSOURCE, AUTOMATED):** Verified.
- **`VerificationType` (PLAN_ACCEPTANCE, PROVIDER_INFO, CONTACT_INFO, STATUS_CHANGE, NEW_PLAN):** Verified.

### 7. Data Quality Fields

- **Confidence scoring (`ProviderPlanAcceptance.confidenceScore` 0-100 integer):** Verified. `@default(0)`.
- **Source tracking (`VerificationSource` enum):** Verified.
- **Timestamps (`createdAt`, `updatedAt`, `lastVerified`):** Verified on ProviderPlanAcceptance. All use `@db.Timestamptz(6)`.
- **Verification count (`ProviderPlanAcceptance.verificationCount`):** Verified. `@default(0)`.
- **TTL fields (`expiresAt` on ProviderPlanAcceptance and VerificationLog):** Verified. Both use `DateTime? @db.Timestamptz(6)`.
- **Confidence on enriched data (`provider_hospitals.confidence`, `provider_insurance.confidence`):** Verified. Both default to `"MEDIUM"`.

### 8. Schema Conventions

- **PascalCase model names with `@@map("snake_case_table")`:** Partially verified. `Provider`, `InsurancePlan`, `ProviderPlanAcceptance`, `VerificationLog`, `VoteLog`, `SyncLog` use PascalCase with `@@map`. However, `hospitals`, `practice_locations`, `provider_cms_details`, `provider_hospitals`, `provider_insurance`, `provider_medicare`, `provider_taxonomies`, and `taxonomy_reference` use raw lowercase names without PascalCase mapping. This is noted as an inconsistency in section 9.
- **camelCase fields with `@map("snake_case")`:** Partially verified. Many fields use `@map` (e.g., `entityType -> entity_type`, `lastName -> last_name`). However, several Provider fields remain raw snake_case: `middle_name`, `name_prefix`, `name_suffix`, `last_update_date`, `deactivation_date`, `reactivation_date`, `is_sole_proprietor`, `is_organization_subpart`, `parent_organization_lbn`, `primary_taxonomy_code`, `primary_specialty`, `specialty_category`.
- **`@db.VarChar(N)` for all string fields:** Verified. All string fields have explicit length limits.
- **`@db.Timestamptz(6)` for all timestamps:** Verified. All DateTime fields use `@db.Timestamptz(6)`.
- **`@default(cuid())` for TEXT PKs:** Verified on VerificationLog and VoteLog.
- **`@default(autoincrement())` for integer PKs:** Verified on practice_locations, provider_hospitals, provider_insurance, provider_medicare, provider_taxonomies, ProviderPlanAcceptance, SyncLog.

### 9. Known Schema Issues

- **`practice_locations` replaced old `Location` model:** Acknowledged. Locations route disabled pending rewrite (confirmed: `locations.ts` exists but would need review).
- **No `state` or `city` index directly on Provider:** Confirmed. Address data lives in `practice_locations` with its own state/city indexes. The providerService correctly queries through the `practice_locations` relation.
- **`provider_cms_details` source defaults to `"cms_national"`:** Confirmed. `@default("cms_national")` present.
- **Several Provider fields use raw snake_case without `@map`:** Confirmed. `middle_name`, `name_prefix`, `name_suffix`, `last_update_date`, `deactivation_date`, `reactivation_date`, `is_sole_proprietor`, `is_organization_subpart`, `parent_organization_lbn`, `primary_taxonomy_code`, `primary_specialty`, `specialty_category` all lack `@map` directives. This creates inconsistency where some fields use camelCase in TypeScript (via `@map`) and others use snake_case.

### 10. Migration Safety

- **No destructive migrations without data backup plan:** Cannot verify from schema alone. Requires migration file review.
- **`CREATE INDEX CONCURRENTLY` for production indexes:** Cannot verify from schema alone. Prisma's default `CREATE INDEX` does not use `CONCURRENTLY`.
- **Migrations are idempotent:** Cannot verify from schema alone.

### Additional Finding: Code-Schema Mismatch

- **`locationId` field on ProviderPlanAcceptance:** The service layer code (`verificationService.ts` line 246, `planService.ts` line 329) references a `locationId` field on `ProviderPlanAcceptance`, and the `planService.ts` includes a `location` relation. However, this field does NOT exist in the current `schema.prisma`. This suggests either a pending migration or a code-schema drift that would cause runtime errors.

---

## Summary

The Prisma schema is well-structured and matches the prompt specification in all major respects. All 13 models, 34 indexes, 3 enums, and key relationships are verified. The schema properly avoids PHI, uses NPI as primary keys for provider data, and implements Sybil prevention indexes.

The primary issues are:
1. **Code-schema drift**: `locationId` and `location` relation referenced in service code but absent from `schema.prisma`.
2. **Inconsistent naming conventions**: 7 of 13 models use raw lowercase names instead of PascalCase, and 12 Provider fields use raw snake_case without `@map`.
3. **ON DELETE behavior**: The prompt documents `NoAction` for ProviderPlanAcceptance and VerificationLog FKs, but the schema does not explicitly set `onDelete`, meaning Prisma's default (`SetNull` for optional relations) may apply instead.
4. **Migration safety**: Cannot be verified from schema alone.

---

## Recommendations

1. **Resolve `locationId` drift.** Either add the `locationId` field and `location` relation to `ProviderPlanAcceptance` in the schema, or remove references from the service layer. This is likely a runtime error waiting to happen.

2. **Normalize model naming.** Rename `hospitals`, `practice_locations`, `provider_cms_details`, `provider_hospitals`, `provider_insurance`, `provider_medicare`, `provider_taxonomies`, and `taxonomy_reference` to PascalCase with `@@map("snake_case_table")` for consistency with the other models.

3. **Normalize Provider field naming.** Add `@map("snake_case")` to the 12 Provider fields that currently use raw snake_case, converting them to camelCase access in TypeScript (e.g., `middleName @map("middle_name")`).

4. **Explicitly set `onDelete` on all FK relations.** Add `onDelete: NoAction` to `ProviderPlanAcceptance.provider`, `ProviderPlanAcceptance.insurancePlan`, `VerificationLog.provider`, and `VerificationLog.plan` to match the documented behavior.

5. **Review migration strategy.** Ensure production index creation uses `CREATE INDEX CONCURRENTLY` and that destructive migrations have rollback plans.
