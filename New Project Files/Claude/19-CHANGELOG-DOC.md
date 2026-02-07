# VerifyMyProvider Changelog

All notable changes to the VerifyMyProvider project are documented in this file.
This changelog is organized by date and follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) convention.

**Project start date:** December 15, 2025
**Versioning strategy:** Date-based (pre-release; targeting Q2 2026 NYC launch)
**Repository:** `https://github.com/breilly1296/HealthcareProviderDB-.git`

---

## [2026-02-07] - Security Scanning, Accessibility Fixes, and Cloud Armor Documentation

### Added
- **CodeQL SAST analysis** workflow (`codeql.yml`) scanning `javascript-typescript` on push to main, PRs to main, and weekly Monday cron; fails on error-severity findings
  - Source: `.github/workflows/codeql.yml`
- **Dependency review** job added to PR test gate using `actions/dependency-review-action@v4` with `fail-on-severity: critical`
  - Source: `.github/workflows/test.yml`
- **Cloud Armor deployment guide** with prerequisites, rule documentation, pre-deployment checklist, execution instructions, post-deployment verification, rollback procedures, and monitoring setup
  - Source: `docs/CLOUD-ARMOR-SETUP.md`
- **GET /providers/:npi/plans** endpoint returning paginated insurance plans with acceptance status and confidence scores
  - Source: `packages/backend/src/routes/providers.ts`
- **Skip-to-content link** and `id="main-content"` landmark for keyboard/screen reader navigation
  - Source: `packages/frontend/src/app/layout.tsx`
- **Backend route tests** for providers and verify endpoints (205 tests passing)
  - Source: `packages/backend/src/routes/__tests__/providers.test.ts`, `verify.test.ts`
- **Middleware tests** for rate limiter, honeypot, and CAPTCHA middleware
  - Source: `packages/backend/src/middleware/__tests__/`

### Changed
- **CSP header re-enabled** in `Content-Security-Policy-Report-Only` mode after being disabled 2026-01-31; directives updated to allow API, reCAPTCHA, and PostHog
  - Source: `packages/frontend/next.config.js`
- **reCAPTCHA v3 frontend integration** — `ReCaptchaProvider` added to layout, `ProviderVerificationForm` sends tokens with all verification and vote requests
  - Source: `packages/frontend/src/components/ReCaptchaProvider.tsx`, `packages/frontend/src/components/provider-detail/ProviderVerificationForm.tsx`
- **ProviderVerificationForm refactored** to use standard `providerApi`/`verifyApi` client instead of hardcoded `fetch()` calls
- **Gitleaks secret scan** now also triggers on PRs to staging branch
  - Source: `.github/workflows/security-scan.yml`
- **`.gitleaks.toml`** expanded with allowlists for `docker-compose.yml`, `__tests__/`, `__mocks__/`, placeholder regex patterns, and default dev postgres credentials
- **Cloud Armor script** updated: rate limit reduced from 1000 to 100 req/min per IP, bot/crawler UA blocking rule added (priority 1008), geographic restriction rule added (commented out for NYC-first launch)
  - Source: `packages/backend/scripts/setup-cloud-armor.sh`

### Fixed
- **Accessibility fixes** across 7 frontend components:
  - `CookieConsent`: `role="alert"` and `aria-live="polite"` for screen reader announcement
  - `ConfidenceGauge`: `aria-hidden` on backdrop, `aria-labelledby` on dialog, `role="img"` on SVG
  - `InsuranceList`: focus trap, Escape key close, body scroll lock, `role="dialog"`, `aria-modal`, `sr-only` status labels, decorative icon hiding
  - `SearchForm`: `aria-label` on filter chip remove buttons, `role="alert"` on error messages
  - `CompareBar`: `aria-label` on Clear buttons
  - `ProviderCard`: `aria-hidden={true}` on all decorative icons (LocationIcon, PhoneIcon, ChevronRightIcon, CheckCircle, BadgeCheck)

### Security
- **4 CI/CD security scanning layers** now active: npm audit (critical), gitleaks secret scanning, CodeQL SAST, dependency review

---

## [2026-02-06] - Colocated Providers, E2E Hardening, and Infrastructure Improvements

### Added
- **Colocated providers endpoint** (`GET /providers/:npi/colocated`) for discovering other providers at the same practice address, with pagination support and health system data (`90edc34`)
  - Source: `packages/backend/src/routes/providers.ts` and `packages/backend/src/services/locationService.ts`
- **Error tracking via PostHog** with no additional dependencies -- reuses existing PostHog client to capture frontend errors (`9d17699`)
- **Request timeout middleware** to prevent hanging connections: 30s for general routes, 15s for search, 120s for admin operations (`0c6c039`)
  - Source: `packages/backend/src/middleware/requestTimeout.ts`
- **Title-case formatting** for provider names, search sort order improvements, and specialty taxonomy mapping (`c6df883`)
- **Mock API server for E2E tests** so Playwright tests can run in CI without a backend (`cd745da`)
- **Score breakdown with honeypot**, additional E2E tests, privacy policy content, confidence decay logic, CI caching, and general cleanup (`a3711eb`)
  - Honeypot middleware source: `packages/backend/src/middleware/honeypot.ts`

### Changed
- **Frontend Dockerfile** collapsed to single build stage for reliability (`9474c0f`)
- **npm audit gate** lowered to `critical` severity because Next.js 14.x has unfixable `high` advisories (`b67b3f8`)
- **Shared tsconfig base** extracted to reduce configuration duplication across workspaces (`47952ba`)
- **Cross-platform clean scripts** switched to use `rimraf` (`16fc2a9`)
- Duplicate `npm install` removed from frontend Dockerfile for faster builds (`40f9601`)

### Fixed
- Standardized error response format: all errors now return `{ success: false, error: { ... } }` (`e0e43ed`)
- Additional Prisma error codes handled (P2003, P2024, P2010, init errors) (`ace3f1a`)
- Docker build context now includes `tsconfig.base.json` (`8391e0f`)
- `npm rebuild` used instead of copying nonexistent workspace `node_modules` (`6684b0f`)
- E2E test failures resolved: search button ambiguity, race conditions, clear targeting (`6babd1c`)
- Mock `displayName` now matches SSR title formatting (`df3c051`)

### Security
- **npm audit security gate** added to CI pipeline (`8694a3a`)

### CI/CD
- **Cloud Run rollback workflow** added (manual dispatch, supports backend/frontend/both) (`b15bf15`)
  - Source: `.github/workflows/rollback.yml`
- **Frontend post-deploy smoke test** verifies HTTP 200 after deployment (`6164d65`)

---

## [2026-02-05] - Staging CI, SSR/SEO, Practice Locations Rewrite, and Insurance Accuracy

### Added
- **Staging CI/CD pipeline** (`deploy-staging.yml`) with separate Cloud Run services (`00ad8f0`)
  - Source: `.github/workflows/deploy-staging.yml`
- **Server-side rendering (SSR) for provider pages** with structured data (JSON-LD) for SEO (`00ad8f0`)
  - Source: `packages/frontend/src/app/provider/[npi]/page.tsx`
- **Cloud Armor** WAF configuration planning (`00ad8f0`)
- **Authentication planning** documented for future user accounts (`00ad8f0`)
- **PostHog privacy improvements** ensuring no PII is sent to analytics (`00ad8f0`)
- **Gitleaks CI secret scanning** on push and pull request to main (`54c3b9c`)
  - Source: `.github/workflows/security-scan.yml`
- **Service-level unit tests** for provider, plan, and verification services (`54c3b9c`)
  - Source: `packages/backend/src/services/__tests__/`
- **Insurance plan accuracy improvements** (phases 1-4) for better carrier matching and plan deduplication (`2de6357`)

### Changed
- **Location model rewritten** from old `Location` to `practice_locations`, aligning with the actual PostgreSQL schema (`54c3b9c`, `0009b95`)
  - `practice_locations` now drives all address data for providers
  - Location enrichment rewritten for the new model
  - Source: `packages/backend/src/services/locationEnrichment.ts`, `packages/backend/src/services/locationService.ts`
- **Production admin endpoints** and CAPTCHA enabled in production environment (`0009b95`)
- **Database migrated** to `verifymyprovider` PostgreSQL instance with enriched schema including CMS details, hospitals, insurance networks, Medicare IDs, and taxonomies (`863d2f9`)

### Fixed
- `findFirst` used after removing `@@unique` compound key from schema (`a896c06`)
- Backend Prisma schema synced for Docker build compatibility (`96f2067`)
- `sharp` externalized and dynamically imported to prevent build-time loading issues (`eabbcfb`, `520458d`)
- Postinstall script made graceful for Docker builds (`d9e0310`, `6f7a504`)
- `client-only` dependency added for CI frontend build (`5d8d85d`)
- Disabled location files excluded from TypeScript compilation (`715fdd7`)
- Smoke test URL corrected to `/health` instead of `/api/v1/health` (`16a159b`)
- `DATABASE_URL` fixed to point to correct database in CI (`ccee0c7`)

---

## [2026-02-02] - About Us Page and Branding Updates

### Added
- **About Us page** with team information and mission statement (`f807b14`)
  - Source: `packages/frontend/src/app/about/page.tsx`

### Fixed
- OwnMyHealth links updated to use `.io` domain (`9e86a21`)

---

## [2026-01-31] - Security Hardening, Structured Logging, and Operations Infrastructure

### Added
- **Structured JSON logging** via Pino, replacing all `console.log` calls (`62d23b9`)
  - Development: `pino-pretty` for readable output
  - Production: structured JSON for Cloud Logging integration
  - Source: `packages/backend/src/utils/logger.ts`
- **Request ID middleware** for log correlation across the request lifecycle (`278a375`)
  - Source: `packages/backend/src/middleware/requestId.ts`
- **Log retention policies** with cleanup endpoints for verification logs, sync logs, and plan acceptances (`2d70c79`)
  - Sync logs: 90-day retention with manual cleanup
  - Verification logs: 6-month TTL via `expiresAt`
  - Source: `packages/backend/src/routes/admin.ts` (endpoints: `POST /admin/cleanup/sync-logs`, `GET /admin/retention/stats`)
- **Search query caching** with 5-minute TTL to reduce database load (`bdac577`)
  - Source: `packages/backend/src/utils/cache.ts`
- **Location enrichment** scripts for practice location data (`f908718`)
- **Disclaimer system** and legal review documentation (`81411bc`)
  - Source: `packages/frontend/src/components/Disclaimer.tsx`, `packages/frontend/src/app/disclaimer/page.tsx`
- **Insurance card OCR improvements** with image preprocessing and confidence scoring (`dd5fb68`)
  - Source: `packages/frontend/src/lib/imagePreprocess.ts`
- **Cloud Armor WAF setup** script and documentation (`61b8672`)
- **Secret Manager audit logging** setup script (`8168f6c`)
- **Cloud Logging alerts** setup script (`0810719`)
- **Secret rotation procedures** documentation (`3c65ac1`)
- **Penetration testing guide** and user accounts design documentation (`f305c14`)
- **Real-time updates design** with Server-Sent Events (SSE) (`2ce7ce8`)
- **Insurance plan database import** design document (`eb23d1f`)

### Changed
- **CSP and security headers** added to Next.js frontend via `a761223`
  - Source: `packages/frontend/src/app/layout.tsx`
- **In-memory rate limiter** upgraded to sliding window algorithm (prevents burst attacks at window boundaries) (`69b2451`)

### Fixed
- CSP `connect-src` updated to allow API and analytics requests (`6094109`)
- CSP header disabled when it was blocking API requests (`9f1278a`)

### Security
- **Explicit request size limits** (100kb) added to JSON and URL-encoded body parsers to prevent large payload attacks (`f67e53c`)
  - Source: `packages/backend/src/index.ts` lines 89-90

---

## [2026-01-30] - Provider Detail Page Redesign and Verification UX Overhaul

### Added
- **Insurance plan grouping** by carrier family with collapsible sections (`4875035`)
  - Source: `packages/frontend/src/components/provider-detail/ProviderPlansSection.tsx`
- **Search filter and collapse** for insurance list (`8cf3a64`)
  - Source: `packages/frontend/src/components/provider-detail/InsuranceList.tsx`
- **Verification CTA** added to insurance acceptance section (`71b38a0`)
- **Verification modal** wired up for individual insurance plans (`73fc363`)
- **Confidence score and insurance preview** added to provider search result cards (`38b3fd8`)
- **Inline search form** on homepage with improved layout (`1b1e624`)

### Changed
- **Comprehensive provider detail page improvements** including redesigned layout, better information hierarchy, and provider name display enhancements (`6d9a9cc`, `dbd45ff`)
- **Warm stone palette** applied to provider detail and search pages for improved visual cohesion (`3188789`)
- **Light mode** reworked: eliminated pure white, added warm stone/amber tones for better readability (`ade1979`, `b695bb4`, `c402f1d`, `93e9e1f`)
- **Homepage hero** simplified to single CTA button (`1447a90`)
- **Other Plans section** collapsed by default with "Accepted" badges (`19f709a`)
- **Verification modal** UX improved with polished button styles (`fcbb9ef`, `e8ba628`)
- Provider cards now use calculated confidence score per plan instead of raw value (`d3af5c7`)
- Score Breakdown card removed from provider detail page (moved to inline display) (`c870936`)

### Fixed
- "Other Providers" section hidden when empty instead of showing skeleton (`69bbaaf`)
- Mobile layout improvements for search results and provider detail pages (`962fc51`)
- Confidence level thresholds corrected (`dd58c14`)
- `cleanProviderName` function handles undefined/null `namePart` safely (`8740130`, `b38286c`)
- Unused `organizationName` prop removed from `AboutProvider` component (`0625faf`)
- TypeScript error in `handleOpenGeneralVerify` resolved (`92dbd12`)

---

## [2026-01-29] - Provider Detail Page Redesign and Dark Mode

### Added
- **Provider detail page redesign** with improved layout, confidence gauges, and hero card (`3b5b0bb`)
  - Source: `packages/frontend/src/components/provider-detail/ProviderDetailClient.tsx`, `ProviderHeroCard.tsx`, `ConfidenceGauge.tsx`
- **Dark mode support** for provider detail page (`d9e7962`)
- **Improved provider search result cards** with better specialty display and field mapping (`3f22a2a`, `55f4c7c`)

### Fixed
- Backend provider fields mapped to frontend expected names (`b71ee0d`)
- E2E tests: specific selector for State combobox (`ae5d863`)
- E2E tests: production server started in CI for Playwright tests (`608942e`)

---

## [2026-01-25] - Redis Rate Limiting, Frontend Refactoring, and Code Quality

### Added
- **Redis-based rate limiting** with dual-mode support (Redis for distributed, in-memory for single-instance) (`3bf6622`)
  - Sliding window algorithm using Redis sorted sets
  - Fail-open behavior if Redis becomes unavailable
  - Pre-configured limiters: default (200/hr), verification (10/hr), vote (10/hr), search (100/hr)
  - Source: `packages/backend/src/middleware/rateLimiter.ts`
- **Enhanced CAPTCHA** with expanded configuration (`3bf6622`)
- **ErrorContext** for global error state management in frontend (`edca199`)
  - Source: `packages/frontend/src/context/ErrorContext.tsx`
- **E2E tests** with Playwright for frontend (`edca199`)
- **Unit tests** for frontend utilities (`edca199`)
- **Icon library** for consistent iconography across the app (`9435797`)
  - Source: `packages/frontend/src/components/icons/Icons.tsx`
- **API retry logic** with exponential backoff (`9435797`)
  - Source: `packages/frontend/src/lib/api.ts`

### Changed
- **Frontend P0-P3 refactoring** complete (`ba5c6b3`, `847dd23`, `edca199`):
  - P0: Critical error handling and type safety fixes
  - P1: Cleanup and code organization
  - P2: Performance improvements, strict TypeScript, consistency
  - P3: ErrorContext, E2E tests, unit tests
- **Component extraction** and hook refactoring for maintainability (`88dd207`)
- **Code simplification** and DRY improvements across the codebase (`c8aab79`)
- City normalization expanded with broader NYC borough support (`3bf6622`)

### Fixed
- `.babelrc` renamed/removed to avoid Next.js SWC conflict (`06bddbf`, `07059b7`)
- Shared package built before frontend in Playwright workflow (`b587798`)
- Test files excluded from Docker build context (`b306455`)

---

## [2026-01-24] - Security Fixes: Sybil Prevention, CAPTCHA, and Vote Dedup

### Added
- **Google reCAPTCHA v3** protection on verification and vote endpoints (`ecd2cfa`)
  - Supports fail-open and fail-closed modes
  - Fallback rate limiting when Google API unavailable (3 req/hr vs normal 10)
  - Source: `packages/backend/src/middleware/captcha.ts`
- **VoteLog table** and deduplication for preventing unlimited voting (`b050788`, `47a13ba`)
  - `@@unique([verificationId, sourceIp])` constraint
  - Source: `packages/backend/prisma/schema.prisma` (VoteLog model)
- **DoS protection** on insurance card extraction API (`9c8a50e`)
- **NYC (All Boroughs)** combo option for city dropdown (`7006558`)
- **Pinned major cities** to top of city dropdown (`355dfe1`)
- **SearchableSelect** accessible combobox component (`9fb91d2`)
  - Source: `packages/frontend/src/components/ui/SearchableSelect.tsx`
- **useSearchForm hook** for search form state management (`6b86e9b`)

### Changed
- **SearchForm refactored** to use new hooks and SearchableSelect (`4124477`)
- **Frontend refactored** with unified types, namespaced API, and data hooks (`f059a9d`)
- Entity Type filter removed from SearchForm (simplified UX) (`e382350`)
- CSP tightened for JSON-only API backend (`24c3a75`)
- CORS restricted to specific domains instead of wildcard (`9273fc3`)

### Fixed
- **Sybil attack vulnerability** in verification submission: 30-day sliding window per IP and email prevents manipulation (`4c9ac4d`)
  - Sybil prevention index: `idx_vl_sybil_ip`, `idx_vl_sybil_email`
- **Consensus logic bug** that allowed status manipulation with strategic voting (`9defc79`)
- **Unlimited voting vulnerability** fixed with VoteLog deduplication (`47a13ba`)
- **Analytics privacy**: sensitive health/location data removed from PostHog events (`ca39a8f`)
  - Source: `packages/frontend/src/lib/analytics.ts` -- only boolean indicators sent, never actual search values or PII
- Windows ARM64 compatibility for Next.js SWC (`efcf3e0`)
- Mobile filter drawer functionality restored (`f61c309`)

### Removed
- Insecure mock verification endpoint disabled (`53efcf0`)
- Hardcoded database credentials removed from scripts (`469185c`)
- Deprecated config export removed from route handler (`7cd0176`)

### Security
- **4-layer Sybil attack prevention** fully operational:
  1. IP-based rate limiting (sliding window)
  2. Google reCAPTCHA v3 (score >= 0.5)
  3. Vote deduplication (one vote per IP per verification)
  4. 30-day verification windows (per IP and per email)

---

## [2026-01-21] - Compare Providers, Dark Mode, and Mobile UX

### Added
- **Compare Providers feature** allowing up to 4 providers side-by-side comparison (`676fb56`)
  - Best value highlighting per row (`9fc6f07`)
  - Source: `packages/frontend/src/hooks/useCompare.ts`, `packages/frontend/src/context/CompareContext.tsx`, `packages/frontend/src/components/compare/`
- **System-aware dark/light mode** support (`8839dcd`)
  - Source: `packages/frontend/src/context/ThemeContext.tsx`, `packages/frontend/src/components/ThemeToggle.tsx`
- **Mobile filter drawer** pattern for search page (`f583143`)
  - Source: `packages/frontend/src/components/FilterDrawer.tsx`
- **Unit tests** for confidence scoring algorithm (`ae3f7f6`)
  - Source: `packages/backend/src/services/__tests__/confidenceService.test.ts`
- **Fixed bottom navigation** bar for mobile (`1e219c1`)
  - Source: `packages/frontend/src/components/BottomNav.tsx`
- **Shimmer loading effects** for search results (`e619e77`)
  - Source: `packages/frontend/src/components/ui/Shimmer.tsx`
- **Empty state illustrations** for search page (`ddf6700`)
  - Source: `packages/frontend/src/components/illustrations/`
- **Recent searches** feature with localStorage persistence (`efe89a4`)
  - Source: `packages/frontend/src/hooks/useRecentSearches.ts`, `packages/frontend/src/components/RecentSearches.tsx`
- **Scroll-to-top button** (`6185f84`)
  - Source: `packages/frontend/src/components/ScrollToTop.tsx`
- **Governing Law section** to Terms of Service; enhanced Data Retention in Privacy Policy (`b95cfbf`)

### Changed
- Theme toggle made smaller and more subtle in header (`334e587`)
- Redundant research badge card removed from homepage hero (`b654d12`)

### Fixed
- Dark mode styling across provider detail, research, and insurance pages (`f8423c0`, `239906b`)
- FilterDrawer footer buttons no longer cut off by BottomNav (`89c4eb7`, `f4e1dc3`)
- Insurance plan filter correctly passes `insurancePlanId` to API (`12c4480`)
- CORS updated with Cloud Run frontend URL (`c0000f9`)
- `.babelrc` removed to fix Next.js SWC/font conflict (`f534354`)

### Removed
- Font size toggle feature reverted (accessibility approach reconsidered) (`b12e390`)

---

## [2026-01-20] - Insurance Plan Filter and Frontend UX Enhancements

### Added
- **Insurance plan filter** in provider search (`7c73725`)

---

## [2026-01-18] - Environment Variables Documentation and Error Responses

### Added
- **Comprehensive environment variables documentation** (`6bd835d`)
- **Request ID in all error responses** for debugging (`b2b3d06`)

---

## [2026-01-17] - Insurance Card Scanner, Confidence Scoring, and Admin Endpoints

### Added
- **Insurance card image extraction** with Claude AI (Anthropic API) for OCR-based plan detection (`f6aac2d`)
  - Source: `packages/frontend/src/app/insurance/page.tsx`
- **Insurance card scanner** added to navigation (`3de1433`)
- **Confidence score breakdown** component with multiple variants (compact, detailed, minimal) (`bf9aae6`)
  - Source: `packages/frontend/src/components/ConfidenceScoreBreakdown.tsx`
- **Confidence breakdown** integrated into provider detail page (`1ac0ecc`)
- **Full confidence breakdown** added to API responses (`0ae2fba`)
- **Admin endpoint** for scheduled verification cleanup (`127b176`)
  - `POST /api/v1/admin/cleanup-expired`
- **TTL fields** added to verification tables (`c09f5fe`) with TTL handling in verification service (`31d4e23`)
  - `expiresAt` on `VerificationLog` and `ProviderPlanAcceptance`
- **NYC city name normalization** script (`912dec9`)
- **Script to cleanup deactivated providers** (`a9b36c7`)
- **Insurance plan grouping UI** with search and collapsible carriers (`96e2ccc`)
- **Health system insurance data pipeline** schema (`07dc829`)
- **Health endpoint** improved with detailed monitoring info (database response time, cache stats, memory) (`06c0203`)
  - Source: `packages/backend/src/index.ts` lines 93-136
- **Cloud Logging** configuration docs and setup script (`7cc9628`)

### Changed
- 10-plan limit removed from `getProviderByNpi` query (`db88cb9`)
- Deactivated providers skipped during NPI import (`a0181c6`)
- ADMIN_SECRET made optional for deployment (`0e4bf73`)
- CORS restricted to specific domains (`9273fc3`)

### Fixed
- Insurance plan grouping: hooks before returns, correct interface (`fddeddb`)
- Deploy.yml: commented ADMIN_SECRET line removed (`cc16e93`)
- ADMIN_SECRET removed from Cloud Run service env_vars (uses Secret Manager) (`b14c037`)
- Scripts updated after city normalization (`ed040c6`)

---

## [2026-01-16] - Insurance Plan Import, Pre-Launch Fixes, and Schema Sync

### Added
- **Insurance plan import system** with CSV parsing and production schema sync (`a742683`)
  - Source: `packages/backend/src/scripts/importInsurancePlans.ts`
- **Gemini-scraped insurance data fields** added to InsurancePlan model (`e5cb5c7`)
  - Fields: `carrier`, `planVariant`, `rawName`, `sourceHealthSystem`, `carrierId`, `healthSystemId`

### Changed
- Prisma schema synced with production database (`74540ca`)

### Fixed
- **Critical pre-launch issues** resolved (`1aebf4a`):
  - Focus outline only shown on keyboard navigation, not mouse click (`5303d1f`)
  - TypeScript error in VerificationButton focus trap (`d9b6ec9`)
- **HIGH priority issues** fixed (`20d381c`)
- **MEDIUM priority issues** fixed (`4c7ee19`)
- **LOW priority issues** fixed for beta launch (`18f1eb1`)
- TypeScript errors for simplified production schema (`8536af3`)

---

## [2026-01-15] - Rate Limiting and Request Logging

### Added
- **IP-based rate limiting** (Tier 1) with in-memory sliding window algorithm (`00ec060`)
  - 200 req/hr default, 10 req/hr for verification, 100 req/hr for search
- **Request logging middleware** (`requestLogger.ts`) for PII-free usage tracking (`00ec060`)
  - Source: `packages/backend/src/middleware/requestLogger.ts`
- **Toast notifications** for user feedback (`00ec060`)

### Fixed
- Bidirectional ordinal normalization for address matching (`c4f903c`)
- Added `nul` to `.gitignore` (Windows reserved filename) (`e402e08`)

---

## [2026-01-14] - Provider Features, PostHog Analytics, and Security Hardening

### Added
- **PostHog analytics** integration with privacy-preserving event tracking (`3381b28`)
  - Source: `packages/frontend/src/lib/analytics.ts`, `packages/frontend/src/components/PostHogProvider.tsx`
  - Only boolean indicators sent; no PII, no search terms, no provider identifiers
- **Terms of Service** and **Privacy Policy** pages (`4727ba6`)
  - Source: `packages/frontend/src/app/terms/page.tsx`, `packages/frontend/src/app/privacy/page.tsx`
- **Hospital/Office Relationships** feature showing "Other Providers at This Location" (`2311d4d`, `c8423b4`)
- **Organization/location search** in frontend (`e2756ed`, `a355c14`)
- **Health System filter** in search form, dependent on state/city selection (`a07daaf`, `0669957`)
- **Multi-city selection** with NYC All Boroughs preset (`f56db67`)
- **Location metadata fields** for facility information (`90e9130`, `4630550`)
- **Flexible provider name search** matching (`fd61748`)
- **Rate limiting** for API endpoints (CVSS 7.1 security fix) (`eeac0de`)

### Changed
- Search form layout redesigned for better UX (`4012d1a`)
- Homepage hero reframed as positive messaging (`250a74a`)

### Fixed
- **Verification threshold required** before changing acceptance status (CVSS 9.2 fix) (`afa8f96`)
- **Legacy vulnerable verification endpoint** removed (`8b1a3bc`)
- **PII excluded** from public verification responses (`109c2d8`)
- PostHog key passed to Docker build via build args (`c9439dc`)
- TypeScript type corrected for specialty in analytics tracking (`7e80abd`)
- Mobile UI improvements: hero text, search buttons, branding, ZIP label (`a7e1f76`)
- Missing `SPECIALTY_OPTIONS` and `STATE_OPTIONS` exports added (`f692c24`)
- Prisma engine compatibility fixed for ARM64 Windows (`9676405`)
- Learn More link alignment in research badge (`415f860`)

### Security
- **BREAKING:** Vulnerable verification endpoint removed (`8b1a3bc`)
- Verification threshold required before status change (prevents manipulation) (`afa8f96`)

---

## [2026-01-13] - Database Schema Migration and Error Handling

### Added
- **Initial database schema migration** to PostgreSQL (`ce51838`)
- **Data import scripts** for NPI data (`754e277`)
- **Comprehensive error handling**, toast notifications, and mobile responsiveness (`4816233`)

### Changed
- Prisma schema updated to match actual production database structure (`54e0c70`)
  - Models: `Provider`, `practice_locations`, `InsurancePlan`, `ProviderPlanAcceptance`, `VerificationLog`

### Fixed
- Backend Prisma schema location corrected and verificationService updated (`ab242a4`)
- ProviderPlanAcceptance schema matched to actual database (`67611bd`)

---

## [2026-01-12] - Research-Based Confidence Scoring and Provider Detail Enhancements

### Added
- **Research-based confidence scoring system** (v2.0) with 4-factor algorithm (`076cd20`, `e5a03b0`)
  - Data source score: 0-25 points (CMS, carrier, community)
  - Recency score: 0-30 points (time-based decay)
  - Verification agreement: 0-25 points (optimal at 3 verifications)
  - Community consensus: 0-20 points (upvote/downvote ratio)
  - Source: `packages/backend/src/services/confidenceService.ts`
- **Specialty-specific freshness thresholds** based on research (Ndumele et al. 2018):
  - Mental health: 30-day threshold (43% Medicaid acceptance, high churn)
  - Primary care: 60-day threshold (12% annual turnover)
  - Specialist: 60-day threshold
  - Hospital-based: 90-day threshold (more stable)
- **Research page** showcasing peer-reviewed evidence for the platform (`4a79e5c`)
  - Source: `packages/frontend/src/app/research/page.tsx`
- **Verification freshness warnings** on provider cards (`ff675dc`)
  - Source: `packages/frontend/src/components/FreshnessWarning.tsx`
- **Research-backed verification form** redesigned for simplicity (`185284f`, `72b6b00`)
- **Prominent freshness warnings** on provider detail pages (`e63f7d2`)
- **Research folder** with knowledge base from academic queries (`c6432e7`)

### Changed
- Landing page confidence scores updated to v2.0 (`4b60cf7`)
- Landing page updated with research-backed messaging (`8aba28e`)
- Provider detail page refactored for maintainability (`dcd84ed`)
- Verification form enhanced with prominent progress indicators (`7e795e0`)

### Fixed
- TypeScript errors in route files after confidence scoring update (`67ad22f`)
- TypeScript error in provider detail page timeline (`a01db17`)
- TypeScript compilation error in ProviderVerificationForm.v2 (`ffac2c2`)
- Confidence scoring recency decay logic refined (`a73504f`)

---

## [2026-01-04] - Specialty Categories and City Search

### Added
- **48 specialty categories** for NPI provider classification (`459d758`, `da6a5e5`)
  - Comprehensive taxonomy mapping for NPI import (`4ac7100`)
  - Backend schema updated with specialty categories (`5b4d694`)
- **Searchable city dropdown** with state-based filtering (`e605e47`)
  - Source: `packages/frontend/src/hooks/useCities.ts`
- **Cities cached** in static JSON file for instant loading (`739cec1`)

### Changed
- Specialty dropdown sorted alphabetically A-Z (`5e84518`)

---

## [2026-01-03] - Monorepo Setup, Docker Containerization, and Initial Frontend

### Added
- **Monorepo structure** with npm workspaces: `packages/backend`, `packages/frontend`, `packages/shared` (`57e4251`)
- **Docker containerization** for both backend and frontend services
  - Backend Dockerfile with Prisma support
  - Frontend Dockerfile with Next.js build
- **GitHub Actions CI/CD** workflow deploying to Google Cloud Run (`dd5c694`)
  - Workload Identity Federation for authentication
  - Source: `.github/workflows/deploy.yml`
- **Next.js 14 frontend** with App Router (`57e4251`)
- OpenSSL added for Prisma compatibility (`e658541`)

### Changed
- Confidence display changed to verification status format (`fd8eda5`)

### Fixed
- Confidence score now correctly increases when users verify (`71ba0e0`)
- Numerous Docker build fixes for workspace resolution, Next.js binary paths, and cross-platform compatibility (`3e37631` through `9474c0f`)

---

## [2025-12-24] - Technical Debt Report

### Added
- **Technical debt report** documenting known issues and improvement areas (`8d1f700`)

---

## [2025-12-18] - Testing Setup

### Added
- **Jest testing setup** with initial unit tests for backend services (`ec27c10`)

---

## [2025-12-15] - Project Inception

### Added
- **Initial healthcare provider database** with NPI import and REST API (`07f905b`)
  - Express backend with provider search and detail endpoints
  - Prisma ORM with PostgreSQL (Google Cloud SQL)
  - NPI data import pipeline for provider data ingestion
  - Basic provider search by state, city, ZIP, specialty, and name

---

## Architecture Summary

### Current Stack
| Component | Technology |
|-----------|-----------|
| Backend | Express.js + TypeScript + Prisma ORM |
| Frontend | Next.js 14.2 + React 18 + TailwindCSS |
| Database | PostgreSQL on Google Cloud SQL (`verifymyprovider`) |
| Infrastructure | Google Cloud Run (backend + frontend) |
| CI/CD | GitHub Actions with Workload Identity Federation |
| Analytics | PostHog (privacy-preserving) |
| Logging | Pino (structured JSON) |
| Security | Helmet, CORS, reCAPTCHA v3, rate limiting, CSP |

### Admin Endpoints (9 total, all protected by X-Admin-Secret)
| Endpoint | Purpose |
|----------|---------|
| `POST /admin/cleanup-expired` | Clean up expired verification records |
| `GET /admin/expiration-stats` | Verification expiration statistics |
| `GET /admin/health` | Admin health check with retention metrics |
| `POST /admin/cache/clear` | Clear search cache |
| `GET /admin/cache/stats` | Cache hit/miss statistics |
| `GET /admin/enrichment/stats` | Location enrichment statistics |
| `POST /admin/cleanup/sync-logs` | Clean up old sync logs (90-day retention) |
| `GET /admin/retention/stats` | Comprehensive retention statistics |
| `POST /admin/recalculate-confidence` | Recalculate all confidence scores with decay |

### Database Models (13 total)
- `Provider` (mapped from `providers`) -- core NPI provider records
- `practice_locations` -- provider practice addresses
- `hospitals` -- hospital reference data
- `provider_cms_details` -- CMS enrichment (medical school, telehealth, etc.)
- `provider_hospitals` -- provider-hospital affiliations
- `provider_insurance` -- provider insurance network IDs
- `provider_medicare` -- provider Medicare identifiers
- `provider_taxonomies` -- provider specialty codes
- `taxonomy_reference` -- taxonomy code lookup table
- `InsurancePlan` (mapped from `insurance_plans`) -- insurance plan catalog
- `ProviderPlanAcceptance` (mapped from `provider_plan_acceptance`) -- provider-plan relationships
- `VerificationLog` (mapped from `verification_logs`) -- community verification submissions
- `VoteLog` (mapped from `vote_logs`) -- vote deduplication
- `SyncLog` (mapped from `sync_logs`) -- data import audit trail
- `DataQualityAudit` (mapped from `data_quality_audit`) -- data quality tracking

### Security Layers
1. **Rate limiting** -- IP-based sliding window (Redis distributed or in-memory fallback)
2. **CAPTCHA** -- Google reCAPTCHA v3 with configurable fail-open/fail-closed
3. **Honeypot** -- Hidden form field for bot detection
4. **Vote deduplication** -- One vote per IP per verification via VoteLog
5. **Sybil prevention** -- 30-day sliding windows per IP and per email
6. **Request size limits** -- 100kb body parser limits
7. **Helmet** -- Security headers including strict CSP
8. **Secret scanning** -- Gitleaks CI on every push
9. **Audit gate** -- npm audit at critical severity in CI
