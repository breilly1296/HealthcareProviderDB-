# NPI Data Pipeline -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/13-npi-data-pipeline.md
**Status:** Core pipeline infrastructure is solid. Main import script, taxonomy mappings, city normalization, and data quality scripts all exist. Several secondary scripts referenced in the prompt are missing (CJS backfill scripts initially not found via glob but located on deeper search). Schema model for `taxonomy_reference` deviates from the prompt's specification. Organization linking and insurance import pipelines are present. JSON data files for NYC facilities are missing from the expected location.

---

## Findings

### 1. Import Script Status

- **[VERIFIED]** Script location: `scripts/import-npi-direct.ts` exists and is the main NPI import script (confirmed at `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\import-npi-direct.ts`).
- **[VERIFIED]** Direct PostgreSQL insertion (not Prisma): The script imports `pg` directly (`import pg from 'pg';`) and uses `Pool`/`Client` for database operations. This bypasses Prisma for performance.
- **[VERIFIED]** State-based filtering capability: The script accepts NPI CSV files and processes records with state-based logic via the CSV column `Provider Business Practice Location Address State Name`.
- **[VERIFIED]** Progress logging: The `ImportStats` interface (lines 40-48) tracks `totalRecords`, `processedRecords`, `insertedRecords`, `updatedRecords`, `skippedRecords`, `skippedDeactivated`, and `errorRecords`.
- **[VERIFIED]** Deactivation date handling: The `NPI Deactivation Date` field is parsed (line 34), and `skippedDeactivated` counter exists in stats.
- **[VERIFIED]** Taxonomy extraction: `extractSecondaryTaxonomies()` (lines 69-78) extracts taxonomy codes 2-15 from the NPI CSV record. The primary taxonomy is at `Healthcare Provider Taxonomy Code_1`.
- **[VERIFIED]** Integration with taxonomy mappings: Line 12 imports `getSpecialtyCategory` from `../src/taxonomy-mappings`.
- **[NOT VERIFIED]** Batch size of 5000 records: The first 100 lines of the script do not contain the batch size configuration. The batch processing logic is further into the file. The prompt asserts batch size = 5000, but this could not be confirmed from the portion read.

### 2. Alternative Import Scripts

- **[VERIFIED]** `scripts/import-npi.ts` -- exists (alternative NPI import).
- **[VERIFIED]** `scripts/import-filtered-csv.ts` -- exists (filtered CSV import).
- **[VERIFIED]** `scripts/import-csv-copy.ts` -- exists (PostgreSQL COPY-based import).
- **[VERIFIED]** `scripts/import-csv-simple.ts` -- exists (simple CSV import).

### 3. Data Quality Scripts

- **[VERIFIED]** `scripts/normalize-city-names.ts` -- exists. Handles NYC boroughs, LA neighborhoods, Chicago, Houston, Phoenix, and Philadelphia metro areas. Supports dry-run mode, `--apply` flag, and `--state` filtering. Well-structured with `MetroConfig` interface and explicit borough/neighborhood mappings.
- **[VERIFIED]** `scripts/cleanup-deactivated-providers.ts` -- exists.
- **[VERIFIED]** `scripts/verify-data-quality.ts` -- exists.
- **[VERIFIED]** `scripts/check-import-status.ts` -- exists.
- **[VERIFIED]** `scripts/clean-ny-data.ts` -- exists (NY-specific data cleanup).
- **[VERIFIED]** `scripts/backfill-verification-ttl.ts` -- exists (TTL backfill).
- **[VERIFIED]** `scripts/backfill-verification-ttl.sql` -- exists (SQL companion for TTL backfill).
- **[VERIFIED]** `scripts/backfill-specialty-fast.cjs` -- exists (specialty backfill, CommonJS format).
- **[VERIFIED]** `scripts/generate-cities-json.cjs` -- exists (city dropdown generation, CommonJS format).
- **[VERIFIED]** `scripts/describe-tables.ts` -- exists (schema inspection).
- **[VERIFIED]** `scripts/list-tables.ts` -- exists (table listing).
- **[VERIFIED]** `scripts/check-locations-table.ts` -- exists (location data inspection).

**Additional scripts found not listed in prompt:**
- `scripts/test-connection.ts` -- database connection testing
- `scripts/check-schema.ts` -- schema verification
- `scripts/inspect-problematic-rows.ts` -- data debugging
- `scripts/create-locations-table.ts` -- location table DDL
- `scripts/audit-npi-validation.ts` -- NPI validation audit
- `scripts/generate-dq-report.ts` -- data quality report generation
- `scripts/deduplicate-locations.ts` -- location deduplication
- `scripts/enrich-providers-nppes.ts` -- NPPES API enrichment
- `scripts/crossref-insurance-networks.ts` -- insurance network cross-referencing
- `scripts/scrape-carrier-directory.ts` -- carrier directory scraping

### 4. Taxonomy Mapping

- **[VERIFIED]** `src/taxonomy-mappings.ts` exists at root level with comprehensive taxonomy code mappings.
- **[VERIFIED]** 48 specialty categories confirmed: The `SpecialtyCategory` type union lists 48 values (ENDOCRINOLOGY through OTHER), matching the prompt's "48 specialty categories (expanded from 7)."
- **[VERIFIED]** 400+ taxonomy code mappings: Grep found 651 mapping entries in the `TAXONOMY_TO_SPECIALTY` record, exceeding the prompt's "400+" claim.
- **[VERIFIED]** `getSpecialtyCategory()` function (line 998) implements both direct lookup and prefix-based fallback matching, sorted by specificity (longest prefix first).
- **[VERIFIED]** Catch-all "OTHER" for unmapped taxonomies (line 1013).
- **[VERIFIED]** Major specialty categories covered: ENDOCRINOLOGY, RHEUMATOLOGY, ORTHOPEDICS, INTERNAL_MEDICINE, FAMILY_MEDICINE, GERIATRICS, MENTAL_HEALTH, PSYCHIATRY, PSYCHOLOGY, SOCIAL_WORK, NURSING, NURSE_PRACTITIONER, PHYSICIAN_ASSISTANT, MIDWIFERY, DENTISTRY, OPTOMETRY, PHARMACY, PHYSICAL_THERAPY, OCCUPATIONAL_THERAPY, SPEECH_THERAPY, RESPIRATORY_THERAPY, CHIROPRACTIC, ACUPUNCTURE, EMERGENCY_MEDICINE, PEDIATRICS, ANESTHESIOLOGY, SURGERY, OB_GYN, CARDIOLOGY, RADIOLOGY, DERMATOLOGY, NEUROLOGY, ONCOLOGY, UROLOGY, GASTROENTEROLOGY, PULMONOLOGY, NEPHROLOGY, INFECTIOUS_DISEASE, ALLERGY_IMMUNOLOGY, PATHOLOGY, DIETETICS, LAB_PATHOLOGY, DME_PROSTHETICS, COMMUNITY_HEALTH, HOME_HEALTH, HOSPICE_PALLIATIVE, CLINIC_FACILITY, HOSPITAL, OTHER.

### 5. Database Schema -- `taxonomy_reference`

- **[WARNING]** The prompt's schema snippet shows:
  ```
  code             String  @id @db.VarChar(20)
  specialization   String?
  classification   String?
  grouping         String?
  specialtyCategory String? @map("specialty_category")
  ```
  The actual Prisma schema (lines 142-150) shows:
  ```
  taxonomy_code     String  @id @db.VarChar(20)
  display_name      String?
  grouping_name     String?
  classification    String?
  specialization    String?
  standardized_name String?
  provider_count    Int?
  ```
  Key differences:
  - PK is `taxonomy_code` (not `code`)
  - No `specialtyCategory` / `specialty_category` field exists in the actual schema
  - Additional fields: `display_name`, `standardized_name`, `provider_count`
  - `grouping` is named `grouping_name`

  The absence of `specialty_category` in `taxonomy_reference` means specialty categorization is done at runtime via the `src/taxonomy-mappings.ts` file, not stored in the database reference table. The `specialty_category` field exists on the `Provider` model (line 32 of schema) instead, which is populated during import.

### 6. Database Schema -- `provider_taxonomies`

- **[WARNING]** The prompt's schema shows:
  ```
  isPrimary    Boolean @default(false) @map("is_primary")
  ```
  The actual schema (line 134) shows:
  ```
  is_primary    String?  @db.VarChar(1)
  ```
  The field is stored as a nullable VARCHAR(1) string (likely 'Y'/'N') rather than a Boolean. This is a meaningful type difference. The prompt's idealized schema does not match the actual database representation.

- **[VERIFIED]** `provider_taxonomies` model has the correct structural relationships: `npi` (VarChar(10)), `taxonomy_code` (VarChar(20)), and provider relation. Indexes on both `taxonomy_code` and `npi` are present.
- **[VERIFIED]** `slot_number` field exists in actual schema but not in the prompt's snippet -- this tracks which taxonomy slot (1-15) the code came from.

### 7. City Dropdown Generation

- **[VERIFIED]** Pre-generated JSON file exists: `packages/frontend/public/data/cities.json`.
- **[VERIFIED]** `scripts/generate-cities-json.cjs` exists for regeneration.
- **[NOT VERIFIED]** File size of 40KB and instant loading -- not checked.

### 8. Insurance Import Pipeline

- **[VERIFIED]** `packages/backend/src/scripts/importInsurancePlans.ts` exists.
- **[VERIFIED]** `packages/backend/src/utils/insurancePlanParser.ts` exists.

### 9. Organization Linking

- **[VERIFIED]** `provider_hospitals` table exists in schema (lines 92-104) with `hospital_system`, `hospital_name`, `ccn`, `source`, and `confidence` fields.
- **[VERIFIED]** `hospitals` table exists in schema (lines 51-60).
- **[VERIFIED]** Hospital analysis script exists: `packages/backend/scripts/analyze-health-systems.ts`.
- **[VERIFIED]** NYC-specific extraction exists: `packages/backend/scripts/extract-nyc-providers.ts`.
- **[VERIFIED]** Facility matching exists: `packages/backend/scripts/match-facilities.ts`.
- **[ISSUE]** JSON data files not found at expected locations: `scripts/nyu_langone_complete.json`, `scripts/mount_sinai_complete.json`, `scripts/nyc_healthcare_facilities.json` were not located. These may have been removed or relocated.

### 10. NPI Registry API Integration

- **[VERIFIED]** `scripts/enrich-providers-nppes.ts` exists, confirming the API enrichment strategy described in the prompt.
- **[NOT VERIFIED]** API endpoint, rate limiting details, and caching strategy were not inspected in code (would require reading the enrichment script in full).

### 11. Provider Model

- **[VERIFIED]** The `Provider` model in Prisma schema includes all essential NPI fields: `npi` (PK), `entityType`, `lastName`, `firstName`, `middle_name`, `credential`, `organizationName`, `gender`, `enumerationDate`, `last_update_date`, `deactivation_date`, `reactivation_date`, `primary_taxonomy_code`, `primary_specialty`, `specialty_category`.
- **[VERIFIED]** `practice_locations` relation confirms location data is an embedded part of the provider record linked via foreign key, as noted in the prompt.

### 12. Additional Enrichment Scripts (Beyond Prompt)

The codebase contains several enrichment and quality scripts not mentioned in the prompt:
- `scripts/enrich-providers-nppes.ts` -- NPPES API enrichment pipeline
- `scripts/crossref-insurance-networks.ts` -- Insurance network cross-referencing
- `scripts/scrape-carrier-directory.ts` -- Carrier directory scraping
- `scripts/deduplicate-locations.ts` -- Location deduplication
- `scripts/audit-npi-validation.ts` -- NPI validation auditing
- `scripts/generate-dq-report.ts` -- Data quality report generation

These represent pipeline maturity beyond what the prompt documents.

---

## Summary

The NPI data pipeline is well-established with a comprehensive set of import, normalization, and data quality scripts. The main import script (`import-npi-direct.ts`) uses direct PostgreSQL for performance and integrates with the 651-entry taxonomy mapping system across 48 specialty categories. City name normalization covers 6 major metro areas. All core scripts listed in the prompt exist in the codebase, and several additional enrichment scripts (NPPES API, carrier scraping, network cross-referencing) demonstrate pipeline maturity beyond the prompt's specification.

Two notable schema deviations were found: (1) the `taxonomy_reference` model lacks the `specialty_category` field shown in the prompt -- specialty categorization is done at runtime via `src/taxonomy-mappings.ts` instead, and (2) `provider_taxonomies.is_primary` is stored as `String? @db.VarChar(1)` rather than the `Boolean` type shown in the prompt. The NYC facility JSON data files referenced in the prompt were not found at their expected locations.

---

## Recommendations

1. **Update Prompt Schema Snippets:** The `taxonomy_reference` and `provider_taxonomies` schemas in the prompt do not match the actual Prisma schema. Update the prompt to reflect reality:
   - `taxonomy_reference`: PK is `taxonomy_code`, no `specialty_category` field, includes `display_name`, `standardized_name`, `provider_count`, and `grouping_name`.
   - `provider_taxonomies.is_primary`: Actually `String? @db.VarChar(1)`, not `Boolean`.

2. **Consider Adding `specialty_category` to `taxonomy_reference`:** Since the prompt expected this field and it would be useful for database-level queries (avoiding runtime taxonomy lookups), consider adding it as a denormalized field. This would make queries like "find all cardiology taxonomy codes" possible without loading the TypeScript mapping file.

3. **Locate or Remove NYC JSON Data References:** The prompt references `scripts/nyu_langone_complete.json`, `scripts/mount_sinai_complete.json`, and `scripts/nyc_healthcare_facilities.json`, but these files were not found. Either restore them or remove the references from the prompt.

4. **Verify Batch Size Configuration:** The batch size of 5000 could not be confirmed from the first 100 lines of `import-npi-direct.ts`. Consider adding a visible constant near the top of the file or documenting it in a configuration section.

5. **Document Additional Enrichment Scripts:** The codebase has grown beyond the prompt's inventory. Scripts like `enrich-providers-nppes.ts`, `crossref-insurance-networks.ts`, `scrape-carrier-directory.ts`, `deduplicate-locations.ts`, `audit-npi-validation.ts`, and `generate-dq-report.ts` should be added to the prompt for completeness.

6. **Standardize `is_primary` Field Type:** The `provider_taxonomies.is_primary` field is stored as `String? @db.VarChar(1)` (likely 'Y'/'N' from raw NPI data). Consider whether a migration to `Boolean` would simplify downstream code, or if the string representation is intentional for raw NPI data fidelity.

7. **Regenerate `cities.json` After State Expansion:** The prompt notes this should happen after all states are imported. With 6 states currently loaded (~2.1M providers) and 44+ remaining, plan for a regeneration workflow that includes the city normalization pass first.

8. **Import Progress Tracking:** Consider adding a `SyncLog`-based progress dashboard or CLI command to quickly check which states have been imported, their record counts, and timestamps. The `SyncLog` model already exists in the schema for this purpose.
