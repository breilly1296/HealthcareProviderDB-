# VerifyMyProvider Audit Logging Review

**Last Updated:** January 25, 2026
**Priority:** Medium
**HIPAA Required:** NO
**Purpose:** Debugging + spam detection

---

## Current Implementation Status

### Request Logging (IMPLEMENTED)

**Location:** `packages/backend/src/middleware/requestLogger.ts`

**Features:**
- [x] Structured JSON logging via middleware
- [x] Cloud Run compatible (structured for Cloud Logging)
- [x] Request ID generation and correlation (X-Request-ID header)
- [x] Response time tracking
- [x] Rate limit info extraction and logging
- [x] PII exclusion (no IP addresses, user agents in logs)
- [x] In-memory buffer for statistics (last 20 logs)
- [x] Production JSON format, development colored console

---

## Privacy-Preserving Design

```typescript
// From requestLogger.ts - explicitly excludes PII
// No IP addresses logged
// No user agents logged
// No identifying information captured
```

**What IS Logged:**
- Request method and path
- Response status code
- Response time
- Rate limit remaining
- Request ID for correlation

**What is NOT Logged:**
- IP addresses
- User agents
- Request bodies
- Full stack traces in production

---

## What to Log

### Required Logging
| Event | Purpose | Status |
|-------|---------|--------|
| Verification submissions | Spam detection | Partial (DB only) |
| Vote submissions | Manipulation detection | Partial (DB only) |
| Rate limit hits | Attack detection | Logged |
| API errors | Debugging | Logged |
| Admin actions | Audit trail | NOT LOGGED |

### Database Audit Trail
The `VerificationLog` table serves as the primary audit trail:
- NPI and plan verified
- Verification source (CMS, CROWDSOURCE, etc.)
- Timestamp
- sourceIp (for Sybil prevention)
- upvotes/downvotes

---

## What NOT to Log

| Data | Reason | Status |
|------|--------|--------|
| User passwords | Security | Never logged |
| Full stack traces (prod) | Information leak | Production-safe |
| Database query results | Can be large | Not logged |
| CSRF tokens | Security | Never logged |
| Session IDs | Security | Not applicable (no auth) |

---

## Logging Gaps Identified

### Gap 1: Admin Actions Not Logged
**Issue:** Cleanup and admin operations not specifically tracked
**Impact:** No audit trail for administrative actions
**Recommendation:** Add structured logging for admin operations

```typescript
// Recommended implementation
logger.info('Admin action', {
  action: 'cleanup-expired',
  deletedRecords: count,
  dryRun: false,
  adminIp: req.ip,
  timestamp: new Date().toISOString()
});
```

### Gap 2: No WHO Tracking
**Issue:** VerificationLog has timestamps but no user identification
**Impact:** Cannot trace who made changes
**Status:** Acceptable for anonymous system; track if adding auth

### Gap 3: No Retention Policy
**Issue:** No automatic log rotation/cleanup at database level
**Status:** TTL on VerificationLog (6 months) partially addresses this

---

## Log Structure (Production)

```json
{
  "timestamp": "2026-01-25T10:30:00.000Z",
  "level": "info",
  "requestId": "uuid-here",
  "method": "POST",
  "path": "/api/v1/verify",
  "statusCode": 201,
  "responseTime": 150,
  "rateLimit": {
    "limit": 10,
    "remaining": 8,
    "reset": 1706180000
  }
}
```

---

## Cloud Logging Integration

### Current Configuration
- Structured JSON format in production
- Compatible with GCP Cloud Logging
- Request ID header support

### Viewing Logs
```bash
# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=verifymyprovider-backend" --limit 50

# Filter for errors
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit 50
```

---

## Retention Policy

### Current
- Application logs: Cloud Logging default (30 days)
- VerificationLog: 6 months (TTL field)
- SyncLog: Indefinite (no TTL)

### Recommended
| Log Type | Retention | Rationale |
|----------|-----------|-----------|
| Access logs | 30 days | Standard |
| Error logs | 90 days | Debugging |
| VerificationLog | 6 months | Provider turnover rate |
| SyncLog | 1 year | Import history |
| Admin actions | 1 year | Compliance |

---

## Comparison to HIPAA Requirements

| Requirement | HIPAA | VerifyMyProvider | Notes |
|-------------|-------|------------------|-------|
| Audit trail | Required | Partial | VerificationLog |
| Retention | 7 years | 6 months | No PHI, shorter OK |
| Access logging | Required | Not needed | No PHI access |
| Encryption | Required | Not required | Public data |

**Conclusion:** Simpler logging requirements than HIPAA-covered entities.

---

## Spam Detection via Logs

### Patterns to Monitor
1. **High volume from single IP**
   - Query: Count verifications by IP per hour
   - Alert threshold: >10 verifications

2. **Conflicting verifications**
   - Query: Same NPI+plan with different results
   - Alert: Many conflicts indicate manipulation

3. **Burst patterns**
   - Query: Time distribution of verifications
   - Alert: Unnatural clustering

### Monitoring Queries
```sql
-- Verifications per IP (last 24h)
SELECT source_ip, COUNT(*) as count
FROM verification_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY source_ip
ORDER BY count DESC
LIMIT 10;

-- Conflicting verifications
SELECT provider_npi, plan_id,
       COUNT(CASE WHEN new_value->>'accepted' = 'true' THEN 1 END) as accepts,
       COUNT(CASE WHEN new_value->>'accepted' = 'false' THEN 1 END) as rejects
FROM verification_logs
GROUP BY provider_npi, plan_id
HAVING COUNT(*) > 1;
```

---

## Recommendations

### Immediate
1. Add structured logging for admin actions
2. Document log retention policy

### Short-term
1. Set up Cloud Logging alerts for suspicious patterns
2. Create dashboard for verification velocity
3. Add log sampling for high-volume endpoints

### Long-term
1. Implement log aggregation for analytics
2. Add anomaly detection for spam patterns
3. Consider BigQuery export for historical analysis

---

## Implementation Checklist

### Current State
- [x] Structured request logging
- [x] Request ID correlation
- [x] Response time tracking
- [x] Privacy-preserving (no PII)
- [x] Cloud Logging compatible
- [ ] Admin action logging
- [ ] Retention policy enforcement
- [ ] Alerting configuration

### Before Beta
- [ ] Add admin action logging
- [ ] Set up basic monitoring alerts
- [ ] Document log access procedures

---

*Logging implementation is appropriate for current scale and compliance requirements*
