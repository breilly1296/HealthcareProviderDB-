# Log Retention Policy

## Overview

This document defines retention periods for all logs and audit data in VerifyMyProvider. These policies balance operational needs, cost management, and compliance requirements.

## Retention Periods

| Log Type | Location | Retention | Rationale |
|----------|----------|-----------|-----------|
| Application logs | Cloud Logging | 30 days | Debugging, cost control |
| Error logs | Cloud Logging | 90 days | Incident investigation |
| Access logs | Cloud Logging | 30 days | Security monitoring |
| Admin audit logs | Cloud Logging | 1 year | Compliance, security audits |
| Secret Manager audit | Cloud Logging | 1 year | Security compliance |
| Verification logs | PostgreSQL | 6 months | TTL policy (existing) |
| Vote logs | PostgreSQL | 6 months | Follows verification TTL |
| Sync logs | PostgreSQL | 90 days | Import troubleshooting |
| Rate limit events | In-memory/Redis | 1 hour | Real-time only |

## Cloud Logging Configuration

### Log Buckets

We use three log buckets with different retention periods:

#### 1. Default Bucket (`_Default`) - 30 days
- Application info/debug logs
- HTTP request logs
- General operational logs
- Standard Cloud Run output

#### 2. Extended Errors Bucket (`extended-errors`) - 90 days
- Severity ERROR and above
- Exception stack traces
- Failed request details
- Security-related warnings

#### 3. Compliance Audit Bucket (`compliance-audit`) - 1 year
- Admin authentication events
- Secret Manager access logs
- Admin API calls
- Data modification audit trail
- Configuration changes

### Log Routing

Logs are automatically routed to appropriate buckets using log sinks:

```
┌─────────────────┐
│   All Logs      │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Router  │
    └────┬────┘
         │
    ┌────┼─────────────────┬─────────────────┐
    │    │                 │                 │
    ▼    ▼                 ▼                 ▼
┌───────────┐      ┌──────────────┐   ┌─────────────────┐
│  _Default │      │extended-errors│   │compliance-audit │
│  30 days  │      │   90 days    │   │    365 days     │
└───────────┘      └──────────────┘   └─────────────────┘
   INFO/DEBUG         ERROR/CRITICAL      Admin/Secrets
```

## Database Retention

### Automatic TTL Cleanup (Existing)

These tables use the `expiresAt` field for automatic expiration:

| Table | TTL Field | Default TTL | Cleanup Method |
|-------|-----------|-------------|----------------|
| `verification_log` | `expiresAt` | 6 months | Scheduled job |
| `provider_plan_acceptance` | `expiresAt` | 6 months | Scheduled job |

### Manual/Scheduled Cleanup

These tables require periodic cleanup:

| Table | Retention | Cleanup Endpoint |
|-------|-----------|------------------|
| `sync_log` | 90 days | `POST /admin/cleanup/sync-logs` |

### Cleanup Schedule

| Job | Schedule | Description |
|-----|----------|-------------|
| Expired verifications | Hourly | Remove verification_logs past expiresAt |
| Sync logs | Daily 3 AM | Remove sync_logs older than 90 days |
| Orphaned records | Weekly | Clean up orphaned votes, etc. |

## Implementation Details

### Cloud Logging Setup

Run the setup script to configure retention:

```bash
export PROJECT_ID=your-project-id
./packages/backend/scripts/setup-log-retention.sh
```

### Database Cleanup

Sync logs are cleaned up via admin endpoint:

```bash
# Manual cleanup
curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" \
  https://api.verifymyprovider.com/api/v1/admin/cleanup/sync-logs

# Automated via Cloud Scheduler (daily at 3 AM)
```

### Verification Metrics

The admin health endpoint includes retention metrics:

```json
{
  "retention": {
    "verificationLogs": {
      "total": 12345,
      "expiringIn7Days": 234,
      "oldestRecord": "2025-08-01T00:00:00Z"
    },
    "syncLogs": {
      "total": 89,
      "oldestRecord": "2025-11-15T00:00:00Z"
    }
  }
}
```

## Cost Considerations

### Cloud Logging Pricing

| Component | Price | Notes |
|-----------|-------|-------|
| Ingestion | $0.50/GB | First 50 GB/month free |
| Storage (0-30 days) | Free | Included in ingestion |
| Storage (30+ days) | $0.01/GB/month | Only for extended buckets |

### Estimated Monthly Cost

At current volume (~5-10 GB/month):

| Bucket | Volume | Retention | Monthly Cost |
|--------|--------|-----------|--------------|
| Default | ~8 GB | 30 days | $4 (ingestion only) |
| Extended Errors | ~0.5 GB | 90 days | $0.03 |
| Compliance Audit | ~0.2 GB | 365 days | $0.02 |
| **Total** | | | **~$5-15/month** |

### Cost Optimization Tips

1. **Log levels**: Use DEBUG only in development
2. **Sampling**: Consider sampling high-volume logs
3. **Exclusions**: Exclude health check logs from ingestion
4. **Compression**: Cloud Logging automatically compresses

## Compliance Notes

### HIPAA

- **Not applicable**: VerifyMyProvider does not store PHI
- No special HIPAA retention requirements
- NPI data is public information

### General Best Practices

- Retain admin logs for 1 year for security audits
- Keep error logs for 90 days for incident investigation
- User IP addresses in rate limit logs are ephemeral only
- No PII stored in logs (only hashed identifiers)

### Data Subject Requests

If a user requests data deletion:

1. IP-based rate limit data expires automatically (1 hour)
2. Verification votes are anonymous (no user accounts)
3. Insurance card images are never logged or stored

## Audit and Verification

### Checking Retention Status

```bash
# View bucket retention settings
gcloud logging buckets list --project=$PROJECT_ID --location=global

# View storage usage
gcloud logging metrics list --project=$PROJECT_ID

# Check sink routing
gcloud logging sinks list --project=$PROJECT_ID
```

### Verifying Log Routing

```bash
# Check that error logs go to extended bucket
gcloud logging read "severity>=ERROR" \
  --project=$PROJECT_ID \
  --freshness=1h \
  --format="table(timestamp, severity, textPayload)"

# Check audit logs in compliance bucket
gcloud logging read 'protoPayload.serviceName="secretmanager.googleapis.com"' \
  --project=$PROJECT_ID \
  --bucket=compliance-audit \
  --location=global
```

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2026-01 | Initial policy | - |

## Related Documents

- [RUNBOOK.md](./RUNBOOK.md) - Operational procedures
- [CLOUD-ARMOR.md](./CLOUD-ARMOR.md) - Security configuration
- [setup-log-retention.sh](../packages/backend/scripts/setup-log-retention.sh) - Setup script
