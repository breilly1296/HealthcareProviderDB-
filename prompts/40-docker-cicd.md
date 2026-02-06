---
tags:
  - infrastructure
  - deployment
  - implemented
type: prompt
priority: 2
created: 2026-02-05
---

# Docker & CI/CD Pipeline Review

## Files to Review
- `docker-compose.yml` (production Docker Compose with all 3 services)
- `docker-compose.dev.yml` (development Docker Compose — PostgreSQL only)
- `packages/backend/Dockerfile` (backend container)
- `packages/frontend/Dockerfile` (frontend container)
- `.github/workflows/deploy.yml` (production Cloud Run deployment pipeline)
- `.github/workflows/deploy-staging.yml` (staging Cloud Run deployment pipeline)
- `.github/workflows/playwright.yml` (E2E test pipeline)
- `.github/workflows/security-scan.yml` (SAST security scanning)
- `.github/workflows/test.yml` (unit test CI on PRs)

## Architecture Overview

```
GitHub (main branch)
    │
    ├── push triggers deploy.yml
    │
    ▼
GitHub Actions (ubuntu-latest)
    │
    ├── 1. Authenticate to GCP (Workload Identity Federation)
    ├── 2. Build Docker images
    ├── 3. Push to Artifact Registry
    ├── 4. Deploy Backend to Cloud Run
    ├── 5. Deploy Frontend to Cloud Run (depends on backend URL)
    └── 6. Post-deploy summary
```

## Docker Configuration

### docker-compose.yml (Full Stack)
Three services for local full-stack development or self-hosted deployment:

| Service | Image | Port Mapping | Depends On |
|---------|-------|-------------|------------|
| `db` | `postgres:15-alpine` | 5432:5432 | — |
| `backend` | Build from `packages/backend/Dockerfile` | 3001:8080 | db (healthy) |
| `frontend` | Build from `packages/frontend/Dockerfile` | 3000:8080 | backend |

**Database:**
- User: `postgres`, Password: `postgres`, DB: `healthcare_providers`
- Named volume: `postgres_data` (persistent)
- Health check: `pg_isready -U postgres` every 10s

**Backend:**
- Environment: `DATABASE_URL=postgresql://postgres:postgres@db:5432/healthcare_providers`, `PORT=8080`, `NODE_ENV=production`
- Health check: `wget http://localhost:8080/health` every 30s

**Frontend:**
- Build arg: `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1`
- Health check: `wget http://localhost:8080/` every 30s

### docker-compose.dev.yml (Database Only)
PostgreSQL container for local development. Backend and frontend run natively via `npm run dev`.

## CI/CD Pipeline (`.github/workflows/deploy.yml`)

### Trigger
- Push to `main` branch
- Manual dispatch (`workflow_dispatch`)

### Environment Variables (Workflow Level)
```yaml
GCP_REGION: us-central1
BACKEND_SERVICE: verifymyprovider-backend
FRONTEND_SERVICE: verifymyprovider-frontend
```

### Job 1: Deploy Backend
**Runs on:** `ubuntu-latest`
**Permissions:** `contents: read`, `id-token: write` (for Workload Identity)

Steps:
1. Checkout code
2. Authenticate to GCP via Workload Identity Federation
3. Set up Cloud SDK with project ID
4. Configure Docker for Artifact Registry (`us-central1-docker.pkg.dev`)
5. Build backend Docker image (tagged with `$GITHUB_SHA` and `latest`)
6. Push to Artifact Registry
7. Deploy to Cloud Run with configuration:

**Cloud Run Backend Configuration:**
| Setting | Value |
|---------|-------|
| Port | 8080 |
| Memory | 512Mi |
| CPU | 1 |
| Min instances | 0 (scale to zero) |
| Max instances | 10 |
| Concurrency | 80 |
| Cloud SQL | `verifymyprovider-prod:us-central1:verifymyprovider-db` |
| Auth | `--allow-unauthenticated` |

**Environment injection:**
- `NODE_ENV=production` (env var)
- `FRONTEND_URL` from GitHub secret (env var)
- `DATABASE_URL` from Secret Manager (secret mount)
- `ADMIN_SECRET` removed from secrets (`--remove-secrets` flag)

**Output:** `backend_url` (used by frontend job)

### Job 2: Deploy Frontend
**Depends on:** `deploy-backend` (needs backend URL)

Steps:
1. Checkout, authenticate, configure (same as backend)
2. Build frontend Docker image with build args:
   - `NEXT_PUBLIC_API_URL=${{ backend_url }}/api/v1`
   - `NEXT_PUBLIC_POSTHOG_KEY` from GitHub secret
3. Push to Artifact Registry
4. Deploy to Cloud Run:

**Cloud Run Frontend Configuration:**
| Setting | Value |
|---------|-------|
| Port | 8080 |
| Memory | 512Mi |
| CPU | 1 |
| Min instances | 0 |
| Max instances | 10 |
| Concurrency | 80 |
| Auth | `--allow-unauthenticated` |

**Secret injection:**
- `ANTHROPIC_API_KEY` from Secret Manager (for insurance card extraction)

### Job 3: Deployment Summary
**Runs:** Always (even if previous jobs fail)
**Output:** GitHub step summary with table of service statuses and URLs.

## GCP Infrastructure

### Artifact Registry
- Location: `us-central1-docker.pkg.dev`
- Repository: `verifymyprovider`
- Images: `verifymyprovider-backend`, `verifymyprovider-frontend`
- Tags: `$GITHUB_SHA` (immutable), `latest` (mutable)

### Cloud Run Services
- `verifymyprovider-backend` — Express API
- `verifymyprovider-frontend` — Next.js app
- Region: `us-central1`
- Scale: 0 to 10 instances

### Cloud SQL
- Instance: `verifymyprovider-db`
- Project: `verifymyprovider-prod`
- Type: PostgreSQL 15
- Region: `us-central1`
- Connected via Cloud SQL proxy (automatic in Cloud Run)

### Secret Manager
| Secret | Used By |
|--------|---------|
| `DATABASE_URL` | Backend |
| `ANTHROPIC_API_KEY` | Frontend |

### Authentication
- **Workload Identity Federation** — no long-lived service account keys
- GitHub Actions OIDC token exchanged for GCP credentials
- Service account with minimal permissions for deploy

## Staging Pipeline (`.github/workflows/deploy-staging.yml`)
- **Trigger:** Push to `staging` branch or manual dispatch
- **Services:** `verifymyprovider-backend-staging`, `verifymyprovider-frontend-staging`
- **Differences from production:** Max 2 instances (vs 10), staging-prefixed image tags
- All other config identical (Node 20, GCP auth, Docker build, secrets, memory/CPU)

## E2E Test Pipeline (`.github/workflows/playwright.yml`)
- Runs Playwright browser tests on staging
- Separate workflow from deployment

## Security Scan Pipeline (`.github/workflows/security-scan.yml`)
- SAST security scanning

## Unit Test Pipeline (`.github/workflows/test.yml`)
- Runs Jest tests on PRs

## Checklist

### Docker
- [x] Backend Dockerfile (Node 20, non-root user, health check)
- [x] Frontend Dockerfile (Node 20, Next.js standalone output, health check)
- [x] docker-compose.yml with all 3 services
- [x] docker-compose.dev.yml for local database
- [x] Health checks on all services
- [x] Named volumes for data persistence
- [ ] Multi-stage builds for smaller images (if not already)
- [ ] `.dockerignore` files to exclude node_modules, .git, etc.

### CI/CD
- [x] Automatic deploy on push to main
- [x] Manual dispatch option
- [x] Workload Identity Federation (no long-lived keys)
- [x] Artifact Registry for image storage
- [x] Cloud Run deployment with proper configuration
- [x] Frontend depends on backend URL (sequential deploy)
- [x] Deployment summary with status table
- [x] Staging environment — `deploy-staging.yml` triggers on `staging` branch, deploys to `-staging` services
- [ ] No rollback automation (manual via Cloud Run console)
- [ ] No smoke tests after deployment
- [ ] No build caching in GitHub Actions (Docker layer caching)
- [ ] No Slack/email notification on deploy success/failure

### Security
- [x] Workload Identity Federation (no service account keys in GitHub)
- [x] Secrets in GCP Secret Manager (not in env vars)
- [x] Build args for public frontend keys (not secrets)
- [x] `--allow-unauthenticated` (public-facing services)
- [ ] No Cloud Armor / DDoS protection configured
- [ ] No VPC connector for Cloud SQL (using Cloud SQL proxy)

## Questions to Ask
1. Should we add a staging environment before deploying to production?
2. Should we implement rollback automation (e.g., `gcloud run services update-traffic --to-revisions`)?
3. Should we add post-deploy smoke tests to verify the deployment?
4. Should Docker builds use layer caching in GitHub Actions for faster builds?
5. Should we add deploy notifications to Slack or email?
6. Is the `ADMIN_SECRET` `--remove-secrets` flag intentional, or should it be added back?
