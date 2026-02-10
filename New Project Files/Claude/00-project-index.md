# VerifyMyProvider Project Knowledge

## Project Overview

**VerifyMyProvider** is a community-driven healthcare provider database that helps patients verify whether their doctor accepts their insurance plan.

- **Target market:** New York City (5 boroughs) with approximately 50,000-75,000 providers
- **Launch target:** Q2 2026
- **Data note:** 6 states (FL, AL, AK, AR, AZ, CA) have been imported for pipeline testing purposes. NYC is the launch dataset.

---

## Project File Index

### Security & Architecture (01-13)

| # | File | Description |
|---|------|-------------|
| 01 | `01-database-schema.md` | PostgreSQL database schema, Prisma models, table relationships, field mappings |
| 02 | `02-no-hipaa-compliance.md` | HIPAA non-applicability analysis; public NPI data does not constitute PHI |
| 03 | `03-authentication.md` | Authentication architecture, session management, auth flows |
| 04 | `04-csrf.md` | CSRF protection strategy and implementation |
| 05 | `05-audit-logging.md` | Audit logging for verifications, votes, and administrative actions |
| 06 | `06-api-routes.md` | Complete API route inventory with methods, middleware, and response shapes |
| 07 | `07-validation.md` | Input validation rules, Zod schemas, sanitization |
| 08 | `08-rate-limiting.md` | Rate limiting configuration per endpoint, Redis-backed limiter |
| 09 | `09-external-apis.md` | External API integrations (NPI Registry, CMS, geocoding) |
| 10 | `10-frontend-architecture.md` | Next.js 14 frontend structure, component hierarchy, routing |
| 11 | `11-secrets-management.md` | Environment variables, secret storage, deployment secrets |
| 12 | `12-confidence-scoring.md` | Confidence score algorithm, decay, verification weighting |
| 13 | `13-npi-pipeline.md` | NPI data import pipeline, CSV processing, enrichment workflow |

### Documentation (14-25)

| # | File | Description |
|---|------|-------------|
| 14 | `14-documentation-strategy.md` | Documentation standards and maintenance approach |
| 15 | `15-deployment.md` | Deployment architecture, Google Cloud, CI/CD pipeline |
| 16 | `16-architecture.md` | System architecture overview, monorepo structure, technology stack |
| 17 | `17-api-reference-doc.md` | Public API reference documentation |
| 18 | `18-troubleshooting-doc.md` | Common issues, debugging procedures, error resolution |
| 19 | `19-changelog.md` | Version history and change log |
| 20 | `20-known-issues.md` | Known bugs, limitations, and workarounds |
| 21 | `21-security-vulns.md` | Security vulnerability tracking and remediation status |
| 22 | `22-ecosystem.md` | Package ecosystem, dependency management, workspace configuration |
| 23 | `23-data-quality.md` | Data quality metrics, validation rules, enrichment coverage |
| 24 | `24-dev-workflow.md` | Developer workflow, branching strategy, code review process |
| 25 | `25-progress-status.md` | Project progress tracking and milestone status |

### Meta (26-27)

| # | File | Description |
|---|------|-------------|
| 26 | `26-full-security-audit.md` | Comprehensive security audit findings and recommendations |
| 27 | `27-captcha-integration.md` | CAPTCHA integration for verification and anti-bot protection |

### Features (28-44)

| # | File | Description |
|---|------|-------------|
| 28 | `28-location-features.md` | Location-based search, geocoding, borough mapping |
| 29 | `29-insurance-card-upload.md` | Insurance card OCR upload feature design |
| 30 | `30-testing.md` | Testing strategy, test infrastructure, coverage targets |
| 31 | `31-redis.md` | Redis configuration, caching architecture, session store |
| 32 | `32-ttl-strategy.md` | Cache TTL policies per data type, invalidation strategy |
| 33 | `33-provider-comparison.md` | Side-by-side provider comparison feature (max 4 providers) |
| 34 | `34-analytics-posthog.md` | PostHog analytics integration, event tracking, dashboards |
| 35 | `35-monorepo.md` | npm workspaces monorepo structure, package boundaries, shared code |
| 36 | `36-sybil-prevention.md` | Sybil attack prevention for community verifications |
| 37 | `37-error-handling.md` | Error handling patterns, error boundaries, global error context |
| 38 | `38-admin-endpoints.md` | Administrative API endpoints, data management, moderation tools |
| 39 | `39-insurance-plans.md` | Insurance plan data model, plan search, issuer grouping |
| 40 | `40-docker-ci-cd.md` | Docker containerization, CI/CD pipeline, deployment automation |
| 41 | `41-frontend-data-fetching.md` | Frontend data fetching, React Query, custom hooks, API client |
| 42 | `42-provider-detail-page.md` | Provider detail page architecture, SSR/ISR, component tree |
| 43 | `43-search-architecture.md` | End-to-end search flow, name parsing, filtering, pagination |
| 44 | `44-seo-sitemap.md` | SEO strategy, dynamic sitemap, metadata, structured data |

---

## Quick Start for New Developers

For the fastest path to understanding the codebase, read these files in order:

1. **`16-architecture.md`** -- System architecture overview, monorepo structure, and technology stack. Start here to understand the big picture.

2. **`01-database-schema.md`** -- Database schema and Prisma models. Understanding the data model is essential before diving into features.

3. **`20-known-issues.md`** -- Known bugs, limitations, and workarounds. Read this early to avoid wasting time on documented issues.

4. **`15-deployment.md`** -- Deployment architecture and environment configuration. Needed to set up a local development environment.

---

## Technology Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14.2, React 18, TailwindCSS |
| Backend | Express, Node.js |
| ORM | Prisma |
| Database | PostgreSQL (Google Cloud SQL) |
| Cache | Redis |
| Analytics | PostHog |
| Monorepo | npm workspaces |
| Deployment | Google Cloud, Docker |

## Database

- **Name:** `verifymyprovider`
- **Host:** Google Cloud SQL (PostgreSQL)
- **Schema management:** Prisma with `@@map` / `@map` conventions for PascalCase models over snake_case tables
