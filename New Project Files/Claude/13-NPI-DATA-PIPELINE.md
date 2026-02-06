# NPI Data Pipeline

**Last Updated:** 2026-02-06
**Total Providers:** ~2.1M (estimated from 6 states)
**States Imported:** 6/50

---

## Import Progress

### Completed States
| State | Providers | Import Time | Notes |
|-------|-----------|-------------|-------|
| FL | 613,875 | ~110 min | Largest after CA |
| AL | 90,572 | ~88 min | |
| AK | 34,701 | ~40 min | Smallest import |
| AR | 82,527 | ~81 min | |
| AZ | 167,899 | ~163 min | |
| CA | 1,113,464 | Overnight | Largest state import |
| **Total** | **~2,103,038** | | |

### In Progress
- No states currently in progress based on codebase review.

### Remaining
- 44 states + DC + territories (~7M additional providers estimated)
- CO, CT, DE, GA, HI, ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY, DC

---

## Import Script Status

- **Script location:** `scripts/import-npi-direct.ts` -- confirmed in codebase
- **Batch size:** 5000 records -- confirmed at line 150: `const batchSize = 5000;`
- **Direct PostgreSQL insertion (not Prisma):** Confirmed. Uses `pg.Pool` with raw SQL `INSERT ... ON CONFLICT` statements (upsert pattern)
- **State-based filtering:** The script itself does not filter by state. It imports ALL providers from a given CSV file. State filtering is done by providing a state-specific CSV file via `--file` argument.
- **Progress logging:** Confirmed. Logs every 10,000 records with processed count, imported count, skipped count, and elapsed time (line 253-255)
- **Deactivated provider filtering:** Confirmed. Skips providers with a deactivation date and no subsequent reactivation (lines 264-275)
- **Sync log tracking:** Confirmed. Creates a `sync_logs` entry at start (`IN_PROGRESS`) and updates to `COMPLETED` or `FAILED` on finish (lines 112-336)
- **File hash tracking:** Confirmed. Calculates SHA-256 hash of input file to track which files have been imported (line 108)
- **Retry logic:** Confirmed. Up to 3 retries on connection errors with 2-second delays (lines 238-242)
- **Connection pooling:** Confirmed. Uses `pg.Pool` with `max: 5` connections (line 101)

---

## Data Quality Issues

### City Names
**Problem:** NPI data contains inconsistent city names including typos, trailing state codes, trailing punctuation, and neighborhood names used as city names.
**Examples:** "Birmingam" vs "Birmingham", "Birmingham,al", "Brooklyn" vs "New York"
**Decision:** Clean up after all imports complete. A comprehensive normalization script exists at `scripts/normalize-city-names.ts` covering 6 major metros (NYC, LA, Chicago, Houston, Phoenix, Philadelphia) with hundreds of neighborhood-to-city mappings and common typo corrections.
**Script capabilities:**
- Dry run mode (default) and `--apply` mode
- State-specific filtering with `--state` flag
- Transactional application (ROLLBACK on error)
- Before/after statistics reporting
- Handles trailing state codes, zip codes, multiple spaces, and case variations

### Deactivated Providers
**Problem:** ~0.2% of providers in the NPI data have deactivation dates
**Current approach:** The import script (`import-npi-direct.ts`) **filters out deactivated providers during import** (lines 264-275). Providers are skipped if they have a deactivation date AND either no reactivation date or a reactivation date before the deactivation date.
**Tracking:** Skipped deactivated count is tracked in `stats.skippedDeactivated` and reported in the import summary.

### Address Reliability
**Problem:** NPI data is self-reported and rarely updated by providers. Providers may show outdated practice addresses.
**Impact:** Address-based organization linking is unreliable. A user's therapist was found to show an OLD address in the NPI data.
**Decision:** Do not rely on addresses for organization linking (skipped for MVP). Addresses are still imported and displayed but users are warned about potential inaccuracy.

---

## Specialty Categories

**Current:** 55 specialty category types defined in `src/taxonomy-mappings.ts` (exported as `SpecialtyCategory` union type), with 400+ explicit taxonomy code mappings in `TAXONOMY_TO_SPECIALTY` plus 80+ prefix-based fallback mappings in `PREFIX_MAPPINGS`.

**Categories:**
- **Primary Care:** FAMILY_MEDICINE, INTERNAL_MEDICINE, GENERAL_PRACTICE, GERIATRICS
- **Medical Specialties:** CARDIOLOGY, DERMATOLOGY, ENDOCRINOLOGY, GASTROENTEROLOGY, NEPHROLOGY, NEUROLOGY, ONCOLOGY, PULMONOLOGY, RHEUMATOLOGY, INFECTIOUS_DISEASE, ALLERGY_IMMUNOLOGY
- **Surgical:** SURGERY, ORTHOPEDICS, PLASTIC_SURGERY, COLON_RECTAL_SURGERY, OB_GYN
- **Mental Health:** MENTAL_HEALTH, PSYCHIATRY, PSYCHOLOGY, SOCIAL_WORK
- **Nursing/Mid-Level:** NURSING, NURSE_PRACTITIONER, PHYSICIAN_ASSISTANT, MIDWIFERY
- **Therapy:** PHYSICAL_THERAPY, OCCUPATIONAL_THERAPY, SPEECH_THERAPY, RESPIRATORY_THERAPY
- **Other Clinical:** EMERGENCY_MEDICINE, PEDIATRICS, ANESTHESIOLOGY, RADIOLOGY, PATHOLOGY, UROLOGY, OPHTHALMOLOGY, OPTOMETRY, DENTISTRY, PHARMACY, PODIATRY, CHIROPRACTIC, ACUPUNCTURE, DIETETICS, NUCLEAR_MEDICINE, PREVENTIVE_MEDICINE, PHYSICAL_MEDICINE_REHAB
- **Support/Facility:** LAB_PATHOLOGY, DME_PROSTHETICS, COMMUNITY_HEALTH, HOME_HEALTH, HOSPICE_PALLIATIVE, CLINIC_FACILITY, HOSPITAL, OTHER

**Mapping Quality:**
- Two-tier matching: exact code lookup first, then prefix-based fallback sorted by specificity (longest prefix first)
- Descriptions available for ~180 common taxonomy codes in `TAXONOMY_DESCRIPTIONS`
- Fallback to category label formatting (e.g., "ENDOCRINOLOGY" becomes "Endocrinology") when no specific description exists
- Any unmapped taxonomy code returns `'OTHER'`

**Database Schema:**
- `taxonomy_reference` table stores the official NUCC taxonomy code list with `taxonomy_code`, `display_name`, `classification`, `specialization`, `grouping_name`, `standardized_name`, and `provider_count`
- `provider_taxonomies` table links providers to taxonomy codes with `is_primary` flag and `slot_number` (supports up to 15 taxonomy codes per provider as extracted by `extractSecondaryTaxonomies()`)

---

## Performance Metrics

### Import Speed
- **Batch Size:** 5000 records
- **Average Time:** ~100 minutes per 100k providers (based on AL: 88 min for 91k)
- **Total ETA for remaining ~7M:** ~70 hours of import time (approximately 3 days of continuous import)

### Database Performance
- **Total Records:** ~2.1M providers across 6 states
- **Indexes:** Defined in Prisma schema on `specialty_category`, `credential`, `gender`, `lastName`, `primary_specialty`, `primary_taxonomy_code` for the providers table; `city`, `npi`, `state`, `zip_code`, `address_hash` for practice_locations
- **Connection pooling:** Import uses `pg.Pool` with max 5 connections; runtime API uses Prisma connection pool

---

## NPI Registry API Strategy

**Bulk Download:**
- Used for initial database population via NPPES Data Dissemination CSV files
- Provides searchable foundation with ~9.2M total providers (10.8GB CSV)
- State-by-state import strategy to manage file size and progress tracking

**API Integration:**
- Endpoint: `https://npiregistry.cms.hhs.gov/api/?version=2.1`
- `parent_organization_lbn` only available for Type 2 subparts (organizations)
- Individual providers (Type 1) have NO employer field in the API
- API is rate-limited -- best for on-demand enrichment, not bulk
- Planned for provider detail page enrichment with caching to avoid re-querying

---

## Organization Linking

**Status:** Skipped for MVP

**Reason:** NPI address data is self-reported and rarely updated. Testing showed providers frequently list outdated addresses. Example: 698 providers sharing the "Cathedral Home for Children" address, 350 at "Cheyenne VA Medical Center" -- but individual provider addresses are unreliable for linking.

**Current Infrastructure:** Database tables exist for future use:
- `provider_hospitals` table with hospital_system, hospital_name, ccn, source, confidence fields
- `hospitals` table with ccn (primary key), hospital_name, hospital_system, address, city, state, zip_code, phone
- Scripts: `analyze-health-systems.ts`, `extract-nyc-providers.ts`, `match-facilities.ts`
- JSON data files: `nyu_langone_complete.json`, `mount_sinai_complete.json`, `nyc_healthcare_facilities.json`

**Future Consideration:** Revisit when a more reliable data source for provider-organization relationships becomes available (e.g., CMS claims data, direct carrier network files).

---

## City Dropdown

**Current:**
- Dynamic generation via `getCitiesByState()` in `providerService.ts` which queries `practice_locations` table for distinct cities by state
- Results are title-cased and deduplicated
- Static generation script exists: `scripts/generate-cities-json.cjs`
- States available: FL, AL, AK, AR, AZ, CA (the 6 imported states)

**Next Steps:**
- [ ] Regenerate cities data after all states imported
- [ ] Run city name normalization (`normalize-city-names.ts`) across all imported data
- [ ] Consider adding coordinates for proximity search (not currently in schema)

---

## Next Actions

1. **Immediate:**
   - [ ] Complete remaining state imports (44 states + DC + territories)
   - [ ] Run normalize-city-names.ts for already-imported states (AZ already supported)

2. **After imports complete:**
   - [ ] Run city name normalization across all data
   - [ ] Regenerate cities dropdown data
   - [ ] Database optimization (VACUUM ANALYZE after bulk imports)
   - [ ] Verify data quality with `scripts/verify-data-quality.ts`

3. **Future:**
   - [ ] NPI API integration for on-demand provider detail enrichment
   - [ ] Monthly delta updates from NPPES weekly/monthly dissemination files
   - [ ] Organization linking (revisit when better data source available)
   - [ ] Expand normalize-city-names.ts to cover more metros as new states are imported
