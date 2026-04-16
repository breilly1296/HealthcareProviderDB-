# Search Architecture — Review Output

## 1. Summary

The end-to-end search feature is broadly implemented and production-ready for the core flow (filter form, URL sync, debounced execution, Prisma query, 5-min cache, rate limit). However there is a **critical silent-drop bug**: the frontend sends `healthSystem` and `insurancePlanId` filters that the backend Zod schema does not accept, so those dimensions are stripped without error and the documented filter surface is broken. The search flow is otherwise well-architected with a clean hook decomposition (`useFilterState` / `useSearchExecution` / `useSearchUrlParams`) and two-tier debounce (450 ms auto vs. immediate on click).

## 2. Findings

### CRITICAL

- **`healthSystem` filter is silently dropped by the backend.** The frontend posts it (`packages/frontend/src/lib/api.ts:536`) and the filter is wired through the drawer UI (`packages/frontend/src/components/SearchForm.tsx:495-504`), but `searchQuerySchema` in `packages/backend/src/routes/providers.ts:28-38` does not include `healthSystem`, and `searchProviders` in `packages/backend/src/services/providerService.ts:209-285` never consumes it. Zod `.parse()` strips unknown keys so no 400 is returned — users see unfiltered results and no error. Same bug affects the documented-in-prompt filter.
- **`insurancePlanId` filter is silently dropped by the backend.** Same root cause: sent at `packages/frontend/src/lib/api.ts:541`, never declared in `packages/backend/src/routes/providers.ts:28-38`, never used in `searchProviders` (`packages/backend/src/services/providerService.ts:209-285`). `providerPlanAcceptances` is only used for ordering (`providerService.ts:274`), not filtering. The Checklist item "All filter dimensions (… plan, health system …)" is NOT verified.

### HIGH

- **`zip` vs `zipCode` naming mismatch.** Frontend sends both `zip` and `zipCode` (`packages/frontend/src/lib/api.ts:535`) but the backend schema only recognizes `zipCode` (`packages/backend/src/routes/providers.ts:32`). The `zip` key is stripped silently; if the frontend ever shifts to `zip`-only this would silently break ZIP filtering too.
- **Cache is NEVER populated for empty result sets.** `packages/backend/src/routes/providers.ts:294` gates `cacheSet` on `result.providers.length > 0`. A slow "no results" query (large state + obscure name) re-hits the database every time, the exact case where caching matters most.
- **Name search over-generates OR conditions.** `buildNameSearchConditions` in `packages/backend/src/services/providerService.ts:94-151` emits up to ~15 `OR` branches for a two-word query (First+Last, Last+First, per-term firstName/lastName/organizationName, full-string organizationName). This balloons Prisma SQL and defeats index usage. At scale this is the slowest path.
- **Specialty filter uses `contains` on all three fields without a leading-anchor.** `providerService.ts:241-248` does `contains` on `primarySpecialty`, `primaryTaxonomyCode`, `specialtyCategory`. An `insensitive contains` on a VARCHAR without trigram/tsvector forces a sequential scan on the providers table. This is the same perf concern raised in the prompt's "Missing/Future".

### MEDIUM

- **Hooks fire multiple searches on mount.** `packages/frontend/src/components/SearchForm.tsx:128-133` triggers an initial `search()` whenever URL params make `canSearch` true, and `packages/frontend/src/app/search/page.tsx:27-30` independently calls `useMapProviders`. On landing from a shared URL with map mode, both list and map APIs fire in parallel — intentional but means the 100/hr rate limit counts map queries against the same search budget.
- **`canSearch` only requires a state.** `packages/frontend/src/hooks/search/useFilterState.ts:163-166`. An empty NPI filter won't execute an NPI-only search. A user who pastes an NPI cannot search without also selecting a state. This is a UX regression for direct-NPI lookups.
- **`cities` array not normalized in cache key.** `generateSearchCacheKey` in `packages/backend/src/utils/cache.ts:341` normalizes the raw string — `"Bronx,Queens"` and `"Queens,Bronx"` generate different keys even though `searchProviders` treats them as a set. Cache hit rate is lower than it should be on multi-city queries.
- **`providerPlanAcceptances._count` in `orderBy`.** `packages/backend/src/services/providerService.ts:274` uses `{ providerPlanAcceptances: { _count: 'desc' } }` as the primary sort. This is a correlated subquery per row and is expensive on large result sets; may be the single biggest query-time cost for any non-name search.
- **Cache TTL is hardcoded at `providers.ts:295` (300 s).** Not configurable via env — answers the Open Question directly: yes, 5 min is reasonable for verified-count-ordered results, but there's no kill-switch if you need to invalidate faster.

### LOW

- **Medical-title stripping is case-insensitive but uses `\\s+` boundaries**, so `"jr."` or `"MD."` at the end of a line without whitespace is missed (`providerService.ts:41-53`). Edge case; list of titles is reasonable.
- **`useGeoLocation`** auto-fills the state from IP (`packages/frontend/src/components/SearchForm.tsx:117-122`). Answer to Open Q #5 on the *form* side — this is the one "sort/scope" the user can't disable if they want to search a different state first.
- **Abort controller is recreated every `performSearch` call** (`useSearchExecution.ts:107-112`) without waiting for the previous `abort()` to propagate; fine in practice but means any listener counting abort events will see spurious cancellations.
- **`filtersToSearchParams` emits `cities` even when default is `[]` and new is `[]`.** `packages/frontend/src/hooks/search/useSearchParams.ts:66-68` only checks `length > 0`, which is correct; just noting the divergent style from other filters.

## 3. Checklist verification

### Frontend Search
- [x] SearchForm with all filter inputs — `packages/frontend/src/components/SearchForm.tsx:395-569`
- [x] URL parameter sync (bi-directional) — `useSearchUrlParams` at `packages/frontend/src/hooks/search/useSearchParams.ts:110-140`
- [x] Filter drawer for advanced filters — `SearchForm.tsx:254-364` drawer variant + `FilterDrawer` in `SearchControls.tsx:54-69`
- [x] Provider cards with compare checkboxes — `ProviderCard.tsx:1-60` imports `BookmarkButton`; compare via `CompareProvider` in `layout.tsx:130`
- [x] Loading skeletons — `SearchResultsSkeleton` used in `search/page.tsx:95`
- [x] Empty state with contextual suggestions — `EmptyState.tsx:48-115`, tips at `:41-46`
- [x] Pagination controls — `SearchPagination.tsx` via `components/search/index.ts`
- [x] Error handling with retry — `useSearchExecution.ts:151-162` via `toAppError`/`getUserMessage`
- [x] Recent searches — `useRecentSearches.ts`, rendered at `search/page.tsx:67-76`

### Backend Search
- [x] Name parsing with medical title stripping — `providerService.ts:15-89`
- [x] Multi-field name search (first/last/org/full) — `providerService.ts:94-151`
- [~] **All filter dimensions — PARTIAL**: state, city/cities, zipCode, specialty, specialtyCategory, name, npi, entityType are wired (`providers.ts:28-38` schema, `providerService.ts:216-264` implementation). `healthSystem` and `insurancePlanId` are NOT — see CRITICAL findings.
- [x] Server-side pagination — `providerService.ts:211,268-282` via `getPaginationValues`
- [~] **Search result caching (5-min TTL) — PARTIAL**: only populated when results are non-empty (`providers.ts:294`). See HIGH.
- [x] Rate limiting (100/hr) — `rateLimiter.ts:362-367`, applied at `providers.ts:227`
- [x] Response transformation to display types — `providers.ts:61-216` `transformProvider`

### Dropdown Data
- [x] Cities per state (dynamic, prefetchable) — `providerService.ts:301-330` + `providers.ts:309-322`
- [x] Insurance plans (grouped by carrier) — consumed via `useInsurancePlans` at `SearchForm.tsx:85`
- [x] Health systems per state/city (dynamic, prefetchable) — `locations.ts:76-84` `/locations/health-systems`; frontend hook `useHealthSystems` in `SearchForm.tsx:81-84`
- [x] NYC boroughs special handling in cities — `SearchForm.tsx:176-213` + expansion in `useSearchExecution.ts:124-126`

### Missing / Future (unchanged from prompt)
- [ ] Full-text search (PostgreSQL `tsvector`)
- [ ] Geolocation / proximity search — `useGeoLocation` exists for state-prefill only (`packages/frontend/src/hooks/useGeoLocation.ts`); no distance filter in the search query
- [ ] Search result sorting options (sort is hardcoded at `providerService.ts:273-278`)
- [ ] Saved searches (user accounts exist but no saved-search model)
- [ ] Search analytics beyond PostHog — `trackSearch` call at `useSearchExecution.ts:142-150`
- [ ] Autocomplete / type-ahead suggestions

## 4. Recommendations (ranked)

1. **Fix the silent filter drop.** Add `healthSystem` and `insurancePlanId` to `searchQuerySchema` (`packages/backend/src/routes/providers.ts:28-38`), wire them into `ProviderSearchParams` and `searchProviders` (`providerService.ts:153-285`) using `providerHospitals.hospitalSystem` contains and `providerPlanAcceptances.planId` equals respectively. Also update `generateSearchCacheKey` so the new dimensions participate in the cache key (already scaffolded in `utils/cache.ts:300-309` — just plumb them through).
2. **Cache empty results with a shorter TTL.** `providers.ts:294` — cache `{providers:[], pagination:{total:0,…}}` for e.g. 60 s. Avoids DB hammering on slow no-result queries.
3. **Drop `providerPlanAcceptances._count` from the default ORDER BY**, or gate it behind an explicit `sort=verified` param. `providerService.ts:273-278`. Ordering by a correlated aggregate on every query is the single largest perf fix.
4. **Relax `canSearch` to allow NPI-only search.** `useFilterState.ts:163-166` → `return isFilterActive(filters.state) || isFilterActive(filters.npi)` (plus maybe `name` if you want).
5. **Normalize `cities` in the cache key.** `utils/cache.ts:341` — sort `params.cities.split(',')` before hashing so `"Queens,Bronx"` and `"Bronx,Queens"` collapse to one cache entry.
6. **Plan for full-text search.** Add a tsvector + GIN index on `(first_name || ' ' || last_name || ' ' || organization_name)` and swap the OR-heavy `buildNameSearchConditions` for a `websearch_to_tsquery` call. Will also answer Open Q #2.

## 5. Open questions (from prompt)

1. **Is the 5-minute cache TTL appropriate?** Generally yes — data changes on verification submits and we invalidate via `invalidateSearchCache` at `utils/cache.ts:376-378`. The bigger issue is that empty results aren't cached (HIGH above).
2. **Should we add full-text search?** Yes — the current `OR`-of-`contains` path is the dominant cost; see Rec 6.
3. **Should we add geolocation-based proximity search?** The schema is ready (`latitude`/`longitude` + `idx_locations_lat_lng`), `mapService.ts:51-179` already does bounding-box. A radius filter on the list search is a small addition.
4. **Is name parsing handling edge cases well (hyphenated names, suffixes)?** Hyphens are preserved (split on `\s+`), but the parser treats `"Anne-Marie O'Brien"` as two terms which is probably fine; `"Jr"` and `"Sr"` are not in `MEDICAL_TITLES` (`providerService.ts:15-26`) so `"Smith Jr"` will try `{firstName:'smith', lastName:'jr'}` — a bug worth fixing.
5. **Should search results be sortable?** Currently hardcoded (`providerService.ts:273-278`). Adding `?sort=name|verified|distance` would unblock Rec 3.
