# VerifyMyProvider Development Workflow

**Last Updated:** 2026-02-07

## Golden Rule

**ALL code changes happen in Claude Code -> Push to GitHub -> Auto-deploys to Cloud Run**

Never edit code in Google Cloud Shell. It is a dead end.

Why this matters:
- **Cloud Shell edits do not persist** -- the VM resets and your changes vanish.
- **Cloud Shell edits never trigger auto-deploy** -- GitHub Actions only runs when commits land on `main` or `staging`.
- **Cloud Shell edits cannot be version-controlled** -- nobody can review, revert, or understand what changed.

The only safe path for any code change -- no matter how small -- is: **Claude Code (local) -> `git push` -> GitHub Actions CI/CD -> Cloud Run**.

---

## What Each Tool Is For

### Claude Code (Local Machine)

**USE FOR:**
- Writing and editing all source code (backend, frontend, shared)
- Fixing bugs and adding features
- Running local development servers (`npm run dev`)
- Running tests (`npm test`, `npm run test:e2e`)
- Building Docker images locally (`npm run docker:build`)
- Git commits and pushes to GitHub
- Running Prisma commands (`npm run db:generate`, `npm run db:migrate`)
- Editing configuration files (Dockerfiles, GitHub Actions workflows, Prisma schema)
- Updating environment examples (`.env.example` files)

**NEVER USE FOR:**
- Nothing off-limits -- Claude Code is the primary development tool for all code changes.

### Google Cloud Shell / gcloud CLI

**USE FOR:**
- Database queries via `psql` or Cloud SQL proxy
- Checking Cloud Run service logs (`gcloud logging read`)
- Viewing Cloud Run deployment status and revisions
- Managing GCP Secret Manager secrets (`gcloud secrets versions add`)
- Running infrastructure setup scripts (Cloud Armor, Cloud Scheduler, logging)
- One-off admin tasks (manually triggering Cloud Scheduler jobs, clearing cache)
- Checking Cloud SQL instance health
- DNS and SSL certificate management

**NEVER USE FOR:**
- Editing application code (TypeScript, React components, API routes)
- Making bug fixes that need to deploy
- Modifying Dockerfiles or CI/CD workflows
- Any change that should be tracked in version control

---

## Development Flow

```
+------------------+      +------------------+      +------------------------+
|   Claude Code    |      |     GitHub       |      |    Google Cloud         |
|  (Local Machine) | ---> |   (Repository)   | ---> |    (Cloud Run)          |
|                  |      |                  |      |                        |
|  Edit code       |      |  Push to main    |      |  deploy.yml runs:      |
|  Run tests       | git  |  or staging      | CI/  |    1. Run tests         |
|  Build locally   | push |                  | CD   |    2. Build Docker      |
|  Commit changes  | ---> |  PR triggers     | ---> |    3. Push to Artifact  |
|                  |      |  test.yml        |      |       Registry          |
|                  |      |                  |      |    4. Deploy to Cloud   |
|                  |      |                  |      |       Run               |
|                  |      |                  |      |    5. Smoke test        |
+------------------+      +------------------+      +------------------------+
                                                              |
                                                              v
                                                    +------------------------+
                                                    |  Live Services         |
                                                    |  verifymyprovider.com  |
                                                    +------------------------+
```

### Branch Strategy

| Branch    | Trigger            | Deploys To                                       |
|-----------|--------------------|--------------------------------------------------|
| `main`    | Push / merge       | **Production** Cloud Run (`verifymyprovider-backend`, `verifymyprovider-frontend`) |
| `staging` | Push / merge       | **Staging** Cloud Run (`verifymyprovider-backend-staging`, `verifymyprovider-frontend-staging`) |
| Any PR    | Pull request open  | Runs `test.yml` (tests only, no deploy)           |

### CI/CD Pipeline Detail (`.github/workflows/deploy.yml`)

The production deploy workflow executes these jobs in order:

1. **test** -- Checkout, install (`npm ci`), security audit (`npm audit --audit-level=critical`), run backend tests, build backend
2. **deploy-backend** (depends on test) -- Authenticate to GCP via Workload Identity Federation, build Docker image, push to `us-central1-docker.pkg.dev`, deploy to Cloud Run, smoke test `/health` endpoint
3. **deploy-frontend** (depends on deploy-backend) -- Build frontend Docker image with `NEXT_PUBLIC_API_URL` set to the backend URL, push to Artifact Registry, deploy to Cloud Run, smoke test root URL
4. **summary** -- Prints deployment summary with service URLs and status

The staging workflow (`.github/workflows/deploy-staging.yml`) is identical but targets `staging` branch and deploys to staging services with `--max-instances=2` (vs `10` for production).

### Additional CI Workflows

| Workflow                 | File                         | Trigger                          | Purpose                                      |
|--------------------------|------------------------------|----------------------------------|----------------------------------------------|
| PR Test Gate             | `test.yml`                   | PRs to `main`/`staging`          | Runs backend and frontend tests, security audit |
| Playwright E2E           | `playwright.yml`             | Push/PR on `main` (frontend paths) | End-to-end browser tests with Chromium        |
| Security Scan            | `security-scan.yml`          | Push/PR on `main`                | Gitleaks secret scanning                      |
| Rollback                 | `rollback.yml`               | Manual (`workflow_dispatch`)      | Roll back backend, frontend, or both          |

---

## Common Tasks

### Fix a Bug

1. **Identify the bug** -- Check Cloud Run logs or reproduce locally
   ```bash
   gcloud logging read "severity>=ERROR" --project=verifymyprovider-prod --freshness=1h --limit=20
   ```

2. **Fix locally in Claude Code** -- Edit the relevant source files in `packages/backend/src/` or `packages/frontend/`

3. **Test locally**
   ```bash
   # Start local dev servers (backend on :3001, frontend on :3000)
   npm run dev

   # Or run tests only
   npm test                    # backend unit tests
   npm run test -w @healthcareproviderdb/frontend   # frontend unit tests
   ```

4. **Commit and push**
   ```bash
   git add <changed-files>
   git commit -m "fix: description of the bug fix"
   git push origin main
   ```

5. **Verify deployment** -- GitHub Actions will run automatically. Check status at:
   - GitHub Actions tab: `https://github.com/breilly1296/HealthcareProviderDB-/actions`
   - The workflow runs tests, builds Docker images, deploys to Cloud Run, and runs smoke tests
   - Expect **5-10 minutes** from push to live on production

6. **Confirm the fix** -- Hit the live endpoints and/or check logs

### Add a Feature

1. **Plan the feature** -- Determine which packages need changes (backend API route? frontend page? shared types?)

2. **If schema changes are needed** -- Update `packages/backend/prisma/schema.prisma`
   ```bash
   # Generate Prisma client after schema changes
   npm run db:generate

   # Push schema to database (development)
   npm run db:push

   # Or create a migration (production-safe)
   npm run db:migrate
   ```

3. **Implement the feature in Claude Code**
   - Backend routes: `packages/backend/src/routes/`
   - Frontend pages: `packages/frontend/app/`
   - Shared types: `packages/shared/src/`

4. **Build the shared package first if types changed**
   ```bash
   npm run build:shared
   ```

5. **Test locally**
   ```bash
   npm run dev
   ```

6. **Consider creating a PR to `staging` first** for testing on the staging environment before merging to `main`

7. **Commit, push, and verify deployment** (same as bug fix step 4-6)

**Special considerations:**
- If adding new environment variables, update `.env.example` files and `docs/ENVIRONMENT.md`
- If adding new GCP secrets, add them to Secret Manager and reference them in `deploy.yml`
- `NEXT_PUBLIC_*` variables must be set at Docker build time (as `build-args` in the workflow)
- Runtime secrets (like `DATABASE_URL`) are injected by Cloud Run from Secret Manager

### Run Database Queries

**Connect via Google Cloud Shell (`psql`):**

```bash
# Connect to Cloud SQL from Cloud Shell
gcloud sql connect verifymyprovider-db --user=postgres --project=verifymyprovider-prod
```

When prompted for the password, retrieve it from **Proton Pass** under the entry **"VerifyMyProvider GCP"**.

**Connection details:**
- **Host:** `35.223.46.51`
- **Port:** `5432`
- **Database:** `providerdb`
- **Username:** `postgres`
- **Password:** Stored in Proton Pass ("VerifyMyProvider GCP")

**Common queries:**

```sql
-- Count providers by state
SELECT state, COUNT(*) FROM practice_locations GROUP BY state ORDER BY count DESC;

-- Check recent verifications
SELECT * FROM verification_logs ORDER BY created_at DESC LIMIT 20;

-- Check table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- View active connections
SELECT * FROM pg_stat_activity WHERE datname = 'providerdb';

-- Check for expired verifications
SELECT COUNT(*) FROM verification_logs WHERE expires_at < NOW();
```

**Using Prisma Studio (local dev):**
```bash
npm run db:studio
```
This opens a web-based database browser at `http://localhost:5555`.

### Check Deployment Status

**Option 1: GitHub Actions (recommended)**
- Go to: `https://github.com/breilly1296/HealthcareProviderDB-/actions`
- The "Deploy to Cloud Run" workflow shows test, backend deploy, frontend deploy, and summary status
- Each job shows pass/fail and detailed logs
- The summary step prints a table with service URLs and deployment result

**Option 2: gcloud CLI**
```bash
# List recent backend revisions
gcloud run revisions list \
  --service=verifymyprovider-backend \
  --region=us-central1 \
  --project=verifymyprovider-prod \
  --limit=5

# List recent frontend revisions
gcloud run revisions list \
  --service=verifymyprovider-frontend \
  --region=us-central1 \
  --project=verifymyprovider-prod \
  --limit=5

# Describe a specific service
gcloud run services describe verifymyprovider-backend \
  --region=us-central1 \
  --project=verifymyprovider-prod
```

**Option 3: GCP Console**
- Cloud Run: `https://console.cloud.google.com/run?project=verifymyprovider-prod`
- Artifact Registry: `https://console.cloud.google.com/artifacts?project=verifymyprovider-prod`

### View Logs

**Backend logs:**
```bash
# Recent backend logs (all severity)
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="verifymyprovider-backend"' \
  --project=verifymyprovider-prod \
  --limit=50 \
  --format="table(timestamp, severity, textPayload)"

# Backend errors only
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="verifymyprovider-backend" AND severity>=ERROR' \
  --project=verifymyprovider-prod \
  --freshness=1h \
  --format="table(timestamp, textPayload)"
```

**Frontend logs:**
```bash
# Recent frontend logs
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="verifymyprovider-frontend"' \
  --project=verifymyprovider-prod \
  --limit=50 \
  --format="table(timestamp, severity, textPayload)"

# Frontend errors only
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="verifymyprovider-frontend" AND severity>=ERROR' \
  --project=verifymyprovider-prod \
  --freshness=1h
```

**Filter for specific patterns:**
```bash
# Rate limit events
gcloud logging read 'textPayload=~"rate limit"' \
  --project=verifymyprovider-prod --freshness=1h

# Database connection issues
gcloud logging read 'textPayload=~"connection" AND severity>=WARNING' \
  --project=verifymyprovider-prod --freshness=24h

# Admin API access
gcloud logging read 'textPayload=~"Admin"' \
  --project=verifymyprovider-prod --freshness=24h

# Cloud Scheduler job execution
gcloud logging read 'resource.type="cloud_scheduler_job"' \
  --project=verifymyprovider-prod --limit=20
```

---

## Quick Reference

| Task | Tool | Command/Action |
|------|------|----------------|
| Edit code | Claude Code | Edit files in `packages/backend/`, `packages/frontend/`, `packages/shared/` |
| Run locally | Claude Code | `npm run dev` (starts backend on :3001 + frontend on :3000) |
| Run backend only | Claude Code | `npm run dev:backend` |
| Run frontend only | Claude Code | `npm run dev:frontend` |
| Run tests | Claude Code | `npm test` (backend tests) |
| Run E2E tests | Claude Code | `npm run test:e2e -w @healthcareproviderdb/frontend` |
| Build all | Claude Code | `npm run build` |
| Deploy to production | Claude Code | `git push origin main` (auto-deploys via GitHub Actions) |
| Deploy to staging | Claude Code | `git push origin staging` |
| Generate Prisma client | Claude Code | `npm run db:generate` |
| Open Prisma Studio | Claude Code | `npm run db:studio` |
| View backend logs | gcloud | `gcloud logging read 'resource.labels.service_name="verifymyprovider-backend"' --project=verifymyprovider-prod --limit=50` |
| View frontend logs | gcloud | `gcloud logging read 'resource.labels.service_name="verifymyprovider-frontend"' --project=verifymyprovider-prod --limit=50` |
| Connect to database | gcloud | `gcloud sql connect verifymyprovider-db --user=postgres --project=verifymyprovider-prod` |
| Check deployment status | GitHub | `https://github.com/breilly1296/HealthcareProviderDB-/actions` |
| Rollback a service | GitHub | Run `rollback.yml` workflow manually (Actions -> Rollback Cloud Run Service -> Run workflow) |
| Update a secret | gcloud | `echo -n "value" \| gcloud secrets versions add SECRET_NAME --data-file=- --project=verifymyprovider-prod` |
| Health check (backend) | curl | `curl https://verifymyprovider-backend-741434145252.us-central1.run.app/health` |
| Start local DB | Claude Code | `npm run docker:dev` (Docker Compose with PostgreSQL 15-alpine on :5432) |
| Stop local DB | Claude Code | `npm run docker:dev:down` |

---

## URLs

- **Frontend (Production):** `https://verifymyprovider.com`
- **Backend (Production):** `https://verifymyprovider-backend-741434145252.us-central1.run.app`
- **Frontend (Cloud Run direct):** `https://verifymyprovider-frontend-741434145252.us-central1.run.app`
- **GitHub Repository:** `https://github.com/breilly1296/HealthcareProviderDB-`
- **GitHub Actions:** `https://github.com/breilly1296/HealthcareProviderDB-/actions`
- **GCP Console (Cloud Run):** `https://console.cloud.google.com/run?project=verifymyprovider-prod`
- **GCP Console (Secret Manager):** `https://console.cloud.google.com/security/secret-manager?project=verifymyprovider-prod`
- **GCP Console (Cloud SQL):** `https://console.cloud.google.com/sql/instances?project=verifymyprovider-prod`
- **GCP Console (Cloud Scheduler):** `https://console.cloud.google.com/cloudscheduler?project=verifymyprovider-prod`

---

## Credentials (Proton Pass: "VerifyMyProvider GCP")

- **Database password:** Stored in Proton Pass under "VerifyMyProvider GCP"
- **GCP Project ID:** `verifymyprovider-prod`
- **Cloud SQL Instance:** `verifymyprovider-db` (connection name: `verifymyprovider-prod:us-central1:verifymyprovider-db`)
- **Database Host (public IP):** `35.223.46.51`
- **Database Name:** `providerdb`
- **Database User:** `postgres`
- **GCP Region:** `us-central1`
- **Artifact Registry:** `us-central1-docker.pkg.dev/verifymyprovider-prod/verifymyprovider`

### GitHub Actions Secrets (configured in repo settings)

| Secret | Purpose |
|--------|---------|
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation provider for keyless auth |
| `GCP_SERVICE_ACCOUNT` | Service account email used by CI/CD |
| `FRONTEND_URL` | Cloud Run frontend URL (passed to backend for CORS) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics project key (baked into frontend at build) |

### GCP Secret Manager Secrets (injected into Cloud Run at runtime)

| Secret | Used By | Purpose |
|--------|---------|---------|
| `DATABASE_URL` | Backend | PostgreSQL connection string for Cloud SQL |
| `ADMIN_SECRET` | Backend | Authentication for admin/cleanup API endpoints |
| `RECAPTCHA_SECRET_KEY` | Backend | Google reCAPTCHA v3 server-side verification |
| `ANTHROPIC_API_KEY` | Frontend | Claude API key for insurance card OCR feature |

---

## Emergency Procedures

### Something Broke in Production

1. **Check what deployed** -- Look at the most recent GitHub Actions run:
   ```
   https://github.com/breilly1296/HealthcareProviderDB-/actions
   ```

2. **Check the logs for errors:**
   ```bash
   gcloud logging read "severity>=ERROR" \
     --project=verifymyprovider-prod \
     --freshness=1h \
     --limit=50 \
     --format="table(timestamp, severity, textPayload)"
   ```

3. **Hit the health endpoint:**
   ```bash
   curl -s https://verifymyprovider-backend-741434145252.us-central1.run.app/health | jq
   ```

4. **Decide: fix forward or roll back**
   - If the fix is quick and obvious: fix in Claude Code, push to `main` (5-10 min to deploy)
   - If the fix is complex or unclear: roll back immediately (see below)

### Need to Rollback

**Option 1: GitHub Actions rollback workflow (recommended)**

1. Go to: `https://github.com/breilly1296/HealthcareProviderDB-/actions/workflows/rollback.yml`
2. Click "Run workflow"
3. Select which service to roll back: `backend`, `frontend`, or `both`
4. Optionally specify a revision name (leave empty to roll back to the previous revision)
5. Click "Run workflow"

The rollback workflow will:
- List recent revisions
- Route 100% of traffic to the target revision
- Run a smoke test to verify the rollback succeeded

**Option 2: gcloud CLI rollback**

```bash
# List recent revisions to find a good one
gcloud run revisions list \
  --service=verifymyprovider-backend \
  --region=us-central1 \
  --project=verifymyprovider-prod \
  --limit=5

# Route all traffic to the previous revision
gcloud run services update-traffic verifymyprovider-backend \
  --region=us-central1 \
  --project=verifymyprovider-prod \
  --to-revisions=REVISION_NAME=100
```

**Option 3: Revert the git commit and push**

```bash
git revert HEAD
git push origin main
```
This creates a new commit that undoes the last change and triggers a fresh deploy.

### Database Connection Lost

1. **Check Cloud SQL instance status:**
   ```bash
   gcloud sql instances describe verifymyprovider-db \
     --project=verifymyprovider-prod \
     --format='yaml(state, connectionName, ipAddresses)'
   ```

2. **Verify the DATABASE_URL secret is correct:**
   ```bash
   gcloud secrets versions access latest --secret=DATABASE_URL --project=verifymyprovider-prod
   ```

3. **Check if the Cloud SQL instance is running:**
   - Go to: `https://console.cloud.google.com/sql/instances/verifymyprovider-db?project=verifymyprovider-prod`
   - Verify status is "Running"

4. **If the password changed, update the secret:**
   ```bash
   echo -n "postgresql://postgres:NEW_PASSWORD@35.223.46.51:5432/providerdb" | \
     gcloud secrets versions add DATABASE_URL --data-file=- --project=verifymyprovider-prod
   ```
   Then push any commit to `main` to trigger a redeployment (Cloud Run picks up the latest secret version on deploy).

   Or use the provided script:
   ```powershell
   # PowerShell (Windows)
   .\scripts\update-secret.ps1 -DatabaseUrl "postgresql://..."

   # Bash (Cloud Shell)
   bash scripts/update-database-secret.sh "postgresql://..."
   ```

5. **If Cloud SQL is down, check for GCP incidents:**
   - `https://status.cloud.google.com/`

### Lessons Learned

- **Never put `next` in the root `package.json`** -- it overrides the frontend workspace version and causes SWC binary mismatches. Only shared dependencies (`prisma`, `csv-parse`, `pg`) belong at the root.
- **OneDrive can corrupt native `.node` binaries** via file sync. The project uses WASM fallbacks for Next.js SWC on Windows ARM64 via a postinstall patch (`packages/frontend/scripts/patch-next-swc.js`).
- **`NEXT_PUBLIC_*` variables are baked into the frontend at build time** -- changing them requires a new Docker build and deploy, not just a secret update.
- **Prisma schema requires manual PascalCase mapping** after running `prisma db pull` against PostgreSQL. Use `@@map("table_name")` on models and `@map("column_name")` on fields.
- **Cloud Run secrets are read at deploy time** -- if you update a secret in Secret Manager, you must redeploy (push to `main`) for the service to pick it up.
- **Staging max instances is 2 vs production 10** -- staging is scaled down to minimize cost.

---

## Local Development Setup

### Prerequisites

- Node.js >= 20 (see `package.json` `engines` field)
- Docker Desktop (for local PostgreSQL via `docker-compose.dev.yml`)
- gcloud CLI (for database connections and log access)
- Git (for version control and pushing to GitHub)

### First-Time Setup

```bash
# 1. Clone the repository
git clone https://github.com/breilly1296/HealthcareProviderDB-.git
cd HealthcareProviderDB-

# 2. Install dependencies (npm workspaces)
npm install

# 3. Start local PostgreSQL
npm run docker:dev

# 4. Set up environment files
cp .env.example .env
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env.local
# Edit .env files with local values (DATABASE_URL, etc.)

# 5. Generate Prisma client
npm run db:generate

# 6. Push schema to local database
npm run db:push

# 7. Start development servers
npm run dev
# Backend: http://localhost:3001
# Frontend: http://localhost:3000
```

### npm Scripts Reference (Root `package.json`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Build shared, then start backend + frontend concurrently |
| `npm run dev:backend` | Start backend dev server only (tsx watch, port 3001) |
| `npm run dev:frontend` | Start frontend dev server only (next dev, port 3000) |
| `npm run build` | Build shared, then backend, then frontend |
| `npm test` | Run backend tests (Jest) |
| `npm run db:generate` | Generate Prisma client from schema |
| `npm run db:push` | Push schema to database (dev only) |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio (database browser) |
| `npm run db:seed` | Seed the database with initial data |
| `npm run docker:dev` | Start local PostgreSQL via Docker Compose |
| `npm run docker:dev:down` | Stop local PostgreSQL |
| `npm run docker:build` | Build all Docker images (full stack) |
| `npm run docker:up` | Start all services via Docker Compose |
| `npm run clean` | Remove build artifacts across all workspaces |
| `npm run lint` | Run linting across all workspaces |

---

## Scheduled Background Jobs

The project uses Google Cloud Scheduler to run recurring maintenance tasks. These jobs are configured via `scripts/setup-cloud-scheduler.sh` and call backend admin endpoints:

| Job | Schedule | Endpoint | Purpose |
|-----|----------|----------|---------|
| `cleanup-expired-verifications` | Every hour (`0 * * * *` UTC) | `POST /api/v1/admin/cleanup-expired` | Delete expired verification_logs and plan acceptances |
| `cleanup-sync-logs` | Daily 3 AM ET (`0 3 * * *`) | `POST /api/v1/admin/cleanup/sync-logs` | Delete sync_logs older than 90 days |
| `recalculate-confidence-scores` | Daily 4 AM ET (`0 4 * * *`) | `POST /api/v1/admin/recalculate-confidence` | Recalculate provider confidence scores with time-based decay |

All scheduled jobs authenticate via the `X-Admin-Secret` header, with the secret pulled from GCP Secret Manager.

```bash
# View all scheduler jobs
gcloud scheduler jobs list --location=us-central1 --project=verifymyprovider-prod

# Manually trigger a job
gcloud scheduler jobs run cleanup-expired-verifications --location=us-central1 --project=verifymyprovider-prod

# View job execution details
gcloud scheduler jobs describe cleanup-sync-logs --location=us-central1 --project=verifymyprovider-prod
```

---

## Infrastructure Scripts

These scripts in the `scripts/` directory are for one-time GCP infrastructure setup. They are run in Google Cloud Shell, not in Claude Code:

| Script | Purpose |
|--------|---------|
| `setup-cloud-scheduler.sh` | Create/update Cloud Scheduler jobs for cleanup and confidence recalculation |
| `setup-cloud-armor.sh` | Set up Cloud Armor WAF + Global HTTPS Load Balancer |
| `setup-logging.sh` | Configure Cloud Logging with 30-day retention bucket |
| `update-database-secret.sh` | Update `DATABASE_URL` in GCP Secret Manager (bash) |
| `update-secret.ps1` | Update `DATABASE_URL` in GCP Secret Manager (PowerShell) |
| `create-anthropic-secret.sh` | Create `ANTHROPIC_API_KEY` secret in Secret Manager |
| `run-confidence-decay.sh` | Manually trigger confidence score recalculation |
