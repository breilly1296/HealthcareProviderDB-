# Cloud Logging Configuration

## Overview

VerifyMyProvider uses Google Cloud Logging for centralized log management. This document covers the logging setup, retention policies, and common queries.

## Retention Policy

**Retention Period: 30 days**

This retention period was chosen during the security review to balance:
- Sufficient time for debugging and incident investigation
- Cost optimization (storage costs scale with retention)
- Privacy considerations (minimizing long-term data storage)

## Initial Setup

### Prerequisites

1. Google Cloud SDK installed and authenticated
2. Project owner or Logging Admin role
3. Billing enabled on the project

### Set Retention (One-Time Setup)

Run the setup script or execute these commands manually:

```bash
# Set your project
export PROJECT_ID="verifymyprovider-prod"
gcloud config set project $PROJECT_ID

# Create a custom log bucket with 30-day retention
gcloud logging buckets create verifymyprovider-logs \
  --location=global \
  --retention-days=30 \
  --description="VerifyMyProvider application logs with 30-day retention"

# Create a sink to route Cloud Run logs to this bucket
gcloud logging sinks create verifymyprovider-sink \
  "logging.googleapis.com/projects/${PROJECT_ID}/locations/global/buckets/verifymyprovider-logs" \
  --log-filter='resource.type="cloud_run_revision" OR resource.type="cloud_scheduler_job"'
```

Or use the provided script:

```bash
./scripts/setup-logging.sh
```

### Verify Configuration

```bash
# Check bucket settings
gcloud logging buckets describe verifymyprovider-logs --location=global

# Check sink configuration
gcloud logging sinks describe verifymyprovider-sink

# List all sinks
gcloud logging sinks list
```

## Common Log Queries

### Using gcloud CLI

```bash
# View recent errors (last 20)
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=20 \
  --format="table(timestamp,severity,textPayload)"

# View warnings and errors from the last hour
gcloud logging read "resource.type=cloud_run_revision AND severity>=WARNING AND timestamp>=\"$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ')\"" \
  --limit=50

# View rate limit hits
gcloud logging read "jsonPayload.message:\"Rate limit\"" --limit=20

# View CORS blocked requests
gcloud logging read "jsonPayload.message:\"[CORS] Blocked\"" --limit=20

# View admin endpoint calls
gcloud logging read "jsonPayload.message:\"[Admin]\"" --limit=20

# View verification submissions
gcloud logging read "httpRequest.requestUrl:\"/api/v1/verify\" AND httpRequest.requestMethod=\"POST\"" --limit=20

# Stream logs in real-time (backend)
gcloud beta run services logs tail verifymyprovider-backend --region=us-central1

# Stream logs in real-time (frontend)
gcloud beta run services logs tail verifymyprovider-frontend --region=us-central1
```

### Using Cloud Console

1. Go to [Cloud Logging](https://console.cloud.google.com/logs/query)
2. Use the query builder or enter queries directly

**Example queries for the Logs Explorer:**

```
# All errors from backend service
resource.type="cloud_run_revision"
resource.labels.service_name="verifymyprovider-backend"
severity>=ERROR

# All requests to a specific endpoint
resource.type="cloud_run_revision"
httpRequest.requestUrl=~"/api/v1/providers/"

# 4xx and 5xx responses
resource.type="cloud_run_revision"
httpRequest.status>=400

# Slow requests (>1 second)
resource.type="cloud_run_revision"
httpRequest.latency>"1s"

# Cloud Scheduler job executions
resource.type="cloud_scheduler_job"
resource.labels.job_id="cleanup-expired-verifications"
```

## Log Structure

### Application Logs

The backend logs structured JSON with these fields:

```json
{
  "severity": "INFO|WARNING|ERROR",
  "message": "Log message",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "httpRequest": {
    "requestMethod": "GET",
    "requestUrl": "/api/v1/providers/1234567890",
    "status": 200,
    "latency": "0.045s"
  }
}
```

### Security-Related Logs

These logs are automatically generated:

| Event | Log Message Pattern |
|-------|---------------------|
| CORS blocked | `[CORS] Blocked request from origin: ...` |
| Rate limit hit | `Rate limit exceeded for IP: ...` |
| Admin endpoint access | `[Admin] Cleanup expired verifications...` |
| Auth failure | `Invalid or missing admin secret` |

## Alerting

### Set Up Log-Based Alerts

```bash
# Create an alert for error spikes
gcloud alpha monitoring policies create \
  --display-name="High Error Rate" \
  --condition-display-name="Error count > 10 in 5 minutes" \
  --condition-filter='resource.type="cloud_run_revision" AND severity="ERROR"' \
  --condition-threshold-value=10 \
  --condition-threshold-duration=300s \
  --notification-channels=YOUR_NOTIFICATION_CHANNEL

# Create an alert for the cleanup job failures
gcloud alpha monitoring policies create \
  --display-name="Cleanup Job Failed" \
  --condition-display-name="Scheduler job error" \
  --condition-filter='resource.type="cloud_scheduler_job" AND severity="ERROR"' \
  --condition-threshold-value=1 \
  --notification-channels=YOUR_NOTIFICATION_CHANNEL
```

### Recommended Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| High Error Rate | >10 errors in 5 minutes | Critical |
| Cleanup Job Failure | Any scheduler error | Warning |
| CORS Attacks | >50 blocked requests in 1 hour | Warning |
| Rate Limit Abuse | >100 rate limited requests from same IP | Info |

## Cost Management

### Estimate Costs

Log storage costs approximately $0.50/GB/month. With 30-day retention:

```bash
# Check current log volume
gcloud logging read "resource.type=cloud_run_revision" \
  --format="json" \
  --freshness=1d | wc -c
```

### Reduce Log Volume (if needed)

1. **Exclude health check logs:**
   ```bash
   gcloud logging sinks update verifymyprovider-sink \
     --log-filter='resource.type="cloud_run_revision" AND NOT httpRequest.requestUrl="/health"'
   ```

2. **Exclude debug logs in production:**
   Set `LOG_LEVEL=info` in Cloud Run environment variables.

## Troubleshooting

### Logs Not Appearing in Custom Bucket

1. Check sink configuration:
   ```bash
   gcloud logging sinks describe verifymyprovider-sink
   ```

2. Verify the sink's service account has write permission:
   ```bash
   gcloud logging sinks describe verifymyprovider-sink --format='value(writerIdentity)'
   ```

3. Grant permission if needed:
   ```bash
   SINK_SA=$(gcloud logging sinks describe verifymyprovider-sink --format='value(writerIdentity)')
   gcloud projects add-iam-policy-binding verifymyprovider-prod \
     --member="$SINK_SA" \
     --role="roles/logging.bucketWriter"
   ```

### Retention Not Applied

The default `_Default` bucket has its own retention. To ensure all logs use 30-day retention:

1. Update the default bucket (if you have permission):
   ```bash
   gcloud logging buckets update _Default \
     --location=global \
     --retention-days=30
   ```

2. Or ensure your sink captures all relevant logs with the proper filter.

## Maintenance

| Task | Frequency | Command |
|------|-----------|---------|
| Review error logs | Daily | `gcloud logging read "severity>=ERROR" --limit=50` |
| Check retention settings | Monthly | `gcloud logging buckets describe verifymyprovider-logs --location=global` |
| Review log volume/costs | Monthly | Check Cloud Console Billing |
| Update sink filters | As needed | `gcloud logging sinks update ...` |
