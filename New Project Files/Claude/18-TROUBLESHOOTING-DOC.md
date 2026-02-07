# VerifyMyProvider Troubleshooting Guide

Comprehensive troubleshooting guide for common issues encountered during development, deployment, and production operation of the VerifyMyProvider platform.

---

## Table of Contents

1. [Development Environment](#1-development-environment)
   - [Next.js SWC on Windows ARM64 + Node 24](#11-nextjs-swc-on-windows-arm64--node-24)
   - [OneDrive + node_modules Corruption](#12-onedrive--node_modules-corruption)
   - [npm Workspaces Hoisting Conflicts](#13-npm-workspaces-hoisting-conflicts)
   - [Backend Will Not Start](#14-backend-will-not-start)
   - [Frontend Will Not Start](#15-frontend-will-not-start)
   - [TypeScript Compilation Errors](#16-typescript-compilation-errors)
2. [Database](#2-database)
   - [Prisma Schema Conventions](#21-prisma-schema-conventions)
   - [Cloud SQL Connection](#22-cloud-sql-connection)
   - [Prisma Client Errors](#23-prisma-client-errors)
   - [Database Connection Pool Timeout](#24-database-connection-pool-timeout)
   - [Migration Gotchas](#25-migration-gotchas)
3. [API and Routes](#3-api-and-routes)
   - [ADMIN_SECRET Not Configured](#31-admin_secret-not-configured)
   - [Locations Route](#32-locations-route)
   - [CORS Errors](#33-cors-errors)
   - [Rate Limiting Issues](#34-rate-limiting-issues)
   - [Request Timeouts](#35-request-timeouts)
   - [CAPTCHA Verification Failures](#36-captcha-verification-failures)
4. [Deployment](#4-deployment)
   - [Docker Build Failures](#41-docker-build-failures)
   - [Cloud Run Deployment](#42-cloud-run-deployment)
   - [Environment Variable Misconfiguration](#43-environment-variable-misconfiguration)
   - [Cloud Scheduler Job Failures](#44-cloud-scheduler-job-failures)
5. [Production Operations](#5-production-operations)
   - [Health Check Diagnostics](#51-health-check-diagnostics)
   - [Cache Issues](#52-cache-issues)
   - [Redis Connection Problems](#53-redis-connection-problems)
   - [High Error Rate Investigation](#54-high-error-rate-investigation)
   - [Database Full](#55-database-full)
   - [Data Quality Investigation](#56-data-quality-investigation)
6. [Error Code Reference](#6-error-code-reference)

---

## 1. Development Environment

### 1.1 Next.js SWC on Windows ARM64 + Node 24

**Symptom:**
When running `npm run dev:frontend` on Windows ARM64 with Node.js v24+, you see:

```
Error: not a valid Win32 application
```

The error occurs because Next.js 14.x ships native SWC binaries that are incompatible with Node.js v24+ on Windows ARM64. The WASM fallback is only auto-enabled for a hardcoded list of "unsupported" platforms, and `win32-arm64` is not in that list.

**Root Cause:**
In `next/dist/build/swc/index.js`, the array `knownDefaultWasmFallbackTriples` does not include `aarch64-pc-windows-msvc`. Additionally, the `useWasmBinary` gate prevents automatic fallback even for platforms in the list.

**Fix:**
The project includes an automated postinstall patch script at:

`packages/frontend/scripts/patch-next-swc.js`

This script performs two patches:
1. Adds `"aarch64-pc-windows-msvc"` to the `knownDefaultWasmFallbackTriples` array
2. Removes the `useWasmBinary` gate so the WASM fallback is used automatically

The script runs automatically via the `postinstall` hook in `packages/frontend/package.json`:

```json
"postinstall": "node scripts/patch-next-swc.js || true"
```

The WASM fallback package is included as a dev dependency:

```json
"@next/swc-wasm-nodejs": "^14.2.33"
```

**Verification:**
After `npm install`, you should see:
```
patch-next-swc: Patched Next.js SWC loader for Windows ARM64 WASM fallback
```

If you see `Already patched or not needed`, the patch was already applied.

**Manual Fix (if postinstall fails):**
```bash
node packages/frontend/scripts/patch-next-swc.js
```

The script checks both the workspace-local path (`packages/frontend/node_modules/next/dist/build/swc/index.js`) and the hoisted root path (`node_modules/next/dist/build/swc/index.js`).

**Related Configuration:**
In `packages/frontend/next.config.js`, SWC minification is explicitly disabled for ARM64 compatibility:

```js
const nextConfig = {
  swcMinify: false,
  experimental: {
    turbo: undefined, // Explicitly disable turbopack for ARM64 compatibility
  },
};
```

---

### 1.2 OneDrive + node_modules Corruption

**Symptom:**
Random build failures, corrupted native `.node` binaries, or intermittent "module not found" errors when the project resides on a OneDrive-synced folder.

**Root Cause:**
OneDrive's file sync process can corrupt native binary files (`.node` files) in `node_modules` during synchronization, especially when builds are running concurrently.

**Fix:**
- Use WASM fallbacks instead of native binaries wherever possible (the SWC WASM fallback described above is one example)
- If issues persist, consider moving `node_modules` outside the OneDrive-synced folder using a symlink or configuring npm to use a different cache/prefix location
- Alternatively, add `node_modules` directories to OneDrive exclusion settings

**Preventive Measures:**
- The project already uses `@next/swc-wasm-nodejs` as a WASM fallback for the SWC compiler
- The `sharp` image processing library is externalized in `next.config.js` via `serverComponentsExternalPackages` to manage its native dependencies:
  ```js
  experimental: {
    serverComponentsExternalPackages: ['sharp', 'detect-libc'],
  }
  ```

---

### 1.3 npm Workspaces Hoisting Conflicts

**Symptom:**
SWC version mismatches, unexpected Next.js behavior, or errors like:

```
Error: Cannot find module 'next/dist/compiled/...'
```

**Root Cause:**
npm workspaces hoists dependencies to the root `node_modules` by default. If `next` is placed in the root `package.json`, it overrides the version specified in `packages/frontend/package.json`. This caused a critical issue where root had `next@^16.1.1` while frontend expected `next@^14.2.35`.

**Fix:**
NEVER put `next` in the root `package.json`. Only shared dependencies belong at root. Currently, the root `package.json` correctly includes only:

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

**Verification:**
Check that `next` is only in `packages/frontend/package.json`:

```bash
grep -r '"next"' package.json packages/*/package.json
```

Expected output should show `next` only in `packages/frontend/package.json`.

**If Already Broken:**
1. Remove `next` from root `package.json` if present
2. Delete `node_modules` at root and in all packages
3. Delete `package-lock.json`
4. Run `npm install` from the project root

---

### 1.4 Backend Will Not Start

**Symptom:**
`npm run dev:backend` fails immediately or the Express server does not listen.

**Diagnostic Steps:**

1. **Check DATABASE_URL:** The backend requires a valid PostgreSQL connection string in `packages/backend/.env`:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/healthcare_providers"
   ```

2. **Check Prisma client generation:** If you see Prisma import errors, regenerate the client:
   ```bash
   npm run db:generate
   ```

3. **Check port conflicts:** The default port is `3001`. Verify nothing else is using it:
   ```bash
   # Windows
   netstat -ano | findstr :3001
   # macOS/Linux
   lsof -i :3001
   ```

4. **Check the database is running:** If using docker-compose for the local database:
   ```bash
   npm run docker:dev
   ```
   This starts a PostgreSQL 15 container on port 5432.

5. **Check environment file location:** The backend loads `.env` from `packages/backend/.env` via `dotenv.config()` in `packages/backend/src/index.ts`.

---

### 1.5 Frontend Will Not Start

**Symptom:**
`npm run dev:frontend` fails or the page loads with errors.

**Diagnostic Steps:**

1. **Build shared package first:** The frontend depends on `@healthcareproviderdb/shared`. Build it:
   ```bash
   npm run build:shared
   ```

2. **Check NEXT_PUBLIC_API_URL:** Ensure `packages/frontend/.env.local` has:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
   ```

3. **Check SWC patch (Windows ARM64):** See section 1.1 above.

4. **Verify the backend is running:** The frontend makes API calls to the backend. Start it first:
   ```bash
   npm run dev:backend
   ```

5. **Clear Next.js cache:** If you see stale build artifacts:
   ```bash
   cd packages/frontend
   rm -rf .next
   npm run dev
   ```

---

### 1.6 TypeScript Compilation Errors

**Symptom:**
`npm run build` fails with TypeScript errors.

**Common Causes:**

1. **Shared package not built:** The shared package must be built before backend or frontend:
   ```bash
   npm run build:shared
   ```

2. **Prisma client not generated:** Run:
   ```bash
   npm run db:generate
   ```

3. **Stale build artifacts:** Clean and rebuild:
   ```bash
   npm run clean
   npm run build
   ```

---

## 2. Database

### 2.1 Prisma Schema Conventions

**Symptom:**
After running `prisma db pull`, model names are lowercase and fields do not match TypeScript conventions.

**Root Cause:**
PostgreSQL tables use `snake_case` naming. `prisma db pull` generates raw lowercase model names from the database tables. The Prisma schema requires manual adjustments for TypeScript compatibility.

**Fix:**
When working with the Prisma schema (`packages/backend/prisma/schema.prisma`), follow these conventions:

1. **Models:** Rename to PascalCase and add `@@map("table_name")`:
   ```prisma
   model InsurancePlan {
     planId  String  @id @map("plan_id") @db.VarChar(50)
     // ...
     @@map("insurance_plans")
   }
   ```

2. **Fields:** Use camelCase with `@map("snake_case")` for database column mapping:
   ```prisma
   model VerificationLog {
     providerNpi  String?  @map("provider_npi") @db.VarChar(10)
     planId       String?  @map("plan_id") @db.VarChar(50)
     createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
     // ...
   }
   ```

3. **Application-generated text PKs:** Use `@default(cuid())` for tables like `verification_logs` and `vote_logs`:
   ```prisma
   model VerificationLog {
     id  String  @id @default(cuid())
     // ...
   }
   ```

**Current Schema Models:**
The schema at `packages/backend/prisma/schema.prisma` contains the following models, some using PascalCase conventions and some using raw lowercase names from PostgreSQL:

| Model (Prisma) | Table (PostgreSQL) | Convention |
|---|---|---|
| `Provider` | `providers` | PascalCase with `@@map` |
| `hospitals` | `hospitals` | Raw lowercase |
| `practice_locations` | `practice_locations` | Raw lowercase |
| `provider_cms_details` | `provider_cms_details` | Raw lowercase |
| `InsurancePlan` | `insurance_plans` | PascalCase with `@@map` |
| `ProviderPlanAcceptance` | `provider_plan_acceptance` | PascalCase with `@@map` |
| `VerificationLog` | `verification_logs` | PascalCase with `@@map` |
| `VoteLog` | `vote_logs` | PascalCase with `@@map` |
| `DataQualityAudit` | `data_quality_audit` | PascalCase with `@@map` |

**Warning:** Running `prisma db pull` again will overwrite these manual naming conventions. Always backup the schema before pulling.

---

### 2.2 Cloud SQL Connection

**Symptom:**
Cannot connect to the production database, or connection string format errors.

**Local Development:**
Use a direct connection string in `packages/backend/.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/healthcare_providers"
```

For connecting to the Cloud SQL production database locally, use the Cloud SQL Auth Proxy:
```bash
# Start the proxy
cloud-sql-proxy PROJECT:REGION:INSTANCE --port=5432

# Then use localhost in DATABASE_URL
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/verifymyprovider"
```

**Cloud Run (Production):**
Cloud Run connects to Cloud SQL automatically via Unix sockets. The connection string format is:
```env
DATABASE_URL="postgresql://USER:PASSWORD@/verifymyprovider?host=/cloudsql/PROJECT:REGION:INSTANCE"
```

Note the Unix socket path in the `host` parameter, not a TCP hostname.

**Troubleshooting:**

1. **Check Cloud SQL instance status:**
   ```bash
   gcloud sql instances describe $SQL_INSTANCE --format='yaml(state, connectionName)'
   ```

2. **Verify active connections:**
   ```sql
   SELECT * FROM pg_stat_activity WHERE datname = 'verifymyprovider';
   ```

3. **Check from the health endpoint:** The public health endpoint at `GET /health` reports database connectivity:
   ```bash
   curl http://localhost:3001/health
   ```
   A healthy response includes:
   ```json
   {
     "status": "ok",
     "checks": { "database": "healthy" },
     "databaseResponseTime": "5ms"
   }
   ```
   A degraded response (503) indicates the database is unreachable:
   ```json
   {
     "status": "degraded",
     "checks": { "database": "unhealthy" },
     "error": "Can't reach database server at ..."
   }
   ```

---

### 2.3 Prisma Client Errors

The global error handler in `packages/backend/src/middleware/errorHandler.ts` maps Prisma errors to user-friendly HTTP responses:

| Prisma Error Code | HTTP Status | Response Code | Meaning |
|---|---|---|---|
| `P2002` | 409 Conflict | `DUPLICATE_ENTRY` | Unique constraint violation |
| `P2003` | 400 Bad Request | `FOREIGN_KEY_VIOLATION` | Referenced record not found |
| `P2010` | 500 Internal Error | `QUERY_ERROR` | Raw query execution failed |
| `P2024` | 503 Service Unavailable | `DATABASE_TIMEOUT` | Connection pool timeout |
| `P2025` | 404 Not Found | `NOT_FOUND` | Record not found |
| `PrismaClientInitializationError` | 503 Service Unavailable | `DATABASE_UNAVAILABLE` | Cannot connect to database |

**Investigation Steps for Prisma Errors:**

1. **P2002 (Duplicate Entry):** Check unique constraints. The `provider_plan_acceptance` table uses partial unique indexes managed via raw SQL:
   - `idx_ppa_npi_plan_location`: `UNIQUE(npi, plan_id, location_id) WHERE location_id IS NOT NULL`
   - `idx_ppa_npi_plan_legacy`: `UNIQUE(npi, plan_id) WHERE location_id IS NULL`

2. **P2024 (Connection Pool Timeout):** The Prisma client may be exhausting its connection pool. Check Cloud SQL connection limits and active queries.

3. **PrismaClientInitializationError:** Logged as `CRITICAL: Database connection failed`. Check DATABASE_URL and database accessibility.

---

### 2.4 Database Connection Pool Timeout

**Symptom:**
API responses return 503 with `DATABASE_TIMEOUT` error code.

**Root Cause:**
Prisma's connection pool is exhausted, often due to long-running queries or too many concurrent requests relative to the pool size.

**Fix:**

1. Check for slow queries:
   ```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC;
   ```

2. Increase Prisma connection pool size by adding `connection_limit` to DATABASE_URL:
   ```
   DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=20"
   ```

3. Check request timeouts. The backend has three timeout tiers (defined in `packages/backend/src/middleware/requestTimeout.ts`):
   - General API routes: 30 seconds
   - Search endpoints: 15 seconds
   - Admin endpoints: 120 seconds

---

### 2.5 Migration Gotchas

**Issue: Mixed camelCase/snake_case in the database**

When using quoted PostgreSQL identifiers via Prisma's `@map` directives, the actual database columns can end up in a mix of camelCase and snake_case. This is by design -- the Prisma schema uses `@map()` to translate between TypeScript camelCase and PostgreSQL snake_case.

**Issue: Legacy records with NULL `expiresAt`**

Verification records created before the TTL system was introduced may have `expiresAt: null`. These records are not cleaned up by the automated expiration jobs. To identify them:

```sql
SELECT COUNT(*) FROM verification_logs WHERE expires_at IS NULL;
SELECT COUNT(*) FROM provider_plan_acceptance WHERE expires_at IS NULL;
```

**Issue: `prisma db pull` overwrites manual schema changes**

Always back up `packages/backend/prisma/schema.prisma` before running `prisma db pull`. After pulling, you must manually re-apply PascalCase model names, `@@map()` annotations, and `@map()` field annotations.

---

## 3. API and Routes

### 3.1 ADMIN_SECRET Not Configured

**Symptom:**
All admin endpoints (`/api/v1/admin/*`) return HTTP 503 with:

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
This is intentional behavior. The admin authentication middleware in `packages/backend/src/routes/admin.ts` returns 503 when `ADMIN_SECRET` is not set, allowing the application to run in environments where admin access is not needed.

**Fix:**

For local development:
```bash
# In packages/backend/.env
ADMIN_SECRET=local-dev-secret
```

For production (Cloud Run):
```bash
# Generate a secure secret
openssl rand -hex 32

# Store in Secret Manager
echo -n "generated-secret" | gcloud secrets create ADMIN_SECRET --data-file=-

# Configure Cloud Run to use it
gcloud run services update verifymyprovider-api \
  --update-secrets=ADMIN_SECRET=ADMIN_SECRET:latest
```

**Using Admin Endpoints:**
Pass the secret in the `X-Admin-Secret` header:
```bash
curl -H "X-Admin-Secret: your-secret" \
  https://api.verifymyprovider.com/api/v1/admin/health
```

**Security Note:** The admin middleware uses timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing-based secret extraction attacks.

**Available Admin Endpoints:**

| Endpoint | Method | Purpose |
|---|---|---|
| `/admin/health` | GET | Detailed health check with retention metrics |
| `/admin/expiration-stats` | GET | Verification expiration statistics |
| `/admin/retention/stats` | GET | Comprehensive log retention stats |
| `/admin/cache/stats` | GET | Cache hit/miss statistics |
| `/admin/cache/clear` | POST | Clear all cached data |
| `/admin/cleanup-expired` | POST | Clean up expired verification records |
| `/admin/cleanup/sync-logs` | POST | Clean up sync_logs older than 90 days |
| `/admin/enrichment/stats` | GET | Location enrichment statistics |
| `/admin/recalculate-confidence` | POST | Recalculate confidence scores with decay |

---

### 3.2 Locations Route

**Status: ACTIVE**

The locations route is registered and active in `packages/backend/src/routes/index.ts`:

```typescript
import locationsRouter from './locations';
router.use('/locations', locationsRouter);
```

**Available Endpoints** (defined in `packages/backend/src/routes/locations.ts`):

| Endpoint | Method | Rate Limiter | Description |
|---|---|---|---|
| `/locations/search` | GET | searchRateLimiter (100/hr) | Search practice locations by state, city, zip code |
| `/locations/health-systems` | GET | defaultRateLimiter (200/hr) | Get distinct health system names |
| `/locations/stats/:state` | GET | defaultRateLimiter (200/hr) | Location statistics for a state |
| `/locations/:locationId` | GET | defaultRateLimiter (200/hr) | Single practice location by ID |
| `/locations/:locationId/providers` | GET | defaultRateLimiter (200/hr) | Providers at a location |

**Data Source:**
The locations route uses the `practice_locations` model directly (not a deduplicated "Location" entity). This is noted in `packages/backend/src/services/index.ts`:

```typescript
// TODO: locationService requires a Location model that doesn't exist in the new schema
// practice_locations is a flat per-provider table, not a deduplicated locations entity
```

**Search Requires State Parameter:**
The search endpoint requires a `state` parameter (2-character state code). City and zip code are optional filters:

```bash
curl "http://localhost:3001/api/v1/locations/search?state=NY&city=New%20York"
```

---

### 3.3 CORS Errors

**Symptom:**
Browser console shows:
```
Access to fetch at 'https://api.verifymyprovider.com/...' from origin 'https://...' has been blocked by CORS policy
```

**Root Cause:**
The CORS configuration in `packages/backend/src/index.ts` only allows specific origins:

```typescript
const ALLOWED_ORIGINS: string[] = [
  'https://verifymyprovider.com',
  'https://www.verifymyprovider.com',
  'https://verifymyprovider-frontend-741434145252.us-central1.run.app',
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:3001');
}
```

**Diagnostic Steps:**

1. Check backend logs for CORS warnings:
   ```
   CORS blocked request from origin: https://unexpected-origin.com
   ```

2. Verify `FRONTEND_URL` environment variable matches the frontend's exact origin (including protocol and port).

3. In development, ensure `NODE_ENV=development` is set so `localhost` origins are allowed.

4. For Cloud Run deployments, ensure `FRONTEND_URL` is set to the Cloud Run frontend service URL.

**Allowed Headers:**
```typescript
allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Admin-Secret']
```

If a custom header is not in this list, it will trigger a CORS preflight failure.

---

### 3.4 Rate Limiting Issues

**Symptom:**
API returns HTTP 429 with:
```json
{
  "error": "Too many requests",
  "message": "Too many search requests. Please try again in 1 hour.",
  "retryAfter": 3600
}
```

**Rate Limit Tiers** (defined in `packages/backend/src/middleware/rateLimiter.ts`):

| Limiter | Limit | Window | Applied To |
|---|---|---|---|
| `defaultRateLimiter` | 200 requests | 1 hour | All API routes (global) |
| `searchRateLimiter` | 100 requests | 1 hour | Provider/plan search endpoints |
| `verificationRateLimiter` | 10 requests | 1 hour | Verification submissions |
| `voteRateLimiter` | 10 requests | 1 hour | Verification votes |

**Response Headers:**
All rate-limited endpoints return these headers:
```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 195
X-RateLimit-Reset: 1706789400
```

When rate is exceeded, the `Retry-After` header is also set.

**Dual-Mode Operation:**
The rate limiter operates in two modes based on the `REDIS_URL` environment variable:

1. **In-Memory Mode** (default): Each server instance maintains independent counters. Only safe for single-instance deployments. Scaling to multiple instances without Redis effectively multiplies the rate limits.

2. **Redis Mode** (when `REDIS_URL` is set): Shared state across all instances. Required for horizontal scaling.

**Fail-Open Behavior:**
If Redis becomes unavailable during operation, requests are ALLOWED through with a warning. The response includes `X-RateLimit-Status: degraded`.

**False Positives:**
If legitimate users are being rate-limited:
1. Check if the client IP is being correctly identified (`trust proxy` is set to `1` for Cloud Run)
2. Check if multiple users share the same IP (corporate NAT)
3. Review rate limit logs:
   ```bash
   gcloud logging read 'textPayload=~"rate limit"' --freshness=1h
   ```

---

### 3.5 Request Timeouts

**Symptom:**
API returns HTTP 408 with:
```json
{
  "success": false,
  "error": {
    "message": "Request timed out",
    "code": "REQUEST_TIMEOUT",
    "statusCode": 408
  }
}
```

**Timeout Configuration** (from `packages/backend/src/middleware/requestTimeout.ts`):

| Middleware | Timeout | Applied To |
|---|---|---|
| `generalTimeout` | 30 seconds | All `/api/v1` routes |
| `searchTimeout` | 15 seconds | Provider search (`/providers/search`) |
| `adminTimeout` | 120 seconds | Admin endpoints (cleanup jobs, recalculation) |

**Common Causes:**
1. Complex database queries, especially unindexed searches
2. Database connection pool exhaustion (see section 2.4)
3. Network latency to Cloud SQL
4. Large result sets being serialized

**Fix:**
1. Check database query performance using `EXPLAIN ANALYZE`
2. Ensure indexes exist for common query patterns (the schema includes extensive indexes on `practice_locations`, `providers`, `insurance_plans`, and `provider_plan_acceptance`)
3. Use pagination to limit result sizes (default: 20 items, maximum: 100 items per `packages/backend/src/config/constants.ts`)

---

### 3.6 CAPTCHA Verification Failures

**Symptom:**
Verification or vote submissions return 400 or 503 errors related to CAPTCHA.

**How CAPTCHA Works:**
The middleware at `packages/backend/src/middleware/captcha.ts` uses Google reCAPTCHA v3 to protect the `POST /api/v1/verify` and `POST /api/v1/verify/:id/vote` endpoints.

**CAPTCHA is skipped when:**
- `NODE_ENV` is `development` or `test`
- `RECAPTCHA_SECRET_KEY` is not configured (logs a warning)

**Error: "CAPTCHA token required for verification submissions"**
The client must send the token in `req.body.captchaToken` or the `x-captcha-token` header.

**Error: "CAPTCHA verification failed"**
Google returned `success: false`. Check the error codes in the logs.

**Error: "Request blocked due to suspicious activity"**
The reCAPTCHA v3 score was below the threshold of 0.5 (configurable via `CAPTCHA_MIN_SCORE` in `packages/backend/src/config/constants.ts`).

**Error: "Security verification temporarily unavailable" (503)**
Google's reCAPTCHA API is unreachable and `CAPTCHA_FAIL_MODE=closed`.

**Fail-Open vs Fail-Closed** (controlled by `CAPTCHA_FAIL_MODE` env var):

| Mode | Behavior When Google API Unavailable | Mitigation |
|---|---|---|
| `open` (default) | Requests allowed through | Fallback rate limiting: 3 requests/hour (vs normal 10) |
| `closed` | All requests blocked (503) | None -- prioritizes security |

**Fallback Rate Limiting Headers** (in `open` mode when CAPTCHA API fails):
```
X-Security-Degraded: captcha-unavailable
X-Fallback-RateLimit-Limit: 3
X-Fallback-RateLimit-Remaining: 2
X-Fallback-RateLimit-Reset: 1706789400
```

**Monitoring:**
Watch for `[CAPTCHA] Google API error` in production logs to detect outages:
```bash
gcloud logging read 'textPayload=~"CAPTCHA Google API error"' --freshness=1h
```

**Bot Detection (Honeypot):**
In addition to CAPTCHA, the verify and vote endpoints use a honeypot field (`website`) defined in `packages/backend/src/middleware/honeypot.ts`. If a bot fills in this hidden field, the request receives a fake 200 OK response to avoid alerting the bot.

---

## 4. Deployment

### 4.1 Docker Build Failures

**Backend Dockerfile** (`packages/backend/Dockerfile`):

The build uses a multi-stage process:
1. Builder stage: Installs dependencies, builds shared package, generates Prisma client, builds backend
2. Runner stage: Copies built artifacts and production dependencies

**Common Issues:**

1. **Prisma generate fails:** Ensure the Prisma schema is valid. The Dockerfile runs:
   ```dockerfile
   RUN cd packages/backend && npx prisma generate
   ```
   The schema must be committed and the `binaryTargets` must include `native`:
   ```prisma
   generator client {
     provider      = "prisma-client-js"
     binaryTargets = ["native"]
     engineType    = "binary"
   }
   ```

2. **Native module compilation:** The Dockerfiles install `libc6-compat` and `openssl` for native module support:
   ```dockerfile
   RUN apk add --no-cache libc6-compat openssl openssl-dev
   ```

3. **Workspace issues:** The Dockerfile copies package files and creates workspace directories before `npm install`:
   ```dockerfile
   COPY package.json package-lock.json tsconfig.base.json ./
   COPY packages/shared/package.json ./packages/shared/
   COPY packages/backend/package.json ./packages/backend/
   RUN mkdir -p packages/shared packages/backend
   RUN npm install --force
   ```

**Frontend Dockerfile** (`packages/frontend/Dockerfile`):

1. **Build-time environment variables:** `NEXT_PUBLIC_*` variables must be provided as build arguments:
   ```dockerfile
   ARG NEXT_PUBLIC_API_URL
   ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
   ```

2. **Standalone output:** The frontend uses Next.js standalone output mode (`output: 'standalone'` in `next.config.js`). The runner stage copies from `.next/standalone`:
   ```dockerfile
   COPY --from=builder /app/packages/frontend/.next/standalone ./
   COPY --from=builder /app/packages/frontend/.next/static ./packages/frontend/.next/static
   COPY --from=builder /app/packages/frontend/public ./packages/frontend/public
   ```

---

### 4.2 Cloud Run Deployment

**Backend Deployment:**
```bash
gcloud run deploy verifymyprovider-api \
  --project=$PROJECT_ID \
  --region=us-central1 \
  --source=./packages/backend
```

**Frontend Deployment:**
```bash
gcloud run deploy verifymyprovider-web \
  --project=$PROJECT_ID \
  --region=us-central1 \
  --source=./packages/frontend
```

**Common Issues:**

1. **Port mismatch:** Both Dockerfiles use `PORT=8080` (Cloud Run default). Do not override this without updating Cloud Run configuration.

2. **Trust proxy:** The backend sets `app.set('trust proxy', 1)` for correct client IP detection behind Cloud Run's load balancer. Without this, rate limiting uses the load balancer's IP instead of the client's.

3. **Graceful shutdown:** The backend handles `SIGTERM` (sent by Cloud Run during shutdown) with a 10-second timeout:
   ```typescript
   const SHUTDOWN_TIMEOUT_MS = 10000;
   process.on('SIGTERM', () => shutdown('SIGTERM'));
   ```

**Rollback:**
```bash
# List revisions
gcloud run revisions list --service=verifymyprovider-api

# Route traffic to previous revision
gcloud run services update-traffic verifymyprovider-api \
  --to-revisions=verifymyprovider-api-00123-abc=100
```

---

### 4.3 Environment Variable Misconfiguration

**Critical Variables:**

| Variable | Required By | Impact if Missing |
|---|---|---|
| `DATABASE_URL` | Backend | Server cannot start, all requests fail with 503 |
| `NODE_ENV` | Both | Missing security headers, verbose error messages in production |
| `NEXT_PUBLIC_API_URL` | Frontend (build-time) | All API calls fail; must be set during `docker build` |
| `FRONTEND_URL` | Backend | CORS blocks frontend requests from Cloud Run URL |
| `ADMIN_SECRET` | Backend | Admin endpoints return 503 (intentional) |
| `RECAPTCHA_SECRET_KEY` | Backend | CAPTCHA skipped in production (warns in logs) |
| `REDIS_URL` | Backend | Falls back to in-memory rate limiting (single-instance only) |

**Build-Time vs Runtime:**
- `NEXT_PUBLIC_*` variables are baked into the Next.js bundle at build time. Changing them requires rebuilding the Docker image.
- All other variables are read at runtime and can be updated via Cloud Run environment configuration.

**Debugging:**
Check the root `.env.example` for a complete reference of all variables and their descriptions.

---

### 4.4 Cloud Scheduler Job Failures

**Symptom:**
Scheduled cleanup jobs are not running or returning errors.

**Setup Reference:** See `docs/CLOUD_SCHEDULER_SETUP.md` for full configuration.

**Common Failures:**

1. **401 Unauthorized:**
   - The `X-Admin-Secret` header in the scheduler job does not match the backend's `ADMIN_SECRET`
   - Check for whitespace or encoding issues in the header value
   - Verify the secret was updated after rotation

2. **Job Times Out:**
   - Default timeout is 300 seconds (5 minutes)
   - Increase with `--attempt-deadline` (max 30 minutes)
   - Reduce `batchSize` query parameter for cleanup jobs
   - Check backend logs for slow queries

3. **No Records Deleted:**
   - Run dry run first: `?dryRun=true`
   - Legacy records may have `expiresAt: null` (not subject to TTL cleanup)
   - Check database timezone settings

**Manually Trigger Jobs:**
```bash
# Run verification cleanup
gcloud scheduler jobs run cleanup-expired-verifications --location=us-central1

# Run sync log cleanup
gcloud scheduler jobs run cleanup-sync-logs --location=us-central1
```

**Check Job Status:**
```bash
gcloud scheduler jobs describe cleanup-expired-verifications \
  --location=us-central1 \
  --format='yaml(lastAttemptTime, scheduleTime, status)'
```

---

## 5. Production Operations

### 5.1 Health Check Diagnostics

**Public Health Check** (no authentication required):
```bash
curl https://api.verifymyprovider.com/health
```

This endpoint is placed BEFORE the rate limiter in the middleware chain (in `packages/backend/src/index.ts`) so monitoring tools are never blocked.

**Response Fields:**

```json
{
  "status": "ok",
  "timestamp": "2026-02-07T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 86400,
  "memory": {
    "heapUsed": 45,
    "heapTotal": 67,
    "unit": "MB"
  },
  "checks": {
    "database": "healthy"
  },
  "databaseResponseTime": "3ms",
  "cache": {
    "hits": 1234,
    "misses": 56,
    "size": 89,
    "mode": "memory",
    "hitRate": "95.7%"
  }
}
```

**Status Values:**
- `ok` -- All systems operational
- `degraded` -- Database unreachable (returns HTTP 503)

**Admin Health Check** (requires `X-Admin-Secret`):
```bash
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  https://api.verifymyprovider.com/api/v1/admin/health
```

Returns additional retention metrics for verification logs, sync logs, and vote logs.

---

### 5.2 Cache Issues

**Symptom:**
Stale data returned after updates, or low cache hit rate.

**Cache Architecture:**
The cache utility (`packages/backend/src/utils/cache.ts`) supports dual-mode operation:
- **In-memory** (default): Process-local Map with TTL tracking
- **Redis** (when `REDIS_URL` set): Distributed cache with `SETEX`

Default TTL is 5 minutes (300 seconds). Search results are cached with this TTL.

**When to Clear Cache:**
- After bulk data imports
- After schema migrations
- After manual data corrections
- After verification submissions (automated -- the verify route calls `invalidateSearchCache()`)

**Clear Cache:**
```bash
curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/cache/clear"
```

**View Cache Stats:**
```bash
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/cache/stats"
```

Response:
```json
{
  "success": true,
  "data": {
    "hits": 1234,
    "misses": 56,
    "sets": 200,
    "deletes": 10,
    "size": 89,
    "mode": "memory",
    "hitRate": "95.66%"
  }
}
```

**Cache Miss Detection:**
Search responses include an `X-Cache` header: `HIT` or `MISS`. A high miss rate may indicate:
1. Cache entries expiring too quickly (5-minute TTL)
2. Highly diverse search queries
3. Cache being cleared too frequently

---

### 5.3 Redis Connection Problems

**Symptom:**
Logs show `Redis unavailable, allowing request (fail-open)` or `Redis error`.

**Diagnostic Steps:**

1. **Check REDIS_URL is set:**
   ```bash
   gcloud run services describe verifymyprovider-api \
     --format='value(spec.template.spec.containers[0].env)'
   ```

2. **Check Redis instance status:**
   ```bash
   gcloud redis instances list --region=us-central1
   gcloud redis instances describe healthcareproviderdb-ratelimit --region=us-central1
   ```

3. **Test connectivity:**
   ```bash
   redis-cli -h REDIS_IP ping
   ```

4. **Check VPC connector** (required for Cloud Memorystore):
   ```bash
   gcloud compute networks vpc-access connectors describe redis-connector --region=us-central1
   ```

**Redis Connection Configuration** (from `packages/backend/src/lib/redis.ts`):

```typescript
redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,      // 10 second connection timeout
  commandTimeout: 5000,        // 5 second command timeout
  retryStrategy: (times) => {
    if (times > 5) return null; // Stop retrying after 5 attempts
    return Math.min(times * 200, 3000); // Exponential backoff up to 3s
  },
});
```

**Key Events to Monitor in Logs:**
- `Redis TCP connection established` -- Initial connection made
- `Redis ready - accepting commands` -- Redis is fully operational
- `Redis error` -- Connection error occurred
- `Redis connection closed` -- Connection was lost
- `Redis max reconnection attempts reached, giving up` -- Redis declared unavailable

---

### 5.4 High Error Rate Investigation

**Step-by-step procedure:**

1. **Check recent errors:**
   ```bash
   gcloud logging read "severity>=ERROR" --freshness=1h --limit=50
   ```

2. **Check service health:**
   ```bash
   curl "$API_BASE_URL/health"
   ```

3. **Check database connectivity:**
   ```bash
   gcloud sql instances describe $SQL_INSTANCE --format='value(state)'
   ```

4. **Check for rate limiting spikes:**
   ```bash
   gcloud logging read 'textPayload=~"rate limit"' --freshness=1h
   ```

5. **Check error distribution by status code** (using the admin health endpoint):
   ```bash
   curl -H "X-Admin-Secret: $ADMIN_SECRET" \
     "$API_BASE_URL/api/v1/admin/health"
   ```

6. **Clear cache if errors seem data-related:**
   ```bash
   curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" \
     "$API_BASE_URL/api/v1/admin/cache/clear"
   ```

**Error Response Format:**
All error responses follow a consistent format (from `packages/backend/src/middleware/errorHandler.ts`):

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error description",
    "code": "MACHINE_READABLE_CODE",
    "statusCode": 500,
    "requestId": "req-uuid-for-correlation"
  }
}
```

Use the `requestId` to correlate frontend errors with backend log entries.

---

### 5.5 Database Full

**Step-by-step procedure:**

1. **Check retention stats:**
   ```bash
   curl -H "X-Admin-Secret: $ADMIN_SECRET" \
     "$API_BASE_URL/api/v1/admin/retention/stats"
   ```

2. **Force cleanup of expired verifications:**
   ```bash
   curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" \
     "$API_BASE_URL/api/v1/admin/cleanup-expired"
   ```

3. **Force cleanup of old sync logs:**
   ```bash
   curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" \
     "$API_BASE_URL/api/v1/admin/cleanup/sync-logs"
   ```

4. **Check table sizes via SQL:**
   ```sql
   SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables
   ORDER BY pg_total_relation_size(relid) DESC;
   ```

**Retention Policies:**
- `verification_logs`: 6-month TTL via `expiresAt` column
- `provider_plan_acceptance`: 6-month TTL via `expiresAt` column
- `sync_logs`: 90-day retention (manual cleanup via admin endpoint)
- `vote_logs`: Follows plan acceptance TTL (cascade deletes)

---

### 5.6 Data Quality Investigation

**Process for investigating a reported data quality issue:**

1. **Look up the provider:**
   ```bash
   curl "$API_BASE_URL/api/v1/providers/PROVIDER_NPI"
   ```

2. **Check verification history for the provider-plan pair:**
   ```bash
   curl "$API_BASE_URL/api/v1/verify/PROVIDER_NPI/PLAN_ID"
   ```

3. **Check the DataQualityAudit table** (via SQL or Prisma Studio):
   ```sql
   SELECT * FROM data_quality_audit
   WHERE npi = 'PROVIDER_NPI'
   ORDER BY created_at DESC;
   ```

4. **Review confidence scoring:**
   The response from the verification pair endpoint includes a full confidence breakdown. Key fields:
   - `acceptanceStatus`: ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN
   - `confidenceScore`: 0-100
   - `verificationCount`: Number of community verifications
   - `lastVerified`: Timestamp of most recent verification

5. **Check Sybil attack prevention:**
   The system prevents duplicate verifications from the same IP or email within 30 days (configured by `SYBIL_PREVENTION_WINDOW_MS` in `packages/backend/src/config/constants.ts`). Indexes exist for Sybil detection:
   - `idx_vl_sybil_ip`: `(providerNpi, planId, sourceIp, createdAt)`
   - `idx_vl_sybil_email`: `(providerNpi, planId, submittedBy, createdAt)`

6. **Force confidence recalculation** (admin only):
   ```bash
   curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" \
     "$API_BASE_URL/api/v1/admin/recalculate-confidence?dryRun=true"
   ```

---

## 6. Error Code Reference

Quick reference for all error codes returned by the API.

### HTTP Status Codes

| Status | Code Constant | Typical Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod schema validation failed |
| 400 | (custom message) | Bad request parameters |
| 400 | `FOREIGN_KEY_VIOLATION` | Prisma P2003 -- referenced record not found |
| 401 | (Unauthorized) | Missing or invalid `X-Admin-Secret` |
| 403 | (Forbidden) | reCAPTCHA low score (possible bot) |
| 404 | `NOT_FOUND` | Resource not found (Prisma P2025 or AppError) |
| 404 | `ROUTE_NOT_FOUND` | Unmatched route |
| 408 | `REQUEST_TIMEOUT` | Request exceeded timeout limit |
| 409 | `DUPLICATE_ENTRY` | Prisma P2002 -- unique constraint violation |
| 413 | `PAYLOAD_TOO_LARGE` | Request body exceeds 100kb limit |
| 429 | (Too many requests) | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unhandled server error |
| 500 | `QUERY_ERROR` | Prisma P2010 -- raw query failed |
| 503 | `ADMIN_NOT_CONFIGURED` | `ADMIN_SECRET` not set |
| 503 | `DATABASE_UNAVAILABLE` | Cannot connect to database |
| 503 | `DATABASE_TIMEOUT` | Prisma P2024 -- connection pool exhausted |
| 503 | (Service unavailable) | CAPTCHA API unavailable (fail-closed mode) |

### Response Headers

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | Maximum requests allowed in window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `X-RateLimit-Status: degraded` | Rate limiter operating without Redis |
| `Retry-After` | Seconds to wait before retrying (on 429) |
| `X-Cache: HIT` / `X-Cache: MISS` | Whether search result was cached |
| `X-Security-Degraded: captcha-unavailable` | CAPTCHA API unreachable, fallback active |
| `X-Fallback-RateLimit-Limit` | Fallback rate limit (CAPTCHA fail-open) |
| `X-Fallback-RateLimit-Remaining` | Remaining requests under fallback limit |
| `X-Request-ID` | Unique request identifier for log correlation |

### Logging

**Log Levels** (configured via `LOG_LEVEL` env var, default: `info`):

| Level | Usage |
|---|---|
| `trace` | Detailed debugging |
| `debug` | Cache hits/misses, query details |
| `info` | Request completion, startup, Redis status |
| `warn` | CORS blocks, CAPTCHA failures, rate limits, degraded service |
| `error` | Database errors, Redis errors, unhandled exceptions |
| `fatal` | Critical startup failures |

**Structured Logging:**
The backend uses Pino for structured JSON logging (`packages/backend/src/utils/logger.ts`):
- Development: Pretty-printed with colors via `pino-pretty`
- Production: JSON format with ISO timestamps for Cloud Logging ingestion

**Log Correlation:**
Every request gets a unique `requestId` (via `packages/backend/src/middleware/requestId.ts`) that appears in all log entries and error responses. Use this ID to trace a single request through the entire middleware and route chain.

---

## Quick Reference: Common Commands

```bash
# Start local development (database + backend + frontend)
npm run docker:dev          # Start PostgreSQL
npm run dev                 # Start backend + frontend concurrently

# Database operations
npm run db:generate         # Regenerate Prisma client
npm run db:push             # Push schema changes to database
npm run db:migrate          # Run migrations
npm run db:studio           # Open Prisma Studio GUI

# Build and test
npm run build               # Build all packages (shared -> backend -> frontend)
npm run test                # Run backend tests
npm run clean               # Clean all build artifacts

# Check health (local)
curl http://localhost:3001/health

# Check health (production)
curl https://api.verifymyprovider.com/health

# Admin operations (requires ADMIN_SECRET)
curl -H "X-Admin-Secret: $SECRET" http://localhost:3001/api/v1/admin/health
curl -H "X-Admin-Secret: $SECRET" http://localhost:3001/api/v1/admin/cache/stats
curl -X POST -H "X-Admin-Secret: $SECRET" http://localhost:3001/api/v1/admin/cache/clear
curl -X POST -H "X-Admin-Secret: $SECRET" "http://localhost:3001/api/v1/admin/cleanup-expired?dryRun=true"
```

---

## Related Documentation

- **Runbook:** `docs/RUNBOOK.md` -- Operational procedures and incident response
- **Scaling Guide:** `docs/SCALING.md` -- Horizontal scaling and Redis setup
- **Cloud Scheduler:** `docs/CLOUD_SCHEDULER_SETUP.md` -- Automated job configuration
- **Environment Variables:** `docs/ENVIRONMENT.md` -- Complete variable reference
- **Logging:** `docs/operations/LOGGING.md` -- Cloud Logging setup and queries
- **Secret Rotation:** `docs/SECRET-ROTATION.md` -- Secret management procedures
- **Log Retention:** `docs/LOG-RETENTION-POLICY.md` -- Data retention policies
