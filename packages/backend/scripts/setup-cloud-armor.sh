#!/bin/bash
#
# Google Cloud Armor WAF Setup Script
#
# This script sets up Cloud Armor Web Application Firewall for the VerifyMyProvider
# application. Cloud Armor provides DDoS protection and WAF capabilities at the edge.
#
# IMPORTANT: Cloud Armor requires a load balancer. This script sets up:
# 1. Cloud Armor security policy with WAF rules
# 2. Serverless Network Endpoint Group (NEG) for Cloud Run
# 3. Backend service with Cloud Armor attached
# 4. URL map and HTTPS load balancer
# 5. SSL certificate (managed by Google)
#
# Usage:
#   ./scripts/setup-cloud-armor.sh [command]
#
# Commands:
#   check            - Check current configuration
#   create-policy    - Create Cloud Armor security policy
#   create-lb        - Create load balancer infrastructure
#   attach           - Attach security policy to backend
#   verify           - Verify WAF is working
#   logs             - View blocked request logs
#   add-ip-block     - Add IP to blocklist
#   add-ip-allow     - Add IP to allowlist
#   disable-rule     - Temporarily disable a rule
#   enable-rule      - Re-enable a rule
#   full             - Run complete setup
#   cleanup          - Remove all Cloud Armor resources
#
# Environment Variables:
#   PROJECT_ID        - GCP project ID (required)
#   REGION            - GCP region (default: us-central1)
#   DOMAIN            - Domain name for SSL certificate (required for HTTPS)
#   SERVICE_NAME      - Cloud Run service (default: verifymyprovider-backend)
#   POLICY_NAME       - Security policy name (default: verifymyprovider-waf)
#
# =============================================================================
# CLOUD ARMOR OVERVIEW
# =============================================================================
#
# Cloud Armor provides:
# 1. DDoS Protection - Automatic protection against volumetric attacks
# 2. WAF Rules - OWASP ModSecurity Core Rule Set
# 3. Rate Limiting - Edge-based rate limiting
# 4. Geo-blocking - Block/allow by country
# 5. IP Allowlists/Blocklists - Fine-grained access control
#
# Pricing (as of 2024):
# - Security policy: $5/month per policy
# - Rules: $1/month per rule
# - Requests: $0.75 per million requests evaluated
# - Adaptive Protection: Additional $0.10 per million requests
#
# Estimated Monthly Cost:
# - Basic setup (1 policy, 10 rules): ~$15/month + request costs
# - With load balancer + 1M req/month: ~$15 + $18 LB + $0.75 = ~$34/month
# - See docs/CLOUD-ARMOR-SETUP.md for detailed cost breakdown
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
DOMAIN="${DOMAIN:-}"
SERVICE_NAME="${SERVICE_NAME:-verifymyprovider-backend}"
POLICY_NAME="${POLICY_NAME:-verifymyprovider-waf}"
NEG_NAME="${NEG_NAME:-verifymyprovider-neg}"
BACKEND_SERVICE="${BACKEND_SERVICE:-verifymyprovider-backend-service}"
URL_MAP_NAME="${URL_MAP_NAME:-verifymyprovider-url-map}"
HTTPS_PROXY_NAME="${HTTPS_PROXY_NAME:-verifymyprovider-https-proxy}"
FORWARDING_RULE_NAME="${FORWARDING_RULE_NAME:-verifymyprovider-https-rule}"
SSL_CERT_NAME="${SSL_CERT_NAME:-verifymyprovider-ssl-cert}"
IP_ADDRESS_NAME="${IP_ADDRESS_NAME:-verifymyprovider-ip}"

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

    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed"
        exit 1
    fi

    if [ -z "$PROJECT_ID" ]; then
        PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
        if [ -z "$PROJECT_ID" ]; then
            log_error "PROJECT_ID not set"
            exit 1
        fi
        log_info "Using project: $PROJECT_ID"
    fi

    gcloud config set project "$PROJECT_ID" --quiet

    # Enable required APIs
    log_info "Enabling required APIs..."
    gcloud services enable compute.googleapis.com --quiet
    gcloud services enable run.googleapis.com --quiet

    log_success "Prerequisites verified"
}

# =============================================================================
# Check Current Configuration
# =============================================================================

check_current_config() {
    print_header "CURRENT CLOUD ARMOR CONFIGURATION"

    # Check security policy
    log_info "Security Policy: $POLICY_NAME"
    if gcloud compute security-policies describe "$POLICY_NAME" &>/dev/null; then
        echo -e "  Status: ${GREEN}Exists${NC}"

        # List rules
        echo "  Rules:"
        gcloud compute security-policies rules list \
            --security-policy="$POLICY_NAME" \
            --format="table[no-heading](priority, action, description)" 2>/dev/null | \
            sed 's/^/    /'
    else
        echo -e "  Status: ${YELLOW}Not configured${NC}"
    fi

    echo ""

    # Check backend service
    log_info "Backend Service: $BACKEND_SERVICE"
    if gcloud compute backend-services describe "$BACKEND_SERVICE" --global &>/dev/null; then
        echo -e "  Status: ${GREEN}Exists${NC}"

        local attached_policy
        attached_policy=$(gcloud compute backend-services describe "$BACKEND_SERVICE" \
            --global \
            --format="value(securityPolicy)" 2>/dev/null || echo "")

        if [ -n "$attached_policy" ]; then
            echo -e "  Security Policy: ${GREEN}Attached${NC}"
        else
            echo -e "  Security Policy: ${YELLOW}Not attached${NC}"
        fi
    else
        echo -e "  Status: ${YELLOW}Not configured${NC}"
    fi

    echo ""

    # Check load balancer
    log_info "Load Balancer"
    if gcloud compute forwarding-rules describe "$FORWARDING_RULE_NAME" --global &>/dev/null; then
        local lb_ip
        lb_ip=$(gcloud compute forwarding-rules describe "$FORWARDING_RULE_NAME" \
            --global \
            --format="value(IPAddress)" 2>/dev/null)
        echo -e "  Status: ${GREEN}Configured${NC}"
        echo "  IP Address: $lb_ip"
    else
        echo -e "  Status: ${YELLOW}Not configured${NC}"
    fi

    echo ""

    # Check Cloud Run service
    log_info "Cloud Run Service: $SERVICE_NAME"
    if gcloud run services describe "$SERVICE_NAME" --region="$REGION" &>/dev/null; then
        echo -e "  Status: ${GREEN}Running${NC}"
    else
        echo -e "  Status: ${RED}Not found${NC}"
    fi
}

# =============================================================================
# Create Security Policy with WAF Rules
# =============================================================================

create_security_policy() {
    print_header "CREATING CLOUD ARMOR SECURITY POLICY"

    # Check if policy exists
    if gcloud compute security-policies describe "$POLICY_NAME" &>/dev/null; then
        log_warning "Security policy '$POLICY_NAME' already exists"
        if ! confirm_action "Delete and recreate?"; then
            log_info "Skipping policy creation"
            return 0
        fi
        gcloud compute security-policies delete "$POLICY_NAME" --quiet
    fi

    log_step "Step 1: Create security policy"
    if gcloud compute security-policies create "$POLICY_NAME" \
        --description="WAF policy for VerifyMyProvider API" \
        --quiet; then
        log_success "Security policy created"
    else
        log_error "Failed to create security policy"
        return 1
    fi

    echo ""
    log_step "Step 2: Add OWASP WAF rules"

    # XSS Protection (Priority 1000)
    log_info "Adding XSS protection rule..."
    gcloud compute security-policies rules create 1000 \
        --security-policy="$POLICY_NAME" \
        --expression="evaluatePreconfiguredExpr('xss-v33-stable')" \
        --action=deny-403 \
        --description="XSS protection - blocks cross-site scripting attempts" \
        --quiet
    log_success "XSS rule added (priority 1000)"

    # SQL Injection Protection (Priority 1001)
    log_info "Adding SQL injection protection rule..."
    gcloud compute security-policies rules create 1001 \
        --security-policy="$POLICY_NAME" \
        --expression="evaluatePreconfiguredExpr('sqli-v33-stable')" \
        --action=deny-403 \
        --description="SQLi protection - blocks SQL injection attempts" \
        --quiet
    log_success "SQLi rule added (priority 1001)"

    # Remote Code Execution Protection (Priority 1002)
    log_info "Adding RCE protection rule..."
    gcloud compute security-policies rules create 1002 \
        --security-policy="$POLICY_NAME" \
        --expression="evaluatePreconfiguredExpr('rce-v33-stable')" \
        --action=deny-403 \
        --description="RCE protection - blocks remote code execution attempts" \
        --quiet
    log_success "RCE rule added (priority 1002)"

    # Local File Inclusion Protection (Priority 1003)
    log_info "Adding LFI protection rule..."
    gcloud compute security-policies rules create 1003 \
        --security-policy="$POLICY_NAME" \
        --expression="evaluatePreconfiguredExpr('lfi-v33-stable')" \
        --action=deny-403 \
        --description="LFI protection - blocks local file inclusion attempts" \
        --quiet
    log_success "LFI rule added (priority 1003)"

    # Remote File Inclusion Protection (Priority 1004)
    log_info "Adding RFI protection rule..."
    gcloud compute security-policies rules create 1004 \
        --security-policy="$POLICY_NAME" \
        --expression="evaluatePreconfiguredExpr('rfi-v33-stable')" \
        --action=deny-403 \
        --description="RFI protection - blocks remote file inclusion attempts" \
        --quiet
    log_success "RFI rule added (priority 1004)"

    # Scanner Detection (Priority 1005)
    log_info "Adding scanner detection rule..."
    gcloud compute security-policies rules create 1005 \
        --security-policy="$POLICY_NAME" \
        --expression="evaluatePreconfiguredExpr('scannerdetection-v33-stable')" \
        --action=deny-403 \
        --description="Scanner detection - blocks automated vulnerability scanners" \
        --quiet
    log_success "Scanner detection rule added (priority 1005)"

    # Protocol Attack Protection (Priority 1006)
    log_info "Adding protocol attack protection rule..."
    gcloud compute security-policies rules create 1006 \
        --security-policy="$POLICY_NAME" \
        --expression="evaluatePreconfiguredExpr('protocolattack-v33-stable')" \
        --action=deny-403 \
        --description="Protocol attack protection - blocks HTTP protocol attacks" \
        --quiet
    log_success "Protocol attack rule added (priority 1006)"

    # Session Fixation Protection (Priority 1007)
    log_info "Adding session fixation protection rule..."
    gcloud compute security-policies rules create 1007 \
        --security-policy="$POLICY_NAME" \
        --expression="evaluatePreconfiguredExpr('sessionfixation-v33-stable')" \
        --action=deny-403 \
        --description="Session fixation protection" \
        --quiet
    log_success "Session fixation rule added (priority 1007)"

    # Known Bot / Malicious User-Agent Blocking (Priority 1008)
    #
    # The scannerdetection rule (1005) catches known vuln scanners like Nikto,
    # sqlmap, Nessus, etc. This rule adds coverage for mass-scraping bots and
    # HTTP libraries commonly used in automated attacks that the OWASP rules
    # may not flag. Legitimate API consumers should set a proper User-Agent.
    #
    log_info "Adding known bot/malicious UA blocking rule..."
    gcloud compute security-policies rules create 1008 \
        --security-policy="$POLICY_NAME" \
        --expression="has(request.headers['user-agent']) && request.headers['user-agent'].matches('(?i)(masscan|zgrab|gobuster|dirbuster|nuclei|httpx|subfinder|shodan|censys|internetmeasur|dataforseo|semrush.*bot|ahrefsbot|mj12bot|dotbot|blexbot|petalbot)')" \
        --action=deny-403 \
        --description="Block known malicious bots and aggressive crawlers" \
        --quiet
    log_success "Bot/scanner UA blocking rule added (priority 1008)"

    echo ""
    log_step "Step 3: Add geographic restriction (optional)"

    # Geographic Restriction (Priority 3000) — COMMENTED OUT
    #
    # For the NYC-first launch, all legitimate users are in the US.
    # Uncomment to restrict traffic to US-only, which blocks a large volume
    # of automated attacks originating overseas.
    #
    # To enable: remove the comment markers and re-run create-policy.
    #
    log_info "Geographic restriction rule: SKIPPED (commented out for launch)"
    log_info "To enable US-only access, uncomment the geo rule in this script"
    # gcloud compute security-policies rules create 3000 \
    #     --security-policy="$POLICY_NAME" \
    #     --expression="origin.region_code != 'US'" \
    #     --action=deny-403 \
    #     --description="Geographic restriction: US-only access" \
    #     --quiet

    echo ""
    log_step "Step 4: Add rate limiting rule"

    # Edge Rate Limiting (Priority 2000)
    #
    # 100 req/min per IP at the edge layer. This is intentionally broader than
    # the application-level rate limits (10-200 req/hr depending on endpoint)
    # because Cloud Armor catches volumetric abuse before it reaches Cloud Run,
    # while the Express rate limiter handles per-endpoint granularity.
    #
    # 100/min = 6,000/hr — any legitimate user is well under this.
    # Bots doing bulk scraping or credential stuffing hit this quickly.
    #
    log_info "Adding rate limiting rule (100 req/min per IP)..."
    gcloud compute security-policies rules create 2000 \
        --security-policy="$POLICY_NAME" \
        --expression="true" \
        --action=rate-based-ban \
        --rate-limit-threshold-count=100 \
        --rate-limit-threshold-interval-sec=60 \
        --ban-duration-sec=600 \
        --conform-action=allow \
        --exceed-action=deny-429 \
        --enforce-on-key=IP \
        --description="Rate limit 100 req/min per IP, ban for 10 min if exceeded" \
        --quiet
    log_success "Rate limiting rule added (priority 2000)"

    echo ""
    log_step "Step 5: Configure adaptive protection"

    log_info "Enabling adaptive protection..."
    gcloud compute security-policies update "$POLICY_NAME" \
        --enable-layer7-ddos-defense \
        --layer7-ddos-defense-rule-visibility=STANDARD \
        --quiet || log_warning "Adaptive protection may require additional setup"

    echo ""
    log_success "Security policy created with all rules!"

    # Show summary
    echo ""
    log_info "Rule Summary:"
    gcloud compute security-policies rules list \
        --security-policy="$POLICY_NAME" \
        --format="table(priority, action, description)"
}

# =============================================================================
# Create Load Balancer Infrastructure
# =============================================================================

create_load_balancer() {
    print_header "CREATING LOAD BALANCER FOR CLOUD RUN"

    if [ -z "$DOMAIN" ]; then
        log_warning "DOMAIN environment variable not set"
        log_info "You can set it later for HTTPS, or use HTTP only for now"
        echo ""
        read -p "Enter domain (or press Enter for HTTP only): " DOMAIN
    fi

    log_step "Step 1: Reserve static IP address"

    if gcloud compute addresses describe "$IP_ADDRESS_NAME" --global &>/dev/null; then
        log_info "IP address '$IP_ADDRESS_NAME' already exists"
    else
        log_info "Reserving global static IP..."
        gcloud compute addresses create "$IP_ADDRESS_NAME" \
            --ip-version=IPV4 \
            --global \
            --quiet
        log_success "Static IP reserved"
    fi

    local STATIC_IP
    STATIC_IP=$(gcloud compute addresses describe "$IP_ADDRESS_NAME" \
        --global \
        --format="value(address)")
    log_info "Static IP: $STATIC_IP"

    echo ""
    log_step "Step 2: Create serverless NEG for Cloud Run"

    if gcloud compute network-endpoint-groups describe "$NEG_NAME" --region="$REGION" &>/dev/null; then
        log_info "NEG '$NEG_NAME' already exists"
    else
        log_info "Creating serverless NEG..."
        gcloud compute network-endpoint-groups create "$NEG_NAME" \
            --region="$REGION" \
            --network-endpoint-type=serverless \
            --cloud-run-service="$SERVICE_NAME" \
            --quiet
        log_success "Serverless NEG created"
    fi

    echo ""
    log_step "Step 3: Create backend service"

    if gcloud compute backend-services describe "$BACKEND_SERVICE" --global &>/dev/null; then
        log_info "Backend service '$BACKEND_SERVICE' already exists"
    else
        log_info "Creating backend service..."
        gcloud compute backend-services create "$BACKEND_SERVICE" \
            --global \
            --load-balancing-scheme=EXTERNAL_MANAGED \
            --quiet
        log_success "Backend service created"
    fi

    # Add NEG to backend service
    log_info "Adding NEG to backend service..."
    gcloud compute backend-services add-backend "$BACKEND_SERVICE" \
        --global \
        --network-endpoint-group="$NEG_NAME" \
        --network-endpoint-group-region="$REGION" \
        --quiet 2>/dev/null || log_info "NEG already attached to backend"

    echo ""
    log_step "Step 4: Create URL map"

    if gcloud compute url-maps describe "$URL_MAP_NAME" &>/dev/null; then
        log_info "URL map '$URL_MAP_NAME' already exists"
    else
        log_info "Creating URL map..."
        gcloud compute url-maps create "$URL_MAP_NAME" \
            --default-service="$BACKEND_SERVICE" \
            --quiet
        log_success "URL map created"
    fi

    echo ""
    log_step "Step 5: Create SSL certificate and HTTPS proxy"

    if [ -n "$DOMAIN" ]; then
        # Create managed SSL certificate
        if gcloud compute ssl-certificates describe "$SSL_CERT_NAME" &>/dev/null; then
            log_info "SSL certificate '$SSL_CERT_NAME' already exists"
        else
            log_info "Creating managed SSL certificate for $DOMAIN..."
            gcloud compute ssl-certificates create "$SSL_CERT_NAME" \
                --domains="$DOMAIN" \
                --global \
                --quiet
            log_success "SSL certificate created (provisioning may take 15-30 minutes)"
        fi

        # Create HTTPS target proxy
        if gcloud compute target-https-proxies describe "$HTTPS_PROXY_NAME" &>/dev/null; then
            log_info "HTTPS proxy '$HTTPS_PROXY_NAME' already exists"
        else
            log_info "Creating HTTPS target proxy..."
            gcloud compute target-https-proxies create "$HTTPS_PROXY_NAME" \
                --ssl-certificates="$SSL_CERT_NAME" \
                --url-map="$URL_MAP_NAME" \
                --quiet
            log_success "HTTPS proxy created"
        fi

        # Create forwarding rule
        if gcloud compute forwarding-rules describe "$FORWARDING_RULE_NAME" --global &>/dev/null; then
            log_info "Forwarding rule '$FORWARDING_RULE_NAME' already exists"
        else
            log_info "Creating HTTPS forwarding rule..."
            gcloud compute forwarding-rules create "$FORWARDING_RULE_NAME" \
                --global \
                --target-https-proxy="$HTTPS_PROXY_NAME" \
                --address="$IP_ADDRESS_NAME" \
                --ports=443 \
                --load-balancing-scheme=EXTERNAL_MANAGED \
                --quiet
            log_success "Forwarding rule created"
        fi
    else
        log_warning "Skipping HTTPS setup - no domain provided"
        log_info "You can set up HTTPS later by running with DOMAIN=yourdomain.com"
    fi

    echo ""
    log_success "Load balancer infrastructure created!"
    echo ""
    echo "Static IP Address: $STATIC_IP"
    echo ""

    if [ -n "$DOMAIN" ]; then
        echo "DNS Configuration Required:"
        echo "  Add an A record pointing $DOMAIN to $STATIC_IP"
        echo ""
        echo "SSL Certificate Status:"
        gcloud compute ssl-certificates describe "$SSL_CERT_NAME" \
            --format="table(name, type, managed.status, managed.domainStatus)"
        echo ""
        log_warning "SSL provisioning can take 15-30 minutes after DNS is configured"
    fi
}

# =============================================================================
# Attach Security Policy to Backend
# =============================================================================

attach_security_policy() {
    print_header "ATTACHING SECURITY POLICY TO BACKEND"

    # Check if backend exists
    if ! gcloud compute backend-services describe "$BACKEND_SERVICE" --global &>/dev/null; then
        log_error "Backend service '$BACKEND_SERVICE' not found"
        log_info "Run '$0 create-lb' first"
        return 1
    fi

    # Check if policy exists
    if ! gcloud compute security-policies describe "$POLICY_NAME" &>/dev/null; then
        log_error "Security policy '$POLICY_NAME' not found"
        log_info "Run '$0 create-policy' first"
        return 1
    fi

    log_info "Attaching security policy '$POLICY_NAME' to backend '$BACKEND_SERVICE'..."

    if gcloud compute backend-services update "$BACKEND_SERVICE" \
        --global \
        --security-policy="$POLICY_NAME" \
        --quiet; then
        log_success "Security policy attached!"
    else
        log_error "Failed to attach security policy"
        return 1
    fi

    # Verify
    local attached
    attached=$(gcloud compute backend-services describe "$BACKEND_SERVICE" \
        --global \
        --format="value(securityPolicy)")

    if [ -n "$attached" ]; then
        log_success "Verified: Security policy is attached"
    fi
}

# =============================================================================
# Verify WAF is Working
# =============================================================================

verify_waf() {
    print_header "VERIFYING WAF PROTECTION"

    # Get the load balancer IP
    local lb_ip
    lb_ip=$(gcloud compute forwarding-rules describe "$FORWARDING_RULE_NAME" \
        --global \
        --format="value(IPAddress)" 2>/dev/null || echo "")

    if [ -z "$lb_ip" ]; then
        log_error "Load balancer not found. Run '$0 create-lb' first."
        return 1
    fi

    local test_url="http://$lb_ip"
    if [ -n "$DOMAIN" ]; then
        test_url="https://$DOMAIN"
    fi

    log_info "Testing WAF at: $test_url"
    echo ""

    # Test 1: Normal request
    log_step "Test 1: Normal request (should succeed)"
    local normal_response
    normal_response=$(curl -s -o /dev/null -w "%{http_code}" "$test_url/health" 2>/dev/null || echo "000")
    if [ "$normal_response" = "200" ]; then
        echo -e "  Result: ${GREEN}PASS${NC} (HTTP $normal_response)"
    else
        echo -e "  Result: ${YELLOW}HTTP $normal_response${NC}"
    fi

    # Test 2: XSS attempt
    log_step "Test 2: XSS attempt (should be blocked)"
    local xss_response
    xss_response=$(curl -s -o /dev/null -w "%{http_code}" \
        "$test_url/?q=<script>alert('xss')</script>" 2>/dev/null || echo "000")
    if [ "$xss_response" = "403" ]; then
        echo -e "  Result: ${GREEN}BLOCKED${NC} (HTTP $xss_response)"
    else
        echo -e "  Result: ${RED}NOT BLOCKED${NC} (HTTP $xss_response)"
    fi

    # Test 3: SQL injection attempt
    log_step "Test 3: SQL injection attempt (should be blocked)"
    local sqli_response
    sqli_response=$(curl -s -o /dev/null -w "%{http_code}" \
        "$test_url/?id=1%27%20OR%20%271%27=%271" 2>/dev/null || echo "000")
    if [ "$sqli_response" = "403" ]; then
        echo -e "  Result: ${GREEN}BLOCKED${NC} (HTTP $sqli_response)"
    else
        echo -e "  Result: ${RED}NOT BLOCKED${NC} (HTTP $sqli_response)"
    fi

    # Test 4: Scanner user-agent
    log_step "Test 4: Scanner detection (should be blocked)"
    local scanner_response
    scanner_response=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "User-Agent: sqlmap/1.0" \
        "$test_url/health" 2>/dev/null || echo "000")
    if [ "$scanner_response" = "403" ]; then
        echo -e "  Result: ${GREEN}BLOCKED${NC} (HTTP $scanner_response)"
    else
        echo -e "  Result: ${YELLOW}HTTP $scanner_response${NC} (scanner UA detection varies)"
    fi

    echo ""
    log_info "Note: Some tests may show unexpected results if:"
    echo "  - SSL certificate is still provisioning"
    echo "  - DNS is not yet configured"
    echo "  - WAF rules are in preview mode"
}

# =============================================================================
# View Blocked Request Logs
# =============================================================================

view_logs() {
    print_header "CLOUD ARMOR BLOCKED REQUEST LOGS"

    log_info "Fetching recent blocked requests..."
    echo ""

    # Query Cloud Logging for blocked requests
    gcloud logging read "
        resource.type=\"http_load_balancer\"
        jsonPayload.enforcedSecurityPolicy.outcome=\"DENY\"
    " \
        --limit=20 \
        --format="table(
            timestamp,
            jsonPayload.enforcedSecurityPolicy.name,
            jsonPayload.enforcedSecurityPolicy.matchedRulePriority,
            jsonPayload.enforcedSecurityPolicy.outcome,
            httpRequest.remoteIp,
            httpRequest.requestUrl
        )" \
        --project="$PROJECT_ID"

    echo ""
    log_info "To see more details, run:"
    echo "  gcloud logging read 'resource.type=\"http_load_balancer\" jsonPayload.enforcedSecurityPolicy.outcome=\"DENY\"' --limit=100"
}

# =============================================================================
# IP Management
# =============================================================================

add_ip_blocklist() {
    local ip="$1"
    local priority="${2:-500}"

    if [ -z "$ip" ]; then
        log_error "Usage: $0 add-ip-block <IP_ADDRESS> [PRIORITY]"
        return 1
    fi

    print_header "ADDING IP TO BLOCKLIST"

    log_info "Blocking IP: $ip (priority: $priority)"

    if gcloud compute security-policies rules create "$priority" \
        --security-policy="$POLICY_NAME" \
        --src-ip-ranges="$ip" \
        --action=deny-403 \
        --description="Manual block: $ip" \
        --quiet; then
        log_success "IP $ip added to blocklist"
    else
        log_error "Failed to add IP to blocklist"
        return 1
    fi
}

add_ip_allowlist() {
    local ip="$1"
    local priority="${2:-100}"

    if [ -z "$ip" ]; then
        log_error "Usage: $0 add-ip-allow <IP_ADDRESS> [PRIORITY]"
        return 1
    fi

    print_header "ADDING IP TO ALLOWLIST"

    log_info "Allowing IP: $ip (priority: $priority)"

    if gcloud compute security-policies rules create "$priority" \
        --security-policy="$POLICY_NAME" \
        --src-ip-ranges="$ip" \
        --action=allow \
        --description="Manual allow: $ip" \
        --quiet; then
        log_success "IP $ip added to allowlist"
    else
        log_error "Failed to add IP to allowlist"
        return 1
    fi
}

# =============================================================================
# Rule Management
# =============================================================================

disable_rule() {
    local priority="$1"

    if [ -z "$priority" ]; then
        log_error "Usage: $0 disable-rule <PRIORITY>"
        echo ""
        echo "Current rules:"
        gcloud compute security-policies rules list \
            --security-policy="$POLICY_NAME" \
            --format="table(priority, action, description)"
        return 1
    fi

    print_header "DISABLING RULE"

    log_info "Changing rule $priority action to 'allow' (effectively disabling it)"

    if gcloud compute security-policies rules update "$priority" \
        --security-policy="$POLICY_NAME" \
        --action=allow \
        --quiet; then
        log_success "Rule $priority disabled (action changed to allow)"
        log_warning "Remember to re-enable with: $0 enable-rule $priority"
    else
        log_error "Failed to disable rule"
        return 1
    fi
}

enable_rule() {
    local priority="$1"

    if [ -z "$priority" ]; then
        log_error "Usage: $0 enable-rule <PRIORITY>"
        return 1
    fi

    print_header "ENABLING RULE"

    log_info "Changing rule $priority action back to 'deny-403'"

    if gcloud compute security-policies rules update "$priority" \
        --security-policy="$POLICY_NAME" \
        --action=deny-403 \
        --quiet; then
        log_success "Rule $priority re-enabled"
    else
        log_error "Failed to enable rule"
        return 1
    fi
}

# =============================================================================
# Full Setup
# =============================================================================

run_full_setup() {
    print_header "FULL CLOUD ARMOR SETUP"

    log_warning "This will set up Cloud Armor WAF with a load balancer."
    log_warning "Monthly cost estimate: ~\$15-25 depending on traffic"
    echo ""

    if ! confirm_action "Proceed with full setup?"; then
        log_info "Setup cancelled"
        return 0
    fi

    create_security_policy || { log_error "Policy creation failed"; return 1; }
    create_load_balancer || { log_error "Load balancer creation failed"; return 1; }
    attach_security_policy || { log_error "Policy attachment failed"; return 1; }

    echo ""
    print_header "SETUP COMPLETE"

    local lb_ip
    lb_ip=$(gcloud compute forwarding-rules describe "$FORWARDING_RULE_NAME" \
        --global \
        --format="value(IPAddress)" 2>/dev/null || echo "Not available")

    echo "Cloud Armor WAF is now configured!"
    echo ""
    echo "Load Balancer IP: $lb_ip"
    echo ""
    echo "Next steps:"
    echo "  1. Update DNS to point to $lb_ip"
    echo "  2. Wait for SSL certificate to provision (15-30 minutes)"
    echo "  3. Verify WAF with: $0 verify"
    echo "  4. View blocked requests: $0 logs"
    echo ""
    echo "To update Cloud Run direct URL to redirect to load balancer:"
    echo "  gcloud run services update $SERVICE_NAME --region=$REGION --ingress=internal-and-cloud-load-balancing"
}

# =============================================================================
# Cleanup
# =============================================================================

cleanup() {
    print_header "CLEANUP CLOUD ARMOR RESOURCES"

    log_warning "This will delete all Cloud Armor and load balancer resources"
    echo ""

    if ! confirm_action "Are you sure you want to delete all resources?"; then
        log_info "Cleanup cancelled"
        return 0
    fi

    # Delete in reverse order of creation
    log_info "Deleting forwarding rule..."
    gcloud compute forwarding-rules delete "$FORWARDING_RULE_NAME" --global --quiet 2>/dev/null || true

    log_info "Deleting HTTPS proxy..."
    gcloud compute target-https-proxies delete "$HTTPS_PROXY_NAME" --quiet 2>/dev/null || true

    log_info "Deleting SSL certificate..."
    gcloud compute ssl-certificates delete "$SSL_CERT_NAME" --quiet 2>/dev/null || true

    log_info "Deleting URL map..."
    gcloud compute url-maps delete "$URL_MAP_NAME" --quiet 2>/dev/null || true

    log_info "Detaching security policy from backend..."
    gcloud compute backend-services update "$BACKEND_SERVICE" \
        --global \
        --no-security-policy \
        --quiet 2>/dev/null || true

    log_info "Deleting backend service..."
    gcloud compute backend-services delete "$BACKEND_SERVICE" --global --quiet 2>/dev/null || true

    log_info "Deleting NEG..."
    gcloud compute network-endpoint-groups delete "$NEG_NAME" --region="$REGION" --quiet 2>/dev/null || true

    log_info "Deleting security policy..."
    gcloud compute security-policies delete "$POLICY_NAME" --quiet 2>/dev/null || true

    log_info "Releasing static IP..."
    gcloud compute addresses delete "$IP_ADDRESS_NAME" --global --quiet 2>/dev/null || true

    log_success "Cleanup complete!"
}

# =============================================================================
# Main
# =============================================================================

show_help() {
    echo "Usage: $0 [command] [args...]"
    echo ""
    echo "Commands:"
    echo "  check            Check current configuration"
    echo "  create-policy    Create Cloud Armor security policy"
    echo "  create-lb        Create load balancer infrastructure"
    echo "  attach           Attach security policy to backend"
    echo "  verify           Verify WAF is working"
    echo "  logs             View blocked request logs"
    echo "  add-ip-block     Add IP to blocklist"
    echo "  add-ip-allow     Add IP to allowlist"
    echo "  disable-rule     Temporarily disable a rule"
    echo "  enable-rule      Re-enable a rule"
    echo "  full             Run complete setup"
    echo "  cleanup          Remove all Cloud Armor resources"
    echo "  help             Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  PROJECT_ID       GCP project ID (required)"
    echo "  REGION           GCP region (default: us-central1)"
    echo "  DOMAIN           Domain for SSL (required for HTTPS)"
    echo "  SERVICE_NAME     Cloud Run service (default: verifymyprovider-backend)"
    echo "  POLICY_NAME      Security policy (default: verifymyprovider-waf)"
}

main() {
    local command="${1:-check}"
    shift || true

    case "$command" in
        check)
            check_prerequisites
            check_current_config
            ;;
        create-policy)
            check_prerequisites
            create_security_policy
            ;;
        create-lb)
            check_prerequisites
            create_load_balancer
            ;;
        attach)
            check_prerequisites
            attach_security_policy
            ;;
        verify)
            check_prerequisites
            verify_waf
            ;;
        logs)
            check_prerequisites
            view_logs
            ;;
        add-ip-block)
            check_prerequisites
            add_ip_blocklist "$@"
            ;;
        add-ip-allow)
            check_prerequisites
            add_ip_allowlist "$@"
            ;;
        disable-rule)
            check_prerequisites
            disable_rule "$@"
            ;;
        enable-rule)
            check_prerequisites
            enable_rule "$@"
            ;;
        full)
            check_prerequisites
            run_full_setup
            ;;
        cleanup)
            check_prerequisites
            cleanup
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
