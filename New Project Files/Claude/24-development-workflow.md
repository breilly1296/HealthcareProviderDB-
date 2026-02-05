# VerifyMyProvider Development Workflow

**Last Updated:** 2026-02-05
**Generated From:** prompts/24-development-workflow.md

---

## Golden Rule

**ALL code changes happen in Claude Code -> Push to GitHub -> Auto-deploys to Cloud Run**

Never edit code in Google Cloud Shell. It is a dead end -- edits will not persist, will not trigger auto-deploy, and cannot be version controlled.

---

## What Each Tool Is For

### Claude Code (Local Machine)

**USE FOR:**
- Writing and editing code (backend, frontend, shared)
- Fixing bugs
- Adding features
- Running local tests (`npm test`, `npm run dev`)
- Git commits and pushes
- Prisma schema changes and migrations
- Code review and analysis

**NEVER USE FOR:**
- There are no restrictions -- Claude Code is the primary development tool for all code changes

### Google Cloud Shell / gcloud CLI

**USE FOR:**
- Database commands (connecting to Cloud SQL, running SQL queries)
- Checking Cloud Run logs (`gcloud run services logs read`)
- GCP infrastructure changes (IAM, networking, secrets)
- One-off admin tasks
- Verifying deployment status
- Managing GCP Secret Manager

**NEVER USE FOR:**
- Editing code
- Making fixes that need to deploy
- Any change that should be tracked in version control

---

## Development Flow

```
  Local Machine                  GitHub                    Google Cloud
  ============                  ======                    ============

  Claude Code                    main branch               Cloud Run
  (edit code)                    (push triggers)           (auto-deploy)
       |                              |                         |
       |   git push                   |                         |
       |----------------------------->|                         |
       |                              |  GitHub Actions         |
       |                              |  deploy.yml             |
       |                              |------------------------>|
       |                              |  1. Build Docker image  |
       |                              |  2. Push to Artifact    |
       |                              |     Registry            |
       |                              |  3. Deploy to Cloud Run |
       |                              |                         |
       |                              |  Backend deploys first  |
       |                              |  Frontend deploys after |
       |                              |  (depends on backend URL)|
```

---

## Project Setup

### Prerequisites
- Node.js >= 20.0.0
- npm (with workspaces support)
- Docker (for local PostgreSQL)
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/breilly1296/HealthcareProviderDB-.git
cd HealthcareProviderDB

# Install dependencies (all workspaces)
npm install

# Start local PostgreSQL via Docker
npm run docker:dev

# Generate Prisma client
npm run db:generate

# Push schema to local database
npm run db:push

# Seed the database (optional)
npm run db:seed
```

### Running Locally

```bash
# Start both backend and frontend concurrently
npm run dev

# Or start individually:
npm run dev:backend    # Express API on http://localhost:3001
npm run dev:frontend   # Next.js on http://localhost:3000
```

The `npm run dev` command first builds the shared package, then runs backend (`tsx watch`) and frontend (`next dev`) concurrently.

---

## Common Tasks

### Fix a Bug

1. Identify the bug (check logs, reproduce locally)
2. Make the fix in Claude Code
3. Test locally (`npm run dev` and verify)
4. Run tests: `npm test`
5. Commit and push:
   ```bash
   git add <changed-files>
   git commit -m "fix: description of the fix"
   git push origin main
   ```
6. GitHub Actions deploys automatically (~3-5 minutes)
7. Verify the fix at the production URL

### Add a Feature

1. Plan the feature (which packages need changes: backend, frontend, shared?)
2. If schema changes are needed:
   - Edit `packages/backend/prisma/schema.prisma`
   - Run `npm run db:generate` to update the Prisma client
   - Run `npm run db:push` (local) or create a migration with `npm run db:migrate`
3. Implement backend changes (routes, services, middleware)
4. Build shared types if needed: `npm run build:shared`
5. Implement frontend changes (pages, components, hooks)
6. Test locally
7. Commit and push to deploy

### Run Database Queries

**Local database (Docker):**
```bash
# Start local PostgreSQL
npm run docker:dev

# Open Prisma Studio (GUI)
npm run db:studio

# Or connect directly:
# Host: localhost:5432, User: postgres, Password: postgres, DB: healthcare_providers
```

**Production database (Google Cloud SQL):**
```bash
# Connect via gcloud (from Cloud Shell or with gcloud CLI)
gcloud sql connect verifymyprovider-db --user=postgres --project=verifymyprovider-prod

# Password is stored in Proton Pass under "VerifyMyProvider GCP"
```

### Check Deployment Status

1. **GitHub Actions:** Check the "Deploy to Cloud Run" workflow at:
   `https://github.com/breilly1296/HealthcareProviderDB-/actions`
2. **GCP Console:** Check Cloud Run services in the GCP Console
3. **Health endpoint:** `GET /health` on the backend URL returns database status, uptime, memory, and cache stats

### View Logs

```bash
# View backend logs (Cloud Run)
gcloud run services logs read verifymyprovider-backend --region=us-central1 --limit=100

# View frontend logs (Cloud Run)
gcloud run services logs read verifymyprovider-frontend --region=us-central1 --limit=100

# Filter for errors
gcloud run services logs read verifymyprovider-backend --region=us-central1 --limit=50 --log-filter="severity>=ERROR"
```

### Run Tests

```bash
# Backend unit tests
npm run test:backend

# Backend tests with watch mode
npm run test:backend -- --watch

# Backend coverage report
npm run test:backend -- --coverage

# Frontend unit tests
cd packages/frontend && npm test

# Frontend E2E tests (Playwright)
cd packages/frontend && npm run test:e2e

# Playwright with browser UI
cd packages/frontend && npm run test:e2e:ui
```

---

## Quick Reference

| Task | Tool | Command/Action |
|------|------|----------------|
| Start dev environment | Claude Code | `npm run dev` |
| Start local database | Claude Code | `npm run docker:dev` |
| Stop local database | Claude Code | `npm run docker:dev:down` |
| Run backend tests | Claude Code | `npm run test:backend` |
| Run frontend E2E tests | Claude Code | `npm run test:e2e` (in frontend dir) |
| Build all packages | Claude Code | `npm run build` |
| Build shared package only | Claude Code | `npm run build:shared` |
| Generate Prisma client | Claude Code | `npm run db:generate` |
| Open Prisma Studio | Claude Code | `npm run db:studio` |
| Push schema changes | Claude Code | `npm run db:push` |
| Lint code | Claude Code | `npm run lint` |
| Clean build artifacts | Claude Code | `npm run clean` |
| Connect to production DB | gcloud CLI | `gcloud sql connect verifymyprovider-db ...` |
| View production logs | gcloud CLI | `gcloud run services logs read ...` |
| Check deployment | GitHub | Actions tab in repository |

---

## All npm Scripts

### Root (monorepo orchestration)

| Script | Description |
|--------|-------------|
| `npm run dev` | Build shared, then run backend + frontend concurrently |
| `npm run build` | Build all workspaces |
| `npm run build:shared` | Build shared package only |
| `npm run build:backend` | Build backend only |
| `npm run build:frontend` | Build frontend only |
| `npm run docker:dev` | Start local PostgreSQL container |
| `npm run docker:dev:down` | Stop local PostgreSQL container |
| `npm run docker:build` | Build production Docker images |
| `npm run docker:up` | Start production Docker containers |
| `npm run docker:down` | Stop production Docker containers |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:seed` | Seed database with initial data |
| `npm run clean` | Remove build artifacts in all workspaces |
| `npm run lint` | Lint all workspaces |
| `npm run test` | Run backend tests |

### Backend (`packages/backend`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with tsx watch (hot reload) |
| `npm run build` | TypeScript compile |
| `npm run start` | Start compiled `dist/index.js` |
| `npm run test` | Run Jest tests |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:coverage` | Jest with coverage report |

### Frontend (`packages/frontend`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Next.js production build |
| `npm run start` | Start production server |
| `npm run lint` | Next.js lint |
| `npm run test` | Jest unit tests |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run test:e2e:ui` | Playwright with UI mode |
| `npm run test:e2e:headed` | Playwright in headed browser |
| `npm run postinstall` | Patches Next.js SWC for Windows ARM64 compatibility |

---

## URLs

- **Frontend (Production):** https://verifymyprovider.com
- **Backend (Production):** https://verifymyprovider-backend-741434145252.us-central1.run.app (Cloud Run)
- **Frontend (Cloud Run direct):** https://verifymyprovider-frontend-741434145252.us-central1.run.app
- **GitHub:** https://github.com/breilly1296/HealthcareProviderDB-
- **GCP Console:** https://console.cloud.google.com (project: verifymyprovider-prod)

---

## Credentials (Proton Pass: "VerifyMyProvider GCP")

- **Database password:** Stored in Proton Pass
- **Project ID:** `verifymyprovider-prod`
- **Database instance:** `verifymyprovider-db` (Cloud SQL, us-central1)
- **GCP secrets:** Managed via GCP Secret Manager (DATABASE_URL, ADMIN_SECRET, ANTHROPIC_API_KEY)

---

## CI/CD Pipeline

The project uses GitHub Actions with two workflows:

### deploy.yml (Deploy to Cloud Run)
- **Trigger:** Push to `main` branch, or manual dispatch
- **Flow:**
  1. Build backend Docker image and push to Artifact Registry
  2. Deploy backend to Cloud Run (512Mi memory, 0-10 instances)
  3. Build frontend Docker image (receives backend URL as build arg)
  4. Deploy frontend to Cloud Run (512Mi memory, 0-10 instances)
  5. Post-deployment summary
- **Authentication:** Workload Identity Federation (no service account keys)
- **Secrets injected:** DATABASE_URL, ANTHROPIC_API_KEY via GCP Secret Manager

### playwright.yml (E2E Tests)
- **Trigger:** Push or PR to `main` that changes `packages/frontend/**`
- **Flow:** Install deps, build shared + frontend, run Playwright tests
- **Artifacts:** Playwright report uploaded (30-day retention)

---

## Docker Development Setup

The `docker-compose.dev.yml` provides a local PostgreSQL 15 instance:
- **Container name:** `healthcaredb-postgres-dev`
- **Port:** 5432
- **Credentials:** postgres / postgres
- **Database:** `healthcare_providers`
- **Persistence:** Named volume `postgres_data_dev`
- **Health check:** `pg_isready` every 10 seconds

---

## Emergency Procedures

### Something Broke in Production

1. Check Cloud Run logs for errors:
   ```bash
   gcloud run services logs read verifymyprovider-backend --region=us-central1 --limit=50 --log-filter="severity>=ERROR"
   ```
2. Check the `/health` endpoint to see if the database is connected
3. Check GitHub Actions for recent deployment failures
4. If a recent deploy caused it, proceed to rollback

### Need to Rollback

1. In GCP Console, go to Cloud Run -> select the service
2. View Revisions tab -- previous revisions are still available
3. Route 100% traffic back to the previous revision
4. Fix the issue locally in Claude Code, then push a new commit

### Database Connection Lost

1. Check Cloud SQL instance status in GCP Console
2. Verify the Cloud SQL Auth Proxy connection (Cloud Run uses `--add-cloudsql-instances` flag)
3. Check that the `DATABASE_URL` secret in GCP Secret Manager is correct
4. If the instance is stopped, start it from the GCP Console

---

## Windows ARM64 Notes

- The frontend uses a `postinstall` script (`scripts/patch-next-swc.js`) to patch Next.js SWC for Windows ARM64 + Node 24 compatibility
- The `@next/swc-wasm-nodejs` package is included as a devDependency as the WASM fallback
- OneDrive can corrupt native `.node` binaries; WASM fallbacks are more reliable on OneDrive-synced projects
