---
tags:
  - data
  - pipeline
  - implemented
type: prompt
priority: 2
updated: 2026-02-18
---

# NPI Data Pipeline Review

## Files to Review

### Import Scripts (`scripts/`)
- `scripts/pre-import-check.ts` (safety check — enriched record counts, pending conflicts)
- `scripts/import-npi-direct.ts` (main NPI import — batch 5000, direct PostgreSQL, enrichment-safe)
- `scripts/import-npi.ts` (alternative NPI import — Prisma-based, enrichment-safe)
- `scripts/import-filtered-csv.ts` (filtered CSV import)
- `scripts/import-csv-copy.ts` (PostgreSQL COPY-based import)
- `scripts/import-csv-simple.ts` (simple CSV import)
- `scripts/normalize-city-names.ts` (city name cleanup)
- `scripts/cleanup-deactivated-providers.ts` (deactivated provider handling)
- `scripts/backfill-verification-ttl.ts` / `.sql` (TTL backfill)
- `scripts/backfill-specialty-fast.cjs` (specialty backfill)
- `scripts/generate-cities-json.cjs` (city dropdown generation)
- `scripts/check-import-status.ts` (import status verification)
- `scripts/verify-data-quality.ts` (data quality checks)
- `scripts/clean-ny-data.ts` (NY-specific data cleanup)
- `scripts/enrich-providers-nppes.ts` (NPPES API enrichment — fill-not-overwrite)

### Schema & Taxonomy
- `src/taxonomy-mappings.ts` (specialty mappings — root level)
- `packages/backend/prisma/schema.prisma` (Provider, practice_locations, provider_taxonomies, taxonomy_reference models)

### Insurance Import
- `packages/backend/src/scripts/importInsurancePlans.ts` (plan import pipeline)
- `packages/backend/src/utils/insurancePlanParser.ts` (plan parsing/normalization)

### Data Quality
- `scripts/describe-tables.ts`, `scripts/list-tables.ts` (schema inspection)
- `scripts/check-locations-table.ts` (location data inspection)

**Note:** Provider location data is stored in `practice_locations` table (not a separate `Location` model). This is an embedded part of the provider record linked via `@@map("practice_locations")` in Prisma, not a separate entity.

## VerifyMyProvider NPI Architecture
- **Source:** NPPES Data Dissemination (CMS)
- **Size:** 9.2M providers nationally (10.8GB CSV)
- **Strategy:** NYC-focused import from NY state file
- **Target Market:** NYC (5 boroughs) — estimated 50,000-75,000 providers
- **Launch:** Q2 2026

## Checklist

### 1. Import Script Status
- [ ] Script location: `scripts/import-npi-direct.ts`
- [ ] Batch size: 5000 records (optimized)
- [ ] Direct PostgreSQL insertion (not Prisma)
- [ ] State-based filtering works
- [ ] Progress logging implemented

### 2. Data Quality Issues Identified

**City Name Problems:**
- [ ] Typos: "Birmingam" vs "Birmingham"
- [ ] Trailing state codes: "Birmingham,al"
- [ ] Trailing punctuation: "Birmingham,"
- [ ] **Decision:** Clean up after all imports complete

**Deactivated Providers:**
- [ ] ~0.2% have deactivation dates
- [ ] Most are retired/deceased/lost license
- [ ] **Decision:** Filter out in search OR delete
- [ ] Current approach: Keep in DB, filter in queries

**Address Reliability:**
- [ ] NPI data is self-reported
- [ ] Rarely updated by providers
- [ ] Example: User's therapist shows OLD address
- [ ] **Decision:** Don't rely on addresses for org linking

### 3. Specialty Categories

**Current Implementation:**
- [x] 48 specialty categories (expanded from 7)
- [x] 400+ taxonomy code mappings in `src/taxonomy-mappings.ts`
- [x] Primary care, medical, surgical, mental health, etc.
- [x] Catch-all "Other" for unmapped taxonomies
- [x] Database table: `taxonomy_reference` stores taxonomy code → specialty mapping
- [x] Provider taxonomies: `provider_taxonomies` links providers to taxonomy codes (primary flag)

**Database Schema:**
```prisma
model taxonomy_reference {
  code             String  @id @db.VarChar(20)
  specialization   String? @db.VarChar(200)
  classification   String? @db.VarChar(200)
  grouping         String? @db.VarChar(200)
  specialtyCategory String? @map("specialty_category") @db.VarChar(100)
}

model provider_taxonomies {
  id           Int     @id @default(autoincrement())
  npi          String  @db.VarChar(10)
  taxonomyCode String  @map("taxonomy_code") @db.VarChar(20)
  isPrimary    Boolean @default(false) @map("is_primary")
  // ... provider relation, indexes
}
```

**Mapping Quality:**
- [ ] All major specialties covered?
- [ ] Any taxonomy codes unmapped?
- [ ] Should we add more granular categories?

### 4. Import Progress Tracking

**NYC Focus (Q2 2026 Launch):**
- [ ] NY state import: Filter to NYC 5-borough zip codes
- [ ] Estimated NYC providers: 50,000-75,000
- [ ] Previous exploration imports (FL, AL, AK, AR, AZ, CA) used for pipeline testing — not the launch dataset

### 5. Performance Optimization

**Batch Size Evolution:**
- [ ] Started: 100 records/batch
- [ ] Current: 5000 records/batch
- [ ] Speedup: 5-10x faster
- [ ] Memory usage: Acceptable

**Import Time (from prior test imports):**
- [ ] ~40 min per 35k providers, ~110 min per 614k providers
- [ ] NYC import (~50-75k providers): estimated ~60-90 minutes

**Database Performance:**
- [ ] Indexes created after import (not during)?
- [ ] VACUUM ANALYZE run after large imports?
- [ ] Connection pooling configured?

### 6. City Dropdown Generation

**Current Implementation:**
- [ ] Pre-generated JSON file: `/public/data/cities.json`
- [ ] File size: 40KB
- [ ] Instant loading from cache
- [ ] State-based filtering works

**Data Quality:**
- [ ] City names need cleanup (typos, duplicates)
- [ ] Should regenerate for NYC boroughs after import
- [ ] Consider deduplication strategy

### 7. Organization Linking Research

**Hypothesis Tested:**
- [x] Link doctors to hospitals via address matching
- [x] Example: 698 providers at "Cathedral Home for Children" address
- [x] Example: 350 providers at "Cheyenne VA Medical Center" address

**Reality Check:**
- [x] User's therapist NPI showed OLD address
- [x] NPI data is self-reported, rarely updated
- [x] **Decision:** Skip org linking for MVP

**Current State:**
- `provider_hospitals` table exists for explicit hospital-provider links
- `hospitals` table stores hospital data
- Hospital analysis script: `packages/backend/scripts/analyze-health-systems.ts`
- NYC-specific extraction: `packages/backend/scripts/extract-nyc-providers.ts`
- Facility matching: `packages/backend/scripts/match-facilities.ts`
- JSON data files: `scripts/nyu_langone_complete.json`, `scripts/mount_sinai_complete.json`, `scripts/nyc_healthcare_facilities.json`

### 8. NPI Registry API Integration

**API Endpoint:**
- [ ] `https://npiregistry.cms.hhs.gov/api/?version=2.1`

**Findings:**
- [ ] `parent_organization_lbn` only for Type 2 subparts
- [ ] Individual providers (Type 1) have NO employer field
- [ ] API is rate-limited
- [ ] Best for on-demand enrichment, not bulk

**Strategy:**
- [ ] Bulk download = foundation (searchable database)
- [ ] API = enrich individual records on provider detail page
- [ ] Cache enrichments to avoid re-querying

## Pipeline Execution Order

For a fresh import, scripts should be run in this order:

1. `pre-import-check.ts` — Safety check (enriched record counts, pending conflicts)
2. `import-npi-direct.ts` — Import base provider data from NPPES CSV (enrichment-safe)
3. `normalize-city-names.ts` — Clean up city name inconsistencies
4. `backfill-specialty-fast.cjs` — Map taxonomy codes to specialty categories
5. `cleanup-deactivated-providers.ts` — Remove deactivated providers
6. `match-facilities.ts` — Match providers to hospital facilities
7. `enrich-location-names.ts` — Enrich location display names
8. Enrichment CSV import — Import practice-level enrichment data (names, websites, hospital systems, insurance, hours, confidence)
9. `importInsurancePlans.ts` — Import insurance plan data from hospital scrapes
10. `backfill-verification-ttl.ts` — Set TTL on any existing verification records
11. `generate-cities-json.cjs` — Generate city list for frontend
12. `verify-data-quality.ts` — Run quality checks and generate audit reports

## Enrichment Protection

All import scripts have been hardened to protect enrichment data:

- `data_source` column on `providers` and `practice_locations` tracks origin (`nppes`, `enrichment`, `user_verification`, `hospital_scrape`)
- `enriched_at` and `enrichment_source` columns on `practice_locations`
- `import_conflicts` table logs cases where new import data conflicts with existing enrichment
- `pre-import-check.ts` runs before any import, showing enriched record counts and pending conflicts
- NPI re-imports only update NPI-sourced fields (name, credential, taxonomy, dates, status)
- Phone/fax only filled if current value is NULL
- Latitude/longitude/geocoded_at/address_hash never overwritten by NPI import
- Confidence scores never downgraded by lower-priority sources

Data priority hierarchy:
1. `user_verification` (highest)
2. `enrichment` (manual verification)
3. `hospital_scrape` (automated)
4. `nppes` (baseline)

## Import Scripts — Enrichment Safety

| Script | Purpose | Enrichment Safe? |
|--------|---------|-----------------|
| `pre-import-check.ts` | Safety check before imports | N/A |
| `import-npi-direct.ts` | Primary NPI import (direct SQL) | Selective update |
| `import-npi.ts` | Alternative NPI import (Prisma) | Selective update |
| `enrich-providers-nppes.ts` | NPPES API enrichment | Fill-not-overwrite |
| `importInsurancePlans.ts` | Hospital scrape insurance | Never downgrades confidence |

## Questions to Ask

### Import Progress
1. Has the NYC-filtered NY import been completed?
2. What's the current NYC provider count?
3. Are all 5 boroughs covered?
4. Are there any zip codes missing from the NYC filter?

### Data Quality
1. Should we clean up city names now or later?
   - Clean as we go?
   - Clean all at once after imports complete?

2. What should we do with deactivated providers?
   - Delete them?
   - Keep but filter out in search?
   - Show with a "deactivated" badge?

3. Are there any other data quality issues discovered?

### Performance
1. Is the current batch size (5000) working well?
   - Too slow?
   - Too fast (memory issues)?

2. Should we parallelize imports?
   - Import multiple states at once?
   - Risk of database lock contention?

3. Are there any database performance issues?
   - Slow queries?
   - Index missing?

### Specialty Mapping
1. Are all relevant specialties covered?
2. Are there any taxonomy codes that should map to different categories?
3. Should we add more granular categories? (e.g., split "Surgery" into subspecialties)

### Organization Linking
1. Should we revisit org linking in the future?
2. Is there a better data source for provider-organization relationships?
3. Would it add value to users?

### City Dropdown
1. When should we regenerate cities.json?
   - After NYC import is complete

2. Should we add borough-level filtering?
3. Should we add coordinates for proximity search?

### Next Steps
1. What's the priority after NYC import is complete?
   - Data enrichment (CMS details, hospital affiliations)?
   - Insurance plan data for NYC carriers?
   - Frontend polish?

## Output Format

```markdown
# NPI Data Pipeline

**Last Updated:** [Date]
**Total Providers:** [count]
**Target Market:** NYC (5 boroughs)
**Launch:** Q2 2026

---

## Import Progress

### NYC Import Status
- [ ] NY state file filtered to NYC zip codes
- [ ] Provider count: [count]
- [ ] All 5 boroughs covered: [yes/no]

---

## Data Quality Issues

### City Names
**Problem:** [description]
**Examples:** [examples]
**Decision:** [what to do]

### Deactivated Providers
**Problem:** [description]
**Current Count:** ~0.2% ([number] providers)
**Decision:** [what to do]

### Address Reliability
**Problem:** [description]
**Impact:** [impact on features]
**Decision:** [what to do]

---

## Specialty Categories

**Current:** 48 categories with 400+ taxonomy mappings

**Categories:**
- Primary Care: [list]
- Medical Specialties: [list]
- Surgical: [list]
[etc]

**Unmapped Taxonomies:** [count and decision]

---

## Performance Metrics

### Import Speed
- **Batch Size:** 5000 records
- **Average Time:** ~X minutes per 100k providers
- **NYC ETA:** ~60-90 minutes for 50-75k providers

### Database Performance
- **Total Records:** [count]
- **Database Size:** [size]
- **Query Performance:** [notes]

---

## NPI Registry API Strategy

**Bulk Download:**
- ✅ Used for initial database population
- ✅ Provides searchable foundation

**API Integration:**
- 📋 Planned for provider detail enrichment
- 📋 On-demand only (rate limited)
- 📋 Cache results to avoid re-querying

---

## Organization Linking

**Status:** ❌ Skipped for MVP

**Reason:** [explanation]

**Future Consideration:** [when to revisit]

---

## City Dropdown

**Current:**
- File: `/public/data/cities.json`
- Size: 40KB
- State: NY (NYC boroughs)

**Next Steps:**
- [ ] Regenerate after NYC import complete
- [ ] Clean up duplicate/typo cities
- [ ] Consider adding coordinates

---

## Next Actions

1. **Immediate (Pre-Launch):**
   - [ ] Complete NYC provider data enrichment (CMS details, hospital affiliations, insurance networks)
   - [ ] Run normalize-city-names.ts for NY state (424+ NYC mappings already exist)
   - [ ] Populate insurance plan data for NYC major carriers (UnitedHealthcare, Aetna, Cigna, MetroPlus, 1199)

2. **After NYC import complete:**
   - [ ] Data cleanup (cities, deactivated providers)
   - [ ] Regenerate cities.json for NYC boroughs
   - [ ] Database optimization (VACUUM ANALYZE)

3. **Future (Post-Launch):**
   - [ ] NPI API integration for provider details
   - [ ] Monthly delta updates
   - [ ] Expand beyond NYC (tri-state area, then national)
```
