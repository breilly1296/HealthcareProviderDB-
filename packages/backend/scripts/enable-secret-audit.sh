#!/bin/bash

#===============================================================================
# Secret Manager Audit Logging Setup Script
#===============================================================================
#
# DESCRIPTION:
#   Enables Data Access audit logs for Google Cloud Secret Manager.
#   This allows tracking of all secret access, modifications, and admin actions.
#
# WHAT GETS LOGGED:
#   ┌─────────────────┬────────────────────────────────────────────────────────┐
#   │ Log Type        │ What It Captures                                       │
#   ├─────────────────┼────────────────────────────────────────────────────────┤
#   │ ADMIN_READ      │ Metadata reads: listing secrets, getting secret        │
#   │                 │ metadata, IAM policy reads                             │
#   ├─────────────────┼────────────────────────────────────────────────────────┤
#   │ DATA_READ       │ Secret value access: secrets.versions.access calls     │
#   │                 │ This is the most important for security monitoring     │
#   ├─────────────────┼────────────────────────────────────────────────────────┤
#   │ DATA_WRITE      │ Secret modifications: creating secrets, adding         │
#   │                 │ versions, enabling/disabling versions, destroying      │
#   └─────────────────┴────────────────────────────────────────────────────────┘
#
# COST IMPLICATIONS:
#   - Audit logs count toward Cloud Logging ingestion costs
#   - Approximate cost: $0.50 per GiB ingested (after free tier)
#   - Secret Manager audit logs are typically small (< 1 KB per entry)
#   - Estimate: 10,000 secret accesses ≈ 10 MB ≈ $0.005
#   - Set up log retention policies to control storage costs
#   - Consider log exclusion filters for high-volume, low-risk operations
#
# WHERE TO VIEW LOGS:
#   Cloud Console:
#     https://console.cloud.google.com/logs/query?project=YOUR_PROJECT_ID
#
#   Query for secret access:
#     resource.type="audited_resource"
#     protoPayload.serviceName="secretmanager.googleapis.com"
#
#   Query for specific secret:
#     resource.type="audited_resource"
#     protoPayload.serviceName="secretmanager.googleapis.com"
#     protoPayload.resourceName=~"secrets/ADMIN_SECRET"
#
# PREREQUISITES:
#   1. Google Cloud SDK (gcloud) installed
#   2. Authenticated: gcloud auth login
#   3. Sufficient permissions: roles/resourcemanager.projectIamAdmin
#   4. jq installed for JSON processing
#
# USAGE:
#   chmod +x enable-secret-audit.sh
#   ./enable-secret-audit.sh PROJECT_ID
#
#   Or with environment variable:
#   export PROJECT_ID=your-project-id
#   ./enable-secret-audit.sh
#
#===============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

#-------------------------------------------------------------------------------
# Parse arguments and set PROJECT_ID
#-------------------------------------------------------------------------------
PROJECT_ID="${1:-${PROJECT_ID:-}}"

if [[ -z "$PROJECT_ID" ]]; then
    # Try to get from gcloud config
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
fi

if [[ -z "$PROJECT_ID" ]]; then
    log_error "PROJECT_ID not specified."
    echo ""
    echo "Usage: $0 PROJECT_ID"
    echo "   or: export PROJECT_ID=your-project-id && $0"
    exit 1
fi

#-------------------------------------------------------------------------------
# Validate prerequisites
#-------------------------------------------------------------------------------
validate_prerequisites() {
    log_step "Validating prerequisites..."

    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not found. Please install Google Cloud SDK."
        exit 1
    fi

    # Check jq
    if ! command -v jq &> /dev/null; then
        log_error "jq not found. Please install jq for JSON processing."
        echo "  Ubuntu/Debian: sudo apt-get install jq"
        echo "  macOS: brew install jq"
        echo "  Windows: choco install jq"
        exit 1
    fi

    # Verify project exists and we have access
    if ! gcloud projects describe "$PROJECT_ID" &> /dev/null; then
        log_error "Cannot access project: $PROJECT_ID"
        log_error "Make sure you're authenticated and have access to this project."
        exit 1
    fi

    log_info "Using project: $PROJECT_ID"
}

#-------------------------------------------------------------------------------
# Create temporary directory for policy files
#-------------------------------------------------------------------------------
TEMP_DIR=$(mktemp -d)
CURRENT_POLICY="$TEMP_DIR/current-policy.json"
NEW_POLICY="$TEMP_DIR/new-policy.json"

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

#-------------------------------------------------------------------------------
# Get current IAM policy
#-------------------------------------------------------------------------------
get_current_policy() {
    log_step "Fetching current IAM policy..."

    gcloud projects get-iam-policy "$PROJECT_ID" \
        --format=json > "$CURRENT_POLICY"

    log_info "Current policy saved to temporary file"
}

#-------------------------------------------------------------------------------
# Check if Secret Manager audit config already exists
#-------------------------------------------------------------------------------
check_existing_audit_config() {
    log_step "Checking for existing Secret Manager audit configuration..."

    if jq -e '.auditConfigs[]? | select(.service == "secretmanager.googleapis.com")' "$CURRENT_POLICY" > /dev/null 2>&1; then
        log_warn "Secret Manager audit config already exists!"
        echo ""
        echo "Current configuration:"
        jq '.auditConfigs[] | select(.service == "secretmanager.googleapis.com")' "$CURRENT_POLICY"
        echo ""

        read -p "Do you want to replace it? (y/N): " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            log_info "Keeping existing configuration. Exiting."
            exit 0
        fi
    fi
}

#-------------------------------------------------------------------------------
# Create updated policy with Secret Manager audit config
#-------------------------------------------------------------------------------
create_updated_policy() {
    log_step "Creating updated policy with Secret Manager audit logging..."

    # Define the audit config for Secret Manager
    local secret_manager_audit_config='{
        "service": "secretmanager.googleapis.com",
        "auditLogConfigs": [
            {
                "logType": "ADMIN_READ"
            },
            {
                "logType": "DATA_READ"
            },
            {
                "logType": "DATA_WRITE"
            }
        ]
    }'

    # Check if auditConfigs array exists
    if jq -e '.auditConfigs' "$CURRENT_POLICY" > /dev/null 2>&1; then
        # auditConfigs exists - remove any existing secretmanager config and add new one
        jq --argjson new_config "$secret_manager_audit_config" '
            .auditConfigs = [
                (.auditConfigs[]? | select(.service != "secretmanager.googleapis.com")),
                $new_config
            ]
        ' "$CURRENT_POLICY" > "$NEW_POLICY"
    else
        # auditConfigs doesn't exist - create it
        jq --argjson new_config "$secret_manager_audit_config" '
            .auditConfigs = [$new_config]
        ' "$CURRENT_POLICY" > "$NEW_POLICY"
    fi

    log_info "Updated policy created"
}

#-------------------------------------------------------------------------------
# Show diff of policy changes
#-------------------------------------------------------------------------------
show_policy_diff() {
    log_step "Policy changes to be applied:"
    echo ""
    echo "=== NEW AUDIT CONFIGURATION ==="
    jq '.auditConfigs[] | select(.service == "secretmanager.googleapis.com")' "$NEW_POLICY"
    echo "==============================="
    echo ""
}

#-------------------------------------------------------------------------------
# Apply the updated policy
#-------------------------------------------------------------------------------
apply_policy() {
    log_step "Applying updated IAM policy..."

    read -p "Apply this configuration? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_info "Cancelled. No changes made."
        exit 0
    fi

    gcloud projects set-iam-policy "$PROJECT_ID" "$NEW_POLICY" --format=json > /dev/null

    log_info "Policy applied successfully!"
}

#-------------------------------------------------------------------------------
# Verify audit logging is working
#-------------------------------------------------------------------------------
verify_audit_logging() {
    log_step "Verifying audit logging configuration..."

    # Check the policy was applied
    local applied_config
    applied_config=$(gcloud projects get-iam-policy "$PROJECT_ID" --format=json | \
        jq '.auditConfigs[] | select(.service == "secretmanager.googleapis.com")')

    if [[ -n "$applied_config" ]]; then
        log_info "Audit configuration verified:"
        echo "$applied_config" | jq .
    else
        log_error "Audit configuration not found after applying!"
        exit 1
    fi

    echo ""
    log_step "Checking for recent audit logs (may take a few minutes to appear)..."

    # Try to read recent audit logs
    local log_count
    log_count=$(gcloud logging read \
        'resource.type="audited_resource" AND protoPayload.serviceName="secretmanager.googleapis.com"' \
        --limit=5 \
        --project="$PROJECT_ID" \
        --format="value(timestamp)" 2>/dev/null | wc -l || echo "0")

    if [[ "$log_count" -gt 0 ]]; then
        log_info "Found $log_count recent audit log entries"
        echo ""
        echo "Recent Secret Manager audit logs:"
        gcloud logging read \
            'resource.type="audited_resource" AND protoPayload.serviceName="secretmanager.googleapis.com"' \
            --limit=5 \
            --project="$PROJECT_ID" \
            --format="table(timestamp,protoPayload.methodName,protoPayload.authenticationInfo.principalEmail)"
    else
        log_info "No audit logs found yet (this is normal for new configurations)"
        log_info "Logs will appear after Secret Manager is accessed"
    fi
}

#-------------------------------------------------------------------------------
# Print useful commands
#-------------------------------------------------------------------------------
print_useful_commands() {
    echo ""
    echo "========================================"
    echo "  Useful Commands for Audit Log Analysis"
    echo "========================================"
    echo ""
    echo "# View all Secret Manager audit logs:"
    echo "gcloud logging read 'resource.type=\"audited_resource\" AND protoPayload.serviceName=\"secretmanager.googleapis.com\"' \\"
    echo "  --limit=50 --project=$PROJECT_ID"
    echo ""
    echo "# View secret access events (DATA_READ):"
    echo "gcloud logging read 'resource.type=\"audited_resource\" AND protoPayload.serviceName=\"secretmanager.googleapis.com\" AND protoPayload.methodName=\"google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion\"' \\"
    echo "  --limit=20 --project=$PROJECT_ID"
    echo ""
    echo "# View secret modifications (DATA_WRITE):"
    echo "gcloud logging read 'resource.type=\"audited_resource\" AND protoPayload.serviceName=\"secretmanager.googleapis.com\" AND protoPayload.methodName=~\"(Create|Update|Delete|Destroy|Enable|Disable)\"' \\"
    echo "  --limit=20 --project=$PROJECT_ID"
    echo ""
    echo "# View access to specific secret (e.g., ADMIN_SECRET):"
    echo "gcloud logging read 'resource.type=\"audited_resource\" AND protoPayload.serviceName=\"secretmanager.googleapis.com\" AND protoPayload.resourceName=~\"secrets/ADMIN_SECRET\"' \\"
    echo "  --limit=20 --project=$PROJECT_ID"
    echo ""
    echo "# View access by specific principal:"
    echo "gcloud logging read 'resource.type=\"audited_resource\" AND protoPayload.serviceName=\"secretmanager.googleapis.com\" AND protoPayload.authenticationInfo.principalEmail=\"service-account@project.iam.gserviceaccount.com\"' \\"
    echo "  --limit=20 --project=$PROJECT_ID"
    echo ""
    echo "# Cloud Console URL:"
    echo "https://console.cloud.google.com/logs/query;query=resource.type%3D%22audited_resource%22%0AprotoPayload.serviceName%3D%22secretmanager.googleapis.com%22?project=$PROJECT_ID"
    echo ""
}

#-------------------------------------------------------------------------------
# Print cost warning
#-------------------------------------------------------------------------------
print_cost_warning() {
    echo ""
    echo "========================================"
    echo "  Cost & Retention Considerations"
    echo "========================================"
    echo ""
    echo "COST:"
    echo "  - Audit logs are charged at Cloud Logging rates"
    echo "  - First 50 GiB/month is free"
    echo "  - Additional ingestion: ~\$0.50/GiB"
    echo "  - Secret Manager logs are typically small (<1KB each)"
    echo ""
    echo "RETENTION:"
    echo "  - Default retention: 30 days"
    echo "  - Adjust with: gcloud logging sinks or Log Router"
    echo "  - For compliance, consider exporting to BigQuery or Cloud Storage"
    echo ""
    echo "LOG EXCLUSION (to reduce costs, exclude high-volume low-risk ops):"
    echo "  gcloud logging sinks create exclude-secretmanager-list \\"
    echo "    'logging.googleapis.com/projects/$PROJECT_ID/logs/_Default' \\"
    echo "    --log-filter='protoPayload.methodName=\"google.cloud.secretmanager.v1.SecretManagerService.ListSecrets\"' \\"
    echo "    --exclusion"
    echo ""
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------
main() {
    echo "========================================"
    echo "  Secret Manager Audit Logging Setup"
    echo "========================================"
    echo ""

    validate_prerequisites
    get_current_policy
    check_existing_audit_config
    create_updated_policy
    show_policy_diff
    apply_policy
    verify_audit_logging
    print_useful_commands
    print_cost_warning

    echo ""
    log_info "Setup complete! Secret Manager access will now be logged."
    echo ""
}

# Run main function
main "$@"
