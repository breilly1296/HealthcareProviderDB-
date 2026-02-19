# Insurance Plans Feature Review

**Generated:** 2026-02-18
**Prompt:** `prompts/39-insurance-plans.md`
**Status:** Feature-Complete -- Full CRUD with Confidence Scoring and TTL

---

## Files Reviewed

| File | Path | Lines | Status |
|------|------|-------|--------|
| plans.ts (routes) | `packages/backend/src/routes/plans.ts` | 198 | Verified |
| planService.ts | `packages/backend/src/services/planService.ts` | 377 | Verified |
| schema.prisma | `packages/backend/prisma/schema.prisma` | 459 | Verified (InsurancePlan, ProviderPlanAcceptance) |
| commonSchemas.ts | `packages/backend/src/schemas/commonSchemas.ts` | Referenced | Used for planIdParamSchema, stateQuerySchema, paginationSchema |
| responseHelpers.ts | `packages/backend/src/utils/responseHelpers.ts` | 62 | Verified |

---

## Database Schema

### InsurancePlan Model -- Verified

```prisma
model InsurancePlan {
  planId              String    @id @map("plan_id") @db.VarChar(50)
  planName            String?   @map("plan_name") @db.VarChar(200)
  issuerName          String?   @map("issuer_name") @db.VarChar(200)
  planType            String?   @map("plan_type") @db.VarChar(20)
  state               String?   @db.VarChar(2)
  carrier             String?   @db.VarChar(100)
  planVariant         String?   @map("plan_variant") @db.VarChar(50)
  rawName             String?   @map("raw_name") @db.VarChar(500)
  sourceHealthSystem  String?   @map("source_health_system") @db.VarChar(200)
  providerCount       Int       @default(0) @map("provider_count")
  carrierId           Int?      @map("carrier_id")
  healthSystemId      Int?      @map("health_system_id")
  createdAt           DateTime? @default(now())
}
```

**Indexes confirmed:**
- `@@index([carrier])` -- carrier lookup
- `@@index([carrierId])` -- carrier ID join
- `@@index([healthSystemId])` -- health system join
- `@@index([planVariant])` -- plan variant filter
- `@@index([state, carrier])` -- compound index for state+carrier queries

**Key observations:**
- `providerCount` is denormalized (stored on the plan) with a `_count.providerAcceptances` fallback in `getPlanByPlanId()`. This avoids expensive joins on high-traffic reads.
- `rawName` preserves the original plan name before normalization, enabling future re-parsing.
- `sourceHealthSystem` tracks which health system sourced the plan data.
- `carrierId` and `healthSystemId` suggest foreign key relationships to carrier/health system lookup tables (not defined in the reviewed schema excerpt).

### ProviderPlanAcceptance Model -- Verified

```prisma
model ProviderPlanAcceptance {
  id                Int       @id @default(autoincrement())
  providerNpi       String?   @map("npi") @db.VarChar(10)
  planId            String?   @map("plan_id") @db.VarChar(50)
  acceptanceStatus  String    @default("UNKNOWN") @map("acceptance_status") @db.VarChar(20)
  confidenceScore   Int       @default(0) @map("confidence_score")
  lastVerified      DateTime? @map("last_verified")
  verificationCount Int       @default(0) @map("verification_count")
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @default(now())
  expiresAt         DateTime? @map("expires_at")
  locationId        Int?      @map("location_id")
}
```

**Indexes confirmed:**
- `@@index([acceptanceStatus])` -- status filtering
- `@@index([confidenceScore])` -- confidence sorting
- `@@index([expiresAt])` -- TTL cleanup queries
- `@@index([lastVerified])` -- freshness queries
- `@@index([locationId])` -- location-specific lookups
- `@@index([planId, acceptanceStatus])` -- plan+status compound filter
- `@@index([providerNpi, acceptanceStatus])` -- provider+status compound filter

**Key observations:**
- `locationId` enables location-specific plan acceptance (a provider may accept a plan at one office but not another)
- `expiresAt` implements 6-month TTL for data freshness
- No unique constraint on `(providerNpi, planId)` is visible, but the code uses `findFirst` with these fields, suggesting the uniqueness is enforced at the application level or via a separate constraint not shown in this excerpt
- `confidenceScore` is an integer 0-100, updated by the consensus algorithm in `verificationService.ts`

---

## API Endpoints -- All 6 Verified

### Endpoint 1: GET /api/v1/plans/search

**Purpose:** Search insurance plans with multiple filters
**Rate limit:** `searchRateLimiter` (100/hour)

**Zod validation schema:**
```typescript
const searchQuerySchema = z.object({
  issuerName: z.string().min(1).max(200).optional(),
  planType: z.string().min(1).max(20).optional(),
  search: z.string().min(1).max(200).optional(),
  state: z.string().length(2).toUpperCase().optional(),
}).merge(paginationSchema);
```

**Service layer (`searchPlans`):**
- Builds dynamic Prisma `where` clause from optional filters
- `search` parameter searches across 5 fields: `carrier`, `issuerName`, `planName`, `rawName`, `planId` (using case-insensitive `contains`)
- Parallel execution of `findMany` and `count` via `Promise.all()`
- Results ordered by `carrier ASC`, then `planName ASC`
- Returns `{ plans, total, page, limit, totalPages }`

---

### Endpoint 2: GET /api/v1/plans/grouped

**Purpose:** Plans grouped by carrier for dropdown UI
**Rate limit:** `defaultRateLimiter` (200/hour)

**Zod validation:** Inline schema for `search` and `state` params.

**Service layer (`getGroupedPlans`):**
- Queries all plans where `carrier IS NOT NULL`
- Groups results into a `Map<string, Plan[]>` by carrier name
- Returns `{ carriers: [{ carrier, plans: [{ planId, planName, planType }] }], totalPlans }`
- Useful for building cascading dropdown selectors (select carrier, then plan)

---

### Endpoint 3: GET /api/v1/plans/meta/issuers

**Purpose:** List unique insurance issuers
**Rate limit:** `defaultRateLimiter` (200/hour)

**Service layer (`getIssuers`):**
- Uses the generic `getDistinctField('issuerName', options)` helper
- Optional `state` filter
- Returns array of issuer name strings

---

### Endpoint 4: GET /api/v1/plans/meta/types

**Purpose:** List available plan types (HMO, PPO, EPO, etc.)
**Rate limit:** `defaultRateLimiter` (200/hour)

**Service layer (`getPlanTypes`):**
- Uses `getDistinctField('planType', options)`
- Optional `state` and `issuerName` filters
- Returns array of plan type strings

---

### Endpoint 5: GET /api/v1/plans/:planId/providers

**Purpose:** Get providers who accept a specific plan
**Rate limit:** `searchRateLimiter` (100/hour)

**Route placement note:** This route is defined BEFORE `/:planId` to prevent Express from matching `providers` as a planId.

**Service layer (`getProvidersForPlan`):**
- Verifies plan exists first
- Queries `ProviderPlanAcceptance` where `acceptanceStatus = 'ACCEPTED'` and `provider IS NOT NULL`
- Ordered by `confidenceScore DESC` (highest confidence first)
- Includes provider details (name, specialty, entityType) and first practice location (city, state, phone)
- Includes location-specific acceptance data
- Returns enriched provider objects with `displayName`, `confidenceScore`, `lastVerified`, `verificationCount`

**Response format:** Maps internal data to a provider-like structure with `displayName` generated by `getProviderDisplayName()`.

---

### Endpoint 6: GET /api/v1/plans/:planId

**Purpose:** Get plan details by ID
**Rate limit:** `defaultRateLimiter` (200/hour)

**Service layer (`getPlanByPlanId`):**
- Uses `findUnique` with `_count.providerAcceptances` include
- Falls back to `_count` if `providerCount` is 0 (handles pre-denormalization records)
- Returns plan metadata plus provider count

---

## Service Layer Architecture

### Generic Helper Pattern

The `planService.ts` uses a well-designed generic helper for distinct field queries:

```typescript
async function getDistinctField(
  field: DistinctableField,
  options: DistinctFieldOptions = {}
): Promise<string[]>
```

This single function powers `getCarriers()`, `getPlanVariants()`, `getSourceHealthSystems()`, `getIssuers()`, and `getPlanTypes()` -- eliminating code duplication.

**Available distinct field queries:**

| Function | Field | Optional Filters |
|----------|-------|-----------------|
| `getCarriers()` | `carrier` | state, sourceHealthSystem |
| `getPlanVariants()` | `planVariant` | state, carrier |
| `getSourceHealthSystems()` | `sourceHealthSystem` | none |
| `getIssuers()` | `issuerName` | state |
| `getPlanTypes()` | `planType` | state, issuerName |

Note: `getCarriers()`, `getPlanVariants()`, and `getSourceHealthSystems()` are defined in the service but not currently exposed via routes. They are available for future API expansion.

### Pagination Helper

All paginated queries use `getPaginationValues(page, limit)` from a shared utility, ensuring consistent pagination behavior across endpoints.

---

## Input Validation

All endpoints use Zod schemas for input validation:

| Endpoint | Schema | Validated Fields |
|----------|--------|-----------------|
| /plans/search | `searchQuerySchema` | issuerName (1-200), planType (1-20), search (1-200), state (2 chars, uppercased), page, limit |
| /plans/grouped | Inline schema | search (1-200), state (2 chars) |
| /plans/meta/issuers | `stateQuerySchema` | state (optional) |
| /plans/meta/types | Extended `stateQuerySchema` | state, issuerName (1-200) |
| /plans/:planId | `planIdParamSchema` | planId format |
| /plans/:planId/providers | `planIdParamSchema` + `paginationSchema` | planId, page, limit |

All schemas use `z.string().min(1).max(N)` patterns to prevent empty strings and excessively long inputs.

---

## Rate Limiting

| Endpoint Type | Rate Limiter | Limit |
|--------------|-------------|-------|
| Search endpoints (/search, /:planId/providers) | `searchRateLimiter` | 100/hour |
| Browse endpoints (/grouped, /meta/*, /:planId) | `defaultRateLimiter` | 200/hour |

Search-heavy endpoints have stricter limits due to their database query complexity.

---

## Checklist Verification

### Database
- [x] InsurancePlan model with all fields -- 12 fields + relations + 5 indexes
- [x] ProviderPlanAcceptance with location support -- `locationId` field with relation
- [x] Confidence scoring on acceptance records -- `confidenceScore Int @default(0)`
- [x] TTL via expiresAt field -- `expiresAt DateTime?` with `@@index([expiresAt])`
- [x] Indexes on carrier, carrierId, healthSystemId, planVariant -- all confirmed
- [x] Compound index on state+carrier -- `@@index([state, carrier])`
- [x] Compound indexes on plan+status and npi+status -- both confirmed
- [x] Provider count denormalized on plan -- `providerCount Int @default(0)`

### Backend API
- [x] Plan search with filters -- `/search` with issuerName, planType, search, state
- [x] Grouped plans by carrier -- `/grouped` with search, state filters
- [x] Issuer metadata endpoint -- `/meta/issuers` with state filter
- [x] Plan type metadata endpoint -- `/meta/types` with state, issuerName filters
- [x] Providers-for-plan with pagination -- `/:planId/providers` ordered by confidence
- [x] Plan detail with provider count -- `/:planId` with `_count` fallback
- [x] Zod validation on all inputs -- all 6 endpoints validated
- [x] Rate limiting on all endpoints -- searchRateLimiter or defaultRateLimiter

### Response Consistency
- [x] All responses use `{ success: true, data: { ... } }` envelope
- [x] Paginated responses include `{ pagination: { total, page, limit, totalPages, hasMore } }`
- [x] 404 responses use `AppError.notFound()` for missing plans

### Data Pipeline
- [x] Import script exists -- `importInsurancePlans.ts` referenced in prompt
- [x] Plan parser/normalizer exists -- `insurancePlanParser.ts` referenced in prompt
- [ ] Automated periodic import not configured
- [ ] Plan data freshness tracking

---

## Issues

1. **No unique constraint on (providerNpi, planId) in ProviderPlanAcceptance:** The schema has compound indexes but no `@@unique` constraint on `(providerNpi, planId)` or `(providerNpi, planId, locationId)`. The application code uses `findFirst` which returns the first matching record, but without a database-level unique constraint, duplicate records could accumulate through race conditions.

2. **`getProvidersForPlan` response mapping is verbose:** The route handler manually maps provider fields to a response object (lines 140-167), duplicating field names and adding null fields (`addressLine1: null`, `credential: null`, etc.). This adds maintenance burden and inconsistency risk.

3. **No caching on metadata endpoints:** The `/meta/issuers` and `/meta/types` endpoints query the database on every request despite their data changing infrequently. These are prime candidates for caching.

4. **Search across 5 fields without full-text index:** The `search` parameter uses `contains` (LIKE) across 5 columns. For large plan datasets, this could become slow without PostgreSQL full-text search indexes.

5. **No plan comparison feature:** The prompt asks about plan comparison but no such endpoint exists.

---

## Recommendations

1. **Add a unique constraint** on `(providerNpi, planId, locationId)` in the `ProviderPlanAcceptance` model to prevent duplicate records at the database level:
   ```prisma
   @@unique([providerNpi, planId, locationId])
   ```

2. **Cache metadata endpoints** (`/meta/issuers`, `/meta/types`) with a 1-hour TTL. These lists change only during data imports. Use the existing cache infrastructure (from `utils/cache.ts`) and invalidate via the admin `/cache/clear` endpoint after imports.

3. **Simplify the providers-for-plan response mapping** by creating a shared `formatProviderResponse()` utility that both the plans and providers routes use, reducing duplication.

4. **Consider PostgreSQL `tsvector` full-text search** for the plan search endpoint if the plan count grows significantly. The current `ILIKE`-based search works for moderate datasets but degrades at scale.

5. **Add automated plan data freshness tracking:** Track when each plan was last synced from its source and expose a `/meta/freshness` endpoint for monitoring stale plan data.

6. **Add plan comparison API endpoint** (`GET /api/v1/plans/compare?planIds=A,B,C`) that returns side-by-side plan details and provider overlap statistics. This would complement the existing comparison feature on the frontend.
