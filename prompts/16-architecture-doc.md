---
tags:
  - documentation
  - architecture
  - implemented
type: prompt
priority: 2
updated: 2026-02-05
---

# Architecture Document

## Purpose
Generate a comprehensive architecture document for VerifyMyProvider covering the full-stack monorepo, data flow, and infrastructure.

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

## Checklist
- [x] Monorepo with npm workspaces
- [x] 13 Prisma models with proper relationships
- [x] RESTful API with versioned routes (`/api/v1/`)
- [x] Client-side React app with App Router
- [x] Dual-mode caching (Redis + in-memory)
- [x] 4-factor confidence scoring algorithm
- [x] Sybil attack prevention (4 layers)
- [x] Privacy-preserving analytics
- [x] Docker containerization
- [x] Cloud Run deployment with auto-scaling
