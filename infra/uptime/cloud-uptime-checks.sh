#!/usr/bin/env bash
# infra/uptime/cloud-uptime-checks.sh
#
# Creates (or updates) Cloud Monitoring Uptime Checks for the backend and
# frontend Cloud Run services, plus the matching alert policies that fire
# when 2+ regions fail the check. Idempotent: existing checks are updated
# in place; missing ones are created. Same pattern as
# infra/alerts/cloud-monitoring-alerts.sh and
# infra/scheduler/cloud-scheduler-jobs.sh.
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login)
#   - The Cloud Monitoring API enabled on the project
#   - GCP_PROJECT_ID env var OR pass --project=PROJECT_ID
#   - BACKEND_URL / FRONTEND_URL either exported or auto-resolved from Cloud Run
#
# Usage:
#   bash infra/uptime/cloud-uptime-checks.sh            # apply
#   bash infra/uptime/cloud-uptime-checks.sh --dry-run  # print only
#   bash infra/uptime/cloud-uptime-checks.sh --project=verifymyprovider-staging

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROJECT_ID="${GCP_PROJECT_ID:-verifymyprovider-prod}"
REGION="${GCP_REGION:-us-central1}"
BACKEND_SERVICE="${BACKEND_SERVICE:-verifymyprovider-backend}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-verifymyprovider-frontend}"
BACKEND_URL="${BACKEND_URL:-}"
FRONTEND_URL="${FRONTEND_URL:-https://verifymyprovider.com}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICIES_DIR="$SCRIPT_DIR/../alerts/policies"

# Uptime checks run from three Google-owned regions at once. Failures from 2+
# of these count against the alert's "2+ region" trigger in the policy JSON.
REGIONS="USA_OREGON,USA_IOWA,USA_VIRGINIA"

# Stable check IDs — the alert-policy JSON filters reference these names
# (metric.label.check_id="verifymyprovider-backend-health" etc.), so if you
# rename one, update the matching JSON in ../alerts/policies/ too.
BACKEND_CHECK_ID="verifymyprovider-backend-health"
FRONTEND_CHECK_ID="verifymyprovider-frontend-root"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --project=*) PROJECT_ID="${arg#*=}" ;;
    --region=*) REGION="${arg#*=}" ;;
    --backend-url=*) BACKEND_URL="${arg#*=}" ;;
    --frontend-url=*) FRONTEND_URL="${arg#*=}" ;;
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

# Resolve BACKEND_URL from Cloud Run if not provided, mirroring the pattern
# in infra/scheduler/cloud-scheduler-jobs.sh.
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

# Strip scheme for --hostname (gcloud expects the bare host).
backend_host() { echo "${BACKEND_URL#https://}" | sed 's#/.*##'; }
frontend_host() { echo "${FRONTEND_URL#https://}" | sed 's#/.*##'; }

echo "=========================================================="
echo "  Cloud Monitoring uptime checks (dry-run=$DRY_RUN)"
echo "  project  : $PROJECT_ID"
echo "  backend  : $BACKEND_URL"
echo "  frontend : $FRONTEND_URL"
echo "  regions  : $REGIONS"
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

# Create or update an HTTPS uptime check. gcloud splits create/update into
# separate verbs; detect existence by listing and grepping for the ID.
#   $1 = check ID (also used as display name)
#   $2 = hostname (no scheme)
#   $3 = path (e.g. /health)
#   $4 = check period in seconds (60, 300, 600, 900)
#   $5 = timeout in seconds
#   $6 = content-match string ('' to skip)
create_or_update_uptime_check() {
  local check_id="$1"
  local host="$2"
  local path="$3"
  local period="$4"
  local timeout="$5"
  local content="$6"

  local verb
  if gcloud monitoring uptime list-configs \
       --project="$PROJECT_ID" \
       --filter="displayName=$check_id" \
       --format='value(name)' 2>/dev/null | grep -q .; then
    verb="update"
    echo "[update] uptime check '$check_id' → https://${host}${path}"
  else
    verb="create"
    echo "[create] uptime check '$check_id' → https://${host}${path}"
  fi

  local args=(
    --project="$PROJECT_ID"
    --resource-type=uptime-url
    --resource-labels="host=$host,project_id=$PROJECT_ID"
    --protocol=https
    --path="$path"
    --port=443
    --period="${period}s"
    --timeout="${timeout}s"
    --regions="$REGIONS"
    --status-codes=200
  )

  if [[ -n "$content" ]]; then
    args+=(--matcher-content="$content" --matcher-type=contains_string)
  fi

  run gcloud monitoring uptime "$verb" "$check_id" "${args[@]}"
}

# Create an alert policy if a policy with the same displayName doesn't yet
# exist in the project. Same skip-if-present semantics as the alerts script
# so notification channels added via the console aren't clobbered.
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
# Step 1: uptime checks
# ---------------------------------------------------------------------------

echo "--- step 1: uptime checks ---"

# Backend: HTTPS /health every 60s from 3 regions. Content match on the
# `"status":"ok"` string in the /health response confirms the JSON body
# parsed correctly, not just that 200 was returned (a stale reverse-proxy
# landing page would still return 200 without that string).
create_or_update_uptime_check \
  "$BACKEND_CHECK_ID" \
  "$(backend_host)" \
  "/health" \
  "60" \
  "10" \
  '"status":"ok"'

# Frontend: HTTPS / every 5 min from 3 regions. Less aggressive cadence —
# the frontend is stateless Next.js and its outages are always downstream
# of some other failure (backend, DNS, LB), so we don't need 1-min granularity.
create_or_update_uptime_check \
  "$FRONTEND_CHECK_ID" \
  "$(frontend_host)" \
  "/" \
  "300" \
  "10" \
  ""

echo

# ---------------------------------------------------------------------------
# Step 2: alert policies tied to the uptime checks
# ---------------------------------------------------------------------------

echo "--- step 2: alert policies ---"

for policy in \
    "$POLICIES_DIR/backend-uptime-failure.json" \
    "$POLICIES_DIR/frontend-uptime-failure.json"; do
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
  echo "  verify:  gcloud monitoring uptime list-configs --project=$PROJECT_ID"
fi
echo "=========================================================="
