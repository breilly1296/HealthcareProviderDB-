# VerifyMyProvider Architecture Document

**Generated:** 2026-02-18

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Monorepo Structure](#monorepo-structure)
4. [Data Flow](#data-flow)
5. [Backend Architecture](#backend-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [Database Schema](#database-schema)
8. [Security Architecture](#security-architecture)
9. [Caching Strategy](#caching-strategy)
10. [Confidence Scoring Algorithm](#confidence-scoring-algorithm)
11. [Infrastructure](#infrastructure)
12. [Key Architectural Decisions](#key-architectural-decisions)

---

## System Overview

VerifyMyProvider is a full-stack healthcare provider verification platform built as an npm workspaces monorepo. It combines authoritative data sources (NPPES/NPI Registry, CMS provider data) with crowdsourced patient verifications to produce transparent confidence scores for provider-insurance acceptance.

```
                         +--------------------+
                         |    Users/Patients   |
                         +--------------------+
                                  |
                                  v
                    +----------------------------+
                    |  Next.js 14 Frontend       |
                    |  (Cloud Run)               |
                    |  - React 18 + TailwindCSS  |
                    |  - App Router              |
                    |  - React Query             |
                    |  - PostHog Analytics        |
                    +----------------------------+
                                  |
                          HTTPS / REST
                                  |
                                  v
                    +----------------------------+
                    |  Express Backend           |
                    |  (Cloud Run)               |
                    |  - Prisma ORM              |
                    |  - Zod Validation          |
                    |  - Pino Logging            |
                    |  - Rate Limiting           |
                    |  - reCAPTCHA v3            |
                    +----------------------------+
                        |              |
                        v              v
              +-------------+  +----------------+
              | PostgreSQL   |  | Redis          |
              | (Cloud SQL)  |  | (optional)     |
              | 20 tables    |  | Rate limiting  |
              | 5 enums      |  | Search cache   |
              +-------------+  +----------------+
                        |
                        v
              +----------------------------+
              |  External Services         |
              |  - Google reCAPTCHA v3     |
              |  - Anthropic Claude (OCR)  |
              |  - Resend (email)          |
              |  - PostHog (analytics)     |
              +----------------------------+
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | Next.js | 14.2 | React framework with App Router, SSR, standalone output |
| | React | 18 | UI component library |
| | TailwindCSS | 3.3 | Utility-first CSS framework |
| | React Query (TanStack) | 5.x | Server state management, caching, retry |
| | Lucide React | 0.563 | Icon library |
| | PostHog | 1.321 | Privacy-preserving analytics |
| | Google Maps | @react-google-maps/api 2.20 | Map view for provider locations |
| | focus-trap-react | 11.x | Accessibility: focus trapping for modals |
| **Backend** | Express.js | 4.18 | HTTP server framework |
| | Prisma | 5.22 | Type-safe ORM for PostgreSQL |
| | Zod | 3.22 | Runtime schema validation |
| | Pino | 10.x | Structured JSON logging |
| | Helmet | 7.1 | HTTP security headers |
| | ioredis | 5.9 | Redis client (optional) |
| | jose | 6.1 | JWT creation and verification |
| | sharp | 0.34 | Image processing |
| | Anthropic SDK | 0.71 | Claude AI for insurance card extraction |
| **Database** | PostgreSQL | 15 | Primary data store (Cloud SQL) |
| | Redis | Optional | Distributed rate limiting and caching |
| **Infrastructure** | Google Cloud Run | -- | Serverless container hosting |
| | GCP Artifact Registry | -- | Docker image registry |
| | GCP Secret Manager | -- | Secrets management |
| | GCP Cloud SQL | -- | Managed PostgreSQL |
| **CI/CD** | GitHub Actions | -- | Automated testing and deployment |
| | Workload Identity Federation | -- | Keyless GCP authentication |
| | Docker | Node 20 Alpine | Container images |
| **Testing** | Jest | 29.7 | Unit and integration tests |
| | Supertest | 7.2 | HTTP endpoint testing |
| | Playwright | 1.58 | End-to-end browser tests |
| | Testing Library | React 16, jest-dom 6 | React component tests |

---

## Monorepo Structure

```
HealthcareProviderDB/
+-- package.json                    # Root workspace config, shared scripts
+-- packages/
|   +-- backend/                    # Express API + Prisma
|   |   +-- src/
|   |   |   +-- index.ts            # App entry, middleware chain, health check
|   |   |   +-- routes/
|   |   |   |   +-- index.ts        # Route registration
|   |   |   |   +-- providers.ts    # Provider search, detail, colocated, plans, map
|   |   |   |   +-- plans.ts        # Plan search, grouped, meta, providers
|   |   |   |   +-- verify.ts       # Verification submit, vote, stats, recent
|   |   |   |   +-- locations.ts    # Location search, health systems, stats, detail
|   |   |   |   +-- admin.ts        # Admin: cleanup, cache, retention, confidence
|   |   |   |   +-- auth.ts         # Auth: magic link, verify, refresh, logout, CSRF
|   |   |   |   +-- savedProviders.ts  # Save/unsave/list/status
|   |   |   |   +-- insuranceCard.ts   # Scan, save, update, delete insurance cards
|   |   |   +-- services/           # Business logic layer
|   |   |   |   +-- providerService.ts
|   |   |   |   +-- planService.ts
|   |   |   |   +-- verificationService.ts
|   |   |   |   +-- locationService.ts
|   |   |   |   +-- confidenceService.ts
|   |   |   |   +-- confidenceDecayService.ts
|   |   |   |   +-- locationEnrichment.ts
|   |   |   |   +-- authService.ts
|   |   |   |   +-- savedProviderService.ts
|   |   |   |   +-- insuranceCardService.ts
|   |   |   |   +-- insuranceCardExtractor.ts
|   |   |   |   +-- mapService.ts
|   |   |   +-- middleware/
|   |   |   |   +-- rateLimiter.ts   # Dual-mode rate limiting (Redis + in-memory)
|   |   |   |   +-- captcha.ts       # reCAPTCHA v3 with fail-open/fail-closed
|   |   |   |   +-- honeypot.ts      # Bot detection via hidden fields
|   |   |   |   +-- errorHandler.ts  # Global error handling, AppError class
|   |   |   |   +-- requestLogger.ts # PII-free request logging
|   |   |   |   +-- requestId.ts     # X-Request-ID generation
|   |   |   |   +-- requestTimeout.ts # 30s timeout for API routes
|   |   |   |   +-- httpLogger.ts    # Pino HTTP request logging
|   |   |   |   +-- auth.ts          # JWT extraction, requireAuth
|   |   |   |   +-- csrf.ts          # CSRF double-submit cookie protection
|   |   |   +-- schemas/            # Zod validation schemas
|   |   |   +-- utils/              # Cache, logger, response helpers
|   |   |   +-- lib/                # Prisma client, Redis, encryption
|   |   |   +-- config/             # Constants
|   |   +-- prisma/
|   |   |   +-- schema.prisma       # Database schema (20 models, 5 enums)
|   |   +-- Dockerfile              # Multi-stage Docker build
|   |   +-- package.json
|   |
|   +-- frontend/                   # Next.js 14 App
|   |   +-- src/
|   |   |   +-- app/                # Next.js App Router pages
|   |   |   |   +-- page.tsx        # Homepage
|   |   |   |   +-- search/        # Provider search
|   |   |   |   +-- provider/[npi]/ # Provider detail
|   |   |   |   +-- map/           # Map view
|   |   |   |   +-- location/[locationId]/ # Location detail
|   |   |   |   +-- insurance/     # Insurance plan search
|   |   |   |   +-- login/         # Magic link login
|   |   |   |   +-- saved-providers/ # Saved provider list
|   |   |   |   +-- dashboard/insurance/ # Insurance card management
|   |   |   |   +-- about/         # About page
|   |   |   |   +-- research/      # Research methodology
|   |   |   |   +-- privacy/       # Privacy policy
|   |   |   |   +-- terms/         # Terms of service
|   |   |   |   +-- disclaimer/    # Disclaimer
|   |   |   +-- lib/
|   |   |   |   +-- api.ts         # API client with retry, CSRF, auth refresh
|   |   |   |   +-- insuranceCardApi.ts # Insurance card API
|   |   |   +-- types/             # TypeScript interfaces
|   |   |   +-- components/        # React components
|   |   +-- scripts/
|   |   |   +-- patch-next-swc.js  # Windows ARM64 SWC WASM patch
|   |   +-- Dockerfile             # Multi-stage Docker build
|   |   +-- package.json
|   |
|   +-- shared/                    # Shared TypeScript types
|       +-- src/
|       +-- package.json
|
+-- scripts/                       # Data import and maintenance scripts
|   +-- pre-import-check.ts        # Import safety check
|   +-- import-npi.ts              # NPI data import (Prisma)
|   +-- import-npi-direct.ts       # NPI data import (direct SQL)
|   +-- enrich-providers-nppes.ts  # NPPES enrichment pipeline
|
+-- prompts/                       # Claude project prompts
+-- .github/workflows/             # CI/CD pipeline definitions
+-- docker-compose.yml             # Full-stack Docker Compose
+-- docker-compose.dev.yml         # Dev database only
```

### Workspace Dependencies

```
@healthcareproviderdb/shared (no dependencies)
    ^
    |
    +-- @healthcareproviderdb/backend (depends on shared)
    +-- @healthcareproviderdb/frontend (depends on shared)
```

**Important:** The `next` package must NEVER be in the root `package.json`. It must only be in `packages/frontend/package.json` to avoid version conflicts from npm workspace hoisting.

---

## Data Flow

### Provider Search Flow

```
1. User enters search criteria (state, city, specialty, name)
         |
2. Frontend: React Query sends GET /api/v1/providers/search
         |
3. Backend: Zod validates query params
         |
4. Backend: Check search cache (Redis or in-memory, 5-min TTL)
         |
   +-- Cache HIT: Return cached result (X-Cache: HIT header)
   |
   +-- Cache MISS:
         |
5. Backend: providerService.searchProviders() builds Prisma query
         |
6. Prisma: Executes SQL against PostgreSQL with joins:
   - providers (main)
   - practice_locations (address)
   - provider_cms_details
   - provider_hospitals
   - provider_insurance
   - provider_taxonomies
   - provider_plan_acceptance + insurance_plans
         |
7. Backend: transformProvider() maps DB shape to API response
   - Selects primary practice location (preferring search state/city)
   - Maps entity type codes
   - Builds display name
         |
8. Backend: Cache result (5-min TTL), return JSON
         |
9. Frontend: React Query caches response, renders provider cards
```

### Verification Flow

```
1. User submits verification (accepts/rejects insurance for provider-plan pair)
         |
2. Frontend: POST /api/v1/verify with captchaToken, honeypot field
         |
3. Backend: Rate limiter checks (10/hr per IP)
         |
4. Backend: Honeypot check (reject if hidden field populated)
         |
5. Backend: reCAPTCHA v3 verification (score >= 0.5)
         |
6. Backend: Sybil check (30-day window for same IP/email on same pair)
         |
7. Backend: Create VerificationLog entry
         |
8. Backend: Upsert ProviderPlanAcceptance with updated confidence
         |
9. Backend: Return enriched acceptance with confidence breakdown
         |
10. Backend: Async cache invalidation (search results refresh)
```

### NPI Data Import Flow

```
1. Download NPI data files (CSV from CMS NPPES)
         |
2. Run pre-import-check.ts (count enriched records, pending conflicts)
         |
3. Run import-npi.ts or import-npi-direct.ts
         |
4. Import process:
   - Parse CSV rows
   - Upsert providers (explicit field allowlist, 24 NPI fields)
   - Upsert practice_locations
   - Upsert provider_taxonomies
   - Protected fields NOT overwritten:
     provider_profile_url, confidence_score, verification_count,
     latitude, longitude, geocoded_at, address_hash, data_source
         |
5. Conflicts logged to import_conflicts table for manual review
```

---

## Backend Architecture

### Middleware Chain

Requests flow through middleware in this order:

```
1. requestId           -- Generate/extract X-Request-ID
2. httpLogger          -- Pino HTTP request logging
3. helmet              -- Security headers (strict CSP for JSON API)
4. cors                -- Origin whitelist (production URLs + localhost in dev)
5. JSON parser         -- 100kb limit (16mb for insurance card scan)
6. URL-encoded parser  -- 100kb limit
7. cookieParser        -- Parse auth cookies
8. extractUser         -- JWT extraction from cookies (sets req.user)
9. [health check]      -- GET /health (before rate limiter)
10. defaultRateLimiter -- 200 req/hr global limit
11. requestLogger      -- PII-free usage tracking
12. requestTimeout     -- 30s timeout for /api/v1 routes
13. [route handlers]   -- Endpoint-specific middleware + handlers
14. notFoundHandler    -- 404 for unmatched routes
15. errorHandler       -- Global error handling
```

### Error Handling

The `AppError` class provides typed error creation:
- `AppError.badRequest(message)` -- 400
- `AppError.unauthorized(message)` -- 401
- `AppError.forbidden(message)` -- 403
- `AppError.notFound(message)` -- 404
- `AppError.conflict(message)` -- 409
- `AppError.tooManyRequests(message)` -- 429
- `AppError.serviceUnavailable(message)` -- 503
- `AppError.internal(message)` -- 500

The global error handler also handles:
- **Zod validation errors** -- Mapped to 400 with field-level details
- **Prisma errors** -- P2002 (duplicate) -> 409, P2025 (not found) -> 404, P2003 (FK violation) -> 400, P2024 (pool timeout) -> 503
- **Payload too large** -- 413

All error responses follow the standard format:
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "requestId": "abc123"
  }
}
```

### Graceful Shutdown

The server handles SIGINT and SIGTERM:
1. Stop accepting new connections
2. Wait for in-flight requests (10s timeout)
3. Disconnect Prisma database client
4. Exit cleanly

---

## Frontend Architecture

### Next.js App Router Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Homepage | Hero, search bar, verification stats |
| `/search` | Search | Provider search with filters, pagination |
| `/provider/[npi]` | Provider Detail | Full provider info, locations, plans, verifications |
| `/map` | Map View | Geographic provider search with Google Maps |
| `/location/[locationId]` | Location Detail | Practice location with co-located providers |
| `/insurance` | Insurance Plans | Plan search by carrier and type |
| `/login` | Login | Magic link authentication |
| `/saved-providers` | Saved Providers | User's bookmarked providers (auth required) |
| `/dashboard/insurance` | Insurance Card | Upload and manage insurance card (auth required) |
| `/about` | About | About VerifyMyProvider |
| `/research` | Research | Methodology and research citations |
| `/privacy` | Privacy Policy | Privacy policy |
| `/terms` | Terms | Terms of service |
| `/disclaimer` | Disclaimer | Medical disclaimer |

### API Client (`api.ts`)

The frontend API client provides:
- **Namespace organization:** `api.providers`, `api.plans`, `api.verify`, `api.locations`, `api.auth`, `api.savedProviders`, `api.insuranceCard`
- **Automatic retry:** 2 retries with exponential backoff for 429, 5xx, and network errors
- **CSRF management:** Auto-fetches CSRF token for mutating requests, refreshes on 403
- **Auth refresh:** Transparent 401 interception with token refresh via refresh cookie
- **Rate limit UX:** Toast notifications when rate limited
- **Proxy routing:** Browser requests use relative URLs (`/api/v1`) through Next.js rewrite proxy for same-origin cookies; SSR uses direct backend URL

---

## Database Schema

### Models (20 total)

| Model | Table | PK | Purpose |
|-------|-------|-----|---------|
| Provider | providers | npi (VARCHAR 10) | Core provider data from NPI Registry |
| PracticeLocation | practice_locations | id (autoincrement) | Provider addresses with geocoding |
| ProviderCmsDetails | provider_cms_details | npi | CMS enrichment (medical school, telehealth) |
| ProviderHospital | provider_hospitals | id | Hospital affiliations |
| ProviderInsurance | provider_insurance | id | Insurance network memberships |
| ProviderMedicare | provider_medicare | id | Medicare identifiers |
| ProviderTaxonomy | provider_taxonomies | id | Taxonomy codes (specialties) |
| TaxonomyReference | taxonomy_reference | taxonomy_code | Taxonomy code lookup table |
| Hospital | hospitals | ccn | Hospital master data |
| InsurancePlan | insurance_plans | plan_id | Insurance plan directory |
| ProviderPlanAcceptance | provider_plan_acceptance | id | Provider-plan acceptance with confidence |
| VerificationLog | verification_logs | id (CUID) | Individual verification submissions |
| VoteLog | vote_logs | id (CUID) | Upvotes/downvotes on verifications |
| SyncLog | sync_logs | id | NPI data sync history |
| DataQualityAudit | data_quality_audit | id | Data quality issue tracking |
| ImportConflict | import_conflicts | id | NPI re-import conflict queue |
| User | users | id (CUID) | Registered users |
| Session | sessions | id (CUID) | Auth sessions with refresh tokens |
| MagicLinkToken | magic_link_tokens | id (CUID) | Magic link tokens |
| SavedProvider | saved_providers | id (CUID) | User-provider bookmarks |
| UserInsuranceCard | user_insurance_cards | id (CUID) | Scanned insurance cards with encrypted PII |

### Enums

| Enum | Values | Used By |
|------|--------|---------|
| AcceptanceStatus | ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN | ProviderPlanAcceptance |
| VerificationSource | CMS_DATA, CARRIER_DATA, PROVIDER_PORTAL, PHONE_CALL, CROWDSOURCE, AUTOMATED, NPPES_SYNC, CARRIER_SCRAPE, NETWORK_CROSSREF | VerificationLog |
| VerificationType | PLAN_ACCEPTANCE, PROVIDER_INFO, CONTACT_INFO, STATUS_CHANGE, NEW_PLAN | VerificationLog |

### Key Relationships

```
Provider (1) --< PracticeLocation (many)
Provider (1) --< ProviderPlanAcceptance (many)
Provider (1) --> ProviderCmsDetails (1)
Provider (1) --< ProviderHospital (many)
Provider (1) --< ProviderInsurance (many)
Provider (1) --< ProviderTaxonomy (many)
Provider (1) --< VerificationLog (many)
Provider (1) --< SavedProvider (many)

InsurancePlan (1) --< ProviderPlanAcceptance (many)
InsurancePlan (1) --< VerificationLog (many)
InsurancePlan (1) --< UserInsuranceCard (many)

PracticeLocation (1) --< ProviderPlanAcceptance (many)

VerificationLog (1) --< VoteLog (many)

User (1) --< Session (many)
User (1) --< SavedProvider (many)
User (1) --> UserInsuranceCard (1)
```

### Index Strategy

The schema includes 40+ indexes optimized for:
- **Provider search:** Last name, specialty, taxonomy code, category, credential, gender
- **Location search:** State, city, state+city, zip code, NPI, address hash, lat/lng
- **Plan search:** Carrier, carrier_id, state+carrier, plan_variant
- **Acceptance queries:** NPI+status, plan+status, confidence score, expiration, last verified
- **Verification queries:** Provider NPI, plan ID, created_at, Sybil detection (IP+email composite)
- **Deduplication:** Unique constraints on location address, vote per IP, saved provider per user

---

## Security Architecture

### Authentication

- **Magic link email login** -- No passwords stored; tokens expire after use
- **JWT access tokens** -- 15-minute lifetime, stored in httpOnly cookies
- **Refresh tokens** -- 30-day lifetime, stored in httpOnly cookies with path restriction (`/api/v1/auth`)
- **Session management** -- Database-backed sessions with explicit logout and "logout everywhere"
- **Cookie security** -- httpOnly, secure (production), sameSite: lax, domain-scoped

### Anti-Abuse (4-Layer Sybil Prevention)

1. **Rate limiting** -- Sliding window algorithm (Redis or in-memory)
   - Default: 200 req/hr
   - Search: 100 req/hr
   - Verification: 10 req/hr
   - Vote: 10 req/hr
   - Magic link: 5 req/15 min

2. **reCAPTCHA v3** -- Score-based bot detection on verification and vote endpoints
   - Minimum score: 0.5
   - Fail-open by default with fallback rate limiting (3 req/hr)
   - Configurable fail-closed mode via `CAPTCHA_FAIL_MODE`

3. **Honeypot field** -- Hidden `website` field that bots auto-populate
   - Silent rejection (returns 200 OK to not alert bots)

4. **Vote deduplication** -- Unique constraint on `(verificationId, sourceIp)` in vote_logs
   - 30-day submission windows for same provider-plan pair

### Security Headers (Helmet)

- **CSP:** `default-src 'none'` (strict for JSON API)
- **Cross-Origin-Embedder-Policy:** require-corp
- **Cross-Origin-Opener-Policy:** same-origin
- **Cross-Origin-Resource-Policy:** same-origin
- **Referrer-Policy:** no-referrer

### CSRF Protection

- Double-submit cookie pattern via `csrf-csrf` library
- CSRF token endpoint: `GET /api/v1/auth/csrf-token`
- Frontend includes `X-CSRF-Token` header on all mutating requests
- Automatic retry on CSRF token mismatch (403)

### Admin Authentication

- `X-Admin-Secret` header validated with timing-safe comparison
- Returns 503 (not 401) if `ADMIN_SECRET` not configured, preventing information leakage

### Data Encryption

- Insurance card PII (subscriber ID, group number, RxBIN, etc.) encrypted at rest with AES-256
- Key rotation endpoint: `POST /api/v1/admin/rotate-encryption-key`
- Supports dual-key decryption during rotation (primary + previous key)

---

## Caching Strategy

### Dual-Mode Cache

The caching system automatically selects:
- **Redis mode** -- When `REDIS_URL` is configured (distributed, supports horizontal scaling)
- **In-memory mode** -- Fallback (process-local, single-instance only)

### Cache Usage

| What | TTL | Key Pattern | Invalidation |
|------|-----|-------------|--------------|
| Provider search results | 5 min | `search:{hash of params}` | On new verification |
| Map pin results | 5 min | `map:{JSON params}` | On new verification |
| Cities by state | Implicit via search | Part of search cache | With search cache |

### Fail-Open Behavior

If Redis becomes unavailable mid-request:
- Requests are **allowed** (fail-open)
- Warning logged
- `X-RateLimit-Status: degraded` header set
- In-memory fallback is NOT used mid-request to avoid inconsistent state

---

## Confidence Scoring Algorithm

### 4-Factor Scoring (0-100 points)

| Factor | Weight | Metric |
|--------|--------|--------|
| Data Source | 0-25 pts | Authoritative source quality (CMS=25, Carrier=20, Crowdsource=15, Automated=10) |
| Recency | 0-30 pts | Time since last verification (tiered: 30d=30pts, 60d=20pts, 90d=10pts, 180d=5pts, 180+=0pts) |
| Verification Count | 0-25 pts | Number of verifications (0=0pts, 1=10pts, 2=15pts, 3+=25pts) |
| Agreement | 0-20 pts | Upvote/downvote ratio (100%=20pts, 80%+=15pts, 60%+=10pts, 40%+=5pts, <40%=0pts) |

### Specialty-Specific Freshness Thresholds

Based on Ndumele et al. 2018, Health Affairs:

| Specialty Category | Freshness Threshold | Rationale |
|-------------------|--------------------|-----------|
| Mental Health | 30 days | 43% Medicaid acceptance, high churn |
| Primary Care | 60 days | 12% annual turnover |
| Specialist | 60 days | Similar to primary care |
| Hospital-Based | 90 days | More stable positions |

### Confidence Levels

| Level | Score Range | Requirements |
|-------|------------|-------------|
| VERY_HIGH | 91-100 | 3+ verifications required |
| HIGH | 76-90 | 3+ verifications required |
| MEDIUM | 51-75 | Achievable with < 3 verifications (capped) |
| LOW | 26-50 | -- |
| VERY_LOW | 0-25 | -- |

Research-based: 3 verifications achieve expert-level accuracy (kappa=0.58, Mortensen et al. 2015, JAMIA). Confidence level is capped at MEDIUM if fewer than 3 verifications exist, regardless of score.

---

## Infrastructure

### Cloud Run Configuration

| Parameter | Backend | Frontend | Staging |
|-----------|---------|----------|---------|
| Memory | 512Mi | 512Mi | 512Mi |
| CPU | 1 | 1 | 1 |
| Min instances | 0 | 0 | 0 |
| Max instances | 10 | 10 | 2 |
| Concurrency | 80 | 80 | 80 |
| Port | 8080 | 8080 | 8080 |
| Auth | Unauthenticated | Unauthenticated | Unauthenticated |

### Scaling Considerations

- **Scale-to-zero:** Both services scale to 0 instances when idle (cost savings)
- **Cold start:** First request after scale-to-zero has ~2-5s latency
- **Connection pooling:** Prisma manages database connection pool
- **Rate limiting at scale:** Redis mode required for distributed rate limiting across instances; in-memory mode only safe for single instance

---

## Key Architectural Decisions

### 1. Monorepo with npm Workspaces

**Decision:** Single repo with `packages/backend`, `packages/frontend`, `packages/shared`

**Rationale:**
- Shared types between frontend and backend
- Atomic changes across packages
- Single CI/CD pipeline
- Simplified dependency management

**Trade-off:** Requires careful hoisting management (e.g., `next` must NOT be in root package.json)

### 2. Express over Next.js API Routes

**Decision:** Separate Express backend instead of Next.js API routes

**Rationale:**
- Full control over middleware chain
- Better suited for complex business logic (confidence scoring, Sybil detection)
- Independent scaling (backend can scale separately from frontend)
- Prisma works more naturally with Express

### 3. Prisma over Raw SQL

**Decision:** Prisma ORM for database access

**Rationale:**
- Type-safe queries matching TypeScript models
- Migration management
- Automatic query optimization
- `db pull` for existing schema introspection

**Trade-off:** Some complex queries require `$queryRaw`; schema conventions need manual PascalCase/camelCase mapping

### 4. Dual-Mode Caching (Redis + In-Memory)

**Decision:** Automatic fallback from Redis to in-memory

**Rationale:**
- Redis optional for development simplicity
- In-memory sufficient for single-instance deployment
- Redis required only when horizontally scaled
- Fail-open prevents cache outages from blocking requests

### 5. No HIPAA Compliance

**Decision:** Explicitly avoid HIPAA scope

**Rationale:**
- All data is publicly available (NPI registry, insurance directories)
- Crowdsourced verifications are about public facts (does provider accept insurance X?)
- Enables 3x faster development velocity
- Insurance card PII encrypted at rest as a best practice, not a regulatory requirement

### 6. Cloud Run over GKE/EC2

**Decision:** Serverless containers on Cloud Run

**Rationale:**
- Scale-to-zero reduces costs during pre-launch period
- No cluster management overhead
- Native Cloud SQL integration via unix socket
- Automatic HTTPS with custom domain support
- Built-in load balancing and auto-scaling
