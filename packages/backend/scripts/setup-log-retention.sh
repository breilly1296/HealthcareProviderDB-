#!/bin/bash
#
# Setup Cloud Logging Retention Policies
#
# This script configures log buckets and sinks for VerifyMyProvider
# to implement the log retention policy defined in docs/LOG-RETENTION-POLICY.md
#
# Usage:
#   export PROJECT_ID=your-project-id
#   ./setup-log-retention.sh
#
# Requirements:
#   - gcloud CLI installed and authenticated
#   - Appropriate IAM permissions (roles/logging.admin)

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
    echo ""
    echo "Usage:"
    echo "  export PROJECT_ID=your-project-id"
    echo "  ./setup-log-retention.sh"
    exit 1
fi

echo ""
echo "=============================================="
echo " Cloud Logging Retention Policy Setup"
echo "=============================================="
echo ""
info "Project: $PROJECT_ID"
echo ""

# Confirm before proceeding
read -p "Continue with log retention setup? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""

# ============================================
# 1. Create Extended Errors Bucket (90 days)
# ============================================
info "Creating extended-errors bucket (90 days retention)..."

if gcloud logging buckets describe extended-errors \
    --project="$PROJECT_ID" \
    --location=global \
    &>/dev/null; then
    warn "Bucket 'extended-errors' already exists, updating retention..."
    gcloud logging buckets update extended-errors \
        --project="$PROJECT_ID" \
        --location=global \
        --retention-days=90 \
        --description="Extended retention for error logs (90 days)"
    success "Updated extended-errors bucket"
else
    gcloud logging buckets create extended-errors \
        --project="$PROJECT_ID" \
        --location=global \
        --retention-days=90 \
        --description="Extended retention for error logs (90 days)"
    success "Created extended-errors bucket"
fi

# ============================================
# 2. Create Compliance Audit Bucket (365 days)
# ============================================
info "Creating compliance-audit bucket (365 days retention)..."

if gcloud logging buckets describe compliance-audit \
    --project="$PROJECT_ID" \
    --location=global \
    &>/dev/null; then
    warn "Bucket 'compliance-audit' already exists, updating retention..."
    gcloud logging buckets update compliance-audit \
        --project="$PROJECT_ID" \
        --location=global \
        --retention-days=365 \
        --description="Long-term retention for audit and admin logs (1 year)"
    success "Updated compliance-audit bucket"
else
    gcloud logging buckets create compliance-audit \
        --project="$PROJECT_ID" \
        --location=global \
        --retention-days=365 \
        --description="Long-term retention for audit and admin logs (1 year)"
    success "Created compliance-audit bucket"
fi

# ============================================
# 3. Update Default Bucket (30 days)
# ============================================
info "Updating _Default bucket to 30 days retention..."

gcloud logging buckets update _Default \
    --project="$PROJECT_ID" \
    --location=global \
    --retention-days=30

success "Updated _Default bucket to 30 days"

# ============================================
# 4. Create Error Log Sink
# ============================================
info "Creating error-logs-sink..."

ERROR_SINK_DESTINATION="logging.googleapis.com/projects/$PROJECT_ID/locations/global/buckets/extended-errors"
ERROR_SINK_FILTER='severity>=ERROR'

if gcloud logging sinks describe error-logs-sink \
    --project="$PROJECT_ID" \
    &>/dev/null; then
    warn "Sink 'error-logs-sink' already exists, updating..."
    gcloud logging sinks update error-logs-sink \
        "$ERROR_SINK_DESTINATION" \
        --project="$PROJECT_ID" \
        --log-filter="$ERROR_SINK_FILTER"
    success "Updated error-logs-sink"
else
    gcloud logging sinks create error-logs-sink \
        "$ERROR_SINK_DESTINATION" \
        --project="$PROJECT_ID" \
        --log-filter="$ERROR_SINK_FILTER"
    success "Created error-logs-sink"
fi

# ============================================
# 5. Create Audit Log Sink
# ============================================
info "Creating audit-logs-sink..."

AUDIT_SINK_DESTINATION="logging.googleapis.com/projects/$PROJECT_ID/locations/global/buckets/compliance-audit"
# Capture Secret Manager access, admin API calls, and authentication events
AUDIT_SINK_FILTER='protoPayload.serviceName="secretmanager.googleapis.com" OR protoPayload.methodName=~"admin" OR textPayload=~"[Aa]dmin" OR protoPayload.authenticationInfo.principalEmail!=""'

if gcloud logging sinks describe audit-logs-sink \
    --project="$PROJECT_ID" \
    &>/dev/null; then
    warn "Sink 'audit-logs-sink' already exists, updating..."
    gcloud logging sinks update audit-logs-sink \
        "$AUDIT_SINK_DESTINATION" \
        --project="$PROJECT_ID" \
        --log-filter="$AUDIT_SINK_FILTER"
    success "Updated audit-logs-sink"
else
    gcloud logging sinks create audit-logs-sink \
        "$AUDIT_SINK_DESTINATION" \
        --project="$PROJECT_ID" \
        --log-filter="$AUDIT_SINK_FILTER"
    success "Created audit-logs-sink"
fi

# ============================================
# 6. Create Exclusion for Health Checks (Optional)
# ============================================
info "Creating exclusion for health check logs..."

HEALTH_EXCLUSION_FILTER='resource.type="cloud_run_revision" AND httpRequest.requestUrl=~"/health" AND httpRequest.status=200'

if gcloud logging sinks describe health-check-exclusion \
    --project="$PROJECT_ID" \
    &>/dev/null 2>&1; then
    warn "Exclusion 'health-check-exclusion' already exists"
else
    # Create exclusion to reduce log volume
    gcloud logging sinks create health-check-exclusion \
        "logging.googleapis.com/projects/$PROJECT_ID/locations/global/buckets/_Default" \
        --project="$PROJECT_ID" \
        --log-filter="$HEALTH_EXCLUSION_FILTER" \
        --exclusion \
        2>/dev/null || warn "Could not create exclusion (may require different permissions)"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "=============================================="
echo " Configuration Complete"
echo "=============================================="
echo ""

info "Log Buckets:"
echo ""
gcloud logging buckets list \
    --project="$PROJECT_ID" \
    --location=global \
    --format="table(name, retentionDays, lifecycleState)"

echo ""
info "Log Sinks:"
echo ""
gcloud logging sinks list \
    --project="$PROJECT_ID" \
    --format="table(name, destination, filter)"

echo ""
success "Log retention policies configured successfully!"
echo ""
echo "Retention Summary:"
echo "  - Default logs (_Default): 30 days"
echo "  - Error logs (extended-errors): 90 days"
echo "  - Audit logs (compliance-audit): 365 days"
echo ""
echo "Next steps:"
echo "  1. Verify logs are routing correctly:"
echo "     gcloud logging read 'severity>=ERROR' --project=$PROJECT_ID --freshness=1h"
echo ""
echo "  2. Set up Cloud Scheduler for database cleanup:"
echo "     See packages/backend/scripts/setup-scheduled-jobs.sh"
echo ""
echo "  3. Review cost estimates in docs/LOG-RETENTION-POLICY.md"
echo ""
