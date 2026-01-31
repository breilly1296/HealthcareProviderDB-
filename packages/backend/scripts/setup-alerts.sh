#!/bin/bash

#===============================================================================
# Cloud Logging Alerts Setup Script
#===============================================================================
#
# DESCRIPTION:
#   Sets up log-based alerting policies in Google Cloud for monitoring
#   critical events in the HealthcareProviderDB backend.
#
# PREREQUISITES:
#   1. Google Cloud SDK (gcloud) installed and configured
#   2. Authenticated with: gcloud auth login
#   3. Project set with: gcloud config set project YOUR_PROJECT_ID
#   4. Required APIs enabled:
#      - gcloud services enable logging.googleapis.com
#      - gcloud services enable monitoring.googleapis.com
#
# USAGE:
#   chmod +x setup-alerts.sh
#   ./setup-alerts.sh
#
# NOTIFICATION CHANNELS:
#   Before running this script, create a notification channel:
#
#   Email:
#     gcloud alpha monitoring channels create \
#       --display-name="Ops Team Email" \
#       --type=email \
#       --channel-labels=email_address=ops@yourdomain.com
#
#   Slack:
#     gcloud alpha monitoring channels create \
#       --display-name="Ops Slack Channel" \
#       --type=slack \
#       --channel-labels=channel_name=#alerts \
#       --channel-labels=auth_token=xoxb-your-slack-token
#
#   PagerDuty:
#     gcloud alpha monitoring channels create \
#       --display-name="PagerDuty" \
#       --type=pagerduty \
#       --channel-labels=service_key=YOUR_PAGERDUTY_KEY
#
#   List existing channels:
#     gcloud alpha monitoring channels list
#
# ENVIRONMENT VARIABLES:
#   PROJECT_ID          - GCP project ID (defaults to gcloud config)
#   NOTIFICATION_CHANNEL - Notification channel ID (optional)
#   CLOUD_RUN_SERVICE   - Cloud Run service name (default: verifymyprovider-backend)
#
#===============================================================================

set -euo pipefail

# Configuration
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
NOTIFICATION_CHANNEL="${NOTIFICATION_CHANNEL:-}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-verifymyprovider-backend}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Validate prerequisites
validate_prerequisites() {
    log_info "Validating prerequisites..."

    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not found. Please install Google Cloud SDK."
        exit 1
    fi

    if [[ -z "$PROJECT_ID" ]]; then
        log_error "PROJECT_ID not set. Run: gcloud config set project YOUR_PROJECT_ID"
        exit 1
    fi

    log_info "Using project: $PROJECT_ID"
    log_info "Cloud Run service: $CLOUD_RUN_SERVICE"

    if [[ -n "$NOTIFICATION_CHANNEL" ]]; then
        log_info "Notification channel: $NOTIFICATION_CHANNEL"
    else
        log_warn "No notification channel set. Alerts will be created without notifications."
        log_warn "Set NOTIFICATION_CHANNEL environment variable to enable notifications."
    fi
}

# Build notification channel argument if set
get_notification_arg() {
    if [[ -n "$NOTIFICATION_CHANNEL" ]]; then
        echo "--notification-channels=$NOTIFICATION_CHANNEL"
    else
        echo ""
    fi
}

#-------------------------------------------------------------------------------
# Alert 1: High Rate Limit Triggers
#-------------------------------------------------------------------------------
# Monitors for excessive 429 (Too Many Requests) responses, which could indicate:
# - A DDoS attack or aggressive scraping
# - Misconfigured client making too many requests
# - Rate limits set too low for legitimate traffic
#
# Threshold: More than 100 rate-limited requests in 5 minutes
#-------------------------------------------------------------------------------
create_rate_limit_alert() {
    log_info "Creating alert: high-rate-limit-triggers..."

    local filter='resource.type="cloud_run_revision" AND resource.labels.service_name="'"$CLOUD_RUN_SERVICE"'" AND httpRequest.status=429'

    gcloud alpha monitoring policies create \
        --display-name="High Rate Limit Triggers" \
        --condition-display-name="429 responses > 100 in 5min" \
        --condition-filter="$filter" \
        --condition-threshold-value=100 \
        --condition-threshold-duration=300s \
        --condition-threshold-comparison=COMPARISON_GT \
        --combiner=OR \
        --documentation="High volume of rate-limited requests detected. This could indicate a DDoS attack, aggressive bot activity, or misconfigured client. Check Cloud Run logs for source IPs and consider adjusting rate limits or blocking malicious actors." \
        $(get_notification_arg) \
        --project="$PROJECT_ID" \
        2>/dev/null || {
            # Fallback: create using JSON if alpha command fails
            log_warn "Alpha command failed, trying alternative method..."
            create_alert_via_json "high-rate-limit-triggers" "$filter" 100 300
        }

    log_info "Created: high-rate-limit-triggers"
}

#-------------------------------------------------------------------------------
# Alert 2: CAPTCHA Failures Spike
#-------------------------------------------------------------------------------
# Monitors for unusual spikes in CAPTCHA verification failures, indicating:
# - Bot attack attempting to bypass CAPTCHA
# - CAPTCHA service issues (Google reCAPTCHA outage)
# - Frontend integration problems
#
# Threshold: More than 50 CAPTCHA failures in 10 minutes
#-------------------------------------------------------------------------------
create_captcha_alert() {
    log_info "Creating alert: captcha-failures-spike..."

    local filter='resource.type="cloud_run_revision" AND resource.labels.service_name="'"$CLOUD_RUN_SERVICE"'" AND (textPayload=~"CAPTCHA.*failed" OR textPayload=~"CAPTCHA.*verification failed" OR textPayload=~"captcha.*invalid" OR jsonPayload.message=~"CAPTCHA.*failed")'

    gcloud alpha monitoring policies create \
        --display-name="CAPTCHA Failures Spike" \
        --condition-display-name="CAPTCHA failures > 50 in 10min" \
        --condition-filter="$filter" \
        --condition-threshold-value=50 \
        --condition-threshold-duration=600s \
        --condition-threshold-comparison=COMPARISON_GT \
        --combiner=OR \
        --documentation="Spike in CAPTCHA verification failures detected. Possible causes: bot attack, Google reCAPTCHA service issues, or frontend misconfiguration. Check if CAPTCHA_FAIL_MODE is set to 'open' or 'closed' and review source IPs in logs." \
        $(get_notification_arg) \
        --project="$PROJECT_ID" \
        2>/dev/null || {
            log_warn "Alpha command failed, trying alternative method..."
            create_alert_via_json "captcha-failures-spike" "$filter" 50 600
        }

    log_info "Created: captcha-failures-spike"
}

#-------------------------------------------------------------------------------
# Alert 3: Admin Auth Failures
#-------------------------------------------------------------------------------
# Monitors for failed admin authentication attempts, indicating:
# - Brute force attack on admin endpoints
# - Leaked or guessed admin secret attempts
# - Unauthorized access attempts
#
# Threshold: More than 5 failures in 5 minutes (very sensitive)
#-------------------------------------------------------------------------------
create_admin_auth_alert() {
    log_info "Creating alert: admin-auth-failures..."

    local filter='resource.type="cloud_run_revision" AND resource.labels.service_name="'"$CLOUD_RUN_SERVICE"'" AND (textPayload=~"Invalid.*admin.*secret" OR textPayload=~"admin.*unauthorized" OR textPayload=~"ADMIN_SECRET" OR jsonPayload.message=~"Invalid.*admin")'

    gcloud alpha monitoring policies create \
        --display-name="Admin Auth Failures" \
        --condition-display-name="Admin auth failures > 5 in 5min" \
        --condition-filter="$filter" \
        --condition-threshold-value=5 \
        --condition-threshold-duration=300s \
        --condition-threshold-comparison=COMPARISON_GT \
        --combiner=OR \
        --documentation="Multiple failed admin authentication attempts detected. This is a HIGH PRIORITY security alert. Immediately review source IPs in logs, consider rotating ADMIN_SECRET, and verify no unauthorized access occurred. Check /api/v1/admin/* endpoint logs." \
        $(get_notification_arg) \
        --project="$PROJECT_ID" \
        2>/dev/null || {
            log_warn "Alpha command failed, trying alternative method..."
            create_alert_via_json "admin-auth-failures" "$filter" 5 300
        }

    log_info "Created: admin-auth-failures"
}

#-------------------------------------------------------------------------------
# Alert 4: Error Rate Spike
#-------------------------------------------------------------------------------
# Monitors for sudden increases in error-level logs, indicating:
# - Application bugs or crashes
# - Database connection issues
# - External service failures (NPI API, etc.)
# - Infrastructure problems
#
# Threshold: More than 50 errors in 5 minutes
#-------------------------------------------------------------------------------
create_error_rate_alert() {
    log_info "Creating alert: error-rate-spike..."

    local filter='resource.type="cloud_run_revision" AND resource.labels.service_name="'"$CLOUD_RUN_SERVICE"'" AND severity>=ERROR'

    gcloud alpha monitoring policies create \
        --display-name="Error Rate Spike" \
        --condition-display-name="Errors > 50 in 5min" \
        --condition-filter="$filter" \
        --condition-threshold-value=50 \
        --condition-threshold-duration=300s \
        --condition-threshold-comparison=COMPARISON_GT \
        --combiner=OR \
        --documentation="Elevated error rate detected in application logs. Review error logs in Cloud Logging to identify root cause. Common causes: database issues, external API failures, application bugs, or resource exhaustion. Check /health endpoint for service status." \
        $(get_notification_arg) \
        --project="$PROJECT_ID" \
        2>/dev/null || {
            log_warn "Alpha command failed, trying alternative method..."
            create_alert_via_json "error-rate-spike" "$filter" 50 300
        }

    log_info "Created: error-rate-spike"
}

#-------------------------------------------------------------------------------
# Alternative: Create alert via JSON file (fallback method)
#-------------------------------------------------------------------------------
create_alert_via_json() {
    local name=$1
    local filter=$2
    local threshold=$3
    local duration=$4

    local json_file="/tmp/alert-${name}.json"

    cat > "$json_file" << EOF
{
  "displayName": "${name}",
  "conditions": [
    {
      "displayName": "${name} condition",
      "conditionThreshold": {
        "filter": "${filter}",
        "comparison": "COMPARISON_GT",
        "thresholdValue": ${threshold},
        "duration": "${duration}s",
        "aggregations": [
          {
            "alignmentPeriod": "60s",
            "perSeriesAligner": "ALIGN_COUNT"
          }
        ]
      }
    }
  ],
  "combiner": "OR",
  "enabled": true
}
EOF

    gcloud alpha monitoring policies create --policy-from-file="$json_file" --project="$PROJECT_ID"
    rm -f "$json_file"
}

#-------------------------------------------------------------------------------
# List existing alerts
#-------------------------------------------------------------------------------
list_alerts() {
    log_info "Listing existing alerting policies..."
    gcloud alpha monitoring policies list --project="$PROJECT_ID" --format="table(displayName,enabled,name)"
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------
main() {
    echo "========================================"
    echo "  Cloud Logging Alerts Setup"
    echo "========================================"
    echo ""

    validate_prerequisites

    echo ""
    log_info "Creating alerting policies..."
    echo ""

    create_rate_limit_alert
    create_captcha_alert
    create_admin_auth_alert
    create_error_rate_alert

    echo ""
    log_info "All alerts created successfully!"
    echo ""

    list_alerts

    echo ""
    echo "========================================"
    echo "  Next Steps"
    echo "========================================"
    echo ""
    echo "1. If you haven't set up notifications, create a channel:"
    echo "   gcloud alpha monitoring channels create \\"
    echo "     --display-name=\"Ops Email\" \\"
    echo "     --type=email \\"
    echo "     --channel-labels=email_address=your@email.com"
    echo ""
    echo "2. Update alerts to use the notification channel:"
    echo "   gcloud alpha monitoring policies update POLICY_ID \\"
    echo "     --add-notification-channels=CHANNEL_ID"
    echo ""
    echo "3. View alerts in Cloud Console:"
    echo "   https://console.cloud.google.com/monitoring/alerting?project=$PROJECT_ID"
    echo ""
}

# Run main function
main "$@"
