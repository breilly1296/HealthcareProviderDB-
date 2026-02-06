# VerifyMyProvider Troubleshooting Guide

**Last Updated:** 2026-02-06

---

## Development Environment Issues

### 1. Next.js SWC on Windows ARM64 + Node.js v24+

**Symptom:** Build fails with "not a valid Win32 application" when running `next dev` or `next build` on Windows ARM64 with Node.js v24+.

**Root Cause:** Next.js 14.x ships native SWC binaries that are incompatible with Node.js v24+ on Windows ARM64. The SWC WASM fallback is only auto-enabled for a hardcoded list of "unsupported" platforms, and `win32-arm64` is not in that list.

**Fix:** The postinstall script at `packages/frontend/scripts/patch-next-swc.js` automatically patches this. It:
1. Adds `"aarch64-pc-windows-msvc"` to `knownDefaultWasmFallbackTriples` in `next/dist/build/swc/index.js`
2. Removes the `useWasmBinary` gate so unsupported platforms automatically fall back to WASM

**Verification:**
```bash
# Run from packages/frontend
node scripts/patch-next-swc.js
# Should print: "Patched Next.js SWC loader for Windows ARM64 WASM fallback"
```

**If the patch fails:**
- Check that `next` is installed in the correct location (either `packages/frontend/node_modules/next` or the hoisted `node_modules/next`)
- The script checks both locations automatically
- If `next` is not found at either path, ensure `npm install` completed successfully

**Source File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\scripts\patch-next-swc.js`

---

### 2. OneDrive + node_modules Corruption

**Symptom:** Random build failures with cryptic errors about invalid binaries or corrupted files. Most commonly affects native `.node` binary modules.

**Root Cause:** OneDrive file sync can corrupt native binary modules when it syncs the `node_modules` directory. The sync process modifies binary file metadata or contents.

**Fix:**
- The SWC WASM fallback (above) mitigates this for Next.js specifically
- For other native modules, consider excluding `node_modules` from OneDrive sync
- Alternatively, move the project directory outside of OneDrive-synced folders

**Prevention:**
- Use WASM fallbacks wherever available
- Add `node_modules` to OneDrive's exclusion list
- If working from an OneDrive-synced directory, run `npm ci` (clean install) if you encounter corruption

---

### 3. npm Workspace Hoisting Conflicts

**Symptom:** SWC version mismatches, build errors mentioning wrong Next.js version, or `Cannot find module` errors.

**Root Cause:** Putting `next` in the root `package.json` causes npm to hoist it to the root `node_modules`, overriding the version specified in `packages/frontend/package.json`. The root had `next@^16.1.1` while the frontend needed `next@^14.2.35`.

**Fix:** Only put shared dependencies at the root `package.json`:
- Root dependencies: `@prisma/client`, `csv-parse`, `pg` (shared across packages)
- Package-specific dependencies: `next`, `react`, `express` (in their respective `packages/*/package.json`)

**Current Root Dependencies (verified in `package.json`):**
```json
{
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "csv-parse": "^5.6.0",
    "pg": "^8.13.1"
  }
}
```

**If you see version conflicts:**
```bash
# Delete all node_modules and reinstall
rm -rf node_modules packages/*/node_modules
npm install
```

---

### 4. Prisma Schema Conventions

**Symptom:** TypeScript compilation errors after running `prisma db pull`, fields not accessible by expected names, or model names appearing in lowercase.

**Root Cause:** `prisma db pull` generates raw lowercase model names from PostgreSQL table names. Without manual mapping, TypeScript code cannot use PascalCase model names.

**Fix:** After `prisma db pull`, manually adjust:
1. Rename models to PascalCase and add `@@map("original_table_name")`
2. Rename fields to camelCase and add `@map("original_column_name")`
3. For application-generated primary keys (like verification_logs, vote_logs), add `@default(cuid())`

**Example:**
```prisma
model ProviderPlanAcceptance {
  id              Int    @id @default(autoincrement())
  providerNpi     String @map("provider_npi")
  planId          String @map("plan_id")
  @@map("provider_plan_acceptance")
}
```

**Source File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\prisma\schema.prisma`

---

## Database Issues

### 5. Cloud SQL Connection

**Symptom:** Backend cannot connect to the database. Health check returns 503 with `status: "degraded"`.

**Local Development:**
```bash
# Start local PostgreSQL via Docker
npm run docker:dev

# Verify connection
# In packages/backend/.env:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/healthcare_providers
```

**Cloud Run (Production):**
- Connection is automatic via Cloud SQL proxy (Unix socket)
- `DATABASE_URL` is stored in Google Secret Manager and mounted as an environment variable
- Format: `postgresql://user:password@/database?host=/cloudsql/project:region:instance`

**Diagnosis Steps:**
1. Check Docker container is running: `docker ps | grep healthcaredb-postgres`
2. Check database URL is set: `echo $DATABASE_URL`
3. Test connection: `npx prisma db push --force-reset` (WARNING: destroys data)
4. Check Prisma client is generated: `npx prisma generate`
5. For Cloud Run: check Secret Manager permissions in GCP Console

---

### 6. Database Schema Push/Migration

**Symptom:** Schema changes not reflected in the database, or Prisma client types don't match the database.

**Fix:**
```bash
# Generate Prisma client (TypeScript types)
npm run db:generate

# Push schema to database (development only -- no migration history)
npm run db:push
```

**Important Notes:**
- `prisma db push` is used instead of `prisma migrate` -- there is no migration history
- This is additive for new fields/tables but can be destructive for removed fields
- Always take a Cloud SQL backup before pushing schema changes in production
- For destructive changes, manually backup affected data first

---

## Deployment Issues

### 7. Cloud Run Service Won't Start

**Symptom:** Deployment succeeds but the service shows "unhealthy" or fails health checks.

**Diagnosis:**
```bash
# Check Cloud Run logs
gcloud run services logs read verifymyprovider-backend --region=us-central1

# Check revision status
gcloud run revisions list --service=verifymyprovider-backend --region=us-central1
```

**Common Causes:**
1. **DATABASE_URL secret not accessible:** Verify Secret Manager permissions. The Cloud Run service account needs `roles/secretmanager.secretAccessor`.
2. **Port mismatch:** The Dockerfile exposes port 8080 but `PORT` env var might override it. Cloud Run expects port 8080.
3. **Memory limit exceeded:** Default is 512Mi. If the service OOMs on startup, increase to 1Gi.
4. **Prisma client not generated:** Ensure `npx prisma generate` runs in the Docker build stage BEFORE the TypeScript compilation.

---

### 8. Health Check Failing

**Symptom:** Cloud Run reports the service as unhealthy, or `/health` returns 503.

**How the health check works:**
- Backend Dockerfile: `wget --no-verbose --tries=1 --spider http://localhost:8080/health`
- Frontend Dockerfile: Similar health check on port 8080
- The `/health` endpoint tests database connectivity with `SELECT 1`

**If database is unreachable:**
```json
{
  "status": "degraded",
  "checks": { "database": "unhealthy" },
  "error": "Database connection failed"
}
```

**Fix:** Check the DATABASE_URL secret is correctly mounted. For Cloud SQL, ensure the Cloud SQL Admin API is enabled and the instance is running.

---

### 9. ADMIN_SECRET Not Configured

**Symptom:** Admin endpoints return 503 with this response:
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

**Root Cause:** The `ADMIN_SECRET` environment variable is not set. This is intentional behavior -- admin endpoints are disabled gracefully when the secret is not configured.

**Fix:** Set `ADMIN_SECRET` in:
- Local: `packages/backend/.env` file
- Production: Google Secret Manager, referenced in Cloud Run service configuration

---

### 10. Docker Build Failures

**Symptom:** `npm run docker:build` fails during the build stage.

**Common Causes:**

1. **npm install fails with peer dependency errors:**
   - The Dockerfiles use `npm install --force` to handle workspace peer dependency conflicts
   - If this flag is missing, add `--force` to the `RUN npm install` command

2. **Prisma generate fails:**
   - `npx prisma generate` must run in the builder stage BEFORE the TypeScript build
   - Ensure the Prisma schema is copied into the build context

3. **TypeScript compilation errors:**
   - The build compiles `packages/shared` first, then the target package
   - Check that shared types are up to date: `npm run build:shared`

4. **Context too large:**
   - Ensure `.dockerignore` excludes `node_modules`, `.next`, `dist`

---

### 11. CORS Errors

**Symptom:** Frontend cannot call backend API. Browser console shows CORS errors.

**Allowed Origins (from `packages/backend/src/index.ts`):**
- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- Cloud Run frontend URL (hardcoded)
- `FRONTEND_URL` environment variable
- `localhost:3000` and `localhost:3001` (development only)

**Fix:**
1. Check the `FRONTEND_URL` env var is set to the correct Cloud Run frontend URL
2. If deploying to a new domain, add it to the `ALLOWED_ORIGINS` array in `packages/backend/src/index.ts`
3. Blocked CORS requests are logged: look for "CORS blocked request from origin" in logs

---

## Production Issues

### 12. Rate Limiting False Positives

**Symptom:** Legitimate users receiving 429 Too Many Requests responses.

**Diagnosis:**
1. Check if the user is behind a shared IP (corporate network, VPN, ISP NAT)
2. Check the rate limit headers in the response:
   - `X-RateLimit-Limit`: What the limit is
   - `X-RateLimit-Remaining`: How many requests remain
   - `X-RateLimit-Reset`: When the window resets

**Rate Limits:**
| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Default | 200/hr | 1 hour sliding window |
| Search | 100/hr | 1 hour sliding window |
| Verification | 10/hr | 1 hour sliding window |
| Vote | 10/hr | 1 hour sliding window |

**Mitigation:**
- The sliding window algorithm prevents burst attacks at window boundaries
- Redis mode shares state across instances (proper counting)
- In-memory mode has per-instance counters (could under-count with multiple instances)
- The rate limiter fails open if Redis becomes unavailable mid-operation

---

### 13. Cache Inconsistency

**Symptom:** Search results don't reflect recently submitted verifications.

**Root Cause:** Search results are cached for 5 minutes. Although verification submission triggers async cache invalidation, the invalidation may fail silently.

**Fix:**
```bash
# Clear cache via admin endpoint
curl -X POST https://backend-url/api/v1/admin/cache/clear \
  -H "X-Admin-Secret: your-secret"

# Check cache stats
curl https://backend-url/api/v1/admin/cache/stats \
  -H "X-Admin-Secret: your-secret"
```

**Source:** Cache invalidation is triggered in `packages/backend/src/routes/verify.ts` line 74 but runs asynchronously and failures are caught and logged as warnings.

---

### 14. Confidence Score Drift

**Symptom:** Provider-plan acceptance confidence scores don't reflect time-based decay.

**Root Cause:** Confidence scores are calculated at verification time but not automatically recalculated as time passes. The recency factor (30 points max) should decrease as verifications age.

**Fix:**
```bash
# Recalculate all confidence scores (dry run first)
curl -X POST "https://backend-url/api/v1/admin/recalculate-confidence?dryRun=true" \
  -H "X-Admin-Secret: your-secret"

# Apply recalculation
curl -X POST "https://backend-url/api/v1/admin/recalculate-confidence" \
  -H "X-Admin-Secret: your-secret"
```

**Recommendation:** Schedule this via Cloud Scheduler (e.g., daily) to keep scores fresh.

**Source:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\confidenceDecayService.ts`

---

### 15. NPI Import Errors

**Symptom:** NPI import script fails or produces unexpected results.

**Common Issues:**

1. **Connection pool exhaustion:** Import uses `pg.Pool` with max 5 connections. If interrupted, connections may leak.
   - Fix: Restart the script (it uses upserts so re-running is safe)

2. **File hash already imported:** The script tracks SHA-256 hashes of imported files in `sync_logs`.
   - If you need to re-import the same file, delete the corresponding `sync_logs` entry

3. **Memory issues with large files:** CA has 1.1M+ providers.
   - The script streams CSV records and batches inserts (5000 per batch)
   - Monitor memory with the progress logging (every 10,000 records)

4. **Deactivated providers appearing:** The script filters out deactivated providers (those with deactivation date and no subsequent reactivation). Verify the filter at lines 264-275 of `scripts/import-npi-direct.ts`.

**Running an import:**
```bash
npx tsx scripts/import-npi-direct.ts --file /path/to/state-data.csv
```

**Source:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\import-npi-direct.ts`

---

### 16. Graceful Shutdown Timeout

**Symptom:** Cloud Run shows "Container called exit(1)" in logs during deployments.

**Root Cause:** The graceful shutdown handler has a 10-second timeout (`SHUTDOWN_TIMEOUT_MS`). If the database disconnect takes longer, the process force-exits with code 1.

**Fix:** This is generally not a problem. Cloud Run sends SIGTERM and waits for the configured grace period. The 10-second timeout in the application code ensures the process does not hang indefinitely.

**Source:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\index.ts` (lines 197-233)

---

## Monitoring and Alerting

### Current Monitoring
- **Health check:** `/health` endpoint verifies database connectivity, cache stats, and memory usage
- **Admin health:** `/api/v1/admin/health` provides retention metrics
- **Structured logging:** Pino logs with request IDs for correlation
- **PostHog:** Privacy-preserving analytics on the frontend

### Not Yet Implemented
- No automated alerting (e.g., PagerDuty, Opsgenie)
- No Cloud Run monitoring dashboards
- No log-based alerting rules
- No uptime monitoring (e.g., Pingdom, UptimeRobot)
- No error tracking service (e.g., Sentry)

---

## Checklist Status

- [x] SWC ARM64 workaround documented
- [x] OneDrive workaround documented
- [x] npm workspace hoisting issue documented
- [x] Database connection troubleshooting documented
- [x] Docker build troubleshooting documented
- [x] CORS troubleshooting documented
- [x] Rate limiting false positives documented
- [x] Cache inconsistency documented
- [x] NPI import errors documented
- [ ] Production incident runbook (not yet created)
- [ ] Cloud Run scaling issue documentation (not yet needed -- scale-to-zero is current config)

---

## Answers to Prompt Questions

1. **What are the most common issues developers encounter?** -- Based on codebase analysis: (a) SWC ARM64 compatibility on Windows, (b) npm workspace hoisting conflicts, (c) OneDrive binary corruption. All three have automated or documented workarounds.

2. **Are there any recurring production incidents?** -- The project is pre-beta and not yet in production at scale. The most likely production issues will be: rate limiting false positives for shared IPs, cache staleness after verifications, and confidence score drift without scheduled recalculation.

3. **What monitoring/alerting is in place?** -- Minimal. Health check endpoint exists, structured logging via Pino is in place, PostHog for frontend analytics. No automated alerting, error tracking, or uptime monitoring is configured.

4. **Are there any database migration gotchas?** -- The project uses `prisma db push` (not `prisma migrate`), so there is no migration history. Schema changes are additive via push. Destructive changes require manual backup and restore. There is no automated rollback for schema changes.

5. **What is the process for investigating a reported data quality issue?** -- (a) Check the `DataQualityAudit` table for known issues, (b) use admin endpoints to check verification and retention stats, (c) query the provider directly via GET /api/v1/providers/:npi, (d) check sync_logs for import issues, (e) compare against NPI Registry API for source data validation.
