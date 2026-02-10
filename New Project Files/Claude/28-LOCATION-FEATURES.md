# 28 - Location Features

## Status: ACTIVE

## Data Model

### Old Location Model (REPLACED)

The original `Location` model has been replaced. It attempted to group providers under named facilities with metadata such as health system, facility type, and coordinates. This model was removed in favor of a flat, NPI-sourced location table.

### Current: practice_locations Table

The `practice_locations` table stores raw address data from the NPI registry. Each row represents one practice address for one provider.

```prisma
model PracticeLocation {
  id            Int      @id @default(autoincrement())
  npi           String
  address_type  String   // "DOM" (domicile) or "PLC" (practice location)
  address_line1 String
  address_line2 String?
  city          String
  state         String
  zip_code      String
  phone         String?
  fax           String?

  provider      Provider @relation(fields: [npi], references: [npi])

  @@index([city])
  @@index([npi])
  @@index([state])
  @@index([zip_code])
  @@map("practice_locations")
}
```

### Key Difference from Old Model

- **One provider to many locations** (flat relationship, no grouping)
- No facility name, health system name, or facility type
- No geographic coordinates
- No metadata beyond the raw NPI address fields
- Simple and reliable: directly mirrors NPI data without inference

## API Endpoints (ACTIVE)

| Method | Path                              | Description                                    |
|--------|-----------------------------------|------------------------------------------------|
| GET    | `/locations/search`               | Search locations by city, state, zip code      |
| GET    | `/locations/health-systems`       | List health systems (derived from provider data) |
| GET    | `/locations/stats/:state`         | Location statistics for a given state          |
| GET    | `/locations/:locationId`          | Get a single location by ID                    |
| GET    | `/locations/:locationId/providers`| List all providers at a given location         |

## Backend Services

- **`locationService.ts`** - Core service for location queries, search, and provider-location joins
- **`locationEnrichment.ts`** - Enrichment logic for augmenting raw NPI location data

## Frontend Components

- **`LocationCard`** - Display component for a single location with address, phone, and linked providers
- **`/location/[locationId]`** - Dynamic Next.js page for location detail view
- **`ColocatedProviders`** - Component on the provider detail page showing other providers at the same location

## Future Plans

- Build a location abstraction layer on top of `practice_locations` for grouping addresses into named facilities
- Derive facility names and health system associations from provider data patterns
- Add geographic coordinates via geocoding for map-based features
- Support location-level verification and reviews
