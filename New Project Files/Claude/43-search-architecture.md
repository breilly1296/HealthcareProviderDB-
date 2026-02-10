# Search Architecture (End-to-End)

## Overview

Search is the primary user interaction in VerifyMyProvider. This document traces the full lifecycle of a search query from the frontend input through backend processing and back to rendered results.

---

## Frontend Flow

```
User types in search form
    |
    v
useSearchForm (manages form state + submission)
    |
    v
useFilterState (manages all active filter values)
    |
    v
useSearchUrlParams (bi-directional URL sync)
    |   - Reads filters from URL on page load
    |   - Writes filters to URL on change
    |
    v
useSearchExecution (orchestrates search trigger + lifecycle)
    |
    v
providerApi.search(filters)
    |
    v
apiFetch (retry logic, rate limit handling, abort support)
    |
    v
HTTP GET /providers/search?...query params
    |
    v
Backend
```

### URL Synchronization

`useSearchUrlParams` provides **bi-directional sync** between filter state and the browser URL:

- **URL to State:** On page load or back/forward navigation, URL query parameters are parsed into filter state. This makes search results bookmarkable and shareable.
- **State to URL:** When the user changes filters, the URL is updated (via `router.push` or `router.replace`) to reflect the current filter set without a full page reload.

---

## Search Filters

| Filter | Source | Type | Notes |
|--------|--------|------|-------|
| `state` | Static list | Dropdown | US state abbreviations |
| `city` | `useCities(state)` | Dynamic dropdown | Loaded when state is selected; includes NYC boroughs |
| `specialty` | Static list | Dropdown | Provider specialty taxonomy |
| `name` | User input | Free text | Parsed for name components (see backend parsing) |
| `healthSystem` | `useHealthSystems(state?, city?)` | Dynamic dropdown | Filtered by state/city context |
| `insurancePlanId` | `useInsurancePlans(filters)` | Dynamic dropdown | Insurance plan selection |
| `entityType` | Static | Toggle/Dropdown | `Individual` or `Organization` |

### Dynamic Filter Loading

- **Cities:** Loaded per-state via `useCities`. When state is NY and context is NYC, returns the five boroughs. Supports prefetching.
- **Health Systems:** Loaded per-state/city via `useHealthSystems`. Supports prefetching.
- **Insurance Plans:** Loaded per-filter criteria via `useInsurancePlans`. Supports cache clearing when plan data changes.

---

## Backend Flow

```
GET /providers/search?state=NY&city=Manhattan&name=Smith&...
    |
    v
searchRateLimiter (100 requests/hour per client)
    |
    v
Cache check
    |   - Key: normalized from query params
    |   - TTL: 5 minutes
    |   - Response header: X-Cache: HIT or MISS
    |
    v  (cache MISS)
providerService.searchProviders(filters)
    |
    +-- parseNameSearch(name)
    +-- buildNameSearchConditions(parsed)
    +-- Build Prisma where clause
    +-- Execute query with sorting + pagination
    +-- transformProvider(each result)
    |
    v
Cache result (5-min TTL)
    |
    v
Response: { data: ProviderDisplay[], page, limit, total, totalPages }
```

### Rate Limiting

- **Limit:** 100 requests per hour per client
- **Middleware:** `searchRateLimiter` applied to `GET /providers/search`
- Returns HTTP `429 Too Many Requests` when exceeded, with `Retry-After` header

### Server-Side Caching

- **Key generation:** Query parameters are normalized (sorted, lowercased) to produce a deterministic cache key
- **TTL:** 5 minutes
- **Cache header:** `X-Cache: HIT` or `X-Cache: MISS` sent in the response for debugging
- On cache HIT, the cached response is returned immediately without hitting the database

---

## Name Search Parsing (`parseNameSearch`)

The backend parses free-text name input to handle various formats:

### Title Stripping

Strips common medical credential suffixes before parsing:
- `MD`, `DO`, `NP`, `PA` (and variants with periods like `M.D.`, `D.O.`)

### Name Splitting

| Input Format | Parsed Result |
|--------------|---------------|
| `Smith` | `{ lastName: "Smith" }` |
| `John Smith` | `{ firstName: "John", lastName: "Smith" }` |
| `Smith, John` | `{ firstName: "John", lastName: "Smith" }` |
| `John` | `{ firstName: "John" }` (single word treated as first if short) |

### `buildNameSearchConditions`

Generates Prisma `where` conditions from the parsed name:

1. **First + Last name:** Case-insensitive `contains` on both `firstName` and `lastName` fields
2. **Organization name:** Case-insensitive `contains` on the `organizationName` field (for entity type 2)
3. **Full name:** Case-insensitive `contains` on a computed full name field

All name conditions use **case-insensitive `contains`** matching (Prisma `mode: 'insensitive'`).

---

## Entity Type Mapping

| Frontend Value | Database Code | Description |
|----------------|---------------|-------------|
| `Individual` | `1` | Individual provider (physician, NP, etc.) |
| `Organization` | `2` | Organizational provider (hospital, clinic, etc.) |

---

## Filtering

The Prisma `where` clause is built incrementally based on which filters are present:

| Filter | Prisma Condition | Notes |
|--------|-----------------|-------|
| `state` | `state: { equals: state }` | Direct match |
| `city` | `city: { in: cities }` | Array match (supports multiple cities, e.g., NYC boroughs) |
| `zip` | `zip: { equals: zip }` | Direct match |
| `specialty` | `specialty: { contains: specialty, mode: 'insensitive' }` | Partial match |
| `healthSystem` | Via `practice_locations` relation | Joined through practice locations |
| `insurancePlanId` | Via `providerAcceptances` relation | Joined through plan acceptance records |
| `npi` | `npi: { equals: npi }` | Exact NPI match |
| `name` | See name search conditions above | Multiple conditions OR'd together |

---

## Sorting

Results are sorted by:

1. `lastName` ASC (alphabetical by last name)
2. `firstName` ASC (alphabetical by first name, as tiebreaker)

No user-configurable sort options are currently exposed.

---

## Pagination

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | 1 | Current page number (1-indexed) |
| `limit` | 20 | Results per page |

### Response Shape

```typescript
{
  data: ProviderDisplay[],
  page: number,
  limit: number,
  total: number,       // Total matching providers
  totalPages: number   // Computed: Math.ceil(total / limit)
}
```

### Prisma Implementation

```typescript
const providers = await prisma.provider.findMany({
  where: whereClause,
  orderBy: [
    { lastName: 'asc' },
    { firstName: 'asc' },
  ],
  skip: (page - 1) * limit,
  take: limit,
  include: { /* relations */ },
});
```

---

## Response Transformation (`transformProvider`)

Each Prisma result is transformed from the raw database model into a `ProviderDisplay` object:

- **Display name:** Built from `firstName`, `middleName`, `lastName`, `credential` for individuals; `organizationName` for organizations
- **Primary location:** Extracted from `practice_locations` (first or designated primary)
- **Address formatting:** Components assembled into a display-ready string (`street, city, state zip`)
- **Plan acceptances:** Included if requested, transformed for frontend display

---

## Frontend Results Rendering

```
React Query caches response
    |
    v
Search Results Page
    |
    +-- Results Header (showing "X providers found")
    |
    +-- ProviderCard[] (one per result)
    |     +-- Provider Name + Credentials
    |     +-- Specialty
    |     +-- Location
    |     +-- Confidence Badge
    |     +-- CompareCheckbox (add to comparison)
    |
    +-- Loading Skeletons (shown during fetch)
    |
    +-- Empty State (shown when no results)
    |     +-- Contextual suggestions based on active filters
    |     +-- "Try broadening your search" guidance
    |
    +-- Pagination Controls
    |     +-- Page numbers
    |     +-- Previous / Next buttons
    |
    +-- Recent Searches (from useRecentSearches)
```

### React Query Caching

- Search results are cached using `providerKeys.search(filters)` as the query key
- Changing any filter value produces a new cache key, triggering a fresh query
- Previous results remain cached and are served instantly if the user returns to the same filter combination

### Empty State

When no results match the current filters, contextual suggestions are displayed:
- Suggests removing the most restrictive filter
- Suggests broadening location (e.g., search statewide instead of by city)
- Suggests alternative spellings or name formats
