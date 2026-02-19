# VerifyMyProvider Known Issues

**Generated:** 2026-02-18

---

## Table of Contents

1. [Architecture Issues](#architecture-issues)
2. [Development Environment Issues](#development-environment-issues)
3. [Data Quality Issues](#data-quality-issues)
4. [Security Gaps](#security-gaps)
5. [Frontend Limitations](#frontend-limitations)
6. [Operational Gaps](#operational-gaps)
7. [Resolved Issues](#resolved-issues)

---

## Issue Severity Definitions

| Severity | Definition |
|----------|-----------|
| **Critical** | Blocks launch or causes data loss |
| **High** | Significant feature gap or security concern |
| **Medium** | Known limitation with workaround |
| **Low** | Nice-to-have improvement |

---

## Architecture Issues

### ARCH-1: Location enrichment admin endpoints disabled

**Severity:** Medium
**Status:** Open
**Component:** `packages/backend/src/routes/admin.ts`

**Description:**
Admin endpoints for location enrichment (beyond stats) are commented out in `admin.ts`. The enrichment stats endpoint works, but batch enrichment operations are not exposed via API.

**Impact:**
Location enrichment must be run via direct script execution rather than admin API calls.

**Workaround:**
Run enrichment scripts directly:
```bash
npx tsx scripts/enrich-providers-nppes.ts
```

---

### ARCH-2: No OpenAPI / Swagger specification

**Severity:** Low
**Status:** Open
**Component:** Backend API

**Description:**
The API has no auto-generated OpenAPI/Swagger specification. All documentation is manually maintained.

**Impact:**
- No interactive API playground
- No auto-generated client SDKs
- Documentation may drift from implementation

**Recommendation:**
Consider adding `swagger-jsdoc` or `tsoa` for auto-generated API docs from route code.

---

### ARCH-3: Single database for staging and production

**Severity:** Medium
**Status:** Open
**Component:** Infrastructure

**Description:**
The staging environment shares the same Cloud SQL database instance as production. Staging deploys apply `prisma db push` against the production database.

**Impact:**
- Schema changes in staging immediately affect production data
- No isolation for testing destructive changes

**Workaround:**
Schema changes are reviewed at PR time. Non-destructive changes (new columns, new tables) are safe. Destructive changes require extra caution.

**Recommendation:**
Create a separate Cloud SQL instance or database for staging.

---

### ARCH-4: No message queue for async operations

**Severity:** Low
**Status:** Open
**Component:** Backend

**Description:**
Async operations (cache invalidation after verification, batch confidence recalculation) are handled inline or via `Promise.catch()`. There is no message queue for reliable async processing.

**Impact:**
- Failed async operations are logged but not retried
- No dead-letter queue for failed operations

**Recommendation:**
Consider Cloud Tasks or Pub/Sub for reliable async processing as traffic grows.

---

## Development Environment Issues

### DEV-1: Next.js SWC on Windows ARM64 + Node 24

**Severity:** Medium
**Status:** Open (workaround in place)
**Component:** `packages/frontend/scripts/patch-next-swc.js`

**Description:**
Native SWC binaries for Next.js 14.x are incompatible with Node.js v24+ on Windows ARM64. The error message is "not a valid Win32 application."

**Workaround:**
Postinstall script (`patch-next-swc.js`) automatically patches `next/dist/build/swc/index.js` to:
1. Add `aarch64-pc-windows-msvc` to `knownDefaultWasmFallbackTriples`
2. Remove `useWasmBinary` gate for automatic WASM fallback

**Root Cause:**
Next.js 14.x only auto-enables WASM fallback for a hardcoded list of platforms, and `win32-arm64` is not in that list.

**Resolution path:**
Will be resolved when Next.js updates its platform support list, or when the project upgrades to a newer Next.js version.

---

### DEV-2: OneDrive corrupts native node_modules binaries

**Severity:** Medium
**Status:** Open (workaround documented)
**Component:** Development environment

**Description:**
OneDrive file sync can corrupt native `.node` binaries in `node_modules` during sync operations.

**Workaround:**
- WASM fallbacks are more reliable than native binaries on OneDrive-synced projects
- Exclude `node_modules` from OneDrive sync if possible
- Move project to a non-synced directory

---

### DEV-3: npm workspace hoisting can break Next.js

**Severity:** High
**Status:** Open (documented, preventable)
**Component:** Root `package.json`

**Description:**
If `next` is added to the root `package.json`, npm workspace hoisting will install it at the root level, overriding the version specified in `packages/frontend/package.json`. This causes SWC version mismatches and build failures.

**Prevention:**
- **NEVER put `next` in the root `package.json`**
- Only shared dependencies belong at root: `prisma`, `@prisma/client`, `csv-parse`, `pg`

**Fix if triggered:**
```bash
# Remove next from root package.json, then:
rm -rf node_modules package-lock.json
npm install
```

---

### DEV-4: .env.example is incomplete

**Severity:** Low
**Status:** Open
**Component:** Root directory

**Description:**
The `.env.example` file (if it exists) is missing several environment variables that are needed for full functionality:
- `RECAPTCHA_SECRET_KEY` / `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
- `ADMIN_SECRET`
- `REDIS_URL`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `INSURANCE_ENCRYPTION_KEY`
- `CSRF_SECRET`
- `JWT_SECRET`
- `RESEND_API_KEY`
- `MAGIC_LINK_BASE_URL`

**Recommendation:**
Create a comprehensive `.env.example` with all variables documented.

---

## Data Quality Issues

### DATA-1: NPI data partially imported

**Severity:** Medium
**Status:** Expected (pre-launch)
**Component:** Database

**Description:**
Only 6 states (FL, AL, AK, AR, AZ, CA) have been imported for pipeline testing, comprising approximately 2.1M provider records. These are NOT the launch dataset -- they were used to validate the import pipeline.

**Plan:**
NYC-specific import (5-borough zip codes) is planned for the Q2 2026 launch, targeting ~50-75K providers.

---

### DATA-2: City name quality issues in NPI data

**Severity:** Medium
**Status:** Open (partial fix available)
**Component:** `practice_locations` table

**Description:**
City names from NPI data contain inconsistencies:
- Trailing state codes (e.g., "NEW YORK NY")
- Trailing punctuation (e.g., "BROOKLYN,")
- Misspellings and variant spellings

**Impact:**
- Search results may miss providers due to non-matching city names
- City dropdown lists contain duplicates/garbage entries

**Workaround:**
Cleanup scripts exist but have not been run across all imported data. The `getCitiesByState` endpoint returns raw city values from the database.

---

### DATA-3: Provider addresses may be stale

**Severity:** Medium
**Status:** Inherent to NPI data
**Component:** `practice_locations` table

**Description:**
NPI data is self-reported by providers and rarely updated. Some providers show outdated addresses for practices they have left.

**Mitigation:**
- Crowdsourced verifications will flag incorrect addresses over time
- Practice re-verification (Phase 5B) has verified 2,552 practices across 15 specialties
- The confidence scoring system accounts for data staleness via the recency factor

---

### DATA-4: Mount Sinai and NYP provider URL searches pending

**Severity:** Low
**Status:** Open
**Component:** Data enrichment pipeline

**Description:**
Two large hospital systems still need provider URL replacement searches:
- Mount Sinai: 3,042 providers
- NYP (New York-Presbyterian): 3,919 providers

Previous URL validation found:
- MSK rate-limits WebFetch after ~100 requests
- NYU Langone URLs often need middle initials in slug
- NYP URLs had wrong practice location slugs (0% pass rate)

---

## Security Gaps

### SEC-1: No automated secret scanning in CI

**Severity:** Medium
**Status:** Open
**Component:** CI/CD pipeline

**Description:**
No gitleaks, truffleHog, or similar secret scanning tools are configured in the CI pipeline. Accidentally committed secrets would not be automatically detected.

**Recommendation:**
Add `gitleaks` or GitHub's built-in secret scanning to the CI pipeline.

---

### SEC-2: No Cloud Armor / DDoS protection

**Severity:** Medium
**Status:** Open
**Component:** Infrastructure

**Description:**
Cloud Run services are publicly accessible without a Web Application Firewall (WAF). There is no Cloud Armor or similar DDoS protection in front of the services.

**Current Mitigation:**
- Rate limiting at the application level (sliding window per IP)
- reCAPTCHA v3 on verification endpoints
- Cloud Run's built-in DDoS protection at the infrastructure level

**Recommendation:**
Add Cloud Armor with rate limiting rules for production launch.

---

### SEC-3: Rate limiting is IP-based only

**Severity:** Low
**Status:** Open (design choice)
**Component:** `packages/backend/src/middleware/rateLimiter.ts`

**Description:**
Rate limiting uses IP addresses as the identifier. Users behind shared IPs (corporate NAT, VPN) share rate limit quotas.

**Impact:**
- Potential for false positives on shared networks
- Cannot distinguish between users on the same IP

**Future improvement:**
Add user-based rate limiting for authenticated users (track by user ID in addition to IP).

---

### SEC-4: No rate limiting on admin endpoints

**Severity:** Low
**Status:** Open
**Component:** `packages/backend/src/routes/admin.ts`

**Description:**
Admin endpoints are protected by the `X-Admin-Secret` header but do not have rate limiting applied. A compromised admin secret could be used for unlimited requests.

**Mitigation:**
- Admin endpoints are not publicly documented
- Secret is validated with timing-safe comparison
- Returns 503 (not 401) if secret not configured, preventing enumeration

---

## Frontend Limitations

### FE-1: No offline support

**Severity:** Low
**Status:** Open
**Component:** Frontend

**Description:**
No service worker or PWA manifest is configured. The application does not work offline.

**Impact:**
Users cannot access any features without an internet connection. No caching of previously viewed providers.

---

### FE-2: No full accessibility audit

**Severity:** Medium
**Status:** Open
**Component:** Frontend

**Description:**
Focus trap exists for modals (via `focus-trap-react`), but a full keyboard navigation and screen reader testing has not been conducted.

**Areas needing review:**
- Tab order across all pages
- ARIA labels on interactive elements
- Screen reader announcements for dynamic content
- Color contrast ratios
- Skip navigation links

---

### FE-3: No SEO optimization

**Severity:** Medium
**Status:** Open
**Component:** Frontend

**Description:**
Provider pages do not have structured data (JSON-LD), comprehensive meta tags, or sitemap generation.

**Impact:**
- Provider pages may not appear in search results
- No rich snippets in Google search results
- Missing OG tags for social sharing

**Recommendation:**
Add structured data for healthcare providers (Schema.org Physician/MedicalOrganization), sitemap generation, and comprehensive meta tags.

---

## Operational Gaps

### OPS-1: No automated alerting

**Severity:** Medium
**Status:** Open
**Component:** Infrastructure

**Description:**
No automated alerting is configured for:
- Error rate spikes
- Response time degradation
- Database connection failures
- Rate limiting threshold breaches
- Cloud Run scaling events

**Current state:**
Logs are available in Cloud Logging, and the health endpoint provides basic status, but no proactive alerting exists.

**Recommendation:**
Configure Cloud Monitoring alerting policies for:
- HTTP error rate > 5% over 5 minutes
- P95 latency > 5 seconds
- Health check failures
- Instance count hitting max

---

### OPS-2: No post-deploy smoke test automation beyond CI

**Severity:** Low
**Status:** Open
**Component:** CI/CD

**Description:**
The CI/CD pipeline includes basic smoke tests (HTTP 200 on health endpoint), but there are no comprehensive post-deploy integration tests that verify:
- Provider search returns results
- Verification submission works end-to-end
- Authentication flow completes
- Database connectivity with real queries

---

### OPS-3: No backup verification

**Severity:** Medium
**Status:** Open
**Component:** Infrastructure

**Description:**
Cloud SQL automated backups are presumably enabled (GCP default), but there is no documented backup verification process or tested restore procedure.

**Recommendation:**
Document backup schedule, retention policy, and test a restore procedure.

---

## Resolved Issues

### RESOLVED: Locations route disabled

**Status:** Resolved (January 2026)
**Resolution:** `routes/locations.ts` is registered and active in `routes/index.ts`. Frontend `/location/[locationId]` page connects to working API endpoints. All 5 location endpoints functional: search, health-systems, stats/:state, /:locationId, /:locationId/providers.

---

### RESOLVED: No staging environment

**Status:** Resolved (January 2026)
**Resolution:** Staging pipeline exists at `.github/workflows/deploy-staging.yml`. Triggers on `staging` branch push. Deploys to separate Cloud Run services (`-staging` suffix) with max 2 instances.

---

### RESOLVED: Prisma migration history conflicts

**Status:** Resolved (February 2026)
**Resolution:** 4 old migrations baselined as applied in `_prisma_migrations` table. Production uses `prisma db push` for schema management (not `prisma migrate`).

---

### RESOLVED: pg SSL failures with Cloud SQL

**Status:** Resolved (February 2026)
**Resolution:** Centralized `createPool()` function in `scripts/pre-import-check.ts` strips `sslmode` from connection URL and sets `ssl: { rejectUnauthorized: false }` programmatically. All scripts use this function.

---

### RESOLVED: NPI import overwrites enriched data

**Status:** Resolved (February 2026)
**Resolution:** Enrichment protection system implemented: `data_source` column, explicit field allowlists in import scripts, `import_conflicts` table for conflict resolution, `pre-import-check.ts` safety script.
