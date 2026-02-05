# VerifyMyProvider Data Quality Tracker

**Last Updated:** 2026-02-05
**Generated From:** prompts/23-data-quality-tracker.md

---

## Data Quality Summary

| Dimension | Status | Coverage | Impact |
|-----------|--------|----------|--------|
| NPI Provider Data | 6 states imported (~2.1M) | Partial national | Core search functionality |
| City Name Normalization | Cleanup script exists | 6 major metros | Search accuracy, dropdown quality |
| Deactivated Providers | Cleanup script exists | All imported states | Stale data prevention |
| Insurance Plan Parsing | Parser exists | Major carriers | Plan matching accuracy |
| Specialty Taxonomy Mapping | Backfill script exists | All providers | Specialty filter accuracy |
| Verification Data Integrity | 4-layer protection | All verifications | Confidence score reliability |

---

## NPI Provider Data Quality

### Known Issues

| Issue | Severity | Status | Impact | Remediation |
|-------|----------|--------|--------|-------------|
| City name typos ("Birmingam" vs "Birmingham") | Medium | Cleanup script exists | Missed search results, duplicate cities in dropdown | `scripts/normalize-city-names.ts` |
| Trailing state codes ("Birmingham,al") | Medium | Cleanup script exists | Duplicate cities in dropdown | `scripts/normalize-city-names.ts` |
| Trailing punctuation ("Birmingham,") | Low | Cleanup script exists | Duplicate cities in dropdown | `scripts/normalize-city-names.ts` |
| Neighborhood names as city ("Harlem" vs "New York") | Medium | Cleanup script exists | Fragmented search results | `scripts/normalize-city-names.ts` |
| Deactivated providers (~0.2% of records) | Low | Cleanup script exists | Stale data if not filtered | `scripts/cleanup-deactivated-providers.ts` |
| Stale addresses (self-reported, rarely updated) | Low | Inherent to NPI data | Inaccurate location display | No automated fix possible |
| Only 6 states imported | Intentional | By design | Incomplete national coverage | Import additional states as needed |
| Unmapped taxonomy codes | Medium | Catch-all "Other" category | Incorrect specialty display | `scripts/backfill-specialty-fast.cjs` |

### Geographic Coverage

Currently imported states (6 of 50+):
- New York (NY)
- California (CA)
- Illinois (IL)
- Texas (TX)
- Arizona (AZ)
- Pennsylvania (PA)

Total imported records: ~2.1 million providers

---

## Quality Scripts Inventory

### 1. City Name Normalization

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\normalize-city-names.ts`
**Purpose:** Normalizes inconsistent city names in the `providers` table for major metro areas.

**Supported Metros:**
| Metro | State | Mapping Count | Coverage |
|-------|-------|---------------|----------|
| New York City | NY | ~280+ mappings | Boroughs, neighborhoods, typos, abbreviations |
| Los Angeles | CA | ~170+ mappings | Neighborhoods, unincorporated areas, separate cities |
| Chicago | IL | ~130+ mappings | Neighborhoods, suburbs |
| Houston | TX | ~120+ mappings | Neighborhoods, surrounding areas |
| Phoenix | AZ | ~60+ mappings | Neighborhoods, surrounding cities |
| Philadelphia | PA | ~130+ mappings | Neighborhoods, suburbs (including NJ suburbs) |

**How it works:**
1. Queries all unique city/state combinations from `providers` table
2. Applies cleanup patterns (removes trailing state codes, zip codes, normalizes whitespace)
3. Performs case-insensitive lookup against metro-specific mapping tables
4. In dry-run mode: reports proposed changes with counts
5. In apply mode: executes all changes in a single database transaction (with rollback on error)

**Usage:**
```bash
npx tsx scripts/normalize-city-names.ts                    # Dry run (all metros)
npx tsx scripts/normalize-city-names.ts --apply            # Apply changes (all metros)
npx tsx scripts/normalize-city-names.ts --state NY         # Specific state only
npx tsx scripts/normalize-city-names.ts --state NY --apply # Apply for specific state
```

**Example normalizations:**
- `"HARLEM"` (NY) --> `"New York"` (neighborhood to borough)
- `"MANHATAN"` (NY) --> `"New York"` (typo fix)
- `"BROOKLYN, NY"` (NY) --> `"Brooklyn"` (trailing state removal)
- `"WILLIAMSBURG"` (NY) --> `"Brooklyn"` (neighborhood to borough)
- `"NOHO"` (CA) --> `"Los Angeles"` (abbreviation)
- `"PILSEN"` (IL) --> `"Chicago"` (neighborhood to city)
- `"PHILLY"` (PA) --> `"Philadelphia"` (colloquial to formal)

**Cleanup patterns applied before mapping:**
- Remove trailing state codes (`,NY`, `, CA`, etc.)
- Remove full state names (`, NEW YORK`, `, CALIFORNIA`)
- Remove appended zip codes
- Normalize multiple spaces to single space
- Trim leading/trailing whitespace

**Exported function:** `normalizeCityName(city, state)` is exported for use in other scripts (e.g., during import).

---

### 2. Deactivated Provider Cleanup

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\cleanup-deactivated-providers.ts`
**Purpose:** Identifies and removes deactivated NPI providers from the database.

**How it works:**
1. Auto-detects the deactivation column (checks for `npi_status`, `status`, `npi_deactivation_date`, or `deactivation_date`)
2. Handles reactivation dates (providers reactivated after deactivation are NOT deleted)
3. Provides breakdown by state and specialty before deletion
4. Shows a random sample of 10 providers that will be deleted
5. Hard-deletes in a transaction: verification_logs first, then provider_plan_acceptance, then providers

**Usage:**
```bash
npx tsx scripts/cleanup-deactivated-providers.ts          # Dry run (preview)
npx tsx scripts/cleanup-deactivated-providers.ts --apply  # Apply deletion
```

**Deletion cascade order:**
1. `verification_logs` (WHERE `provider_npi` IN deactivated NPIs)
2. `provider_plan_acceptance` (WHERE `npi` IN deactivated NPIs)
3. `providers` (WHERE deactivation condition met)

**Recommendation embedded in script:** Filter deactivated providers at import time by checking `NPI Deactivation Date` and `NPI Reactivation Date` fields in the NPPES data file, rather than importing and then cleaning up.

---

### 3. Import Status Check

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\check-import-status.ts`
**Purpose:** Quick verification of import completeness. Currently checks NY provider count and total record count.

**Usage:**
```bash
npx tsx scripts/check-import-status.ts
```

**Output:** Total providers, NY-specific count.

**Limitation:** Currently hardcoded to check NY state only. Does not check other imported states or provide per-state breakdowns.

---

### 4. Specialty Backfill

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\backfill-specialty-fast.cjs`
**Purpose:** Backfills specialty categories for providers where the taxonomy code exists but the human-readable specialty name was not populated during initial import.

---

### 5. Data Quality Check Script

**File:** `scripts/verify-data-quality.ts`
**Status:** Does NOT exist. Referenced in the prompt as a desired script but has not been created.

**Recommended implementation:**
- Check for null/empty required fields (npi, state, city)
- Count providers with unmapped taxonomy codes
- Count providers with missing specialty names
- Verify foreign key integrity (plan_acceptance references valid NPI and plan_id)
- Report deactivated provider counts
- Report city name normalization opportunities
- Output summary metrics for tracking over time

---

## Insurance Plan Data Quality

### Plan Name Parsing

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\utils\insurancePlanParser.ts`
**Purpose:** Normalizes raw insurance plan names into canonical carrier and variant fields.

**Carrier alias coverage (from parser):**

| Carrier | Aliases Mapped |
|---------|---------------|
| Blue Cross Blue Shield | `bcbs`, `blue cross`, `blue shield`, `bluecross`, `blueshield` |
| Empire BCBS | `empire bcbs`, `empire blue cross` |
| Anthem BCBS | `anthem`, `anthem bcbs` |
| UnitedHealthcare | `united`, `uhc`, `united healthcare`, `united health`, `oxford` |
| Aetna | `aetna` |
| Cigna | `cigna` |
| Humana | `humana` |
| Kaiser Permanente | `kaiser`, `kaiser permanente` |
| Healthfirst | `healthfirst`, `health first` |
| Fidelis Care | `fidelis`, `fidelis care` |
| EmblemHealth | `emblem`, `emblemhealth`, `ghi`, `hip` |
| Oscar Health | `oscar`, `oscar health` |
| Molina Healthcare | `molina`, `molina healthcare` |
| WellCare | `wellcare` |
| Centene/Ambetter | `centene`, `ambetter` |

**Known Issues:**
- Plan name normalization depends on the completeness of the alias map. New carrier names or regional variations may not be recognized.
- Carrier identification is automated string matching; edge cases with unusual plan naming conventions may produce incorrect groupings.
- Plan-provider link completeness depends on import data quality and whether all acceptance records were included in source files.

---

## Verification Data Quality

### Integrity Controls

| Control | Implementation | File |
|---------|---------------|------|
| **Verification TTL** | 6-month expiration via `expiresAt` field | `config/constants.ts` (`VERIFICATION_TTL_MS`) |
| **Sybil prevention (IP)** | Same IP cannot verify same provider-plan within 30 days | `verificationService.ts` |
| **Sybil prevention (email)** | Same email cannot verify same provider-plan within 30 days | `verificationService.ts` |
| **Rate limiting** | 10 verifications/hour, 10 votes/hour per IP | `middleware/rateLimiter.ts` |
| **CAPTCHA** | reCAPTCHA v3 with 0.5 score threshold | `middleware/captcha.ts` |
| **Consensus threshold** | Min 3 verifications before status change | `config/constants.ts` (`MIN_VERIFICATIONS_FOR_CONSENSUS`) |
| **Confidence threshold** | Min 60 confidence score for status change | `config/constants.ts` (`MIN_CONFIDENCE_FOR_STATUS_CHANGE`) |

### Confidence Score Model

File: `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\confidenceService.ts`

The confidence score is a composite of four factors (0-100 total):

| Factor | Max Points | What It Measures |
|--------|-----------|-----------------|
| Data Source Score | 25 | Authoritativeness of the data source (CMS NPPES = 25, Carrier API = 20, Crowdsource = 15, Automated = 10) |
| Recency Score | 30 | Time since last verification (decays over time) |
| Verification Score | 25 | Number of verifications (optimal at 3, based on Mortensen et al. 2015 research) |
| Agreement Score | 20 | Community consensus (upvote/downvote ratio) |

**Specialty-specific freshness thresholds** (based on Ndumele et al. 2018, Health Affairs):

| Specialty Category | Freshness Threshold | Rationale |
|-------------------|-------------------|-----------|
| Mental Health | 30 days | 43% Medicaid acceptance, high churn |
| Primary Care | 60 days | 12% annual turnover |
| Specialist | 60 days | Similar to primary care |
| Hospital-Based | 90 days | More stable positions |
| Other | 60 days | Default |

### Cold Start Problem

With low verification volume during pre-beta, most provider-plan pairs will have zero or one verification, resulting in low confidence scores. This is expected and will improve as the user base grows. The confidence model is designed to honestly reflect data reliability rather than inflate scores.

---

## Automated Cleanup (Admin Endpoints)

The backend provides admin endpoints for data maintenance, protected by `X-Admin-Secret` authentication:

| Endpoint | Purpose | Designed For |
|----------|---------|-------------|
| `POST /api/v1/admin/cleanup-expired` | Delete expired verification records (older than 6 months) | Cloud Scheduler (daily) |
| `POST /api/v1/admin/cleanup/sync-logs` | Delete sync_logs older than 90 days | Cloud Scheduler (daily) |
| `GET /api/v1/admin/expiration-stats` | View verification expiration statistics | Monitoring |
| `GET /api/v1/admin/retention/stats` | Comprehensive retention stats for all log types | Monitoring |

---

## Data Quality Checklist

- [x] City name issues identified and catalogued
- [x] City normalization cleanup script exists (`normalize-city-names.ts`)
- [x] 6 major metros covered (NYC, LA, Chicago, Houston, Phoenix, Philadelphia)
- [x] Deactivated provider strategy decided (keep in DB + filter in queries; cleanup script available)
- [x] Deactivated provider cleanup script exists (`cleanup-deactivated-providers.ts`)
- [x] Import status verification script exists (`check-import-status.ts`)
- [x] Specialty backfill script exists (`backfill-specialty-fast.cjs`)
- [x] Insurance plan parser with carrier normalization exists
- [x] Verification TTL (6-month expiration) implemented
- [x] Sybil prevention (4 layers) implemented
- [x] Confidence scoring with research-backed thresholds implemented
- [x] Admin cleanup endpoints for expired records exist
- [ ] `verify-data-quality.ts` script does NOT exist yet
- [ ] Automated quality checks NOT in CI/CD pipeline
- [ ] Data quality dashboard NOT built
- [ ] No alerts on quality degradation
- [ ] City normalization not run automatically after imports
- [ ] `check-import-status.ts` only checks NY (not all imported states)

---

## Recommendations

### Short-Term (Before Beta Launch)

1. **Run city normalization** for all 6 imported states:
   ```bash
   npx tsx scripts/normalize-city-names.ts --apply
   ```

2. **Run deactivated provider cleanup** (or verify they are filtered in queries):
   ```bash
   npx tsx scripts/cleanup-deactivated-providers.ts --apply
   ```

3. **Create `verify-data-quality.ts`** to automate quality checks:
   - Null/empty required fields audit
   - Unmapped taxonomy code count
   - Deactivated provider count
   - Foreign key integrity verification
   - City normalization opportunity count

### Medium-Term (Post-Launch)

4. **Integrate city normalization into the import pipeline** so that `normalizeCityName()` is called during NPI data import, eliminating the need for post-import cleanup.

5. **Filter deactivated providers at import time** using the recommendation from `cleanup-deactivated-providers.ts` (check `NPI Deactivation Date` / `NPI Reactivation Date` during import).

6. **Add data quality checks to CI/CD** so that quality regressions are caught before deployment.

7. **Expand `check-import-status.ts`** to report per-state counts for all imported states.

### Long-Term

8. **Build a data quality dashboard** in the admin UI showing:
   - Total providers by state
   - City normalization coverage
   - Deactivated provider percentage
   - Verification volume and confidence score distribution
   - Taxonomy mapping coverage

9. **Set up quality degradation alerts** (e.g., if deactivated provider percentage exceeds 1%, or if city normalization opportunities exceed a threshold after import).

10. **Implement NPPES delta sync** to keep provider data current without full re-imports. The NPPES weekly update files contain only changed records and can be processed incrementally.
