#!/usr/bin/env bash
# infra/alerts/cloud-monitoring-alerts.sh
#
# Creates (or updates) Cloud Logging log-based metrics and Cloud Monitoring
# alert policies for the verifymyprovider backend. Idempotent: metrics are
# updated in place if they already exist, and policies are skipped if a
# policy with the same displayName is already present.
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login / application-default login)
#   - gcloud alpha components installed (gcloud components install alpha)
#   - GCP_PROJECT_ID env var OR pass --project=PROJECT_ID
#
# Usage:
#   bash infra/alerts/cloud-monitoring-alerts.sh            # apply
#   bash infra/alerts/cloud-monitoring-alerts.sh --dry-run  # print only
#
# TODO(notifications): This script intentionally leaves notificationChannels
# empty. To page someone, create channels with `gcloud alpha monitoring
# channels create` and either patch the policy JSON files or run:
#   gcloud alpha monitoring policies update POLICY_ID \
#     --add-notification-channels=projects/PROJECT/notificationChannels/CH_ID

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROJECT_ID="${GCP_PROJECT_ID:-verifymyprovider-prod}"
BACKEND_SERVICE="verifymyprovider-backend"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICIES_DIR="$SCRIPT_DIR/policies"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --project=*) PROJECT_ID="${arg#*=}" ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

echo "=========================================================="
echo "  Cloud Monitoring alerts (dry-run=$DRY_RUN)"
echo "  project : $PROJECT_ID"
echo "  service : $BACKEND_SERVICE"
echo "=========================================================="
echo

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

# Create or update a log-based counter metric.
#   $1 = metric name (must match the policy JSON filter)
#   $2 = human-readable description
#   $3 = Cloud Logging filter expression
create_or_update_metric() {
  local name="$1" description="$2" filter="$3"

  if gcloud logging metrics describe "$name" \
       --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "[update] metric '$name'"
    run gcloud logging metrics update "$name" \
      --description="$description" \
      --log-filter="$filter" \
      --project="$PROJECT_ID" \
      --quiet
  else
    echo "[create] metric '$name'"
    run gcloud logging metrics create "$name" \
      --description="$description" \
      --log-filter="$filter" \
      --project="$PROJECT_ID" \
      --quiet
  fi
}

# Create an alert policy from a JSON file if no policy with the same
# displayName already exists in the project. We don't auto-update existing
# policies — edits to a policy JSON file should be applied manually via
# `gcloud alpha monitoring policies update POLICY_ID --policy-from-file=...`
# so notification channels added in the console aren't clobbered.
create_policy_if_absent() {
  local policy_file="$1"
  local display_name

  display_name=$(node -e \
    "process.stdout.write(require(process.argv[1]).displayName)" \
    "$policy_file")

  local existing
  existing=$(gcloud alpha monitoring policies list \
    --project="$PROJECT_ID" \
    --filter="displayName=\"$display_name\"" \
    --format="value(name)" 2>/dev/null || true)

  if [[ -n "$existing" ]]; then
    echo "[skip]   policy '$display_name' already exists: $existing"
    return 0
  fi

  echo "[create] policy '$display_name'"
  run gcloud alpha monitoring policies create \
    --policy-from-file="$policy_file" \
    --project="$PROJECT_ID" \
    --quiet
}

# ---------------------------------------------------------------------------
# Step 1: log-based metrics
# ---------------------------------------------------------------------------
#
# Filter syntax reference:
#   https://cloud.google.com/logging/docs/view/logging-query-language
#
# Cloud Run structured logs land under jsonPayload (pino emits JSON to
# stdout); request logs are populated by the Cloud Run frontend under
# httpRequest. We match both text and JSON forms to stay resilient to
# logger changes.

echo "--- step 1: log-based metrics ---"

# 1a. 5xx response counter — counts one log entry per HTTP response where
# the status code is >= 500 on the backend Cloud Run service.
create_or_update_metric \
  "verifymyprovider_backend_5xx" \
  "Count of backend HTTP 5xx responses (IM-06)." \
  "resource.type=\"cloud_run_revision\"
resource.labels.service_name=\"${BACKEND_SERVICE}\"
httpRequest.status>=500"

# 1b. Startup / DB crash counter — catches the Prisma init error raised
# when the pool can't reach Cloud SQL, and the Node ECONNREFUSED that bubbles
# up from a closed socket. Broad matching across textPayload and jsonPayload
# because Node/pino emit differently for thrown errors vs. logged messages.
create_or_update_metric \
  "verifymyprovider_backend_startup_crash" \
  "Count of PrismaClientInitializationError or ECONNREFUSED events (IM-06)." \
  "resource.type=\"cloud_run_revision\"
resource.labels.service_name=\"${BACKEND_SERVICE}\"
(
  textPayload:\"PrismaClientInitializationError\"
  OR textPayload:\"ECONNREFUSED\"
  OR jsonPayload.msg:\"PrismaClientInitializationError\"
  OR jsonPayload.msg:\"ECONNREFUSED\"
  OR jsonPayload.err.name:\"PrismaClientInitializationError\"
  OR jsonPayload.err.code=\"ECONNREFUSED\"
)"

# 1c. CAPTCHA / rate-limiter fail-open counter — fires when the backend is
# serving in degraded mode (Redis/Memorystore unreachable) or when the
# CAPTCHA verifier falls back to permissive mode. Also catches the
# X-RateLimit-Status: degraded response header when emitted to logs.
create_or_update_metric \
  "verifymyprovider_captcha_fail_open" \
  "Count of rate-limiter / CAPTCHA fail-open events (IM-06)." \
  "resource.type=\"cloud_run_revision\"
resource.labels.service_name=\"${BACKEND_SERVICE}\"
(
  textPayload:\"Rate limiter Redis unavailable\"
  OR jsonPayload.msg:\"Rate limiter Redis unavailable\"
  OR textPayload:\"CAPTCHA_FAIL_MODE\"
  OR jsonPayload.msg:\"CAPTCHA_FAIL_MODE\"
  OR jsonPayload.mode=\"fail-open\"
  OR jsonPayload.rateLimitStatus=\"degraded\"
)"

echo

# ---------------------------------------------------------------------------
# Step 2: alert policies
# ---------------------------------------------------------------------------
#
# Liveness-probe-failures uses the built-in run.googleapis.com/container/
# probe_attempt_count metric (no log-based metric needed — it's populated
# directly by Cloud Run now that startup/liveness probes are configured in
# the deploy workflows).

echo "--- step 2: alert policies ---"

for policy in \
    "$POLICIES_DIR/backend-5xx.json" \
    "$POLICIES_DIR/backend-startup-crash.json" \
    "$POLICIES_DIR/captcha-fail-open.json" \
    "$POLICIES_DIR/liveness-probe-failures.json"; do
  if [[ ! -f "$policy" ]]; then
    echo "ERROR: missing policy file $policy" >&2
    exit 1
  fi
  create_policy_if_absent "$policy"
done

echo
echo "=========================================================="
echo "  done."
if [[ "$DRY_RUN" == "true" ]]; then
  echo "  (dry-run — no resources were created or modified.)"
else
  echo "  next: wire notification channels — see README.md."
fi
echo "=========================================================="
