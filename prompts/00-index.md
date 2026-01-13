---
tags:
  - index
  - meta
type: index
priority: 1
---

# VerifyMyProvider Prompts Index

Quick reference for all available prompts.

---

## Security Audit Prompts (01-13)

| # | Prompt | Purpose | Priority |
|---|--------|---------|----------|
| 01 | [[01-database-schema]] | Schema security, indexes, RLS | Critical |
| 02 | [[02-no-hipaa-compliance]] | Why no HIPAA needed | Critical |
| 03 | [[03-authentication]] | Auth strategy (none → lightweight) | High |
| 04 | [[04-csrf]] | CSRF protection planning | Medium |
| 05 | [[05-audit-logging]] | What to log, what not to log | Medium |
| 06 | [[06-api-routes]] | Route security, authorization | High |
| 07 | [[07-input-validation]] | UUID, string validation | High |
| 08 | [[08-rate-limiting]] | **CRITICAL** Spam vulnerability | Critical |
| 09 | [[09-external-apis]] | FHIR, NPI Registry security | Medium |
| 10 | [[10-frontend-structure]] | Next.js app, components | Medium |
| 11 | [[11-environment-secrets]] | Secret management | Critical |
| 12 | [[12-confidence-scoring]] | 0-100 algorithm | High |
| 13 | [[13-npi-data-pipeline]] | Import scripts, data quality | High |

---

## Documentation Prompts (14-25)

| # | Prompt | Generates | Method |
|---|--------|-----------|--------|
| 14 | [[14-strategy-doc]] | STRATEGY.md | Q&A |
| 15 | [[15-deployment-guide]] | DEPLOYMENT.md | Code + Q&A |
| 16 | [[16-architecture-doc]] | ARCHITECTURE.md | Code + Q&A |
| 17 | [[17-api-reference-doc]] | API_REFERENCE.md | Code |
| 18 | [[18-troubleshooting-doc]] | TROUBLESHOOTING.md | Q&A |
| 19 | [[19-changelog-doc]] | CHANGELOG.md | Git + Q&A |
| 20 | [[20-known-issues-doc]] | KNOWN_ISSUES.md | Code + Q&A |
| 21 | [[21-security-vulnerabilities]] | SECURITY_VULNERABILITIES.md | Code + Q&A |
| 22 | [[22-ecosystem-integration]] | ECOSYSTEM.md | Q&A |
| 23 | [[23-data-quality-tracker]] | DATA_QUALITY.md | Code + Q&A |
| 24 | [[24-development-workflow]] | DEV_WORKFLOW.md | Q&A |
| 25 | [[25-progress-status]] | PROGRESS.md | Q&A |

---

## Meta Prompts (26-27)

| # | Prompt | Purpose |
|---|--------|---------|
| 26 | [[26-full-security-audit]] | Run all security prompts |
| 27 | [[27-full-doc-refresh]] | Generate all documentation |

---

## Quick Start

### New to the Project?
1. Start with [[16-architecture-doc]] to understand the system
2. Read [[15-deployment-guide]] for GCP setup
3. Check [[20-known-issues-doc]] for current bugs

### Running a Security Audit?
1. **URGENT:** Check [[08-rate-limiting]] - critical vulnerability
2. Use [[26-full-security-audit]] for comprehensive review
3. Or run individual prompts 01-13 as needed
4. Update [[21-security-vulnerabilities]] with findings

### Updating Documentation?
1. Use [[27-full-doc-refresh]] for complete refresh
2. Or run individual prompts 14-25 as needed

### Troubleshooting?
1. Check [[18-troubleshooting-doc]] for known solutions
2. Check [[20-known-issues-doc]] for known bugs
3. Check [[24-development-workflow]] for golden rule reminder

---

## Usage Tips

### In Claude Code
Best for prompts that scan code:
- 01-13 (security audits)
- 16-architecture-doc
- 17-api-reference-doc
- 20-known-issues-doc
- 23-data-quality-tracker

### In Claude.ai
Best for Q&A prompts:
- 14-strategy-doc
- 18-troubleshooting-doc
- 22-ecosystem-integration
- 24-development-workflow
- 25-progress-status

### Either Works
Mixed prompts that need both:
- 15-deployment-guide
- 21-security-vulnerabilities

---

## Key Differences from OwnMyHealth

| Aspect | OwnMyHealth | VerifyMyProvider |
|--------|-------------|------------------|
| HIPAA | Required | NOT required |
| Encryption | PHI at rest | Not needed |
| Compliance | Complex | Simple |
| Auth | Full accounts | None → Lightweight |
| Data Type | Private health | Public provider data |

---

## Prompt Maintenance

These prompts should be updated when:
- New security areas need coverage
- New document types needed
- Prompt format improvements identified
- VerifyMyProvider architecture changes significantly
- Security vulnerabilities discovered or resolved
