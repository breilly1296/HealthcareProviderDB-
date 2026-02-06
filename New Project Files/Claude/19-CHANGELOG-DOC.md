# VerifyMyProvider Changelog

**Last Updated:** 2026-02-06
**Format:** Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
**Versioning:** Date-based (project is pre-1.0, no semver yet)

---

## [2026-02-06] -- Documentation Sprint

### Added
- Comprehensive project documentation suite (architecture, deployment, API reference, strategy, troubleshooting, known issues, changelog, NPI data pipeline)

### Changed
- Updated all project documentation to reflect current codebase state

---

## [2026-01 to 2026-02] -- Security Hardening and CI/CD

### Added -- Security
- **Rate limiting middleware** (`packages/backend/src/middleware/rateLimiter.ts`): Dual-mode implementation supporting both Redis (distributed) and in-memory (single-instance) sliding window algorithm. Four pre-configured tiers: default (200/hr), search (100/hr), verification (10/hr), vote (10/hr). Includes fail-open behavior when Redis becomes unavailable.
- **Google reCAPTCHA v3 integration** (`packages/backend/src/middleware/captcha.ts`): Score-based bot detection on verification and vote endpoints. Configurable fail-open/fail-closed modes with fallback rate limiting (3/hr) when Google API is unavailable. 5-second API timeout.
- **Honeypot bot detection** (`packages/backend/src/middleware/honeypot.ts`): Hidden `website` field on verification and vote forms. Returns fake 200 OK response when triggered to avoid alerting bots.
- **Sybil attack prevention**: 4-layer defense -- IP-based and email-based deduplication within 30-day sliding windows (`SYBIL_PREVENTION_WINDOW_MS`), combined with rate limiting and CAPTCHA.
- **Vote deduplication**: Unique constraint on `(verificationId, sourceIp)` in VoteLog model. Allows vote direction changes but prevents duplicate votes.
- **Helmet security headers** (`packages/backend/src/index.ts`): Strict CSP (`default-src 'none'` for JSON API), HSTS, no-referrer policy, frame-ancestors 'none', cross-origin policies.
- **Admin authentication**: Timing-safe comparison of `X-Admin-Secret` header via `crypto.timingSafeEqual` in admin middleware.
- **PII stripping**: `stripVerificationPII()` function removes sourceIp, userAgent, submittedBy from API responses.
- **Request body size limit**: 100KB limit on `express.json()` and `express.urlencoded()` to prevent large payload attacks.

### Added -- Confidence Scoring
- **4-factor confidence scoring algorithm** (`packages/backend/src/services/confidenceService.ts`): Data Source (0-25 points), Recency (0-30 points), Verification Count (0-25 points), Agreement (0-20 points). Research-based thresholds (Mortensen et al. 2015).
- **Specialty-specific freshness thresholds**: Mental Health 30 days (43% Medicaid acceptance, highest churn), Primary Care 60 days (12% annual turnover), Specialist 60 days, Hospital-based 90 days.
- **Confidence levels**: VERY_HIGH (91+), HIGH (76-90), MEDIUM (51-75), LOW (26-50), VERY_LOW (0-25). With fewer than 3 verifications, maximum level capped at MEDIUM.
- **Confidence decay service** (`packages/backend/src/services/confidenceDecayService.ts`): Batch recalculation of all confidence scores with cursor-based pagination. Admin-triggered via POST `/api/v1/admin/recalculate-confidence`.
- **Consensus thresholds**: Requires 3+ verifications AND 2:1 majority ratio AND confidence score >= 60 before changing acceptance status.

### Added -- Admin Endpoints (9 total)
- `POST /api/v1/admin/cleanup-expired` -- Clean expired verification records (supports dry run, configurable batch size)
- `GET /api/v1/admin/expiration-stats` -- View expiration statistics
- `GET /api/v1/admin/health` -- Detailed health check with retention metrics
- `POST /api/v1/admin/cache/clear` -- Clear all cached data
- `GET /api/v1/admin/cache/stats` -- Cache hit/miss statistics with hit rate
- `GET /api/v1/admin/enrichment/stats` -- Location enrichment statistics
- `POST /api/v1/admin/cleanup/sync-logs` -- Clean sync logs older than configurable retention (default 90 days)
- `GET /api/v1/admin/retention/stats` -- Comprehensive retention statistics for all log types
- `POST /api/v1/admin/recalculate-confidence` -- Trigger confidence score recalculation with decay

### Added -- Logging and Observability
- **Structured logging via Pino** (`packages/backend/src/utils/logger.ts`, `packages/backend/src/middleware/requestLogger.ts`): PII-free request logging, JSON-formatted output.
- **Request ID correlation** (`packages/backend/src/middleware/requestId.ts`): UUID v4 request IDs added to all requests for log tracing.
- **HTTP request/response logging** (`packages/backend/src/middleware/httpLogger.ts`): Pino HTTP middleware for automated request lifecycle logging.

### Added -- Insurance Plans
- **Insurance plan import pipeline**: InsurancePlan Prisma model with planId, planName, issuerName, planType, carrier, state fields.
- **6 plan endpoints** (`packages/backend/src/routes/plans.ts`): search, grouped (by carrier), meta/issuers, meta/types, :planId/providers, :planId detail.
- **Plan service** (`packages/backend/src/services/planService.ts`): Search with filtering, grouping by carrier, issuer/type metadata queries.

### Added -- Insurance Card OCR
- **Claude AI-powered insurance card upload** (`packages/frontend/src/app/insurance/`): Users can upload insurance card photos for automatic plan detail extraction via Anthropic Claude SDK.
- **Anthropic SDK integration**: `@anthropic-ai/sdk` 0.71 in frontend dependencies.

### Added -- Frontend Features
- **Provider comparison feature**: Compare up to 4 providers side-by-side. Context provider (`CompareProvider`) with `CompareBar` component.
- **Dark/light theme support**: `ThemeProvider` context with system preference detection.
- **PostHog analytics** (privacy-preserving): PostHog provider in root layout, `NEXT_PUBLIC_POSTHOG_KEY` build-time variable.
- **Cookie consent component**: `CookieConsent` in root layout.
- **Location detail page** (`packages/frontend/src/app/location/[locationId]/page.tsx`): Frontend page for viewing practice location details and co-located providers.
- **Error boundary context**: `ErrorProvider` for global error handling.

### Added -- Infrastructure
- **Docker containerization**: Multi-stage Dockerfiles for backend and frontend. Non-root user execution (UID 1001). Health checks via wget. Port 8080 internal.
- **docker-compose.yml**: Full stack local setup (PostgreSQL + backend + frontend).
- **docker-compose.dev.yml**: Database-only setup for local development.
- **GitHub Actions CI/CD** (`.github/workflows/deploy.yml`): Production pipeline -- test, deploy-backend, deploy-frontend, summary. Workload Identity Federation (keyless GCP auth), Docker Buildx with layer caching, Artifact Registry, Cloud Run deployment with smoke test.
- **Staging pipeline** (`.github/workflows/deploy-staging.yml`): Triggers on `staging` branch. Max 2 instances (vs 10 in production).
- **Test workflow** (`.github/workflows/test.yml`): Runs on PRs.
- **Playwright E2E workflow** (`.github/workflows/playwright.yml`).
- **Security scan workflow** (`.github/workflows/security-scan.yml`).

### Added -- Location Endpoints (5 total)
- `GET /api/v1/locations/search` -- Search practice locations by state (required), city, zipCode
- `GET /api/v1/locations/health-systems` -- Get distinct health system names
- `GET /api/v1/locations/stats/:state` -- Location statistics per state
- `GET /api/v1/locations/:locationId` -- Single location detail
- `GET /api/v1/locations/:locationId/providers` -- Co-located providers at a location

### Changed
- **practice_locations replaced old Location model**: Migrated from embedded address fields on Provider to a separate `practice_locations` table. Enables multi-location providers, location-specific verifications, and co-located provider queries. Linked via NPI.
- **Verification system expanded**: VerificationLog now includes Sybil prevention fields (sourceIp, userAgent, submittedBy), TTL via expiresAt, verification type enum.
- **ProviderPlanAcceptance**: Added locationId for location-specific acceptance tracking, TTL via expiresAt, confidence scoring fields.
- **Error handler expanded** (`packages/backend/src/middleware/errorHandler.ts`): Now handles Zod validation errors (with field-level details), Prisma errors (P2002 duplicate, P2025 not found), PayloadTooLarge errors, plus AppError class with static factory methods.

---

## [2025 Q4] -- NPI Import and Foundation

### Added -- Data Import
- **NPI bulk import script** (`scripts/import-npi-direct.ts`): Direct PostgreSQL insertion via `pg.Pool` (not Prisma) for performance. Batch size 5000 records. Upsert via `INSERT ... ON CONFLICT`. SHA-256 file hash tracking. Sync log entries. Deactivated provider filtering. Retry logic (3 retries, 2-second delays).
- **6 states imported**: FL (614k), CA (1.1M), AZ (168k), AL (91k), AR (83k), AK (35k). Total: ~2.1M providers.
- **Taxonomy mapping** (`src/taxonomy-mappings.ts`): 55 specialty categories, 400+ explicit taxonomy code mappings, 80+ prefix-based fallback mappings. Two-tier matching (exact code, then longest-prefix).
- **City normalization script** (`scripts/normalize-city-names.ts`): Covers 6 major metros (NYC, LA, Chicago, Houston, Phoenix, Philadelphia). Hundreds of neighborhood-to-city mappings and typo corrections. Dry run and apply modes. Transactional updates.

### Added -- Database Schema (15 Prisma Models)
- **Core**: Provider (NPI-keyed), InsurancePlan, practice_locations
- **Verification**: ProviderPlanAcceptance, VerificationLog, VoteLog
- **Enrichment**: provider_cms_details, provider_hospitals, provider_insurance, provider_medicare, provider_taxonomies, taxonomy_reference
- **Operational**: SyncLog, DataQualityAudit
- **Supporting**: hospitals (CCN-keyed)
- **Enums**: AcceptanceStatus, VerificationSource, VerificationType

### Added -- Backend API Foundation
- **Express.js server** (`packages/backend/src/index.ts`): Middleware chain (requestId, httpLogger, helmet, cors, json, health check, rateLimiter, requestLogger, API routes, 404 handler, error handler). CORS allowlist. Graceful shutdown with 10-second timeout. Trust proxy for Cloud Run.
- **Provider endpoints** (3): search (with caching), cities, :npi detail with full enrichment
- **Verification endpoints** (5): submit, vote, stats, recent, pair lookup
- **Search caching**: 5-minute TTL, invalidated on new verification submission
- **Zod validation schemas** (`packages/backend/src/schemas/commonSchemas.ts`): Shared pagination, NPI, state, planId schemas

### Added -- Frontend Foundation
- **Next.js 14 App Router**: Pages for home, search, provider detail, insurance card upload, location detail, about, privacy, terms, disclaimer, research
- **Home page sections**: HeroSection, WhyItMattersSection, HowItWorksSection, ConfidenceSection, CTASection
- **React Query**: Data fetching with `@tanstack/react-query`
- **TailwindCSS**: Styling framework
- **Root layout providers**: PostHog, QueryProvider, ThemeProvider, CompareProvider, ErrorProvider

### Added -- Development Tooling
- **npm workspaces monorepo**: 3 packages (backend, frontend, shared)
- **Windows ARM64 SWC patch** (`packages/frontend/scripts/patch-next-swc.js`): Postinstall script for WASM fallback
- **Concurrent dev script**: `npm run dev` runs backend (tsx watch) and frontend (next dev) simultaneously

---

## [2025 Earlier] -- Project Inception

### Added
- Initial project setup
- PostgreSQL database provisioned on Google Cloud SQL
- GitHub repository created (`breilly1296/HealthcareProviderDB-`)
- Domain registered: verifymyprovider.com
- Google Cloud Platform project configured (Cloud Run, Artifact Registry, Secret Manager)

---

## Checklist Status

- [x] Changelog generated from codebase analysis
- [x] Organized by date ranges
- [x] Categories: Added, Changed
- [x] Breaking changes highlighted (practice_locations migration)
- [ ] Links to relevant PRs/commits (git history not accessible in this session)
- [ ] Automated changelog generation from git history

---

## Answers to Prompt Questions

1. **What is the project start date?** -- Based on codebase evidence, the project started in 2025. The earliest concrete reference is the decision log entries dated "2025" in the strategy document. The GCP infrastructure and initial NPI imports predate the January 2026 security hardening sprint.

2. **Are there any unreleased features currently in development?** -- Based on the codebase: (a) 44 remaining state imports for NPI data, (b) city name normalization not yet run across all imported data, (c) FHIR API integration for provider detail enrichment is planned but not implemented, (d) monthly NPI delta update automation is planned, (e) B2B API access portal is planned for Q2 2026.

3. **Should the changelog follow a specific format?** -- This changelog uses a format inspired by Keep a Changelog, adapted for a project that is pre-1.0 and uses date-based versioning rather than semver. Once the project reaches beta, adopting strict semver with a CHANGELOG.md at the repository root is recommended.

4. **Should breaking changes be called out separately?** -- The migration from embedded address fields to `practice_locations` table was the most significant breaking change. It is documented above under "Changed". Future breaking changes (e.g., API v2) should be called out with a "BREAKING" prefix.

5. **What is the versioning strategy?** -- Currently date-based (no semver). The API is versioned via URL path (`/api/v1`). Recommended: adopt semver when the project reaches beta (0.1.0) and strict semver at 1.0 public launch.
