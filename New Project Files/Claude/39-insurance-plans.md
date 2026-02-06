# Insurance Plans Feature Review

**Last Updated:** 2026-02-06

## Feature Overview

The insurance plans feature connects providers to insurance networks they accept, supporting search, browsing, verification, and confidence-scored acceptance tracking. The implementation spans backend (6 API endpoints, service layer, data pipeline), frontend (insurance page, provider detail plans, card upload, hooks), and shared types.

## Database Schema

### InsurancePlan (`insurance_plans`) -- VERIFIED in schema.prisma

| Field | Type | Notes |
|-------|------|-------|
| `planId` | VarChar(50) PK | `@map("plan_id")` |
| `planName` | VarChar(200) | Nullable |
| `issuerName` | VarChar(200) | Nullable |
| `planType` | VarChar(20) | Nullable (HMO, PPO, etc.) |
| `state` | VarChar(2) | Nullable |
| `carrier` | VarChar(100) | Nullable, indexed |
| `planVariant` | VarChar(50) | Nullable, indexed |
| `rawName` | VarChar(500) | Original scraped name |
| `sourceHealthSystem` | VarChar(200) | Hospital source |
| `providerCount` | Int (default 0) | Denormalized count |
| `carrierId` | Int | Nullable, indexed |
| `healthSystemId` | Int | Nullable, indexed |
| `createdAt` | Timestamptz | Default now() |

**Indexes**: carrier, carrierId, healthSystemId, planVariant

**Relations**: `providerAcceptances` (ProviderPlanAcceptance[]), `verificationLogs` (VerificationLog[])

### ProviderPlanAcceptance (`provider_plan_acceptance`) -- VERIFIED

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int PK | Auto-increment |
| `providerNpi` | VarChar(10) | FK to providers, nullable |
| `planId` | VarChar(50) | FK to insurance_plans, nullable |
| `locationId` | Int | FK to practice_locations, nullable |
| `acceptanceStatus` | VarChar(20) | Default "UNKNOWN" |
| `confidenceScore` | Int | Default 0, range 0-100 |
| `lastVerified` | Timestamptz | Nullable |
| `verificationCount` | Int | Default 0 |
| `expiresAt` | Timestamptz | 6-month TTL |
| `createdAt` | Timestamptz | Default now() |
| `updatedAt` | Timestamptz | Default now() |

**Unique constraints**: Managed via raw SQL partial indexes:
- `idx_ppa_npi_plan_location`: UNIQUE(npi, plan_id, location_id) WHERE location_id IS NOT NULL
- `idx_ppa_npi_plan_legacy`: UNIQUE(npi, plan_id) WHERE location_id IS NULL

**Indexes**: acceptanceStatus, confidenceScore, expiresAt, lastVerified, locationId

**Key finding**: The schema supports **location-specific** plan acceptance (a provider may accept a plan at one office but not another), which is more granular than described in the prompt.

## Backend API Endpoints -- VERIFIED

### Plan Search & Browsing

**GET `/api/v1/plans/search`** -- VERIFIED in `plans.ts`
- Zod validation: issuerName, planType, search, state (2-char uppercase), page, limit
- Rate limit: `searchRateLimiter` (100/hr)
- Service: `searchPlans()` -- searches across carrier, issuerName, planName, rawName, planId via OR clause
- Pagination with `buildPaginationMeta()`

**GET `/api/v1/plans/grouped`** -- VERIFIED
- Zod validation: search, state
- Rate limit: `defaultRateLimiter` (200/hr)
- Service: `getGroupedPlans()` -- groups plans by carrier for dropdown UI
- Returns `{ carriers: [...], totalPlans: number }`

**GET `/api/v1/plans/meta/issuers`** -- VERIFIED
- Rate limit: `defaultRateLimiter` (200/hr)
- Service: `getIssuers()` -- uses `getDistinctField('issuerName')`
- Optional state filter

**GET `/api/v1/plans/meta/types`** -- VERIFIED
- Rate limit: `defaultRateLimiter` (200/hr)
- Service: `getPlanTypes()` -- uses `getDistinctField('planType')`
- Optional state and issuerName filters

**GET `/api/v1/plans/:planId/providers`** -- VERIFIED
- Rate limit: `searchRateLimiter` (100/hr)
- Service: `getProvidersForPlan()` -- returns providers with ACCEPTED status
- Includes practice location (first practice address), confidence score, verification count
- Maps provider data to display format with `displayName` computation

**GET `/api/v1/plans/:planId`** -- VERIFIED
- Rate limit: `defaultRateLimiter` (200/hr)
- Service: `getPlanByPlanId()` -- includes `_count.providerAcceptances`
- Returns plan metadata with provider count (uses stored `providerCount` with `_count` fallback)

### Route Ordering Note
The `/:planId/providers` route is correctly defined BEFORE `/:planId` to avoid Express route parameter conflicts.

## Plan Service (`planService.ts`) -- VERIFIED

**Key patterns**:
- Uses a generic `getDistinctField()` helper for deduplicating field value queries (carrier, issuerName, planType, etc.)
- Case-insensitive search across multiple fields via Prisma `contains` with `mode: 'insensitive'`
- Pagination via `getPaginationValues()` utility
- `getProvidersForPlan()` filters on `acceptanceStatus: 'ACCEPTED'` and includes provider relations

**Additional service functions** not exposed as API endpoints:
- `getCarriers(options)` -- distinct carrier names
- `getPlanVariants(options)` -- distinct plan variants
- `getSourceHealthSystems()` -- distinct health system sources

## Plan Parser (`insurancePlanParser.ts`) -- VERIFIED

**Purpose**: Normalizes raw insurance plan names (scraped from hospital websites) into structured carrier/variant fields.

**Features**:
- `CARRIER_ALIASES`: 30+ carrier name aliases mapping to canonical names (e.g., "bcbs" -> "Blue Cross Blue Shield", "uhc" -> "UnitedHealthcare")
- `VARIANT_PATTERNS`: 20+ regex patterns for plan types (Medicare Advantage, PPO, HMO, etc.)
- `parseInsurancePlan(rawName)`: Extracts carrier + variant from raw name
- `generatePlanId(parsed)`: Creates unique 50-char ID from carrier slug + variant slug
- `parseInsurancePlans(rawNames)`: Deduplicates parsed plans
- `parsePlanList(planListString)`: Splits semicolon/comma-separated lists and parses each

**Carrier matching**: Uses longest-match-first strategy (sorted by alias length descending) to handle overlapping names (e.g., "Empire Blue Cross" matches before "Blue Cross").

## Validation Schemas (`commonSchemas.ts`) -- VERIFIED

| Schema | Used In | Validation |
|--------|---------|------------|
| `paginationSchema` | plans, providers, verify, locations | page >= 1, limit 1-100, defaults 1/20 |
| `planIdParamSchema` | plans, verify | string 1-50 chars |
| `stateQuerySchema` | plans, providers, locations | 2-char uppercase string, optional |
| `npiParamSchema` | providers, verify | exactly 10 digits |

All schemas use Zod with `z.coerce` for query parameter type coercion.

## Frontend Integration -- VERIFIED

### Insurance Page (`/insurance`)
- Located at `packages/frontend/src/app/insurance/page.tsx`
- Server component with metadata (title, description)
- Renders `InsuranceCardUploader` component
- Includes privacy notice ("Your insurance card image is processed securely and is not stored")
- Tips section for best photo results
- Breadcrumb navigation

### Insurance Card Uploader (`InsuranceCardUploader.tsx`)
- Located at `packages/frontend/src/components/InsuranceCardUploader.tsx`
- Uses `@anthropic-ai/sdk` for Claude AI extraction
- Processes uploaded card images to extract plan information

### Provider Plans Section (`ProviderPlansSection.tsx`)
- Located at `packages/frontend/src/components/provider-detail/ProviderPlansSection.tsx`
- Groups accepted plans by carrier
- Collapsible carrier sections with expand/collapse all
- Search filter for 5+ plans
- Each plan shows:
  - Plan name and type
  - New patient acceptance status
  - Confidence score badge with breakdown
  - Verification button
  - Freshness warning with re-verification prompt

### Insurance List (`InsuranceList.tsx`)
- Located at `packages/frontend/src/components/provider-detail/InsuranceList.tsx`
- Complex component (~844 lines) handling plan display, grouping, search, and verification
- Features:
  - Carrier family grouping (18 known carrier patterns)
  - Data freshness badges (green < 30d, yellow < 90d, red >= 90d)
  - Status icons (accepted, not_accepted, pending, unknown)
  - Location-based filtering for multi-location providers
  - Inline verification modal with honeypot field
  - Recently-verified state tracking
  - Collapsible "Other Plans" section for single-plan carriers

### API Client (`api.ts`) -- VERIFIED

`plans` namespace methods:
| Method | Endpoint | Verified |
|--------|----------|----------|
| `plans.search(params)` | GET /plans/search | YES |
| `plans.getGrouped(params)` | GET /plans/grouped | YES |
| `plans.getGroupedPlans(params)` | GET /plans/grouped (legacy alias) | YES |
| `plans.getIssuers(state)` | GET /plans/meta/issuers | YES |
| `plans.getPlanTypes(params)` | GET /plans/meta/plan-types | YES |
| `plans.getById(planId)` | GET /plans/:planId | YES |
| `plans.getProviders(planId, params)` | GET /plans/:planId/providers | YES |

**Note**: `planApi` export was removed ("planApi removed - unused" comment in api.ts). Plans are accessed via `api.plans.*`.

### React Hooks -- VERIFIED

**`useInsurancePlans`** (`hooks/useInsurancePlans.ts`):
- Fetches grouped plans via `api.plans.getGrouped()`
- Module-level cache with 10-minute TTL
- Deduplicates in-flight requests
- Returns: `groupedPlans`, `allPlans` (flattened), `selectOptions` (for dropdowns), `findPlan()`, `refetch()`
- Race condition handling via `currentParamsRef`

**`useHealthSystems`** (`hooks/useHealthSystems.ts`):
- Fetches health systems for a state/cities combination
- Module-level cache with 5-minute TTL
- Same deduplication and race condition patterns
- Returns: `healthSystems`, `isLoading`, `error`, `refetch()`
- Supports prefetching via `prefetchHealthSystems()`

## Shared Types -- VERIFIED

### InsurancePlan (`types/insurance-plan.ts`)
- Full interface with carrier info, plan details, coverage area, plan year, data source
- `InsurancePlanWithRelations` extends with `providerCount`
- Search filters: carrierName, planType, metalLevel, marketType, state, planYear, isActive
- Search result: paginated with plans array

### ProviderPlanAcceptance (`types/provider-plan-acceptance.ts`)
- Full interface with acceptance status, confidence scoring, TTL
- `ConfidenceFactors`: dataSourceScore (0-25), recencyScore (0-30), verificationScore (0-25), agreementScore (0-20)
- `ConfidenceMetadata`: freshness tracking with research notes
- `getConfidenceLevel()`: Maps score to VERY_HIGH/HIGH/MEDIUM/LOW/VERY_LOW with verification count threshold (3 required for HIGH+)
- Research citation: Mortensen et al. (2015) and Ndumele et al. (2018)

### Enums (`types/enums.ts`)
- `PlanType`: HMO, PPO, EPO, POS, HDHP, MEDICARE_ADVANTAGE, MEDICAID, OTHER
- `AcceptanceStatus`: ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN
- `MetalLevel`: BRONZE, SILVER, GOLD, PLATINUM, CATASTROPHIC
- `MarketType`: INDIVIDUAL, SMALL_GROUP, LARGE_GROUP, MEDICARE, MEDICAID

## Checklist Verification

### Database
- [x] InsurancePlan model with all fields -- VERIFIED in schema.prisma (12 fields)
- [x] ProviderPlanAcceptance with unique constraint on (npi, planId) -- VERIFIED via partial indexes
- [x] Location-specific acceptance support -- VERIFIED: `locationId` field with partial unique index
- [x] Confidence scoring on acceptance records -- VERIFIED: `confidenceScore` field (0-100)
- [x] TTL via expiresAt field -- VERIFIED: 6-month TTL computed in `getExpirationDate()`
- [x] Indexes on carrier, carrierId, healthSystemId, planVariant -- VERIFIED
- [x] Provider count denormalized on plan -- VERIFIED: `providerCount` with `_count` fallback

### Backend API
- [x] Plan search with filters -- VERIFIED: issuerName, planType, search, state
- [x] Grouped plans by carrier -- VERIFIED: `/plans/grouped`
- [x] Issuer metadata endpoint -- VERIFIED: `/plans/meta/issuers`
- [x] Plan type metadata endpoint -- VERIFIED: `/plans/meta/types`
- [x] Providers-for-plan with pagination -- VERIFIED: `/:planId/providers`
- [x] Plan detail with provider count -- VERIFIED: `/:planId`
- [x] Zod validation on all inputs -- VERIFIED: all routes use schema.parse()
- [x] Rate limiting on all endpoints -- VERIFIED: searchRateLimiter or defaultRateLimiter

### Frontend
- [x] Insurance browser page -- VERIFIED: `/insurance` with card uploader
- [x] Plan search hooks -- VERIFIED: `useInsurancePlans` with caching
- [x] Provider detail plans section -- VERIFIED: `ProviderPlansSection` with carrier grouping
- [x] Insurance card upload with Claude extraction -- VERIFIED: `InsuranceCardUploader` using `@anthropic-ai/sdk`
- [x] API client methods for all plan endpoints -- VERIFIED: 7 methods in `api.plans`
- [x] Insurance list with verification modal -- VERIFIED: `InsuranceList` with inline verification

### Data Pipeline
- [x] Import script exists -- VERIFIED: `importInsurancePlans.ts` found
- [x] Plan parser/normalizer exists -- VERIFIED: `insurancePlanParser.ts` with carrier aliases and variant patterns
- [ ] Automated periodic import not configured
- [ ] Plan data freshness tracking

## Questions Answered

### 1. How frequently should plan data be refreshed?
The current 6-month TTL on ProviderPlanAcceptance records provides a reasonable baseline based on 12% annual provider turnover research. However, plan data itself (the InsurancePlan records) has no TTL or freshness tracking. Insurance plan offerings change annually (typically during open enrollment). **Recommendation**: Refresh plan data annually, ideally before open enrollment periods, and add a `lastUpdated` field to InsurancePlan.

### 2. Should plan search results be cached like provider search results?
The frontend already caches grouped plans with a **10-minute TTL** in `useInsurancePlans.ts`. The backend uses the `cache` utility for some endpoints (admin uses `cacheClear`). Adding server-side caching for plan search would be beneficial since plan data changes infrequently. The `/plans/meta/issuers` and `/plans/meta/types` responses are ideal caching candidates (change only when new plans are imported).

### 3. How are carrier IDs and health system IDs assigned during import?
Based on the schema, `carrierId` (Int) and `healthSystemId` (Int) are nullable fields on InsurancePlan. The `insurancePlanParser.ts` does not assign these IDs -- it only extracts carrier name and variant from raw plan names. The IDs appear to be assigned during the import pipeline (`importInsurancePlans.ts`) which was not fully reviewed, but the parser generates `planId` via `generatePlanId()` using slugified carrier + variant. **The assignment mechanism for carrierId and healthSystemId would need further investigation of the import script.**

### 4. Should there be a plan comparison feature?
Not currently implemented. The frontend has a `CompareProvider` context but it compares providers, not plans. A plan comparison feature would be useful for users choosing between insurance plans, showing:
- Which providers accept each plan
- Coverage area differences
- Plan type (HMO vs PPO) implications
- **Recommendation**: This would be a valuable feature but is lower priority than core verification functionality.

### 5. How should we handle plans with no providers linked?
Currently, `getProvidersForPlan()` returns an empty providers array (with total: 0) for plans with no acceptances. The `providerCount` denormalized field defaults to 0. The `getPlanByPlanId()` function returns both `providerCount` (stored) and `_count.providerAcceptances` (computed). Plans with zero providers are still searchable and visible. **Recommendation**: Consider adding a filter option to hide plans with zero providers in search results, or display a "No verified providers yet" message with a CTA to submit the first verification.

## Issues

1. **Shared type mismatch**: The shared `InsurancePlan` interface has fields not in the database schema (e.g., `id`, `carrierName`, `metalLevel`, `marketType`, `statesCovered`, `serviceArea`, `planYear`, `effectiveDate`, `terminationDate`, `isActive`). The database model has simpler fields (carrier, planType, state). These types are out of sync.
2. **No server-side caching**: Plan search and metadata endpoints query the database on every request. Plan data changes infrequently and could benefit from Redis-based caching.
3. **providerCount staleness**: The denormalized `providerCount` on InsurancePlan can become stale when acceptances are added/removed. No mechanism refreshes this count.
4. **API route mismatch**: Frontend calls `/plans/meta/plan-types` but backend defines `/plans/meta/types`. This would cause 404 errors.
5. **No plan freshness tracking**: InsurancePlan records have `createdAt` but no `updatedAt` or `lastImported` field to track data freshness.

## Recommendations

1. **Align shared types with database schema**: Update `packages/shared/src/types/insurance-plan.ts` to match the actual database model, or clearly separate "database types" from "API response types".
2. **Fix API route mismatch**: Either rename the backend route from `/meta/types` to `/meta/plan-types` or update the frontend API client to use `/meta/types`.
3. **Add server-side caching for metadata**: Cache `/plans/meta/issuers` and `/plans/meta/types` responses in Redis with a 1-hour TTL, cleared when plans are imported.
4. **Add providerCount refresh**: Create an admin endpoint or scheduled job to recalculate `providerCount` on InsurancePlan based on current ProviderPlanAcceptance counts.
5. **Add plan data freshness tracking**: Add `lastImported` or `updatedAt` field to InsurancePlan to track when plan data was last refreshed, enabling freshness warnings in the UI.
