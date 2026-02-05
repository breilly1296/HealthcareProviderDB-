# Docker & CI/CD Pipeline -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/40-docker-cicd.md
**Status:** Fully Implemented -- Production-Ready with Enhancement Opportunities

---

## Findings

### Docker Configuration

- **Backend Dockerfile (Node 20, non-root user, health check):** Verified in `packages/backend/Dockerfile`. Uses `node:20-alpine` for both build and production stages. Multi-stage build with `builder` (build stage) and `runner` (production stage). Non-root user `expressjs` (UID 1001, group `nodejs` GID 1001) is created and used. Health check configured: `wget --no-verbose --tries=1 --spider http://localhost:8080/health` with 30s interval, 10s timeout, 5s start period, 3 retries. Port 8080 exposed, matching Cloud Run convention.

- **Frontend Dockerfile (Node 20, Next.js standalone output, health check):** Verified in `packages/frontend/Dockerfile`. Uses three-stage build: `deps` (dependency installation), `builder` (build), `runner` (production). Non-root user `nextjs` (UID 1001, group `nodejs` GID 1001). Uses Next.js standalone output (copies `.next/standalone`, `.next/static`, and `public` directories). Health check: `wget --no-verbose --tries=1 --spider http://localhost:8080/` with same timings. Build args for `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_POSTHOG_KEY`. Port 8080, hostname `0.0.0.0`.

- **docker-compose.yml with all 3 services:** Verified. Three services defined:
  - `db`: `postgres:15-alpine`, port 5432:5432, named volume `postgres_data`, health check with `pg_isready`.
  - `backend`: builds from `packages/backend/Dockerfile`, port 3001:8080, depends on `db` with `service_healthy` condition. Environment includes `DATABASE_URL`, `PORT=8080`, `NODE_ENV=production`, `CORS_ORIGIN=http://localhost:3000`.
  - `frontend`: builds from `packages/frontend/Dockerfile`, port 3000:8080, depends on `backend`. Build arg `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1`.

- **docker-compose.dev.yml for local database:** Verified. Contains only the `db` service (`postgres:15-alpine`) with a separate named volume `postgres_data_dev`. Same health check configuration. Container named `healthcaredb-postgres-dev` to avoid conflicts with the full-stack compose.

- **Health checks on all services:** Verified.
  - `db`: `pg_isready -U postgres` every 10s, 5s timeout, 5 retries.
  - `backend`: `wget http://localhost:8080/health` every 30s, 10s timeout, 3 retries.
  - `frontend`: `wget http://localhost:8080/` every 30s, 10s timeout, 3 retries.
  - Dockerfiles also have `HEALTHCHECK` instructions with 5s `start-period`.

- **Named volumes for data persistence:** Verified. `postgres_data` in `docker-compose.yml`, `postgres_data_dev` in `docker-compose.dev.yml`.

- **Multi-stage builds for smaller images:** Verified. Backend uses 2 stages (`builder` -> `runner`). Frontend uses 3 stages (`deps` -> `builder` -> `runner`). Production stages only contain built artifacts, Prisma client, and production dependencies (backend) or standalone output (frontend).

- **`.dockerignore` files:** Partially verified. A root-level `.dockerignore` exists at `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\.dockerignore` with comprehensive exclusions: `node_modules`, `.git`, `.env*`, IDE files, OS files, logs, test files, markdown docs, data/CSV files, and build info. However, there are no per-package `.dockerignore` files (only the root one). Since the Docker build context is the project root (`.`), the root `.dockerignore` is sufficient.

### CI/CD Pipeline (deploy.yml)

- **Automatic deploy on push to main:** Verified. Trigger: `on: push: branches: [main]`.
- **Manual dispatch option:** Verified. `workflow_dispatch` is included.
- **Workload Identity Federation (no long-lived keys):** Verified. Both `deploy-backend` and `deploy-frontend` jobs use `google-github-actions/auth@v2` with `workload_identity_provider` and `service_account` from secrets. Permission `id-token: write` is set for OIDC token generation.

- **Artifact Registry for image storage:** Verified. Docker is configured for `us-central1-docker.pkg.dev`. Images are tagged with both `${{ github.sha }}` (immutable) and `latest` (mutable), then pushed to the registry under repository `verifymyprovider`.

- **Cloud Run deployment with proper configuration:** Verified for both services.

  **Backend Cloud Run settings:**
  | Setting | Documented | Actual | Match |
  |---------|-----------|--------|-------|
  | Port | 8080 | 8080 | Yes |
  | Memory | 512Mi | 512Mi | Yes |
  | CPU | 1 | 1 | Yes |
  | Min instances | 0 | 0 | Yes |
  | Max instances | 10 | 10 | Yes |
  | Concurrency | 80 | 80 | Yes |
  | Cloud SQL | `verifymyprovider-prod:us-central1:verifymyprovider-db` | Same | Yes |
  | Auth | `--allow-unauthenticated` | Same | Yes |

  Backend env vars: `NODE_ENV=production`, `FRONTEND_URL` from secret.
  Backend secrets: `DATABASE_URL=DATABASE_URL:latest` (from Secret Manager).
  Special: `--remove-secrets=ADMIN_SECRET` flag is present (removes previously set secret).

  **Frontend Cloud Run settings:**
  | Setting | Documented | Actual | Match |
  |---------|-----------|--------|-------|
  | Port | 8080 | 8080 | Yes |
  | Memory | 512Mi | 512Mi | Yes |
  | CPU | 1 | 1 | Yes |
  | Min instances | 0 | 0 | Yes |
  | Max instances | 10 | 10 | Yes |
  | Concurrency | 80 | 80 | Yes |
  | Auth | `--allow-unauthenticated` | Same | Yes |

  Frontend env vars: `NODE_ENV=production`.
  Frontend secrets: `ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest`.
  Frontend build args: `NEXT_PUBLIC_API_URL` (from backend output), `NEXT_PUBLIC_POSTHOG_KEY` (from secret).

- **Frontend depends on backend URL (sequential deploy):** Verified. `deploy-frontend` job has `needs: deploy-backend` and uses `${{ needs.deploy-backend.outputs.backend_url }}/api/v1` as the `NEXT_PUBLIC_API_URL` build arg.

- **Deployment summary with status table:** Verified. The `summary` job runs `if: always()` and writes a markdown table to `$GITHUB_STEP_SUMMARY` with backend/frontend status and URLs. Note: the frontend URL shows "See Cloud Run console" rather than the actual URL (the frontend deploy job does not output its URL to the summary job).

### E2E Test Pipeline (playwright.yml)

- **Playwright E2E tests exist:** Verified in `.github/workflows/playwright.yml`. Triggers on push and PR to `main` for `packages/frontend/**` path changes. Uses Node 20, installs only Chromium browser, builds shared then frontend, runs `test:e2e` with `PLAYWRIGHT_BASE_URL=http://localhost:3000`. Uploads `playwright-report/` as artifact with 30-day retention. Job has 15-minute timeout.

### Security

- **Workload Identity Federation (no service account keys in GitHub):** Verified. OIDC-based authentication, no JSON key files stored as secrets.
- **Secrets in GCP Secret Manager (not in env vars):** Verified. `DATABASE_URL` and `ANTHROPIC_API_KEY` are mounted from Secret Manager as `secrets:` in the Cloud Run deploy step, not as plain `env_vars`.
- **Build args for public frontend keys (not secrets):** Verified. `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_POSTHOG_KEY` are build args (public by design -- embedded in client-side JavaScript). Actual secrets like `ANTHROPIC_API_KEY` use Secret Manager.
- **`--allow-unauthenticated` (public-facing services):** Verified on both services. This is appropriate for a public-facing web application.
- **No Cloud Armor / DDoS protection:** Confirmed not configured. The services rely on Cloud Run's built-in rate limiting (max instances = 10) and the application-level rate limiting in Express.
- **No VPC connector for Cloud SQL:** Confirmed. Uses Cloud SQL proxy via `--add-cloudsql-instances` flag rather than a VPC connector.

### Unchecked Items from Prompt

- **No staging environment:** Confirmed. The workflow deploys directly to production on every push to `main`.
- **No rollback automation:** Confirmed. Rollback would need to be done manually via `gcloud run services update-traffic --to-revisions` or the Cloud Run console.
- **No smoke tests after deployment:** Confirmed. No post-deploy health check or API call to verify the deployment succeeded.
- **No build caching in GitHub Actions:** Confirmed. Neither `docker/build-push-action` with cache nor `actions/cache` for Docker layers is used. Each build downloads all layers fresh.
- **No Slack/email notification on deploy success/failure:** Confirmed. The summary job writes to GitHub Step Summary but does not send external notifications.

---

## Summary

The Docker and CI/CD infrastructure is fully implemented and production-ready. Both Dockerfiles use multi-stage builds with non-root users, health checks, and Node 20 Alpine. The production `docker-compose.yml` correctly orchestrates all three services with health-check-based dependency ordering. The deployment pipeline uses Workload Identity Federation for secure GCP authentication, pushes to Artifact Registry with SHA-tagged images, and deploys to Cloud Run with appropriate resource limits and secret management. The E2E test pipeline runs Playwright tests on frontend changes.

All documented settings in the prompt match the actual configuration exactly. The `.dockerignore` file exists at the root level with comprehensive exclusions. The main gaps are operational: no staging environment, no rollback automation, no post-deploy smoke tests, no Docker layer caching, and no external deploy notifications.

## Recommendations

1. **Add Docker layer caching to GitHub Actions.** Use `docker/build-push-action` with `cache-from`/`cache-to` or `actions/cache` for Docker layers. This can significantly reduce build times (especially for the `npm install` layer).
2. **Add post-deploy smoke tests.** After each Cloud Run deploy, run a simple `curl` against the health endpoint and a critical API route to verify the deployment is functional before the workflow completes.
3. **Propagate frontend URL to the summary job.** The `deploy-frontend` job does not export its deployed URL, so the summary table shows "See Cloud Run console." Add an `outputs: frontend_url: ${{ steps.deploy.outputs.url }}` to the frontend job and reference it in the summary.
4. **Consider a staging environment.** Deploying directly to production on every push to `main` is risky. A staging Cloud Run service with a separate URL could receive the deploy first, pass smoke tests, then promote to production.
5. **Add deploy notifications.** Integrate Slack or GitHub Actions-native notifications (e.g., `slackapi/slack-github-action`) so the team is alerted on deploy success or failure.
6. **Investigate the `ADMIN_SECRET` removal.** The `--remove-secrets=ADMIN_SECRET` flag on the backend deploy suggests an intentional cleanup of a previously configured secret. Verify this is expected and not a misconfiguration that would break admin functionality.
7. **Consider VPC connector for Cloud SQL.** While Cloud SQL proxy works, a VPC connector provides an additional security layer by keeping database traffic within the VPC. This is especially relevant if the Cloud SQL instance has a private IP.
