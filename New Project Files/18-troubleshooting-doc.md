# VerifyMyProvider Troubleshooting Guide

**Generated:** 2026-02-18

---

## Table of Contents

1. [Development Environment Issues](#development-environment-issues)
2. [Database Issues](#database-issues)
3. [Deployment Issues](#deployment-issues)
4. [Runtime / Production Issues](#runtime--production-issues)
5. [Frontend Issues](#frontend-issues)
6. [Data Quality Issues](#data-quality-issues)
7. [Security Issues](#security-issues)
8. [Monitoring and Diagnostics](#monitoring-and-diagnostics)

---

## Development Environment Issues

### 1. Next.js SWC "Not a valid Win32 application" (Windows ARM64 + Node 24)

**Symptoms:**
- Error: `not a valid Win32 application` when starting Next.js dev server
- Occurs on Windows ARM64 devices (e.g., Surface Pro X, Snapdragon laptops) with Node.js v24+

**Cause:**
Next.js 14.x ships native SWC binaries that are incompatible with Node.js v24+ on Windows ARM64. The WASM fallback is only auto-enabled for a hardcoded list of platforms, and `win32-arm64` is not in that list.

**Fix:**
The postinstall script automatically patches this:
```bash
# Already runs automatically via npm install
node packages/frontend/scripts/patch-next-swc.js
```

**What the patch does:**
1. Adds `aarch64-pc-windows-msvc` to `knownDefaultWasmFallbackTriples` in `next/dist/build/swc/index.js`
2. Removes the `useWasmBinary` gate so unsupported platforms auto-fallback to WASM

**Manual fix if the script fails:**
1. Open `node_modules/next/dist/build/swc/index.js`
2. Find `knownDefaultWasmFallbackTriples` array
3. Add `"aarch64-pc-windows-msvc"` to the array
4. Find `unsupportedPlatform && useWasmBinary ||` and change to `unsupportedPlatform ||`

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\scripts\patch-next-swc.js`

---

### 2. OneDrive Corrupts node_modules Native Binaries

**Symptoms:**
- Random build failures or crashes
- Native `.node` binary files become corrupted
- Errors referencing `.node` files in `node_modules`

**Cause:**
OneDrive's file sync can modify or partially upload native binary files, corrupting them.

**Fix:**
- Use WASM fallbacks instead of native binaries where possible (the SWC patch above helps for Next.js)
- Consider excluding `node_modules` from OneDrive sync:
  1. Right-click the `node_modules` folder in File Explorer
  2. Select "Free up space" or add to OneDrive exclusion list
- Alternatively, move the project to a non-synced directory

---

### 3. npm Workspace Hoisting Conflicts

**Symptoms:**
- Wrong version of `next` used during build
- SWC version mismatches between what the frontend expects and what is installed
- Error messages referencing unexpected Next.js versions

**Cause:**
If `next` is listed in the root `package.json`, npm workspaces will hoist it, overriding the version specified in `packages/frontend/package.json`.

**Fix:**
- **NEVER put `next` in the root `package.json`**
- Only shared dependencies belong at root: `prisma`, `@prisma/client`, `csv-parse`, `pg`
- If accidentally added, remove it and run:
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```

---

### 4. Prisma Client Not Generated

**Symptoms:**
- TypeScript errors: `Cannot find module '.prisma/client'`
- Runtime error: `PrismaClient is unable to be run in this browser environment`

**Fix:**
```bash
npm run db:generate
```

This runs `prisma generate` which creates the typed client from `packages/backend/prisma/schema.prisma`.

---

### 5. Dev Server Port Conflicts

**Symptoms:**
- `Error: listen EADDRINUSE: address already in use :::3000` or `:::3001`

**Fix:**
```bash
# Find and kill the process using the port
# Windows:
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Or change the port in .env:
PORT=3002
```

---

## Database Issues

### 6. Cloud SQL SSL Connection Failure

**Symptoms:**
- `Error: self-signed certificate` or `Error: unable to verify the first certificate`
- Occurs when connecting to Cloud SQL from local scripts (not via Cloud Run)

**Cause:**
`pg` v8.x treats `sslmode=require` in the connection string as `verify-full`, which fails without the Cloud SQL CA certificate.

**Fix:**
Use the centralized `createPool()` function from `scripts/pre-import-check.ts`, which:
1. Strips `sslmode` from the connection URL
2. Sets `ssl: { rejectUnauthorized: false }` programmatically

```typescript
import { createPool } from './pre-import-check';
const pool = createPool();
```

---

### 7. Prisma Schema Naming Conventions

**Symptoms:**
- `prisma db pull` generates lowercase model names
- TypeScript code expects PascalCase models and camelCase fields

**Fix:**
After running `prisma db pull`, manually update the schema:
- Rename models to PascalCase and add `@@map("table_name")`
- Rename fields to camelCase and add `@map("snake_case")`

Example:
```prisma
model ProviderHospital {
  hospitalSystem String? @map("hospital_system")
  @@map("provider_hospitals")
}
```

---

### 8. Database Connection Pool Timeout

**Symptoms:**
- 503 responses with `DATABASE_TIMEOUT` error code
- Prisma error P2024

**Cause:**
All connections in the Prisma pool are in use. Can happen during:
- Bulk data imports while the API is running
- Slow queries holding connections
- Excessive concurrent requests

**Fix:**
1. Check for long-running queries in Cloud SQL
2. Increase pool size if needed (Prisma default is 9 for serverless)
3. Use admin endpoint to clear cache and reduce query load:
   ```bash
   curl -X POST /api/v1/admin/cache/clear -H "X-Admin-Secret: your-secret"
   ```

---

### 9. Migration History Issues

**Symptoms:**
- `prisma migrate` complains about missing migrations
- Migration history out of sync with database state

**Cause:**
The project uses `prisma db push` (schemaless migrations) in CI/CD, but has some baselined migration history.

**Fix:**
For production, `prisma db push --skip-generate` is used during deployment. Do not mix `prisma migrate` with `prisma db push` in the same environment.

---

## Deployment Issues

### 10. GitHub Actions Workload Identity Federation Failure

**Symptoms:**
- `Error: Unable to get access token` in GitHub Actions
- Authentication step fails

**Cause:**
Workload Identity Federation requires correct configuration of:
- `GCP_WORKLOAD_IDENTITY_PROVIDER` secret
- `GCP_SERVICE_ACCOUNT` secret
- Service account IAM bindings

**Fix:**
1. Verify the Workload Identity Pool and Provider exist in GCP
2. Check that the service account has `roles/iam.workloadIdentityUser`
3. Verify the attribute mapping includes the GitHub repository

---

### 11. Docker Build Failure - Native Module Compilation

**Symptoms:**
- Build fails during `npm install` in Docker with compilation errors
- Missing system libraries for native modules

**Fix:**
The Dockerfiles include `apk add --no-cache libc6-compat` (and `openssl openssl-dev` for backend). If new native dependencies are added, update the Dockerfile `RUN apk add` line.

---

### 12. Cloud Run Cold Start Latency

**Symptoms:**
- First request after period of inactivity takes 2-5 seconds
- Subsequent requests are fast

**Cause:**
Cloud Run is configured with `min-instances=0` (scale-to-zero) for cost savings.

**Fix:**
- Accept cold start latency during pre-launch phase
- Set `--min-instances=1` when traffic justifies the cost (~$15/month per always-on instance)

---

### 13. Smoke Test Failure After Deploy

**Symptoms:**
- CI/CD pipeline fails at smoke test step
- `curl` returns non-200 status code

**Possible Causes:**
1. **Container startup failure** -- Check Cloud Run logs for crash stack trace
2. **Database connection failure** -- Verify Cloud SQL connection and DATABASE_URL secret
3. **Missing secrets** -- Verify all secrets exist in Secret Manager
4. **Port mismatch** -- Container must listen on port 8080

**Diagnosis:**
```bash
# Check Cloud Run logs
gcloud run services logs read verifymyprovider-backend \
  --region=us-central1 --limit=50

# Check revision status
gcloud run revisions describe REVISION_NAME \
  --region=us-central1
```

---

## Runtime / Production Issues

### 14. ADMIN_SECRET Not Configured (503 on Admin Endpoints)

**Symptoms:**
- All admin endpoints return 503 with `ADMIN_NOT_CONFIGURED`

**Cause:**
The `ADMIN_SECRET` environment variable is not set. This is intentional -- admin endpoints are disabled by default.

**Fix:**
1. Create the secret in GCP Secret Manager:
   ```bash
   echo -n "your-secret-value" | gcloud secrets create ADMIN_SECRET --data-file=-
   ```
2. Grant Cloud Run access to the secret
3. Add the secret mapping in the deploy workflow (already configured)

---

### 15. Rate Limiting False Positives

**Symptoms:**
- Legitimate users receive 429 "Too many requests"
- Happens on shared IPs (corporate networks, VPNs)

**Cause:**
Rate limiting is IP-based. Users sharing an IP (e.g., behind a corporate NAT) collectively count toward the same limit.

**Fix:**
- Current design accepts this trade-off for security
- Future: Add authenticated user-based rate limiting for logged-in users
- Workaround: Users can wait for the rate limit window to reset (1 hour)

---

### 16. reCAPTCHA API Failures

**Symptoms:**
- Verification/vote endpoints return errors when Google reCAPTCHA API is down
- Logs show `[CAPTCHA] Google API error`

**Behavior depends on `CAPTCHA_FAIL_MODE`:**
- **`open` (default):** Requests are allowed with stricter fallback rate limiting (3 req/hr instead of 10 req/hr). Header `X-Security-Degraded: captcha-unavailable` is set.
- **`closed`:** All verification/vote requests are blocked with 503.

**Monitoring:**
- Watch for `CAPTCHA FAIL-OPEN` or `CAPTCHA FAIL-CLOSED` log entries
- Check `X-Security-Degraded` response header
- Check `X-Fallback-RateLimit-Remaining` header

---

### 17. Cache Inconsistency After Data Import

**Symptoms:**
- Search results show stale data after an NPI import
- Newly imported providers do not appear in search

**Fix:**
Clear the cache after any data import:
```bash
curl -X POST https://your-backend-url/api/v1/admin/cache/clear \
  -H "X-Admin-Secret: your-secret"
```

Or wait for the 5-minute cache TTL to expire naturally.

---

## Frontend Issues

### 18. CORS Errors in Browser

**Symptoms:**
- Browser console shows `Access to fetch... has been blocked by CORS policy`
- API requests fail silently

**Cause:**
The request origin is not in the allowed CORS origins list.

**Fix:**
The backend allows these origins:
- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- Cloud Run frontend URL
- `FRONTEND_URL` environment variable
- `http://localhost:3000` and `http://localhost:3001` (development only)

If deploying a new frontend URL, add it to the `ALLOWED_ORIGINS` array in `packages/backend/src/index.ts` or set the `FRONTEND_URL` environment variable.

---

### 19. CSRF Token Mismatch (403)

**Symptoms:**
- POST/PUT/PATCH/DELETE requests to protected routes return 403
- Error mentions CSRF

**Cause:**
CSRF token has expired or was not fetched before the mutating request.

**Fix:**
The frontend API client (`api.ts`) handles this automatically:
1. Fetches CSRF token from `GET /api/v1/auth/csrf-token`
2. Includes `X-CSRF-Token` header on mutating requests
3. On 403 with CSRF error, refreshes the token and retries once

If the issue persists:
- Clear browser cookies and refresh the page
- Check that cookies are not being blocked by browser settings

---

### 20. "Network Error" or "Failed to Fetch"

**Symptoms:**
- API calls fail with generic network errors
- Works in some environments but not others

**Possible Causes:**
1. **Backend is down** -- Check health endpoint
2. **CORS** -- See issue #18
3. **SSL certificate** -- Check HTTPS configuration
4. **Proxy issues** -- Next.js rewrite proxy may not be configured

**Fix:**
The frontend uses Next.js rewrites to proxy `/api/v1/*` requests to the backend. Verify the proxy configuration in `next.config.js`.

---

## Data Quality Issues

### 21. NPI Data Stale Addresses

**Symptoms:**
- Provider addresses are outdated
- Provider has moved but address still shows old location

**Cause:**
NPI data is self-reported and rarely updated by providers.

**Mitigation:**
- Crowdsourced verifications will flag incorrect addresses over time
- Data quality audits logged in `data_quality_audit` table
- Practice re-verification pipeline has been run across 15 specialties (2,552 practices)

---

### 22. City Name Typos in NPI Data

**Symptoms:**
- City names have trailing state codes, punctuation, or misspellings
- Search results miss providers due to mismatched city names

**Cause:**
NPI data contains inconsistent city name formatting from provider self-reporting.

**Fix:**
Cleanup scripts exist but may not cover all data. Check for:
- Trailing state codes (e.g., "NEW YORK NY")
- Trailing punctuation (e.g., "BROOKLYN,")
- Common misspellings

---

### 23. Import Conflicts After NPI Re-Import

**Symptoms:**
- Enriched data (URLs, confidence scores, geocoding) is at risk of being overwritten

**Fix:**
The enrichment protection system prevents this:
1. Protected fields are explicitly excluded from NPI import upserts
2. Conflicts are logged to the `import_conflicts` table with resolution workflow (pending/keep_current/accept_incoming/manual)
3. Run `scripts/pre-import-check.ts` before any import to check for pending conflicts

---

## Security Issues

### 24. Suspected Bot Activity

**Symptoms:**
- Unusual spike in verification submissions
- Multiple verifications from same IP in short time
- Honeypot field populated in logs

**Diagnosis:**
1. Check request logs for patterns:
   - High volume from single IP
   - `Honeypot triggered` log entries
   - Low reCAPTCHA scores
2. Check admin retention stats:
   ```bash
   curl https://your-backend-url/api/v1/admin/retention/stats \
     -H "X-Admin-Secret: your-secret"
   ```

**Mitigation:**
The 4-layer Sybil prevention system handles most cases automatically:
- Rate limiting blocks high-volume attacks
- reCAPTCHA v3 filters bots
- Honeypot catches naive bots
- Vote deduplication prevents vote manipulation

---

### 25. Insurance Card PII Exposure Concerns

**Symptoms:**
- Concern about encrypted PII fields being accessible

**Current protections:**
- All PII fields (subscriber ID, group number, Rx fields) are encrypted with AES-256
- Key stored in GCP Secret Manager
- Key rotation supported via admin endpoint
- Decrypted data never logged

---

## Monitoring and Diagnostics

### Health Check Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | None | Basic health: database, cache, memory, uptime |
| `GET /api/v1/admin/health` | Admin | Detailed: retention metrics, cache stats |
| `GET /api/v1/admin/retention/stats` | Admin | Log retention: verification, sync, vote counts |
| `GET /api/v1/admin/cache/stats` | Admin | Cache hit/miss rates |
| `GET /api/v1/admin/enrichment/stats` | Admin | Enrichment pipeline statistics |
| `GET /api/v1/admin/expiration-stats` | Admin | Verification expiration metrics |

### Log Structure

Backend uses Pino for structured JSON logging. Key log fields:
- `requestId` -- Correlate logs across a request lifecycle
- `path`, `method`, `statusCode` -- Request details
- `responseTimeMs` -- Performance monitoring
- `rateLimited` -- Rate limit tracking
- No PII logged (no IP, user agent in request logs)

### Cloud Logging

In production, logs are sent to stdout and picked up by Google Cloud Logging. Use the GCP Console to:
1. Navigate to Cloud Run > Service > Logs
2. Filter by severity, time range, or text
3. Correlate using `requestId` field

### Diagnostic Commands

```bash
# Check overall system health
curl https://your-backend-url/health | jq

# Check cache performance
curl https://your-backend-url/api/v1/admin/cache/stats \
  -H "X-Admin-Secret: your-secret" | jq

# Check data retention
curl https://your-backend-url/api/v1/admin/retention/stats \
  -H "X-Admin-Secret: your-secret" | jq

# Check enrichment status
curl https://your-backend-url/api/v1/admin/enrichment/stats \
  -H "X-Admin-Secret: your-secret" | jq

# Preview expired record cleanup
curl -X POST "https://your-backend-url/api/v1/admin/cleanup-expired?dryRun=true" \
  -H "X-Admin-Secret: your-secret" | jq
```
