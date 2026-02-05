# Deployment Guide

**Last Updated:** 2026-02-05
**Generated From:** prompts/15-deployment-guide.md

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Development Setup](#2-local-development-setup)
3. [Docker Usage](#3-docker-usage)
4. [CI/CD Pipeline](#4-cicd-pipeline)
5. [Cloud Run Production Deployment](#5-cloud-run-production-deployment)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Secrets Management](#7-secrets-management)
8. [Rollback and Hotfix Procedures](#8-rollback-and-hotfix-procedures)
9. [Health Checks and Monitoring](#9-health-checks-and-monitoring)

---

## 1. Prerequisites

### Required Software

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 20.0.0 | Runtime for backend and frontend |
| npm | >= 9.x | Package manager (ships with Node) |
| Docker | >= 24.x | Containerization |
| Docker Compose | >= 2.x | Multi-container orchestration |
| Git | Latest | Version control |

### Optional (for production deployment)

| Tool | Purpose |
|------|---------|
| `gcloud` CLI | Google Cloud SDK for manual deployments |
| `gh` CLI | GitHub CLI for workflow management |

### Windows ARM64 Note

If developing on Windows ARM64 with Node.js v24+, Next.js 14.x native SWC binaries are incompatible. The project includes a postinstall patch script at `packages/frontend/scripts/patch-next-swc.js` that automatically enables the WASM fallback. The `@next/swc-wasm-nodejs` package is included as a dev dependency in the frontend workspace.

---

## 2. Local Development Setup

### 2.1 Clone and Install

```bash
git clone https://github.com/breilly1296/HealthcareProviderDB-.git
cd HealthcareProviderDB
npm install
```

npm workspaces will install dependencies for all three packages (`backend`, `frontend`, `shared`).

**Important:** Never add `next` to the root `package.json`. The frontend workspace pins `next@^14.2.35`, and a root-level version will override it, causing SWC version mismatches.

### 2.2 Start Development Database

The project provides a dev-only Docker Compose file that runs PostgreSQL without containerizing the application code:

```bash
npm run docker:dev
```

This starts a PostgreSQL 15 Alpine container:

- **Container name:** `healthcaredb-postgres-dev`
- **Port:** 5432 (mapped to host)
- **Credentials:** `postgres` / `postgres`
- **Database:** `healthcare_providers`
- **Volume:** `postgres_data_dev` (persists data across restarts)
- **Health check:** `pg_isready -U postgres` every 10 seconds

To stop the database:

```bash
npm run docker:dev:down
```

### 2.3 Configure Environment

```bash
# Copy the example env file
cp .env.example .env
```

For local development, the defaults in `.env.example` are sufficient:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/healthcare_providers"
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

### 2.4 Initialize the Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (creates tables)
npm run db:push

# Optionally seed with test data
npm run db:seed
```

### 2.5 Start Development Servers

```bash
npm run dev
```

This command:
1. Builds the `@healthcareproviderdb/shared` package first
2. Starts the backend (`tsx watch`) and frontend (`next dev`) concurrently via `concurrently`

| Service | URL | Hot Reload |
|---------|-----|------------|
| Backend API | http://localhost:3001 | Yes (tsx watch) |
| Frontend App | http://localhost:3000 | Yes (Next.js Fast Refresh) |
| API Health | http://localhost:3001/health | - |
| Prisma Studio | `npm run db:studio` | - |

### 2.6 Workspace Scripts Reference

All workspace scripts are accessible from the root `package.json`:

| Script | Description |
|--------|-------------|
| `npm run dev` | Start both backend and frontend in dev mode |
| `npm run dev:backend` | Start backend only |
| `npm run dev:frontend` | Start frontend only |
| `npm run build` | Build all workspaces |
| `npm run build:shared` | Build shared types package |
| `npm run build:backend` | Build backend only |
| `npm run build:frontend` | Build frontend only |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:seed` | Seed database with test data |
| `npm run test` | Run backend tests |
| `npm run lint` | Lint all workspaces |
| `npm run clean` | Clean build artifacts |

---

## 3. Docker Usage

### 3.1 Full-Stack Docker Compose

The `docker-compose.yml` file runs the entire stack (database, backend, frontend) in containers:

```bash
# Build all images
npm run docker:build

# Start all services
npm run docker:up

# Stop all services
npm run docker:down
```

**Services:**

| Service | Container Name | Internal Port | External Port | Image |
|---------|---------------|---------------|---------------|-------|
| db | healthcaredb-postgres | 5432 | 5432 | postgres:15-alpine |
| backend | healthcaredb-backend | 8080 | 3001 | Custom (Dockerfile) |
| frontend | healthcaredb-frontend | 8080 | 3000 | Custom (Dockerfile) |

**Startup order:** The backend waits for the database health check (`service_healthy`). The frontend depends on the backend being up.

### 3.2 Backend Dockerfile

**File:** `packages/backend/Dockerfile`

Multi-stage build with two stages:

**Build stage (`builder`):**
- Base: `node:20-alpine`
- Installs `libc6-compat`, `openssl`, `openssl-dev` for native modules
- Copies workspace package files, runs `npm install --force`
- Builds shared package, generates Prisma client, builds TypeScript

**Production stage (`runner`):**
- Base: `node:20-alpine`
- Creates non-root user `expressjs` (UID 1001) in `nodejs` group
- Installs production dependencies only (`npm install --omit=dev --force`)
- Copies built files and Prisma client from builder
- Runs as non-root user
- Exposes port 8080 (Cloud Run default)
- Health check: `wget http://localhost:8080/health` every 30 seconds
- Entrypoint: `node packages/backend/dist/index.js`

### 3.3 Frontend Dockerfile

**File:** `packages/frontend/Dockerfile`

Multi-stage build with three stages:

**Dependencies stage (`deps`):**
- Base: `node:20-alpine`
- Installs all dependencies for the workspace

**Build stage (`builder`):**
- Copies dependencies from deps stage
- Accepts build args: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`
- Builds shared package, then Next.js with standalone output
- Telemetry disabled via `NEXT_TELEMETRY_DISABLED=1`

**Production stage (`runner`):**
- Base: `node:20-alpine`
- Creates non-root user `nextjs` (UID 1001) in `nodejs` group
- Copies Next.js standalone build, static assets, and public folder
- Runs as non-root user
- Hostname set to `0.0.0.0` for container networking
- Exposes port 8080
- Health check: `wget http://localhost:8080/` every 30 seconds
- Entrypoint: `node packages/frontend/server.js`

### 3.4 Security Hardening

Both Dockerfiles follow container security best practices:

- **Non-root execution:** Dedicated service users (`expressjs` / `nextjs`)
- **Minimal base images:** Alpine Linux variants
- **Multi-stage builds:** Build tools not present in production images
- **Health checks:** Built-in Docker HEALTHCHECK directives
- **Production deps only:** `--omit=dev` in production stage (backend)
- **File ownership:** `chown -R` to service user before switching

---

## 4. CI/CD Pipeline

### 4.1 Overview

**File:** `.github/workflows/deploy.yml`

The CI/CD pipeline is a GitHub Actions workflow triggered on:
- Push to `main` branch (automatic deployment)
- Manual trigger via `workflow_dispatch`

### 4.2 Pipeline Architecture

```
Push to main
    |
    v
deploy-backend (Job 1)
    |-- Checkout code
    |-- Authenticate to GCP (Workload Identity Federation)
    |-- Configure Docker for Artifact Registry
    |-- Build backend Docker image
    |-- Push to Artifact Registry (SHA tag + latest tag)
    |-- Deploy to Cloud Run
    |-- Output backend URL
    |
    v
deploy-frontend (Job 2, depends on deploy-backend)
    |-- Checkout code
    |-- Authenticate to GCP
    |-- Configure Docker for Artifact Registry
    |-- Build frontend Docker image (with backend URL as build arg)
    |-- Push to Artifact Registry (SHA tag + latest tag)
    |-- Deploy to Cloud Run
    |
    v
summary (Job 3, runs always)
    |-- Print deployment status table to GitHub Step Summary
```

### 4.3 Authentication

The pipeline uses **Workload Identity Federation** (keyless authentication) -- no long-lived service account keys are stored in GitHub.

**Required GitHub Secrets:**

| Secret | Description |
|--------|-------------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Provider resource name |
| `GCP_SERVICE_ACCOUNT` | GCP service account email |
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `FRONTEND_URL` | Production frontend URL (for backend CORS) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics API key |

**Required GitHub Actions Permissions:**

```yaml
permissions:
  contents: read     # Read repository code
  id-token: write    # Generate OIDC tokens for WIF
```

### 4.4 Image Tagging Strategy

Each build produces two tags in Artifact Registry:

- **SHA tag:** `us-central1-docker.pkg.dev/{project}/verifymyprovider/{service}:{git-sha}` -- immutable, used for deployment
- **Latest tag:** `us-central1-docker.pkg.dev/{project}/verifymyprovider/{service}:latest` -- mutable, points to most recent build

### 4.5 Deployment Order

The frontend deployment depends on the backend completing first (`needs: deploy-backend`) because:
1. The frontend build requires `NEXT_PUBLIC_API_URL` which includes the backend's Cloud Run URL
2. The API URL is baked into the Next.js static build at compile time

---

## 5. Cloud Run Production Deployment

### 5.1 Service Configuration

**Region:** `us-central1`

| Setting | Backend | Frontend |
|---------|---------|----------|
| Service Name | `verifymyprovider-backend` | `verifymyprovider-frontend` |
| Port | 8080 | 8080 |
| Memory | 512Mi | 512Mi |
| CPU | 1 | 1 |
| Min Instances | 0 (scale to zero) | 0 (scale to zero) |
| Max Instances | 10 | 10 |
| Concurrency | 80 requests/instance | 80 requests/instance |
| Authentication | Allow unauthenticated | Allow unauthenticated |

### 5.2 Backend Cloud Run Flags

```
--allow-unauthenticated
--port=8080
--memory=512Mi
--cpu=1
--min-instances=0
--max-instances=10
--concurrency=80
--add-cloudsql-instances=verifymyprovider-prod:us-central1:verifymyprovider-db
--remove-secrets=ADMIN_SECRET
```

The `--add-cloudsql-instances` flag enables the Cloud SQL Auth Proxy sidecar, providing a secure connection to the PostgreSQL database without exposing it publicly.

### 5.3 Environment Variables (Production)

**Backend (set via CI/CD):**

| Variable | Source | Value |
|----------|--------|-------|
| `NODE_ENV` | env_vars | `production` |
| `FRONTEND_URL` | GitHub Secret | Cloud Run frontend URL |
| `DATABASE_URL` | GCP Secret Manager | PostgreSQL connection string |

**Frontend (set via CI/CD):**

| Variable | Source | Value |
|----------|--------|-------|
| `NODE_ENV` | env_vars | `production` |
| `ANTHROPIC_API_KEY` | GCP Secret Manager | Claude API key (for insurance card OCR) |
| `NEXT_PUBLIC_API_URL` | Build arg | Backend Cloud Run URL + `/api/v1` |
| `NEXT_PUBLIC_POSTHOG_KEY` | Build arg | PostHog analytics key |

### 5.4 Database (Cloud SQL)

- **Instance:** `verifymyprovider-prod:us-central1:verifymyprovider-db`
- **Engine:** PostgreSQL
- **Database name:** `verifymyprovider`
- **Connection:** Via Cloud SQL Auth Proxy (Unix socket in Cloud Run)

---

## 6. Environment Variables Reference

### Development

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5432/healthcare_providers` | PostgreSQL connection string |
| `PORT` | No | `3001` | Backend server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:3001/api/v1` | API URL for frontend |
| `NPI_DATA_URL` | No | CMS URL | NPI bulk data download URL |
| `RECAPTCHA_SECRET_KEY` | No | - | Google reCAPTCHA v3 secret (skipped in dev) |
| `REDIS_URL` | No | - | Redis connection (falls back to in-memory) |
| `ADMIN_SECRET` | No | - | Admin endpoint authentication secret |
| `CAPTCHA_FAIL_MODE` | No | `open` | Behavior when reCAPTCHA API fails (`open` or `closed`) |

### Production (Additional / Override)

| Variable | Required | Source | Description |
|----------|----------|--------|-------------|
| `DATABASE_URL` | Yes | Secret Manager | Cloud SQL connection string |
| `FRONTEND_URL` | Yes | GitHub Secrets | Frontend URL for CORS |
| `ANTHROPIC_API_KEY` | Yes | Secret Manager | Claude API key for OCR |
| `NEXT_PUBLIC_POSTHOG_KEY` | Yes | GitHub Secrets | PostHog analytics key |
| `GCP_PROJECT_ID` | Yes | GitHub Secrets | Google Cloud project ID |
| `GCP_REGION` | Yes | Workflow env | `us-central1` |

---

## 7. Secrets Management

### GCP Secret Manager

The following secrets are stored in Google Cloud Secret Manager and injected into Cloud Run services at runtime:

| Secret Name | Used By | Description |
|-------------|---------|-------------|
| `DATABASE_URL` | Backend | PostgreSQL connection string with Cloud SQL socket path |
| `ANTHROPIC_API_KEY` | Frontend | Anthropic Claude API key for insurance card OCR |

Secrets are referenced in the Cloud Run deployment configuration as `SECRET_NAME:latest`, which always pulls the most recent version.

### GitHub Actions Secrets

Used during CI/CD only -- not available at application runtime:

| Secret | Description |
|--------|-------------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF provider for keyless auth |
| `GCP_SERVICE_ACCOUNT` | Service account for deployment |
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `FRONTEND_URL` | Frontend URL for CORS configuration |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog API key (baked into build) |

---

## 8. Rollback and Hotfix Procedures

### Rolling Back on Cloud Run

Cloud Run keeps revision history. To roll back to a previous revision:

```bash
# List recent revisions
gcloud run revisions list --service=verifymyprovider-backend --region=us-central1

# Route 100% traffic to a previous revision
gcloud run services update-traffic verifymyprovider-backend \
  --region=us-central1 \
  --to-revisions=REVISION_NAME=100
```

Repeat for the frontend service if needed.

### Deploying a Hotfix

1. Create a fix on the `main` branch (or merge a hotfix branch into `main`)
2. Push to `main` -- the CI/CD pipeline triggers automatically
3. The pipeline builds new images, tags them with the commit SHA, and deploys to Cloud Run
4. Verify via the health endpoint: `GET /health`

For urgent rollbacks without code changes, use the Cloud Run revision routing above.

### Redeploying a Specific Commit

```bash
# Trigger the workflow manually on a specific commit
gh workflow run deploy.yml --ref <commit-sha>
```

Or use `workflow_dispatch` from the GitHub Actions UI.

---

## 9. Health Checks and Monitoring

### Health Check Endpoint

**Endpoint:** `GET /health`

The backend exposes a comprehensive health check (not rate-limited) that returns:

```json
{
  "status": "ok",
  "timestamp": "2026-02-05T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600.5,
  "memory": {
    "heapUsed": 45,
    "heapTotal": 65,
    "unit": "MB"
  },
  "checks": {
    "database": "healthy"
  },
  "databaseResponseTime": "2ms",
  "cache": {
    "hits": 150,
    "misses": 30,
    "size": 42,
    "mode": "memory",
    "hitRate": "83.3%"
  }
}
```

| Status | HTTP Code | Meaning |
|--------|-----------|---------|
| `ok` | 200 | All systems operational |
| `degraded` | 503 | Database unreachable |

### Docker Health Checks

Both containers include built-in Docker HEALTHCHECK directives:

- **Backend:** `wget http://localhost:8080/health` every 30s (3 retries, 10s timeout)
- **Frontend:** `wget http://localhost:8080/` every 30s (3 retries, 10s timeout)
- **Database:** `pg_isready -U postgres` every 10s (5 retries, 5s timeout)

### Admin Health Endpoint

**Endpoint:** `GET /api/v1/admin/health` (requires `X-Admin-Secret` header)

Returns extended metrics including cache statistics and data retention metrics (verification logs, sync logs, vote logs).

### Post-Deployment Verification

After a deployment, verify the following:

1. **Health check:** `curl https://<backend-url>/health` returns `status: ok`
2. **Database connectivity:** Health check shows `database: healthy`
3. **API version:** `curl https://<backend-url>/` returns the API info endpoint
4. **Frontend loads:** Navigate to the frontend URL in a browser
5. **Search works:** Perform a provider search to confirm end-to-end functionality

### Current Gaps

The following are not yet implemented:

- Staging environment for pre-production testing
- Automated rollback on failed health checks
- Post-deploy smoke test suite
- Alerting on degraded health status
