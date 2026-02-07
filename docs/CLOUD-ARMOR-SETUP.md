# Cloud Armor WAF Deployment Guide

Comprehensive setup guide for Google Cloud Armor on the VerifyMyProvider production environment.

**Script location:** `packages/backend/scripts/setup-cloud-armor.sh`

---

## 1. Prerequisites

### Required GCP IAM Permissions

The account running the script needs these permissions (or the **Compute Security Admin** role):

| Permission | Why |
|---|---|
| `compute.securityPolicies.create` | Create WAF security policies |
| `compute.securityPolicies.delete` | Cleanup / recreate policies |
| `compute.securityPolicies.update` | Attach policies, enable adaptive protection |
| `compute.securityPolicies.list` | Check current state |
| `compute.backendServices.create` | Create backend service for the load balancer |
| `compute.backendServices.update` | Attach security policy to backend |
| `compute.urlMaps.create` | Create URL map for load balancer |
| `compute.targetHttpsProxies.create` | Create HTTPS proxy |
| `compute.globalForwardingRules.create` | Create forwarding rule (LB entry point) |
| `compute.sslCertificates.create` | Provision managed SSL certificate |
| `compute.globalAddresses.create` | Reserve static IP |
| `compute.networkEndpointGroups.create` | Create serverless NEG for Cloud Run |
| `run.services.get` | Verify Cloud Run service exists |
| `serviceusage.services.enable` | Enable required GCP APIs |

**Recommended:** Assign the `roles/compute.securityAdmin` and `roles/compute.loadBalancerAdmin` roles.

### Required Tools

```bash
# Verify gcloud is installed and authenticated
gcloud version
gcloud auth list

# Verify correct project
gcloud config get-value project
```

### Cost Estimate

| Component | Monthly Cost |
|---|---|
| Security policy (1 policy) | $5.00 |
| WAF rules (10 rules) | $10.00 |
| Global external load balancer (forwarding rule) | ~$18.00 |
| Request evaluation (per 1M requests) | $0.75 |
| Adaptive protection (per 1M requests) | $0.10 |
| **Total (at ~1M requests/month)** | **~$34/month** |
| **Total (at ~100K requests/month)** | **~$34/month** (minimums dominate) |

The load balancer forwarding rule is the largest fixed cost. Cloud Armor's per-request charges are negligible at launch-scale traffic. For comparison, this is less than the Cloud SQL instance.

---

## 2. What the Script Configures

The script creates a defense-in-depth WAF with three categories of rules:

### OWASP WAF Rules (Priorities 1000-1008)

These use Google's preconfigured ModSecurity Core Rule Set v3.3 expressions and custom patterns. All return **403 Forbidden** when triggered.

| Priority | Rule | Expression | What It Blocks |
|---|---|---|---|
| 1000 | **XSS Protection** | `xss-v33-stable` | Cross-site scripting payloads in URLs, headers, and bodies. Catches `<script>`, event handlers, javascript: URIs, etc. |
| 1001 | **SQL Injection** | `sqli-v33-stable` | SQL injection patterns like `' OR 1=1`, `UNION SELECT`, `; DROP TABLE`, etc. |
| 1002 | **RCE Protection** | `rce-v33-stable` | Remote code execution attempts — shell commands, OS command injection |
| 1003 | **LFI Protection** | `lfi-v33-stable` | Local file inclusion — `../../etc/passwd`, path traversal attacks |
| 1004 | **RFI Protection** | `rfi-v33-stable` | Remote file inclusion — attempts to include external malicious files |
| 1005 | **Scanner Detection** | `scannerdetection-v33-stable` | Known vulnerability scanners: Nikto, sqlmap, Nessus, Acunetix, etc. |
| 1006 | **Protocol Attack** | `protocolattack-v33-stable` | HTTP protocol abuse — header injection, request smuggling, response splitting |
| 1007 | **Session Fixation** | `sessionfixation-v33-stable` | Session fixation attempts via cookies or URL parameters |
| 1008 | **Bot/Crawler Blocking** | Custom UA regex | Mass-scraping bots and aggressive crawlers: masscan, zgrab, gobuster, nuclei, shodan, SEO bots (AhrefsBot, MJ12bot, DotBot, etc.) |

### Rate Limiting (Priority 2000)

| Priority | Rule | Config |
|---|---|---|
| 2000 | **Edge Rate Limit** | 100 requests/minute per IP. Exceeding triggers a 10-minute ban (429 Too Many Requests). |

### Geographic Restriction (Priority 3000) — Commented Out

| Priority | Rule | Config |
|---|---|---|
| 3000 | **US-Only Access** | Blocks all traffic from outside the US. Commented out for the NYC-first launch — enable when ready. |

### Adaptive Protection

The script enables **Cloud Armor Adaptive Protection**, which uses ML models to detect and alert on anomalous traffic patterns (L7 DDoS attacks). This runs in STANDARD visibility mode.

### Default Rule (Priority 2147483647)

All traffic not matching any rule above is **allowed**. This is the default Cloud Armor behavior.

### How Edge Rate Limiting Complements Application-Level Limits

The system uses two layers of rate limiting that serve different purposes:

```
Internet → Cloud Armor (100 req/min/IP) → Cloud Run → Express Rate Limiter
                  ↑                                          ↑
           Edge / network layer                     Application layer
           Catches volumetric abuse                 Per-endpoint granularity
           Blocks before Cloud Run                  Runs after middleware
           Single threshold                         Tiered by sensitivity
```

| Layer | Location | Limits | Purpose |
|---|---|---|---|
| **Cloud Armor** | Google's edge network | 100 req/min per IP (all endpoints) | Block bulk scraping, DDoS, credential stuffing before it reaches your service. Saves Cloud Run costs. |
| **Express `defaultRateLimiter`** | Application process | 200 req/hr per IP | General API abuse on read endpoints |
| **Express `searchRateLimiter`** | Application process | 100 req/hr per IP | Search endpoint abuse |
| **Express `verificationRateLimiter`** | Application process | 10 req/hr per IP | Anti-Sybil on write endpoints |
| **Express `voteRateLimiter`** | Application process | 10 req/hr per IP | Anti-Sybil on vote endpoints |
| **CAPTCHA fallback limiter** | Application process | 3 req/hr per IP | Engaged only when reCAPTCHA API is unreachable |

A legitimate user browsing providers might make 20-30 requests/minute at peak — well under Cloud Armor's 100/min threshold but still tracked by Express for hourly endpoint budgets.

---

## 3. Pre-Deployment Checklist

Verify every item before running the script:

- [ ] **Backend Cloud Run service name** matches script default: `verifymyprovider-backend`
  ```bash
  gcloud run services list --region=us-central1 --format="value(metadata.name)"
  ```
- [ ] **GCP project ID** is correct:
  ```bash
  gcloud config get-value project
  # Expected: your verifymyprovider project ID
  ```
- [ ] **Region** matches Cloud Run deployment: `us-central1`
- [ ] **Domain** is ready (if setting up HTTPS): DNS can be updated to point to the new static IP
- [ ] **Rate limit threshold** (100 req/min) is appropriate for expected launch traffic
  - If you expect legitimate API consumers making >100 req/min, increase this
- [ ] **Required APIs** are enabled (the script enables them, but verify):
  ```bash
  gcloud services list --enabled --filter="NAME:(compute.googleapis.com OR run.googleapis.com)"
  ```
- [ ] **Budget alert** is set in GCP Billing to catch unexpected cost spikes
- [ ] **Existing Cloud Armor policy** does not already exist (or you're okay recreating it):
  ```bash
  gcloud compute security-policies list
  ```

---

## 4. Execution Instructions

### Full Setup (Recommended for First Time)

```bash
# 1. Navigate to the backend package
cd packages/backend

# 2. Make the script executable
chmod +x scripts/setup-cloud-armor.sh

# 3. Set required environment variables
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export DOMAIN="verifymyprovider.com"          # Optional — omit for HTTP-only
export SERVICE_NAME="verifymyprovider-backend" # Default, change if different

# 4. Run the full setup
./scripts/setup-cloud-armor.sh full
```

The `full` command runs three steps in order:
1. **create-policy** — Creates the security policy with all WAF rules
2. **create-lb** — Creates load balancer infrastructure (static IP, NEG, backend service, URL map, SSL cert, HTTPS proxy, forwarding rule)
3. **attach** — Attaches the security policy to the backend service

### Step-by-Step Setup (For More Control)

```bash
# Check current state first
./scripts/setup-cloud-armor.sh check

# Create just the security policy (no load balancer)
./scripts/setup-cloud-armor.sh create-policy

# Create load balancer infrastructure
./scripts/setup-cloud-armor.sh create-lb

# Attach security policy to the backend
./scripts/setup-cloud-armor.sh attach
```

### After Setup: Restrict Cloud Run Ingress

Once the load balancer is confirmed working, restrict Cloud Run to only accept traffic through the load balancer (not directly via its `.run.app` URL):

```bash
gcloud run services update verifymyprovider-backend \
  --region=us-central1 \
  --ingress=internal-and-cloud-load-balancing
```

> **Warning:** Only run this after confirming the load balancer + Cloud Armor path is working. If you lock down ingress before the LB is ready, the backend becomes unreachable.

### Enable Geographic Restriction (Optional)

To enable US-only access after launch:

1. Edit `scripts/setup-cloud-armor.sh`
2. Uncomment the `gcloud compute security-policies rules create 3000` block (around line 361)
3. Run:
   ```bash
   ./scripts/setup-cloud-armor.sh create-policy
   ```
   Or add the rule directly:
   ```bash
   gcloud compute security-policies rules create 3000 \
     --security-policy=verifymyprovider-waf \
     --expression="origin.region_code != 'US'" \
     --action=deny-403 \
     --description="Geographic restriction: US-only access"
   ```

---

## 5. Post-Deployment Verification

### Verify Cloud Armor Policy is Active

```bash
# Check policy exists and list all rules
./scripts/setup-cloud-armor.sh check

# Or directly:
gcloud compute security-policies describe verifymyprovider-waf

# List rules with priorities
gcloud compute security-policies rules list \
  --security-policy=verifymyprovider-waf \
  --format="table(priority, action, description)"
```

### Verify Policy is Attached to Backend

```bash
gcloud compute backend-services describe verifymyprovider-backend-service \
  --global \
  --format="value(securityPolicy)"
# Should output the full resource path of verifymyprovider-waf
```

### Check Cloud Armor Logs in GCP Console

1. Go to **GCP Console** > **Network Security** > **Cloud Armor**
2. Click on `verifymyprovider-waf`
3. View the **Logs** tab for recent activity
4. Or use **Cloud Logging** with this filter:
   ```
   resource.type="http_load_balancer"
   jsonPayload.enforcedSecurityPolicy.name="verifymyprovider-waf"
   ```

### Test That Rules Are Working

Run the built-in verification tests:

```bash
./scripts/setup-cloud-armor.sh verify
```

Or test manually with curl:

```bash
# Replace with your load balancer IP or domain
LB_URL="https://verifymyprovider.com"

# Test 1: Normal request — should return 200
curl -s -o /dev/null -w "Normal request: HTTP %{http_code}\n" "$LB_URL/health"

# Test 2: XSS attempt — should return 403
curl -s -o /dev/null -w "XSS attempt: HTTP %{http_code}\n" \
  "$LB_URL/?q=<script>alert('xss')</script>"

# Test 3: SQL injection — should return 403
curl -s -o /dev/null -w "SQLi attempt: HTTP %{http_code}\n" \
  "$LB_URL/?id=1'%20OR%20'1'='1"

# Test 4: Scanner UA — should return 403
curl -s -o /dev/null -w "Scanner UA: HTTP %{http_code}\n" \
  -H "User-Agent: sqlmap/1.6" "$LB_URL/health"

# Test 5: Bot UA — should return 403
curl -s -o /dev/null -w "Bot UA: HTTP %{http_code}\n" \
  -H "User-Agent: Mozilla/5.0 (compatible; AhrefsBot/7.0)" "$LB_URL/health"

# Test 6: Rate limit (send 110 requests rapidly) — last requests should return 429
for i in $(seq 1 110); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$LB_URL/health")
  if [ "$code" != "200" ]; then
    echo "Request $i: HTTP $code (rate limited)"
    break
  fi
done
```

### Check SSL Certificate Status

```bash
gcloud compute ssl-certificates describe verifymyprovider-ssl-cert \
  --format="table(name, type, managed.status, managed.domainStatus)"
```

SSL provisioning takes 15-30 minutes after DNS is pointed to the static IP.

---

## 6. Rollback Instructions

### Option A: Detach Policy (Keep LB, Remove WAF)

Stops Cloud Armor from filtering traffic but keeps the load balancer running:

```bash
gcloud compute backend-services update verifymyprovider-backend-service \
  --global \
  --no-security-policy
```

To reattach later:
```bash
./scripts/setup-cloud-armor.sh attach
```

### Option B: Bypass LB Entirely (Direct Cloud Run Access)

Reverts to direct Cloud Run access, bypassing both the load balancer and Cloud Armor:

```bash
gcloud run services update verifymyprovider-backend \
  --region=us-central1 \
  --ingress=all
```

Then update DNS to point back to the Cloud Run URL (or use the `.run.app` domain).

### Option C: Disable Individual Rules

If a specific rule is causing false positives:

```bash
# Disable a single rule (changes action to allow)
./scripts/setup-cloud-armor.sh disable-rule 1000   # e.g., disable XSS rule

# Re-enable when done investigating
./scripts/setup-cloud-armor.sh enable-rule 1000
```

### Option D: Full Cleanup (Delete Everything)

Removes all Cloud Armor resources, the load balancer, and the static IP:

```bash
./scripts/setup-cloud-armor.sh cleanup
```

This deletes in reverse dependency order: forwarding rule > HTTPS proxy > SSL cert > URL map > backend service > NEG > security policy > static IP.

> **Important:** After cleanup, re-enable direct Cloud Run ingress:
> ```bash
> gcloud run services update verifymyprovider-backend \
>   --region=us-central1 \
>   --ingress=all
> ```

### Emergency: Disable All WAF Rules Without Deleting

```bash
for priority in 1000 1001 1002 1003 1004 1005 1006 1007 1008 2000; do
  gcloud compute security-policies rules update $priority \
    --security-policy=verifymyprovider-waf \
    --action=allow \
    --quiet
done
echo "All WAF rules disabled (changed to allow). Traffic passes through unfiltered."
```

---

## 7. Monitoring

### Cloud Armor Dashboard Setup

1. Go to **GCP Console** > **Monitoring** > **Dashboards** > **Create Dashboard**
2. Add these widgets:

**Widget 1 — Blocked Requests Over Time:**
```
Metric: loadbalancing.googleapis.com/https/request_count
Filter: response_code_class = "400" OR response_code_class = "500"
Group by: matched_rule_priority
Aggregation: Sum, aligned to 1 minute
```

**Widget 2 — Top Blocked IPs (Log-based):**
```
resource.type="http_load_balancer"
jsonPayload.enforcedSecurityPolicy.outcome="DENY"
```

**Widget 3 — Requests by Country:**
```
Metric: loadbalancing.googleapis.com/https/request_count
Group by: client_country
```

**Widget 4 — Rate Limit Triggers:**
```
resource.type="http_load_balancer"
jsonPayload.enforcedSecurityPolicy.matchedRulePriority="2000"
jsonPayload.enforcedSecurityPolicy.outcome="DENY"
```

### Alert Policies

**Alert 1 — High Block Rate (Possible Attack):**

Create an alert when blocked requests exceed 500 in 5 minutes:

```bash
gcloud alpha monitoring policies create \
  --display-name="Cloud Armor: High Block Rate" \
  --condition-display-name="Blocked requests spike" \
  --condition-filter='
    metric.type="loadbalancing.googleapis.com/https/request_count"
    resource.type="https_lb_rule"
    metric.labels.response_code="403"
  ' \
  --condition-threshold-value=500 \
  --condition-threshold-duration=300s \
  --notification-channels=YOUR_CHANNEL_ID
```

**Alert 2 — Rate Limit Triggers (Possible Scraping):**

Alert when 10+ IPs are rate-limited in an hour (sign of distributed scraping):

Use a log-based metric:
```
resource.type="http_load_balancer"
jsonPayload.enforcedSecurityPolicy.matchedRulePriority="2000"
jsonPayload.enforcedSecurityPolicy.outcome="DENY"
```

**Recommended thresholds:**

| Alert | Threshold | Window | Severity |
|---|---|---|---|
| WAF block spike | >500 blocked requests | 5 min | Warning |
| Sustained attack | >5,000 blocked requests | 1 hour | Critical |
| Rate limit saturation | >50 unique IPs rate-limited | 1 hour | Warning |
| Rule false positive rate | >10% of total requests blocked by a single rule | 1 hour | Warning |

### Quick Log Queries

```bash
# View recent blocks
./scripts/setup-cloud-armor.sh logs

# View blocks for a specific rule (e.g., SQLi)
gcloud logging read '
  resource.type="http_load_balancer"
  jsonPayload.enforcedSecurityPolicy.matchedRulePriority="1001"
  jsonPayload.enforcedSecurityPolicy.outcome="DENY"
' --limit=20

# View rate-limited requests
gcloud logging read '
  resource.type="http_load_balancer"
  jsonPayload.enforcedSecurityPolicy.matchedRulePriority="2000"
' --limit=20

# View all requests from a specific IP
gcloud logging read '
  resource.type="http_load_balancer"
  httpRequest.remoteIp="1.2.3.4"
' --limit=50
```

---

## Appendix: Script Command Reference

| Command | Description |
|---|---|
| `./setup-cloud-armor.sh check` | Show current Cloud Armor, backend, and LB status |
| `./setup-cloud-armor.sh create-policy` | Create security policy with all WAF rules |
| `./setup-cloud-armor.sh create-lb` | Create load balancer infrastructure |
| `./setup-cloud-armor.sh attach` | Attach security policy to backend service |
| `./setup-cloud-armor.sh verify` | Run automated WAF verification tests |
| `./setup-cloud-armor.sh logs` | View recent blocked request logs |
| `./setup-cloud-armor.sh add-ip-block <IP>` | Add IP/CIDR to blocklist |
| `./setup-cloud-armor.sh add-ip-allow <IP>` | Add IP/CIDR to allowlist |
| `./setup-cloud-armor.sh disable-rule <PRIORITY>` | Disable a rule (change to allow) |
| `./setup-cloud-armor.sh enable-rule <PRIORITY>` | Re-enable a rule (change to deny-403) |
| `./setup-cloud-armor.sh full` | Run complete setup (policy + LB + attach) |
| `./setup-cloud-armor.sh cleanup` | Delete all Cloud Armor and LB resources |

## Related Documentation

- [`docs/CLOUD-ARMOR.md`](./CLOUD-ARMOR.md) — Operational reference (IP management, geo-blocking, troubleshooting)
- [`docs/RUNBOOK.md`](./RUNBOOK.md) — Production operations runbook
- [`docs/SCALING.md`](./SCALING.md) — Scaling considerations including Redis rate limiting
- [`docs/ENVIRONMENT.md`](./ENVIRONMENT.md) — Environment variable reference
