---
tags:
  - data
  - pipeline
  - high
type: prompt
priority: 2
---

# NPI Data Pipeline Review

## Files to Review
- `scripts/import-npi-direct.ts` (import script)
- `scripts/split-npi-by-state.ts` (state splitting)
- `packages/backend/src/taxonomy-mappings.ts` (specialty mappings)
- NPI data files (if available locally)

## VerifyMyProvider NPI Architecture
- **Source:** NPPES Data Dissemination (CMS)
- **Size:** 9.2M providers (10.8GB CSV)
- **Strategy:** State-by-state import (50 separate files)
- **Current:** ~2.1M providers imported (6 states: FL, AL, AK, AR, AZ, CA)
- **Target:** All 50 states + territories

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
- [ ] 48 specialty categories (expanded from 7)
- [ ] 400+ taxonomy code mappings
- [ ] Primary care, medical, surgical, mental health, etc.
- [ ] Catch-all "Other" for unmapped taxonomies

**Mapping Quality:**
- [ ] All major specialties covered?
- [ ] Any taxonomy codes unmapped?
- [ ] Should we add more granular categories?

### 4. Import Progress Tracking

**States Completed:**
- [ ] Florida (FL): 613,875 providers
- [ ] Alabama (AL): 90,572 providers
- [ ] Alaska (AK): 34,701 providers
- [ ] Arkansas (AR): 82,527 providers
- [ ] Arizona (AZ): 167,899 providers
- [ ] California (CA): 1,113,464 providers
- [ ] **Total:** ~2.1M providers

**States Remaining:**
- [ ] 44 states + DC + territories
- [ ] Estimated: ~7M additional providers

### 5. Performance Optimization

**Batch Size Evolution:**
- [ ] Started: 100 records/batch
- [ ] Current: 5000 records/batch
- [ ] Speedup: 5-10x faster
- [ ] Memory usage: Acceptable

**Import Time:**
- [ ] FL (614k): ~110 minutes
- [ ] AL (91k): ~88 minutes
- [ ] AK (35k): ~40 minutes
- [ ] AR (83k): ~81 minutes
- [ ] AZ (168k): ~163 minutes
- [ ] CA (1.1M): Running overnight

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
- [ ] Should regenerate after all states imported
- [ ] Consider deduplication strategy

### 7. Organization Linking Research

**Hypothesis Tested:**
- [ ] Link doctors to hospitals via address matching
- [ ] Example: 698 providers at "Cathedral Home for Children" address
- [ ] Example: 350 providers at "Cheyenne VA Medical Center" address

**Reality Check:**
- [ ] User's therapist NPI showed OLD address
- [ ] NPI data is self-reported, rarely updated
- [ ] **Decision:** Skip org linking for MVP

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

## Questions to Ask

### Import Progress
1. How many states have been imported?
2. What's the current total provider count?
3. Are there any states that failed to import?
4. What's the ETA for completing all 50 states?

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
   - After each state import?
   - After all states complete?

2. Should we add county information?
3. Should we add coordinates for proximity search?

### Next Steps
1. What's the priority after all states are imported?
   - Data cleanup?
   - FHIR integration?
   - Frontend polish?

## Output Format

```markdown
# NPI Data Pipeline

**Last Updated:** [Date]
**Total Providers:** [count]
**States Imported:** X/50

---

## Import Progress

### Completed States
| State | Providers | Import Time | Date Completed |
|-------|-----------|-------------|----------------|
| FL | 613,875 | ~110 min | [date] |
| AL | 90,572 | ~88 min | [date] |
[etc]

### In Progress
- [state]: [status]

### Remaining
- [list of states]

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
- **Total ETA:** [estimate for remaining states]

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
- States: [list]

**Next Steps:**
- [ ] Regenerate after all states imported
- [ ] Clean up duplicate/typo cities
- [ ] Consider adding coordinates

---

## Next Actions

1. **Immediate:**
   - [ ] Complete remaining state imports
   - [ ] [other tasks]

2. **After imports complete:**
   - [ ] Data cleanup (cities, deactivated providers)
   - [ ] Regenerate cities.json
   - [ ] Database optimization (VACUUM ANALYZE)

3. **Future:**
   - [ ] NPI API integration for provider details
   - [ ] Monthly delta updates
   - [ ] Organization linking (revisit)
```
