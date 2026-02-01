#!/bin/bash
#
# Setup Cloud Scheduler Jobs for VerifyMyProvider
#
# This script creates scheduled jobs for:
#   - Expired verification cleanup (hourly)
#   - Sync log cleanup (daily)
#   - Cache warmup (optional)
#
# Usage:
#   export PROJECT_ID=your-project-id
#   export ADMIN_SECRET=your-admin-secret
#   export API_BASE_URL=https://api.verifymyprovider.com
#   ./setup-scheduled-jobs.sh
#
# Requirements:
#   - gcloud CLI installed and authenticated
#   - Cloud Scheduler API enabled
#   - Appropriate IAM permissions

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Validate environment
if [ -z "$PROJECT_ID" ]; then
    error "PROJECT_ID environment variable is required"
    exit 1
fi

if [ -z "$ADMIN_SECRET" ]; then
    error "ADMIN_SECRET environment variable is required"
    exit 1
fi

API_BASE_URL="${API_BASE_URL:-https://api.verifymyprovider.com}"
LOCATION="${LOCATION:-us-central1}"

echo ""
echo "=============================================="
echo " Cloud Scheduler Jobs Setup"
echo "=============================================="
echo ""
info "Project: $PROJECT_ID"
info "API URL: $API_BASE_URL"
info "Location: $LOCATION"
echo ""

# Enable Cloud Scheduler API if not already enabled
info "Ensuring Cloud Scheduler API is enabled..."
gcloud services enable cloudscheduler.googleapis.com --project="$PROJECT_ID" 2>/dev/null || true

# ============================================
# 1. Expired Verifications Cleanup (Hourly)
# ============================================
info "Creating/updating cleanup-expired-verifications job..."

JOB_NAME="cleanup-expired-verifications"
if gcloud scheduler jobs describe "$JOB_NAME" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    &>/dev/null; then
    warn "Job '$JOB_NAME' already exists, updating..."
    gcloud scheduler jobs update http "$JOB_NAME" \
        --project="$PROJECT_ID" \
        --location="$LOCATION" \
        --schedule="0 * * * *" \
        --uri="${API_BASE_URL}/api/v1/admin/cleanup-expired" \
        --http-method=POST \
        --headers="X-Admin-Secret=${ADMIN_SECRET}" \
        --description="Hourly cleanup of expired verification records (TTL enforcement)"
    success "Updated $JOB_NAME"
else
    gcloud scheduler jobs create http "$JOB_NAME" \
        --project="$PROJECT_ID" \
        --location="$LOCATION" \
        --schedule="0 * * * *" \
        --uri="${API_BASE_URL}/api/v1/admin/cleanup-expired" \
        --http-method=POST \
        --headers="X-Admin-Secret=${ADMIN_SECRET}" \
        --description="Hourly cleanup of expired verification records (TTL enforcement)"
    success "Created $JOB_NAME"
fi

# ============================================
# 2. Sync Logs Cleanup (Daily at 3 AM)
# ============================================
info "Creating/updating cleanup-sync-logs job..."

JOB_NAME="cleanup-sync-logs"
if gcloud scheduler jobs describe "$JOB_NAME" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    &>/dev/null; then
    warn "Job '$JOB_NAME' already exists, updating..."
    gcloud scheduler jobs update http "$JOB_NAME" \
        --project="$PROJECT_ID" \
        --location="$LOCATION" \
        --schedule="0 3 * * *" \
        --uri="${API_BASE_URL}/api/v1/admin/cleanup/sync-logs" \
        --http-method=POST \
        --headers="X-Admin-Secret=${ADMIN_SECRET}" \
        --description="Daily cleanup of sync_logs older than 90 days"
    success "Updated $JOB_NAME"
else
    gcloud scheduler jobs create http "$JOB_NAME" \
        --project="$PROJECT_ID" \
        --location="$LOCATION" \
        --schedule="0 3 * * *" \
        --uri="${API_BASE_URL}/api/v1/admin/cleanup/sync-logs" \
        --http-method=POST \
        --headers="X-Admin-Secret=${ADMIN_SECRET}" \
        --description="Daily cleanup of sync_logs older than 90 days"
    success "Created $JOB_NAME"
fi

# ============================================
# 3. Location Enrichment (Weekly on Sunday)
# ============================================
info "Creating/updating location-enrichment job..."

JOB_NAME="location-enrichment"
if gcloud scheduler jobs describe "$JOB_NAME" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    &>/dev/null; then
    warn "Job '$JOB_NAME' already exists, updating..."
    gcloud scheduler jobs update http "$JOB_NAME" \
        --project="$PROJECT_ID" \
        --location="$LOCATION" \
        --schedule="0 4 * * 0" \
        --uri="${API_BASE_URL}/api/v1/admin/locations/enrich" \
        --http-method=POST \
        --headers="X-Admin-Secret=${ADMIN_SECRET}" \
        --description="Weekly location name enrichment from provider organization names"
    success "Updated $JOB_NAME"
else
    gcloud scheduler jobs create http "$JOB_NAME" \
        --project="$PROJECT_ID" \
        --location="$LOCATION" \
        --schedule="0 4 * * 0" \
        --uri="${API_BASE_URL}/api/v1/admin/locations/enrich" \
        --http-method=POST \
        --headers="X-Admin-Secret=${ADMIN_SECRET}" \
        --description="Weekly location name enrichment from provider organization names"
    success "Created $JOB_NAME"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "=============================================="
echo " Scheduled Jobs Configuration Complete"
echo "=============================================="
echo ""

info "Configured jobs:"
echo ""
gcloud scheduler jobs list \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --format="table(name, schedule, httpTarget.uri, state)"

echo ""
success "Cloud Scheduler jobs configured successfully!"
echo ""
echo "Job Schedule Summary:"
echo "  - cleanup-expired-verifications: Every hour (0 * * * *)"
echo "  - cleanup-sync-logs: Daily at 3 AM (0 3 * * *)"
echo "  - location-enrichment: Weekly Sunday at 4 AM (0 4 * * 0)"
echo ""
echo "Commands to manage jobs:"
echo ""
echo "  # Manually run a job"
echo "  gcloud scheduler jobs run cleanup-sync-logs --project=$PROJECT_ID --location=$LOCATION"
echo ""
echo "  # View job details"
echo "  gcloud scheduler jobs describe cleanup-sync-logs --project=$PROJECT_ID --location=$LOCATION"
echo ""
echo "  # View recent executions"
echo "  gcloud scheduler jobs describe cleanup-sync-logs --project=$PROJECT_ID --location=$LOCATION --format='yaml(lastAttemptTime, scheduleTime, status)'"
echo ""
