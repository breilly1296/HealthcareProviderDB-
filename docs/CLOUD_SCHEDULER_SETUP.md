# Cloud Scheduler Setup for Expired Verification Cleanup

This document explains how to set up Google Cloud Scheduler to automatically clean up expired verification records daily.

## Overview

The cleanup job removes verification records that have passed their TTL (Time To Live) of 6 months. This is based on research showing 12% annual provider turnover (Ndumele et al. 2018), ensuring data freshness.

## Prerequisites

1. Google Cloud Project with billing enabled
2. Cloud Scheduler API enabled
3. Backend API deployed and accessible
4. `ADMIN_SECRET` environment variable configured

## Step 1: Generate Admin Secret

Generate a secure random secret:

```bash
openssl rand -hex 32
```

Add this to your backend's environment variables:

```bash
ADMIN_SECRET=<generated-secret>
```

For Cloud Run, update your service:

```bash
gcloud run services update healthcare-provider-api \
  --update-env-vars ADMIN_SECRET=<generated-secret>
```

## Step 2: Create Cloud Scheduler Job

### Using gcloud CLI

```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Create the scheduler job
gcloud scheduler jobs create http cleanup-expired-verifications \
  --location=us-central1 \
  --schedule="0 3 * * *" \
  --time-zone="America/New_York" \
  --uri="https://YOUR_API_DOMAIN/api/v1/admin/cleanup-expired" \
  --http-method=POST \
  --headers="X-Admin-Secret=YOUR_ADMIN_SECRET,Content-Type=application/json" \
  --description="Daily cleanup of expired verification records (3 AM ET)" \
  --attempt-deadline=300s
```

### Using Google Cloud Console

1. Go to [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler)
2. Click **Create Job**
3. Configure:
   - **Name**: `cleanup-expired-verifications`
   - **Region**: `us-central1` (or your preferred region)
   - **Frequency**: `0 3 * * *` (3 AM daily)
   - **Timezone**: `America/New_York`
4. Configure the execution:
   - **Target type**: HTTP
   - **URL**: `https://YOUR_API_DOMAIN/api/v1/admin/cleanup-expired`
   - **HTTP method**: POST
   - **Headers**:
     - `X-Admin-Secret`: `<your-admin-secret>`
     - `Content-Type`: `application/json`
5. Click **Create**

## Step 3: Test the Job

### Dry Run (Preview)

Test without deleting anything:

```bash
curl -X POST "https://YOUR_API_DOMAIN/api/v1/admin/cleanup-expired?dryRun=true" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "expiredVerificationLogs": 150,
    "expiredPlanAcceptances": 42,
    "deletedVerificationLogs": 0,
    "deletedPlanAcceptances": 0,
    "message": "Dry run complete. 192 records would be deleted."
  }
}
```

### Manual Execution

Trigger the job manually from Cloud Scheduler:

```bash
gcloud scheduler jobs run cleanup-expired-verifications --location=us-central1
```

Or run the actual cleanup:

```bash
curl -X POST "https://YOUR_API_DOMAIN/api/v1/admin/cleanup-expired" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json"
```

## Step 4: Monitor the Job

### Check Job Status

```bash
gcloud scheduler jobs describe cleanup-expired-verifications --location=us-central1
```

### View Execution Logs

Check Cloud Logging for execution history:

```bash
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=cleanup-expired-verifications" \
  --limit=10 \
  --format="table(timestamp,textPayload)"
```

### Set Up Alerting (Optional)

Create an alert policy for job failures:

```bash
gcloud alpha monitoring policies create \
  --display-name="Cleanup Job Failures" \
  --condition-display-name="Job Failed" \
  --condition-filter='resource.type="cloud_scheduler_job" AND metric.type="cloud_scheduler.googleapis.com/job/error_count"' \
  --condition-threshold-value=1 \
  --condition-threshold-comparison=COMPARISON_GE \
  --notification-channels=YOUR_NOTIFICATION_CHANNEL
```

## API Endpoints Reference

### POST /api/v1/admin/cleanup-expired

Clean up expired verification records.

**Headers:**
- `X-Admin-Secret`: Required. Must match `ADMIN_SECRET` env var.

**Query Parameters:**
- `dryRun` (boolean, default: false): If true, only count expired records without deleting.
- `batchSize` (number, default: 1000): Number of records to delete per batch.

**Response:**

```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "expiredVerificationLogs": 150,
    "expiredPlanAcceptances": 42,
    "deletedVerificationLogs": 150,
    "deletedPlanAcceptances": 42,
    "message": "Cleanup complete. 192 records deleted."
  }
}
```

### GET /api/v1/admin/expiration-stats

Get statistics about verification expiration.

**Headers:**
- `X-Admin-Secret`: Required.

**Response:**

```json
{
  "success": true,
  "data": {
    "verificationLogs": {
      "total": 5000,
      "expired": 150,
      "expiringIn30Days": 420,
      "noExpiration": 200
    },
    "planAcceptances": {
      "total": 25000,
      "expired": 42,
      "expiringIn30Days": 1200,
      "noExpiration": 5000
    }
  }
}
```

### GET /api/v1/admin/health

Health check for monitoring.

**Headers:**
- `X-Admin-Secret`: Required.

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T08:00:00.000Z",
    "uptime": 86400
  }
}
```

## Security Considerations

1. **Secret Management**: Store `ADMIN_SECRET` in Google Secret Manager for production:

   ```bash
   echo -n "your-secret" | gcloud secrets create admin-secret --data-file=-

   gcloud run services update healthcare-provider-api \
     --update-secrets=ADMIN_SECRET=admin-secret:latest
   ```

2. **Network Security**: Consider restricting the admin endpoints to internal traffic only using VPC Service Controls.

3. **Audit Logging**: All admin endpoint calls are logged with timestamps. Review logs regularly.

4. **Secret Rotation**: Rotate `ADMIN_SECRET` periodically:
   - Generate new secret
   - Update Cloud Scheduler job header
   - Update backend environment variable
   - Verify job works with new secret

## Troubleshooting

### Job Returns 401 Unauthorized

- Verify `ADMIN_SECRET` matches between scheduler and backend
- Check for whitespace or encoding issues in the header

### Job Times Out

- Increase `--attempt-deadline` (max 30 minutes)
- Reduce `batchSize` query parameter
- Check backend logs for slow queries

### No Records Deleted

- Run dry run to see if there are expired records
- Verify TTL was set on records (legacy records have `expiresAt: null`)
- Check database timezone settings

## Maintenance

- **Weekly**: Review execution logs for errors
- **Monthly**: Check expiration stats to monitor data health
- **Quarterly**: Rotate admin secret
