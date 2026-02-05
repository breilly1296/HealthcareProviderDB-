---
tags:
  - security
  - meta
type: prompt
priority: 2
updated: 2026-02-05
---

# Full Security Audit

## Purpose
Meta-prompt that runs a comprehensive security audit by referencing all security-related prompts. Use this as a checklist for a complete review.

## Security Prompts to Run

### Critical Priority
| # | Prompt | Focus Area | Key Concern |
|---|--------|------------|-------------|
| 01 | [[01-database-schema]] | Schema security, indexes, constraints | 13 models, proper indexes, no RLS needed |
| 02 | [[02-no-hipaa-compliance]] | HIPAA compliance position | Public data only, no PHI stored |
| 08 | [[08-rate-limiting]] | Rate limiting, spam prevention | Dual-mode Redis/in-memory, 4 tiers |
| 11 | [[11-environment-secrets]] | Secret management | 20+ env vars, GCP Secret Manager |

### High Priority
| # | Prompt | Focus Area | Key Concern |
|---|--------|------------|-------------|
| 03 | [[03-authentication]] | Authentication strategy | Admin via X-Admin-Secret, no user auth yet |
| 06 | [[06-api-routes]] | Route security, authorization | All public, rate-limited, CAPTCHA on writes |
| 07 | [[07-input-validation]] | Input validation | Zod schemas on all endpoints |
| 12 | [[12-confidence-scoring]] | Scoring algorithm integrity | 4-factor, manipulation resistance |
| 27 | [[27-captcha-integration]] | Bot prevention | reCAPTCHA v3, fail-open/closed modes |
| 36 | [[36-sybil-attack-prevention]] | Anti-spam, data poisoning | 4 layers, all implemented |

### Medium Priority
| # | Prompt | Focus Area | Key Concern |
|---|--------|------------|-------------|
| 04 | [[04-csrf]] | CSRF protection | Not needed yet (no auth cookies) |
| 05 | [[05-audit-logging]] | Logging, PII exclusion | App logs PII-free, DB stores IPs for anti-abuse |
| 09 | [[09-external-apis]] | External API security | 5 APIs: reCAPTCHA, Claude, PostHog, NPI, Redis |
| 21 | [[21-security-vulnerabilities]] | Known vulnerabilities | 4 ZeroPath findings, all resolved |
| 37 | [[37-error-handling]] | Error handling security | AppError class, no stack traces in production |

## Audit Procedure
1. Run each prompt in order (critical → high → medium)
2. Check each prompt's checklist items against actual code
3. Flag any new findings not covered by existing prompts
4. Update `21-security-vulnerabilities.md` with any new findings
5. Update relevant prompts with corrected status

## Security Summary (As of Feb 2026)
- **Authentication:** Admin-only (header secret, timing-safe comparison)
- **Rate Limiting:** 4 tiers per endpoint, dual-mode Redis/in-memory
- **CAPTCHA:** reCAPTCHA v3 on verification/vote, fail-open with fallback
- **Input Validation:** Zod on all endpoints
- **Secrets:** GCP Secret Manager, no hardcoded secrets
- **Logging:** PII-free application logs, IPs stored in DB for anti-abuse only
- **Error Handling:** No stack traces in production, structured error responses
- **Sybil Prevention:** Rate limiting + CAPTCHA + vote dedup + 30-day windows
- **HIPAA:** Not required (public provider data only)

## Questions to Ask
1. When was the last full security review?
2. Have there been any security incidents or near-misses?
3. Should we engage an external penetration tester?
4. Are there any compliance requirements beyond what's documented?
5. Should we implement automated security scanning (SAST/DAST) in CI?
