# Frontend Data Fetching & State Management

## Overview

The VerifyMyProvider frontend implements a layered data fetching architecture that separates concerns across four distinct layers: a centralized API client with retry logic, a React Query caching layer, custom hooks for domain-specific data, and React Context for client-only state. This document describes each layer in detail, based on the actual source code in the `packages/frontend/src/` directory.

---

## Architecture Overview

```
+-------------------------------------------------------------+
|  React Components                                            |
|  +--------------------+  +-----------------------------+     |
|  | useProviderSearch  |  | useSearchExecution           |     |
|  | useProvider        |  | useSearchForm                |     |
|  | useProviderPlans   |  | useFilterState               |     |
|  | useColocatedProvs  |  | useSearchUrlParams           |     |
|  +--------+-----------+  +----------+------------------+     |
|           |                         |                        |
|  +--------v-------------------------v------------------+     |
|  | @tanstack/react-query (QueryClientProvider)          |     |
|  | - Caching, dedup, background refetch                 |     |
|  | - staleTime: 5min, gcTime: 10min, retry: 2          |     |
|  +------------------------+----------------------------+     |
|                           |                                  |
|  +------------------------v----------------------------+     |
|  | API Client (lib/api.ts)                              |     |
|  | - apiFetch<T>() with retry logic                     |     |
|  | - ApiError class with rate limit detection           |     |
|  | - Exponential backoff + Retry-After parsing          |     |
|  +------------------------+----------------------------+     |
|                           | fetch()                          |
+---------------------------+----------------------------------+
                            v
                  Backend API (/api/v1/*)
```

The provider nesting in `app/layout.tsx` (line 160-183) establishes the runtime hierarchy:

```
<Suspense>
  <PostHogProvider>
    <QueryProvider>           // @tanstack/react-query
      <ThemeProvider>         // Dark/light mode
        <CompareProvider>     // Provider comparison (max 3)
          <ErrorProvider>     // Global error banner
            {children}
          </ErrorProvider>
        </CompareProvider>
      </ThemeProvider>
    </QueryProvider>
  </PostHogProvider>
</Suspense>
```

---

## Layer 1: API Client (`lib/api.ts`)

**File:** `packages/frontend/src/lib/api.ts` (671 lines)

The centralized API client is the lowest layer, handling all HTTP communication with the backend. Every API call flows through the `apiFetch<T>()` function.

### Configuration

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
```

### Core Function: `apiFetch<T>()`

Located at lines 312-356, this is the single point of entry for all backend requests.

```typescript
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }, retryOptions);

  const data = await response.json();

  if (!response.ok) {
    // ... error handling with ApiError construction
    throw error;
  }

  return data.data;  // Unwraps the { data: T } envelope
}
```

Key behaviors:
- Automatically sets `Content-Type: application/json` on all requests
- Unwraps the backend's `{ data: T }` response envelope, returning `T` directly
- Constructs typed `ApiError` instances for non-OK responses
- Shows a toast notification on rate limit (429) responses after retries are exhausted

### Retry Logic: `fetchWithRetry()`

Located at lines 243-303, this wraps the native `fetch()` with automatic retry for transient failures.

```typescript
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 2,
  retryDelay: 1000,
  retryableStatuses: [429, 500, 502, 503, 504],
  exponentialBackoff: true,
};
```

Retry behavior:
- **Retryable HTTP statuses:** 429 (rate limit), 500, 502, 503, 504 (server errors)
- **Exponential backoff:** `baseDelay * 2^attempt` (1s, 2s, 4s for attempts 0, 1, 2)
- **Retry-After header:** Parsed from either integer seconds or HTTP-date format, capped at 30 seconds
- **Network errors:** Retried automatically (detected via TypeError, "failed to fetch", "connection", etc.)
- **Abort errors:** Never retried; thrown immediately
- **Client errors (4xx except 429):** Never retried

### ApiError Class

Located at lines 51-91, provides structured error information:

```typescript
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: ApiErrorDetails | null;
  public readonly retryAfter: number | null;

  isRateLimited(): boolean    // statusCode === 429
  isValidationError(): boolean // statusCode === 400 or code === 'VALIDATION_ERROR'
  isNotFound(): boolean       // statusCode === 404
  isUnauthorized(): boolean   // statusCode === 401 or 403
  isRetryable(): boolean      // status in [429, 500, 502, 503, 504]
}
```

### Utility: `buildQueryString()`

Located at lines 211-226, builds URL query strings from objects, filtering out null/undefined/empty values. Arrays are joined with commas.

```typescript
export function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        if (value.length > 0) searchParams.set(key, value.join(','));
      } else {
        searchParams.set(key, String(value));
      }
    }
  });
  return searchParams.toString();
}
```

### API Namespaces

The API client exposes four namespaces, each containing typed methods:

#### `providers` (exported as `providerApi`)

| Method | Endpoint | Return Type | Purpose |
|--------|----------|-------------|---------|
| `search(filters, page, limit)` | `GET /providers/search` | `{ providers: ProviderDisplay[], pagination: PaginationState }` | Search with all filters |
| `getByNpi(npi)` | `GET /providers/:npi` | `{ provider: ProviderDisplay & { planAcceptances } }` | Provider detail + plan acceptances |
| `getCities(state)` | `GET /providers/cities?state=` | `{ state, cities: string[], count }` | Cities for state dropdown |
| `getPlans(npi, params)` | `GET /providers/:npi/plans` | `{ npi, acceptances, pagination }` | Provider's plan acceptances |
| `getColocated(npi, params)` | `GET /providers/:npi/colocated` | `{ location, providers, pagination }` | Co-located providers |

The `search()` method (lines 398-436) handles both legacy and new-style parameters, normalizes cities between string and array formats, and maps `zipCode`/`zip` aliases.

#### `plans`

| Method | Endpoint | Return Type | Purpose |
|--------|----------|-------------|---------|
| `search(params)` | `GET /plans/search` | `{ plans: InsurancePlanDisplay[], pagination }` | Search plans with filters |
| `getGrouped(params)` | `GET /plans/grouped` | `{ carriers: CarrierGroup[], totalPlans }` | Plans grouped by carrier |
| `getGroupedPlans(params)` | `GET /plans/grouped` | Same as above | Legacy alias |
| `getIssuers(state)` | `GET /plans/meta/issuers` | `{ issuers: Issuer[], count }` | Unique issuers |
| `getPlanTypes(params)` | `GET /plans/meta/plan-types` | `{ planTypes: string[], count }` | Plan types |
| `getById(planId)` | `GET /plans/:planId` | `{ plan: InsurancePlanDisplay & { providerCount } }` | Plan details |
| `getProviders(planId, params)` | `GET /plans/:planId/providers` | `{ plan, providers, pagination }` | Providers for plan |

#### `verify` (exported as `verificationApi`)

| Method | Endpoint | HTTP Method | Purpose |
|--------|----------|-------------|---------|
| `submit(data)` | `/verify` | POST | Submit verification (includes honeypot `website` field) |
| `vote(id, vote, website?)` | `/verify/:id/vote` | POST | Vote on verification |
| `getStats()` | `/verify/stats` | GET | Verification statistics |
| `getRecent(params)` | `/verify/recent` | GET | Recent verifications |
| `getForPair(npi, planId)` | `/verify/:npi/:planId` | GET | Verification pair data |

#### `locations` (exported as `locationApi`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `search(params)` | `GET /locations/search` | Search locations with filters |
| `getHealthSystems(state, cities)` | `GET /locations/health-systems` | Health systems for dropdown (dual-style API) |
| `getById(locationId)` | `GET /locations/:locationId` | Location details |
| `getProviders(locationId, params)` | `GET /locations/:locationId/providers` | Providers at a location |
| `getStats(state)` | `GET /locations/stats/:state` | Location statistics by state |

The `getHealthSystems()` method (lines 609-631) supports both old-style object parameters and new-style separate arguments for backward compatibility.

---

## Layer 2: React Query Setup

### QueryClient Configuration

**File:** `packages/frontend/src/lib/queryClient.ts`

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes
      gcTime: 10 * 60 * 1000,           // 10 minutes (formerly cacheTime)
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
```

Default query behavior:
- **staleTime (5 min):** Data is considered fresh for 5 minutes after fetch; subsequent renders use the cache without refetching
- **gcTime (10 min):** Unused cache entries are garbage collected after 10 minutes
- **retry (2):** React Query retries failed queries up to 2 times (in addition to the API client's own retry logic)
- **refetchOnWindowFocus (false):** Disabled to avoid unexpected refetches when users tab back

### QueryProvider Component

**File:** `packages/frontend/src/components/providers/QueryProvider.tsx`

A minimal client component that wraps children in `QueryClientProvider`:

```typescript
'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

This is mounted in `app/layout.tsx` (line 162) as the outermost data layer, wrapping all other providers and page content.

### Query Key Factory Pattern

**File:** `packages/frontend/src/hooks/useProviderSearch.ts` (lines 8-18)

The project uses a hierarchical query key factory to enable targeted cache invalidation:

```typescript
export const providerKeys = {
  all: ['providers'] as const,
  searches: () => [...providerKeys.all, 'search'] as const,
  search: (filters: Partial<SearchFilters>, page: number, limit: number) =>
    [...providerKeys.searches(), { filters, page, limit }] as const,
  detail: (npi: string) => [...providerKeys.all, 'detail', npi] as const,
  plans: (npi: string, params?: Record<string, unknown>) =>
    [...providerKeys.all, 'plans', npi, params] as const,
  colocated: (npi: string, params?: Record<string, unknown>) =>
    [...providerKeys.all, 'colocated', npi, params] as const,
};
```

This enables:
- `queryClient.invalidateQueries({ queryKey: providerKeys.all })` -- invalidate all provider-related data
- `queryClient.invalidateQueries({ queryKey: providerKeys.searches() })` -- invalidate all searches but keep details
- `queryClient.invalidateQueries({ queryKey: providerKeys.detail('1234567890') })` -- invalidate a specific provider

---

## Layer 3: Custom Data Hooks

### Provider Data Hooks

**File:** `packages/frontend/src/hooks/useProviderSearch.ts`

#### `useProviderSearch(options)`

Wraps `api.providers.search()` with React Query. Requires at least a `state` filter to be enabled.

```typescript
export function useProviderSearch({
  filters,
  page = 1,
  limit = 20,
  enabled = true,
}: UseProviderSearchOptions) {
  const hasRequiredFilters = Boolean(filters.state);

  return useQuery<ProviderSearchResult, Error>({
    queryKey: providerKeys.search(filters, page, limit),
    queryFn: async () => {
      const response = await api.providers.search(filters, page, limit);
      return response;
    },
    enabled: enabled && hasRequiredFilters,
    staleTime: 2 * 60 * 1000, // 2 minutes (overrides default 5min)
  });
}
```

- **Query key:** `['providers', 'search', { filters, page, limit }]`
- **staleTime override:** 2 minutes (shorter than default 5 min, since search results change more frequently)
- **Gate:** `enabled && Boolean(filters.state)` -- no query fires without a state selected

#### `useProvider(npi, enabled)`

Fetches a single provider by NPI with a longer stale time for detail pages.

```typescript
export function useProvider(npi: string, enabled = true) {
  return useQuery({
    queryKey: providerKeys.detail(npi),
    queryFn: async () => {
      const response = await api.providers.getByNpi(npi);
      return response.provider;
    },
    enabled: enabled && Boolean(npi),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
```

- **Query key:** `['providers', 'detail', npi]`
- **staleTime override:** 10 minutes (provider details are relatively stable)

#### `useProviderPlans(npi, params, enabled)`

Fetches a provider's insurance plan acceptances.

- **Query key:** `['providers', 'plans', npi, params]`
- **staleTime:** default (5 minutes from queryClient)

#### `useColocatedProviders(npi, params, enabled)`

Fetches providers at the same physical location.

- **Query key:** `['providers', 'colocated', npi, params]`
- **staleTime:** default (5 minutes)

### Dropdown Data Hooks

These hooks use a custom caching pattern with module-level `Map` caches and in-flight request deduplication, rather than relying solely on React Query.

#### `useCities(state)`

**File:** `packages/frontend/src/hooks/useCities.ts` (340 lines)

Fetches cities for a selected state, with special handling for New York City boroughs.

**Caching strategy:**
- Module-level `Map<string, CacheEntry>` with 5-minute TTL
- In-flight request deduplication via `pendingRequests` Map
- Race condition protection using `currentStateRef`

**NYC borough handling:**
- Defines `NYC_ALL_BOROUGHS_VALUE = 'NYC_ALL_BOROUGHS'` sentinel
- 5 boroughs: `['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']`
- When state is NY and all boroughs exist in the API response, injects the `NYC_ALL_BOROUGHS` option at position 0

**Pinned cities:** Major cities for all 50 states are pinned to the top of the dropdown (lines 27-77), followed by remaining cities alphabetically. For example, NY pins: `['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Buffalo', 'Rochester', 'Albany']`.

**Exported utilities:**
- `clearCitiesCache()` -- clears the module-level cache
- `prefetchCities(state)` -- preload cities (e.g., on hover over a state dropdown)

```typescript
interface UseCitiesResult {
  cities: CityData[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
```

#### `useInsurancePlans(params)`

**File:** `packages/frontend/src/hooks/useInsurancePlans.ts` (233 lines)

Fetches insurance plans grouped by carrier, with derived data computed via `useMemo`.

**Caching strategy:**
- Module-level `Map<string, CacheEntry>` with 10-minute TTL (plans change less frequently)
- Cache key: `"${state}:${search}"`
- In-flight request deduplication

**Derived data (memoized):**
- `allPlans` -- flattened array of `InsurancePlanDisplay` from carrier groups
- `selectOptions` -- `GroupedSelectOptions[]` format for dropdown components
- `findPlan(planId)` -- lookup function for individual plans

```typescript
interface UseInsurancePlansResult {
  groupedPlans: CarrierGroup[];
  allPlans: InsurancePlanDisplay[];
  selectOptions: GroupedSelectOptions[];
  isLoading: boolean;
  error: Error | null;
  findPlan: (planId: string) => InsurancePlanDisplay | undefined;
  refetch: () => Promise<void>;
}
```

**Exported utilities:**
- `clearInsurancePlansCache()` -- clears the module-level cache

#### `useHealthSystems(params)`

**File:** `packages/frontend/src/hooks/useHealthSystems.ts` (226 lines)

Fetches health systems filtered by state and optional cities.

**Caching strategy:**
- Module-level `Map<string, CacheEntry>` with 5-minute TTL
- Cache key: `"${state.toUpperCase()}:${cities.sort().join(',')}"` (sorted for stability)
- In-flight request deduplication

```typescript
interface UseHealthSystemsResult {
  healthSystems: HealthSystem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
```

**Exported utilities:**
- `clearHealthSystemsCache()` -- clears the module-level cache
- `prefetchHealthSystems(state, cities?)` -- preload health systems

### Search State Hooks (`hooks/search/`)

These hooks decompose the search workflow into three composable concerns: URL synchronization, filter state management, and search execution.

#### `useFilterState(options)`

**File:** `packages/frontend/src/hooks/search/useFilterState.ts`

Manages search filter state with defaults, dependent filter clearing, and computed properties.

```typescript
export const DEFAULT_FILTERS: SearchFilters = {
  state: '', city: '', cities: [], specialty: '', name: '',
  npi: '', entityType: '', insurancePlanId: '', healthSystem: '', zipCode: '',
};
```

Key behaviors:
- **Dependent filter clearing:** When `state` changes, automatically clears `city`, `cities`, and `healthSystem` (lines 76-80)
- **Active filter tracking:** `hasActiveFilters` and `activeFilterCount` computed via `useMemo`
- **Search gate:** `canSearch` requires at minimum `state` to be non-empty
- **onChange callback:** Notifies parent (typically `useSearchUrlParams`) on every filter change

```typescript
interface UseFilterStateResult {
  filters: SearchFilters;
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  setFilters: (partial: Partial<SearchFilters>) => void;
  clearFilters: () => void;
  clearFilter: (key: keyof SearchFilters) => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  canSearch: boolean;
}
```

#### `useSearchUrlParams(options)`

**File:** `packages/frontend/src/hooks/search/useSearchParams.ts`

Provides bi-directional synchronization between filter state and URL query parameters, using Next.js `useSearchParams`, `useRouter`, and `usePathname`.

**URL parsing (`parseUrlToFilters`):** Reads all filter keys from `URLSearchParams`, splitting comma-separated `cities` into an array.

**URL updating (`filtersToSearchParams`):** Writes only non-default filter values to URL. Uses `router.replace()` with `{ scroll: false }` to avoid adding history entries on every filter change.

```typescript
interface UseSearchParamsResult {
  getInitialFilters: () => Partial<SearchFilters>;
  updateUrl: (filters: SearchFilters) => void;
}
```

#### `useSearchExecution(options)`

**File:** `packages/frontend/src/hooks/search/useSearchExecution.ts` (265 lines)

Executes provider searches with a two-tier debounce strategy:

1. **Auto-search (typing):** 450ms debounce delay (`SEARCH_DEBOUNCE_MS` from `lib/debounce.ts`). Each keystroke resets the timer; fast typing results in one API call.
2. **Explicit search (button click):** Immediate execution via `searchImmediate()`, which also cancels any pending debounced call to prevent double-execution.
3. **Filter clear:** `clearResults()` cancels pending debounced calls and aborts in-flight requests.

**AbortController usage:** Each `performSearch()` call creates a new `AbortController`. If a new search starts before the previous completes, the old request is aborted. Abort errors are caught and silently ignored.

**NYC borough expansion:** Before the API call, the `NYC_ALL_BOROUGHS` sentinel value is expanded into the 5 actual borough names (lines 124-129).

**Analytics integration:** After a successful search, `trackSearch()` from `lib/analytics.ts` is called with privacy-preserving boolean indicators (not actual filter values).

```typescript
interface UseSearchExecutionResult {
  results: ProviderDisplay[];
  pagination: PaginationState | null;
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;
  search: () => void;              // Debounced (450ms)
  searchImmediate: () => Promise<void>; // Immediate
  goToPage: (page: number) => Promise<void>;
  clearResults: () => void;
}
```

**Error handling:** Uses the standardized `toAppError()` / `getUserMessage()` from `lib/errorUtils.ts` to convert raw errors into user-friendly strings. Errors are also logged via `logError()`, which forwards to PostHog in production.

### Orchestrator: `useSearchForm(options)`

**File:** `packages/frontend/src/hooks/useSearchForm.ts`

Top-level hook that composes the three search hooks into a single, convenient API for page components:

```typescript
export function useSearchForm(options: UseSearchFormOptions = {}): UseSearchFormResult {
  const { defaultFilters, pageSize = 20, syncWithUrl = true,
          autoSearch = false, autoSearchDebounce = 450 } = options;

  const { getInitialFilters, updateUrl } = useSearchUrlParams({ syncWithUrl, defaultFilters });
  const filterState = useFilterState({ initialFilters: merged, onFiltersChange: updateUrl });
  const searchExecution = useSearchExecution({
    filters: filterState.filters, pageSize, autoSearch, autoSearchDebounce,
    canSearch: filterState.canSearch,
  });

  // Compose clearFilters to also clear results
  const clearFilters = () => {
    filterState.clearFilters();
    searchExecution.clearResults();
  };

  return { /* unified interface from all three hooks */ };
}
```

Data flow:
1. `useSearchUrlParams` reads initial filters from the URL on mount
2. `useFilterState` manages the filter values, forwarding changes back to `updateUrl`
3. `useSearchExecution` watches the filters and fires searches (debounced or immediate)

### `useRecentSearches()`

**File:** `packages/frontend/src/hooks/useRecentSearches.ts`

Manages a list of recent searches persisted to `localStorage` under key `vmp_recent_searches`.

- **Max entries:** 5 (`MAX_SEARCHES`)
- **Deduplication:** Before adding, checks if identical params already exist; if so, moves to top with updated timestamp
- **Display text generation:** Converts raw params into readable strings (e.g., "Cardiology in New York, NY at Mount Sinai")
- **SSR safety:** Uses `isHydrated` flag to prevent localStorage access during SSR, only reading on client-side mount

```typescript
interface UseRecentSearchesReturn {
  recentSearches: RecentSearch[];
  addSearch: (params: RecentSearchParams) => void;
  removeSearch: (id: string) => void;
  clearAll: () => void;
  isHydrated: boolean;
}
```

---

## Layer 4: Client State (React Context)

### CompareContext

**File:** `packages/frontend/src/context/CompareContext.tsx`

Manages the provider comparison feature, allowing users to select up to 3 providers for side-by-side comparison.

```typescript
const MAX_COMPARE_PROVIDERS = 3;  // from lib/constants.ts
```

**Storage:** `sessionStorage` under key `verifymyprovider-compare` (session-scoped, clears on tab close).

**SSR safety:** Uses a `mounted` flag and `useEffect` to initialize from `sessionStorage` only after client-side hydration.

**Error handling:** Comprehensive error handling for storage operations including `SyntaxError` (corrupted data), `QuotaExceededError`, and `SecurityError` (private browsing). All errors are logged via `logError()`.

```typescript
interface CompareContextType {
  selectedProviders: CompareProvider[];
  addProvider: (provider: CompareProvider) => void;
  removeProvider: (npi: string) => void;
  clearAll: () => void;
  isSelected: (npi: string) => boolean;
  canAddMore: boolean;
}
```

The `CompareProvider` interface (lines 7-21) captures the provider data needed for the comparison view: NPI, name, specialty, health system, address, confidence score, acceptance status, verification count, and last verified date.

**Consumed via:** `useCompare()` hook (re-exported from `hooks/useCompare.ts` for convenience).

### ErrorContext

**File:** `packages/frontend/src/context/ErrorContext.tsx`

Provides global error state for the `GlobalErrorBanner` component.

```typescript
interface ErrorContextValue {
  error: AppError | null;
  errorVariant: ErrorVariant | null;     // 'network' | 'server' | 'not-found' | 'validation' | 'rate-limit' | 'unknown'
  errorMessage: string | null;           // User-friendly message
  setError: (error: unknown) => void;    // Accepts any error type
  clearError: () => void;
  showErrorToast: (error: unknown, duration?: number) => void;  // Auto-clearing after duration
  hasError: boolean;
}
```

Key features:
- `showErrorToast()` -- Sets an error that automatically clears after a configurable duration (default 5s). Uses a `useRef`-stored timeout to prevent memory leaks.
- `setError()` -- Persistent error display until manually cleared
- All errors are normalized through `toAppError()` from `lib/errorUtils.ts`

**Consumed via:** `useError()` hook.

### ThemeContext

**File:** `packages/frontend/src/context/ThemeContext.tsx`

Manages dark/light/system theme mode.

```typescript
type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeMode;                    // User's selected mode
  resolvedTheme: 'light' | 'dark';    // Actual resolved mode
  setTheme: (theme: ThemeMode) => void;
}
```

**Storage:** `localStorage` under key `verifymyprovider-theme`.

**System theme detection:** Listens to `window.matchMedia('(prefers-color-scheme: dark)')` and updates `resolvedTheme` when OS theme changes (only when user has selected `system` mode).

**Flash prevention:** `app/layout.tsx` includes an inline `<script>` (lines 21-30) that runs before React hydration to apply the correct theme class to `<html>`, preventing the flash of incorrect theme.

**SSR safety:** Returns `null` until mounted to prevent hydration mismatches.

**Consumed via:** `useTheme()` hook.

---

## Error Handling Strategy

**File:** `packages/frontend/src/lib/errorUtils.ts` (406 lines)

The project implements a comprehensive, centralized error handling system.

### Error Conversion Pipeline

```
catch (err: unknown)
    |
    v
toAppError(err) -> AppError { message, code?, statusCode?, retryable, originalError? }
    |
    +-> getUserMessage(appError) -> "User-friendly string"
    +-> getErrorVariant(appError) -> 'network' | 'server' | 'not-found' | 'validation' | 'rate-limit' | 'unknown'
    +-> logError(context, err) -> console.error + PostHog $exception event
```

### Error Classification

`toAppError()` handles:
- `Error` instances (including `ApiError` with `statusCode`/`code`)
- Plain objects with error-like properties
- Strings
- Unknown types (fallback to generic message)

`getUserMessage()` maps status codes and message patterns to user-friendly text:
- 429 -> "Too many requests. Please wait a moment and try again."
- 404 -> "The requested resource was not found."
- 500+ -> "Our servers are having issues. Please try again later."
- Network errors -> "Unable to connect. Please check your internet connection and try again."

### Production Error Tracking

`logError()` sends error metadata to PostHog via the `$exception` event type:
- `$exception_message`, `$exception_type`, `$exception_source`
- `status_code`, `retryable`
- No PII is included

---

## Debounce Implementation

**File:** `packages/frontend/src/lib/debounce.ts` (210 lines)

A custom debounce implementation (not imported from lodash) with cancel, flush, and pending capabilities.

```typescript
const SEARCH_DEBOUNCE_MS = 450;  // For auto-search
const IMMEDIATE_MS = 0;          // For explicit actions

interface DebouncedFunction<T> {
  (...args: Parameters<T>): void;
  cancel: () => void;     // Cancel pending execution
  flush: () => void;      // Execute immediately if pending
  pending: () => boolean; // Check if execution is pending
}
```

Supports both leading-edge and trailing-edge execution modes. The search hooks use trailing-edge (default) for auto-search.

---

## Caching Summary

| Data Type | Cache Layer | TTL | Strategy |
|-----------|-------------|-----|----------|
| Provider search results | React Query | 2 min (staleTime) | Query key includes all filters + pagination |
| Provider details | React Query | 10 min (staleTime) | Keyed by NPI |
| Provider plans | React Query | 5 min (default) | Keyed by NPI + params |
| Co-located providers | React Query | 5 min (default) | Keyed by NPI + params |
| Cities | Module-level Map | 5 min | Per-state key, shared across components |
| Insurance plans | Module-level Map | 10 min | Key: `"${state}:${search}"` |
| Health systems | Module-level Map | 5 min | Key: `"${state}:${sortedCities}"` |
| Recent searches | localStorage | Permanent | Key: `vmp_recent_searches`, max 5 entries |
| Compare providers | sessionStorage | Session | Key: `verifymyprovider-compare`, max 3 |
| Theme preference | localStorage | Permanent | Key: `verifymyprovider-theme` |

All module-level caches include request deduplication via `pendingRequests` Maps to prevent duplicate in-flight requests.

---

## Barrel Exports

**File:** `packages/frontend/src/hooks/index.ts`

Provides a single import point for all hooks:

```typescript
export { useCities, clearCitiesCache, prefetchCities, NYC_ALL_BOROUGHS_VALUE, NYC_BOROUGHS } from './useCities';
export { useHealthSystems, clearHealthSystemsCache, prefetchHealthSystems } from './useHealthSystems';
export { useInsurancePlans, clearInsurancePlansCache } from './useInsurancePlans';
export { useSearchForm } from './useSearchForm';
export { useCompare } from './useCompare';
export { useRecentSearches } from './useRecentSearches';
```

**File:** `packages/frontend/src/hooks/search/index.ts`

Barrel for search-specific hooks:

```typescript
export { useSearchUrlParams, parseUrlToFilters, filtersToSearchParams } from './useSearchParams';
export { useFilterState, DEFAULT_FILTERS, isFilterActive } from './useFilterState';
export { useSearchExecution } from './useSearchExecution';
export { useRecentSearches } from '../useRecentSearches';  // Re-exported for convenience
```

---

## Checklist

### API Client
- [x] Centralized `apiFetch<T>()` with retry logic
- [x] `ApiError` class with typed error details
- [x] Rate limit detection with Retry-After parsing
- [x] Exponential backoff (configurable, base 1s)
- [x] Network error detection (TypeError, connection patterns)
- [x] Abort/cancel support (AbortError detection)
- [x] All API namespaces typed (providers, plans, verify, locations)
- [x] `buildQueryString()` utility for query params
- [x] Legacy backward-compatible exports (`providerApi`, `verificationApi`, `locationApi`)

### React Query
- [x] `QueryClient` configured with staleTime: 5min, gcTime: 10min, retry: 2
- [x] `QueryProvider` wrapping app in `layout.tsx`
- [x] Query key factory pattern (`providerKeys`)
- [x] Provider search hook with 2min staleTime override
- [x] Provider detail hook with 10min staleTime override
- [x] Provider plans hook
- [x] Co-located providers hook
- [x] `refetchOnWindowFocus: false` to avoid surprise refetches

### Dropdown Data Hooks
- [x] `useCities()` with per-state caching (5min TTL)
- [x] NYC boroughs special handling (sentinel value, auto-injection)
- [x] Pinned cities for all 50 US states
- [x] `useInsurancePlans()` with per-filter caching (10min TTL)
- [x] Memoized derived data (`allPlans`, `selectOptions`, `findPlan`)
- [x] `useHealthSystems()` with per-state/city caching (5min TTL)
- [x] Prefetch utilities: `prefetchCities()`, `prefetchHealthSystems()`
- [x] Cache clear utilities: `clearCitiesCache()`, `clearInsurancePlansCache()`, `clearHealthSystemsCache()`
- [x] In-flight request deduplication on all dropdown hooks

### Search State
- [x] URL parameter sync (bi-directional via `useSearchUrlParams`)
- [x] Filter state management with defaults and dependent clearing
- [x] Search execution with two-tier debounce (450ms auto / immediate explicit)
- [x] Form state orchestration via `useSearchForm`
- [x] AbortController for request cancellation
- [x] Privacy-preserving analytics integration

### Client State
- [x] CompareContext (provider comparison, max 3, sessionStorage)
- [x] ErrorContext (global error banner with auto-clearing toast)
- [x] ThemeContext (dark/light/system mode, localStorage, OS theme listener)
- [x] Recent searches (localStorage, max 5, deduplication)

### Error Handling
- [x] Standardized `AppError` type
- [x] `toAppError()` universal error converter
- [x] `getUserMessage()` user-friendly messages
- [x] `getErrorVariant()` UI variant classification
- [x] `logError()` with PostHog integration
- [x] `isAbortError()` helper for cancellation

### Missing / Future
- [ ] Optimistic updates for verifications/votes
- [ ] Infinite scroll / virtual list for large result sets
- [ ] Service worker for offline caching
- [ ] React Query devtools in development
- [ ] `providers.getPlans()` endpoint -- no matching backend route (will 404)
- [ ] Migrate dropdown hooks from manual caching to React Query for consistency

---

## Questions to Consider

1. **Should dropdown hooks migrate to React Query?** The `useCities`, `useInsurancePlans`, and `useHealthSystems` hooks implement their own caching with module-level Maps, while the provider hooks use React Query. Migrating to React Query would provide cache invalidation consistency, devtools visibility, and eliminate the custom deduplication logic.

2. **Is the dual retry appropriate?** React Query retries 2 times, and `apiFetch` also retries 2 times. For a 500 error, this means up to 9 total attempts (3 from apiFetch x 3 from React Query). Consider whether the React Query retry should be disabled for queries that already use `apiFetch`.

3. **Should we add optimistic updates for verifications/votes?** Users submitting verifications or votes currently wait for the server roundtrip. Optimistic updates via React Query mutations would improve perceived performance.

4. **Is `MAX_COMPARE_PROVIDERS = 3` sufficient?** The constant in `lib/constants.ts` is set to 3, though the prompt document references 4. The actual code enforces 3.

5. **Should dropdown data be prefetched on app load?** Currently, `prefetchCities()` and `prefetchHealthSystems()` exist but are only called on-demand. Prefetching common states on app load could improve initial search form responsiveness.

6. **Should React Query devtools be enabled in development?** Currently not included. Adding `@tanstack/react-query-devtools` would provide cache inspection and query debugging capabilities.
