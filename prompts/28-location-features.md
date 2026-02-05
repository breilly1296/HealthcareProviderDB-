---
tags:
  - feature
  - location
  - needs-rewrite
type: prompt
priority: 2
updated: 2026-02-05
---

# Location Features Review

## Current Status: PARTIALLY DISABLED

The original `Location` model (grouping providers by shared address with health system/facility type metadata) was **replaced** by the `practice_locations` table during the schema migration. The locations API route is **commented out** in `routes/index.ts` pending a rewrite.

**What exists:**
- `practice_locations` table stores raw provider addresses (one-to-many per provider)
- Frontend `LocationCard` and `/location/[locationId]` page exist but may not function without the API
- `ColocatedProviders` component on provider detail page

**What is disabled/broken:**
- `routes/locations.ts` — exists but is **not registered** (commented out in `routes/index.ts`)
- `services/locationService.ts` — depends on old Location model, needs rewrite for `practice_locations`
- `services/locationEnrichment.ts` — has TODO for rewrite

## Files to Review
- `packages/backend/src/routes/index.ts` (locations route is commented out — line 6-7, 14)
- `packages/backend/src/routes/locations.ts` (route file exists but is not active)
- `packages/backend/src/services/locationService.ts` (needs rewrite for practice_locations)
- `packages/backend/src/services/locationEnrichment.ts` (needs rewrite)
- `packages/backend/prisma/schema.prisma` (practice_locations model)
- `packages/frontend/src/app/location/[locationId]/page.tsx` (frontend page)
- `packages/frontend/src/components/LocationCard.tsx` (location display)
- `packages/frontend/src/components/provider-detail/ColocatedProviders.tsx` (co-located providers)

## What Changed: Location → practice_locations

### Old Model (NO LONGER EXISTS)
```prisma
// THIS MODEL WAS REMOVED
model Location {
  id            Int       @id @default(autoincrement())
  addressLine1  String
  city          String
  state         String
  zipCode       String
  name          String?   // e.g., "Memorial Hospital"
  healthSystem  String?   // e.g., "HCA Healthcare"
  facilityType  String?   // e.g., "Hospital", "Clinic"
  providerCount Int?      @default(0)
  providers     Provider[]
  @@unique([addressLine1, city, state, zipCode])
}
```

### Current Model (ACTIVE)
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
  providers     Provider @relation(fields: [npi], references: [npi])

  @@index([city], map: "idx_locations_city")
  @@index([npi], map: "idx_locations_npi")
  @@index([state], map: "idx_locations_state")
  @@index([zip_code], map: "idx_locations_zip")
}
```

### Key Differences
| Aspect | Old Location | Current practice_locations |
|---|---|---|
| Relationship | Many providers → one location (grouped) | One provider → many locations (flat) |
| Grouping | Providers grouped by shared address | No grouping — each row is one provider's address |
| Metadata | `name`, `healthSystem`, `facilityType`, `providerCount` | None — raw address + phone/fax only |
| Unique constraint | `(addressLine1, city, state, zipCode)` | None — duplicate addresses allowed |
| Address type | Implicit (all practice) | Explicit `address_type` field (practice/mailing) |

## Feature Goals (When Re-implemented)

The location feature should group healthcare providers by their physical address, allowing users to:
- See all providers at a hospital or clinic
- Identify health systems
- Find co-located specialists

## Planned API Endpoints (Need Rewrite)

The route file `locations.ts` defines these endpoints but they are **not active**:

```
GET /api/v1/locations/search          — Search locations with filters
GET /api/v1/locations/health-systems  — Get distinct health systems
GET /api/v1/locations/stats/:state    — Location statistics by state
GET /api/v1/locations/:locationId     — Location details
GET /api/v1/locations/:locationId/providers — Providers at a location
```

## Rewrite Options

### Option A: Build Location Abstraction on Top of practice_locations
- Create a view or materialized view that groups `practice_locations` by address
- Add `name`, `health_system`, `facility_type` columns to `practice_locations` or a new `locations_metadata` table
- Pro: No schema migration needed
- Con: Grouping logic is complex (address normalization)

### Option B: Restore Location Model Alongside practice_locations
- Re-create Location model with health system/facility metadata
- Link practice_locations → Location for grouping
- Pro: Clean separation of concerns
- Con: Requires migration, backfill, and dual maintenance

### Option C: Enrich practice_locations Directly
- Add `facility_name`, `health_system`, `facility_type` columns to `practice_locations`
- Group by address in queries
- Pro: Simplest change
- Con: Duplicate metadata across rows sharing the same address

## Checklist

### Database — practice_locations (ACTIVE)
- [x] Table created with address fields
- [x] Provider-location relationship via NPI FK
- [x] Indexes on city, state, zip_code, npi
- [ ] No unique constraint on address (duplicate addresses possible)
- [ ] No facility/health system metadata fields

### API Routes (DISABLED)
- [ ] Route file exists but is commented out in `routes/index.ts`
- [ ] `locationService.ts` needs rewrite for `practice_locations` schema
- [ ] `locationEnrichment.ts` needs rewrite
- [ ] All 5 endpoints non-functional

### Frontend (PARTIALLY EXISTS)
- [x] Location detail page exists (`/location/[locationId]`)
- [x] `LocationCard` component exists
- [x] `ColocatedProviders` component on provider detail page
- [ ] Frontend pages may error without working API endpoints
- [ ] Link from provider detail to location page

### Data Quality (NOT STARTED)
- [ ] Location/facility names not populated
- [ ] Health systems not tagged
- [ ] Facility types not categorized
- [ ] Duplicate addresses not merged
- [ ] Address normalization not implemented

## Questions to Ask
1. **Which rewrite option to pursue?** (Option A/B/C above)
2. **Is the location feature a priority for the next phase?**
3. **Should co-located providers use a simple address match instead of a Location FK?**
4. **What percentage of providers share addresses?** (determines value of grouping)
5. **Should health system identification come from `provider_hospitals` table instead?**
