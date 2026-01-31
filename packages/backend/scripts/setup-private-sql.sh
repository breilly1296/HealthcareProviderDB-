#!/bin/bash
#
# Cloud SQL Private IP Migration Script
#
# This script migrates a Cloud SQL instance from public IP to private IP
# for improved security. It also configures the VPC connector for Cloud Run.
#
# IMPORTANT: This is a significant infrastructure change. Review carefully
# and test in a staging environment first.
#
# Usage:
#   ./scripts/setup-private-sql.sh [command]
#
# Commands:
#   check           - Check current configuration and prerequisites
#   setup-vpc       - Set up VPC peering for Cloud SQL
#   setup-connector - Create VPC connector for Cloud Run
#   migrate-sql     - Migrate Cloud SQL to private IP
#   update-cloudrun - Update Cloud Run to use VPC connector
#   update-secret   - Update DATABASE_URL secret with private IP
#   verify          - Verify connectivity after migration
#   full            - Run complete migration (interactive)
#   rollback        - Rollback to public IP (emergency)
#
# Environment Variables:
#   PROJECT_ID       - GCP project ID (required)
#   REGION           - GCP region (default: us-central1)
#   INSTANCE_NAME    - Cloud SQL instance (default: verifymyprovider-db)
#   NETWORK_NAME     - VPC network name (default: default)
#   CONNECTOR_NAME   - VPC connector name (default: verifymyprovider-connector)
#   SERVICE_NAME     - Cloud Run service (default: verifymyprovider-backend)
#
# =============================================================================
# SECURITY BENEFITS OF PRIVATE IP
# =============================================================================
#
# 1. No Public Internet Exposure:
#    - Database is not accessible from the public internet
#    - Eliminates attack surface from external threats
#    - No need to whitelist IP addresses
#
# 2. Traffic Stays Within Google's Network:
#    - Lower latency (no internet routing)
#    - Traffic is encrypted but doesn't traverse public networks
#    - Better compliance posture (data doesn't leave private network)
#
# 3. Simplified Security:
#    - No need for SSL certificates for encryption in transit (optional)
#    - Firewall rules at VPC level instead of instance level
#    - Easier to audit and monitor
#
# =============================================================================
# COST IMPLICATIONS
# =============================================================================
#
# VPC Connector Costs (us-central1):
#   - f1-micro (2 instances min): ~$0.015/hour = ~$11/month
#   - e2-micro (2 instances min): ~$0.0076/hour = ~$5.50/month
#   - Scales up automatically based on traffic
#   - Data processing: First 1GB free, then $0.01/GB
#
# Private IP on Cloud SQL:
#   - No additional cost for private IP itself
#   - Slightly reduced latency (cost savings in compute time)
#
# Estimated Monthly Cost: $5-15 depending on traffic
#
# =============================================================================
# LOCAL DEVELOPMENT
# =============================================================================
#
# After migrating to private IP, local development options:
#
# 1. Cloud SQL Auth Proxy (Recommended):
#    Still works! The proxy uses the Cloud SQL Admin API, not direct IP.
#    ./cloud-sql-proxy PROJECT_ID:REGION:INSTANCE_NAME
#
# 2. AlloyDB Auth Proxy:
#    Works the same way for AlloyDB instances.
#
# 3. SSH Tunnel:
#    SSH to a GCE instance in the VPC and tunnel the connection.
#
# 4. VPN:
#    Connect your local network to the VPC via Cloud VPN.
#
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration with defaults
PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
INSTANCE_NAME="${INSTANCE_NAME:-verifymyprovider-db}"
NETWORK_NAME="${NETWORK_NAME:-default}"
CONNECTOR_NAME="${CONNECTOR_NAME:-verifymyprovider-connector}"
SERVICE_NAME="${SERVICE_NAME:-verifymyprovider-backend}"
PEERING_RANGE_NAME="${PEERING_RANGE_NAME:-google-managed-services-$NETWORK_NAME}"
CONNECTOR_RANGE="${CONNECTOR_RANGE:-10.8.0.0/28}"

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

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

print_header() {
    echo ""
    echo "============================================================================="
    echo "$1"
    echo "============================================================================="
    echo ""
}

confirm_action() {
    local message="$1"
    read -p "$message (y/N) " -n 1 -r
    echo ""
    [[ $REPLY =~ ^[Yy]$ ]]
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check for required tools
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install Google Cloud SDK."
        exit 1
    fi

    # Check PROJECT_ID
    if [ -z "$PROJECT_ID" ]; then
        PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
        if [ -z "$PROJECT_ID" ]; then
            log_error "PROJECT_ID environment variable is not set."
            echo "Set it with: export PROJECT_ID=your-project-id"
            exit 1
        fi
        log_info "Using project from gcloud config: $PROJECT_ID"
    fi

    # Set project
    gcloud config set project "$PROJECT_ID" --quiet

    log_success "Prerequisites verified"
}

# =============================================================================
# Check Current Configuration
# =============================================================================

check_current_config() {
    print_header "CURRENT CONFIGURATION"

    log_info "Checking Cloud SQL instance: $INSTANCE_NAME"
    echo ""

    # Get instance details
    local instance_info
    if ! instance_info=$(gcloud sql instances describe "$INSTANCE_NAME" --format="yaml(ipAddresses,settings.ipConfiguration)" 2>/dev/null); then
        log_error "Cloud SQL instance '$INSTANCE_NAME' not found"
        return 1
    fi

    echo "$instance_info"
    echo ""

    # Check for public IP
    local has_public_ip
    has_public_ip=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --format="value(ipAddresses[0].type)" 2>/dev/null || echo "")

    local has_private_ip
    has_private_ip=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --format="value(ipAddresses[].type)" 2>/dev/null | grep -c "PRIVATE" || echo "0")

    echo "IP Configuration:"
    if [ "$has_public_ip" = "PRIMARY" ]; then
        echo -e "  Public IP:  ${YELLOW}Enabled${NC} (will be disabled)"
    else
        echo -e "  Public IP:  ${GREEN}Disabled${NC}"
    fi

    if [ "$has_private_ip" -gt 0 ]; then
        echo -e "  Private IP: ${GREEN}Enabled${NC}"
    else
        echo -e "  Private IP: ${RED}Not configured${NC}"
    fi
    echo ""

    # Check VPC connector
    log_info "Checking VPC connector: $CONNECTOR_NAME"

    if gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
        --region="$REGION" &>/dev/null; then
        echo -e "  VPC Connector: ${GREEN}Exists${NC}"

        local connector_state
        connector_state=$(gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
            --region="$REGION" \
            --format="value(state)")
        echo "  State: $connector_state"
    else
        echo -e "  VPC Connector: ${RED}Not found${NC}"
    fi
    echo ""

    # Check Cloud Run configuration
    log_info "Checking Cloud Run service: $SERVICE_NAME"

    if gcloud run services describe "$SERVICE_NAME" --region="$REGION" &>/dev/null; then
        local vpc_connector
        vpc_connector=$(gcloud run services describe "$SERVICE_NAME" \
            --region="$REGION" \
            --format="value(spec.template.metadata.annotations.'run.googleapis.com/vpc-access-connector')" 2>/dev/null || echo "")

        if [ -n "$vpc_connector" ]; then
            echo -e "  VPC Connector: ${GREEN}$vpc_connector${NC}"
        else
            echo -e "  VPC Connector: ${YELLOW}Not configured${NC}"
        fi
    else
        echo -e "  Cloud Run Service: ${RED}Not found${NC}"
    fi
    echo ""

    # Check VPC peering
    log_info "Checking VPC peering for Cloud SQL"

    if gcloud compute addresses describe "$PEERING_RANGE_NAME" --global &>/dev/null; then
        echo -e "  Peering Range: ${GREEN}Configured${NC}"
    else
        echo -e "  Peering Range: ${RED}Not configured${NC}"
    fi
}

# =============================================================================
# Setup VPC Peering for Cloud SQL
# =============================================================================

setup_vpc_peering() {
    print_header "SETTING UP VPC PEERING FOR CLOUD SQL"

    log_step "Step 1: Enable Service Networking API"
    if gcloud services enable servicenetworking.googleapis.com --quiet; then
        log_success "Service Networking API enabled"
    else
        log_error "Failed to enable Service Networking API"
        return 1
    fi

    echo ""
    log_step "Step 2: Create IP address range for VPC peering"

    # Check if range already exists
    if gcloud compute addresses describe "$PEERING_RANGE_NAME" --global &>/dev/null; then
        log_info "Peering range '$PEERING_RANGE_NAME' already exists"
    else
        log_info "Creating peering range: $PEERING_RANGE_NAME"
        log_info "This reserves a /16 range (65,536 IPs) for Cloud SQL private IPs"

        if gcloud compute addresses create "$PEERING_RANGE_NAME" \
            --global \
            --purpose=VPC_PEERING \
            --prefix-length=16 \
            --network="$NETWORK_NAME" \
            --quiet; then
            log_success "Peering range created"
        else
            log_error "Failed to create peering range"
            return 1
        fi
    fi

    # Show the allocated range
    local range_address
    range_address=$(gcloud compute addresses describe "$PEERING_RANGE_NAME" \
        --global \
        --format="value(address)")
    log_info "Allocated range: $range_address/16"

    echo ""
    log_step "Step 3: Create private connection to Service Networking"

    log_info "Creating VPC peering connection (this may take a few minutes)..."

    if gcloud services vpc-peerings connect \
        --service=servicenetworking.googleapis.com \
        --ranges="$PEERING_RANGE_NAME" \
        --network="$NETWORK_NAME" \
        --quiet; then
        log_success "VPC peering connection established"
    else
        # Check if already exists
        if gcloud services vpc-peerings list --network="$NETWORK_NAME" 2>/dev/null | grep -q servicenetworking; then
            log_info "VPC peering already exists"
        else
            log_error "Failed to create VPC peering connection"
            return 1
        fi
    fi

    echo ""
    log_success "VPC peering setup complete!"
}

# =============================================================================
# Create VPC Connector for Cloud Run
# =============================================================================

setup_vpc_connector() {
    print_header "SETTING UP VPC CONNECTOR FOR CLOUD RUN"

    log_step "Step 1: Enable VPC Access API"
    if gcloud services enable vpcaccess.googleapis.com --quiet; then
        log_success "VPC Access API enabled"
    else
        log_error "Failed to enable VPC Access API"
        return 1
    fi

    echo ""
    log_step "Step 2: Create VPC connector"

    # Check if connector already exists
    if gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
        --region="$REGION" &>/dev/null; then
        log_info "VPC connector '$CONNECTOR_NAME' already exists"

        local connector_state
        connector_state=$(gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
            --region="$REGION" \
            --format="value(state)")

        if [ "$connector_state" = "READY" ]; then
            log_success "Connector is ready"
            return 0
        else
            log_warning "Connector state: $connector_state"
        fi
    else
        log_info "Creating VPC connector: $CONNECTOR_NAME"
        log_info "IP range: $CONNECTOR_RANGE"
        log_info "This allocates 2 f1-micro instances (min) for the connector"

        if ! confirm_action "Create VPC connector? (costs ~\$5-15/month)"; then
            log_info "Skipping VPC connector creation"
            return 0
        fi

        if gcloud compute networks vpc-access connectors create "$CONNECTOR_NAME" \
            --region="$REGION" \
            --network="$NETWORK_NAME" \
            --range="$CONNECTOR_RANGE" \
            --min-instances=2 \
            --max-instances=3 \
            --machine-type=e2-micro \
            --quiet; then
            log_success "VPC connector created"
        else
            log_error "Failed to create VPC connector"
            return 1
        fi
    fi

    echo ""
    log_info "Waiting for connector to be ready..."

    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        local state
        state=$(gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
            --region="$REGION" \
            --format="value(state)" 2>/dev/null || echo "UNKNOWN")

        if [ "$state" = "READY" ]; then
            log_success "VPC connector is ready!"
            return 0
        fi

        attempt=$((attempt + 1))
        echo -ne "\r  Waiting... ($attempt/$max_attempts) State: $state"
        sleep 10
    done

    echo ""
    log_error "VPC connector did not become ready in time"
    return 1
}

# =============================================================================
# Migrate Cloud SQL to Private IP
# =============================================================================

migrate_sql_to_private() {
    print_header "MIGRATING CLOUD SQL TO PRIVATE IP"

    log_warning "This will modify your Cloud SQL instance's network configuration."
    log_warning "The instance will be briefly unavailable during the update."
    echo ""

    # Check current state
    local current_ips
    current_ips=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --format="value(ipAddresses[].type)" 2>/dev/null)

    if echo "$current_ips" | grep -q "PRIVATE"; then
        log_info "Instance already has private IP configured"
    fi

    if ! confirm_action "Proceed with Cloud SQL migration to private IP?"; then
        log_info "Migration cancelled"
        return 0
    fi

    echo ""
    log_step "Step 1: Enable private IP on Cloud SQL instance"

    log_info "Patching instance to add private IP..."
    log_info "This may take 5-10 minutes..."

    # First, just add private IP without removing public
    if gcloud sql instances patch "$INSTANCE_NAME" \
        --network="projects/$PROJECT_ID/global/networks/$NETWORK_NAME" \
        --quiet; then
        log_success "Private IP enabled"
    else
        log_error "Failed to enable private IP"
        return 1
    fi

    # Wait for operation to complete
    log_info "Waiting for instance to be ready..."
    sleep 30

    # Get the private IP
    local private_ip
    private_ip=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --format="value(ipAddresses[?type=='PRIVATE'].ipAddress)" 2>/dev/null)

    if [ -n "$private_ip" ]; then
        log_success "Private IP assigned: $private_ip"
    else
        log_warning "Private IP not yet visible. Check again in a few minutes."
    fi

    echo ""
    log_step "Step 2: Disable public IP (optional but recommended)"

    log_warning "Disabling public IP will make the database inaccessible from the internet."
    log_warning "Ensure VPC connector is configured and working before proceeding."
    echo ""

    if confirm_action "Disable public IP now?"; then
        log_info "Removing public IP..."

        if gcloud sql instances patch "$INSTANCE_NAME" \
            --no-assign-ip \
            --quiet; then
            log_success "Public IP disabled"
        else
            log_error "Failed to disable public IP"
            log_info "You can disable it later with: gcloud sql instances patch $INSTANCE_NAME --no-assign-ip"
        fi
    else
        log_info "Keeping public IP for now"
        log_info "You can disable it later with: gcloud sql instances patch $INSTANCE_NAME --no-assign-ip"
    fi

    echo ""
    log_success "Cloud SQL private IP migration complete!"

    # Show final IP configuration
    echo ""
    log_info "Current IP configuration:"
    gcloud sql instances describe "$INSTANCE_NAME" \
        --format="table(ipAddresses[].type, ipAddresses[].ipAddress)"
}

# =============================================================================
# Update Cloud Run Service
# =============================================================================

update_cloudrun_service() {
    print_header "UPDATING CLOUD RUN TO USE VPC CONNECTOR"

    # Check if service exists
    if ! gcloud run services describe "$SERVICE_NAME" --region="$REGION" &>/dev/null; then
        log_error "Cloud Run service '$SERVICE_NAME' not found in region '$REGION'"
        return 1
    fi

    # Check if connector exists and is ready
    local connector_state
    connector_state=$(gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
        --region="$REGION" \
        --format="value(state)" 2>/dev/null || echo "")

    if [ "$connector_state" != "READY" ]; then
        log_error "VPC connector '$CONNECTOR_NAME' is not ready (state: $connector_state)"
        log_info "Run '$0 setup-connector' first"
        return 1
    fi

    log_info "Updating Cloud Run service: $SERVICE_NAME"
    log_info "VPC Connector: $CONNECTOR_NAME"
    log_info "Egress: private-ranges-only (only private IP traffic goes through VPC)"
    echo ""

    if ! confirm_action "Update Cloud Run service?"; then
        log_info "Update cancelled"
        return 0
    fi

    # Get full connector path
    local connector_path="projects/$PROJECT_ID/locations/$REGION/connectors/$CONNECTOR_NAME"

    if gcloud run services update "$SERVICE_NAME" \
        --region="$REGION" \
        --vpc-connector="$connector_path" \
        --vpc-egress=private-ranges-only \
        --quiet; then
        log_success "Cloud Run service updated"
    else
        log_error "Failed to update Cloud Run service"
        return 1
    fi

    echo ""
    log_info "Verifying update..."

    local current_connector
    current_connector=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --format="value(spec.template.metadata.annotations.'run.googleapis.com/vpc-access-connector')")

    if [ -n "$current_connector" ]; then
        log_success "VPC connector configured: $current_connector"
    else
        log_warning "VPC connector not visible in service config"
    fi
}

# =============================================================================
# Update DATABASE_URL Secret
# =============================================================================

update_database_secret() {
    print_header "UPDATING DATABASE_URL SECRET"

    # Get the private IP
    local private_ip
    private_ip=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --format="value(ipAddresses[?type=='PRIVATE'].ipAddress)" 2>/dev/null)

    if [ -z "$private_ip" ]; then
        log_error "Could not find private IP for instance '$INSTANCE_NAME'"
        log_info "Ensure private IP is configured with: $0 migrate-sql"
        return 1
    fi

    log_info "Private IP: $private_ip"
    echo ""

    # Check if secret exists
    if ! gcloud secrets describe DATABASE_URL &>/dev/null; then
        log_error "Secret 'DATABASE_URL' not found"
        log_info "Create it with: gcloud secrets create DATABASE_URL --replication-policy=automatic"
        return 1
    fi

    # Get current secret value (don't display it)
    local current_url
    current_url=$(gcloud secrets versions access latest --secret=DATABASE_URL 2>/dev/null || echo "")

    if [ -z "$current_url" ]; then
        log_error "Could not access current DATABASE_URL secret"
        return 1
    fi

    # Check if already using private IP
    if echo "$current_url" | grep -q "$private_ip"; then
        log_info "DATABASE_URL already uses private IP"
        return 0
    fi

    echo ""
    log_warning "You need to update the DATABASE_URL secret to use the private IP."
    log_warning "The new connection string should use: $private_ip"
    echo ""
    echo "Current format (example):"
    echo "  postgresql://user:password@PUBLIC_IP:5432/database"
    echo ""
    echo "New format:"
    echo "  postgresql://user:password@$private_ip:5432/database"
    echo ""

    log_info "To update the secret, run:"
    echo ""
    echo "  # Create new version with private IP"
    echo "  echo -n 'postgresql://USER:PASSWORD@$private_ip:5432/DATABASE' | \\"
    echo "    gcloud secrets versions add DATABASE_URL --data-file=-"
    echo ""
    echo "  # Then redeploy Cloud Run to pick up new secret"
    echo "  gcloud run services update $SERVICE_NAME --region=$REGION"
    echo ""

    if confirm_action "Do you want to enter the new DATABASE_URL now?"; then
        echo ""
        echo "Enter the new DATABASE_URL (input will be hidden):"
        read -s new_url
        echo ""

        if [ -z "$new_url" ]; then
            log_error "No URL provided"
            return 1
        fi

        # Validate it contains the private IP
        if ! echo "$new_url" | grep -q "$private_ip"; then
            log_warning "The URL doesn't contain the private IP ($private_ip)"
            if ! confirm_action "Continue anyway?"; then
                return 1
            fi
        fi

        log_info "Adding new secret version..."

        if echo -n "$new_url" | gcloud secrets versions add DATABASE_URL --data-file=-; then
            log_success "DATABASE_URL secret updated"

            echo ""
            log_info "Redeploying Cloud Run service to use new secret..."

            if gcloud run services update "$SERVICE_NAME" \
                --region="$REGION" \
                --quiet; then
                log_success "Cloud Run service redeployed"
            else
                log_warning "Failed to redeploy. Manually redeploy with:"
                echo "  gcloud run services update $SERVICE_NAME --region=$REGION"
            fi
        else
            log_error "Failed to update secret"
            return 1
        fi
    fi
}

# =============================================================================
# Verify Connectivity
# =============================================================================

verify_connectivity() {
    print_header "VERIFYING CONNECTIVITY"

    log_info "Running connectivity tests..."
    echo ""

    # Check Cloud SQL instance status
    log_step "1. Cloud SQL Instance Status"
    local sql_state
    sql_state=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --format="value(state)" 2>/dev/null || echo "UNKNOWN")

    if [ "$sql_state" = "RUNNABLE" ]; then
        echo -e "   Status: ${GREEN}RUNNABLE${NC}"
    else
        echo -e "   Status: ${RED}$sql_state${NC}"
    fi

    # Show IP addresses
    echo "   IP Addresses:"
    gcloud sql instances describe "$INSTANCE_NAME" \
        --format="table[no-heading](ipAddresses[].type, ipAddresses[].ipAddress)" 2>/dev/null | \
        sed 's/^/     /'

    echo ""

    # Check VPC connector status
    log_step "2. VPC Connector Status"
    local connector_state
    connector_state=$(gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
        --region="$REGION" \
        --format="value(state)" 2>/dev/null || echo "NOT_FOUND")

    if [ "$connector_state" = "READY" ]; then
        echo -e "   Status: ${GREEN}READY${NC}"
    else
        echo -e "   Status: ${RED}$connector_state${NC}"
    fi

    echo ""

    # Check Cloud Run service
    log_step "3. Cloud Run Service Status"
    local service_url
    service_url=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --format="value(status.url)" 2>/dev/null || echo "")

    if [ -n "$service_url" ]; then
        echo -e "   URL: ${GREEN}$service_url${NC}"

        # Check health endpoint
        log_info "   Testing health endpoint..."
        local health_response
        health_response=$(curl -s -o /dev/null -w "%{http_code}" "$service_url/health" 2>/dev/null || echo "000")

        if [ "$health_response" = "200" ]; then
            echo -e "   Health Check: ${GREEN}OK (HTTP 200)${NC}"
        else
            echo -e "   Health Check: ${RED}FAILED (HTTP $health_response)${NC}"
        fi
    else
        echo -e "   Status: ${RED}Service not found${NC}"
    fi

    echo ""

    # Check VPC peering
    log_step "4. VPC Peering Status"
    if gcloud services vpc-peerings list --network="$NETWORK_NAME" 2>/dev/null | grep -q servicenetworking; then
        echo -e "   Status: ${GREEN}Connected${NC}"
    else
        echo -e "   Status: ${RED}Not configured${NC}"
    fi

    echo ""

    # Summary
    print_header "CONNECTIVITY SUMMARY"

    local all_ok=true

    echo "Component Status:"
    echo ""

    # SQL
    if [ "$sql_state" = "RUNNABLE" ]; then
        echo -e "  [${GREEN}✓${NC}] Cloud SQL instance is running"
    else
        echo -e "  [${RED}✗${NC}] Cloud SQL instance: $sql_state"
        all_ok=false
    fi

    # Private IP
    local has_private
    has_private=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --format="value(ipAddresses[].type)" 2>/dev/null | grep -c "PRIVATE" || echo "0")
    if [ "$has_private" -gt 0 ]; then
        echo -e "  [${GREEN}✓${NC}] Private IP configured"
    else
        echo -e "  [${RED}✗${NC}] Private IP not configured"
        all_ok=false
    fi

    # VPC connector
    if [ "$connector_state" = "READY" ]; then
        echo -e "  [${GREEN}✓${NC}] VPC connector is ready"
    else
        echo -e "  [${RED}✗${NC}] VPC connector: $connector_state"
        all_ok=false
    fi

    # Cloud Run VPC
    local cloudrun_vpc
    cloudrun_vpc=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --format="value(spec.template.metadata.annotations.'run.googleapis.com/vpc-access-connector')" 2>/dev/null || echo "")
    if [ -n "$cloudrun_vpc" ]; then
        echo -e "  [${GREEN}✓${NC}] Cloud Run using VPC connector"
    else
        echo -e "  [${YELLOW}!${NC}] Cloud Run not using VPC connector"
        all_ok=false
    fi

    # Health check
    if [ "$health_response" = "200" ]; then
        echo -e "  [${GREEN}✓${NC}] Application health check passed"
    else
        echo -e "  [${RED}✗${NC}] Application health check failed"
        all_ok=false
    fi

    echo ""

    if $all_ok; then
        log_success "All connectivity checks passed!"
    else
        log_warning "Some checks failed. Review the output above."
    fi
}

# =============================================================================
# Rollback Procedure
# =============================================================================

rollback_to_public() {
    print_header "ROLLBACK TO PUBLIC IP"

    log_warning "This will re-enable public IP on the Cloud SQL instance."
    log_warning "Use this only if you need to quickly restore access."
    echo ""

    if ! confirm_action "Proceed with rollback?"; then
        log_info "Rollback cancelled"
        return 0
    fi

    echo ""
    log_step "Step 1: Re-enable public IP on Cloud SQL"

    if gcloud sql instances patch "$INSTANCE_NAME" \
        --assign-ip \
        --quiet; then
        log_success "Public IP re-enabled"
    else
        log_error "Failed to re-enable public IP"
        return 1
    fi

    # Get the new public IP
    local public_ip
    sleep 10  # Wait for IP assignment
    public_ip=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --format="value(ipAddresses[?type=='PRIMARY'].ipAddress)" 2>/dev/null)

    log_info "Public IP: $public_ip"

    echo ""
    log_step "Step 2: Update DATABASE_URL secret (if needed)"

    log_info "If your DATABASE_URL was updated to use private IP, you need to revert it:"
    echo ""
    echo "  echo -n 'postgresql://USER:PASSWORD@$public_ip:5432/DATABASE' | \\"
    echo "    gcloud secrets versions add DATABASE_URL --data-file=-"
    echo ""
    echo "  gcloud run services update $SERVICE_NAME --region=$REGION"

    echo ""
    log_step "Step 3: (Optional) Remove VPC connector from Cloud Run"

    if confirm_action "Remove VPC connector from Cloud Run?"; then
        if gcloud run services update "$SERVICE_NAME" \
            --region="$REGION" \
            --clear-vpc-connector \
            --quiet; then
            log_success "VPC connector removed from Cloud Run"
        else
            log_error "Failed to remove VPC connector"
        fi
    fi

    echo ""
    log_success "Rollback complete!"
    log_info "Note: VPC connector and peering are still configured. You can delete them manually if needed."
}

# =============================================================================
# Full Migration
# =============================================================================

run_full_migration() {
    print_header "FULL PRIVATE IP MIGRATION"

    log_warning "This will perform a complete migration to private IP."
    log_warning "The process involves:"
    echo "  1. Setting up VPC peering for Cloud SQL"
    echo "  2. Creating VPC connector for Cloud Run"
    echo "  3. Migrating Cloud SQL to private IP"
    echo "  4. Updating Cloud Run to use VPC connector"
    echo "  5. Updating DATABASE_URL secret"
    echo "  6. Verifying connectivity"
    echo ""

    if ! confirm_action "Proceed with full migration?"; then
        log_info "Migration cancelled"
        return 0
    fi

    # Run each step
    setup_vpc_peering || { log_error "VPC peering setup failed"; return 1; }
    setup_vpc_connector || { log_error "VPC connector setup failed"; return 1; }
    migrate_sql_to_private || { log_error "SQL migration failed"; return 1; }
    update_cloudrun_service || { log_error "Cloud Run update failed"; return 1; }
    update_database_secret || { log_warning "Secret update skipped or failed"; }
    verify_connectivity

    echo ""
    print_header "MIGRATION COMPLETE"

    log_success "Private IP migration completed!"
    echo ""
    echo "Next steps:"
    echo "  1. Monitor application logs for any connection errors"
    echo "  2. Test all application functionality"
    echo "  3. If issues occur, run: $0 rollback"
    echo ""
    echo "For local development, use Cloud SQL Auth Proxy:"
    echo "  ./cloud-sql-proxy $PROJECT_ID:$REGION:$INSTANCE_NAME"
}

# =============================================================================
# Main
# =============================================================================

show_help() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  check           Check current configuration and prerequisites"
    echo "  setup-vpc       Set up VPC peering for Cloud SQL"
    echo "  setup-connector Create VPC connector for Cloud Run"
    echo "  migrate-sql     Migrate Cloud SQL to private IP"
    echo "  update-cloudrun Update Cloud Run to use VPC connector"
    echo "  update-secret   Update DATABASE_URL secret with private IP"
    echo "  verify          Verify connectivity after migration"
    echo "  full            Run complete migration (interactive)"
    echo "  rollback        Rollback to public IP (emergency)"
    echo "  help            Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  PROJECT_ID       GCP project ID (required)"
    echo "  REGION           GCP region (default: us-central1)"
    echo "  INSTANCE_NAME    Cloud SQL instance (default: verifymyprovider-db)"
    echo "  NETWORK_NAME     VPC network name (default: default)"
    echo "  CONNECTOR_NAME   VPC connector name (default: verifymyprovider-connector)"
    echo "  SERVICE_NAME     Cloud Run service (default: verifymyprovider-backend)"
    echo ""
    echo "Example:"
    echo "  export PROJECT_ID=my-project"
    echo "  $0 full"
}

main() {
    local command="${1:-check}"

    case "$command" in
        check)
            check_prerequisites
            check_current_config
            ;;
        setup-vpc)
            check_prerequisites
            setup_vpc_peering
            ;;
        setup-connector)
            check_prerequisites
            setup_vpc_connector
            ;;
        migrate-sql)
            check_prerequisites
            migrate_sql_to_private
            ;;
        update-cloudrun)
            check_prerequisites
            update_cloudrun_service
            ;;
        update-secret)
            check_prerequisites
            update_database_secret
            ;;
        verify)
            check_prerequisites
            verify_connectivity
            ;;
        full)
            check_prerequisites
            run_full_migration
            ;;
        rollback)
            check_prerequisites
            rollback_to_public
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"
