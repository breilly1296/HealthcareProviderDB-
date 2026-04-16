# Prompt Audit Report — VerifyMyProvider

**Generated:** 2026-02-05 | **Updated:** 2026-02-06
**Method:** Cross-referenced actual codebase state against all 45 prompt files

---

## Executive Summary

- **39 prompt files** reviewed (00-38 + Hospital Data Pull subdirectory)
- **14 prompts need updates** (codebase has diverged from what they describe)
- **8 empty template prompts** should be populated or removed
- **5 new prompts recommended** for coverage gaps
- **1 duplicate file** to clean up
- **8 prompts are accurate** and need no changes

---

## SECTION 1: PROMPTS NEEDING UPDATES (Codebase Divergence)

### CRITICAL — Schema/Architecture Mismatch

#### `01-database-schema.md` — MAJOR UPDATE NEEDED
**Problem:** The prompt describes a `Location` model that no longer exists in this form. The actual schema uses `practice_locations` with completely different fields.

| Prompt Says | Codebase Actually Has |
|---|---|
| `Location` model with `name`, `healthSystem`, `facilityType`, `providerCount` | `practice_locations` with `addressType`, `address_line1`, `address_line2`, `city`, `state`, `zip_code`, `phone`, `fax` |
| Provider → Location via `locationId` FK | Provider → practice_locations via `npi` FK (one-to-many) |
| Unique on (addressLine1, city, state, zipCode) | No unique constraint — multiple addresses per provider |
| Tables: Provider, Location, InsurancePlan, ProviderPlanAcceptance, VerificationLog, SyncLog | **Missing from prompt:** `provider_cms_details`, `provider_hospitals`, `provider_insurance`, `provider_medicare`, `provider_taxonomies`, `taxonomy_reference`, `VoteLog` |
| Provider indexes: `state`, `specialtyCode`, `lastName`, `firstName`, `city`, `organizationName`, `(state, specialtyCode)`, `locationId` | Provider indexes: `specialty_category`, `credential`, `gender`, `lastName`, `primary_specialty`, `primary_taxonomy_code` — no `state`, `city`, `firstName`, `organizationName` indexes |

**Action:** Rewrite sections 3, 4, and 5b to match the actual Prisma schema. Add all 7 missing models. Update all index listings.

---

#### `28-location-features.md` — MAJOR UPDATE NEEDED
**Problem:** Describes a `Location` model and API endpoints that are **disabled/non-functional** in the codebase.

- The `locations.ts` route file exists but is **disabled** — it depends on the old `Location` model
- `locationService.ts` has a TODO comment: needs rewrite for `practice_locations`
- `locationEnrichment.ts` also needs rewrite
- The Prisma schema code block in the prompt is **entirely wrong** — the model doesn't exist
- API endpoints described (`/health-systems`, `/:locationId`, `/:locationId/providers`) are active; `/:npi/colocated` added 2026-02-06
- Checklist marks database items as `[x]` implemented — this is **incorrect**

**Action:** Rewrite to reflect actual state: `practice_locations` table exists with address data, but the Location abstraction (grouping, naming, health systems) is **not implemented**. Mark the prompt tag as `planned` not `implemented`. Update schema, endpoints, and checklist.

---

#### `12-confidence-scoring.md` — SCORING FACTORS WRONG
**Problem:** The point allocations in the prompt don't match the actual code.

| Factor | Prompt Says | Code Actually Uses |
|---|---|---|
| Data Source Quality | 0-30 points | 0-25 points |
| Recency | 0-25 points | 0-30 points |
| Source scoring | User=30, Multiple CMS=25, Single CMS=20, Insurer=15, Inferred=5 | CMS=25, Carrier=20, Provider Portal=20, Phone=15, Crowdsource=15, Automated=10 |
| Recency tiers | Fixed: 0-30d, 31-90d, 91-180d, 181-365d, 1-2yr, 2+yr | **Specialty-dependent**: Mental Health=30d, Primary Care=60d, Specialist=60d, Hospital=90d |

**Action:** Update Section 1 scoring tables to match `confidenceService.ts`. Add specialty-specific freshness thresholds. Update source type names to match `VerificationSource` enum.

---

### HIGH — Missing Features/Endpoints

#### `06-api-routes.md` — INCOMPLETE ENDPOINT INVENTORY
**Problems:**
1. **Plan routes entirely undocumented** — no mention of: `GET /plans/search`, `GET /plans/grouped`, `GET /plans/meta/issuers`, `GET /plans/meta/types`, `GET /plans/:planId`, `GET /plans/:planId/providers`
2. **Admin endpoints incomplete** — missing: `POST /cache/clear`, `GET /cache/stats`, `POST /cleanup/sync-logs`, `GET /retention/stats`
3. **Locations route described as active** — it's actually disabled
4. **Verification endpoint** `GET /verify/:npi/:planId` not listed
5. No mention of CAPTCHA middleware on verify routes

**Action:** Add complete plan routes section. Update admin endpoints. Mark locations as disabled. Add CAPTCHA middleware references.

---

#### `09-external-apis.md` — SKELETAL, NEEDS FULL REWRITE
**Problem:** Only 4 lines of questions. The codebase now has significant external API integrations not mentioned:
- **Google reCAPTCHA v3 API** — verification on verify/vote endpoints
- **Anthropic Claude API** — insurance card extraction (`@anthropic-ai/sdk`)
- **PostHog API** — analytics event tracking
- **NPI Registry API** — `https://npiregistry.cms.hhs.gov/api/?version=2.1`
- No mention of FHIR as "not implemented" (prompt implies it might exist)

**Action:** Rewrite with inventory of all external APIs, their authentication, error handling, rate limits, and security considerations.

---

#### `11-environment-secrets.md` — SKELETAL, NEEDS FULL REWRITE
**Problem:** Only lists DATABASE_URL and ADMIN_SECRET. The codebase uses many more environment variables:

**Missing from prompt:**
- `RECAPTCHA_SECRET_KEY` — reCAPTCHA backend validation
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` — reCAPTCHA frontend
- `CAPTCHA_FAIL_MODE`, `CAPTCHA_MIN_SCORE`, `CAPTCHA_API_TIMEOUT_MS`, `CAPTCHA_FALLBACK_MAX_REQUESTS`, `CAPTCHA_FALLBACK_WINDOW_MS`
- `REDIS_URL` — Redis connection for distributed rate limiting/caching
- `ANTHROPIC_API_KEY` — Claude API for insurance card extraction
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` — analytics
- `NEXT_PUBLIC_API_URL` — frontend API base URL
- `CORS_ORIGIN` — allowed CORS origins
- `PORT`, `NODE_ENV`

**Action:** Rewrite with complete environment variable inventory, grouped by service (database, security, caching, analytics, external APIs).

---

### MEDIUM — Partially Outdated

#### `02-no-hipaa-compliance.md` — MINOR UPDATE
**Problem:** Section 5 lists Terms of Service, Privacy Policy, and Disclaimers as unchecked TODO items. The codebase now has:
- `app/privacy/page.tsx` — Privacy Policy page
- `app/terms/page.tsx` — Terms of Service page
- `app/disclaimer/page.tsx` — Medical Disclaimer page
- `components/Disclaimer.tsx` — Disclaimer component

**Action:** Check these `[x]` items. Also add note about insurance card upload feature and whether it affects the no-HIPAA position (card images are processed but not stored — should be documented).

---

#### `03-authentication.md` — UPDATE ADMIN SECTION
**Problem:** Admin auth section mentions only 3 endpoints (cleanup-expired, expiration-stats, health). The codebase now has 7 admin endpoints.

**Action:** Update admin endpoint list to include: `cache/clear`, `cache/stats`, `cleanup/sync-logs`, `retention/stats`.

---

#### `05-audit-logging.md` — IP ADDRESS CONTRADICTION
**Problem:** Prompt states "no IPs or user agents logged." But the codebase stores `sourceIp` in:
- `VerificationLog.sourceIp` — for Sybil prevention
- `VoteLog.sourceIp` — for vote deduplication

These are stored in the database, not just in logs. The prompt should clarify the distinction: IPs are not logged to application logs but ARE stored in database records for anti-abuse purposes.

**Action:** Update to distinguish between application logging (no PII) and database storage (IP for anti-abuse). Also add Pino logging details.

---

#### `08-rate-limiting.md` — UPDATE FOR REDIS
**Problem:** Tier 1 section describes only in-memory rate limiting. The codebase now has dual-mode: Redis (distributed) + in-memory (fallback).

**Action:** Update Tier 1 to document dual-mode implementation, Redis sorted set algorithm, fail-open behavior, and `X-RateLimit-Status: degraded` header.

---

#### `10-frontend-structure.md` — SKELETAL, NEEDS EXPANSION
**Problem:** Only 5 generic questions. The frontend has grown significantly:
- 8 pages (home, search, provider detail, location, insurance, research, about, privacy, terms, disclaimer)
- 40+ components organized by feature (home, provider-detail, compare, provider, search, UI, icons, illustrations, context)
- 6+ custom hooks for API data fetching
- 3 React contexts (Compare, Error, Theme)
- React Query for server state
- PostHog analytics provider
- Insurance card upload with Claude API
- Dark/light theme support
- Mobile-responsive with bottom navigation

**Action:** Expand with complete page inventory, component architecture, state management approach (React Query + Context), and key patterns.

---

#### `13-npi-data-pipeline.md` — SCHEMA REFERENCE OUTDATED
**Problem:** References old schema. Provider addresses are now in `practice_locations` table, not flattened on the Provider model. Also:
- `taxonomy-mappings.ts` location should be verified (prompt says root `src/`)
- Import script (`import-npi-direct.ts`) may have been updated for new schema
- State import counts may be outdated

**Action:** Update schema references. Verify script paths. Update import status if more states have been added.

---

#### `34-analytics-posthog.md` — VERIFY IMPLEMENTATION STATUS
**Problem:** Checklist marks most items as `[ ]` not done, but the codebase has:
- `PostHogProvider.tsx` in layout
- `analytics.ts` with event tracking functions
- Events defined for search, provider view, verification, comparison, etc.

**Action:** Verify which events are actually being called in components and update checklist accordingly.

---

#### `36-sybil-attack-prevention.md` — LAYER 4 IS ACTUALLY IMPLEMENTED
**Problem:** Prompt marks Layer 4 verification window checks as `[ ]` not done. But `verificationService.ts` actually implements:
- 30-day window check (Sybil prevention window from `constants.ts`)
- Duplicate IP detection
- 409 Conflict on duplicate submissions

**Action:** Check `[x]` for the verification window items that are implemented.

---

## SECTION 2: EMPTY TEMPLATE PROMPTS

These prompts contain only generic placeholder text with no substantive content:

| Prompt | Topic | Recommendation |
|---|---|---|
| `15-deployment-guide.md` | Deployment docs | **Populate** — Docker, Cloud Run, GitHub Actions all exist |
| `16-architecture-doc.md` | Architecture docs | **Populate** — full architecture is now clear and stable |
| `17-api-reference-doc.md` | API reference | **Populate** — all endpoints are defined and working |
| `18-troubleshooting-doc.md` | Troubleshooting | **Populate** — known issues exist (SWC ARM64, OneDrive, etc.) |
| `19-changelog-doc.md` | Changelog | **Populate** — significant changes have been made (Jan 2026) |
| `20-known-issues-doc.md` | Known issues | **Populate** — locations disabled, SWC patch, etc. |
| `23-data-quality-tracker.md` | Data quality | **Populate** — data quality issues documented in prompt 13 |
| `26-full-security-audit.md` | Meta security audit | **Populate or Delete** — could be a runner that references 01-13 |

---

## SECTION 3: PROMPTS THAT ARE ACCURATE (No Changes Needed)

| Prompt | Topic | Status |
|---|---|---|
| `00-index.md` | Master index | Accurate (but update after other prompts are fixed) |
| `04-csrf.md` | CSRF protection | Accurate — correctly states "not needed yet" |
| `07-input-validation.md` | Input validation | Accurate — Zod validation is implemented as described |
| `21-security-vulnerabilities.md` | Security vulns | Accurate — all 4 ZeroPath findings are fixed |
| `24-development-workflow.md` | Dev workflow | Accurate — workflow matches actual practice |
| `27-captcha-integration.md` | CAPTCHA | Accurate — implementation matches description |
| `29-insurance-card-upload.md` | Insurance card OCR | Accurate — comprehensive and matches code |
| `37-error-handling.md` | Error handling | Accurate — AppError/asyncHandler match code |

---

## SECTION 4: PROMPTS THAT ARE FINE AS-IS (Strategic/Reference)

These are Q&A templates or strategic docs that aren't meant to track codebase state:

| Prompt | Topic | Notes |
|---|---|---|
| `14-strategy-doc.md` | Business strategy template | Fine as-is |
| `22-ecosystem-integration.md` | Ecosystem strategy template | Fine as-is |
| `25-progress-status.md` | Progress tracker template | Fine as-is |
| `28-hospital-analysis-prompt.md` | NYC hospital research task | Fine as-is (standalone research task) |

---

## SECTION 5: DUPLICATE FILE TO CLEAN UP

`28-hospital-analysis-prompt.md` exists in **two locations** with identical content:
- `prompts/28-hospital-analysis-prompt.md`
- `prompts/Hospital Data Pull/28-hospital-analysis-prompt.md`

**Action:** Remove the root-level copy and keep only the subdirectory version (or vice versa). Also note the numbering conflict with `28-location-features.md`.

---

## SECTION 6: NEW PROMPTS RECOMMENDED

### 39 — Insurance Plans Feature
**Why:** The plans API is a significant feature with 6 endpoints, grouped search, issuer filtering, plan type metadata, and provider-plan relationships. No existing prompt covers this.

**Should cover:**
- Plan routes: `/api/v1/plans/search`, `/grouped`, `/meta/issuers`, `/meta/types`, `/:planId`, `/:planId/providers`
- `planService.ts` business logic
- `InsurancePlan` model and `ProviderPlanAcceptance` relationship
- Insurance plan import pipeline (`importInsurancePlans.ts`, `insurancePlanParser.ts`)
- Frontend: insurance page, plan search, plan filtering
- Carrier/health system grouping logic

---

### 40 — Docker & CI/CD Pipeline
**Why:** Docker containerization and GitHub Actions deployment are critical infrastructure with no prompt coverage.

**Should cover:**
- `docker-compose.yml` and `docker-compose.dev.yml` configuration
- Backend and frontend Dockerfiles (Node 20, non-root user, health checks)
- `.github/workflows/deploy.yml` — Cloud Run deployment pipeline
- `.github/workflows/playwright.yml` — E2E test pipeline
- GCP Artifact Registry, Workload Identity Federation
- Environment variable injection in Cloud Run
- Rollback procedures

---

### 41 — Frontend Data Fetching & State Management
**Why:** The frontend uses a sophisticated pattern of React Query + custom hooks + API client that is a core architectural decision with no prompt coverage.

**Should cover:**
- `@tanstack/react-query` setup (`QueryProvider.tsx`)
- API client (`lib/api.ts`) — retry logic, error handling, rate limit detection
- Custom hooks: `useProviderSearch`, `useCities`, `useInsurancePlans`, `useHealthSystems`, `useRecentSearches`
- Search state hooks: `useSearchForm`, `useFilterState`, `useSearchExecution`, `useSearchParams`
- React Contexts: `CompareContext`, `ErrorContext`, `ThemeContext`
- Client-side caching strategy vs server-side caching

---

### 42 — Provider Detail Page Architecture
**Why:** The provider detail page is the most complex page with 8+ sub-components, confidence scoring display, verification forms, co-located providers, and insurance acceptance data. No prompt covers this critical user-facing feature.

**Should cover:**
- `app/provider/[npi]/page.tsx` — data fetching and layout
- Sub-components: `ProviderHeroCard`, `ProviderHeader`, `ProviderSidebar`, `ProviderPlansSection`, `AboutProvider`, `ColocatedProviders`, `InsuranceList`
- `ConfidenceGauge` and `ScoreBreakdown` — visual confidence display
- `VerificationButton` and `ProviderVerificationForm` — verification submission flow
- `VerificationTimeline` — verification history
- Data flow: NPI lookup → provider data + plans + verifications + co-located

---

### 43 — Search Architecture
**Why:** Search is the primary user flow spanning backend (query building, caching, pagination) and frontend (form state, URL params, filters, debouncing, results display). No prompt covers this end-to-end.

**Should cover:**
- Backend: `providerService.ts` search logic, name parsing, medical title stripping, entity type mapping
- Backend caching: search result caching with normalized keys, 5-min TTL
- Frontend: `SearchForm` → `useSearchForm` → `useSearchExecution` → API → results
- URL parameter sync (`useSearchParams`)
- Filter system: `FilterDrawer`, `FilterButton`, state/city/specialty/name filters
- Pagination: server-side with metadata
- Recent searches: `useRecentSearches` hook
- `ProviderCard` display with compare checkbox integration

---

## SECTION 7: PRIORITY ORDER FOR UPDATES

**ALL ITEMS COMPLETED — 2026-02-05**

### Immediate (Schema/Architecture — would mislead AI) ✅
1. ✅ `01-database-schema.md` — REWRITTEN (added 7 missing models, fixed indexes, relationship diagram)
2. ✅ `28-location-features.md` — REWRITTEN (marked as needs-rewrite, documented disabled state)
3. ✅ `12-confidence-scoring.md` — REWRITTEN (fixed weights to 25/30/25/20, added specialty freshness)

### High (Missing coverage — significant features undocumented) ✅
4. ✅ `06-api-routes.md` — REWRITTEN (added plan routes, all admin endpoints, middleware chain)
5. ✅ `09-external-apis.md` — REWRITTEN (documented 5 external APIs)
6. ✅ `11-environment-secrets.md` — REWRITTEN (documented 20+ env vars, secret storage)
7. ✅ `39-insurance-plans.md` — CREATED (plan feature end-to-end)
8. ✅ `40-docker-cicd.md` — CREATED (Docker + CI/CD pipeline)

### Medium (Partially outdated — functional but incomplete) ✅
9. ✅ `10-frontend-structure.md` — REWRITTEN (comprehensive component/page/hook inventory)
10. ✅ `13-npi-data-pipeline.md` — UPDATED (schema refs, taxonomy tables, script inventory)
11. ✅ `02-no-hipaa-compliance.md` — UPDATED (checked compliance items, added card upload note)
12. ✅ `03-authentication.md` — UPDATED (expanded admin endpoints from 3 to 7)
13. ✅ `05-audit-logging.md` — UPDATED (clarified app logs vs DB storage distinction)
14. ✅ `08-rate-limiting.md` — UPDATED (added dual-mode architecture, CAPTCHA status)
15. ✅ `36-sybil-attack-prevention.md` — UPDATED (checked layer 4 items as implemented)
16. ✅ `34-analytics-posthog.md` — UPDATED (rewrote to match privacy-preserving implementation)

### Low (New prompts for completeness) ✅
17. ✅ `41-frontend-data-fetching.md` — CREATED (React Query, API client, hooks, contexts)
18. ✅ `42-provider-detail-page.md` — CREATED (provider detail architecture, component tree)
19. ✅ `43-search-architecture.md` — CREATED (end-to-end search flow, frontend + backend)

### Housekeeping ✅
20. ✅ Populated 8 empty templates (15, 16, 17, 18, 19, 20, 23, 26)
21. ✅ Removed duplicate `28-hospital-analysis-prompt.md` (kept `Hospital Data Pull/` copy)
22. ✅ Updated `00-index.md` with all new prompts, corrected descriptions, new sections

---

## SECTION 8: SECOND AUDIT — 2026-02-06

**Method:** Full codebase re-verification of all 45 prompts (00-44) against actual source code.

### Findings: 9 Prompts Updated, 1 Bug Discovered

#### Bug Discovered: Missing Backend Endpoints
The frontend API client (`lib/api.ts`) defines two methods that call backend endpoints which **do not exist**:
- `providerApi.getColocated(npi)` → `GET /providers/:npi/colocated` — **FIXED** (endpoint added 2026-02-06)
- `providerApi.getPlans(npi)` → `GET /providers/:npi/plans` — **404 at runtime**

**Remaining action:** Add `GET /providers/:npi/plans` to the backend, or update the frontend to use an alternative API.

#### Fixes Applied — 2026-02-06

| # | Prompt | Issue | Fix |
|---|--------|-------|-----|
| 1 | `02-no-hipaa-compliance.md` | Wrong schema path: `prisma/schema.prisma` | Fixed to `packages/backend/prisma/schema.prisma` |
| 2 | `03-authentication.md` | Said "7 total" admin endpoints, missing enrichment/stats and recalculate-confidence | Fixed to 9 total, added both endpoints, removed stale "enrichment disabled" note |
| 3 | `06-api-routes.md` | Missing enrichment/stats and recalculate-confidence from admin table; Q5 referenced disabled locations | Added both endpoints; fixed Q5 |
| 4 | `17-api-reference-doc.md` | Missing `/providers/cities`; said 7 admin endpoints; said locations DISABLED; missing location endpoints | Added cities, fixed to 9 admin, added location endpoints, fixed locations status; re-added `/providers/:npi/colocated` after endpoint was implemented |
| 5 | `18-troubleshooting-doc.md` | Said locations route disabled/commented out | Fixed: locations route is active with 5 endpoints on practice_locations |
| 6 | `34-analytics-posthog.md` | PostHogProvider code sample missing `autocapture:false`, `opt_out_capturing_by_default:true`, `disable_session_recording:true`, `PostHogPageview` component, sensitive param sanitization; wrong api_host; checklist said autocapture not disabled | Rewrote code sample to match actual implementation; added PostHogPageview docs; fixed privacy settings block; fixed checklist |
| 7 | `40-docker-cicd.md` | Missing `rollback.yml` workflow; checklist said "No rollback automation" | Added rollback.yml to files list, added rollback section, checked rollback item |
| 8 | `41-frontend-data-fetching.md` | Said "Backend locations route is disabled"; didn't flag plans as non-functional | Fixed locations note to active; added "no backend route — will 404" warning on getPlans; getColocated route was added 2026-02-06 |
| 9 | `32-ttl-data-expiration.md` | Wrong schema path: `prisma/schema.prisma` | Fixed to `packages/backend/prisma/schema.prisma` |

#### Prompts Confirmed Accurate (No Changes Needed) — 2026-02-06

All remaining prompts (00, 01, 04, 05, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 35, 36, 37, 38, 39, 42, 43, 44) were verified against the codebase and are accurate.
