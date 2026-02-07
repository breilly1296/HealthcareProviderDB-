# Docker & CI/CD Pipeline Review

## Architecture Overview

```
GitHub Repository (HealthcareProviderDB)
    |
    +--- push to `main` -----------> deploy.yml (Production)
    |       |
    |       +-- Job 1: test          Run Jest tests + security audit
    |       +-- Job 2: deploy-backend   Build image, push to Artifact Registry, deploy to Cloud Run
    |       +-- Job 3: deploy-frontend  Build image (with backend URL), push, deploy to Cloud Run
    |       +-- Job 4: summary          Post deployment summary to GitHub Step Summary
    |
    +--- push to `staging` --------> deploy-staging.yml (Staging)
    |       |
    |       (same structure as production, max 2 instances instead of 10,
    |        staging-prefixed image tags, -staging suffixed service names)
    |
    +--- pull_request to main/staging -> test.yml (PR Test Gate)
    |       |
    |       +-- Jest backend + frontend tests, security audit, build verification
    |
    +--- push/PR to main (frontend paths) -> playwright.yml (E2E Tests)
    |       |
    |       +-- Playwright browser tests against built frontend
    |
    +--- push/PR to main ----------> security-scan.yml (Gitleaks Secret Scan)
    |
    +--- manual dispatch ----------> rollback.yml (Cloud Run Rollback)
            |
            +-- Roll back backend, frontend, or both to a previous revision
```

---

## Docker Configuration

### docker-compose.yml -- Full Stack (3 Services)

**File:** `docker-compose.yml`

This compose file defines three services for local full-stack development or self-hosted deployment. It uses Compose file format version `3.8`.

| Service | Image / Build | Container Name | Port Mapping | Depends On | Restart |
|---------|---------------|----------------|-------------|------------|---------|
| `db` | `postgres:15-alpine` | `healthcaredb-postgres` | 5432:5432 | -- | `unless-stopped` |
| `backend` | Build from `packages/backend/Dockerfile` | `healthcaredb-backend` | 3001:8080 | `db` (service_healthy) | `unless-stopped` |
| `frontend` | Build from `packages/frontend/Dockerfile` | `healthcaredb-frontend` | 3000:8080 | `backend` | `unless-stopped` |

**Database Service (`db`):**
```yaml
image: postgres:15-alpine
environment:
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: postgres
  POSTGRES_DB: healthcare_providers
volumes:
  - postgres_data:/var/lib/postgresql/data
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres"]
  interval: 10s
  timeout: 5s
  retries: 5
```
- Named volume `postgres_data` provides persistent storage across container restarts.
- Health check runs `pg_isready` every 10 seconds, which the backend depends on via `condition: service_healthy`.

**Backend Service:**
```yaml
environment:
  DATABASE_URL: postgresql://postgres:postgres@db:5432/healthcare_providers
  PORT: 8080
  NODE_ENV: production
  CORS_ORIGIN: http://localhost:3000
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```
- The `CORS_ORIGIN` environment variable is set to `http://localhost:3000`, matching the frontend port mapping.
- The health check hits the `/health` endpoint defined in `packages/backend/src/index.ts` (line 93), which is placed before the rate limiter middleware so monitoring tools are not blocked.

**Frontend Service:**
```yaml
build:
  args:
    NEXT_PUBLIC_API_URL: http://localhost:3001/api/v1
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/"]
  interval: 30s
  timeout: 10s
  retries: 3
```
- `NEXT_PUBLIC_API_URL` is injected at build time as an `ARG`, then set as an `ENV` in the Dockerfile so Next.js bakes it into the client-side JavaScript bundle.
- The frontend depends on `backend` (start order only, not health-based).

### docker-compose.dev.yml -- Database Only

**File:** `docker-compose.dev.yml`

A minimal compose file for local development. Only the PostgreSQL database runs in Docker; the backend and frontend run natively via `npm run dev`.

```yaml
services:
  db:
    image: postgres:15-alpine
    container_name: healthcaredb-postgres-dev
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: healthcare_providers
    ports:
      - "5432:5432"
    volumes:
      - postgres_data_dev:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data_dev:
```

Convenience scripts in the root `package.json`:
- `npm run docker:dev` -- starts the dev database (`docker compose -f docker-compose.dev.yml up -d`)
- `npm run docker:dev:down` -- stops it
- `npm run docker:build` / `docker:up` / `docker:down` -- for the full-stack compose

---

## Dockerfiles

### Backend Dockerfile

**File:** `packages/backend/Dockerfile`

Uses a **multi-stage build** with two stages:

**Stage 1: Builder (`node:20-alpine`)**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl openssl-dev

# Copy workspace package files
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install all dependencies (including devDependencies for building)
RUN npm install --force

# Copy source and build
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
RUN cd packages/shared && npm run build
RUN cd packages/backend && npx prisma generate
RUN cd packages/backend && npm run build
```

Key observations:
- Copies only `shared` and `backend` workspace package.json files (not `frontend`) to leverage Docker layer caching effectively.
- Builds the shared package first, then generates the Prisma client, then builds the backend.
- `openssl` and `openssl-dev` are required for Prisma's query engine on Alpine.
- `--force` flag is used on `npm install` to handle any peer dependency conflicts in the monorepo.

**Stage 2: Runner (`node:20-alpine`)**
```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 expressjs

ENV NODE_ENV=production

# Production-only dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN npm install --omit=dev --force

# Copy built artifacts from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/prisma ./packages/backend/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

RUN chown -R expressjs:nodejs /app
USER expressjs

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "packages/backend/dist/index.js"]
```

Key observations:
- **Non-root user:** `expressjs:nodejs` (UID/GID 1001) for security.
- **Production dependencies only:** `--omit=dev` in the runner stage excludes TypeScript, testing tools, etc.
- **Prisma client** is copied from the builder's `node_modules/.prisma` and `node_modules/@prisma` directories.
- **Health check** hits the `/health` endpoint with a 5-second start period grace.
- **Port 8080** matches Cloud Run's default expectation.

### Frontend Dockerfile

**File:** `packages/frontend/Dockerfile`

Also a **multi-stage build** with two stages:

**Stage 1: Builder (`node:20-alpine`)**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/
RUN npm install --force

COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
RUN cd packages/shared && npm run build

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ARG NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY}

ENV NEXT_TELEMETRY_DISABLED=1
RUN cd packages/frontend && npm run build
```

Key observations:
- `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_POSTHOG_KEY` are build-time arguments that get baked into the Next.js client bundle. This is the correct pattern since `NEXT_PUBLIC_*` variables must be available at build time.
- `NEXT_TELEMETRY_DISABLED=1` prevents Next.js from sending telemetry during the Docker build.
- The frontend `next.config.js` has `output: 'standalone'` configured, which produces a minimal self-contained server.

**Stage 2: Runner (`node:20-alpine`)**
```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy Next.js standalone build
COPY --from=builder /app/packages/frontend/.next/standalone ./
COPY --from=builder /app/packages/frontend/.next/static ./packages/frontend/.next/static
COPY --from=builder /app/packages/frontend/public ./packages/frontend/public

RUN chown -R nextjs:nodejs /app
USER nextjs

ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["node", "packages/frontend/server.js"]
```

Key observations:
- **Standalone output mode:** The runner only contains the minimal files needed to serve the app -- no `node_modules` directory is copied. Next.js standalone bundles all needed dependencies into the output.
- **Non-root user:** `nextjs:nodejs` (UID/GID 1001).
- **`HOSTNAME=0.0.0.0`** is required for the Next.js standalone server to listen on all interfaces (necessary for Docker / Cloud Run).
- The runner image is significantly smaller than the builder since it excludes all build tooling and full `node_modules`.

---

## CI/CD Pipelines

### 1. Production Deployment (`deploy.yml`)

**File:** `.github/workflows/deploy.yml`

**Trigger:** Push to `main` branch or manual `workflow_dispatch`.

**Workflow-level environment variables:**
```yaml
env:
  GCP_REGION: us-central1
  BACKEND_SERVICE: verifymyprovider-backend
  FRONTEND_SERVICE: verifymyprovider-frontend
```

#### Job 1: `test` -- Run Tests

Runs before any deployment. Acts as a gate to prevent deploying broken code.

| Step | Action |
|------|--------|
| Checkout code | `actions/checkout@v4` |
| Setup Node.js 20 | `actions/setup-node@v4` with npm cache |
| Install dependencies | `npm ci` |
| Security audit | `npm audit --audit-level=critical` |
| Run backend tests | `npm test` in `packages/backend` |
| Build backend | `npm run build` in `packages/backend` |

#### Job 2: `deploy-backend` -- Build & Deploy Backend

**Depends on:** `test` (must pass first)

**Permissions:** `contents: read`, `id-token: write` (for Workload Identity Federation OIDC)

**Outputs:** `backend_url` (consumed by `deploy-frontend`)

Steps:

1. **Checkout code** -- `actions/checkout@v4`
2. **Authenticate to GCP** -- `google-github-actions/auth@v2` using Workload Identity Federation
   ```yaml
   workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
   service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}
   ```
3. **Set up Cloud SDK** -- `google-github-actions/setup-gcloud@v2`
4. **Configure Docker for Artifact Registry** -- `gcloud auth configure-docker us-central1-docker.pkg.dev`
5. **Set up Docker Buildx** -- `docker/setup-buildx-action@v3` (enables advanced build features)
6. **Build and push** -- `docker/build-push-action@v6`
   ```yaml
   tags:
     us-central1-docker.pkg.dev/<PROJECT>/verifymyprovider/verifymyprovider-backend:<SHA>
     us-central1-docker.pkg.dev/<PROJECT>/verifymyprovider/verifymyprovider-backend:latest
   cache-from: type=gha
   cache-to: type=gha,mode=max
   ```
   - Docker layer caching via GitHub Actions cache (`type=gha`) is enabled for faster builds.
   - Images are dual-tagged: immutable `$GITHUB_SHA` and mutable `latest`.
7. **Deploy to Cloud Run** -- `google-github-actions/deploy-cloudrun@v2`

   **Cloud Run Backend Configuration:**

   | Setting | Value |
   |---------|-------|
   | Port | 8080 |
   | Memory | 512Mi |
   | CPU | 1 |
   | Min instances | 0 (scale to zero) |
   | Max instances | 10 |
   | Concurrency | 80 requests per instance |
   | Cloud SQL connection | `verifymyprovider-prod:us-central1:verifymyprovider-db` |
   | Authentication | `--allow-unauthenticated` (public API) |

   **Environment variables:**
   - `NODE_ENV=production`
   - `FRONTEND_URL` -- from GitHub secret (used for CORS)

   **Secrets from GCP Secret Manager:**
   - `DATABASE_URL=DATABASE_URL:latest`
   - `ADMIN_SECRET=ADMIN_SECRET:latest`
   - `RECAPTCHA_SECRET_KEY=RECAPTCHA_SECRET_KEY:latest`

8. **Smoke test** -- Waits 10 seconds, then checks `/health` returns HTTP 200:
   ```bash
   HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "${{ steps.deploy.outputs.url }}/health")
   if [ "$HEALTH" != "200" ]; then
     echo "Health check failed with status $HEALTH"
     exit 1
   fi
   ```

#### Job 3: `deploy-frontend` -- Build & Deploy Frontend

**Depends on:** `deploy-backend` (needs the deployed backend URL for `NEXT_PUBLIC_API_URL`)

Steps mirror the backend job, with these differences:

- **Build args** inject the backend URL and PostHog analytics key:
  ```yaml
  build-args: |
    NEXT_PUBLIC_API_URL=${{ needs.deploy-backend.outputs.backend_url }}/api/v1
    NEXT_PUBLIC_POSTHOG_KEY=${{ secrets.NEXT_PUBLIC_POSTHOG_KEY }}
  ```
- **Cloud Run configuration** is identical to backend (512Mi, 1 CPU, 0-10 instances, concurrency 80) except:
  - No Cloud SQL instance attached
  - No `FRONTEND_URL` env var needed
  - Secret: `ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest` (for server-side insurance card OCR via Anthropic API)
- **Smoke test** checks the root URL returns HTTP 200.

#### Job 4: `summary` -- Deployment Summary

**Runs:** Always (`if: always()`), even if previous jobs fail.

Writes a markdown table to `$GITHUB_STEP_SUMMARY` showing the result and URL of each service:

```
## Deployment Summary

| Service | Status | URL |
|---------|--------|-----|
| Backend | success | https://verifymyprovider-backend-xxxxx.run.app |
| Frontend | success | https://verifymyprovider-frontend-xxxxx.run.app |
```

---

### 2. Staging Deployment (`deploy-staging.yml`)

**File:** `.github/workflows/deploy-staging.yml`

**Trigger:** Push to `staging` branch or manual `workflow_dispatch`.

Structurally identical to the production pipeline with these differences:

| Aspect | Production | Staging |
|--------|-----------|---------|
| Branch trigger | `main` | `staging` |
| Backend service name | `verifymyprovider-backend` | `verifymyprovider-backend-staging` |
| Frontend service name | `verifymyprovider-frontend` | `verifymyprovider-frontend-staging` |
| Image tag prefix | `<SHA>`, `latest` | `staging-<SHA>`, `staging-latest` |
| Max instances | 10 | **2** |
| Summary title | "Deployment Summary" | "Staging Deployment Summary" |

All other configuration (Node.js 20, GCP auth, memory/CPU, secrets, health checks, smoke tests) is identical.

---

### 3. PR Test Gate (`test.yml`)

**File:** `.github/workflows/test.yml`

**Trigger:** Pull requests targeting `main` or `staging` branches.

This workflow ensures all PRs pass tests before merge. It runs a single job:

| Step | Description |
|------|-------------|
| Checkout code | `actions/checkout@v4` |
| Setup Node.js 20 | With npm cache |
| Install dependencies | `npm ci` |
| Security audit | `npm audit --audit-level=critical` |
| Run backend tests | `npm test` in `packages/backend` |
| Build backend | `npm run build` in `packages/backend` |
| Run frontend tests | `npm test` in `packages/frontend` |

This is the only workflow that runs both backend and frontend tests. The deploy workflows only run backend tests as a pre-deploy gate.

---

### 4. Playwright E2E Tests (`playwright.yml`)

**File:** `.github/workflows/playwright.yml`

**Trigger:** Push or pull request to `main`, filtered to `packages/frontend/**` path changes only.

**Timeout:** 15 minutes

| Step | Description |
|------|-------------|
| Checkout | `actions/checkout@v4` |
| Setup Node.js 20 | With npm cache |
| Install dependencies | `npm ci` |
| Install Playwright browsers | `npx playwright install --with-deps chromium` (Chromium only) |
| Build shared package | `npm run build` in `packages/shared` |
| Build frontend | `npm run build` in `packages/frontend` with `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1` |
| Run Playwright tests | `npm run test:e2e` in `packages/frontend` with `PLAYWRIGHT_BASE_URL=http://localhost:3000` |
| Upload report | `actions/upload-artifact@v4` saves `playwright-report/` for 30 days (runs always, even on failure) |

Key observations:
- Only installs Chromium (not Firefox or WebKit) to keep CI fast.
- The test report is always uploaded as an artifact, even on test failure, for debugging.
- Path filtering means this workflow only runs when frontend code changes.

---

### 5. Security Scan (`security-scan.yml`)

**File:** `.github/workflows/security-scan.yml`

**Trigger:** Push to `main` or pull requests targeting `main`.

**Permissions:** `contents: read`

Runs a single job using **Gitleaks** to scan for accidentally committed secrets:

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4
    with:
      fetch-depth: 0       # Full history for thorough scanning

  - name: Run gitleaks
    uses: gitleaks/gitleaks-action@v2
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- `fetch-depth: 0` ensures the entire git history is scanned, not just the latest commit.
- This catches secrets in any commit, including ones that were "removed" in later commits but still exist in history.

---

### 6. Rollback Automation (`rollback.yml`)

**File:** `.github/workflows/rollback.yml`

**Trigger:** Manual dispatch only (`workflow_dispatch`).

**Inputs:**

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `service` | Choice: `backend` / `frontend` / `both` | Yes | Which service(s) to roll back |
| `revision` | String | No | Specific revision name; if empty, rolls back to previous revision |

The workflow contains two parallel jobs (`rollback-backend` and `rollback-frontend`) that run conditionally based on the `service` input.

**Each rollback job follows the same pattern:**

1. **Authenticate to GCP** via Workload Identity Federation
2. **List recent revisions** -- Shows the last 5 revisions in GitHub Step Summary for reference
   ```bash
   gcloud run revisions list \
     --service=verifymyprovider-backend \
     --region=us-central1 \
     --limit=5
   ```
3. **Determine target revision** -- Uses the specified revision if provided, otherwise queries for the second-most-recent revision:
   ```bash
   PREVIOUS=$(gcloud run revisions list \
     --service=verifymyprovider-backend \
     --region=us-central1 \
     --limit=2 \
     --format='value(REVISION)' | tail -n 1)
   ```
4. **Route 100% traffic** to the target revision:
   ```bash
   gcloud run services update-traffic verifymyprovider-backend \
     --region=us-central1 \
     --to-revisions=<revision>=100
   ```
5. **Smoke test** -- Verifies the rolled-back service returns HTTP 200
6. **Summary** -- Posts rollback result to GitHub Step Summary

This provides a safe, auditable rollback mechanism that does not require rebuilding or redeploying images.

---

## GCP Infrastructure

### Artifact Registry

| Property | Value |
|----------|-------|
| Location | `us-central1-docker.pkg.dev` |
| Repository | `verifymyprovider` |
| Backend image | `verifymyprovider-backend` |
| Frontend image | `verifymyprovider-frontend` |
| Tag strategy | `$GITHUB_SHA` (immutable) + `latest` (mutable) |

### Cloud Run Services

| Service | Description | Min/Max Instances | Memory | CPU |
|---------|-------------|-------------------|--------|-----|
| `verifymyprovider-backend` | Express API | 0 / 10 | 512Mi | 1 |
| `verifymyprovider-frontend` | Next.js app | 0 / 10 | 512Mi | 1 |
| `verifymyprovider-backend-staging` | Staging API | 0 / 2 | 512Mi | 1 |
| `verifymyprovider-frontend-staging` | Staging frontend | 0 / 2 | 512Mi | 1 |

All services:
- Region: `us-central1`
- Concurrency: 80 requests per instance
- Scale to zero when idle (cost optimization)
- Public access (`--allow-unauthenticated`)

### Cloud SQL

| Property | Value |
|----------|-------|
| Instance name | `verifymyprovider-db` |
| Project | `verifymyprovider-prod` |
| Type | PostgreSQL 15 |
| Region | `us-central1` |
| Connection | Cloud SQL proxy (automatic in Cloud Run via `--add-cloudsql-instances`) |

### Secret Manager

| Secret | Used By | Purpose |
|--------|---------|---------|
| `DATABASE_URL` | Backend | PostgreSQL connection string (via Cloud SQL proxy) |
| `ADMIN_SECRET` | Backend | Admin endpoint authentication |
| `RECAPTCHA_SECRET_KEY` | Backend | Server-side reCAPTCHA verification |
| `ANTHROPIC_API_KEY` | Frontend | Insurance card OCR via Claude API (server-side route) |

### Authentication -- Workload Identity Federation

The deployment uses Workload Identity Federation instead of long-lived service account keys:

1. GitHub Actions requests an OIDC token (`id-token: write` permission)
2. The OIDC token is exchanged for short-lived GCP credentials via the workload identity provider
3. The service account (`GCP_SERVICE_ACCOUNT`) has minimal permissions for deploying to Cloud Run

**GitHub Secrets required:**
- `GCP_WORKLOAD_IDENTITY_PROVIDER` -- The full WIF provider resource name
- `GCP_SERVICE_ACCOUNT` -- Email of the GCP service account
- `GCP_PROJECT_ID` -- The GCP project ID
- `FRONTEND_URL` -- The production frontend URL (for backend CORS)
- `NEXT_PUBLIC_POSTHOG_KEY` -- PostHog analytics key

---

## Pipeline Flow Diagram

### Production Deploy (`main` branch push)

```
[push to main]
      |
      v
  +-------+
  | test  |  (Jest + npm audit)
  +-------+
      |
      | (on success)
      v
  +-----------------+
  | deploy-backend  |  Build -> Push to AR -> Deploy to Cloud Run -> Smoke test
  +-----------------+
      |
      | outputs: backend_url
      v
  +------------------+
  | deploy-frontend  |  Build (with backend URL) -> Push to AR -> Deploy -> Smoke test
  +------------------+
      |
      v (always)
  +---------+
  | summary |  Write status table to GitHub Step Summary
  +---------+
```

### PR Validation (pull request)

```
[pull request to main/staging]
      |
      +---> test.yml     (Jest backend + frontend, security audit, build check)
      +---> security-scan.yml  (Gitleaks secret scanning)
      +---> playwright.yml     (E2E tests, only if frontend/* changed)
```

---

## Checklist

### Docker

- [x] Backend Dockerfile -- Multi-stage build, Node 20 Alpine, non-root user (`expressjs`), health check on `/health`
- [x] Frontend Dockerfile -- Multi-stage build, Node 20 Alpine, non-root user (`nextjs`), Next.js standalone output, health check on `/`
- [x] `docker-compose.yml` -- Full-stack with 3 services (db, backend, frontend)
- [x] `docker-compose.dev.yml` -- Database-only for local development
- [x] Health checks on all services (PostgreSQL: `pg_isready`, Backend: `/health`, Frontend: `/`)
- [x] Named volumes for data persistence (`postgres_data`, `postgres_data_dev`)
- [x] Multi-stage builds on both Dockerfiles (builder + runner stages)
- [x] Production-only dependencies in runner stages (`--omit=dev`)
- [x] Non-root users in both containers
- [ ] No `.dockerignore` files -- `node_modules`, `.git`, `.next`, and other unnecessary files are sent to the Docker build context, increasing build time and image size

### CI/CD

- [x] Automatic deploy on push to `main`
- [x] Staging environment on push to `staging` (separate service names, max 2 instances)
- [x] Manual dispatch option on both deploy workflows
- [x] Workload Identity Federation (no long-lived service account keys)
- [x] Artifact Registry for Docker image storage
- [x] Cloud Run deployment with proper resource configuration
- [x] Frontend depends on backend URL (sequential job dependency)
- [x] Deployment summary with service status table
- [x] Rollback automation via `rollback.yml` (manual dispatch, per-service or both)
- [x] Post-deploy smoke tests on both backend (`/health`) and frontend (`/`)
- [x] Docker layer caching via GitHub Actions cache (`cache-from: type=gha`, `cache-to: type=gha,mode=max`)
- [x] PR test gate (`test.yml`) runs on all PRs to `main` and `staging`
- [x] Security scanning (Gitleaks) on pushes and PRs
- [x] E2E testing (Playwright) on frontend changes
- [x] Pre-deploy test execution (Jest + security audit) in both deploy pipelines
- [ ] No Slack/email/webhook notification on deploy success or failure
- [ ] No canary or blue-green deployment strategy (direct traffic switch)

### Security

- [x] Workload Identity Federation -- no service account JSON keys stored in GitHub
- [x] Secrets stored in GCP Secret Manager -- `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `ANTHROPIC_API_KEY`
- [x] Build args for public-only frontend keys (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`)
- [x] Non-root Docker users in both containers
- [x] Gitleaks scanning prevents accidental secret commits
- [x] `npm audit --audit-level=critical` in test jobs catches known vulnerabilities
- [x] `--allow-unauthenticated` on Cloud Run (appropriate for public-facing web app)
- [ ] No Cloud Armor / DDoS protection configured
- [ ] No VPC connector for Cloud SQL (using Cloud SQL proxy, which is secure but a VPC connector offers additional network isolation)

---

## Open Questions

1. **Notifications:** Should deploy success/failure notifications be sent to Slack, email, or a webhook? Both deploy pipelines currently only write to GitHub Step Summary.

2. **`.dockerignore` files:** No `.dockerignore` files exist in the repository. Adding them would exclude `node_modules/`, `.git/`, `.next/`, test files, and documentation from the Docker build context, reducing build times significantly.

3. **Canary deployments:** The current approach deploys directly with 100% traffic to the new revision. Should Cloud Run traffic splitting be used for gradual rollouts (e.g., 10% -> 50% -> 100%)?

4. **Staging database isolation:** Both staging and production backend services reference the same Cloud SQL instance (`verifymyprovider-prod:us-central1:verifymyprovider-db`). The `DATABASE_URL` secret may point to different databases, but this should be verified. True isolation would use a separate Cloud SQL instance for staging.

5. **Frontend E2E against live backend:** The Playwright workflow builds the frontend with `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1` but does not start a backend service. E2E tests may be limited to frontend-only rendering tests, or they may mock API calls. This warrants review.

6. **Image cleanup:** There is no Artifact Registry cleanup policy. Over time, old images tagged with `$GITHUB_SHA` will accumulate. A lifecycle policy or cleanup workflow should be considered.
