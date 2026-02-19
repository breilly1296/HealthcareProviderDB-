# Map & Geospatial Features Review

**Generated:** 2026-02-18
**Prompt:** 46-map-geospatial.md
**Status:** Functional map implementation with bounding-box queries, Google Maps integration, and address-hash deduplication

---

## Summary

The map feature provides an interactive Google Maps view of healthcare providers using a bounding-box query pattern. As the user pans/zooms the map, the frontend sends the visible bounds to the backend, which queries practice locations within those bounds using lat/lng indexes. Providers are deduplicated by `address_hash` so co-located providers appear as a single pin with a count label. The frontend uses `@react-google-maps/api` with debounced bounds tracking, info window popups, and a clustered indicator when results exceed the limit. Geolocation detection uses IP-based lookup (not browser GPS).

---

## Verified Checklist

### Frontend

#### Map Page (`packages/frontend/src/app/map/page.tsx`)

- [x] **Dedicated `/map` route** -- Full-page map view
- [x] **Dynamic import** -- `ProviderMap` loaded via `next/dynamic` with `ssr: false` to prevent server-side rendering of Google Maps
- [x] **URL parameters** -- Supports `lat`, `lng`, `zoom`, `specialty` URL params for deep-linking
- [x] **Default center** -- New York City (40.7128, -74.006) at zoom 12
- [x] **Top bar** -- Back to Search link, "Browse Providers" heading, specialty filter badge, provider count
- [x] **Full viewport height** -- `h-[calc(100vh-64px)]` minus header height
- [x] **`useMapProviders` integration** -- Hooks into bounds changes, passes pins/loading/clustered to map component

#### Map Layout (`packages/frontend/src/app/map/layout.tsx`)

- [x] **SEO metadata** -- `title: 'Provider Map | VerifyMyProvider'`, `description: 'Browse healthcare providers on an interactive map'`

#### ProviderMap Component (`packages/frontend/src/components/ProviderMap.tsx`)

- [x] **Google Maps integration** -- `@react-google-maps/api` with `useJsApiLoader`, `GoogleMap`, `MarkerF`, `InfoWindowF`
- [x] **API key** -- Reads `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` from environment
- [x] **Map options**:
  - Street view control: disabled
  - Zoom control: enabled
  - Map type control: disabled
  - Fullscreen control: enabled
  - Custom styles: hide POIs except medical, simplify transit
- [x] **Debounced bounds tracking** -- `onIdle` callback with 300ms debounce before calling `onBoundsChanged`. This fires after the user stops panning/zooming, preventing excessive API calls.
- [x] **Provider markers** -- `MarkerF` for each pin with click handler to show info window
- [x] **Multi-provider label** -- When `providerCount > 1`, shows count as white-text label on marker
- [x] **Info window popup** -- On marker click, shows:
  - Provider name (linked to `/provider/[npi]` detail page)
  - Specialty
  - Full address (addressLine1, city, state, zipCode)
  - Phone number (formatted)
  - Provider count at location (if >1)
- [x] **Loading overlay** -- Semi-transparent overlay with spinner when fetching
- [x] **Clustered indicator** -- Banner "Showing X of Y providers. Zoom in to see more." when results are clustered (exceed limit)
- [x] **Empty state** -- "No providers with map data in this area" message
- [x] **Error state** -- "Failed to load Google Maps. Check your API key configuration."
- [x] **Cleanup** -- Debounce timer cleared on unmount

#### useMapProviders Hook (`packages/frontend/src/hooks/useMapProviders.ts`)

- [x] **Bounding-box query pattern** -- `onBoundsChanged(bounds)` callback called when map viewport changes
- [x] **AbortController** -- Cancels previous in-flight request when new bounds arrive
- [x] **Filter support** -- Accepts `specialty`, `specialtyCategory`, `entityType` as optional filters
- [x] **Configurable limit** -- Default 200 pins per request
- [x] **Returns**: `pins`, `total`, `clustered`, `loading`, `error`, `onBoundsChanged`
- [x] **Calls `providerApi.getMapPins()`** -- Sends bounding box coordinates + filters to backend

#### useGeoLocation Hook (`packages/frontend/src/hooks/useGeoLocation.ts`)

- [x] **IP-based geolocation** -- Uses `https://ipapi.co/json/` (not browser Geolocation API)
- [x] **US-only** -- Only sets state if `country_code === 'US'`
- [x] **Session cache** -- Results cached in `sessionStorage` under `vmp-geo-state` key for instant subsequent loads
- [x] **Timeout** -- AbortController with 3-second timeout
- [x] **Graceful failure** -- Never blocks UI; returns `{ state: null, city: null, loading: false, error }` on failure
- [x] **Returns**: `state` (2-letter code), `city`, `loading`, `error`

**Note**: This hook is for auto-selecting the user's state in the search form, not for "Near Me" map functionality. The name `useGeoLocation` is slightly misleading as it doesn't use browser GPS.

### Backend

#### Map Service (`packages/backend/src/services/mapService.ts`)

- [x] **Bounding-box query** -- Prisma query with `latitude: { gte: south, lte: north }`, `longitude: { gte: west, lte: east }` and `addressType: 'practice'`
- [x] **Address-hash deduplication** -- `distinct: ['address_hash']` on `findMany()` so co-located providers (same physical address) appear as one pin
- [x] **Provider count per address** -- Separate `groupBy` query on `address_hash` to get `_count.npi` for each location, used for the provider count badge
- [x] **Provider filters** -- Specialty (multi-field OR: `primarySpecialty`, `primaryTaxonomyCode`, `specialtyCategory`), specialty category, entity type. Nested under location query via `providers` relation.
- [x] **Total count** -- Separate `count()` query for total matching locations
- [x] **Clustered flag** -- `total > limit` indicates more results than can be shown
- [x] **Result transformation** -- Each pin includes: `npi`, `displayName`, `specialty`, `entityType`, `latitude`, `longitude`, `addressLine1`, `city`, `state`, `zipCode`, `phone`, `addressHash`, `providerCount`
- [x] **Logging** -- `logger.debug()` with total, returned count, and clustered flag

#### PracticeLocation Geospatial Fields (from prompt -- Prisma schema)

- [x] **`latitude`** -- Float, nullable
- [x] **`longitude`** -- Float, nullable
- [x] **`geocoded_at`** -- DateTime, nullable (tracks when location was geocoded)
- [x] **`address_hash`** -- String, nullable (deduplication key for geocoding and map pins)
- [x] **Composite index** -- `idx_locations_lat_lng` on `[latitude, longitude]` for bounding-box queries
- [x] **Geocoded_at index** -- `idx_locations_geocoded_at` for finding locations that need geocoding
- [x] **Address hash index** -- `idx_locations_address_hash` for deduplication lookups

#### Location Routes (`/api/v1/locations`) -- from prompt

| Method | Path | Description |
|--------|------|-------------|
| GET | `/search` | Search locations with filters |
| GET | `/health-systems` | Get distinct health systems |
| GET | `/stats/:state` | Location statistics by state |
| GET | `/:locationId` | Location details |
| GET | `/:locationId/providers` | Providers at a location |

#### Map Route

- [x] **`GET /providers/map`** -- Bounding-box query endpoint called by `providerApi.getMapPins()`. Parameters: `north`, `south`, `east`, `west`, `specialty`, `specialtyCategory`, `entityType`, `limit`

### Data Pipeline (from prompt)

- [x] **Batch geocoding script** -- `scripts/geocode-locations.ts` for bulk geocoding via Google Maps Geocoding API
- [x] **Location enrichment service** -- `services/locationEnrichment.ts` for individual location enrichment
- [x] **Address hash dedup** -- `address_hash` prevents re-geocoding unchanged addresses
- [x] **`geocoded_at` tracking** -- Tracks when location was last geocoded

---

## Data Flow (Verified)

```
1. User opens /map (or /map?lat=40.7&lng=-74.0&zoom=14&specialty=CARDIOLOGY)
     |
2. ProviderMap loads Google Maps with center/zoom from URL params
     |
3. Map fires onIdle after initial render
     |
4. 300ms debounce timer completes
     |
5. onBoundsChanged({north, south, east, west}) called
     |
6. useMapProviders.onBoundsChanged()
     |  -> Aborts previous in-flight request
     |  -> Sets loading=true
     |
7. providerApi.getMapPins({north, south, east, west, specialty, limit: 200/300})
     |
8. Backend: GET /api/v1/providers/map?north=...&south=...
     |
9. mapService.getProvidersForMap()
     |  -> Query practice_locations within bounding box (lat/lng index)
     |  -> Filter by specialty if provided
     |  -> Deduplicate by address_hash (distinct)
     |  -> Count providers per address_hash
     |  -> Limit to requested limit
     |  -> Build MapPin[] with display names, addresses, phone, providerCount
     |
10. Response: { pins, total, clustered, bounds }
     |
11. ProviderMap renders MarkerF for each pin
     |  -> Multi-provider pins show count label
     |  -> Click shows InfoWindowF with provider details + link
     |
12. User pans/zooms -> goto step 3
```

---

## Observations

1. **IP geolocation vs. browser GPS** -- `useGeoLocation` uses IP-based geolocation (`ipapi.co`), not the browser's Geolocation API. This is less accurate but doesn't require user permission prompts. The hook is used for auto-selecting the user's state, not for precise "Near Me" positioning. For a true "Near Me" map feature, the browser Geolocation API would be needed.

2. **The 300ms debounce on `onIdle` is appropriate** -- Google Maps fires `idle` after every pan/zoom animation completes. The debounce prevents rapid API calls during smooth map interactions. Combined with `useMapProviders`'s AbortController, in-flight requests are properly cancelled.

3. **Address-hash deduplication is efficient** -- Using `distinct: ['address_hash']` at the database level (Prisma) means the deduplication happens in SQL, not application code. The separate `groupBy` for provider counts adds one extra query but keeps the main query clean.

4. **No marker clustering library** -- The prompt mentions marker clustering as a future item. Currently, the `clustered` flag just shows a banner telling the user to zoom in. A library like `@googlemaps/markerclusterer` would improve the UX for dense areas like NYC by visually grouping nearby markers.

5. **Map page uses 300 pin limit, hook defaults to 200** -- The map page passes `limit: 300` to `useMapProviders`, which overrides the default of 200. This is fine for most zoom levels but could still be overwhelming at city-wide zoom in dense metro areas.

6. **The `providerCount` logic has a subtlety** -- The count query counts practice locations per `address_hash` where latitude is not null. This means the count represents geocoded providers at that address, not all providers at that address. Non-geocoded providers won't be counted.

---

## Missing / Future Items Assessment

| Prompt Item | Status | Notes |
|---|---|---|
| Marker clustering | NOT IMPLEMENTED | `clustered` banner exists but no visual clustering library |
| Radius-based search | NOT IMPLEMENTED | No "within X miles" filter; current approach is bounding-box only |
| Directions integration | NOT IMPLEMENTED | Provider detail has "Get Directions" link but map page doesn't |
| Provider density heatmap | NOT IMPLEMENTED | Would require aggregate geocoded data |
| Offline map tiles | NOT IMPLEMENTED | Would require significant infrastructure changes |

---

## Recommendations

1. **Add marker clustering** -- Integrate `@googlemaps/markerclusterer` for better UX in dense areas. This would replace the simple "zoom in" banner with visual clusters that show provider counts and expand on click.

2. **Add radius-based search** -- The most natural map search is "providers within X miles of me." This would require PostGIS or Haversine distance calculation on the backend, but the lat/lng infrastructure is already in place.

3. **Consider browser geolocation for "Near Me"** -- Add a "Use my location" button on the map page that uses the browser Geolocation API for precise positioning. Fall back to IP geolocation if permission is denied.

4. **Add directions from map pins** -- When showing a provider info window on the map, include a "Get Directions" link (same as the one on the detail page).

5. **Monitor geocoding coverage** -- The prompt asks "What percentage of practice locations have been geocoded?" Adding a monitoring query or admin dashboard that shows `COUNT(geocoded_at IS NOT NULL) / COUNT(*)` would help track coverage gaps.

6. **Consider increasing the pin limit at high zoom** -- At street-level zoom, the bounding box is small enough that 200-300 pins is likely sufficient. But at city-wide zoom, many pins may be excluded. Consider dynamically adjusting the limit based on zoom level.
