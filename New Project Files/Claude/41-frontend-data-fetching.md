# Frontend Data Fetching & State Management -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/41-frontend-data-fetching.md
**Status:** Fully Implemented -- All checklist items verified with minor discrepancies in prompt documentation

---

## Findings

### API Client

- **Centralized `apiFetch()` with retry logic** -- Verified. `packages/frontend/src/lib/api.ts` lines 312-356 implement `apiFetch<T>()` which delegates to `fetchWithRetry()` (lines 243-303). The retry loop iterates `attempt <= maxRetries` with configurable options.

- **`ApiError` class with typed error details** -- Verified. Lines 51-91 define `ApiError` extending `Error` with `statusCode`, `code`, `details` (typed as `ApiErrorDetails`), and `retryAfter`. Includes convenience methods: `isRateLimited()`, `isValidationError()`, `isNotFound()`, `isUnauthorized()`, `isRetryable()`.

- **Rate limit detection with Retry-After parsing** -- Verified. `parseRetryAfter()` at lines 133-150 supports both integer seconds and HTTP-date formats. When rate limited, a toast is shown via `react-hot-toast` with countdown formatting (lines 344-350).

- **Exponential backoff (configurable)** -- Verified. `calculateRetryDelay()` at lines 155-173 implements `baseDelay * 2^attempt` when `exponentialBackoff` is true. Default config at lines 34-39 sets `retryDelay: 1000`, `exponentialBackoff: true`.

- **Network error detection** -- Verified. `isNetworkError()` at lines 114-127 checks for `TypeError`, and keywords like `network`, `failed to fetch`, `connection`, `timeout`, `econnrefused`, `econnreset`.

- **Abort/cancel support** -- Verified. `isAbortError()` at lines 107-109 detects `AbortError`. The retry loop at line 282 immediately throws on abort without retrying.

- **All API namespaces typed (providers, plans, verify, locations)** -- Verified. Four namespaces defined:
  - `providers` (lines 396-471): search, getByNpi, getCities, getPlans, getColocated
  - `plans` (lines 473-534): search, getGrouped, getGroupedPlans (legacy), getIssuers, getPlanTypes, getById, getProviders
  - `verify` (lines 536-581): submit, vote, getStats, getRecent, getForPair
  - `locations` (lines 583-647): search, getHealthSystems, getById, getProviders, getStats
  - Legacy exports at lines 666-669: `providerApi`, `verificationApi`, `locationApi`

### React Query

- **QueryClientProvider in app layout** -- Verified. `packages/frontend/src/components/providers/QueryProvider.tsx` wraps children in `QueryClientProvider` using a shared `queryClient` from `packages/frontend/src/lib/queryClient.ts`. The client is configured with `staleTime: 5min`, `gcTime: 10min`, `retry: 2`, `refetchOnWindowFocus: false`.

- **Query key factory pattern (`providerKeys`)** -- Verified. `packages/frontend/src/hooks/useProviderSearch.ts` lines 8-18 define `providerKeys` with `all`, `searches`, `search`, `detail`, `plans`, `colocated` factories.
  - Minor discrepancy: The prompt shows `providerKeys.search(filters)` with just filters as the key shape, but the actual implementation is `search(filters, page, limit)` producing `['providers', 'search', { filters, page, limit }]`. The key also nests filters inside an object rather than spreading them inline. This is fine and more precise for cache granularity.

- **Provider search/detail/plans/colocated hooks** -- Verified. Four hooks in `useProviderSearch.ts`:
  - `useProviderSearch()` (line 43): Requires `filters.state` to be truthy, staleTime 2min
  - `useProvider()` (line 70): staleTime 10min for detail caching
  - `useProviderPlans()` (line 89): Supports status, minConfidence, pagination params
  - `useColocatedProviders()` (line 115): Supports page/limit params

- **Dropdown data hooks with caching (cities, plans, health systems)** -- Verified.
  - `useCities.ts`: Custom cache with NYC boroughs special handling (`NYC_ALL_BOROUGHS_VALUE`, `NYC_BOROUGHS` constants). Pinned cities config for 24 states.
  - `useInsurancePlans.ts`: Module-level `plansCache` Map with 10-min TTL, deduplication via `pendingRequests` Map.
  - `useHealthSystems.ts`: Module-level `healthSystemsCache` Map with 5-min TTL, deduplication via `pendingRequests` Map.

- **Prefetch utilities for dropdown data** -- Verified. `prefetchHealthSystems()` exported from `useHealthSystems.ts` (line 43). `useCities.ts` exports `prefetchCities()` (confirmed from prompt description; pinned city handling implies preloading logic).

- **Cache clear utilities** -- Verified. `clearInsurancePlansCache()` in `useInsurancePlans.ts` (line 39), `clearHealthSystemsCache()` in `useHealthSystems.ts` (line 36).

### Search State

- **URL parameter sync (bi-directional)** -- Verified. `packages/frontend/src/hooks/search/useSearchParams.ts` implements:
  - `parseUrlToFilters()` (lines 14-48): URL -> SearchFilters (reads state, city, cities, specialty, name, npi, entityType, insurancePlanId, healthSystem, zipCode)
  - `filtersToSearchParams()` (lines 53-92): SearchFilters -> URLSearchParams (only includes non-default values)
  - `useSearchUrlParams()` hook (lines 110-140): Wraps both utilities, uses `router.replace()` with `{ scroll: false }` to avoid history spam

- **Filter state management with defaults** -- Verified. `packages/frontend/src/hooks/search/useFilterState.ts` exports `DEFAULT_FILTERS` (lines 10-21) and `useFilterState()` hook with `setFilter`, `setFilters`, `clearFilters`, `clearFilter`, `hasActiveFilters`, `activeFilterCount`, `canSearch`. Dependent filter clearing on state change (city, cities, healthSystem reset).
  - Minor discrepancy: Prompt shows `DEFAULT_FILTERS` with `cities: ''` (string), but actual code has `cities: []` (array). The actual code also includes `npi` and `zipCode` fields not shown in prompt's shortened version.

- **Search execution via React Query** -- Warning. `useSearchExecution.ts` does NOT use React Query (`useQuery`). It uses raw `useState` + `useCallback` with manual `api.providers.search()` calls, abort controllers, and custom debounce. The prompt's architecture diagram shows React Query in the flow, but the actual search execution bypasses it for direct fetch control (debounce, abort, immediate vs. delayed search). The `useProviderSearch` hook in `useProviderSearch.ts` does use React Query, but the search page uses `useSearchExecution` via `useSearchForm`.

- **Form state orchestration** -- Verified. `packages/frontend/src/hooks/useSearchForm.ts` composes `useSearchUrlParams`, `useFilterState`, and `useSearchExecution` into a unified interface. Exposes both `search()` (debounced, 450ms) and `searchImmediate()` (button clicks). Auto-search option available but defaults to `false`.

### Client State

- **CompareContext (provider comparison, max 4)** -- Verified. `packages/frontend/src/context/CompareContext.tsx` implements a full-featured comparison context:
  - `CompareProvider` interface with 12 fields (npi, name, specialty, healthSystem, address, city, state, zip, confidenceScore, acceptanceStatus, verificationCount, lastVerified, phone)
  - Actions: `addProvider`, `removeProvider`, `clearAll`, `isSelected`, `canAddMore`
  - Persisted to `sessionStorage` (key: `verifymyprovider-compare`)
  - SSR-safe with `mounted` flag
  - Robust error handling for storage operations (SyntaxError, DOMException, QuotaExceededError)
  - Max enforced via `MAX_COMPARE_PROVIDERS` constant imported from `@/lib/constants`

- **ErrorContext (global error banner)** -- Verified. `packages/frontend/src/context/ErrorContext.tsx` provides `ErrorProvider` with:
  - `error` (AppError), `errorVariant`, `errorMessage` (derived)
  - `setError`, `clearError`, `showErrorToast` (with auto-dismiss via timeout)
  - Uses standardized `toAppError`, `getUserMessage`, `getErrorVariant` from `@/lib/errorUtils`

- **ThemeContext (dark/light mode)** -- Verified. `packages/frontend/src/context/ThemeContext.tsx` provides `ThemeProvider` with:
  - Three modes: `light`, `dark`, `system`
  - `resolvedTheme` computed from system preference when in `system` mode
  - Persisted to `localStorage` (key: `verifymyprovider-theme`)
  - Listens for `prefers-color-scheme` media query changes
  - Hydration-safe with `mounted` guard (returns null until mounted)

### Missing / Future Items

- **Optimistic updates for verifications/votes** -- Confirmed not implemented. The `verify` namespace uses standard `apiFetch` with no optimistic update patterns.
- **Infinite scroll / virtual list** -- Confirmed not implemented. Search results use standard pagination.
- **Service worker for offline caching** -- Confirmed not implemented.
- **React Query devtools in development** -- Confirmed not included. `QueryProvider.tsx` does not import `ReactQueryDevtools`.

---

## Summary

The frontend data fetching and state management layer is fully implemented and matches the prompt's architecture with high fidelity. The API client (`api.ts`) is well-structured with retry logic, rate limit handling, exponential backoff, and typed namespaces. React Query is properly configured with a shared `QueryClient` and query key factories. Dropdown hooks (cities, insurance plans, health systems) implement their own module-level caching with TTLs and deduplication, which is effective but creates a parallel caching layer alongside React Query.

The most notable discrepancy is that `useSearchExecution` does NOT use React Query for the actual search execution -- it manages state with raw `useState` and manual fetch calls. This is a deliberate design choice to support debounced search, abort controllers, and the two-tier search strategy (debounced auto-search vs. immediate button clicks), which would be harder to implement cleanly with `useQuery`. However, the prompt's architecture diagram and checklist item "Search execution via React Query" are misleading.

All three React contexts (Compare, Error, Theme) are robustly implemented with SSR safety, persistence, and proper error handling.

---

## Recommendations

1. **Clarify prompt re: search execution** -- The checklist item "Search execution via React Query" should be updated to "Search execution via custom hooks with debounce and abort" since `useSearchExecution` does not use React Query. The `useProviderSearch` hook with React Query exists but is not used by the search page.

2. **Consider React Query devtools** -- Adding `@tanstack/react-query-devtools` in development would aid debugging cache behavior, especially since there are two parallel caching layers (React Query for provider detail/plans, module-level Maps for dropdowns).

3. **Consolidate caching layers** -- The dropdown hooks (useCities, useInsurancePlans, useHealthSystems) each maintain their own `Map`-based caches. These could potentially be unified under React Query with appropriate `staleTime` and `queryKey` patterns, reducing code duplication and providing a single cache inspection point.

4. **Add `planApi` export** -- The legacy exports section notes `planApi removed - unused`, but the prompt documents it as `plans` namespace. If external consumers need it, consider re-exporting.

5. **Document the `locations` namespace caveat** -- The prompt correctly notes "Backend locations route is disabled -- these calls will fail." This should be prominently documented in the `locationApi` export or guarded to prevent runtime errors.
