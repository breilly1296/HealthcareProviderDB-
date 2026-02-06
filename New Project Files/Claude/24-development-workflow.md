# VerifyMyProvider Development Workflow

**Last Updated:** 2026-02-06

## Golden Rule

**ALL code changes happen in Claude Code (local machine) -> Push to GitHub -> Auto-deploys via GitHub Actions to Google Cloud Run.**

Never edit code in Google Cloud Shell. It is a dead end:
- Cloud Shell edits do not persist across sessions
- Changes will not trigger the CI/CD pipeline
- Code cannot be version controlled
- Other developers/sessions cannot see the changes

---

## What Each Tool Is For

### Claude Code (Local Machine)

**USE FOR:**
- Writing and editing all source code
- Fixing bugs and adding features
- Running local tests (`npm test`)
- Git operations (commit, push, branch)
- Running database scripts (`npx tsx scripts/...`)
- Prisma schema changes and migrations
- Package management (`npm install`)
- Code review and analysis

**NEVER USE FOR:**
- Nothing off-limits. This is the primary development tool.

### Google Cloud Shell / gcloud CLI

**USE FOR:**
- Direct database queries via `psql` or `gcloud sql connect`
- Checking Cloud Run deployment logs
- GCP infrastructure changes (Cloud Run settings, Cloud SQL config)
- Viewing secret values in Secret Manager
- One-off admin tasks (scaling, restarts)
- Monitoring Cloud Run metrics

**NEVER USE FOR:**
- Editing application source code
- Making bug fixes that need to deploy
- Installing npm packages
- Running the application locally

---

## Development Flow

```
  +------------------+     +-----------+     +----------------+     +-------------+
  |  Claude Code     | --> |  GitHub   | --> | GitHub Actions | --> | Cloud Run   |
  |  (Local Dev)     |     |  (main)   |     | (CI/CD)        |     | (Production)|
  +------------------+     +-----------+     +----------------+     +-------------+
         |                                           |
         | git push                         Tests -> Build -> Deploy
         |                                  (backend then frontend)
         |
  +------------------+
  |  Local Testing   |
  |  npm run dev     |
  |  npm test        |
  +------------------+
```

**Deploy pipeline (from `.github/workflows/deploy.yml`):**
1. **Test job:** Checkout -> Setup Node 20 -> `npm ci` -> `npm test` -> `npm run build`
2. **Deploy Backend:** Auth to GCP -> Build Docker image -> Push to Artifact Registry -> Deploy to Cloud Run -> Smoke test `/health`
3. **Deploy Frontend:** Auth to GCP -> Build Docker image (with backend URL as build arg) -> Push to Artifact Registry -> Deploy to Cloud Run
4. **Summary:** Posts deployment status to GitHub Actions summary

---

## Common Tasks

### Fix a Bug

1. Identify the bug (check Cloud Run logs or user report)
2. Open Claude Code in the project directory (`C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB`)
3. Find and fix the relevant source file
4. Run tests locally: `npm test` (from root or `packages/backend`)
5. Commit: `git add <files> && git commit -m "Fix: description"`
6. Push: `git push origin main`
7. Monitor GitHub Actions for deployment status
8. Verify fix on production (~5-10 minutes after push)

### Add a Feature

1. Plan the feature (which files, which routes, schema changes?)
2. If schema changes needed: Edit `packages/backend/prisma/schema.prisma`
3. Generate Prisma client: `npm run db:generate` (from root)
4. Implement backend changes in `packages/backend/src/`
5. Implement frontend changes in `packages/frontend/src/`
6. Add Zod validation schemas for new endpoints
7. Add rate limiting to new endpoints
8. Run tests: `npm test`
9. Commit and push
10. Monitor deployment

### Run Database Queries

**Via gcloud CLI (recommended for production):**
```bash
gcloud sql connect verifymyprovider-db --user=postgres --project=verifymyprovider-prod
# Enter password from Proton Pass: "VerifyMyProvider GCP"
```

**Via admin API endpoints:**
```bash
# Get retention stats
curl -H "X-Admin-Secret: <secret>" https://<backend-url>/api/v1/admin/retention/stats

# Get expiration stats
curl -H "X-Admin-Secret: <secret>" https://<backend-url>/api/v1/admin/expiration-stats

# Get enrichment stats
curl -H "X-Admin-Secret: <secret>" https://<backend-url>/api/v1/admin/enrichment/stats
```

**Via scripts (using DATABASE_URL env var):**
```bash
npx tsx scripts/check-import-status.ts
npx tsx scripts/verify-data-quality.ts
npx tsx scripts/normalize-city-names.ts  # dry run
```

### Check Deployment Status

1. **GitHub Actions:** Go to `https://github.com/breilly1296/HealthcareProviderDB-/actions`
2. **Cloud Run Console:** GCP Console -> Cloud Run -> verifymyprovider-backend / verifymyprovider-frontend
3. **Health endpoint:** `curl https://<backend-url>/health`

The deploy workflow includes a smoke test that hits `/health` after backend deployment. If it returns non-200, the deployment fails.

### View Logs

```bash
# Backend logs (last 100 entries)
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"verifymyprovider-backend\"" --limit=100 --project=verifymyprovider-prod

# Frontend logs
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"verifymyprovider-frontend\"" --limit=100 --project=verifymyprovider-prod

# Filter for errors only
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"verifymyprovider-backend\" AND severity>=ERROR" --limit=50 --project=verifymyprovider-prod

# Filter for rate limiting events
gcloud logging read "resource.type=\"cloud_run_revision\" AND jsonPayload.msg=\"Too many requests\"" --limit=50 --project=verifymyprovider-prod
```

---

## Quick Reference

| Task | Tool | Command/Action |
|------|------|----------------|
| Edit code | Claude Code | Edit files directly |
| Run tests | Claude Code | `npm test` from root |
| Build locally | Claude Code | `npm run build` from root |
| Dev server | Claude Code | `npm run dev` (concurrent backend + frontend) |
| Commit & deploy | Claude Code | `git add . && git commit -m "msg" && git push` |
| View deploy status | Browser | GitHub Actions page |
| Connect to DB | gcloud CLI | `gcloud sql connect verifymyprovider-db --user=postgres` |
| View backend logs | gcloud CLI | See log commands above |
| Check health | curl/browser | `GET /health` on backend URL |
| Clear cache | curl | `POST /api/v1/admin/cache/clear` with X-Admin-Secret |
| Cleanup expired | curl | `POST /api/v1/admin/cleanup-expired` with X-Admin-Secret |
| Generate Prisma | Claude Code | `npm run db:generate` |
| Push schema | Claude Code | `npm run db:push` |
| Run quality scripts | Claude Code | `npx tsx scripts/<script-name>.ts` |

---

## URLs

- **Frontend:** `https://verifymyprovider.com` (custom domain) / `https://verifymyprovider-frontend-741434145252.us-central1.run.app`
- **Backend:** Cloud Run URL (check deploy output or GCP Console)
- **GitHub:** `https://github.com/breilly1296/HealthcareProviderDB-`
- **GCP Console:** Google Cloud Console -> Project: verifymyprovider-prod

---

## Credentials (Proton Pass: "VerifyMyProvider GCP")

- **Database password:** Stored in Proton Pass under "VerifyMyProvider GCP"
- **Project ID:** `verifymyprovider-prod`
- **Database instance:** `verifymyprovider-db` (Google Cloud SQL PostgreSQL)
- **Region:** `us-central1`
- **Secrets in GCP Secret Manager:**
  - `DATABASE_URL` - PostgreSQL connection string
  - `ADMIN_SECRET` - Admin API authentication
  - `RECAPTCHA_SECRET_KEY` - Google reCAPTCHA v3
  - `ANTHROPIC_API_KEY` - Claude API (used by frontend)
  - `NEXT_PUBLIC_POSTHOG_KEY` - PostHog analytics (build-time)
- **GitHub Secrets:**
  - `GCP_WORKLOAD_IDENTITY_PROVIDER` - GCP auth
  - `GCP_SERVICE_ACCOUNT` - GCP service account
  - `GCP_PROJECT_ID` - Project ID
  - `FRONTEND_URL` - Frontend URL for CORS
  - `NEXT_PUBLIC_POSTHOG_KEY` - PostHog (build-time)

---

## Emergency Procedures

### Something Broke in Production

1. **Check health:** `curl https://<backend-url>/health` - if 503, database might be down
2. **Check logs:** Filter for ERROR severity in Cloud Run logs
3. **Check GitHub Actions:** Did a recent deploy fail?
4. **If deploy caused it:** The previous revision is still available in Cloud Run - roll back via GCP Console

### Need to Rollback

**Via GCP Console (fastest):**
1. Go to Cloud Run -> verifymyprovider-backend
2. Click "Revisions" tab
3. Route 100% traffic to the previous revision

**Via git (code rollback):**
1. `git revert HEAD` (reverts last commit)
2. `git push origin main` (triggers new deploy with reverted code)

### Database Connection Lost

1. Check Cloud SQL status in GCP Console
2. Verify the Cloud SQL instance is running
3. Check if the Cloud Run service has the correct Cloud SQL connection flag
4. The health endpoint reports `database: "unhealthy"` when connection fails
5. Cloud Run may need to be restarted to re-establish connection pools

### High Rate Limit Hits

1. Check logs for `Too many requests` messages
2. Check `X-RateLimit-Status: degraded` headers (indicates Redis is down)
3. Admin endpoint: `GET /api/v1/admin/cache/stats` shows current cache health
4. Consider temporarily increasing rate limits in `packages/backend/src/middleware/rateLimiter.ts`

---

## Monorepo Structure

```
HealthcareProviderDB/
  packages/
    backend/           # Express + Prisma API
      src/
        config/        # Constants, environment
        lib/           # Prisma client, Redis client
        middleware/     # Rate limiter, CAPTCHA, honeypot, error handler
        routes/        # Express route handlers
        schemas/       # Zod validation schemas
        services/      # Business logic
        utils/         # Logger, cache, helpers
      prisma/          # Schema and migrations
    frontend/          # Next.js 14.2 + React 18
      src/
        app/           # Next.js app router pages
        components/    # React components
        lib/           # Utilities
    shared/            # Shared types/utilities
  scripts/             # Database scripts (import, cleanup, quality)
  .github/workflows/   # CI/CD (deploy, test, security-scan, playwright)
  prompts/             # Project documentation prompts
```
