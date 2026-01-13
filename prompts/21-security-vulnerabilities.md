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
   - Expected: Medium severity (CVSS 7.1) - unauthenticated verification spam

2. What file and lines?
   - Expected: `packages/backend/src/api/routes.ts` (lines 348-515)

3. What's the specific vulnerability?
   - No rate limiting on verification endpoints?

4. What's the attack scenario?
   - Spam verifications?
   - Vote manipulation?

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
- File: `packages/backend/src/api/routes.ts`
- Lines: 348-515
- Endpoints:
  - `POST /providers/:npi/verify`
  - `POST /verifications/:id/vote`

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

### [VMP-2026-XXX] Example Fixed Vulnerability

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
