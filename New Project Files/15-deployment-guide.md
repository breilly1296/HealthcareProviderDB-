# VerifyMyProvider Deployment Guide

**Generated:** 2026-02-18

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Docker Development](#docker-development)
4. [Full-Stack Docker Compose](#full-stack-docker-compose)
5. [Production Architecture](#production-architecture)
6. [CI/CD Pipeline](#cicd-pipeline)
7. [Staging Environment](#staging-environment)
8. [Environment Variables](#environment-variables)
9. [Database Management](#database-management)
10. [Rollback Procedures](#rollback-procedures)
11. [Post-Deployment Verification](#post-deployment-verification)
12. [Hotfix Process](#hotfix-process)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | >= 20.0.0 | Runtime for backend and frontend |
| npm | >= 10.x | Package manager with workspace support |
| Docker | >= 24.x | Containerization |
| Docker Compose | >= 2.x | Multi-container orchestration |
| Git | Latest | Version control |
| gcloud CLI | Latest | GCP interaction (production) |

### Required Accounts / Access

- **GitHub** -- Repository access to `breilly1296/HealthcareProviderDB-`
- **Google Cloud Platform** -- Project `verifymyprovider-prod` with permissions for:
  - Cloud Run (deploy services)
  - Artifact Registry (push Docker images)
  - Cloud SQL (database access)
  - Secret Manager (read secrets)
- **Workload Identity Federation** -- Configured for keyless GitHub Actions authentication (no long-lived service account keys)

### Windows ARM64 Notes

If developing on Windows ARM64 with Node.js v24+:
- Next.js 14.x SWC native binaries are incompatible
- The postinstall script (`packages/frontend/scripts/patch-next-swc.js`) automatically patches SWC to use WASM fallback
- If OneDrive syncs the project folder, native `.node` binaries may become corrupted; WASM fallbacks are more reliable

---

## Local Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/breilly1296/HealthcareProviderDB-.git
cd HealthcareProviderDB
npm install
```

### 2. Start Development Database

```bash
npm run docker:dev
```

This starts PostgreSQL 15 on port 5432 using `docker-compose.dev.yml`:
- **User:** postgres
- **Password:** postgres
- **Database:** healthcare_providers

### 3. Configure Environment Variables

Create `packages/backend/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/healthcare_providers
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
JWT_SECRET=local-dev-jwt-secret-change-me
MAGIC_LINK_BASE_URL=http://localhost:3000
# Optional:
# REDIS_URL=redis://localhost:6379
# RECAPTCHA_SECRET_KEY=your-recaptcha-secret
# ADMIN_SECRET=your-admin-secret
# ANTHROPIC_API_KEY=your-anthropic-key
# RESEND_API_KEY=your-resend-key
# INSURANCE_ENCRYPTION_KEY=your-encryption-key
# CSRF_SECRET=your-csrf-secret
```

Create `packages/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
# Optional:
# NEXT_PUBLIC_POSTHOG_KEY=your-posthog-key
# NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-maps-key
# NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your-recaptcha-site-key
```

### 4. Initialize Database Schema

```bash
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema to database
# Optional: npm run db:seed  # Seed with sample data
```

### 5. Start Development Servers

```bash
npm run dev
```

This runs concurrently:
- **Backend:** `http://localhost:3001` (Express + tsx watch)
- **Frontend:** `http://localhost:3000` (Next.js dev server)

The shared package is built first (`npm run build:shared`) before starting dev servers.

---

## Docker Development

### Development Database Only

```bash
npm run docker:dev        # Start PostgreSQL
npm run docker:dev:down   # Stop PostgreSQL
```

This uses `docker-compose.dev.yml` which only starts the database. Backend and frontend run natively for faster iteration (hot reload).

### Full-Stack Docker Compose

```bash
npm run docker:build   # Build all containers
npm run docker:up      # Start all services
npm run docker:down    # Stop all services
```

This uses `docker-compose.yml` to run:

| Service | Container | Port | Image |
|---------|-----------|------|-------|
| PostgreSQL | healthcaredb-postgres | 5432 | postgres:15-alpine |
| Backend | healthcaredb-backend | 3001 -> 8080 | Custom (Node 20 Alpine) |
| Frontend | healthcaredb-frontend | 3000 -> 8080 | Custom (Node 20 Alpine) |

### Docker Image Details

**Backend Dockerfile** (`packages/backend/Dockerfile`):
- Multi-stage build (builder + runner)
- Node 20 Alpine base
- Non-root user (`expressjs:nodejs`, UID 1001)
- Production dependencies only in final image
- Prisma client generated and copied
- Health check: `wget http://localhost:8080/health`
- Entrypoint: `node packages/backend/dist/index.js`

**Frontend Dockerfile** (`packages/frontend/Dockerfile`):
- Multi-stage build (builder + runner)
- Node 20 Alpine base
- Non-root user (`nextjs:nodejs`, UID 1001)
- Next.js standalone output mode
- Build args: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- Health check: `wget http://localhost:8080/`
- Entrypoint: `node packages/frontend/server.js`

---

## Production Architecture

### Infrastructure

```
GitHub (main branch)
    |
    v
GitHub Actions CI/CD
    |
    +---> GCP Artifact Registry (Docker images)
    |
    +---> Cloud SQL Proxy (schema migration)
    |
    +---> Cloud Run (Backend Service)
    |         - 512Mi memory, 1 CPU
    |         - 0-10 instances (scale to zero)
    |         - 80 concurrency
    |         - Cloud SQL connection via unix socket
    |
    +---> Cloud Run (Frontend Service)
              - 512Mi memory, 1 CPU
              - 0-10 instances (scale to zero)
              - 80 concurrency
```

### GCP Services Used

| Service | Purpose |
|---------|---------|
| Cloud Run | Backend + frontend hosting (serverless containers) |
| Cloud SQL (PostgreSQL) | Primary database (`verifymyprovider` database) |
| Artifact Registry | Docker image storage (`verifymyprovider` repository) |
| Secret Manager | Secure storage for secrets (DATABASE_URL, API keys, etc.) |
| Workload Identity Federation | Keyless authentication for GitHub Actions |

### Secrets in GCP Secret Manager

| Secret Name | Used By | Purpose |
|-------------|---------|---------|
| DATABASE_URL | Backend | Cloud SQL connection string |
| ADMIN_SECRET | Backend | Admin endpoint authentication |
| RECAPTCHA_SECRET_KEY | Backend | Google reCAPTCHA v3 server-side verification |
| JWT_SECRET | Backend | JWT signing for auth tokens |
| RESEND_API_KEY | Backend | Magic link email delivery |
| INSURANCE_ENCRYPTION_KEY | Backend | AES encryption for insurance card PII |
| CSRF_SECRET | Backend | CSRF token generation |
| ANTHROPIC_API_KEY | Frontend | Claude AI for insurance card OCR |

---

## CI/CD Pipeline

### Production Deploy (`deploy.yml`)

Triggered on push to `main` branch or manual dispatch.

**Pipeline stages:**

1. **Test** (ubuntu-latest, Node 20)
   - `npm ci` (clean install)
   - `npm audit --audit-level=critical` (security audit)
   - `npm test` (backend tests)
   - `npm run build` (backend build verification)

2. **Deploy Backend** (requires test pass)
   - Authenticate to GCP via Workload Identity Federation
   - Build and push Docker image to Artifact Registry
   - Tags: `{sha}` and `latest`
   - Apply database schema changes via Cloud SQL Proxy
   - Deploy to Cloud Run with secrets from Secret Manager
   - Smoke test: `GET /health` returns HTTP 200

3. **Deploy Frontend** (requires backend deploy)
   - Build and push Docker image with build args:
     - `NEXT_PUBLIC_API_URL` = deployed backend URL + `/api/v1`
     - `NEXT_PUBLIC_POSTHOG_KEY` from GitHub secrets
   - Deploy to Cloud Run
   - Smoke test: `GET /` returns HTTP 200

4. **Summary** -- Generates GitHub deployment summary table

### Staging Deploy (`deploy-staging.yml`)

Triggered on push to `staging` branch or manual dispatch.

Identical pipeline to production except:
- Service names: `verifymyprovider-backend-staging`, `verifymyprovider-frontend-staging`
- Image tags: `staging-{sha}`, `staging-latest`
- **Max instances: 2** (cost control)
- Same database (shared Cloud SQL instance)

### Other Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `test.yml` | PR / push | Run tests on pull requests |
| `codeql.yml` | Schedule / PR | Code security analysis |
| `security-scan.yml` | Schedule / PR | Dependency vulnerability scanning |
| `playwright.yml` | PR / manual | End-to-end browser tests |
| `rollback.yml` | Manual only | Rollback Cloud Run to previous revision |

---

## Staging Environment

The staging environment uses the `staging` branch and deploys to separate Cloud Run services:

```bash
# Deploy to staging
git checkout staging
git merge feature-branch
git push origin staging
```

Staging services:
- Backend: `verifymyprovider-backend-staging` (max 2 instances)
- Frontend: `verifymyprovider-frontend-staging` (max 2 instances)
- Database: Shared with production (same Cloud SQL instance)

---

## Environment Variables

### Backend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | Yes | -- | PostgreSQL connection string |
| PORT | No | 3001 | Server port |
| NODE_ENV | No | development | Environment (development/production/test) |
| FRONTEND_URL | Yes (prod) | -- | Frontend URL for CORS |
| JWT_SECRET | Yes | -- | Secret for JWT signing |
| MAGIC_LINK_BASE_URL | Yes | -- | Base URL for magic link redirects |
| ADMIN_SECRET | No | -- | Admin endpoint authentication (disabled if not set) |
| REDIS_URL | No | -- | Redis connection (falls back to in-memory) |
| RECAPTCHA_SECRET_KEY | No | -- | reCAPTCHA v3 secret (skipped if not set) |
| CAPTCHA_FAIL_MODE | No | open | CAPTCHA failure behavior (open/closed) |
| RESEND_API_KEY | No | -- | Email delivery for magic links |
| INSURANCE_ENCRYPTION_KEY | No | -- | AES-256 key for insurance card PII |
| INSURANCE_ENCRYPTION_KEY_PREVIOUS | No | -- | Previous key for key rotation |
| CSRF_SECRET | Yes (prod) | -- | Secret for CSRF token generation |

### Frontend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| NEXT_PUBLIC_API_URL | Yes | http://localhost:3001/api/v1 | Backend API URL |
| NEXT_PUBLIC_POSTHOG_KEY | No | -- | PostHog analytics key |
| NEXT_PUBLIC_GOOGLE_MAPS_API_KEY | No | -- | Google Maps API key |
| NEXT_PUBLIC_RECAPTCHA_SITE_KEY | No | -- | reCAPTCHA v3 site key |
| ANTHROPIC_API_KEY | No | -- | Claude AI for insurance card OCR |

---

## Database Management

### Schema Changes

Prisma is used for schema management. The schema file is at `packages/backend/prisma/schema.prisma`.

**Local development:**
```bash
npm run db:push        # Push schema changes (no migration history)
npm run db:generate    # Regenerate Prisma client
npm run db:studio      # Open Prisma Studio GUI
```

**Production (via CI/CD):**
- Schema changes are applied automatically during deploy via `prisma db push --skip-generate`
- Cloud SQL Proxy is used to connect from GitHub Actions

### Prisma Conventions

- Model names: PascalCase in schema, mapped to snake_case tables with `@@map()`
- Field names: camelCase in schema, mapped to snake_case columns with `@map()`
- Primary keys: `@id` with appropriate type (NPI as VARCHAR(10), auto-increment integers, CUID for application-generated)
- Timestamps: `@db.Timestamptz(6)` for timezone-aware timestamps

### Cloud SQL SSL Notes

When connecting to Cloud SQL from local scripts (not via Cloud Run):
- `pg` v8.x treats `sslmode=require` in connection strings as `verify-full`
- Fix: Strip `sslmode` from URL, set `ssl: { rejectUnauthorized: false }` programmatically
- Use `createPool()` from `scripts/pre-import-check.ts` for centralized connection handling

### Pre-Import Safety

Before running any bulk import, use:
```bash
npx tsx scripts/pre-import-check.ts
```

This counts enriched records, pending import conflicts, and prompts for confirmation before proceeding.

---

## Rollback Procedures

### Automated Rollback (GitHub Actions)

Use the `Rollback Cloud Run Service` workflow (`rollback.yml`):

1. Go to GitHub Actions
2. Select "Rollback Cloud Run Service"
3. Click "Run workflow"
4. Choose service: `backend`, `frontend`, or `both`
5. Optionally specify a target revision name (leave empty for previous revision)

The workflow:
- Lists recent revisions for reference
- Routes 100% traffic to the target revision
- Runs a smoke test to verify the rollback
- Generates a summary in GitHub Actions

### Manual Rollback (gcloud CLI)

```bash
# List recent revisions
gcloud run revisions list \
  --service=verifymyprovider-backend \
  --region=us-central1 \
  --limit=5

# Route traffic to previous revision
gcloud run services update-traffic verifymyprovider-backend \
  --region=us-central1 \
  --to-revisions=REVISION_NAME=100
```

### Database Rollback

Prisma does not have built-in rollback for `db push`. For schema rollbacks:
1. Revert the schema change in code
2. Run `prisma db push` to apply the reverted schema
3. Note: This may cause data loss for dropped columns/tables

For data rollbacks, use Cloud SQL backups.

---

## Post-Deployment Verification

### Automated Smoke Tests

The CI/CD pipeline includes automatic smoke tests:
- **Backend:** `curl -s {URL}/health` must return HTTP 200
- **Frontend:** `curl -s {URL}/` must return HTTP 200

### Manual Verification Checklist

After each deployment:

1. **Health check:** `GET /health` returns `{ status: "ok", checks: { database: "healthy" } }`
2. **API root:** `GET /` returns API info with endpoint listing
3. **Provider search:** `GET /api/v1/providers/search?state=NY&limit=1` returns results
4. **Frontend loads:** Navigate to the frontend URL, verify page renders
5. **CORS:** Browser network tab shows no CORS errors
6. **Rate limiting:** Check `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers in responses

### Monitoring

- **Cloud Run logs:** Available in GCP Console > Cloud Run > Logs
- **Structured logging:** Backend uses Pino for structured JSON logs (picked up by Cloud Logging)
- **Health endpoint:** `/health` reports database status, cache stats, memory usage, and uptime
- **Admin health:** `GET /api/v1/admin/health` (requires `X-Admin-Secret` header) provides detailed retention metrics

---

## Hotfix Process

### Hotfix to Production

1. Create a hotfix branch from `main`:
   ```bash
   git checkout main
   git pull
   git checkout -b hotfix/description
   ```

2. Make the fix, commit, and push

3. Open a PR to `main` -- tests will run automatically

4. Merge to `main` -- deployment triggers automatically

5. Monitor the deployment in GitHub Actions

6. If the deployment fails, use the rollback workflow

### Hotfix Timing

- **Normal release:** Push to `main` triggers full CI/CD (test -> build -> deploy backend -> deploy frontend). Total time: ~10-15 minutes.
- **Emergency hotfix:** Same pipeline, no shortcuts. If the pipeline passes, the fix is safe to deploy.
- **Immediate rollback:** Use the rollback workflow to instantly route traffic to the previous revision (< 1 minute).
