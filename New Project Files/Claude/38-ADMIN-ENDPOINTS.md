# Admin Endpoints

## Authentication

All admin endpoints are protected by a shared secret passed in the `X-Admin-Secret` HTTP header.

### Security Details

- **Header:** `X-Admin-Secret`
- **Comparison:** Timing-safe using `crypto.timingSafeEqual` to prevent timing attacks
- **Missing secret (server-side):** Returns `503 Service Unavailable` if the `ADMIN_SECRET` environment variable is not configured
- **Invalid secret:** Returns `401 Unauthorized`

```typescript
import crypto from 'crypto';

const expected = Buffer.from(process.env.ADMIN_SECRET);
const provided = Buffer.from(req.headers['x-admin-secret']);

if (expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

## Endpoints

### 1. POST /admin/cleanup-expired

Delete verification records that have passed their expiration date.

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | boolean | `false` | If true, returns count of records that would be deleted without deleting them |
| `batchSize` | number | 1000 | Number of records to delete per batch |

**Use case:** Called by Cloud Scheduler on an hourly cron (`0 * * * *`) to keep the database clean.

### 2. GET /admin/expiration-stats

Returns statistics about verification expiration status.

**Response:** Counts of expired, expiring soon, and active verifications.

### 3. GET /admin/health

Admin-level health check with retention metrics.

**Response:** Service health status plus metrics on data retention (record counts, oldest records, storage estimates).

### 4. POST /admin/cache/clear

Clear all cached data from the in-memory cache.

**Response:** Returns the number of cache entries deleted.

### 5. GET /admin/cache/stats

Returns cache performance statistics.

**Response:** Total entries, memory usage estimate, hit rate percentage, miss count, eviction count.

### 6. GET /admin/enrichment/stats

Returns enrichment statistics for location data.

**Response:** Counts and coverage percentages for:
- `practice_locations` - How many providers have enriched practice location data
- `provider_hospitals` - How many providers have hospital affiliation data

### 7. POST /admin/cleanup/sync-logs

Clean old synchronization log entries.

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | boolean | `false` | If true, returns count without deleting |
| `retentionDays` | number | 90 | Delete logs older than this many days |

### 8. GET /admin/retention/stats

Comprehensive retention statistics across all log types.

**Response:** For each log type (verification_logs, vote_logs, sync_logs), returns:
- Total record count
- Oldest record date
- Records older than retention threshold
- Estimated storage usage

### 9. POST /admin/recalculate-confidence

Trigger confidence score decay recalculation for verification records.

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | boolean | `false` | If true, shows what would change without updating |
| `limit` | number | 10000 | Maximum number of records to process |

**Use case:** Confidence scores decay over time as verifications age. This endpoint recalculates scores based on current time and verification age.

## Cloud Scheduler Integration

The `cleanup-expired` endpoint is configured to run automatically via Google Cloud Scheduler.

| Job | Schedule | Endpoint | Description |
|-----|----------|----------|-------------|
| `cleanup-expired` | `0 * * * *` (hourly) | `POST /admin/cleanup-expired` | Remove expired verification records |

The Cloud Scheduler job sends the `X-Admin-Secret` header with each request, configured via the Secret Manager integration.
