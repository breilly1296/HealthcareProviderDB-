# Location Features -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/28-location-features.md
**Status:** Partially disabled. The `practice_locations` table is active and populated, but the locations API route is commented out. Backend services (`locationService.ts`, `locationEnrichment.ts`) reference the old `Location` model which no longer exists in the Prisma schema. Frontend components exist but cannot function without a working API.

---

## Findings

### Database -- practice_locations (Active Schema)

- **Table created with address fields**
  Verified. `packages/backend/prisma/schema.prisma` lines 62-79 define the `practice_locations` model with `id`, `npi`, `address_type`, `address_line1`, `address_line2`, `city`, `state`, `zip_code`, `phone`, and `fax`.

- **Provider-location relationship via NPI FK**
  Verified. Line 73: `providers Provider @relation(fields: [npi], references: [npi], onDelete: NoAction, onUpdate: NoAction)`.

- **Indexes on city, state, zip_code, npi**
  Verified. Lines 75-78 define indexes: `idx_locations_city`, `idx_locations_npi`, `idx_locations_state`, `idx_locations_zip`.

- **No unique constraint on address**
  Confirmed. There is no `@@unique` directive on the `practice_locations` model. Duplicate address rows for different providers (or even the same provider) are permitted.

- **No facility/health system metadata fields**
  Confirmed. The model contains only raw address data plus `phone` and `fax`. There are no `name`, `health_system`, `facility_type`, or `provider_count` columns.

- **address_type field**
  Verified. Line 65: `address_type String? @default("practice") @db.VarChar(10)`. This distinguishes practice vs. mailing addresses, which the old `Location` model did not support.

### API Routes (Disabled)

- **Route file exists but is commented out in routes/index.ts**
  Verified. `packages/backend/src/routes/index.ts`:
  - Line 5: `// import locationsRouter from './locations';` (commented out)
  - Line 14: `// router.use('/locations', locationsRouter);` (commented out)
  - Line 5 includes the TODO comment: "locations route depends on old Location model - needs rewrite for practice_locations"

- **locations.ts route file exists and is fully coded**
  Verified. `packages/backend/src/routes/locations.ts` (187 lines) defines all five endpoints:
  - `GET /search` (lines 40-69) -- search locations with filters
  - `GET /health-systems` (lines 76-91) -- distinct health systems
  - `GET /stats/:state` (lines 97-105) -- location stats by state
  - `GET /:locationId` (lines 111-130) -- location detail
  - `GET /:locationId/providers` (lines 136-185) -- providers at a location

  All endpoints import from `locationService.ts` which references `prisma.location` -- a model that no longer exists in the schema.

- **locationService.ts needs rewrite for practice_locations schema**
  Confirmed. `packages/backend/src/services/locationService.ts` (194 lines) uses:
  - `prisma.location.findMany` (line 66)
  - `prisma.location.count` (line 72)
  - `prisma.location.findUnique` (line 87)
  - `prisma.location.aggregate` (line 148)
  - `prisma.location.groupBy` (line 185)
  - `Prisma.LocationWhereInput` type (line 40)
  - `location.providerCount` (line 91, 46)
  - `location.healthSystem` (line 45)

  All of these reference the removed `Location` model with its `providerCount`, `healthSystem`, `facilityType`, and `name` fields. None of these fields exist on `practice_locations`.

- **locationEnrichment.ts needs rewrite**
  Confirmed. `packages/backend/src/services/locationEnrichment.ts` (453 lines) references:
  - `prisma.location.findMany` (line 294)
  - `prisma.location.update` (line 344)
  - `prisma.location.count` (lines 438-439)
  - `prisma.provider.findMany({ where: { locationId } })` (line 183) -- Provider no longer has a `locationId` field
  - `location.name`, `location.healthSystem`, `location.facilityType` (lines 297-300, 393-427)

  The entire enrichment service is built around the old model's concept of grouped locations with metadata.

- **All 5 endpoints non-functional**
  Confirmed. Even if the route were re-enabled, every service call would fail at runtime because `prisma.location` is undefined (no `Location` model in schema).

### Frontend (Partially Exists)

- **Location detail page exists**
  Referenced in prompt at `/location/[locationId]/page.tsx`. Not directly read but noted as existing per prompt documentation.

- **LocationCard component exists**
  Referenced in prompt. Likely renders location data fetched from the disabled API.

- **ColocatedProviders component**
  Referenced in prompt at `packages/frontend/src/components/provider-detail/ColocatedProviders.tsx`. Uses colocated provider logic that relied on the old `locationId` FK on the Provider model.

- **Frontend pages may error without working API endpoints**
  Confirmed. Any frontend page that calls `/api/v1/locations/*` would receive a 404 since the route is not registered.

### Key Differences: Old Location vs. practice_locations

| Aspect | Old `Location` (Removed) | Current `practice_locations` |
|---|---|---|
| **Relationship direction** | Many providers -> one location (grouped by shared address) | One provider -> many locations (flat, per-NPI) |
| **Grouping** | Automatic via unique address constraint | None -- duplicate addresses allowed |
| **Metadata** | `name`, `healthSystem`, `facilityType`, `providerCount` | None -- raw address + phone/fax only |
| **Unique constraint** | `@@unique([addressLine1, city, state, zipCode])` | None |
| **Address type** | Implicit (all practice) | Explicit `address_type` field (practice/mailing) |
| **Provider FK direction** | Provider had `locationId` FK | `practice_locations` has `npi` FK to Provider |

### What `provider_hospitals` Offers

The `provider_hospitals` model (schema lines 92-104) already stores `hospital_system` and `hospital_name` linked by NPI. This partially overlaps with the old `Location` model's `healthSystem` field. A rewrite could leverage `provider_hospitals` data to enrich location-level health system information.

---

## Summary

The location feature is in a frozen state. The database table (`practice_locations`) is active and populated with raw address data for providers, but it fundamentally differs from the old `Location` model -- it is a flat one-to-many (provider -> addresses) table without grouping, facility names, or health system metadata.

Three backend files (`locations.ts`, `locationService.ts`, `locationEnrichment.ts`) are fully coded but reference a `Location` Prisma model that no longer exists. The route is correctly commented out in `routes/index.ts` to prevent runtime errors. Frontend components (`LocationCard`, location detail page, `ColocatedProviders`) exist but will fail or show empty data without the API.

The core challenge for re-implementation is that `practice_locations` stores individual provider-address rows, while the old model grouped providers by shared address. Re-enabling the feature requires either building a grouping abstraction (view, materialized view, or query-time aggregation) or creating a new `locations_metadata` table that sits alongside `practice_locations`.

---

## Recommendations

1. **Do not re-enable the locations route without a service rewrite.** Uncommenting the route in `index.ts` will cause immediate runtime errors because `prisma.location` does not exist.

2. **Choose a rewrite strategy.** The prompt outlines three options:
   - **Option A (Recommended for quick wins):** Create a PostgreSQL view or materialized view that groups `practice_locations` by normalized address. Add a separate `locations_metadata` table for facility names, health systems, and facility types. This avoids schema migration on the main table.
   - **Option B:** Restore a `Location` model alongside `practice_locations` with FK linking. Clean separation but more complex migration.
   - **Option C:** Add columns (`facility_name`, `health_system`, `facility_type`) directly to `practice_locations`. Simplest code change but creates data duplication across rows sharing the same address.

3. **Leverage `provider_hospitals` for health system identification.** The `hospital_system` field in `provider_hospitals` contains health system names (e.g., "HCA Healthcare") that could populate location-level metadata without external data sources.

4. **Address normalization is prerequisite for grouping.** Before any grouping strategy works, addresses must be normalized (e.g., "123 Main St" vs "123 Main Street" vs "123 MAIN ST"). Consider using a library or PostgreSQL function for address standardization.

5. **ColocatedProviders component can work without the full Location feature.** A simple address-match query on `practice_locations` (same `address_line1`, `city`, `state`, `zip_code`, different `npi`) could power the colocated providers feature without rebuilding the entire location abstraction.

6. **Prioritize based on user value.** If location browsing (all providers at a hospital) is not a near-term priority, consider implementing only the colocated-providers query and deferring the full location search/browse feature.
