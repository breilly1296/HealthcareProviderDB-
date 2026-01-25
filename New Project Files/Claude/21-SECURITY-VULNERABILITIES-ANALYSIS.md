# VerifyMyProvider Security Vulnerabilities

**Last Updated:** January 25, 2026
**Last Audit:** January 2026 (ZeroPath + Manual Review)

---

## Critical Summary

| Severity | Open | In Progress | Fixed |
|----------|------|-------------|-------|
| Critical | 1 | 0 | 1 |
| High | 1 | 0 | 2 |
| Medium | 2 | 0 | 2 |
| Low | 2 | 0 | 0 |

---

## Open Vulnerabilities

### [VMP-2026-005] Exposed Credentials in Repository

**Severity:** CRITICAL
**Status:** OPEN (Immediate action required)
**Found:** January 25, 2026 by Code Analysis

**Description:**
Database credentials and Anthropic API key are committed in .env files in the repository.

**Location:**
- `.env` (root) - DATABASE_URL with password
- `packages/frontend/.env.local` - ANTHROPIC_API_KEY
- `packages/backend/.env` - DATABASE_URL

**Vulnerability:**
```
DATABASE_URL="postgresql://postgres:[PASSWORD]@35.223.46.51:5432/providerdb"
ANTHROPIC_API_KEY=sk-ant-api03-[EXPOSED]
```

**Impact:**
- Unauthorized database access
- Data breach potential
- API key abuse and charges

**Fix Plan:**
1. **Immediate:** Rotate all exposed credentials
2. **Short-term:** Remove .env files from git history (BFG)
3. **Long-term:** Implement GCP Secret Manager

**Timeline:** ASAP (today)

---

### [VMP-2026-006] In-Memory Rate Limiting Architecture

**Severity:** HIGH
**Status:** OPEN (Pre-scaling requirement)
**Found:** January 25, 2026 by Architecture Review

**Description:**
Rate limiting uses per-process in-memory storage. Won't scale horizontally.

**Location:**
`packages/backend/src/middleware/rateLimiter.ts`

**Vulnerability:**
```typescript
// Each Cloud Run instance has independent counters
const requestCounts = new Map<string, {...}>();
```

**Impact:**
- With 5 instances: 50 verifications/hour effective limit (10 × 5)
- Attackers can bypass by distributing requests

**Fix Plan:**
1. **Current mitigation:** maxInstances=1
2. **Before scaling:** Implement Redis-based rate limiting

**Timeline:** Before horizontal scaling

---

### [VMP-2026-007] Admin Secret Timing Attack

**Severity:** MEDIUM
**Status:** OPEN (Low practical risk)
**Found:** January 25, 2026 by Code Review

**Description:**
Admin authentication uses basic string comparison vulnerable to timing attacks.

**Location:**
`packages/backend/src/routes/admin.ts` line 33

**Vulnerability:**
```typescript
if (providedSecret !== adminSecret) // Timing vulnerable
```

**Fix:**
```typescript
import { timingSafeEqual } from 'crypto';
const provided = Buffer.from(providedSecret);
const secret = Buffer.from(adminSecret);
if (!timingSafeEqual(provided, secret)) // Secure
```

**Impact:** Low - timing attacks difficult over network

**Timeline:** Next security update

---

### [VMP-2026-008] CAPTCHA Fails Open

**Severity:** MEDIUM
**Status:** OPEN (Architectural decision)
**Found:** January 25, 2026 by Code Review

**Description:**
When Google reCAPTCHA API returns an error, requests are allowed through.

**Location:**
`packages/backend/src/middleware/captcha.ts`

**Vulnerability:**
```typescript
} catch (error) {
  console.error('[CAPTCHA] Error:', error);
  return next(); // Allows request through
}
```

**Impact:**
- During Google API outages, bot protection disabled
- Could be exploited during DDoS on Google

**Fix Plan:**
Consider fail-closed with queue or rate limit fallback

**Timeline:** Future consideration

---

## Fixed Vulnerabilities

### [VMP-2026-001] Unauthenticated Verification Spam

**Fixed:** January 2026
**Severity:** Medium (CVSS 7.1)
**Found:** ZeroPath scan

**Description:**
No rate limiting on verification endpoints allowed unlimited spam.

**Fix:**
Added IP-based rate limiting (10/hour for verify, 10/hour for vote).

**Files changed:**
- Added: `packages/backend/src/middleware/rateLimiter.ts`
- Modified: `packages/backend/src/routes/verify.ts`

---

### [VMP-2026-002] Verification Threshold Bypass

**Fixed:** January 2026
**Severity:** Critical (CVSS 9.2)
**Found:** ZeroPath scan

**Description:**
Could change provider acceptance status without meeting verification threshold.

**Fix:**
Added verification threshold check:
- Requires ≥3 verifications
- Score must be ≥60
- 2:1 majority ratio required

**Files changed:**
- `packages/backend/src/services/verificationService.ts`

---

### [VMP-2026-003] PII in Public Responses

**Fixed:** January 2026
**Severity:** Medium
**Found:** Code review

**Description:**
Public verification responses included PII fields (sourceIp, userAgent).

**Fix:**
Excluded PII fields from public API responses.

**Files changed:**
- `packages/backend/src/services/verificationService.ts`

---

### [VMP-2026-004] Legacy Vulnerable Endpoint

**Fixed:** January 2026
**Severity:** High
**Found:** Code review

**Description:**
Legacy verification endpoint at root `src/api/routes.ts` lacked security controls.

**Fix:**
Removed legacy endpoint entirely.

**Files changed:**
- Removed: `src/api/routes.ts`
- Modified: `src/index.ts`

---

## Low Priority Issues

### [VMP-2026-009] No Admin Action Audit Logging

**Severity:** LOW
**Status:** OPEN

**Description:**
Admin operations not specifically logged for audit trail.

**Impact:** Cannot trace admin actions

**Recommendation:** Add structured logging for admin operations

---

### [VMP-2026-010] verificationId Weak Validation

**Severity:** LOW
**Status:** OPEN

**Description:**
verificationId uses minimal string validation instead of CUID format.

**Location:**
`packages/backend/src/routes/verify.ts` line 35

**Recommendation:** Add CUID validation

---

## Security Improvements Made

### January 2026
- Rate limiting implemented on all endpoints
- CAPTCHA protection on verification/vote
- Vote deduplication by IP
- Sybil attack prevention indexes
- TTL on verification data (6 months)
- Helmet.js security headers
- CORS whitelist configuration
- Request ID correlation
- Privacy-preserving logging

---

## npm audit Results

**Last Run:** January 25, 2026

```bash
# Run audit
cd packages/backend && npm audit
cd packages/frontend && npm audit
```

**Action Items:**
- [ ] Review and update vulnerable dependencies
- [ ] Run `npm audit fix` where safe

---

## Next Security Audit

**Scheduled:** Before beta launch
**Focus Areas:**
- Authentication when added
- New endpoints
- Dependency vulnerabilities

---

## Recommendations

### Immediate (Today)
1. Rotate exposed credentials
2. Remove .env from git history
3. Implement Secret Manager

### Short-term (This Week)
1. Use timingSafeEqual for admin auth
2. Add admin action logging
3. Run npm audit fix

### Long-term (Pre-scale)
1. Redis-based rate limiting
2. Consider fail-closed CAPTCHA
3. Regular security audits

---

*Report security issues responsibly to the maintainers*
