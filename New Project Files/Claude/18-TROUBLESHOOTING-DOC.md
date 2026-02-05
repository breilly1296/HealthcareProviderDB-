# VerifyMyProvider Troubleshooting Guide

**Last Updated:** 2026-02-05
**Generated From:** prompts/18-troubleshooting-doc.md

---

## Table of Contents

1. [Development Environment Issues](#1-development-environment-issues)
   - [1.1 Next.js SWC on Windows ARM64 + Node 24](#11-nextjs-swc-on-windows-arm64--node-24)
   - [1.2 OneDrive + node_modules Corruption](#12-onedrive--node_modules-corruption)
   - [1.3 npm Workspaces Hoisting Conflicts](#13-npm-workspaces-hoisting-conflicts)
2. [Database Issues](#2-database-issues)
   - [2.1 Prisma Schema Conventions After db pull](#21-prisma-schema-conventions-after-db-pull)
   - [2.2 Cloud SQL Connection Failures](#22-cloud-sql-connection-failures)
3. [Backend / API Issues](#3-backend--api-issues)
   - [3.1 Locations Route Returns 404](#31-locations-route-returns-404)
   - [3.2 Admin Endpoints Return 503](#32-admin-endpoints-return-503)
   - [3.3 Location Enrichment Endpoints Not Available](#33-location-enrichment-endpoints-not-available)
   - [3.4 Rate Limiting False Positives](#34-rate-limiting-false-positives)
   - [3.5 CAPTCHA Verification Failures](#35-captcha-verification-failures)
4. [Deployment Issues](#4-deployment-issues)
   - [4.1 Cloud Run Deployment Failures](#41-cloud-run-deployment-failures)
   - [4.2 No Staging Environment](#42-no-staging-environment)
5. [Data Quality Issues](#5-data-quality-issues)
   - [5.1 City Name Typos in NPI Data](#51-city-name-typos-in-npi-data)
   - [5.2 Stale Provider Addresses](#52-stale-provider-addresses)

---

## 1. Development Environment Issues

### 1.1 Next.js SWC on Windows ARM64 + Node 24

**Symptom:**
When running `npm run dev` in the frontend package on Windows ARM64 with Node.js v24+, the following error appears:

```
Error: not a valid Win32 application
```

The error originates from Next.js attempting to load native SWC binaries (`.node` files) that are incompatible with the Node.js v24+ runtime on Windows ARM64.

**Root Cause:**
Next.js 14.x ships native SWC binaries and includes a hardcoded list of platforms in `knownDefaultWasmFallbackTriples` for which it auto-enables a WASM fallback. The `win32-arm64` platform (`aarch64-pc-windows-msvc`) is **not** in that list. Additionally, the code gates the WASM fallback behind a `useWasmBinary` condition, preventing automatic fallback even if the platform were listed.

**Fix:**
A postinstall script at `packages/frontend/scripts/patch-next-swc.js` automates two patches to `next/dist/build/swc/index.js`:

1. **Patch 1:** Adds `"aarch64-pc-windows-msvc"` to the `knownDefaultWasmFallbackTriples` array so Next.js recognizes Windows ARM64 as a platform needing WASM fallback.
2. **Patch 2:** Changes the condition `unsupportedPlatform && useWasmBinary ||` to `unsupportedPlatform ||`, removing the `useWasmBinary` gate so the fallback engages automatically.

The script checks both the local `node_modules` path and the hoisted monorepo path. It is safe to run on non-ARM64 systems (the patch is harmless if the platform is not matched).

**How to Apply:**
```bash
cd packages/frontend
npm run postinstall
```

Or it runs automatically during `npm install` if the postinstall script is configured in `packages/frontend/package.json`.

**Verification:**
After patching, `npm run dev` in the frontend package should start the Next.js dev server without the "not a valid Win32 application" error.

**Reference File:** `packages/frontend/scripts/patch-next-swc.js`

---

### 1.2 OneDrive + node_modules Corruption

**Symptom:**
Native `.node` binary files (such as SWC binaries, Prisma engines, or other native Node.js addons) fail to load with cryptic errors. Files may appear truncated or corrupted.

**Root Cause:**
OneDrive file sync can corrupt native binary files in `node_modules/`. This happens because OneDrive's sync mechanism may not correctly handle files that are being written while syncing, or it may alter file metadata in ways that break binary executables.

**Workaround:**
- Prefer WASM fallbacks over native binaries when available (e.g., the SWC WASM fallback described in section 1.1).
- If corruption is suspected, delete `node_modules/` and reinstall:
  ```bash
  rm -rf node_modules packages/*/node_modules
  npm install
  ```
- Consider adding `node_modules/` to OneDrive's exclusion list, or moving the project to a non-synced directory for development.

---

### 1.3 npm Workspaces Hoisting Conflicts

**Symptom:**
SWC version mismatches, unexpected Next.js behavior, or build errors after installing dependencies. The frontend may pick up a different version of `next` than expected.

**Root Cause:**
npm workspaces hoists dependencies to the root `node_modules/`. If `next` is listed in the root `package.json` (e.g., `next@^16.1.1`), it overrides the frontend workspace version (`next@^14.2.35`), causing SWC binary mismatches and API incompatibilities.

**Fix:**
- **NEVER** put `next` in the root `package.json`.
- Only shared dependencies belong at root: `prisma`, `csv-parse`, `pg`, and similar cross-workspace utilities.
- If the wrong version is installed, remove and reinstall:
  ```bash
  # Remove next from root if present
  npm uninstall next --workspace-root
  # Clean reinstall
  rm -rf node_modules packages/*/node_modules
  npm install
  ```

**Verification:**
Check the resolved version: `npm ls next` should show `next` only under `packages/frontend`.

---

## 2. Database Issues

### 2.1 Prisma Schema Conventions After db pull

**Symptom:**
After running `prisma db pull`, model names are lowercase (e.g., `model providers` instead of `model Provider`) and field names use `snake_case`, which does not match TypeScript conventions.

**Root Cause:**
`prisma db pull` generates raw model and field names from the PostgreSQL table and column names, which are typically lowercase/snake_case.

**Fix:**
After every `prisma db pull`, manually update the schema:

1. **Rename models** to PascalCase and add `@@map("table_name")`:
   ```prisma
   model Provider {
     // fields...
     @@map("providers")
   }
   ```

2. **Rename fields** to camelCase and add `@map("column_name")`:
   ```prisma
   model Provider {
     firstName String @map("first_name")
     lastName  String @map("last_name")
     // ...
   }
   ```

3. For application-generated TEXT primary keys (e.g., `verification_logs`, `vote_logs`), add `@default(cuid())`.

4. Run `npx prisma generate` after schema changes to regenerate the Prisma Client.

---

### 2.2 Cloud SQL Connection Failures

**Symptom:**
Backend cannot connect to the database. Error messages referencing connection refused or timeout.

**Root Cause / Configuration:**
Connection methods differ by environment:

| Environment | Method | Configuration |
|---|---|---|
| Local development | Direct TCP | `DATABASE_URL` in `.env` pointing to `localhost` or Cloud SQL public IP |
| Cloud Run (production) | Cloud SQL Auth Proxy | Automatic unix socket via `CLOUD_SQL_CONNECTION_NAME` env var |

**Troubleshooting Steps:**

1. **Local:** Verify `DATABASE_URL` in `.env` is correct and the database is accessible:
   ```bash
   npx prisma db pull   # Quick connectivity test
   ```

2. **Cloud Run:** Verify:
   - The Cloud SQL connection is configured in the Cloud Run service settings.
   - `CLOUD_SQL_CONNECTION_NAME` is set in the format `project:region:instance`.
   - The service account has `roles/cloudsql.client` permission.

---

## 3. Backend / API Issues

### 3.1 Locations Route Returns 404

**Symptom:**
Any request to `/api/v1/locations/*` returns a 404 error. Frontend pages that depend on location data do not function.

**Root Cause:**
The locations router is **commented out** in `packages/backend/src/routes/index.ts`:

```typescript
// TODO: locations route depends on old Location model - needs rewrite for practice_locations
// import locationsRouter from './locations';
// ...
// router.use('/locations', locationsRouter);
```

The old `Location` model has been replaced by the `practice_locations` table, but the locations route has not been updated to use the new schema.

**Status:** Disabled intentionally. Requires a rewrite of `routes/locations.ts` to work with the `practice_locations` table.

**Workaround:** Provider location data is accessible through the provider detail endpoints (`/api/v1/providers/:npi`) which include associated practice locations.

**Reference File:** `packages/backend/src/routes/index.ts` (lines 5-6, 14)

---

### 3.2 Admin Endpoints Return 503

**Symptom:**
All admin API calls (`/api/v1/admin/*`) return HTTP 503 with the response:

```json
{
  "success": false,
  "error": {
    "message": "Admin endpoints not configured. Set ADMIN_SECRET environment variable to enable.",
    "code": "ADMIN_NOT_CONFIGURED",
    "statusCode": 503
  }
}
```

**Root Cause:**
The `ADMIN_SECRET` environment variable is not set. The admin authentication middleware in `packages/backend/src/routes/admin.ts` checks for this variable and returns 503 if it is absent. This is **intentional** behavior that allows deployment in environments where admin access is not needed.

**Fix:**
Set the `ADMIN_SECRET` environment variable:

```bash
# In .env
ADMIN_SECRET=your-secure-random-secret-here
```

For Cloud Run, set it via the Google Cloud Console or CLI:
```bash
gcloud run services update verifymyprovider-backend \
  --set-secrets=ADMIN_SECRET=admin-secret:latest
```

**Authentication:**
Once configured, admin endpoints require the `X-Admin-Secret` header:
```bash
curl -H "X-Admin-Secret: your-secret" https://your-backend/api/v1/admin/health
```

The middleware uses `timingSafeEqual` for constant-time secret comparison to prevent timing attacks.

**Available Admin Endpoints:**
| Endpoint | Method | Purpose |
|---|---|---|
| `/admin/health` | GET | Health check with retention metrics |
| `/admin/cleanup-expired` | POST | Clean up expired verification records |
| `/admin/expiration-stats` | GET | Verification expiration statistics |
| `/admin/cache/clear` | POST | Clear all cached data |
| `/admin/cache/stats` | GET | Cache hit/miss statistics |
| `/admin/cleanup/sync-logs` | POST | Clean up sync logs older than retention period |
| `/admin/retention/stats` | GET | Comprehensive retention statistics |

**Reference File:** `packages/backend/src/routes/admin.ts` (lines 21-55)

---

### 3.3 Location Enrichment Endpoints Not Available

**Symptom:**
No admin endpoints exist for location enrichment (expected endpoints like `/admin/enrich-locations` are not registered).

**Root Cause:**
The location enrichment imports and endpoints are commented out in `packages/backend/src/routes/admin.ts`:

```typescript
// TODO: locationEnrichment depends on old Location model - re-enable when practice_locations rewrite is done
// import { enrichLocationNames, getEnrichmentStats } from '../services/locationEnrichment';
```

The section header remains at line 236-238:
```
// ============================================================================
// Location Enrichment Endpoints
// TODO: Disabled - depends on old Location model, needs rewrite for practice_locations
// ============================================================================
```

**Status:** Disabled intentionally. Will be re-enabled after the `practice_locations` rewrite is complete.

**Reference File:** `packages/backend/src/routes/admin.ts` (lines 6-7, 235-238)

---

### 3.4 Rate Limiting False Positives

**Symptom:**
Legitimate users receive HTTP 429 (Too Many Requests) responses despite normal usage patterns.

**Root Cause / Considerations:**

1. **Shared IP addresses:** The rate limiter uses IP-based identification. Users behind corporate NATs, VPNs, or shared proxies share an IP address and collectively consume the rate limit.

2. **In-memory mode inconsistency:** Without Redis (`REDIS_URL` not set), each backend instance maintains independent counters. In multi-instance deployments, a user routed to different instances will have separate counters (potentially allowing more requests than intended), but sticky sessions could cause all requests to hit one instance.

3. **Fail-open behavior:** If Redis becomes unavailable during operation, requests are **allowed** with a warning logged. This prioritizes availability over strict rate limiting.

**Troubleshooting:**
- Check logs for rate limit warnings: look for rate limiter log entries.
- Verify whether `REDIS_URL` is configured for distributed rate limiting.
- Review the sliding window algorithm: unlike fixed windows, sliding windows track individual request timestamps, so limits are enforced smoothly without boundary bursts.

**Mitigation:**
- Configure `REDIS_URL` for accurate distributed rate limiting across instances.
- Consider implementing user-based rate limiting (requires authentication) as a future improvement.

**Reference File:** `packages/backend/src/middleware/rateLimiter.ts`

---

### 3.5 CAPTCHA Verification Failures

**Symptom:**
Verification or vote submissions fail with CAPTCHA-related errors, or bots bypass CAPTCHA protection.

**Root Cause / Configuration:**
The CAPTCHA middleware (Google reCAPTCHA v3) has two fail modes controlled by `CAPTCHA_FAIL_MODE`:

| Mode | Behavior | Risk |
|---|---|---|
| `open` (default) | Allows requests through when Google API fails; applies stricter fallback rate limiting (3 requests/hour vs normal 10) | Attackers could exploit Google outages |
| `closed` | Blocks ALL requests when Google API fails | Legitimate users blocked during outages |

**Troubleshooting Steps:**

1. **Verify `RECAPTCHA_SECRET_KEY` is set** in the environment. Without it, CAPTCHA validation cannot occur.
2. **Check logs** for `[CAPTCHA] Google API error` messages indicating Google API outages.
3. **Monitor** for high volumes of `FAIL-OPEN: Allowing request` log entries, which indicate the fallback rate limiter is active.
4. **In development:** CAPTCHA logging is suppressed when `NODE_ENV` is `development` or `test`.

**Reference File:** `packages/backend/src/middleware/captcha.ts`

---

## 4. Deployment Issues

### 4.1 Cloud Run Deployment Failures

**Symptom:**
GitHub Actions deployment workflow fails or Cloud Run services do not start.

**Troubleshooting Steps:**

1. **Check GitHub Actions logs:** The workflow is defined in `.github/workflows/deploy.yml` and triggers on push to `main` or manual dispatch.
2. **Verify GCP credentials:** Ensure the service account has proper IAM roles (`roles/run.admin`, `roles/cloudsql.client`, `roles/iam.serviceAccountUser`).
3. **Check environment variables:** Ensure all required secrets are configured in Cloud Run:
   - `DATABASE_URL` or `CLOUD_SQL_CONNECTION_NAME`
   - `RECAPTCHA_SECRET_KEY`
   - `ADMIN_SECRET`
   - `REDIS_URL` (optional, for distributed rate limiting)

4. **Container build issues:** Both `packages/backend/Dockerfile` and `packages/frontend/Dockerfile` must build successfully. Test locally:
   ```bash
   docker build -t verifymyprovider-backend packages/backend/
   docker build -t verifymyprovider-frontend packages/frontend/
   ```

---

### 4.2 No Staging Environment

**Symptom:**
Changes pushed to `main` deploy directly to production without a pre-production testing step.

**Root Cause:**
The CI/CD pipeline (`.github/workflows/deploy.yml`) is configured to deploy on every push to `main`. There is no staging branch or environment configured.

**Risk:** Bugs can reach production without pre-deployment validation.

**Workaround:**
- Test changes thoroughly in local development.
- Use the `workflow_dispatch` trigger for manual deployments when additional caution is needed.
- Consider adding a `staging` branch and separate Cloud Run services for pre-production testing.

---

## 5. Data Quality Issues

### 5.1 City Name Typos in NPI Data

**Symptom:**
Provider search returns unexpected results or fails to match cities. City names in the database contain typos, trailing state codes, or trailing punctuation.

**Root Cause:**
NPI data from CMS is self-reported by providers and contains inconsistencies in city name formatting. Examples include:
- `"JACKSONVILL"` instead of `"JACKSONVILLE"`
- `"MIAMI FL"` with trailing state code
- `"TAMPA,"` with trailing punctuation

**Status:** A cleanup script exists but has not been run across all imported data.

**Workaround:** Use fuzzy matching or LIKE queries when searching by city. The search endpoints may already handle some normalization.

---

### 5.2 Stale Provider Addresses

**Symptom:**
Provider address information is outdated. A provider may have moved to a new practice location but their NPI record still shows the old address.

**Root Cause:**
NPI data is self-reported by providers to CMS and is rarely updated. There is no automated mechanism to detect when a provider has changed their practice location.

**Mitigation:**
- The confidence scoring system (`packages/backend/src/services/confidenceService.ts`) accounts for data staleness through a recency score (0-30 points) that decays over time.
- Specialty-specific freshness thresholds are applied:
  - Mental health providers: 30 days (high turnover, 43% Medicaid acceptance)
  - Primary care: 60 days (12% annual turnover)
  - Specialists: 60 days
  - Hospital-based: 90 days (more stable positions)
- Community verification via the voting system helps identify stale data.
- The `recommendReVerification` flag in the confidence result signals when data should be re-verified.

---

## Quick Reference: Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `PORT` | No | `3001` | Backend server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |
| `NEXT_PUBLIC_API_URL` | Yes (frontend) | - | Backend API base URL |
| `RECAPTCHA_SECRET_KEY` | Production | - | Google reCAPTCHA v3 secret |
| `CAPTCHA_FAIL_MODE` | No | `open` | `open` or `closed` |
| `ADMIN_SECRET` | No | - | Admin endpoint authentication |
| `REDIS_URL` | No | - | Redis for distributed rate limiting |
| `CLOUD_SQL_CONNECTION_NAME` | Cloud Run | - | Cloud SQL proxy connection |
| `GCP_PROJECT_ID` | Deployment | - | Google Cloud project ID |
| `GCP_REGION` | Deployment | `us-central1` | Google Cloud region |
