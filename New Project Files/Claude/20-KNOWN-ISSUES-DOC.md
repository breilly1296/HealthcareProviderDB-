# VerifyMyProvider Known Issues

**Last Updated:** 2026-02-05
**Generated From:** prompts/20-known-issues-doc.md

---

## Severity Definitions

| Severity | Definition |
|---|---|
| **Critical** | Feature is broken or a security vulnerability exists that requires immediate attention |
| **High** | Significant functionality is missing or degraded; impacts users or operations |
| **Medium** | Feature limitation or inconvenience; workaround available |
| **Low** | Minor issue or cosmetic; does not affect core functionality |

---

## Table of Contents

1. [Architecture Issues](#1-architecture-issues)
2. [Development Environment Issues](#2-development-environment-issues)
3. [Data Quality Issues](#3-data-quality-issues)
4. [Security Issues](#4-security-issues)
5. [Frontend Issues](#5-frontend-issues)
6. [Configuration Issues](#6-configuration-issues)

---

## 1. Architecture Issues

### ISSUE-001: Locations Route Disabled

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | Architecture |
| **Status** | Open |
| **Impact** | The `/api/v1/locations/*` endpoints are completely non-functional. Any frontend pages that depend on location-specific data routing return 404 from the backend. |

**Description:**
The locations router is commented out in `packages/backend/src/routes/index.ts`:

```typescript
// TODO: locations route depends on old Location model - needs rewrite for practice_locations
// import locationsRouter from './locations';
// ...
// router.use('/locations', locationsRouter);
```

The old `Location` model was replaced by the `practice_locations` table, but the `routes/locations.ts` file has not been updated to use the new schema.

**Affected Files:**
- `packages/backend/src/routes/index.ts` (lines 5-6, 14)

**Workaround:**
Provider location data is accessible through the provider detail endpoints (`/api/v1/providers/:npi`), which include associated practice locations from the `practice_locations` table.

**Resolution Required:**
Rewrite `routes/locations.ts` to query the `practice_locations` table instead of the removed `Location` model, then re-enable the import and router registration in `routes/index.ts`.

---

### ISSUE-002: Location Enrichment Admin Endpoints Disabled

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Architecture |
| **Status** | Open |
| **Impact** | Administrators cannot trigger location name enrichment via the admin API. Location data quality improvements must be done via direct database operations. |

**Description:**
The location enrichment service imports and admin endpoints are commented out in `packages/backend/src/routes/admin.ts`:

```typescript
// TODO: locationEnrichment depends on old Location model - re-enable when practice_locations rewrite is done
// import { enrichLocationNames, getEnrichmentStats } from '../services/locationEnrichment';
```

The entire "Location Enrichment Endpoints" section (lines 235-238) is disabled with a TODO comment.

**Affected Files:**
- `packages/backend/src/routes/admin.ts` (lines 6-7, 235-238)

**Workaround:**
None via the API. Direct database queries or scripts are required for location data enrichment.

**Resolution Required:**
Update the `locationEnrichment` service to work with `practice_locations` instead of the old `Location` model, then re-enable the imports and endpoints.

---

### ISSUE-003: No Staging Environment

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | Architecture / DevOps |
| **Status** | Open |
| **Impact** | All changes merged to `main` deploy directly to production. There is no pre-production environment for testing, which increases the risk of production incidents. |

**Description:**
The CI/CD pipeline (`.github/workflows/deploy.yml`) triggers on every push to `main` and deploys directly to the production Cloud Run services (`verifymyprovider-backend` and `verifymyprovider-frontend`). There is no `staging` branch, no staging Cloud Run services, and no approval gate before production deployment.

**Affected Files:**
- `.github/workflows/deploy.yml`

**Workaround:**
- Test changes thoroughly in local development before merging to `main`.
- Use the `workflow_dispatch` trigger for controlled manual deployments.
- Review pull requests carefully before merging.

**Resolution Required:**
Create a staging environment with separate Cloud Run services and a `staging` branch. Add a promotion workflow from staging to production.

---

## 2. Development Environment Issues

### ISSUE-004: Next.js SWC Incompatible with Windows ARM64 + Node.js v24+

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Development Environment |
| **Status** | Mitigated (workaround in place) |
| **Impact** | Next.js dev server fails to start on Windows ARM64 machines running Node.js v24+ without the postinstall patch. |

**Description:**
Next.js 14.x ships native SWC binaries that are PE32+ ARM64 executables, but they are incompatible with Node.js v24+ on Windows ARM64 ("not a valid Win32 application"). Next.js 14.x only auto-enables the WASM fallback for a hardcoded list of platforms, and `win32-arm64` (`aarch64-pc-windows-msvc`) is NOT in that list. Additionally, the WASM fallback is gated behind a `useWasmBinary` condition.

**Affected Files:**
- `packages/frontend/scripts/patch-next-swc.js`
- `next/dist/build/swc/index.js` (patched at install time)

**Workaround:**
A postinstall script (`packages/frontend/scripts/patch-next-swc.js`) automates two patches:
1. Adds `"aarch64-pc-windows-msvc"` to the `knownDefaultWasmFallbackTriples` array.
2. Removes the `useWasmBinary` gate from the fallback condition.

The script checks both local and hoisted `node_modules` paths. It is safe to run on non-ARM64 systems.

Run manually if needed:
```bash
node packages/frontend/scripts/patch-next-swc.js
```

**Resolution Required:**
Upgrade to a version of Next.js that natively supports Windows ARM64 + Node.js v24+, or wait for Next.js to add `aarch64-pc-windows-msvc` to its default WASM fallback triples.

---

### ISSUE-005: OneDrive Corrupts Native node_modules Binaries

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Development Environment |
| **Status** | Mitigated (workaround in place) |
| **Impact** | Native `.node` binary files in `node_modules/` can become corrupted by OneDrive file sync, causing build failures and runtime errors. |

**Description:**
OneDrive's file synchronization mechanism can corrupt native binary files (SWC binaries, Prisma engines, etc.) within `node_modules/`. This manifests as cryptic load errors for native addons.

**Workaround:**
- Prefer WASM fallbacks over native binaries when available (see ISSUE-004 for the SWC WASM fallback).
- If corruption occurs, delete `node_modules/` and reinstall from scratch.
- Consider excluding `node_modules/` from OneDrive sync or moving the project to a non-synced directory.

**Resolution Required:**
Move the project to a directory not synced by OneDrive, or configure OneDrive to exclude `node_modules/` folders.

---

### ISSUE-006: npm Workspace Hoisting Causes Version Conflicts

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Development Environment |
| **Status** | Mitigated (documented convention) |
| **Impact** | Placing `next` in the root `package.json` causes the frontend to use the wrong version, leading to SWC mismatches and build failures. |

**Description:**
npm workspaces hoists dependencies to the root `node_modules/`. If `next` appears in the root `package.json` (e.g., at `^16.1.1`), it overrides the frontend workspace version (`^14.2.35`), causing SWC binary version mismatches and API incompatibilities.

**Workaround:**
- **NEVER** add `next` to the root `package.json`.
- Only shared dependencies belong at root: `prisma`, `csv-parse`, `pg`.
- If the wrong version is installed, clean reinstall:
  ```bash
  rm -rf node_modules packages/*/node_modules
  npm install
  ```

**Resolution Required:**
This is a convention that must be followed by all contributors. Consider adding a CI check or pre-commit hook to validate that `next` is not present in the root `package.json`.

---

## 3. Data Quality Issues

### ISSUE-007: NPI Data Only Partially Imported (6 of 50+ States)

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | Data |
| **Status** | Open |
| **Impact** | Only ~2.1 million providers across 6 states (FL, AL, AK, AR, AZ, CA) are in the database. Providers in the remaining 44 states and territories return no results. |

**Description:**
The NPI data import pipeline has only been run for 6 states. Users searching for providers outside these states will find no results, which significantly limits the application's utility.

**Workaround:**
None. Users searching for providers in non-imported states receive empty results.

**Resolution Required:**
Run the NPI data import pipeline for all remaining states and territories. Consider automating periodic re-imports to keep data current.

---

### ISSUE-008: City Name Quality Issues in NPI Data

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Data |
| **Status** | Open |
| **Impact** | City-based searches may fail to match providers due to typos, trailing state codes, or trailing punctuation in city names from the NPI dataset. |

**Description:**
NPI data from CMS is self-reported by providers and contains inconsistencies:
- Truncated names (e.g., `"JACKSONVILL"` instead of `"JACKSONVILLE"`)
- Trailing state codes (e.g., `"MIAMI FL"`)
- Trailing punctuation (e.g., `"TAMPA,"`)

A cleanup script exists but has not been executed across all imported data.

**Workaround:**
Search endpoints may use fuzzy matching or normalization to partially mitigate this issue.

**Resolution Required:**
Run the existing city name cleanup script across all imported data. Consider adding data normalization as part of the import pipeline to prevent future occurrences.

---

### ISSUE-009: Provider Addresses May Be Stale

| Field | Value |
|---|---|
| **Severity** | Low |
| **Category** | Data |
| **Status** | Open (inherent limitation) |
| **Impact** | Some provider addresses may be outdated because NPI data is self-reported and rarely updated by providers. |

**Description:**
The NPI registry data from CMS relies on providers to update their own records. Many providers do not promptly update their addresses when they change practice locations.

**Workaround:**
The confidence scoring system (`packages/backend/src/services/confidenceService.ts`) mitigates this by:
- Applying specialty-specific freshness thresholds (30-90 days depending on specialty type).
- Decaying the recency score over time (0-30 points).
- Setting `recommendReVerification` when data is stale.
- Enabling community verification and voting to surface outdated information.

**Resolution Required:**
This is an inherent limitation of the NPI data source. Continued community verification and potential integration with additional data sources (carrier APIs, provider portals) will help keep data current.

---

## 4. Security Issues

### ISSUE-010: No Automated Secret Scanning in CI

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | Security |
| **Status** | Open |
| **Impact** | Secrets (API keys, database credentials, tokens) accidentally committed to the repository would not be detected by the CI pipeline. |

**Description:**
The GitHub Actions CI pipeline does not include secret scanning tools such as gitleaks, truffleHog, or GitHub's built-in secret scanning. This means that if a developer accidentally commits a secret (e.g., `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `ANTHROPIC_API_KEY`, database credentials), it would not be caught automatically.

**Workaround:**
Manual code review during pull requests. Contributors should be vigilant about not committing `.env` files or hardcoded secrets.

**Resolution Required:**
Add gitleaks or truffleHog as a step in the CI pipeline. Enable GitHub Advanced Security secret scanning if the repository plan supports it.

---

### ISSUE-011: No Cloud Armor / DDoS Protection

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | Security |
| **Status** | Open |
| **Impact** | Cloud Run services are publicly accessible without a Web Application Firewall (WAF). The application relies solely on application-level rate limiting for abuse prevention. |

**Description:**
There is no Google Cloud Armor policy or other WAF in front of the Cloud Run services. While application-level rate limiting (see `rateLimiter.ts`) and CAPTCHA (see `captcha.ts`) provide some protection, they cannot defend against volumetric DDoS attacks or sophisticated L7 attacks.

**Workaround:**
Application-level protections are in place:
- IP-based rate limiting with sliding window algorithm
- Google reCAPTCHA v3 on sensitive endpoints
- Fallback rate limiting when CAPTCHA API is unavailable

**Resolution Required:**
Configure Google Cloud Armor with appropriate WAF rules and DDoS protection policies in front of the Cloud Run services.

---

### ISSUE-012: `.env.example` Is Incomplete

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Security / Configuration |
| **Status** | Open |
| **Impact** | New developers may miss required environment variables during setup, leading to runtime errors or disabled features. |

**Description:**
The `.env.example` file is missing several environment variables that are used by the application:

| Missing Variable | Used By | Purpose |
|---|---|---|
| `ADMIN_SECRET` | `admin.ts` | Admin endpoint authentication |
| `CAPTCHA_FAIL_MODE` | `captcha.ts` | CAPTCHA failure behavior (`open`/`closed`) |
| `REDIS_URL` | `rateLimiter.ts` | Distributed rate limiting |
| `ANTHROPIC_API_KEY` | Insurance card upload | Claude AI extraction |
| `NEXT_PUBLIC_POSTHOG_KEY` | `analytics.ts` | PostHog analytics |
| `NEXT_PUBLIC_POSTHOG_HOST` | `analytics.ts` | PostHog analytics host |

The current `.env.example` only contains:
- `DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`
- `NEXT_PUBLIC_API_URL`
- `NPI_DATA_URL`
- `RECAPTCHA_SECRET_KEY` (commented out)
- `GCP_PROJECT_ID`, `GCP_REGION`, `CLOUD_SQL_CONNECTION_NAME` (commented out)

**Affected Files:**
- `.env.example`

**Workaround:**
Refer to the troubleshooting guide (18-troubleshooting-doc.md) for a complete list of environment variables.

**Resolution Required:**
Update `.env.example` to include all environment variables with descriptions, organized by service (backend, frontend, security, deployment).

---

## 5. Frontend Issues

### ISSUE-013: No Offline Support / PWA

| Field | Value |
|---|---|
| **Severity** | Low |
| **Category** | Frontend |
| **Status** | Open |
| **Impact** | The application does not work offline. Users with intermittent connectivity cannot access previously viewed provider data. |

**Description:**
There is no service worker or PWA manifest configured. The application requires an active network connection for all functionality.

**Workaround:**
None. Users must have an active internet connection.

**Resolution Required:**
Implement a service worker for offline caching of previously viewed provider data and a PWA manifest for installability.

---

### ISSUE-014: No Full Accessibility Audit

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Frontend |
| **Status** | Open |
| **Impact** | Users relying on keyboard navigation or screen readers may encounter usability barriers. Focus traps exist for modals, but comprehensive keyboard navigation and screen reader testing has not been performed. |

**Description:**
While some accessibility features are implemented (focus traps for modals), the application has not undergone a full accessibility audit. This includes:
- Complete keyboard navigation testing
- Screen reader compatibility testing (NVDA, VoiceOver, JAWS)
- Color contrast verification across themes
- ARIA attribute completeness audit

**Workaround:**
None. Users with accessibility needs may encounter barriers.

**Resolution Required:**
Conduct a full WCAG 2.1 AA accessibility audit and remediate identified issues. Consider adding axe-core or similar automated testing to the CI pipeline.

---

## 6. Configuration Issues

### ISSUE-015: ADMIN_SECRET Not Configured Returns 503

| Field | Value |
|---|---|
| **Severity** | Low |
| **Category** | Configuration |
| **Status** | By Design |
| **Impact** | All admin endpoints return HTTP 503 when `ADMIN_SECRET` is not set. This is intentional but can be confusing for new developers. |

**Description:**
The admin authentication middleware in `packages/backend/src/routes/admin.ts` checks for the `ADMIN_SECRET` environment variable and returns 503 if it is absent. This is intentional behavior that allows the application to run in environments where admin access is not needed, without throwing unhandled errors.

**Workaround:**
Set `ADMIN_SECRET` in your `.env` file:
```
ADMIN_SECRET=your-secure-random-secret
```

Then include the `X-Admin-Secret` header in admin API requests.

**Resolution Required:**
No code change needed (by design). Documentation should clearly explain this behavior.

---

## Summary

| Severity | Count | Issue IDs |
|---|---|---|
| **Critical** | 0 | -- |
| **High** | 5 | ISSUE-001, ISSUE-003, ISSUE-007, ISSUE-010, ISSUE-011 |
| **Medium** | 6 | ISSUE-002, ISSUE-004, ISSUE-005, ISSUE-006, ISSUE-008, ISSUE-012, ISSUE-014 |
| **Low** | 3 | ISSUE-009, ISSUE-013, ISSUE-015 |
| **Total** | 15 | |

**Priority Recommendations:**
1. **ISSUE-007** (NPI Data Import) -- High impact on user experience; limits application utility to 6 states.
2. **ISSUE-010** (Secret Scanning) -- High security risk; quick to implement with gitleaks in CI.
3. **ISSUE-011** (Cloud Armor) -- High security risk; necessary for production-grade deployment.
4. **ISSUE-001** (Locations Route) -- High impact; blocks location-centric features.
5. **ISSUE-003** (Staging Environment) -- High risk; prevents pre-production testing.
