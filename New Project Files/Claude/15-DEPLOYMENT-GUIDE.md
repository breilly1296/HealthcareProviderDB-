# Deployment Guide

This document covers all deployment configurations for VerifyMyProvider, from local development through staging and production on Google Cloud Run.

---

## Local Development

### Prerequisites
- Node.js 20+ (LTS)
- Docker and Docker Compose
- npm (included with Node.js)
- Git

### Setup Steps

1. **Clone the repository** and install dependencies:
   ```bash
   git clone <repository-url>
   cd HealthcareProviderDB
   npm install
   ```

2. **Create environment file** from template:
   ```bash
   cp .env.example .env
   # Edit .env with local values
   ```

3. **Start the local database** using Docker Compose:
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```
   This starts PostgreSQL 15 (Alpine) on port 5432 with:
   - User: `postgres`
   - Password: `postgres`
   - Database: `healthcare_providers`
   - Data persisted in `postgres_data_dev` Docker volume

4. **Run Prisma migrations** to set up the database schema:
   ```bash
   cd packages/backend
   npx prisma db push
   # or: npx prisma migrate deploy
   ```

5. **Start backend and frontend** natively (not in Docker):
   ```bash
   # Terminal 1 - Backend
   cd packages/backend
   npm run dev

   # Terminal 2 - Frontend
   cd packages/frontend
   npm run dev
   ```

   Backend runs on `http://localhost:3001`, frontend on `http://localhost:3000`.

### Key Local Environment Variables
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/healthcare_providers
NODE_ENV=development
PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

### Why Not Full Docker for Development?
The backend and frontend run natively (not in Docker) during development for:
- Faster hot reload (no container file watching overhead)
- Easier debugging with native Node.js debugger
- Simpler dependency management (no rebuild on package changes)
- Only the database runs in Docker to avoid local PostgreSQL installation

---

## Docker Compose (Full Stack)

For testing the full production-like stack locally, use the main `docker-compose.yml`:

```bash
docker compose up --build
```

### Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| `db` | `postgres:15-alpine` | 5432 | PostgreSQL database with health check |
| `backend` | Built from `packages/backend/Dockerfile` | 3001 (mapped to 8080 internal) | Express API server |
| `frontend` | Built from `packages/frontend/Dockerfile` | 3000 (mapped to 8080 internal) | Next.js frontend |

### Service Dependencies
- Backend waits for database to be healthy (`condition: service_healthy`)
- Frontend starts after backend is running
- Database health check: `pg_isready -U postgres` every 10 seconds

---

## Docker Images

### Backend Dockerfile (`packages/backend/Dockerfile`)

**Build Stage** (node:20-alpine):
1. Install native module dependencies (`libc6-compat`, `openssl`, `openssl-dev`)
2. Copy workspace package files and install all dependencies
3. Build shared package (`packages/shared`)
4. Generate Prisma client
5. Build backend TypeScript to JavaScript

**Production Stage** (node:20-alpine):
1. Create non-root user (`expressjs:nodejs`, UID/GID 1001)
2. Install only production dependencies (`npm install --omit=dev`)
3. Copy built artifacts from build stage
4. Copy Prisma client binaries
5. Set ownership to non-root user
6. Expose port 8080
7. Health check: `wget http://localhost:8080/health` every 30 seconds
8. Entrypoint: `node packages/backend/dist/index.js`

### Frontend Dockerfile (`packages/frontend/Dockerfile`)

**Build Stage** (node:20-alpine):
1. Install native module dependencies (`libc6-compat`)
2. Copy workspace package files and install all dependencies
3. Build shared package
4. Accept build arguments: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`
5. Build Next.js with standalone output mode

**Production Stage** (node:20-alpine):
1. Create non-root user (`nextjs:nodejs`, UID/GID 1001)
2. Copy standalone build, static assets, and public directory
3. Set ownership to non-root user
4. Expose port 8080, bind to `0.0.0.0`
5. Health check: `wget http://localhost:8080/` every 30 seconds
6. Entrypoint: `node packages/frontend/server.js`

### Security Properties
- Both images use non-root users
- Production images contain only production dependencies
- Multi-stage builds minimize image size
- No secrets baked into images (injected at runtime)
- Next.js telemetry disabled (`NEXT_TELEMETRY_DISABLED=1`)

---

## CI/CD Pipeline

### GitHub Actions Workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| `deploy.yml` | `.github/workflows/deploy.yml` | Push to `main`, manual dispatch | Production deployment |
| `deploy-staging.yml` | `.github/workflows/deploy-staging.yml` | Push to `staging`, manual dispatch | Staging deployment |
| `rollback.yml` | `.github/workflows/rollback.yml` | Manual dispatch only | Rollback to previous revision |
| `test.yml` | `.github/workflows/test.yml` | Push/PR | Run test suite |
| `security-scan.yml` | `.github/workflows/security-scan.yml` | Scheduled/manual | Security scanning |
| `codeql.yml` | `.github/workflows/codeql.yml` | Scheduled/push | CodeQL analysis |
| `playwright.yml` | `.github/workflows/playwright.yml` | Push/PR | E2E browser tests |

### Production Deploy Pipeline (`deploy.yml`)

```
Push to main
    |
    v
[Test Job]
    - Checkout code
    - Setup Node.js 20
    - npm ci
    - npm audit --audit-level=critical
    - Run backend tests
    - Build backend
    |
    v
[Deploy Backend Job] (needs: test)
    - Authenticate to GCP (Workload Identity Federation)
    - Configure Docker for Artifact Registry
    - Build and push Docker image (with GitHub Actions cache)
    - Deploy to Cloud Run
    - Smoke test: GET /health (expect 200)
    |
    v
[Deploy Frontend Job] (needs: deploy-backend)
    - Authenticate to GCP
    - Build and push Docker image (NEXT_PUBLIC_API_URL from backend output)
    - Deploy to Cloud Run
    - Smoke test: GET / (expect 200)
    |
    v
[Summary Job] (always runs)
    - Print deployment summary table
```

### Authentication: Workload Identity Federation
- No long-lived service account keys stored in GitHub
- GitHub Actions gets short-lived OIDC tokens from GCP
- Configured via `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` secrets
- Tokens are scoped to the specific GCP project and service account

---

## Production Environment (Google Cloud Run)

### Backend Service: `verifymyprovider-backend`

| Setting | Value |
|---------|-------|
| Region | `us-central1` |
| Port | 8080 |
| Memory | 512Mi |
| CPU | 1 |
| Min instances | 0 (scale to zero) |
| Max instances | 10 |
| Concurrency | 80 requests per instance |
| Cloud SQL | Connected via `--add-cloudsql-instances` flag |
| Authentication | `--allow-unauthenticated` (public API) |

**Environment Variables**:
- `NODE_ENV=production`
- `FRONTEND_URL` (from GitHub secrets, for CORS)

**Secrets** (from GCP Secret Manager):
- `DATABASE_URL` -- PostgreSQL connection string with Cloud SQL proxy
- `ADMIN_SECRET` -- Admin endpoint authentication
- `RECAPTCHA_SECRET_KEY` -- reCAPTCHA server-side verification

### Frontend Service: `verifymyprovider-frontend`

| Setting | Value |
|---------|-------|
| Region | `us-central1` |
| Port | 8080 |
| Memory | 512Mi |
| CPU | 1 |
| Min instances | 0 (scale to zero) |
| Max instances | 10 |
| Concurrency | 80 requests per instance |
| Authentication | `--allow-unauthenticated` (public website) |

**Environment Variables**:
- `NODE_ENV=production`

**Secrets** (from GCP Secret Manager):
- `ANTHROPIC_API_KEY` -- Claude API for insurance card extraction

**Build Arguments** (baked into image):
- `NEXT_PUBLIC_API_URL` -- Backend Cloud Run URL + `/api/v1`
- `NEXT_PUBLIC_POSTHOG_KEY` -- PostHog project key

---

## Staging Environment

### Differences from Production

| Setting | Production | Staging |
|---------|-----------|---------|
| Branch trigger | `main` | `staging` |
| Service suffix | (none) | `-staging` |
| Max instances | 10 | **2** |
| Image tags | `<sha>`, `latest` | `staging-<sha>`, `staging-latest` |
| Shared secrets | Same GCP Secret Manager | Same GCP Secret Manager |

Staging uses the same Cloud SQL database instance (different connection if needed) and same Secret Manager secrets as production. The reduced max instances (2 vs 10) minimizes cost.

---

## Rollback Procedure

### Automated Rollback (`rollback.yml`)

The rollback workflow is triggered manually via GitHub Actions:

1. **Select service**: `backend`, `frontend`, or `both`
2. **Optionally specify revision**: Leave empty to roll back to previous revision
3. The workflow:
   - Lists recent Cloud Run revisions (last 5)
   - Determines target revision (specified or previous)
   - Routes 100% of traffic to the target revision
   - Runs smoke test against the rolled-back service
   - Reports result in GitHub Actions summary

### Manual Rollback (gcloud CLI)
```bash
# List recent revisions
gcloud run revisions list \
  --service=verifymyprovider-backend \
  --region=us-central1 \
  --limit=5

# Route traffic to a specific revision
gcloud run services update-traffic verifymyprovider-backend \
  --region=us-central1 \
  --to-revisions=REVISION_NAME=100
```

### Rollback Properties
- Cloud Run revisions are immutable -- previous versions always exist
- Traffic routing is instant (no rebuild required)
- Database migrations are NOT rolled back (forward-only migrations recommended)
- Smoke tests verify the rollback succeeded

---

## Infrastructure Diagram

```
GitHub Repository
    |
    | push to main
    v
GitHub Actions (CI/CD)
    |
    | Workload Identity Federation (OIDC)
    v
Google Cloud Platform
    |
    +-- Artifact Registry (Docker images)
    |       - verifymyprovider-backend:<sha>
    |       - verifymyprovider-frontend:<sha>
    |
    +-- Secret Manager
    |       - DATABASE_URL
    |       - ADMIN_SECRET
    |       - RECAPTCHA_SECRET_KEY
    |       - ANTHROPIC_API_KEY
    |
    +-- Cloud Run (Backend)
    |       - 0-10 instances, 512Mi, 1 CPU
    |       - Connected to Cloud SQL
    |
    +-- Cloud Run (Frontend)
    |       - 0-10 instances, 512Mi, 1 CPU
    |       - ANTHROPIC_API_KEY from Secret Manager
    |
    +-- Cloud SQL (PostgreSQL 15)
            - Database: verifymyprovider
            - Instance: verifymyprovider-db
            - Region: us-central1
```

---

## Health Checks

### Backend Health Check
- **Endpoint**: `GET /health`
- **Checks**: Database connectivity (SELECT 1), cache statistics, memory usage, uptime
- **Response**: 200 OK with health details, or 503 with degraded status
- **Used by**: Cloud Run health checks, Docker HEALTHCHECK, CI/CD smoke tests

### Frontend Health Check
- **Endpoint**: `GET /`
- **Checks**: Next.js server responding
- **Used by**: Cloud Run health checks, Docker HEALTHCHECK, CI/CD smoke tests

### Docker HEALTHCHECK Configuration
Both services use identical health check parameters:
- Interval: 30 seconds
- Timeout: 10 seconds
- Start period: 5 seconds
- Retries: 3
