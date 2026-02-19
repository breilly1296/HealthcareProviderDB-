---
tags:
  - feature
  - frontend
  - implemented
type: prompt
priority: 3
created: 2026-02-18
---

# Map & Geospatial Features

## Files to Review
- `packages/frontend/src/app/map/page.tsx` (map page)
- `packages/frontend/src/app/map/layout.tsx` (map layout)
- `packages/frontend/src/components/search/SearchMapView.tsx` (map view in search results)
- `packages/frontend/src/components/ProviderMap.tsx` (map visualization component)
- `packages/frontend/src/hooks/useGeoLocation.ts` (browser geolocation API)
- `packages/frontend/src/hooks/useMapProviders.ts` (provider data for map markers)
- `packages/backend/src/services/mapService.ts` (geospatial queries)
- `packages/backend/src/services/locationEnrichment.ts` (geocoding)
- `packages/backend/src/routes/locations.ts` (location endpoints)
- `packages/backend/prisma/schema.prisma` (PracticeLocation — latitude, longitude, geocoded_at)
- `scripts/geocode-locations.ts` (batch geocoding script)

## Feature Overview

Map-based provider search and visualization using Google Maps. Providers can be viewed on an interactive map based on their practice locations. The system supports both address-based search and browser geolocation.

### User Flows
1. **Map page** (`/map`): Dedicated map view for geographic provider search
2. **Search map view**: Toggle between list and map view in search results
3. **Provider detail**: Provider location shown on map in detail page

## Frontend Architecture

### Map Page (`/map`)
- Full-page interactive Google Maps display
- Provider markers based on search filters
- Marker clustering for dense areas
- Click marker → provider info popup

### SearchMapView
- Embedded in search results as alternative to list view
- Same search filters apply
- Toggle between list/map views
- Provider cards shown alongside map

### ProviderMap Component
- Reusable Google Maps component
- Uses `@react-google-maps/api`
- Displays practice location markers
- Supports single provider (detail page) and multi-provider (search) modes

### Hooks

**`useGeoLocation`**
- Wraps browser Geolocation API
- Returns `{ latitude, longitude, loading, error }`
- Permission handling
- Used for "Near Me" search functionality

**`useMapProviders`**
- Fetches provider data formatted for map markers
- Integrates with search filters
- Returns providers with latitude/longitude coordinates

## Backend Architecture

### PracticeLocation Geospatial Fields
```prisma
model PracticeLocation {
  latitude    Float?
  longitude   Float?
  geocoded_at DateTime?
  address_hash String?  // Dedup geocoding requests
  // ... address fields
  @@index([latitude, longitude], map: "idx_locations_lat_lng")
  @@index([geocoded_at], map: "idx_locations_geocoded_at")
  @@index([address_hash], map: "idx_locations_address_hash")
}
```

### Location Routes (`/api/v1/locations`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/search` | Search locations with filters |
| GET | `/health-systems` | Get distinct health systems |
| GET | `/stats/:state` | Location statistics by state |
| GET | `/:locationId` | Location details |
| GET | `/:locationId/providers` | Providers at a location |

### mapService.ts
- Geospatial queries for nearby providers
- Distance calculations
- Bounding box queries using lat/lng indexes

### Geocoding Pipeline
- `scripts/geocode-locations.ts` — Batch geocoding via Google Maps Geocoding API
- `services/locationEnrichment.ts` — Individual location enrichment
- `address_hash` prevents re-geocoding unchanged addresses
- `geocoded_at` tracks when location was last geocoded

## Data Flow

```
User location (browser GPS or search)
        │
        ▼
  Search with lat/lng filters
        │
        ▼
  Backend: Query practice_locations
  with lat/lng bounding box
        │
        ▼
  Return providers with coordinates
        │
        ▼
  Frontend: Render markers on Google Maps
  with provider info popups
```

## Checklist

### Frontend
- [x] Map page (`/map`) with layout
- [x] SearchMapView for list/map toggle
- [x] ProviderMap reusable component
- [x] useGeoLocation hook
- [x] useMapProviders hook
- [x] Google Maps integration (`@react-google-maps/api`)
- [x] Marker popups with provider info

### Backend
- [x] Latitude/longitude on PracticeLocation
- [x] Geospatial indexes (lat/lng composite)
- [x] Location search endpoints
- [x] Address hash for geocoding dedup

### Data Pipeline
- [x] Batch geocoding script
- [x] Location enrichment service
- [x] geocoded_at tracking

### Missing / Future
- [ ] Marker clustering for dense areas
- [ ] Radius-based search (e.g., "within 5 miles")
- [ ] Directions integration (link to Google Maps directions)
- [ ] Provider density heatmap
- [ ] Offline map tiles

## Questions to Ask
1. What percentage of practice locations have been geocoded?
2. Is the Google Maps API key configured for production?
3. Should we add radius-based search (e.g., "within 5 miles")?
4. Is marker clustering needed for NYC provider density?
5. Should the map page be the default search view?
