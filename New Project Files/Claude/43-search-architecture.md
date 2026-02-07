# Search Architecture (End-to-End)

> Generated: 2026-02-07
> Scope: Full-stack search feature analysis covering frontend hooks, components, API layer, backend service, caching, and rate limiting.

---

## Table of Contents

1. [Overview](#overview)
2. [Search Flow (End-to-End)](#search-flow-end-to-end)
3. [Frontend Architecture](#frontend-architecture)
   - [Search Page](#search-page-searchpagetsx)
   - [SearchForm Component](#searchform-component)
   - [Hook Composition](#hook-composition)
   - [URL Parameter Sync](#url-parameter-sync)
   - [Filter State Management](#filter-state-management)
   - [Search Execution](#search-execution)
   - [Debounce Strategy](#debounce-strategy)
   - [Dropdown Data Hooks](#dropdown-data-hooks)
   - [Recent Searches](#recent-searches)
   - [Result Display Components](#result-display-components)
   - [Mobile Filter Drawer](#mobile-filter-drawer)
4. [API Layer](#api-layer)
   - [API Client](#api-client)
   - [Retry Logic](#retry-logic)
5. [Backend Architecture](#backend-architecture)
   - [Route Handler](#route-handler)
   - [Input Validation](#input-validation)
   - [Provider Service](#provider-service)
   - [Name Parsing](#name-parsing)
   - [Name Search Conditions](#name-search-conditions)
   - [Location Filtering](#location-filtering)
   - [Specialty Filtering](#specialty-filtering)
   - [Result Ordering](#result-ordering)
   - [Pagination](#pagination)
   - [Response Transformation](#response-transformation)
6. [Caching](#caching)
   - [Backend Search Cache](#backend-search-cache)
   - [Frontend Data Caches](#frontend-data-caches)
7. [Rate Limiting](#rate-limiting)
8. [Request Timeout](#request-timeout)
9. [Type Definitions](#type-definitions)
10. [Checklist](#checklist)
11. [Questions to Ask](#questions-to-ask)

---

## Overview

The search feature is the primary user-facing capability of HealthcareProviderDB. It allows users to find healthcare providers by specialty, location (state/city/zip), health system, insurance plan, provider name, and NPI number. The architecture spans from URL-driven state management on the frontend through a debounced API call layer to a Prisma-powered PostgreSQL query on the backend, with caching and rate limiting at multiple levels.

**Key design principles:**
- URL-driven state for shareability and browser navigation
- Composable hooks with clear separation of concerns
- Two-tier debounce: 450ms for typing, immediate for button clicks
- Multi-layer caching: frontend module-level caches + backend Redis/in-memory cache
- Sliding window rate limiting with Redis-distributed or in-memory modes

---

## Search Flow (End-to-End)

```
User types in SearchForm
        |
        v
useSearchForm (orchestrator hook)
        |
        +---> useFilterState (reactive filter management)
        |         |
        |         +---> setFilter() clears dependent filters
        |         |     (state change clears city, cities, healthSystem)
        |         |
        |         +---> onFiltersChange callback --> useSearchUrlParams.updateUrl()
        |
        +---> useSearchUrlParams (bi-directional URL <--> state sync)
        |         |
        |         +---> parseUrlToFilters() on init
        |         +---> filtersToSearchParams() on change
        |         +---> router.replace() to update URL without history push
        |
        +---> useSearchExecution (API call orchestration)
                  |
                  +---> search() [debounced, 450ms, for auto-search/typing]
                  +---> searchImmediate() [bypasses debounce, for button clicks]
                  |
                  v
        NYC_ALL_BOROUGHS expansion (client-side)
                  |
                  v
        api.providers.search(filters, page, pageSize)
                  |
                  v
        apiFetch() with automatic retry + rate limit handling
                  |
                  v
        fetchWithRetry() [max 2 retries, exponential backoff]
                  |
                  v
        Backend: GET /api/v1/providers/search
                  |
                  +---> searchTimeout middleware (15s)
                  +---> searchRateLimiter (100 req/hr per IP)
                  +---> Zod schema validation
                  +---> generateSearchCacheKey() [normalized, deterministic]
                  |
                  v
        Cache check (Redis or in-memory, 5-min TTL)
                  |                     ^
                  v (miss)              | (hit --> return cached with X-Cache: HIT)
        providerService.searchProviders()
                  |
                  +--- parseNameSearch() --> strip titles, split first/last
                  +--- buildNameSearchConditions() --> OR across name fields
                  +--- Location filter through practice_locations relation
                  +--- Specialty filter across category + taxonomy + description
                  +--- Entity type mapping (INDIVIDUAL='1', ORGANIZATION='2')
                  +--- Prisma findMany + count (parallel)
                  |
                  v
        transformProvider() --> ProviderDisplay shape
                  |
                  v
        Cache result (only if results > 0)
                  |
                  v
        Response: { providers: ProviderDisplay[], pagination }
                  |
                  v
        trackSearch() --> PostHog analytics event
                  |
                  v
        SearchResultsDisplay renders ProviderCards
```

---

## Frontend Architecture

### Search Page (`search/page.tsx`)

**File:** `packages/frontend/src/app/search/page.tsx`

The search page is the top-level container with three main responsibilities:

1. **State management** -- holds `providers`, `pagination`, `hasSearched`, and `error` as React state
2. **Responsive layout** -- desktop inline form vs. mobile filter drawer
3. **Result display** -- delegates to `SearchResultsDisplay`

```typescript
// Key state in SearchPageContent
const [providers, setProviders] = useState<ProviderDisplay[]>([]);
const [pagination, setPagination] = useState<PaginationState | null>(null);
const [hasSearched, setHasSearched] = useState(false);
const [error, setError] = useState<string | null>(null);
const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
const [activeFilterCount, setActiveFilterCount] = useState(0);
```

The page wraps `SearchPageContent` in a `<Suspense>` boundary for Next.js streaming SSR support. The `SearchForm` component communicates results upward via the `onResultsChange` callback.

**Desktop layout:** `SearchForm` is rendered inside a `.hidden.md:block` card.

**Mobile layout:** A floating `FilterButton` opens a `FilterDrawer` containing a `SearchForm` with `variant="drawer"`.

The `SearchForm` exposes `search()` and `clear()` methods via `useImperativeHandle`, allowing the drawer's "Apply Filters" and "Clear All" buttons to programmatically trigger form actions.

### SearchForm Component

**File:** `packages/frontend/src/components/SearchForm.tsx`

The `SearchForm` is a `forwardRef` component supporting two variants:

| Variant | Layout | Search Button | Use Case |
|---------|--------|---------------|----------|
| `inline` | Grid (4-col + 2-col rows) | Visible, submits form | Desktop |
| `drawer` | Single column, stacked | Hidden (drawer has Apply button) | Mobile |

**Filter inputs:**

| Filter | Component | Data Source |
|--------|-----------|-------------|
| Specialty | `SearchableSelect` | `SPECIALTY_OPTIONS` (static, from `provider-utils.ts`) |
| State | `SearchableSelect` | `STATE_OPTIONS` (static, from `provider-utils.ts`) |
| City | `SearchableSelect` (multi) | `useCities(state)` -- dynamic per state |
| Health System | `SearchableSelect` | `useHealthSystems({ state, cities })` -- dynamic |
| Insurance Plan | `SearchableSelect` (grouped) | `useInsurancePlans()` -- grouped by carrier |
| ZIP Code | `<input>` | Free text, maxLength=10 |
| Provider Name | `<input>` | Free text (in Advanced Filters) |
| NPI Number | `<input>` | Free text, maxLength=10 (in Advanced Filters) |

**NYC All Boroughs logic:** When the city `NYC_ALL_BOROUGHS` is selected for NY state, individual borough selections are cleared. When a borough is deselected while the combo is active, the combo expands to the remaining boroughs. This is handled by `handleCityChange()`.

**Active filter chips:** Non-default filter values are displayed as removable chips below the form. Each chip calls `clearFilter(key)` to remove that specific filter. A "Clear all" button calls `clearFilters()`.

**Advanced Filters:** Provider Name and NPI Number are hidden inside a `<details>` element labeled "Advanced Filters" with a badge showing the active count.

### Hook Composition

**File:** `packages/frontend/src/hooks/useSearchForm.ts`

`useSearchForm` is the orchestrator hook that composes three specialized hooks:

```
useSearchForm (orchestrator)
    |
    +---> useSearchUrlParams  -- URL <--> filter sync
    |         returns: { getInitialFilters, updateUrl }
    |
    +---> useFilterState      -- reactive filter state
    |         returns: { filters, setFilter, setFilters, clearFilters,
    |                    clearFilter, hasActiveFilters, activeFilterCount, canSearch }
    |
    +---> useSearchExecution  -- API call management
              returns: { results, pagination, isLoading, error, hasSearched,
                         search, searchImmediate, goToPage, clearResults }
```

The composition flow:
1. `useSearchUrlParams` provides `getInitialFilters()` to seed the initial state
2. `useFilterState` is initialized with `{ ...mergedDefaultFilters, ...getInitialFilters() }`
3. `useFilterState.onFiltersChange` is wired to `useSearchUrlParams.updateUrl`
4. `useSearchExecution` receives the reactive `filterState.filters` and `filterState.canSearch`

**`canSearch` gate:** At minimum, a state must be selected before search is enabled:

```typescript
// From useFilterState
const canSearch = useMemo(() => {
  return isFilterActive(filters.state);
}, [filters.state]);
```

### URL Parameter Sync

**File:** `packages/frontend/src/hooks/search/useSearchParams.ts`

Search state is encoded in URL parameters for three benefits:
- **Shareability:** Copy URL to share a specific search
- **Back/forward navigation:** Browser history works correctly
- **Bookmarking:** Save searches for later

**`parseUrlToFilters(searchParams)`** -- Reads URL params into a `Partial<SearchFilters>`:

| URL Param | Type | Notes |
|-----------|------|-------|
| `state` | `string` | 2-letter state code |
| `city` | `string` | Legacy single city |
| `cities` | `string` | Comma-separated, split into `string[]` |
| `specialty` | `string` | Category key |
| `name` | `string` | Free text |
| `npi` | `string` | 10-digit NPI |
| `entityType` | `string` | INDIVIDUAL or ORGANIZATION |
| `insurancePlanId` | `string` | Plan ID |
| `healthSystem` | `string` | Health system name |
| `zipCode` | `string` | ZIP code |

**`filtersToSearchParams(filters, defaultFilters)`** -- Converts filters back to `URLSearchParams`, only including non-default values. Arrays (cities) are joined with commas.

**URL update strategy:** Uses `router.replace()` (not `push`) to avoid polluting browser history with every filter change. The `{ scroll: false }` option prevents scroll-to-top.

### Filter State Management

**File:** `packages/frontend/src/hooks/search/useFilterState.ts`

**Default filters:**

```typescript
export const DEFAULT_FILTERS: SearchFilters = {
  state: '',
  city: '',
  cities: [],
  specialty: '',
  name: '',
  npi: '',
  entityType: '',
  insurancePlanId: '',
  healthSystem: '',
  zipCode: '',
};
```

**Dependent filter clearing:** When `state` changes, dependent filters are automatically reset:

```typescript
if (key === 'state') {
  newFilters.city = '';
  newFilters.cities = [];
  newFilters.healthSystem = '';
}
```

This prevents stale city or health system selections when the user switches states.

**`isFilterActive(value)`** -- Checks if a filter is non-empty:
- For arrays: `value.length > 0`
- For strings: `value !== ''`

**`activeFilterCount`** -- Counts all non-default filters (used for the mobile filter badge).

### Search Execution

**File:** `packages/frontend/src/hooks/search/useSearchExecution.ts`

This hook manages the actual API calls with:

1. **AbortController** -- Cancels in-flight requests when a new search is triggered
2. **Debounced search** -- 450ms delay for auto-search (typing)
3. **Immediate search** -- Bypasses debounce for button clicks
4. **Error handling** -- Standardized via `toAppError()` and `getUserMessage()`
5. **Analytics tracking** -- PostHog event via `trackSearch()`

**Key implementation detail -- `filtersRef`:** The hook keeps filters in a ref (`filtersRef.current = filters`) so that debounced callbacks always read the latest filters, not stale closure values:

```typescript
const filtersRef = useRef(filters);
useEffect(() => {
  filtersRef.current = filters;
}, [filters]);
```

**NYC expansion:** Before the API call, the `NYC_ALL_BOROUGHS_VALUE` placeholder is expanded to the actual five borough names:

```typescript
const expandedCities = currentFilters.cities.flatMap(city =>
  city === NYC_ALL_BOROUGHS_VALUE ? NYC_BOROUGHS : [city]
);
```

**Auto-search effect:** When `autoSearch` is enabled, filter changes trigger `search()` (debounced):

```typescript
useEffect(() => {
  if (!autoSearch || !canSearch) return;
  search();
}, [filters, autoSearch, canSearch, search]);
```

**Cleanup on unmount:** Aborts in-flight requests and cancels pending debounced calls.

### Debounce Strategy

**File:** `packages/frontend/src/lib/debounce.ts`

A custom debounce implementation with cancel, flush, and pending methods. The implementation follows a leading/trailing edge pattern similar to Lodash's debounce.

**Two-tier strategy:**

| Action | Function | Delay | Behavior |
|--------|----------|-------|----------|
| User types (auto-search) | `search()` | 450ms | Trailing edge execution; each keystroke resets timer |
| User clicks "Search" | `searchImmediate()` | 0ms | Cancels pending debounce, executes immediately |
| User clears filters | `clearResults()` | N/A | Cancels pending debounce, aborts in-flight request |

**Constant:** `SEARCH_DEBOUNCE_MS = 450` -- chosen to capture natural typing pauses (300-500ms between words).

### Dropdown Data Hooks

All three data hooks follow the same pattern:
- Module-level `Map` cache with TTL
- Pending request deduplication (prevents duplicate in-flight requests)
- Race condition protection via `currentParamsRef`
- `prefetch()` export for preloading on hover
- `refetch()` method for force-refresh

#### useCities

**File:** `packages/frontend/src/hooks/useCities.ts`

- **API:** `GET /api/v1/providers/cities?state=XX`
- **Cache TTL:** 5 minutes
- **Pinned cities:** Major cities per state are pinned to the top of the dropdown (e.g., NY: New York, Brooklyn, Queens, etc.)
- **NYC special handling:** Injects `NYC_ALL_BOROUGHS` option at position 0 when all 5 NYC boroughs exist in the city list
- **NYC boroughs:** `['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']`
- **Ordering:** Pinned cities first (in specified order), then remaining cities alphabetically

#### useHealthSystems

**File:** `packages/frontend/src/hooks/useHealthSystems.ts`

- **API:** `GET /api/v1/locations/health-systems?state=XX&cities=city1,city2`
- **Cache TTL:** 5 minutes
- **Cache key:** `STATE:sorted_cities_comma_separated`
- **Dependency:** Re-fetches when state or cities change

#### useInsurancePlans

**File:** `packages/frontend/src/hooks/useInsurancePlans.ts`

- **API:** `GET /api/v1/plans/grouped`
- **Cache TTL:** 10 minutes (plans change less frequently)
- **Data shape:** Returns `CarrierGroup[]` (grouped by carrier), flattened to `InsurancePlanDisplay[]` and `GroupedSelectOptions[]` for the `SearchableSelect` component
- **`findPlan(planId)`** -- Lookup function for displaying plan names from IDs

### Recent Searches

**File:** `packages/frontend/src/hooks/useRecentSearches.ts`

Stores the last 5 searches in `localStorage` under the key `vmp_recent_searches`.

```typescript
interface RecentSearch {
  id: string;          // Timestamp + random suffix
  params: RecentSearchParams;  // Filter params
  displayText: string; // Human-readable label
  timestamp: number;   // Unix timestamp
}
```

**Display text generation:** Combines specialty label, location parts (cities + state + zip), and health system into a readable string like `"Cardiology in Brooklyn, Queens, New York at NYU Langone"`.

**Deduplication:** If a search with identical params already exists, it is moved to the top with an updated timestamp instead of being added as a duplicate.

### Result Display Components

#### ProviderCard

**File:** `packages/frontend/src/components/ProviderCard.tsx`

A memoized card component that renders a single provider result with:

- **Avatar:** Initials in a gradient circle, with a verified checkmark for confidence >= 70%
- **Display name:** Cleaned via `cleanProviderName()` (strips license numbers, keeps valid credentials like MD, DO, NP, etc.) or `cleanOrganizationName()` (handles truncation)
- **Specialty:** Formatted via `getSpecialtyDisplay()`
- **Address:** Street + city/state/zip, formatted with `toAddressCase()` and `toTitleCase()`
- **Phone:** Formatted as `(XXX) XXX-XXXX`
- **Confidence score:** Color-coded badge (green >= 70%, yellow >= 50%, red < 50%)
- **Insurance preview:** Up to 3 accepted plans as green badges, with "+N more" overflow
- **"View Details" link:** Links to `/provider/{npi}`

**Custom memo comparison:** Only re-renders when specific fields change (npi, displayName, phone, address, confidence, planAcceptances count).

**Valid credentials set:** 80+ medical credentials recognized (MD, DO, PhD, NP, PA-C, LCSW, etc.).

#### ProviderCardSkeleton

**File:** `packages/frontend/src/components/ProviderCardSkeleton.tsx`

Shimmer-based loading skeletons with proper ARIA attributes (`role="status"`, `aria-label`, `aria-busy`). Multiple skeleton variants:

- `ProviderCardSkeleton` -- Individual card placeholder
- `SearchResultsSkeleton` -- Full search results page (header + disclaimer + N cards)
- `ProviderDetailSkeleton` -- Provider detail page
- `LocationDetailSkeleton` -- Location detail page
- `DropdownLoadingSkeleton` -- Dropdown options loading
- `ProviderCardSkeletonCompact` -- Compact card for listings

#### EmptyState

**File:** `packages/frontend/src/components/EmptyState.tsx`

Three empty state types:

| Type | Title | When Shown |
|------|-------|------------|
| `landing` | "Find Healthcare Providers" | Before first search |
| `no-results` | "No Providers Found" | Search returned 0 results |
| `no-results-locations` | "No Locations Found" | Location search with 0 results |

**Contextual suggestions:** When `no-results` is shown, actionable chips are generated based on which filters are active:

```typescript
if (specialty) suggestions.push({ label: 'Search all specialties', action: 'clear-specialty' });
if (cities)    suggestions.push({ label: 'Search entire state', action: 'clear-cities' });
if (healthSystem) suggestions.push({ label: 'All health systems', action: 'clear-health-system' });
if (insurancePlanId) suggestions.push({ label: 'All insurance plans', action: 'clear-insurance' });
```

Clicking a suggestion modifies the URL params and triggers a new search with the broadened filters.

### Mobile Filter Drawer

#### FilterButton

**File:** `packages/frontend/src/components/FilterButton.tsx`

A floating action button visible only on mobile (`md:hidden`), positioned at `bottom-20 right-4`. Shows a filter icon + "Filters" text, with a badge showing the active filter count.

#### FilterDrawer

**File:** `packages/frontend/src/components/FilterDrawer.tsx`

A bottom-sheet drawer for mobile with:

- **FocusTrap:** Uses `focus-trap-react` for accessibility
- **Backdrop:** Semi-transparent overlay, dismisses on click
- **Escape key:** Closes drawer
- **Body scroll lock:** `document.body.style.overflow = 'hidden'` while open
- **Sticky footer:** "Clear All" and "Apply Filters" buttons with bottom padding for the app's bottom navigation bar
- **Max height:** `85vh` to ensure the drawer never covers the full screen
- **Animation:** `animate-slide-up` transition

---

## API Layer

### API Client

**File:** `packages/frontend/src/lib/api.ts`

The API client is structured as namespaced objects:

```typescript
const api = {
  providers,  // .search(), .getByNpi(), .getCities(), .getPlans(), .getColocated()
  plans,      // .search(), .getGrouped(), .getIssuers(), .getPlanTypes(), .getById(), .getProviders()
  verify,     // .submit(), .vote(), .getStats(), .getRecent(), .getForPair()
  locations,  // .search(), .getHealthSystems(), .getById(), .getProviders(), .getStats()
};
```

**Search-specific call (`api.providers.search`):**

```typescript
providers.search(filters, page, limit)
```

- Handles `cities` as both `string[]` (new style) and `string` (legacy)
- Builds query string via `buildQueryString()`, which filters out undefined/null/empty values
- Calls `apiFetch<{ providers: ProviderDisplay[]; pagination: PaginationState }>('/providers/search?...')`

**Base URL:** `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'`

### Retry Logic

**File:** `packages/frontend/src/lib/api.ts` (continued)

`fetchWithRetry()` wraps native `fetch` with automatic retry for transient failures:

| Configuration | Value |
|---------------|-------|
| Max retries | 2 (3 total attempts) |
| Base delay | 1000ms |
| Backoff | Exponential (1s, 2s, 4s) |
| Retryable statuses | 429, 500, 502, 503, 504 |

**Retry-After header:** For 429 responses, the `Retry-After` header is parsed (supports both seconds and HTTP-date format) and used as the delay, capped at 30 seconds.

**Non-retryable:** AbortErrors (user cancelled), 4xx client errors (except 429).

**Rate limit toast:** When a 429 is received after exhausting retries, a toast notification is shown: `"Rate limit exceeded. Try again in {time}."` using `react-hot-toast`.

**`ApiError` class:** Structured error with `statusCode`, `code`, `details`, `retryAfter`, and convenience methods (`isRateLimited()`, `isRetryable()`, etc.).

---

## Backend Architecture

### Route Handler

**File:** `packages/backend/src/routes/providers.ts`

The search endpoint is `GET /api/v1/providers/search` with the following middleware chain:

```
searchTimeout (15s) --> searchRateLimiter (100/hr) --> asyncHandler(handler)
```

The handler:
1. Validates query params with Zod schema
2. Generates a normalized cache key
3. Checks cache (returns with `X-Cache: HIT` header on hit)
4. On cache miss, calls `searchProviders()`
5. Transforms results via `transformProvider()`
6. Caches results (only if providers.length > 0) with 5-minute TTL
7. Returns `{ success: true, data: { providers, pagination } }`

### Input Validation

**File:** `packages/backend/src/routes/providers.ts`

Zod schema for search query parameters:

```typescript
const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  cities: z.string().min(1).max(500).optional(),
  zipCode: z.string().min(3).max(10).optional(),
  specialty: z.string().min(1).max(200).optional(),
  specialtyCategory: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
}).merge(paginationSchema);
```

### Provider Service

**File:** `packages/backend/src/services/providerService.ts`

`searchProviders(params)` builds a Prisma `WHERE` clause using an `AND` array pattern, then executes `findMany` and `count` in parallel via `Promise.all`.

**Prisma include:** All related tables are eagerly loaded:

```typescript
export const PROVIDER_INCLUDE = {
  practice_locations: true,
  provider_taxonomies: true,
  provider_cms_details: true,
  provider_hospitals: true,
  provider_insurance: true,
  provider_medicare: true,
  providerPlanAcceptances: {
    include: {
      insurancePlan: true,
      location: { select: { id, address_line1, city, state, zip_code } },
    },
  },
};
```

### Name Parsing

**File:** `packages/backend/src/services/providerService.ts`

`parseNameSearch(nameInput)` processes the user's name query:

1. **Normalize:** Trim, lowercase, collapse whitespace
2. **Strip medical titles:** Removes 24+ title patterns from beginning, end, and comma-separated positions:
   ```
   dr., dr, doctor, md, m.d., do, d.o., np, n.p., pa, p.a., rn, r.n.,
   lpn, l.p.n., phd, ph.d., dds, d.d.s., dpm, d.p.m., od, o.d.,
   pharmd, pharm.d., mph, m.p.h., msw, m.s.w., lcsw, l.c.s.w.,
   lpc, l.p.c., psyd, psy.d.
   ```
3. **Clean punctuation:** Remove commas, periods, semicolons
4. **Split into terms:** Return structured result based on term count:

| Terms | Interpretation |
|-------|---------------|
| 1 term | Could match first, last, or organization name |
| 2 terms | `firstName=terms[0]`, `lastName=terms[1]` (also tries reversed) |
| 3+ terms | `firstName=terms[0]`, `lastName=terms[last]` |

### Name Search Conditions

`buildNameSearchConditions(nameInput)` creates an array of `OR` conditions for Prisma:

**Single term:**
- `firstName CONTAINS term` (case-insensitive)
- `lastName CONTAINS term` (case-insensitive)
- `organizationName CONTAINS term` (case-insensitive)

**Multiple terms with first/last identified:**
- `firstName CONTAINS first AND lastName CONTAINS last` (forward)
- `firstName CONTAINS last AND lastName CONTAINS first` (reversed)
- Each individual term (length >= 2) across all name fields
- All terms joined as organization name search

### Location Filtering

Location filters operate through the `practice_locations` relation using `some`:

```typescript
if (state || city || cities || zipCode) {
  const locationFilters = [];
  if (state) locationFilters.push({ state: state.toUpperCase() });
  if (zipCode) locationFilters.push({ zip_code: { startsWith: zipCode } });
  if (cities) {
    const cityArray = cities.split(',').map(c => c.trim()).filter(Boolean);
    locationFilters.push({
      OR: cityArray.map(cityName => ({
        city: { equals: cityName, mode: 'insensitive' }
      }))
    });
  } else if (city) {
    locationFilters.push({ city: { contains: city, mode: 'insensitive' } });
  }

  where.AND.push({
    practice_locations: {
      some: locationFilters.length === 1 ? locationFilters[0] : { AND: locationFilters }
    },
  });
}
```

**ZIP code matching:** Uses `startsWith` to allow partial ZIP code searches (e.g., "100" matches "10001", "10002", etc.).

**Multi-city:** Comma-separated cities are split and matched with `equals` (case-insensitive) via `OR`.

### Specialty Filtering

Searches across three fields with `OR`:

```typescript
if (specialty) {
  where.AND.push({
    OR: [
      { primary_specialty: { contains: specialty, mode: 'insensitive' } },
      { primary_taxonomy_code: { contains: specialty, mode: 'insensitive' } },
      { specialty_category: { contains: specialty, mode: 'insensitive' } },
    ]
  });
}
```

### Result Ordering

```typescript
orderBy: [
  { providerPlanAcceptances: { _count: 'desc' } },  // Most verified first
  { lastName: 'asc' },
  { firstName: 'asc' },
  { organizationName: 'asc' },
],
```

Providers with more plan verifications are ranked higher, providing a proxy for "most useful" results. Within the same verification count, results are sorted alphabetically.

### Pagination

**File:** `packages/backend/src/services/utils.ts`

```typescript
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function getPaginationValues(page = DEFAULT_PAGE, limit = DEFAULT_LIMIT) {
  const take = Math.min(limit, MAX_LIMIT);
  const skip = (page - 1) * take;
  return { take, skip, page };
}
```

Response includes standard pagination metadata:
```typescript
{ page, limit, total, totalPages: Math.ceil(total / take) }
```

### Response Transformation

`transformProvider(p)` converts the raw Prisma record into the `ProviderDisplay` API shape:

| Source | Destination |
|--------|-------------|
| `npi` | `id`, `npi` |
| `entityType` ('1'/'2') | `entityType` ('INDIVIDUAL'/'ORGANIZATION') |
| `firstName`, `lastName`, `credential` | `displayName` (via `getProviderDisplayName()`) |
| `practice_locations[primary]` | `addressLine1`, `city`, `state`, `zip`, `phone` |
| `primary_taxonomy_code` | `taxonomyCode` |
| `primary_specialty` | `taxonomyDescription` |
| `specialty_category` | `specialtyCategory` |
| `deactivation_date` | `npiStatus` ('ACTIVE'/'DEACTIVATED') |
| `providerPlanAcceptances` | `planAcceptances[]` (with nested plan and location) |

**Primary location selection:** `getPrimaryLocation()` prefers `address_type === 'practice'`, falls back to the first available location.

**Display name:** For organizations, returns `organizationName`. For individuals, joins `firstName` + `lastName`, appending credential if present.

---

## Caching

### Backend Search Cache

**File:** `packages/backend/src/utils/cache.ts`

**Dual-mode:** Redis (distributed) or in-memory (single-instance), with automatic fallback.

| Feature | Detail |
|---------|--------|
| Default TTL | 300 seconds (5 minutes) |
| Key prefix | `cache:search:` |
| Key format | `search:{state}:{city}:{specialty}:{page}:{limit}:{hash}` |
| Cache hit header | `X-Cache: HIT` |
| Cache miss header | `X-Cache: MISS` |
| Conditional caching | Only caches when `providers.length > 0` |
| Invalidation | `invalidateSearchCache()` clears all search entries (pattern delete) |
| Cleanup | Periodic (every 60s) removal of expired in-memory entries |
| Statistics | Tracks hits, misses, sets, deletes, size |

**Key normalization:** All string values are lowercased and trimmed. Additional params (cities, zipCode, healthSystem, name, npi, entityType, insurancePlanId) are hashed using a simple 32-bit hash function to keep key length manageable:

```typescript
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
```

**Redis operations:**
- `GET` for cache reads
- `SETEX` for writes with TTL
- `SCAN` + `DEL` for pattern deletes (safe for production vs. `KEYS`)

### Frontend Data Caches

Each dropdown data hook maintains its own module-level `Map` cache:

| Hook | Cache Key | TTL | Notes |
|------|-----------|-----|-------|
| `useCities` | `STATE` (uppercase) | 5 min | Includes pinned city ordering + NYC combo |
| `useHealthSystems` | `STATE:sorted_cities` | 5 min | Sorted cities for deterministic key |
| `useInsurancePlans` | `state:search` | 10 min | Plans change less frequently |

All three caches also use a `pendingRequests` map to deduplicate concurrent requests for the same parameters.

---

## Rate Limiting

**File:** `packages/backend/src/middleware/rateLimiter.ts`

**Search rate limiter:** 100 requests per hour per IP.

**Algorithm:** Sliding window (not fixed window). Tracks individual request timestamps instead of a counter, preventing burst attacks at window boundaries.

**Dual-mode:**

| Mode | When Used | State |
|------|-----------|-------|
| Redis | `REDIS_URL` configured | Shared across instances (uses sorted sets) |
| In-memory | No Redis | Per-process, single-instance only |

**Redis implementation:** Uses `MULTI` pipeline with `ZREMRANGEBYSCORE` (prune), `ZADD` (add), `ZCARD` (count), `EXPIRE` (auto-cleanup).

**Fail-open behavior:** If Redis becomes unavailable mid-request, the request is ALLOWED with `X-RateLimit-Status: degraded` header and a warning log. Availability is prioritized over strict rate limiting.

**Response headers:**

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests in window (100) |
| `X-RateLimit-Remaining` | Remaining requests |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds to wait (only on 429) |

**All configured limiters:**

| Limiter | Limit | Window | Applied To |
|---------|-------|--------|------------|
| `searchRateLimiter` | 100/hr | 1 hour | `GET /providers/search` |
| `defaultRateLimiter` | 200/hr | 1 hour | Other API routes |
| `verificationRateLimiter` | 10/hr | 1 hour | Verification submissions |
| `voteRateLimiter` | 10/hr | 1 hour | Vote endpoints |

---

## Request Timeout

**File:** `packages/backend/src/middleware/requestTimeout.ts`

The search endpoint uses a 15-second timeout. If the response is not sent within this window, a 408 status is returned:

```json
{
  "success": false,
  "error": {
    "message": "Request timed out",
    "code": "REQUEST_TIMEOUT",
    "statusCode": 408
  }
}
```

| Timeout | Duration | Applied To |
|---------|----------|------------|
| `searchTimeout` | 15 seconds | Search endpoints |
| `generalTimeout` | 30 seconds | General API routes |
| `adminTimeout` | 120 seconds | Admin endpoints |

The timer is cleared when the response finishes normally via `res.on('finish')`.

---

## Type Definitions

**File:** `packages/frontend/src/types/index.ts`

Key types used in the search flow:

```typescript
interface SearchFilters {
  state: string;
  city: string;
  cities: string[];
  specialty: string;
  name: string;
  npi: string;
  entityType: string;
  insurancePlanId: string;
  healthSystem: string;
  zipCode: string;
}

interface PaginationState {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

interface ProviderDisplay {
  id: string;
  npi: string;
  entityType: 'INDIVIDUAL' | 'ORGANIZATION';
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  credential: string | null;
  organizationName: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  taxonomyCode: string | null;
  taxonomyDescription: string | null;
  specialtyCategory: string | null;
  npiStatus: string;
  displayName: string;
  nppesLastSynced?: string | null;
  confidenceScore?: number | null;
  planAcceptances?: PlanAcceptancePreview[];
}
```

---

## Checklist

### Frontend Search
- [x] SearchForm with all filter inputs (specialty, state, city, health system, insurance plan, ZIP, name, NPI)
- [x] URL parameter sync (bi-directional via `useSearchUrlParams`)
- [x] Filter drawer for mobile with focus trap and scroll lock
- [x] Provider cards with confidence badge and insurance preview
- [x] Loading skeletons with ARIA attributes
- [x] Empty state with contextual suggestions (clear specialty, broaden location, etc.)
- [x] Pagination controls with ellipsis for large page counts
- [x] Error handling with retry (`ErrorMessage` component)
- [x] Recent searches (localStorage, max 5, deduplication)
- [x] Active filter chips with individual clear and clear-all
- [x] NYC All Boroughs special handling
- [x] Pinned/major cities per state in dropdown ordering

### Backend Search
- [x] Name parsing with 24+ medical title stripping
- [x] Multi-field name search (first/last forward+reversed, organization, individual terms)
- [x] All filter dimensions (state, city/cities, specialty, insurance plan, health system, entity type, ZIP)
- [x] Server-side pagination (skip/take with MAX_LIMIT=100)
- [x] Search result caching (5-min TTL, Redis or in-memory)
- [x] Rate limiting (100/hr, sliding window, dual-mode Redis/memory)
- [x] Response transformation to ProviderDisplay with plan acceptances
- [x] Request timeout (15 seconds)
- [x] Input validation (Zod schemas)
- [x] Result ordering (verification count desc, then alphabetical)

### Dropdown Data
- [x] Cities per state (dynamic, with module-level cache, 5-min TTL)
- [x] Insurance plans (grouped by carrier, 10-min TTL)
- [x] Health systems per state/city (dynamic, 5-min TTL)
- [x] NYC boroughs special handling with All Boroughs combo option
- [x] Pinned major cities for all 50 states + DC
- [x] Request deduplication via pending request tracking

### API Layer
- [x] Automatic retry with exponential backoff (max 2 retries)
- [x] Retry-After header parsing for 429 responses
- [x] AbortController support (request cancellation on new search)
- [x] Structured ApiError with convenience methods
- [x] Rate limit toast notification via react-hot-toast

### Missing / Future
- [ ] Full-text search (PostgreSQL `tsvector`) for better name matching
- [ ] Geolocation / proximity search
- [ ] Search result sorting options (relevance, distance, name) -- currently fixed ordering
- [ ] Saved searches (requires user accounts)
- [ ] Search analytics beyond PostHog (which providers are most searched)
- [ ] Autocomplete / type-ahead suggestions

---

## Questions to Ask

1. **Cache TTL:** Is the 5-minute cache TTL appropriate for search results? Verification submissions invalidate the search cache, but there could be stale windows between invalidation and new data.

2. **Full-text search:** The current `CONTAINS` (ILIKE) queries do not leverage PostgreSQL's full-text search capabilities (`tsvector`/`tsquery`). Should this be added for better name matching with ranking?

3. **Geolocation search:** Should proximity-based search be added? This would require storing lat/lng coordinates for practice locations and using PostGIS or a similar extension.

4. **Name parsing edge cases:** The current name parser handles "First Last", "Last First", and medical title stripping. Does it handle edge cases well?
   - Hyphenated names (e.g., "Garcia-Lopez")
   - Names with suffixes (e.g., "Smith Jr")
   - Multi-word last names (e.g., "De La Cruz")
   - Names with apostrophes (e.g., "O'Brien")

5. **Sorting options:** Should users be able to sort results by name, distance, or confidence score? Currently the ordering is fixed: most verifications first, then alphabetical.

6. **Result limit:** The `MAX_LIMIT` of 100 per page may be too large for some queries. Should there be query complexity limits for expensive filter combinations (e.g., multi-city + specialty + name search)?

7. **Cache key collisions:** The `simpleHash()` function uses a basic 32-bit hash. For high-traffic scenarios, is the collision probability acceptable?
