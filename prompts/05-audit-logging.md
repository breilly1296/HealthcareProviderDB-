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
- `packages/backend/src/services/auditLog.ts` (if exists)
- `packages/backend/src/api/routes.ts` (check for logging)
- `packages/backend/prisma/schema.prisma` (AuditLog model if exists)

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

### 3. Current Logging
- [ ] Console.log statements (development only?)
- [ ] Cloud Run logs (automatic)
- [ ] Structured logging? (JSON format?)

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
