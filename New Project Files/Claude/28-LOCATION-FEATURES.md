# Location Features Review

**Last Updated:** 2026-02-06
**Status:** Active -- API and frontend exist, but enrichment/metadata features are incomplete

---

## Route Registration: VERIFIED

The locations route is registered in `packages/backend/src/routes/index.ts` at line 13:
```typescript
router.use('/locations', locationsRouter);
```

All 5 API endpoints are implemented in `packages/backend/src/routes/locations.ts`:

| Endpoint | Status | Rate Limiter |
|---|---|---|
| `GET /api/v1/locations/search` | Active | searchRateLimiter (100/hr) |
| `GET /api/v1/locations/health-systems` | Active | defaultRateLimiter (200/hr) |
| `GET /api/v1/locations/stats/:state` | Active | defaultRateLimiter (200/hr) |
| `GET /api/v1/locations/:locationId` | Active | defaultRateLimiter (200/hr) |
| `GET /api/v1/locations/:locationId/providers` | Active | defaultRateLimiter (200/hr) |

All endpoints have Zod validation schemas, pagination support, and proper error handling.

---

## Database Schema: VERIFIED

The `practice_locations` model in `packages/backend/prisma/schema.prisma` (lines 64-84) matches the prompt description with one addition:

```prisma
model practice_locations {
  id            Int      @id @default(autoincrement())
  npi           String   @db.VarChar(10)
  address_type  String?  @default("practice") @db.VarChar(10)
  address_line1 String?  @db.VarChar(200)
  address_line2 String?  @db.VarChar(200)
  city          String?  @db.VarChar(100)
  state         String?  @db.VarChar(2)
  zip_code      String?  @db.VarChar(10)
  phone         String?  @db.VarChar(20)
  fax           String?  @db.VarChar(20)
  address_hash  String?  @map("address_hash") @db.VarChar(64)  // <-- NEW FIELD
  ...
}
```

**Finding:** The `address_hash` column exists in the schema but is explicitly excluded from service queries via the `locationSelect` object in both `locationService.ts` and `locationEnrichment.ts`. Comments state: "avoid address_hash -- not yet migrated." This suggests Phase 2 address normalization work is planned but not yet active.

### Indexes
- `idx_locations_city` on `city`
- `idx_locations_npi` on `npi`
- `idx_locations_state` on `state`
- `idx_locations_zip` on `zip_code`
- `idx_locations_address_hash` on `address_hash`

### Relationship
- `practice_locations` has a `providerPlanAcceptances` relation (via `ProviderPlanAcceptance.locationId`)
- This means insurance acceptance can be tracked per-location, not just per-provider

---

## Service Layer: VERIFIED

### locationService.ts
Five well-structured service functions:

1. **`searchLocations`** -- Filters by state (required), city (case-insensitive contains), zipCode (prefix match). Returns paginated results with provider brief details.
2. **`getLocationById`** -- Returns single location with provider detail (including credential).
3. **`getProvidersAtLocation`** -- Core co-location logic. Matches on `address_line1 + city + state + zip_code` (case-insensitive). Returns paginated list of all providers sharing the same physical address. Gracefully handles null `address_line1`.
4. **`getHealthSystems`** -- Queries `provider_hospitals.hospital_system` distinct values, optionally filtered by state/city via providers' practice locations.
5. **`getLocationStats`** -- Returns total locations, distinct cities, distinct zip codes, and total distinct providers for a state.

### locationEnrichment.ts
Four enrichment functions:

1. **`enrichLocationWithHospitalData`** -- Joins a location's NPI to `provider_hospitals` for hospital affiliation data. Read-only (no writes to practice_locations).
2. **`getEnrichmentStats`** -- Returns aggregate stats: total locations, providers with/without hospital affiliations, distinct hospital systems, locations by state.
3. **`findColocatedProviders`** -- Finds providers at the same address via case-insensitive match on all 4 address fields.
4. **`getLocationHealthSystem`** -- Returns the first `hospital_system` found for a given NPI.

---

## Frontend Components: VERIFIED

### Location Detail Page (`/location/[locationId]/page.tsx`)
- Full-featured page with breadcrumbs, location header, specialty filter, provider list, and pagination
- References `location.name`, `location.healthSystem`, `location.facilityType`, and `location.providerCount` from the `Location` TypeScript type
- Client-side specialty filtering across 16 specialty categories
- Google Maps link for directions
- Proper error handling with retry for network/server errors, "not found" state

### LocationCard Component
- Links to `/location/[locationId]`
- Displays: name (or address as fallback), address lines, city/state/zip, health system, provider count
- Google Maps link with `e.stopPropagation()` to prevent card navigation
- Uses `toDisplayCase`, `toAddressCase`, `toTitleCase` formatters

### ColocatedProviders Component
- Lazy-loads via `IntersectionObserver` (100px rootMargin) -- good performance pattern
- Fetches co-located providers via `providerApi.getColocated(npi, { limit: 10 })`
- Displays location info block with name, health system, facility type, address, provider count
- Shows up to 10 co-located providers with links to their detail pages
- "View all" link when total exceeds 10 (links to search page filtered by location)
- Hides entirely if no co-located providers found or on error -- keeps the page clean
- Uses standardized error handling (`toAppError`, `getUserMessage`, `logError`)

---

## Checklist Verification

### Database -- practice_locations (ACTIVE)
- [x] Table created with address fields -- **VERIFIED** in schema.prisma
- [x] Provider-location relationship via NPI FK -- **VERIFIED**: `providers Provider @relation(fields: [npi], references: [npi])`
- [x] Indexes on city, state, zip_code, npi -- **VERIFIED**: 4 indexes plus address_hash
- [ ] No unique constraint on address -- **CONFIRMED**: duplicate addresses remain possible
- [ ] No facility/health system metadata fields -- **CONFIRMED**: no `facility_name`, `health_system`, or `facility_type` columns on `practice_locations`

### API Routes (ACTIVE)
- [x] Route file registered in `routes/index.ts` -- **VERIFIED** at line 13
- [x] `locationService.ts` active -- **VERIFIED**: 5 functions, all using Prisma queries
- [x] `locationEnrichment.ts` active -- **VERIFIED**: 4 functions, enrichment from `provider_hospitals`
- [x] All 5 endpoints functional -- **VERIFIED**: each with Zod validation and rate limiting

### Frontend (PARTIALLY EXISTS)
- [x] Location detail page exists -- **VERIFIED**: `/location/[locationId]/page.tsx` (289 lines)
- [x] `LocationCard` component exists -- **VERIFIED**: 80 lines, links to detail page
- [x] `ColocatedProviders` component exists -- **VERIFIED**: 178 lines, lazy-loaded
- [x] Frontend pages connected to working API endpoints -- **VERIFIED**: uses `locationApi.getProviders()`
- [ ] Link from provider detail to location page -- **NOT FOUND**: ColocatedProviders links to search, not to `/location/[id]`

### Data Quality (NOT STARTED)
- [ ] Location/facility names not populated -- **CONFIRMED**: `practice_locations` has no `name` field; frontend references `location.name` from the TypeScript type but it is populated from enrichment
- [ ] Health systems not tagged -- **CONFIRMED**: enrichment from `provider_hospitals` exists but is runtime-only (not written back)
- [ ] Facility types not categorized -- **CONFIRMED**: no facility_type column in schema
- [ ] Duplicate addresses not merged -- **CONFIRMED**: no unique constraint, no grouping mechanism
- [ ] Address normalization not implemented -- **CONFIRMED**: `address_hash` column exists but is excluded from queries ("not yet migrated")

---

## Questions Answered

### 1. Which rewrite option to pursue?
**Recommendation: Option A (Build Location Abstraction on Top).** The `address_hash` column already exists in the schema (though not yet active), suggesting the team is already moving toward address normalization. A materialized view grouping by normalized address would avoid schema migration while enabling the grouping needed for facility-level views. The enrichment service already performs runtime joins to `provider_hospitals` for health system data.

### 2. Is the location feature a priority for the next phase?
The feature is **architecturally complete** -- routes, services, enrichment, and frontend all exist and work. The gap is data quality: no facility names, no health system tagging on the location itself, and no address deduplication. The `address_hash` column in the schema signals this was planned. Priority should be moderate -- it adds significant user value but requires a data backfill before it is truly useful.

### 3. Should co-located providers use a simple address match instead of a Location FK?
**Currently using address match.** The `getProvidersAtLocation` function in `locationService.ts` performs a case-insensitive match on `address_line1 + city + state + zip_code`. This works but is fragile (e.g., "123 Main St" vs "123 Main Street"). The `address_hash` column would solve this if populated with normalized address hashes. The `ProviderPlanAcceptance.locationId` FK already exists for location-specific insurance verification.

### 4. What percentage of providers share addresses?
Cannot be determined from code alone -- this requires a database query. The `getLocationStats` function provides total locations vs. distinct providers per state, which would give a ratio. The `findColocatedProviders` function in the enrichment service exists specifically to answer this question at runtime.

### 5. Should health system identification come from `provider_hospitals` table instead?
**It already does.** The `getHealthSystems` function in `locationService.ts` queries `provider_hospitals.hospital_system`, and `enrichLocationWithHospitalData` joins provider NPIs to their hospital affiliations. The `getLocationHealthSystem` function returns the health system for a given NPI. This is the correct approach since `provider_hospitals` is the authoritative source for hospital/health system affiliations.

---

## Recommendations

1. **Activate `address_hash`**: Populate the column with normalized address hashes (lowercase, abbreviation-expanded, whitespace-normalized) and use it for co-location grouping instead of raw address matching.

2. **Add location-to-location navigation**: The `ColocatedProviders` component currently links overflow to search results. Add a direct link to `/location/[id]` for the location itself.

3. **Create a materialized view** for grouped locations (unique addresses with provider counts, facility names from `provider_hospitals`, health systems). Refresh periodically or on data import.

4. **Fix the frontend type mismatch**: The `Location` TypeScript type includes `name`, `healthSystem`, `facilityType`, and `providerCount` fields that do not exist on `practice_locations`. These need to come from enrichment joins or computed values in the API response.

5. **Add location search mode**: The breadcrumb in the detail page links to `/search?mode=locations`, confirming a location search mode is expected in the frontend search page.
