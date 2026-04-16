# Docker & CI/CD Pipeline Review

**Last Updated:** 2026-04-16

## Summary

The CI/CD pipeline is mature: Workload Identity Federation instead of service-account keys, Artifact Registry for image storage, two environments (production + staging) with identical flow and different scale (max-instances 10 vs 2), manual-dispatch rollback automation, post-deploy smoke tests, CodeQL + gitleaks security scans, and GitHub Actions layer caching. Docker images use multi-stage builds, non-root users, and health checks. Gaps remaining: no notifications on deploy success/failure, no load testing before promotion, the prompt's claim that `ADMIN_SECRET` is removed is **incorrect**, and the `prisma db push --accept-data-loss` in the deploy job is a foot-gun for production.

## Findings

### CRITICAL

- **C1. Production deploys run `prisma db push --accept-data-loss`.** `.github/workflows/deploy.yml:127` and `deploy-staging.yml:127`. Every push to `main` issues an irreversible DDL sync against the production Cloud SQL instance. There are no migrations (`prisma migrate deploy`), no drift detection, no dry-run. Per project memory, migration history was baselined manually; `db push` + `--accept-data-loss` will happily drop columns that the schema file doesn't declare. A rename refactor shipped by accident destroys data.
- **C2. Staging pipeline targets production DB.** `deploy-staging.yml:105` connects to `verifymyprovider-prod:us-central1:verifymyprovider-db` — the **production** Cloud SQL instance — and runs `db push --accept-data-loss` against it (line 127). "Staging" only isolates Cloud Run services; the database is shared. Schema experiments on the `staging` branch mutate production data.

### HIGH

- **H1. Prompt/reality mismatch: `ADMIN_SECRET` is NOT removed.** Prompt line 115 claims `--remove-secrets` strips `ADMIN_SECRET`. Actual workflow `deploy.yml:150-157` mounts `ADMIN_SECRET=ADMIN_SECRET:latest` from Secret Manager. The prompt is stale.
- **H2. Dockerfile uses `npm install --force`.** `packages/backend/Dockerfile:20`, `:61`; `packages/frontend/Dockerfile:20`. `--force` suppresses lockfile consistency errors and peer-dependency conflicts. Builds silently diverge from `package-lock.json`; `npm ci` should be used for reproducibility.
- **H3. Frontend Docker stage does not drop to non-root user before the copy.** `packages/frontend/Dockerfile:50-64` creates the `nextjs` user but `chown -R` runs after all COPYs, so build layers include root-owned files. Not a runtime risk (USER nextjs:64 is set before CMD) but enlarges image size via extra layer.
- **H4. No database migration strategy in CI.** Related to C1: `packages/backend/package.json` has `db:migrate`, but CI uses `db:push`. Prisma's own docs warn this is dev-only.

### MEDIUM

- **M1. No Slack/email notifications on deploy or rollback.** `deploy.yml:257-271` writes to `$GITHUB_STEP_SUMMARY` only. `rollback.yml:93-96, 168-171` same. Silent failures go unnoticed unless someone refreshes the Actions tab.
- **M2. Smoke test is HTTP-200 only.** `deploy.yml:159-166` hits `/health` and checks status. Doesn't verify DB connectivity, doesn't validate any API endpoint. A backend that returns 200 on `/health` while `/api/v1/providers` returns 500 ships green.
- **M3. Cloud Run `--allow-unauthenticated` is hard-coded.** Both prod and staging (`deploy.yml:139`, `deploy-staging.yml:139`). Acceptable for public sites, but there's no rate limit at the platform layer — relies entirely on in-app `rateLimiter.ts`.
- **M4. No Docker layer caching strategy for dependencies.** Partially addressed via `cache-from: type=gha, cache-to: type=gha,mode=max` (`deploy.yml:90-91`) but the Dockerfile itself copies `package.json` and runs `npm install` before copying source — this is correct. However, `--force` (H2) invalidates caching guarantees.
- **M5. No VPC connector / private IP for Cloud SQL.** Uses Cloud SQL Auth Proxy (`deploy.yml:146` `--add-cloudsql-instances`). Traffic is TCP-over-IAM, which is fine, but there's no option to restrict DB access to a VPC-internal range.
- **M6. `.dockerignore` excludes `packages/backend/migrations`?** `.dockerignore:13` excludes `.git`; migrations are at `packages/backend/migrations/` and `packages/backend/prisma/migrations/`. Neither path is excluded, so they're included — good. But `*.md` exclusion (`.dockerignore:53`) might drop README files intentionally; verify no runtime code reads `.md`.
- **M7. Staging builds tagged with `staging-${SHA}` and `staging-latest`.** `deploy-staging.yml:88-89`. Good isolation from production's `${SHA}` / `latest` tags (`deploy.yml:88-89`). But Artifact Registry has no lifecycle policy documented — images accumulate indefinitely.
- **M8. `test` job in deploy workflow duplicates `test.yml`.** `deploy.yml:18-44` and `test.yml:10-51` are near-duplicates. A change to test config must be made in 3 places (test.yml, deploy.yml, deploy-staging.yml). Extract a reusable workflow (`workflow_call`).

### LOW

- **L1. `sleep 10` before smoke test.** `deploy.yml:161`, `:243`; `rollback.yml:82`, `:157`. Races with Cloud Run cold start. Better: retry loop with exponential backoff.
- **L2. Playwright workflow triggers only on `packages/frontend/**`.** `playwright.yml:7-11`. Backend-only changes could break the API contract the frontend tests depend on; those won't run. Run on both package paths.
- **L3. `retention-days: 30` for Playwright report.** Reasonable default; acceptable.
- **L4. Health check command uses `wget`, not `curl`.** `backend/Dockerfile:83`, `frontend/Dockerfile:73`. Alpine includes `wget` from busybox; fine, but `curl` gives cleaner exit codes. Non-issue.
- **L5. No SBOM / image scanning.** No `docker scout`, `trivy`, or GitHub Container Scanning in pipeline. CodeQL covers source SAST but not container CVEs.
- **L6. `forbidOnly: !!process.env.CI`** (`playwright.config.ts:15`) blocks `.only()` leakage — good.

## Checklist Verification

### Docker
- [x] Backend Dockerfile (Node 20, non-root user, health check) — `packages/backend/Dockerfile:4,43,82-83`
- [x] Frontend Dockerfile (Node 20, Next.js standalone output, health check) — `packages/frontend/Dockerfile:4,50,72-73`
- [x] docker-compose.yml with all 3 services — `docker-compose.yml:3-68`
- [x] docker-compose.dev.yml for local database — `docker-compose.dev.yml:3-22`
- [x] Health checks on all services — `docker-compose.yml:17-21, 43-47, 64-68`
- [x] Named volumes for data persistence — `docker-compose.yml:70-72`, `docker-compose.dev.yml:23-25`
- [x] Multi-stage builds for smaller images — both Dockerfiles use `AS builder` / `AS runner`
- [x] `.dockerignore` files to exclude node_modules, .git, etc. — `.dockerignore:1-63`

### CI/CD
- [x] Automatic deploy on push to main — `deploy.yml:3-7`
- [x] Manual dispatch option — `deploy.yml:7`, `deploy-staging.yml:7`, `rollback.yml:3`
- [x] Workload Identity Federation (no long-lived keys) — `deploy.yml:64-68`
- [x] Artifact Registry for image storage — `deploy.yml:86-89`
- [x] Cloud Run deployment with proper configuration — `deploy.yml:131-158`
- [x] Frontend depends on backend URL (sequential deploy) — `deploy.yml:180`, `:215-216`
- [x] Deployment summary with status table — `deploy.yml:257-271`
- [x] Staging environment — `deploy-staging.yml` triggers on `staging` branch
- [x] Rollback automation — `rollback.yml` with manual dispatch, service and revision inputs
- [x] Smoke tests after deployment — `deploy.yml:159-166`, `:241-249` (but M2 — HTTP-200 only)
- [x] Build caching in GitHub Actions — `deploy.yml:90-91` `cache-from: type=gha`
- [ ] Slack/email notification on deploy success/failure — **missing** (M1)

### Security
- [x] Workload Identity Federation — `deploy.yml:64-68`
- [x] Secrets in GCP Secret Manager — `deploy.yml:150-157`
- [x] Build args for public frontend keys — `deploy.yml:215-217` (`NEXT_PUBLIC_*`)
- [x] `--allow-unauthenticated` — `deploy.yml:139`, intentional (public site)
- [x] Gitleaks secret scan — `security-scan.yml:13-25`
- [x] CodeQL security scan — `codeql.yml:12-41`, weekly cron
- [x] Dependency review on PRs — `test.yml:53-65`
- [x] Hardcoded-secret grep — `test.yml:30-40`
- [ ] Cloud Armor / DDoS protection — not configured
- [ ] VPC connector for Cloud SQL — not configured (M5)
- [ ] Container image CVE scan — missing (L5)

## Recommendations (ranked)

1. **Switch production to `prisma migrate deploy`.** Replace `db push --accept-data-loss` (`deploy.yml:127`) with migration-based deploys. The memory notes already mention migration baselining was done — use it. Review every migration at PR time. (Closes C1.)
2. **Create a separate staging Cloud SQL instance.** `deploy-staging.yml:105` must not point at the production DB. Even read-only copy-restore would be safer. (Closes C2.)
3. **Replace `npm install --force` with `npm ci`.** In both Dockerfiles. If forced flags are needed, document why. (Closes H2.)
4. **Richer post-deploy smoke test.** Add `/api/v1/providers/search?state=NY&limit=1` check after `/health`; non-200 or empty results fail the deploy. Reuse the Playwright smoke spec against the live URL. (Closes M2.)
5. **Extract a reusable `run-tests` workflow.** `workflow_call` from `test.yml`, `deploy.yml`, `deploy-staging.yml`. (Closes M8.)
6. **Add Slack notifications on deploy outcome.** Simple `slackapi/slack-github-action@v1` step after `summary:`. (Closes M1.)
7. **Fix the prompt's outdated claim about `ADMIN_SECRET`.** Update the prompt text; `ADMIN_SECRET` is mounted, not removed. (Closes H1 as a documentation fix.)
8. **Add Trivy image scan.** After `docker/build-push-action` in deploy.yml, fail on HIGH+ CVEs. (Closes L5.)
9. **Tighten Playwright trigger.** Remove `paths: packages/frontend/**` in `playwright.yml:6-11` or add `packages/backend/src/routes/**` and `packages/shared/**`. (Closes L2.)
10. **Document Artifact Registry lifecycle.** Add a gcloud command or doc note: keep last N tags, drop older. Images accumulate at 1-2 per deploy. (Addresses M7.)

## Open Questions

1. **Should we add a staging environment before deploying to production?** Already present (`deploy-staging.yml`). However, DB is shared (C2) — requires a separate Cloud SQL instance.
2. **Should we implement rollback automation?** Already present (`rollback.yml`), manual dispatch with service + revision inputs. Covers both backend and frontend.
3. **Should we add post-deploy smoke tests?** Already present (`deploy.yml:159-166`, `:241-249`). But too shallow (M2).
4. **Should Docker builds use layer caching in GitHub Actions?** Already enabled (`cache-from: type=gha`). Concern: `--force` npm flag may partially invalidate cache gains.
5. **Should we add deploy notifications to Slack/email?** No — add them (M1).
6. **Is the `ADMIN_SECRET` `--remove-secrets` flag intentional?** Claim is **false**; secret is actively mounted (`deploy.yml:152`). Prompt is wrong.

## Appendix: observed environment surface

| Item | Value | Source |
|------|-------|--------|
| Node version | 20 | `deploy.yml:29`, Dockerfiles |
| GCP region | us-central1 | `deploy.yml:10` |
| Prod Cloud SQL instance | verifymyprovider-prod:us-central1:verifymyprovider-db | `deploy.yml:146` |
| Staging Cloud SQL instance | **same as prod** | `deploy-staging.yml:146` (C2) |
| Backend services | verifymyprovider-backend / -staging | `deploy.yml:12`, `deploy-staging.yml:12` |
| Frontend services | verifymyprovider-frontend / -staging | `deploy.yml:13`, `deploy-staging.yml:13` |
| Max instances (prod) | 10 | `deploy.yml:144` |
| Max instances (staging) | 2 | `deploy-staging.yml:144` |
| Memory | 512Mi (both) | `deploy.yml:141`, `:231` |
| Concurrency | 80 | `deploy.yml:145` |
| Secrets mounted (backend) | DATABASE_URL, ADMIN_SECRET, RECAPTCHA_SECRET_KEY, JWT_SECRET, RESEND_API_KEY, INSURANCE_ENCRYPTION_KEY, CSRF_SECRET | `deploy.yml:150-157` |
| Secrets mounted (frontend) | ANTHROPIC_API_KEY | `deploy.yml:238-239` |
| Public build args (frontend) | NEXT_PUBLIC_API_URL, NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY | `deploy.yml:215-217`, `Dockerfile:30-37` |
