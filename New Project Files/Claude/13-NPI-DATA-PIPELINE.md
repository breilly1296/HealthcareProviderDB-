# NPI Data Pipeline

**Last Updated:** 2026-02-07
**Total Provider Records:** ~200,000+ (NY state import)
**Target Market:** NYC (5 boroughs)
**Launch:** Q2 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Import Script Inventory](#import-script-inventory)
3. [Primary Import: import-npi-direct.ts](#primary-import-import-npi-directts)
4. [Alternative Import Scripts](#alternative-import-scripts)
5. [Data Quality Scripts](#data-quality-scripts)
6. [Specialty Taxonomy System](#specialty-taxonomy-system)
7. [City Name Normalization](#city-name-normalization)
8. [Deactivated Provider Handling](#deactivated-provider-handling)
9. [Insurance Plan Pipeline](#insurance-plan-pipeline)
10. [Organization Linking Research](#organization-linking-research)
11. [City Dropdown Generation](#city-dropdown-generation)
12. [Database Schema](#database-schema)
13. [NPI Registry API Strategy](#npi-registry-api-strategy)
14. [Performance Metrics](#performance-metrics)
15. [Data Quality Issues](#data-quality-issues)
16. [Next Actions](#next-actions)

---

## Architecture Overview

The NPI data pipeline ingests healthcare provider data from the CMS NPPES (National Plan and Provider Enumeration System) bulk download files into a PostgreSQL database hosted on Google Cloud SQL. The pipeline has evolved through several iterations, each optimizing for performance, reliability, and data quality.

**Source Data:**
- CMS NPPES Data Dissemination (bulk CSV download)
- National file: ~9.2M providers, ~10.8GB CSV
- Strategy: Import NY state file, filtered to NYC 5-borough zip codes for launch
- Estimated NYC providers: 50,000-75,000

**Pipeline Flow:**
```
CMS NPPES Bulk CSV  -->  State-filtered CSV  -->  Import Script  -->  PostgreSQL (Google Cloud SQL)
                                                       |
                                                       v
                                              Taxonomy Mapping (src/taxonomy-mappings.ts)
                                                       |
                                                       v
                                              Post-Import Cleanup Scripts
                                              (city normalization, deactivated cleanup, specialty backfill)
```

---

## Import Script Inventory

The project contains multiple import scripts, representing the evolution of the pipeline. They are listed here in order of importance:

| Script | Purpose | Method | Batch Size | Status |
|--------|---------|--------|------------|--------|
| `scripts/import-npi-direct.ts` | Main NPI import | Direct PostgreSQL (pg) | 5,000 | **Primary** |
| `scripts/import-npi.ts` | Original NPI import | Prisma ORM | 1,000 | Superseded |
| `scripts/import-filtered-csv.ts` | Pre-filtered CSV import | Direct PostgreSQL (pg) | 500 | Active |
| `scripts/import-csv-copy.ts` | PostgreSQL COPY-based import | COPY FROM STDIN | Full file | Experimental |
| `scripts/import-csv-simple.ts` | Simple batched INSERT | Direct PostgreSQL (pg) | 200 | Fallback |

**Supporting Scripts:**

| Script | Purpose |
|--------|---------|
| `scripts/normalize-city-names.ts` | City name cleanup for 6 metro areas |
| `scripts/cleanup-deactivated-providers.ts` | Remove deactivated NPI providers |
| `scripts/backfill-specialty-fast.cjs` | Bulk specialty category backfill |
| `scripts/backfill-verification-ttl.ts` / `.sql` | TTL backfill for verification tables |
| `scripts/generate-cities-json.cjs` | Generate city dropdown JSON |
| `scripts/check-import-status.ts` | Quick import status check |
| `scripts/verify-data-quality.ts` | Data quality verification |
| `scripts/clean-ny-data.ts` | Delete all NY records (reset) |
| `scripts/describe-tables.ts` | Schema inspection utility |
| `scripts/list-tables.ts` | Table listing utility |
| `scripts/check-locations-table.ts` | Location data inspection |

---

## Primary Import: import-npi-direct.ts

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\import-npi-direct.ts`

This is the main import script, using direct PostgreSQL queries via the `pg` library (bypassing Prisma) for Windows ARM64 compatibility.

### How It Works

1. **File Validation:** Checks that the NPI CSV file exists and calculates its SHA-256 hash for sync logging.
2. **Sync Log Entry:** Creates a record in `sync_logs` with file metadata and `IN_PROGRESS` status.
3. **CSV Streaming:** Uses `csv-parse` to stream the CSV file with `columns: true`, `trim: true`, and `relax_column_count: true`.
4. **Record Transformation:** For each CSV row:
   - Extracts NPI, entity type code, name fields, address, phone, fax, dates.
   - Maps primary taxonomy code to a specialty category via `getSpecialtyCategory()` from `src/taxonomy-mappings.ts`.
   - Extracts secondary taxonomy codes from columns 2-15.
   - Parses dates from `MM/DD/YYYY` format.
   - Cleans phone/fax to digits-only (10+ digits required).
   - Determines NPI status (ACTIVE vs DEACTIVATED).
5. **Deactivated Provider Filtering:** Skips providers where `deactivationDate` exists and either no reactivation date is set, or the reactivation date precedes the deactivation date.
6. **Batch Processing:** Accumulates records into batches of 5,000, then executes within a PostgreSQL transaction.
7. **Upsert Logic:** Uses `INSERT ... ON CONFLICT (npi) DO UPDATE SET ...` to handle re-imports gracefully.
8. **Retry Logic:** On connection errors or timeouts, retries up to 3 times with a 2-second delay.
9. **Progress Logging:** Prints progress every 10,000 records with elapsed time.
10. **Completion:** Updates the sync log with final stats and `COMPLETED`/`FAILED` status.

### Key Code: Record Transformation

```typescript
const providerData = {
  npi,
  entityType: entityTypeCode === '1' ? 'INDIVIDUAL' : 'ORGANIZATION',
  firstName: record['Provider First Name'] || null,
  lastName: record['Provider Last Name (Legal Name)'] || null,
  middleName: record['Provider Middle Name'] || null,
  credential: record['Provider Credential Text'] || null,
  organizationName: record['Provider Organization Name (Legal Business Name)'] || null,
  addressLine1: record['Provider First Line Business Practice Location Address'] || '',
  addressLine2: record['Provider Second Line Business Practice Location Address'] || null,
  city: record['Provider Business Practice Location Address City Name'] || '',
  state: record['Provider Business Practice Location Address State Name'] || '',
  zip: (record['Provider Business Practice Location Address Postal Code'] || '').substring(0, 10),
  country: record['Provider Business Practice Location Address Country Code (If outside U.S.)'] || 'US',
  phone: cleanPhone(record['Provider Business Practice Location Address Telephone Number']),
  fax: cleanPhone(record['Provider Business Practice Location Address Fax Number']),
  taxonomyCode: primaryTaxonomy || null,
  taxonomyDescription: getTaxonomyDescription(primaryTaxonomy),
  specialtyCategory: getSpecialtyCategory(primaryTaxonomy),
  secondaryTaxonomies: extractSecondaryTaxonomies(record),
  enumerationDate: parseDate(record['Provider Enumeration Date']),
  lastUpdateDate: parseDate(record['Last Update Date']),
  deactivationDate: parseDate(record['NPI Deactivation Date']),
  reactivationDate: parseDate(record['NPI Reactivation Date']),
  npiStatus: record['NPI Deactivation Date'] && !record['NPI Reactivation Date']
    ? 'DEACTIVATED' : 'ACTIVE',
};
```

### Key Code: Deactivation Filter

```typescript
const deactivationDate = parseDate(record['NPI Deactivation Date']);
const reactivationDate = parseDate(record['NPI Reactivation Date']);

if (deactivationDate && (!reactivationDate || reactivationDate < deactivationDate)) {
  stats.skippedDeactivated++;
  stats.skippedRecords++;
  continue;
}
```

### CLI Usage

```bash
npx tsx scripts/import-npi-direct.ts --file ./data/npidata_NY.csv
npx tsx scripts/import-npi-direct.ts --file ./data/npidata_NY.csv --database "postgresql://user:pass@host:5432/db"
```

### Connection Pool Configuration

```typescript
const pool = new Pool({
  connectionString: databaseUrl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});
```

---

## Alternative Import Scripts

### import-npi.ts (Original Prisma-based Import)

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\import-npi.ts`

The original import script using Prisma ORM. Superseded by `import-npi-direct.ts` due to:
- Windows ARM64 SWC compatibility issues with Prisma
- Slower batch size (default 1,000)
- Prisma transaction overhead

**Key difference:** This script includes a **specialty filter** mode (default enabled) that only imports providers matching specific taxonomy codes for osteoporosis-relevant specialties (endocrinology, rheumatology, orthopedics, internal medicine, family medicine, geriatrics). The `--all-specialties` flag disables this filter.

**Key difference:** Supports `--states` flag for state-based filtering (e.g., `--states FL,CA,NY`).

**Key difference:** Includes a `downloadNPIFile()` function for downloading NPPES files directly via HTTP/HTTPS.

### import-filtered-csv.ts (Pre-filtered CSV Import)

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\import-filtered-csv.ts`

Imports from pre-filtered CSV files with a simplified column structure (`npi`, `entity_type`, `name`, `specialty`, `specialty_code`, etc.). Includes:

- **Name parsing:** Splits a combined `name` field into `firstName`, `lastName`, `credential`, and `organizationName`. Handles prefixes (DR., MR., etc.), credentials after commas, and title-casing.
- **String sanitization:** Removes null bytes (`\x00`) and control characters.
- **Multi-row INSERT:** Builds a single `INSERT INTO ... VALUES (row1), (row2), ...` statement per batch (500 records).
- **`ON CONFLICT (npi) DO NOTHING`:** Skips duplicates rather than updating.

### import-csv-copy.ts (PostgreSQL COPY Method)

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\import-csv-copy.ts`

Experimental script using PostgreSQL's native `COPY FROM STDIN` for maximum throughput. Processes the entire CSV into a tab-delimited in-memory buffer, then sends it to PostgreSQL in a single COPY operation.

**Characteristics:**
- Reads and transforms all CSV data into memory first.
- Uses `COPY ... FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`.
- Handles escaping for COPY format (backslashes, newlines, tabs, NULLs).
- Claimed 10-100x faster than INSERT statements.
- Single connection (`max: 1`).

### import-csv-simple.ts (Simple Batched INSERT)

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\import-csv-simple.ts`

Two-phase import: parses entire CSV into memory first, then inserts in small batches of 200 records. Designed as a reliable fallback when other methods have issues.

---

## Data Quality Scripts

### check-import-status.ts

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\check-import-status.ts`

Quick status check that queries:
- Count of NY records in `providers` table
- Total count of all records in `providers` table

### verify-data-quality.ts

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\verify-data-quality.ts`

Comprehensive data quality verification for NY state records:
1. **Individual Name Parsing Samples:** Shows 10 individual providers with first_name, last_name, credential.
2. **Organization Name Parsing Samples:** Shows 10 organization providers.
3. **Date Conversion Samples:** Shows 10 providers with enumeration_date and last_updated.
4. **Overall Statistics:** Field population percentages for first_name, last_name, credential, organization_name, enumeration_date, last_updated, phone, specialty.

### describe-tables.ts

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\describe-tables.ts`

Schema inspection utility that describes the column structure of: `providers`, `provider_plan_acceptance`, `insurance_plans`, `sync_logs`, `verifications`.

### clean-ny-data.ts

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\clean-ny-data.ts`

Deletes all NY records from the providers table. Used for re-importing NY data from scratch.

### backfill-verification-ttl.ts / .sql

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\backfill-verification-ttl.ts`

Backfills `expires_at` (TTL) for the `provider_plan_acceptance` and `verification_logs` tables. Based on research showing 12% annual provider turnover, verifications expire after 6 months.

**TTL Calculation:**
- `provider_plan_acceptance`: `last_verified + 6 months` (falls back to `created_at + 6 months`)
- `verification_logs`: `created_at + 6 months`

**Modes:** Dry run (default) and `--apply` for actual updates. Runs inside a transaction.

---

## Specialty Taxonomy System

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\src\taxonomy-mappings.ts`

### Overview

The taxonomy mapping system translates CMS NUCC Health Care Provider Taxonomy codes into human-readable specialty categories. It uses a two-tier approach: direct exact-match lookup, then prefix-based fallback matching.

### Specialty Categories (54 total)

The system defines 54 specialty category types:

**Primary Care:**
- `FAMILY_MEDICINE` - Family Medicine (207Q*)
- `INTERNAL_MEDICINE` - Internal Medicine (207R*)
- `GENERAL_PRACTICE` - General Practice (208D*)
- `GERIATRICS` - Geriatric Medicine (207QG*, 207RG0300*)
- `PEDIATRICS` - Pediatrics (2080*)

**Medical Specialties:**
- `CARDIOLOGY` - Cardiovascular Disease (207RC*)
- `DERMATOLOGY` - Dermatology (207N*)
- `ENDOCRINOLOGY` - Endocrinology (207RE*, 261QE*)
- `GASTROENTEROLOGY` - Gastroenterology (207RG0100*)
- `INFECTIOUS_DISEASE` - Infectious Disease (207RI0200*)
- `NEPHROLOGY` - Nephrology (207RN*)
- `NEUROLOGY` - Neurology (2084N*)
- `ONCOLOGY` - Oncology/Hematology-Oncology (207RH0003*, 207RX*)
- `PULMONOLOGY` - Pulmonary Disease (207RP*)
- `RHEUMATOLOGY` - Rheumatology (207RR*, 261QR*)
- `ALLERGY_IMMUNOLOGY` - Allergy & Immunology (207K*)

**Surgical Specialties:**
- `SURGERY` - General Surgery (2086*, 208G*)
- `ORTHOPEDICS` - Orthopaedic Surgery (207X*)
- `OB_GYN` - Obstetrics & Gynecology (207V*)
- `OPHTHALMOLOGY` - Ophthalmology (207W*)
- `UROLOGY` - Urology (2088*)
- `PLASTIC_SURGERY` - Plastic Surgery (2082*)
- `COLON_RECTAL_SURGERY` - Colon & Rectal Surgery (208C*)

**Mental Health:**
- `PSYCHIATRY` - Psychiatry (2084*)
- `PSYCHOLOGY` - Psychology (103*)
- `MENTAL_HEALTH` - Counseling, Marriage & Family Therapy (101Y*, 106*)
- `SOCIAL_WORK` - Social Work (104*)

**Nursing & Mid-Level Providers:**
- `NURSING` - Registered Nurse, LPN, LVN (163W*, 164*)
- `NURSE_PRACTITIONER` - Nurse Practitioners (363L*)
- `PHYSICIAN_ASSISTANT` - Physician Assistants (363A*)
- `MIDWIFERY` - Midwives (171M*, 176B*)

**Therapy & Rehabilitation:**
- `PHYSICAL_THERAPY` - Physical Therapy (2251*, 2252*)
- `OCCUPATIONAL_THERAPY` - Occupational Therapy (225X*, 224Z*)
- `SPEECH_THERAPY` - Speech-Language Pathology (235*, 237*)
- `RESPIRATORY_THERAPY` - Respiratory Therapy (227*, 367*)
- `PHYSICAL_MEDICINE_REHAB` - PM&R (2081*)
- `CHIROPRACTIC` - Chiropractic (111N*)
- `ACUPUNCTURE` - Acupuncture (1711*)

**Other Clinical:**
- `EMERGENCY_MEDICINE` - Emergency Medicine (207P*)
- `ANESTHESIOLOGY` - Anesthesiology (207L*)
- `RADIOLOGY` - Radiology (2085*, 247100*)
- `PATHOLOGY` - Pathology (207Z*)
- `NUCLEAR_MEDICINE` - Nuclear Medicine (207U*)
- `PREVENTIVE_MEDICINE` - Preventive Medicine (2083*)
- `PODIATRY` - Podiatry (213E*)
- `DENTISTRY` - Dentistry (122*, 123*, 124*, 125*, 126*)
- `OPTOMETRY` - Optometry (152W*, 156*)
- `PHARMACY` - Pharmacy (183*, 331*, 332*, 333*)
- `DIETETICS` - Dietetics/Nutrition (133*, 136*)

**Support & Facilities:**
- `LAB_PATHOLOGY` - Lab Technicians (374*, 246*, 247*, 291*, 292*, 293*)
- `DME_PROSTHETICS` - DME & Prosthetics (310*, 332B*, 335*)
- `COMMUNITY_HEALTH` - Community Health (172V*, 251*)
- `HOME_HEALTH` - Home Health (251E*, 311*, 313*, 314*)
- `HOSPICE_PALLIATIVE` - Hospice/Palliative (251G*, 315*)
- `CLINIC_FACILITY` - Clinics/Centers (261Q*, 193*, 390*, 341*, 343*)
- `HOSPITAL` - Hospitals (273*, 275*, 276*, 281*, 282*, 283*, 284*, 286*)
- `OTHER` - Catch-all for unmapped codes

### Mapping Architecture

The system has **~410+ direct taxonomy code mappings** in `TAXONOMY_TO_SPECIALTY` (exact code-to-category lookup), plus **~70+ prefix rules** in `PREFIX_MAPPINGS` for fallback matching.

**Lookup Priority:**
1. Exact match in `TAXONOMY_TO_SPECIALTY` (e.g., `'207RE0101X' -> 'ENDOCRINOLOGY'`)
2. Prefix match in `SORTED_PREFIX_MAPPINGS` (sorted by length, longest first, e.g., `'207RE' -> 'ENDOCRINOLOGY'`)
3. Default to `'OTHER'`

```typescript
export function getSpecialtyCategory(taxonomyCode: string | null | undefined): SpecialtyCategory {
  if (!taxonomyCode) return 'OTHER';

  // Direct lookup for exact matches (most accurate)
  if (TAXONOMY_TO_SPECIALTY[taxonomyCode]) {
    return TAXONOMY_TO_SPECIALTY[taxonomyCode];
  }

  // Prefix matching (sorted by length - longest/most specific first)
  for (const [prefix, category] of SORTED_PREFIX_MAPPINGS) {
    if (taxonomyCode.startsWith(prefix)) {
      return category;
    }
  }

  return 'OTHER';
}
```

### Taxonomy Description Lookup

The `getTaxonomyDescription()` function returns human-readable names for ~200+ common taxonomy codes, falling back to a formatted category label (e.g., `'ENDOCRINOLOGY'` becomes `'Endocrinology'`).

### Database Schema for Taxonomies

```prisma
model taxonomy_reference {
  taxonomy_code     String  @id @db.VarChar(20)
  display_name      String? @db.VarChar(200)
  grouping_name     String? @db.VarChar(200)
  classification    String? @db.VarChar(200)
  specialization    String? @db.VarChar(200)
  standardized_name String? @db.VarChar(200)
  provider_count    Int?
}

model provider_taxonomies {
  id            Int      @id @default(autoincrement())
  npi           String   @db.VarChar(10)
  taxonomy_code String?  @db.VarChar(20)
  is_primary    String?  @db.VarChar(1)
  slot_number   Int?
  providers     Provider @relation(fields: [npi], references: [npi])
}
```

### Specialty Backfill Script

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\backfill-specialty-fast.cjs`

A CommonJS script for bulk updating `specialtyCategory` on existing records. Uses the same prefix-based rules, executing one UPDATE per prefix rule:

```sql
UPDATE providers
SET "specialtyCategory" = $1, "updatedAt" = NOW()
WHERE "taxonomyCode" LIKE $2
AND ("specialtyCategory" IS NULL OR "specialtyCategory" != $1)
```

Rules are sorted by prefix length (longest first) to ensure specific codes match before broader patterns. Remaining unmapped records are set to `'OTHER'`.

---

## City Name Normalization

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\normalize-city-names.ts`

### Overview

NPI data contains inconsistent city names from self-reported provider records. The normalization script maps neighborhood names, common misspellings, and abbreviations to canonical city/borough names.

### Supported Metro Areas

| Metro | State | Primary City | Mapping Count (approx.) |
|-------|-------|-------------|------------------------|
| NYC | NY | New York | ~424 mappings (5 boroughs + neighborhoods) |
| Los Angeles | CA | Los Angeles | ~160+ mappings |
| Chicago | IL | Chicago | ~130+ mappings |
| Houston | TX | Houston | ~115+ mappings |
| Phoenix | AZ | Phoenix | ~60+ mappings |
| Philadelphia | PA | Philadelphia | ~130+ mappings |

### NYC Normalization Logic

NYC city names are normalized to the 5 canonical borough names:

| Borough | Normalized To | Example Variations |
|---------|---------------|-------------------|
| Manhattan | "New York" | "NYC", "MANHATTAN", "MANHATTEN", "HARLEM", "TRIBECA", "CHELSEA", "MIDTOWN", etc. |
| Brooklyn | "Brooklyn" | "BKLYN", "BROOOKLYN", "WILLIAMSBURG", "FLATBUSH", "PARK SLOPE", etc. |
| Queens | "Queens" | "QNS", "FLUSHING", "JAMAICA", "ASTORIA", "JACKSON HEIGHTS", etc. |
| Bronx | "Bronx" | "THE BRONX", "BX", "RIVERDALE", "FORDHAM", "PELHAM BAY", etc. |
| Staten Island | "Staten Island" | "STATEN IS.", "SI", "ST GEORGE", "TOTTENVILLE", etc. |

### Cleanup Patterns

Before mapping, city names are cleaned:
1. Remove trailing state codes (e.g., `"Birmingham,AL"` -> `"Birmingham"`)
2. Remove trailing state names (e.g., `"Houston, Texas"` -> `"Houston"`)
3. Remove appended zip codes (e.g., `"New York 10001"` -> `"New York"`)
4. Normalize multiple spaces

### Usage

```bash
npx tsx scripts/normalize-city-names.ts                    # Dry run (all metros)
npx tsx scripts/normalize-city-names.ts --apply            # Apply changes (all metros)
npx tsx scripts/normalize-city-names.ts --state NY         # Specific state only
npx tsx scripts/normalize-city-names.ts --state NY --apply # Apply for specific state
```

### Export

The `normalizeCityName()` function is exported for use in other scripts:

```typescript
export function normalizeCityName(city: string, state: string): string {
  const normalized = normalizeCity(city, state);
  return normalized || city; // Return original if no normalization found
}
```

---

## Deactivated Provider Handling

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\cleanup-deactivated-providers.ts`

### Strategy

Deactivated providers (~0.2% of the NPI registry) are handled in two ways:

1. **At import time:** `import-npi-direct.ts` skips deactivated providers (those with a deactivation date and no subsequent reactivation).
2. **Post-import cleanup:** `cleanup-deactivated-providers.ts` can remove any deactivated providers that slipped through or were imported by older scripts.

### Detection Logic

The cleanup script auto-detects the deactivation column by checking the database schema in priority order:
1. `npi_status = 'DEACTIVATED'`
2. `status IN ('DEACTIVATED', 'deactivated', 'inactive', 'INACTIVE')`
3. `npi_deactivation_date IS NOT NULL AND (npi_reactivation_date IS NULL OR npi_reactivation_date < npi_deactivation_date)`
4. `deactivation_date IS NOT NULL AND (reactivation_date IS NULL OR reactivation_date < deactivation_date)`

### Deletion Process

In `--apply` mode, the script:
1. Collects all NPI numbers matching the deactivation condition.
2. Deletes related `verification_logs` records.
3. Deletes related `provider_plan_acceptance` records.
4. Deletes the providers themselves.
5. All within a single transaction (rollback on error).

### Analysis Output

In dry-run mode, provides:
- Total deactivated count
- Breakdown by state (top 15)
- Breakdown by specialty (top 15)
- Sample of 10 random deactivated providers

---

## Insurance Plan Pipeline

### importInsurancePlans.ts

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\scripts\importInsurancePlans.ts`

Imports insurance plan data from CSV files scraped from hospital websites (e.g., Mount Sinai, NYU Langone). Each CSV row contains an NPI, provider name, and a semicolon/comma-delimited list of accepted insurance plans.

**Process:**
1. Parse CSV file with custom quoted-field parser.
2. For each row, extract NPI and plan list string.
3. Skip rows without valid NPI (must be 10 digits) or without plans.
4. Verify provider exists in database.
5. Parse plan list through `parsePlanList()` from `insurancePlanParser.ts`.
6. Upsert each plan into `insurance_plans` table.
7. Create `provider_plan_acceptance` records with confidence score of 70 (hospital website scrape is a reliable source).
8. Increment `providerCount` on the plan.

### insurancePlanParser.ts

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\utils\insurancePlanParser.ts`

Normalizes raw insurance plan names into structured carrier + variant components.

**Carrier Normalization Examples:**
| Raw Input | Carrier | Variant |
|-----------|---------|---------|
| "Aetna HMO" | Aetna | HMO |
| "Empire Blue Cross Blue Shield - Medicare" | Empire Blue Cross Blue Shield | Medicare |
| "UHC PPO" | UnitedHealthcare | PPO |
| "Oxford" | Oxford Health Plans (UnitedHealthcare) | null |
| "1199SEIU" | 1199SEIU | null |
| "Healthfirst Medicaid" | Healthfirst | Medicaid |

**Plan ID Generation:**
```typescript
export function generatePlanId(parsed: ParsedInsurancePlan): string {
  const carrierSlug = parsed.carrier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .substring(0, 30);
  const variantSlug = parsed.planVariant
    ? parsed.planVariant.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 18)
    : 'general';
  return `${carrierSlug}-${variantSlug}`.substring(0, 50);
}
```

**Supported Carriers (partial list):** Blue Cross Blue Shield, Empire BCBS, Anthem, UnitedHealthcare, Oxford, Aetna, Cigna, Humana, Kaiser Permanente, Healthfirst, Fidelis Care, EmblemHealth (GHI/HIP), Oscar Health, Molina Healthcare, WellCare, Medicare, Medicaid, TRICARE, 1199SEIU, MagnaCare, MultiPlan, PHCS.

---

## Organization Linking Research

### Status: Skipped for MVP

**Hypothesis tested:** Link individual providers (Type 1 NPIs) to healthcare organizations/hospitals via address matching.

**Findings:**
- Address-based matching showed promise at first (e.g., 698 providers at one "Cathedral Home for Children" address, 350 providers at "Cheyenne VA Medical Center").
- However, NPI address data is **self-reported and rarely updated** by providers. User's own therapist showed an OLD address in NPI data.
- NPI Registry API's `parent_organization_lbn` field only exists for Type 2 subparts; individual providers (Type 1) have no employer field.

**Decision:** Skip organization linking for MVP. Address matching is unreliable.

**Existing Infrastructure:**
- `provider_hospitals` table exists for explicit hospital-provider links.
- `hospitals` table stores hospital data (keyed by CCN).
- Analysis scripts exist at:
  - `packages/backend/scripts/analyze-health-systems.ts`
  - `packages/backend/scripts/extract-nyc-providers.ts`
  - `packages/backend/scripts/match-facilities.ts`
- NYC healthcare facility JSON data files: `nyu_langone_complete.json`, `mount_sinai_complete.json`, `nyc_healthcare_facilities.json`

**Future Consideration:** Revisit after launch if there is a better data source for provider-organization relationships (e.g., PECOS data, carrier network files).

---

## City Dropdown Generation

**Location:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\generate-cities-json.cjs`

### Overview

Generates a static JSON file (`/public/data/cities.json`) containing all unique city names grouped by state, for use as a frontend dropdown.

### Process

1. Query `SELECT DISTINCT state, city FROM providers WHERE city IS NOT NULL AND city != ''`.
2. Title-case all city names.
3. Group by state using `Set` for deduplication.
4. Sort states and cities alphabetically.
5. Write to `packages/frontend/public/data/cities.json`.

### Output Format

```json
{
  "NY": ["Albany", "Astoria", "Bayside", "Bronx", "Brooklyn", ...],
  "CA": ["Alhambra", "Arcadia", "Beverly Hills", ...],
  ...
}
```

### Characteristics

- File size: ~40KB (varies with import coverage)
- Instant loading from cache on frontend
- State-based filtering works in frontend
- Should be regenerated after NYC import is complete
- City names need cleanup first (run `normalize-city-names.ts` before regenerating)

---

## Database Schema

### Provider Model

**Table:** `providers`

The central table storing all provider records. Key fields:

```prisma
model Provider {
  npi                      String  @id @db.VarChar(10)
  entityType               String? @map("entity_type") @db.VarChar(1)
  lastName                 String? @map("last_name") @db.VarChar(100)
  firstName                String? @map("first_name") @db.VarChar(100)
  credential               String? @db.VarChar(50)
  organizationName         String? @map("organization_name") @db.VarChar(200)
  gender                   String? @db.VarChar(1)
  enumerationDate          String? @map("enumeration_date") @db.VarChar(10)
  primary_taxonomy_code    String? @db.VarChar(20)
  primary_specialty        String? @db.VarChar(200)
  specialty_category       String? @db.VarChar(100)
  nppesLastSynced          DateTime? @map("nppes_last_synced")
  // ... relations to practice_locations, provider_taxonomies,
  //     provider_hospitals, provider_insurance, verification_logs, etc.
}
```

**Key Indexes:**
- `idx_providers_category` on `specialty_category`
- `idx_providers_credential` on `credential`
- `idx_providers_gender` on `gender`
- `idx_providers_last_name` on `lastName`
- `idx_providers_specialty` on `primary_specialty`
- `idx_providers_taxonomy` on `primary_taxonomy_code`

### Practice Locations

**Table:** `practice_locations`

Provider location data is stored in a separate table linked via NPI (not embedded in the provider record).

```prisma
model practice_locations {
  id            Int     @id @default(autoincrement())
  npi           String  @db.VarChar(10)
  address_type  String? @default("practice") @db.VarChar(10)
  address_line1 String? @db.VarChar(200)
  address_line2 String? @db.VarChar(200)
  city          String? @db.VarChar(100)
  state         String? @db.VarChar(2)
  zip_code      String? @db.VarChar(10)
  phone         String? @db.VarChar(20)
  fax           String? @db.VarChar(20)
  address_hash  String? @db.VarChar(64)
}
```

**Key Indexes:** `idx_locations_city`, `idx_locations_npi`, `idx_locations_state`, `idx_locations_zip`, `idx_locations_address_hash`

### Related Tables

| Table | Purpose | Key |
|-------|---------|-----|
| `provider_taxonomies` | Links providers to multiple taxonomy codes with primary flag | `id` (auto) |
| `taxonomy_reference` | Taxonomy code metadata (display name, classification, grouping) | `taxonomy_code` |
| `provider_cms_details` | CMS enrichment data (medical school, graduation year, telehealth) | `npi` |
| `provider_hospitals` | Provider-hospital affiliations | `id` (auto) |
| `provider_insurance` | Insurance network identifiers from NPI other_id field | `id` (auto) |
| `provider_medicare` | Medicare identifiers from NPI other_id field | `id` (auto) |
| `insurance_plans` | Insurance plan master table | `plan_id` |
| `provider_plan_acceptance` | Provider-plan acceptance records with confidence scores | `id` (auto) |
| `verification_logs` | User-submitted verification records | `id` (cuid) |
| `vote_logs` | Votes on verification records | `id` (cuid) |
| `sync_logs` | Import/sync tracking | `id` (auto) |
| `data_quality_audit` | Data quality issue tracking per provider | `id` (auto) |
| `hospitals` | Hospital master data | `ccn` |

---

## NPI Registry API Strategy

**API Endpoint:** `https://npiregistry.cms.hhs.gov/api/?version=2.1`

### Bulk Download vs. API

| Aspect | Bulk Download | API |
|--------|--------------|-----|
| **Use** | Foundation database population | On-demand enrichment |
| **Volume** | 9.2M+ records | 1 record at a time |
| **Rate Limit** | N/A (file download) | Rate-limited |
| **Data** | Full dataset | Full record detail |
| **Freshness** | Monthly releases | Real-time |
| **Best For** | Initial load, bulk refresh | Provider detail page enrichment |

### Strategy

1. **Bulk Download = Foundation:** Monthly NPPES CSV files provide the searchable provider database.
2. **API = Enrichment:** When a user views a provider detail page, the system can query the NPI API for the most current data.
3. **Cache Enrichments:** Store API responses in `provider_cms_details` to avoid re-querying.

### Key Limitation

The NPI API's `parent_organization_lbn` field only exists for Type 2 subpart NPIs. Individual providers (Type 1) have **no employer/organization field** in the API response.

---

## Performance Metrics

### Import Speed

| Metric | Value |
|--------|-------|
| **Batch Size** | 5,000 records (optimized from initial 100) |
| **Batch Size Evolution** | 100 -> 1,000 -> 5,000 (5-10x speedup) |
| **Speed (from test imports)** | ~40 min per 35k providers, ~110 min per 614k providers |
| **NYC ETA** | ~60-90 minutes for 50-75k providers |
| **Memory Usage** | Acceptable (streaming CSV, no full file in memory) |

### Connection Pool Settings

```typescript
// import-npi-direct.ts
max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
keepAlive: true, keepAliveInitialDelayMillis: 10000

// import-filtered-csv.ts
max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000

// import-csv-copy.ts
max: 1  // single connection for COPY

// import-csv-simple.ts
max: 5
```

### Database Optimization Notes

- Indexes should be created after import (not during) for large bulk loads.
- `VACUUM ANALYZE` should be run after large imports.
- Connection pooling is configured in all import scripts.
- Retry logic (3 attempts, 2-second delay) handles transient connection issues.

---

## Data Quality Issues

### City Names

**Problem:** NPI data is self-reported, leading to inconsistent city names including typos, neighborhood names, appended state codes, and abbreviations.

**Examples:**
- "Birmingam" vs "Birmingham" (typo)
- "Birmingham,al" (trailing state code)
- "Birmingham," (trailing punctuation)
- "FLUSHING" instead of "Queens" (NYC neighborhood as city)
- "MANHATTEN" instead of "New York" (misspelling of borough)

**Decision:** Clean up using `normalize-city-names.ts` after imports complete. The script covers 6 major metro areas with 1,000+ mappings total. NYC alone has ~424 mappings covering neighborhoods, misspellings, and abbreviations.

### Deactivated Providers

**Problem:** ~0.2% of NPI records have deactivation dates (retired, deceased, lost license, etc.).

**Current Approach:**
- Filtered out during import in `import-npi-direct.ts` (deactivation date check).
- Post-import cleanup available via `cleanup-deactivated-providers.ts`.
- No "deactivated" badge in the UI; simply excluded from search results.

### Address Reliability

**Problem:** NPI addresses are self-reported and rarely updated by providers. Many providers still show old practice addresses.

**Impact:** Cannot reliably use addresses for:
- Organization linking (providers at same address != same organization)
- Practice verification (address may be outdated)

**Decision:** Do not rely on addresses for org linking. Use addresses for search/display only with appropriate caveats. Consider NPI API enrichment for individual provider detail pages.

---

## Next Actions

### 1. Immediate (Pre-Launch)

- [ ] Complete NYC provider data import (NY state file filtered to NYC 5-borough zip codes)
- [ ] Enrich provider data with CMS details (medical school, graduation year, telehealth flag)
- [ ] Run `normalize-city-names.ts --state NY --apply` for NYC city name cleanup
- [ ] Populate insurance plan data for NYC major carriers:
  - UnitedHealthcare / Oxford
  - Aetna
  - Cigna
  - Empire Blue Cross Blue Shield
  - Healthfirst
  - Fidelis Care
  - EmblemHealth (GHI/HIP)
  - MetroPlus
  - 1199SEIU
- [ ] Run `backfill-specialty-fast.cjs` if any providers lack specialty categories

### 2. After NYC Import Complete

- [ ] Run `cleanup-deactivated-providers.ts --apply` to remove any remaining deactivated providers
- [ ] Regenerate `cities.json` for NYC boroughs via `generate-cities-json.cjs`
- [ ] Run `VACUUM ANALYZE` on the database
- [ ] Run `verify-data-quality.ts` to validate data completeness

### 3. Future (Post-Launch)

- [ ] NPI API integration for provider detail page enrichment
- [ ] Monthly delta updates (download monthly NPPES file, import only changes)
- [ ] Expand beyond NYC (tri-state area: NJ, CT; then national)
- [ ] Revisit organization linking with better data sources (PECOS, carrier network files)
- [ ] Consider adding coordinates to city data for proximity search
- [ ] Add borough-level filtering for NYC search
