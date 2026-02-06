# Frontend Data Fetching & State Management -- Analysis Output

## Summary

The frontend data fetching layer is well-structured with a centralized API client (`lib/api.ts`), React Query for server state management (`QueryProvider` + `queryClient`), and a clean separation of concerns across custom hooks. The API client includes robust retry logic with exponential backoff and rate-limit handling. Dropdown data hooks (`useCities`, `useInsurancePlans`, `useHealthSystems`) use their own module-level caching independent of React Query, while provider data hooks use React Query's built-in cache. Client state is managed through three React contexts (Compare, Error, Theme).

---

## Checklist Verification

### API Client

| Item | Status | Evidence |
|------|--------|----------|
| Centralized `apiFetch()` with retry logic | VERIFIED | `lib/api.ts` line 312: Generic `apiFetch<T>()` wraps `fetchWithRetry()` which handles retries with configurable max retries, delay, backoff |
| `ApiError` class with typed error details | VERIFIED | Lines 51-91: `ApiError` extends `Error` with `statusCode`, `code`, `details`, `retryAfter` fields and helper methods (`isRateLimited()`, `isRetryable()`, etc.) |
| Rate limit detection with Retry-After parsing | VERIFIED | Lines 133-150: `parseRetryAfter()` handles both integer seconds and HTTP-date format. Lines 344-349: Rate-limited responses show toast with countdown |
| Exponential backoff (configurable) | VERIFIED | Lines 155-173: `calculateRetryDelay()` implements `baseDelay * 2^attempt`, caps Retry-After at 30s |
| Network error detection | VERIFIED | Lines 114-127: `isNetworkError()` checks for `TypeError`, network/connection/timeout keywords |
| Abort/cancel support | VERIFIED | Lines 107-109: `isAbortError()` detects `AbortError`; line 282: aborted requests are never retried |
| All API namespaces typed | VERIFIED | Lines 397-671: Four namespaces -- `providers` (5 methods), `plans` (7 methods), `verify` (5 methods), `locations` (5 methods). All return typed generics via `apiFetch<T>()` |

### React Query

| Item | Status | Evidence |
|------|--------|----------|
| QueryClientProvider in app layout | VERIFIED | `layout.tsx` line 162: `<QueryProvider>` wraps children. `QueryProvider.tsx` wraps in `QueryClientProvider` using `queryClient` from `lib/queryClient.ts` |
| Query key factory pattern | VERIFIED | `useProviderSearch.ts` lines 8-18: `providerKeys` factory with `all`, `searches`, `search`, `detail`, `plans`, `colocated` keys |
| Provider search/detail/plans/colocated hooks | VERIFIED | `useProviderSearch.ts`: `useProviderSearch()` (line 43), `useProvider()` (line 70), `useProviderPlans()` (line 89), `useColocatedProviders()` (line 115) |
| Dropdown data hooks with caching | VERIFIED | `useCities.ts`: module-level `Map` cache with 5-min TTL; `useInsurancePlans.ts`: module-level cache with 10-min TTL; `useHealthSystems.ts`: module-level cache with 5-min TTL |
| Prefetch utilities for dropdown data | VERIFIED | `useCities.ts` line 161: `prefetchCities()`; `useHealthSystems.ts` line 43: `prefetchHealthSystems()` |
| Cache clear utilities | VERIFIED | `useCities.ts` line 154: `clearCitiesCache()`; `useInsurancePlans.ts` line 39: `clearInsurancePlansCache()`; `useHealthSystems.ts` line 36: `clearHealthSystemsCache()` |

### Search State

| Item | Status | Evidence |
|------|--------|----------|
| URL parameter sync (bi-directional) | VERIFIED | `useSearchParams.ts`: `parseUrlToFilters()` (URL -> state, line 14) and `filtersToSearchParams()` (state -> URL, line 53). Uses `router.replace()` with `scroll: false` |
| Filter state management with defaults | VERIFIED | `useFilterState.ts`: `DEFAULT_FILTERS` (line 10) with all filter fields. `setFilter()` auto-clears dependent filters when state changes (city, cities, healthSystem) |
| Search execution via React Query | PARTIALLY VERIFIED | `useSearchExecution.ts` does NOT use React Query -- it uses raw `api.providers.search()` calls with manual state management (`useState` for results/pagination/loading/error). `useProviderSearch.ts` wraps React Query, but `useSearchExecution.ts` manages its own state. |
| Form state orchestration | VERIFIED | `useSearchForm.ts`: Composes `useSearchUrlParams`, `useFilterState`, and `useSearchExecution` into a single unified hook |

### Client State

| Item | Status | Evidence |
|------|--------|----------|
| CompareContext (provider comparison, max 4) | VERIFIED | `CompareContext.tsx`: Uses `sessionStorage` for persistence, `MAX_COMPARE_PROVIDERS` constant (imported from `constants.ts`), `addProvider`/`removeProvider`/`clearAll`/`isSelected`/`canAddMore` |
| ErrorContext (global error banner) | VERIFIED | `ErrorContext.tsx`: `setError()`, `clearError()`, `showErrorToast()` with auto-dismiss timer. Uses `toAppError()` and `getUserMessage()` for standardized error handling |
| ThemeContext (dark/light mode) | VERIFIED | `ThemeContext.tsx`: Three modes (`light`, `dark`, `system`), persists to `localStorage`, listens for `prefers-color-scheme` media query changes, prevents hydration mismatch by returning `null` until mounted |

### Missing / Future

| Item | Status | Notes |
|------|--------|-------|
| Optimistic updates for verifications/votes | NOT IMPLEMENTED | Verification submissions in `InsuranceList.tsx` use `verificationApi.submit()` and track success via local `recentlyVerifiedPlans` state, but no React Query mutation or optimistic update |
| Infinite scroll / virtual list for large result sets | NOT IMPLEMENTED | Pagination is page-based with manual page links |
| Service worker for offline caching | NOT IMPLEMENTED | No service worker or PWA manifest found |
| React Query devtools in development | NOT IMPLEMENTED | `QueryProvider.tsx` only wraps `QueryClientProvider` with no devtools import. `queryClient.ts` has no devtools configuration. |

---

## Questions Answered

### 1. Should we add optimistic updates for verification submissions?
**Yes, moderately recommended.** Currently, `InsuranceList.tsx` submits via `verificationApi.submit()` and tracks recently-verified plans via local `Set<string>` state (`recentlyVerifiedPlans`). This provides immediate UI feedback by showing a "Verified" badge. However, the page does not invalidate or refetch the provider's plan acceptance data after verification. Adding a React Query `useMutation` with `onSuccess` that invalidates `providerKeys.detail(npi)` would keep the data consistent without a full page reload.

### 2. Is the retry logic appropriate for the expected traffic patterns?
**Yes, well-calibrated.** The configuration is:
- Max 2 retries (3 total attempts)
- Exponential backoff: 1s, 2s, 4s
- Retryable statuses: 429, 500, 502, 503, 504
- Retry-After header respected (capped at 30s)
- Aborted requests never retried
- Rate limit toast shown after all retries exhausted

This is appropriate for a consumer-facing app. The backend's search rate limit is 100 requests/hour, so the 2-retry cap prevents excessive load during rate limiting while still recovering from transient 5xx errors.

### 3. Should dropdown data (cities, plans) be prefetched on app load or on-demand?
**Current approach is on-demand with smart caching, which is appropriate.** Cities and health systems are fetched when the user selects a state. Insurance plans are fetched when the component mounts. All three have module-level caches (5-10 min TTL) and deduplication of in-flight requests (`pendingRequests` Map). Prefetch functions exist (`prefetchCities`, `prefetchHealthSystems`) for use on hover or route transition, which is the ideal pattern. Prefetching on app load would be wasteful since users may never reach the search page, and the data is state-dependent.

### 4. Should we add React Query devtools for development debugging?
**Yes, highly recommended -- trivial to add.** Install `@tanstack/react-query-devtools` and add `<ReactQueryDevtools initialIsOpen={false} />` inside the `QueryProvider`. This provides a floating panel showing all cached queries, their states, and timing. It should only be included in development builds.

### 5. Is the max 4 provider comparison limit sufficient?
**Yes, 4 is a reasonable limit.** The comparison feature stores providers in `sessionStorage` (not `localStorage`), so data clears when the browser session ends. The `CompareProvider` interface stores 12 fields per provider. With 4 providers, the session storage footprint is minimal. Increasing beyond 4 would make the comparison UI unwieldy on both desktop and mobile.

---

## Additional Findings

1. **Dual caching layers for dropdown data.** `useCities`, `useInsurancePlans`, and `useHealthSystems` each implement their own module-level `Map` cache with TTL, pending request deduplication, and race condition handling. This is independent of React Query's cache. React Query's default `staleTime: 5 * 60 * 1000` (from `queryClient.ts`) overlaps with these custom caches. The provider search hooks (`useProviderSearch.ts`) correctly use React Query, but the dropdown hooks do not. This is likely intentional to avoid re-renders, but it means the dropdown hooks bypass React Query's refetching, deduplication, and devtools visibility.

2. **`useSearchExecution` does NOT use React Query.** Despite the prompt describing "Search execution via React Query," the actual `useSearchExecution.ts` hook manually manages state with `useState` for results, pagination, loading, and error. It calls `api.providers.search()` directly (not through `useQuery`). This means search results are NOT cached by React Query and are lost on unmount. The debounced search with abort controller pattern is well-implemented, but migrating to `useQuery` with `keepPreviousData` would improve UX.

3. **NYC boroughs special handling.** `useCities.ts` has a `NYC_ALL_BOROUGHS_VALUE` sentinel that expands to 5 borough names. The expansion happens in `useSearchExecution.ts` (line 124) before the API call. This is a nice UX touch but creates coupling between the cities hook and the search execution hook.

4. **`locationApi` calls will fail.** The prompt notes (line 96-97) that the backend locations route is disabled. The `locations` namespace in `api.ts` still defines 5 endpoints. `useHealthSystems.ts` calls `api.locations.getHealthSystems()` -- this will fail if the backend route is truly disabled.

5. **Query client configuration.** `queryClient.ts` sets `staleTime: 5min`, `gcTime: 10min`, `retry: 2`, `refetchOnWindowFocus: false`. The `useProviderSearch` hook overrides `staleTime` to 2 minutes for search results, and `useProvider` overrides it to 10 minutes for detail pages. This tiered staleness approach is well-designed.
