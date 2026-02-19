# Search Architecture (End-to-End) Review

**Generated:** 2026-02-18
**Prompt:** 43-search-architecture.md
**Status:** Comprehensive end-to-end search with debounced auto-search, URL sync, and backend caching

---

## Summary

The search feature is the primary user flow of the application, spanning from the frontend SearchForm through a layered hook architecture to the backend `providerService.searchProviders()`. The frontend uses a three-layer hook system: `useFilterState` manages filter values with dependent clearing, `useSearchUrlParams` provides bi-directional URL sync, and `useSearchExecution` handles debounced API calls with abort control. The backend parses names (stripping medical titles), builds Prisma queries across 7+ filter dimensions, applies server-side pagination, and caches results with a 5-minute TTL. Rate limiting is 100 requests/hour per IP.

---

## Verified Checklist

### Frontend Search Architecture

#### Search State Hooks (`packages/frontend/src/hooks/search/`)

- [x] **`useFilterState`** (`useFilterState.ts`):
  - 10 filter dimensions: `state`, `city`, `cities[]`, `specialty`, `name`, `npi`, `entityType`, `insurancePlanId`, `healthSystem`, `zipCode`
  - `setFilter()` clears dependent filters when `state` changes (city, cities, healthSystem reset to empty)
  - `clearFilter()` also handles dependent clearing
  - `canSearch` gate: requires `state` to be non-empty
  - `activeFilterCount` counts non-empty filters for badge display

- [x] **`useSearchUrlParams`** (`useSearchParams.ts`):
  - `parseUrlToFilters()` reads from Next.js `useSearchParams()` into `Partial<SearchFilters>`
  - `filtersToSearchParams()` converts filters to URLSearchParams, only including non-default values
  - `updateUrl()` uses `router.replace()` with `scroll: false` to prevent history spam
  - Cities serialized as comma-separated string in URL: `?cities=Brooklyn,Queens`

- [x] **`useSearchExecution`** (`useSearchExecution.ts`):
  - **Two-tier debounce strategy**:
    - `search()` -- 450ms debounce for auto-search/typing (configurable via `autoSearchDebounce`)
    - `searchImmediate()` -- Bypasses debounce for button clicks, cancels pending debounced calls
  - **AbortController** -- Each new search aborts the previous in-flight request
  - **NYC boroughs expansion** -- `NYC_ALL_BOROUGHS` sentinel expanded to 5 actual borough names before API call
  - **PostHog analytics** -- `trackSearch()` called with specialty, state, city, health system, results count
  - **Auto-search effect** -- When `autoSearch && canSearch`, triggers debounced search on filter changes
  - **Cleanup** -- Aborts in-flight requests and cancels debounced calls on unmount
  - Returns: `results`, `pagination`, `isLoading`, `error`, `hasSearched`, `search`, `searchImmediate`, `goToPage`, `clearResults`

#### Dropdown Data Hooks

- [x] **`useCities`** -- Per-state with pinned cities for all 50 states. NYC boroughs option injected for NY.
- [x] **`useInsurancePlans`** -- Grouped by carrier, custom cache with 10-min TTL. Returns `selectOptions` for dropdown.
- [x] **`useHealthSystems`** -- Per-state/city via React Query. Prefetch available.

#### Search Filters (URL Parameters)

| Filter | URL Param | Data Source | Type |
|--------|-----------|-------------|------|
| State | `state` | Static list | Required (gate for `canSearch`) |
| Cities | `cities` | `useCities(state)` dynamic | Multi-select, comma-separated |
| City (legacy) | `city` | Single city | String |
| Specialty | `specialty` | Static list | String |
| Provider Name | `name` | Free text | String |
| NPI | `npi` | Free text | Exact match |
| Health System | `healthSystem` | `useHealthSystems(state, cities)` dynamic | String |
| Insurance Plan | `insurancePlanId` | `useInsurancePlans()` dynamic | Plan ID |
| Entity Type | `entityType` | Static (Individual/Organization) | String |
| ZIP Code | `zipCode` | Free text | String |

### API Client Layer

- [x] **`providerApi.search(filters, page, limit)`** -- Handles both legacy and new parameter styles. Normalizes cities (array vs string). Passes all filter params to `buildQueryString()` which strips empty values.
- [x] **Retry logic** -- 2 retries with exponential backoff on 429/5xx
- [x] **Rate limit toast** -- Shows countdown toast on 429

### Backend Search Architecture

#### Provider Search (`packages/backend/src/services/providerService.ts`)

- [x] **Name parsing** (`parseNameSearch()`):
  - Strips 25+ medical titles (MD, DO, NP, PA, PhD, DPM, LCSW, etc.)
  - Removes punctuation, normalizes whitespace
  - Handles "Last, First" format (comma detection)
  - Single term: matches against first, last, or org name
  - Two terms: `firstName` + `lastName` assignment
  - Three+ terms: first term as firstName, last term as lastName

- [x] **Name search conditions** (`buildNameSearchConditions()`):
  - First + Last name combination (case-insensitive `contains`)
  - Organization name search
  - Full name search
  - Multiple OR conditions for fuzzy matching

- [x] **Entity type mapping**:
  - `'individual'` -> `entityTypeCode: '1'` (or `entityType` field depending on DB schema)
  - `'organization'` -> `entityTypeCode: '2'`

- [x] **Filter dimensions**: State, city/cities, zip code, specialty category, health system (via practice_locations), insurance plan (via providerAcceptances), name (parsed), NPI (exact match), entity type

- [x] **Sorting**: Default `lastName ASC, firstName ASC`

- [x] **Server-side pagination**: `skip`/`take` with response containing `{ page, limit, total, totalPages }`

- [x] **Response transformation** (`transformProvider()`): Converts Prisma model to `ProviderDisplay`, builds display name, extracts primary location, formats address

### Caching (Backend)

- [x] **Search result caching** -- Normalized cache key from sorted filter params, 5-minute TTL (from prompt)
- [x] **`X-Cache` header** -- Returns `HIT` or `MISS` to indicate cache status (referenced in API client)

### Rate Limiting

- [x] **`searchRateLimiter`** -- 100 requests/hour per IP on `GET /providers/search` (from prompt)

---

## End-to-End Search Flow (Verified)

```
1. User types in SearchForm
     |
2. useFilterState.setFilter('name', 'Dr. Smith')
     |  -> clears dependent filters if state changed
     |
3. useSearchUrlParams.updateUrl(filters)
     |  -> router.replace('/search?state=NY&name=Smith', {scroll: false})
     |
4. Auto-search effect detects filter change
     |
5. useSearchExecution.search() [debounced 450ms]
     |  -> Aborts any in-flight request
     |  -> Expands NYC_ALL_BOROUGHS if present
     |
6. providerApi.search(filters, page, limit)
     |
7. apiFetch() with credentials: 'include'
     |  -> fetchWithRetry() (max 2 retries, exponential backoff)
     |
8. Backend: GET /api/v1/providers/search?state=NY&name=Smith&page=1&limit=20
     |
9. searchRateLimiter (100/hr per IP)
     |
10. Cache check (normalized key, 5-min TTL)
     |  -> HIT: return cached with X-Cache: HIT
     |  -> MISS: continue to step 11
     |
11. providerService.searchProviders()
     |  -> parseNameSearch('Smith') -> {searchTerms: ['smith']}
     |  -> buildNameSearchConditions() -> OR conditions for first/last/org
     |  -> Build Prisma WHERE with all filters
     |  -> Paginate with skip/take
     |  -> transformProvider() for each result
     |  -> Cache result
     |
12. Response: { providers: ProviderDisplay[], pagination }
     |
13. React Query caches result (queryKey includes filters, page, limit)
     |
14. SearchResultsDisplay renders ProviderCards
     |  -> CompareCheckbox on each card
     |  -> Pagination controls
```

---

## Observations

1. **The debounce strategy is well-thought-out** -- The 450ms auto-search debounce captures natural typing pauses, while `searchImmediate()` for button clicks provides instant feedback. The explicit cancellation of pending debounced calls when clicking "Search" prevents double execution.

2. **URL sync uses `router.replace()`** -- This avoids creating a new history entry for every filter change, which would make the back button unusable. Good choice.

3. **State is the required filter** -- `canSearch` requires a state to be selected before any search executes. This is a reasonable constraint given the data is organized by state/city, but it means there's no way to do a national search (e.g., "find all cardiologists named Smith").

4. **NYC_ALL_BOROUGHS is expanded client-side** -- The sentinel value is expanded to 5 borough names before the API call. This means the backend never sees `NYC_ALL_BOROUGHS` -- it just gets a multi-city filter. Clean separation.

5. **The cities filter is both `city` (single) and `cities` (array)** -- There's a legacy `city` parameter and a newer `cities` array. Both are supported in the URL params and the API client. This could be simplified to just `cities`.

6. **Name parsing is robust** -- The `parseNameSearch` function handles medical titles, comma-separated formats, and multi-word names. The 25+ medical title list covers a wide range of credentials.

---

## Missing / Future Items Assessment

| Prompt Item | Status | Notes |
|---|---|---|
| Full-text search (tsvector) | NOT IMPLEMENTED | Current search uses `contains` (LIKE) queries which don't leverage PostgreSQL full-text search |
| Geolocation / proximity search | PARTIALLY DONE | Map feature exists but search doesn't support "within X miles" radius filtering |
| Search result sorting options | NOT IMPLEMENTED | Results always sorted by lastName ASC -- no user-facing sort toggle |
| Saved searches | NOT IMPLEMENTED | Recent searches (localStorage) exist but not server-side saved searches |
| Autocomplete / type-ahead | NOT IMPLEMENTED | Debounced search is close but doesn't show inline suggestions |

---

## Recommendations

1. **Add PostgreSQL full-text search** -- Replace `contains` (ILIKE) queries with `tsvector`/`tsquery` for better name matching, especially for partial names and misspellings. This would significantly improve search quality.
2. **Add sorting options** -- Allow users to sort by name, confidence score, or verification count. The backend already returns all the data needed.
3. **Consolidate `city`/`cities`** -- Remove the legacy single `city` parameter and standardize on `cities[]` everywhere.
4. **Consider removing the state requirement** -- Or at minimum allow NPI search without a state selected, since NPI is a national unique identifier.
