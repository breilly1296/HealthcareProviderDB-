# Architecture Document

**Last Updated:** 2026-02-05
**Generated From:** prompts/16-architecture-doc.md

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Data Flow](#3-data-flow)
4. [Backend Architecture](#4-backend-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Database Schema Overview](#6-database-schema-overview)
7. [Caching Strategy](#7-caching-strategy)
8. [Security Architecture](#8-security-architecture)
9. [Infrastructure and Deployment](#9-infrastructure-and-deployment)
10. [Key Architectural Decisions](#10-key-architectural-decisions)

---

## 1. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | Next.js (App Router) | 14.2 | Server-side rendering, routing, static generation |
| | React | 18 | UI component library |
| | TailwindCSS | 3.3 | Utility-first CSS framework |
| | TanStack React Query | 5.x | Server state management, caching, data fetching |
| | Lucide React | 0.563 | Icon library |
| | PostHog | 1.x | Privacy-preserving analytics |
| | Anthropic Claude SDK | 0.71 | Insurance card OCR |
| **Backend** | Express.js | 4.18 | HTTP server and routing |
| | Prisma | 5.22 | ORM and database toolkit |
| | Zod | 3.22 | Runtime schema validation |
| | Helmet | 7.1 | Security headers |
| | ioredis | 5.9 | Redis client (optional) |
| | Pino | 10.3 | Structured JSON logging |
| **Database** | PostgreSQL | 15 | Primary data store (Google Cloud SQL in production) |
| **Caching** | Redis | Optional | Distributed rate limiting and caching |
| | In-memory | Built-in | Fallback cache when Redis unavailable |
| **Infrastructure** | Google Cloud Run | - | Serverless container hosting |
| | Artifact Registry | - | Docker image storage |
| | Secret Manager | - | Secrets management |
| | Cloud SQL | - | Managed PostgreSQL |
| **CI/CD** | GitHub Actions | - | Automated build and deploy |
| | Workload Identity Federation | - | Keyless GCP authentication |
| **Testing** | Jest | 29.x | Unit and integration tests |
| | Playwright | 1.58 | End-to-end browser tests |
| | Testing Library | 16.x | React component tests |

---

## 2. Monorepo Structure

The project uses **npm workspaces** to manage three packages in a single repository:

```
HealthcareProviderDB/
├── package.json                    # Root: workspace config, shared scripts, shared deps
├── docker-compose.yml              # Full-stack Docker Compose
├── docker-compose.dev.yml          # Dev-only database
├── .env.example                    # Environment variable reference
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD pipeline
├── packages/
│   ├── backend/                    # Express API server
│   │   ├── package.json            # @healthcareproviderdb/backend
│   │   ├── Dockerfile              # Multi-stage production build
│   │   ├── prisma/
│   │   │   └── schema.prisma       # Database schema (13 models)
│   │   └── src/
│   │       ├── index.ts            # Express app, middleware chain, health check
│   │       ├── routes/             # API route handlers
│   │       ├── services/           # Business logic layer
│   │       ├── middleware/         # Rate limiting, CAPTCHA, error handling
│   │       ├── schemas/            # Zod validation schemas
│   │       ├── lib/                # Prisma client, Redis client
│   │       └── utils/              # Cache, logger, response helpers
│   ├── frontend/                   # Next.js 14 application
│   │   ├── package.json            # @healthcareproviderdb/frontend
│   │   ├── Dockerfile              # Multi-stage standalone build
│   │   ├── scripts/
│   │   │   └── patch-next-swc.js   # SWC WASM fallback patch (Windows ARM64)
│   │   └── src/
│   │       ├── app/                # Next.js App Router pages
│   │       ├── components/         # React components
│   │       ├── context/            # React contexts (Theme, Compare, Error)
│   │       └── lib/                # API client, utilities
│   └── shared/                     # Shared TypeScript types
│       ├── package.json            # @healthcareproviderdb/shared
│       └── src/
│           └── types/              # Shared type definitions
├── scripts/                        # NPI data import, data cleanup utilities
└── prompts/                        # Claude project prompts for documentation
```

### Workspace Dependencies

```
@healthcareproviderdb/shared    (no dependencies on other workspaces)
         ↑                  ↑
         |                  |
@healthcareproviderdb/backend   @healthcareproviderdb/frontend
```

Both `backend` and `frontend` depend on `shared` via `"@healthcareproviderdb/shared": "*"`. The shared package must be built first (`npm run build:shared`) before other packages can compile.

### Root Dependencies

The root `package.json` only contains truly shared dependencies:

| Package | Purpose |
|---------|---------|
| `@prisma/client` | Prisma ORM client |
| `prisma` | Prisma CLI tool |
| `csv-parse` | CSV parsing for NPI data imports |
| `pg` | PostgreSQL driver |
| `concurrently` (dev) | Run backend + frontend in parallel |

---

## 3. Data Flow

### 3.1 High-Level Architecture

```
                         ┌──────────────────────────────────────────┐
                         │              Google Cloud                 │
                         │                                          │
 User ──── Browser ────> │  Cloud Run (Frontend)                    │
                         │       │  Next.js 14 (SSR + Client)      │
                         │       │                                  │
                         │       v                                  │
                         │  Cloud Run (Backend)                     │
                         │       │  Express + Prisma                │
                         │       │                                  │
                         │       ├───> Cloud SQL (PostgreSQL 15)    │
                         │       │                                  │
                         │       ├───> Redis (optional)             │
                         │       │                                  │
                         │       └───> External APIs                │
                         │             - Google reCAPTCHA v3         │
                         │             - NPI Registry (bulk import)  │
                         │                                          │
                         │  Secret Manager                          │
                         │       - DATABASE_URL                     │
                         │       - ANTHROPIC_API_KEY                │
                         └──────────────────────────────────────────┘
```

### 3.2 Request Flow: Provider Search

```
1. User types search query in frontend
2. React Query fires GET /api/v1/providers/search?state=CA&specialty=Cardiology
3. Express receives request:
   a. requestIdMiddleware assigns X-Request-ID
   b. httpLogger logs the request with pino
   c. helmet sets security headers
   d. CORS validates the origin
   e. express.json() parses body (100kb limit)
   f. defaultRateLimiter checks 200 req/hr limit
   g. requestLogger tracks usage
4. Route handler in providers.ts:
   a. Zod validates query parameters
   b. Checks in-memory/Redis cache for matching key
   c. On cache miss: calls providerService.searchProviders()
   d. Prisma queries PostgreSQL with filters and pagination
   e. Results transformed (DB shape -> API shape)
   f. Cached for 5 minutes
5. Response: { success: true, data: { providers: [...], pagination: {...} } }
6. React Query caches response on client, renders results
```

### 3.3 Request Flow: Verification Submission

```
1. User clicks "Verify" on a provider-plan pair
2. Frontend sends POST /api/v1/verify with captchaToken
3. Express receives request:
   a. Middleware chain (same as above)
   b. verificationRateLimiter checks 10 req/hr limit
   c. verifyCaptcha validates reCAPTCHA v3 token
4. Route handler in verify.ts:
   a. Zod validates request body
   b. verificationService.submitVerification():
      - Sybil detection (IP + email + time-based checks)
      - Creates/updates ProviderPlanAcceptance record
      - Creates VerificationLog entry
      - Calculates confidence score
   c. Invalidates search cache (async, non-blocking)
5. Response: { success: true, data: { verification, acceptance, message } }
```

### 3.4 Data Import Flow: NPI Bulk Import

```
1. Download NPI data files from CMS (cms.gov)
2. Run import scripts (scripts/ directory)
3. CSV parser processes millions of records
4. Prisma bulk upserts into PostgreSQL:
   - providers table (NPI, name, specialty, entity type)
   - practice_locations (addresses from NPI data)
   - provider_taxonomies (taxonomy codes)
   - provider_cms_details (CMS enrichment data)
   - provider_hospitals (hospital affiliations)
   - provider_insurance (insurance network identifiers)
   - provider_medicare (Medicare IDs)
5. sync_logs table records import status and statistics
```

---

## 4. Backend Architecture

### 4.1 Express Middleware Chain

Middleware executes in the following order for every request:

```
Request In
    │
    ├── 1. requestIdMiddleware      Generate/propagate X-Request-ID for log correlation
    ├── 2. httpLogger (pino-http)   Structured request/response logging
    ├── 3. helmet                   Security headers (strict CSP for JSON API)
    ├── 4. CORS                     Origin validation with allowlist
    ├── 5. express.json()           Body parsing (100kb limit)
    ├── 6. express.urlencoded()     URL-encoded body parsing (100kb limit)
    │
    ├── [/health]                   Health check (bypasses rate limiter)
    │
    ├── 7. defaultRateLimiter       200 req/hr sliding window
    ├── 8. requestLogger            Usage tracking (no PII)
    │
    ├── [/]                         API info endpoint
    ├── [/api/v1/...]               Route handlers
    │
    ├── 9. notFoundHandler          404 for unmatched routes
    └── 10. errorHandler            Global error handler
```

### 4.2 Route Registration

All API routes are mounted under `/api/v1/`:

```typescript
// packages/backend/src/routes/index.ts
router.use('/providers', providersRouter);  // 3 endpoints (search, cities, :npi)
router.use('/plans', plansRouter);          // 6 endpoints
router.use('/verify', verifyRouter);        // 5 endpoints
router.use('/admin', adminRouter);          // 7 endpoints
// router.use('/locations', locationsRouter);  // DISABLED (pending rewrite)
```

### 4.3 Service Layer

Route handlers delegate to service modules that contain business logic:

| Service | File | Responsibility |
|---------|------|---------------|
| `providerService` | `services/providerService.ts` | Provider search, lookup, display name formatting |
| `planService` | `services/planService.ts` | Plan search, grouping, issuer/type metadata |
| `verificationService` | `services/verificationService.ts` | Verification submission, voting, Sybil detection, cleanup |
| `confidenceService` | `services/confidenceService.ts` | 4-factor confidence score calculation |

### 4.4 Error Handling

The `AppError` class provides typed HTTP errors:

| Method | Status Code | Use Case |
|--------|-------------|----------|
| `AppError.badRequest()` | 400 | Invalid input, validation failure |
| `AppError.unauthorized()` | 401 | Missing/invalid admin secret |
| `AppError.forbidden()` | 403 | CAPTCHA score too low |
| `AppError.notFound()` | 404 | Resource not found |
| `AppError.conflict()` | 409 | Duplicate entry |
| `AppError.tooManyRequests()` | 429 | Rate limit exceeded |
| `AppError.serviceUnavailable()` | 503 | CAPTCHA API down (fail-closed mode) |
| `AppError.internal()` | 500 | Unexpected server error |

The global error handler also catches Zod validation errors (returns 400 with field-level details), Prisma errors (P2002 duplicate, P2025 not found), and payload-too-large errors (413).

All error responses include a `requestId` for log correlation:

```json
{
  "error": {
    "message": "Provider with NPI 1234567890 not found",
    "code": "NOT_FOUND",
    "statusCode": 404,
    "requestId": "abc-123"
  }
}
```

### 4.5 Logging

The backend uses **Pino** for structured JSON logging:

- `pino` for application-level logging (`logger.info`, `logger.warn`, `logger.error`)
- `pino-http` for automatic HTTP request/response logging
- `pino-pretty` for human-readable development output
- Request IDs are propagated through all log entries for correlation
- No PII is logged by the request logger

### 4.6 Graceful Shutdown

The server handles `SIGINT` and `SIGTERM` signals:

1. Stops accepting new connections (`server.close()`)
2. Disconnects from PostgreSQL (`prisma.$disconnect()`)
3. Forces exit after 10 seconds if graceful shutdown stalls

---

## 5. Frontend Architecture

### 5.1 Next.js App Router

The frontend uses the Next.js 14 **App Router** with the following structure:

- **Server-Side Rendering (SSR):** Pages leverage React Server Components where possible
- **Client Components:** Interactive elements (search, forms, voting) use `"use client"` directive
- **Standalone Output:** Configured for standalone builds optimized for Docker/Cloud Run

### 5.2 Provider Tree (Root Layout)

The root layout (`packages/frontend/src/app/layout.tsx`) wraps all pages in a nested provider tree:

```
<html>
  <body>
    <Suspense>                        // Suspense boundary for streaming
      <PostHogProvider>               // Privacy-preserving analytics
        <QueryProvider>               // TanStack React Query (server state)
          <ThemeProvider>             // Dark/light mode (localStorage)
            <CompareProvider>         // Provider comparison state
              <ErrorProvider>         // Global error boundary
                <ToastProvider />     // Toast notifications
                <GlobalErrorBanner /> // Error display
                <Header />           // Navigation header
                <Disclaimer />       // Data accuracy disclaimer
                <main>{children}</main>
                <Footer />           // Site footer
                <ScrollToTop />      // Scroll-to-top button
                <CompareBar />       // Provider comparison bar
                <BottomNav />        // Mobile bottom navigation
              </ErrorProvider>
            </CompareProvider>
          </ThemeProvider>
        </QueryProvider>
      </PostHogProvider>
    </Suspense>
  </body>
</html>
```

### 5.3 Theme System

- Supports `light`, `dark`, and `system` (OS preference) modes
- Uses a blocking `<script>` tag in `<head>` to prevent flash of wrong theme (FOUC)
- Stored in `localStorage` under key `verifymyprovider-theme`
- TailwindCSS `dark:` variants provide all dark mode styles

### 5.4 Data Fetching

- **TanStack React Query** manages all API calls with automatic caching, deduplication, and retry logic
- API calls target `NEXT_PUBLIC_API_URL` (baked in at build time)
- `X-Cache` response header indicates whether backend cache was hit

### 5.5 Key Frontend Pages

| Path | Purpose |
|------|---------|
| `/` | Landing page with hero, how-it-works, confidence scores |
| `/search` | Provider search with filters (state, city, specialty, name) |
| `/insurance` | Insurance card OCR scanner (Anthropic Claude) |
| `/about` | About VerifyMyProvider and OwnMyHealth |
| `/terms` | Terms of service |
| `/privacy` | Privacy policy |
| `/disclaimer` | Data disclaimer |

### 5.6 OwnMyHealth Relationship

VerifyMyProvider is part of the **OwnMyHealth** ecosystem. The footer links to `https://ownmyhealth.io` and positions VerifyMyProvider as a tool for "empowering patients with the information they need to make informed healthcare decisions."

---

## 6. Database Schema Overview

### 6.1 Entity-Relationship Summary

The database contains **13 Prisma models** organized into four domains:

#### Provider Domain

| Model | Table | PK | Description |
|-------|-------|-----|-------------|
| `Provider` | `providers` | `npi` (VARCHAR 10) | Core provider record from NPI Registry |
| `practice_locations` | `practice_locations` | `id` (auto) | Provider addresses (practice + mailing) |
| `provider_cms_details` | `provider_cms_details` | `npi` | CMS enrichment (medical school, telehealth, etc.) |
| `provider_hospitals` | `provider_hospitals` | `id` (auto) | Hospital affiliations |
| `provider_insurance` | `provider_insurance` | `id` (auto) | Insurance network identifiers |
| `provider_medicare` | `provider_medicare` | `id` (auto) | Medicare IDs by state |
| `provider_taxonomies` | `provider_taxonomies` | `id` (auto) | NUCC taxonomy codes (specialties) |

#### Reference Domain

| Model | Table | PK | Description |
|-------|-------|-----|-------------|
| `taxonomy_reference` | `taxonomy_reference` | `taxonomy_code` | Taxonomy code lookup with display names |
| `hospitals` | `hospitals` | `ccn` | Hospital reference data |

#### Insurance Domain

| Model | Table | PK | Description |
|-------|-------|-----|-------------|
| `InsurancePlan` | `insurance_plans` | `plan_id` | Insurance plan definitions |
| `ProviderPlanAcceptance` | `provider_plan_acceptance` | `id` (auto) | Provider-plan acceptance with confidence score |

#### Verification Domain

| Model | Table | PK | Description |
|-------|-------|-----|-------------|
| `VerificationLog` | `verification_logs` | `id` (cuid) | Community verification submissions |
| `VoteLog` | `vote_logs` | `id` (cuid) | Votes on verifications |
| `SyncLog` | `sync_logs` | `id` (auto) | Data import/sync tracking |

### 6.2 Key Relationships

```
Provider (1) ──── (*) practice_locations
Provider (1) ──── (1) provider_cms_details
Provider (1) ──── (*) provider_hospitals
Provider (1) ──── (*) provider_insurance
Provider (1) ──── (*) provider_medicare
Provider (1) ──── (*) provider_taxonomies
Provider (1) ──── (*) ProviderPlanAcceptance
Provider (1) ──── (*) VerificationLog

InsurancePlan (1) ──── (*) ProviderPlanAcceptance
InsurancePlan (1) ──── (*) VerificationLog

ProviderPlanAcceptance: unique(providerNpi, planId)

VerificationLog (1) ──── (*) VoteLog
VoteLog: unique(verificationId, sourceIp)
```

### 6.3 Enums

| Enum | Values | Used By |
|------|--------|---------|
| `AcceptanceStatus` | ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN | ProviderPlanAcceptance |
| `VerificationSource` | CMS_DATA, CARRIER_DATA, PROVIDER_PORTAL, PHONE_CALL, CROWDSOURCE, AUTOMATED | VerificationLog |
| `VerificationType` | PLAN_ACCEPTANCE, PROVIDER_INFO, CONTACT_INFO, STATUS_CHANGE, NEW_PLAN | VerificationLog |

### 6.4 Data Retention

- **VerificationLogs:** 6-month TTL via `expiresAt` column
- **ProviderPlanAcceptance:** 6-month TTL via `expiresAt` column
- **SyncLogs:** 90-day retention (manual cleanup via admin endpoint)
- **VoteLogs:** Cascade-delete when parent VerificationLog expires

### 6.5 Indexing Strategy

The schema includes comprehensive indexes for search performance:

- **Provider search:** Indexes on `last_name`, `specialty_category`, `credential`, `gender`, `primary_specialty`, `primary_taxonomy_code`
- **Location search:** Indexes on `npi`, `city`, `state`, `zip_code`
- **Sybil detection:** Composite indexes on `(providerNpi, planId, sourceIp, createdAt)` and `(providerNpi, planId, submittedBy, createdAt)`
- **Expiration queries:** Indexes on `expiresAt` columns for cleanup jobs

---

## 7. Caching Strategy

### 7.1 Dual-Mode Cache

The backend implements a dual-mode caching system:

| Mode | When Used | Scope | Suitable For |
|------|-----------|-------|-------------|
| **Redis** | `REDIS_URL` configured | Distributed (all instances) | Multi-instance production |
| **In-Memory** | No Redis available | Process-local (single instance) | Development, single-instance |

### 7.2 What Is Cached

- **Provider search results:** 5-minute TTL, keyed by search parameters
- **Rate limit counters:** Sliding window timestamps per client IP

### 7.3 Cache Invalidation

- Search cache is invalidated after any verification submission (async, non-blocking)
- Admin can manually clear cache via `POST /api/v1/admin/cache/clear`
- Cache statistics available via `GET /api/v1/admin/cache/stats`

---

## 8. Security Architecture

### 8.1 Defense Layers

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Transport** | HTTPS (Cloud Run default) | Encryption in transit |
| **Headers** | Helmet (strict CSP, HSTS, X-Content-Type-Options) | Prevent XSS, clickjacking |
| **CORS** | Origin allowlist | Restrict cross-origin access |
| **Rate Limiting** | Sliding window (200/100/10 req/hr) | Prevent abuse |
| **CAPTCHA** | Google reCAPTCHA v3 | Bot detection on write endpoints |
| **Sybil Prevention** | 4-layer detection | Prevent vote/verification manipulation |
| **Input Validation** | Zod schemas on all inputs | Prevent injection |
| **Body Limits** | 100kb JSON/URL-encoded | Prevent large payload attacks |
| **Admin Auth** | `X-Admin-Secret` with timing-safe comparison | Protect admin endpoints |
| **Secrets** | GCP Secret Manager | No secrets in code or env files |
| **Container** | Non-root users in Docker | Least-privilege execution |
| **Auth (CI/CD)** | Workload Identity Federation | No long-lived service account keys |

### 8.2 Rate Limit Tiers

| Limiter | Rate | Endpoints |
|---------|------|-----------|
| `default` | 200 req/hr | General API routes, provider detail, plan detail, metadata |
| `search` | 100 req/hr | Provider search, plan search, providers-for-plan |
| `verification` | 10 req/hr | Verification submission |
| `vote` | 10 req/hr | Vote submission |
| Health check | Unlimited | `GET /health` (exempt from rate limiting) |

### 8.3 CAPTCHA Configuration

- **Provider:** Google reCAPTCHA v3 (score-based, invisible)
- **Required on:** `POST /api/v1/verify` and `POST /api/v1/verify/:id/vote`
- **Minimum score:** Configurable via `CAPTCHA_MIN_SCORE` constant
- **Fail mode:** Configurable (`open` or `closed`) via `CAPTCHA_FAIL_MODE`
- **Fallback:** When Google API fails in open mode, stricter rate limit (3 req/hr) applies

---

## 9. Infrastructure and Deployment

### 9.1 Production Topology

```
Internet
    │
    v
Cloud Run (Frontend)          Cloud Run (Backend)
  Next.js standalone            Express + Prisma
  Port 8080                     Port 8080
  0-10 instances                0-10 instances
  512Mi / 1 CPU                 512Mi / 1 CPU
    │                               │
    │                               ├── Cloud SQL Auth Proxy (sidecar)
    │                               │       │
    │                               │       v
    │                               │   Cloud SQL (PostgreSQL 15)
    │                               │
    │                               └── Redis (optional)
    │
    └── Anthropic API (Claude for OCR)

Artifact Registry: Docker images
Secret Manager: DATABASE_URL, ANTHROPIC_API_KEY
```

### 9.2 Scale-to-Zero

Both Cloud Run services are configured with `min-instances=0`, meaning they scale to zero when idle. This minimizes cost but introduces cold start latency for the first request after an idle period.

### 9.3 Concurrency

Each Cloud Run instance handles up to 80 concurrent requests before scaling out a new instance. With a maximum of 10 instances, the theoretical maximum is 800 concurrent requests per service.

---

## 10. Key Architectural Decisions

### 10.1 Monorepo with npm Workspaces

**Decision:** Single repo with three npm workspaces instead of separate repositories.

**Rationale:** Shared TypeScript types between frontend and backend, atomic commits across full stack, simplified CI/CD with a single pipeline, and easy local development with `npm run dev`.

### 10.2 Express over Next.js API Routes

**Decision:** Separate Express backend instead of using Next.js API routes.

**Rationale:** Independent scaling (backend can scale separately from frontend on Cloud Run), richer middleware ecosystem (rate limiting, CAPTCHA, Helmet), Prisma ORM works more naturally in a long-running Node.js process, and clearer separation of concerns.

### 10.3 Community Verification with Confidence Scoring

**Decision:** Crowdsourced verification with a 4-factor confidence score rather than relying solely on official data.

**Rationale:** Official insurance directories are notoriously inaccurate. Community verification with Sybil attack prevention (IP-based, email-based, time-based, and vote-based detection) provides a more dynamic and up-to-date signal. The 6-month TTL ensures stale data expires automatically.

### 10.4 Dual-Mode Caching and Rate Limiting

**Decision:** Support both Redis and in-memory implementations with automatic selection.

**Rationale:** Redis enables distributed state for horizontal scaling, but adds infrastructure complexity. In-memory fallback keeps the application functional without Redis for development and single-instance deployments. Fail-open behavior on Redis errors prioritizes availability.

### 10.5 PostgreSQL with Prisma ORM

**Decision:** PostgreSQL as the sole data store with Prisma for type-safe database access.

**Rationale:** PostgreSQL handles the complex relational data (providers with multiple locations, taxonomies, insurance networks, and verification histories). Prisma provides type-safe queries, schema migrations, and a clean API. The schema uses `@@map` annotations to maintain PostgreSQL snake_case conventions while exposing camelCase in TypeScript.

### 10.6 Standalone Next.js Build for Docker

**Decision:** Use Next.js standalone output mode for production Docker images.

**Rationale:** Standalone mode produces a self-contained `server.js` with only the necessary node_modules, resulting in much smaller Docker images (no full `node_modules` tree). This is critical for fast Cloud Run cold starts.
