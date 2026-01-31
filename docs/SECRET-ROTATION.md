# Secret Rotation Procedures

This document outlines the procedures for rotating secrets used by the HealthcareProviderDB application. Regular secret rotation is a security best practice that limits the impact of compromised credentials.

## Table of Contents

- [Overview](#overview)
- [Secret Inventory](#secret-inventory)
- [Rotation Procedures](#rotation-procedures)
  - [ADMIN_SECRET](#admin_secret)
  - [DATABASE_URL](#database_url)
  - [RECAPTCHA Keys](#recaptcha-keys)
  - [REDIS_URL](#redis_url)
- [Emergency Break-Glass Procedure](#emergency-break-glass-procedure)
- [Verification Commands](#verification-commands)
- [Automation](#automation)

---

## Overview

### Why Rotate Secrets?

- **Limit exposure window**: If a secret is compromised, regular rotation limits how long it can be exploited
- **Compliance**: Many security frameworks (SOC 2, HIPAA) require periodic credential rotation
- **Access revocation**: Ensures former employees/contractors lose access over time
- **Audit trail**: Creates a clear history of credential changes

### General Principles

1. **Never delete old secrets immediately** - Keep them disabled for 24-48 hours in case rollback is needed
2. **Test before switching** - Verify new credentials work before disabling old ones
3. **Coordinate deployments** - Some secrets require simultaneous frontend/backend updates
4. **Document everything** - Log who rotated what and when
5. **Use Secret Manager** - Never store secrets in code or environment files

---

## Secret Inventory

| Secret | Location | Rotation Frequency | Owner | Notes |
|--------|----------|-------------------|-------|-------|
| `ADMIN_SECRET` | Secret Manager | Every 90 days | Backend Team | Admin API authentication |
| `DATABASE_URL` | Secret Manager | Every 180 days | Platform Team | PostgreSQL connection string |
| `RECAPTCHA_SECRET_KEY` | Secret Manager | Every 365 days | Backend Team | Server-side reCAPTCHA key |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Secret Manager | Every 365 days | Frontend Team | Client-side reCAPTCHA key |
| `REDIS_URL` | Secret Manager | Every 180 days | Platform Team | Redis connection string |
| `GCP_SERVICE_ACCOUNT_KEY` | IAM | Every 90 days | Platform Team | If using key-based auth |

### Secret Manager Location

All secrets are stored in Google Cloud Secret Manager:

```bash
# List all secrets
gcloud secrets list --project=YOUR_PROJECT_ID

# View secret versions
gcloud secrets versions list SECRET_NAME --project=YOUR_PROJECT_ID
```

---

## Rotation Procedures

### ADMIN_SECRET

The `ADMIN_SECRET` authenticates requests to admin endpoints (`/api/v1/admin/*`).

**Rotation Frequency**: Every 90 days

**Prerequisites**:
- Access to Google Cloud Secret Manager
- Ability to update external systems using this secret (e.g., Cloud Scheduler)

**Procedure**:

```bash
# 1. Generate a new secure secret (32+ characters)
NEW_SECRET=$(openssl rand -base64 32)
echo "New secret generated (save this securely): $NEW_SECRET"

# 2. Add new version to Secret Manager
echo -n "$NEW_SECRET" | gcloud secrets versions add ADMIN_SECRET \
  --data-file=- \
  --project=YOUR_PROJECT_ID

# 3. Get the new version number
gcloud secrets versions list ADMIN_SECRET \
  --project=YOUR_PROJECT_ID \
  --limit=2

# 4. Deploy new Cloud Run revision to pick up new secret
gcloud run services update verifymyprovider-backend \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID

# 5. Verify the new secret works
curl -X GET "https://api.verifymyprovider.com/api/v1/admin/health" \
  -H "X-Admin-Secret: $NEW_SECRET"
# Expected: {"success":true,"data":{"status":"healthy",...}}

# 6. Update Cloud Scheduler jobs (if using admin endpoints)
gcloud scheduler jobs update http cleanup-expired-verifications \
  --location=us-central1 \
  --headers="X-Admin-Secret=$NEW_SECRET" \
  --project=YOUR_PROJECT_ID

# 7. After confirming everything works, disable old version
OLD_VERSION=1  # Replace with actual old version number
gcloud secrets versions disable $OLD_VERSION \
  --secret=ADMIN_SECRET \
  --project=YOUR_PROJECT_ID

# 8. After 48 hours, destroy old version (optional)
gcloud secrets versions destroy $OLD_VERSION \
  --secret=ADMIN_SECRET \
  --project=YOUR_PROJECT_ID
```

---

### DATABASE_URL

The `DATABASE_URL` contains PostgreSQL credentials.

**Rotation Frequency**: Every 180 days

**Prerequisites**:
- PostgreSQL admin access
- Access to Google Cloud Secret Manager
- Maintenance window (brief service interruption possible)

**Procedure**:

```bash
# 1. Connect to PostgreSQL and create new user
psql -h YOUR_DB_HOST -U postgres -d verifymyprovider

# In psql:
CREATE USER app_user_v2 WITH PASSWORD 'NEW_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE verifymyprovider TO app_user_v2;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user_v2;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user_v2;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user_v2;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_user_v2;
\q

# 2. Construct new DATABASE_URL
NEW_DATABASE_URL="postgresql://app_user_v2:NEW_SECURE_PASSWORD@YOUR_DB_HOST:5432/verifymyprovider?sslmode=require"

# 3. Add new version to Secret Manager
echo -n "$NEW_DATABASE_URL" | gcloud secrets versions add DATABASE_URL \
  --data-file=- \
  --project=YOUR_PROJECT_ID

# 4. Deploy new Cloud Run revision
gcloud run services update verifymyprovider-backend \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID

# 5. Verify database connectivity
curl "https://api.verifymyprovider.com/health"
# Expected: {"status":"ok","checks":{"database":"healthy"},...}

# 6. Monitor for errors in Cloud Logging
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit=10 \
  --project=YOUR_PROJECT_ID

# 7. After 24 hours of successful operation, remove old user
psql -h YOUR_DB_HOST -U postgres -d verifymyprovider
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_user_v1;
REVOKE ALL PRIVILEGES ON DATABASE verifymyprovider FROM app_user_v1;
DROP USER app_user_v1;
\q

# 8. Disable old secret version
gcloud secrets versions disable OLD_VERSION \
  --secret=DATABASE_URL \
  --project=YOUR_PROJECT_ID
```

---

### RECAPTCHA Keys

reCAPTCHA uses a key pair: site key (frontend) and secret key (backend).

**Rotation Frequency**: Every 365 days

**Prerequisites**:
- Access to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
- Ability to deploy both frontend and backend

**Procedure**:

```bash
# 1. Go to Google reCAPTCHA Admin Console
#    https://www.google.com/recaptcha/admin
#    Create a new site (or regenerate keys for existing site)
#    Save both:
#    - Site Key (public, for frontend)
#    - Secret Key (private, for backend)

# 2. Update backend secret
echo -n "NEW_SECRET_KEY" | gcloud secrets versions add RECAPTCHA_SECRET_KEY \
  --data-file=- \
  --project=YOUR_PROJECT_ID

# 3. Update frontend secret
echo -n "NEW_SITE_KEY" | gcloud secrets versions add NEXT_PUBLIC_RECAPTCHA_SITE_KEY \
  --data-file=- \
  --project=YOUR_PROJECT_ID

# 4. Deploy backend first (it can validate both old and new keys briefly)
gcloud run services update verifymyprovider-backend \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID

# 5. Deploy frontend immediately after
gcloud run services update verifymyprovider-frontend \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID

# 6. Test CAPTCHA flow
#    - Visit the site
#    - Submit a verification (triggers CAPTCHA)
#    - Check logs for "CAPTCHA verification" success

# 7. Disable old reCAPTCHA site in Google Console after 1 hour
#    (allows any in-flight requests to complete)

# 8. Disable old secret versions
gcloud secrets versions disable OLD_VERSION --secret=RECAPTCHA_SECRET_KEY --project=YOUR_PROJECT_ID
gcloud secrets versions disable OLD_VERSION --secret=NEXT_PUBLIC_RECAPTCHA_SITE_KEY --project=YOUR_PROJECT_ID
```

---

### REDIS_URL

The `REDIS_URL` contains Redis connection credentials.

**Rotation Frequency**: Every 180 days

**Prerequisites**:
- Redis admin access (Memorystore console or redis-cli)
- Access to Google Cloud Secret Manager

**Procedure**:

```bash
# For Google Cloud Memorystore:

# 1. Update Redis AUTH password in Memorystore Console
#    Or via gcloud (if supported for your Redis version):
gcloud redis instances update INSTANCE_NAME \
  --region=us-central1 \
  --auth-enabled \
  --project=YOUR_PROJECT_ID
# Note: This generates a new AUTH string

# 2. Get the new AUTH string
gcloud redis instances get-auth-string INSTANCE_NAME \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID

# 3. Construct new REDIS_URL
NEW_REDIS_URL="redis://:NEW_AUTH_STRING@REDIS_HOST:6379"

# 4. Add new version to Secret Manager
echo -n "$NEW_REDIS_URL" | gcloud secrets versions add REDIS_URL \
  --data-file=- \
  --project=YOUR_PROJECT_ID

# 5. Deploy new Cloud Run revision
gcloud run services update verifymyprovider-backend \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID

# 6. Verify Redis connectivity
curl "https://api.verifymyprovider.com/health"
# Check logs for Redis connection messages

# 7. Monitor rate limiting functionality
#    Make several requests and verify X-RateLimit-* headers are present

# 8. Disable old secret version after 24 hours
gcloud secrets versions disable OLD_VERSION \
  --secret=REDIS_URL \
  --project=YOUR_PROJECT_ID
```

---

## Emergency Break-Glass Procedure

Use this procedure if a secret is **compromised or suspected to be compromised**.

### Severity Assessment

| Severity | Criteria | Response Time |
|----------|----------|---------------|
| **Critical** | ADMIN_SECRET or DATABASE_URL exposed publicly | Immediate (< 1 hour) |
| **High** | Secret found in logs, shared insecurely | < 4 hours |
| **Medium** | Employee with access leaves company | < 24 hours |
| **Low** | Routine rotation overdue | < 1 week |

### Emergency Contacts

| Role | Name | Contact | Backup |
|------|------|---------|--------|
| Security Lead | [NAME] | [EMAIL/PHONE] | [BACKUP] |
| Platform Lead | [NAME] | [EMAIL/PHONE] | [BACKUP] |
| On-Call Engineer | PagerDuty | [PAGERDUTY_URL] | - |

### Immediate Response Steps

```bash
# ============================================================
# STEP 1: ASSESS AND DOCUMENT (5 minutes)
# ============================================================
# - What secret was exposed?
# - How was it exposed? (logs, code commit, screenshot, etc.)
# - When did the exposure occur?
# - Who has potentially seen it?
# - Document everything in incident channel

# ============================================================
# STEP 2: ROTATE THE COMPROMISED SECRET (15 minutes)
# ============================================================

# For ADMIN_SECRET (most common):
NEW_SECRET=$(openssl rand -base64 32)
echo -n "$NEW_SECRET" | gcloud secrets versions add ADMIN_SECRET --data-file=- --project=YOUR_PROJECT_ID

# Immediately disable ALL old versions (not just the latest)
for version in $(gcloud secrets versions list ADMIN_SECRET --project=YOUR_PROJECT_ID --format="value(name)" | tail -n +2); do
  gcloud secrets versions disable $version --secret=ADMIN_SECRET --project=YOUR_PROJECT_ID
done

# Force new deployment
gcloud run services update verifymyprovider-backend \
  --region=us-central1 \
  --update-env-vars="FORCE_RESTART=$(date +%s)" \
  --project=YOUR_PROJECT_ID

# ============================================================
# STEP 3: REVOKE AND BLOCK (if applicable)
# ============================================================

# If DATABASE_URL was exposed:
# - Immediately change the password in PostgreSQL
# - Check for unauthorized access in database logs
# - Consider restoring from backup if data integrity is uncertain

# If source IP is known, block it:
gcloud compute security-policies rules create 1000 \
  --security-policy=YOUR_POLICY \
  --src-ip-ranges="ATTACKER_IP/32" \
  --action=deny-403

# ============================================================
# STEP 4: AUDIT AND INVESTIGATE (ongoing)
# ============================================================

# Check for unauthorized access in last 24 hours
gcloud logging read 'resource.type="cloud_run_revision" AND httpRequest.requestUrl=~"/api/v1/admin"' \
  --limit=100 \
  --format=json \
  --project=YOUR_PROJECT_ID

# Check for unusual database queries
# (requires database audit logging to be enabled)

# ============================================================
# STEP 5: POST-INCIDENT
# ============================================================
# - Complete incident report
# - Identify root cause
# - Implement preventive measures
# - Update this runbook if needed
```

### Communication Template

```
SECURITY INCIDENT - [SECRET_NAME] ROTATION

Status: IN PROGRESS / RESOLVED
Severity: CRITICAL / HIGH / MEDIUM
Time Detected: [TIMESTAMP]
Time Resolved: [TIMESTAMP]

Summary:
[Brief description of what happened]

Impact:
- Services affected: [LIST]
- Data at risk: [DESCRIPTION]
- User impact: [DESCRIPTION]

Actions Taken:
1. [ACTION 1]
2. [ACTION 2]
3. [ACTION 3]

Next Steps:
- [ ] Complete post-incident review
- [ ] Update runbooks
- [ ] Implement additional safeguards

Point of Contact: [NAME]
```

---

## Verification Commands

Use these commands to verify secrets are working after rotation.

### ADMIN_SECRET

```bash
# Test admin health endpoint
curl -s -o /dev/null -w "%{http_code}" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://api.verifymyprovider.com/api/v1/admin/health"
# Expected: 200

# Test with wrong secret (should fail)
curl -s -o /dev/null -w "%{http_code}" \
  -H "X-Admin-Secret: wrong-secret" \
  "https://api.verifymyprovider.com/api/v1/admin/health"
# Expected: 401
```

### DATABASE_URL

```bash
# Health check includes database status
curl -s "https://api.verifymyprovider.com/health" | jq '.checks.database'
# Expected: "healthy"

# Check database response time
curl -s "https://api.verifymyprovider.com/health" | jq '.databaseResponseTime'
# Expected: "<100ms" typically
```

### RECAPTCHA Keys

```bash
# Check if CAPTCHA is configured (in logs)
gcloud logging read 'resource.type="cloud_run_revision" AND textPayload=~"CAPTCHA"' \
  --limit=5 \
  --project=YOUR_PROJECT_ID

# Verify by submitting a test verification through the frontend
# and checking for successful CAPTCHA validation in logs
```

### REDIS_URL

```bash
# Check rate limiter mode in startup logs
gcloud logging read 'resource.type="cloud_run_revision" AND textPayload=~"Rate limiter using"' \
  --limit=5 \
  --project=YOUR_PROJECT_ID
# Expected: "Rate limiter using Redis (distributed mode)"

# Verify rate limit headers are present
curl -sI "https://api.verifymyprovider.com/api/v1/providers/search?q=test" | grep -i x-ratelimit
# Expected: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
```

### All Secrets - Comprehensive Check

```bash
#!/bin/bash
# Run this script after any secret rotation

echo "=== Secret Rotation Verification ==="

# Health check
echo -n "Health endpoint: "
HEALTH=$(curl -s "https://api.verifymyprovider.com/health")
echo $HEALTH | jq -r '.status'

# Database
echo -n "Database: "
echo $HEALTH | jq -r '.checks.database'

# Admin endpoint (requires ADMIN_SECRET env var)
echo -n "Admin auth: "
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://api.verifymyprovider.com/api/v1/admin/health"

# Rate limiting (Redis)
echo -n "Rate limiting: "
curl -sI "https://api.verifymyprovider.com/" 2>/dev/null | grep -q "X-RateLimit" && echo "OK" || echo "MISSING"

echo "=== Verification Complete ==="
```

---

## Automation

### Scheduled Rotation Reminders

Set up Cloud Scheduler to send rotation reminders:

```bash
# Create a Pub/Sub topic for rotation reminders
gcloud pubsub topics create secret-rotation-reminders --project=YOUR_PROJECT_ID

# Create scheduler job (runs on 1st of each month)
gcloud scheduler jobs create pubsub rotation-reminder-monthly \
  --location=us-central1 \
  --schedule="0 9 1 * *" \
  --topic=secret-rotation-reminders \
  --message-body='{"check": "monthly_rotation_review"}' \
  --project=YOUR_PROJECT_ID
```

### Secret Expiration Tracking

Use Secret Manager labels to track rotation dates:

```bash
# Add rotation metadata to secrets
gcloud secrets update ADMIN_SECRET \
  --update-labels=last_rotated=$(date +%Y-%m-%d),next_rotation=$(date -d "+90 days" +%Y-%m-%d) \
  --project=YOUR_PROJECT_ID

# Query secrets due for rotation
gcloud secrets list \
  --filter="labels.next_rotation<$(date +%Y-%m-%d)" \
  --format="table(name,labels.next_rotation)" \
  --project=YOUR_PROJECT_ID
```

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2024-01-31 | Platform Team | Initial document creation |

---

*Last updated: January 2024*
