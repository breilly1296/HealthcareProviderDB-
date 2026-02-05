# VerifyMyProvider Changelog

**Last Updated:** 2026-02-05
**Generated From:** prompts/19-changelog-doc.md
**Format:** [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [Unreleased]

_No unreleased features documented at this time._

---

## [January 2026] - Security, Scoring, and Production Readiness

### Added

#### Sybil Attack Prevention (4-Layer Defense)
A comprehensive anti-abuse system was implemented to protect the community verification system from coordinated manipulation:

1. **Rate Limiting** -- IP-based, dual-mode (Redis/in-memory) sliding window rate limiter.
   - Redis mode for distributed deployments with shared state across instances.
   - In-memory fallback for single-instance deployments.
   - Sliding window algorithm prevents burst attacks at window boundaries.
   - Fail-open behavior: if Redis becomes unavailable, requests are allowed with a warning logged.
   - Source: `packages/backend/src/middleware/rateLimiter.ts`

2. **Google reCAPTCHA v3** -- Bot detection integrated on verification and vote endpoints.
   - Configurable fail mode (`CAPTCHA_FAIL_MODE`): `open` (default, prioritizes availability) or `closed` (prioritizes security).
   - Fallback rate limiting when CAPTCHA API is unavailable (3 requests/hour vs normal 10).
   - Score threshold configurable via `CAPTCHA_MIN_SCORE`.
   - Source: `packages/backend/src/middleware/captcha.ts`

3. **Vote Deduplication** -- Prevents duplicate votes on the same verification from the same source.

4. **30-Day Verification Windows** -- Time-bounded verification periods prevent indefinite accumulation.

#### Confidence Scoring Algorithm
A 4-factor scoring system (0-100 scale) that assesses the reliability of provider insurance acceptance data:

| Factor | Weight | Description |
|---|---|---|
| Data Source | 0-25 | Authoritative sources (CMS NPPES = 25, Carrier API = 20, Crowdsource = 15, Automated = 10) |
| Recency | 0-30 | Time-based decay with specialty-specific freshness thresholds |
| Verification Agreement | 0-25 | Community consensus; optimal at 3 verifications (research-backed, Mortensen et al. 2015) |
| Volume | 0-20 | Number of verification data points |

Specialty-specific freshness thresholds based on healthcare research (Ndumele et al. 2018, Health Affairs):
- Mental health: 30 days (43% Medicaid acceptance rate, high churn)
- Primary care: 60 days (12% annual turnover)
- Specialists: 60 days
- Hospital-based: 90 days (more stable positions)

Source: `packages/backend/src/services/confidenceService.ts`

#### Admin Endpoints (7 Total)
Protected by `X-Admin-Secret` header with timing-safe comparison:

| Endpoint | Method | Purpose |
|---|---|---|
| `/admin/health` | GET | Health check with retention metrics |
| `/admin/cleanup-expired` | POST | Clean up expired verification records (supports dry run) |
| `/admin/expiration-stats` | GET | Verification expiration statistics |
| `/admin/cache/clear` | POST | Clear all cached data |
| `/admin/cache/stats` | GET | Cache hit/miss statistics with hit rate |
| `/admin/cleanup/sync-logs` | POST | Clean up sync logs older than retention period (default 90 days) |
| `/admin/retention/stats` | GET | Comprehensive retention statistics for all log types |

Source: `packages/backend/src/routes/admin.ts`

#### Structured Logging
PII-free structured logging via `requestLogger.ts` using Pino logger. Development and test environments have separate log level configurations.

#### PostHog Analytics Integration (Privacy-Preserving)
Frontend analytics via PostHog with deliberate privacy protections:

- **search** -- Tracks boolean filter indicators (`has_specialty_filter`, `has_state_filter`, etc.) and result counts. Does NOT send actual search values.
- **provider_view** -- Tracks that a view occurred with `has_specialty` boolean. Does NOT send NPI, name, or specialty.
- **verification_submit** -- Tracks that a submission occurred. Does NOT send NPI, plan ID, or insurance acceptance status.
- **verification_vote** -- Tracks vote direction (`up`/`down`). Does NOT send verification ID or NPI.

Includes `identifyUser` and `resetUser` for future account-based tracking.

Source: `packages/frontend/src/lib/analytics.ts`

#### Insurance Plan Import Pipeline
Backend pipeline for importing insurance plan data into the system.

#### Insurance Card Upload with Claude AI Extraction
Users can upload insurance card images for AI-powered data extraction via the Anthropic Claude API.

#### Docker Containerization
Separate Dockerfiles for backend and frontend services:
- `packages/backend/Dockerfile`
- `packages/frontend/Dockerfile`

#### GitHub Actions CI/CD
Automated deployment pipeline to Google Cloud Run:
- Triggers on push to `main` or manual dispatch (`workflow_dispatch`)
- Deploys both `verifymyprovider-backend` and `verifymyprovider-frontend` services
- Region: `us-central1`
- Playwright test workflow also configured (`.github/workflows/playwright.yml`)

Source: `.github/workflows/deploy.yml`

#### Provider Comparison Feature
Side-by-side provider comparison supporting up to 4 providers simultaneously.

#### Dark/Light Theme Support
Frontend theme switching with dark and light mode options.

### Changed

#### Data Retention Policies
- Verification logs: 6-month TTL via `expiresAt` field
- Plan acceptances: 6-month TTL via `expiresAt` field
- Sync logs: 90-day retention with manual cleanup endpoint
- Vote logs: Follow plan acceptance TTL

#### practice_locations Replaces Location Model
The old `Location` model was replaced by the `practice_locations` table. This change disabled the locations route and location enrichment admin endpoints pending a rewrite.

### Fixed

#### Next.js SWC on Windows ARM64
Postinstall script (`packages/frontend/scripts/patch-next-swc.js`) automatically patches Next.js SWC loader to enable WASM fallback on Windows ARM64 + Node.js v24+, resolving "not a valid Win32 application" errors.

### Security

#### Timing-Safe Admin Authentication
Admin secret comparison uses `crypto.timingSafeEqual` with buffer length pre-check to prevent timing-based secret extraction attacks.

Source: `packages/backend/src/routes/admin.ts` (lines 40-48)

#### CAPTCHA Fail-Mode Configuration
Configurable `CAPTCHA_FAIL_MODE` (`open`/`closed`) allows operators to choose between availability and security when Google's reCAPTCHA API is unavailable.

#### Fallback Rate Limiting
When CAPTCHA API fails in fail-open mode, a stricter fallback rate limit (3 requests/hour vs 10) is applied to mitigate abuse during outages.

---

## [Earlier] - Foundation

### Added

#### NPI Data Import
- Imported NPI data for 6 states: Florida (FL), Alabama (AL), Alaska (AK), Arkansas (AR), Arizona (AZ), California (CA)
- Approximately 2.1 million provider records

#### Prisma Schema
Initial schema with core models:
- `Provider` (mapped from `providers` table)
- `InsurancePlan` (insurance plan data)
- `VerificationLog` (community verification records)
- `PracticeLocation` (mapped from `practice_locations` table)
- `SyncLog` (data synchronization tracking)
- `VoteLog` (verification vote records)
- `ProviderPlanAcceptance` (provider-plan relationship with TTL)

PascalCase models with `@@map()` and camelCase fields with `@map()` for PostgreSQL compatibility.

#### Express Backend
- Provider search and detail endpoints (`/api/v1/providers`)
- Insurance plan endpoints (`/api/v1/plans`)
- Verification endpoints (`/api/v1/verify`)
- Zod-based request validation
- Centralized error handling with `AppError` class

#### Next.js 14 Frontend
- App Router architecture (Next.js 14.2)
- React 18 with TailwindCSS
- Server-side and client-side rendering

#### Database
- PostgreSQL on Google Cloud SQL
- Database name: `verifymyprovider`
- npm workspaces monorepo: `packages/backend`, `packages/frontend`, `packages/shared`
