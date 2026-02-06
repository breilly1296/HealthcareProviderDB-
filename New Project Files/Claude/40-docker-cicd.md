# Docker & CI/CD Pipeline Review -- Analysis Output

## Summary

The Docker and CI/CD infrastructure is well-architected for a Cloud Run deployment. Both Dockerfiles use multi-stage builds with non-root users and health checks. The CI/CD pipeline uses Workload Identity Federation (no long-lived keys), GitHub Actions caching via `docker/build-push-action` with GHA cache, and includes a staging environment. Notable findings: a smoke test already exists for the backend, `ADMIN_SECRET` is now being injected (not removed), and the `.dockerignore` is comprehensive.

---

## Checklist Verification

### Docker

| Item | Status | Evidence |
|------|--------|----------|
| Backend Dockerfile (Node 20, non-root user, health check) | VERIFIED | `packages/backend/Dockerfile`: Uses `node:20-alpine`, creates `expressjs` user (UID 1001), `HEALTHCHECK` on `/health` |
| Frontend Dockerfile (Node 20, Next.js standalone output, health check) | VERIFIED | `packages/frontend/Dockerfile`: Uses `node:20-alpine`, copies `.next/standalone`, creates `nextjs` user (UID 1001), `HEALTHCHECK` on `/` |
| docker-compose.yml with all 3 services | VERIFIED | `docker-compose.yml`: Services `db` (postgres:15-alpine), `backend`, `frontend` all present |
| docker-compose.dev.yml for local database | VERIFIED | `docker-compose.dev.yml`: Single `db` service with `postgres_data_dev` volume |
| Health checks on all services | VERIFIED | `db`: `pg_isready -U postgres` (10s interval); `backend`: `wget /health` (30s); `frontend`: `wget /` (30s) |
| Named volumes for data persistence | VERIFIED | `postgres_data` in production compose, `postgres_data_dev` in dev compose |
| Multi-stage builds for smaller images | VERIFIED | Backend: 2-stage (builder + runner). Frontend: 3-stage (deps + builder + runner). Both install only production dependencies in the final stage. |
| `.dockerignore` files to exclude node_modules, .git, etc. | VERIFIED | Root `.dockerignore` excludes `node_modules/`, `.git/`, `.next/`, `dist/`, `.env`, `coverage/`, test files, `*.csv`, data files, and more. Comprehensive and well-maintained. |

### CI/CD

| Item | Status | Evidence |
|------|--------|----------|
| Automatic deploy on push to main | VERIFIED | `deploy.yml` line 4: `on: push: branches: [main]` |
| Manual dispatch option | VERIFIED | `deploy.yml` line 7: `workflow_dispatch` |
| Workload Identity Federation (no long-lived keys) | VERIFIED | Uses `google-github-actions/auth@v2` with `workload_identity_provider` and `service_account` secrets |
| Artifact Registry for image storage | VERIFIED | Tags point to `us-central1-docker.pkg.dev/$PROJECT_ID/verifymyprovider/` |
| Cloud Run deployment with proper configuration | VERIFIED | Uses `google-github-actions/deploy-cloudrun@v2` with 512Mi memory, 1 CPU, 0-10 instances, concurrency 80 |
| Frontend depends on backend URL (sequential deploy) | VERIFIED | `deploy-frontend` job has `needs: deploy-backend` and uses `needs.deploy-backend.outputs.backend_url` as build arg |
| Deployment summary with status table | VERIFIED | `summary` job runs `if: always()` and writes markdown table to `$GITHUB_STEP_SUMMARY` |
| Staging environment | VERIFIED | `deploy-staging.yml`: Triggers on `staging` branch, deploys to `-staging` services, max 2 instances |
| No rollback automation | CONFIRMED MISSING | No rollback steps in any workflow. Manual via Cloud Run console. |
| No smoke tests after deployment | PARTIALLY ADDRESSED | Backend deploy has a post-deploy smoke test (`curl /health` after 10s sleep) at line 114-121 of `deploy.yml`. Frontend does NOT have a smoke test. |
| No build caching in GitHub Actions | ADDRESSED | Both `deploy.yml` and `deploy-staging.yml` use `docker/build-push-action@v6` with `cache-from: type=gha` and `cache-to: type=gha,mode=max`. Docker Buildx is set up via `docker/setup-buildx-action@v3`. |
| No Slack/email notification on deploy success/failure | CONFIRMED MISSING | No notification steps in any workflow. |

### Security

| Item | Status | Evidence |
|------|--------|----------|
| Workload Identity Federation | VERIFIED | `permissions: id-token: write` + `google-github-actions/auth@v2` |
| Secrets in GCP Secret Manager | VERIFIED | `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `ANTHROPIC_API_KEY` all mounted from Secret Manager via `secrets:` block |
| Build args for public frontend keys (not secrets) | VERIFIED | `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_POSTHOG_KEY` are build args (public by design) |
| `--allow-unauthenticated` (public-facing services) | VERIFIED | Both backend and frontend deploy with `--allow-unauthenticated` |
| No Cloud Armor / DDoS protection | CONFIRMED MISSING | Not configured in any workflow or compose file |
| No VPC connector for Cloud SQL | CONFIRMED -- uses Cloud SQL proxy | `--add-cloudsql-instances` flag used; automatic proxy in Cloud Run |

### Additional CI Pipelines

| Pipeline | File | Trigger | What It Does |
|----------|------|---------|--------------|
| PR Test Gate | `test.yml` | PRs to `main` or `staging` | Runs backend + frontend tests, builds backend |
| Playwright E2E | `playwright.yml` | Push/PR to `main` (frontend changes only) | Installs Chromium, builds frontend, runs E2E tests, uploads report |
| Security Scan | `security-scan.yml` | Push/PR to `main` | Runs Gitleaks secret scan with full history (`fetch-depth: 0`) |

---

## Questions Answered

### 1. Should we add a staging environment before deploying to production?
**Already implemented.** `deploy-staging.yml` exists and deploys to `verifymyprovider-backend-staging` and `verifymyprovider-frontend-staging` on push to the `staging` branch. The only difference from production is `--max-instances=2` (vs 10) and `staging-` prefixed image tags. All other configuration (secrets, GCP auth, memory/CPU) is identical.

### 2. Should we implement rollback automation?
**Yes, recommended.** Currently there is no automated rollback. Cloud Run supports traffic splitting via `gcloud run services update-traffic --to-revisions`. A rollback workflow could be added that takes a previous `$GITHUB_SHA` and redeploys that revision. Since images are tagged with `$GITHUB_SHA` (immutable), any previous version can be redeployed by image tag.

### 3. Should we add post-deploy smoke tests to verify the deployment?
**Backend already has one.** `deploy.yml` lines 114-121 perform a `curl` health check on the deployed backend URL after a 10-second sleep. The frontend does NOT have a comparable smoke test. Adding one (e.g., `curl` to verify the frontend returns HTTP 200) would catch deployment failures early.

### 4. Should Docker builds use layer caching in GitHub Actions for faster builds?
**Already implemented.** Both `deploy.yml` and `deploy-staging.yml` use `docker/build-push-action@v6` with `cache-from: type=gha` and `cache-to: type=gha,mode=max` for GitHub Actions cache-backed Docker layer caching. Docker Buildx is set up via `docker/setup-buildx-action@v3`.

### 5. Should we add deploy notifications to Slack or email?
**Recommended for production reliability.** The deployment summary step writes to GitHub's step summary, which is only visible in the Actions UI. Adding a Slack webhook notification (e.g., `slackapi/slack-github-action`) to the `summary` job would provide immediate visibility for the team on deploy success/failure, especially for the `if: always()` summary job.

### 6. Is the `ADMIN_SECRET` `--remove-secrets` flag intentional, or should it be added back?
**Clarified: `ADMIN_SECRET` is now actively injected, not removed.** The current `deploy.yml` (line 111) includes `ADMIN_SECRET=ADMIN_SECRET:latest` in the `secrets:` block. There is no `--remove-secrets` flag present. The prompt's description appears to have been based on an earlier version of the workflow. The current production and staging deployments both inject `ADMIN_SECRET`, `DATABASE_URL`, and `RECAPTCHA_SECRET_KEY` from Secret Manager.

---

## Additional Findings

1. **Frontend Dockerfile runs `npm install --force` twice** -- once in the `deps` stage (line 20) and again in the `builder` stage (line 52) with the comment "Install dependencies in builder (to get .bin symlinks)". This doubles the install time. The second install may be needed for symlinks, but copying `node_modules/.bin` from deps could avoid this.

2. **Backend Dockerfile also uses `npm install --force`** -- The `--force` flag is used in both build and production stages. This may mask dependency resolution issues.

3. **Both deploy workflows run tests before deploying** -- The `test` job is a `needs` dependency for `deploy-backend`, which ensures no deploy happens if tests fail.

4. **Playwright tests do NOT test against a running backend** -- The `playwright.yml` workflow sets `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1` as a build env but does not start the backend. Tests appear to test frontend rendering and navigation only (or mock API calls).

5. **docker-compose.yml uses `version: '3.8'`** -- This is deprecated in Docker Compose V2 but still functional. No urgency to change.

6. **Security scan is Gitleaks only** -- No SAST analysis of code (e.g., CodeQL, Semgrep, or Snyk). Consider adding CodeQL for JavaScript/TypeScript vulnerability detection.
