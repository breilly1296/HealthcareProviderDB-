# NPI Data Pipeline

This document describes the data import pipeline for VerifyMyProvider, covering the NPI data source, import scripts, specialty taxonomy mapping, insurance plan import, and data quality processes.

---

## Data Source

### NPPES Data Dissemination (CMS)
- **Source**: Centers for Medicare & Medicaid Services (CMS) National Plan and Provider Enumeration System (NPPES)
- **URL**: https://download.cms.gov/nppes/NPI_Files.html
- **Total Records**: ~9.2 million providers nationally
- **Format**: CSV files (full weekly dissemination + monthly incremental updates)
- **Cost**: Free (public government data)
- **Auth**: None required

### NYC-Focused Strategy
For the Q2 2026 launch, the import is scoped to New York City (5 boroughs):
- **Target**: ~50,000-75,000 healthcare providers in NYC
- **Boroughs**: Manhattan, Brooklyn, Queens, Bronx, Staten Island
- **Rationale**: Geographic focus solves the cold start problem by concentrating verification activity in a dense provider market

### Testing States
Six states have been imported for development and testing purposes:
- Florida (FL), Alabama (AL), Alaska (AK), Arkansas (AR), Arizona (AZ), California (CA)
- These were used to validate the pipeline before the NYC-focused production import

---

## Import Scripts

### Primary Import

| Script | Purpose |
|--------|---------|
| `scripts/import-npi-direct.ts` | Main NPI import script. Reads NPPES CSV files and inserts directly into PostgreSQL. Batch size: 5,000 records. Processes ~60-90 minutes for NYC dataset. |

The import script handles:
- Parsing NPPES CSV format with all 329+ columns
- Extracting relevant provider fields (NPI, name, credentials, address, taxonomy codes)
- Batch insertion into `providers`, `practice_locations`, and `provider_taxonomies` tables
- Deduplication on NPI (primary key)
- Progress logging with estimated time remaining

### Data Cleanup and Enrichment

| Script | Purpose |
|--------|---------|
| `scripts/normalize-city-names.ts` | Fixes city name inconsistencies from NPPES data (typos, trailing state codes, trailing punctuation, abbreviation variants) |
| `scripts/cleanup-deactivated-providers.ts` | Removes or flags deactivated providers (~0.2% of records have `deactivation_date` set) |
| `scripts/backfill-verification-ttl.ts` | Backfills `expires_at` field on existing verification records with 6-month TTL |
| `scripts/backfill-specialty-fast.cjs` | Fast specialty category assignment using taxonomy-to-specialty mappings |
| `scripts/generate-cities-json.cjs` | Generates static city list JSON for frontend dropdown population |
| `scripts/check-import-status.ts` | Reports import progress and record counts by state |
| `scripts/verify-data-quality.ts` | Runs data quality checks and generates audit reports |
| `scripts/extract-nyc-providers.ts` | Extracts NYC-specific providers from full NPPES dataset |
| `scripts/enrich-location-names.ts` | Enriches location display names |
| `scripts/analyze-health-systems.ts` | Analyzes hospital system affiliations |
| `scripts/match-facilities.ts` | Matches providers to hospital facilities |
| `scripts/seed.ts` | Seeds development database with sample data |

### Insurance Plan Import

| Script | Purpose |
|--------|---------|
| `src/scripts/importInsurancePlans.ts` | Main insurance plan import script |
| `src/scripts/insurancePlanParser.ts` | Parses raw insurance plan data into structured format |

Insurance plan data is imported from CMS marketplace plan data, parsing plan names, carrier information, plan types (HMO, PPO, EPO, POS), and state-level availability.

---

## Specialty Taxonomy System

### Overview
The NPI registry uses NUCC (National Uniform Claim Committee) Healthcare Provider Taxonomy codes to classify provider specialties. VerifyMyProvider maps these ~400+ taxonomy codes into 48 human-readable specialty categories.

### Database Tables

**`taxonomy_reference`** -- Reference table for all taxonomy codes
| Column | Type | Description |
|--------|------|-------------|
| `taxonomy_code` | VARCHAR(20), PK | NUCC taxonomy code (e.g., "207Q00000X") |
| `display_name` | VARCHAR(200) | Human-readable name |
| `grouping_name` | VARCHAR(200) | Top-level grouping |
| `classification` | VARCHAR(200) | Classification within grouping |
| `specialization` | VARCHAR(200) | Sub-specialization |
| `standardized_name` | VARCHAR(200) | Standardized display name |
| `provider_count` | INT | Number of providers with this code |

**`provider_taxonomies`** -- Provider-taxonomy associations (many-to-many)
| Column | Type | Description |
|--------|------|-------------|
| `id` | INT, PK | Auto-incrementing ID |
| `npi` | VARCHAR(10), FK | Provider NPI |
| `taxonomy_code` | VARCHAR(20) | Taxonomy code |
| `is_primary` | VARCHAR(1) | "Y" if primary taxonomy |
| `slot_number` | INT | Taxonomy slot (1-15 per provider) |

### Specialty Categories (48 Categories)
Taxonomy codes are mapped to user-friendly specialty categories via mappings defined in the codebase. Examples:

| Category | Example Taxonomy Codes |
|----------|----------------------|
| Family Medicine | 207Q00000X, 207QA0000X |
| Internal Medicine | 207R00000X, 207RA0000X |
| Psychiatry | 2084P0800X, 2084P0804X |
| Cardiology | 207RC0000X |
| Dermatology | 207N00000X |
| Orthopedic Surgery | 207X00000X |
| Pediatrics | 207V00000X |
| Obstetrics & Gynecology | 207V00000X |
| Emergency Medicine | 207P00000X |
| Radiology | 2085R0202X |

The `specialty_category` field on the `providers` table stores the mapped category for search and filtering.

---

## Data Quality Issues

### Known Issues from NPPES Data

| Issue | Frequency | Mitigation |
|-------|-----------|------------|
| **City name typos** | Common | `normalize-city-names.ts` script corrects known variants |
| **Trailing state codes in city** | Moderate | Regex cleanup in normalization script |
| **Trailing punctuation** | Moderate | Regex cleanup in normalization script |
| **Deactivated providers** | ~0.2% | `cleanup-deactivated-providers.ts` removes/flags these |
| **Stale self-reported addresses** | Common | NPI addresses are self-reported by providers and rarely updated after initial enrollment |
| **Missing taxonomy codes** | Rare | Default to "Other" specialty category |
| **Duplicate practice locations** | Moderate | Address hashing (`address_hash` column) for deduplication |

### Data Quality Audit System
The `data_quality_audit` table tracks data quality issues:

| Column | Description |
|--------|-------------|
| `npi` | Provider with the issue |
| `audit_type` | Type of issue (e.g., "missing_address", "invalid_phone") |
| `severity` | LOW, MEDIUM, HIGH, CRITICAL |
| `field` | Affected database field |
| `current_value` | Current (possibly incorrect) value |
| `expected_value` | Expected correct value |
| `resolved` | Whether the issue has been fixed |

---

## Import Performance

| Metric | Value |
|--------|-------|
| Batch size | 5,000 records per batch |
| NYC import time | ~60-90 minutes |
| Records per second | ~15-20 (with index building) |
| Memory usage | Streaming CSV parsing keeps memory stable |
| Transaction strategy | Batch inserts within transactions for atomicity |

### Import Logging
The import process logs to the `sync_logs` table:

| Column | Description |
|--------|-------------|
| `sync_type` | Type of sync (e.g., "npi_import", "insurance_import") |
| `state` | State being imported |
| `records_processed` | Number of records handled |
| `status` | "running", "completed", "failed" |
| `error_message` | Error details if failed |
| `started_at` | Import start time |
| `completed_at` | Import completion time |

Sync logs are retained for 90 days, cleaned up by the admin `cleanup/sync-logs` endpoint.

---

## Organization Linking

Organization linking (mapping individual providers to their parent organizations using NPPES organization subpart data) has been **skipped for MVP**. Reasons:

1. NPI addresses are self-reported and rarely updated by providers after initial enrollment
2. Organization subpart relationships in NPPES are unreliable for current practice locations
3. Hospital system affiliation is tracked separately via `provider_hospitals` table (enriched from CMS hospital compare data)
4. The `provider_hospitals` table provides more accurate health system associations than NPPES organization data

Future consideration: Use practice location address matching to infer organizational relationships rather than relying on NPPES self-reported data.

---

## Pipeline Execution Order

For a fresh import, scripts should be run in this order:

1. `import-npi-direct.ts` -- Import base provider data from NPPES CSV
2. `normalize-city-names.ts` -- Clean up city name inconsistencies
3. `backfill-specialty-fast.cjs` -- Map taxonomy codes to specialty categories
4. `cleanup-deactivated-providers.ts` -- Remove deactivated providers
5. `match-facilities.ts` -- Match providers to hospital facilities
6. `enrich-location-names.ts` -- Enrich location display names
7. `importInsurancePlans.ts` -- Import insurance plan data
8. `backfill-verification-ttl.ts` -- Set TTL on any existing verification records
9. `generate-cities-json.cjs` -- Generate city list for frontend
10. `verify-data-quality.ts` -- Run quality checks and generate audit reports
