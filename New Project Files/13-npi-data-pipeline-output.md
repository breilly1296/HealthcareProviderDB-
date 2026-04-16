# NPI Data Pipeline Review — 2026-04-16

**Target Market:** NYC (5 boroughs)
**Launch:** Q2 2026
**Architecture:** NPPES bulk CSV import + NPPES API per-provider enrichment, both enrichment-safe

---

## Files Reviewed
- `scripts/pre-import-check.ts` (96 lines) — safety banner + createPool helper
- `scripts/import-npi-direct.ts` (393 lines) — primary import path, direct pg
- `scripts/import-npi.ts` (592 lines) — Prisma-based alt path
- `scripts/enrich-providers-nppes.ts` (319 lines) — NPPES API enrichment
- `scripts/update-specialties.ts`, `scripts/backfill-specialty-fast.cjs`, `scripts/normalize-city-names.ts`, `scripts/cleanup-deactivated-providers.ts`
- `packages/backend/prisma/schema.prisma:12-105` (Provider, PracticeLocation, taxonomy models)
- `packages/backend/prisma/migrations/20260218000000_add_data_source_tracking/migration.sql`
- `packages/backend/prisma/migrations/20260218010000_add_import_conflicts/migration.sql`
- `packages/shared/src/types/enums.ts:8` (SpecialtyCategory enum)

---

## 1. Import Script Status

- [x] Primary script: `scripts/import-npi-direct.ts` (393 lines)
- [x] Batch size: 5000 (`:145`)
- [x] Direct PostgreSQL (pg) — bypasses Prisma for speed and Windows ARM64 compat (`:1-4` comment)
- [x] Deactivated providers filtered at read time (`:247-258`), not post-import
- [x] Progress logging every 10,000 records (`:236-239`)
- [x] Sync log entries in `sync_logs` table (`:106-118`, `:300-319`)
- [x] File hash (SHA-256) stored on sync record (`:85-93`)
- [x] Retries on connection errors up to 3x (`:221-225`)

**Gotcha:** `import-npi-direct.ts:12` imports from `'../src/taxonomy-mappings'` — relative to `scripts/`, that resolves to **a `src/` directory at repo root that does not exist**. Running the script as-is would fail at import time. Either:
- `src/taxonomy-mappings.ts` was moved to `packages/shared` or similar and import path was never updated, OR
- File exists but is gitignored / OneDrive-excluded.

`packages/shared/src/types/enums.ts:8` defines `SpecialtyCategory` enum, but there is no exported `getSpecialtyCategory(code)` or `getTaxonomyDescription(code)` function anywhere in the workspace. **This is a HIGH severity issue — the primary import script cannot run without those helpers.**

---

## 2. Data Quality Issues

### City Names
- [x] `scripts/normalize-city-names.ts` exists; memory notes mention 424+ NYC mappings
- [ ] Running as part of post-import pipeline is not automated — invoked manually
- **Decision (memory):** Clean up after all imports complete

### Deactivated Providers
- [x] `scripts/cleanup-deactivated-providers.ts` exists
- [x] `import-npi-direct.ts:254-258` already skips deactivated-and-not-reactivated at ingestion; so cleanup is mainly for historical legacy rows
- [x] Deactivation logic also checks reactivation-before-deactivation edge case (`:253`)
- **Decision:** Skip at import time (current behavior). Keep cleanup script for enrichment re-syncs.

### Address Reliability
- [x] NPI addresses are self-reported and often stale
- [x] **Decision (memory):** Skip org linking for MVP; `provider_hospitals` table tracks explicit links
- [x] `enrich-providers-nppes.ts:167-252` adds new locations from NPPES API but never overwrites existing address/coords
- [x] Phone/fax filled only if `NULL` (`:234-241`)

---

## 3. Specialty Categories

- [x] `SpecialtyCategory` enum in `packages/shared/src/types/enums.ts:8` (48 values per prompt claim — not counted, but prompt is consistent with the file existing there)
- [x] `taxonomy_reference` table in schema (`schema.prisma:175-185`)
- [x] `provider_taxonomies` table (`schema.prisma:162-173`) — but `isPrimary` is `VarChar(1)` here, not `Boolean` as prompt shows. Schema drift: prompt doc out of date vs actual Prisma model.
- [x] `Provider.specialtyCategory` column backfilled via `scripts/backfill-specialty-fast.cjs`

- [ ] **Schema mismatch:** prompt says `isPrimary Boolean`, actual schema at `schema.prisma:166` is `String? @db.VarChar(1)`. Update prompt or migrate the column.

---

## 4. NYC Import Progress
Memory notes indicate Phase 5/5A/5B work around NPI validation and re-verification is largely complete, but there is no visible audit trail in the repo showing a completed NYC-only NPPES import (no row counts, no output file). The import script `packages/backend/scripts/extract-nyc-providers.ts` exists but its output is not committed.

- [ ] Unknown: current NYC provider count
- [ ] Unknown: coverage of all 5 boroughs
- [ ] Unknown: which zip-code filter list was used
- [x] `scripts/audit-npi-validation.ts` exists for after-the-fact validation

---

## 5. Performance

### Batch Size / Speed
- Batch size 5000 (`import-npi-direct.ts:145`). Memory notes reference 40 min / 35k (~875/sec) and 110 min / 614k (~93/sec); the gap suggests disk-bound behavior on the larger file. Current settings are reasonable.
- `pg.Pool(max=5)` (`import-npi-direct.ts:100`) with 1 connection per batch via `pool.connect()` — not parallel inserts per batch, but reasonable.

### Database
- [x] Indexes created in baseline migration; no mention of dropping before import
- [ ] Unknown: VACUUM ANALYZE automation — no script found
- [x] Connection pooling: yes, 5 connections on import path

---

## 6. Enrichment Protection (Phase 6 — Live)

### Schema
- `providers.data_source VARCHAR(30) DEFAULT 'nppes'` (migration `20260218000000`)
- `practice_locations.data_source`, `enriched_at`, `enrichment_source`
- `import_conflicts` table (migration `20260218010000`) — fields: npi, table_name, field_name, current_value, incoming_value, current_source, incoming_source, resolution

### Import Hardening
- `import-npi-direct.ts:169-181` ON CONFLICT SET limits updates to 11 NPI-sourced fields only. Notably **excludes** `addressLine1/2`, `city`, `state`, `zip`, `phone`, `fax`, `country`, `enumerationDate`, `lastUpdateDate`, `reactivationDate`, `npiStatus` — meaning these are only set on INSERT, never on re-imports. This is intentional per memory notes but is a somewhat aggressive fix: a phone-number change in NPPES would be silently ignored on re-import. Trade-off is clear — protect enrichment over sync freshness.
- `enrich-providers-nppes.ts:182-197` inserts new locations with `data_source='nppes'`
- `enrich-providers-nppes.ts:201-227` logs conflicts to `import_conflicts` with normalized comparisons (digits-only for phone, first-5 for zip)
- `enrich-providers-nppes.ts:234-248` fills phone/fax only if currently NULL

### Pre-import Check
- `pre-import-check.ts` counts enriched providers + locations + pending conflicts; prompts user if pending conflicts exist (`:70-78`)
- `createPool()` (`:16-26`) is the centralized Cloud SQL SSL-safe pool factory (strips `sslmode=` from URL, sets `ssl: { rejectUnauthorized: false }`)

---

## 7. Pipeline Execution Order (from prompt)
All 12 scripts called out in the prompt exist. Execution order is documented in the prompt but not codified as a single runbook script. Consider adding `scripts/run-full-import.sh` or similar orchestrator.

Scripts present:
- [x] `pre-import-check.ts`
- [x] `import-npi-direct.ts`
- [x] `normalize-city-names.ts`
- [x] `backfill-specialty-fast.cjs`
- [x] `cleanup-deactivated-providers.ts`
- [x] `packages/backend/scripts/match-facilities.ts`
- [x] `packages/backend/scripts/enrich-location-names.ts`
- [x] `scripts/import-enrichment-csv.ts`
- [x] `packages/backend/src/scripts/importInsurancePlans.ts` (referenced in prompt; not directly verified)
- [x] `backfill-verification-ttl.ts` + `.sql`
- [x] `generate-cities-json.cjs`
- [x] `verify-data-quality.ts`

---

## 8. NPPES API Integration

`scripts/enrich-providers-nppes.ts:24` uses `https://npiregistry.cms.hhs.gov/api/?version=2.1`.

- [x] Endpoint correct
- [x] `BATCH_SIZE = 50`, `RATE_LIMIT_DELAY_MS = 1000` (`:25-26`)
- [x] `STALE_THRESHOLD_DAYS = 90` for re-sync filter (`:27`, `:90-93`)
- [x] Selection: null `nppes_last_synced` OR synced > 90 days ago
- [x] Dry-run default (10 NPIs); `--apply --limit N` CLI
- [x] Full transaction per provider with ROLLBACK on error
- [x] Conflict logging into `import_conflicts`
- [x] `sync_logs` entry per enrichment (`:257-259`) — schema mismatch: inserts `sync_type`, `records_processed`, `started_at`, `completed_at` as snake_case, but the Prisma model uses camelCase (`@@map`ped). Since the script uses raw SQL, this works if the underlying columns are indeed snake_case. Verify with `scripts/describe-tables.ts`.

---

## Findings (ranked)

### CRITICAL
1. **Missing taxonomy-mappings import (import-npi-direct.ts:12 and import-npi.ts).** The primary import path is broken — `../src/taxonomy-mappings` points to a directory that does not exist in the repo. No `getSpecialtyCategory` or `getTaxonomyDescription` helper was located. Either the file was moved (path not updated) or it's in OneDrive-excluded state. **Blocks any fresh import.**

### HIGH
2. **Re-import silently drops address/phone/fax changes from NPPES (import-npi-direct.ts:169-181).** By design — enrichment protection — but a provider who legitimately moves will retain stale address on re-imports. Consider logging these to `import_conflicts` the same way `enrich-providers-nppes.ts` does, so the product team sees the drift.
3. **No committed record of NYC import.** Memory notes describe extensive Phase 5 enrichment work, but no row counts or completion artifact. Before launch, confirm import-of-record is reproducible (filter list, input file hash, output count).

### MEDIUM
4. **Schema drift on `provider_taxonomies.isPrimary`:** prompt doc says Boolean, actual is `VarChar(1)`. Either migrate to boolean or update docs.
5. **`enrich-providers-nppes.ts:257-259` inserts into `sync_logs` with snake_case column names.** Other scripts use camelCase (`import-npi-direct.ts:107-109`: `"syncType"`, `"sourceFileHash"`, etc. — quoted camelCase). At least one of these is inconsistent with the actual column naming. Could cause silent INSERT errors or column-not-found. **Verify column case with `scripts/describe-tables.ts sync_logs`.**
6. **No VACUUM ANALYZE post-import script.** After a 50-75k-row NYC import, query planner statistics should be refreshed.

### LOW
7. **No orchestrator script.** The 12-step pipeline is run manually in sequence. A single `scripts/run-full-import.sh` with flags would reduce runbook risk.
8. **`import-npi.ts` (Prisma alt) appears unused.** If `import-npi-direct.ts` is the supported path, consider archiving `import-npi.ts` to avoid drift between the two.

---

## Open Questions

1. **Current NYC provider count?** Not visible in repo.
2. **Which state CSV was used and when?** `sync_logs` would have this; worth a dashboard.
3. **Is `import-npi.ts` (Prisma) still supported?** Dual paths double maintenance cost.
4. **Should NPPES re-imports log address-change conflicts?** Today they are silently suppressed.
5. **Specialty granularity:** Are there specialties like "Addiction Medicine" or "Sleep Medicine" that deserve their own category rather than folding into Internal Medicine?

---

## Recommendations

### Immediate (before NYC launch)
- [ ] **Restore `src/taxonomy-mappings.ts`** or re-point imports in `scripts/import-npi-direct.ts:12` and `scripts/import-npi.ts`. Without this the primary import path is dead.
- [ ] Verify `sync_logs` column naming with `scripts/describe-tables.ts` and reconcile the two inconsistent insert patterns.
- [ ] Run `VACUUM ANALYZE providers, practice_locations` post-NYC-import; script it.

### Next Sprint
- [ ] Add address-drift conflict logging to `import-npi-direct.ts` so re-imports populate `import_conflicts` for visible diffs.
- [ ] Archive or delete `scripts/import-npi.ts` if `import-npi-direct.ts` is canonical.
- [ ] Build `scripts/run-full-import.sh` orchestrator with the 12-step pipeline.

### Longer Term
- [ ] Monthly NPPES delta syncs via Cloud Scheduler (memory hints at `scripts/setup-cloud-scheduler.sh` but no specific NPPES job).
- [ ] Delta-only import: download NPPES weekly files and only process deltas vs current DB.
- [ ] Admin UI for `import_conflicts` review (currently resolution workflow is SQL-only).

---

## Output Format (prompt-requested)

```markdown
# NPI Data Pipeline

**Last Updated:** 2026-04-16
**Total Providers:** unknown (no recent count in repo; check sync_logs)
**Target Market:** NYC (5 boroughs)
**Launch:** Q2 2026

---

## Import Progress

### NYC Import Status
- [?] NY state file filtered to NYC zip codes — script exists, no artifact
- [?] Provider count: unknown
- [?] All 5 boroughs covered: unknown — verify with zip-code filter list used

---

## Data Quality Issues

### City Names
**Problem:** Typos, trailing state codes, punctuation in NPPES source.
**Examples:** "Birmingam", "Birmingham,al", "Birmingham,"
**Decision:** Run `normalize-city-names.ts` after each import. Has 424+ NYC mappings.

### Deactivated Providers
**Problem:** ~0.2% of records have deactivation date.
**Current Approach:** Filtered at import time (`import-npi-direct.ts:254-258`); cleanup script exists for legacy rows.
**Decision:** Keep current filtering. Cleanup script for enrichment re-syncs.

### Address Reliability
**Problem:** NPI data is self-reported and stale.
**Impact:** Cannot rely on NPPES addresses for org linking.
**Decision:** Skip org linking for MVP. Protect enriched addresses via `data_source`.

---

## Specialty Categories

**Current:** 48 categories via `SpecialtyCategory` enum (`packages/shared/src/types/enums.ts:8`).
**Mapping:** Taxonomy code → category via `getSpecialtyCategory()` helper (MISSING — see Critical #1).
**Unmapped taxonomies:** Unknown — needs audit after taxonomy-mappings file is restored.

---

## Performance Metrics

### Import Speed
- Batch Size: 5000
- Observed: 40 min / 35k providers = ~14/sec sustained (retries, conflicts)
- NYC ETA: ~60-90 min for 50-75k providers

### Database Performance
- Connection pool: 5 (import), 3 (enrich)
- Indexes: created in baseline migration, not dropped during import
- VACUUM ANALYZE: not automated

---

## NPI Registry API Strategy

**Bulk:** ✅ Foundation.
**API:** ✅ `enrich-providers-nppes.ts` — 50 per batch, 1s delay, 90-day stale threshold, transactional with conflict logging.

---

## Organization Linking

**Status:** ❌ Skipped for MVP.
**Reason:** Self-reported NPPES addresses too stale for reliable org matching.
**Future:** Consider CMS provider-group data or explicit hospital scrapes.

---

## City Dropdown

- File: `/public/data/cities.json`
- Size: 40KB
- State: NY (NYC boroughs) per memory

**Next Steps:**
- [ ] Regenerate after NYC import complete
- [ ] Clean duplicates (likely after `normalize-city-names.ts`)
- [ ] Add borough-level filter

---

## Next Actions

1. **Immediate:** Restore taxonomy-mappings; audit sync_logs column naming; confirm NYC import artifact exists.
2. **After NYC import:** VACUUM ANALYZE, regenerate cities.json, import insurance plans for NYC carriers.
3. **Future:** Monthly delta syncs, conflict-review admin UI, tri-state expansion.
```
