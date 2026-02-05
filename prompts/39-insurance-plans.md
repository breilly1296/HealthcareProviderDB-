---
tags:
  - feature
  - insurance
  - implemented
type: prompt
priority: 2
created: 2026-02-05
---

# Insurance Plans Feature Review

## Files to Review

### Backend
- `packages/backend/src/routes/plans.ts` (6 endpoints)
- `packages/backend/src/services/planService.ts` (plan business logic)
- `packages/backend/prisma/schema.prisma` (InsurancePlan, ProviderPlanAcceptance models)
- `packages/backend/src/schemas/commonSchemas.ts` (planIdParamSchema, stateQuerySchema)
- `packages/backend/src/scripts/importInsurancePlans.ts` (plan import pipeline)
- `packages/backend/src/utils/insurancePlanParser.ts` (plan parsing/normalization)

### Frontend
- `packages/frontend/src/app/insurance/page.tsx` (insurance browser page)
- `packages/frontend/src/hooks/useInsurancePlans.ts` (plan data hook)
- `packages/frontend/src/hooks/useHealthSystems.ts` (health system data hook)
- `packages/frontend/src/lib/api.ts` (planApi client methods)
- `packages/frontend/src/components/provider-detail/ProviderPlansSection.tsx` (plans on provider detail)
- `packages/frontend/src/components/provider-detail/InsuranceList.tsx` (plan list component)
- `packages/frontend/src/components/InsuranceCardUploader.tsx` (card upload with Claude extraction)

### Shared
- `packages/shared/src/types/insurance-plan.ts` (InsurancePlan types)
- `packages/shared/src/types/provider-plan-acceptance.ts` (acceptance types, confidence)
- `packages/shared/src/types/enums.ts` (AcceptanceStatus, PlanType)

## Feature Overview

Insurance plans are a core data dimension connecting providers to the insurance networks they accept. The feature supports:
- Searching and browsing insurance plans
- Viewing which providers accept a specific plan
- Viewing which plans a specific provider accepts
- Grouping plans by carrier for dropdown display
- Filtering by issuer, plan type, and state
- Provider-plan acceptance with confidence scoring and TTL

## Database Schema

### InsurancePlan (`insurance_plans`)
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

  providerAcceptances ProviderPlanAcceptance[]
  verificationLogs    VerificationLog[]

  @@index([carrier])
  @@index([carrierId])
  @@index([healthSystemId])
  @@index([planVariant])
}
```

### ProviderPlanAcceptance (`provider_plan_acceptance`)
Links providers to plans with acceptance status, confidence scoring, and TTL:
```prisma
model ProviderPlanAcceptance {
  id                 Int       @id @default(autoincrement())
  providerNpi        String?   @map("npi") @db.VarChar(10)
  planId             String?   @map("plan_id") @db.VarChar(50)
  acceptanceStatus   String    @default("UNKNOWN")   // ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN
  confidenceScore    Int       @default(0)            // 0-100
  lastVerified       DateTime?
  verificationCount  Int       @default(0)
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @default(now())
  expiresAt          DateTime?                        // 6-month TTL

  @@unique([providerNpi, planId])
  @@index([acceptanceStatus])
  @@index([confidenceScore])
  @@index([expiresAt])
  @@index([lastVerified])
}
```

## API Endpoints

### Plan Search & Browsing

**GET `/api/v1/plans/search`** — Search plans with filters
- Query: `issuerName`, `planType`, `search` (text), `state`, `page`, `limit`
- Rate limit: searchRateLimiter (100/hr)
- Returns: paginated plan list

**GET `/api/v1/plans/grouped`** — Plans grouped by carrier
- Query: `search`, `state`
- Rate limit: defaultRateLimiter (200/hr)
- Returns: plans organized by carrier (for dropdown UI)

**GET `/api/v1/plans/meta/issuers`** — Unique insurance issuers
- Query: `state` (optional filter)
- Returns: list of issuer names with count

**GET `/api/v1/plans/meta/types`** — Available plan types
- Query: `state`, `issuerName` (optional filters)
- Returns: list of plan types with count

### Plan Details & Providers

**GET `/api/v1/plans/:planId`** — Plan details
- Returns: plan metadata + provider count (via `_count.providerAcceptances`)

**GET `/api/v1/plans/:planId/providers`** — Providers accepting a plan
- Query: `page`, `limit`
- Rate limit: searchRateLimiter (100/hr)
- Returns: paginated provider list with confidence scores and verification counts

## Data Pipeline

### Import Script
File: `packages/backend/src/scripts/importInsurancePlans.ts`

Imports insurance plan data from CSV/structured sources into the `insurance_plans` table. Handles:
- Plan name normalization
- Carrier identification and grouping
- Plan variant extraction
- Provider count tracking
- Health system tagging

### Plan Parser
File: `packages/backend/src/utils/insurancePlanParser.ts`

Utilities for parsing and normalizing insurance plan data:
- Extracts carrier name from plan name
- Identifies plan type (HMO, PPO, EPO, POS, etc.)
- Normalizes plan variants
- Maps raw plan names to structured fields

## Frontend Integration

### Insurance Page (`/insurance`)
Browse and search insurance plans with filters for issuer, plan type, and state.

### Provider Detail — Plans Section
`ProviderPlansSection.tsx` and `InsuranceList.tsx` display which plans a provider accepts, with:
- Acceptance status badges
- Confidence scores
- Last verified dates
- Verification counts

### Insurance Card Upload
`InsuranceCardUploader.tsx` allows users to upload an insurance card photo, which is processed by Claude AI to extract plan information (issuer, plan name, network, member ID, etc.). See prompt 29 for details.

### API Client
`planApi` in `lib/api.ts` provides typed methods:
- `planApi.search(filters)` — Search plans
- `planApi.getById(planId)` — Get plan details
- `planApi.getProvidersForPlan(planId, pagination)` — Providers for plan
- `planApi.getGrouped(filters)` — Grouped plans by carrier
- `planApi.getIssuers(filters)` — Issuer list
- `planApi.getTypes(filters)` — Plan type list

### React Query Hooks
- `useInsurancePlans()` — Plan search with React Query caching
- `useHealthSystems()` — Health system data for filtering

## Checklist

### Database
- [x] InsurancePlan model with all fields
- [x] ProviderPlanAcceptance with unique constraint on (npi, planId)
- [x] Confidence scoring on acceptance records
- [x] TTL via expiresAt field
- [x] Indexes on carrier, carrierId, healthSystemId, planVariant
- [x] Provider count denormalized on plan

### Backend API
- [x] Plan search with filters
- [x] Grouped plans by carrier
- [x] Issuer metadata endpoint
- [x] Plan type metadata endpoint
- [x] Providers-for-plan with pagination
- [x] Plan detail with provider count
- [x] Zod validation on all inputs
- [x] Rate limiting on all endpoints

### Frontend
- [x] Insurance browser page
- [x] Plan search hooks
- [x] Provider detail plans section
- [x] Insurance card upload with Claude extraction
- [x] API client methods for all plan endpoints

### Data Pipeline
- [x] Import script exists
- [x] Plan parser/normalizer exists
- [ ] Automated periodic import not configured
- [ ] Plan data freshness tracking

## Questions to Ask
1. How frequently should plan data be refreshed?
2. Should plan search results be cached like provider search results?
3. How are carrier IDs and health system IDs assigned during import?
4. Should there be a plan comparison feature (compare coverage across plans)?
5. How should we handle plans with no providers linked?
