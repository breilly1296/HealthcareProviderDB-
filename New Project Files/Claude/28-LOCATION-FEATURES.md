# Location Features Review

> **Generated:** 2026-02-07
> **Status:** ACTIVE -- All backend endpoints operational, frontend pages functional, enrichment pipeline live
> **Prompt:** `prompts/28-location-features.md`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Database Layer](#database-layer)
3. [Backend Services](#backend-services)
4. [API Endpoints](#api-endpoints)
5. [Frontend Components](#frontend-components)
6. [Data Flow Diagrams](#data-flow-diagrams)
7. [Address Deduplication](#address-deduplication)
8. [Gaps and Missing Features](#gaps-and-missing-features)
9. [Rewrite Options Analysis](#rewrite-options-analysis)
10. [Recommendations](#recommendations)

---

## 1. Executive Summary

The location feature in HealthcareProviderDB allows users to explore healthcare providers grouped by their physical practice addresses. The original `Location` model (which grouped providers into shared address records with facility metadata) was replaced during the schema migration by the `practice_locations` table, which stores raw per-provider addresses in a flat one-to-many relationship.

**What is fully operational today:**

- The `practice_locations` table stores addresses for every provider (one provider can have multiple addresses)
- Five REST API endpoints under `/api/v1/locations/` are registered and functional
- A colocated-providers endpoint under `/api/v1/providers/:npi/colocated` assembles location + provider data on the fly
- Two backend services (`locationService.ts` and `locationEnrichment.ts`) provide query, enrichment, and co-location logic
- A frontend location detail page at `/location/[locationId]` renders providers at a location
- A `LocationCard` component exists for rendering location search results
- A `ColocatedProviders` component appears on every provider detail page, lazy-loaded via IntersectionObserver
- An `address_hash` column and deduplication script exist for future address grouping

**What is missing or incomplete:**

- No facility name, health system, or facility type columns on `practice_locations` (these are synthesized from `provider_hospitals` at request time)
- No unique constraint on addresses -- duplicate rows for the same physical address are expected
- `LocationCard` is defined but not imported by any search results page
- No dedicated "Location Search" page exists in the frontend -- the `LocationCard` component is unused in practice
- Address normalization is not implemented (case-insensitive matching is used as a workaround)

---

## 2. Database Layer

### 2.1 The `practice_locations` Table (Active)

**File:** `packages/backend/prisma/schema.prisma` (lines 64-84)

```prisma
model practice_locations {
  id                      Int                      @id @default(autoincrement())
  npi                     String                   @db.VarChar(10)
  address_type            String?                  @default("practice") @db.VarChar(10)
  address_line1           String?                  @db.VarChar(200)
  address_line2           String?                  @db.VarChar(200)
  city                    String?                  @db.VarChar(100)
  state                   String?                  @db.VarChar(2)
  zip_code                String?                  @db.VarChar(10)
  phone                   String?                  @db.VarChar(20)
  fax                     String?                  @db.VarChar(20)
  address_hash            String?                  @map("address_hash") @db.VarChar(64)
  providers               Provider                 @relation(fields: [npi], references: [npi], onDelete: NoAction, onUpdate: NoAction)
  providerPlanAcceptances ProviderPlanAcceptance[]

  @@index([city], map: "idx_locations_city")
  @@index([npi], map: "idx_locations_npi")
  @@index([state], map: "idx_locations_state")
  @@index([zip_code], map: "idx_locations_zip")
  @@index([address_hash], map: "idx_locations_address_hash")
}
```

**Key design decisions:**

| Aspect | Value |
|---|---|
| Primary key | Auto-incrementing integer `id` |
| Provider relationship | Many-to-one via `npi` FK to `providers.npi` |
| Address type | Defaults to `"practice"` -- also supports `"mailing"` |
| Address hash | SHA-256 for deduplication (populated by script, not auto-computed) |
| Unique constraints | None -- duplicate address rows are allowed |
| Indexes | 5 indexes: `city`, `npi`, `state`, `zip_code`, `address_hash` |

### 2.2 Relationship to `Provider` Model

The `Provider` model (line 34 of the schema) declares the reverse relation:

```prisma
practice_locations  practice_locations[]
```

This is a one-to-many: one provider can have multiple practice locations. The `getPrimaryLocation()` helper in `providerService.ts` selects the preferred location:

**File:** `packages/backend/src/services/providerService.ts` (lines 367-379)

```typescript
export function getPrimaryLocation(locations?: Array<{
  address_type?: string | null;
  address_line1?: string | null;
  // ... other fields
}>) {
  if (!locations || locations.length === 0) return null;
  return locations.find(l => l.address_type === 'practice') || locations[0];
}
```

It prefers a location with `address_type === 'practice'`, falling back to the first entry.

### 2.3 Relationship to `ProviderPlanAcceptance`

Each `ProviderPlanAcceptance` record can optionally reference a `practice_locations` row via `location_id`:

```prisma
model ProviderPlanAcceptance {
  locationId  Int?  @map("location_id")
  location    practice_locations? @relation(fields: [locationId], references: [id], onUpdate: NoAction)
  // ...
}
```

This enables location-specific plan acceptance tracking (e.g., "Dr. Smith accepts BlueCross at her downtown office but not her suburban office").

### 2.4 Related Tables for Enrichment

The `provider_hospitals` table provides health system and hospital affiliation data:

```prisma
model provider_hospitals {
  id              Int      @id @default(autoincrement())
  npi             String   @db.VarChar(10)
  hospital_system String?  @db.VarChar(100)
  hospital_name   String?  @db.VarChar(200)
  ccn             String?  @db.VarChar(20)
  source          String?  @db.VarChar(30)
  confidence      String?  @default("MEDIUM") @db.VarChar(10)
}
```

The `hospitals` reference table stores hospital master data:

```prisma
model hospitals {
  ccn             String  @id @db.VarChar(20)
  hospital_name   String? @db.VarChar(200)
  hospital_system String? @db.VarChar(100)
  address         String? @db.VarChar(200)
  city            String? @db.VarChar(100)
  state           String? @db.VarChar(2)
  zip_code        String? @db.VarChar(10)
  phone           String? @db.VarChar(20)
}
```

### 2.5 Old `Location` Model (Removed)

The original design had a separate `Location` model that grouped providers by shared address with facility metadata (`name`, `healthSystem`, `facilityType`, `providerCount`). This was a many-to-one relationship where multiple providers pointed to the same Location record. The new `practice_locations` table flattened this into a one-to-many (one provider, many address rows) with no grouping or metadata.

---

## 3. Backend Services

### 3.1 `locationService.ts` -- Core Location Queries

**File:** `packages/backend/src/services/locationService.ts` (257 lines)

This service provides six exported functions:

#### `searchLocations(params)`

Searches `practice_locations` by state (required), with optional city and zip code filters. Returns paginated results with the associated provider (via `providerBriefSelect`).

```typescript
export async function searchLocations(params: LocationSearchParams) {
  const where: Prisma.practice_locationsWhereInput = {
    state: state.toUpperCase(),
  };
  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }
  if (zipCode) {
    where.zip_code = { startsWith: zipCode };
  }
  // ...findMany with pagination
}
```

Notable behavior:
- State is always uppercased
- City uses case-insensitive `contains` (partial match)
- ZIP code uses `startsWith` (prefix match, supports 5-digit or 9-digit)
- Results ordered by city ascending, then address ascending

#### `getLocationById(id)`

Fetches a single `practice_locations` row by integer ID, including the parent provider's detail fields (npi, name, credential, specialty).

#### `getProvidersAtLocation(id, options)`

The co-location query. Given a location ID:
1. Fetches the reference location
2. Builds a case-insensitive match on `address_line1`, `city`, `state`, `zip_code`
3. Returns all `practice_locations` rows at that same address (with their providers)

```typescript
const where: Prisma.practice_locationsWhereInput = {
  address_line1: { equals: location.address_line1, mode: 'insensitive' },
  ...(location.city && { city: { equals: location.city, mode: 'insensitive' as const } }),
  ...(location.state && { state: location.state }),
  ...(location.zip_code && { zip_code: location.zip_code }),
};
```

Important: This matches on raw address text, not on `address_hash`. Null fields are excluded from the filter (only non-null fields participate in the match).

#### `getColocatedNpis(addressLine1, city, state, zipCode, excludeNpi, options)`

A variant of co-location that returns only distinct NPIs (excluding a given NPI). Used by the providers route to power the `/:npi/colocated` endpoint.

```typescript
const allDistinct = await prisma.practice_locations.findMany({
  where,
  select: { npi: true },
  distinct: ['npi'],
  orderBy: { npi: 'asc' },
});
// Manual pagination of distinct results
const paginatedNpis = allDistinct.slice(skip, skip + take).map(r => r.npi);
```

Note: Prisma does not support `count` with `distinct` together, so this fetches all distinct NPIs and paginates in memory. This could become a performance concern at high provider density (e.g., large hospital complexes).

#### `getHealthSystems(options)`

Returns distinct `hospital_system` values from `provider_hospitals`, optionally filtered by geographic location via the provider's practice_locations.

```typescript
if (options.state || options.city) {
  where.providers = {
    practice_locations: {
      some: {
        ...(options.state && { state: options.state.toUpperCase() }),
        ...(options.city && { city: { contains: options.city, mode: 'insensitive' } }),
      },
    },
  };
}
```

This uses Prisma's nested relation filtering to traverse `provider_hospitals -> providers -> practice_locations`.

#### `getLocationStats(state)`

Returns aggregate statistics for a state: total location rows, distinct cities, distinct ZIP codes, distinct providers (by NPI).

```typescript
const [totalLocations, distinctCities, distinctZips, distinctProviders] = await Promise.all([
  prisma.practice_locations.count({ where: { state: upperState } }),
  // ...three more distinct queries
]);
```

### 3.2 `locationEnrichment.ts` -- Enrichment Pipeline

**File:** `packages/backend/src/services/locationEnrichment.ts` (170 lines)

This service enriches location data with hospital affiliation information from `provider_hospitals`. It is read-only -- it does not write to `practice_locations`.

#### `enrichLocationWithHospitalData(locationId)`

Given a location ID, looks up the provider's NPI, then fetches their hospital affiliations. Returns the location record alongside an array of `hospitalAffiliations` objects containing `hospital_name`, `hospital_system`, `ccn`, and `confidence`.

#### `getEnrichmentStats()`

Computes cross-table statistics:
- Total practice locations
- Count of providers with vs. without hospital affiliations
- Count of distinct hospital systems
- Location counts grouped by state

#### `findColocatedProviders(addressLine1, city, state, zipCode)`

An alternative co-location finder that returns full location + provider records, formatted with an `address` sub-object:

```typescript
return locations.map((loc) => ({
  locationId: loc.id,
  npi: loc.npi,
  address: {
    addressLine1: loc.address_line1,
    city: loc.city,
    state: loc.state,
    zipCode: loc.zip_code,
  },
  provider: loc.providers,
}));
```

#### `getLocationHealthSystem(npi)`

Returns the first `hospital_system` name for a given NPI from `provider_hospitals`. Used by the colocated providers endpoint to populate the `healthSystem` field in the constructed Location object.

### 3.3 Explicit Select Pattern

Both services use an explicit `locationSelect` object instead of `select: true` to avoid reading the `address_hash` column (noted as "not yet migrated" in Phase 2 comments):

```typescript
const locationSelect = {
  id: true,
  npi: true,
  address_type: true,
  address_line1: true,
  address_line2: true,
  city: true,
  state: true,
  zip_code: true,
  phone: true,
  fax: true,
} as const;
```

---

## 4. API Endpoints

### 4.1 Location Routes (5 endpoints)

**File:** `packages/backend/src/routes/locations.ts` (150 lines)
**Registration:** `packages/backend/src/routes/index.ts` (line 13: `router.use('/locations', locationsRouter)`)

All five endpoints are registered and functional.

#### `GET /api/v1/locations/search`

| Aspect | Detail |
|---|---|
| Rate limiter | `searchRateLimiter` |
| Required params | `state` (2-char, uppercased) |
| Optional params | `city` (string), `zipCode` (string), `page`, `limit` |
| Validation | Zod schema `searchQuerySchema` |
| Response shape | `{ success, data: { locations[], pagination } }` |

#### `GET /api/v1/locations/health-systems`

| Aspect | Detail |
|---|---|
| Rate limiter | `defaultRateLimiter` |
| Optional params | `state` (2-char), `city` (string) |
| Response shape | `{ success, data: { healthSystems[], count } }` |

#### `GET /api/v1/locations/stats/:state`

| Aspect | Detail |
|---|---|
| Rate limiter | `defaultRateLimiter` |
| Required params | `state` (path param, 2-char) |
| Response shape | `{ success, data: { state, totalLocations, distinctCities, distinctZipCodes, totalProviders } }` |

#### `GET /api/v1/locations/:locationId`

| Aspect | Detail |
|---|---|
| Rate limiter | `defaultRateLimiter` |
| Required params | `locationId` (path param, positive integer) |
| Error handling | 404 if not found (`AppError.notFound`) |
| Response shape | `{ success, data: { location } }` (includes provider detail) |

#### `GET /api/v1/locations/:locationId/providers`

| Aspect | Detail |
|---|---|
| Rate limiter | `defaultRateLimiter` |
| Required params | `locationId` (path param, positive integer) |
| Optional params | `page`, `limit` |
| Error handling | 404 if not found |
| Response shape | `{ success, data: { location, providers[], pagination } }` |

### 4.2 Colocated Providers Endpoint (on Providers Route)

**File:** `packages/backend/src/routes/providers.ts` (lines 305-373)

#### `GET /api/v1/providers/:npi/colocated`

This endpoint is on the providers router but is central to the location feature. It:

1. Looks up the provider by NPI
2. Gets their primary practice location via `getPrimaryLocation()`
3. Calls `getColocatedNpis()` to find distinct NPIs at the same address
4. Calls `getLocationHealthSystem()` to get the health system name
5. Fetches full provider records for the colocated NPIs
6. Constructs a synthetic `Location` object with:
   - `id: 0` (not a real location ID)
   - `name: null` (no facility name available)
   - `healthSystem`: from `provider_hospitals` lookup
   - `facilityType: null` (not available)
   - `providerCount`: colocated total + 1 (includes the queried provider)

```typescript
const location = {
  id: 0,
  addressLine1: primaryLoc.address_line1,
  addressLine2: primaryLoc.address_line2 || null,
  city: primaryLoc.city || '',
  state: primaryLoc.state || '',
  zipCode: primaryLoc.zip_code || '',
  name: null,
  healthSystem,
  facilityType: null,
  providerCount: colocatedResult.total + 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
```

### 4.3 Request Validation

All location routes use Zod schemas for input validation:

```typescript
const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase(),
  city: z.string().min(1).max(100).optional(),
  zipCode: z.string().min(3).max(10).optional(),
}).merge(paginationSchema);

const locationIdSchema = z.object({
  locationId: z.coerce.number().int().positive(),
});

const stateParamSchema = z.object({
  state: z.string().length(2).toUpperCase(),
});

const healthSystemsQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
});
```

---

## 5. Frontend Components

### 5.1 Location Detail Page

**File:** `packages/frontend/src/app/location/[locationId]/page.tsx` (288 lines)

A client-side rendered page at route `/location/[locationId]`. It:

1. Parses `locationId` from the URL params and `page`/`specialty` from query params
2. Calls `locationApi.getProviders(locationId, { page, limit })` to fetch the location + providers
3. Renders a breadcrumb (`Home > Locations > [location name]`)
4. Displays a location header card showing:
   - Location name (falls back to `addressLine1` if no name)
   - Health system name (if available)
   - Facility type (if available)
   - Full address with Google Maps link
   - Provider count badge
5. Provides a client-side specialty filter dropdown with 16 specialty categories
6. Renders `ProviderCard` components for each provider at the location
7. Includes pagination when there are multiple pages

**Frontend `Location` type** (`packages/frontend/src/types/index.ts`, lines 127-140):

```typescript
export interface Location {
  id: number;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  name: string | null;
  healthSystem: string | null;
  facilityType: string | null;
  providerCount: number;
  createdAt: string;
  updatedAt: string;
}
```

This type includes `name`, `healthSystem`, and `facilityType` fields that are currently always `null` from the locations API (no data source populates them). The colocated endpoint does populate `healthSystem` from `provider_hospitals`.

### 5.2 LocationCard Component

**File:** `packages/frontend/src/components/LocationCard.tsx` (80 lines)

A card component for rendering a location in search results. It:

- Links to `/location/${location.id}`
- Uses `toDisplayCase`, `toAddressCase`, `toTitleCase` formatters for proper name casing
- Shows location name (or address as fallback), full address, health system
- Displays provider count and a "View on map" Google Maps link

**Current status:** This component is defined but **not imported anywhere** in the codebase. There is no search results page that renders `LocationCard` instances. The `LocationCard` would be used if a dedicated location search results page were built.

### 5.3 ColocatedProviders Component

**File:** `packages/frontend/src/components/provider-detail/ColocatedProviders.tsx` (178 lines)

This component is rendered on every provider detail page. It:

1. Uses `IntersectionObserver` for lazy loading -- only fetches data when the section scrolls into view (with 100px root margin)
2. Calls `providerApi.getColocated(npi, { limit: 10 })` to get colocated providers
3. Renders nothing if there are no colocated providers (keeps the page clean)
4. Shows a location info card with address, health system, facility type, and total provider count
5. Lists up to 10 colocated providers with name, specialty, and phone number
6. Provides a "View all N providers" link (redirects to search page filtered by location) when there are more than 10

**Integration point:** Used in `ProviderDetailClient.tsx` (line 207):

```tsx
<ColocatedProviders npi={npi} />
```

### 5.4 Frontend API Client

**File:** `packages/frontend/src/lib/api.ts` (lines 584-670)

The `locations` API object (also exported as `locationApi`) provides five methods:

```typescript
const locations = {
  search: (params) =>
    apiFetch<{ locations: Location[]; pagination: PaginationState }>(
      `/locations/search?${buildQueryString(queryParams)}`
    ),

  getHealthSystems: (stateOrParams, cities?) =>
    apiFetch<{ healthSystems: string[]; count: number }>(
      `/locations/health-systems?${buildQueryString(...)}`
    ),

  getById: (locationId: number) =>
    apiFetch<{ location: Location }>(`/locations/${locationId}`),

  getProviders: (locationId: number, params) =>
    apiFetch<{ location: Location; providers: ProviderDisplay[]; pagination: PaginationState }>(
      `/locations/${locationId}/providers?${buildQueryString(params)}`
    ),

  getStats: (state: string) =>
    apiFetch<LocationStats>(`/locations/stats/${encodeURIComponent(state)}`),
};
```

The colocated providers endpoint is on the `providers` API object:

```typescript
getColocated: (npi: string, params) =>
  apiFetch<{ location: Location; providers: ProviderDisplay[]; pagination: PaginationState }>(
    `/providers/${npi}/colocated?${buildQueryString(params)}`
  ),
```

### 5.5 Skeleton/Loading States

**File:** `packages/frontend/src/components/ProviderCardSkeleton.tsx`

The `LocationDetailSkeleton` component provides a shimmer loading state while the location detail page fetches data. The `ColocatedProviders` component has its own inline skeleton with three shimmer placeholders.

---

## 6. Data Flow Diagrams

### 6.1 Location Detail Page Flow

```
Browser: /location/123
  |
  v
LocationDetailPage (page.tsx)
  |
  | locationApi.getProviders(123, { page, limit })
  v
GET /api/v1/locations/123/providers
  |
  v
locations.ts route handler
  |
  | locationIdSchema.parse(req.params)
  | paginationSchema.parse(req.query)
  v
locationService.getProvidersAtLocation(123, { page, limit })
  |
  | 1. findUnique(id: 123) -> reference location
  | 2. Build case-insensitive address match
  | 3. findMany(where: address match) + count
  v
Response: { location, providers[], pagination }
  |
  v
Render: Location header + ProviderCard list + pagination
```

### 6.2 Colocated Providers Flow (Provider Detail Page)

```
Browser: /provider/1234567890
  |
  v
ProviderDetailClient.tsx
  |
  | Renders <ColocatedProviders npi="1234567890" />
  v
ColocatedProviders.tsx (lazy-loaded via IntersectionObserver)
  |
  | providerApi.getColocated("1234567890", { limit: 10 })
  v
GET /api/v1/providers/1234567890/colocated
  |
  v
providers.ts route handler
  |
  | 1. getProviderByNpi("1234567890")
  | 2. getPrimaryLocation(provider.practice_locations)
  | 3. Promise.all([
  |      getColocatedNpis(address, npi),    // locationService
  |      getLocationHealthSystem(npi),       // locationEnrichment
  |    ])
  | 4. prisma.provider.findMany({ where: { npi: { in: npis } } })
  | 5. Construct synthetic Location object
  v
Response: { location, providers[], pagination }
  |
  v
Render: Address card + up to 10 ProviderLinks + "View all" link
```

### 6.3 Health Systems Query Flow

```
GET /api/v1/locations/health-systems?state=CA
  |
  v
locationService.getHealthSystems({ state: "CA" })
  |
  | provider_hospitals WHERE hospital_system IS NOT NULL
  |   AND providers.practice_locations SOME { state: "CA" }
  | DISTINCT hospital_system, ORDER BY hospital_system ASC
  v
Response: { healthSystems: ["HCA Healthcare", "Kaiser Permanente", ...], count: N }
```

---

## 7. Address Deduplication

### 7.1 The `address_hash` Column

The `practice_locations` table includes an `address_hash` column (VARCHAR(64)) that stores a SHA-256 hash of the normalized address. This column:

- Exists in the schema with an index (`idx_locations_address_hash`)
- Is not included in the `locationSelect` used by services (comment: "not yet migrated")
- Is populated by a standalone script, not by application code

### 7.2 Deduplication Script

**File:** `scripts/deduplicate-locations.ts` (200 lines)

This script computes and stores address hashes:

```typescript
function computeAddressHash(
  addressLine1: string | null,
  city: string | null,
  state: string | null,
  zipCode: string | null
): string {
  const parts = [
    (addressLine1 || '').toLowerCase().trim(),
    (city || '').toLowerCase().trim(),
    (state || '').toUpperCase().trim(),
    (zipCode || '').substring(0, 5).trim(),   // ZIP+4 truncated to 5
  ].join('|');
  return crypto.createHash('sha256').update(parts).digest('hex');
}
```

**Usage:**
```bash
npx tsx scripts/deduplicate-locations.ts           # Dry run (report only)
npx tsx scripts/deduplicate-locations.ts --apply    # Apply hashes to DB
npx tsx scripts/deduplicate-locations.ts --apply --limit 10000  # Batch limit
```

**Features:**
- Processes in batches of 1,000 rows using transactions
- Skips already-hashed rows (`WHERE address_hash IS NULL`)
- Reports deduplication statistics: total locations, unique addresses, duplicate count, duplication ratio
- Shows top 10 most duplicated addresses and providers with the most locations

**Current limitation:** The hash is computed and stored but is not used by any service queries. Co-location matching still uses raw text comparison via `address_line1 + city + state + zip_code`. Switching to `address_hash`-based matching would be more reliable and performant.

---

## 8. Gaps and Missing Features

### 8.1 Database Gaps

| Gap | Impact | Severity |
|---|---|---|
| No `facility_name` column | Cannot label locations (e.g., "Memorial Hospital") | Medium |
| No `health_system` column | Must query `provider_hospitals` at request time | Low (workaround exists) |
| No `facility_type` column | Cannot categorize as Hospital/Clinic/etc. | Medium |
| No unique constraint on address | Duplicate address rows are allowed and expected | Low (by design) |
| `address_hash` not used in queries | Co-location uses text matching instead of hash | Low (correctness issue at scale) |
| No composite index on `(state, city)` | Searches that filter both fields scan two separate indexes | Low |

### 8.2 Backend Gaps

| Gap | Impact | Severity |
|---|---|---|
| `getColocatedNpis()` fetches all distinct NPIs into memory | Performance concern at high-density locations | Medium |
| No address normalization | "123 Main St" vs "123 MAIN STREET" treated as different | Medium |
| `enrichLocationWithHospitalData()` not called by any route | Enrichment function exists but is unused | Low |
| `findColocatedProviders()` in enrichment service duplicates `getProvidersAtLocation()` | Two similar functions in different services | Low |

### 8.3 Frontend Gaps

| Gap | Impact | Severity |
|---|---|---|
| `LocationCard` is not imported anywhere | No location search results UI | High |
| No location search page | Users cannot search for locations directly | High |
| No link from provider detail page to location detail page | Cannot navigate from provider to their location page | Medium |
| `name`, `healthSystem`, `facilityType` always null from locations API | Location header shows address instead of facility name | Medium |
| Specialty filter is client-side only | Filter does not reduce network payload | Low |

### 8.4 Data Quality Gaps

| Gap | Impact |
|---|---|
| Facility names not populated | Locations display as raw addresses |
| Health systems only available via `provider_hospitals` join | Not all providers have hospital affiliations |
| Facility types not categorized | Cannot distinguish hospitals from clinics |
| Address normalization not implemented | Duplicate addresses may not match |
| `address_hash` population is manual (script-based) | Hashes can become stale after data imports |

---

## 9. Rewrite Options Analysis

The prompt identifies three rewrite options. Here is an analysis based on the actual codebase state:

### Option A: Build Location Abstraction on Top of `practice_locations`

**Approach:** Create a database view or materialized view that groups `practice_locations` by normalized address, then add a `locations_metadata` table for facility names and health systems.

**Pros:**
- No schema migration needed for `practice_locations`
- The `address_hash` column is already in place for grouping
- The deduplication script already computes normalized hashes
- Materialized view can be refreshed periodically

**Cons:**
- Grouping logic requires `address_hash` to be fully populated and kept current
- Materialized views need refresh management
- Additional join for every location query

**Code changes required:**
- Populate `address_hash` for all rows (run deduplication script)
- Create `CREATE MATERIALIZED VIEW location_groups AS SELECT DISTINCT address_hash, address_line1, city, state, zip_code, COUNT(DISTINCT npi) as provider_count FROM practice_locations GROUP BY ...`
- Create `locations_metadata` table with `address_hash` FK, `facility_name`, `health_system`, `facility_type`
- Update `locationService.ts` to query the view
- Auto-trigger `address_hash` computation on insert (DB trigger or application middleware)

### Option B: Restore Location Model Alongside `practice_locations`

**Approach:** Create a new `Location` model with metadata fields, link `practice_locations` to it via FK.

**Pros:**
- Clean data model with proper normalization
- Frontend `Location` type already expects `name`, `healthSystem`, `facilityType`
- Provider grouping is explicit via FK

**Cons:**
- Requires migration to add `location_id` FK to `practice_locations`
- Requires backfill script to create Location records and link existing rows
- Dual maintenance: keep both tables in sync during data imports

**Code changes required:**
- New `Location` model in Prisma schema
- Migration to add FK column to `practice_locations`
- Backfill script using `address_hash` to group rows into Location records
- Update `locationService.ts` to query Location model
- Update NPI sync pipeline to create/link Location records

### Option C: Enrich `practice_locations` Directly

**Approach:** Add `facility_name`, `health_system`, `facility_type` columns directly to `practice_locations`.

**Pros:**
- Simplest schema change
- No new tables or views
- Direct field access, no joins needed

**Cons:**
- Duplicate metadata across all rows sharing the same address (e.g., 50 providers at "Memorial Hospital" all have `facility_name = "Memorial Hospital"` repeated)
- No single source of truth for facility data
- Updates require changing all duplicate rows

**Code changes required:**
- Migration to add 3 columns to `practice_locations`
- Backfill from `provider_hospitals` and/or manual data sources
- Update `locationSelect` in both services to include new fields
- Remove the `enrichLocationWithHospitalData()` workaround

### Recommendation

**Option A is the strongest choice** given the current codebase state, because:
1. The `address_hash` infrastructure already exists (column, index, script)
2. It requires no schema changes to the heavily-used `practice_locations` table
3. A metadata table provides a clean single source of truth for facility data
4. The materialized view approach is standard PostgreSQL and handles the grouping problem cleanly

---

## 10. Recommendations

### Immediate (Low Effort)

1. **Wire up `LocationCard`** -- Create a location search results page (or a "Locations" tab on the existing search page) that imports and renders `LocationCard` components using `locationApi.search()`.

2. **Add location link to provider detail page** -- The `ColocatedProviders` component shows the address but does not link to `/location/[id]`. Add a "View Location" link that navigates to the location detail page.

3. **Use `address_hash` in co-location queries** -- Replace the raw text matching in `getProvidersAtLocation()` and `getColocatedNpis()` with `address_hash` equality. This is faster (single indexed column) and more reliable (normalized).

### Medium Term

4. **Run the deduplication script** and set up automated re-runs after data imports to keep `address_hash` current.

5. **Create a `locations_metadata` table** (Option A) with `address_hash` as the key, `facility_name`, `health_system`, and `facility_type` columns. Populate from `provider_hospitals` and `hospitals` reference data.

6. **Add a composite index** on `practice_locations(state, city)` or `practice_locations(address_hash, npi)` to improve query performance for the most common access patterns.

### Longer Term

7. **Implement address normalization** -- Standardize address components (e.g., "St" -> "Street", "Ave" -> "Avenue") before hashing. Consider using USPS address validation API for authoritative normalization.

8. **Auto-compute `address_hash`** -- Add a PostgreSQL trigger or Prisma middleware that computes the hash on INSERT/UPDATE to `practice_locations`, eliminating the need for manual script runs.

9. **Build a location search page** with map view, health system filtering, and facility type facets, using the `locationApi.search()` and `locationApi.getHealthSystems()` endpoints that are already operational.

---

## File Reference

| File | Path | Purpose |
|---|---|---|
| Prisma Schema | `packages/backend/prisma/schema.prisma` | `practice_locations` model definition |
| Route Registration | `packages/backend/src/routes/index.ts` | Mounts `/locations` router |
| Location Routes | `packages/backend/src/routes/locations.ts` | 5 location API endpoints |
| Provider Routes | `packages/backend/src/routes/providers.ts` | `/:npi/colocated` endpoint |
| Location Service | `packages/backend/src/services/locationService.ts` | Core query functions |
| Location Enrichment | `packages/backend/src/services/locationEnrichment.ts` | Hospital data enrichment |
| Provider Service | `packages/backend/src/services/providerService.ts` | `getPrimaryLocation()`, `PROVIDER_INCLUDE` |
| Frontend API Client | `packages/frontend/src/lib/api.ts` | `locationApi` and `providerApi.getColocated` |
| Frontend Types | `packages/frontend/src/types/index.ts` | `Location` interface |
| Location Detail Page | `packages/frontend/src/app/location/[locationId]/page.tsx` | Location page with provider list |
| LocationCard | `packages/frontend/src/components/LocationCard.tsx` | Location card (unused) |
| ColocatedProviders | `packages/frontend/src/components/provider-detail/ColocatedProviders.tsx` | Colocated providers on provider page |
| Provider Detail Client | `packages/frontend/src/components/provider-detail/ProviderDetailClient.tsx` | Mounts `ColocatedProviders` |
| Deduplication Script | `scripts/deduplicate-locations.ts` | Address hash computation |
