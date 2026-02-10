# Development Workflow - VerifyMyProvider

## Overview

This document defines the development workflow for VerifyMyProvider. The workflow is built around a clear separation of responsibilities between local development (Claude Code) and cloud infrastructure (Google Cloud Shell / gcloud CLI).

---

## The Golden Rule

**ALL code changes happen in Claude Code. Push to GitHub. Auto-deploys.**

**NEVER edit code in Google Cloud Shell.** Google Cloud Shell is for infrastructure commands, database queries, and log viewing only. Code editing, testing, and git operations happen exclusively in Claude Code.

---

## Tool Responsibilities

### Claude Code (Local Development)

| Task | Tool |
|---|---|
| Writing and editing code | Claude Code |
| Fixing bugs | Claude Code |
| Adding features | Claude Code |
| Running local tests | Claude Code |
| Git operations (commit, push, branch) | Claude Code |
| Code review and analysis | Claude Code |
| Prisma schema changes | Claude Code |
| Running Prisma generate | Claude Code |
| npm install and dependency management | Claude Code |

### Google Cloud Shell / gcloud CLI (Infrastructure)

| Task | Tool |
|---|---|
| Database commands (SQL queries) | Google Cloud Shell |
| Cloud Run log viewing | gcloud CLI |
| Cloud Run service configuration | gcloud CLI |
| Cloud SQL instance management | gcloud CLI |
| GCP infrastructure provisioning | gcloud CLI |
| Secret management (runtime secrets) | gcloud CLI |
| Debugging production issues (logs, metrics) | gcloud CLI |

---

## Development Flow

```
[Claude Code]          [GitHub]              [GitHub Actions]        [Cloud Run]
     |                    |                        |                      |
     |  git push          |                        |                      |
     |------------------->|                        |                      |
     |                    |  trigger workflow       |                      |
     |                    |----------------------->|                      |
     |                    |                        |  build Docker image  |
     |                    |                        |  push to Artifact    |
     |                    |                        |  Registry             |
     |                    |                        |  deploy to Cloud Run |
     |                    |                        |--------------------->|
     |                    |                        |                      |
     |                    |                        |  health check        |
     |                    |                        |<---------------------|
     |                    |                        |                      |
```

### Step by Step

1. **Edit in Claude Code** -- Make code changes locally
2. **Test locally** -- Run `npm test`, `npm run lint`, or start the dev server
3. **Commit and push** -- `git add`, `git commit`, `git push` to GitHub
4. **Automatic CI/CD** -- GitHub Actions triggers on push to `main`:
   - Runs lint and tests
   - Builds Docker images (multi-stage, Alpine-based)
   - Pushes images to Google Artifact Registry
   - Deploys new revision to Cloud Run
   - Runs health check to verify deployment
5. **Verify** -- Check Cloud Run logs or hit the health endpoint

---

## Common Tasks: Step by Step

### Fix a Bug

1. **Identify the bug** -- Review error logs, reproduction steps, or user report
2. **Find the relevant code** -- Search the codebase in Claude Code
3. **Make the fix** -- Edit the file(s) in Claude Code
4. **Test locally** -- Run affected tests or manually verify
5. **Commit and push:**
   ```bash
   git add packages/backend/src/routes/providers.ts
   git commit -m "Fix provider search returning stale cache results"
   git push origin main
   ```
6. **Verify deployment** -- Check GitHub Actions workflow completes, then verify the fix in production

---

### Add a Feature

1. **Plan the feature** -- Determine which files need changes (routes, models, frontend pages)
2. **Create a feature branch (optional):**
   ```bash
   git checkout -b feature/provider-comparison
   ```
3. **Implement backend changes** -- Add routes, update Prisma schema if needed, add validation
4. **Implement frontend changes** -- Add pages, components, API calls
5. **Test locally** -- Run the dev servers, test the feature end-to-end
6. **Commit and push:**
   ```bash
   git add packages/backend/src/routes/comparison.ts
   git add packages/frontend/src/app/compare/page.tsx
   git commit -m "Add provider comparison feature (max 4 providers)"
   git push origin feature/provider-comparison
   ```
7. **Create a pull request** -- Use `gh pr create` or the GitHub UI
8. **Merge to main** -- After review, merge triggers automatic deployment

---

### Run Database Queries

Database queries run in Google Cloud Shell or via the gcloud CLI, NOT in Claude Code.

1. **Connect to Cloud SQL:**
   ```bash
   gcloud sql connect <instance-name> --database=verifymyprovider --user=<username>
   ```
2. **Run queries:**
   ```sql
   -- Check provider count by state
   SELECT state, COUNT(*) FROM practice_locations GROUP BY state ORDER BY count DESC;

   -- Check verification counts
   SELECT COUNT(*) FROM verification_logs WHERE created_at > NOW() - INTERVAL '7 days';

   -- Check confidence score distribution
   SELECT
     CASE
       WHEN confidence_score >= 0.8 THEN 'High (0.8+)'
       WHEN confidence_score >= 0.5 THEN 'Medium (0.5-0.8)'
       ELSE 'Low (<0.5)'
     END as tier,
     COUNT(*)
   FROM provider_plan_acceptance
   WHERE confidence_score IS NOT NULL
   GROUP BY tier;
   ```

---

### Check Deployment Status

```bash
# View current Cloud Run revision
gcloud run revisions list --service verifymyprovider --region <region> --limit 5

# Check if the latest revision is serving traffic
gcloud run services describe verifymyprovider --region <region> --format="value(status.traffic)"

# View GitHub Actions workflow status
gh run list --limit 5
```

---

### View Logs

```bash
# View recent Cloud Run logs (last 50 entries)
gcloud run logs read --service verifymyprovider --limit 50

# View logs with severity filter
gcloud run logs read --service verifymyprovider --limit 50 --log-filter="severity>=ERROR"

# Stream logs in real time
gcloud run logs tail --service verifymyprovider

# View logs for a specific time range
gcloud run logs read --service verifymyprovider --limit 100 \
  --log-filter="timestamp>=\"2026-01-20T00:00:00Z\" AND timestamp<=\"2026-01-20T23:59:59Z\""
```

---

## Emergency: Production Issue

When a production issue is discovered, follow this sequence:

### 1. Check Logs

```bash
# View recent error logs
gcloud run logs read --service verifymyprovider --limit 100 --log-filter="severity>=ERROR"

# Check if the service is healthy
curl https://verifymyprovider-<hash>.run.app/api/health
```

### 2. Diagnose

- Review the error logs to identify the root cause
- Check if the issue is in the latest deployment (compare timestamps)
- Determine if a rollback is needed or if a hotfix is faster

### 3. Hotfix in Claude Code

```bash
# Make the fix in Claude Code
# Edit the relevant file(s)

# Test locally if possible
npm test

# Commit and push (this triggers auto-deploy)
git add <files>
git commit -m "Hotfix: fix critical provider search failure"
git push origin main
```

### 4. Auto-Deploy

GitHub Actions will automatically build and deploy the fix. Monitor the workflow:

```bash
# Watch the workflow
gh run watch

# Or check status
gh run list --limit 1
```

### 5. Verify

```bash
# Check the new revision is serving
gcloud run revisions list --service verifymyprovider --region <region> --limit 3

# Verify the fix
curl https://verifymyprovider-<hash>.run.app/api/health

# Check logs for recurring errors
gcloud run logs read --service verifymyprovider --limit 20 --log-filter="severity>=ERROR"
```

### 6. Rollback (if hotfix fails)

If the hotfix makes things worse, use the rollback workflow:

```bash
# List recent revisions
gcloud run revisions list --service verifymyprovider --region <region> --limit 5

# Roll back to a previous revision
gcloud run services update-traffic verifymyprovider \
  --to-revisions=<previous-revision-name>=100 \
  --region <region>
```

Or trigger the GitHub Actions rollback workflow if configured.

---

## Branch Strategy

| Branch | Purpose | Deploys To |
|---|---|---|
| `main` | Production code | Cloud Run (production) |
| `staging` | Pre-production testing | Cloud Run (staging) |
| `feature/*` | Feature development | No auto-deploy (PR to main) |
| `hotfix/*` | Emergency fixes | PR to main (fast-track review) |

---

## Environment Variables

### Local Development (.env)

Located at `packages/backend/.env`:

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
RECAPTCHA_SECRET_KEY=...
ADMIN_SECRET=local-dev-secret
POSTHOG_API_KEY=...
```

### Production (Cloud Run)

Set via GitHub Secrets and injected during deployment. View current configuration:

```bash
gcloud run services describe verifymyprovider --region <region> \
  --format="yaml(spec.template.spec.containers[0].env)"
```

### Staging

Same variables as production but with staging-specific values (separate database, separate API keys).

---

## Summary

| Principle | Implementation |
|---|---|
| Code changes in Claude Code only | NEVER edit in Cloud Shell |
| Automated deployment | Push to GitHub triggers CI/CD |
| Infrastructure via gcloud | Database, logs, Cloud Run config |
| Branch protection | main = production, staging = pre-prod |
| Emergency response | Logs, hotfix, push, auto-deploy, verify |
