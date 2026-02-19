# VerifyMyProvider Changelog

**Generated:** 2026-02-18
**Format:** Based on [Keep a Changelog](https://keepachangelog.com/)
**Versioning:** Date-based (YYYY-MM-DD)

---

## [Unreleased]

### Planned
- NYC provider data import (5-borough zip code filter, ~50-75K providers)
- Public beta launch to r/osteoporosis
- Mount Sinai and NYP provider URL replacement searches
- Pro tier ($4.99/month)

---

## [2026-02] February 2026

### Added
- **Enrichment protection system (Phase 6)** -- `data_source` column on `providers` and `practice_locations` tables (VARCHAR(30), default 'nppes'); `enriched_at` and `enrichment_source` on `practice_locations`
- **Import conflicts table** -- `import_conflicts` table for review queue when NPI re-import conflicts with enriched data; supports resolution workflow (pending/keep_current/accept_incoming/manual)
- **Pre-import safety check** -- `scripts/pre-import-check.ts` runs before imports to count enriched records and pending conflicts
- **Centralized pool creation** -- `createPool()` exported from `pre-import-check.ts` with Cloud SQL SSL fix (strips `sslmode`, sets `rejectUnauthorized: false`)
- **Practice re-verification (Phase 5B)** -- Re-verified 2,552 practices across 15 specialties in 3 rounds; ~104 MEDIUM-to-HIGH confidence upgrades; 5 DNS dead websites identified; 1 wrong website corrected; 4 closures/acquisitions flagged

### Changed
- **Import script hardening** -- `import-npi.ts` Prisma upsert uses explicit 24-field allowlist (no `...data` spread); `import-npi-direct.ts` ON CONFLICT SET reduced to 11 NPI-sourced columns
- **NPPES enrichment protection** -- `enrich-providers-nppes.ts` only fills phone/fax if NULL; conflicts logged to `import_conflicts`; new locations get `data_source = 'nppes'`
- **Protected fields** -- The following fields are never overwritten by NPI imports: `provider_profile_url`, `confidence_score`, `verification_count`, `latitude`, `longitude`, `geocoded_at`, `address_hash`, `data_source`

### Fixed
- **Prisma migration baseline** -- 4 old migrations marked as applied in `_prisma_migrations` table to prevent re-execution

---

## [2026-01] January 2026

### Added - Security
- **Rate limiting (Tier 1)** -- IP-based sliding window rate limiting with dual-mode support (Redis distributed + in-memory fallback)
  - Default: 200 req/hr
  - Search: 100 req/hr
  - Verification: 10 req/hr
  - Vote: 10 req/hr
  - Magic link: 5 req/15 min
- **Google reCAPTCHA v3** -- Score-based bot detection on verification and vote endpoints; configurable fail-open (default) or fail-closed mode with fallback rate limiting
- **Honeypot middleware** -- Hidden form field bot detection; silent rejection (200 OK response to not alert bots)
- **Sybil attack prevention** -- 4-layer defense: rate limiting, CAPTCHA, vote deduplication (unique constraint on verificationId + sourceIp), 30-day submission windows
- **CSRF protection** -- Double-submit cookie pattern via `csrf-csrf` library on all mutating authenticated routes
- **Helmet security headers** -- Strict CSP for JSON API (default-src 'none'), COEP, COOP, CORP, no-referrer policy

### Added - Authentication
- **Magic link authentication** -- Passwordless login via email; tokens expire after single use
- **JWT session management** -- 15-minute access tokens + 30-day refresh tokens in httpOnly cookies
- **Session management** -- Database-backed sessions; logout, logout-all-sessions, session cleanup
- **GDPR data export** -- `GET /api/v1/auth/export` returns all user data

### Added - User Features
- **Saved providers** -- Bookmark providers with save/unsave/list/status endpoints; CSRF protected
- **Insurance card scanning** -- Upload card image, extract data via Anthropic Claude AI; encrypted PII storage (AES-256)
- **Insurance card management** -- Save, update, delete insurance card data
- **Provider comparison** -- Compare up to 4 providers side-by-side
- **Provider map view** -- Geographic provider search with Google Maps; bounding box queries with geocoded locations
- **Dark/light theme** -- Theme toggle with system preference detection

### Added - Backend Infrastructure
- **Structured logging** -- Pino logger with pino-http for request logging; PII-free log entries with request ID correlation
- **Request ID middleware** -- X-Request-ID generation for log correlation across requests
- **Request timeout** -- 30-second timeout for API routes; extended timeout for admin batch operations
- **Graceful shutdown** -- SIGINT/SIGTERM handling; 10-second shutdown timeout; database disconnect
- **Confidence scoring algorithm** -- 4-factor scoring (data source 25pts, recency 30pts, agreement 25pts, volume 20pts); specialty-specific freshness thresholds based on research (Ndumele et al. 2018, Mortensen et al. 2015)
- **Confidence decay service** -- Proactive recalculation of confidence scores with time-based decay; admin endpoint for batch recalculation

### Added - Admin Endpoints
- **Cleanup expired** -- `POST /admin/cleanup-expired` with dry run support
- **Cleanup sessions** -- `POST /admin/cleanup-sessions` for expired session removal
- **Expiration stats** -- `GET /admin/expiration-stats`
- **Admin health** -- `GET /admin/health` with retention metrics
- **Cache management** -- `POST /admin/cache/clear` and `GET /admin/cache/stats`
- **Enrichment stats** -- `GET /admin/enrichment/stats`
- **Sync log cleanup** -- `POST /admin/cleanup/sync-logs` with configurable retention (default 90 days)
- **Retention stats** -- `GET /admin/retention/stats` for all log types
- **Confidence recalculation** -- `POST /admin/recalculate-confidence` with dry run and limit options
- **Encryption key rotation** -- `POST /admin/rotate-encryption-key` for re-encrypting insurance card PII

### Added - Deployment
- **Docker containerization** -- Multi-stage Dockerfiles for backend (Node 20 Alpine, non-root user, health check) and frontend (Next.js standalone output)
- **Docker Compose** -- Full-stack compose (`docker-compose.yml`) and dev-only database compose (`docker-compose.dev.yml`)
- **GitHub Actions CI/CD** -- Automated pipeline: test -> build -> push to Artifact Registry -> deploy to Cloud Run
- **Workload Identity Federation** -- Keyless authentication for GitHub Actions (no service account keys)
- **Staging environment** -- `deploy-staging.yml` triggers on `staging` branch; max 2 instances
- **Rollback workflow** -- `rollback.yml` for manual Cloud Run revision rollback with smoke testing
- **Security scanning** -- CodeQL analysis and dependency vulnerability scanning workflows
- **Playwright E2E** -- End-to-end browser testing workflow

### Added - Analytics
- **PostHog integration** -- Privacy-preserving analytics for usage tracking

### Added - Data Pipeline
- **Insurance plan import** -- Pipeline for importing insurance plan data
- **Location enrichment** -- Practice location geocoding, health system identification, provider URL verification across 13+ hospital systems

### Changed
- **Locations route activated** -- `routes/locations.ts` fully registered and active in `routes/index.ts`; 5 endpoints: search, health-systems, stats/:state, /:locationId, /:locationId/providers
- **practice_locations model** -- Replaced old Location model; uses `practice_locations` table with geocoding fields
- **API client** -- Frontend API client (`api.ts`) redesigned with namespace organization, automatic retry with exponential backoff, CSRF management, transparent 401 token refresh

---

## [Pre-2026] Earlier Development

### Added - Core Platform
- **Express backend** -- RESTful API with `/api/v1` prefix
- **Next.js 14 frontend** -- App Router with server-side rendering
- **Prisma ORM** -- Type-safe database access with PostgreSQL
- **Monorepo structure** -- npm workspaces with backend, frontend, shared packages

### Added - Data Model
- **Provider model** -- Core provider data from NPI Registry with 20+ fields
- **PracticeLocation model** -- Provider addresses with geocoding support
- **InsurancePlan model** -- Insurance plan directory
- **ProviderPlanAcceptance model** -- Provider-plan acceptance with confidence scoring
- **VerificationLog model** -- Individual verification submissions
- **VoteLog model** -- Upvotes/downvotes with unique constraint
- **SyncLog model** -- Data sync history
- **DataQualityAudit model** -- Data quality issue tracking
- **TaxonomyReference model** -- Taxonomy code lookup table
- **Provider enrichment tables** -- ProviderCmsDetails, ProviderHospital, ProviderInsurance, ProviderMedicare, ProviderTaxonomy

### Added - Provider Endpoints
- **Search** -- `GET /providers/search` with state, city, zip, specialty, name, NPI, entity type filters; pagination; caching
- **Detail** -- `GET /providers/:npi` with full enrichment data
- **Cities** -- `GET /providers/cities` for unique cities by state
- **Colocated** -- `GET /providers/:npi/colocated` for providers at same address
- **Plans** -- `GET /providers/:npi/plans` for insurance plan acceptances

### Added - Plan Endpoints
- **Search** -- `GET /plans/search` with issuer, type, state filters
- **Grouped** -- `GET /plans/grouped` by carrier for dropdowns
- **Meta** -- `GET /plans/meta/issuers` and `GET /plans/meta/types`
- **Detail** -- `GET /plans/:planId`
- **Providers** -- `GET /plans/:planId/providers`

### Added - Verification Endpoints
- **Submit** -- `POST /verify`
- **Vote** -- `POST /verify/:id/vote`
- **Stats** -- `GET /verify/stats`
- **Recent** -- `GET /verify/recent`
- **Pair** -- `GET /verify/:npi/:planId`

### Added - NPI Data Import
- **Initial import** -- NPI data imported for 6 states (FL, AL, AK, AR, AZ, CA) for pipeline testing
- **Note:** These states were used for testing only; the production launch targets NYC (5 boroughs)

### Added - Frontend Pages
- Homepage with search bar and verification stats
- Provider search with filters and pagination
- Provider detail with locations, plans, verifications
- Insurance plan search
- About, Privacy, Terms, Disclaimer pages
- Research methodology page

---

## Breaking Changes Summary

| Date | Change | Impact |
|------|--------|--------|
| 2026-01 | CSRF required on mutating authenticated routes | Frontend must fetch and include CSRF token |
| 2026-01 | reCAPTCHA required on verify/vote endpoints | Frontend must include captchaToken in request body |
| 2026-01 | Locations route redesigned | Uses practice_locations model instead of old Location model |
| 2026-02 | Import scripts use explicit field allowlists | Custom import scripts must be updated to use allowlisted fields |
