---
tags:
  - index
  - meta
type: index
priority: 1
updated: 2026-02-06
---

# VerifyMyProvider -- Project Overview & Prompt Directory

## Project Summary

**VerifyMyProvider** is a full-stack web application that helps patients verify whether healthcare providers accept their insurance plans. It combines official CMS/NPI Registry data with community-sourced verifications, scored by a research-backed confidence algorithm.

- **Repository:** `github.com/breilly1296/HealthcareProviderDB-`
- **Domain:** verifymyprovider.com
- **Architecture:** npm workspaces monorepo (`packages/backend`, `packages/frontend`, `packages/shared`)
- **Backend:** Express 4.18 + Prisma 5.22 + PostgreSQL (Google Cloud SQL)
- **Frontend:** Next.js 14.2 (App Router) + React 18.3 + TailwindCSS 3.3 + React Query 5.x
- **Infrastructure:** Docker + Google Cloud Run + GitHub Actions CI/CD
- **Database:** `verifymyprovider` on Cloud SQL (`us-central1`), ~2.1M provider records
- **HIPAA:** NOT required -- public data only, no PHI stored

---

## Prompt Directory

### Security & Architecture Prompts (01-13)

| # | Prompt | Purpose | Priority | Status |
|---|--------|---------|----------|--------|
| 01 | `01-database-schema` | 15 Prisma models, indexes, relationships | Critical | Accurate |
| 02 | `02-no-hipaa-compliance` | Why no HIPAA needed (public data only) | Critical | Needs minor update (checklist items unchecked) |
| 03 | `03-authentication` | Admin auth (X-Admin-Secret) + future strategy | High | Accurate |
| 04 | `04-csrf` | CSRF protection (not needed yet -- no auth cookies) | Medium | Accurate |
| 05 | `05-audit-logging` | Structured logging, PII exclusion, DB audit trail | Medium | Needs minor update (checklist items unchecked) |
| 06 | `06-api-routes` | All API endpoints: providers, plans, verify, locations, admin | High | Accurate |
| 07 | `07-input-validation` | Zod validation on all endpoints | High | Accurate |
| 08 | `08-rate-limiting` | Dual-mode (Redis/in-memory), sliding window, CAPTCHA | Critical | Accurate |
| 09 | `09-external-apis` | 5 APIs: reCAPTCHA, Claude, PostHog, NPI Registry, Redis | Medium | Accurate |
| 10 | `10-frontend-structure` | Next.js pages, 40+ components, state management | Medium | Accurate |
| 11 | `11-environment-secrets` | 20+ env vars, GCP Secret Manager, CI/CD injection | Critical | Accurate |
| 12 | `12-confidence-scoring` | 4-factor algorithm (25/30/25/20), specialty-aware | High | Accurate |
| 13 | `13-npi-data-pipeline` | Import scripts, taxonomy mapping, data quality | High | Accurate |

### Documentation Prompts (14-25)

| # | Prompt | Generates | Status |
|---|--------|-----------|--------|
| 14 | `14-strategy-doc` | Business strategy | Template (Q&A) |
| 15 | `15-deployment-guide` | Deployment guide | Populated -- Docker, Cloud Run, CI/CD |
| 16 | `16-architecture-doc` | Architecture doc | Populated -- full-stack overview |
| 17 | `17-api-reference-doc` | API reference | Populated -- all endpoints cataloged |
| 18 | `18-troubleshooting-doc` | Troubleshooting | Populated -- known issues + workarounds |
| 19 | `19-changelog-doc` | Changelog | Populated -- Jan 2026 milestones |
| 20 | `20-known-issues-doc` | Known issues | Populated -- known issues documented |
| 21 | `21-security-vulnerabilities` | Security vulns | Accurate -- 4 ZeroPath findings resolved |
| 22 | `22-ecosystem-integration` | Ecosystem strategy | Template (Q&A) |
| 23 | `23-data-quality-tracker` | Data quality | Populated -- NPI, plans, verification quality |
| 24 | `24-development-workflow` | Dev workflow | Accurate |
| 25 | `25-progress-status` | Progress tracker | Template (Q&A) |

### Meta Prompts (26-27)

| # | Prompt | Purpose |
|---|--------|---------|
| 26 | `26-full-security-audit` | Run all security prompts (checklist + summary) |
| 27 | `27-captcha-integration` | CAPTCHA implementation (reCAPTCHA v3) |

### Feature Prompts (28-44)

| # | Prompt | Purpose | Status |
|---|--------|---------|--------|
| 28 | `28-location-features` | Location abstraction (practice_locations) | Active |
| 29 | `29-insurance-card-upload` | Insurance card OCR via Claude AI | Accurate |
| 30 | `30-testing-strategy` | Testing approach | Reference |
| 31 | `31-redis-caching` | Redis caching strategy | Reference |
| 32 | `32-ttl-data-expiration` | TTL and data expiration | Reference |
| 33 | `33-provider-comparison` | Provider comparison feature | Reference |
| 34 | `34-analytics-posthog` | PostHog analytics (privacy-preserving) | Accurate |
| 35 | `35-monorepo-structure` | npm workspace monorepo | Reference |
| 36 | `36-sybil-attack-prevention` | 4-layer anti-spam (all implemented) | Accurate |
| 37 | `37-error-handling` | AppError class + asyncHandler | Accurate |
| 38 | `38-admin-endpoints` | Admin endpoints reference | Reference |
| 39 | `39-insurance-plans` | Insurance plans feature (end-to-end) | Accurate |
| 40 | `40-docker-cicd` | Docker + CI/CD pipeline | Accurate |
| 41 | `41-frontend-data-fetching` | React Query, API client, state management | Accurate |
| 42 | `42-provider-detail-page` | Provider detail page architecture | Accurate |
| 43 | `43-search-architecture` | Search flow (frontend + backend) | Accurate |
| 44 | `44-seo-sitemap` | SEO strategy, dynamic sitemap, provider page ISR | Accurate |

### Standalone Research

| Location | Prompt | Purpose |
|----------|--------|---------|
| `Hospital Data Pull/` | `28-hospital-analysis-prompt` | NYC hospital affiliation research task |

---

## Codebase Architecture Summary

### Database (15 Prisma Models)

**Provider Data (7 models):**
- `Provider` (`providers`) -- NPI registry data (2.1M records)
- `practice_locations` -- Provider addresses (one-to-many via NPI)
- `provider_cms_details` -- CMS enrichment (medical school, telehealth, etc.)
- `provider_hospitals` -- Hospital affiliations
- `provider_insurance` -- Insurance network memberships
- `provider_medicare` -- Medicare identifiers
- `provider_taxonomies` -- All taxonomy codes per provider

**Reference Data (2 models):**
- `taxonomy_reference` -- Taxonomy code lookup table
- `hospitals` -- Hospital master data (CCN-keyed)

**Insurance & Verification (4 models):**
- `InsurancePlan` (`insurance_plans`) -- Insurance plan catalog
- `ProviderPlanAcceptance` (`provider_plan_acceptance`) -- Provider-plan relationships with confidence scores
- `VerificationLog` (`verification_logs`) -- Community verification audit trail
- `VoteLog` (`vote_logs`) -- Up/down votes on verifications

**Operational (2 models):**
- `SyncLog` (`sync_logs`) -- Data import tracking
- `DataQualityAudit` (`data_quality_audit`) -- Data quality issue tracking

### API Routes

| Route Group | Base Path | Endpoints | Key Middleware |
|-------------|-----------|-----------|----------------|
| Providers | `/api/v1/providers` | search, cities, /:npi | Zod, rate limiter, caching |
| Plans | `/api/v1/plans` | search, grouped, meta/issuers, meta/types, /:planId, /:planId/providers | Zod, rate limiter |
| Verify | `/api/v1/verify` | POST /, POST /:id/vote, stats, recent, /:npi/:planId | CAPTCHA, honeypot, rate limiter |
| Locations | `/api/v1/locations` | search, health-systems, stats/:state, /:locationId, /:locationId/providers | Zod, rate limiter |
| Admin | `/api/v1/admin` | cleanup-expired, expiration-stats, health, cache/clear, cache/stats, enrichment/stats, cleanup/sync-logs, retention/stats, recalculate-confidence | X-Admin-Secret auth |

### Frontend Pages

| Page | Path | Description |
|------|------|-------------|
| Home | `/` | Landing page with hero, how-it-works, confidence explainer |
| Search | `/search` | Provider search with filters, results, pagination |
| Provider Detail | `/provider/[npi]` | Full provider info, confidence gauge, verification form |
| Insurance | `/insurance` | Insurance card upload (Claude AI OCR) |
| Location | `/location/[locationId]` | Location detail with co-located providers |
| Research | `/research` | Research methodology |
| About | `/about` | About page |
| Terms | `/terms` | Terms of Service |
| Privacy | `/privacy` | Privacy Policy |
| Disclaimer | `/disclaimer` | Medical Disclaimer |

### Frontend Component Organization

| Directory | Contents | Examples |
|-----------|----------|---------|
| `components/home/` | Landing page sections | HeroSection, HowItWorksSection, ConfidenceSection |
| `components/provider-detail/` | Provider page components | ProviderHeroCard, ConfidenceGauge, ScoreBreakdown, InsuranceList |
| `components/compare/` | Provider comparison | CompareBar, CompareModal, CompareCheckbox |
| `components/provider/` | Provider-related UI | VerificationTimeline, PlanAcceptanceCard, ConfidenceScoreExplainer |
| `components/ui/` | Shared UI primitives | SearchableSelect, Shimmer, Skeleton |
| `components/icons/` | Icon components | Icons |
| `components/illustrations/` | SVG illustrations | NoResultsIllustration, SearchLandingIllustration |
| `components/providers/` | React Query provider | QueryProvider |

### Key Custom Hooks

| Hook | Purpose |
|------|---------|
| `useProviderSearch` | Provider search with React Query |
| `useCities` | City dropdown data for a state |
| `useHealthSystems` | Health system dropdown data |
| `useInsurancePlans` | Insurance plan grouped search |
| `useSearchForm` | Search form state management |
| `useRecentSearches` | Recent search history (localStorage) |
| `useCompare` | Provider comparison context |
| `search/useFilterState` | Filter drawer state |
| `search/useSearchExecution` | Search execution and loading state |
| `search/useSearchParams` | URL parameter sync |

### React Contexts

| Context | Purpose |
|---------|---------|
| `ThemeContext` | Dark/light/system theme with localStorage persistence |
| `CompareContext` | Provider comparison state (up to N providers) |
| `ErrorContext` | Global error banner state |

### External API Integrations

| API | Purpose | Auth | Used In |
|-----|---------|------|---------|
| Google reCAPTCHA v3 | Bot detection on verify/vote | `RECAPTCHA_SECRET_KEY` | Backend middleware |
| Anthropic Claude | Insurance card OCR extraction | `ANTHROPIC_API_KEY` | Frontend API route |
| PostHog | Privacy-preserving analytics | `NEXT_PUBLIC_POSTHOG_KEY` | Frontend provider |
| NPI Registry | Provider data source | None (public) | Import scripts |
| Redis (ioredis) | Distributed rate limiting + caching | `REDIS_URL` | Backend lib |

### Infrastructure

| Component | Technology |
|-----------|-----------|
| Containers | Docker (backend + frontend Dockerfiles, docker-compose.yml) |
| CI/CD | GitHub Actions (deploy.yml, deploy-staging.yml, test.yml, playwright.yml, security-scan.yml) |
| Hosting | Google Cloud Run (us-central1) |
| Database | Cloud SQL PostgreSQL |
| Secrets | GCP Secret Manager |
| Registry | GCP Artifact Registry |

---

## Quick Start

### New to the Project?
1. Start with `16-architecture-doc` to understand the system
2. Read `01-database-schema` for the data model
3. Check `20-known-issues-doc` for current limitations
4. Read `15-deployment-guide` for setup instructions

### Running a Security Audit?
1. Use `26-full-security-audit` for comprehensive review
2. Or run individual prompts 01-13 as needed
3. Check `21-security-vulnerabilities` for resolved findings
4. Check `36-sybil-attack-prevention` for anti-spam layers

### Understanding a Feature?
1. **Search flow:** `43-search-architecture`
2. **Provider detail:** `42-provider-detail-page`
3. **Insurance plans:** `39-insurance-plans`
4. **Data fetching:** `41-frontend-data-fetching`
5. **Confidence scoring:** `12-confidence-scoring`
6. **SEO/Sitemap:** `44-seo-sitemap`

### Updating Documentation?
1. Run individual prompts 14-25 as needed
2. All doc prompts have context and questions pre-populated

### Troubleshooting?
1. Check `18-troubleshooting-doc` for known solutions
2. Check `20-known-issues-doc` for known limitations
3. Check `24-development-workflow` for dev environment setup

---

## Usage Tips

### In Claude Code
Best for prompts that scan code:
- 01-13 (security & architecture audits)
- 39-44 (feature deep-dives)
- 16-architecture-doc, 17-api-reference-doc

### In Claude.ai
Best for Q&A prompts:
- 14-strategy-doc
- 18-troubleshooting-doc
- 22-ecosystem-integration
- 24-development-workflow
- 25-progress-status

---

## Key Differences from OwnMyHealth

| Aspect | OwnMyHealth | VerifyMyProvider |
|--------|-------------|------------------|
| HIPAA | Required | NOT required |
| Encryption | PHI at rest | Not needed |
| Compliance | Complex | Simple |
| Auth | Full accounts | Admin-only (no user auth yet) |
| Data Type | Private health | Public provider data |

---

## Prompt Maintenance

These prompts should be updated when:
- New features are added or existing features change significantly
- Security vulnerabilities are discovered or resolved
- Architecture changes (new services, database changes, etc.)
- New external API integrations are added

**Total prompts:** 45 files (00-44) + 1 standalone research prompt
**Last full audit:** 2026-02-06 (see `PROMPT-AUDIT-REPORT.md`)
