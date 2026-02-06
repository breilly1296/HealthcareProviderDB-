---
tags:
  - frontend
  - architecture
  - implemented
type: prompt
priority: 3
created: 2026-02-05
---

# Frontend Data Fetching & State Management

## Files to Review
- `packages/frontend/src/lib/api.ts` (centralized API client)
- `packages/frontend/src/components/providers/QueryProvider.tsx` (React Query setup)
- `packages/frontend/src/hooks/useProviderSearch.ts` (provider data hooks)
- `packages/frontend/src/hooks/useCities.ts` (city dropdown data)
- `packages/frontend/src/hooks/useInsurancePlans.ts` (insurance plan data)
- `packages/frontend/src/hooks/useHealthSystems.ts` (health system data)
- `packages/frontend/src/hooks/useRecentSearches.ts` (recent search history)
- `packages/frontend/src/hooks/search/` (search state hooks)
- `packages/frontend/src/context/` (React contexts)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  React Components                                        │
│  ┌──────────────────┐  ┌───────────────────────────┐    │
│  │  useProviderSearch│  │  useSearchExecution        │    │
│  │  useProvider      │  │  useSearchForm             │    │
│  │  useProviderPlans │  │  useFilterState            │    │
│  │  useColocated     │  │  useSearchUrlParams        │    │
│  └────────┬─────────┘  └──────────┬──────────────────┘    │
│           │                       │                       │
│  ┌────────▼───────────────────────▼──────────────────┐    │
│  │  @tanstack/react-query (QueryClientProvider)       │    │
│  │  - Caching, dedup, background refetch              │    │
│  └────────────────────┬──────────────────────────────┘    │
│                       │                                   │
│  ┌────────────────────▼──────────────────────────────┐    │
│  │  API Client (lib/api.ts)                           │    │
│  │  - apiFetch() with retry logic                     │    │
│  │  - ApiError class with rate limit detection        │    │
│  │  - Exponential backoff + Retry-After parsing       │    │
│  └────────────────────┬──────────────────────────────┘    │
│                       │  fetch()                          │
└───────────────────────┼───────────────────────────────────┘
                        ▼
              Backend API (/api/v1/*)
```

## API Client (`lib/api.ts`)

### Core Function: `apiFetch<T>()`
Centralized fetch wrapper with:
- **Retry logic:** Configurable max retries (default 2), exponential backoff
- **Retryable statuses:** 429, 500, 502, 503, 504
- **Rate limit handling:** Parses `Retry-After` header, caps at 30s, shows toast with countdown
- **Error class:** `ApiError` with `statusCode`, `code`, `details`, `retryAfter`
- **Cache headers:** Reads `X-Cache` header from backend responses
- **Abort support:** Detects `AbortError` for cancelled requests
- **Network error detection:** Handles `TypeError`, connection failures

### API Namespaces

**`providers` (exported as `providerApi`)**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `search(filters, page, limit)` | `GET /providers/search` | Search with all filters |
| `getByNpi(npi)` | `GET /providers/:npi` | Provider detail + plan acceptances |
| `getCities(state)` | `GET /providers/cities` | Cities for state dropdown |
| `getPlans(npi, params)` | `GET /providers/:npi/plans` | Provider's plan acceptances (**no backend route — will 404**) |
| `getColocated(npi, params)` | `GET /providers/:npi/colocated` | Co-located providers |

**`plans`**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `search(params)` | `GET /plans/search` | Search plans with filters |
| `getGrouped(params)` | `GET /plans/grouped` | Plans grouped by carrier |
| `getIssuers(state)` | `GET /plans/meta/issuers` | Unique issuers |
| `getPlanTypes(params)` | `GET /plans/meta/plan-types` | Plan types |
| `getById(planId)` | `GET /plans/:planId` | Plan details |
| `getProviders(planId, params)` | `GET /plans/:planId/providers` | Providers for plan |

**`verify` (exported as `verificationApi`)**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `submit(data)` | `POST /verify` | Submit verification |
| `vote(id, vote)` | `POST /verify/:id/vote` | Vote on verification |
| `getStats()` | `GET /verify/stats` | Verification statistics |
| `getRecent(params)` | `GET /verify/recent` | Recent verifications |
| `getForPair(npi, planId)` | `GET /verify/:npi/:planId` | Verification pair data |

**`locations` (exported as `locationApi`)**
Note: Backend locations route is active with 5 endpoints (search, health-systems, stats/:state, /:locationId, /:locationId/providers).

### Utility: `buildQueryString(params)`
Builds URL query string from object, filtering out null/undefined/empty values.

## React Query Setup

### QueryProvider (`components/providers/QueryProvider.tsx`)
Wraps the app in `QueryClientProvider` — configured in `app/layout.tsx`.

### Query Key Patterns
```typescript
// From useProviderSearch.ts
export const providerKeys = {
  all: ['providers'] as const,
  search: (filters: SearchFilters) => [...providerKeys.all, 'search', filters] as const,
  detail: (npi: string) => [...providerKeys.all, 'detail', npi] as const,
  plans: (npi: string) => [...providerKeys.all, 'plans', npi] as const,
  colocated: (npi: string) => [...providerKeys.all, 'colocated', npi] as const,
};
```

## Custom Hooks

### Provider Data Hooks (`useProviderSearch.ts`)
| Hook | Query Key | Purpose |
|------|-----------|---------|
| `useProviderSearch(filters, page, limit)` | `['providers', 'search', filters]` | Search results with pagination |
| `useProvider(npi)` | `['providers', 'detail', npi]` | Single provider detail |
| `useProviderPlans(npi, params)` | `['providers', 'plans', npi]` | Provider's plan acceptances |
| `useColocatedProviders(npi)` | `['providers', 'colocated', npi]` | Co-located providers |

### Dropdown Data Hooks
| Hook | File | Caching Strategy |
|------|------|-----------------|
| `useCities(state)` | `useCities.ts` | Per-state caching, NYC boroughs special handling, `prefetchCities()` |
| `useInsurancePlans(filters)` | `useInsurancePlans.ts` | Per-filter caching, `clearInsurancePlansCache()` |
| `useHealthSystems(state, cities)` | `useHealthSystems.ts` | Per-state/city caching, `prefetchHealthSystems()`, `clearHealthSystemsCache()` |

### Search State Hooks (`hooks/search/`)
| Hook | File | Purpose |
|------|------|---------|
| `useSearchExecution(options)` | `useSearchExecution.ts` | Execute search via React Query, manage loading/error |
| `useSearchUrlParams(options)` | `useSearchParams.ts` | Bi-directional URL ↔ filter state sync |
| `useFilterState(options)` | `useFilterState.ts` | Manage filter state with defaults, `isFilterActive()` |
| `useSearchForm(options)` | `useSearchForm.ts` (root hooks) | Top-level form state orchestration |

### Other Hooks
| Hook | File | Purpose |
|------|------|---------|
| `useRecentSearches()` | `useRecentSearches.ts` | Recent search history |
| `useCompare()` | `useCompare.ts` | Access CompareContext (add/remove/clear providers, max 4) |

## Client State (React Context)

### CompareContext (`context/CompareContext.tsx`)
- Stores array of providers selected for comparison (max 4)
- Actions: `addProvider`, `removeProvider`, `clearAll`
- Consumed via `useCompare()` hook

### ErrorContext (`context/ErrorContext.tsx`)
- Global error state for `GlobalErrorBanner`
- Actions: `setError`, `clearError`

### ThemeContext (`context/ThemeContext.tsx`)
- Dark/light mode toggle
- Persists preference

## Checklist

### API Client
- [x] Centralized `apiFetch()` with retry logic
- [x] `ApiError` class with typed error details
- [x] Rate limit detection with Retry-After parsing
- [x] Exponential backoff (configurable)
- [x] Network error detection
- [x] Abort/cancel support
- [x] All API namespaces typed (providers, plans, verify, locations)

### React Query
- [x] QueryClientProvider in app layout
- [x] Query key factory pattern (`providerKeys`)
- [x] Provider search/detail/plans/colocated hooks
- [x] Dropdown data hooks with caching (cities, plans, health systems)
- [x] Prefetch utilities for dropdown data
- [x] Cache clear utilities

### Search State
- [x] URL parameter sync (bi-directional)
- [x] Filter state management with defaults
- [x] Search execution via React Query
- [x] Form state orchestration

### Client State
- [x] CompareContext (provider comparison, max 4)
- [x] ErrorContext (global error banner)
- [x] ThemeContext (dark/light mode)

### Missing / Future
- [ ] Optimistic updates for verifications/votes
- [ ] Infinite scroll / virtual list for large result sets
- [ ] Service worker for offline caching
- [ ] React Query devtools in development

## Questions to Ask
1. Should we add optimistic updates for verification submissions?
2. Is the retry logic appropriate for the expected traffic patterns?
3. Should dropdown data (cities, plans) be prefetched on app load or on-demand?
4. Should we add React Query devtools for development debugging?
5. Is the max 4 provider comparison limit sufficient?
