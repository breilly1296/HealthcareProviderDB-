# Frontend Data Fetching & State Management

## Architecture Overview

```
Components
    |
    v
Custom Hooks (useProviderSearch, useCities, etc.)
    |
    v
React Query (QueryClientProvider)
    |
    v
API Client (lib/api.ts)
    |
    v
Backend API (Express)
```

Data flows unidirectionally from components through custom hooks, which leverage React Query for caching and synchronization, down to a centralized API client that communicates with the backend.

---

## API Client (`lib/api.ts`)

### `apiFetch` - Core Fetch Wrapper

The `apiFetch` function wraps the native `fetch` API with retry logic, rate limit handling, error normalization, and abort support.

```typescript
async function apiFetch<T>(
  url: string,
  options?: ApiFetchOptions
): Promise<T>
```

#### Retry Logic

- **Default retries:** 2 (configurable via `options.retries`)
- **Backoff strategy:** Exponential backoff between retries
- **Retryable HTTP statuses:** `429`, `500`, `502`, `503`, `504`
- Non-retryable errors (e.g., `400`, `401`, `403`, `404`) fail immediately without retry

#### Rate Limit Handling (HTTP 429)

- Parses the `Retry-After` response header to determine wait duration
- Caps the wait time at **30 seconds** to prevent indefinite blocking
- Displays a toast countdown to the user during the wait period
- Retries the request after the wait period elapses

#### `ApiError` Class

```typescript
class ApiError extends Error {
  status: number;
  data?: unknown;
  isNetworkError: boolean;
}
```

- Wraps HTTP errors with structured status codes and response data
- `isNetworkError` flag distinguishes connectivity failures from HTTP errors
- Network errors (e.g., `TypeError: Failed to fetch`) are detected and flagged

#### Cache Header Reading

- Reads the `X-Cache` response header (`HIT` or `MISS`) from backend responses
- Exposes cache status for debugging and potential UI indicators

#### Abort Support

- Accepts an `AbortSignal` via `options.signal`
- Propagates abort to the underlying `fetch` call for request cancellation (e.g., when a component unmounts or a new search supersedes a pending one)

---

## API Namespaces

### `providerApi`

| Method | Endpoint | Notes |
|--------|----------|-------|
| `search(filters)` | `GET /providers/search` | Paginated, cached server-side |
| `getByNpi(npi)` | `GET /providers/:npi` | Single provider with plan acceptances |
| `getCities(state)` | `GET /providers/cities?state=` | Dynamic city list per state |
| `getPlans(npi)` | `GET /providers/:npi/plans` | **404 - no backend route exists** |
| `getColocated(npi)` | `GET /providers/:npi/colocated` | Providers at same address |

### `planApi`

| Method | Endpoint | Notes |
|--------|----------|-------|
| `search(filters)` | `GET /plans/search` | Paginated plan search |
| `getGrouped()` | `GET /plans/grouped` | Plans grouped by issuer |
| `getIssuers()` | `GET /plans/issuers` | Distinct issuer list |
| `getPlanTypes()` | `GET /plans/types` | Distinct plan type list |
| `getById(id)` | `GET /plans/:id` | Single plan detail |
| `getProviders(planId, filters)` | `GET /plans/:id/providers` | Providers accepting a plan |

### `verificationApi`

| Method | Endpoint | Notes |
|--------|----------|-------|
| `submit(data)` | `POST /verifications` | Submit a verification |
| `vote(id, vote)` | `POST /verifications/:id/vote` | Upvote/downvote |
| `getStats()` | `GET /verifications/stats` | Global verification statistics |
| `getRecent()` | `GET /verifications/recent` | Recent verifications |
| `getForPair(npi, planId)` | `GET /verifications?npi=&planId=` | Verifications for a provider-plan pair |

### `locationApi`

Location-related API methods for geographic queries and location-based provider lookups.

---

## React Query Configuration

### QueryProvider

Configured in the root layout to wrap the entire application:

```typescript
// app/layout.tsx or providers.tsx
<QueryClientProvider client={queryClient}>
  {children}
</QueryClientProvider>
```

### Query Key Factory

Structured query keys enable targeted cache invalidation and hierarchical cache management:

```typescript
const providerKeys = {
  all:        ['providers'] as const,
  search:     (filters: SearchFilters) => ['providers', 'search', filters] as const,
  detail:     (npi: string) => ['providers', 'detail', npi] as const,
  plans:      (npi: string) => ['providers', 'plans', npi] as const,
  colocated:  (npi: string) => ['providers', 'colocated', npi] as const,
};
```

- `providerKeys.all` can invalidate all provider-related queries at once
- Filter objects in `providerKeys.search` are serialized for cache key identity
- Detail, plans, and colocated keys are scoped per NPI

---

## Custom Hooks

### Provider Hooks

#### `useProviderSearch(filters)`
- Wraps `providerApi.search` with React Query
- Uses `providerKeys.search(filters)` as the query key
- Returns paginated provider results with loading/error states

#### `useProvider(npi)`
- Fetches a single provider by NPI via `providerApi.getByNpi`
- Uses `providerKeys.detail(npi)` as the query key
- Returns provider data including plan acceptances

#### `useProviderPlans(npi)`
- Fetches insurance plans accepted by a provider
- Uses `providerKeys.plans(npi)` as the query key

#### `useColocatedProviders(npi)`
- Fetches providers at the same practice location
- Uses `providerKeys.colocated(npi)` as the query key

### Filter Data Hooks

#### `useCities(state)`
- Fetches the city list for a given state
- Handles NYC boroughs (maps to the five boroughs when state is NY and context is NYC)
- Supports **prefetching** to preload city lists before the user selects a state

#### `useInsurancePlans(filters)`
- Fetches insurance plans based on filter criteria (issuer, plan type, etc.)
- Supports **cache clearing** for when plan data is updated

#### `useHealthSystems(state?, city?)`
- Fetches health systems filtered by state and/or city
- Supports **prefetching** for anticipated filter selections

### Search Orchestration Hooks

#### `useSearchExecution`
- Orchestrates the full search lifecycle: trigger, loading, results, error
- Integrates with `useProviderSearch` and manages search state transitions

#### `useSearchUrlParams`
- **Bi-directional URL synchronization**: reads search parameters from the URL on page load and writes them back when filters change
- Ensures bookmarkable, shareable search URLs
- Handles URL parsing and serialization of complex filter objects

#### `useFilterState`
- Manages the current state of all search filters
- Provides setter functions for individual filter updates
- Tracks which filters are active for UI display (filter chips, clear buttons)

#### `useSearchForm`
- Combines filter state management with form submission logic
- Handles form validation and submission triggering

#### `useRecentSearches`
- Persists recent search queries (likely in localStorage)
- Provides retrieval and clearing of search history

#### `useCompare`
- Interfaces with the CompareContext for provider comparison functionality
- Provides add/remove/check methods for the comparison list

---

## Client-Side State (Context Providers)

### CompareContext

- Manages a list of providers selected for side-by-side comparison
- **Maximum of 4 providers** can be compared simultaneously
- Provides `addProvider`, `removeProvider`, `clearAll`, `isComparing(npi)` methods
- State is maintained in-memory (resets on page navigation unless persisted)

### ErrorContext

- Global error banner state for application-wide error display
- Allows any component to surface errors to a top-level banner
- Provides `setError`, `clearError` methods

### ThemeContext

- Manages dark/light theme toggle
- **Persisted** across sessions (localStorage or cookie)
- Provides `theme`, `toggleTheme` methods
- Integrates with TailwindCSS dark mode classes

---

## Data Flow Summary

1. **User interaction** triggers a hook (e.g., typing in search triggers `useSearchForm`)
2. **Hook** updates filter state and calls the appropriate API namespace method
3. **API client** (`apiFetch`) makes the HTTP request with retry/rate-limit handling
4. **React Query** caches the response and manages stale/fresh state
5. **Component** re-renders with the new data from the hook's return value
6. **URL** is updated to reflect the current search state (for search pages)
