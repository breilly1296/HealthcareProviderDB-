#!/usr/bin/env bash
# infra/scheduler/cloud-scheduler-jobs.sh
#
# Creates (or updates) Cloud Scheduler jobs that drive the backend's admin
# cleanup + retention endpoints. Idempotent: each job is create-if-absent,
# update-in-place otherwise. Follows the pattern of
# infra/alerts/cloud-monitoring-alerts.sh.
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login)
#   - The Cloud Scheduler API enabled on the project
#   - An App Engine app exists in the project's region (a GCP quirk:
#     Cloud Scheduler requires one even though we don't use App Engine)
#   - ADMIN_SECRET exported in the environment, OR stored in Secret Manager
#     under the secret name `ADMIN_SECRET` (the script falls back to it)
#   - GCP_PROJECT_ID env var OR pass --project=PROJECT_ID
#
# Usage:
#   bash infra/scheduler/cloud-scheduler-jobs.sh            # apply
#   bash infra/scheduler/cloud-scheduler-jobs.sh --dry-run  # print only
#   bash infra/scheduler/cloud-scheduler-jobs.sh --project=verifymyprovider-staging
#
# Security notes:
#   - ADMIN_SECRET is NEVER printed by this script. The dry-run output
#     redacts the value in the preview `--headers` string.
#   - Once a scheduler job is created, the header is stored encrypted in
#     GCP and is not retrievable via `gcloud scheduler jobs describe`.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROJECT_ID="${GCP_PROJECT_ID:-verifymyprovider-prod}"
REGION="${GCP_REGION:-us-central1}"
BACKEND_SERVICE="${BACKEND_SERVICE:-verifymyprovider-backend}"
BACKEND_URL="${BACKEND_URL:-}"
TIME_ZONE="UTC"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --project=*) PROJECT_ID="${arg#*=}" ;;
    --region=*) REGION="${arg#*=}" ;;
    --backend-url=*) BACKEND_URL="${arg#*=}" ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Resolve BACKEND_URL — prefer explicit env/flag, fall back to describing
# the running Cloud Run service. Keeps the script ergonomic in CI and on
# a fresh workstation.
# ---------------------------------------------------------------------------

if [[ -z "$BACKEND_URL" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    BACKEND_URL="https://<backend-url-resolved-at-apply-time>"
  else
    echo "Resolving backend URL from Cloud Run service '$BACKEND_SERVICE'..."
    BACKEND_URL=$(gcloud run services describe "$BACKEND_SERVICE" \
      --region="$REGION" \
      --project="$PROJECT_ID" \
      --format='value(status.url)' 2>/dev/null || true)
    if [[ -z "$BACKEND_URL" ]]; then
      echo "ERROR: could not resolve backend URL. Set BACKEND_URL or pass --backend-url=https://..." >&2
      exit 1
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Resolve ADMIN_SECRET — env var wins; otherwise pull from Secret Manager.
# Never printed. For dry-run we short-circuit with a sentinel so the script
# can fully exercise its logic without needing auth.
# ---------------------------------------------------------------------------

if [[ "$DRY_RUN" == "true" && -z "${ADMIN_SECRET:-}" ]]; then
  ADMIN_SECRET="<dry-run-placeholder>"
elif [[ -z "${ADMIN_SECRET:-}" ]]; then
  echo "ADMIN_SECRET env var not set — fetching from Secret Manager..."
  ADMIN_SECRET=$(gcloud secrets versions access latest \
    --secret=ADMIN_SECRET \
    --project="$PROJECT_ID" 2>/dev/null || true)
  if [[ -z "$ADMIN_SECRET" ]]; then
    echo "ERROR: ADMIN_SECRET env var not set and no ADMIN_SECRET secret found." >&2
    echo "       Export ADMIN_SECRET=... or create the secret first." >&2
    exit 1
  fi
fi

echo "=========================================================="
echo "  Cloud Scheduler jobs (dry-run=$DRY_RUN)"
echo "  project : $PROJECT_ID"
echo "  region  : $REGION"
echo "  backend : $BACKEND_URL"
echo "  secret  : <redacted>"
echo "=========================================================="
echo

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Print a command to stdout when DRY_RUN=true, otherwise execute it. For
# readability in dry-run output we redact any occurrence of the secret.
run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    local redacted=()
    local arg
    for arg in "$@"; do
      redacted+=("${arg//$ADMIN_SECRET/<redacted>}")
    done
    echo "  [dry-run] ${redacted[*]}"
  else
    "$@"
  fi
}

# Create (if absent) or update (if present) a Cloud Scheduler HTTP job.
#   $1 = job name
#   $2 = cron schedule
#   $3 = admin endpoint path (e.g. /api/v1/admin/cleanup-expired)
#   $4 = attempt deadline in seconds
#   $5 = max retry attempts
#   $6 = description
create_or_update_job() {
  local name="$1"
  local schedule="$2"
  local path="$3"
  local deadline="$4"
  local retries="$5"
  local description="$6"

  local uri="${BACKEND_URL%/}${path}"
  local headers="X-Admin-Secret=${ADMIN_SECRET},Content-Type=application/json"

  local verb
  if gcloud scheduler jobs describe "$name" \
       --location="$REGION" \
       --project="$PROJECT_ID" >/dev/null 2>&1; then
    verb="update"
    echo "[update] job '$name' ($schedule UTC) → $path"
  else
    verb="create"
    echo "[create] job '$name' ($schedule UTC) → $path"
  fi

  run gcloud scheduler jobs "$verb" http "$name" \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --schedule="$schedule" \
    --uri="$uri" \
    --http-method=POST \
    --headers="$headers" \
    --attempt-deadline="${deadline}s" \
    --max-retry-attempts="$retries" \
    --time-zone="$TIME_ZONE" \
    --description="$description" \
    --quiet
}

# ---------------------------------------------------------------------------
# Job definitions
# ---------------------------------------------------------------------------
# Schedules are in UTC and staggered to avoid overlap on Cloud SQL during
# the nightly maintenance window. The backend's adminRateLimiter (10/hr/IP)
# easily accommodates this cadence — Cloud Scheduler calls originate from a
# small Google IP range, well under the limit.

# 1. cleanup-expired — delete verification records past their TTL.
#    Longest of the cleanup jobs (batches over potentially large tables).
create_or_update_job \
  "cleanup-expired" \
  "0 3 * * *" \
  "/api/v1/admin/cleanup-expired" \
  "300" \
  "1" \
  "Daily cleanup of expired verification records (TTL enforcement)"

# 2. cleanup-sessions — delete session rows past `expiresAt`.
create_or_update_job \
  "cleanup-sessions" \
  "0 4 * * *" \
  "/api/v1/admin/cleanup-sessions" \
  "120" \
  "1" \
  "Daily cleanup of expired user sessions"

# 3. cleanup-magic-links — delete magic-link tokens that are expired or
#    already used. Staggered 30 min after cleanup-sessions to avoid
#    coincident Prisma pool usage.
create_or_update_job \
  "cleanup-magic-links" \
  "30 4 * * *" \
  "/api/v1/admin/cleanup-magic-links" \
  "60" \
  "1" \
  "Daily cleanup of expired/used magic link tokens"

# 4. recalculate-confidence — weekly decay pass across all provider
#    confidence scores. Long-running (up to 10 min on full dataset), so
#    we disable automatic retry: if the first attempt fails, an operator
#    should investigate rather than triggering another full pass.
create_or_update_job \
  "recalculate-confidence" \
  "0 5 * * 0" \
  "/api/v1/admin/recalculate-confidence" \
  "600" \
  "0" \
  "Weekly provider confidence-score decay recalculation (Sundays)"

# 5. cleanup-sync-logs — weekly retention trim of the sync_logs table.
create_or_update_job \
  "cleanup-sync-logs" \
  "0 5 * * 3" \
  "/api/v1/admin/cleanup/sync-logs" \
  "120" \
  "1" \
  "Weekly retention cleanup of sync_logs table (Wednesdays)"

echo
echo "=========================================================="
echo "  done."
if [[ "$DRY_RUN" == "true" ]]; then
  echo "  (dry-run — no resources were created or modified.)"
else
  echo "  verify:  gcloud scheduler jobs list --location=$REGION --project=$PROJECT_ID"
fi
echo "=========================================================="
