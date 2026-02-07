# VerifyMyProvider -- Deployment Guide

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Local Development Setup](#3-local-development-setup)
4. [Docker Containerization](#4-docker-containerization)
5. [CI/CD Pipeline (GitHub Actions)](#5-cicd-pipeline-github-actions)
6. [Google Cloud Platform Production Deployment](#6-google-cloud-platform-production-deployment)
7. [Environment Variables Reference](#7-environment-variables-reference)
8. [Secrets Management](#8-secrets-management)
9. [Deployment Procedures](#9-deployment-procedures)
10. [Rollback Procedures](#10-rollback-procedures)
11. [Health Checks and Monitoring](#11-health-checks-and-monitoring)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Architecture Overview

VerifyMyProvider is a monorepo with npm workspaces, deployed as two independent services on Google Cloud Run backed by a Cloud SQL PostgreSQL database.

```
                   +---------------------+
                   |   GitHub Actions     |
                   |   (CI/CD Pipeline)   |
                   +---------+-----------+
                             |
                   push to main / manual dispatch
                             |
              +--------------+--------------+
              |                             |
     +--------v--------+         +---------v--------+
     | Artifact Registry|         | Artifact Registry |
     | backend image    |         | frontend image    |
     +--------+--------+         +---------+---------+
              |                             |
     +--------v--------+         +---------v---------+
     |   Cloud Run      |         |   Cloud Run        |
     |   verifymyprovider|        |   verifymyprovider  |
     |   -backend       |         |   -frontend         |
     |   (Express)      |         |   (Next.js)         |
     |   Port 8080      |         |   Port 8080         |
     +--------+---------+         +--------------------+
              |
     +--------v--------+
     |   Cloud SQL      |
     |   PostgreSQL 15  |
     |   (verifymyprovider-db) |
     +------------------+
```

### Service Summary

| Component | Technology | Port | Cloud Run Service Name |
|-----------|-----------|------|----------------------|
| Backend API | Express + Prisma + TypeScript | 8080 (prod) / 3001 (dev) | `verifymyprovider-backend` |
| Frontend | Next.js 14.2 + React 18 + TailwindCSS | 8080 (prod) / 3000 (dev) | `verifymyprovider-frontend` |
| Database | PostgreSQL 15 (Cloud SQL) | 5432 | `verifymyprovider-db` |
| Shared Library | TypeScript types and utilities | N/A | N/A |
| Registry | GCP Artifact Registry | N/A | `verifymyprovider` |

### Monorepo Workspace Structure

```
HealthcareProviderDB/
  packages/
    backend/       @healthcareproviderdb/backend   (Express API)
    frontend/      @healthcareproviderdb/frontend   (Next.js app)
    shared/        @healthcareproviderdb/shared     (shared types)
  docker-compose.yml          (full-stack)
  docker-compose.dev.yml      (dev database only)
  .github/workflows/deploy.yml (CI/CD)
  package.json                (root workspace config)
  tsconfig.base.json          (shared TypeScript config)
  .env.example                (environment variable reference)
  .dockerignore               (Docker build exclusions)
```

---

## 2. Prerequisites

### For Local Development

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | >= 20.0.0 | Specified in root `package.json` `engines` field |
| npm | >= 9.x | Ships with Node 20+ |
| Docker | Latest stable | For local PostgreSQL via Docker Compose |
| Docker Compose | v2+ | Bundled with Docker Desktop |
| Git | Latest | Source control |

> **Windows ARM64 Note:** Native SWC binaries for Next.js 14.x are incompatible with Node.js v24+ on Windows ARM64. If using Node 24+ on Windows ARM64, the `postinstall` script at `packages/frontend/scripts/patch-next-swc.js` automatically patches the WASM fallback. The frontend also includes `@next/swc-wasm-nodejs` as a devDependency for this purpose.

### For Production Deployment

| Requirement | Notes |
|-------------|-------|
| GCP Project | With billing enabled |
| gcloud CLI | Authenticated with appropriate permissions |
| GitHub Repository | Connected to GitHub Actions |
| GCP Service Account | For CI/CD with Workload Identity Federation |
| Cloud SQL Instance | PostgreSQL 15 in `us-central1` |
| Artifact Registry | Docker repository named `verifymyprovider` |
| Secret Manager | For `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `ANTHROPIC_API_KEY` |

---

## 3. Local Development Setup

### 3.1 Clone and Install

```bash
# Clone the repository
git clone https://github.com/breilly1296/HealthcareProviderDB-.git
cd HealthcareProviderDB

# Install all workspace dependencies
npm install
```

This installs dependencies for all three workspaces (`packages/backend`, `packages/frontend`, `packages/shared`) plus the root.

### 3.2 Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env
```

For local development, the defaults in `.env.example` are sufficient:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/healthcare_providers
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

Optional variables for local development:

```env
# Admin routes (generate with: openssl rand -base64 32)
ADMIN_SECRET=your-local-admin-secret

# Insurance card OCR feature
ANTHROPIC_API_KEY=sk-ant-...

# reCAPTCHA (disabled in dev if not set)
RECAPTCHA_SECRET_KEY=your-recaptcha-secret
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your-recaptcha-site-key

# Redis (falls back to in-memory rate limiting if not set)
REDIS_URL=redis://localhost:6379
```

### 3.3 Start the Development Database

```bash
# Start PostgreSQL 15 in Docker
npm run docker:dev

# This runs: docker compose -f docker-compose.dev.yml up -d
# Creates container: healthcaredb-postgres-dev
# PostgreSQL at localhost:5432, user/pass: postgres/postgres, db: healthcare_providers
```

Verify the database is running:

```bash
docker ps
# Should show healthcaredb-postgres-dev with status "Up" and "(healthy)"
```

### 3.4 Initialize the Database Schema

```bash
# Generate the Prisma client
npm run db:generate

# Push the schema to the database (no migrations, direct sync)
npm run db:push

# Alternatively, use migrations for tracked schema changes:
npm run db:migrate
```

The Prisma schema is located at `packages/backend/prisma/schema.prisma`. It uses:
- `@@map("table_name")` for PascalCase model names mapped to snake_case PostgreSQL tables
- `@map("column_name")` for camelCase field names mapped to snake_case columns
- `@default(cuid())` for application-generated text primary keys on `verification_logs` and `vote_logs`

### 3.5 Seed the Database (Optional)

```bash
npm run db:seed
```

This runs `packages/backend/scripts/seed.ts`, which creates:
- 20 sample Florida healthcare providers across specialties (Endocrinology, Rheumatology, Orthopedics, Internal Medicine, Family Medicine, Geriatrics)
- 5 insurance plans (Florida Blue PPO/HMO, UnitedHealthcare, Aetna, Cigna)
- Provider-plan acceptance records with realistic confidence scores
- Sample verification log entries
- A sync log entry

### 3.6 Start Development Servers

```bash
# Start both backend and frontend concurrently
npm run dev
```

This command:
1. Builds the shared package first (`npm run build:shared`)
2. Starts the backend in watch mode with `tsx watch` on port 3001
3. Starts the Next.js frontend dev server on port 3000

Individual services can also be started separately:

```bash
npm run dev:backend    # Backend only (port 3001)
npm run dev:frontend   # Frontend only (port 3000)
```

### 3.7 Verify Local Setup

| Check | URL | Expected |
|-------|-----|----------|
| Backend health | http://localhost:3001/health | `{"status":"ok","checks":{"database":"healthy"}}` |
| Backend API info | http://localhost:3001/ | JSON with API endpoint documentation |
| Provider search | http://localhost:3001/api/v1/providers/search?lastName=Rodriguez | Provider results |
| Frontend | http://localhost:3000 | Next.js application |

### 3.8 Prisma Studio (Database GUI)

```bash
npm run db:studio
# Opens a web-based database browser at http://localhost:5555
```

### 3.9 Stop Development

```bash
# Stop the Docker database
npm run docker:dev:down

# This runs: docker compose -f docker-compose.dev.yml down
# Data persists in the postgres_data_dev volume
```

---

## 4. Docker Containerization

### 4.1 Backend Dockerfile

**File:** `packages/backend/Dockerfile`

The backend uses a multi-stage build:

**Build stage (`node:20-alpine AS builder`):**
1. Installs native module dependencies (`libc6-compat`, `openssl`, `openssl-dev`)
2. Copies root `package.json`, `package-lock.json`, and `tsconfig.base.json` for workspace resolution
3. Copies `packages/shared/package.json` and `packages/backend/package.json`
4. Runs `npm install --force` to install all dependencies
5. Copies source code for `shared` and `backend`
6. Builds shared package, generates Prisma client, builds backend TypeScript

**Production stage (`node:20-alpine AS runner`):**
1. Creates a non-root user `expressjs` (UID 1001) in the `nodejs` group (GID 1001)
2. Installs only production dependencies (`npm install --omit=dev --force`)
3. Copies built artifacts: `shared/dist`, `backend/dist`, `backend/prisma`, and `.prisma`/`@prisma` from node_modules
4. Sets ownership to the non-root user
5. Runs as `expressjs` user
6. Exposes port 8080 (Cloud Run default)
7. Includes a health check: `wget --spider http://localhost:8080/health` every 30s
8. Entry point: `node packages/backend/dist/index.js`

### 4.2 Frontend Dockerfile

**File:** `packages/frontend/Dockerfile`

The frontend also uses a multi-stage build:

**Build stage (`node:20-alpine AS builder`):**
1. Installs `libc6-compat` for native modules
2. Same workspace-aware dependency installation pattern as backend
3. Builds shared package first
4. Accepts build args: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_POSTHOG_KEY` (baked into the build since Next.js inlines `NEXT_PUBLIC_*` at build time)
5. Disables Next.js telemetry (`NEXT_TELEMETRY_DISABLED=1`)
6. Runs `next build` which produces a standalone output (configured in `next.config.js` with `output: 'standalone'`)

**Production stage (`node:20-alpine AS runner`):**
1. Creates a non-root user `nextjs` (UID 1001) in the `nodejs` group (GID 1001)
2. Copies the Next.js standalone build, static assets, and public directory
3. Sets `HOSTNAME=0.0.0.0` for Cloud Run compatibility
4. Exposes port 8080
5. Includes a health check: `wget --spider http://localhost:8080/` every 30s
6. Entry point: `node packages/frontend/server.js` (the standalone Next.js server)

### 4.3 Docker Compose (Full-Stack Local)

**File:** `docker-compose.yml`

Runs the complete stack locally in containers:

```yaml
services:
  db:          # PostgreSQL 15 Alpine, port 5432
  backend:     # Express API, port 3001 -> 8080
  frontend:    # Next.js, port 3000 -> 8080
```

Key configuration:
- Backend depends on `db` with `condition: service_healthy` (waits for PostgreSQL to be ready)
- Frontend depends on backend
- `NEXT_PUBLIC_API_URL` is set as a build arg pointing to `http://localhost:3001/api/v1`
- Database credentials are `postgres:postgres` with database `healthcare_providers`

```bash
# Build all containers
npm run docker:build

# Start the full stack
npm run docker:up

# Stop the full stack
npm run docker:down
```

### 4.4 Docker Compose (Dev Database Only)

**File:** `docker-compose.dev.yml`

Runs only PostgreSQL for local development while running backend and frontend natively:

```bash
npm run docker:dev       # Start database
npm run docker:dev:down  # Stop database
```

Uses a separate volume (`postgres_data_dev`) to isolate dev data from full-stack Docker data.

### 4.5 .dockerignore

**File:** `.dockerignore`

Excludes from Docker build context:
- `node_modules/` and build outputs (`dist/`, `.next/`, `out/`)
- Environment files (`.env`, `.env.*`) except `.env.example`
- IDE files, OS files, logs
- Test files (`__tests__/`, `*.test.ts`, `jest.config.js`, `playwright*`)
- Documentation (`*.md` except `README.md`)
- Data files (`data/`, `*.csv`)

---

## 5. CI/CD Pipeline (GitHub Actions)

### 5.1 Workflow File

**File:** `.github/workflows/deploy.yml`

**Trigger:** Push to `main` branch or manual `workflow_dispatch`.

**Region:** `us-central1`

### 5.2 Pipeline Stages

```
+----------+     +------------------+     +-------------------+     +---------+
|   test   | --> | deploy-backend   | --> | deploy-frontend   | --> | summary |
+----------+     +------------------+     +-------------------+     +---------+
```

#### Stage 1: Test (`test`)

Runs on `ubuntu-latest`:

1. **Checkout** code
2. **Setup Node.js 20** with npm cache
3. **Install** dependencies with `npm ci`
4. **Security audit** with `npm audit --audit-level=critical`
5. **Run backend tests** with `npm test` in `packages/backend`
6. **Build backend** to verify compilation succeeds

#### Stage 2: Deploy Backend (`deploy-backend`)

Requires: `test` to pass.
Permissions: `contents: read`, `id-token: write` (for Workload Identity Federation).

1. **Authenticate to GCP** via Workload Identity Federation (no service account keys)
   - Uses `google-github-actions/auth@v2`
   - Requires secrets: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`
2. **Set up Cloud SDK** with `GCP_PROJECT_ID`
3. **Configure Docker** for Artifact Registry (`us-central1-docker.pkg.dev`)
4. **Build and push** Docker image using `docker/build-push-action@v6`:
   - Context: repository root (`.`)
   - Dockerfile: `./packages/backend/Dockerfile`
   - Tags: `<registry>/<project>/verifymyprovider/verifymyprovider-backend:<sha>` and `:latest`
   - Uses GitHub Actions cache (`type=gha`) for layer caching
5. **Deploy to Cloud Run** using `google-github-actions/deploy-cloudrun@v2`:
   - Image tagged with commit SHA (immutable)
   - Resource limits: 512Mi memory, 1 CPU
   - Scaling: min 0, max 10 instances (scale-to-zero enabled)
   - Concurrency: 80 requests per instance
   - Cloud SQL connection: `verifymyprovider-prod:us-central1:verifymyprovider-db`
   - Environment variables: `NODE_ENV=production`, `FRONTEND_URL` from secrets
   - Secrets from GCP Secret Manager: `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`
   - Allows unauthenticated access (`--allow-unauthenticated`)
6. **Smoke test**: Waits 10 seconds, then curls `/health` endpoint; fails the pipeline if HTTP status is not 200
7. **Output**: Backend URL is stored as `backend_url` for the frontend stage

#### Stage 3: Deploy Frontend (`deploy-frontend`)

Requires: `deploy-backend` to succeed (needs the backend URL).
Permissions: `contents: read`, `id-token: write`.

1. Same GCP authentication and Docker setup as backend
2. **Build and push** Docker image:
   - Dockerfile: `./packages/frontend/Dockerfile`
   - Tags: `<registry>/<project>/verifymyprovider/verifymyprovider-frontend:<sha>` and `:latest`
   - **Build args** (baked into the Next.js build):
     - `NEXT_PUBLIC_API_URL=${{ needs.deploy-backend.outputs.backend_url }}/api/v1`
     - `NEXT_PUBLIC_POSTHOG_KEY` from secrets
   - Uses GitHub Actions cache
3. **Deploy to Cloud Run**:
   - Same resource limits as backend (512Mi, 1 CPU, 0-10 instances, concurrency 80)
   - Secrets from GCP Secret Manager: `ANTHROPIC_API_KEY` (for insurance card OCR API route)
   - Allows unauthenticated access
4. **Smoke test**: Waits 10 seconds, curls the root URL; fails if status is not 200

#### Stage 4: Summary (`summary`)

Runs `if: always()` (even if previous stages fail). Outputs a GitHub Step Summary table with service names, statuses, and URLs.

### 5.3 Required GitHub Actions Secrets

| Secret Name | Description |
|-------------|-------------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Provider resource name |
| `GCP_SERVICE_ACCOUNT` | Service account email for deployments |
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `FRONTEND_URL` | Production frontend URL (for backend CORS) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics project key |

> **Note:** `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, and `ANTHROPIC_API_KEY` are stored in GCP Secret Manager, not GitHub Secrets. Cloud Run services mount them at runtime.

---

## 6. Google Cloud Platform Production Deployment

### 6.1 GCP Services Used

| Service | Purpose |
|---------|---------|
| **Cloud Run** | Serverless container hosting for backend and frontend |
| **Cloud SQL** | Managed PostgreSQL 15 database |
| **Artifact Registry** | Docker image storage |
| **Secret Manager** | Secure storage for database credentials, API keys |
| **Workload Identity Federation** | Keyless authentication from GitHub Actions |

### 6.2 Cloud Run Configuration

Both services share the following production configuration (from `deploy.yml`):

```
--port=8080
--memory=512Mi
--cpu=1
--min-instances=0          # Scale-to-zero for cost savings
--max-instances=10
--concurrency=80           # 80 concurrent requests per instance
--allow-unauthenticated    # Public-facing services
```

**Backend-specific:**
- `--add-cloudsql-instances=verifymyprovider-prod:us-central1:verifymyprovider-db` connects to Cloud SQL via the built-in Cloud SQL Auth Proxy sidecar

### 6.3 Cloud SQL Setup

The production database runs on Google Cloud SQL PostgreSQL:

- **Instance name:** `verifymyprovider-db`
- **Project:** `verifymyprovider-prod`
- **Region:** `us-central1`
- **Connection:** Via Cloud SQL Auth Proxy (automatically injected by Cloud Run with the `--add-cloudsql-instances` flag)

The `DATABASE_URL` secret in Secret Manager uses the Unix socket connection format for Cloud SQL Auth Proxy:

```
postgresql://USER:PASSWORD@localhost/DATABASE?host=/cloudsql/PROJECT:REGION:INSTANCE
```

### 6.4 Workload Identity Federation

The CI/CD pipeline uses Workload Identity Federation for keyless authentication between GitHub Actions and GCP. This eliminates long-lived service account key files.

**How it works:**
1. GitHub Actions requests an OIDC token from GitHub's identity provider
2. The `google-github-actions/auth@v2` action exchanges this token with GCP
3. GCP validates the token against the configured Workload Identity Pool
4. A short-lived access token is returned for the service account

**Required GCP resources:**
- Workload Identity Pool
- Workload Identity Provider (configured for GitHub)
- Service account with roles:
  - `roles/run.admin` (deploy Cloud Run services)
  - `roles/artifactregistry.writer` (push Docker images)
  - `roles/iam.serviceAccountUser` (act as the service account)
  - `roles/secretmanager.secretAccessor` (read secrets)
  - `roles/cloudsql.client` (connect to Cloud SQL)

### 6.5 Artifact Registry

Docker images are stored in GCP Artifact Registry:

- **Registry host:** `us-central1-docker.pkg.dev`
- **Repository:** `<project-id>/verifymyprovider`
- **Images:**
  - `verifymyprovider-backend:<sha>` and `verifymyprovider-backend:latest`
  - `verifymyprovider-frontend:<sha>` and `verifymyprovider-frontend:latest`

Each deployment tags images with the Git commit SHA for traceability and `:latest` for convenience.

---

## 7. Environment Variables Reference

### 7.1 Backend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5432/verifymyprovider` | PostgreSQL connection string |
| `PORT` | No | `3001` (dev) / `8080` (prod) | Server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin (dev only; production uses hardcoded list) |
| `FRONTEND_URL` | No | `http://localhost:3000` | Frontend URL for CORS and absolute URL generation |
| `REDIS_URL` | No | (none) | Redis connection for rate limiting; falls back to in-memory |
| `ADMIN_SECRET` | No | (none) | Secret for `/admin` routes; generate with `openssl rand -base64 32` |
| `RECAPTCHA_SECRET_KEY` | No | (none) | Google reCAPTCHA v3 server-side secret |
| `CAPTCHA_FAIL_MODE` | No | `open` | `open` (allow with rate limit) or `closed` (block) when reCAPTCHA is unavailable |
| `LOG_LEVEL` | No | `info` | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

### 7.2 Frontend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:3001/api/v1` | Backend API base URL (baked into build) |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | (none) | PostHog analytics project key (baked into build) |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | `https://us.i.posthog.com` | PostHog ingestion host |
| `NEXT_PUBLIC_SITE_URL` | No | `https://verifymyprovider.com` | Site URL for sitemap generation |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | No | (none) | reCAPTCHA v3 client-side site key |
| `ANTHROPIC_API_KEY` | No | (none) | Anthropic Claude API key for insurance card OCR |
| `PORT` | No | `3000` (dev) / `8080` (prod) | Server port |
| `NODE_ENV` | No | `development` | Environment mode |

> **Important:** All `NEXT_PUBLIC_*` variables are inlined at build time by Next.js. They must be provided as Docker build args (not runtime environment variables) for production images.

### 7.3 Production Secrets (GCP Secret Manager)

| Secret Name | Mounted On | Description |
|-------------|-----------|-------------|
| `DATABASE_URL` | Backend | Cloud SQL connection string with Unix socket path |
| `ADMIN_SECRET` | Backend | Admin route authentication secret |
| `RECAPTCHA_SECRET_KEY` | Backend | Google reCAPTCHA v3 server secret |
| `ANTHROPIC_API_KEY` | Frontend | Claude API key for insurance card OCR |

---

## 8. Secrets Management

### 8.1 Local Development

Secrets are stored in the `.env` file (git-ignored). Copy from `.env.example` and fill in values:

```bash
cp .env.example .env
# Edit .env with your local values
```

### 8.2 Production (GCP Secret Manager)

Secrets are stored in GCP Secret Manager and mounted into Cloud Run services at deploy time via the `secrets` flag in the deploy workflow:

```yaml
# Backend secrets
secrets: |
  DATABASE_URL=DATABASE_URL:latest
  ADMIN_SECRET=ADMIN_SECRET:latest
  RECAPTCHA_SECRET_KEY=RECAPTCHA_SECRET_KEY:latest

# Frontend secrets
secrets: |
  ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest
```

Format: `ENV_VAR_NAME=SECRET_NAME:VERSION`

**To create or update a secret:**

```bash
# Create a new secret
echo -n "secret-value" | gcloud secrets create SECRET_NAME --data-file=-

# Update an existing secret
echo -n "new-secret-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

**To grant the Cloud Run service account access:**

```bash
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 8.3 CI/CD Secrets (GitHub Actions)

GitHub Actions secrets are only used for GCP authentication and build-time configuration. They do not contain application secrets like database credentials.

---

## 9. Deployment Procedures

### 9.1 Normal Release (Automated)

The standard deployment flow is fully automated:

1. Merge a pull request into `main` (or push directly)
2. GitHub Actions automatically triggers the `Deploy to Cloud Run` workflow
3. The pipeline runs tests, builds Docker images, deploys to Cloud Run, and runs smoke tests
4. A deployment summary is posted in the GitHub Actions run

**To monitor:**
- GitHub Actions: `https://github.com/breilly1296/HealthcareProviderDB-/actions`
- Cloud Run Console: `https://console.cloud.google.com/run`

### 9.2 Manual Deployment (workflow_dispatch)

The pipeline supports `workflow_dispatch` for manual triggers:

1. Go to **Actions** > **Deploy to Cloud Run** in GitHub
2. Click **Run workflow**
3. Select the `main` branch
4. Click **Run workflow**

### 9.3 Hotfix Deployment

For urgent fixes:

1. Create a hotfix branch from `main`:
   ```bash
   git checkout main
   git pull
   git checkout -b hotfix/description
   ```
2. Make the fix, commit, and push
3. Open a pull request targeting `main`
4. After review, merge to `main` -- this triggers automatic deployment
5. Monitor the GitHub Actions run for success

For immediate deployment bypassing PR review (use with caution):

```bash
git checkout main
git pull
# Make the fix
git commit -am "hotfix: description"
git push origin main
# Pipeline triggers automatically
```

### 9.4 Database Schema Changes

Schema changes require additional care:

1. Update `packages/backend/prisma/schema.prisma`
2. Generate a migration:
   ```bash
   npm run db:migrate
   # This runs: prisma migrate dev
   ```
3. Test the migration locally
4. **Before deploying**, apply the migration to the production database:
   ```bash
   # Connect to production database (via Cloud SQL Auth Proxy or direct connection)
   npx prisma migrate deploy
   ```
5. Then deploy the application code as normal

> **Warning:** Always apply database migrations before deploying new application code that depends on them. The CI/CD pipeline does not automatically run migrations.

### 9.5 Deploying Backend Only (Manual)

```bash
# Build and push the backend image
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT_ID/verifymyprovider/verifymyprovider-backend:manual

# Deploy to Cloud Run
gcloud run deploy verifymyprovider-backend \
  --image us-central1-docker.pkg.dev/PROJECT_ID/verifymyprovider/verifymyprovider-backend:manual \
  --region us-central1 \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80 \
  --allow-unauthenticated
```

---

## 10. Rollback Procedures

### 10.1 Cloud Run Revision Rollback

Cloud Run maintains a history of deployed revisions. To roll back:

```bash
# List recent revisions
gcloud run revisions list --service verifymyprovider-backend --region us-central1

# Roll back to a specific revision
gcloud run services update-traffic verifymyprovider-backend \
  --to-revisions=REVISION_NAME=100 \
  --region us-central1
```

Repeat for the frontend service if needed:

```bash
gcloud run revisions list --service verifymyprovider-frontend --region us-central1

gcloud run services update-traffic verifymyprovider-frontend \
  --to-revisions=REVISION_NAME=100 \
  --region us-central1
```

### 10.2 Rollback by Redeploying a Previous Image

Since every deployment tags images with the Git commit SHA:

```bash
# Find the commit SHA of the last known good deployment
git log --oneline -10

# Redeploy with that image
gcloud run deploy verifymyprovider-backend \
  --image us-central1-docker.pkg.dev/PROJECT_ID/verifymyprovider/verifymyprovider-backend:GOOD_COMMIT_SHA \
  --region us-central1

gcloud run deploy verifymyprovider-frontend \
  --image us-central1-docker.pkg.dev/PROJECT_ID/verifymyprovider/verifymyprovider-frontend:GOOD_COMMIT_SHA \
  --region us-central1
```

### 10.3 Rollback with Git Revert

For a clean rollback that preserves history:

```bash
git revert HEAD    # Reverts the last commit
git push origin main
# Pipeline automatically deploys the reverted code
```

### 10.4 Database Migration Rollback

Prisma does not natively support down migrations. For schema rollbacks:

1. Write a manual SQL script to reverse the changes
2. Apply it directly to the production database
3. Update the `schema.prisma` file and deploy

---

## 11. Health Checks and Monitoring

### 11.1 Backend Health Endpoint

**Endpoint:** `GET /health`

The backend exposes a comprehensive health check at `/health` that is placed before the rate limiter middleware so monitoring tools are never blocked.

**Source:** `packages/backend/src/index.ts` (line 93)

```typescript
app.get('/health', async (req: Request, res: Response) => {
  // Returns status, database connectivity, cache stats, memory usage, uptime
});
```

**Healthy response (HTTP 200):**
```json
{
  "status": "ok",
  "timestamp": "2026-02-07T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "memory": {
    "heapUsed": 45,
    "heapTotal": 80,
    "unit": "MB"
  },
  "checks": {
    "database": "healthy"
  },
  "databaseResponseTime": "3ms",
  "cache": {
    "hits": 150,
    "misses": 30,
    "size": 25,
    "mode": "memory",
    "hitRate": "83.3%"
  }
}
```

**Degraded response (HTTP 503):**
```json
{
  "status": "degraded",
  "checks": {
    "database": "unhealthy"
  },
  "error": "Database connection failed"
}
```

### 11.2 Docker Health Checks

Both Dockerfiles include HEALTHCHECK instructions:

**Backend:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1
```

**Frontend:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1
```

### 11.3 CI/CD Smoke Tests

The GitHub Actions pipeline includes post-deployment smoke tests for both services:

**Backend smoke test:**
```bash
sleep 10
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "${{ steps.deploy.outputs.url }}/health")
if [ "$HEALTH" != "200" ]; then
  echo "Health check failed with status $HEALTH"
  exit 1
fi
```

**Frontend smoke test:**
```bash
sleep 10
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ steps.deploy.outputs.url }}")
if [ "$HTTP_STATUS" != "200" ]; then
  echo "Frontend smoke test failed with status $HTTP_STATUS"
  exit 1
fi
```

### 11.4 Cloud Run Monitoring

Cloud Run provides built-in monitoring:

- **Metrics:** Request count, latency, container instance count, memory/CPU utilization
- **Logs:** Available in Cloud Logging (structured JSON from Pino logger)
- **Error Reporting:** Automatic error capture and grouping

Access via:
```
https://console.cloud.google.com/run/detail/us-central1/verifymyprovider-backend/metrics
https://console.cloud.google.com/run/detail/us-central1/verifymyprovider-frontend/metrics
```

### 11.5 Application Logging

The backend uses **Pino** for structured JSON logging:

- **Request logging:** `pino-http` middleware logs every HTTP request with timing
- **Request IDs:** Custom `requestId` middleware correlates logs across a request lifecycle
- **Log level:** Configured via `LOG_LEVEL` environment variable (default: `info`)

In production, logs flow to Cloud Logging and can be queried with:

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=verifymyprovider-backend" --limit=50
```

---

## 12. Troubleshooting

### 12.1 Common Local Development Issues

**Database connection refused:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
- Ensure Docker is running: `docker ps`
- Start the dev database: `npm run docker:dev`
- Check the container health: `docker inspect healthcaredb-postgres-dev`

**Prisma schema out of sync:**
```
Error: The database schema is not empty
```
- Reset and re-sync: `npx prisma db push --force-reset`
- Or use migrations: `npx prisma migrate reset`

**Next.js SWC error on Windows ARM64:**
```
Error: not a valid Win32 application
```
- The `postinstall` script should patch this automatically
- If the patch failed, check that `@next/swc-wasm-nodejs` is installed
- Run manually: `node packages/frontend/scripts/patch-next-swc.js`

**Port already in use:**
```
Error: listen EADDRINUSE :::3001
```
- Kill the process using the port:
  - Windows: `netstat -ano | findstr :3001`, then `taskkill /PID <pid> /F`
  - Linux/Mac: `lsof -i :3001`, then `kill -9 <pid>`

### 12.2 Common Docker Build Issues

**npm install failures in Docker:**
- The Dockerfiles use `--force` to bypass peer dependency warnings
- If native modules fail, ensure `libc6-compat` and `openssl` are installed in the build stage

**Large Docker build context:**
- Ensure `.dockerignore` is present and correct
- Check context size: `docker build --no-cache --progress=plain .`

### 12.3 Common Production Issues

**Cloud Run cold start latency:**
- Scale-to-zero (`--min-instances=0`) means cold starts when traffic resumes after idle
- To eliminate cold starts, set `--min-instances=1` (increases cost)
- Current cold start impact: backend typically starts in 3-5 seconds

**Database connection timeout:**
- Verify Cloud SQL instance is running: `gcloud sql instances describe verifymyprovider-db`
- Check that the `--add-cloudsql-instances` flag is correctly set
- Verify `DATABASE_URL` secret uses the correct Unix socket path
- Check Cloud SQL Auth Proxy logs in Cloud Run

**Secret access denied:**
```
Error: Permission denied on resource project ...
```
- Verify the Cloud Run service account has `roles/secretmanager.secretAccessor`
- Check the secret name matches exactly (case-sensitive)

**CORS errors in production:**
The backend hardcodes allowed origins in `packages/backend/src/index.ts`:
```typescript
const ALLOWED_ORIGINS: string[] = [
  'https://verifymyprovider.com',
  'https://www.verifymyprovider.com',
  'https://verifymyprovider-frontend-741434145252.us-central1.run.app',
  process.env.FRONTEND_URL,
];
```
If deploying to a new frontend URL, add it to this list or set the `FRONTEND_URL` environment variable.

### 12.4 Pipeline Failure Recovery

**Test stage fails:**
- Review test output in GitHub Actions logs
- Run tests locally: `npm run test:backend`
- Fix and push to `main`

**Docker build fails:**
- Check for dependency resolution errors
- Verify `.dockerignore` is not excluding required files
- Build locally to reproduce: `docker build -f packages/backend/Dockerfile .`

**Smoke test fails after deployment:**
- The service may need more startup time; check Cloud Run logs
- Verify secrets are mounted correctly
- Check if the database is accessible
- Manually test: `curl https://SERVICE_URL/health`

**Frontend build fails with NEXT_PUBLIC_API_URL issues:**
- The frontend build depends on the backend URL from `deploy-backend` outputs
- If backend deployment fails, frontend will not build
- Fix the backend deployment first

---

## Appendix A: Useful Commands Quick Reference

### Local Development

```bash
npm install                    # Install all dependencies
npm run dev                    # Start backend + frontend
npm run docker:dev             # Start dev database
npm run docker:dev:down        # Stop dev database
npm run db:generate            # Generate Prisma client
npm run db:push                # Push schema to database
npm run db:migrate             # Run migrations
npm run db:seed                # Seed sample data
npm run db:studio              # Open Prisma Studio
npm run build                  # Build all packages
npm run test                   # Run backend tests
npm run lint                   # Lint all workspaces
npm run clean                  # Clean all build outputs
```

### Docker

```bash
npm run docker:build           # Build all containers
npm run docker:up              # Start full stack in Docker
npm run docker:down            # Stop full stack
docker logs healthcaredb-backend -f    # Tail backend logs
docker logs healthcaredb-frontend -f   # Tail frontend logs
```

### GCP / Cloud Run

```bash
# View Cloud Run services
gcloud run services list --region us-central1

# View revisions
gcloud run revisions list --service verifymyprovider-backend --region us-central1

# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=verifymyprovider-backend" --limit=50

# View secrets
gcloud secrets list
gcloud secrets versions access latest --secret=DATABASE_URL

# Roll back traffic
gcloud run services update-traffic verifymyprovider-backend --to-revisions=REVISION=100 --region us-central1

# View Cloud SQL instances
gcloud sql instances list
gcloud sql instances describe verifymyprovider-db
```

---

## Appendix B: Security Considerations

### Container Security
- Both Dockerfiles run as non-root users (`expressjs` / `nextjs` with UID 1001)
- Production images use Alpine Linux for minimal attack surface
- Only production dependencies are installed in the final image

### Network Security
- Cloud Run services use HTTPS by default (TLS termination at the load balancer)
- Backend uses `helmet` middleware with strict CSP for JSON API responses
- Frontend uses security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy)
- CORS is restricted to known origins in production
- `trust proxy` is set to `1` to trust only Cloud Run's load balancer

### Application Security
- Rate limiting: 200 requests/hour default, with Redis support for distributed rate limiting
- Request body size limited to 100kb
- Request timeout of 30 seconds on all API routes
- reCAPTCHA v3 integration for user-submitted verifications
- Admin routes protected by `ADMIN_SECRET` header
- Graceful shutdown with 10-second timeout to complete in-flight requests

### Secrets Security
- No long-lived service account keys (Workload Identity Federation)
- Application secrets stored in GCP Secret Manager (not in code or environment)
- `.env` files are git-ignored and docker-ignored
- GitHub Secrets used only for GCP authentication, not application secrets

---

## Appendix C: Not Yet Implemented

The following items from the deployment checklist are planned but not yet implemented:

| Item | Status | Notes |
|------|--------|-------|
| Staging environment | Planned | No separate staging Cloud Run services or database |
| Rollback automation | Planned | Manual rollback via `gcloud` CLI; no automated rollback on failed smoke tests |
| Post-deploy smoke tests | Partial | Basic HTTP status checks exist; no functional API tests or end-to-end verification |
