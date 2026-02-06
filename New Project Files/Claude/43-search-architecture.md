# Search Architecture (End-to-End) -- Analysis Output

## Summary

The search architecture spans frontend form/state management, URL sync, API client, and backend search service. The frontend uses a composable hook architecture: `useSearchForm` orchestrates `useFilterState`, `useSearchUrlParams`, and `useSearchExecution`. The backend search uses Prisma with dynamically-built `WHERE` clauses, name parsing with medical title stripping, location-based filtering through the `practice_locations` relation, and a normalized cache with 5-minute TTL. Rate limiting is 100 requests/hour per IP with dual-mode (Redis or in-memory) sliding window algorithm. The search results are sorted by plan acceptance count (descending), then by name.

---

## Checklist Verification

### Frontend Search

| Item | Status | Evidence |
|------|--------|----------|
| SearchForm with all filter inputs | VERIFIED | `search/page.tsx`: Uses `<SearchForm>` component with `onResultsChange` and `onFilterCountChange` callbacks. Desktop form hidden on mobile. |
| URL parameter sync (bi-directional) | VERIFIED | `useSearchParams.ts`: `parseUrlToFilters()` reads 10 URL params into `SearchFilters`. `filtersToSearchParams()` serializes non-default values back to URL. Uses `router.replace()` with `scroll: false`. |
| Filter drawer for advanced filters | VERIFIED | `search/page.tsx` lines 236-250: `<FilterDrawer>` with `<SearchForm variant="drawer">` for mobile. Controlled by `isFilterDrawerOpen` state. |
| Provider cards with compare checkboxes | VERIFIED | `search/page.tsx` line 124: `<ProviderCard key={provider.id} provider={provider} />`. Compare integration is in `CompareContext` via `useCompare()` hook used within `ProviderCard`. |
| Loading skeletons | VERIFIED | `search/page.tsx` lines 253-254: `<SearchResultsSkeleton count={5} />` during loading state |
| Empty state with contextual suggestions | VERIFIED | `search/page.tsx` lines 38-55: `getNoResultsSuggestions()` generates up to 3 suggestions: clear specialty, clear cities, clear health system, clear insurance. Lines 89-96: `<EmptyState type="no-results" suggestions={...}>` |
| Pagination controls | VERIFIED | `search/page.tsx` lines 129-163: Renders page number links with ellipsis for large page ranges. Uses `aria-current="page"` and `aria-label` for accessibility. |
| Error handling with retry | VERIFIED | Lines 79-87: `<ErrorMessage variant="server" message={error} action={{ label: 'Try Again', onClick: onRetry }}>` |
| Recent searches | VERIFIED | `useRecentSearches.ts`: Stores up to 5 recent searches in `localStorage` with generated display text (specialty + location). Deduplicates by comparing all filter params. |

### Backend Search

| Item | Status | Evidence |
|------|--------|----------|
| Name parsing with medical title stripping | VERIFIED | `providerService.ts` lines 13-24: 24 medical titles (dr, md, do, np, pa, rn, phd, etc.). `parseNameSearch()` (lines 30-87) removes from beginning, end, and comma-separated positions. |
| Multi-field name search (first/last/org/full) | VERIFIED | `buildNameSearchConditions()` (lines 92-148): Single term searches `firstName`, `lastName`, `organizationName`. Two terms try "First Last" AND "Last First" combinations. All terms searched individually. Multi-word org name search included. |
| All filter dimensions | VERIFIED | `searchProviders()` (lines 207-293) handles: state, city/cities (comma-separated), zipCode (startsWith), specialty (3-field OR), specialtyCategory, name (fuzzy), npi (exact), entityType ('1'/'2' mapping) |
| Server-side pagination | VERIFIED | Uses `getPaginationValues()` for `take`/`skip`. Returns `{ providers, total, page, limit, totalPages }`. |
| Search result caching (5-min TTL) | VERIFIED | `providers.ts` line 269: `cacheSet(cacheKey, responseData, 300)`. Only caches if results exist (line 268). Cache key generated via `generateSearchCacheKey()` with normalized, deterministic key. |
| Rate limiting (100/hr) | VERIFIED | `rateLimiter.ts` lines 362-367: `searchRateLimiter` with `maxRequests: 100`, `windowMs: 60 * 60 * 1000`. Applied at `providers.ts` line 206: `router.get('/search', searchRateLimiter, ...)` |
| Response transformation to display types | VERIFIED | `providers.ts` `transformProvider()` (lines 45-196): Maps DB fields to API display format, extracts primary location, maps entity types, includes plan acceptances with plan and location details. |

### Dropdown Data

| Item | Status | Evidence |
|------|--------|----------|
| Cities per state (dynamic, prefetchable) | VERIFIED | `useCities.ts`: Fetches via `api.providers.getCities(state)`. Backend `getCitiesByState()` queries `practice_locations` with distinct city, title-cased. `prefetchCities()` exported. |
| Insurance plans (grouped by carrier) | VERIFIED | `useInsurancePlans.ts`: Fetches via `api.plans.getGrouped()`. Returns `groupedPlans`, `allPlans` (flattened), `selectOptions` (for dropdowns), `findPlan()` utility. |
| Health systems per state/city | VERIFIED | `useHealthSystems.ts`: Fetches via `api.locations.getHealthSystems(state, cities)`. `prefetchHealthSystems()` exported. Cache key includes sorted cities for consistency. |
| NYC boroughs special handling | VERIFIED | `useCities.ts` lines 17-130: `NYC_BOROUGHS` array, `NYC_ALL_BOROUGHS_VALUE` sentinel, `injectNycAllBoroughsOption()` adds special option for NY state when all 5 boroughs present. Expansion to real boroughs happens in `useSearchExecution.ts` line 124. |

### Missing / Future

| Item | Status | Notes |
|------|--------|-------|
| Full-text search (PostgreSQL `tsvector`) | NOT IMPLEMENTED | Name search uses `contains` (LIKE %term%) which is case-insensitive but not indexed for full-text. No `tsvector` columns or `GIN` indexes observed. |
| Geolocation / proximity search | NOT IMPLEMENTED | No latitude/longitude fields or PostGIS extensions used. Zip code search uses `startsWith` prefix match only. |
| Search result sorting options | PARTIALLY IMPLEMENTED | Backend sorts by `providerPlanAcceptances: { _count: 'desc' }`, then `lastName`, `firstName`, `organizationName`. No user-facing sort selector exists. |
| Saved searches (requires user accounts) | NOT IMPLEMENTED | No user account system. Recent searches use `localStorage` only. |
| Search analytics beyond PostHog | PARTIALLY IMPLEMENTED | `useSearchExecution.ts` line 142: `trackSearch()` sends specialty, state, city, cities, healthSystem, resultsCount, mode to PostHog. No custom analytics dashboard. |
| Autocomplete / type-ahead suggestions | NOT IMPLEMENTED | Name field is free text with no suggestions |

---

## Questions Answered

### 1. Is the 5-minute cache TTL appropriate for search results?
**Yes, appropriate for the current use case.** The 5-minute TTL balances freshness with performance:
- Provider data (from NPPES) changes infrequently (quarterly updates)
- Plan acceptance data changes when verifications are submitted, but `invalidateSearchCache()` exists in `cache.ts` (line 376) to clear all search caches when needed
- The cache only stores results that have matches (line 268: `if (result.providers.length > 0)`)
- The backend also supports Redis for distributed caching (`cache.ts` lines 91-103) with graceful fallback to in-memory

For high-traffic scenarios, increasing to 10-15 minutes would reduce database load without meaningful staleness. For verification-heavy scenarios, the TTL could be reduced or cache invalidation could be triggered on verification submission.

### 2. Should we add full-text search for better name matching?
**Yes, recommended for improved search quality.** Currently, name search uses Prisma's `contains` (SQL `ILIKE %term%`) which:
- Cannot rank results by relevance
- Performs sequential scans (no index utilization for leading wildcards)
- Cannot handle typos or phonetic variations

PostgreSQL's built-in `tsvector`/`tsquery` with a `GIN` index would provide:
- Stemming (searching "cardiologist" matches "cardiology")
- Ranking by relevance (`ts_rank()`)
- Index-backed performance
- Prefix matching for autocomplete

Implementation would require adding a `search_vector tsvector` column to the `providers` table and a trigger to keep it updated.

### 3. Should we add geolocation-based proximity search?
**Recommended as a future enhancement.** Current location search is limited to:
- State (exact match)
- City/cities (exact match, case-insensitive)
- Zip code (prefix match via `startsWith`)

Adding proximity search would require:
- Geocoding provider addresses to lat/lng (e.g., via Google Geocoding API or a zip-to-lat/lng lookup table)
- Adding PostGIS extension or using `ST_DWithin` for radius queries
- Frontend: Adding a "distance" dropdown (5mi, 10mi, 25mi) and potentially a map view

This is valuable for mobile users who want "doctors near me."

### 4. Is the name parsing logic handling edge cases well?
**Good coverage with some gaps.** The `parseNameSearch()` function handles:
- 24 medical titles stripped from beginning, end, and comma positions
- "First Last" and "Last First" name orders
- Organization name searching (full multi-word match)
- Individual term matching for each word (minimum 2 chars)

Gaps:
- **Hyphenated names** (e.g., "Smith-Jones"): Not explicitly handled. The term would be split by space but not by hyphen, so "Smith-Jones" would be searched as one term.
- **Jr., Sr., III suffixes**: These are not in `MEDICAL_TITLES` and would not be stripped. "John Smith Jr" would treat "Jr" as a potential last name.
- **Apostrophes** (e.g., "O'Brien"): Not stripped or normalized. The `replace(/[,\.;]/g, ' ')` removes commas, periods, and semicolons but not apostrophes.
- **Unicode/accented names**: No normalization for accented characters (e.g., "Jose" vs "Jos\u00e9").

### 5. Should search results be sortable by the user?
**Yes, recommended.** The current sort order is:
1. Plan acceptance count (descending) -- providers with more verified plans appear first
2. Last name (ascending)
3. First name (ascending)
4. Organization name (ascending)

This is a sensible default, but users may want to sort by:
- **Name** (alphabetical)
- **Distance** (if geolocation is added)
- **Confidence score** (highest verified first)

Implementation: Add a `sort` query parameter to the backend search endpoint, add a sort dropdown to the frontend `SearchResultsDisplay`, and pass the sort preference through the filter/URL sync pipeline.

---

## Additional Findings

1. **Search debounce is 450ms.** `useSearchExecution.ts` uses a configurable debounce (default `SEARCH_DEBOUNCE_MS` imported from `lib/debounce`). The `search()` method uses debounce for auto-search, while `searchImmediate()` bypasses debounce for button clicks. Pending debounced calls are cancelled on immediate search to prevent double execution.

2. **AbortController for request cancellation.** `useSearchExecution.ts` line 91: Each search creates a new `AbortController` and aborts the previous in-flight request. This prevents stale responses from overwriting newer results. However, the `AbortController` signal is NOT passed to `api.providers.search()` -- the abort check (line 135) only verifies `abortControllerRef.current?.signal.aborted` after the response arrives, meaning the actual HTTP request is not cancelled.

3. **State is required to search.** `useFilterState.ts` line 163: `canSearch = isFilterActive(filters.state)`. The search form will not execute without a state selected. This ensures all searches are geographically scoped, which keeps query performance manageable.

4. **Search route applies both rate limiting AND caching.** Flow: `searchRateLimiter` (100/hr) -> cache check -> DB query if miss -> cache set. The rate limiter counts all requests including cache hits, which means a user hitting cached results still depletes their rate limit quota.

5. **Cache key normalization.** `cache.ts` `generateSearchCacheKey()` lowercases and trims all string values, uses a simple hash for additional parameters. The hash function (`simpleHash`) is a basic djb2-style hash converted to base36. This ensures equivalent searches with different casing produce the same cache key.

6. **Pinned cities for 40+ states.** `useCities.ts` lines 27-77 define `PINNED_CITIES` for every US state, listing 5-8 major cities each. These appear at the top of the city dropdown, followed by remaining cities alphabetically. This is a significant UX enhancement for states with hundreds of cities.

7. **Pagination uses anchor links, not client-side routing.** `search/page.tsx` lines 143-149 render `<a href="/search?...&page=N">` tags for pagination. This causes full-page navigation on page change rather than client-side updates. This works but loses any client-side state not stored in URL params.

8. **Entity type mapping has a discrepancy.** The search query schema in `providers.ts` line 29 uses `z.enum(['INDIVIDUAL', 'ORGANIZATION'])`, but the service maps these to `'1'`/`'2'` for the DB query. The route's `transformProvider()` maps `'1'` back to `'INDIVIDUAL'` for responses. This double-mapping works but could be simplified with a single mapping layer.

9. **Health system filter is NOT implemented in the backend search.** `providerService.ts` `searchProviders()` does not handle a `healthSystem` parameter. The search query schema in `providers.ts` also does not include `healthSystem`. However, the frontend `useFilterState` includes `healthSystem` and the API client sends it as a query parameter. The backend silently ignores it via Zod's `.parse()` which strips unknown properties. Health system filtering appears to depend on the locations route which may be disabled.
