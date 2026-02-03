# VerifyMyProvider Audit Logging Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

VerifyMyProvider implements basic audit logging through the `VerificationLog` and `VoteLog` tables. Application-level logging uses console output captured by Cloud Run. Advanced audit features are not implemented but not required for MVP.

---

## Current Logging Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Logging Layers                            │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ Application Logs│    │  Database Audit │                │
│  │                 │    │                 │                │
│  │ - Console output│    │ - VerificationLog│               │
│  │ - Request logs  │    │ - VoteLog       │                │
│  │ - Error logs    │    │ - SyncLog       │                │
│  │ - Cloud Run     │    │ - createdAt     │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                              │
│  Centralized: GCP Cloud Logging (production)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Audit Tables

### VerificationLog

```prisma
model VerificationLog {
  id                String             @id @default(cuid())
  providerNpi       String?            @db.VarChar(10)
  planId            String?            @db.VarChar(50)
  verificationType  VerificationType
  verificationSource VerificationSource
  sourceIp          String?            @db.VarChar(50)
  notes             String?            @db.Text
  captchaScore      Float?
  upvotes           Int                @default(0)
  downvotes         Int                @default(0)
  createdAt         DateTime           @default(now())
  expiresAt         DateTime?
}
```

**Captures:**
- Who: IP address (for rate limiting/Sybil prevention)
- What: Provider NPI + Plan ID + Accept/Reject
- When: createdAt timestamp
- How: Source (CROWDSOURCE, INSURANCE_CARD, etc.)
- Quality: CAPTCHA score

### VoteLog

```prisma
model VoteLog {
  id             String   @id @default(cuid())
  verificationId String
  sourceIp       String   @db.VarChar(50)
  vote           String   // 'up' or 'down'
  createdAt      DateTime @default(now())
}
```

**Captures:**
- Vote deduplication
- IP tracking for Sybil prevention
- Timestamps for analysis

### SyncLog

```prisma
model SyncLog {
  id         Int      @id @default(autoincrement())
  syncType   String   @db.VarChar(50)
  status     String   @db.VarChar(20)
  recordsProcessed Int?
  startedAt  DateTime @default(now())
  completedAt DateTime?
  error      String?
}
```

**Captures:**
- NPI data import history
- Success/failure status
- Processing metrics

---

## Application Logging

### Console Output

```typescript
// Rate limit events
console.log(`[RateLimit:${name}] 429 - IP: ${ip}`);

// CAPTCHA events
console.log(`[CAPTCHA] Score: ${score}, IP: ${ip}`);
console.warn(`[CAPTCHA] Low score - possible bot: ${score}`);

// Verification events
console.log(`[Verify] New submission - NPI: ${npi}, Plan: ${planId}`);

// Error events
console.error(`[Error] ${error.message}`, error.stack);
```

### Structured Logging (Future)

```typescript
// Recommended format for production
logger.info({
  event: 'verification_submitted',
  npi: npi,
  planId: planId,
  ip: req.ip,
  captchaScore: score,
  timestamp: new Date().toISOString()
});
```

---

## What Is Logged

### Security Events

| Event | Logged | Location |
|-------|--------|----------|
| Rate limit exceeded | ✅ Yes | Console |
| CAPTCHA failure | ✅ Yes | Console |
| CAPTCHA low score | ✅ Yes | Console |
| Admin auth failure | ✅ Yes | Console |
| Verification submission | ✅ Yes | DB + Console |
| Vote submission | ✅ Yes | DB |

### Business Events

| Event | Logged | Location |
|-------|--------|----------|
| Provider search | ❌ No | - |
| Provider view | ❌ No | - |
| Verification submitted | ✅ Yes | VerificationLog |
| Vote cast | ✅ Yes | VoteLog |
| NPI data sync | ✅ Yes | SyncLog |
| TTL cleanup | ✅ Yes | Console |

---

## Cloud Logging Integration

### Production Setup

```yaml
# Cloud Run automatically captures stdout/stderr
spec:
  template:
    spec:
      containers:
        - name: backend
          # Logs automatically sent to Cloud Logging
```

### Log Viewing

```bash
# View recent logs
gcloud logging read "resource.type=cloud_run_revision" \
  --project=verifymyprovider \
  --limit=100

# Filter by severity
gcloud logging read "severity>=WARNING" \
  --project=verifymyprovider

# Search for rate limit events
gcloud logging read "textPayload:\"RateLimit\"" \
  --project=verifymyprovider
```

---

## What Is NOT Logged

### Privacy-Preserving Gaps

| Data | Status | Reason |
|------|--------|--------|
| Full IP addresses | ⚠️ Temporary | Rate limiting only, not stored long-term |
| User agents | ❌ No | Privacy |
| Search queries | ❌ No | Privacy |
| Provider views | ❌ No | No tracking |

### Potential Additions

| Feature | Priority | Notes |
|---------|----------|-------|
| Request ID tracing | Medium | Correlate logs across services |
| Slow query logging | Low | Performance debugging |
| API usage metrics | Medium | Analytics |

---

## Security Checklist

### Current Audit Logging
- [x] Verification submissions logged
- [x] Vote submissions logged
- [x] Rate limit events logged
- [x] CAPTCHA failures logged
- [x] Admin auth failures logged
- [x] NPI sync status logged
- [x] Timestamps on all records

### Not Implemented
- [ ] Structured JSON logging
- [ ] Request ID correlation
- [ ] Log retention policies
- [ ] Alert on suspicious patterns
- [ ] Admin action logging

---

## Recommendations

### Immediate
1. **Add structured logging format**
   ```typescript
   const logger = pino({
     level: process.env.LOG_LEVEL || 'info',
     formatters: {
       level: (label) => ({ level: label })
     }
   });
   ```

2. **Add request ID middleware**
   ```typescript
   app.use((req, res, next) => {
     req.id = crypto.randomUUID();
     res.setHeader('X-Request-ID', req.id);
     next();
   });
   ```

### Medium Priority
1. Set up Cloud Logging alerts for:
   - High rate of 429 responses
   - CAPTCHA failures spike
   - Admin auth failures

2. Create log-based metrics dashboard

### Future
1. Consider dedicated logging service (Datadog, etc.)
2. Implement log retention policies
3. Add audit trail for admin actions

---

## Conclusion

Current audit logging is **adequate for MVP**:

- ✅ Security events captured
- ✅ Verification audit trail exists
- ✅ Vote deduplication tracked
- ✅ Cloud Logging for production

**Improvements for production scale:**
- Structured JSON logging
- Request ID correlation
- Alerting on suspicious patterns
