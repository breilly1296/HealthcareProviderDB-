# Known Issues & Limitations

> **Project:** VerifyMyProvider (HealthcareProviderDB)
> **Updated:** 2026-02-07
> **Scope:** All known issues, limitations, and workarounds across the monorepo

---

## Table of Contents

1. [Architecture Issues](#1-architecture-issues)
2. [Development Environment Issues](#2-development-environment-issues)
3. [Data Quality Issues](#3-data-quality-issues)
4. [Security Gaps](#4-security-gaps)
5. [Frontend Limitations](#5-frontend-limitations)
6. [Schema Limitations](#6-schema-limitations)
7. [Open Questions](#7-open-questions)
8. [Issue Summary Table](#8-issue-summary-table)

---

## 1. Architecture Issues

### 1.1 Locations Route -- RESOLVED

**Status:** Resolved
**Severity:** N/A

The locations API route is fully registered and active. The backend router at `packages/backend/src/routes/index.ts` mounts the locations module:

```typescript
import locationsRouter from './locations';
// ...
router.use('/locations', locationsRouter);
```

The route file at `packages/backend/src/routes/locations.ts` exposes five endpoints:
- `GET /api/v1/locations/search` -- search by state, city, zip code
- `GET /api/v1/locations/health-systems` -- list distinct health system names
- `GET /api/v1/locations/stats/:state` -- location statistics per state
- `GET /api/v1/locations/:locationId` -- single location detail
- `GET /api/v1/locations/:locationId/providers` -- providers at a location

The frontend page at `packages/frontend/src/app/location/[locationId]/page.tsx` consumes the API via `locationApi.getProviders()` and renders a fully functional location detail view with provider listing, specialty filtering, and pagination.

---

### 1.2 Location Enrichment Partially Disabled

**Status:** Open
**Severity:** Low
**Affected files:**
- `packages/backend/src/routes/admin.ts`
- `packages/backend/src/services/locationEnrichment.ts`
- `packages/backend/src/services/index.ts`

The location enrichment service exists and is functional for read-only queries, but it is not fully integrated. The admin route only exposes a stats endpoint:

```typescript
// packages/backend/src/routes/admin.ts (lines 247-258)
router.get(
  '/enrichment/stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const stats = await getEnrichmentStats();
    res.json({ success: true, data: stats });
  })
);
```

There are no admin endpoints to trigger batch enrichment. The `locationEnrichment.ts` service provides `enrichLocationWithHospitalData()` for single-location enrichment and `findColocatedProviders()` for co-location matching, but neither is wired to an admin trigger.

Additionally, the `locationService` is explicitly commented out of the service barrel export at `packages/backend/src/services/index.ts`:

```typescript
// TODO: locationService requires a Location model that doesn't exist in the new schema
// practice_locations is a flat per-provider table, not a deduplicated locations entity
// export * from './locationService';
```

This indicates a design tension: `practice_locations` is a flat per-provider table rather than a deduplicated entity. Location-level queries still work via direct imports in the route file, but the service is excluded from the shared index.

**Workaround:** The locations route imports `locationService` directly rather than through the barrel export. The enrichment stats endpoint works. Full enrichment batch processing would need new admin endpoints.

---

### 1.3 Staging Environment -- RESOLVED

**Status:** Resolved
**Severity:** N/A

A staging pipeline exists at `.github/workflows/deploy-staging.yml`. It triggers on pushes to the `staging` branch and deploys to Cloud Run services with the `-staging` suffix:

```yaml
env:
  BACKEND_SERVICE: verifymyprovider-backend-staging
  FRONTEND_SERVICE: verifymyprovider-frontend-staging
```

Staging instances are constrained to a maximum of 2 instances (vs. 10 for production):

```yaml
flags: |
  --max-instances=2
```

Both staging and production pipelines include smoke tests after deployment.

---

## 2. Development Environment Issues

### 2.1 Next.js SWC on Windows ARM64

**Status:** Open (workaround in place)
**Severity:** Medium -- affects local development on ARM64 Windows
**Affected file:** `packages/frontend/scripts/patch-next-swc.js`

Native SWC binaries shipped with Next.js 14.x are incompatible with Node.js v24+ on Windows ARM64. The error manifests as "not a valid Win32 application" despite the binary being a valid PE32+ ARM64 executable. Next.js 14.x only auto-enables the WASM fallback for a hardcoded list of platforms, and `win32-arm64` is not included.

**Workaround:** A postinstall script patches `next/dist/build/swc/index.js` with two changes:

1. Adds `"aarch64-pc-windows-msvc"` to the `knownDefaultWasmFallbackTriples` array
2. Removes the `useWasmBinary` gate so unsupported platforms automatically fall back to WASM

```javascript
// packages/frontend/scripts/patch-next-swc.js (lines 51-67)
// Patch 1: Add aarch64-pc-windows-msvc to WASM fallback triples
if (!content.includes('"aarch64-pc-windows-msvc"')) {
  content = content.replace(
    '"i686-pc-windows-msvc"\n];',
    '"i686-pc-windows-msvc",\n    "aarch64-pc-windows-msvc"\n];'
  );
  patched = true;
}

// Patch 2: Remove useWasmBinary gate
if (content.includes('unsupportedPlatform && useWasmBinary ||')) {
  content = content.replace(
    'unsupportedPlatform && useWasmBinary ||',
    'unsupportedPlatform ||'
  );
  patched = true;
}
```

The script runs automatically via `postinstall` in `packages/frontend/package.json`:

```json
"postinstall": "node scripts/patch-next-swc.js || true"
```

The WASM fallback package is also listed as a dev dependency:

```json
"@next/swc-wasm-nodejs": "^14.2.33"
```

**Impact:** This only affects local development on Windows ARM64 machines. CI/CD runs on `ubuntu-latest` where native SWC works fine. The patch is harmless on non-ARM64 systems.

---

### 2.2 OneDrive + node_modules Corruption

**Status:** Open (workaround in place)
**Severity:** Low
**Root cause:** OneDrive file sync can corrupt native `.node` binaries inside `node_modules` by modifying file handles during sync operations.

**Workaround:** WASM fallbacks (like the SWC WASM fallback described above) are more reliable than native binaries in OneDrive-synced projects. If native binaries fail, deleting `node_modules` and running `npm install` while OneDrive sync is paused can help.

**Long-term fix:** Move the project outside of OneDrive-synced directories, or use `.gitignore`-style exclusion in OneDrive settings for `node_modules`.

---

### 2.3 npm Workspace Hoisting Pitfall

**Status:** Open (documented convention)
**Severity:** High if violated -- causes build failures
**Affected file:** Root `package.json`

The `next` package must NOT appear in the root `package.json`. The root previously had `next@^16.1.1` while the frontend workspace needed `next@^14.2.35`, causing SWC version mismatches and build failures.

**Current root `package.json` dependencies (correct):**

```json
{
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "csv-parse": "^6.1.0",
    "pg": "^8.16.3",
    "prisma": "^5.22.0"
  }
}
```

**Convention:** Only shared dependencies (Prisma, csv-parse, pg) belong at the root. Framework dependencies (Next.js, React) must stay in their respective workspace `package.json` files.

---

## 3. Data Quality Issues

### 3.1 NPI Data Partially Imported

**Status:** Open
**Severity:** High -- incomplete national coverage
**Affected scripts:**
- `scripts/import-filtered-csv.ts`
- `scripts/import-csv-simple.ts`
- `scripts/import-csv-copy.ts`
- `scripts/import-npi.ts`
- `scripts/import-npi-direct.ts`

Only 6 states have been imported into the database: FL, AL, AK, AR, AZ, CA (approximately 2.1 million provider records). The remaining 44 states plus territories have not been imported.

The import scripts support per-state CSV files and can be run incrementally:

```
npx tsx scripts/import-filtered-csv.ts -- --file "path/to/STATE.csv"
```

**Impact:** Users searching for providers in non-imported states will get empty results. The location stats endpoint (`GET /api/v1/locations/stats/:state`) will confirm which states have data.

---

### 3.2 City Name Quality Issues

**Status:** Open (cleanup script exists but not fully applied)
**Severity:** Medium
**Affected file:** `scripts/normalize-city-names.ts`

NPI data contains city name inconsistencies including:
- Typos (e.g., "PHEONIX", "LOS ANGELAS", "CHICAO")
- Trailing state codes (e.g., "NEW YORK NY", "HOUSTON TX")
- Neighborhood names used as city names (e.g., "FLUSHING" instead of "Queens", "KOREATOWN" instead of "Los Angeles")
- Trailing punctuation and zip codes appended to city fields
- Double spaces and inconsistent capitalization

A comprehensive normalization script exists at `scripts/normalize-city-names.ts` covering 6 major metro areas:

| Metro | State | Mapping Count |
|-------|-------|---------------|
| NYC | NY | ~280 variations |
| Los Angeles | CA | ~170 variations |
| Chicago | IL | ~130 variations |
| Houston | TX | ~115 variations |
| Phoenix | AZ | ~60 variations |
| Philadelphia | PA | ~135 variations |

The script supports dry-run mode and per-state execution:

```bash
npx tsx scripts/normalize-city-names.ts              # Dry run (all metros)
npx tsx scripts/normalize-city-names.ts --apply      # Apply changes
npx tsx scripts/normalize-city-names.ts --state NY   # Specific state
```

**Impact:** Inconsistent city names affect search accuracy and grouping. A search for "Queens" may miss providers listed under "FLUSHING", "JAMAICA", or "ASTORIA".

**Note:** The script only covers providers in the `providers` table. City names in `practice_locations` may also need normalization.

---

### 3.3 Provider Addresses Are Self-Reported and Stale

**Status:** Open -- inherent to NPI data source
**Severity:** Medium

NPI data is self-reported by providers to CMS and is rarely updated. Some providers show outdated practice addresses, disconnected phone numbers, or previous locations. There is no automated mechanism to detect or flag stale address data.

The schema tracks `nppes_last_synced` (when the provider record was last refreshed from NPPES) and `last_update_date` (when CMS last received an update from the provider), but these dates may lag significantly behind actual provider relocations.

**Workaround:** The community verification system (`VerificationLog`, `VoteLog`) allows users to report updated provider information, and confidence decay (`confidenceDecayService`) gradually reduces the confidence score of unverified records over time.

---

## 4. Security Gaps

### 4.1 No Automated Secret Scanning in CI -- RESOLVED

**Status:** Resolved (2026-02-07)
**Severity:** N/A

CI now includes comprehensive security scanning:

1. **Gitleaks secret scanning** (`security-scan.yml`) — runs on push to main and PRs to main/staging, with `.gitleaks.toml` allowlists for `.env.example` files, test files, and docker-compose dev credentials
2. **CodeQL SAST analysis** (`codeql.yml`) — static analysis for `javascript-typescript` on push to main, PRs to main, and weekly cron; fails on error-severity findings
3. **Dependency review** (`test.yml`) — `actions/dependency-review-action@v4` flags new dependencies with critical vulnerabilities on every PR
4. **npm audit** (`test.yml`, `deploy.yml`, `deploy-staging.yml`) — `--audit-level=critical` gate in all pipelines

---

### 4.2 Cloud Armor / WAF Not Yet Deployed

**Status:** Open (setup script exists but not executed)
**Severity:** High
**Affected files:**
- `scripts/setup-cloud-armor.sh`
- `packages/backend/scripts/setup-cloud-armor.sh`
- `docs/CLOUD-ARMOR.md`

Cloud Run services are deployed with `--allow-unauthenticated`, meaning they are publicly accessible without a Web Application Firewall (WAF) or DDoS protection.

A comprehensive Cloud Armor setup script exists at `scripts/setup-cloud-armor.sh` that would:
1. Reserve a static external IP
2. Create a Cloud Armor security policy with WAF rules (SQLi, XSS, RCE blocking)
3. Add rate limiting (100 req/min per IP, 5-min ban)
4. Route traffic through a Global HTTPS Load Balancer
5. Set up Google-managed SSL certificates

The script is documented but has not been run in production yet. After setup, the Cloud Run services should be locked down with `--no-allow-unauthenticated` to force all traffic through the load balancer.

**Estimated cost increase:** ~$18-25/month on top of the existing ~$13/month for the load balancer forwarding rule and traffic.

**Current mitigation:** Application-level rate limiting exists via Express middleware (`rateLimiter.ts`), and reCAPTCHA v3 protects verification endpoints.

---

### 4.3 `.env.example` Configuration

**Status:** Resolved (mostly)
**Severity:** Low

The root `.env.example` file at the project root has been updated to include comprehensive configuration documentation. It now covers:

- `DATABASE_URL` -- PostgreSQL connection string
- `PORT`, `NODE_ENV` -- server configuration
- `CORS_ORIGIN`, `FRONTEND_URL` -- CORS settings
- `REDIS_URL` -- optional Redis for distributed rate limiting
- `ADMIN_SECRET` -- admin route authentication
- `RECAPTCHA_SECRET_KEY`, `CAPTCHA_FAIL_MODE` -- reCAPTCHA v3 configuration
- `ANTHROPIC_API_KEY` -- insurance card OCR
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` -- analytics
- `NEXT_PUBLIC_API_URL` -- frontend API URL
- `NEXT_PUBLIC_SITE_URL` -- sitemap generation
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` -- client-side reCAPTCHA
- `LOG_LEVEL` -- Pino log level

The per-workspace `.env.example` files (`packages/backend/.env.example` and `packages/frontend/.env.example`) contain a subset of these variables relevant to each workspace.

**Remaining gap:** The per-workspace `.env.example` files are less comprehensive than the root one. The frontend `.env.example` is missing `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SITE_URL`, and `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`.

---

### 4.4 CSP Header Disabled -- RESOLVED

**Status:** Resolved (2026-02-07)
**Severity:** N/A

The Content-Security-Policy header was disabled on 2026-01-31 (commit `9f1278a`) because it was blocking API requests. It has been re-enabled in `Content-Security-Policy-Report-Only` mode with properly configured directives allowing the backend API, Google reCAPTCHA, and PostHog analytics. After 2 weeks of clean monitoring, it will be switched to enforcing mode.

**Source:** `packages/frontend/next.config.js`

---

### 4.5 CAPTCHA Not Integrated in Frontend -- RESOLVED

**Status:** Resolved (2026-02-07)
**Severity:** N/A

The backend reCAPTCHA v3 middleware existed since 2026-01-24, but the frontend was not sending reCAPTCHA tokens with verification/vote requests. The frontend now integrates `react-google-recaptcha-v3` via `ReCaptchaProvider` in `layout.tsx`, and the `ProviderVerificationForm` sends tokens with all verification and vote API calls.

**Source:** `packages/frontend/src/components/ReCaptchaProvider.tsx`, `packages/frontend/src/components/provider-detail/ProviderVerificationForm.tsx`

---

### 4.6 GET /providers/:npi/plans Returns 404 -- RESOLVED

**Status:** Resolved (2026-02-07)
**Severity:** N/A

The frontend provider detail page called `GET /api/v1/providers/:npi/plans` but no such endpoint existed, resulting in 404 errors. The endpoint has been added to the backend providers router, returning paginated insurance plans with acceptance status and confidence scores for a given provider.

**Source:** `packages/backend/src/routes/providers.ts`

---

### 4.7 ProviderVerificationForm Non-Standard API Path -- RESOLVED

**Status:** Resolved (2026-02-07)
**Severity:** N/A

The `ProviderVerificationForm` component was using hardcoded `fetch()` calls with a non-standard API path instead of the shared API client (`packages/frontend/src/lib/api.ts`). It has been refactored to use the standard `providerApi` and `verifyApi` namespaced functions with built-in retry logic, error handling, and base URL configuration.

**Source:** `packages/frontend/src/components/provider-detail/ProviderVerificationForm.tsx`

---

## 5. Frontend Limitations

### 5.1 No Offline Support / PWA

**Status:** Open
**Severity:** Low

There is no service worker, PWA manifest, or offline caching strategy. The application requires an active network connection for all functionality. No `manifest.json` or service worker registration file exists in the frontend codebase.

**Impact:** Users on unreliable mobile connections may experience failed requests without graceful degradation. Previously fetched data is not cached for offline access.

---

### 5.2 Accessibility Audit -- PARTIALLY RESOLVED

**Status:** Partially resolved (2026-02-07)
**Severity:** Low (remaining items)

A targeted accessibility audit was performed and high-impact fixes applied:

**Resolved:**
- **Skip-to-content link** added to `layout.tsx` with `id="main-content"` on `<main>`
- **Focus trapping** added to `InsuranceList.tsx` verification modal (Escape key close, body scroll lock, `role="dialog"`, `aria-modal`, `aria-labelledby`)
- **`aria-hidden="true"`** on all decorative icons across `ProviderCard`, `InsuranceList`, `ConfidenceGauge`, `SearchForm`
- **Screen reader labels** (`sr-only` text) for status icons in `InsuranceList`
- **`role="alert"` / `aria-live="polite"`** on `CookieConsent` banner and `SearchForm` error messages
- **`aria-label`** on filter chip remove buttons, search inputs, clear buttons, and close buttons

**Still open:**
- Full keyboard navigation testing across all interactive flows
- Screen reader testing with NVDA/VoiceOver
- Color contrast ratios not verified against WCAG 2.1 AA
- Focus management on Next.js client-side navigation not tested
- `SearchableSelect` keyboard navigation not fully verified

---

## 6. Schema Limitations

### 6.1 Mixed Naming Conventions in Prisma Schema

**Status:** Open
**Severity:** Low (cosmetic, but affects developer experience)
**Affected file:** `packages/backend/prisma/schema.prisma`

The Prisma schema uses a mix of naming conventions because it was generated from `prisma db pull` against an existing PostgreSQL database:

**PascalCase models with `@@map`:** `Provider`, `InsurancePlan`, `ProviderPlanAcceptance`, `VerificationLog`, `VoteLog`, `SyncLog`, `DataQualityAudit`

**Lowercase models without renaming:** `hospitals`, `practice_locations`, `provider_cms_details`, `provider_hospitals`, `provider_insurance`, `provider_medicare`, `provider_taxonomies`, `taxonomy_reference`

**Fields with `@map` (camelCase in code):** `entityType`, `lastName`, `firstName`, `organizationName`, `nppesLastSynced`, `planId`, `planName`, etc.

**Fields without `@map` (snake_case in code):** `middle_name`, `name_prefix`, `name_suffix`, `last_update_date`, `deactivation_date`, `is_sole_proprietor`, `primary_taxonomy_code`, `primary_specialty`, `specialty_category`, etc.

This creates an inconsistent API surface where some fields are `provider.firstName` and others are `provider.primary_specialty`.

---

### 6.2 `address_hash` Column Not Fully Migrated

**Status:** Open
**Severity:** Low
**Affected files:**
- `packages/backend/src/services/locationService.ts`
- `packages/backend/src/services/locationEnrichment.ts`

The `practice_locations` table has an `address_hash` column (SHA-256 hash for deduplication), but the services explicitly exclude it from select queries:

```typescript
// packages/backend/src/services/locationService.ts (lines 22-23)
/**
 * Explicit select for practice_locations to avoid unmigrated columns (address_hash).
 * Once the Phase 2 migration lands, address_hash can be added here.
 */

// packages/backend/src/services/locationEnrichment.ts (line 11)
// Shared Selects (avoid address_hash -- not yet migrated)
```

This suggests a Phase 2 migration is planned to fully populate the `address_hash` column for address deduplication. Currently, location deduplication relies on text-based address matching.

---

### 6.3 practice_locations Is Not a Deduplicated Entity

**Status:** Open (architectural limitation)
**Severity:** Medium

As noted in `packages/backend/src/services/index.ts`:

```typescript
// TODO: locationService requires a Location model that doesn't exist in the new schema
// practice_locations is a flat per-provider table, not a deduplicated locations entity
```

The `practice_locations` table stores one row per provider-address combination, meaning the same physical address appears multiple times if multiple providers practice there. The `getProvidersAtLocation` function in `locationService.ts` works around this by first looking up the address from a single location ID, then querying for all locations that share the same address components.

**Impact:** There is no canonical "location" record to link providers. Location-centric features (e.g., "show me all providers at 123 Main St") require runtime address matching rather than a foreign key join on a deduplicated locations table. The `address_hash` column (Issue 6.2) is intended to improve this, but is not yet fully populated.

---

## 7. Open Questions

1. **Sprint prioritization:** Which issues should be addressed in the next sprint? The NPI data import gap (3.1) and Cloud Armor deployment (4.2) appear most impactful.
2. **Blocking features:** Are any of these issues currently blocking user-facing features? The partial NPI import blocks national search coverage.
3. **Status page:** Should a public-facing status page (e.g., via Instatus, Statuspage, or a custom `/status` route) be added?
4. **Production-discovered issues:** Are there issues discovered in production monitoring or user feedback that are not documented here?
5. **Tracking migration:** Should these issues be migrated to GitHub Issues with labels and milestones for formal tracking?
6. **Cloud Armor timeline:** When should the Cloud Armor setup script be executed? This adds ~$18-25/month in cost but significantly improves security posture.

---

## 8. Issue Summary Table

| # | Issue | Category | Severity | Status | Workaround? |
|---|-------|----------|----------|--------|-------------|
| 1.1 | Locations route disabled | Architecture | -- | RESOLVED | N/A |
| 1.2 | Location enrichment partially disabled | Architecture | Low | Open | Stats endpoint works; batch enrichment needs endpoints |
| 1.3 | No staging environment | Architecture | -- | RESOLVED | N/A |
| 2.1 | Next.js SWC on Windows ARM64 | Dev Environment | Medium | Open | Postinstall patch script (`patch-next-swc.js`) |
| 2.2 | OneDrive + node_modules corruption | Dev Environment | Low | Open | Use WASM fallbacks; pause OneDrive sync during install |
| 2.3 | npm workspace hoisting pitfall | Dev Environment | High (if violated) | Open | Convention: keep `next` out of root `package.json` |
| 3.1 | NPI data partially imported (6/50+ states) | Data | High | Open | Import remaining states via existing scripts |
| 3.2 | City name quality issues | Data | Medium | Open | `normalize-city-names.ts` script (not yet fully applied) |
| 3.3 | Provider addresses stale | Data | Medium | Open | Community verification + confidence decay |
| 4.1 | No automated secret scanning | Security | -- | RESOLVED | Gitleaks + CodeQL + dependency review in CI |
| 4.2 | Cloud Armor / WAF not deployed | Security | High | Open | Script exists (`setup-cloud-armor.sh`); needs execution |
| 4.3 | `.env.example` gaps | Security | Low | Mostly Resolved | Root file is comprehensive; workspace files need updates |
| 4.4 | CSP header disabled | Security | -- | RESOLVED | Re-enabled in report-only mode |
| 4.5 | CAPTCHA not integrated in frontend | Security | -- | RESOLVED | reCAPTCHA v3 wired up in frontend |
| 4.6 | GET /providers/:npi/plans 404 | API | -- | RESOLVED | Endpoint added to providers router |
| 4.7 | ProviderVerificationForm non-standard API | Frontend | -- | RESOLVED | Refactored to use standard API client |
| 5.1 | No offline support / PWA | Frontend | Low | Open | None |
| 5.2 | Accessibility audit incomplete | Frontend | Low | Partially Resolved | Major fixes applied; screen reader/contrast testing remains |
| 6.1 | Mixed naming conventions in schema | Schema | Low | Open | Ongoing manual mapping with `@map` directives |
| 6.2 | `address_hash` not fully migrated | Schema | Low | Open | Services use explicit selects to avoid the column |
| 6.3 | practice_locations not deduplicated | Schema | Medium | Open | Runtime address matching; Phase 2 migration planned |

---

## Checklist

- [x] Architecture issues documented
- [x] Development environment issues documented
- [x] Data quality issues documented
- [x] Security gaps documented
- [x] Frontend limitations documented
- [x] Schema limitations documented
- [x] Severity assigned to each issue
- [ ] GitHub Issues created for tracking
- [x] Workarounds documented for all issues
