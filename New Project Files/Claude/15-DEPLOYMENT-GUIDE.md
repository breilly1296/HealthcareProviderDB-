# VerifyMyProvider Deployment Guide

**Last Updated:** 2026-02-06

---

## Prerequisites

### Local Development
- **Node.js:** >= 20.0.0 (specified in root `package.json` engines)
- **npm:** Comes with Node.js (workspaces require npm 7+)
- **Docker Desktop:** Required for local PostgreSQL via Docker Compose
- **Git:** For version control
- **Windows ARM64 Note:** If running Node.js v24+ on Windows ARM64, the postinstall script (`packages/frontend/scripts/patch-next-swc.js`) automatically patches Next.js SWC to use WASM fallback

### Production
- **Google Cloud Platform** account with:
  - Cloud Run API enabled
  - Cloud SQL (PostgreSQL 15)
  - Artifact Registry
  - Secret Manager
  - Workload Identity Federation configured
- **GitHub repository** with Actions enabled
- **Domain:** verifymyprovider.com (configured for frontend)

---

## Local Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/breilly1296/HealthcareProviderDB-.git
cd HealthcareProviderDB
npm install
```

This installs all workspace dependencies. The frontend `postinstall` script will automatically patch Next.js SWC if on Windows ARM64.

### 2. Start Local Database

```bash
npm run docker:dev
```

This starts a PostgreSQL 15 Alpine container (`healthcaredb-postgres-dev`) on port 5432 with:
- User: `postgres`
- Password: `postgres`
- Database: `healthcare_providers`

### 3. Configure Environment

Create `.env` in `packages/backend/`:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/healthcare_providers
PORT=3001
NODE_ENV=development
```

Required secrets for full functionality (optional for basic development):
- `RECAPTCHA_SECRET_KEY` -- Google reCAPTCHA v3 (skipped in development)
- `ADMIN_SECRET` -- Admin endpoint authentication
- `REDIS_URL` -- Distributed rate limiting (falls back to in-memory)
- `ANTHROPIC_API_KEY` -- Insurance card OCR (frontend)
- `NEXT_PUBLIC_POSTHOG_KEY` -- Analytics (frontend)

### 4. Generate Prisma Client and Push Schema

```bash
npm run db:generate
npm run db:push
```

### 5. Start Development Servers

```bash
npm run dev
```

This runs concurrently:
- **Backend:** `tsx watch src/index.ts` on port 3001 (via `packages/backend`)
- **Frontend:** `next dev --port 3000` on port 3000 (via `packages/frontend`)

The shared types package is built first: `npm run build:shared`.

### 6. Verify Setup

- Backend health check: `http://localhost:3001/health`
- Frontend: `http://localhost:3000`
- API info: `http://localhost:3001/`

---

## Docker (Full Stack Local)

### Build and Run All Services

```bash
npm run docker:build
npm run docker:up
```

This starts 3 containers via `docker-compose.yml`:
- **db:** PostgreSQL 15 Alpine (port 5432)
- **backend:** Node 20 Alpine, Express API (port 3001 -> 8080 internal)
- **frontend:** Node 20 Alpine, Next.js standalone (port 3000 -> 8080 internal)

### Stop All Services

```bash
npm run docker:down
```

### Backend Dockerfile Details (`packages/backend/Dockerfile`)
- **Build stage:** Node 20 Alpine, installs all deps, builds shared + backend, generates Prisma client
- **Production stage:** Node 20 Alpine, production deps only, non-root user (`expressjs:nodejs`), health check via wget to `/health`, port 8080
- Security: Runs as non-root user (UID 1001)

### Frontend Dockerfile Details (`packages/frontend/Dockerfile`)
- **Deps stage:** Node 20 Alpine, installs all deps
- **Build stage:** Builds shared + Next.js with standalone output
- **Production stage:** Node 20 Alpine, standalone server, non-root user (`nextjs:nodejs`), health check, port 8080
- Build args: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`
- Telemetry disabled: `NEXT_TELEMETRY_DISABLED=1`

---

## CI/CD Pipeline (GitHub Actions)

### Production Deployment (`deploy.yml`)

**Trigger:** Push to `main` branch or manual `workflow_dispatch`

**Jobs:**
1. **test** -- Runs `npm ci`, backend tests, and build verification
2. **deploy-backend** -- (depends on test)
   - Authenticates via Workload Identity Federation (no long-lived keys)
   - Builds Docker image with Buildx (layer caching via GitHub Actions cache)
   - Pushes to Artifact Registry: `us-central1-docker.pkg.dev/[PROJECT]/verifymyprovider/verifymyprovider-backend:[SHA]`
   - Deploys to Cloud Run with:
     - 512Mi memory, 1 CPU
     - Min instances: 0 (scale to zero), Max: 10
     - Concurrency: 80
     - Cloud SQL instance attached
     - Secrets from Secret Manager: `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`
   - Post-deploy smoke test: Checks `/health` returns HTTP 200
3. **deploy-frontend** -- (depends on deploy-backend)
   - Same auth + build + push flow
   - Build arg: `NEXT_PUBLIC_API_URL` set to backend Cloud Run URL
   - Deploys to Cloud Run with same resource config
   - Secret: `ANTHROPIC_API_KEY` from Secret Manager
4. **summary** -- Prints deployment summary table

### Staging Deployment (`deploy-staging.yml`)

**Trigger:** Push to `staging` branch or manual `workflow_dispatch`

**Differences from production:**
- Service names: `verifymyprovider-backend-staging`, `verifymyprovider-frontend-staging`
- Docker tags: `staging-[SHA]`, `staging-latest`
- Max instances: **2** (vs 10 in production)
- Same Cloud SQL instance (shared database)

### Other Workflows
- `test.yml` -- Runs on PRs
- `playwright.yml` -- E2E testing
- `security-scan.yml` -- Security scanning

---

## Production Architecture

### Google Cloud Run Configuration
| Setting | Backend | Frontend |
|---------|---------|----------|
| Port | 8080 | 8080 |
| Memory | 512Mi | 512Mi |
| CPU | 1 | 1 |
| Min Instances | 0 | 0 |
| Max Instances | 10 | 10 |
| Concurrency | 80 | 80 |
| Auth | Unauthenticated | Unauthenticated |

### Secrets (GCP Secret Manager)
| Secret | Used By | Purpose |
|--------|---------|---------|
| `DATABASE_URL` | Backend | Cloud SQL connection string |
| `ADMIN_SECRET` | Backend | Admin endpoint authentication |
| `RECAPTCHA_SECRET_KEY` | Backend | Google reCAPTCHA v3 verification |
| `ANTHROPIC_API_KEY` | Frontend | Claude AI insurance card OCR |

### Environment Variables
| Variable | Value | Service |
|----------|-------|---------|
| `NODE_ENV` | production | Both |
| `FRONTEND_URL` | Cloud Run frontend URL | Backend (CORS) |
| `NEXT_PUBLIC_API_URL` | Backend Cloud Run URL + `/api/v1` | Frontend (build-time) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project key | Frontend (build-time) |

### CORS Configuration
Allowed origins (from `packages/backend/src/index.ts`):
- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- Cloud Run frontend URL
- `FRONTEND_URL` environment variable
- `localhost:3000` and `localhost:3001` in development

---

## Rollback Procedure

### Cloud Run Rollback
Cloud Run maintains revision history. To rollback:

```bash
# List revisions
gcloud run revisions list --service=verifymyprovider-backend --region=us-central1

# Route traffic to previous revision
gcloud run services update-traffic verifymyprovider-backend \
  --region=us-central1 \
  --to-revisions=[PREVIOUS_REVISION]=100
```

### Database Rollback
No automated database migration rollback is currently in place. Schema changes use `prisma db push` which is additive. For destructive changes:
1. Take a Cloud SQL backup before deployment
2. Restore from backup if needed

---

## Post-Deployment Verification

### Automated (in CI)
- Backend smoke test: `curl /health` must return HTTP 200 (in deploy.yml)

### Manual Verification Steps
1. Check backend health: `GET /health` -- confirms database connectivity, cache stats, memory usage
2. Check admin health (with secret): `GET /api/v1/admin/health` -- confirms verification log counts, retention stats
3. Verify provider search: `GET /api/v1/providers/search?state=FL&limit=5`
4. Verify plan search: `GET /api/v1/plans/search?limit=5`
5. Check frontend loads and can search providers
6. Verify CORS headers are correct for production domain

---

## Troubleshooting Deployment Issues

### Cloud Run Service Won't Start
- Check Cloud Run logs: `gcloud run services logs read verifymyprovider-backend --region=us-central1`
- Common issue: `DATABASE_URL` secret not accessible -- verify Secret Manager permissions

### Health Check Failing
- Backend uses `wget --no-verbose --tries=1 --spider http://localhost:8080/health`
- If database is unreachable, health returns 503 with `status: "degraded"`

### ADMIN_SECRET Not Configured
- Admin endpoints return 503 with `ADMIN_NOT_CONFIGURED` error code
- This is intentional for environments where admin access is not needed

### Docker Build Failures
- Ensure `--force` flag is used with npm install (handles workspace peer dependency conflicts)
- Prisma generate must run in the builder stage before the TypeScript build
