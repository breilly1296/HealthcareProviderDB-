# Environment & Secrets Review

> **Generated:** 2026-02-07
> **Project:** VerifyMyProvider (HealthcareProviderDB)
> **Priority:** Critical (security)

---

## Table of Contents

1. [Files Reviewed](#files-reviewed)
2. [Complete Environment Variable Inventory](#complete-environment-variable-inventory)
3. [Secret Storage Locations](#secret-storage-locations)
4. [Code-Level Analysis](#code-level-analysis)
5. [Docker Compose Environment](#docker-compose-environment)
6. [CI/CD Secret Injection](#cicd-secret-injection)
7. [Security Checklist](#security-checklist)
8. [Open Questions & Recommendations](#open-questions--recommendations)

---

## Files Reviewed

| File | Key Variables Found |
|------|-------------------|
| `.env.example` (root) | `DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `FRONTEND_URL`, `REDIS_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `CAPTCHA_FAIL_MODE`, `ANTHROPIC_API_KEY`, `NPI_DATA_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `LOG_LEVEL` |
| `packages/frontend/.env.example` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `ANTHROPIC_API_KEY` |
| `packages/backend/src/index.ts` | `PORT`, `NODE_ENV`, `FRONTEND_URL` |
| `packages/backend/src/config/constants.ts` | (No direct `process.env` reads; provides defaults for CAPTCHA settings) |
| `packages/backend/src/middleware/captcha.ts` | `RECAPTCHA_SECRET_KEY`, `CAPTCHA_FAIL_MODE`, `NODE_ENV` |
| `packages/backend/src/routes/admin.ts` | `ADMIN_SECRET` |
| `packages/backend/src/lib/redis.ts` | `REDIS_URL` |
| `packages/backend/src/lib/prisma.ts` | `NODE_ENV` (implicit `DATABASE_URL` via Prisma) |
| `packages/backend/src/utils/logger.ts` | `NODE_ENV`, `LOG_LEVEL` |
| `packages/backend/src/middleware/errorHandler.ts` | `NODE_ENV` |
| `packages/backend/prisma/schema.prisma` | `DATABASE_URL` |
| `packages/frontend/src/components/PostHogProvider.tsx` | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` |
| `packages/frontend/src/lib/api.ts` | `NEXT_PUBLIC_API_URL`, `NODE_ENV` |
| `packages/frontend/src/app/sitemap.ts` | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL` |
| `packages/frontend/src/app/api/insurance-card/extract/route.ts` | `ANTHROPIC_API_KEY` |
| `.github/workflows/deploy.yml` | GCP secrets, `FRONTEND_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `ANTHROPIC_API_KEY` |
| `.github/workflows/deploy-staging.yml` | Same as `deploy.yml` (staging-specific service names) |
| `docker-compose.yml` | `DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL` |
| `docker-compose.dev.yml` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (database container only) |
| `scripts/create-anthropic-secret.sh` | `ANTHROPIC_API_KEY` (GCP Secret Manager provisioning) |

---

## Complete Environment Variable Inventory

### Database

| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `DATABASE_URL` | **Yes** | None | Backend (Prisma `schema.prisma`, `prisma.ts`) | PostgreSQL connection string. Referenced in `packages/backend/prisma/schema.prisma` line 9: `url = env("DATABASE_URL")`. In production: Cloud Run Secret Manager `DATABASE_URL:latest`. Locally: `.env` file. Example: `postgresql://postgres:postgres@localhost:5432/verifymyprovider` |

**Code reference** (`packages/backend/prisma/schema.prisma`, line 7-10):
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

### Server Configuration

| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `PORT` | No | `3001` | Backend (`index.ts` line 20) | Server listen port. Cloud Run overrides to `8080` via deploy flags. |
| `NODE_ENV` | No | `development` | Backend + Frontend | Environment mode: `development`, `test`, or `production`. Controls CAPTCHA skip, Prisma log verbosity, error detail exposure, CORS localhost allowance, logger transport format. |
| `CORS_ORIGIN` | No | None | Backend (legacy, `docker-compose.yml`) | Legacy CORS origin. Hardcoded origins in `index.ts` lines 23-28 take priority. Still referenced in `docker-compose.yml`. |
| `FRONTEND_URL` | No | None | Backend (`index.ts` line 27) | Cloud Run frontend URL, dynamically added to the CORS whitelist. Set via `deploy.yml` `env_vars` from GitHub Actions secret `${{ secrets.FRONTEND_URL }}`. |
| `LOG_LEVEL` | No | `info` | Backend (`logger.ts` line 12) | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |

**Code reference** (`packages/backend/src/index.ts`, lines 20-33):
```typescript
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS: string[] = [
  'https://verifymyprovider.com',
  'https://www.verifymyprovider.com',
  'https://verifymyprovider-frontend-741434145252.us-central1.run.app',
  process.env.FRONTEND_URL,  // Additional Cloud Run frontend URL from env
].filter((origin): origin is string => Boolean(origin));

if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:3001');
}
```

**Code reference** (`packages/backend/src/utils/logger.ts`, lines 3, 12):
```typescript
const isDevelopment = process.env.NODE_ENV === 'development';
// ...
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
```

---

### Security -- CAPTCHA (Google reCAPTCHA v3)

| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `RECAPTCHA_SECRET_KEY` | Prod only | None | Backend (`captcha.ts` line 47) | Server-side secret for reCAPTCHA v3 validation. If missing, CAPTCHA is skipped with a warning log. In production: Cloud Run Secret Manager `RECAPTCHA_SECRET_KEY:latest`. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Prod only | None | Frontend | Client-side reCAPTCHA site key (public, safe to expose). Referenced in `.env.example` but **not currently used in any frontend source code** (no `grep` matches in `packages/frontend/src`). |
| `CAPTCHA_FAIL_MODE` | No | `open` | Backend (`captcha.ts` line 52) | `open` = allow requests with fallback rate limiting if Google API fails. `closed` = block all requests if API fails. |
| `CAPTCHA_MIN_SCORE` | No | `0.5` | Backend (`constants.ts` line 52) | Minimum reCAPTCHA score (0.0-1.0) to pass. Below threshold = likely bot. **Note: currently a code constant, not env-overridable.** |
| `CAPTCHA_API_TIMEOUT_MS` | No | `5000` | Backend (`constants.ts` line 57) | Timeout for Google reCAPTCHA API calls. **Note: currently a code constant, not env-overridable.** |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | No | `3` | Backend (`constants.ts` line 62) | Max requests/hour per IP when CAPTCHA API is unavailable (fail-open mode). **Note: currently a code constant, not env-overridable.** |
| `CAPTCHA_FALLBACK_WINDOW_MS` | No | `3600000` | Backend (`constants.ts` line 67) | Time window for fallback rate limiting (1 hour). **Note: currently a code constant, not env-overridable.** |

**Important distinction:** Only `RECAPTCHA_SECRET_KEY` and `CAPTCHA_FAIL_MODE` are actual environment variables read via `process.env`. The other four CAPTCHA settings (`CAPTCHA_MIN_SCORE`, `CAPTCHA_API_TIMEOUT_MS`, `CAPTCHA_FALLBACK_MAX_REQUESTS`, `CAPTCHA_FALLBACK_WINDOW_MS`) are hardcoded constants in `packages/backend/src/config/constants.ts` and are **not** configurable via environment at runtime.

**Code reference** (`packages/backend/src/middleware/captcha.ts`, lines 47-52):
```typescript
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

type FailMode = 'open' | 'closed';
const CAPTCHA_FAIL_MODE: FailMode = (process.env.CAPTCHA_FAIL_MODE as FailMode) || 'open';
```

**Code reference** (`packages/backend/src/middleware/captcha.ts`, lines 119-132 -- graceful degradation):
```typescript
export async function verifyCaptcha(req: Request, res: Response, next: NextFunction) {
  // Skip in development/test environments
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return next();
  }

  // Skip if CAPTCHA not configured (but log warning)
  if (!RECAPTCHA_SECRET) {
    logger.warn({
      endpoint: req.path,
      method: req.method,
    }, 'CAPTCHA not configured - RECAPTCHA_SECRET_KEY missing, skipping verification');
    return next();
  }
```

---

### Security -- Admin

| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `ADMIN_SECRET` | Prod only | None | Backend (`admin.ts` line 23) | Secret for `X-Admin-Secret` header on admin endpoints. If not set, all admin endpoints return 503 (disabled gracefully). In production: Cloud Run Secret Manager `ADMIN_SECRET:latest`. |

**Code reference** (`packages/backend/src/routes/admin.ts`, lines 22-56):
```typescript
function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;

  // If ADMIN_SECRET is not configured, disable admin endpoints gracefully
  if (!adminSecret) {
    logger.warn('ADMIN_SECRET not configured - admin endpoints disabled');
    res.status(503).json({
      success: false,
      error: {
        message: 'Admin endpoints not configured. Set ADMIN_SECRET environment variable to enable.',
        code: 'ADMIN_NOT_CONFIGURED',
        statusCode: 503,
      },
    });
    return;
  }

  const providedSecret = req.headers['x-admin-secret'];

  // Use timing-safe comparison to prevent timing attacks
  const providedBuffer = Buffer.from(String(providedSecret || ''));
  const secretBuffer = Buffer.from(adminSecret);

  const isValid =
    providedBuffer.length === secretBuffer.length &&
    timingSafeEqual(providedBuffer, secretBuffer);

  if (!isValid) {
    throw AppError.unauthorized('Invalid or missing admin secret');
  }

  next();
}
```

The `timingSafeEqual` function from Node.js `crypto` module is used at line 49 to prevent timing attacks on the admin secret comparison. The length check at line 47-48 is necessary because `timingSafeEqual` requires buffers of equal length.

---

### Caching -- Redis

| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `REDIS_URL` | No | None | Backend (`redis.ts` line 40) | Redis connection URL. If not set, the system falls back to in-memory rate limiting and caching. The singleton pattern ensures only one connection attempt per process. Example: `redis://localhost:6379` or `redis://10.0.0.3:6379`. |

**Code reference** (`packages/backend/src/lib/redis.ts`, lines 33-44):
```typescript
export function getRedisClient(): Redis | null {
  if (connectionAttempted) {
    return redisClient;
  }
  connectionAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info('REDIS_URL not configured - Redis features disabled');
    return null;
  }
```

Connection settings include retry strategy with exponential backoff (max 5 retries), 10-second connect timeout, and 5-second command timeout.

---

### External APIs

| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `ANTHROPIC_API_KEY` | No | None | Frontend API route (`route.ts` lines 35, 316) | Claude API key for insurance card OCR extraction. Feature disabled if not set (returns 500 with user-friendly message). In production: Cloud Run Secret Manager `ANTHROPIC_API_KEY:latest`. |

**Code reference** (`packages/frontend/src/app/api/insurance-card/extract/route.ts`, lines 34-36):
```typescript
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

**Code reference** (`packages/frontend/src/app/api/insurance-card/extract/route.ts`, lines 316-323 -- graceful degradation):
```typescript
if (!process.env.ANTHROPIC_API_KEY) {
  const response: InsuranceCardExtractionResponse = {
    success: false,
    error: 'Anthropic API key not configured',
    userMessage: 'The image scanning service is not available. Please enter your insurance information manually.',
  };
  return NextResponse.json(response, { status: 500 });
}
```

A helper script at `scripts/create-anthropic-secret.sh` automates creating/updating this secret in GCP Secret Manager.

---

### Analytics

| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `NEXT_PUBLIC_POSTHOG_KEY` | No | None | Frontend (`PostHogProvider.tsx` line 10) | PostHog project API key. Analytics disabled entirely if not set (conditional init). Passed as Docker build-time arg in `deploy.yml`. |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | `https://us.i.posthog.com` | Frontend (`PostHogProvider.tsx` line 14) | PostHog API host. Defaults to US PostHog cloud. |

**Code reference** (`packages/frontend/src/components/PostHogProvider.tsx`, lines 9-23):
```typescript
if (typeof window !== 'undefined') {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage',
      autocapture: false,
      disable_session_recording: true,
      opt_out_capturing_by_default: true,
    });
  }
}
```

Privacy-conscious defaults: `autocapture` is off, session recording is disabled, and users are opted out of capturing by default. The pageview tracker (line 36) strips sensitive query params (`npi`, `planId`, `name`) before sending to PostHog.

---

### Frontend

| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `NEXT_PUBLIC_API_URL` | **Yes** | `http://localhost:3001/api/v1` | Frontend (`lib/api.ts` line 17, `sitemap.ts` line 2, `provider/[npi]/page.tsx` line 5) | Backend API base URL. Build-time arg baked into the Next.js bundle. In production, set dynamically from backend deploy output URL via `deploy.yml`. |
| `NEXT_PUBLIC_SITE_URL` | No | `https://verifymyprovider.com` | Frontend (`sitemap.ts` line 1) | Site URL for sitemap generation. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Prod only | None | Frontend (not yet used in source) | Client-side reCAPTCHA site key. Declared in `.env.example` but **no matching `process.env` references found in frontend source code** as of this review. |

**Code reference** (`packages/frontend/src/lib/api.ts`, line 17):
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
```

**Code reference** (`packages/frontend/src/app/sitemap.ts`, lines 1-2):
```typescript
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://verifymyprovider.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
```

---

### GCP / Deployment

| Variable | Required | Where Used | Description |
|----------|----------|------------|-------------|
| `GCP_PROJECT_ID` | CI/CD only | `deploy.yml`, `deploy-staging.yml` | GCP project ID (GitHub Actions secret). Used for Artifact Registry paths and Cloud SDK setup. |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | CI/CD only | `deploy.yml`, `deploy-staging.yml` | Workload Identity Federation provider (GitHub Actions secret). Enables keyless authentication. |
| `GCP_SERVICE_ACCOUNT` | CI/CD only | `deploy.yml`, `deploy-staging.yml` | GCP service account for deployment (GitHub Actions secret). |
| `GCP_REGION` | CI/CD only | `deploy.yml`, `deploy-staging.yml` | Deployment region. Hardcoded to `us-central1` in both workflow files (line 10). |
| `NPI_DATA_URL` | No | Reference only (`.env.example` line 58) | NPI data download URL. Currently unused in application code (manual download process). |

---

### Workflow-Hardcoded Variables

The following values are hardcoded in the CI/CD workflows rather than sourced from environment variables:

| Value | Location | Purpose |
|-------|----------|---------|
| `us-central1` | `deploy.yml` line 10 | GCP region |
| `verifymyprovider-backend` | `deploy.yml` line 11 | Backend Cloud Run service name |
| `verifymyprovider-frontend` | `deploy.yml` line 12 | Frontend Cloud Run service name |
| `verifymyprovider-backend-staging` | `deploy-staging.yml` line 11 | Staging backend service name |
| `verifymyprovider-frontend-staging` | `deploy-staging.yml` line 12 | Staging frontend service name |
| `verifymyprovider-prod:us-central1:verifymyprovider-db` | `deploy.yml` line 108 | Cloud SQL instance connection name |

---

## Secret Storage Locations

### Local Development

- **Primary:** `.env` file at project root (gitignored via `.gitignore` lines 13-16)
- **Copy from:** `.env.example` and fill in values
- **Minimum required locally:** `DATABASE_URL`, `NEXT_PUBLIC_API_URL` (both have working defaults in `.env.example`)
- **Optional locally:** CAPTCHA, PostHog, Anthropic, Redis, ADMIN_SECRET (all degrade gracefully)

**Gitignore coverage** (`.gitignore`, lines 12-19):
```
# Environment files
.env
.env.local
.env.production
.env.*.local

# Secrets / keys
*.pem
*.key
```

### Production (Cloud Run)

Secrets are injected via `.github/workflows/deploy.yml`:

**Backend Cloud Run service** (deploy.yml lines 109-115):
```yaml
env_vars: |
  NODE_ENV=production
  FRONTEND_URL=${{ secrets.FRONTEND_URL }}
secrets: |
  DATABASE_URL=DATABASE_URL:latest
  ADMIN_SECRET=ADMIN_SECRET:latest
  RECAPTCHA_SECRET_KEY=RECAPTCHA_SECRET_KEY:latest
```

**Frontend Cloud Run service** (deploy.yml lines 173-197):
```yaml
# Build-time args (baked into Next.js bundle)
build-args: |
  NEXT_PUBLIC_API_URL=${{ needs.deploy-backend.outputs.backend_url }}/api/v1
  NEXT_PUBLIC_POSTHOG_KEY=${{ secrets.NEXT_PUBLIC_POSTHOG_KEY }}

# Runtime env vars
env_vars: |
  NODE_ENV=production

# Runtime secrets from GCP Secret Manager
secrets: |
  ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest
```

### GitHub Actions Secrets

| Secret | Purpose | Used In |
|--------|---------|---------|
| `GCP_PROJECT_ID` | GCP project identifier | `deploy.yml`, `deploy-staging.yml` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation (keyless auth) | `deploy.yml`, `deploy-staging.yml` |
| `GCP_SERVICE_ACCOUNT` | GCP deploy service account | `deploy.yml`, `deploy-staging.yml` |
| `FRONTEND_URL` | Frontend Cloud Run URL for CORS | `deploy.yml` (backend env_vars), `deploy-staging.yml` |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog API key (passed as build arg) | `deploy.yml` (frontend build-args), `deploy-staging.yml` |

### GCP Secret Manager

| Secret Name | Used By | Injection Method |
|-------------|---------|-----------------|
| `DATABASE_URL` | Backend Cloud Run | Runtime secret mount (`DATABASE_URL:latest`) |
| `ADMIN_SECRET` | Backend Cloud Run | Runtime secret mount (`ADMIN_SECRET:latest`) |
| `RECAPTCHA_SECRET_KEY` | Backend Cloud Run | Runtime secret mount (`RECAPTCHA_SECRET_KEY:latest`) |
| `ANTHROPIC_API_KEY` | Frontend Cloud Run | Runtime secret mount (`ANTHROPIC_API_KEY:latest`) |

---

## Code-Level Analysis

### Graceful Degradation Pattern

Every optional secret in this project follows a consistent graceful degradation pattern. When a secret is missing, the corresponding feature is disabled rather than crashing:

| Variable | Missing Behavior | Code Location |
|----------|-----------------|---------------|
| `RECAPTCHA_SECRET_KEY` | CAPTCHA skipped, warning logged | `captcha.ts` lines 126-132 |
| `ADMIN_SECRET` | Admin endpoints return 503 | `admin.ts` lines 25-36 |
| `REDIS_URL` | Falls back to in-memory rate limiting | `redis.ts` lines 41-43 |
| `ANTHROPIC_API_KEY` | Insurance card extraction returns 500 with user message | `route.ts` lines 316-323 |
| `NEXT_PUBLIC_POSTHOG_KEY` | Analytics disabled (PostHog not initialized) | `PostHogProvider.tsx` lines 10-12 |
| `FRONTEND_URL` | Only hardcoded CORS origins used | `index.ts` lines 23-28 (filtered by Boolean) |

### Security Patterns Observed

1. **Timing-safe secret comparison:** `ADMIN_SECRET` uses `crypto.timingSafeEqual()` (admin.ts line 49) to prevent timing attacks.

2. **No secrets in error responses:** Error handler in `errorHandler.ts` (lines 201, 238) strips detailed error messages in production (`NODE_ENV === 'production'`), preventing accidental secret leakage in stack traces.

3. **CAPTCHA fail-open with mitigation:** When the reCAPTCHA API is unavailable and `CAPTCHA_FAIL_MODE=open`, fallback rate limiting (3 req/hour vs normal limits) mitigates abuse. Response headers (`X-Security-Degraded`, `X-Fallback-RateLimit-*`) signal degraded security to monitoring systems.

4. **Prisma client singleton:** `prisma.ts` prevents multiple Prisma instances in development using a global variable pattern, which avoids accidentally leaking connections.

5. **Build-time vs runtime separation:** `NEXT_PUBLIC_*` variables are correctly handled as build-time args in the Docker build step, while secrets like `ANTHROPIC_API_KEY` are injected at runtime.

---

## Docker Compose Environment

### Production-like (`docker-compose.yml`)

```yaml
services:
  db:
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres     # Default dev credentials
      POSTGRES_DB: healthcare_providers

  backend:
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/healthcare_providers
      PORT: 8080
      NODE_ENV: production
      CORS_ORIGIN: http://localhost:3000

  frontend:
    build:
      args:
        NEXT_PUBLIC_API_URL: http://localhost:3001/api/v1
    environment:
      PORT: 8080
```

### Development (`docker-compose.dev.yml`)

Only runs the PostgreSQL database container. Backend and frontend run locally via `npm run dev`.

```yaml
services:
  db:
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: healthcare_providers
```

**Note:** The `docker-compose.yml` uses hardcoded default credentials (`postgres:postgres`) which are appropriate for local development but must never be used in production. The production `DATABASE_URL` is injected via GCP Secret Manager.

---

## CI/CD Secret Injection

### Authentication Flow

Both `deploy.yml` and `deploy-staging.yml` use **Workload Identity Federation** for GCP authentication, which avoids storing long-lived service account keys:

```yaml
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
    service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}
```

### Build-time vs Runtime Secret Injection

| Injection Type | Variables | Mechanism |
|---------------|-----------|-----------|
| **Build-time args** | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY` | Docker `build-args` in `deploy.yml` lines 173-175. Baked into Next.js JavaScript bundle at build. |
| **Runtime env vars** | `NODE_ENV`, `FRONTEND_URL` | Cloud Run `env_vars` in `deploy.yml` lines 109-111. Available at container start. |
| **Runtime secrets** | `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `ANTHROPIC_API_KEY` | Cloud Run `secrets` in `deploy.yml` lines 112-115, 196-197. Mounted from GCP Secret Manager at container start. |

### Staging vs Production

Both workflows (`deploy.yml` on `main`, `deploy-staging.yml` on `staging`) share the same secret injection patterns and reference the same GitHub Actions secrets. The key differences are:

| Aspect | Production | Staging |
|--------|-----------|---------|
| Branch trigger | `main` | `staging` |
| Service names | `verifymyprovider-backend` | `verifymyprovider-backend-staging` |
| Max instances | 10 | 2 |
| Docker tags | `${{ github.sha }}`, `latest` | `staging-${{ github.sha }}`, `staging-latest` |

**Concern:** Staging and production share the same GCP Secret Manager secrets. There are no environment-specific secret versions (e.g., `DATABASE_URL_STAGING` vs `DATABASE_URL`). If staging needs a different database, this would need to be addressed.

### Smoke Tests

Both workflows include post-deployment smoke tests:
- Backend: `curl` to `/health` endpoint, expects HTTP 200
- Frontend: `curl` to root URL, expects HTTP 200

---

## Security Checklist

### Secret Security

- [x] **No secrets hardcoded in source code** -- Verified via grep across the entire codebase. All sensitive values are read from `process.env`.
- [x] **`.env` files in `.gitignore`** -- `.env`, `.env.local`, `.env.production`, `.env.*.local` all covered (`.gitignore` lines 13-16).
- [x] **`.env.example` exists with placeholder values** -- Both root and `packages/frontend/.env.example` exist with comments and placeholders.
- [x] **Production secrets in GCP Secret Manager** -- `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `ANTHROPIC_API_KEY` all stored in GCP Secret Manager and mounted via Cloud Run.
- [x] **Timing-safe comparison for `ADMIN_SECRET`** -- Uses `crypto.timingSafeEqual()` in `admin.ts` line 49.
- [x] **CAPTCHA key validated server-side only** -- `RECAPTCHA_SECRET_KEY` is used only in backend `captcha.ts`. Public site key pattern is correctly separated.
- [x] **Workload Identity Federation** -- No long-lived GCP service account keys in GitHub Actions. Uses OIDC-based keyless auth.
- [x] **Docker build secrets not leaked** -- `NEXT_PUBLIC_*` build args are intentionally public. Sensitive secrets are runtime-only.
- [x] **Error messages sanitized in production** -- `errorHandler.ts` strips detailed error messages when `NODE_ENV=production`.
- [ ] **Secret rotation procedure not documented** -- No runbook for rotating `DATABASE_URL`, `ADMIN_SECRET`, or other secrets.
- [ ] **No automated secret scanning in CI** -- No gitleaks, truffleHog, or similar tool in the CI pipeline. Only `npm audit --audit-level=critical` for dependency vulnerabilities.
- [ ] **No secret expiration/rotation alerts** -- GCP Secret Manager supports version expiration but it is not configured.

### Environment Configuration

- [x] **All env vars have sensible defaults for development** -- `PORT=3001`, `NODE_ENV=development`, `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1` all have working defaults.
- [x] **Optional features degrade gracefully** -- CAPTCHA, PostHog, Redis, Anthropic, ADMIN_SECRET all skip/disable when their env vars are missing.
- [x] **Production-specific values set via Cloud Run deployment** -- `NODE_ENV=production` and all secrets injected through deployment workflow.
- [x] **Root `.env.example` is comprehensive** -- Updated to include all 17 environment variables with comments and section headers.
- [x] **`NEXT_PUBLIC_` prefix correctly used** -- All client-exposed frontend variables use the `NEXT_PUBLIC_` prefix as required by Next.js.

### CI/CD Secret Injection

- [x] **Workload Identity Federation (no long-lived keys)** -- Both deploy workflows use `google-github-actions/auth@v2` with OIDC.
- [x] **Secrets passed via GitHub Actions secrets** -- GCP credentials, FRONTEND_URL, PostHog key all stored as GitHub secrets.
- [x] **Build args for public frontend env vars** -- `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_POSTHOG_KEY` correctly passed as build-args.
- [x] **Cloud Run Secret Manager for sensitive backend vars** -- `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY` mounted as secrets.
- [x] **Post-deployment smoke tests** -- Both backend and frontend get health checked after deployment.
- [ ] **No secret expiration/rotation alerts** -- No automated monitoring for secret staleness.
- [ ] **No staging-specific secrets** -- Staging reuses the same secret names as production.

---

## Open Questions & Recommendations

### Questions

1. **`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` unused?** -- This variable is declared in `.env.example` but no `process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY` reference was found in the frontend source code. Is reCAPTCHA client-side integration pending, or was it implemented differently?

2. **Staging vs production database isolation?** -- Both `deploy.yml` and `deploy-staging.yml` reference `DATABASE_URL=DATABASE_URL:latest` from the same GCP Secret Manager. Are staging and production using the same database, or is there a separate staging secret version?

3. **`ADMIN_SECRET` provisioning** -- The deploy workflow injects `ADMIN_SECRET=ADMIN_SECRET:latest` from GCP Secret Manager. Is there a provisioning script (like `create-anthropic-secret.sh`) for creating this secret?

4. **`CORS_ORIGIN` deprecation** -- This variable is only used in `docker-compose.yml` and is not read by the application code (the CORS origins are hardcoded in `index.ts`). Should it be removed from `docker-compose.yml` or should the backend read it?

5. **CAPTCHA constants not env-overridable** -- `CAPTCHA_MIN_SCORE`, `CAPTCHA_API_TIMEOUT_MS`, `CAPTCHA_FALLBACK_MAX_REQUESTS`, and `CAPTCHA_FALLBACK_WINDOW_MS` are hardcoded in `constants.ts`. Should these be configurable via environment variables for operational flexibility?

### Recommendations

1. **Add automated secret scanning** -- Integrate `gitleaks` or `truffleHog` into the CI pipeline test job to prevent accidental secret commits. This is a low-effort, high-value addition:
   ```yaml
   - name: Secret scanning
     uses: gitleaks/gitleaks-action@v2
   ```

2. **Document secret rotation procedures** -- Create a runbook for rotating each production secret, including `DATABASE_URL` (PostgreSQL password rotation), `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, and `ANTHROPIC_API_KEY`.

3. **Separate staging secrets** -- Create distinct GCP Secret Manager secrets for staging (e.g., `DATABASE_URL_STAGING`) to ensure full environment isolation.

4. **Remove `CORS_ORIGIN` from docker-compose.yml** -- Since the backend does not read `CORS_ORIGIN` from `process.env`, this environment variable in `docker-compose.yml` has no effect and may cause confusion.

5. **Consider making CAPTCHA thresholds env-configurable** -- Wrapping the constants in `constants.ts` with `process.env` fallbacks would allow tuning CAPTCHA behavior without code changes:
   ```typescript
   export const CAPTCHA_MIN_SCORE = parseFloat(process.env.CAPTCHA_MIN_SCORE || '0.5');
   ```

6. **Implement `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`** -- If reCAPTCHA v3 is active on the backend, the frontend should be sending tokens. Either implement the client-side integration or remove the env var placeholder to avoid confusion.

---

## Summary of All Environment Variables

| # | Variable | Sensitivity | Required | Package | Runtime/Build |
|---|----------|-------------|----------|---------|--------------|
| 1 | `DATABASE_URL` | **SECRET** | Yes | Backend | Runtime |
| 2 | `PORT` | Public | No | Backend | Runtime |
| 3 | `NODE_ENV` | Public | No | Both | Runtime |
| 4 | `CORS_ORIGIN` | Public | No | (Unused) | -- |
| 5 | `FRONTEND_URL` | Semi-private | No | Backend | Runtime |
| 6 | `LOG_LEVEL` | Public | No | Backend | Runtime |
| 7 | `RECAPTCHA_SECRET_KEY` | **SECRET** | Prod | Backend | Runtime |
| 8 | `CAPTCHA_FAIL_MODE` | Public | No | Backend | Runtime |
| 9 | `ADMIN_SECRET` | **SECRET** | Prod | Backend | Runtime |
| 10 | `REDIS_URL` | Semi-private | No | Backend | Runtime |
| 11 | `ANTHROPIC_API_KEY` | **SECRET** | No | Frontend | Runtime |
| 12 | `NEXT_PUBLIC_POSTHOG_KEY` | Public | No | Frontend | Build |
| 13 | `NEXT_PUBLIC_POSTHOG_HOST` | Public | No | Frontend | Build |
| 14 | `NEXT_PUBLIC_API_URL` | Public | Yes | Frontend | Build |
| 15 | `NEXT_PUBLIC_SITE_URL` | Public | No | Frontend | Build |
| 16 | `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Public | No | Frontend | Build |
| 17 | `NPI_DATA_URL` | Public | No | Reference | -- |
| 18 | `GCP_PROJECT_ID` | Semi-private | CI/CD | Workflows | CI |
| 19 | `GCP_WORKLOAD_IDENTITY_PROVIDER` | Semi-private | CI/CD | Workflows | CI |
| 20 | `GCP_SERVICE_ACCOUNT` | Semi-private | CI/CD | Workflows | CI |
| 21 | `GCP_REGION` | Public | CI/CD | Workflows | CI (hardcoded) |
