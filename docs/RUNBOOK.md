# VerifyMyProvider Runbook

Operational procedures for maintaining and troubleshooting VerifyMyProvider.

## Quick Reference

| Task | Command/Endpoint |
|------|------------------|
| Check health | `GET /api/v1/admin/health` |
| View logs | `gcloud logging read "resource.type=cloud_run_revision"` |
| Clear cache | `POST /api/v1/admin/cache/clear` |
| Force cleanup | `POST /api/v1/admin/cleanup-expired` |
| Retention stats | `GET /api/v1/admin/retention/stats` |

## Environment Variables

All admin endpoints require the `X-Admin-Secret` header:

```bash
export ADMIN_SECRET=your-admin-secret
export API_BASE_URL=https://api.verifymyprovider.com
```

---

## Log Retention

### Viewing Logs by Bucket

```bash
# Default logs (30 days retention)
gcloud logging read "resource.type=cloud_run_revision" \
  --project=$PROJECT_ID \
  --limit=50 \
  --format="table(timestamp, severity, textPayload)"

# Error logs (90 days retention)
gcloud logging read "resource.type=cloud_run_revision" \
  --project=$PROJECT_ID \
  --bucket=extended-errors \
  --location=global \
  --limit=50

# Audit logs (1 year retention)
gcloud logging read 'protoPayload.serviceName="secretmanager.googleapis.com" OR textPayload=~"admin"' \
  --project=$PROJECT_ID \
  --bucket=compliance-audit \
  --location=global \
  --limit=50
```

### Log Queries

```bash
# Recent errors
gcloud logging read "severity>=ERROR" \
  --project=$PROJECT_ID \
  --freshness=1h \
  --format="table(timestamp, textPayload)"

# Admin API access
gcloud logging read 'textPayload=~"Admin"' \
  --project=$PROJECT_ID \
  --freshness=24h

# Rate limit events
gcloud logging read 'textPayload=~"rate limit"' \
  --project=$PROJECT_ID \
  --freshness=1h

# Database connection errors
gcloud logging read 'textPayload=~"connection" AND severity>=WARNING' \
  --project=$PROJECT_ID \
  --freshness=24h
```

### Checking Retention Status

```bash
# View bucket retention settings
gcloud logging buckets list --project=$PROJECT_ID --location=global

# View sink configurations
gcloud logging sinks list --project=$PROJECT_ID

# View log storage metrics
gcloud logging metrics list --project=$PROJECT_ID
```

### Manual Cleanup

```bash
# Force sync_logs cleanup (90 day retention)
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/cleanup/sync-logs"

# Dry run first
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/cleanup/sync-logs?dryRun=true"

# Force expired verification cleanup
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/cleanup-expired"

# Dry run expired verification cleanup
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/cleanup-expired?dryRun=true"
```

### Retention Stats

```bash
# Get comprehensive retention statistics
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/retention/stats" | jq

# Example output:
# {
#   "verificationLogs": {
#     "total": 12345,
#     "expiringIn7Days": 234,
#     "expiringIn30Days": 890
#   },
#   "syncLogs": {
#     "total": 89,
#     "olderThan90Days": 12
#   }
# }
```

---

## Cache Management

### Clear Cache

```bash
# Clear all cached data
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/cache/clear"
```

### Cache Stats

```bash
# View cache statistics
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/cache/stats" | jq
```

### When to Clear Cache

Clear cache after:
- Bulk data imports
- Schema migrations
- Manual data corrections
- Unusual cache miss patterns

---

## Health Checks

### Full Health Check

```bash
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/health" | jq
```

### Public Health Check

```bash
# Basic health (no auth required)
curl "$API_BASE_URL/health"
```

### Expected Response

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-01-31T12:00:00.000Z",
    "uptime": 86400,
    "cache": {
      "hits": 1234,
      "misses": 56,
      "entries": 789
    },
    "retention": {
      "verificationLogs": { "total": 12345 },
      "syncLogs": { "total": 89 },
      "voteLogs": { "total": 5678 }
    }
  }
}
```

---

## Scheduled Jobs

### View Scheduled Jobs

```bash
gcloud scheduler jobs list \
  --project=$PROJECT_ID \
  --location=us-central1 \
  --format="table(name, schedule, state)"
```

### Manually Trigger Jobs

```bash
# Run verification cleanup
gcloud scheduler jobs run cleanup-expired-verifications \
  --project=$PROJECT_ID \
  --location=us-central1

# Run sync log cleanup
gcloud scheduler jobs run cleanup-sync-logs \
  --project=$PROJECT_ID \
  --location=us-central1

# Run location enrichment
gcloud scheduler jobs run location-enrichment \
  --project=$PROJECT_ID \
  --location=us-central1
```

### Check Job Status

```bash
gcloud scheduler jobs describe cleanup-sync-logs \
  --project=$PROJECT_ID \
  --location=us-central1 \
  --format='yaml(lastAttemptTime, scheduleTime, status)'
```

---

## Database Operations

### View Expiration Stats

```bash
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/expiration-stats" | jq
```

### Location Enrichment

```bash
# Dry run
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/locations/enrich?dryRun=true" | jq

# Apply enrichment
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/locations/enrich" | jq

# View enrichment stats
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/locations/enrichment-stats" | jq
```

### Database Connections

```bash
# Check Cloud SQL status
gcloud sql instances describe $SQL_INSTANCE \
  --project=$PROJECT_ID \
  --format='yaml(state, connectionName)'

# View active connections (via SQL)
# SELECT * FROM pg_stat_activity WHERE datname = 'verifymyprovider';
```

---

## Incident Response

### High Error Rate

1. Check recent logs:
   ```bash
   gcloud logging read "severity>=ERROR" --freshness=1h --limit=50
   ```

2. Check service health:
   ```bash
   curl "$API_BASE_URL/health"
   ```

3. Check database connectivity:
   ```bash
   gcloud sql instances describe $SQL_INSTANCE --format='value(state)'
   ```

4. Clear cache if needed:
   ```bash
   curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" \
     "$API_BASE_URL/api/v1/admin/cache/clear"
   ```

### Database Full

1. Check retention stats:
   ```bash
   curl -H "X-Admin-Secret: $ADMIN_SECRET" \
     "$API_BASE_URL/api/v1/admin/retention/stats"
   ```

2. Force cleanup:
   ```bash
   curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" \
     "$API_BASE_URL/api/v1/admin/cleanup-expired"
   curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" \
     "$API_BASE_URL/api/v1/admin/cleanup/sync-logs"
   ```

3. Check table sizes (via SQL):
   ```sql
   SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables
   ORDER BY pg_total_relation_size(relid) DESC;
   ```

### Rate Limiting Issues

1. Check current rate limit logs:
   ```bash
   gcloud logging read 'textPayload=~"rate limit"' --freshness=1h
   ```

2. Review WAF rules:
   ```bash
   gcloud compute security-policies describe verifymyprovider-waf-policy
   ```

---

## Deployment

### Deploy Backend

```bash
gcloud run deploy verifymyprovider-api \
  --project=$PROJECT_ID \
  --region=us-central1 \
  --source=./packages/backend
```

### Deploy Frontend

```bash
gcloud run deploy verifymyprovider-web \
  --project=$PROJECT_ID \
  --region=us-central1 \
  --source=./packages/frontend
```

### Rollback

```bash
# List revisions
gcloud run revisions list \
  --project=$PROJECT_ID \
  --service=verifymyprovider-api

# Route traffic to previous revision
gcloud run services update-traffic verifymyprovider-api \
  --project=$PROJECT_ID \
  --to-revisions=verifymyprovider-api-00123-abc=100
```

---

## Security

### Secret Rotation

```bash
# Create new secret version
echo -n "new-secret-value" | gcloud secrets versions add $SECRET_NAME \
  --project=$PROJECT_ID \
  --data-file=-

# Disable old version
gcloud secrets versions disable $OLD_VERSION \
  --secret=$SECRET_NAME \
  --project=$PROJECT_ID
```

### View Secret Access Logs

```bash
gcloud logging read 'protoPayload.serviceName="secretmanager.googleapis.com"' \
  --project=$PROJECT_ID \
  --freshness=24h \
  --format="table(timestamp, protoPayload.methodName, protoPayload.authenticationInfo.principalEmail)"
```

---

## Contacts

| Role | Contact |
|------|---------|
| On-call | TBD |
| Database | TBD |
| Security | TBD |

---

## Related Documentation

- [LOG-RETENTION-POLICY.md](./LOG-RETENTION-POLICY.md) - Retention policies
- [CLOUD-ARMOR.md](./CLOUD-ARMOR.md) - WAF configuration
- [LEGAL-REVIEW-CHECKLIST.md](./LEGAL-REVIEW-CHECKLIST.md) - Legal compliance
