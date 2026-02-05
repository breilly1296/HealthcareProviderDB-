# VerifyMyProvider Progress Status

**Last Updated:** 2026-02-05
**Generated From:** prompts/25-progress-status.md
**Current Phase:** Phase 1 (Proof of Concept) -- nearing completion
**Overall Completion:** ~70%

---

## Current Status

### Phase Completion

| Component | Status | Completion | Notes |
|-----------|--------|------------|-------|
| Infrastructure | Complete | 95% | Cloud Run, CI/CD, Docker, GCP Secret Manager all operational |
| Database | Complete | 90% | 13 models, indexes, constraints; NPI data imported |
| Backend API | Complete | 85% | 4 active route modules, 6 services, 7 middleware |
| Frontend | Complete | 80% | 10+ pages, 30+ components, 8+ hooks |
| Security | Complete | 85% | Rate limiting, CAPTCHA, input validation, admin auth |
| Testing | In Progress | 40% | Unit tests for confidence service, E2E smoke test, Playwright CI |
| Data Pipeline | In Progress | 60% | NPI imports done; insurance plan matching partially complete |

---

## What Is Implemented

### Backend (packages/backend)

**Routes (4 active, 1 disabled):**
| Route | File | Status | Description |
|-------|------|--------|-------------|
| `/api/v1/providers` | `providers.ts` | Active | Provider search and detail by NPI |
| `/api/v1/plans` | `plans.ts` | Active | Insurance plan search, metadata (issuers, types, years) |
| `/api/v1/verify` | `verify.ts` | Active | Verification submit, vote, stats, recent, pair lookup |
| `/api/v1/admin` | `admin.ts` | Active | Admin-only endpoints (cleanup, stats, cache) |
| `/api/v1/locations` | `locations.ts` | Disabled | Depends on old Location model; needs rewrite for practice_locations |

**Services (6 files):**
| Service | Description |
|---------|-------------|
| `providerService.ts` | Provider search, lookup, plan associations |
| `planService.ts` | Insurance plan search, metadata queries |
| `verificationService.ts` | Verification submission, voting, expiration cleanup |
| `confidenceService.ts` | 4-factor confidence scoring algorithm |
| `locationService.ts` | Location-related queries |
| `locationEnrichment.ts` | Location name enrichment (disabled pending model rewrite) |

**Middleware (7 files):**
| Middleware | Description |
|------------|-------------|
| `rateLimiter.ts` | Dual-mode Redis/in-memory, 4 tiers, fail-open |
| `captcha.ts` | reCAPTCHA v3, fail-open/closed modes, fallback rate limiting |
| `errorHandler.ts` | AppError class, Zod/Prisma error handling, no stack traces in prod |
| `requestId.ts` | Request ID generation for log correlation |
| `requestLogger.ts` | Usage tracking without PII |
| `httpLogger.ts` | Pino HTTP request logging |
| `index.ts` | Barrel export |

**Infrastructure files:**
| File | Description |
|------|-------------|
| `lib/prisma.ts` | Prisma client singleton |
| `lib/redis.ts` | Redis client with connection management |
| `config/constants.ts` | Centralized configuration constants |
| `utils/logger.ts` | Pino logger configuration |
| `utils/cache.ts` | In-memory cache with stats |

### Frontend (packages/frontend)

**Pages (10 routes):**
| Page | Path | Description |
|------|------|-------------|
| Home | `/` | Landing page with hero, CTA, how-it-works |
| Search | `/search` | Provider search with filters |
| Provider Detail | `/provider/[npi]` | Individual provider page with plans, confidence |
| Insurance | `/insurance` | Insurance plan search/browse |
| Location Detail | `/location/[locationId]` | Location-specific provider view |
| Research | `/research` | Research/methodology explanation |
| About | `/about` | About page |
| Privacy | `/privacy` | Privacy policy |
| Terms | `/terms` | Terms of service |
| Disclaimer | `/disclaimer` | Legal disclaimer |

**API Route:**
| Route | Description |
|-------|-------------|
| `/api/insurance-card/extract` | Server-side insurance card OCR via Anthropic Claude API |

**Components (30+ files across directories):**

| Directory | Components | Purpose |
|-----------|-----------|---------|
| `home/` | HeroSection, CTASection, HowItWorksSection, WhyItMattersSection, ConfidenceSection | Landing page sections |
| `provider-detail/` | ProviderHeader, ProviderHeroCard, ProviderSidebar, InsuranceList, AboutProvider, ColocatedProviders, ConfidenceGauge, ScoreBreakdown, ProviderPlansSection | Provider detail page |
| `provider/` | ConfidenceScoreExplainer, PlanAcceptanceCard, ResearchExplainer, VerificationCallToAction, VerificationTimeline | Provider verification UI |
| `providers/` | QueryProvider | TanStack Query provider wrapper |
| `compare/` | CompareBar, CompareCheckbox, CompareModal | Provider comparison feature |
| `ui/` | SearchableSelect, Shimmer, Skeleton | Reusable UI primitives |
| Root components | SearchForm, Header, BottomNav, ConfidenceBadge, FilterDrawer, InsuranceCardUploader, ProviderCard, LoadingSpinner, ErrorMessage, EmptyState, PostHogProvider, ToastProvider, etc. | Shared/global components |

**Hooks (8+ files):**
| Hook | Purpose |
|------|---------|
| `useProviderSearch.ts` | Provider search with TanStack Query |
| `useInsurancePlans.ts` | Insurance plan data fetching |
| `useCities.ts` | City autocomplete/lookup |
| `useHealthSystems.ts` | Health system data |
| `useCompare.ts` | Provider comparison state |
| `useRecentSearches.ts` | Recent search persistence |
| `useSearchForm.ts` | Search form state management |

### Database (Prisma Schema -- 13 models)

| Model | Primary Key | Description |
|-------|-------------|-------------|
| `Provider` | `npi` (VarChar 10) | Core provider table with NPI data |
| `practice_locations` | `id` (autoincrement) | Provider addresses (practice/mailing) |
| `provider_cms_details` | `npi` | CMS-sourced details (school, graduation, telehealth) |
| `provider_hospitals` | `id` (autoincrement) | Provider-hospital affiliations |
| `provider_insurance` | `id` (autoincrement) | Provider insurance network identifiers |
| `provider_medicare` | `id` (autoincrement) | Medicare IDs per provider |
| `provider_taxonomies` | `id` (autoincrement) | Provider specialty taxonomy codes |
| `taxonomy_reference` | `taxonomy_code` | Taxonomy code lookup table |
| `hospitals` | `ccn` | Hospital reference data |
| `InsurancePlan` | `planId` | Insurance plans with issuer/carrier info |
| `ProviderPlanAcceptance` | `id` (autoincrement) | Provider-plan acceptance with confidence scores |
| `VerificationLog` | `id` (cuid) | Community verification submissions |
| `VoteLog` | `id` (cuid) | Votes on verification entries |
| `SyncLog` | `id` (autoincrement) | Data import/sync tracking |

**Enums:** AcceptanceStatus, VerificationSource, VerificationType

### Infrastructure

| Component | Status | Details |
|-----------|--------|---------|
| GitHub Actions CI/CD | Active | `deploy.yml` -- auto-deploy on push to main |
| Playwright CI | Active | `playwright.yml` -- E2E tests on frontend changes |
| Docker (dev) | Active | `docker-compose.dev.yml` -- local PostgreSQL 15 |
| Docker (prod) | Active | Backend + Frontend Dockerfiles for Cloud Run |
| Cloud Run (backend) | Active | 512Mi, 0-10 instances, Cloud SQL connector |
| Cloud Run (frontend) | Active | 512Mi, 0-10 instances |
| Cloud SQL | Active | PostgreSQL, `verifymyprovider-db` in us-central1 |
| Artifact Registry | Active | Docker image storage |
| GCP Secret Manager | Active | DATABASE_URL, ADMIN_SECRET, ANTHROPIC_API_KEY |
| Workload Identity Federation | Active | Keyless GitHub-to-GCP auth |
| PostHog Analytics | Active | Frontend analytics tracking |

---

## Recently Completed

### Notable Accomplishments (based on codebase state)
- Full monorepo setup with npm workspaces (backend, frontend, shared)
- 13-model Prisma schema with comprehensive indexes
- Express API with 4 active route modules and full middleware stack
- Next.js 14 frontend with 10+ pages and 30+ components
- Dual-mode rate limiting (Redis + in-memory fallback)
- reCAPTCHA v3 integration with configurable fail-open/fail-closed
- Confidence scoring algorithm (4-factor)
- Community verification and voting system
- Insurance card OCR via Anthropic Claude API
- Provider comparison feature
- CI/CD pipeline with Docker builds and Cloud Run deployment
- Playwright E2E testing infrastructure
- Admin endpoints with timing-safe authentication
- Graceful shutdown with timeout protection
- Health check endpoint with database and cache status
- Windows ARM64 SWC compatibility fix (postinstall patch)

---

## Currently In Progress

- Location routes rewrite (commented out -- depends on old Location model, needs update for `practice_locations`)
- Location enrichment service (disabled pending model rewrite)
- Insurance plan matching pipeline (partial -- `ProviderPlanAcceptance` model exists, data population ongoing)
- Test coverage expansion (currently: 1 unit test file for confidence service, 1 E2E smoke test)

---

## Next Up (Priority Order)

### Immediate (Next 1-2 weeks) -- CRITICAL
1. **Re-enable locations route** -- Rewrite `locations.ts` to work with the `practice_locations` model instead of the old `Location` model
2. **Re-enable location enrichment** -- Update `locationEnrichment.ts` service for the new data model
3. **Expand test coverage** -- Add unit tests for providerService, planService, verificationService
4. **ADMIN_SECRET in production** -- Verify the deploy.yml `--remove-secrets=ADMIN_SECRET` line is intentional (currently removes the secret from the Cloud Run service)

### Short-term (Next month)
- [ ] Add more E2E tests beyond the smoke test
- [ ] Insurance plan data pipeline completion (populate ProviderPlanAcceptance at scale)
- [ ] Search result pagination and performance optimization
- [ ] User feedback collection mechanism

### Medium-term (Next quarter)
- [ ] User authentication system (currently admin-only via header secret)
- [ ] FHIR integration exploration
- [ ] Provider self-service portal
- [ ] Automated data refresh pipeline (NPI registry sync)

---

## Blockers

| Blocker | Impact | Workaround | Unblock Plan |
|---------|--------|------------|--------------|
| Location model mismatch | Locations route and enrichment service disabled | Direct DB queries via practice_locations model | Rewrite services to use `practice_locations` instead of old `Location` model |
| Limited test coverage | Risk of regressions on changes | Manual testing during development | Prioritize adding tests for core services |

---

## NPI Data Import Status

**Database Models for NPI Data:**
- `providers` -- Core NPI provider records
- `practice_locations` -- Practice and mailing addresses
- `provider_cms_details` -- CMS supplemental data
- `provider_taxonomies` -- Specialty taxonomy codes
- `provider_hospitals` -- Hospital affiliations
- `provider_insurance` -- Insurance network identifiers
- `provider_medicare` -- Medicare IDs

**Import Scripts Available:**
- `scripts/seed.ts` -- Database seeding
- `scripts/extract-nyc-providers.ts` -- NYC-specific provider extraction
- `scripts/analyze-health-systems.ts` -- Health system analysis
- `scripts/match-facilities.ts` -- Facility matching
- `scripts/enrich-location-names.ts` -- Location name enrichment
- `scripts/nyc-providers/` -- NYC provider data directory

**Sync Tracking:** The `SyncLog` model tracks import runs (type, state, records processed, status, errors, timestamps).

---

## Test Coverage

**Backend:**
- `confidenceService.test.ts` -- Unit tests for confidence scoring algorithm
- Jest configured with ts-jest

**Frontend:**
- `smoke.spec.ts` -- Playwright E2E smoke test
- Jest configured with babel-jest and jsdom environment
- Testing Library (React) available

**CI:**
- Playwright workflow runs on frontend changes to main
- No dedicated unit test CI workflow (tests run locally)

**Not Covered:**
- providerService, planService, verificationService (no unit tests)
- Route handler integration tests
- Middleware unit tests (rate limiter, captcha, error handler)
- Frontend component unit tests
- API contract/schema tests

---

## Deployment Status

- **Backend (Production):** Deployed on Cloud Run
  - Service: `verifymyprovider-backend`
  - Region: `us-central1`
  - Resources: 512Mi memory, 1 CPU, 0-10 instances
  - Cloud SQL connector attached
- **Frontend (Production):** Deployed on Cloud Run
  - Service: `verifymyprovider-frontend`
  - Region: `us-central1`
  - Resources: 512Mi memory, 1 CPU, 0-10 instances
  - Custom domain: `verifymyprovider.com`
- **Deployment method:** Push to `main` triggers GitHub Actions -> Docker build -> Cloud Run deploy

---

## Security Status

| Area | Status | Implementation |
|------|--------|----------------|
| Rate Limiting | Implemented | 4-tier, dual-mode Redis/in-memory, fail-open |
| CAPTCHA | Implemented | reCAPTCHA v3 on verification/vote, configurable fail mode |
| Input Validation | Implemented | Zod schemas on all endpoints |
| Admin Auth | Implemented | X-Admin-Secret header, timing-safe comparison |
| CORS | Implemented | Allowlist of production domains, localhost in dev |
| Helmet (CSP) | Implemented | Strict CSP for JSON-only API |
| Error Handling | Implemented | No stack traces in production, structured responses |
| Body Size Limits | Implemented | 100kb limit on JSON and URL-encoded payloads |
| Sybil Prevention | Implemented | IP + email dedup indexes, 30-day windows, vote uniqueness |
| HIPAA | Not Required | Public provider data only, no PHI stored |
| User Auth | Not Yet | No user accounts; admin-only via secret header |
| CSRF | Not Required | No auth cookies in use |

---

## Known Issues

| Issue | Priority | Workaround | ETA |
|-------|----------|------------|-----|
| Locations route disabled | Medium | Data accessible via provider detail page | Pending practice_locations rewrite |
| Location enrichment disabled | Low | Location data available but not enriched | Pending model rewrite |
| `--remove-secrets=ADMIN_SECRET` in deploy.yml | Investigate | May be intentional (admin disabled in prod) | Needs confirmation |
| Limited automated test coverage | Medium | Manual testing | Ongoing expansion |
| tmpclaude-* directories in services/ | Low | Leftover temp directories from Claude Code sessions | Manual cleanup |

---

## Decisions Needed

- [ ] **Locations rewrite approach** -- Rewrite locations route to use `practice_locations` or create a new location abstraction layer?
- [ ] **User authentication strategy** -- When to implement user accounts? OAuth, email/password, or passwordless?
- [ ] **ADMIN_SECRET in production** -- Should admin endpoints be accessible in production or disabled?
- [ ] **Insurance data pipeline** -- What is the source and refresh cadence for insurance plan acceptance data?
- [ ] **Staging environment** -- Should a staging Cloud Run service be set up for pre-production testing?

---

## Success Metrics

### Phase 1 (Proof of Concept) -- Current
| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Core pages live | 5+ | 10+ | Achieved |
| API endpoints functional | 10+ | 15+ | Achieved |
| Provider records in DB | 1,000+ | Data imported (NYC+) | On track |
| Security baseline | Rate limiting + validation | Full middleware stack | Achieved |

### Phase 2 (One-City Utility)
| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Community verifications | 100+ | System built, not at scale yet | In progress |
| Insurance plan coverage | 50+ plans | Model exists, data pipeline partial | In progress |
| Test coverage | 60%+ | ~40% estimated | Behind |

---

## Timeline

- **Phase 1 (MVP/PoC):** Largely complete -- infrastructure, API, frontend, security all operational
- **Phase 2 (One-City Utility):** In progress -- data enrichment, verification volume, test coverage
- **Beta Launch:** Pending data pipeline completion and test coverage increase
- **Public Launch:** TBD

---

## Top Risks

1. **Data freshness** -- NPI and insurance data can become stale; no automated refresh pipeline yet
   - Mitigation: `SyncLog` model tracks imports; build scheduled sync jobs (scripts exist in `scripts/`)

2. **Low test coverage** -- Regressions possible on rapid changes with ~40% coverage
   - Mitigation: Prioritize tests for core services; Playwright CI catches frontend breakage

3. **Single-developer bottleneck** -- All development through Claude Code by one person
   - Mitigation: Good documentation, CI/CD automation, structured codebase

4. **Insurance data gaps** -- ProviderPlanAcceptance relies on data that may be incomplete
   - Mitigation: Community verification system fills gaps; confidence scoring reflects data quality

---

## Next Session Focus

**Priority for next coding session:**
1. Investigate and fix the locations route (rewrite for `practice_locations`)
2. Add unit tests for providerService and verificationService
3. Clean up tmpclaude-* temp directories in services/

**Questions to answer:**
- Is the `--remove-secrets=ADMIN_SECRET` in deploy.yml intentional?
- What is the current provider count in the production database?
- Are insurance plan imports running or stalled?
