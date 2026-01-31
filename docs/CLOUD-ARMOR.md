# Cloud Armor WAF Configuration

This document explains the Cloud Armor Web Application Firewall (WAF) configuration for VerifyMyProvider.

## Overview

Cloud Armor provides:
- **DDoS Protection**: Automatic protection against volumetric attacks
- **WAF Rules**: OWASP ModSecurity Core Rule Set v3.3
- **Rate Limiting**: Edge-based rate limiting before traffic reaches Cloud Run
- **Geo-blocking**: Optional country-based access control
- **IP Management**: Allowlists and blocklists

## Architecture

```
Internet → Cloud Armor → Load Balancer → Cloud Run
              ↓
         WAF Rules
         Rate Limits
         DDoS Protection
```

Cloud Armor sits at the edge of Google's network, filtering malicious traffic before it reaches your application.

## WAF Rules

### OWASP Protection Rules

| Priority | Rule | Description |
|----------|------|-------------|
| 1000 | XSS Protection | Blocks cross-site scripting attempts |
| 1001 | SQL Injection | Blocks SQL injection payloads |
| 1002 | RCE Protection | Blocks remote code execution attempts |
| 1003 | LFI Protection | Blocks local file inclusion attempts |
| 1004 | RFI Protection | Blocks remote file inclusion attempts |
| 1005 | Scanner Detection | Blocks automated vulnerability scanners |
| 1006 | Protocol Attack | Blocks HTTP protocol attacks |
| 1007 | Session Fixation | Blocks session fixation attempts |

### Rate Limiting Rule

| Priority | Rule | Description |
|----------|------|-------------|
| 2000 | Rate Limit | 1000 requests/minute per IP, 10-minute ban if exceeded |

### Default Rule

| Priority | Rule | Description |
|----------|------|-------------|
| 2147483647 | Default | Allow all traffic not matching other rules |

## Viewing Blocked Requests

### Using the Script

```bash
./scripts/setup-cloud-armor.sh logs
```

### Using Cloud Console

1. Go to **Cloud Logging** in GCP Console
2. Use this filter:
   ```
   resource.type="http_load_balancer"
   jsonPayload.enforcedSecurityPolicy.outcome="DENY"
   ```

### Using gcloud

```bash
gcloud logging read '
  resource.type="http_load_balancer"
  jsonPayload.enforcedSecurityPolicy.outcome="DENY"
' --limit=50 --format="table(
  timestamp,
  jsonPayload.enforcedSecurityPolicy.matchedRulePriority,
  httpRequest.remoteIp,
  httpRequest.requestUrl
)"
```

### Log Fields

| Field | Description |
|-------|-------------|
| `enforcedSecurityPolicy.name` | Policy that blocked the request |
| `enforcedSecurityPolicy.matchedRulePriority` | Which rule triggered |
| `enforcedSecurityPolicy.outcome` | DENY or ACCEPT |
| `httpRequest.remoteIp` | Client IP address |
| `httpRequest.requestUrl` | Requested URL |
| `httpRequest.userAgent` | User agent string |

## IP Management

### Add IP to Blocklist

```bash
# Block a single IP
./scripts/setup-cloud-armor.sh add-ip-block 1.2.3.4

# Block with custom priority (lower = higher priority)
./scripts/setup-cloud-armor.sh add-ip-block 1.2.3.4 300

# Block a CIDR range
./scripts/setup-cloud-armor.sh add-ip-block 1.2.3.0/24
```

### Add IP to Allowlist

```bash
# Allowlist an IP (bypasses all WAF rules)
./scripts/setup-cloud-armor.sh add-ip-allow 5.6.7.8

# Allowlist with custom priority
./scripts/setup-cloud-armor.sh add-ip-allow 5.6.7.8 50
```

### Remove IP Rules

```bash
# List all rules to find the priority
gcloud compute security-policies rules list --security-policy=verifymyprovider-waf

# Delete a rule by priority
gcloud compute security-policies rules delete PRIORITY --security-policy=verifymyprovider-waf
```

### Common Allowlist Scenarios

```bash
# Allowlist your office IP
./scripts/setup-cloud-armor.sh add-ip-allow 203.0.113.50 100

# Allowlist CI/CD system
./scripts/setup-cloud-armor.sh add-ip-allow 35.192.0.0/12 101

# Allowlist monitoring service
./scripts/setup-cloud-armor.sh add-ip-allow 8.8.8.8 102
```

## Geo-blocking

### Block All Non-US Traffic

```bash
gcloud compute security-policies rules create 3000 \
  --security-policy=verifymyprovider-waf \
  --expression="origin.region_code != 'US'" \
  --action=deny-403 \
  --description="US only access"
```

### Allow Only Specific Countries

```bash
gcloud compute security-policies rules create 3000 \
  --security-policy=verifymyprovider-waf \
  --expression="!(origin.region_code in ['US', 'CA', 'GB'])" \
  --action=deny-403 \
  --description="Allow US, Canada, UK only"
```

### Block Specific Countries

```bash
gcloud compute security-policies rules create 3000 \
  --security-policy=verifymyprovider-waf \
  --expression="origin.region_code in ['CN', 'RU', 'KP']" \
  --action=deny-403 \
  --description="Block specific countries"
```

## Temporarily Disabling Rules

### Disable a Rule for Debugging

```bash
# Disable XSS rule (priority 1000)
./scripts/setup-cloud-armor.sh disable-rule 1000

# Re-enable when done
./scripts/setup-cloud-armor.sh enable-rule 1000
```

### Switch Rule to Preview Mode

Preview mode logs matches but doesn't block:

```bash
gcloud compute security-policies rules update 1000 \
  --security-policy=verifymyprovider-waf \
  --action=allow \
  --preview
```

### Disable All WAF Rules Temporarily

```bash
# Set all rules to preview mode
for priority in 1000 1001 1002 1003 1004 1005 1006 1007; do
  gcloud compute security-policies rules update $priority \
    --security-policy=verifymyprovider-waf \
    --action=allow \
    --quiet
done

# Re-enable all rules
for priority in 1000 1001 1002 1003 1004 1005 1006 1007; do
  gcloud compute security-policies rules update $priority \
    --security-policy=verifymyprovider-waf \
    --action=deny-403 \
    --quiet
done
```

## Cost Breakdown

### Monthly Costs (Estimated)

| Component | Cost |
|-----------|------|
| Security Policy | $5/month |
| Rules (8 rules) | $8/month |
| Request Evaluation | $0.75 per million |
| Adaptive Protection | $0.10 per million (optional) |
| Load Balancer | ~$18/month (forwarding rule) |

### Example: 1 Million Requests/Month

- Security Policy: $5
- Rules: $8
- Requests: $0.75
- Load Balancer: $18
- **Total: ~$32/month**

### Example: 10 Million Requests/Month

- Security Policy: $5
- Rules: $8
- Requests: $7.50
- Load Balancer: $18
- **Total: ~$39/month**

## Monitoring Dashboard

### Create Custom Dashboard

1. Go to **Cloud Monitoring** → **Dashboards** → **Create Dashboard**
2. Add the following widgets:

#### Widget 1: Blocked Requests by Rule

```
Metric: loadbalancing.googleapis.com/https/request_count
Filter: matched_rule_priority != "2147483647" AND outcome = "denied"
Group by: matched_rule_priority
```

#### Widget 2: Top Blocked IPs

Use Cloud Logging query:
```
resource.type="http_load_balancer"
jsonPayload.enforcedSecurityPolicy.outcome="DENY"
| SELECT httpRequest.remoteIp, COUNT(*) as blocked_count
| GROUP BY httpRequest.remoteIp
| ORDER BY blocked_count DESC
| LIMIT 10
```

#### Widget 3: Geographic Distribution

```
Metric: loadbalancing.googleapis.com/https/request_count
Group by: client_country
```

### Create Alert for Attack Detection

```bash
gcloud alpha monitoring policies create \
  --display-name="High WAF Block Rate" \
  --condition-display-name="Blocked requests spike" \
  --condition-filter='
    metric.type="loadbalancing.googleapis.com/https/request_count"
    resource.type="https_lb_rule"
    metric.labels.response_code_class="400"
  ' \
  --condition-threshold-value=1000 \
  --condition-threshold-duration=300s \
  --notification-channels=YOUR_CHANNEL_ID
```

## Troubleshooting

### Common Issues

#### 1. Legitimate Requests Being Blocked

**Symptoms**: Users report 403 errors
**Diagnosis**:
```bash
./scripts/setup-cloud-armor.sh logs
```

**Solutions**:
- Add IP to allowlist
- Disable specific rule temporarily
- Adjust rule sensitivity

#### 2. SSL Certificate Not Provisioning

**Symptoms**: HTTPS not working
**Diagnosis**:
```bash
gcloud compute ssl-certificates describe verifymyprovider-ssl-cert
```

**Solutions**:
- Verify DNS A record points to load balancer IP
- Wait 15-30 minutes after DNS configuration
- Check certificate status in Cloud Console

#### 3. High False Positive Rate

**Symptoms**: Many legitimate requests blocked
**Solutions**:
1. Switch affected rules to preview mode
2. Analyze blocked requests for patterns
3. Add path-based exceptions:
```bash
gcloud compute security-policies rules update 1001 \
  --security-policy=verifymyprovider-waf \
  --expression="evaluatePreconfiguredExpr('sqli-v33-stable') && !request.path.matches('/api/v1/search.*')"
```

#### 4. Rate Limiting Too Aggressive

**Symptoms**: Legitimate users being banned
**Solutions**:
```bash
# Increase rate limit
gcloud compute security-policies rules update 2000 \
  --security-policy=verifymyprovider-waf \
  --rate-limit-threshold-count=2000 \
  --rate-limit-threshold-interval-sec=60
```

### Debug Mode

To see what rules match without blocking:

```bash
# Set all rules to preview
gcloud compute security-policies update verifymyprovider-waf \
  --log-level=VERBOSE

# Check logs for rule matches
gcloud logging read '
  resource.type="http_load_balancer"
  jsonPayload.enforcedSecurityPolicy.configuredAction="DENY"
' --limit=20
```

## Recovery Procedures

### Complete Rollback

If Cloud Armor is causing issues:

```bash
# Option 1: Detach policy from backend
gcloud compute backend-services update verifymyprovider-backend-service \
  --global \
  --no-security-policy

# Option 2: Switch Cloud Run back to direct access
gcloud run services update verifymyprovider-backend \
  --region=us-central1 \
  --ingress=all

# Option 3: Full cleanup
./scripts/setup-cloud-armor.sh cleanup
```

### Emergency: Disable All Protection

```bash
# Delete all deny rules, keeping only the default allow
for priority in 1000 1001 1002 1003 1004 1005 1006 1007 2000; do
  gcloud compute security-policies rules delete $priority \
    --security-policy=verifymyprovider-waf \
    --quiet
done
```

## Best Practices

1. **Start in Preview Mode**: Deploy rules in preview mode first to analyze impact
2. **Monitor Logs**: Regularly review blocked requests for false positives
3. **Gradual Rollout**: Enable rules one at a time in production
4. **Document Exceptions**: Keep a record of all IP allowlists and rule modifications
5. **Regular Review**: Periodically review and update rules based on threat landscape
6. **Test Recovery**: Practice rollback procedures before needing them

## Related Documentation

- [Cloud Armor Documentation](https://cloud.google.com/armor/docs)
- [OWASP ModSecurity CRS](https://owasp.org/www-project-modsecurity-core-rule-set/)
- [Cloud Load Balancing](https://cloud.google.com/load-balancing/docs)
- [Security Policy Language Reference](https://cloud.google.com/armor/docs/rules-language-reference)
