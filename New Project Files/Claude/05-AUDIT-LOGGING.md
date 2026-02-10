# Audit Logging - VerifyMyProvider

## Overview

VerifyMyProvider implements structured logging for **debugging and spam detection** purposes. HIPAA-compliant audit logging is **not required** because the application stores only public provider data and anonymous user interactions. The logging system is designed for operational observability on Google Cloud Run, not regulatory compliance.

---

## Implementation Status

| Component | Status | Date |
|---|---|---|
| Structured JSON request logging | Implemented | January 2026 |
| Cloud Run / Cloud Logging integration | Implemented | January 2026 |
| Request ID correlation | Implemented | January 2026 |
| Response time tracking | Implemented | January 2026 |
| Rate limit info extraction | Implemented | January 2026 |
| In-memory log buffer for stats | Implemented | January 2026 |
| PII stripping from API responses | Implemented | January 2026 |

---

## Request Logger Middleware

The primary logging mechanism is the `requestLogger.ts` middleware, which produces structured JSON logs on every request.

### Log Structure

```json
{
  "timestamp": "2026-01-15T14:30:00.000Z",
  "requestId": "abc123-def456",
  "method": "GET",
  "path": "/api/v1/providers/search",
  "statusCode": 200,
  "responseTime": 45,
  "query": { "name": "Smith", "state": "NY" },
  "rateLimit": {
    "limit": 100,
    "remaining": 87,
    "status": "ok"
  }
}
```

### What Is Logged

| Field | Source | Purpose |
|---|---|---|
| `timestamp` | Server clock | Event ordering |
| `requestId` | `X-Request-ID` header or generated UUID | Cross-service correlation |
| `method` | HTTP method | Request classification |
| `path` | Request URL path | Route identification |
| `statusCode` | Express response | Success/failure tracking |
| `responseTime` | Start-to-finish timer (ms) | Performance monitoring |
| `query` | Parsed query string | Debug context (search params only) |
| `rateLimit` | Rate limiter headers | Abuse detection |

### What Is NOT Logged (Application Logs)

The `requestLogger.ts` middleware explicitly does **not** log:

| Field | Reason |
|---|---|
| IP addresses | Privacy -- not needed for application debugging |
| User-Agent strings | Privacy -- not needed for application debugging |
| Request bodies | May contain user input (notes, etc.) |
| Response bodies | May contain provider data (too verbose) |
| Cookie values | Not applicable (no cookies currently) |
| Authorization headers | Security -- never log credentials |

---

## Privacy Distinction: Application Logs vs. Database Audit

There is an important distinction between what is logged in application logs (Cloud Logging) and what is stored in database audit tables:

### Application Logs (requestLogger.ts) -- NO PII

- Written to stdout / Cloud Logging
- Used for operational debugging and performance monitoring
- Do NOT contain IP addresses or user agents
- Retained per Cloud Logging retention policy (default 30 days)

### Database Audit Tables -- Limited PII for Anti-Abuse

Certain database tables store IP addresses and user agents specifically for anti-abuse purposes:

| Table | Field | Purpose | Retention |
|---|---|---|---|
| `verification_logs` | `sourceIp` | 30-day Sybil attack detection (same IP submitting many conflicting verifications) | Indefinite (but IP can be purged) |
| `verification_logs` | `userAgent` | Bot detection (automated submission patterns) | Indefinite |
| `vote_logs` | `sourceIp` | Vote deduplication (unique constraint on `verificationId` + `sourceIp`) | Indefinite |

### Why Database Stores IPs

1. **Sybil Detection**: If the same IP submits 50 verifications claiming different providers don't accept the same insurance plan, that pattern suggests coordinated manipulation. The `sourceIp` field in `verification_logs` enables a 30-day lookback window for this check.

2. **Vote Deduplication**: The `vote_logs` table has a unique constraint on `(verificationId, sourceIp)` to prevent the same IP from voting multiple times on the same verification. This is a structural anti-abuse measure.

3. **Rate Limiting Enforcement**: While the rate limiter itself uses in-memory or Redis counters (not the database), the stored IP enables post-hoc analysis of abuse patterns.

---

## PII Stripping from API Responses

The `stripVerificationPII()` function in `verificationService.ts` removes sensitive fields before returning verification data to API consumers:

```typescript
function stripVerificationPII(verification: VerificationLog) {
  const { sourceIp, userAgent, ...safeVerification } = verification;
  return safeVerification;
}
```

This ensures that:
- API consumers never see the IP addresses of verification submitters
- User agent strings are never exposed in API responses
- The PII remains in the database for anti-abuse purposes only
- Admin endpoints may access full records (behind `X-Admin-Secret` auth)

---

## Log Formats

### Production (JSON)

In production (Cloud Run), logs are emitted as single-line JSON objects for structured ingestion by Google Cloud Logging:

```json
{"timestamp":"2026-01-15T14:30:00.000Z","requestId":"abc123","method":"GET","path":"/api/v1/providers/search","statusCode":200,"responseTime":45}
```

Cloud Logging automatically parses JSON and enables:
- Log-based metrics (request count, error rate, latency percentiles)
- Log filtering by any JSON field
- Alerting on error patterns
- Log correlation with Cloud Trace

### Development (Colored Console)

In development, logs use a human-readable colored format:

```
[14:30:00] GET /api/v1/providers/search 200 45ms [abc123]
```

Color coding:
- Green: 2xx responses
- Yellow: 3xx/4xx responses
- Red: 5xx responses

---

## Request ID Correlation

Every request is assigned a unique ID for end-to-end tracing:

1. **Incoming**: If the request includes an `X-Request-ID` header (from a load balancer, CDN, or upstream service), that ID is used
2. **Generated**: If no `X-Request-ID` header is present, a UUID v4 is generated
3. **Propagated**: The request ID is:
   - Included in all log entries for this request
   - Set as a response header (`X-Request-ID`) so the client can reference it
   - Available in the request context for downstream service calls

This enables tracing a single user action across logs, even in concurrent/high-traffic scenarios.

---

## In-Memory Log Buffer

The application maintains an in-memory buffer of the last 20 request log entries for the admin stats endpoint:

```typescript
const LOG_BUFFER_SIZE = 20;
const recentLogs: RequestLogEntry[] = [];

function addToBuffer(entry: RequestLogEntry) {
  recentLogs.push(entry);
  if (recentLogs.length > LOG_BUFFER_SIZE) {
    recentLogs.shift();
  }
}
```

This buffer is accessible via the admin health endpoint and provides a quick snapshot of recent request activity without querying Cloud Logging.

**Limitations**:
- Only the last 20 entries are retained
- Buffer is process-local (not shared across Cloud Run instances)
- Buffer is lost on process restart
- Not suitable for historical analysis (use Cloud Logging for that)

---

## Rate Limit Logging

The request logger extracts rate limit information from response headers and includes it in log entries:

```typescript
const rateLimitInfo = {
  limit: res.getHeader('X-RateLimit-Limit'),
  remaining: res.getHeader('X-RateLimit-Remaining'),
  status: res.getHeader('X-RateLimit-Status'), // "ok", "degraded", or absent
};
```

This enables:
- Monitoring how close users are to their rate limits
- Detecting when the rate limiter falls back to degraded mode (Redis failure)
- Identifying IPs that consistently hit limits (potential abuse)

---

## What Is NOT Implemented (And Why)

| Feature | Status | Reason |
|---|---|---|
| HIPAA audit trail | Not implemented | Not required -- no PHI in the system |
| User action audit log | Not implemented | No user accounts yet (Phase 1) |
| Database change log (CDC) | Not implemented | Not needed at current scale |
| Log encryption at rest | Not implemented | Cloud Logging handles encryption by default |
| Tamper-proof log storage | Not implemented | No regulatory requirement |
| Access logging for provider records | Not implemented | Provider data is public; no access controls needed |
| Detailed request body logging | Not implemented | Privacy -- would capture user-submitted notes |

---

## Future Considerations

When user accounts are added (Phase 2/3), the logging system should be extended with:

1. **User action audit log**: Record account creation, login, logout, profile changes, subscription changes
2. **Verification attribution**: Link verifications to authenticated user IDs (in addition to IP)
3. **Admin action log**: Record all admin operations with the authenticated admin identity
4. **Log retention policy**: Define and enforce retention periods for different log categories
5. **Log-based alerting**: Set up alerts for anomalous patterns (spike in 401s, unusual verification volume)
