# Insurance Plans Feature Review

**Last Updated:** 2026-04-16

## Summary

The insurance-plans feature is functionally mature on the backend: 6 REST endpoints wire through `planService` with Zod validation, rate limiting, and proper pagination helpers. The database schema (`InsurancePlan`, `ProviderPlanAcceptance`) carries confidence scoring, TTL, and the denormalized provider count. Frontend integration is partial — `useInsurancePlans` drives the card-scanner flow and search dropdowns, but the marketed "Insurance page" (`/insurance`) is actually the card scanner, not a plan browser, and the in-code `planApi` uses a different endpoint path than the backend exposes.

## Findings

### CRITICAL

- **C1. API path drift — `/meta/types` vs `/meta/plan-types`.** Backend registers `GET /api/v1/plans/meta/types` (`packages/backend/src/routes/plans.ts:100`). Frontend client calls `/plans/meta/plan-types` (`packages/frontend/src/lib/api.ts:646`). Any UI touching `plans.getPlanTypes` gets 404. No tests catch this because frontend has no hook/component tests and backend has no `plans` route test.

- **C2. `planApi` declared removed but still exported.** `packages/frontend/src/lib/api.ts:876` reads `// planApi removed - unused`, yet `api.ts:861` still exports `plans` from the same namespace object, and `useInsurancePlans.ts:165` does `api.plans.getGrouped(...)`. The comment is misleading and suggests a partial cleanup that was abandoned.

### HIGH

- **H1. No plan-route tests.** `packages/backend/src/routes/plans.ts` has 6 endpoints and zero tests. Compare to `providers.ts` (22 tests) and `verify.ts` (15 tests). Contract drift (C1) would have been caught by a single supertest per endpoint.

- **H2. `providerCount` fallback has a silent bug for explicit zero.** `planService.ts:159` uses `plan.providerCount || plan._count.providerAcceptances`. If a plan genuinely has 0 acceptances (stored `providerCount = 0`), the `||` falls through to `_count` — which is fine unless both are 0, where the response is correct but the `providerCount=0` flag never propagates. Worse, if `providerCount` is stale (non-zero but `_count` is newer/lower), the stale stored value wins. Test coverage confirms this intent (`planService.test.ts:131-178`) but also pins the unsafe `||` semantics.

- **H3. `getProvidersForPlan` filters to `acceptanceStatus: 'ACCEPTED'` only.** `planService.ts:304`. This is consistent with the endpoint name, but the API surface advertised to the frontend ("Providers accepting a plan") silently drops PENDING records. There's no flag to include pending or to show denial counts. Confidence-scoring UX loses signal.

- **H4. Import pipeline has no automation.** `importInsurancePlans.ts` is manual (`npx ts-node ... <csv-file>` per `importInsurancePlans.ts:7-11`). No cron, no scheduled workflow. The CSVs are hospital-website scrapes with a confidence ceiling of 70 (`importInsurancePlans.ts:22`). Data freshness is opaque — nothing tracks "last import for plan X."

- **H5. Insurance page is misnamed.** `packages/frontend/src/app/insurance/page.tsx:11-60` is the insurance-card scanner, not a plan browser. The prompt describes `/insurance` as the "insurance browser page" with filters; no such page exists. Users looking for a plan directory hit the card uploader instead.

### MEDIUM

- **M1. Zod schema mismatch in search.** `packages/backend/src/routes/plans.ts:19-24` accepts `issuerName`, `planType`, `search`, `state`. Frontend `planApi.search` sends `carrierName`, `planType`, `state`, `planYear`, `page`, `limit` (`api.ts:618-625`). `carrierName` and `planYear` are silently ignored by the backend (Zod allows extra params unless `.strict()` is used). Users filtering by carrier see no filter applied.

- **M2. `getGroupedPlans` does not paginate.** `planService.ts:246-255` fetches every plan matching filter with `findMany` (no `take`/`skip`). For a nationwide search with no state filter, this can return tens of thousands of rows into memory for in-JS grouping.

- **M3. Text search has no full-text index.** Search uses `contains + mode: 'insensitive'` across 5 fields with OR (`planService.ts:117-123`). On `insurance_plans` the only indexes are `carrier`, `carrierId`, `healthSystemId`, `planVariant`, `(state, carrier)` (`schema.prisma:205-209`). Searches without a state filter scan the full table.

- **M4. `ProviderPlanAcceptance` unique constraint claim in prompt is inaccurate.** Prompt says "unique constraint on (npi, planId)" (prompt line 94), but `schema.prisma:213-236` shows no `@@unique([providerNpi, planId])` — only several `@@index` entries. Verified via `grep @@unique` in schema.prisma: only 3 unique constraints exist (practice_locations.uq_location_address:95, vote_logs:284, saved_providers:393). A raw-SQL unique constraint exists in `migrations/add_verification_tables.sql:133` but is not reflected in Prisma schema, so `upsert({ where: { providerNpi_planId: ... } })` would fail if anyone tries it via Prisma Client.

- **M5. TTL not enforced by Prisma, only by column.** `expiresAt` exists (`schema.prisma:223`) and is indexed, but there's no cron/job referenced anywhere in `packages/backend/src/scripts/` that prunes expired acceptances. `verificationService.ts:cleanupExpiredVerifications` exists for verification logs but not for `ProviderPlanAcceptance`.

- **M6. Plan freshness/staleness not surfaced.** The prompt's checklist mentions "Plan data freshness tracking — missing." Confirmed: no `sourceFreshness`, `lastImportAt` on `InsurancePlan`. Only `createdAt` (`schema.prisma:200`).

### LOW

- **L1. `carrierId` and `healthSystemId` nullable with no FK.** `schema.prisma:198-199` declares them `Int?` with no `@relation`. They're indexed but orphan-tolerant. If carrier/health_system tables exist, joins are manual.

- **L2. `raw_name` up to 500 chars duplicates `plan_name` (200 chars).** `schema.prisma:189, 195`. Storage cost is fine; ambiguity for downstream consumers is moderate — which one is the display name?

- **L3. Insurance card extraction writes into a different flow.** `InsuranceCardUploader.tsx` and `useInsuranceCard.ts` feed the Claude extraction API (`packages/frontend/src/app/api/insurance-card/extract/route.ts`). Match against plans uses `useInsurancePlans.findPlanByName` (`useInsurancePlans.ts:219-237`) which does substring matching both directions. Fuzzy but not scored — "Empire BCBS" may match "Blue Cross" first since `carrierLower.includes('blue cross')`.

- **L4. `planVariant` index exists but no service method filters on it.** `schema.prisma:208` indexes `planVariant`; `planService.searchPlans:110` accepts it via `PlanSearchParams`, but no route exposes a `planVariant` query param. Dead filter.

## Checklist Verification

### Database
- [x] InsurancePlan model with all fields — `schema.prisma:187-211`
- [!] ProviderPlanAcceptance with unique constraint on (npi, planId) — **NOT in Prisma schema** (only exists in legacy `add_verification_tables.sql:133`). Migration and Prisma are out of sync.
- [x] Confidence scoring on acceptance records — `schema.prisma:218` `confidenceScore Int @default(0)`
- [x] TTL via expiresAt field — `schema.prisma:223`
- [x] Indexes on carrier, carrierId, healthSystemId, planVariant — `schema.prisma:205-209`
- [x] Provider count denormalized on plan — `schema.prisma:197`

### Backend API
- [x] Plan search with filters — `plans.ts:30-53`
- [!] Grouped plans by carrier — `plans.ts:59-75`, but not paginated (M2)
- [x] Issuer metadata endpoint — `plans.ts:81-93`
- [!] Plan type metadata endpoint — `plans.ts:99-114`, but path mismatch with FE (C1)
- [x] Providers-for-plan with pagination — `plans.ts:121-168`
- [x] Plan detail with provider count — `plans.ts:174-196`
- [x] Zod validation on all inputs — confirmed in each handler
- [x] Rate limiting on all endpoints — `searchRateLimiter` or `defaultRateLimiter` on every route

### Frontend
- [!] Insurance browser page — **missing**; `/insurance` is the card scanner (`insurance/page.tsx:11-60`). H5.
- [x] Plan search hooks — `useInsurancePlans.ts`, `useHealthSystems.ts`
- [x] Provider detail plans section — `provider-detail/ProviderPlansSection.tsx`, `InsuranceList.tsx`
- [x] Insurance card upload with Claude extraction — `InsuranceCardUploader.tsx`, `app/api/insurance-card/extract/route.ts`
- [!] API client methods for all plan endpoints — `api.ts:617-670` has 6 methods, but `search` signature (M1) and `getPlanTypes` path (C1) are wrong.

### Data Pipeline
- [x] Import script exists — `importInsurancePlans.ts`
- [x] Plan parser/normalizer exists — `utils/insurancePlanParser.ts`
- [ ] Automated periodic import not configured — confirmed (H4)
- [ ] Plan data freshness tracking — confirmed missing (M6)

## Recommendations (ranked)

1. **Fix `/meta/types` path mismatch.** Choose one name, update both sides, add a route test. Single PR. (Closes C1.)
2. **Add `plans.test.ts` covering all 6 endpoints.** Use `supertest` + mocked Prisma in the same style as `providers.test.ts`. (Closes H1 and will catch future C1-class bugs.)
3. **Align Prisma schema with SQL migration.** Add `@@unique([providerNpi, planId], map: "provider_plan_acceptance_npi_plan_id_key")` in `schema.prisma:236`, run `prisma db pull` or a no-op migration to reconcile. (Closes M4.)
4. **Paginate `getGroupedPlans`.** Add `page`/`limit` to the route and service; default `limit=500`, max `1000`. Ensures carrier dropdown still works but caps memory. (Closes M2.)
5. **Clarify what `/insurance` means.** Either rename to `/insurance/scan` and add a new `/insurance/plans` listing page, or update the prompt/docs. Users and docs must agree. (Closes H5.)
6. **Cron-ify the import.** Add a GitHub Actions scheduled workflow calling a new idempotent `importInsurancePlans` wrapper that pulls CSVs from a known bucket, records `lastImportAt` per plan. (Closes H4/M6.)
7. **Fix `search` param drift.** Either rename frontend `carrierName` → `issuerName` (and drop `planYear`), or add Zod support on the backend. (Closes M1.)
8. **Make `||` fallback explicit.** Replace `plan.providerCount || plan._count...` with `plan.providerCount ?? plan._count...` and decide semantics for stored-stale. (Addresses H2.)

## Open Questions

1. **How frequently should plan data be refreshed?** Hospital-website scrapes change ~quarterly; carrier API data monthly. No policy defined. Recommend: stamp `lastImportAt` per plan and expose staleness in `/plans/:planId`.
2. **Should plan search results be cached like provider search results?** Cache utility exists (`utils/cache.ts` mocked throughout tests) but plan routes don't call it. Given plans change less often than providers, a 10-min edge cache would cut DB load — mirror what `useInsurancePlans.ts:14` already does client-side.
3. **How are carrier IDs and health system IDs assigned during import?** Columns are `Int?` (`schema.prisma:198-199`) with no FK. Unclear whether a `carriers` table exists. Audit needed.
4. **Should there be a plan comparison feature?** No infrastructure for it today; `ProviderPlanAcceptance.confidenceScore` could drive a "best plan for this provider network" comparison — worth a dedicated spec.
5. **How should we handle plans with no providers linked?** Currently returned with `providerCount=0` in `/plans/search`. Recommend: add an optional `hasProviders=true` filter and surface orphan plans in an admin view.
