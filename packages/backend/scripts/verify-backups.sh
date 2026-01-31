#!/bin/bash
#
# Cloud SQL Backup Verification and Configuration Script
#
# This script verifies and configures automated backups for the Cloud SQL instance.
# It ensures backups are enabled, point-in-time recovery is configured, and
# provides commands for manual backups and restore testing.
#
# Usage:
#   ./scripts/verify-backups.sh [command]
#
# Commands:
#   check       - Check current backup configuration (default)
#   configure   - Configure automated backups
#   list        - List recent backups
#   create      - Create a manual backup
#   test-restore - Test restore to a temporary instance
#   full        - Run all verification steps
#
# Environment Variables:
#   PROJECT_ID          - GCP project ID (required)
#   INSTANCE_NAME       - Cloud SQL instance name (default: verifymyprovider-db)
#   BACKUP_START_TIME   - Backup window start time in UTC (default: 04:00)
#   RETAINED_BACKUPS    - Number of automated backups to retain (default: 7)
#   RETAINED_LOGS_DAYS  - Days to retain transaction logs (default: 7)
#
# =============================================================================
# BACKUP STRATEGY RATIONALE
# =============================================================================
#
# Backup Window (04:00 UTC):
#   - Corresponds to 11:00 PM EST / 8:00 PM PST
#   - Chosen to minimize impact during low-traffic period
#   - Backup window is approximately 4 hours
#   - Adjust based on your traffic patterns
#
# Retention Policy (7 days):
#   - Balances recovery options with storage costs
#   - Allows recovery from issues discovered within a week
#   - For compliance requirements, consider 30+ days
#   - Each backup is incremental, reducing storage costs
#
# Point-in-Time Recovery (PITR):
#   - Enables recovery to any point within retention window
#   - Uses binary logging (write-ahead logs)
#   - Adds ~1-2% overhead to write operations
#   - Critical for minimizing data loss in emergencies
#
# Cost Implications:
#   - Backup storage: ~$0.08/GB/month
#   - Transaction logs: ~$0.10/GB/month
#   - For a 10GB database with 7-day retention: ~$5-10/month
#   - Costs scale with database size and change rate
#
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration with defaults
PROJECT_ID="${PROJECT_ID:-}"
INSTANCE_NAME="${INSTANCE_NAME:-verifymyprovider-db}"
BACKUP_START_TIME="${BACKUP_START_TIME:-04:00}"
RETAINED_BACKUPS="${RETAINED_BACKUPS:-7}"
RETAINED_LOGS_DAYS="${RETAINED_LOGS_DAYS:-7}"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo "============================================================================="
    echo "$1"
    echo "============================================================================="
    echo ""
}

check_prerequisites() {
    # Check for required tools
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install Google Cloud SDK."
        exit 1
    fi

    # Check PROJECT_ID
    if [ -z "$PROJECT_ID" ]; then
        # Try to get from gcloud config
        PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
        if [ -z "$PROJECT_ID" ]; then
            log_error "PROJECT_ID environment variable is not set and no default project configured."
            echo "Set it with: export PROJECT_ID=your-project-id"
            exit 1
        fi
        log_info "Using project from gcloud config: $PROJECT_ID"
    fi

    # Verify the instance exists
    if ! gcloud sql instances describe "$INSTANCE_NAME" --project="$PROJECT_ID" &>/dev/null; then
        log_error "Cloud SQL instance '$INSTANCE_NAME' not found in project '$PROJECT_ID'"
        exit 1
    fi

    log_success "Prerequisites verified"
}

# =============================================================================
# Check Current Backup Configuration
# =============================================================================

check_backup_config() {
    print_header "CURRENT BACKUP CONFIGURATION"

    log_info "Fetching backup configuration for instance: $INSTANCE_NAME"
    echo ""

    # Get full backup configuration
    local config
    config=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --format="yaml(settings.backupConfiguration)")

    echo "$config"
    echo ""

    # Parse key settings
    local backup_enabled
    local pitr_enabled
    local start_time
    local retained_backups
    local log_days

    backup_enabled=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --format="value(settings.backupConfiguration.enabled)" 2>/dev/null || echo "false")

    pitr_enabled=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --format="value(settings.backupConfiguration.pointInTimeRecoveryEnabled)" 2>/dev/null || echo "false")

    start_time=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --format="value(settings.backupConfiguration.startTime)" 2>/dev/null || echo "not set")

    retained_backups=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --format="value(settings.backupConfiguration.backupRetentionSettings.retainedBackups)" 2>/dev/null || echo "not set")

    log_days=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --format="value(settings.backupConfiguration.transactionLogRetentionDays)" 2>/dev/null || echo "not set")

    echo "Summary:"
    echo "  Automated Backups:     $([ "$backup_enabled" = "True" ] && echo "${GREEN}Enabled${NC}" || echo "${RED}Disabled${NC}")"
    echo "  Point-in-Time Recovery: $([ "$pitr_enabled" = "True" ] && echo "${GREEN}Enabled${NC}" || echo "${RED}Disabled${NC}")"
    echo "  Backup Start Time:     $start_time UTC"
    echo "  Retained Backups:      $retained_backups"
    echo "  Transaction Log Days:  $log_days"
    echo ""

    # Return status for scripting
    if [ "$backup_enabled" = "True" ] && [ "$pitr_enabled" = "True" ]; then
        log_success "Backup configuration is complete"
        return 0
    else
        log_warning "Backup configuration is incomplete"
        return 1
    fi
}

# =============================================================================
# Configure Automated Backups
# =============================================================================

configure_backups() {
    print_header "CONFIGURING AUTOMATED BACKUPS"

    log_info "Configuring backups for instance: $INSTANCE_NAME"
    log_info "  Backup start time: $BACKUP_START_TIME UTC"
    log_info "  Retained backups: $RETAINED_BACKUPS"
    log_info "  Transaction log retention: $RETAINED_LOGS_DAYS days"
    echo ""

    # Confirm before making changes
    read -p "Do you want to apply these settings? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Configuration cancelled"
        return 0
    fi

    log_info "Enabling automated backups and binary logging..."

    # Enable automated backups with binary logging
    # Binary logging is required for point-in-time recovery
    if gcloud sql instances patch "$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --backup-start-time="$BACKUP_START_TIME" \
        --enable-bin-log \
        --retained-backups-count="$RETAINED_BACKUPS" \
        --retained-transaction-log-days="$RETAINED_LOGS_DAYS" \
        --quiet; then
        log_success "Automated backups configured"
    else
        log_error "Failed to configure automated backups"
        return 1
    fi

    echo ""
    log_info "Enabling point-in-time recovery..."

    # Enable point-in-time recovery separately (sometimes needs its own patch)
    if gcloud sql instances patch "$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --enable-point-in-time-recovery \
        --quiet; then
        log_success "Point-in-time recovery enabled"
    else
        log_error "Failed to enable point-in-time recovery"
        return 1
    fi

    echo ""
    log_success "Backup configuration complete!"
    echo ""
    echo "Note: The first automated backup will run during the next backup window."
    echo "You can create an immediate backup with: $0 create"
}

# =============================================================================
# List Recent Backups
# =============================================================================

list_backups() {
    print_header "RECENT BACKUPS"

    log_info "Listing recent backups for instance: $INSTANCE_NAME"
    echo ""

    # List backups with details
    gcloud sql backups list \
        --instance="$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --limit=10 \
        --format="table(
            id:label=BACKUP_ID,
            type:label=TYPE,
            status:label=STATUS,
            startTime:label=START_TIME,
            endTime:label=END_TIME,
            enqueuedTime:label=ENQUEUED
        )"

    echo ""

    # Get backup count
    local backup_count
    backup_count=$(gcloud sql backups list \
        --instance="$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --format="value(id)" | wc -l)

    log_info "Total backups available: $backup_count"

    # Check for any failed backups
    local failed_backups
    failed_backups=$(gcloud sql backups list \
        --instance="$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --filter="status=FAILED" \
        --format="value(id)" | wc -l)

    if [ "$failed_backups" -gt 0 ]; then
        log_warning "There are $failed_backups failed backups"
    fi

    # Show storage estimate
    echo ""
    echo "Backup Storage Estimate:"
    echo "  Database size and backup compression vary, but expect:"
    echo "  - Automated backups: ~50-80% of database size each"
    echo "  - Transaction logs: ~10-30% of daily write volume"
    echo "  - Check billing console for actual costs"
}

# =============================================================================
# Create Manual Backup
# =============================================================================

create_backup() {
    print_header "CREATE MANUAL BACKUP"

    local description="${1:-Pre-deployment backup $(date +%Y-%m-%d-%H%M%S)}"

    log_info "Creating manual backup for instance: $INSTANCE_NAME"
    log_info "Description: $description"
    echo ""

    # Confirm before creating backup
    read -p "Create backup now? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Backup cancelled"
        return 0
    fi

    log_info "Starting backup (this may take several minutes)..."

    # Create the backup
    if gcloud sql backups create \
        --instance="$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --description="$description" \
        --async; then

        log_success "Backup initiated successfully"
        echo ""
        echo "The backup is running in the background."
        echo "Check status with: $0 list"
        echo ""

        # Show how to verify completion
        echo "To verify backup completed successfully:"
        echo "  gcloud sql backups list --instance=$INSTANCE_NAME --limit=1"
        echo ""
        echo "Expected backup duration:"
        echo "  - Small databases (<1GB): 1-5 minutes"
        echo "  - Medium databases (1-10GB): 5-15 minutes"
        echo "  - Large databases (10GB+): 15-60+ minutes"

    else
        log_error "Failed to create backup"
        return 1
    fi
}

# =============================================================================
# Test Restore (to temporary instance)
# =============================================================================

test_restore() {
    print_header "TEST RESTORE PROCEDURE"

    local test_instance_name="$INSTANCE_NAME-restore-test-$(date +%Y%m%d)"

    log_warning "This will create a temporary Cloud SQL instance for restore testing."
    log_warning "The test instance will incur charges until deleted."
    echo ""
    echo "Test instance name: $test_instance_name"
    echo ""

    # Get the latest backup ID
    local latest_backup_id
    latest_backup_id=$(gcloud sql backups list \
        --instance="$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --filter="status=SUCCESSFUL" \
        --limit=1 \
        --format="value(id)")

    if [ -z "$latest_backup_id" ]; then
        log_error "No successful backups found to restore from"
        return 1
    fi

    log_info "Latest successful backup ID: $latest_backup_id"
    echo ""

    # Confirm before proceeding
    read -p "Create test restore instance? This will incur charges. (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restore test cancelled"
        echo ""
        echo "To manually test restore, run:"
        echo ""
        echo "  # Restore from backup"
        echo "  gcloud sql instances restore-backup $INSTANCE_NAME \\"
        echo "    --restore-instance=$test_instance_name \\"
        echo "    --backup-id=$latest_backup_id \\"
        echo "    --project=$PROJECT_ID"
        echo ""
        echo "  # After testing, delete the instance"
        echo "  gcloud sql instances delete $test_instance_name --project=$PROJECT_ID"
        return 0
    fi

    log_info "Creating restore test instance..."

    # Create a new instance from the backup
    if gcloud sql instances restore-backup "$INSTANCE_NAME" \
        --restore-instance="$test_instance_name" \
        --backup-id="$latest_backup_id" \
        --project="$PROJECT_ID" \
        --async; then

        log_success "Restore initiated to: $test_instance_name"
        echo ""
        echo "The restore is running in the background."
        echo "Check status with:"
        echo "  gcloud sql instances describe $test_instance_name --project=$PROJECT_ID"
        echo ""
        log_warning "IMPORTANT: Remember to delete the test instance when done!"
        echo "  gcloud sql instances delete $test_instance_name --project=$PROJECT_ID --quiet"

    else
        log_error "Failed to initiate restore"
        return 1
    fi
}

# =============================================================================
# Point-in-Time Recovery Instructions
# =============================================================================

show_pitr_instructions() {
    print_header "POINT-IN-TIME RECOVERY (PITR) INSTRUCTIONS"

    echo "Point-in-Time Recovery allows you to restore to any moment within the"
    echo "transaction log retention period ($RETAINED_LOGS_DAYS days by default)."
    echo ""
    echo "WHEN TO USE PITR:"
    echo "  - Accidental data deletion (DELETE without WHERE)"
    echo "  - Bad migration that corrupted data"
    echo "  - Need to recover to a specific moment before an incident"
    echo ""
    echo "HOW TO PERFORM PITR:"
    echo ""
    echo "  1. First, identify the target recovery time (in UTC):"
    echo "     Example: 2024-01-15T14:30:00Z"
    echo ""
    echo "  2. Clone to a new instance at that point in time:"
    echo "     gcloud sql instances clone $INSTANCE_NAME \\"
    echo "       $INSTANCE_NAME-recovery \\"
    echo "       --point-in-time='2024-01-15T14:30:00Z' \\"
    echo "       --project=$PROJECT_ID"
    echo ""
    echo "  3. Verify the recovered data in the new instance"
    echo ""
    echo "  4. If satisfied, either:"
    echo "     a) Update your application to use the new instance, or"
    echo "     b) Export data from recovery instance and import to production"
    echo ""
    echo "  5. Delete the recovery instance when done:"
    echo "     gcloud sql instances delete $INSTANCE_NAME-recovery --project=$PROJECT_ID"
    echo ""
    echo "IMPORTANT NOTES:"
    echo "  - PITR creates a NEW instance; it doesn't modify the original"
    echo "  - The new instance will have a different IP address"
    echo "  - Recovery time is approximately 5-15 minutes per GB of data"
    echo "  - You can only recover to times within the log retention window"
}

# =============================================================================
# Emergency Restore Procedure
# =============================================================================

show_emergency_restore() {
    print_header "EMERGENCY RESTORE PROCEDURE"

    echo "Follow these steps in case of database corruption or data loss:"
    echo ""
    echo "STEP 1: ASSESS THE SITUATION"
    echo "  - Identify when the problem occurred"
    echo "  - Determine if you need full restore or point-in-time recovery"
    echo "  - Consider if you can use a replica instead"
    echo ""
    echo "STEP 2: STOP WRITES TO THE DATABASE"
    echo "  - Scale down or pause your application"
    echo "  - This prevents further data corruption"
    echo ""
    echo "STEP 3: CHOOSE RECOVERY METHOD"
    echo ""
    echo "  Option A: Restore from Automated Backup"
    echo "  ----------------------------------------"
    echo "  Use when you need to restore to the last backup point."
    echo ""
    echo "  # List available backups"
    echo "  gcloud sql backups list --instance=$INSTANCE_NAME --project=$PROJECT_ID"
    echo ""
    echo "  # Restore to a new instance"
    echo "  gcloud sql instances restore-backup $INSTANCE_NAME \\"
    echo "    --restore-instance=$INSTANCE_NAME-restored \\"
    echo "    --backup-id=BACKUP_ID \\"
    echo "    --project=$PROJECT_ID"
    echo ""
    echo "  Option B: Point-in-Time Recovery"
    echo "  ---------------------------------"
    echo "  Use when you need to restore to a specific moment."
    echo ""
    echo "  gcloud sql instances clone $INSTANCE_NAME \\"
    echo "    $INSTANCE_NAME-pitr \\"
    echo "    --point-in-time='YYYY-MM-DDTHH:MM:SSZ' \\"
    echo "    --project=$PROJECT_ID"
    echo ""
    echo "STEP 4: VERIFY RESTORED DATA"
    echo "  - Connect to the restored instance"
    echo "  - Run validation queries"
    echo "  - Compare record counts with expectations"
    echo ""
    echo "STEP 5: SWITCH TO RESTORED INSTANCE"
    echo "  - Update DATABASE_URL in your application"
    echo "  - Restart application services"
    echo "  - Monitor for errors"
    echo ""
    echo "STEP 6: CLEANUP"
    echo "  - Rename or delete the corrupted instance"
    echo "  - Document the incident"
    echo "  - Review and improve backup procedures"
}

# =============================================================================
# Full Verification
# =============================================================================

run_full_verification() {
    print_header "FULL BACKUP VERIFICATION"

    local exit_code=0

    # Check prerequisites
    check_prerequisites || exit_code=1

    # Check current configuration
    if ! check_backup_config; then
        echo ""
        log_warning "Backup configuration is incomplete. Run '$0 configure' to fix."
        exit_code=1
    fi

    # List recent backups
    list_backups

    # Show PITR instructions
    show_pitr_instructions

    # Final status
    print_header "VERIFICATION SUMMARY"

    if [ $exit_code -eq 0 ]; then
        log_success "All backup verification checks passed!"
    else
        log_warning "Some checks failed. Review the output above."
    fi

    echo ""
    echo "Quick Commands:"
    echo "  Create manual backup:  $0 create"
    echo "  Test restore:          $0 test-restore"
    echo "  View configuration:    $0 check"
    echo ""

    return $exit_code
}

# =============================================================================
# Main
# =============================================================================

main() {
    local command="${1:-check}"

    # Check prerequisites for all commands
    check_prerequisites

    case "$command" in
        check)
            check_backup_config
            ;;
        configure)
            configure_backups
            ;;
        list)
            list_backups
            ;;
        create)
            create_backup "${2:-}"
            ;;
        test-restore)
            test_restore
            ;;
        pitr)
            show_pitr_instructions
            ;;
        emergency)
            show_emergency_restore
            ;;
        full)
            run_full_verification
            ;;
        help|--help|-h)
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  check        Check current backup configuration (default)"
            echo "  configure    Configure automated backups"
            echo "  list         List recent backups"
            echo "  create       Create a manual backup"
            echo "  test-restore Test restore to a temporary instance"
            echo "  pitr         Show point-in-time recovery instructions"
            echo "  emergency    Show emergency restore procedure"
            echo "  full         Run all verification steps"
            echo "  help         Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  PROJECT_ID          GCP project ID (required)"
            echo "  INSTANCE_NAME       Cloud SQL instance (default: verifymyprovider-db)"
            echo "  BACKUP_START_TIME   Backup window in UTC (default: 04:00)"
            echo "  RETAINED_BACKUPS    Backups to retain (default: 7)"
            echo "  RETAINED_LOGS_DAYS  Transaction log retention (default: 7)"
            ;;
        *)
            log_error "Unknown command: $command"
            echo "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

main "$@"
