---
tags:
  - index
  - meta
type: meta
priority: 1
updated: 2026-04-16
---

# VerifyMyProvider Prompts Index

**Target Market:** NYC (5 boroughs) — ~50-75K providers | **Launch:** Q2 2026
**Note:** 6 states (FL, AL, AK, AR, AZ, CA) were imported for pipeline testing; NYC is the launch dataset.

Quick reference for all available prompts.

---

## Shared References

Files prefixed with `_` are shared reference docs — other prompts link to them rather than duplicate content.

| File | Purpose |
|---|---|
| [[_env-vars-reference]] | Canonical env-var inventory. Link from security/deploy prompts instead of restating. |
| [[_frontmatter-schema]] | Required frontmatter fields for all prompts in this directory. |

---

## Security & Architecture Prompts (01-13)

| # | Prompt | Purpose | Priority |
|---|--------|---------|----------|
| 01 | [[01-database-schema]] | 21 Prisma models, indexes, relationships | Critical |
| 02 | [[02-no-hipaa-compliance]] | Why no HIPAA needed (public data + encrypted card PII) | Critical |
| 03 | [[03-authentication]] | Magic link auth, JWT sessions, admin secret | High |
| 04 | [[04-csrf]] | CSRF double-submit cookie (implemented via csrf-csrf) | High |
| 05 | [[05-audit-logging]] | Structured logging, PII exclusion, DB audit trail | Medium |
| 06 | [[06-api-routes]] | All API endpoints: providers, plans, verify, auth, admin, saved, card | High |
| 07 | [[07-input-validation]] | Zod validation on all endpoints | High |
| 08 | [[08-rate-limiting]] | Dual-mode (Redis/in-memory), sliding window, CAPTCHA | Critical |
| 09 | [[09-external-apis]] | 5 APIs: reCAPTCHA, Claude, PostHog, NPI Registry, Redis | Medium |
| 10 | [[10-frontend-structure]] | Next.js 15+ pages, 70+ components, auth, map, dashboard | Medium |
| 11 | [[11-environment-secrets]] | 25+ env vars, GCP Secret Manager, CI/CD injection | Critical |
| 12 | [[12-confidence-scoring]] | 4-factor algorithm (25/30/25/20), specialty-aware | High |
| 13 | [[13-npi-data-pipeline]] | Import scripts, taxonomy mapping, data quality | High |

---

## Documentation Prompts (14-25)

| # | Prompt | Generates | Status |
|---|--------|-----------|--------|
| 14 | [[14-strategy-doc]] | Business strategy | Template (Q&A) |
| 15 | [[15-deployment-guide]] | Deployment guide | Populated — Docker, Cloud Run, CI/CD |
| 16 | [[16-architecture-doc]] | Architecture doc | Populated — full-stack overview |
| 17 | [[17-api-reference-doc]] | API reference | Populated — all endpoints cataloged |
| 18 | [[18-troubleshooting-doc]] | Troubleshooting | Populated — known issues + workarounds |
| 19 | [[19-changelog-doc]] | Changelog | Populated — Jan 2026 milestones |
| 20 | [[20-known-issues-doc]] | Known issues | Populated — 14 known issues |
| 21 | [[21-security-vulnerabilities]] | Security vulns | Accurate — 4 ZeroPath findings resolved |
| 22 | [[22-ecosystem-integration]] | Ecosystem strategy | Template (Q&A) |
| 23 | [[23-data-quality-tracker]] | Data quality | Populated — NPI, plans, verification quality |
| 24 | [[24-development-workflow]] | Dev workflow | Accurate |
| 25 | [[25-progress-status]] | Progress tracker | Template (Q&A) |

---

## Meta Prompts (26-27)

| # | Prompt | Purpose |
|---|--------|---------|
| 26 | [[26-full-security-audit]] | Run all security prompts (checklist + summary) |
| 27 | [[27-captcha-integration]] | CAPTCHA implementation (reCAPTCHA v3) |

---

## Feature Prompts (28-46)

| # | Prompt | Purpose | Status |
|---|--------|---------|--------|
| 28 | [[28-location-features]] | Location abstraction (practice_locations) | Active |
| 29 | [[29-insurance-card-upload]] | Insurance card OCR + encrypted storage + dashboard | Updated |
| 30 | [[30-testing-strategy]] | Testing approach | Reference |
| 31 | [[31-redis-caching]] | Redis caching strategy | Reference |
| 32 | [[32-ttl-data-expiration]] | TTL and data expiration | Reference |
| 33 | [[33-provider-comparison]] | Provider comparison feature | Reference |
| 34 | [[34-analytics-posthog]] | PostHog analytics (privacy-preserving) | Updated |
| 35 | [[35-monorepo-structure]] | npm workspace monorepo | Reference |
| 36 | [[36-sybil-attack-prevention]] | 6-layer anti-spam (all implemented) | Updated |
| 37 | [[37-error-handling]] | AppError class + asyncHandler | Accurate |
| 38 | [[38-admin-endpoints]] | Admin endpoints reference | Reference |
| 39 | [[39-insurance-plans]] | Insurance plans feature (end-to-end) | **New** |
| 40 | [[40-docker-cicd]] | Docker + CI/CD pipeline | **New** |
| 41 | [[41-frontend-data-fetching]] | React Query, API client, state management | **New** |
| 42 | [[42-provider-detail-page]] | Provider detail page architecture | **New** |
| 43 | [[43-search-architecture]] | Search flow (frontend + backend) | **New** |
| 44 | [[44-seo-sitemap]] | SEO strategy, dynamic sitemap, provider page ISR | Reference |
| 45 | [[45-user-accounts]] | Magic link auth, saved providers, bookmarks | Reference |
| 46 | [[46-map-geospatial]] | Map page, geolocation, Google Maps integration | Reference |

---

## Operational Prompts (47-49)

| # | Prompt | Purpose | Status |
|---|--------|---------|--------|
| 47 | [[47-observability-logging]] | Logging, error tracking, metrics, alerting gap analysis | **New** |
| 48 | [[48-database-migrations]] | Prisma migration workflow, rollback, zero-downtime patterns | **New** |
| 49 | [[49-testing-strategy-deep-dive]] | Coverage audit, flake, contract/security tests | **New** |

---

## Archive

Historical / one-off content has been moved to `archive/`:

- `archive/PROMPT-AUDIT-REPORT-2026-02-18.md` — Feb 2026 accuracy audit. Findings already integrated into individual prompts.
- `archive/Hospital Data Pull/` — One-off NYC hospital affiliation research task from Jan 2026.

---

## Quick Start

### New to the Project?
1. Start with [[16-architecture-doc]] to understand the system
2. Read [[01-database-schema]] for the data model
3. Check [[20-known-issues-doc]] for current limitations
4. Read [[15-deployment-guide]] for setup instructions

### Running a Security Audit?
1. Use [[26-full-security-audit]] for comprehensive review
2. Or run individual prompts 01-13 as needed
3. Check [[21-security-vulnerabilities]] for resolved findings
4. Check [[36-sybil-attack-prevention]] for anti-spam layers

### Understanding a Feature?
1. **Search flow:** [[43-search-architecture]]
2. **Provider detail:** [[42-provider-detail-page]]
3. **Insurance plans:** [[39-insurance-plans]]
4. **Data fetching:** [[41-frontend-data-fetching]]
5. **Confidence scoring:** [[12-confidence-scoring]]
6. **User accounts:** [[45-user-accounts]]
7. **Map/geospatial:** [[46-map-geospatial]]

### Updating Documentation?
1. Run individual prompts 14-25 as needed
2. All doc prompts have context and questions pre-populated

### Troubleshooting?
1. Check [[18-troubleshooting-doc]] for known solutions
2. Check [[20-known-issues-doc]] for known limitations
3. Check [[24-development-workflow]] for dev environment setup

---

## Usage Tips

### In Claude Code
Best for prompts that scan code:
- 01-13 (security & architecture audits)
- 39-46 (feature deep-dives)
- 47-49 (observability, migrations, testing)
- 16-architecture-doc, 17-api-reference-doc

### In Claude.ai
Best for Q&A prompts:
- 14-strategy-doc
- 18-troubleshooting-doc
- 22-ecosystem-integration
- 24-development-workflow
- 25-progress-status

---

## Key Differences from OwnMyHealth

| Aspect | OwnMyHealth | VerifyMyProvider |
|--------|-------------|------------------|
| HIPAA | Required | NOT required |
| Encryption | PHI at rest | AES for card PII only |
| Compliance | Complex | Simple |
| Auth | Full accounts | Magic link + JWT (implemented Feb 2026) |
| Data Type | Private health | Public provider data |

---

## Prompt Maintenance

These prompts should be updated when:
- New features are added or existing features change significantly
- Security vulnerabilities are discovered or resolved
- Architecture changes (new services, database changes, etc.)
- New external API integrations are added

Frontmatter conventions: see [[_frontmatter-schema]]. Bump `updated:` when content changes.

**Last full audit:** 2026-02-18 (archived at `archive/PROMPT-AUDIT-REPORT-2026-02-18.md`)
**Last prompt-collection cleanup:** 2026-04-16 (added shared references, prompts 47-49, Response Format blocks, archived stale audit)
