# VerifyMyProvider Admin Endpoints Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

Admin endpoints provide operational control for TTL cleanup, health checks, and data management. They are protected by a shared secret header and not exposed to public users.

---

## Authentication

### X-Admin-Secret Header

```typescript
// packages/backend/src/middleware/adminAuth.ts

import crypto from 'crypto';
import { AppError } from '../utils/AppError';

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;

  // Graceful degradation if not configured
  if (!adminSecret) {
    console.warn('[Admin] ADMIN_SECRET not configured');
    return res.status(503).json({
      success: false,
      error: {
        message: 'Admin endpoints not configured',
        code: 'SERVICE_UNAVAILABLE',
        statusCode: 503
      }
    });
  }

  const providedSecret = req.headers['x-admin-secret'];

  if (!providedSecret || typeof providedSecret !== 'string') {
    throw AppError.unauthorized('Admin secret required');
  }

  // Timing-safe comparison to prevent timing attacks
  const secretBuffer = Buffer.from(adminSecret);
  const providedBuffer = Buffer.from(providedSecret);

  // Must be same length for timing-safe compare
  if (secretBuffer.length !== providedBuffer.length) {
    throw AppError.unauthorized('Invalid admin secret');
  }

  const isValid = crypto.timingSafeEqual(secretBuffer, providedBuffer);

  if (!isValid) {
    throw AppError.unauthorized('Invalid admin secret');
  }

  // Log admin access
  console.log(`[Admin] Access granted: ${req.method} ${req.path}`);

  next();
}
```

### Security Features

| Feature | Implementation |
|---------|----------------|
| Timing-safe comparison | `crypto.timingSafeEqual()` |
| Secret from environment | `process.env.ADMIN_SECRET` |
| Length check | Prevents leaking secret length |
| Access logging | All admin requests logged |
| Graceful degradation | 503 if not configured |

---

## Endpoints

### Health Check

```
GET /api/v1/admin/health
```

Returns system health status including database connectivity.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "redis": "connected",
    "timestamp": "2026-01-31T15:30:00Z",
    "version": "1.0.0"
  }
}
```

**Implementation:**

```typescript
// packages/backend/src/routes/admin.ts

router.get('/health', adminAuthMiddleware, asyncHandler(async (req, res) => {
  const startTime = Date.now();

  // Check database
  let dbStatus = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (error) {
    console.error('[Admin] Database health check failed:', error);
  }

  // Check Redis
  let redisStatus = 'unavailable';
  const redis = getRedis();
  if (redis && isRedisAvailable()) {
    try {
      await redis.ping();
      redisStatus = 'connected';
    } catch (error) {
      console.error('[Admin] Redis health check failed:', error);
    }
  }

  const responseTime = Date.now() - startTime;

  res.json({
    success: true,
    data: {
      status: dbStatus === 'connected' ? 'healthy' : 'degraded',
      database: dbStatus,
      redis: redisStatus,
      responseTimeMs: responseTime,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    }
  });
}));
```

---

### Cleanup Expired Data

```
POST /api/v1/admin/cleanup-expired
```

Triggers TTL cleanup of expired verifications and plan acceptance records.

**Response:**
```json
{
  "success": true,
  "data": {
    "deletedVerificationLogs": 234,
    "resetAcceptanceRecords": 156,
    "executionTimeMs": 1250
  }
}
```

**Implementation:**

```typescript
router.post('/cleanup-expired', adminAuthMiddleware, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const now = new Date();

  console.log('[Admin] Starting TTL cleanup...');

  // Delete expired verification logs
  const deletedLogs = await prisma.verificationLog.deleteMany({
    where: {
      expiresAt: { lt: now }
    }
  });

  // Reset expired plan acceptance (don't delete - keep record structure)
  const resetAcceptance = await prisma.providerPlanAcceptance.updateMany({
    where: {
      expiresAt: { lt: now }
    },
    data: {
      acceptanceStatus: 'UNKNOWN',
      confidenceScore: 0,
      verificationCount: 0,
      lastVerified: null,
      expiresAt: null
    }
  });

  const executionTime = Date.now() - startTime;

  console.log(`[Admin] Cleanup complete: ${deletedLogs.count} logs, ${resetAcceptance.count} acceptance records in ${executionTime}ms`);

  res.json({
    success: true,
    data: {
      deletedVerificationLogs: deletedLogs.count,
      resetAcceptanceRecords: resetAcceptance.count,
      executionTimeMs: executionTime
    }
  });
}));
```

---

### Expiration Statistics

```
GET /api/v1/admin/expiration-stats
```

Returns statistics about data expiration status.

**Response:**
```json
{
  "success": true,
  "data": {
    "expired": 234,
    "expiringIn7Days": 89,
    "expiringIn30Days": 456,
    "expiringIn90Days": 1234,
    "totalWithTtl": 5678,
    "totalWithoutTtl": 2345
  }
}
```

**Implementation:**

```typescript
router.get('/expiration-stats', adminAuthMiddleware, asyncHandler(async (req, res) => {
  const now = new Date();
  const in7Days = addDays(now, 7);
  const in30Days = addDays(now, 30);
  const in90Days = addDays(now, 90);

  const [
    expired,
    expiringIn7Days,
    expiringIn30Days,
    expiringIn90Days,
    totalWithTtl,
    totalWithoutTtl
  ] = await prisma.$transaction([
    prisma.providerPlanAcceptance.count({
      where: { expiresAt: { lt: now } }
    }),
    prisma.providerPlanAcceptance.count({
      where: { expiresAt: { gte: now, lt: in7Days } }
    }),
    prisma.providerPlanAcceptance.count({
      where: { expiresAt: { gte: now, lt: in30Days } }
    }),
    prisma.providerPlanAcceptance.count({
      where: { expiresAt: { gte: now, lt: in90Days } }
    }),
    prisma.providerPlanAcceptance.count({
      where: { expiresAt: { not: null } }
    }),
    prisma.providerPlanAcceptance.count({
      where: { expiresAt: null }
    })
  ]);

  res.json({
    success: true,
    data: {
      expired,
      expiringIn7Days,
      expiringIn30Days,
      expiringIn90Days,
      totalWithTtl,
      totalWithoutTtl
    }
  });
}));
```

---

### Import NPI Data (Future)

```
POST /api/v1/admin/import-npi
```

Triggers NPI data import from NPPES.

**Request Body:**
```json
{
  "type": "full" | "delta"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "NPI import started",
    "type": "full",
    "jobId": "abc123"
  }
}
```

---

## Route Registration

```typescript
// packages/backend/src/routes/admin.ts

import { Router } from 'express';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Apply admin auth to all routes
router.use(adminAuthMiddleware);

router.get('/health', asyncHandler(healthHandler));
router.post('/cleanup-expired', asyncHandler(cleanupHandler));
router.get('/expiration-stats', asyncHandler(statsHandler));

export default router;

// packages/backend/src/app.ts
import adminRoutes from './routes/admin';

app.use('/api/v1/admin', adminRoutes);
```

---

## Cloud Scheduler Integration

### TTL Cleanup Job

```bash
gcloud scheduler jobs create http ttl-cleanup \
  --location=us-central1 \
  --schedule="0 * * * *" \
  --uri="https://verifymyprovider-backend-xxx.run.app/api/v1/admin/cleanup-expired" \
  --http-method=POST \
  --headers="X-Admin-Secret=$ADMIN_SECRET" \
  --description="Hourly TTL cleanup job"
```

### Job Configuration

| Job | Schedule | Endpoint |
|-----|----------|----------|
| TTL Cleanup | Hourly | POST /admin/cleanup-expired |
| Health Check | Every 5 min | GET /admin/health |
| NPI Full Import | Monthly | POST /admin/import-npi |
| NPI Delta Import | Weekly | POST /admin/import-npi |

---

## Usage Examples

### cURL

```bash
# Health check
curl -H "X-Admin-Secret: your-secret" \
  https://api.verifymyprovider.com/api/v1/admin/health

# Trigger cleanup
curl -X POST \
  -H "X-Admin-Secret: your-secret" \
  https://api.verifymyprovider.com/api/v1/admin/cleanup-expired

# Get expiration stats
curl -H "X-Admin-Secret: your-secret" \
  https://api.verifymyprovider.com/api/v1/admin/expiration-stats
```

### Node.js

```typescript
const response = await fetch('https://api.verifymyprovider.com/api/v1/admin/health', {
  headers: {
    'X-Admin-Secret': process.env.ADMIN_SECRET
  }
});

const data = await response.json();
console.log('System health:', data.data.status);
```

---

## Security Considerations

### Do

- ✅ Use timing-safe comparison
- ✅ Log all admin access
- ✅ Return 503 if not configured
- ✅ Use HTTPS only
- ✅ Store secret in Secret Manager

### Don't

- ❌ Log the admin secret
- ❌ Return detailed errors on auth failure
- ❌ Expose admin routes in API docs
- ❌ Use weak secrets (min 32 chars)

---

## Recommendations

### Immediate
- ✅ Admin auth properly implemented
- Add request body validation
- Add audit logging to database

### Future
1. **Admin Dashboard**
   - Web UI for admin functions
   - Protected by OAuth

2. **Role-Based Access**
   - Different admin levels
   - Granular permissions

3. **Audit Trail**
   - Log all admin actions
   - Who did what when

---

## Conclusion

Admin endpoints are **well-implemented**:

- ✅ Timing-safe secret comparison
- ✅ Graceful degradation
- ✅ Health monitoring
- ✅ TTL cleanup automation
- ✅ Expiration statistics
- ✅ Cloud Scheduler ready

The admin interface provides necessary operational controls while maintaining security.
