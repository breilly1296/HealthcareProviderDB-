# Map & Geospatial Features — Review Output

## 1. Summary

Map functionality is implemented end-to-end: Google Maps renders via `@react-google-maps/api` with SSR disabled, the backend exposes a bounding-box endpoint at `GET /api/v1/providers/map` that joins `practice_locations` (lat/lng indexed) to providers, co-located providers are deduplicated via `address_hash`, and a batch geocoding script exists (`scripts/geocode-locations.ts`). A notable surprise vs. the prompt: **the prompt's file list is out of date** — `useGeoLocation` is NOT a browser-GPS wrapper but an IP-geolocation hook that auto-fills state, and `/api/v1/locations/search` takes no lat/lng/bbox params (bbox lookup lives on `/providers/map` instead). The main gaps are no true radius search, no Google marker-clusterer (manual "clustered" flag only), and no visibility into geocoding coverage.

## 2. Findings

### HIGH

- **Prompt mismatch: `useGeoLocation` is IP-based, not browser GPS.** `packages/frontend/src/hooks/useGeoLocation.ts:19-66` fetches `https://ipapi.co/json/` and returns `{state, city}` — NOT `{latitude, longitude, loading, error}` as the prompt claims. There is no wrapper around `navigator.geolocation`. "Near Me" search as described in the prompt is not implemented. Impact: users cannot filter by their current lat/lng; only their inferred state/city (which is used only to prefill the State dropdown — `SearchForm.tsx:117-122`).
- **No radius-based ("within N miles") search.** Neither `mapService.ts` nor `locationService.ts` accepts a `radius` or `center` parameter. The only geospatial filter is the axis-aligned bounding box in `packages/backend/src/services/mapService.ts:55-59` (`latitude gte/lte`, `longitude gte/lte`), fed by the map viewport in `useMapProviders.ts:34-68`. A user asking "cardiologists within 5 miles of my ZIP" cannot be answered — this is the Checklist's flagged Missing item, still open.
- **No visibility into geocoding coverage.** `scripts/geocode-locations.ts` exists (verified) and `practice_locations.geocoded_at` has an index (`schema.prisma:104`), but there is no admin endpoint, no stats query, and no log of coverage %. The prompt's Open Q #1 ("What % of locations have been geocoded?") can't be answered from code alone.
- **Map endpoint `distinct: ['address_hash']` silently drops pins when `address_hash` is NULL.** `mapService.ts:94` uses `distinct` on `address_hash`, but locations without an `address_hash` will collapse into a single null-group bucket. If geocoding is incomplete (likely — it's the newest field per CLAUDE.md), map pins will be severely under-counted in those areas.

### MEDIUM

- **"Marker clustering" is not real clustering.** `ProviderMap.tsx:133-149` renders each `MarkerF` individually; the `clustered` flag at `SearchMapView.tsx:19-34` and `mapService.ts:87` just means "we returned fewer pins than the DB has in-bounds" (total > limit). There is no `@googlemaps/markerclusterer` or equivalent — zoomed-out views will render up to 300 markers as individual DOM nodes, which is manageable but prompted as "Missing". Per-location provider count is baked into the marker label (`ProviderMap.tsx:138-146`), so *co-location* is handled; *spatial* clustering is not.
- **Map endpoint can return degraded data when locations exist but the referenced provider is null.** `mapService.ts:107-119` pulls `providers` as a relation; `mapService.ts:151-169` assumes `loc.providers` is truthy. A location with a deleted provider reference would crash. Low probability given foreign-key constraint, but worth a null-guard.
- **Bounding-box query is NOT using a spatial index** despite the composite index declaration. `schema.prisma:103` `@@index([latitude, longitude])` is a btree composite. For `lat BETWEEN a AND b AND lng BETWEEN c AND d` PostgreSQL can only use it as a range on `latitude` then filter `longitude` — not a true 2-D index (GIST/SP-GiST on `point`/`geography` would be). At NYC densities this is probably fine; at nationwide zoom it's a full scan.
- **Cache key for map pins uses JSON.stringify on the query.** `routes/providers.ts:496` `cacheKey = 'map:' + JSON.stringify(query)`. Different bbox coordinates by floating-point rounding (e.g. user panning 1 pixel) produce different cache keys. Since `providers/map` is rate-limited (100/hr) and frontend debounces at 300ms (`ProviderMap.tsx:27, 75-88`), hit rate in practice is poor.
- **`onBoundsChanged` fires on `onIdle` which triggers even on initial map render.** `ProviderMap.tsx:68-88` — the 300ms debounce helps, but the first bounds-change on map load will always issue a request, meaning the map page always burns one request before the user interacts.

### LOW

- **`ProviderMap.tsx:133-149` uses `pin.addressHash` in the key**; if `addressHash` is NULL for some pins, React keys collide (all null → all same key). Minor; paired with `pin.npi`, so usually distinct.
- **`DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 }`** in two files (`map/page.tsx:16`, `ProviderMap.tsx:25`). Hardcoded to NYC — fine given the product's current focus but worth a config.
- **`useGeoLocation` calls a public API (`ipapi.co`) with no auth, no rate-limit tracking.** `useGeoLocation.ts:43`. Free tier is 1k/day; high-traffic days could blow through it silently. Cache in sessionStorage (already done, `:29-38`) mitigates most of this.
- **Geocoding script uses 40 RPS default** (`scripts/geocode-locations.ts:47`) against Google's 50 RPS free tier — reasonable headroom.
- **`stats/:state` and `/health-systems` exist on locations router** (`routes/locations.ts:76-98`) but not a stats-by-geocoded-status endpoint — would answer Open Q #1 directly.
- **No link from provider-detail to map.** The prompt mentions "Provider location shown on map in detail page" but a grep of the provider-detail component for `ProviderMap` did not surface it (`ProviderMap` imports elsewhere are `map/page.tsx` and `SearchMapView.tsx` only — confirmed via earlier file reads). Possibly implemented in `ProviderDetailClient` via another component; worth verifying.

## 3. Checklist verification

### Frontend
- [x] Map page (`/map`) with layout — `packages/frontend/src/app/map/page.tsx:1-85`, `layout.tsx:1-8`
- [x] SearchMapView for list/map toggle — `packages/frontend/src/components/search/SearchMapView.tsx:15-35`; toggle driven by `viewMode` in `app/search/page.tsx:21`
- [x] ProviderMap reusable component — `packages/frontend/src/components/ProviderMap.tsx:41-227`
- [~] **useGeoLocation hook — PARTIAL / MISLABELED**: file exists (`hooks/useGeoLocation.ts`) but implements IP-based state detection, NOT browser Geolocation API. See HIGH.
- [x] useMapProviders hook — `packages/frontend/src/hooks/useMapProviders.ts:22-71`
- [x] Google Maps integration (`@react-google-maps/api`) — `ProviderMap.tsx:4, 51-54`
- [x] Marker popups with provider info — `ProviderMap.tsx:151-199`, links to `/provider/[npi]`

### Backend
- [x] Latitude/longitude on PracticeLocation — `packages/backend/prisma/schema.prisma:87-88`
- [x] Geospatial indexes (lat/lng composite) — `schema.prisma:103`
- [~] **Location search endpoints — PARTIAL**: `/locations/search` exists (`routes/locations.ts:48-70`) but filters by state/city/zipCode only, NOT lat/lng. The actual geospatial endpoint is `/providers/map` (`routes/providers.ts:489-526`).
- [x] Address hash for geocoding dedup — `schema.prisma:85`, used in `mapService.ts:94, 128-143`

### Data Pipeline
- [x] Batch geocoding script — `scripts/geocode-locations.ts` (verified via Glob)
- [~] **Location enrichment service — PARTIAL**: `services/locationEnrichment.ts` exists (`:1-169`) but it enriches with hospital-system data, not geocoding. Geocoding only happens via the standalone script. No live API-call-on-miss path.
- [x] geocoded_at tracking — `schema.prisma:86`, index at `:104`

### Missing / Future
- [ ] Marker clustering for dense areas — manual count label only; no Google MarkerClusterer (`ProviderMap.tsx:133-149`)
- [ ] Radius-based search — not implemented (HIGH)
- [ ] Directions integration — no `maps.google.com/dir/` link in `ProviderMap.tsx:151-199`
- [ ] Provider density heatmap — not implemented
- [ ] Offline map tiles — not implemented

## 4. Recommendations (ranked)

1. **Implement radius search.** Add `center_lat`, `center_lng`, `radius_miles` params to `GET /providers/map` (or a new `/providers/nearby`). Compute with the Haversine formula in SQL (`earth_distance` + `cube` extension), bounded first by a prefiltered bbox to use the existing index. Unblocks the "Near Me" UX that `useGeoLocation` teases but doesn't deliver.
2. **Build a real `useBrowserGeolocation` hook** (separate from the current IP one) that wraps `navigator.geolocation.getCurrentPosition` with permission handling. Keep the IP-based hook for the state-prefill fallback.
3. **Add `GET /api/v1/locations/geocoding-stats`** returning `{ total, geocoded, pending, byState }`. One query against `practice_locations` grouped by `geocoded_at IS NOT NULL`. Answers Open Q #1 and makes ops-visibility trivial.
4. **Install `@googlemaps/markerclusterer`** and wrap the `MarkerF` loop in `ProviderMap.tsx:133-149`. Resolves the checklist item and dramatically improves rendering at low zoom.
5. **Guard against `address_hash IS NULL` in `mapService.ts`.** At `:94` change `distinct: ['address_hash']` to either filter out nulls (`where: { address_hash: { not: null } }`) or dedupe in code after fetch. Current code under-counts pins in ungeocoded areas.
6. **Upgrade the lat/lng index to GIST.** `schema.prisma:103` → `@@index([earth_box(ll_to_earth(latitude, longitude), 10000)])` via a raw migration, after enabling `cube` + `earthdistance`. Enables sub-second radius queries nationwide.
7. **Add a "Get Directions" link in the info window.** `ProviderMap.tsx:183-190` has address + phone; add `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`.

## 5. Open questions (from prompt)

1. **What percentage of practice locations have been geocoded?** Cannot be answered from code — no stats endpoint (Rec 3). CLAUDE.md notes `scripts/geocode-locations.ts` exists and is idempotent against NULL latitude, but coverage isn't reported.
2. **Is the Google Maps API key configured for production?** `ProviderMap.tsx:53` reads `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with `|| ''` fallback — so if unset, the loader will fail and `loadError` branch renders at `:99-108`. Code is correct; production config depends on env.
3. **Should we add radius-based search?** Yes — Rec 1 is the highest-value addition given the schema is ready.
4. **Is marker clustering needed for NYC provider density?** Yes at low zoom — Rec 4. At street-level zoom the per-location `providerCount` label already handles it.
5. **Should the map page be the default search view?** Probably no — only geocoded providers appear on the map, and given ungeocoded coverage is unknown (Open Q #1) the list view is the safer default. Re-evaluate after geocoding hits >95% coverage.
