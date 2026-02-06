#!/usr/bin/env bash
# =============================================================================
# ISSUE-011: Cloud Armor WAF Setup for VerifyMyProvider
# =============================================================================
#
# PURPOSE:
#   Sets up Google Cloud Armor (WAF) in front of our Cloud Run services via
#   a Global HTTPS Load Balancer. This is required because Cloud Armor cannot
#   protect Cloud Run services accessed directly via *.run.app URLs — traffic
#   must flow through a Google Cloud Load Balancer (GCLB).
#
# ARCHITECTURE (after this script):
#   Internet → Global HTTPS LB → Cloud Armor WAF → Serverless NEGs → Cloud Run
#
# WHAT THIS CHANGES:
#   - Traffic will reach the app via the GCLB instead of direct Cloud Run URLs
#   - The domain verifymyprovider.com will point to the LB's static IP
#   - Cloud Armor will inspect and filter all incoming requests
#   - After verifying the LB works, the Cloud Run services should be locked
#     down to require authentication (--no-allow-unauthenticated), with the
#     LB's service account granted roles/run.invoker. This prevents bypassing
#     the WAF by hitting the *.run.app URLs directly.
#
# COST ESTIMATE:
#   - Global external HTTPS load balancer: ~$18/month (forwarding rule + traffic)
#   - Cloud Armor policy: first policy free, $5/month per additional policy
#   - Total additional cost: ~$18-25/month on top of the existing ~$13/month
#
# USAGE:
#   This is a ONE-TIME setup script. Run it in Google Cloud Shell:
#     chmod +x scripts/setup-cloud-armor.sh
#     ./scripts/setup-cloud-armor.sh
#
#   Do NOT run this in CI/CD pipelines.
#
# IDEMPOTENCY:
#   The script checks if each resource exists before creating it, so it is
#   safe to re-run if a previous execution was interrupted.
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT="verifymyprovider-prod"
REGION="us-central1"
DOMAIN="verifymyprovider.com"

# Cloud Run service names
BACKEND_SERVICE="verifymyprovider-backend"
FRONTEND_SERVICE="verifymyprovider-frontend"

# Cloud Armor
SECURITY_POLICY="verifymyprovider-waf"

# Networking resources
BACKEND_NEG="verifymyprovider-backend-neg"
FRONTEND_NEG="verifymyprovider-frontend-neg"
BACKEND_BACKEND_SVC="verifymyprovider-backend-svc"
FRONTEND_BACKEND_SVC="verifymyprovider-frontend-svc"
URL_MAP="verifymyprovider-url-map"
SSL_CERT="verifymyprovider-ssl-cert"
HTTPS_PROXY="verifymyprovider-https-proxy"
HTTP_PROXY="verifymyprovider-http-proxy"
FORWARDING_RULE="verifymyprovider-https-rule"
HTTP_FORWARDING_RULE="verifymyprovider-http-rule"
STATIC_IP="verifymyprovider-ip"

# ---------------------------------------------------------------------------
# Helper: check if a resource exists (returns 0 if it does)
# ---------------------------------------------------------------------------
resource_exists() {
  local resource_type="$1"
  shift
  gcloud compute "$resource_type" describe "$@" --project="$PROJECT" &>/dev/null 2>&1
}

neg_exists() {
  gcloud compute network-endpoint-groups describe "$1" \
    --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1
}

security_policy_exists() {
  gcloud compute security-policies describe "$1" \
    --project="$PROJECT" &>/dev/null 2>&1
}

security_rule_exists() {
  gcloud compute security-policies rules describe "$1" \
    --security-policy="$2" --project="$PROJECT" &>/dev/null 2>&1
}

backend_service_exists() {
  gcloud compute backend-services describe "$1" \
    --global --project="$PROJECT" &>/dev/null 2>&1
}

url_map_exists() {
  gcloud compute url-maps describe "$1" \
    --project="$PROJECT" &>/dev/null 2>&1
}

ssl_cert_exists() {
  gcloud compute ssl-certificates describe "$1" \
    --project="$PROJECT" &>/dev/null 2>&1
}

target_proxy_exists() {
  gcloud compute target-https-proxies describe "$1" \
    --project="$PROJECT" &>/dev/null 2>&1
}

target_http_proxy_exists() {
  gcloud compute target-http-proxies describe "$1" \
    --project="$PROJECT" &>/dev/null 2>&1
}

forwarding_rule_exists() {
  gcloud compute forwarding-rules describe "$1" \
    --global --project="$PROJECT" &>/dev/null 2>&1
}

address_exists() {
  gcloud compute addresses describe "$1" \
    --global --project="$PROJECT" &>/dev/null 2>&1
}

echo "============================================="
echo "  Cloud Armor + GCLB Setup for VerifyMyProvider"
echo "============================================="
echo ""
echo "Project:  $PROJECT"
echo "Region:   $REGION"
echo "Domain:   $DOMAIN"
echo ""

# =============================================================================
# Step 1: Reserve a static external IP address
# =============================================================================
echo "--- Step 1: Static IP address ---"

if address_exists "$STATIC_IP"; then
  echo "  [SKIP] Static IP '$STATIC_IP' already exists."
else
  echo "  [CREATE] Reserving static IP '$STATIC_IP'..."
  gcloud compute addresses create "$STATIC_IP" \
    --ip-version=IPV4 \
    --global \
    --project="$PROJECT"
fi

EXTERNAL_IP=$(gcloud compute addresses describe "$STATIC_IP" \
  --global --project="$PROJECT" --format="get(address)")
echo "  External IP: $EXTERNAL_IP"
echo ""

# =============================================================================
# Step 2: Create Cloud Armor security policy
# =============================================================================
echo "--- Step 2: Cloud Armor security policy ---"

if security_policy_exists "$SECURITY_POLICY"; then
  echo "  [SKIP] Security policy '$SECURITY_POLICY' already exists."
else
  echo "  [CREATE] Creating security policy '$SECURITY_POLICY'..."
  gcloud compute security-policies create "$SECURITY_POLICY" \
    --description="WAF policy for VerifyMyProvider" \
    --project="$PROJECT"
fi
echo ""

# =============================================================================
# Step 3: Add WAF rules to the security policy
# =============================================================================
echo "--- Step 3: WAF rules ---"

# Rule 1000: Block SQL injection
if security_rule_exists 1000 "$SECURITY_POLICY"; then
  echo "  [SKIP] Rule 1000 (SQLi) already exists."
else
  echo "  [CREATE] Rule 1000: Block SQL injection (sqli-v33-stable)..."
  gcloud compute security-policies rules create 1000 \
    --security-policy="$SECURITY_POLICY" \
    --expression="evaluatePreconfiguredWaf('sqli-v33-stable')" \
    --action=deny-403 \
    --description="Block SQL injection attacks" \
    --project="$PROJECT"
fi

# Rule 1001: Block XSS
if security_rule_exists 1001 "$SECURITY_POLICY"; then
  echo "  [SKIP] Rule 1001 (XSS) already exists."
else
  echo "  [CREATE] Rule 1001: Block XSS (xss-v33-stable)..."
  gcloud compute security-policies rules create 1001 \
    --security-policy="$SECURITY_POLICY" \
    --expression="evaluatePreconfiguredWaf('xss-v33-stable')" \
    --action=deny-403 \
    --description="Block cross-site scripting attacks" \
    --project="$PROJECT"
fi

# Rule 1002: Block remote code execution
if security_rule_exists 1002 "$SECURITY_POLICY"; then
  echo "  [SKIP] Rule 1002 (RCE) already exists."
else
  echo "  [CREATE] Rule 1002: Block RCE (rce-v33-stable)..."
  gcloud compute security-policies rules create 1002 \
    --security-policy="$SECURITY_POLICY" \
    --expression="evaluatePreconfiguredWaf('rce-v33-stable')" \
    --action=deny-403 \
    --description="Block remote code execution attacks" \
    --project="$PROJECT"
fi

# Rule 2000: Rate limiting (100 req/min per IP, ban for 5 minutes)
if security_rule_exists 2000 "$SECURITY_POLICY"; then
  echo "  [SKIP] Rule 2000 (rate limit) already exists."
else
  echo "  [CREATE] Rule 2000: Rate limit (100 req/min, 5-min ban)..."
  gcloud compute security-policies rules create 2000 \
    --security-policy="$SECURITY_POLICY" \
    --src-ip-ranges="*" \
    --action=rate-based-ban \
    --rate-limit-threshold-count=100 \
    --rate-limit-threshold-interval-sec=60 \
    --ban-duration-sec=300 \
    --conform-action=allow \
    --exceed-action=deny-429 \
    --enforce-on-key=IP \
    --description="Rate limit: 100 req/min per IP, ban 5 minutes" \
    --project="$PROJECT"
fi

echo ""

# =============================================================================
# Step 4: Create serverless NEGs for Cloud Run services
# =============================================================================
echo "--- Step 4: Serverless Network Endpoint Groups ---"

if neg_exists "$BACKEND_NEG"; then
  echo "  [SKIP] NEG '$BACKEND_NEG' already exists."
else
  echo "  [CREATE] NEG '$BACKEND_NEG' → Cloud Run '$BACKEND_SERVICE'..."
  gcloud compute network-endpoint-groups create "$BACKEND_NEG" \
    --region="$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$BACKEND_SERVICE" \
    --project="$PROJECT"
fi

if neg_exists "$FRONTEND_NEG"; then
  echo "  [SKIP] NEG '$FRONTEND_NEG' already exists."
else
  echo "  [CREATE] NEG '$FRONTEND_NEG' → Cloud Run '$FRONTEND_SERVICE'..."
  gcloud compute network-endpoint-groups create "$FRONTEND_NEG" \
    --region="$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$FRONTEND_SERVICE" \
    --project="$PROJECT"
fi

echo ""

# =============================================================================
# Step 5: Create backend services and attach NEGs + Cloud Armor
# =============================================================================
echo "--- Step 5: Backend services ---"

# Backend API backend service
if backend_service_exists "$BACKEND_BACKEND_SVC"; then
  echo "  [SKIP] Backend service '$BACKEND_BACKEND_SVC' already exists."
else
  echo "  [CREATE] Backend service '$BACKEND_BACKEND_SVC'..."
  gcloud compute backend-services create "$BACKEND_BACKEND_SVC" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --protocol=HTTPS \
    --project="$PROJECT"

  echo "  [ATTACH] Adding NEG '$BACKEND_NEG' to '$BACKEND_BACKEND_SVC'..."
  gcloud compute backend-services add-backend "$BACKEND_BACKEND_SVC" \
    --global \
    --network-endpoint-group="$BACKEND_NEG" \
    --network-endpoint-group-region="$REGION" \
    --project="$PROJECT"

  echo "  [ATTACH] Applying Cloud Armor policy to '$BACKEND_BACKEND_SVC'..."
  gcloud compute backend-services update "$BACKEND_BACKEND_SVC" \
    --global \
    --security-policy="$SECURITY_POLICY" \
    --project="$PROJECT"
fi

# Frontend backend service
if backend_service_exists "$FRONTEND_BACKEND_SVC"; then
  echo "  [SKIP] Backend service '$FRONTEND_BACKEND_SVC' already exists."
else
  echo "  [CREATE] Backend service '$FRONTEND_BACKEND_SVC'..."
  gcloud compute backend-services create "$FRONTEND_BACKEND_SVC" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --protocol=HTTPS \
    --project="$PROJECT"

  echo "  [ATTACH] Adding NEG '$FRONTEND_NEG' to '$FRONTEND_BACKEND_SVC'..."
  gcloud compute backend-services add-backend "$FRONTEND_BACKEND_SVC" \
    --global \
    --network-endpoint-group="$FRONTEND_NEG" \
    --network-endpoint-group-region="$REGION" \
    --project="$PROJECT"

  echo "  [ATTACH] Applying Cloud Armor policy to '$FRONTEND_BACKEND_SVC'..."
  gcloud compute backend-services update "$FRONTEND_BACKEND_SVC" \
    --global \
    --security-policy="$SECURITY_POLICY" \
    --project="$PROJECT"
fi

echo ""

# =============================================================================
# Step 6: Create URL map (routing rules)
# =============================================================================
# Frontend is the default. Backend is routed via /api/* path.
# =============================================================================
echo "--- Step 6: URL map ---"

if url_map_exists "$URL_MAP"; then
  echo "  [SKIP] URL map '$URL_MAP' already exists."
else
  echo "  [CREATE] URL map '$URL_MAP'..."
  echo "    Default: $FRONTEND_BACKEND_SVC"
  echo "    /api/*:  $BACKEND_BACKEND_SVC"

  gcloud compute url-maps create "$URL_MAP" \
    --default-service="$FRONTEND_BACKEND_SVC" \
    --project="$PROJECT"

  # Add path matcher to route /api/* to the backend service
  gcloud compute url-maps add-path-matcher "$URL_MAP" \
    --path-matcher-name="api-matcher" \
    --default-service="$FRONTEND_BACKEND_SVC" \
    --path-rules="/api/*=$BACKEND_BACKEND_SVC" \
    --project="$PROJECT"
fi

echo ""

# =============================================================================
# Step 7: Create Google-managed SSL certificate
# =============================================================================
echo "--- Step 7: SSL certificate ---"

if ssl_cert_exists "$SSL_CERT"; then
  echo "  [SKIP] SSL certificate '$SSL_CERT' already exists."
else
  echo "  [CREATE] Google-managed SSL cert for $DOMAIN, www.$DOMAIN..."
  gcloud compute ssl-certificates create "$SSL_CERT" \
    --domains="$DOMAIN,www.$DOMAIN" \
    --global \
    --project="$PROJECT"
  echo "  NOTE: Certificate will not become ACTIVE until DNS points to $EXTERNAL_IP"
fi

echo ""

# =============================================================================
# Step 8: Create HTTPS target proxy
# =============================================================================
echo "--- Step 8: HTTPS target proxy ---"

if target_proxy_exists "$HTTPS_PROXY"; then
  echo "  [SKIP] HTTPS proxy '$HTTPS_PROXY' already exists."
else
  echo "  [CREATE] HTTPS proxy '$HTTPS_PROXY'..."
  gcloud compute target-https-proxies create "$HTTPS_PROXY" \
    --ssl-certificates="$SSL_CERT" \
    --url-map="$URL_MAP" \
    --project="$PROJECT"
fi

echo ""

# =============================================================================
# Step 9: Create HTTP target proxy (for HTTP→HTTPS redirect)
# =============================================================================
echo "--- Step 9: HTTP→HTTPS redirect ---"

# Create a URL map that redirects all HTTP traffic to HTTPS
HTTP_REDIRECT_MAP="verifymyprovider-http-redirect"

if url_map_exists "$HTTP_REDIRECT_MAP"; then
  echo "  [SKIP] HTTP redirect URL map already exists."
else
  echo "  [CREATE] HTTP→HTTPS redirect URL map..."
  gcloud compute url-maps import "$HTTP_REDIRECT_MAP" \
    --source=/dev/stdin \
    --project="$PROJECT" <<'YAML'
name: verifymyprovider-http-redirect
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
YAML
fi

if target_http_proxy_exists "$HTTP_PROXY"; then
  echo "  [SKIP] HTTP proxy '$HTTP_PROXY' already exists."
else
  echo "  [CREATE] HTTP proxy '$HTTP_PROXY'..."
  gcloud compute target-http-proxies create "$HTTP_PROXY" \
    --url-map="$HTTP_REDIRECT_MAP" \
    --project="$PROJECT"
fi

echo ""

# =============================================================================
# Step 10: Create global forwarding rules (bind IP to proxies)
# =============================================================================
echo "--- Step 10: Forwarding rules ---"

# HTTPS (port 443)
if forwarding_rule_exists "$FORWARDING_RULE"; then
  echo "  [SKIP] HTTPS forwarding rule '$FORWARDING_RULE' already exists."
else
  echo "  [CREATE] HTTPS forwarding rule (port 443)..."
  gcloud compute forwarding-rules create "$FORWARDING_RULE" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --target-https-proxy="$HTTPS_PROXY" \
    --address="$STATIC_IP" \
    --ports=443 \
    --project="$PROJECT"
fi

# HTTP (port 80) — redirects to HTTPS
if forwarding_rule_exists "$HTTP_FORWARDING_RULE"; then
  echo "  [SKIP] HTTP forwarding rule '$HTTP_FORWARDING_RULE' already exists."
else
  echo "  [CREATE] HTTP forwarding rule (port 80 → HTTPS redirect)..."
  gcloud compute forwarding-rules create "$HTTP_FORWARDING_RULE" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --target-http-proxy="$HTTP_PROXY" \
    --address="$STATIC_IP" \
    --ports=80 \
    --project="$PROJECT"
fi

echo ""

# =============================================================================
# Done — print summary and next steps
# =============================================================================
echo "============================================="
echo "  Setup Complete"
echo "============================================="
echo ""
echo "External IP address: $EXTERNAL_IP"
echo ""
echo "--- DNS Configuration ---"
echo ""
echo "Update your DNS records for $DOMAIN:"
echo ""
echo "  Type  Name   Value"
echo "  ----  -----  -----"
echo "  A     @      $EXTERNAL_IP"
echo "  A     www    $EXTERNAL_IP"
echo ""
echo "If using Cloudflare, set the proxy status to 'DNS only' (gray cloud)"
echo "so traffic goes through Google's LB, not Cloudflare's."
echo ""
echo "--- SSL Certificate ---"
echo ""
echo "The Google-managed SSL certificate will begin provisioning once DNS"
echo "records point to $EXTERNAL_IP. This typically takes 15-30 minutes"
echo "but can take up to 24 hours."
echo ""
echo "Check certificate status:"
echo "  gcloud compute ssl-certificates describe $SSL_CERT --global --project=$PROJECT"
echo ""
echo "--- Post-Setup: Lock Down Cloud Run (IMPORTANT) ---"
echo ""
echo "Once you have verified that traffic flows correctly through the LB,"
echo "remove direct public access to prevent bypassing Cloud Armor:"
echo ""
echo "  # 1. Remove --allow-unauthenticated from Cloud Run services:"
echo "  gcloud run services update $BACKEND_SERVICE --region=$REGION --no-allow-unauthenticated --project=$PROJECT"
echo "  gcloud run services update $FRONTEND_SERVICE --region=$REGION --no-allow-unauthenticated --project=$PROJECT"
echo ""
echo "  # 2. Grant the LB service account permission to invoke Cloud Run:"
echo "  gcloud run services add-iam-policy-binding $BACKEND_SERVICE \\"
echo "    --region=$REGION --member='serviceAccount:service-\$(gcloud projects describe $PROJECT --format=\"value(projectNumber)\")@gcp-sa-cloud-armor.iam.gserviceaccount.com' \\"
echo "    --role='roles/run.invoker' --project=$PROJECT"
echo "  gcloud run services add-iam-policy-binding $FRONTEND_SERVICE \\"
echo "    --region=$REGION --member='serviceAccount:service-\$(gcloud projects describe $PROJECT --format=\"value(projectNumber)\")@gcp-sa-cloud-armor.iam.gserviceaccount.com' \\"
echo "    --role='roles/run.invoker' --project=$PROJECT"
echo ""
echo "  # 3. Update deploy.yml FRONTEND_URL secret to use https://$DOMAIN"
echo "  #    instead of the Cloud Run *.run.app URL."
echo ""
echo "--- Verify Cloud Armor is working ---"
echo ""
echo "  # Check that WAF rules are applied:"
echo "  gcloud compute security-policies describe $SECURITY_POLICY --project=$PROJECT"
echo ""
echo "  # Test with a SQLi probe (should return 403):"
echo "  curl -s -o /dev/null -w '%{http_code}' 'https://$DOMAIN/?id=1%27%20OR%201%3D1--'"
echo ""
echo "  # View Cloud Armor logs:"
echo "  gcloud logging read 'resource.type=\"http_load_balancer\" AND jsonPayload.enforcedSecurityPolicy.name=\"$SECURITY_POLICY\"' --project=$PROJECT --limit=10"
echo ""
