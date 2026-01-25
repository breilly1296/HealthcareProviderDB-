# VerifyMyProvider NPI Data Pipeline Review

**Last Updated:** January 25, 2026
**Priority:** High
**Source:** NPPES Data Dissemination (CMS)
**Current Records:** ~2.1M providers (6 states)

---

## Pipeline Overview

```
CSV File (10.8GB, 9.2M providers)
    ↓
[import-npi-direct.ts] - Streaming + batch processing
    ↓
PostgreSQL (providers table)
    ↓
[normalize-city-names.ts] - Optional cleanup
    ↓
[cleanup-deactivated-providers.ts] - Optional deletion
```

---

## Import Script (`import-npi-direct.ts`)

### Architecture

| Feature | Implementation |
|---------|----------------|
| Database | Direct PostgreSQL (pg library) |
| CSV Parsing | Streaming (csv-parse) |
| Batch Size | 5,000 records/transaction |
| File Integrity | SHA-256 hashing |
| Progress | Real-time stdout every 10K |
| Retries | 3 attempts, 2s backoff |

### Key Features
- **Windows ARM64 compatible** (native pg, not Prisma)
- **Streaming** prevents memory overflow on large files
- **Batch transactions** balance atomicity and throughput
- **Sync log tracking** with detailed statistics

---

## Import Statistics

### States Completed

| State | Providers | Import Time |
|-------|-----------|-------------|
| Florida (FL) | 613,875 | ~110 min |
| Alabama (AL) | 90,572 | ~88 min |
| Alaska (AK) | 34,701 | ~40 min |
| Arkansas (AR) | 82,527 | ~81 min |
| Arizona (AZ) | 167,899 | ~163 min |
| California (CA) | 1,113,464 | ~overnight |
| **Total** | **~2.1M** | |

### Remaining
- 44 states + DC + territories
- Estimated: ~7M additional providers

---

## Taxonomy Mappings

### Coverage
- **876 explicit taxonomy codes** in main mapping file
- **116 prefix-based rules** in import script
- **57 specialty categories** defined

### Mapping Categories

| Category | Code Count | Quality |
|----------|------------|---------|
| Primary Care | 50+ | Comprehensive |
| Mental Health | 28+ | Good |
| Nursing | 55+ | Very Comprehensive |
| Dentistry | 14 | Complete |
| Surgery | 40+ | Comprehensive |
| Hospital/Facility | 100+ | Very Comprehensive |

### Issue: Dual Mapping Sources
- `import-npi-direct.ts` has embedded mappings
- `taxonomy-mappings.ts` has separate mappings
- **Risk:** Inconsistency if they diverge

---

## Data Quality Handling

### City Name Normalization (`normalize-city-names.ts`)

**Coverage:** 100+ NYC neighborhood variations

| Borough | Variations Mapped |
|---------|-------------------|
| Manhattan | 47+ |
| Brooklyn | 56+ |
| Queens | 61+ |
| Bronx | 41+ |
| Staten Island | 41+ |

**Operations:**
- Strip trailing state codes
- Remove zip codes
- Normalize whitespace
- Case-insensitive matching

**Limitation:** NYC-focused only; no other regions

### Deactivated Provider Cleanup

**Detection Methods:**
1. `npi_status = 'DEACTIVATED'`
2. `status IN ('DEACTIVATED', 'deactivated', 'inactive')`
3. `npi_deactivation_date IS NOT NULL` (no reactivation)
4. `deactivation_date IS NOT NULL` (no reactivation)

**Operations:**
- DRY RUN mode (preview)
- Cascade deletion (verification_logs → plan_acceptances → providers)
- **Hard delete** (no soft delete)

---

## Critical Issues Identified

### Issue 1: Deactivation Logic Bug (CRITICAL)

**Location:** `import-npi-direct.ts` lines 398-407

**Problem:** String comparison instead of date parsing
```typescript
// Current (buggy)
if (deactivationDate && deactivationDate.trim() !== '' && ...)

// Should be
if (parseDate(deactivationDate) && !parseDate(reactivationDate)) ...
```

**Impact:** May incorrectly import/skip providers with malformed dates

### Issue 2: Batch Transaction Safety (HIGH)

**Problem:** Individual INSERT failures don't rollback batch
```typescript
try {
  // Insert 5000 records
} catch (error) {
  stats.errorRecords++; // Silently continue
}
```

**Impact:** Partial batches may introduce inconsistencies

### Issue 3: Taxonomy Code Duplication (MEDIUM)

**Problem:** Two sources of truth
- `import-npi-direct.ts` has 116 embedded prefixes
- `taxonomy-mappings.ts` has 876+ explicit codes

**Impact:** Different categorization depending on code path

### Issue 4: City Name Coverage (MEDIUM)

**Problem:** Only NYC neighborhoods handled
**Impact:** Other cities remain un-normalized

---

## Performance Analysis

| Aspect | Configuration | Assessment |
|--------|---------------|------------|
| Memory | Streaming + 5K batches | Good |
| Connections | Pool of 5 | Adequate |
| Batch Size | 5,000 | Good balance |
| Retries | 3 attempts, 2s backoff | Reasonable |
| Logging | 10K intervals | Adequate |

### Optimization Opportunities
1. Sort PREFIX_MAPPINGS once at load (not per call)
2. Increase batch size to 10-25K
3. Implement worker thread pool
4. Use COPY STDIN for faster bulk inserts

---

## Data Flow Diagram

```
┌─────────────────────┐
│   NPI CSV File      │
│   (10.8GB, 9.2M)    │
└─────────┬───────────┘
          │ Streaming
          ▼
┌─────────────────────┐
│ import-npi-direct   │
│ ├─ Skip deactivated │
│ ├─ Clean phone      │
│ ├─ Parse dates      │
│ └─ Map taxonomy     │
└─────────┬───────────┘
          │ Batch INSERT (5K)
          ▼
┌─────────────────────┐
│    PostgreSQL       │
│ ├─ providers        │
│ ├─ sync_logs        │
│ └─ verification_logs│
└─────────┬───────────┘
          │ Optional
          ▼
┌─────────────────────┐
│ normalize-city-names│
│ (NYC only)          │
└─────────┬───────────┘
          │ Optional
          ▼
┌─────────────────────┐
│ cleanup-deactivated │
│ (Hard delete)       │
└─────────────────────┘
```

---

## Sync Log Tracking

### Fields Tracked
- Sync type (NPI_FULL, NPI_WEEKLY, etc.)
- State being processed
- Records processed/inserted/skipped/errors
- File metadata (name, hash, size, date)
- Status (PENDING → IN_PROGRESS → COMPLETED/FAILED)
- Timestamps

### Gap: File Hash Not Used
- SHA-256 calculated but not compared
- Could detect duplicate re-imports

---

## Recommendations

### Critical (Fix Immediately)
1. **Fix deactivation date comparison** - Parse dates before comparing
2. **Add transaction rollback** - On individual record errors
3. **Consolidate taxonomy mappings** - Single source of truth

### Important (Before Scale)
1. Expand city normalization beyond NYC
2. Add duplicate file detection via hash
3. Implement proper phone number validation (E.164)
4. Add reactivation date logic

### Optimization (Nice to Have)
1. Pre-sort PREFIX_MAPPINGS at module initialization
2. Implement parallel worker processing
3. Add incremental/resume capability
4. Post-import database statistics collection

---

## Import Checklist

### Before Import
- [ ] Verify CSV file integrity
- [ ] Check available disk space
- [ ] Ensure database connection
- [ ] Review batch size setting

### During Import
- [ ] Monitor progress output
- [ ] Check for error spikes
- [ ] Monitor database connections

### After Import
- [ ] Verify record counts
- [ ] Run city normalization (if applicable)
- [ ] Update cities.json
- [ ] Run VACUUM ANALYZE

---

## NPI Registry API Strategy

### Current: Bulk Download
- Foundation for searchable database
- Full state-by-state import
- ~2.1M providers imported

### Future: On-Demand API
- Endpoint: `https://npiregistry.cms.hhs.gov/api/?version=2.1`
- Use for provider detail enrichment
- Rate limited by CMS
- Cache results to avoid re-querying

---

## Summary

| Component | Status | Quality |
|-----------|--------|---------|
| Import Script | Working | Good (with bugs) |
| Batch Processing | Working | Good |
| Taxonomy Mappings | Complete | Duplicated |
| City Normalization | Working | NYC-only |
| Deactivation Cleanup | Working | Hard delete |
| Progress Tracking | Working | Good |

**Overall Assessment:** Pipeline is functional but has critical bugs in deactivation logic and transaction safety that need immediate attention.

---

*Fix deactivation date parsing and transaction rollback before next import*
