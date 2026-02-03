---
tags:
  - api
  - admin
  - security
type: prompt
priority: 2
---

# Admin Endpoints Review

## Files to Review
- `packages/backend/src/routes/admin.ts` (admin routes)
- `packages/backend/src/services/verificationService.ts` (cleanup logic)
- Cloud Scheduler configuration

## Admin Authentication

### X-Admin-Secret Header
Admin endpoints require a secret header for authentication:

```typescript
// packages/backend/src/routes/admin.ts
function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;

  // Graceful degradation if not configured
  if (!adminSecret) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'Admin endpoints not configured',
        code: 'ADMIN_NOT_CONFIGURED',
        statusCode: 503,
      },
    });
  }

  const providedSecret = req.headers['x-admin-secret'];

  // Timing-safe comparison to prevent timing attacks
  const isValid =
    providedBuffer.length === secretBuffer.length &&
    timingSafeEqual(providedBuffer, secretBuffer);

  if (!isValid) {
    throw AppError.unauthorized('Invalid or missing admin secret');
  }

  next();
}
```

### Security Features
- **Timing-safe comparison:** Prevents timing attacks on secret validation
- **Graceful degradation:** Returns 503 if `ADMIN_SECRET` not configured
- **No user info leaked:** Generic error message on failure

## Admin Endpoints

### `POST /api/v1/admin/cleanup-expired`

Deletes verification records that have expired (past their TTL).

**Authentication:** `X-Admin-Secret` header required

**Purpose:** Called by Cloud Scheduler to maintain data freshness

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `dryRun` | string | 'false' | If 'true', only return counts without deleting |
| `batchSize` | number | 1000 | Records to process per batch |

**Request:**
```bash
curl -X POST "https://api.verifymyprovider.com/api/v1/admin/cleanup-expired?dryRun=true" \
  -H "X-Admin-Secret: your-secret"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "expiredPlanAcceptances": 150,
    "expiredVerificationLogs": 500,
    "deletedPlanAcceptances": 150,
    "deletedVerificationLogs": 500,
    "message": "Cleanup complete. 650 records deleted."
  }
}
```

### `GET /api/v1/admin/expiration-stats`

Get statistics about data expiration.

**Authentication:** `X-Admin-Secret` header required

**Purpose:** Monitoring data freshness and cleanup needs

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPlanAcceptances": 10000,
    "expiredPlanAcceptances": 150,
    "totalVerificationLogs": 50000,
    "expiredVerificationLogs": 500,
    "expiringNext30Days": {
      "planAcceptances": 200,
      "verificationLogs": 1000
    }
  }
}
```

### `GET /api/v1/admin/health`

Admin health check endpoint.

**Authentication:** `X-Admin-Secret` header required

**Purpose:** Verify admin endpoints are accessible

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-01-31T12:00:00.000Z",
    "uptime": 86400
  }
}
```

## Cloud Scheduler Integration

### Cleanup Job Configuration
```yaml
Name: cleanup-expired-verifications
Schedule: 0 * * * *  # Every hour
Target: HTTP POST
URL: https://backend-xxx.run.app/api/v1/admin/cleanup-expired
Headers:
  X-Admin-Secret: ${ADMIN_SECRET}
  Content-Type: application/json
Body: {}
```

### Setting Up Cloud Scheduler
```bash
# Create scheduler job
gcloud scheduler jobs create http cleanup-expired \
  --location=us-central1 \
  --schedule="0 * * * *" \
  --uri="https://backend-xxx.run.app/api/v1/admin/cleanup-expired" \
  --http-method=POST \
  --headers="X-Admin-Secret=${ADMIN_SECRET}"

# Test the job
gcloud scheduler jobs run cleanup-expired --location=us-central1
```

## Future Admin Endpoints (Planned)

| Endpoint | Purpose |
|----------|---------|
| `GET /admin/stats` | Overall system statistics |
| `GET /admin/providers/flagged` | Providers with conflicting verifications |
| `POST /admin/providers/:npi/review` | Mark provider as manually reviewed |
| `GET /admin/rate-limits` | Current rate limit status |
| `POST /admin/cache/clear` | Clear cached data |

## Checklist

### Authentication
- [x] X-Admin-Secret header required
- [x] Timing-safe comparison
- [x] Graceful 503 if not configured
- [ ] Audit logging for admin actions

### Endpoints
- [x] POST /admin/cleanup-expired
- [x] GET /admin/expiration-stats
- [x] GET /admin/health
- [ ] Additional stats endpoints

### Automation
- [ ] Cloud Scheduler configured
- [ ] Monitoring on job failures
- [ ] Alerting on cleanup errors

### Security
- [x] No rate limiting on admin (auth required)
- [x] Secret in environment variable
- [ ] IP allowlist for admin endpoints
- [ ] Audit log for admin actions

## Questions to Ask

1. **Is Cloud Scheduler configured?**
   - Job created?
   - Secret mounted?
   - Running successfully?

2. **What additional admin endpoints are needed?**
   - System stats?
   - User management (when auth added)?
   - Data export?

3. **Should we add IP allowlisting?**
   - Only allow Cloud Scheduler IPs?
   - Office IPs?

4. **Is there audit logging for admin actions?**
   - Who ran cleanup?
   - When?
   - What was deleted?

5. **Should admin endpoints be separate service?**
   - Better isolation?
   - Different scaling?

## Output Format

```markdown
# Admin Endpoints

**Last Updated:** [Date]

## Endpoints
| Endpoint | Purpose | Status |
|----------|---------|--------|
| POST /admin/cleanup-expired | TTL cleanup | ✅ |
| GET /admin/expiration-stats | Expiration stats | ✅ |
| GET /admin/health | Health check | ✅ |

## Authentication
- Method: X-Admin-Secret header
- Secret configured: [Yes/No]

## Cloud Scheduler
- Job configured: [Yes/No]
- Last run: [Date]
- Status: [Success/Failed]

## Cleanup Stats (Last Run)
- Records expired: X
- Records deleted: X
- Duration: Xms

## Issues
[List any issues]

## Recommendations
[List recommendations]
```
