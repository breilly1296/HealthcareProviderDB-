# Frontend Data Fetching & State Management Review

**Generated:** 2026-02-18
**Prompt:** 41-frontend-data-fetching.md
**Status:** Well-architected with comprehensive API client, React Query integration, and layered hook system

---

## Summary

The frontend data fetching layer is built on a centralized `apiFetch()` wrapper with retry logic, transparent 401 token refresh, CSRF management, and rate-limit handling. React Query (`@tanstack/react-query`) provides caching, deduplication, and background refetching through a global `QueryClient`. Custom hooks are organized into three tiers: provider data hooks, dropdown data hooks, and search state hooks. Client-side state uses React Context for comparison, errors, themes, and authentication.

---

## Verified Checklist

### API Client (`packages/frontend/src/lib/api.ts`)

- [x] **Centralized `apiFetch<T>()` wrapper** -- Single fetch function used by all API namespaces (881 lines total). Returns `data.data` from the standard `{ success, data }` response envelope.
- [x] **`ApiError` class** -- Typed error with `statusCode`, `code`, `details`, `retryAfter`. Helper methods: `isRateLimited()`, `isValidationError()`, `isNotFound()`, `isUnauthorized()`, `isRetryable()`.
- [x] **Retry logic** -- `fetchWithRetry()` with configurable max retries (default 2), exponential backoff, retryable statuses `[429, 500, 502, 503, 504]`.
- [x] **Rate limit handling** -- Parses `Retry-After` header (seconds or HTTP-date), caps at 30s. Shows toast with countdown via `react-hot-toast` using deduplication key `'rate-limit'`.
- [x] **Network error detection** -- Handles `TypeError`, `failed to fetch`, `connection`, `timeout`, `ECONNREFUSED`, `ECONNRESET`. Network errors trigger retries.
- [x] **Abort/cancel support** -- `isAbortError()` detection. Aborted requests are never retried.
- [x] **CSRF token management** -- Module-level cached token with singleton fetch promise for coalescing. Automatically included on `POST/PUT/PATCH/DELETE` requests via `X-CSRF-Token` header. On 403 with CSRF error code, fetches fresh token and retries once.
- [x] **Transparent 401 token refresh** -- On 401, calls `POST /auth/refresh` (singleton promise for coalescing), then retries the original request. Skip flags prevent infinite loops.
- [x] **Browser/server URL handling** -- Browser uses `/api/v1` (relative, goes through Next.js rewrite proxy for same-origin cookies). Server uses `NEXT_PUBLIC_API_URL` directly.
- [x] **Credentials included** -- All requests use `credentials: 'include'` for cookie-based auth.

### API Namespaces (verified in `api.ts`)

| Namespace | Methods | Export |
|-----------|---------|--------|
| `providers` | `search`, `getByNpi`, `getCities`, `getPlans`, `getColocated`, `getMapPins` | `providerApi` |
| `plans` | `search`, `getGrouped`, `getIssuers`, `getPlanTypes`, `getById`, `getProviders` | (via `api.plans`) |
| `verify` | `submit`, `vote`, `getStats`, `getRecent`, `getForPair` | `verificationApi` |
| `locations` | `search`, `getHealthSystems`, `getById`, `getProviders`, `getStats` | `locationApi` |
| `auth` | `sendMagicLink`, `logout`, `getMe` | `authApi` |
| `savedProviders` | `list`, `save`, `unsave`, `checkStatus` | `savedProvidersApi` |
| `insuranceCard` | `scan`, `save`, `get`, `update`, `delete` | (via `api.insuranceCard`) |

- [x] **`getMapPins`** method added to providers namespace (not listed in original prompt) -- bounding box query for map feature
- [x] **`buildQueryString()`** utility -- Filters null/undefined/empty, joins arrays with commas

### React Query Setup

- [x] **`QueryProvider`** (`packages/frontend/src/components/providers/QueryProvider.tsx`) -- Wraps app in `QueryClientProvider`, imported from `@/lib/queryClient`
- [x] **`QueryClient` configuration** (`packages/frontend/src/lib/queryClient.ts`):
  - `staleTime: 5 * 60 * 1000` (5 minutes default)
  - `gcTime: 10 * 60 * 1000` (10 minutes, formerly `cacheTime`)
  - `retry: 2`
  - `refetchOnWindowFocus: false`
- [x] **Provider in app layout** (`packages/frontend/src/app/layout.tsx`) -- `<QueryProvider>` wraps the entire app, nested inside `<PostHogProvider>` and outside `<AuthProvider>`

### Query Key Factory (`packages/frontend/src/hooks/useProviderSearch.ts`)

- [x] **`providerKeys`** object with hierarchical keys:
  - `all: ['providers']`
  - `searches: () => [...all, 'search']`
  - `search: (filters, page, limit) => [...searches(), { filters, page, limit }]`
  - `detail: (npi) => [...all, 'detail', npi]`
  - `plans: (npi, params) => [...all, 'plans', npi, params]`
  - `colocated: (npi, params) => [...all, 'colocated', npi, params]`

### Provider Data Hooks (`packages/frontend/src/hooks/useProviderSearch.ts`)

| Hook | Stale Time | Gate | Notes |
|------|-----------|------|-------|
| `useProviderSearch` | 2 min | `enabled && hasRequiredFilters` (state filter required) | Slightly shorter staleTime for search results |
| `useProvider` | 10 min | `enabled && Boolean(npi)` | Provider detail cached longer |
| `useProviderPlans` | default (5 min) | `enabled && Boolean(npi)` | Calls `getPlans` -- note: backend route may not exist per prompt |
| `useColocatedProviders` | default (5 min) | `enabled && Boolean(npi)` | Co-located providers |

### Dropdown Data Hooks

- [x] **`useCities`** (`packages/frontend/src/hooks/useCities.ts`):
  - React Query-based with `cityKeys` factory
  - Per-state caching
  - NYC boroughs special handling: injects `NYC_ALL_BOROUGHS` option when all 5 boroughs exist
  - Pinned cities for all 50 states (major cities appear first in dropdown)
  - `prefetchCities()` and `clearCitiesCache()` utilities
  - Reorders with pinned cities first, then alphabetical

- [x] **`useInsurancePlans`** (`packages/frontend/src/hooks/useInsurancePlans.ts`):
  - Custom cache implementation (NOT React Query) -- module-level `Map<string, CacheEntry>` with 10-minute TTL
  - Deduplicates in-flight requests via `pendingRequests` Map
  - Returns: `groupedPlans`, `allPlans` (flattened), `selectOptions` (for dropdown)
  - `findPlan(planId)` and `findPlanByName(issuerName, planName)` lookup utilities
  - Race condition handling via `currentParamsRef`

- [x] **`useHealthSystems`** (`packages/frontend/src/hooks/useHealthSystems.ts`):
  - React Query-based with `healthSystemKeys` factory
  - Per-state/city caching (cities array sorted for cache key stability)
  - `prefetchHealthSystems()` and `clearHealthSystemsCache()` utilities

### Search State Hooks (`packages/frontend/src/hooks/search/`)

- [x] **`useSearchExecution`** (`useSearchExecution.ts`):
  - Two-tier debounce: 450ms for auto-search (typing), immediate for button clicks
  - AbortController cancels in-flight requests on new search
  - NYC_ALL_BOROUGHS expansion before API call
  - PostHog analytics tracking on search
  - Cleanup on unmount (abort + cancel debounce)

- [x] **`useFilterState`** (`useFilterState.ts`):
  - Default filters for all 10 filter dimensions
  - `setFilter()` clears dependent filters (state change -> clear city, cities, healthSystem)
  - `isFilterActive()` checks non-empty/non-default
  - `canSearch` requires state to be set
  - `activeFilterCount` and `hasActiveFilters` computed values

- [x] **`useSearchUrlParams`** (`useSearchParams.ts`):
  - Bi-directional URL sync
  - `parseUrlToFilters()` reads from URLSearchParams
  - `filtersToSearchParams()` writes non-default values to URL
  - Uses `router.replace()` with `scroll: false` to avoid history pollution

### Other Hooks

- [x] **`useRecentSearches`** (`packages/frontend/src/hooks/useRecentSearches.ts`):
  - localStorage-persisted, max 5 searches
  - Deduplication by parameter equality
  - Human-readable display text generation (specialty + location + health system)
  - Hydration-safe (waits for mount before saving)

### Client State (React Context)

- [x] **`CompareContext`** -- Verified in layout: `<CompareProvider>` wrapping app, `<CompareBar>` rendered
- [x] **`ErrorContext`** -- `<ErrorProvider>` + `<GlobalErrorBanner>` in layout
- [x] **`ThemeContext`** -- `<ThemeProvider>` in layout, theme script in `<head>` prevents FOUC
- [x] **`AuthContext`** -- `<AuthProvider>` in layout for auth state management

### App Layout Provider Nesting Order (from `layout.tsx`)

```
PostHogProvider > QueryProvider > AuthProvider > ThemeProvider > CompareProvider > ErrorProvider > ReCaptchaProvider
```

---

## Observations

1. **`useInsurancePlans` uses a custom cache instead of React Query** -- Unlike `useCities` and `useHealthSystems` which use React Query, insurance plans use a module-level Map with manual TTL. This creates an inconsistency. It still handles race conditions and deduplication, but loses React Query benefits (devtools visibility, automatic GC, query invalidation patterns). This may be intentional for the grouped data structure.

2. **`useProviderPlans` may 404** -- The prompt notes that `GET /providers/:npi/plans` has no backend route. The hook exists and the API function is defined, but if called, it would fail. Currently it appears to only be used when explicitly requested, not on the detail page (which gets plan data from `getByNpi`).

3. **CSRF token is module-level** -- The `csrfToken` variable and `csrfFetchPromise` are module-scoped singletons. This works for SPA but could cause issues in SSR contexts where the module is shared across requests. Since CSRF is only relevant in the browser (cookie-based), and the `typeof window` check gates the API URL, this is safe in practice.

4. **Retry on 401 before token refresh** -- The 401 retry flow in `apiFetch` works correctly: first attempt fails with 401, `attemptTokenRefresh()` is called, then the request is retried with `_skipAuthRetry: true`. The singleton promise pattern for both CSRF and refresh prevents thundering herd issues.

5. **`refetchOnWindowFocus: false`** -- This is a deliberate choice that prevents automatic refetching when the user switches tabs. For a healthcare data app where data doesn't change rapidly, this is appropriate and reduces unnecessary API calls.

---

## Recommendations

1. **Migrate `useInsurancePlans` to React Query** -- For consistency with other dropdown hooks and to gain devtools visibility, GC, and cache invalidation.
2. **Add React Query DevTools** -- The prompt's checklist notes this is missing. Adding `ReactQueryDevtools` in development mode would aid debugging.
3. **Consider optimistic updates for verifications** -- The verification submit flow currently waits for server response. An optimistic update pattern would improve perceived performance.
4. **Remove or gate `useProviderPlans`** -- If the backend route doesn't exist, consider removing the hook or adding a TODO comment to prevent confusion.
