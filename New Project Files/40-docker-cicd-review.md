# Docker & CI/CD Pipeline Review

**Generated:** 2026-02-18
**Prompt:** 40-docker-cicd.md
**Status:** Production-ready with mature CI/CD pipeline; minor improvements available

---

## Summary

The HealthcareProviderDB project has a well-structured Docker and CI/CD pipeline deploying to Google Cloud Run via GitHub Actions. Both Dockerfiles use multi-stage builds, non-root users, and health checks. The deployment pipeline includes Workload Identity Federation (no long-lived keys), GCP Secret Manager integration, automated database migrations, smoke tests, and a deployment summary. A staging environment, rollback automation, security scanning (Gitleaks + CodeQL), and E2E testing (Playwright) are all in place.

---

## Verified Checklist

### Docker

- [x] **Backend Dockerfile** (`packages/backend/Dockerfile`) -- Multi-stage build (builder + runner), Node 20 Alpine, non-root user (`expressjs:nodejs`), `HEALTHCHECK` directive, Prisma client copied from builder, production-only dependencies in runner stage
- [x] **Frontend Dockerfile** (`packages/frontend/Dockerfile`) -- Multi-stage build (builder + runner), Node 20 Alpine, non-root user (`nextjs:nodejs`), Next.js standalone output, `HEALTHCHECK` directive, build args for `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- [x] **docker-compose.yml** -- Full 3-service stack: `db` (postgres:15-alpine with named volume + healthcheck), `backend` (depends on db healthy), `frontend` (depends on backend). Port mapping: 5432, 3001:8080, 3000:8080
- [x] **docker-compose.dev.yml** -- Database-only for local development, separate named volume (`postgres_data_dev`)
- [x] **Multi-stage builds** -- Both Dockerfiles use `AS builder` / `AS runner` stages, keeping production images lean
- [x] **`.dockerignore`** -- Comprehensive exclusions: `node_modules/`, `dist/`, `.next/`, `.env*`, `.git/`, `coverage/`, test files, `*.md` (except README), `*.csv`, IDE files
- [x] **Health checks on all services** -- db: `pg_isready -U postgres`; backend: `wget ... /health`; frontend: `wget ... /`
- [x] **Named volumes** -- `postgres_data` (prod compose), `postgres_data_dev` (dev compose)

### CI/CD Workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| Deploy | `deploy.yml` | push to `main` + manual | Full production deploy (test -> backend -> frontend -> summary) |
| Deploy Staging | `deploy-staging.yml` | push to `staging` + manual | Staging deploy (max 2 instances vs 10, staging-prefixed tags) |
| PR Test Gate | `test.yml` | PR to main/staging | Tests + security audit + hardcoded secret scan + dependency review |
| Playwright E2E | `playwright.yml` | push/PR to main (frontend paths) | Chromium E2E tests + report artifact |
| Security Scan | `security-scan.yml` | push to main, PR to main/staging | Gitleaks secret scanning |
| CodeQL | `codeql.yml` | push/PR to main/staging + weekly | SAST analysis for JS/TS |
| Rollback | `rollback.yml` | manual dispatch | Roll back backend, frontend, or both to previous revision |

- [x] **Automatic deploy on push to main** -- `deploy.yml` triggers on `push: branches: [main]`
- [x] **Manual dispatch option** -- Both deploy workflows support `workflow_dispatch`
- [x] **Workload Identity Federation** -- `google-github-actions/auth@v2` with `workload_identity_provider` + `service_account` secrets, `id-token: write` permissions
- [x] **Artifact Registry** -- Images pushed to `us-central1-docker.pkg.dev` with SHA and `latest` tags
- [x] **Docker layer caching** -- `docker/build-push-action@v6` with `cache-from: type=gha` / `cache-to: type=gha,mode=max` (GitHub Actions cache)
- [x] **Cloud Run deployment** -- Proper configuration: 512Mi memory, 1 CPU, 0-10 instances (0-2 staging), concurrency 80
- [x] **Frontend depends on backend URL** -- `deploy-frontend` job `needs: deploy-backend`, uses `backend_url` output for `NEXT_PUBLIC_API_URL`
- [x] **Deployment summary** -- Always-run summary job writes service status table to `$GITHUB_STEP_SUMMARY`
- [x] **Staging environment** -- Separate `deploy-staging.yml` with `-staging` service names, max 2 instances
- [x] **Rollback automation** -- `rollback.yml` with service chooser (backend/frontend/both), specific or previous revision, includes smoke tests
- [x] **Post-deploy smoke tests** -- Both deploy workflows curl the health endpoint after deployment and fail the job if non-200
- [x] **Database migrations in CI** -- Cloud SQL Auth Proxy started in-pipeline, DATABASE_URL fetched from Secret Manager, `prisma db push` applied before backend deploy

### Security

- [x] **Workload Identity Federation** -- No long-lived service account keys stored in GitHub
- [x] **Secrets in GCP Secret Manager** -- `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `JWT_SECRET`, `RESEND_API_KEY`, `INSURANCE_ENCRYPTION_KEY`, `CSRF_SECRET`, `ANTHROPIC_API_KEY` all mounted from Secret Manager
- [x] **Build args for public keys** -- `NEXT_PUBLIC_*` vars passed as build args, not runtime secrets
- [x] **Gitleaks secret scanning** -- `security-scan.yml` runs on push and PRs
- [x] **CodeQL SAST** -- Weekly scheduled + on push/PR, security-and-quality queries
- [x] **Hardcoded secret check** -- `test.yml` greps for `sk-ant|AKIA|password=` patterns in source
- [x] **Dependency review** -- `actions/dependency-review-action@v4` on PRs, fails on critical severity
- [x] **Security audit** -- `npm audit --audit-level=critical` (deploy) and `--audit-level=high` (PR gate)

### Items from Prompt Checklist -- Updated Assessment

| Prompt Item | Status | Notes |
|---|---|---|
| Multi-stage builds | DONE | Both Dockerfiles verified |
| `.dockerignore` | DONE | Comprehensive root-level file |
| No smoke tests after deployment | RESOLVED | Smoke tests added to both deploy workflows |
| No build caching in GitHub Actions | RESOLVED | GHA cache enabled on `docker/build-push-action` |
| No Slack/email notification | NOT IMPLEMENTED | Still missing -- could add a Slack webhook step to summary job |
| No Cloud Armor / DDoS protection | NOT IMPLEMENTED | Cloud Run is publicly accessible with `--allow-unauthenticated` |
| No VPC connector for Cloud SQL | N/A | Using Cloud SQL proxy (automatic in Cloud Run via `--add-cloudsql-instances`), which is the standard approach |

---

## Observations

1. **`prisma db push --accept-data-loss`** is used in CI for both production and staging. This flag bypasses migration safety checks and can drop columns/data. For a production database, `prisma migrate deploy` would be safer, applying only committed migration files. If the intent is "push schema changes without migration files," this works but carries risk.

2. **Staging shares the production database** -- The staging deploy connects to the same Cloud SQL instance (`verifymyprovider-prod:us-central1:verifymyprovider-db`) and uses the same `DATABASE_URL` secret. This means staging schema pushes affect production data. A separate staging database would be safer.

3. **`npm install --force`** is used in both Dockerfiles. The `--force` flag suppresses peer dependency warnings. This is fine for reproducible builds but masks potential compatibility issues.

4. **ADMIN_SECRET** is included in the deploy secrets list (line 152 of `deploy.yml`), contrary to the prompt's note about `--remove-secrets`. The `--remove-secrets` flag is no longer present -- the secret is actively mounted.

5. **Playwright E2E** workflow builds the frontend but does not start a backend server, so tests likely only cover frontend rendering, not full integration. The `PLAYWRIGHT_BASE_URL` points to localhost:3000, which would need a running server.

6. **Image tag strategy** is solid -- immutable SHA tags plus mutable `latest`/`staging-latest` for quick reference. The rollback workflow uses Cloud Run revision names rather than image tags.

---

## Recommendations

1. **Add Slack/email notifications** -- Add a step to the summary job that posts to a Slack webhook on failure (or always). Low effort, high observability.
2. **Separate staging database** -- Create a dedicated staging Cloud SQL instance or at minimum a separate database on the same instance to prevent schema changes from affecting production data.
3. **Consider `prisma migrate deploy`** -- Switch from `db push` to migration-based deployment for production to get safety guarantees around destructive schema changes.
4. **Add Cloud Armor** -- For a healthcare application, adding a Cloud Armor policy with basic DDoS protection and WAF rules would be prudent.
