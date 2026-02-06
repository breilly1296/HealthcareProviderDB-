#!/usr/bin/env bash
# =============================================================================
# Setup Cloud Scheduler Jobs for VerifyMyProvider
# =============================================================================
#
# PURPOSE:
#   Creates (or updates) Google Cloud Scheduler HTTP jobs that call the
#   backend admin cleanup endpoints on a recurring schedule:
#
#     1. cleanup-expired-verifications — hourly  (0 * * * *)
#        POST /api/v1/admin/cleanup-expired
#        Deletes expired verification_logs and provider_plan_acceptances.
#
#     2. cleanup-sync-logs — daily at 3 AM ET  (0 3 * * *)
#        POST /api/v1/admin/cleanup/sync-logs
#        Deletes sync_logs older than 90 days (default retention).
#
# PREREQUISITES:
#   1. gcloud CLI installed and authenticated with sufficient permissions
#      (roles/cloudscheduler.admin, roles/secretmanager.secretAccessor).
#
#   2. Cloud Scheduler requires an App Engine application in the project,
#      even if you don't use App Engine. If it doesn't exist yet:
#
#        gcloud app create --region=us-central1 \
#          --project=verifymyprovider-prod
#
#      This is a one-time operation and cannot be undone (region is permanent).
#
#   3. The ADMIN_SECRET must be stored in Secret Manager:
#
#        echo -n "your-secret-value" | gcloud secrets create ADMIN_SECRET \
#          --data-file=- --project=verifymyprovider-prod
#
#      If it already exists, the script reads the latest version automatically.
#
# USAGE:
#   Run once in Google Cloud Shell (or any machine with gcloud configured):
#
#     chmod +x scripts/setup-cloud-scheduler.sh
#     ./scripts/setup-cloud-scheduler.sh
#
#   To use a different project or backend URL:
#
#     PROJECT_ID=my-other-project \
#     BACKEND_URL=https://my-backend.run.app \
#       ./scripts/setup-cloud-scheduler.sh
#
# IDEMPOTENCY:
#   The script checks whether each job already exists before creating it.
#   If a job exists, it is updated in place. Safe to re-run at any time.
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (override via environment variables)
# ---------------------------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-verifymyprovider-prod}"
REGION="${REGION:-us-central1}"
BACKEND_URL="${BACKEND_URL:-https://verifymyprovider-backend-741434145252.us-central1.run.app}"

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $1"; }
error()   { echo -e "${RED}[ERROR]${NC}   $1"; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
echo ""
echo "=============================================="
echo "  Cloud Scheduler Setup — VerifyMyProvider"
echo "=============================================="
echo ""
info "Project:     $PROJECT_ID"
info "Region:      $REGION"
info "Backend URL: $BACKEND_URL"
echo ""

# 1. Verify gcloud is available
if ! command -v gcloud &>/dev/null; then
  error "gcloud CLI not found. Install it from https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# 2. Enable Cloud Scheduler API (idempotent)
info "Ensuring Cloud Scheduler API is enabled..."
gcloud services enable cloudscheduler.googleapis.com \
  --project="$PROJECT_ID" 2>/dev/null || true
success "Cloud Scheduler API enabled"

# 3. Verify App Engine app exists (required dependency for Cloud Scheduler)
info "Checking for App Engine application..."
if gcloud app describe --project="$PROJECT_ID" &>/dev/null; then
  success "App Engine application exists"
else
  error "No App Engine application found in project '$PROJECT_ID'."
  error "Cloud Scheduler requires an App Engine app (even if unused)."
  echo ""
  echo "  Create one with:"
  echo "    gcloud app create --region=$REGION --project=$PROJECT_ID"
  echo ""
  echo "  Then re-run this script."
  exit 1
fi

# 4. Fetch ADMIN_SECRET from Secret Manager
info "Reading ADMIN_SECRET from Secret Manager..."
ADMIN_SECRET=$(gcloud secrets versions access latest \
  --secret=ADMIN_SECRET \
  --project="$PROJECT_ID" 2>/dev/null) || {
  error "Failed to read ADMIN_SECRET from Secret Manager."
  error "Ensure the secret exists:"
  echo ""
  echo "  echo -n 'your-secret-value' | gcloud secrets create ADMIN_SECRET \\"
  echo "    --data-file=- --project=$PROJECT_ID"
  echo ""
  exit 1
}

if [ -z "$ADMIN_SECRET" ]; then
  error "ADMIN_SECRET is empty. Check the secret value in Secret Manager."
  exit 1
fi
success "ADMIN_SECRET retrieved (${#ADMIN_SECRET} chars)"
echo ""

# ---------------------------------------------------------------------------
# Helper: create or update a Cloud Scheduler HTTP job
# ---------------------------------------------------------------------------
create_or_update_job() {
  local job_name="$1"
  local schedule="$2"
  local uri="$3"
  local description="$4"
  local time_zone="${5:-Etc/UTC}"

  info "Configuring job '$job_name'..."

  if gcloud scheduler jobs describe "$job_name" \
      --location="$REGION" \
      --project="$PROJECT_ID" &>/dev/null; then

    warn "Job '$job_name' already exists — updating..."
    gcloud scheduler jobs update http "$job_name" \
      --location="$REGION" \
      --project="$PROJECT_ID" \
      --schedule="$schedule" \
      --time-zone="$time_zone" \
      --uri="$uri" \
      --http-method=POST \
      --headers="X-Admin-Secret=${ADMIN_SECRET},Content-Type=application/json" \
      --message-body='{}' \
      --attempt-deadline=300s \
      --description="$description"
    success "Updated '$job_name'"
  else
    gcloud scheduler jobs create http "$job_name" \
      --location="$REGION" \
      --project="$PROJECT_ID" \
      --schedule="$schedule" \
      --time-zone="$time_zone" \
      --uri="$uri" \
      --http-method=POST \
      --headers="X-Admin-Secret=${ADMIN_SECRET},Content-Type=application/json" \
      --message-body='{}' \
      --attempt-deadline=300s \
      --description="$description"
    success "Created '$job_name'"
  fi
}

# =============================================================================
# Job 1: Cleanup expired verifications (hourly)
# =============================================================================
echo "--- Job 1: Expired Verifications Cleanup ---"
create_or_update_job \
  "cleanup-expired-verifications" \
  "0 * * * *" \
  "${BACKEND_URL}/api/v1/admin/cleanup-expired" \
  "Hourly cleanup of expired verification records and plan acceptances" \
  "Etc/UTC"
echo ""

# =============================================================================
# Job 2: Cleanup old sync logs (daily at 3 AM Eastern)
# =============================================================================
echo "--- Job 2: Sync Logs Cleanup ---"
create_or_update_job \
  "cleanup-sync-logs" \
  "0 3 * * *" \
  "${BACKEND_URL}/api/v1/admin/cleanup/sync-logs" \
  "Daily cleanup of sync_logs older than 90-day retention period" \
  "America/New_York"
echo ""

# =============================================================================
# Job 3: Recalculate confidence scores (daily at 4 AM Eastern)
# =============================================================================
echo "--- Job 3: Confidence Score Recalculation ---"
create_or_update_job \
  "recalculate-confidence-scores" \
  "0 4 * * *" \
  "${BACKEND_URL}/api/v1/admin/recalculate-confidence" \
  "Daily confidence score recalculation with time-based decay" \
  "America/New_York"
echo ""

# =============================================================================
# Summary
# =============================================================================
echo "=============================================="
echo "  Jobs Configured"
echo "=============================================="
echo ""

gcloud scheduler jobs list \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  --format="table(name.basename(), schedule, timeZone, httpTarget.uri, state)"

# =============================================================================
# Test: Trigger each job immediately
# =============================================================================
echo ""
echo "=============================================="
echo "  Testing Jobs"
echo "=============================================="
echo ""

info "Triggering cleanup-expired-verifications..."
gcloud scheduler jobs run cleanup-expired-verifications \
  --location="$REGION" \
  --project="$PROJECT_ID"
success "cleanup-expired-verifications triggered"

info "Triggering cleanup-sync-logs..."
gcloud scheduler jobs run cleanup-sync-logs \
  --location="$REGION" \
  --project="$PROJECT_ID"
success "cleanup-sync-logs triggered"

info "Triggering recalculate-confidence-scores..."
gcloud scheduler jobs run recalculate-confidence-scores \
  --location="$REGION" \
  --project="$PROJECT_ID"
success "recalculate-confidence-scores triggered"

echo ""
info "Jobs triggered. Check execution results in Cloud Console:"
echo "  https://console.cloud.google.com/cloudscheduler?project=$PROJECT_ID"

# =============================================================================
# Verify: curl the endpoints directly
# =============================================================================
echo ""
echo "=============================================="
echo "  Verifying Endpoints"
echo "=============================================="
echo ""
info "Calling cleanup-expired endpoint..."

CLEANUP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BACKEND_URL}/api/v1/admin/cleanup-expired" \
  -H "X-Admin-Secret: ${ADMIN_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{}')

if [ "$CLEANUP_STATUS" = "200" ]; then
  success "cleanup-expired returned HTTP $CLEANUP_STATUS"
elif [ "$CLEANUP_STATUS" = "503" ]; then
  error "cleanup-expired returned HTTP 503 — ADMIN_SECRET not configured on the backend"
  error "Set the ADMIN_SECRET environment variable on the Cloud Run service:"
  echo "  gcloud run services update verifymyprovider-backend \\"
  echo "    --region=$REGION --project=$PROJECT_ID \\"
  echo "    --set-secrets=ADMIN_SECRET=ADMIN_SECRET:latest"
elif [ "$CLEANUP_STATUS" = "401" ]; then
  error "cleanup-expired returned HTTP 401 — ADMIN_SECRET mismatch"
  error "The secret in Secret Manager doesn't match the one deployed to Cloud Run."
else
  warn "cleanup-expired returned HTTP $CLEANUP_STATUS (expected 200)"
fi

echo ""
info "Calling cleanup/sync-logs endpoint..."

SYNC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BACKEND_URL}/api/v1/admin/cleanup/sync-logs" \
  -H "X-Admin-Secret: ${ADMIN_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{}')

if [ "$SYNC_STATUS" = "200" ]; then
  success "cleanup/sync-logs returned HTTP $SYNC_STATUS"
elif [ "$SYNC_STATUS" = "503" ]; then
  error "cleanup/sync-logs returned HTTP 503 — ADMIN_SECRET not configured on the backend"
elif [ "$SYNC_STATUS" = "401" ]; then
  error "cleanup/sync-logs returned HTTP 401 — ADMIN_SECRET mismatch"
else
  warn "cleanup/sync-logs returned HTTP $SYNC_STATUS (expected 200)"
fi

echo ""
info "Calling recalculate-confidence endpoint (dry run)..."

CONFIDENCE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BACKEND_URL}/api/v1/admin/recalculate-confidence?dryRun=true" \
  -H "X-Admin-Secret: ${ADMIN_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{}')

if [ "$CONFIDENCE_STATUS" = "200" ]; then
  success "recalculate-confidence returned HTTP $CONFIDENCE_STATUS"
elif [ "$CONFIDENCE_STATUS" = "503" ]; then
  error "recalculate-confidence returned HTTP 503 — ADMIN_SECRET not configured on the backend"
elif [ "$CONFIDENCE_STATUS" = "401" ]; then
  error "recalculate-confidence returned HTTP 401 — ADMIN_SECRET mismatch"
else
  warn "recalculate-confidence returned HTTP $CONFIDENCE_STATUS (expected 200)"
fi

# =============================================================================
# Done
# =============================================================================
echo ""
echo "=============================================="
echo "  Setup Complete"
echo "=============================================="
echo ""
echo "Schedule Summary:"
echo "  cleanup-expired-verifications  : Every hour        (0 * * * * UTC)"
echo "  cleanup-sync-logs              : Daily at 3 AM ET  (0 3 * * * America/New_York)"
echo "  recalculate-confidence-scores  : Daily at 4 AM ET  (0 4 * * * America/New_York)"
echo ""
echo "Useful commands:"
echo ""
echo "  # List all scheduler jobs"
echo "  gcloud scheduler jobs list --location=$REGION --project=$PROJECT_ID"
echo ""
echo "  # Manually trigger a job"
echo "  gcloud scheduler jobs run cleanup-expired-verifications --location=$REGION --project=$PROJECT_ID"
echo ""
echo "  # View job details and last execution"
echo "  gcloud scheduler jobs describe cleanup-sync-logs --location=$REGION --project=$PROJECT_ID"
echo ""
echo "  # Pause a job"
echo "  gcloud scheduler jobs pause cleanup-sync-logs --location=$REGION --project=$PROJECT_ID"
echo ""
echo "  # Resume a paused job"
echo "  gcloud scheduler jobs resume cleanup-sync-logs --location=$REGION --project=$PROJECT_ID"
echo ""
echo "  # Delete a job"
echo "  gcloud scheduler jobs delete cleanup-sync-logs --location=$REGION --project=$PROJECT_ID"
echo ""
echo "  # View recent execution logs"
echo "  gcloud logging read 'resource.type=\"cloud_scheduler_job\"' \\"
echo "    --project=$PROJECT_ID --limit=20 --format=json"
echo ""
