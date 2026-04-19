# Cloud Scheduler jobs (IM-14)

Cron schedule for the backend's admin cleanup + retention endpoints, declared as a single idempotent `gcloud` script — same pattern as `infra/alerts/`.

## Files

```
infra/scheduler/
├── cloud-scheduler-jobs.sh   # idempotent apply script
└── README.md                 # (this file)
```

## Jobs

| Job | Schedule (UTC) | Endpoint | Timeout | Retries |
|---|---|---|---|---|
| `cleanup-expired` | `0 3 * * *` (03:00 daily) | `POST /api/v1/admin/cleanup-expired` | 300s | 1 |
| `cleanup-sessions` | `0 4 * * *` (04:00 daily) | `POST /api/v1/admin/cleanup-sessions` | 120s | 1 |
| `cleanup-magic-links` | `30 4 * * *` (04:30 daily) | `POST /api/v1/admin/cleanup-magic-links` | 60s | 1 |
| `recalculate-confidence` | `0 5 * * 0` (05:00 Sun) | `POST /api/v1/admin/recalculate-confidence` | 600s | 0 |
| `cleanup-sync-logs` | `0 5 * * 3` (05:00 Wed) | `POST /api/v1/admin/cleanup/sync-logs` | 120s | 1 |

### Why these cadences
- **Daily cleanups** run between 03:00 and 04:30 UTC, staggered so Prisma connection-pool usage doesn't overlap during the nightly maintenance window.
- **Weekly confidence recalculation** is long-running (minutes to 10 min on the full provider set) and has **0 retries** — a failed run should get human attention, not a retry cascade.
- **Sync-log retention** runs mid-week to separate from the Sunday confidence job.
- All jobs use UTC to match Cloud SQL's maintenance window timezone. `X-Admin-Secret` header authenticates each call; see `adminAuthMiddleware` in `packages/backend/src/routes/admin.ts`.

## Running the script

```bash
# Prereqs (once per project)
gcloud services enable cloudscheduler.googleapis.com
# Cloud Scheduler requires an App Engine app in the region, even if we
# don't use App Engine. One-time bootstrap:
gcloud app create --region=us-central1

# Dry-run — prints every gcloud command with the secret redacted.
bash infra/scheduler/cloud-scheduler-jobs.sh --dry-run

# Apply — resolves the backend URL from the running Cloud Run service
# and pulls ADMIN_SECRET from Secret Manager if it's not in env.
bash infra/scheduler/cloud-scheduler-jobs.sh

# Override knobs:
ADMIN_SECRET=<secret> BACKEND_URL=https://my-backend.run.app \
  bash infra/scheduler/cloud-scheduler-jobs.sh

bash infra/scheduler/cloud-scheduler-jobs.sh \
  --project=verifymyprovider-staging \
  --region=us-central1
```

## Idempotency

- Each job is detected via `gcloud scheduler jobs describe`.
- Missing → `gcloud scheduler jobs create http`.
- Present → `gcloud scheduler jobs update http` with the same flag set.
- Re-running is a no-op when the desired state matches.

## `ADMIN_SECRET` handling

The script never hard-codes the secret and never prints it. Resolution order:
1. `ADMIN_SECRET` env var (wins if set).
2. Secret Manager secret named `ADMIN_SECRET` in the target project.
3. Abort with a clear error message if neither is available.

In dry-run mode, the secret is replaced with `<redacted>` in the printed command preview so the output is safe to paste into tickets/logs.

Once the scheduler job is created, the header is stored encrypted by GCP and is not retrievable via `gcloud scheduler jobs describe` — rotating `ADMIN_SECRET` means re-running this script.

## Verifying after apply

```bash
# List all jobs and their next run times
gcloud scheduler jobs list \
  --location=us-central1 \
  --project=verifymyprovider-prod

# Inspect one job's config (headers are redacted)
gcloud scheduler jobs describe cleanup-expired \
  --location=us-central1 \
  --project=verifymyprovider-prod

# Fire a job manually to smoke-test
gcloud scheduler jobs run cleanup-expired \
  --location=us-central1 \
  --project=verifymyprovider-prod

# Then check the backend log for the corresponding `Admin cleanup ...` entry
gcloud logging read \
  'resource.type="cloud_run_revision" jsonPayload.msg:"Admin cleanup"' \
  --limit=10 --project=verifymyprovider-prod
```

## Rotating `ADMIN_SECRET`

1. Update the secret in Secret Manager (`gcloud secrets versions add ADMIN_SECRET --data-file=-`).
2. Re-deploy the backend so the Cloud Run service picks up the new secret version (`gcloud run services update verifymyprovider-backend --region=us-central1`).
3. Re-run this script so scheduler jobs stop sending the old value. The `update` path overwrites `--headers`.

## Related

- Endpoints themselves: `packages/backend/src/routes/admin.ts`
- Auth middleware: `adminAuthMiddleware` in the same file (X-Admin-Secret check, timing-safe comparison)
- Rate limiter: `adminRateLimiter` (10/hr/IP, router-level — Cloud Scheduler's IP range sits well under this)
- Alerts on failure: `infra/alerts/policies/backend-5xx.json` will fire if any of these endpoints return 5xx (the scheduler's retry counts against the 5xx budget too).

## TODO: additional retention jobs

- **`cleanup-admin-actions`** — trims the `admin_actions` audit table (added in IM-11). The endpoint exists at `POST /api/v1/admin/cleanup-admin-actions` and defaults to a 90-day retention window; add a weekly scheduler entry (suggested `0 6 * * 1`, Mondays 06:00 UTC) once the table has accumulated enough volume that pruning matters. Same `X-Admin-Secret` auth as everything else.
