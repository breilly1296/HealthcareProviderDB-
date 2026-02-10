# Security Vulnerabilities - VerifyMyProvider

## Overview

This document tracks security vulnerabilities discovered in VerifyMyProvider, their resolution status, and the current security posture of the application. All findings from the initial security audit (January 2026) have been resolved.

---

## ZeroPath Security Audit - January 2026

Four vulnerabilities were identified during an automated security scan. **All four have been resolved.**

---

### VMP-2026-001: Unauthenticated Verification Spam

| Field | Value |
|---|---|
| **ID** | VMP-2026-001 |
| **Severity** | Medium |
| **CVSS Score** | 7.1 |
| **Status** | RESOLVED |
| **Found** | January 2026 |
| **Fixed** | January 2026 |

**Description:**
The `POST /api/verifications` endpoint accepted verification submissions without any rate limiting or bot detection. An attacker could flood the system with fake verifications, corrupting the verification data and confidence scores.

**Attack Vector:**
Simple automated HTTP requests to the verification endpoint. No authentication or CAPTCHA was required. An attacker could submit thousands of fake verifications per minute from a single IP.

**Impact:**
- Verification data integrity compromised
- Confidence scores rendered meaningless
- Database storage exhaustion over time

**Resolution:**
- Added IP-based rate limiting: 10 verifications per hour per IP address
- Added reCAPTCHA v3 on verification submission with server-side score validation
- Duplicate submission detection: same IP + NPI + plan within a time window is rejected

---

### VMP-2026-002: Verification Threshold Bypass

| Field | Value |
|---|---|
| **ID** | VMP-2026-002 |
| **Severity** | Critical |
| **CVSS Score** | 9.2 |
| **Status** | RESOLVED |
| **Found** | January 2026 |
| **Fixed** | January 2026 |

**Description:**
The verification confidence scoring system did not enforce a minimum threshold check before accepting new verifications. An attacker who controlled enough IPs (or used proxies) could systematically shift confidence scores for any provider-plan pair to any desired value.

**Attack Vector:**
Coordinated submissions from multiple IPs or proxies. By submitting a critical mass of verifications with a target `acceptsInsurance` value, an attacker could override legitimate community verification data.

**Impact:**
- Complete manipulation of provider-plan verification status
- Users would see incorrect insurance acceptance information
- Undermined trust in the entire verification system

**Resolution:**
- Implemented threshold check requiring minimum verification count before confidence scores are considered authoritative
- Added Sybil attack prevention with 4 layers of defense:
  1. IP-based rate limiting (10/hr per IP)
  2. reCAPTCHA v3 bot detection
  3. Duplicate submission detection
  4. Vote weight decay for repeated votes from the same IP
- Source diversity factor in confidence scoring: verifications from the same IP range are weighted less

---

### VMP-2026-003: PII in Public Responses

| Field | Value |
|---|---|
| **ID** | VMP-2026-003 |
| **Severity** | Medium |
| **CVSS Score** | N/A (Medium) |
| **Status** | RESOLVED |
| **Found** | January 2026 |
| **Fixed** | January 2026 |

**Description:**
Public API responses for verification data included internal fields that could be considered personally identifiable information, such as full source IP addresses of verification submitters and internal database identifiers.

**Attack Vector:**
Any unauthenticated API consumer could retrieve verification data containing submitter IP addresses by querying the public verification endpoints.

**Impact:**
- IP addresses of verification submitters exposed to any API consumer
- Privacy violation for users who submitted verifications
- Potential for targeted harassment of submitters

**Resolution:**
- Implemented `stripVerificationPII()` utility function applied to all public verification responses
- Strips: source IP addresses, internal audit fields, full database record IDs
- Admin endpoints retain full detail (behind X-Admin-Secret authentication)
- Structured logging also ensures PII is not written to logs

---

### VMP-2026-004: Legacy Vulnerable Endpoint

| Field | Value |
|---|---|
| **ID** | VMP-2026-004 |
| **Severity** | High |
| **CVSS Score** | N/A (High) |
| **Status** | RESOLVED |
| **Found** | January 2026 |
| **Fixed** | January 2026 |

**Description:**
A legacy file `src/api/routes.ts` contained an older version of the API routes that lacked the security controls (rate limiting, CAPTCHA, input validation) present in the current route handlers. The legacy file was still being loaded by the Express application, creating duplicate endpoints without protections.

**Attack Vector:**
An attacker could discover the legacy endpoints (same paths but served by the old handler) and bypass all security controls added to the current route handlers.

**Impact:**
- Complete bypass of rate limiting on all endpoints
- Verification spam without CAPTCHA
- Unvalidated input reaching the database

**Resolution:**
- Removed the legacy `src/api/routes.ts` file entirely
- Verified no other legacy or duplicate route files exist
- All routes now served exclusively by the secured route handlers in the modular route structure

---

## Current Security Controls

### Application-Level Security

| Control | Implementation | Coverage |
|---|---|---|
| **Rate Limiting** | Dual-mode (Redis/in-memory), per-IP, per-endpoint | All public endpoints |
| **CAPTCHA** | reCAPTCHA v3 with server-side score validation | Write endpoints (verify, vote) |
| **Input Validation** | Zod schemas on all request bodies and parameters | All endpoints |
| **Security Headers** | Helmet middleware (CSP, HSTS, X-Frame-Options, etc.) | All responses |
| **CORS** | Whitelist-based origin validation | All cross-origin requests |
| **Admin Auth** | Timing-safe string comparison of X-Admin-Secret header | All admin endpoints |
| **PII Stripping** | `stripVerificationPII()` on all public verification responses | Verification endpoints |
| **Structured Logging** | PII-free JSON logs with correlation IDs | All server-side logging |

### Infrastructure Security

| Control | Implementation | Status |
|---|---|---|
| **HTTPS** | Cloud Run managed TLS certificates | Active |
| **Database Auth** | Cloud SQL IAM authentication + connection proxy | Active |
| **Secret Management** | GitHub Secrets for CI/CD, Cloud Run env vars for runtime | Active |
| **Container Security** | Multi-stage Docker builds with Alpine base | Active |
| **Automated Deployment** | GitHub Actions CI/CD (no manual server access needed) | Active |

---

## Open Security Gaps

### No Automated SAST/DAST in CI

**Risk:** Medium
**Description:** The CI/CD pipeline does not include Static Application Security Testing (SAST) or Dynamic Application Security Testing (DAST) tools. Vulnerabilities in dependencies or code patterns may not be caught until manual review.

**Recommendation:** Add `npm audit` to the CI pipeline. Consider integrating CodeQL, Snyk, or Semgrep for SAST. For DAST, consider OWASP ZAP scans against the staging environment.

---

### No Cloud Armor

**Risk:** Medium
**Description:** Google Cloud Armor is not configured, leaving the application without Layer 7 DDoS protection, bot management, or WAF rules at the infrastructure level. All abuse prevention relies on application-layer rate limiting.

**Recommendation:** Configure Cloud Armor with a security policy. This requires migrating ingress to a Global External Application Load Balancer in front of Cloud Run. Prioritize this before high-traffic launch.

---

### Incomplete .env.example

**Risk:** Low
**Description:** The `.env.example` file does not document all environment variables. A new developer or deployment could miss a critical configuration variable, potentially running with insecure defaults.

**Recommendation:** Audit all `process.env` references in the codebase. Update `.env.example` with every variable, its purpose, whether it is required, and a safe example value.

---

## Vulnerability Response Process

1. **Discovery:** Vulnerabilities may be found via automated scanning, manual audit, or community report
2. **Triage:** Assess severity using CVSS where applicable, determine affected scope
3. **Fix:** Develop and test the fix in a local environment
4. **Deploy:** Push to GitHub, automated CI/CD deploys to Cloud Run
5. **Verify:** Confirm the fix via the staging or production environment
6. **Document:** Update this document with the finding, resolution, and any remaining risk
