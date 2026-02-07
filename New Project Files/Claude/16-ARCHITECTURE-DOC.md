# VerifyMyProvider - Architecture Document

**Version:** 1.0.0
**Last Updated:** 2026-02-07
**Repository:** [github.com/breilly1296/HealthcareProviderDB-](https://github.com/breilly1296/HealthcareProviderDB-.git)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [System Architecture Overview](#4-system-architecture-overview)
5. [Database Architecture](#5-database-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Shared Package](#8-shared-package)
9. [Data Flow](#9-data-flow)
10. [Caching Strategy](#10-caching-strategy)
11. [Security Architecture](#11-security-architecture)
12. [Confidence Scoring Algorithm](#12-confidence-scoring-algorithm)
13. [AI Integration](#13-ai-integration)
14. [Infrastructure and Deployment](#14-infrastructure-and-deployment)
15. [CI/CD Pipeline](#15-cicd-pipeline)
16. [Analytics](#16-analytics)
17. [Data Pipeline and Import Scripts](#17-data-pipeline-and-import-scripts)
18. [Key Architectural Decisions](#18-key-architectural-decisions)
19. [Scaling Considerations](#19-scaling-considerations)
20. [Appendix: API Reference](#20-appendix-api-reference)

---

## 1. Executive Summary

VerifyMyProvider is a full-stack web application that helps patients verify whether healthcare providers accept their insurance plans. It combines authoritative CMS/NPPES data with crowdsourced community verifications to produce research-backed confidence scores for provider-plan acceptance.

The application is part of the broader **OwnMyHealth** ecosystem, which aims to empower patients with the information they need to make informed healthcare decisions.

**Core Problem:** Insurance provider directories are notoriously inaccurate. Research shows 12% annual provider network turnover (Ndumele et al. 2018, Health Affairs), meaning patients frequently find that listed providers don't actually accept their insurance.

**Solution:** A community-verified database that combines official CMS data with crowdsourced verifications, using a 4-factor confidence scoring algorithm based on published academic research.

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | Next.js (App Router) | 14.2 | Server-side rendering, routing, API routes |
| **Frontend** | React | 18.3 | UI component library |
| **Frontend** | TailwindCSS | 3.3 | Utility-first CSS framework |
| **Frontend** | TanStack React Query | 5.x | Server state management, caching |
| **Frontend** | Lucide React | 0.563 | Icon library |
| **Frontend** | PostHog | 1.321 | Privacy-preserving analytics |
| **Frontend** | Zod | 3.25 | Client-side schema validation |
| **Backend** | Express.js | 4.18 | HTTP server framework |
| **Backend** | Prisma | 5.22 | ORM and database client |
| **Backend** | Zod | 3.22 | Request validation |
| **Backend** | Pino | 10.3 | Structured JSON logging |
| **Backend** | Helmet | 7.1 | Security HTTP headers |
| **Backend** | ioredis | 5.9 | Redis client (optional) |
| **Database** | PostgreSQL | 15 | Primary data store (Google Cloud SQL) |
| **Caching** | Redis | Optional | Distributed cache (in-memory fallback) |
| **AI** | Anthropic Claude Haiku 4.5 | - | Insurance card OCR extraction |
| **Infrastructure** | Google Cloud Run | - | Container hosting with auto-scaling |
| **Infrastructure** | Google Artifact Registry | - | Docker image storage |
| **Infrastructure** | Google Secret Manager | - | Secrets management |
| **CI/CD** | GitHub Actions | - | Automated testing, building, deployment |
| **Testing** | Jest | 29.7 | Unit and integration tests |
| **Testing** | Playwright | 1.58 | End-to-end browser tests |
| **Language** | TypeScript | 5.3 | Static typing across entire stack |

---

## 3. Monorepo Structure

The project uses **npm workspaces** to manage a monorepo with three packages:

```
HealthcareProviderDB/
├── package.json                    # Root workspace configuration
├── tsconfig.base.json              # Shared TypeScript config
├── docker-compose.yml              # Production Docker stack
├── docker-compose.dev.yml          # Development (DB only)
├── .github/
│   └── workflows/
│       ├── deploy.yml              # Production deployment to Cloud Run
│       ├── deploy-staging.yml      # Staging deployment
│       ├── test.yml                # PR test gate
│       ├── playwright.yml          # E2E tests
│       ├── rollback.yml            # Deployment rollback
│       └── security-scan.yml       # Security scanning
├── packages/
│   ├── backend/                    # Express API + Prisma
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   ├── prisma/
│   │   │   └── schema.prisma       # 15 Prisma models
│   │   └── src/
│   │       ├── index.ts            # App entry, middleware chain
│   │       ├── config/
│   │       │   └── constants.ts    # Centralized configuration constants
│   │       ├── lib/
│   │       │   ├── prisma.ts       # Prisma client singleton
│   │       │   └── redis.ts        # Redis client singleton
│   │       ├── middleware/
│   │       │   ├── captcha.ts      # reCAPTCHA v3 verification
│   │       │   ├── errorHandler.ts # Global error handling
│   │       │   ├── honeypot.ts     # Bot detection honeypot
│   │       │   ├── httpLogger.ts   # Pino HTTP logging
│   │       │   ├── rateLimiter.ts  # Dual-mode rate limiting
│   │       │   ├── requestId.ts    # Request correlation IDs
│   │       │   ├── requestLogger.ts # Request analytics
│   │       │   └── requestTimeout.ts # Per-route timeouts
│   │       ├── routes/
│   │       │   ├── index.ts        # Route aggregator
│   │       │   ├── providers.ts    # Provider search & detail
│   │       │   ├── plans.ts        # Insurance plan endpoints
│   │       │   ├── verify.ts       # Verification submission & voting
│   │       │   ├── locations.ts    # Practice location endpoints
│   │       │   └── admin.ts        # Admin operations (protected)
│   │       ├── services/
│   │       │   ├── providerService.ts       # Provider search logic
│   │       │   ├── planService.ts           # Plan search logic
│   │       │   ├── verificationService.ts   # Verification CRUD + Sybil prevention
│   │       │   ├── confidenceService.ts     # 4-factor confidence algorithm
│   │       │   ├── confidenceDecayService.ts # Time-based score decay
│   │       │   ├── locationService.ts       # Location search + colocation
│   │       │   ├── locationEnrichment.ts    # Health system enrichment
│   │       │   └── utils.ts                 # Shared service utilities
│   │       ├── schemas/
│   │       │   └── commonSchemas.ts # Reusable Zod schemas
│   │       └── utils/
│   │           ├── cache.ts         # Dual-mode caching (Redis/memory)
│   │           ├── logger.ts        # Pino logger config
│   │           ├── responseHelpers.ts # Standardized response builders
│   │           └── insurancePlanParser.ts # Plan name parsing
│   ├── frontend/                   # Next.js 14 app
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── app/                # Next.js App Router pages
│   │       │   ├── layout.tsx      # Root layout with providers
│   │       │   ├── page.tsx        # Landing page
│   │       │   ├── search/         # Provider search
│   │       │   ├── provider/[npi]/ # Provider detail
│   │       │   ├── location/[locationId]/ # Location detail
│   │       │   ├── insurance/      # Insurance card scanner
│   │       │   ├── research/       # Research explainer
│   │       │   ├── about/          # About page
│   │       │   ├── privacy/        # Privacy policy
│   │       │   ├── terms/          # Terms of service
│   │       │   ├── disclaimer/     # Data disclaimer
│   │       │   └── api/
│   │       │       └── insurance-card/extract/ # Claude AI OCR route
│   │       ├── components/         # Reusable UI components (~50+)
│   │       │   ├── home/           # Landing page sections
│   │       │   ├── provider-detail/ # Provider detail components
│   │       │   ├── compare/        # Provider comparison
│   │       │   ├── ui/             # Base UI primitives
│   │       │   ├── icons/          # Icon components
│   │       │   └── illustrations/  # SVG illustrations
│   │       ├── context/
│   │       │   ├── ThemeContext.tsx  # Dark/light mode
│   │       │   ├── CompareContext.tsx # Provider comparison state
│   │       │   └── ErrorContext.tsx  # Global error state
│   │       ├── hooks/
│   │       │   ├── search/          # Search-specific hooks
│   │       │   ├── useProviderSearch.ts
│   │       │   ├── useInsurancePlans.ts
│   │       │   ├── useCities.ts
│   │       │   ├── useHealthSystems.ts
│   │       │   └── useRecentSearches.ts
│   │       ├── lib/
│   │       │   ├── api.ts           # API client with retry logic
│   │       │   ├── analytics.ts     # Privacy-preserving PostHog
│   │       │   ├── constants.ts     # Frontend constants
│   │       │   ├── debounce.ts      # Debounce utility
│   │       │   ├── errorUtils.ts    # Error handling utilities
│   │       │   ├── formatName.ts    # Name formatting
│   │       │   ├── imagePreprocess.ts # Image preprocessing for OCR
│   │       │   ├── insuranceCardSchema.ts # Card extraction prompts
│   │       │   ├── provider-utils.ts # Provider display utilities
│   │       │   ├── queryClient.ts   # React Query config
│   │       │   ├── rateLimit.ts     # Client-side rate limiting
│   │       │   └── utils.ts         # General utilities
│   │       └── types/
│   │           ├── index.ts         # Frontend type definitions
│   │           └── insurance.ts     # Insurance card types
│   └── shared/                     # Shared TypeScript types
│       ├── package.json
│       └── src/
│           ├── index.ts            # Re-exports all types
│           └── types/
│               ├── enums.ts        # Shared enumerations
│               ├── provider.ts     # Provider types
│               ├── insurance-plan.ts # Plan types
│               ├── provider-plan-acceptance.ts # Acceptance types
│               └── verification.ts # Verification types + scoring
├── scripts/                        # Data import and maintenance
│   ├── import-npi.ts               # NPI bulk data import
│   ├── import-npi-direct.ts        # Direct PostgreSQL import
│   ├── import-csv-copy.ts          # CSV COPY import
│   ├── enrich-providers-nppes.ts   # NPPES API enrichment
│   ├── crossref-insurance-networks.ts # Network cross-referencing
│   ├── scrape-carrier-directory.ts # Carrier directory scraping
│   ├── cleanup-deactivated-providers.ts # Data cleanup
│   ├── normalize-city-names.ts     # City name normalization
│   ├── deduplicate-locations.ts    # Location deduplication
│   ├── update-specialties.ts       # Specialty mapping updates
│   ├── recalculate-confidence.ts   # Batch confidence recalculation
│   ├── backfill-verification-ttl.ts # TTL backfill migration
│   ├── verify-data-quality.ts      # Data quality checks
│   ├── generate-dq-report.ts       # Quality report generation
│   └── audit-npi-validation.ts     # NPI validation audit
└── prompts/                        # Claude project prompts
```

### Workspace Dependency Graph

```
@healthcareproviderdb/shared (types only, no runtime deps)
         ↑                    ↑
@healthcareproviderdb/backend   @healthcareproviderdb/frontend
```

The **shared** package is built first and consumed by both backend and frontend. Root `package.json` hoists shared dependencies (prisma, csv-parse, pg) while workspace-specific dependencies remain scoped. Critically, `next` is **only** in the frontend workspace -- hoisting it to root causes SWC binary version mismatches.

---

## 4. System Architecture Overview

```
                        ┌──────────────────────┐
                        │      Internet         │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │   Google Cloud Run    │
                        │  (Load Balancer)      │
                        └──────┬───────┬───────┘
                               │       │
                ┌──────────────▼──┐ ┌──▼──────────────┐
                │    Frontend     │ │     Backend      │
                │  (Next.js 14)   │ │   (Express.js)   │
                │  Port 8080      │ │   Port 8080      │
                │  0-10 instances │ │   0-10 instances  │
                └────────┬────────┘ └───┬──────┬───────┘
                         │              │      │
                         │     ┌────────▼──┐ ┌─▼────────────┐
                         │     │  Redis    │ │  PostgreSQL   │
                         │     │ (optional)│ │ (Cloud SQL)   │
                         │     └───────────┘ │ verifymyprovider│
                         │                   └────────────────┘
                         │
              ┌──────────▼───────────┐
              │   External Services  │
              ├──────────────────────┤
              │ - Anthropic Claude   │ (Insurance card OCR)
              │ - Google reCAPTCHA   │ (Bot prevention)
              │ - PostHog Analytics  │ (Privacy-preserving)
              │ - NPI Registry API   │ (Provider enrichment)
              └──────────────────────┘
```

### Request Flow

1. User browser loads the Next.js frontend from Cloud Run
2. Frontend makes API calls to the Express backend via `NEXT_PUBLIC_API_URL`
3. Backend processes requests through the middleware chain
4. Prisma ORM queries PostgreSQL on Cloud SQL
5. Responses are cached (Redis or in-memory) for 5 minutes
6. Frontend renders results with React Query for client-side caching

---

## 5. Database Architecture

### Database: PostgreSQL 15 on Google Cloud SQL

**Database name:** `verifymyprovider`

### Entity-Relationship Diagram

```
                              ┌─────────────────────┐
                              │     Provider         │
                              │  (PK: npi VARCHAR)   │
                              └──┬──┬──┬──┬──┬──┬───┘
                                 │  │  │  │  │  │
          ┌──────────────────────┘  │  │  │  │  └──────────────────────┐
          │                         │  │  │  │                         │
          ▼                         │  │  │  │                         ▼
┌──────────────────┐               │  │  │  │             ┌─────────────────────┐
│practice_locations │               │  │  │  │             │  DataQualityAudit   │
│(FK: npi)         │               │  │  │  │             │  (FK: npi)          │
│                  │◄──┐           │  │  │  │             └─────────────────────┘
└──────────────────┘   │           │  │  │  │
                       │           │  │  │  │
                       │           │  │  │  ▼
                       │           │  │  │ ┌────────────────────┐
                       │           │  │  │ │provider_cms_details │
                       │           │  │  │ │(FK: npi, 1:1)      │
                       │           │  │  │ └────────────────────┘
                       │           │  │  │
                       │           │  │  ▼
                       │           │  │ ┌────────────────────┐
                       │           │  │ │provider_hospitals   │
                       │           │  │ │(FK: npi)           │
                       │           │  │ └────────────────────┘
                       │           │  │
                       │           │  ▼
                       │           │ ┌────────────────────┐
                       │           │ │provider_insurance   │
                       │           │ │(FK: npi)           │
                       │           │ └────────────────────┘
                       │           │
                       │           ▼
                       │  ┌────────────────────┐
                       │  │provider_taxonomies  │
                       │  │(FK: npi)           │
                       │  └────────────────────┘
                       │
                       │   ┌──────────────────────────────┐
                       │   │  ProviderPlanAcceptance       │
                       │   │  (FK: npi, plan_id, loc_id)  │
                       ├───│  Confidence scoring record    │
                       │   └──────────┬───────────────────┘
                       │              │
          ┌────────────┘              │
          │                           │
          ▼                           ▼
┌──────────────────┐      ┌───────────────────┐
│  InsurancePlan   │      │ VerificationLog   │
│ (PK: plan_id)   │◄─────│ (FK: npi, plan_id)│
└──────────────────┘      └───────┬───────────┘
                                  │
                                  ▼
                          ┌───────────────┐
                          │   VoteLog     │
                          │(FK: verif_id) │
                          └───────────────┘

  ┌───────────────────┐    ┌───────────────────┐
  │ taxonomy_reference │    │     hospitals      │
  │ (standalone)       │    │  (PK: ccn)        │
  └───────────────────┘    └───────────────────┘

  ┌───────────────────┐    ┌───────────────────┐
  │provider_medicare   │    │     SyncLog       │
  │(FK: npi)          │    │  (operational)     │
  └───────────────────┘    └───────────────────┘
```

### 15 Prisma Models

| Model | Table | PK | Purpose |
|-------|-------|-----|---------|
| `Provider` | `providers` | `npi` (VARCHAR 10) | Core provider records from NPPES |
| `practice_locations` | `practice_locations` | `id` (autoincrement) | Provider practice addresses |
| `provider_cms_details` | `provider_cms_details` | `npi` (1:1) | CMS enrichment data (medical school, telehealth) |
| `provider_hospitals` | `provider_hospitals` | `id` | Hospital affiliations |
| `provider_insurance` | `provider_insurance` | `id` | Insurance network memberships |
| `provider_medicare` | `provider_medicare` | `id` | Medicare identifiers |
| `provider_taxonomies` | `provider_taxonomies` | `id` | NUCC taxonomy codes |
| `taxonomy_reference` | `taxonomy_reference` | `taxonomy_code` | Taxonomy code lookup table |
| `hospitals` | `hospitals` | `ccn` | Hospital master data |
| `InsurancePlan` | `insurance_plans` | `plan_id` (VARCHAR 50) | Insurance plan catalog |
| `ProviderPlanAcceptance` | `provider_plan_acceptance` | `id` | Provider-plan acceptance with confidence scores |
| `VerificationLog` | `verification_logs` | `id` (CUID) | Crowdsourced verification history |
| `VoteLog` | `vote_logs` | `id` (CUID) | Community votes on verifications |
| `SyncLog` | `sync_logs` | `id` | Data sync operation logs |
| `DataQualityAudit` | `data_quality_audit` | `id` | Data quality issue tracking |

### Key Database Design Decisions

**Prisma Schema Conventions:** The schema uses `@@map("table_name")` for PascalCase model names mapped to snake_case PostgreSQL tables, and `@map("column_name")` for camelCase field names mapped to snake_case columns.

**Partial Unique Indexes:** `ProviderPlanAcceptance` uses PostgreSQL partial unique indexes (managed via raw SQL, not Prisma) to enforce uniqueness:
- `UNIQUE(npi, plan_id, location_id) WHERE location_id IS NOT NULL` -- location-specific
- `UNIQUE(npi, plan_id) WHERE location_id IS NULL` -- legacy NPI-level

**Application-Generated PKs:** `VerificationLog` and `VoteLog` use `@default(cuid())` for TEXT primary keys, enabling distributed ID generation without database sequences.

**TTL-Based Expiration:** Both `VerificationLog` and `ProviderPlanAcceptance` have `expiresAt` fields for 6-month TTL. Legacy records (pre-TTL) have `expiresAt: null` and are preserved via `OR [null, gt: now]` filters.

**Indexes:** 30+ indexes cover all common query patterns including Sybil prevention lookups (`idx_vl_sybil_email`, `idx_vl_sybil_ip`), status filtering, and specialty search.

---

## 6. Backend Architecture

### Entry Point and Middleware Chain

The backend server is defined in `packages/backend/src/index.ts`. The middleware chain executes in strict order:

```
Request
  │
  ├── 1. requestIdMiddleware    → Assigns X-Request-ID for log correlation
  ├── 2. httpLogger (pino-http) → Structured request/response logging
  ├── 3. helmet                 → Security headers (strict CSP for JSON API)
  ├── 4. cors                   → Origin whitelist with CORS blocking logs
  ├── 5. express.json(100kb)    → Body parsing with size limits
  ├── 6. /health (bypass)       → Health check BEFORE rate limiter
  ├── 7. defaultRateLimiter     → 200 req/hour global rate limit
  ├── 8. requestLogger          → Usage analytics (no PII)
  ├── 9. generalTimeout (30s)   → Request timeout for /api/v1 routes
  ├── 10. routes                → API route handlers
  ├── 11. notFoundHandler       → 404 for unmatched routes
  └── 12. errorHandler          → Global error handler
```

**Source:** `packages/backend/src/index.ts`

### CORS Configuration

The backend maintains an explicit allowlist of origins:
- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- Cloud Run frontend URL
- `FRONTEND_URL` environment variable
- `localhost:3000` and `localhost:3001` in development only

Blocked CORS attempts are logged with `logger.warn` for monitoring.

### Route Architecture

All routes are versioned under `/api/v1/` and organized by domain:

```
/api/v1/
├── /providers
│   ├── GET /search         → searchRateLimiter → searchTimeout → search with caching
│   ├── GET /cities         → defaultRateLimiter → cities by state
│   ├── GET /:npi           → defaultRateLimiter → provider detail with enrichment
│   └── GET /:npi/colocated → defaultRateLimiter → co-located providers at same address
│
├── /plans
│   ├── GET /search           → searchRateLimiter → plan search
│   ├── GET /grouped          → defaultRateLimiter → plans grouped by carrier
│   ├── GET /meta/issuers     → defaultRateLimiter → unique insurance issuers
│   ├── GET /meta/types       → defaultRateLimiter → available plan types
│   ├── GET /:planId/providers → searchRateLimiter → providers accepting plan
│   └── GET /:planId          → defaultRateLimiter → plan detail
│
├── /verify
│   ├── POST /                     → verificationRateLimiter → honeypot → captcha → submit
│   ├── POST /:verificationId/vote → voteRateLimiter → honeypot → captcha → vote
│   ├── GET /stats                 → defaultRateLimiter → verification statistics
│   ├── GET /recent                → defaultRateLimiter → recent verifications
│   └── GET /:npi/:planId          → defaultRateLimiter → pair verifications + confidence
│
├── /locations
│   ├── GET /search              → searchRateLimiter → location search
│   ├── GET /health-systems      → defaultRateLimiter → health system names
│   ├── GET /stats/:state        → defaultRateLimiter → state location statistics
│   ├── GET /:locationId         → defaultRateLimiter → location detail
│   └── GET /:locationId/providers → defaultRateLimiter → providers at location
│
└── /admin (protected by X-Admin-Secret header)
    ├── POST /cleanup-expired         → expired record cleanup
    ├── GET  /expiration-stats        → TTL expiration metrics
    ├── GET  /health                  → detailed health with retention metrics
    ├── POST /cache/clear             → clear all caches
    ├── GET  /cache/stats             → cache hit/miss statistics
    ├── GET  /enrichment/stats        → location enrichment metrics
    ├── POST /cleanup/sync-logs       → sync log retention cleanup
    ├── GET  /retention/stats         → comprehensive retention statistics
    └── POST /recalculate-confidence  → batch confidence score recalculation
```

**Source:** `packages/backend/src/routes/index.ts`, individual route files

### Service Layer

Services encapsulate business logic and are separated from route handlers:

| Service | File | Responsibility |
|---------|------|---------------|
| `providerService` | `providerService.ts` | Provider search with fuzzy name matching, medical title stripping, location-based filtering |
| `planService` | `planService.ts` | Insurance plan search, grouping by carrier, issuer/type metadata |
| `verificationService` | `verificationService.ts` | Verification CRUD, Sybil attack prevention, consensus logic, TTL management |
| `confidenceService` | `confidenceService.ts` | 4-factor confidence scoring algorithm (research-backed) |
| `confidenceDecayService` | `confidenceDecayService.ts` | Batch time-based score decay for proactive recalculation |
| `locationService` | `locationService.ts` | Location search, co-location detection, health system lookup |
| `locationEnrichment` | `locationEnrichment.ts` | Health system enrichment from hospital affiliations |

### Error Handling

The `AppError` class provides a structured error hierarchy with static factory methods:

```typescript
// packages/backend/src/middleware/errorHandler.ts
AppError.badRequest(message)       // 400
AppError.unauthorized(message)     // 401
AppError.forbidden(message)        // 403
AppError.notFound(message)         // 404
AppError.conflict(message)         // 409
AppError.tooManyRequests(message)  // 429
AppError.serviceUnavailable(msg)   // 503
AppError.internal(message)         // 500
```

The global error handler maps specific error types to appropriate HTTP responses:
- **ZodError** -> 400 with field-level validation details
- **Prisma P2002** -> 409 (duplicate entry)
- **Prisma P2025** -> 404 (record not found)
- **Prisma P2024** -> 503 (connection pool timeout)
- **PrismaClientInitializationError** -> 503 (database connection failure)
- **PayloadTooLargeError** -> 413

All error responses include a `requestId` for log correlation.

### Request Validation

All route inputs are validated using Zod schemas before processing. Common schemas are centralized in `packages/backend/src/schemas/commonSchemas.ts`:

```typescript
// Example from providers route
const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  specialty: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
}).merge(paginationSchema);
```

### Logging

Structured JSON logging via Pino with request correlation:

- **HTTP Logger:** `pino-http` middleware logs every request/response with timing
- **Request ID:** `X-Request-ID` header propagated through all log entries
- **Log Levels:** `fatal`, `error`, `warn`, `info`, `debug`, `trace`
- **Security Logging:** CORS blocks, CAPTCHA failures, Sybil attempts, honeypot triggers

### Graceful Shutdown

The server handles `SIGINT` and `SIGTERM` with a 10-second timeout:

1. Stop accepting new connections
2. Close HTTP server
3. Disconnect from database (Prisma `$disconnect()`)
4. Force exit if timeout exceeded

**Source:** `packages/backend/src/index.ts` lines 202-237

---

## 7. Frontend Architecture

### Next.js App Router

The frontend uses Next.js 14.2 with the App Router pattern. Pages are organized in `packages/frontend/src/app/`:

| Route | Page | Purpose |
|-------|------|---------|
| `/` | `page.tsx` | Landing page with hero, how-it-works, confidence explainer |
| `/search` | `search/page.tsx` | Provider search with filters |
| `/provider/[npi]` | `provider/[npi]/page.tsx` | Provider detail with plan acceptances |
| `/location/[locationId]` | `location/[locationId]/page.tsx` | Location detail with co-located providers |
| `/insurance` | `insurance/page.tsx` | Insurance card scanner (AI OCR) |
| `/research` | `research/page.tsx` | Research methodology explainer |
| `/about` | `about/page.tsx` | About VerifyMyProvider |
| `/privacy` | `privacy/page.tsx` | Privacy policy |
| `/terms` | `terms/page.tsx` | Terms of service |
| `/disclaimer` | `disclaimer/page.tsx` | Data disclaimer |
| `/api/insurance-card/extract` | API route | Claude AI insurance card OCR |

### Root Layout and Provider Hierarchy

The root layout (`layout.tsx`) wraps all pages in a nested provider hierarchy:

```
<html>
  <body>
    <Suspense>
      <PostHogProvider>           → Analytics
        <QueryProvider>           → React Query
          <ThemeProvider>         → Dark/light mode
            <CompareProvider>     → Provider comparison state
              <ErrorProvider>     → Global error state
                <ToastProvider /> → Toast notifications
                <GlobalErrorBanner />
                <Header />
                <Disclaimer variant="banner" />
                <main>{children}</main>
                <Footer />
                <ScrollToTop />
                <CompareBar />
                <CookieConsent />
                <BottomNav />
              </ErrorProvider>
            </CompareProvider>
          </ThemeProvider>
        </QueryProvider>
      </PostHogProvider>
    </Suspense>
  </body>
</html>
```

**Source:** `packages/frontend/src/app/layout.tsx`

### API Client

The frontend API client (`packages/frontend/src/lib/api.ts`) provides:

- **Namespaced API:** `api.providers.search()`, `api.plans.getById()`, `api.verify.submit()`, `api.locations.search()`
- **Automatic Retry:** Retries on 429, 5xx, and network errors with exponential backoff (up to 2 retries)
- **Retry-After Respect:** Parses `Retry-After` header for 429 responses
- **Error Classification:** `ApiError` class with methods like `isRateLimited()`, `isNotFound()`, `isRetryable()`
- **Toast Notifications:** Automatic toast for rate limit errors
- **Query String Builder:** `buildQueryString()` filters out null/undefined/empty values

```typescript
// API client usage example
const data = await api.providers.search({
  state: 'NY',
  specialty: 'Family Medicine',
  page: 1,
  limit: 20,
});
```

### Component Architecture

The frontend has 50+ components organized by domain:

- **`home/`**: Landing page sections (HeroSection, HowItWorksSection, ConfidenceSection, etc.)
- **`provider-detail/`**: Provider detail page components (ProviderHeroCard, InsuranceList, ScoreBreakdown, ConfidenceGauge, ColocatedProviders)
- **`compare/`**: Provider comparison feature (CompareBar, CompareCheckbox, CompareModal)
- **`ui/`**: Base primitives (SearchableSelect, Shimmer, Skeleton)
- **Root components**: SearchForm, ProviderCard, FilterDrawer, VerificationButton, InsuranceCardUploader, etc.

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useProviderSearch` | Manages provider search state with React Query |
| `useInsurancePlans` | Insurance plan search and selection |
| `useCities` | Dynamic city list based on selected state |
| `useHealthSystems` | Health system list filtering |
| `useCompare` | Provider comparison feature state |
| `useRecentSearches` | LocalStorage-backed recent search history |
| `useSearchForm` | Complex search form state management |
| `useFilterState` | Filter drawer state (search page) |
| `useSearchExecution` | Search execution with URL sync |
| `useSearchParams` | URL search parameter parsing |

### Theme Support

Full dark/light mode support via ThemeContext, with a FOUC prevention script injected in `<head>`:

```typescript
const themeScript = `
  (function() {
    const stored = localStorage.getItem('verifymyprovider-theme');
    const theme = stored === 'light' || stored === 'dark' ? stored :
      (stored === 'system' || !stored) && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  })();
`;
```

---

## 8. Shared Package

The `@healthcareproviderdb/shared` package provides TypeScript type definitions consumed by both backend and frontend:

### Shared Enums

```typescript
// packages/shared/src/types/enums.ts
EntityType        // INDIVIDUAL, ORGANIZATION
SpecialtyCategory // ENDOCRINOLOGY, RHEUMATOLOGY, ORTHOPEDICS, etc.
NpiStatus         // ACTIVE, DEACTIVATED
PlanType          // HMO, PPO, EPO, POS, HDHP, MEDICARE_ADVANTAGE, MEDICAID, OTHER
MetalLevel        // BRONZE, SILVER, GOLD, PLATINUM, CATASTROPHIC
MarketType        // INDIVIDUAL, SMALL_GROUP, LARGE_GROUP, MEDICARE, MEDICAID
DataSource        // CMS_NPPES, CMS_PLAN_FINDER, USER_UPLOAD, CARRIER_API, CROWDSOURCE
AcceptanceStatus  // ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN
VerificationSource // CMS_DATA, CARRIER_DATA, PROVIDER_PORTAL, PHONE_CALL, CROWDSOURCE, AUTOMATED
VerificationType  // PLAN_ACCEPTANCE, PROVIDER_INFO, CONTACT_INFO, STATUS_CHANGE, NEW_PLAN
SyncType          // NPI_FULL, NPI_WEEKLY, PLAN_IMPORT, PLAN_UPDATE
SyncStatus        // PENDING, IN_PROGRESS, COMPLETED, FAILED, CANCELLED
```

### Shared Types

- `VerificationLog` -- base verification record interface
- `SubmitVerificationInput` -- crowdsource verification submission (research-based binary questions)
- `VerificationVoteInput` -- vote on verifications
- `VerificationWithScore` -- verification with computed net votes and ratio
- `calculateVerificationScore()` -- scoring function for verification trustworthiness
- `isVerificationTrustworthy()` -- requires 3+ votes, positive net, 60%+ upvote ratio

---

## 9. Data Flow

### Provider Search Flow

```
User enters search criteria (state, city, specialty, name)
  │
  ▼
Frontend SearchForm → useProviderSearch hook
  │
  ▼
api.providers.search() → GET /api/v1/providers/search?state=NY&specialty=...
  │
  ▼
Backend: Zod validation → searchRateLimiter (100/hr) → searchTimeout (30s)
  │
  ▼
Cache check (generateSearchCacheKey → cacheGet)
  │
  ├── HIT → Return cached response (X-Cache: HIT)
  │
  └── MISS → searchProviders() service
       │
       ├── Build Prisma WHERE clause:
       │   - Location via practice_locations.some({ state, city, zip })
       │   - Specialty via primary_specialty OR taxonomy_code OR category
       │   - Name via fuzzy matching (strips medical titles, tries First+Last & Last+First)
       │   - Entity type: maps INDIVIDUAL/ORGANIZATION to DB values '1'/'2'
       │
       ├── Prisma findMany with PROVIDER_INCLUDE (all relations)
       │   Ordered by: plan acceptance count DESC, lastName ASC
       │
       ├── transformProvider() maps DB shape to API response
       │   - Selects primary practice location
       │   - Maps entity type codes to readable strings
       │   - Flattens plan acceptances with insurance plan details
       │
       ├── Cache result for 5 minutes (cacheSet with 300s TTL)
       │
       └── Return { providers, pagination }
```

### Verification Submission Flow

```
User clicks "Verify Insurance" on provider detail page
  │
  ▼
ProviderVerificationForm → api.verify.submit({
  npi, planId, acceptsInsurance, notes, submittedBy, website (honeypot)
})
  │
  ▼
POST /api/v1/verify
  │
  ▼
verificationRateLimiter (10/hr) → honeypotCheck('website') → verifyCaptcha
  │
  ▼
submitVerification() service:
  │
  ├── 1. validateProviderAndPlan(npi, planId)
  │      Confirms both exist in DB, throws 404 if not
  │
  ├── 2. checkSybilAttack(npi, planId, ip, email)
  │      Checks for duplicate from same IP within 30 days
  │      Checks for duplicate from same email within 30 days
  │      Throws 409 if duplicate found
  │
  ├── 3. Get existing ProviderPlanAcceptance record
  │      First checks for location-specific record
  │      Falls back to NPI-level (legacy) record
  │
  ├── 4. Create VerificationLog entry with 6-month TTL
  │      Records previous state, new state, source IP, user agent
  │
  ├── 5. upsertAcceptance():
  │      ├── If existing: increment verificationCount, recalculate consensus
  │      │   Consensus requires: 3+ verifications, score >= 60, 2:1 majority
  │      │   Updates: acceptanceStatus, lastVerified, confidenceScore, expiresAt
  │      │
  │      └── If new: create with PENDING status, score from single verification
  │
  ├── 6. Strip PII from response (sourceIp, userAgent, submittedBy)
  │
  └── 7. Invalidate search cache (async, non-blocking)
```

### NPI Data Import Flow

```
CMS NPPES Data File (CSV, ~8GB)
  │
  ▼
scripts/import-npi.ts OR import-npi-direct.ts
  │
  ├── Streams CSV rows via csv-parse
  ├── Maps NPPES columns to Provider model fields
  ├── Extracts practice locations to practice_locations table
  ├── Extracts taxonomy codes to provider_taxonomies table
  ├── Extracts other provider IDs to provider_insurance/provider_medicare
  │
  ▼
scripts/enrich-providers-nppes.ts
  │
  ├── Calls NPPES API for additional details
  ├── Updates provider_cms_details (medical school, telehealth, etc.)
  │
  ▼
scripts/update-specialties.ts
  │
  ├── Maps taxonomy codes to human-readable specialty names
  ├── Updates primary_specialty and specialty_category
  │
  ▼
scripts/crossref-insurance-networks.ts
  │
  ├── Cross-references provider other_ids with known carrier identifiers
  ├── Enriches provider_insurance with network names
  │
  ▼
scripts/normalize-city-names.ts + deduplicate-locations.ts
  │
  ├── Normalizes city name casing
  └── Deduplicates locations using address hashing
```

---

## 10. Caching Strategy

### Dual-Mode Cache

The caching system supports two modes, selected automatically based on environment configuration:

**Source:** `packages/backend/src/utils/cache.ts`

| Mode | When Used | Scope | Trade-offs |
|------|-----------|-------|------------|
| **Redis** | `REDIS_URL` is configured | Shared across all instances | Consistent, distributed, persistent |
| **In-Memory** | No `REDIS_URL` (default) | Per-process only | Fast, zero-config, single-instance only |

### Cache Operations

```typescript
cacheGet<T>(key)                    // Get value (tries Redis first, falls back to memory)
cacheSet<T>(key, value, ttlSeconds) // Set value with TTL (default: 5 minutes)
cacheDelete(key)                    // Delete specific key
cacheDeletePattern(pattern)         // Delete by glob pattern (SCAN for Redis)
cacheClear()                        // Clear all cache entries
getCacheStats()                     // Get hit/miss/size/mode statistics
```

### Cache Key Generation

Search results use deterministic cache keys with normalized parameters:

```
search:<state>:<city>:<specialty>:<page>:<limit>[:<hash>]
```

Additional parameters (zipCode, name, NPI, entityType, etc.) are hashed into a compact suffix.

### Cache Invalidation

- **Automatic TTL:** All cached entries expire after 5 minutes
- **Verification submissions:** Invalidate all search cache entries via `invalidateSearchCache()`
- **Admin API:** `POST /api/v1/admin/cache/clear` for manual invalidation
- **Periodic cleanup:** In-memory cache runs garbage collection every 60 seconds

### Health Check Cache Stats

The `/health` endpoint reports cache statistics:

```json
{
  "cache": {
    "hits": 1234,
    "misses": 567,
    "size": 42,
    "mode": "memory",
    "hitRate": "68.5%"
  }
}
```

---

## 11. Security Architecture

### 4-Layer Sybil Attack Prevention

The verification system implements 4 layers of defense against automated manipulation:

**Layer 1: Rate Limiting** (sliding window algorithm)
- Default: 200 requests/hour
- Search: 100 requests/hour
- Verification submission: 10 requests/hour
- Voting: 10 requests/hour

Dual-mode: Redis sorted sets for distributed deployments, in-memory timestamps for single instances. Fail-open behavior with warning logs when Redis is unavailable.

**Source:** `packages/backend/src/middleware/rateLimiter.ts`

**Layer 2: Honeypot Fields**
A hidden `website` field is included in verification and vote forms. Real users never fill it in, but bots auto-populate it. Triggered bots receive a fake `200 OK` response so they don't know they were caught.

**Source:** `packages/backend/src/middleware/honeypot.ts`

**Layer 3: reCAPTCHA v3**
Google reCAPTCHA v3 assigns a score from 0.0 (likely bot) to 1.0 (likely human). Requests scoring below 0.5 are blocked. Features configurable fail-open/fail-closed behavior:

- **Fail-open (default):** Allows requests through with stricter fallback rate limiting (3/hour vs 10/hour) when Google API is unavailable
- **Fail-closed:** Blocks all requests when Google API is unavailable

Graceful degradation: Skips in development/test; warns if `RECAPTCHA_SECRET_KEY` is not configured.

**Source:** `packages/backend/src/middleware/captcha.ts`

**Layer 4: Sybil Prevention Checks**
Per-provider-plan-pair deduplication within 30 days, checked by both IP address and email address. Uses dedicated database indexes (`idx_vl_sybil_email`, `idx_vl_sybil_ip`) for efficient lookups.

**Source:** `packages/backend/src/services/verificationService.ts`

### Security Headers (Helmet)

The backend API serves only JSON, so the CSP is extremely restrictive:

```
default-src: 'none'
script-src: 'none'
style-src: 'none'
img-src: 'none'
connect-src: 'self'
frame-ancestors: 'none'
form-action: 'none'
upgrade-insecure-requests
```

Additional headers:
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Referrer-Policy: no-referrer`

### Admin Authentication

Admin endpoints are protected by timing-safe comparison of the `X-Admin-Secret` header against the `ADMIN_SECRET` environment variable. Uses `crypto.timingSafeEqual()` to prevent timing attacks.

Returns 503 (not 401) when `ADMIN_SECRET` is not configured, allowing deployment without admin capabilities.

**Source:** `packages/backend/src/routes/admin.ts`

### PII Protection

Verification responses always strip sensitive fields before returning:

```typescript
function stripVerificationPII(verification) {
  const { sourceIp, userAgent, submittedBy, ...safe } = verification;
  return safe;
}
```

Database queries for public endpoints use explicit `select` clauses to exclude PII columns.

### Body Size Limits

Request bodies are limited to 100KB to prevent large payload attacks:

```typescript
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
```

### Trust Proxy

```typescript
app.set('trust proxy', 1);
```

Set to 1 to trust only the first proxy (Cloud Run's load balancer), ensuring correct client IP extraction for rate limiting.

---

## 12. Confidence Scoring Algorithm

### Overview

The confidence scoring algorithm produces a 0-100 score based on 4 weighted factors, grounded in published academic research.

**Source:** `packages/backend/src/services/confidenceService.ts`

### Factor Breakdown

| Factor | Max Points | Research Basis |
|--------|-----------|----------------|
| **Data Source** | 25 | CMS data > carrier data > community data |
| **Recency** | 30 | 12% annual provider turnover (Ndumele et al. 2018) |
| **Verification Count** | 25 | 3 verifications = expert-level accuracy (Mortensen et al. 2015) |
| **Agreement** | 20 | Community consensus (upvote/downvote ratio) |

### Data Source Scoring (0-25 points)

```
CMS_NPPES / CMS_DATA / NPPES_SYNC  → 25 points (official government data)
CARRIER_API / CARRIER_DATA / CARRIER_SCRAPE → 20 points (insurance carrier data)
PROVIDER_PORTAL                      → 20 points (provider-verified)
USER_UPLOAD / PHONE_CALL / CROWDSOURCE / NETWORK_CROSSREF → 15 points
AUTOMATED                           → 10 points
Unknown/null                         → 10 points
```

### Recency Scoring (0-30 points)

Tiered scoring with specialty-specific freshness thresholds:

| Specialty Category | Freshness Threshold | Rationale |
|-------------------|---------------------|-----------|
| Mental Health | 30 days | 43% Medicaid acceptance, highest churn |
| Primary Care | 60 days | 12% annual turnover |
| Specialist | 60 days | Similar to primary care |
| Hospital-Based | 90 days | Most stable positions |

Scoring tiers (adjusted by threshold):
- Within 50% of threshold: 30 points (very fresh)
- Within 100% of threshold: 20 points (recent)
- Within 150% of threshold: 10 points (aging)
- Within 180 days: 5 points (stale)
- 180+ days: 0 points (too old)

### Verification Count Scoring (0-25 points)

Based on Mortensen et al. (2015), JAMIA -- crowdsourced verification achieves expert-level accuracy (kappa=0.58) with 3 verifications:

```
0 verifications → 0 points  (no data)
1 verification  → 10 points (could be outlier)
2 verifications → 15 points (getting there)
3+ verifications → 25 points (expert-level accuracy!)
```

**Confidence Level Cap:** Records with fewer than 3 verifications are capped at MEDIUM confidence regardless of total score.

### Agreement Scoring (0-20 points)

```
100% agreement    → 20 points (complete consensus)
80-99% agreement  → 15 points (strong consensus)
60-79% agreement  → 10 points (moderate consensus)
40-59% agreement  → 5 points  (weak consensus)
<40% agreement    → 0 points  (conflicting -- unreliable)
```

### Confidence Levels

| Score | Level | Minimum Verifications |
|-------|-------|-----------------------|
| 91-100 | VERY_HIGH | 3+ |
| 76-90 | HIGH | 3+ |
| 51-75 | MEDIUM | Any |
| 26-50 | LOW | Any |
| 0-25 | VERY_LOW | Any |

### Consensus Logic for Status Changes

Status changes from PENDING/UNKNOWN to ACCEPTED/NOT_ACCEPTED require ALL of:
- 3+ verifications (`MIN_VERIFICATIONS_FOR_CONSENSUS`)
- Confidence score >= 60 (`MIN_CONFIDENCE_FOR_STATUS_CHANGE`)
- Clear 2:1 majority ratio (accepted > 2x not_accepted, or vice versa)

**Source:** `packages/backend/src/services/verificationService.ts`, `packages/backend/src/config/constants.ts`

### Proactive Confidence Decay

The `confidenceDecayService` batch-recalculates scores to prevent stale high scores:

1. Fetches acceptance records with `verificationCount >= 1`
2. Aggregates upvotes/downvotes from non-expired verification logs
3. Recalculates via `calculateConfidenceScore()`
4. Updates if score has changed

This is designed to be run as a scheduled Cloud Scheduler job via the admin endpoint `POST /api/v1/admin/recalculate-confidence`.

**Source:** `packages/backend/src/services/confidenceDecayService.ts`

---

## 13. AI Integration

### Insurance Card OCR

The frontend includes an AI-powered insurance card scanner using Anthropic's Claude Haiku 4.5 model.

**Source:** `packages/frontend/src/app/api/insurance-card/extract/route.ts`

### Architecture

```
User uploads/photographs insurance card
  │
  ▼
InsuranceCardUploader component (frontend)
  │ - Client-side image validation
  │ - Image preprocessing (resize, contrast enhancement via sharp)
  ▼
POST /api/insurance-card/extract (Next.js API route)
  │
  ├── Rate limiting: 10 extractions/hour per IP
  ├── Payload validation: 10MB max, valid base64, format detection
  ├── Image preprocessing: resize, contrast enhancement
  │
  ▼
Claude Haiku 4.5 API (vision)
  │ - Structured extraction prompt
  │ - JSON response with field-level confidence
  │
  ▼
Response parsing with Zod validation
  │
  ├── If confidence < 0.3: retry with alternative prompt
  ├── If < 2 fields extracted: return error with suggestions
  │
  ▼
Return extracted data with confidence metadata
  │ - Insurance plan name, member ID, group number
  │ - Copays, deductibles, network type
  │ - Field-level confidence scores
  │ - Image quality suggestions if applicable
```

### Protection Layers

1. **Rate limiting:** 10 extractions per hour per IP (in-memory sliding window)
2. **Payload type validation:** Must be a base64 string
3. **Payload size validation:** 10MB max (13.7MB max base64)
4. **Base64 format validation:** Regex check for valid characters
5. **Minimum length validation:** At least 100 characters of base64 data
6. **API key check:** Returns 500 with user-friendly message if `ANTHROPIC_API_KEY` not configured

### Image Preprocessing

Before sending to Claude:
- **Resolution check:** Images are resized if too large
- **Enhancement detection:** Low-contrast images get contrast enhancement
- **Format normalization:** Preprocessed images are converted to JPEG

### Retry Logic

If the primary extraction returns low confidence (< 0.3) or fails to parse, the system automatically retries with an alternative prompt that uses different extraction strategies.

---

## 14. Infrastructure and Deployment

### Google Cloud Architecture

```
Google Cloud Platform (us-central1)
├── Cloud Run
│   ├── verifymyprovider-backend  (0-10 instances, 512Mi, 1 vCPU)
│   └── verifymyprovider-frontend (0-10 instances, 512Mi, 1 vCPU)
├── Cloud SQL (PostgreSQL 15)
│   └── verifymyprovider-db
├── Artifact Registry
│   └── verifymyprovider/ (Docker images)
├── Secret Manager
│   ├── DATABASE_URL
│   ├── ADMIN_SECRET
│   ├── RECAPTCHA_SECRET_KEY
│   └── ANTHROPIC_API_KEY
└── IAM
    └── Workload Identity Federation (GitHub Actions)
```

### Docker Configuration

**Backend Dockerfile** (`packages/backend/Dockerfile`):
- Multi-stage build: `builder` + `runner`
- Base: `node:20-alpine`
- Non-root user: `expressjs:nodejs`
- Includes Prisma binary generation
- Copies only production dependencies to runner stage
- Health check: `wget http://localhost:8080/health`
- Port: 8080

**Frontend Dockerfile** (`packages/frontend/Dockerfile`):
- Multi-stage build: `builder` + `runner`
- Base: `node:20-alpine`
- Non-root user: `nextjs:nodejs`
- Next.js standalone output mode
- Build-time args: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`
- Health check: `wget http://localhost:8080/`
- Port: 8080

### Docker Compose

**Production** (`docker-compose.yml`):
- PostgreSQL 15 Alpine with health check
- Backend depends on healthy DB
- Frontend depends on backend
- Persistent volume for PostgreSQL data

**Development** (`docker-compose.dev.yml`):
- Database only (backend and frontend run locally via `npm run dev`)

### Cloud Run Configuration

| Setting | Backend | Frontend |
|---------|---------|----------|
| Port | 8080 | 8080 |
| Memory | 512Mi | 512Mi |
| CPU | 1 vCPU | 1 vCPU |
| Min instances | 0 | 0 |
| Max instances | 10 | 10 |
| Concurrency | 80 | 80 |
| Cloud SQL | Connected | Not connected |
| Secrets | DATABASE_URL, ADMIN_SECRET, RECAPTCHA_SECRET_KEY | ANTHROPIC_API_KEY |

---

## 15. CI/CD Pipeline

### GitHub Actions Workflows

**`deploy.yml` -- Production Deployment (on push to `main`)**

```
test → deploy-backend → deploy-frontend → summary
```

1. **Test Job:** Install deps, security audit, run backend tests, build check
2. **Deploy Backend:**
   - Authenticate via Workload Identity Federation (keyless)
   - Build Docker image with Buildx + GitHub Actions cache
   - Push to Artifact Registry
   - Deploy to Cloud Run with secrets from Secret Manager
   - Smoke test: `curl /health` must return 200
3. **Deploy Frontend:**
   - Same auth flow
   - Build with `NEXT_PUBLIC_API_URL` from backend deploy output
   - Deploy to Cloud Run
   - Smoke test: homepage must return 200
4. **Summary:** Reports deployment status and URLs

**`test.yml` -- PR Test Gate (on PR to `main` or `staging`)**

```
Install → Security audit → Backend tests → Backend build → Frontend tests
```

**`deploy-staging.yml`** -- Staging deployment workflow

**`playwright.yml`** -- End-to-end browser tests

**`rollback.yml`** -- Deployment rollback capability

**`security-scan.yml`** -- Security scanning

### Security: Keyless Authentication

The pipeline uses **Workload Identity Federation** instead of long-lived service account keys:

```yaml
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
    service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}
```

---

## 16. Analytics

### PostHog (Privacy-Preserving)

The application uses PostHog for analytics with strict privacy controls.

**Source:** `packages/frontend/src/lib/analytics.ts`

### Privacy Design

All analytics events intentionally strip sensitive healthcare data:

| Event | What IS Sent | What IS NOT Sent |
|-------|-------------|-----------------|
| `search` | has_specialty_filter (boolean), results_count, mode | Actual specialty, state, city, health system values |
| `provider_view` | has_specialty (boolean) | NPI, specialty name, provider name |
| `verification_submit` | (empty event -- just that it occurred) | NPI, plan ID, acceptance status |
| `verification_vote` | vote_type (up/down) | Verification ID, NPI |

```typescript
// Example: Only boolean indicators sent, never actual filter values
posthog.capture('search', {
  has_specialty_filter: !!props.specialty,   // boolean only
  has_state_filter: !!props.state,           // boolean only
  results_count: props.resultsCount,
  has_results: props.resultsCount > 0,
  mode: props.mode,
  // NOT sending: specialty, state, city, cities, healthSystem
});
```

### Cookie Consent

The frontend includes a `CookieConsent` component that gates analytics tracking.

---

## 17. Data Pipeline and Import Scripts

The `scripts/` directory contains 25+ TypeScript scripts for data import, enrichment, and maintenance:

### Import Pipeline

| Script | Purpose |
|--------|---------|
| `import-npi.ts` | Primary NPI bulk data import from CMS NPPES CSV |
| `import-npi-direct.ts` | Direct PostgreSQL import (bypasses Prisma for performance) |
| `import-csv-copy.ts` | PostgreSQL COPY-based import for maximum speed |
| `import-csv-simple.ts` | Simplified CSV import |
| `import-filtered-csv.ts` | Filtered import (e.g., specific states) |

### Enrichment Pipeline

| Script | Purpose |
|--------|---------|
| `enrich-providers-nppes.ts` | NPPES API enrichment (CMS details, medical school, telehealth) |
| `crossref-insurance-networks.ts` | Cross-reference provider IDs with known insurance networks |
| `scrape-carrier-directory.ts` | Scrape carrier directories for network data |
| `update-specialties.ts` | Map taxonomy codes to human-readable specialty names |

### Data Quality

| Script | Purpose |
|--------|---------|
| `verify-data-quality.ts` | Run data quality checks across all tables |
| `generate-dq-report.ts` | Generate comprehensive data quality report |
| `audit-npi-validation.ts` | Validate NPI formats and checksums |
| `normalize-city-names.ts` | Normalize city name casing |
| `deduplicate-locations.ts` | Deduplicate practice locations via address hashing |
| `clean-ny-data.ts` | State-specific data cleanup |
| `cleanup-deactivated-providers.ts` | Remove deactivated provider records |

### Maintenance

| Script | Purpose |
|--------|---------|
| `recalculate-confidence.ts` | Batch confidence score recalculation |
| `backfill-verification-ttl.ts` | Add TTL to legacy verification records |

---

## 18. Key Architectural Decisions

### 1. Monorepo with npm Workspaces

**Decision:** Use a single repository with npm workspaces instead of separate repos.

**Rationale:**
- Shared TypeScript types ensure type safety across frontend and backend
- Atomic commits across stack layers
- Simplified CI/CD pipeline
- Unified dependency management

**Lesson Learned:** Never put `next` in root `package.json` -- it overrides the frontend workspace version and causes SWC binary mismatches.

### 2. Prisma ORM over Raw SQL

**Decision:** Use Prisma as the primary ORM with raw SQL only for partial indexes.

**Rationale:**
- Type-safe database queries
- Auto-generated TypeScript types from schema
- Migration management
- Schema introspection (`prisma db pull`)

**Trade-off:** Prisma's query engine adds overhead; raw SQL used for performance-critical operations (COPY imports, partial unique indexes).

### 3. Research-Backed Confidence Scoring

**Decision:** Ground confidence scores in published academic research rather than arbitrary thresholds.

**Research Citations:**
- Ndumele et al. (2018), Health Affairs -- 12% annual provider turnover
- Mortensen et al. (2015), JAMIA -- 3 crowdsourced verifications achieve expert-level accuracy (kappa=0.58)

**Impact:** Credibility, defensible scoring, specialty-specific decay rates.

### 4. Dual-Mode Caching and Rate Limiting

**Decision:** Support both Redis (distributed) and in-memory (single-instance) modes for cache and rate limiting.

**Rationale:**
- Enables zero-config local development
- Production can scale horizontally with Redis
- Fail-open behavior prevents cache/rate-limiter failures from taking down the service

### 5. Express.js over Next.js API Routes for Backend

**Decision:** Separate Express.js backend rather than using Next.js API routes for everything.

**Rationale:**
- Independent scaling (backend may need more instances than frontend)
- Separate deployment lifecycle
- Express middleware ecosystem (Helmet, CORS, rate limiting)
- Prisma connection pooling per backend instance
- Backend stays lightweight (JSON API only, no SSR)

### 6. Next.js App Router (Not Pages Router)

**Decision:** Use Next.js 14 App Router for the frontend.

**Rationale:**
- Server Components for initial page loads
- Streaming and Suspense support
- Nested layouts
- Route groups for organization

### 7. PostHog over Google Analytics

**Decision:** Use PostHog with privacy-preserving configuration.

**Rationale:**
- Healthcare data sensitivity requires minimal tracking
- PostHog allows self-hosting option
- Boolean-only event properties prevent accidental PII leakage
- No healthcare-specific data ever reaches analytics

### 8. TTL-Based Verification Expiration

**Decision:** Verifications expire after 6 months with time-based confidence decay.

**Rationale:**
- 12% annual turnover means stale verifications are misleading
- TTL keeps the database lean without manual cleanup
- Legacy records (pre-TTL) are preserved via null-safe filters
- Batch cleanup via admin API and Cloud Scheduler

---

## 19. Scaling Considerations

### Current Bottlenecks

1. **Database:** Single PostgreSQL instance on Cloud SQL. Connection pooling via Prisma helps, but write-heavy verification workloads may require read replicas.

2. **Search Performance:** Provider search with multiple join conditions (locations, specialties, names) can be slow for large result sets. Caching mitigates this for repeated queries.

3. **Confidence Recalculation:** Batch recalculation touches every verified acceptance record. Currently processed sequentially with cursor-based pagination and configurable batch size.

### Scaling Strategies

| Component | Strategy |
|-----------|----------|
| Backend | Cloud Run auto-scaling (0-10 instances, 80 concurrent) |
| Frontend | Cloud Run auto-scaling (0-10 instances) |
| Database | Cloud SQL auto-scaling, read replicas for search workloads |
| Caching | Redis for distributed cache across instances |
| Rate Limiting | Redis sorted sets for shared state across instances |
| Search | Full-text search indexes, denormalized search views |
| Verification | Async processing, event-driven confidence updates |

### Horizontal Scaling Requirements

When scaling beyond a single backend instance:
1. Enable Redis (`REDIS_URL`) for distributed rate limiting and caching
2. Cloud SQL connection limits may need adjustment
3. Admin batch operations (cleanup, recalculation) should run on a single instance

---

## 20. Appendix: API Reference

### Response Format

All API responses follow a consistent envelope format:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error description",
    "code": "MACHINE_READABLE_CODE",
    "statusCode": 400,
    "requestId": "abc123"
  }
}
```

### Rate Limit Headers

All responses include standard rate limit headers:

```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 195
X-RateLimit-Reset: 1707321600
```

On 429 responses:
```
Retry-After: 3600
```

### Pagination

Paginated endpoints accept `page` (default: 1) and `limit` (default: 20, max: 100) query parameters and return:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1234,
    "totalPages": 62,
    "hasMore": true
  }
}
```

### Health Check

```
GET /health
```

Returns system health with database connectivity, memory usage, uptime, and cache statistics. Returns 200 for healthy, 503 for degraded (database unreachable).

### Key Endpoints

| Method | Path | Rate Limit | Description |
|--------|------|-----------|-------------|
| GET | `/api/v1/providers/search` | 100/hr | Search providers with filters |
| GET | `/api/v1/providers/:npi` | 200/hr | Provider detail with all enrichment |
| GET | `/api/v1/providers/:npi/colocated` | 200/hr | Co-located providers at same address |
| GET | `/api/v1/providers/cities?state=XX` | 200/hr | Cities in a state |
| GET | `/api/v1/plans/search` | 100/hr | Search insurance plans |
| GET | `/api/v1/plans/grouped` | 200/hr | Plans grouped by carrier |
| GET | `/api/v1/plans/:planId` | 200/hr | Plan detail |
| GET | `/api/v1/plans/:planId/providers` | 100/hr | Providers accepting a plan |
| POST | `/api/v1/verify` | 10/hr | Submit verification (requires captcha) |
| POST | `/api/v1/verify/:id/vote` | 10/hr | Vote on verification (requires captcha) |
| GET | `/api/v1/verify/stats` | 200/hr | Verification statistics |
| GET | `/api/v1/verify/:npi/:planId` | 200/hr | Verifications for provider-plan pair |
| GET | `/api/v1/locations/search` | 100/hr | Search practice locations |
| GET | `/api/v1/locations/health-systems` | 200/hr | Health system names |
| GET | `/api/v1/locations/:id/providers` | 200/hr | Providers at a location |

---

*This document was generated on 2026-02-07 by scanning the actual source code of the VerifyMyProvider project.*
