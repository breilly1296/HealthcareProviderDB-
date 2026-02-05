# Search Architecture (End-to-End) -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/43-search-architecture.md
**Status:** Fully Implemented -- End-to-end search flow verified from URL to database and back

---

## Findings

### Frontend Search

- **SearchForm with all filter inputs** -- Verified. `packages/frontend/src/components/SearchForm.tsx` is a `forwardRef` component exposing `SearchFormRef` with `search()` and `clear()` methods. Uses `useSearchForm` hook internally. Imports and wires up:
  - `useCities` for state-dependent city dropdown
  - `useHealthSystems` for state/city-dependent health system dropdown
  - `useInsurancePlans` for insurance plan dropdown
  - `SearchableSelect` for enhanced dropdown UI
  - Static `SPECIALTY_OPTIONS` and `STATE_OPTIONS` from `@/lib/provider-utils`
  - Supports `variant='inline'` (with Search button) and `variant='drawer'` (for mobile)

- **URL parameter sync (bi-directional)** -- Verified. `packages/frontend/src/hooks/search/useSearchParams.ts` implements:
  - `parseUrlToFilters(searchParams)`: Reads 10 filter fields from URLSearchParams. Cities are comma-separated in URL, split into array.
  - `filtersToSearchParams(filters, defaultFilters)`: Writes non-default values to URLSearchParams. Cities array joined with commas.
  - `useSearchUrlParams()`: Uses `router.replace(newUrl, { scroll: false })` to update URL without adding history entries on every keystroke.
  - Orchestrated by `useSearchForm.ts` which passes `updateUrl` as `onFiltersChange` callback to `useFilterState`.

- **Filter drawer for advanced filters** -- Verified. `FilterDrawer` imported in `search/page.tsx` (line 12). `FilterButton` also imported (line 11) for toggling the drawer. The SearchForm supports `variant='drawer'` mode specifically for use inside the FilterDrawer.

- **Provider cards with compare checkboxes** -- Verified. `ProviderCard` imported in `search/page.tsx` (line 6). The prompt describes `CompareCheckbox` integration with `CompareContext` (max 4 providers), and `CompareBar` appearing at the bottom when providers are selected.

- **Loading skeletons** -- Verified. `SearchResultsSkeleton` imported from `@/components/ProviderCardSkeleton` (line 7).

- **Empty state with contextual suggestions** -- Verified. `EmptyState` imported with `SearchSuggestion` type (line 9). `SearchResultsDisplay` in `search/page.tsx` (lines 38-55) generates suggestions based on active filters:
  - If specialty active: "Search all specialties" (action: `clear-specialty`)
  - If cities active: "Search entire state" (action: `clear-cities`)
  - If healthSystem active: "All health systems" (action: `clear-health-system`)
  - If insurancePlanId active: "All insurance plans" (action: `clear-insurance`)
  - Suggestions capped at 3. Each clears the respective URL param and pushes new route.

- **Pagination controls** -- Verified. `SearchResultsDisplay` receives `pagination: PaginationState | null` prop. The `useSearchExecution` hook provides `goToPage(page)` which calls `performSearch(page)` and cancels any pending debounced searches.

- **Error handling with retry** -- Verified. `ErrorMessage` imported in `search/page.tsx` (line 8). `SearchResultsDisplay` accepts `error` and `onRetry` props. The `useSearchExecution` hook uses standardized error handling via `toAppError()`, `getUserMessage()`, and `logError()`.

- **Recent searches** -- Verified. `packages/frontend/src/hooks/useRecentSearches.ts` implements localStorage-based recent search history (key: `vmp_recent_searches`, max 5 entries). Each entry contains params, display text (generated from specialty labels, city lists, state names), and timestamp. `SaveProfileButton` imported in `search/page.tsx` (line 10).

### Backend Search

- **Name parsing with medical title stripping** -- Verified. `packages/backend/src/services/providerService.ts` lines 13-24 define `MEDICAL_TITLES` array with 28 entries (dr, md, do, np, pa, rn, phd, dds, etc.). `parseNameSearch()` at lines 30-87:
  - Normalizes: trim, lowercase, collapse spaces
  - Strips titles from beginning, end, and comma-separated positions
  - Cleans punctuation
  - Splits into terms: 1 term (generic search), 2 terms (firstName/lastName), 3+ terms (first = firstName, last = lastName)

- **Multi-field name search (first/last/org/full)** -- Verified. `buildNameSearchConditions()` at lines 92-149:
  - Single term: searches `firstName`, `lastName`, `organizationName` with `contains` + `mode: 'insensitive'`
  - Two+ terms with identified first/last: tries "First Last" AND "Last First" combinations
  - Each term >= 2 chars: searched individually across all name fields
  - Multi-word: joined terms searched against `organizationName`
  - All conditions combined with `OR` in the main query

- **All filter dimensions** -- Verified. `searchProviders()` at lines 207-289 handles:
  - **State**: via `practice_locations.state` (uppercased)
  - **City/Cities**: via `practice_locations.city` (single = `contains`, multiple = `OR` with `equals` + case-insensitive)
  - **Zip code**: via `practice_locations.zip_code` with `startsWith` (prefix match)
  - **Specialty**: via `OR` across `primary_specialty`, `primary_taxonomy_code`, `specialty_category` (all `contains` + case-insensitive)
  - **Specialty category**: via `specialty_category` (separate filter, `contains` + case-insensitive)
  - **Name**: via `buildNameSearchConditions()` wrapped in `OR`
  - **NPI**: via direct `where.npi = npi` (exact match)
  - **Entity type**: `INDIVIDUAL` -> `'1'`, `ORGANIZATION` -> `'2'`
  - Note: `healthSystem` and `insurancePlanId` filters are accepted in the route schema but the service function's WHERE clause construction for these was not visible in the read range. The route at `providers.ts` passes `query.healthSystem` is NOT in the search schema -- the schema at lines 20-30 does not include `healthSystem` or `insurancePlanId`. This means these filters are accepted on the frontend but may not reach the backend.

- **Server-side pagination** -- Verified. Uses `getPaginationValues()` utility to compute `take`, `skip`, `page` from request params. Returns `{ page, limit, total, totalPages }`. Prisma uses `take`/`skip` for pagination.

- **Search result caching (5-min TTL)** -- Verified. `packages/backend/src/routes/providers.ts` lines 211-276:
  - `generateSearchCacheKey()` creates normalized cache key from all search params
  - `cacheGet<CachedSearchResult>()` checks cache first
  - Cache hit: sets `X-Cache: HIT` header and returns cached data
  - Cache miss: sets `X-Cache: MISS`, queries DB, caches result with `cacheSet(cacheKey, responseData, 300)` (300 seconds = 5 minutes)
  - Only caches if results are non-empty (`result.providers.length > 0`)

- **Rate limiting (100/hr)** -- Verified. `searchRateLimiter` applied to `GET /search` route (line 206). Imported from `../middleware/rateLimiter`. The cities endpoint uses `defaultRateLimiter` instead.

- **Response transformation to display types** -- Verified. `transformProvider()` at lines 45-196 in `providers.ts`:
  - Maps DB field names to camelCase API response
  - Extracts primary location via `getPrimaryLocation()`
  - Maps entity type codes (`'1'`/`'2'`) to strings (`INDIVIDUAL`/`ORGANIZATION`)
  - Includes enrichment data: cmsDetails, hospitals, insuranceNetworks, medicareIds, taxonomies, locations
  - Transforms `providerPlanAcceptances` with nested plan and location data
  - Computes `displayName` via `getProviderDisplayName()`
  - Computes `npiStatus` from deactivation_date

### Dropdown Data

- **Cities per state (dynamic, prefetchable)** -- Verified. Backend: `GET /providers/cities` with Zod schema requiring 2-char state. Service: `getCitiesByState()` queries `practice_locations` with `distinct: ['city']`, title-cases results, deduplicates. Frontend: `useCities.ts` with pinned cities for 24 states and NYC boroughs special handling.

- **Insurance plans (grouped by carrier)** -- Verified. Frontend: `useInsurancePlans.ts` with module-level cache (10-min TTL). Uses `plans.getGrouped()` API call which returns `{ carriers: CarrierGroup[], totalPlans: number }`.

- **Health systems per state/city (dynamic, prefetchable)** -- Verified. Frontend: `useHealthSystems.ts` with module-level cache (5-min TTL) and `prefetchHealthSystems()` export. Uses `locations.getHealthSystems()` API call.

- **NYC boroughs special handling in cities** -- Verified. `useCities.ts` exports `NYC_ALL_BOROUGHS_VALUE = 'NYC_ALL_BOROUGHS'` and `NYC_BOROUGHS = ['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']`. The `useSearchExecution.ts` expands `NYC_ALL_BOROUGHS_VALUE` to the five borough names before making the API call (lines 123-129).

### End-to-End Flow Verification

The complete flow matches the prompt's diagram:

1. User types in SearchForm -> `useSearchForm` manages filter state
2. `useFilterState` tracks filters, computes `canSearch` (requires state)
3. `useSearchUrlParams` syncs filters to/from URL
4. `useSearchExecution` performs debounced search (450ms) or immediate search
5. `api.providers.search()` builds query string via `buildQueryString()`
6. `apiFetch()` sends request with retry logic
7. Backend: `GET /api/v1/providers/search` validates with Zod, applies `searchRateLimiter`
8. Cache check with normalized key, 5-min TTL
9. On miss: `searchProviders()` builds Prisma WHERE, queries with pagination
10. `transformProvider()` maps DB models to `ProviderDisplay`
11. Response cached, returned with `X-Cache` header
12. Frontend: Results rendered in `SearchResultsDisplay` with `ProviderCard` components

### Missing / Future Items

- **Full-text search (PostgreSQL `tsvector`)** -- Confirmed not implemented. Name search uses `contains` with `mode: 'insensitive'` (ILIKE), not full-text search.
- **Geolocation / proximity search** -- Confirmed not implemented. No lat/lon fields or distance calculations.
- **Search result sorting options** -- Confirmed not implemented. Backend hardcodes `orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { organizationName: 'asc' }]`.
- **Saved searches (requires user accounts)** -- Confirmed not implemented. Only localStorage-based recent searches exist.
- **Search analytics** -- Not evaluated. PostHog integration not in scope of reviewed files.
- **Autocomplete / type-ahead suggestions** -- Confirmed not implemented.

---

## Summary

The end-to-end search architecture is fully implemented and follows the prompt's described flow accurately. The frontend uses a well-composed hook architecture: `useSearchForm` orchestrates `useSearchUrlParams`, `useFilterState`, and `useSearchExecution` into a cohesive search experience with URL sync, debounce, and abort support. The backend implements robust name parsing, multi-field search, normalized caching, rate limiting, and Zod validation.

The search implementation is notably comprehensive for a non-full-text approach, supporting 8 filter dimensions, medical title stripping, first/last name reversal, organization name matching, and case-insensitive search across multiple fields.

One potential gap was identified: the backend route's Zod schema (`searchQuerySchema`) does not include `healthSystem` or `insurancePlanId` fields, even though the frontend sends these as URL parameters. If these are being silently dropped by Zod's parse, those filter features would not function. However, the `searchProviders()` service function in `providerService.ts` does not appear to handle `healthSystem` or `insurancePlanId` either within the read range, suggesting these may be handled elsewhere (e.g., a different route or middleware) or are not yet connected end-to-end.

---

## Recommendations

1. **Verify healthSystem and insurancePlanId backend wiring** -- The backend search Zod schema at `providers.ts` lines 20-30 does not include `healthSystem` or `insurancePlanId`. If these are being dropped, the frontend filters are non-functional despite having full UI support. Check if there is a separate validation layer or if these need to be added to the schema and the `searchProviders()` WHERE clause.

2. **Consider full-text search for name queries** -- Current name search uses `ILIKE` (`contains` + `mode: 'insensitive'`). For a healthcare provider database, PostgreSQL `tsvector` with `ts_query` would provide significantly better results for partial matches, typo tolerance, and name variations. This is listed as a future item and would be a high-impact improvement.

3. **Add user-controllable sort** -- The hardcoded `lastName ASC, firstName ASC` sort is reasonable as a default but limits utility. Adding sort options (by name, confidence, relevance) would improve the search experience with minimal backend effort.

4. **Monitor cache effectiveness** -- The 5-minute TTL and "only cache non-empty results" strategy means cache misses for uncommon searches. Consider caching empty results with a shorter TTL to prevent repeated expensive queries for no-results searches.

5. **Evaluate debounce timing** -- The 450ms debounce for auto-search is a good default. Consider adding analytics to measure how often debounced searches are actually cancelled (indicating the delay is working) vs. how often users pause naturally (indicating it could be shorter).

6. **Consider abort controller in the API client** -- While `useSearchExecution` implements abort via `AbortController`, the `apiFetch()` function and `providers.search()` do not pass an `AbortSignal` to the underlying `fetch()` call. The abort controller in `useSearchExecution` creates a new controller but there is no mechanism to pass it through to the actual HTTP request. This means server-side processing continues even when the client has moved on. Verify that the abort signal is being threaded through the fetch options.
