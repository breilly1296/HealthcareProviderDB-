---
tags:
  - security
  - logging
  - medium
type: prompt
priority: 3
---

# Audit Logging Review

## Files to Review
- `packages/backend/src/middleware/requestLogger.ts` (✅ IMPLEMENTED - structured logging)
- `packages/backend/src/routes/` (logging in route handlers)
- `prisma/schema.prisma` (VerificationLog model for audit trail)
- `packages/backend/src/services/verificationService.ts` (verification audit logic)

## VerifyMyProvider Audit Architecture
- **HIPAA Required:** NO (no PHI = simpler logging)
- **Purpose:** Track actions for debugging, not compliance
- **Scope:** Much simpler than OwnMyHealth

## Checklist

### 1. What to Log (Simpler Than OwnMyHealth)
- [ ] Verification submissions (NPI, plan, accepted, IP)
- [ ] Vote submissions (verification ID, vote, IP)
- [ ] Rate limit hits (IP, endpoint, timestamp)
- [ ] API errors (endpoint, error type, not full stack)
- [ ] Authentication events (when auth is added)

### 2. What NOT to Log
- [ ] User passwords (never)
- [ ] Full stack traces in production
- [ ] Database query results (can be large)
- [ ] CSRF tokens
- [ ] Session IDs

### 3. Current Logging (✅ IMPLEMENTED Jan 2026)
- [x] Structured JSON logging via `requestLogger.ts` middleware
- [x] Cloud Run compatible (structured for Cloud Logging)
- [x] Request ID generation and correlation (X-Request-ID header)
- [x] Response time tracking
- [x] Rate limit info extraction and logging
- [x] PII exclusion in application logs (no IP addresses, user agents in request logs)
- [x] In-memory buffer for statistics (last 20 logs)
- [x] Production JSON format, development colored console

**Privacy-Preserving Design:**
```typescript
// From requestLogger.ts - explicitly excludes PII from application/request logs
// No IP addresses in request logs
// No user agents in request logs
// No identifying information in structured logs
```

**Important distinction — Application Logs vs Database Storage:**
- **Application logs** (`requestLogger.ts`): Do NOT contain IP addresses or user agents
- **Database audit tables**: DO store IPs for anti-abuse purposes:
  - `VerificationLog.sourceIp` — stored for Sybil attack prevention (30-day duplicate check)
  - `VerificationLog.userAgent` — stored for abuse analysis
  - `VoteLog.sourceIp` — stored for vote deduplication (unique constraint)
- **API responses**: PII is stripped before returning via `stripVerificationPII()` in `verificationService.ts`
- This is intentional: IPs are needed for anti-abuse but are NOT exposed in logs or API responses

## Questions to Ask

1. **Is any logging currently implemented?**
2. **Should we implement audit logging now or later?**
3. **What events are most important to track?**
4. **How long should logs be retained?** (Not 7 years like HIPAA!)
5. **Should verifications be logged for spam detection?**

## Output Format

```markdown
# VerifyMyProvider Audit Logging

**Last Updated:** [Date]
**HIPAA Required:** NO
**Purpose:** Debugging + spam detection

---

## What to Log
[List]

## What NOT to Log
[List]

## Current Implementation
[Description]

## Retention Policy
[Duration]

## Next Steps
[Actions]
```
