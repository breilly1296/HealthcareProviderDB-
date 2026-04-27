# Staging Environment

Staging mirrors prod for verifying deploys, migrations, and feature work
before they hit `main`. The CI workflow at `.github/workflows/deploy-staging.yml`
deploys to staging on every push to the `staging` branch.

This doc captures the one-time GCP provisioning that the workflow assumes
exists. If staging deploys are failing with
`Secret [DATABASE_URL_STAGING] not found` or similar, the underlying GCP
resources haven't been provisioned yet — run through "One-time setup"
below.

## What staging is

| Resource | Name |
|---|---|
| Cloud SQL instance | `verifymyprovider-db-staging` |
| Cloud SQL connection name | `verifymyprovider-prod:us-central1:verifymyprovider-db-staging` |
| Database | `verifymyprovider` |
| Backend Cloud Run service | `verifymyprovider-backend-staging` |
| Frontend Cloud Run service | `verifymyprovider-frontend-staging` |
| Image tag suffix | `:staging-<sha>` and `:staging-latest` |
| GCP project | `verifymyprovider-prod` (same as prod — separated by service name, not project) |

All staging resources live in the same GCP project as prod. Isolation is
by Cloud SQL instance + Cloud Run service name, not by project boundary.

## One-time setup

Run these commands once. Subsequent deploys on `staging` branch use them
automatically.

### 1. Provision Cloud SQL

```bash
gcloud sql instances create verifymyprovider-db-staging \
  --database-version=POSTGRES_16 \
  --region=us-central1 \
  --tier=db-f1-micro \
  --storage-size=10GB \
  --backup-start-time=03:00 \
  --project=verifymyprovider-prod

gcloud sql databases create verifymyprovider \
  --instance=verifymyprovider-db-staging \
  --project=verifymyprovider-prod

# Generate a strong password for the staging app user (32+ chars).
# Do NOT reuse the prod DB password — staging creds should be unique
# so a leaked staging credential doesn't grant prod access.
STAGING_DB_PASSWORD="$(openssl rand -base64 32)"

gcloud sql users create vmpapp \
  --instance=verifymyprovider-db-staging \
  --password="$STAGING_DB_PASSWORD" \
  --project=verifymyprovider-prod
```

### 2. Create the `DATABASE_URL_STAGING` secret

The workflow looks this up at `deploy-staging.yml:114`. Use the
Cloud-SQL Unix-socket URL form — Cloud Run mounts `/cloudsql/<conn>`
when `--add-cloudsql-instances` is set.

```bash
echo -n "postgresql://vmpapp:${STAGING_DB_PASSWORD}@/verifymyprovider?host=/cloudsql/verifymyprovider-prod:us-central1:verifymyprovider-db-staging" | \
  gcloud secrets create DATABASE_URL_STAGING \
    --data-file=- \
    --replication-policy=automatic \
    --project=verifymyprovider-prod

# Grant the GitHub Actions service account read access to the secret.
# Replace <SA_EMAIL> with the value of GitHub repo secret GCP_SERVICE_ACCOUNT.
gcloud secrets add-iam-policy-binding DATABASE_URL_STAGING \
  --member='serviceAccount:<SA_EMAIL>' \
  --role='roles/secretmanager.secretAccessor' \
  --project=verifymyprovider-prod
```

The same service account also needs `roles/cloudsql.client` on the
project to use the Cloud SQL Auth Proxy in the migration step. If
prod deploys work, this is already granted at the project level — no
extra step needed.

### 3. Decide on staging-specific secrets vs. shared

The current `deploy-staging.yml:161-168` reads these secrets from
Secret Manager (versioned with `:latest`):

- `ADMIN_SECRET`
- `RECAPTCHA_SECRET_KEY`
- `JWT_SECRET`
- `RESEND_API_KEY`
- `INSURANCE_ENCRYPTION_KEY`
- `CSRF_SECRET`

By default these point at the **same secrets prod uses**. That's a
security concern: a staging-side compromise (deploys touch staging
more often, and pre-merge code may have bugs) leaks prod-scoped
credentials.

**Recommended:** create staging-suffixed secrets and update the
workflow to reference them:

```bash
for s in ADMIN_SECRET JWT_SECRET INSURANCE_ENCRYPTION_KEY CSRF_SECRET; do
  echo -n "$(openssl rand -base64 48)" | \
    gcloud secrets create "${s}_STAGING" \
      --data-file=- \
      --project=verifymyprovider-prod
done
# RECAPTCHA_SECRET_KEY_STAGING / RESEND_API_KEY_STAGING:
# create separate keys at the providers (Google reCAPTCHA, Resend) so
# you're not burning prod-rate-limit budget on staging traffic.
```

Then in `deploy-staging.yml:161-168`, change e.g.
`ADMIN_SECRET=ADMIN_SECRET:latest` → `ADMIN_SECRET=ADMIN_SECRET_STAGING:latest`.
Apply across all six. `INSURANCE_ENCRYPTION_KEY` divergence means
encrypted-payload data in staging is unreadable in prod (and vice
versa) — this is the desired behavior.

Skip this step only if you accept the shared-secret trade-off for
simplicity.

## Operations

### Triggering a deploy

Push to the `staging` branch. The workflow at `deploy-staging.yml`
runs: tests → backend Docker build → migrations (against
staging Cloud SQL) → backend Cloud Run deploy → frontend Docker build
→ frontend Cloud Run deploy → smoke tests.

Manual trigger: `Actions → Deploy to Cloud Run (Staging) → Run workflow`.

### Schema migrations

`deploy-staging.yml` runs `prisma migrate deploy` against staging
before deploying the backend. When you commit a new migration, push to
`staging` first and verify the deploy succeeds before merging the
migration to `main`. This is the primary value of having staging:
schema problems surface here, not in prod.

### Updating env vars (non-secret)

Edit `deploy-staging.yml` `env_vars:` (line 158). Push to staging.

### Updating secrets

`gcloud secrets versions add <SECRET> --data-file=...`. Cloud Run
auto-loads `:latest` on the next revision, but existing instances
keep their cached value — push a deploy or `gcloud run services
update <svc> --update-secrets=...` to roll the revision.

### Tearing it down

```bash
gcloud run services delete verifymyprovider-backend-staging --region=us-central1 --project=verifymyprovider-prod
gcloud run services delete verifymyprovider-frontend-staging --region=us-central1 --project=verifymyprovider-prod
gcloud sql instances delete verifymyprovider-db-staging --project=verifymyprovider-prod
gcloud secrets delete DATABASE_URL_STAGING --project=verifymyprovider-prod
# Plus any *_STAGING secrets created in step 3.
```

## Costs

Approximate monthly run-rate (us-central1, low traffic):

| Resource | Cost |
|---|---|
| Cloud SQL (`db-f1-micro` + 10GB) | ~$10 |
| Cloud Run backend (min-instances=0) | ~$0–2 |
| Cloud Run frontend (min-instances=0) | ~$0–2 |
| Secret Manager | ~$0 (under free tier) |
| Container Registry storage | ~$1 |
| **Total** | **~$13–15/month** |

If staging usage is low, consider stopping the Cloud SQL instance
between active development phases:

```bash
gcloud sql instances patch verifymyprovider-db-staging --activation-policy=NEVER
# Reactivate before next deploy:
gcloud sql instances patch verifymyprovider-db-staging --activation-policy=ALWAYS
```

## Known issues

1. **Probe-flag bug in `deploy-staging.yml`.** Lines 152–157 contain
   `--startup-probe-http-path`, `--liveness-probe-http-path`, etc., which
   `gcloud run deploy` does not recognize as separate flags (the equivalent
   bug was already fixed in `deploy.yml` for prod). Once the
   `DATABASE_URL_STAGING` secret is provisioned and migrations succeed,
   the next failure will be in the Cloud Run deploy step. Fix the same
   way: drop the probe lines (Cloud Run defaults to TCP probe on the
   configured `--port`) or replace with the consolidated form
   `--startup-probe=httpGet.path=/health,...`. Both backend (line ~152)
   and frontend (line ~248) deploy steps need the change.

2. **Shared secrets with prod.** See "Decide on staging-specific
   secrets" above. Until staging-suffixed secrets are created and the
   workflow updated, a staging incident has prod blast radius.

3. **No data fixture.** Staging starts with an empty database. Either
   manually run NPI imports against the staging DB, or set up a nightly
   prod-snapshot-restore (deferred work — see follow-ups below).

## Follow-ups

These haven't been built yet but are the natural next steps for a
fully self-sufficient staging environment:

- `db:seed:staging` script that loads a small representative dataset
  so Playwright/manual QA against staging exercises the data path
  without manually running the full NPI import.
- Cloud Scheduler job that nightly snapshots prod → restores to
  staging, giving prod-shaped data with PHI scrubbed (the scrub step
  is the hard part — needs a definition of what to redact).
- Allowlist staging URL in any external integrations (reCAPTCHA
  domains, Resend sender domain, etc.) so those services accept calls
  from the staging hostname.
