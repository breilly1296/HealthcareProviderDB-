# VerifyMyProvider Deployment Guide

**Last Updated:** 2026-04-16
**Audience:** Engineers deploying or operating the VerifyMyProvider stack.

---

## Overview

VerifyMyProvider runs as two independent Cloud Run services (backend + frontend) in front of a single Cloud SQL PostgreSQL instance. Deployments are fully automated via GitHub Actions using Workload Identity Federation — no long-lived service account keys exist. The same Docker images are used in local Compose, staging, and production.

```
main branch ── GH Actions ──┬─ Build backend image ─┐
                            │                        ├─ Artifact Registry ─ Cloud Run
                            └─ Build frontend image ─┘          │
                                                                 ▼
                                                          Cloud SQL (Postgres)
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | `>=20` (LTS) | Enforced via `engines` in root `package.json` |
| npm | 10+ | Ships with Node 20 |
| Docker Desktop | 24+ | Only needed for container builds / local Compose |
| Google Cloud SDK (`gcloud`) | Current | For log tailing, DB proxy, Secret Manager access |
| PostgreSQL client (`psql`) | 15 | Optional; `npm run db:studio` covers most cases |
| Git | 2.40+ | |

**Windows ARM64 + Node 24 caveat:** the frontend workspace ships a postinstall script (`packages/frontend/scripts/patch-next-swc.js`) that patches Next 14's SWC loader to use the WASM fallback. See the troubleshooting guide for details.

---

## Local Development

### Option A: Database in Docker, services natively (recommended)

```bash
# Clone & install (npm workspaces — install at root)
git clone https://github.com/breilly1296/HealthcareProviderDB-.git
cd HealthcareProviderDB
npm install

# Copy env template and fill in secrets
cp .env.example .env
# Optional: generate JWT_SECRET, ADMIN_SECRET, CSRF_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Start Postgres
npm run docker:dev              # docker compose -f docker-compose.dev.yml up -d

# Apply schema, generate Prisma client
npm run db:push
npm run db:generate

# Run both backend and frontend in watch mode (via concurrently)
npm run dev
# Backend → http://localhost:3001/health
# Frontend → http://localhost:3000
```

### Option B: Full stack in Docker Compose

```bash
npm run docker:build            # builds backend + frontend images
npm run docker:up               # brings up db + backend + frontend
npm run docker:down             # tears everything down
```

`docker-compose.yml` pins the backend to port `3001:8080` and the frontend to `3000:8080`. It uses a throwaway JWT secret and does not include Redis, reCAPTCHA, or Claude — those are off by default in local mode.

### Useful scripts

| Command | What it does |
|---------|--------------|
| `npm run build` | Builds `shared` → `backend` → `frontend` in order |
| `npm run test:backend` | Runs Jest suites for backend |
| `npm run db:studio` | Opens Prisma Studio on port 5555 |
| `npm run db:migrate` | `prisma migrate dev` (interactive) |
| `npm run lint` | Runs `lint` across all workspaces that define it |

### Seeding data for local development

NPI seed data is imported with the scripts in `/scripts/`. Typical pipeline:

```bash
# 1. Verify you can reach the DB and that baseline migrations are applied
npx tsx scripts/pre-import-check.ts

# 2. Import a filtered slice (much faster than the full 8 GB NPI dump)
npx tsx scripts/import-filtered-csv.ts --state=NY --zip=10001,10002,...

# 3. Post-import hygiene
npx tsx scripts/normalize-city-names.ts
npx tsx scripts/cleanup-deactivated-providers.ts
npx tsx scripts/verify-data-quality.ts
```

---

## Production Deployment (Google Cloud)

### Topology

| Resource | Value |
|----------|-------|
| GCP Project | `verifymyprovider-prod` |
| Region | `us-central1` |
| Backend service | `verifymyprovider-backend` |
| Frontend service | `verifymyprovider-frontend` |
| Artifact Registry repo | `us-central1-docker.pkg.dev/<project>/verifymyprovider` |
| Cloud SQL instance | `verifymyprovider-prod:us-central1:verifymyprovider-db` |
| Custom domain | `verifymyprovider.com` |

Each Cloud Run service runs `--min-instances=0 --max-instances=10 --concurrency=80 --memory=512Mi --cpu=1`. Cost for idle traffic is dominated by Cloud SQL (~$20–30/mo tier).

### CI/CD pipeline (.github/workflows/deploy.yml)

```
push to main
   │
   ├─ test            : npm ci, npm audit --audit-level=critical, jest, tsc
   │
   ├─ deploy-backend  : build + push image, run `prisma db push --accept-data-loss`
   │                    through Cloud SQL Auth Proxy, deploy Cloud Run, smoke test /health
   │
   ├─ deploy-frontend : build image with NEXT_PUBLIC_* build args injected,
   │                    deploy Cloud Run, smoke test GET /
   │
   └─ summary         : post URLs to GITHUB_STEP_SUMMARY
```

Key behaviors:
- **Images are tagged twice:** `:<git-sha>` and `:latest`. The `:<git-sha>` tag is what Cloud Run pins, so rollbacks don't race against `:latest`.
- **Schema changes are applied through a Cloud SQL Auth Proxy started inside the job.** The Secret Manager `DATABASE_URL` (which uses a Unix socket) is rewritten to TCP for the proxy.
- **Authentication is Workload Identity Federation.** Secrets `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` identify the runtime SA; there are no JSON service-account keys.

### Staging

`.github/workflows/deploy-staging.yml` fires on pushes to the `staging` branch. It uses the same templates but targets `verifymyprovider-backend-staging` / `verifymyprovider-frontend-staging` with max 2 instances.

**Promotion flow:**
```
feature branch → PR to staging → merge → deploy-staging.yml runs → verify
                 → PR staging → main  → merge → deploy.yml runs → production
```

### Secrets (GCP Secret Manager)

The following secrets must exist in Secret Manager before the first deploy:

| Secret | Purpose |
|--------|---------|
| `DATABASE_URL` | Cloud SQL connection string (Unix socket form) |
| `ADMIN_SECRET` | `X-Admin-Secret` header value for `/api/v1/admin/*` |
| `RECAPTCHA_SECRET_KEY` | Server-side reCAPTCHA v3 verification |
| `JWT_SECRET` | Signs auth access + refresh tokens |
| `RESEND_API_KEY` | Magic-link email delivery |
| `INSURANCE_ENCRYPTION_KEY` | AES-GCM key (+previous-key rotation) for insurance card PII |
| `CSRF_SECRET` | `csrf-csrf` double-submit secret |
| `ANTHROPIC_API_KEY` | Claude OCR in the frontend (`/api/insurance-card/extract`) |

GitHub Actions secrets (separate): `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `FRONTEND_URL`, `NEXT_PUBLIC_POSTHOG_KEY`.

---

## Hotfix vs Normal Release

### Normal release
1. Branch off `main`.
2. Open a PR → `test.yml` gates the merge.
3. Merge → `deploy.yml` runs end-to-end (≈8–12 min).
4. Inspect deploy summary URL + live smoke test (`curl https://api.../health`).

### Hotfix
1. Branch off `main` → minimal surgical change.
2. Fast-track review (skip staging only if the change is trivial and covered by tests).
3. Push to `main`.
4. If the fix breaks, immediately run the rollback workflow (see next section) — **do not** push a second hotfix on top until the bad revision has been re-routed.

---

## Rollback

Rollbacks are automated via `.github/workflows/rollback.yml`:

```
Actions → "Rollback Cloud Run Service" → Run workflow
  service: backend | frontend | both
  revision: (leave blank for previous, or paste revision name)
```

The workflow:
1. Lists the five most recent revisions of the target service(s).
2. Picks the previous revision (or the one you supplied).
3. Runs `gcloud run services update-traffic --to-revisions=<rev>=100`.
4. Re-runs the health/smoke checks.

**Cloud Run keeps old revisions around**, so you can roll back within seconds without rebuilding an image. Database changes, however, are NOT auto-reverted — if you shipped a destructive schema change, restore from the last Cloud SQL backup before rolling traffic.

---

## Post-Deploy Verification

The `deploy.yml` pipeline already hits `GET /health` on the backend and `GET /` on the frontend and fails the job on non-200. Additional manual checks worth running on significant releases:

```bash
# Backend deep health check (exercises DB + cache)
curl -s https://api.verifymyprovider.com/health | jq

# Smoke a key read endpoint
curl -s "https://api.verifymyprovider.com/api/v1/providers/search?state=NY&limit=5" | jq '.data.pagination'

# Confirm admin endpoints respond with 401 (not 503 — that means ADMIN_SECRET missing)
curl -s -o /dev/null -w "%{http_code}\n" https://api.verifymyprovider.com/api/v1/admin/health
```

**Logs:**
```bash
gcloud run services logs read verifymyprovider-backend --region=us-central1 --limit=100
gcloud run services logs tail verifymyprovider-backend --region=us-central1
```

---

## CI/CD Pipeline Files at a Glance

| File | Trigger | Purpose |
|------|---------|---------|
| `.github/workflows/deploy.yml` | push → `main` | Build + deploy to production |
| `.github/workflows/deploy-staging.yml` | push → `staging` | Build + deploy to staging |
| `.github/workflows/rollback.yml` | manual | Traffic-shift to an earlier revision |
| `.github/workflows/test.yml` | PR → `main`/`staging` | Gates merges: tests, audit, secret scan |
| `.github/workflows/playwright.yml` | PR / cron | E2E frontend smoke |
| `.github/workflows/security-scan.yml` | schedule | npm audit, dep review |
| `.github/workflows/codeql.yml` | schedule | CodeQL analysis |

---

## Environment Variables Checklist

Minimum to run locally (`.env`):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/healthcare_providers
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

Additional production-only variables (injected from Secret Manager):
`ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `JWT_SECRET`, `RESEND_API_KEY`, `INSURANCE_ENCRYPTION_KEY`, `CSRF_SECRET`, `ANTHROPIC_API_KEY`.

See `.env.example` for the authoritative list (with comments). Any missing variable causes either a clean 503 at runtime (e.g. `ADMIN_SECRET` → admin endpoints) or falls back to a safe default (e.g. no `REDIS_URL` → in-memory rate limiter).

---

## Known Gaps

- **No automated post-deploy integration suite** beyond two smoke curls.
- **No blue/green or canary rollout** — Cloud Run traffic-shifts are all-or-nothing in the current workflow.
- **No Cloud Armor / WAF** in front of Cloud Run (tracked in `20-known-issues`).

---

## Related Docs

- Architecture overview → `16-architecture-doc-output.md`
- Troubleshooting → `18-troubleshooting-doc-output.md`
- Development workflow / golden rule → `24-development-workflow-output.md`
- CI/CD deep dive → prompt `40-docker-cicd.md`
