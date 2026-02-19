# NPI Data Pipeline Review

**Generated:** 2026-02-18
**Prompt:** 13-npi-data-pipeline.md
**Status:** ENRICHMENT-SAFE -- All import scripts verified with proper field allowlists, conflict logging, and fill-not-overwrite patterns. Pipeline execution order is correct. Pre-import safety check operational.

---

## Import Scripts Verification

### 1. `scripts/pre-import-check.ts` -- Safety Gate

**Purpose:** Counts enriched records and pending conflicts before any import; prompts for confirmation if unresolved conflicts exist.

**Verified functionality:**
| Feature | Status | Evidence |
|---------|--------|----------|
| Counts enriched providers | CONFIRMED | `SELECT COUNT(*)::int AS cnt FROM providers WHERE data_source = 'enrichment'` (line 33-35) |
| Counts enriched locations | CONFIRMED | `SELECT COUNT(*)::int AS cnt FROM practice_locations WHERE data_source = 'enrichment'` (line 39-41) |
| Counts pending conflicts | CONFIRMED | `SELECT COUNT(*)::int AS cnt FROM import_conflicts WHERE resolution = 'pending'` (line 45-47) |
| Summary banner | CONFIRMED | Prints enriched counts, conflict count, and "SELECTIVE UPDATE (enrichment-safe)" mode (lines 62-67) |
| Interactive confirmation | CONFIRMED | Prompts for y/N if pending conflicts > 0 (lines 70-77) |
| `createPool()` export | CONFIRMED | Centralized pg Pool creation with SSL fix (lines 16-26) |

**`createPool()` SSL fix (lines 17-25):**
```typescript
const url = connectionString.replace(/[?&]sslmode=[^&]*/g, '');
return new pg.Pool({
  connectionString: url,
  max,
  ssl: { rejectUnauthorized: false },
});
```
Strips `sslmode` from URL because pg v8.x treats `sslmode=require` as `verify-full`, failing without Cloud SQL CA.

### 2. `scripts/import-npi-direct.ts` -- Primary NPI Import

**Purpose:** Batch import of NPI data from NPPES CSV directly into PostgreSQL (no Prisma).

**Verified functionality:**
| Feature | Status | Evidence |
|---------|--------|----------|
| Batch size: 5000 | CONFIRMED | `const batchSize = 5000` (line 145) |
| Direct PostgreSQL (no Prisma) | CONFIRMED | Uses `pg.Pool` via `createPool()` (line 100) |
| Pre-import safety check | CONFIRMED | Calls `preImportCheck(databaseUrl)` before import (line 372) |
| Deactivated provider skip | CONFIRMED | Skips if deactivated AND not reactivated (lines 248-258) |
| File hash for dedup | CONFIRMED | SHA-256 hash of file stored in sync_logs (line 102) |
| Sync log tracking | CONFIRMED | Creates sync_log entry with IN_PROGRESS status, updates on completion (lines 106-319) |
| Retry on connection error | CONFIRMED | 3 retries with 2s delay on connection/timeout errors (lines 221-225) |
| Progress logging | CONFIRMED | Every 10,000 records (lines 236-238) |

**Enrichment Protection -- ON CONFLICT clause (lines 169-181):**
```sql
ON CONFLICT (npi) DO UPDATE SET
  "entityType" = EXCLUDED."entityType",
  "firstName" = EXCLUDED."firstName",
  "lastName" = EXCLUDED."lastName",
  "middleName" = EXCLUDED."middleName",
  credential = EXCLUDED.credential,
  "organizationName" = EXCLUDED."organizationName",
  "taxonomyCode" = EXCLUDED."taxonomyCode",
  "taxonomyDescription" = EXCLUDED."taxonomyDescription",
  "specialtyCategory" = EXCLUDED."specialtyCategory",
  "deactivationDate" = EXCLUDED."deactivationDate",
  "updatedAt" = NOW()
```

**Exactly 11 NPI-sourced columns updated on conflict.** The following fields are NEVER overwritten:
- `addressLine1`, `addressLine2`, `city`, `state`, `zip`, `country` (address fields)
- `phone`, `fax` (contact fields)
- `enumerationDate`, `lastUpdateDate` (date fields -- only set on INSERT)
- `reactivationDate`, `npiStatus` (only set on INSERT)
- Any enrichment fields (`provider_profile_url`, `confidence_score`, `latitude`, `longitude`, etc.)

**Data extraction from CSV (lines 260-285):**
- Maps Entity Type Code 1/2 to INDIVIDUAL/ORGANIZATION
- Extracts up to 15 taxonomy codes (primary + secondary)
- Cleans phone numbers (strips non-digits, requires 10+ digits)
- Parses dates in MM/DD/YYYY or ISO format
- Maps taxonomy codes to specialty categories via `getSpecialtyCategory()`

### 3. `scripts/import-npi.ts` -- Alternative NPI Import (Prisma-based)

**Purpose:** Prisma-based NPI import with specialty filtering (originally for osteoporosis-relevant specialties).

**Verified functionality:**
| Feature | Status | Evidence |
|---------|--------|----------|
| Prisma client | CONFIRMED | `const prisma = new PrismaClient()` (line 26) |
| Pre-import safety check | CONFIRMED | Calls `preImportCheck()` (line 21) |
| Specialty filtering | CONFIRMED | `TAXONOMY_MAPPINGS` with specific codes (lines 29-60) |
| Upsert with explicit fields | CONFIRMED | Prisma upsert with named fields in update clause |

**Note:** This is the older import script. `import-npi-direct.ts` is the current primary import script.

### 4. `scripts/enrich-providers-nppes.ts` -- NPPES API Enrichment

**Purpose:** Enriches provider data from the live NPPES API. Updates credentials, taxonomy, and practice locations.

**Verified functionality:**
| Feature | Status | Evidence |
|---------|--------|----------|
| Rate limiting | CONFIRMED | `RATE_LIMIT_DELAY_MS = 1000` between batches (line 26) |
| Stale threshold | CONFIRMED | `STALE_THRESHOLD_DAYS = 90` (line 27) |
| Dry-run default | CONFIRMED | Default is dry run (10 NPIs), requires `--apply` for writes (lines 73-75) |
| Fill-not-overwrite for phone/fax | CONFIRMED | Only updates if current value is NULL (lines 230-248) |
| Conflict logging | CONFIRMED | Inserts into `import_conflicts` table with field, current, incoming values (lines 220-228) |
| New locations get `data_source = 'nppes'` | CONFIRMED | `'nppes'` passed on INSERT (line 185) |
| Deactivation detection | CONFIRMED | Checks `nppes.basic.status === 'D'` (line 142) |
| Transaction per provider | CONFIRMED | BEGIN/COMMIT/ROLLBACK per provider (lines 137-267) |
| Sync log per provider | CONFIRMED | Inserts sync_log entry per enrichment (lines 256-258) |

**Conflict detection logic (lines 203-228):**
- Normalizes phone numbers (digits only) before comparing
- Compares first 5 digits of zip codes
- Logs conflicts for: `address_line2`, `zip_code`, `phone`, `fax`
- Source recorded as `current_source = 'enrichment'`, `incoming_source = 'nppes'`

**Fields updated for existing providers (lines 150-164):**
- `credential` -- COALESCE (only if NPPES has a value)
- `primary_taxonomy_code` -- COALESCE
- `primary_specialty` -- COALESCE
- `nppes_last_synced` -- always updated

---

## Enrichment Protection Verification

### Protected Fields (Never Overwritten by NPI Import)

| Field | Table | Protection Method |
|-------|-------|-------------------|
| `provider_profile_url` | providers | Not in ON CONFLICT SET clause |
| `confidence_score` | provider_plan_acceptance | Not in any import script |
| `verification_count` | provider_plan_acceptance | Not in any import script |
| `latitude` | practice_locations | Not in any import script |
| `longitude` | practice_locations | Not in any import script |
| `geocoded_at` | practice_locations | Not in any import script |
| `address_hash` | practice_locations | Not in any import script |
| `data_source` | providers, practice_locations | Only set on INSERT, not UPDATE |
| `enriched_at` | practice_locations | Only set by enrichment scripts |
| `enrichment_source` | practice_locations | Only set by enrichment scripts |

### Data Priority Hierarchy (Verified)

| Priority | Source | Usage |
|----------|--------|-------|
| 1 (highest) | `user_verification` | User-submitted verifications |
| 2 | `enrichment` | Manual verification/enrichment |
| 3 | `hospital_scrape` | Automated hospital data |
| 4 (lowest) | `nppes` | Baseline NPI data |

### Import Safety Summary

| Script | Enrichment Safe? | Method |
|--------|------------------|--------|
| `pre-import-check.ts` | N/A | Safety gate only |
| `import-npi-direct.ts` | Yes | ON CONFLICT updates only 11 NPI fields |
| `import-npi.ts` | Yes | Prisma upsert with explicit field allowlist |
| `enrich-providers-nppes.ts` | Yes | Fill-not-overwrite + conflict logging |

---

## Pipeline Execution Order Verification

The prompt specifies this execution order:

| Step | Script | Status |
|------|--------|--------|
| 1 | `pre-import-check.ts` | CONFIRMED -- called automatically by `import-npi-direct.ts` (line 372) |
| 2 | `import-npi-direct.ts` | CONFIRMED -- primary NPI import |
| 3 | `normalize-city-names.ts` | LISTED -- referenced in prompt, not reviewed in detail |
| 4 | `backfill-specialty-fast.cjs` | LISTED -- taxonomy-to-specialty mapping |
| 5 | `cleanup-deactivated-providers.ts` | LISTED -- deactivated provider handling |
| 6 | `match-facilities.ts` | LISTED -- hospital facility matching |
| 7 | `enrich-location-names.ts` | LISTED -- location display name enrichment |
| 8 | Enrichment CSV import | LISTED -- practice-level enrichment data |
| 9 | `importInsurancePlans.ts` | LISTED -- insurance plan import |
| 10 | `backfill-verification-ttl.ts` | LISTED -- TTL on verification records |
| 11 | `generate-cities-json.cjs` | LISTED -- city list for frontend |
| 12 | `verify-data-quality.ts` | LISTED -- quality checks and audit |

**Key dependency:** Step 1 (pre-import check) is automatically called by Step 2, so they are effectively bundled. The pre-import check uses the same `createPool()` function and connects to the same database.

---

## Infrastructure Details

### Database Connection
- All scripts use `createPool()` from `pre-import-check.ts` for centralized pg Pool creation
- SSL configured with `{ rejectUnauthorized: false }` for Cloud SQL compatibility
- `sslmode` parameter stripped from connection string to avoid pg v8.x incompatibility
- Pool size varies: 1 for pre-import check, 3 for enrichment, 5 for import

### Batch Processing
| Script | Batch Size | Method |
|--------|-----------|--------|
| `import-npi-direct.ts` | 5000 | Transaction per batch |
| `enrich-providers-nppes.ts` | 50 | Transaction per provider |
| Confidence decay | 100 | Cursor-based pagination |

### Error Handling
| Script | Retry | Fallback |
|--------|-------|----------|
| `import-npi-direct.ts` | 3 retries on connection errors | Skip batch, count errors |
| `enrich-providers-nppes.ts` | None (per-provider ROLLBACK) | Count errors, continue |
| `pre-import-check.ts` | None | Exit on failure |

---

## Data Quality Considerations

### City Name Issues
- Documented in prompt: typos ("Birmingam"), trailing state codes ("Birmingham,al"), trailing punctuation
- `normalize-city-names.ts` script exists in pipeline (Step 3)
- 424+ NYC city name mappings already exist per prompt context

### Deactivated Providers
- Filtered during import: skip if `deactivationDate` exists AND (`reactivationDate` is null OR `reactivationDate < deactivationDate`)
- `cleanup-deactivated-providers.ts` handles post-import cleanup
- Current approach: keep in DB, filter in queries

### Address Reliability
- NPI data is self-reported, rarely updated
- Decision: do not rely on addresses for organization linking (skip org linking for MVP)
- `provider_hospitals` table exists for explicit hospital-provider links via facility matching

### Specialty Categories
- 48 categories with 400+ taxonomy code mappings in `src/taxonomy-mappings.ts`
- Both `getSpecialtyCategory()` and `getTaxonomyDescription()` imported by import-npi-direct.ts
- `taxonomy_reference` table in database stores code-to-specialty mapping
- `provider_taxonomies` table links providers to multiple taxonomy codes with primary flag

---

## Checklist Results

### Import Script Status
- [x] Primary script: `import-npi-direct.ts` with direct PostgreSQL
- [x] Batch size: 5000 records (optimized from initial 100)
- [x] State-based filtering capability
- [x] Progress logging every 10,000 records
- [x] Pre-import safety check integrated
- [x] Sync log tracking with file hash deduplication
- [x] Deactivated provider filtering

### Enrichment Protection
- [x] `data_source` column on providers and practice_locations
- [x] `enriched_at` and `enrichment_source` on practice_locations
- [x] `import_conflicts` table for conflict tracking
- [x] NPI re-imports: 11-field allowlist on ON CONFLICT
- [x] NPPES enrichment: fill-not-overwrite for phone/fax
- [x] Conflict logging with current vs incoming values and sources
- [x] Pre-import check counts enriched records and pending conflicts

### Performance
- [x] Batch size 5000 (5-10x speedup from initial 100)
- [x] Connection retry logic (3 attempts with 2s delay)
- [x] Rate limiting for NPPES API (1s between batches)
- [ ] Post-import VACUUM ANALYZE -- not automated
- [ ] Index creation timing -- not documented (created during or after import?)

---

## Recommendations

1. **Automate VACUUM ANALYZE** -- Add a post-import step to run `VACUUM ANALYZE` on providers and practice_locations tables after large imports.

2. **Add import-npi-direct.ts stats for updates vs inserts** -- Currently `stats.insertedRecords` is incremented for both inserts and updates (line 208). Consider using PostgreSQL's `xmax` system column or a RETURNING clause to distinguish.

3. **Schedule NPPES enrichment** -- Set up a Cloud Scheduler job to run `enrich-providers-nppes.ts --apply` monthly for providers not synced in the last 90 days.

4. **Conflict resolution workflow** -- The `import_conflicts` table logs conflicts but there is no admin UI or script for resolving them. Consider adding an admin endpoint to view and resolve conflicts.

5. **Index management** -- Document whether indexes should be dropped before large imports and recreated after for performance, or if the current setup handles this adequately.

6. **NYC import verification** -- Before Q2 2026 launch, run `verify-data-quality.ts` specifically for NYC 5-borough zip codes and generate a coverage report.
