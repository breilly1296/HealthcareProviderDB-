---
tags:
  - frontend
  - backend
  - feature
  - implemented
type: prompt
priority: 3
created: 2026-02-05
---

# Search Architecture (End-to-End)

## Files to Review

### Frontend
- `packages/frontend/src/app/search/page.tsx` (search page)
- `packages/frontend/src/components/SearchForm.tsx` (search form)
- `packages/frontend/src/components/ProviderCard.tsx` (result card)
- `packages/frontend/src/components/ProviderCardSkeleton.tsx` (loading skeleton)
- `packages/frontend/src/components/EmptyState.tsx` (no results)
- `packages/frontend/src/components/FilterButton.tsx` (filter toggle)
- `packages/frontend/src/components/FilterDrawer.tsx` (filter panel)
- `packages/frontend/src/hooks/useProviderSearch.ts` (search query hook)
- `packages/frontend/src/hooks/useSearchForm.ts` (form state)
- `packages/frontend/src/hooks/search/useSearchExecution.ts` (search execution)
- `packages/frontend/src/hooks/search/useFilterState.ts` (filter state)
- `packages/frontend/src/hooks/search/useSearchParams.ts` (URL sync)
- `packages/frontend/src/hooks/useCities.ts` (city dropdown data)
- `packages/frontend/src/hooks/useInsurancePlans.ts` (plan dropdown data)
- `packages/frontend/src/hooks/useHealthSystems.ts` (health system dropdown)
- `packages/frontend/src/hooks/useRecentSearches.ts` (recent searches)

### Backend
- `packages/backend/src/routes/providers.ts` (`GET /providers/search`)
- `packages/backend/src/services/providerService.ts` (`searchProviders()`)
- `packages/backend/src/utils/cache.ts` (search result caching)
- `packages/backend/src/middleware/rateLimiter.ts` (`searchRateLimiter`)

## Search Flow (End-to-End)

```
User types in SearchForm
        │
        ▼
useSearchForm (form state)
        │
        ▼
useFilterState (filter management)
        │
        ▼
useSearchUrlParams (URL ↔ state sync)
        │                          ▲
        ▼                          │
useSearchExecution ────────► URL params updated
        │
        ▼
providerApi.search(filters)
        │
        ▼
apiFetch() with retry + rate limit handling
        │
        ▼
Backend: GET /api/v1/providers/search
        │
        ▼
searchRateLimiter (100/hr)
        │
        ▼
Cache check (normalized key, 5-min TTL)
        │                     ▲
        ▼ (miss)              │ (hit → return cached)
providerService.searchProviders()
        │
        ├── parseNameSearch() → first/last/full name
        ├── Build Prisma WHERE clause
        ├── Entity type mapping
        ├── transformProvider() → ProviderDisplay
        └── Cache result
        │
        ▼
Response: { providers: ProviderDisplay[], pagination }
        │
        ▼
React Query caches result
        │
        ▼
SearchResultsDisplay renders ProviderCards
```

## Frontend Architecture

### Search Page (`search/page.tsx`)
Top-level page with two main sections:
1. **SearchForm** — Input form with state, specialty, name, filters
2. **SearchResultsDisplay** — Results grid with pagination

The page uses `useSearchParams` from Next.js for URL-driven state.

### Search Filters
| Filter | URL Param | Dropdown Data Source |
|--------|-----------|---------------------|
| State | `state` | Static list (`constants.ts`) |
| City | `cities` | `useCities(state)` — dynamic per state |
| Specialty | `specialty` | Static list |
| Provider Name | `name` | Free text input |
| Health System | `healthSystem` | `useHealthSystems(state, cities)` — dynamic |
| Insurance Plan | `insurancePlanId` | `useInsurancePlans()` — dynamic |
| Entity Type | `entityType` | Static (Individual/Organization) |

### URL Parameter Sync
Search state is stored in URL parameters for:
- **Shareability:** Copy URL to share a specific search
- **Back/forward navigation:** Browser history works correctly
- **Bookmarking:** Save searches for later

`useSearchUrlParams` handles bi-directional sync:
- URL → state: `parseUrlToFilters(searchParams)`
- State → URL: `filtersToSearchParams(filters)`

### Filter State (`useFilterState`)
```typescript
export const DEFAULT_FILTERS: SearchFilters = {
  state: '',
  city: '',
  cities: '',
  specialty: '',
  name: '',
  healthSystem: '',
  insurancePlanId: '',
  entityType: '',
  zipCode: '',
};
```

`isFilterActive(value)` — checks if a filter has a non-default value.

### No Results Handling
`EmptyState` component with contextual suggestions:
- "Search all specialties" if specialty filter is active
- "Search entire state" if city filter is active
- "All health systems" if health system filter is active
- "All insurance plans" if insurance filter is active

### Comparison Integration
Each `ProviderCard` includes a `CompareCheckbox` that adds/removes providers to the `CompareContext` (max 4). When providers are selected, `CompareBar` appears at the bottom.

## Backend Architecture

### Provider Search (`providerService.ts`)

**`searchProviders(params)`** builds a Prisma query with:

1. **Name parsing** (`parseNameSearch`):
   - Strips medical titles (MD, DO, NP, PA, etc.)
   - Splits into first/last name components
   - Handles "Last, First" and "First Last" formats
   - Returns structured `{ firstName, lastName, fullName }`

2. **Name search conditions** (`buildNameSearchConditions`):
   - First + Last name combination (contains, case-insensitive)
   - Organization name search (contains)
   - Full name search (contains)

3. **Entity type mapping:**
   - `individual` → `entityTypeCode: '1'`
   - `organization` → `entityTypeCode: '2'`

4. **Filtering:**
   - State, city/cities, zip code
   - Specialty category
   - Health system (via practice_locations)
   - Insurance plan (via providerAcceptances)
   - Name (parsed as above)
   - NPI (exact match)

5. **Sorting:**
   - Default: `lastName ASC, firstName ASC`

6. **Pagination:**
   - Server-side with `skip`/`take`
   - Returns `{ page, limit, total, totalPages }`

7. **Response transformation** (`transformProvider`):
   - Converts Prisma model to `ProviderDisplay` type
   - Builds display name from components
   - Extracts primary location
   - Formats address

### Caching
- Search results cached with normalized key (sorted filter params)
- TTL: 5 minutes (configurable)
- Cache hit returns `X-Cache: HIT` header
- Manual cache clear via admin endpoint

### Rate Limiting
- `searchRateLimiter`: 100 requests/hour per IP
- Applied to `GET /providers/search`

## Checklist

### Frontend Search
- [x] SearchForm with all filter inputs
- [x] URL parameter sync (bi-directional)
- [x] Filter drawer for advanced filters
- [x] Provider cards with compare checkboxes
- [x] Loading skeletons
- [x] Empty state with contextual suggestions
- [x] Pagination controls
- [x] Error handling with retry
- [x] Recent searches

### Backend Search
- [x] Name parsing with medical title stripping
- [x] Multi-field name search (first/last/org/full)
- [x] All filter dimensions (state, city, specialty, plan, health system, entity type, zip)
- [x] Server-side pagination
- [x] Search result caching (5-min TTL)
- [x] Rate limiting (100/hr)
- [x] Response transformation to display types

### Dropdown Data
- [x] Cities per state (dynamic, prefetchable)
- [x] Insurance plans (grouped by carrier)
- [x] Health systems per state/city (dynamic, prefetchable)
- [x] NYC boroughs special handling in cities

### Missing / Future
- [ ] Full-text search (PostgreSQL `tsvector`)
- [ ] Geolocation / proximity search
- [ ] Search result sorting options (relevance, distance, name)
- [ ] Saved searches (requires user accounts)
- [ ] Search analytics beyond PostHog (which providers are most searched)
- [ ] Autocomplete / type-ahead suggestions

## Questions to Ask
1. Is the 5-minute cache TTL appropriate for search results?
2. Should we add full-text search for better name matching?
3. Should we add geolocation-based proximity search?
4. Is the name parsing logic handling edge cases well (hyphenated names, suffixes)?
5. Should search results be sortable by the user (e.g., by name, distance, confidence)?
