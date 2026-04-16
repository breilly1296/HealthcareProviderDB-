---
tags:
  - documentation
  - architecture
  - implemented
type: prompt
priority: 2
updated: 2026-04-16
role: doc-writer
output_format: document
---

# Architecture Document

## Task

Generate a Markdown document (`ARCHITECTURE.md`) that comprehensively describes the VerifyMyProvider system for a new engineer joining the team. Use the file list below as the investigation starting point, then synthesize — don't dump code. The final document should follow the **Output Format** section below.

## Files to Review
- `package.json` (root workspace configuration)
- `packages/backend/` (Express API)
- `packages/frontend/` (Next.js app)
- `packages/shared/` (shared types)
- `packages/backend/prisma/schema.prisma` (database schema)
- `packages/backend/src/index.ts` (middleware chain, CORS, health check)
- `packages/backend/src/routes/` (all route files)
- `packages/backend/src/services/` (business logic)
- `packages/frontend/src/app/` (Next.js pages)
- `packages/frontend/src/lib/api.ts` (API client)

## Architecture Summary

### Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14.2 (App Router), React 18, TailwindCSS, React Query |
| Backend | Express.js, Prisma 5.22 ORM |
| Database | PostgreSQL 15 (Google Cloud SQL) |
| Caching | Redis (optional, in-memory fallback) |
| Infrastructure | Google Cloud Run, Artifact Registry, Secret Manager |
| CI/CD | GitHub Actions, Workload Identity Federation |
| Analytics | PostHog (privacy-preserving) |
| AI | Anthropic Claude (insurance card OCR) |

### Monorepo Structure
```
HealthcareProviderDB/
├── packages/
│   ├── backend/     Express API + Prisma
│   ├── frontend/    Next.js 14 app
│   └── shared/      TypeScript types
├── scripts/         NPI import, data cleanup
├── prisma/          Schema (symlinked)
└── prompts/         Claude project prompts
```

### Data Flow
```
User → Next.js Frontend → Express Backend → PostgreSQL
                              ↕
                         Redis Cache (optional)
                              ↕
                    External APIs (reCAPTCHA, NPI Registry)
```

## Questions to Ask
1. What are the key architectural decisions and why were they made?
2. Are there any scaling bottlenecks in the current architecture?
3. How does data flow from NPI bulk import to user-facing search?
4. What is the relationship between VerifyMyProvider and OwnMyHealth?
5. What are the planned architectural changes for the next phase?

## Checklist (things the doc must cover)
- [x] Monorepo with npm workspaces
- [x] 15+ Prisma models with relationships — link to [[01-database-schema]]
- [x] RESTful API with versioned routes (`/api/v1/`) — link to [[06-api-routes]]
- [x] Next.js App Router frontend
- [x] Dual-mode caching (Redis + in-memory) — link to [[31-redis-caching]]
- [x] 4-factor confidence scoring — link to [[12-confidence-scoring]]
- [x] Sybil attack prevention (6 layers) — link to [[36-sybil-attack-prevention]]
- [x] Privacy-preserving analytics — link to [[34-analytics-posthog]]
- [x] Docker containerization + Cloud Run — link to [[40-docker-cicd]]

## Output Format

```markdown
# VerifyMyProvider Architecture

**Last Updated:** [Date]
**Audience:** Engineers onboarding to the project

## Executive Summary
[2-3 paragraphs: what it is, who uses it, why the architecture is shaped this way]

## Stack at a Glance
[Table from "Stack" section above, with rationale column]

## Repository Layout
[Monorepo structure + what lives where]

## Request Lifecycle
[Example request traced end-to-end: User → Next.js page → API client → Express middleware chain → route → service → Prisma → Postgres → response]

## Data Model
[High-level summary; deep reference → 01-database-schema]

## External Dependencies
[reCAPTCHA, Claude, Resend, PostHog, NPI Registry, Redis; what breaks if each fails]

## Deployment Topology
[Cloud Run services, Cloud SQL, Secret Manager, Workload Identity — diagram preferred]

## Cross-Cutting Concerns
[Auth, CSRF, rate limiting, caching, confidence scoring, Sybil prevention — link to dedicated prompts]

## Scaling Bottlenecks
[Known limits + where they'd bite first at 10x / 100x traffic]

## Change Log
[Reference to 19-changelog-doc]
```

Output must be ≤800 lines, use Mermaid or ASCII diagrams where helpful, and link to sibling prompts rather than duplicate their content.
