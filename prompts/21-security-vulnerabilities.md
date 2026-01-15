---
tags:
  - security
  - vulnerabilities
  - critical
type: prompt
priority: 1
---

# Generate SECURITY_VULNERABILITIES.md

## Purpose
Track security vulnerabilities from audits (ZeroPath, manual review, etc.)

## From Codebase (Claude Code)
Run quick security scans:
```bash
# Check for hardcoded secrets
grep -r "sk-ant\|password.*=.*['\"]" packages/backend/src/ --include="*.ts"

# Check for console.log with sensitive data
grep -r "console\.log.*password\|console\.log.*token" packages/backend/src/

# Check npm vulnerabilities
cd packages/backend && npm audit

# Find security TODOs
grep -r "TODO.*security\|FIXME.*security" packages/backend/src/
```

## Questions to Ask

### Last Security Audit
1. When was the last security audit?
   - Expected: ZeroPath scan (date?)

2. What tool was used?
   - ZeroPath?
   - Manual review?
   - npm audit?

3. What was the overall result/grade?
   - How many findings by severity?

### ZeroPath Findings
1. What did ZeroPath find?
   - Medium severity (CVSS 7.1) - unauthenticated verification spam - **FIXED Jan 2026**
   - Critical severity (CVSS 9.2) - verification threshold bypass - **FIXED Jan 2026**

2. What files were affected?
   - Original: `packages/backend/src/api/routes.ts` (removed)
   - Current routes: `packages/backend/src/routes/verify.ts`
   - Rate limiter: `packages/backend/src/middleware/rateLimiter.ts`

3. What was fixed?
   - Rate limiting added to verification/vote endpoints
   - Verification threshold required before status changes
   - PII excluded from public responses
   - Legacy vulnerable endpoint removed

### Current Vulnerabilities

For each finding:
1. **What's the vulnerability?**
   - Description
   - File and line numbers
   - Code snippet

2. **What's the severity?**
   - Critical? High? Medium? Low?
   - CVSS score if available

3. **What's the exploit scenario?**
   - How could an attacker abuse this?
   - What's the impact?

4. **What's the status?**
   - Open?
   - In progress?
   - Fixed?

5. **What's the fix plan?**
   - Short-term mitigation?
   - Long-term fix?
   - Timeline?

### npm audit Results
1. Any critical/high severity npm vulnerabilities?
2. Which packages are affected?
3. Is there a fix available? (update, patch, workaround)

### Historical Vulnerabilities
1. Any vulnerabilities that were found and fixed?
2. What was the fix?
3. When was it fixed?
4. Any lessons learned?

### False Positives
1. Any findings that were determined to be false positives?
2. Why were they false positives?
3. Should they be suppressed in future scans?

### Accepted Risks
1. Any vulnerabilities that are accepted (not fixing)?
2. Why accepted?
3. What's the risk mitigation?

## Output Format

```markdown
# VerifyMyProvider Security Vulnerabilities

**Last Updated:** [Date]
**Last Audit:** [Date] by [Tool]

---

## Critical Summary

| Severity | Open | In Progress | Fixed |
|----------|------|-------------|-------|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 1 | 0 | 0 |
| Low | 0 | 0 | 0 |

---

## Open Vulnerabilities

### [VMP-2026-001] Unauthenticated Verification Spam

**Severity:** Medium (CVSS 7.1)  
**Status:** Open (blocking beta launch)  
**Found:** [Date] by ZeroPath

**Description:**
[Full description]

**Location:**
- File: `packages/backend/src/routes/verify.ts`
- Endpoints:
  - `POST /api/v1/verify`
  - `POST /api/v1/verify/:id/vote`

**Vulnerability:**
```typescript
[code snippet showing no rate limiting]
```

**Exploit Scenario:**
1. [step-by-step attack]
2. [impact on database]
3. [impact on users]

**Impact:**
- Confidence scores can be manipulated
- Database can be poisoned with spam
- Crowdsource competitive moat destroyed

**Fix Plan:**

*Short-term (Tier 1):*
- [ ] Add IP-based rate limiting (10/hour for verify, 20/hour for vote)
- [ ] Deploy within [timeline]

*Long-term (Tier 2-3):*
- [ ] Add fingerprinting
- [ ] Add CAPTCHA
- [ ] Add user accounts
- [ ] Add anomaly detection

**Timeline:** [ETA]

**References:**
- ZeroPath Report: [link if available]
- Related: [[08-rate-limiting]]

---

## In Progress

[Any vulnerabilities currently being fixed]

---

## Fixed Vulnerabilities

### [VMP-2026-001] Unauthenticated Verification Spam

**Fixed:** January 2026
**Severity:** Medium (CVSS 7.1)
**Found:** ZeroPath scan

**Description:** No rate limiting on verification endpoints allowed unlimited spam

**Fix:** Added IP-based rate limiting (10/hour for verify, 10/hour for vote, 100/hour for search)

**Files changed:**
- Added: `packages/backend/src/middleware/rateLimiter.ts`
- Modified: `packages/backend/src/routes/verify.ts`

---

### [VMP-2026-002] Verification Threshold Bypass

**Fixed:** January 2026
**Severity:** Critical (CVSS 9.2)
**Found:** ZeroPath scan

**Description:** Could change provider acceptance status without meeting verification threshold

**Fix:** Added verification threshold check before allowing status changes

**Files changed:**
- `packages/backend/src/services/verificationService.ts`

---

### [VMP-2026-003] PII in Public Responses

**Fixed:** January 2026
**Severity:** Medium
**Found:** Code review

**Description:** Public verification responses included PII fields

**Fix:** Excluded PII fields from public API responses

**Files changed:**
- `packages/backend/src/services/verificationService.ts`

---

### [VMP-2026-004] Legacy Vulnerable Endpoint

**Fixed:** January 2026
**Severity:** High
**Found:** Code review

**Description:** Legacy verification endpoint at `src/api/routes.ts` lacked security controls

**Fix:** Removed legacy endpoint entirely

**Files changed:**
- Removed: `src/api/routes.ts`
- Modified: `src/index.ts`

---

### [VMP-2026-XXX] Example Fixed Vulnerability Template

**Fixed:** [Date]
**Severity:** [severity]
**Found:** [Date] by [tool/person]

**Description:** [what it was]

**Fix:** [what was done]

**Verification:** [how fix was verified]

---

## npm audit Results

**Last Run:** [Date]

```bash
[paste npm audit output]
```

**Action Items:**
- [ ] Update [package] to fix [CVE]
- [ ] [other actions]

---

## False Positives

| Finding | Tool | Reason for FP |
|---------|------|---------------|
| [finding] | [tool] | [explanation] |

---

## Accepted Risks

| Vulnerability | Severity | Accepted By | Mitigation |
|---------------|----------|-------------|------------|
| [vuln] | [severity] | [person] | [mitigation] |

---

## Security Improvements Made

**2026:**
- [Date]: [improvement]
- [Date]: [improvement]

---

## Next Security Audit

**Scheduled:** [Date]  
**Tool:** [Tool]  
**Focus Areas:** [areas]
```
