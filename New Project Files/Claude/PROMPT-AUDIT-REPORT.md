# Prompt Audit Report -- VerifyMyProvider

**Generated:** 2026-02-06
**Method:** Cross-referenced actual codebase state against all 45 prompt files
**Previous audit:** 2026-02-05 (all items from previous audit were marked as completed)

---

## Executive Summary

- **45 prompt files** reviewed (00-44 + Hospital Data Pull subdirectory)
- **2 prompts need minor updates** (unchecked checklist items that should be checked)
- **0 empty template prompts** remaining (all 8 previously-empty templates have been populated)
- **0 new prompts recommended** (coverage gaps from previous audit have all been filled)
- **0 duplicate files** (the `28-hospital-analysis-prompt.md` duplicate was cleaned up)
- **35+ prompts are accurate** and need no changes
- **Overall status: HEALTHY** -- the Feb 5 bulk update resolved nearly all issues

---

## SECTION 1: PROMPTS NEEDING MINOR UPDATES

### LOW -- Unchecked Checklist Items

#### `02-no-hipaa-compliance.md` -- CHECKLIST NOT UPDATED
**Problem:** Section 1 ("What VerifyMyProvider Stores") still has `[ ]` unchecked items (line 30). These items describe public data types that ARE stored, so they should be `[x]`. The prompt's narrative content is accurate, but the checklist visual is misleading.

**What's correct in codebase:**
- Provider names -- from public NPI Registry (stored in `providers.last_name`, `first_name`, etc.)
- Provider addresses -- from public NPI Registry (stored in `practice_locations`)
- Specialty information -- from public NPI Registry (stored in `providers.primary_specialty`)
- Insurance plan acceptance -- community verified (stored in `provider_plan_acceptance`)
- Legal pages exist: `privacy/page.tsx`, `terms/page.tsx`, `disclaimer/page.tsx`, `Disclaimer.tsx` component

**Action:** Check the `[ ]` items in Section 1 to `[x]`. Minor effort.

---

#### `05-audit-logging.md` -- CHECKLIST NOT UPDATED
**Problem:** Section 1 ("What to Log") still has `[ ]` unchecked items (line 26-30). The features described ARE implemented in the codebase:
- Verification submissions: logged in `verificationService.ts` and stored in `verification_logs` table
- Vote submissions: logged and stored in `vote_logs` table
- Rate limit hits: logged by `rateLimiter.ts` middleware
- API errors: handled by `errorHandler.ts` middleware with Pino logging

**Additional concern:** The prompt's Section 2 should clarify that while application logs (Pino) exclude PII, the database DOES store `sourceIp` in `VerificationLog` and `VoteLog` for anti-abuse purposes. This distinction is important.

**Action:** Check the `[ ]` items. Add a note about the IP storage distinction. Minor effort.

---

## SECTION 2: PREVIOUSLY EMPTY TEMPLATES -- NOW POPULATED

All 8 templates from the previous audit have been populated:

| Prompt | Topic | Current Status |
|--------|-------|----------------|
| `15-deployment-guide.md` | Deployment | Populated -- Docker, Cloud Run, GitHub Actions |
| `16-architecture-doc.md` | Architecture | Populated -- full-stack monorepo overview |
| `17-api-reference-doc.md` | API reference | Populated -- all endpoints documented |
| `18-troubleshooting-doc.md` | Troubleshooting | Populated -- known issues and workarounds |
| `19-changelog-doc.md` | Changelog | Populated -- Jan 2026 milestones |
| `20-known-issues-doc.md` | Known issues | Populated -- issues documented with file refs |
| `23-data-quality-tracker.md` | Data quality | Populated -- NPI, plans, verification quality |
| `26-full-security-audit.md` | Meta security audit | Populated -- references all security prompts with priorities |

---

## SECTION 3: PROMPTS THAT ARE ACCURATE (No Changes Needed)

### Critical Accuracy -- Schema & Architecture

| Prompt | Topic | Verification Notes |
|--------|-------|--------------------|
| `01-database-schema.md` | Database schema | Matches `schema.prisma`: 15 models, correct field names, correct indexes. Lists all 7 provider data models, 2 reference models, 4 insurance/verification models, 2 operational models. |
| `06-api-routes.md` | API routes | Complete route inventory matches all 5 route files. Provider (3 endpoints), Plans (6 endpoints), Verify (5 endpoints), Locations (5 endpoints), Admin (9 endpoints). Middleware chain documented correctly. |
| `11-environment-secrets.md` | Environment variables | Complete inventory of 20+ env vars grouped by service. DATABASE_URL, PORT, NODE_ENV, CORS_ORIGIN, FRONTEND_URL, ADMIN_SECRET, RECAPTCHA_SECRET_KEY, CAPTCHA_FAIL_MODE, REDIS_URL, ANTHROPIC_API_KEY, NEXT_PUBLIC_POSTHOG_KEY/HOST, NEXT_PUBLIC_API_URL all documented. |
| `12-confidence-scoring.md` | Confidence algorithm | Correctly documents 4-factor scoring (25/30/25/20) matching `confidenceService.ts`. Data source scores match `DATA_SOURCE_SCORES` map. Specialty-specific freshness thresholds match `VERIFICATION_FRESHNESS` map. |

### High Accuracy -- Features & Security

| Prompt | Topic | Verification Notes |
|--------|-------|--------------------|
| `03-authentication.md` | Admin auth | Admin endpoints use `adminAuthMiddleware` with timing-safe `X-Admin-Secret` comparison. 9 admin endpoints documented. |
| `04-csrf.md` | CSRF protection | Correctly states CSRF not needed -- no auth cookies, API is JSON-only. |
| `07-input-validation.md` | Input validation | Zod validation confirmed on all route files (`searchQuerySchema`, `submitVerificationSchema`, `voteSchema`, etc.) |
| `08-rate-limiting.md` | Rate limiting | Dual-mode (Redis + in-memory) architecture matches `rateLimiter.ts`. Fail-open behavior, sliding window, `X-RateLimit-Status` header all documented. |
| `09-external-apis.md` | External APIs | All 5 APIs documented: reCAPTCHA (verified in `captcha.ts`), Claude (verified in `insurance-card/extract/route.ts`), PostHog (verified in `PostHogProvider.tsx` + `analytics.ts`), NPI Registry, Redis. |
| `10-frontend-structure.md` | Frontend structure | Component inventory matches filesystem: `components/home/` (5), `components/provider-detail/` (10), `components/compare/` (3+), `components/provider/` (5), `components/ui/` (3+). 10 pages, 8+ hooks, 3 contexts. |
| `13-npi-data-pipeline.md` | NPI data pipeline | Import script `importInsurancePlans.ts` exists. Taxonomy reference table confirmed. `provider_taxonomies` table for multi-taxonomy support confirmed. |
| `21-security-vulnerabilities.md` | Security vulns | 4 ZeroPath findings documented as resolved. Timing-safe admin auth confirmed in `admin.ts`. |
| `27-captcha-integration.md` | CAPTCHA | reCAPTCHA v3 implementation matches `captcha.ts`: fail-open/closed modes, score threshold 0.5, 5s timeout, fallback rate limiting (3/hour). |
| `29-insurance-card-upload.md` | Insurance card OCR | Claude API integration confirmed in `app/api/insurance-card/extract/route.ts`. `@anthropic-ai/sdk` in frontend dependencies. `InsuranceCardUploader.tsx` component exists. |
| `36-sybil-attack-prevention.md` | Anti-spam | 4 layers confirmed: (1) Rate limiting in `rateLimiter.ts`, (2) Honeypot in `honeypot.ts`, (3) CAPTCHA in `captcha.ts`, (4) Verification window checks in `verificationService.ts` with `SYBIL_PREVENTION_WINDOW_MS` (30 days). |
| `37-error-handling.md` | Error handling | `AppError` class and `asyncHandler` confirmed in `middleware/errorHandler.ts`. Used across all route files. |
| `28-location-features.md` | Location features | Accurately reflects current state: `practice_locations` table, `locationService.ts`, routes registered and active, frontend `LocationCard` and `/location/[locationId]` page exist. |

### Accurate -- New Prompts (Created Feb 5)

| Prompt | Topic | Verification Notes |
|--------|-------|--------------------|
| `39-insurance-plans.md` | Insurance plans | Plan routes match `routes/plans.ts`: search, grouped, meta/issuers, meta/types, /:planId, /:planId/providers. `planService.ts` and `insurancePlanParser.ts` exist. |
| `40-docker-cicd.md` | Docker + CI/CD | `docker-compose.yml` confirmed (PostgreSQL + backend + frontend). Dockerfiles in both packages. 5 GitHub Actions workflows: deploy.yml, deploy-staging.yml, test.yml, playwright.yml, security-scan.yml. |
| `41-frontend-data-fetching.md` | Frontend data fetching | React Query setup in `QueryProvider.tsx`. API client in `lib/api.ts` with retry logic. Custom hooks: useCities, useHealthSystems, useInsurancePlans, useProviderSearch, useSearchForm, useRecentSearches. 3 contexts: Compare, Error, Theme. |
| `42-provider-detail-page.md` | Provider detail | `app/provider/[npi]/page.tsx` exists. Sub-components confirmed: ProviderHeroCard, ProviderHeader, ProviderSidebar, ProviderPlansSection, AboutProvider, ColocatedProviders, InsuranceList, ConfidenceGauge, ScoreBreakdown. ProviderVerificationForm and VerificationButton in `components/`. |
| `43-search-architecture.md` | Search architecture | Search flow confirmed: `SearchForm` -> `useSearchForm` -> `useSearchExecution` -> API client -> `providerService.ts`. Search caching with 5-min TTL. Filter system: FilterDrawer, FilterButton. URL sync via `useSearchParams`. |
| `44-seo-sitemap.md` | SEO/Sitemap | `sitemap.ts` confirmed: static pages (6) + dynamic provider pages (top 500). Daily revalidation. Priority values match code. Provider detail SSR metadata generation exists. |

---

## SECTION 4: PROMPTS THAT ARE FINE AS-IS (Strategic/Reference)

These are Q&A templates or strategic docs not meant to track codebase state:

| Prompt | Topic | Notes |
|--------|-------|-------|
| `14-strategy-doc.md` | Business strategy template | Fine as-is |
| `22-ecosystem-integration.md` | Ecosystem strategy template | Fine as-is |
| `25-progress-status.md` | Progress tracker template | Fine as-is |
| `28-hospital-analysis-prompt.md` | NYC hospital research task | In `Hospital Data Pull/` only (duplicate removed) |
| `30-testing-strategy.md` | Testing approach | Reference document |
| `31-redis-caching.md` | Redis caching strategy | Reference document |
| `32-ttl-data-expiration.md` | TTL and data expiration | Reference document |
| `33-provider-comparison.md` | Provider comparison feature | Reference document |
| `34-analytics-posthog.md` | PostHog analytics | Accurate for current implementation |
| `35-monorepo-structure.md` | npm workspace structure | Reference document |
| `38-admin-endpoints.md` | Admin endpoints reference | Reference document |

---

## SECTION 5: DUPLICATE FILE STATUS

**RESOLVED.** The `28-hospital-analysis-prompt.md` duplicate has been cleaned up:
- Root-level copy: REMOVED
- `Hospital Data Pull/28-hospital-analysis-prompt.md`: EXISTS (sole copy)
- Numbering conflict with `28-location-features.md`: no longer an issue since the hospital analysis prompt is only in the subdirectory

---

## SECTION 6: COVERAGE ANALYSIS

### Prompt Count by Category

| Category | Range | Count |
|----------|-------|-------|
| Security & Architecture | 01-13 | 13 |
| Documentation | 14-25 | 12 |
| Meta | 26-27 | 2 |
| Feature | 28-44 | 17 |
| Standalone Research | Hospital Data Pull | 1 |
| **Total** | | **45** |

### Feature Coverage Map

| Feature | Prompt | Backend Code | Frontend Code | Status |
|---------|--------|-------------|---------------|--------|
| Provider Search | 43 | `providerService.ts`, `routes/providers.ts` | `SearchForm`, hooks/search/ | Fully documented |
| Provider Detail | 42 | `routes/providers.ts` /:npi | `app/provider/[npi]/`, provider-detail/ | Fully documented |
| Insurance Plans | 39 | `planService.ts`, `routes/plans.ts` | `app/insurance/` | Fully documented |
| Verification | 36, 27 | `verificationService.ts`, `routes/verify.ts` | ProviderVerificationForm, VerificationButton | Fully documented |
| Confidence Scoring | 12 | `confidenceService.ts`, `confidenceDecayService.ts` | ConfidenceGauge, ScoreBreakdown | Fully documented |
| Locations | 28 | `locationService.ts`, `routes/locations.ts` | `app/location/[locationId]/`, LocationCard | Fully documented |
| Insurance Card OCR | 29 | -- | `api/insurance-card/extract/route.ts`, InsuranceCardUploader | Fully documented |
| Admin Endpoints | 38 | `routes/admin.ts` (9 endpoints) | -- | Fully documented |
| Analytics | 34 | -- | PostHogProvider, analytics.ts | Fully documented |
| Docker/CI/CD | 40 | Dockerfile, docker-compose | Dockerfile | Fully documented |
| SEO/Sitemap | 44 | -- | sitemap.ts, metadata generation | Fully documented |
| Data Fetching | 41 | -- | api.ts, QueryProvider, custom hooks | Fully documented |
| Comparison | 33 | -- | CompareContext, CompareBar, CompareModal | Reference |

### Potential Future Prompt Topics

These areas exist in the codebase but have no dedicated prompt (covered partially by other prompts):

1. **Data Quality Auditing** -- `DataQualityAudit` model exists in schema, `data_quality_audit` table. Partially covered by `23-data-quality-tracker.md`.
2. **Confidence Decay Recalculation** -- `confidenceDecayService.ts` provides batch recalculation via admin endpoint. Partially covered by `12-confidence-scoring.md`.
3. **Cookie Consent** -- `CookieConsent.tsx` component exists. Not covered by any prompt but minimal scope.
4. **E2E Testing (Playwright)** -- `playwright.config.ts`, `e2e/` directory, `playwright.yml` workflow exist. Partially covered by `30-testing-strategy.md`.

---

## SECTION 7: CODEBASE INVENTORY VERIFICATION

### Prompt File List (verified 2026-02-06)

```
prompts/
  00-index.md
  01-database-schema.md
  02-no-hipaa-compliance.md
  03-authentication.md
  04-csrf.md
  05-audit-logging.md
  06-api-routes.md
  07-input-validation.md
  08-rate-limiting.md
  09-external-apis.md
  10-frontend-structure.md
  11-environment-secrets.md
  12-confidence-scoring.md
  13-npi-data-pipeline.md
  14-strategy-doc.md
  15-deployment-guide.md
  16-architecture-doc.md
  17-api-reference-doc.md
  18-troubleshooting-doc.md
  19-changelog-doc.md
  20-known-issues-doc.md
  21-security-vulnerabilities.md
  22-ecosystem-integration.md
  23-data-quality-tracker.md
  24-development-workflow.md
  25-progress-status.md
  26-full-security-audit.md
  27-captcha-integration.md
  28-location-features.md
  29-insurance-card-upload.md
  30-testing-strategy.md
  31-redis-caching.md
  32-ttl-data-expiration.md
  33-provider-comparison.md
  34-analytics-posthog.md
  35-monorepo-structure.md
  36-sybil-attack-prevention.md
  37-error-handling.md
  38-admin-endpoints.md
  39-insurance-plans.md
  40-docker-cicd.md
  41-frontend-data-fetching.md
  42-provider-detail-page.md
  43-search-architecture.md
  44-seo-sitemap.md
  Hospital Data Pull/
    28-hospital-analysis-prompt.md
  PROMPT-AUDIT-REPORT.md
```

### Schema Models (verified against `packages/backend/prisma/schema.prisma`)

| Model | Table | PK | Status |
|-------|-------|-----|--------|
| Provider | providers | npi (VarChar 10) | Active |
| practice_locations | practice_locations | id (autoincrement) | Active |
| provider_cms_details | provider_cms_details | npi (VarChar 10) | Active |
| provider_hospitals | provider_hospitals | id (autoincrement) | Active |
| provider_insurance | provider_insurance | id (autoincrement) | Active |
| provider_medicare | provider_medicare | id (autoincrement) | Active |
| provider_taxonomies | provider_taxonomies | id (autoincrement) | Active |
| taxonomy_reference | taxonomy_reference | taxonomy_code (VarChar 20) | Active |
| hospitals | hospitals | ccn (VarChar 20) | Active |
| InsurancePlan | insurance_plans | plan_id (VarChar 50) | Active |
| ProviderPlanAcceptance | provider_plan_acceptance | id (autoincrement) | Active |
| VerificationLog | verification_logs | id (cuid) | Active |
| VoteLog | vote_logs | id (cuid) | Active |
| SyncLog | sync_logs | id (autoincrement) | Active |
| DataQualityAudit | data_quality_audit | id (autoincrement) | Active |

### Enums (verified)

| Enum | Values |
|------|--------|
| AcceptanceStatus | ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN |
| VerificationSource | CMS_DATA, CARRIER_DATA, PROVIDER_PORTAL, PHONE_CALL, CROWDSOURCE, AUTOMATED, NPPES_SYNC, CARRIER_SCRAPE, NETWORK_CROSSREF |
| VerificationType | PLAN_ACCEPTANCE, PROVIDER_INFO, CONTACT_INFO, STATUS_CHANGE, NEW_PLAN |

### Backend Services (verified against `packages/backend/src/services/`)

| Service | File | Purpose |
|---------|------|---------|
| providerService | providerService.ts | Provider search, NPI lookup, display name, cities |
| planService | planService.ts | Plan search, grouped plans, issuers, types, providers-for-plan |
| verificationService | verificationService.ts | Submit verification, vote, stats, Sybil checks, TTL |
| confidenceService | confidenceService.ts | 4-factor confidence scoring algorithm |
| confidenceDecayService | confidenceDecayService.ts | Batch confidence recalculation with time decay |
| locationService | locationService.ts | Location search, health systems, stats, co-located providers |
| locationEnrichment | locationEnrichment.ts | Location enrichment pipeline |

### Backend Middleware (verified against `packages/backend/src/middleware/`)

| Middleware | File | Purpose |
|-----------|------|---------|
| errorHandler | errorHandler.ts | AppError class, asyncHandler, 404 handler |
| rateLimiter | rateLimiter.ts | Dual-mode Redis/in-memory rate limiting |
| captcha | captcha.ts | reCAPTCHA v3 verification |
| honeypot | honeypot.ts | Bot detection via hidden form field |
| requestLogger | requestLogger.ts | Structured request logging |
| httpLogger | httpLogger.ts | Pino HTTP logging |
| requestId | requestId.ts | Request ID correlation |

### GitHub Actions Workflows (verified)

| Workflow | File | Trigger |
|----------|------|---------|
| Deploy to Cloud Run | deploy.yml | push to main, manual |
| Deploy Staging | deploy-staging.yml | manual or staging branch |
| Run Tests | test.yml | PR and push events |
| Playwright E2E | playwright.yml | PR and push events |
| Security Scan | security-scan.yml | Scheduled or manual |

---

## SECTION 8: PRIORITY ACTIONS

### Remaining Items (Low Priority)

| # | Prompt | Action | Effort |
|---|--------|--------|--------|
| 1 | `02-no-hipaa-compliance.md` | Check `[ ]` items in Section 1 to `[x]` | 5 min |
| 2 | `05-audit-logging.md` | Check `[ ]` items in Section 1 to `[x]`; add IP storage clarification | 10 min |

**Total estimated effort:** 15 minutes

### Previous Audit Completion Status

All 22 items from the 2026-02-05 audit were marked as completed:
- 3 critical schema/architecture rewrites (01, 28, 12)
- 5 high-priority coverage fills (06, 09, 11, 39, 40)
- 8 medium-priority updates (10, 13, 02, 03, 05, 08, 36, 34)
- 3 new prompts created (41, 42, 43)
- 8 empty templates populated (15, 16, 17, 18, 19, 20, 23, 26)
- 1 duplicate removed (28-hospital-analysis-prompt.md root copy)
- Index updated (00-index.md)

The only items that were not fully completed are the two minor checklist updates noted above in Section 1.
