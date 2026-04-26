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
# ---------------------------------------------------------------------------
# Notification channels
# ---------------------------------------------------------------------------
# The policy JSON files in policies/ ship with `notificationChannels: []` so
# they apply cleanly on a fresh project. To page someone, set
# NOTIFICATION_CHANNEL_ID before running this script and the channel will be
# injected into each policy at apply time (the JSON files stay untouched).
#
# First-run setup:
#   1. Create a notification channel:
#        gcloud beta monitoring channels create \
#          --type=slack \
#          --display-name="VMP Alerts" \
#          --channel-labels=channel_name=#alerts
#      (Alternative: --type=email --channel-labels=email_address=alerts@verifymyprovider.com)
#
#   2. Get the channel ID:
#        gcloud beta monitoring channels list --format="value(name)"
#      The value looks like: projects/PROJECT/notificationChannels/123456789
#
#   3. Re-run this script with the ID set:
#        NOTIFICATION_CHANNEL_ID=projects/PROJECT/notificationChannels/123456789 \
#          bash infra/alerts/cloud-monitoring-alerts.sh
#
# If NOTIFICATION_CHANNEL_ID is empty or unset, the script still applies the
# policies but emits a loud warning — alerts will fire and notify nobody.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROJECT_ID="${GCP_PROJECT_ID:-verifymyprovider-prod}"
BACKEND_SERVICE="verifymyprovider-backend"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICIES_DIR="$SCRIPT_DIR/policies"

# Optional channel ID injected into each policy at apply time. See the
# "Notification channels" comment block above for setup. Empty = no channels
# attached (alert fires but pages no one — warning emitted below).
NOTIFICATION_CHANNEL_ID="${NOTIFICATION_CHANNEL_ID:-}"

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
if [[ -n "$NOTIFICATION_CHANNEL_ID" ]]; then
  echo "  channel : $NOTIFICATION_CHANNEL_ID"
else
  echo "  channel : (none — alerts will fire silently)"
fi
echo "=========================================================="
echo

if [[ -z "$NOTIFICATION_CHANNEL_ID" ]]; then
  echo "WARNING: No NOTIFICATION_CHANNEL_ID set — alert policies will fire" >&2
  echo "         but notify nobody. See the 'Notification channels' comment" >&2
  echo "         block at the top of this script for setup steps." >&2
  echo >&2
fi

# Detect jq once so each policy apply doesn't re-shell out.
HAVE_JQ=false
if command -v jq >/dev/null 2>&1; then
  HAVE_JQ=true
fi

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

# If NOTIFICATION_CHANNEL_ID is set, return the path to a temp file that's a
# copy of the input policy with notificationChannels populated. Otherwise
# echo the original path. Caller is responsible for cleaning up the temp file
# if one was created (we register a trap below).
#
# Prefer jq for structural correctness; fall back to sed when jq is missing.
# The sed fallback assumes the canonical `"notificationChannels": []` shape
# our policy files use — verified across all six JSON files.
inject_notification_channel() {
  local in_file="$1"

  if [[ -z "$NOTIFICATION_CHANNEL_ID" ]]; then
    echo "$in_file"
    return 0
  fi

  local out_file
  out_file=$(mktemp -t "vmp-policy-XXXXXX.json")
  TEMP_FILES+=("$out_file")

  if [[ "$HAVE_JQ" == "true" ]]; then
    jq --arg ch "$NOTIFICATION_CHANNEL_ID" \
      '.notificationChannels = [$ch]' \
      "$in_file" > "$out_file"
  else
    # Escape forward slashes in the channel ID so they don't terminate the
    # sed s|...| delimiter we're using.
    sed "s|\"notificationChannels\": \\[\\]|\"notificationChannels\": [\"${NOTIFICATION_CHANNEL_ID}\"]|" \
      "$in_file" > "$out_file"
  fi

  echo "$out_file"
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

  local apply_file
  apply_file=$(inject_notification_channel "$policy_file")

  echo "[create] policy '$display_name'"
  run gcloud alpha monitoring policies create \
    --policy-from-file="$apply_file" \
    --project="$PROJECT_ID" \
    --quiet
}

# Track temp files generated by inject_notification_channel so we can clean
# them up on exit (success, failure, or interrupt). Initialized empty so
# `set -u` plus `${TEMP_FILES[@]+...}` expansion is safe.
TEMP_FILES=()
cleanup_temp_files() {
  if [[ ${#TEMP_FILES[@]} -gt 0 ]]; then
    rm -f "${TEMP_FILES[@]}"
  fi
}
trap cleanup_temp_files EXIT

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

# 1d. Prisma engine-panic counter — fires when the catch-all Prisma branch
# in errorHandler.ts logs an event with errorName="PrismaClientRustPanic
# Error". Distinct from the startup/init-error counter (1b): a Rust panic
# is the engine subprocess crashing mid-query, not a connection failure.
# Rare but serious — a single occurrence pages on the prisma-rust-panic
# alert policy (CRITICAL severity).
create_or_update_metric \
  "verifymyprovider_prisma_rust_panic" \
  "Count of PrismaClientRustPanicError occurrences (engine panic)." \
  "resource.type=\"cloud_run_revision\"
resource.labels.service_name=\"${BACKEND_SERVICE}\"
jsonPayload.errorName=\"PrismaClientRustPanicError\""

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
    "$POLICIES_DIR/liveness-probe-failures.json" \
    "$POLICIES_DIR/prisma-rust-panic.json"; do
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
