# Insurance Plans Feature -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/39-insurance-plans.md
**Status:** Largely Implemented with Minor Inconsistencies

---

## Findings

### Database

- **InsurancePlan model with all fields:** Verified. The prompt documents all fields (`planId`, `planName`, `issuerName`, `planType`, `state`, `carrier`, `planVariant`, `rawName`, `sourceHealthSystem`, `providerCount`, `carrierId`, `healthSystemId`, `createdAt`) and relationships (`providerAcceptances`, `verificationLogs`). The `planService.ts` queries confirm these fields are actively used via Prisma.
- **ProviderPlanAcceptance with unique constraint on (npi, planId):** Verified. The prompt documents `@@unique([providerNpi, planId])` on the model. The `getProvidersForPlan` service function queries this table with `planId` and `acceptanceStatus` filters.
- **Confidence scoring on acceptance records:** Verified. The `confidenceScore` field (0-100) is present on `ProviderPlanAcceptance`. The shared type `packages/shared/src/types/provider-plan-acceptance.ts` defines `ConfidenceFactors`, `ConfidenceDetails`, and `getConfidenceLevel()` with research-based scoring. The backend returns `confidenceScore`, `lastVerified`, and `verificationCount` from `getProvidersForPlan`.
- **TTL via expiresAt field:** Verified. The prompt documents `expiresAt DateTime?` with 6-month TTL. The shared types reference it with the comment "6 months based on 12% annual provider turnover."
- **Indexes on carrier, carrierId, healthSystemId, planVariant:** Verified per the prompt's schema definition showing `@@index([carrier])`, `@@index([carrierId])`, `@@index([healthSystemId])`, `@@index([planVariant])`.
- **Provider count denormalized on plan:** Verified. `providerCount Int @default(0)` is on the model, and `getPlanByPlanId` uses both the stored `plan.providerCount` and `plan._count.providerAcceptances` as a fallback.

### Backend API (6 Endpoints)

1. **GET `/api/v1/plans/search` -- Plan search with filters:** Verified in `packages/backend/src/routes/plans.ts` (line 30). Uses `searchRateLimiter`, validates via `searchQuerySchema` (Zod with `issuerName`, `planType`, `search`, `state`, `page`, `limit`). Calls `searchPlans()` in `planService.ts` which builds a Prisma `where` clause with case-insensitive filtering and full-text search across `carrier`, `issuerName`, `planName`, `rawName`, and `planId`.

2. **GET `/api/v1/plans/grouped` -- Plans grouped by carrier:** Verified at line 59. Uses `defaultRateLimiter`, accepts `search` and `state` filters. Calls `getGroupedPlans()` which groups plans into a `carrier -> plans[]` map.

3. **GET `/api/v1/plans/meta/issuers` -- Unique insurance issuers:** Verified at line 81. Uses `defaultRateLimiter` and `stateQuerySchema`. Calls `getIssuers()` which uses the generic `getDistinctField('issuerName', ...)` helper.

4. **GET `/api/v1/plans/meta/types` -- Available plan types:** Verified at line 99. Uses `defaultRateLimiter`, accepts `state` and `issuerName` filters. Calls `getPlanTypes()` using `getDistinctField('planType', ...)`.

5. **GET `/api/v1/plans/:planId/providers` -- Providers accepting a plan:** Verified at line 121. Correctly placed before the `/:planId` route to avoid conflicts (documented in code comment). Uses `searchRateLimiter`, `planIdParamSchema`, and `paginationSchema`. Returns provider details with confidence scores, verification counts, and location info.

6. **GET `/api/v1/plans/:planId` -- Plan details:** Verified at line 174. Uses `defaultRateLimiter` and `planIdParamSchema`. Returns plan data with `providerCount` computed from `_count.providerAcceptances`.

- **Zod validation on all inputs:** Verified. All 6 endpoints use Zod schemas: `searchQuerySchema`, inline schema for grouped, `stateQuerySchema`, extended state+issuer schema, `planIdParamSchema`, and `paginationSchema`. The shared schemas are in `packages/backend/src/schemas/commonSchemas.ts`.
- **Rate limiting on all endpoints:** Verified. Search and providers-for-plan use `searchRateLimiter` (100/hr); grouped, issuers, types, and plan detail use `defaultRateLimiter` (200/hr).

### Frontend

- **Insurance browser page:** Verified. File exists at `packages/frontend/src/app/insurance/page.tsx`.
- **Plan search hooks (`useInsurancePlans`):** Verified in `packages/frontend/src/hooks/useInsurancePlans.ts`. Implements module-level caching with 10-minute TTL, pending request deduplication, race-condition handling via `currentParamsRef`, and returns `groupedPlans`, `allPlans`, `selectOptions`, `isLoading`, `error`, `findPlan`, and `refetch`.
- **Provider detail plans section:** Verified. `ProviderPlansSection.tsx` and `InsuranceList.tsx` both exist at `packages/frontend/src/components/provider-detail/`.
- **Insurance card upload with Claude extraction:** Verified. `InsuranceCardUploader.tsx` exists at `packages/frontend/src/components/InsuranceCardUploader.tsx`.
- **API client methods for all plan endpoints:** Verified in `packages/frontend/src/lib/api.ts` (lines 473-534). The `plans` object provides: `search()`, `getGrouped()`, `getGroupedPlans()` (legacy alias), `getIssuers()`, `getPlanTypes()`, `getById()`, `getProviders()`.

### Data Pipeline

- **Import script exists:** Verified. `packages/backend/src/scripts/importInsurancePlans.ts` handles CSV import with plan name normalization, carrier identification, and provider-plan acceptance creation. Uses a confidence score of 70 for hospital scrape data.
- **Plan parser/normalizer exists:** Verified. `packages/backend/src/utils/insurancePlanParser.ts` includes carrier alias normalization (e.g., "bcbs" -> "Blue Cross Blue Shield", "uhc" -> "UnitedHealthcare"), plan variant extraction, and plan ID generation.
- **Automated periodic import not configured:** Confirmed -- the import script is run manually via `npx ts-node`. No cron job or scheduled Cloud Run job is configured.
- **Plan data freshness tracking:** Confirmed not implemented. Plans have `createdAt` but no `updatedAt` or `lastImportedAt` field.

### Shared Types

- **InsurancePlan types (`packages/shared/src/types/insurance-plan.ts`):** Verified. Defines `InsurancePlan`, `InsurancePlanWithRelations`, `CreateInsurancePlanInput`, `UpdateInsurancePlanInput`, `InsurancePlanSearchFilters`, and `InsurancePlanSearchResult`.
- **ProviderPlanAcceptance types (`packages/shared/src/types/provider-plan-acceptance.ts`):** Verified. Defines `ProviderPlanAcceptance`, `ConfidenceFactors`, `ConfidenceMetadata`, `ConfidenceDetails`, `ConfidenceLevel`, `getConfidenceLevel()`, and `getConfidenceLevelDescription()`. Research citations included (Mortensen et al. 2015, Ndumele et al. 2018).
- **Enums (`packages/shared/src/types/enums.ts`):** Verified. Includes `PlanType` (HMO, PPO, EPO, POS, HDHP, MEDICARE_ADVANTAGE, MEDICAID, OTHER), `AcceptanceStatus` (ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN), `MetalLevel`, `MarketType`, `DataSource`, and `VerificationSource`.

### Issues and Warnings

- **Frontend API path mismatch for plan types endpoint:** The backend route is `/meta/types` (line 99 of `plans.ts`), but the frontend API client calls `/plans/meta/plan-types` (line 510 of `api.ts`). These paths do not match. The frontend `getPlanTypes` call would get a 404 from the backend.
- **Shared types vs Prisma schema drift:** The shared `InsurancePlan` type in `packages/shared/src/types/insurance-plan.ts` has fields like `metalLevel`, `marketType`, `planYear`, `statesCovered[]`, `serviceArea`, `isActive`, `effectiveDate`, `terminationDate`, `dataSource`, `sourceFileId` that do not appear in the Prisma schema documented in the prompt. The Prisma model has `carrier`, `planVariant`, `rawName`, `sourceHealthSystem`, `carrierId`, `healthSystemId` which are not in the shared type. These two type definitions have diverged significantly.
- **`useInsurancePlans` uses custom caching, not React Query:** The prompt mentions "React Query caching" for `useInsurancePlans`, but the actual hook uses a custom module-level `Map`-based cache with manual TTL management. There is no `useQuery` from `@tanstack/react-query` in this hook.
- **`planApi` legacy export removed:** The prompt references `planApi` in `lib/api.ts`, but the code shows `planApi removed - unused` at line 667. The plans are still accessible via `api.plans.*` but the named export `planApi` no longer exists.

---

## Summary

The insurance plans feature is substantially implemented across all layers. All 6 backend API endpoints are present with proper Zod validation, rate limiting, and Prisma-based queries. The frontend has the insurance browser page, provider detail plans section, insurance card uploader, and a full API client covering all endpoints. The data pipeline includes both an import script and a plan name parser/normalizer.

However, there are notable inconsistencies: the frontend plan types endpoint URL does not match the backend route (`/meta/plan-types` vs `/meta/types`), the shared TypeScript types have diverged from the Prisma schema (different field sets), and the hook uses custom caching instead of the React Query approach described in the prompt. No automated import scheduling or data freshness tracking is in place.

## Recommendations

1. **Fix the plan types endpoint URL mismatch.** Either rename the backend route from `/meta/types` to `/meta/plan-types`, or update the frontend `getPlanTypes` call to hit `/meta/types`. The former is preferred since it is more descriptive.
2. **Reconcile shared types with Prisma schema.** The shared `InsurancePlan` interface and the Prisma `InsurancePlan` model define very different field sets. Consider whether the shared types represent a future target schema or if they should be updated to match what the database actually stores. Having diverged types creates confusion and potential runtime errors.
3. **Consider migrating `useInsurancePlans` to React Query.** The custom caching implementation works but duplicates functionality that React Query provides (caching, stale-while-revalidate, deduplication, background refetch). Migrating would reduce code and align with how the prompt describes the feature.
4. **Implement automated plan data import.** Currently the import is manual via CLI. Consider a Cloud Run Job on a schedule or a Cloud Scheduler trigger to keep plan data fresh.
5. **Add `updatedAt` to InsurancePlan.** The model only has `createdAt`, making it impossible to track when plan data was last refreshed.
6. **Re-export `planApi` or update documentation.** The prompt references `planApi` as a named export, but it has been removed. Either restore it for backward compatibility or update all documentation to reference `api.plans` instead.
