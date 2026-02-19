# Location Features Review

**Generated:** 2026-02-18
**Prompt:** 28-location-features.md
**Status:** Active -- Functional but lacking facility/health-system metadata

---

## Summary

The location feature has been fully migrated from the old `Location` model to the `practice_locations` table. The backend API routes, service layer, and enrichment pipeline are all implemented and registered. The frontend has a `ColocatedProviders` component and a location detail page. The major gap is that `practice_locations` stores raw address data only -- there is no facility name, health system tagging, or facility type on the table itself. Hospital affiliation data exists in a separate `provider_hospitals` table and is surfaced via the enrichment layer without writing back to `practice_locations`.

---

## Verified Checklist

### Database -- practice_locations (ACTIVE)
- [x] Table created with all address fields, phone, fax
- [x] Provider-location relationship via NPI FK (`providers.npi`)
- [x] Indexes on city, state, zip_code, npi, state+city, address_hash, lat+lng, geocoded_at
- [x] Unique constraint `uq_location_address` on (npi, address_line1, city, state, zip_code) -- **corrects prompt** which said "no unique constraint"
- [x] Geocoding fields present: `latitude`, `longitude`, `geocoded_at`
- [x] Enrichment fields present: `data_source`, `enriched_at`, `enrichment_source`
- [x] `address_hash` column for deduplication (VARCHAR(64))
- [ ] No facility name, health system, or facility type columns on practice_locations

### Schema Details (from `packages/backend/prisma/schema.prisma`, lines 74-106)
Key fields beyond basic address:
- `addressType` (practice/mailing, defaults to "practice")
- `latitude`, `longitude`, `geocoded_at` -- geocoding support
- `dataSource` (defaults to "nppes"), `enrichedAt`, `enrichmentSource` -- Phase 6 enrichment protection
- `address_hash` -- deduplication hash
- Relation to `ProviderPlanAcceptance` via `locationId` FK

### API Routes (ACTIVE -- `packages/backend/src/routes/locations.ts`)
- [x] Route file registered in `routes/index.ts` (line 17: `router.use('/locations', locationsRouter)`)
- [x] `GET /api/v1/locations/search` -- search by state (required), city, zipCode with pagination
- [x] `GET /api/v1/locations/health-systems` -- distinct health systems via `provider_hospitals` table
- [x] `GET /api/v1/locations/stats/:state` -- location count, distinct cities, zip codes, providers per state
- [x] `GET /api/v1/locations/:locationId` -- single location with parent provider
- [x] `GET /api/v1/locations/:locationId/providers` -- co-located providers at same address
- [x] All routes have Zod input validation schemas
- [x] Rate limiters applied (search: 100/hr, others: 200/hr default)

### Service Layer (`packages/backend/src/services/locationService.ts`)
- [x] `searchLocations()` -- paginated search with case-insensitive city matching, zip prefix matching
- [x] `getLocationById()` -- single location lookup with provider detail select
- [x] `getProvidersAtLocation()` -- co-location matching by addressLine1 + city + state + zipCode (case-insensitive)
- [x] `getColocatedNpis()` -- distinct NPIs at same address, excludes queried provider
- [x] `getHealthSystems()` -- pulls from `providerHospitals` table, filtered by state/city via practiceLocations relation
- [x] `getLocationStats()` -- aggregate stats per state
- [x] Explicit `locationSelect` to avoid unmigrated columns

### Enrichment Layer (`packages/backend/src/services/locationEnrichment.ts`)
- [x] `enrichLocationWithHospitalData()` -- looks up hospital affiliations from `provider_hospitals` via NPI
- [x] `getEnrichmentStats()` -- cross-table statistics (locations, hospital affiliations, by state)
- [x] `findColocatedProviders()` -- co-location by exact address match (case-insensitive)
- [x] `getLocationHealthSystem()` -- returns first hospitalSystem for a given NPI
- [x] Read-only enrichment -- no writes to practice_locations, data returned for API responses only

### Frontend (PARTIALLY EXISTS)
- [x] `ColocatedProviders` component (`packages/frontend/src/components/provider-detail/ColocatedProviders.tsx`)
  - Lazy-loaded via IntersectionObserver (loads when section scrolls into view)
  - Shows up to 10 co-located providers with "View all" link
  - Displays location info including name, health system, facility type when available
  - Links to provider detail pages and back to search
  - Error handling with `logError` / `toAppError` utilities
- [x] Location detail page at `packages/frontend/src/app/location/[locationId]/page.tsx`
- [x] `LocationCard` component (`packages/frontend/src/components/LocationCard.tsx`)
- [ ] No direct link from provider detail page to location detail page in ColocatedProviders
- [ ] Frontend references `location.name`, `location.healthSystem`, `location.facilityType` -- these would come from the enrichment layer, not the database directly

### Data Quality (PARTIALLY ADDRESSED)
- [x] Enrichment protection in place (Phase 6) -- `data_source`, `enriched_at` fields protect against NPI re-import overwrites
- [x] Unique constraint prevents duplicate NPI+address combinations
- [x] `address_hash` column exists for deduplication (not yet populated universally)
- [ ] Facility names not stored on practice_locations
- [ ] Health systems not tagged directly on locations (available via provider_hospitals join)
- [ ] Facility types not categorized
- [ ] Address normalization not implemented (relies on case-insensitive matching)

---

## Architecture Assessment

### Strengths
1. **Clean separation**: Enrichment data lives in `provider_hospitals` and is joined at query time, avoiding data duplication on `practice_locations`.
2. **Co-location matching works**: Address-based matching with case-insensitive comparison is functional for finding providers at the same physical location.
3. **Good indexing**: Six indexes cover the most common query patterns (state, city, zip, npi, composite state+city, address_hash, lat+lng).
4. **Geocoding-ready**: latitude, longitude, and geocoded_at fields are present and exposed in the location select.
5. **Lazy frontend loading**: ColocatedProviders only fires API calls when the section scrolls into view.

### Gaps
1. **No facility metadata on locations**: The prompt's Option C (enrich practice_locations directly) was not pursued. Facility name/type exist only in the frontend component's type interface, suggesting the data comes from the enrichment service or API response merging.
2. **No materialized view for grouped locations**: Multiple providers at the same address result in multiple `practice_locations` rows. Grouping happens at query time, which works but is less efficient for location-centric queries.
3. **Address normalization**: No standardization of addresses (e.g., "St" vs "Street", "Apt" vs "#"). Matching relies on exact case-insensitive equality.
4. **No provider count per location**: Unlike the old model, there is no `providerCount` field. The count is computed at query time.

### Recommendation
The current architecture (Option A from the prompt -- building abstraction on top of practice_locations) is effectively in place via the enrichment service. To complete it:
1. Consider adding a `locations_metadata` table or materialized view that groups by address_hash and stores facility name, health system, facility type, and provider count.
2. Populate `address_hash` for all existing records to enable efficient grouping.
3. Add an API endpoint that returns location groups rather than individual practice_location rows.

---

## Key Files

| File | Path | Purpose |
|------|------|---------|
| Schema | `packages/backend/prisma/schema.prisma` (lines 74-106) | PracticeLocation model |
| Routes | `packages/backend/src/routes/locations.ts` | 5 API endpoints |
| Route Registration | `packages/backend/src/routes/index.ts` (line 17) | Mounts `/locations` |
| Service | `packages/backend/src/services/locationService.ts` | Query logic, co-location |
| Enrichment | `packages/backend/src/services/locationEnrichment.ts` | Hospital affiliation data |
| Frontend Component | `packages/frontend/src/components/provider-detail/ColocatedProviders.tsx` | Co-located providers UI |
| Frontend Page | `packages/frontend/src/app/location/[locationId]/page.tsx` | Location detail page |
