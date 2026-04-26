# Archived Scripts

These scripts were written against a pre-`practice_locations` schema and no longer match the current database. They are kept for reference only — **do not run them**.

## Archived 2026-04-26

### `import-npi-direct.ts`
Last working commit: pre-`90e9130` (2026-01-14). Last touched 2026-02-18 (`df733fb` SSL cert fix; `1be3443` enrichment-protection hardening of the `ON CONFLICT` UPDATE clause). The `INSERT INTO providers (...)` block, however, still references columns that no longer exist on `providers`:

- `id`, `addressLine1`, `addressLine2`, `city`, `state`, `zip`, `country`, `phone`, `fax` — moved to `practice_locations` in migration `20260114113939_add_location_details`
- `taxonomyDescription`, `secondaryTaxonomies`, `npiStatus`, `createdAt`, `updatedAt` — removed from `Provider`
- `taxonomyCode` — renamed to `primary_taxonomy_code`
- The `sync_logs` INSERT references 9 columns that don't exist on the current `SyncLog` model and uses `gen_random_uuid()` for what is now an `Int autoincrement` PK.

Plus: column names in the SQL are quoted-camelCase (`"firstName"`), but the current schema `@map`s every Prisma field to snake_case DB columns. Without that fix every column reference would mismatch.

### `import-npi.ts`
Last touched 2026-02-18 (`610ae72` removed address/phone from the UPDATE clause; UPDATE was partially hardened, CREATE was not). The Prisma client imports on line 16 reference enums (`EntityType`, `SpecialtyCategory`, `NpiStatus`, `SyncStatus`, `DataSource`, `SyncType`) that do not exist in the current Prisma schema (only `AcceptanceStatus`, `VerificationSource`, `VerificationType` are exported). **The file does not compile against the current Prisma client.**

### `import-csv-copy.ts`
Last working commit `754e277` (2026-01-13) — the day before the location split. Uses PostgreSQL `\copy` to bulk-insert into a single `providers` table that includes `address_line1`, `address_line2`, `city`, `state`, `zip_code`, `phone`, etc. (line 321 in the original). Those columns moved to `practice_locations` on 2026-01-14 (migration `20260114113939_add_location_details`), so the COPY shape is now wrong.

### `import-csv-simple.ts`
Same date and same root cause as `import-csv-copy.ts`. Mixes camelCase (`addressLine1`) and snake_case (`address_line1`) field references in the same file — the camelCase names were already wrong even before the split, given the schema's `@map()` annotations.

### `import-filtered-csv.ts`
Same date and same root cause. INSERTs into `providers (..., address_line1, address_line2, city, state, zip_code, ...)` against the pre-split shape.

### `normalize-city-names.ts`
Archived 2026-04-26. Targets `providers.city` and `providers.state` (lines 1222 and 1285 in the original) — both columns moved to `practice_locations` in migration `20260114113939_add_location_details`. The script's first SELECT fails immediately against the current schema (`column "city" of relation "providers" does not exist`), so even the dry-run can't run.

What it covers (worth knowing for the eventual replacement):
- Six metros only via explicit dictionaries: NYC (NY), LA (CA), Chicago (IL), Houston (TX), Phoenix (AZ), Philadelphia (PA). Alabama, where the canonical DATA-02 examples live ("Birmingam", "Birmingham,al", "Birmingham,"), is NOT in the supported state list.
- Generic regex pre-cleanup (`CLEANUP_PATTERNS`, lines 1118-1143) handles trailing state codes (`,\s*NY$`, `\s+NY$`), trailing full state names, trailing zip codes, and whitespace collapse — but only for the seven states + NJ, and only as a preprocess before the dictionary lookup. Bare trailing punctuation (`"Birmingham,"`) is NOT handled, and typos outside the explicit metro dictionaries are NOT corrected.
- DATA-02 (per `prompts/20-known-issues-doc.md` issue #8 and `prompts/23-data-quality-tracker.md`) would not be fixed by this script even if it ran successfully.

What's worth lifting into a replacement:
- The transactional apply flow (`applyChanges`, lines 1267-1306): single transaction wrapping all UPDATEs, ROLLBACK on error.
- The dry-run output formatting (`printStats`, `printChanges`, lines 1308-1381): top-40 frequency table with inline arrows showing proposed normalizations, plus a grouped "PROPOSED CHANGES" report by state → target city with row counts and top-10 source variations per target.
- The exported `normalizeCityName(city, state): string` helper (line 1181) — currently dead code, was intended to be reused by other scripts.
- The metro-mapping dictionaries themselves are still useful data; they just need the SQL retargeted to `practice_locations` and the state coverage broadened.

## Active import paths (use these instead)

The live data path today is:

- `scripts/import-enrichment-csv.ts` — practice-level enrichment data (names, websites, hospital systems, insurance, hours, confidence)
- `scripts/enrich-providers-nppes.ts` — NPPES API enrichment (fill-not-overwrite; conflicts logged to `import_conflicts`)
- `scripts/pre-import-check.ts` — safety check before any import (enriched-record counts, pending conflicts)

The original NPPES bulk-import was performed once via these archived scripts against the pre-split schema (per `UPDATE-DATABASE.md`: "NY.csv import completed: 276,621 records"). Reproducing a fresh full import today would require a new script written against the current `Provider` + `practice_locations` shape — see `prompts/13-npi-data-pipeline.md` for the intended pipeline.

## Other scripts with the same class of issue

The three pre-split CSV importers (`import-csv-copy.ts`, `import-csv-simple.ts`, `import-filtered-csv.ts`) were archived alongside the NPI scripts on 2026-04-26 — see entries above.
