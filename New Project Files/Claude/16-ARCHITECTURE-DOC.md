# Architecture Document

This document describes the overall architecture of VerifyMyProvider, including the technology stack, monorepo structure, data flow, database schema, API design, middleware chain, security layers, and infrastructure.

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | Next.js | 14.2 | App Router framework, SSR, API routes |
| | React | 18.3 | UI component library |
| | TailwindCSS | 3.3.6 | Utility-first CSS |
| | @tanstack/react-query | 5.x | Server state management |
| **Backend** | Express.js | -- | HTTP server and routing |
| | Prisma | 5.22 | ORM and database client |
| | pino | -- | Structured JSON logging |
| | zod | -- | Runtime validation |
| | ioredis | -- | Redis client |
| **Database** | PostgreSQL | 15 | Primary data store (Cloud SQL) |
| **Caching** | Redis | Optional | Distributed rate limiting (in-memory fallback) |
| **Infrastructure** | Cloud Run | -- | Container hosting (auto-scaling 0-10) |
| | Artifact Registry | -- | Docker image storage |
| | Secret Manager | -- | Secret storage |
| | Cloud SQL | -- | Managed PostgreSQL |
| **CI/CD** | GitHub Actions | -- | Build, test, deploy |
| | Workload Identity Federation | -- | Keyless GCP authentication |
| **Analytics** | PostHog | -- | Privacy-preserving product analytics |
| **AI** | Anthropic Claude | Haiku 4.5 | Insurance card OCR extraction |

---

## Monorepo Structure

The project uses npm workspaces with three packages:

```
HealthcareProviderDB/
  package.json              # Root workspace config
  tsconfig.base.json        # Shared TypeScript config
  docker-compose.yml        # Full stack Docker config
  docker-compose.dev.yml    # Dev database only
  .github/workflows/        # CI/CD pipelines
  packages/
    backend/                # Express API server
      src/
        index.ts            # App entry point
        config/             # Constants, configuration
        lib/                # Prisma client, Redis client
        middleware/          # Request processing chain
        routes/             # API route handlers
        services/           # Business logic
        utils/              # Logging, caching
        scripts/            # Data import scripts
      prisma/
        schema.prisma       # Database schema
      Dockerfile
    frontend/               # Next.js application
      src/
        app/                # App Router pages and API routes
        components/         # React components (60+)
        context/            # React contexts
        hooks/              # Custom React hooks
        lib/                # Utilities, API client
        types/              # TypeScript type definitions
      Dockerfile
    shared/                 # Shared types and utilities
      src/
        types/              # Shared TypeScript interfaces
```

### Workspace Dependency Rules
- `packages/shared` has no internal dependencies (leaf package)
- `packages/backend` depends on `packages/shared`
- `packages/frontend` depends on `packages/shared`
- Root `package.json` contains shared dev dependencies (prisma, csv-parse, pg)
- `next` must only be in `packages/frontend/package.json` (never at root -- causes SWC version mismatches)

---

## Data Flow

### Read Path (Provider Search)
```
Browser
  |
  | HTTPS GET /search?specialty=...&state=NY
  v
Next.js Frontend (Cloud Run)
  |
  | fetch() to NEXT_PUBLIC_API_URL
  v
Express Backend (Cloud Run)
  |
  | Middleware chain (requestId -> httpLogger -> helmet -> cors -> json -> rateLimiter -> requestLogger)
  |
  | Route: GET /api/v1/providers/search
  v
Prisma ORM
  |
  | SQL query with filters, joins, pagination
  v
PostgreSQL (Cloud SQL)
  |
  | Results with provider data, location, specialty
  v
Confidence calculation (per-record enrichment)
  |
  | calculateConfidenceScore() applied to each acceptance
  v
JSON response -> Frontend -> React Query cache -> UI render
```

### Write Path (Verification Submission)
```
Browser
  |
  | POST /api/v1/verify
  | Body: { npi, planId, acceptsInsurance, captchaToken, website (honeypot) }
  v
Express Backend
  |
  +-- honeypotCheck: Silent 200 if honeypot field filled
  +-- verifyCaptcha: reCAPTCHA v3 verification (score >= 0.5)
  +-- verificationRateLimiter: 10/hour per IP
  +-- Sybil prevention: Duplicate check (IP + email within 30-day window)
  |
  v
VerificationService
  |
  | 1. Find or create ProviderPlanAcceptance record
  | 2. Create VerificationLog entry (with 6-month TTL)
  | 3. Update verification count and last_verified timestamp
  | 4. Recalculate confidence score
  | 5. If 3+ verifications with 60%+ confidence: update acceptance status
  v
PostgreSQL (transactional write)
  |
  v
JSON response with updated acceptance and confidence data
```

### Insurance Card Extraction Path
```
Browser
  |
  | Drag-and-drop image upload
  v
Next.js API Route (server-side, same Cloud Run instance)
  |
  +-- Rate limit: 10/hour per IP
  +-- Validate: type (image/*), size (<10MB), base64 format
  +-- Preprocess: resize, contrast enhancement (sharp)
  |
  v
Anthropic Claude API (Haiku 4.5)
  |
  | Vision model extracts structured data from card image
  v
Parse and validate response (zod schema)
  |
  | Retry with alternative prompt if confidence < 0.3
  v
JSON response with extracted insurance card data
```

---

## Database Schema (15 Prisma Models)

### Core Provider Data
| Model | Table | PK | Description |
|-------|-------|----|-------------|
| `Provider` | `providers` | `npi` (VARCHAR 10) | Provider demographics, specialty, taxonomy |
| `practice_locations` | `practice_locations` | `id` (auto-increment) | Provider practice addresses (1-to-many from Provider) |
| `provider_taxonomies` | `provider_taxonomies` | `id` (auto-increment) | Taxonomy code associations (many-to-many) |
| `taxonomy_reference` | `taxonomy_reference` | `taxonomy_code` | Taxonomy code lookup table (400+ codes) |

### Hospital and Insurance Network Data
| Model | Table | PK | Description |
|-------|-------|----|-------------|
| `hospitals` | `hospitals` | `ccn` | Hospital reference data (CMS hospital compare) |
| `provider_hospitals` | `provider_hospitals` | `id` (auto-increment) | Provider-hospital affiliations |
| `provider_insurance` | `provider_insurance` | `id` (auto-increment) | Provider network identifiers from NPI other_id |
| `provider_medicare` | `provider_medicare` | `id` (auto-increment) | Provider Medicare identifiers |
| `provider_cms_details` | `provider_cms_details` | `npi` | CMS-specific details (medical school, telehealth) |

### Insurance Plans
| Model | Table | PK | Description |
|-------|-------|----|-------------|
| `InsurancePlan` | `insurance_plans` | `planId` | Insurance plan definitions (carrier, type, state) |

### Verification System
| Model | Table | PK | Description |
|-------|-------|----|-------------|
| `ProviderPlanAcceptance` | `provider_plan_acceptance` | `id` (auto-increment) | Provider-plan acceptance status with confidence score |
| `VerificationLog` | `verification_logs` | `id` (cuid) | Individual verification submissions with TTL |
| `VoteLog` | `vote_logs` | `id` (cuid) | Votes on verification records (unique per IP per verification) |

### Operational
| Model | Table | PK | Description |
|-------|-------|----|-------------|
| `SyncLog` | `sync_logs` | `id` (auto-increment) | Data import/sync audit trail (90-day retention) |
| `DataQualityAudit` | `data_quality_audit` | `id` (auto-increment) | Data quality issues tracking |

### Key Relationships
```
Provider (NPI)
  |-- has many --> practice_locations
  |-- has many --> provider_taxonomies
  |-- has many --> provider_hospitals
  |-- has many --> provider_insurance
  |-- has many --> provider_medicare
  |-- has one  --> provider_cms_details
  |-- has many --> ProviderPlanAcceptance
  |-- has many --> VerificationLog
  |-- has many --> DataQualityAudit

InsurancePlan (planId)
  |-- has many --> ProviderPlanAcceptance
  |-- has many --> VerificationLog

ProviderPlanAcceptance
  |-- belongs to --> Provider (npi)
  |-- belongs to --> InsurancePlan (planId)
  |-- belongs to --> practice_locations (locationId, optional)

VerificationLog
  |-- belongs to --> Provider (providerNpi)
  |-- belongs to --> InsurancePlan (planId)
  |-- has many  --> VoteLog
```

---

## RESTful API Design

### Route Structure
All API routes are versioned under `/api/v1/`:

| Prefix | Router File | Rate Limit | Description |
|--------|------------|------------|-------------|
| `/api/v1/providers` | `routes/providers.ts` | 100/hr (search) | Provider search and detail |
| `/api/v1/plans` | `routes/plans.ts` | 200/hr (default) | Insurance plan search and detail |
| `/api/v1/verify` | `routes/verify.ts` | 10/hr (submissions) | Verification submissions and votes |
| `/api/v1/locations` | `routes/locations.ts` | 200/hr (default) | Location search and detail |
| `/api/v1/admin` | `routes/admin.ts` | N/A (secret-protected) | Admin operations |

### Response Format
All responses follow a consistent JSON envelope:

**Success**:
```json
{
  "success": true,
  "data": { ... }
}
```

**Error**:
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "MACHINE_READABLE_CODE",
    "statusCode": 400,
    "requestId": "uuid-for-log-correlation"
  }
}
```

### Admin Endpoints
Protected by `X-Admin-Secret` header (validated with `crypto.timingSafeEqual`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/admin/cleanup-expired` | POST | Clean up expired verifications |
| `/admin/expiration-stats` | GET | Verification expiration statistics |
| `/admin/health` | GET | Detailed health with retention metrics |
| `/admin/cache/clear` | POST | Clear application cache |
| `/admin/cache/stats` | GET | Cache hit/miss statistics |
| `/admin/enrichment/stats` | GET | Location enrichment statistics |
| `/admin/cleanup/sync-logs` | POST | Clean up sync logs older than 90 days |
| `/admin/retention/stats` | GET | Comprehensive retention statistics |
| `/admin/recalculate-confidence` | POST | Batch confidence score recalculation |

---

## Middleware Chain

Requests are processed through this ordered middleware chain:

```
1. requestId        - Generate UUID, set X-Request-ID header for log correlation
2. httpLogger       - Pino HTTP request logging (method, url, status, duration)
3. helmet           - Security headers (strict CSP for JSON API, CORS policy)
4. cors             - Cross-origin request filtering (whitelist-based)
5. express.json     - Body parsing with 100KB size limit
6. /health          - Health check (BEFORE rate limiter to avoid blocking monitoring)
7. defaultRateLimiter - 200 requests/hour per IP (sliding window)
8. requestLogger    - Request analytics logging (without PII)
9. generalTimeout   - 30-second request timeout for /api/v1 routes
10. routes          - API route handlers
11. notFoundHandler - 404 for unmatched routes
12. errorHandler    - Global error handler (AppError, Zod, Prisma, generic)
```

### Error Handler Classification
The global error handler provides specific responses for:
- `AppError` (application errors with status codes)
- `ZodError` (validation errors with field details)
- `PrismaClientKnownRequestError` (P2002 duplicate, P2025 not found, P2003 FK violation, P2024 pool timeout, P2010 query error)
- `PrismaClientInitializationError` (database connection failure)
- `PayloadTooLargeError` (413 for oversized requests)
- Generic errors (500 with sanitized message in production)

---

## 4-Factor Confidence Scoring

| Factor | Max | Algorithm |
|--------|-----|-----------|
| Data Source Quality | 25 | CMS=25, Carrier=20, Crowdsource=15, Automated=10 |
| Recency | 30 | Specialty-specific tiers (Mental Health 30d, Primary Care 60d, Hospital 90d) |
| Verification Count | 25 | 0=0, 1=10, 2=15, 3+=25 (research: 3 = expert-level accuracy) |
| Community Agreement | 20 | 100%=20, 80%+=15, 60%+=10, 40%+=5, <40%=0 |

With <3 verifications, confidence level is capped at MEDIUM regardless of numeric score.

See `12-confidence-scoring.md` for the complete algorithm specification.

---

## Sybil Prevention (5 Layers)

Anti-abuse protections prevent fake verification spam:

| Layer | Implementation | Purpose |
|-------|---------------|---------|
| **1. Rate Limiting** | 10 verifications/hour, 10 votes/hour per IP (sliding window) | Prevent high-volume spam |
| **2. Honeypot** | Hidden `website` field in forms; bots auto-fill, humans leave empty | Catch naive bots silently (returns fake 200 OK) |
| **3. CAPTCHA** | Google reCAPTCHA v3 (score >= 0.5) on submissions and votes | Detect sophisticated bots |
| **4. Vote Deduplication** | Unique constraint on (verificationId, sourceIp) in vote_logs | One vote per IP per verification |
| **5. Verification Windows** | 30-day window: same IP/email cannot re-verify same provider-plan pair | Prevent repeated fake verifications |

### Defense Ordering
The layers are ordered from cheapest to most expensive:
1. Honeypot (zero cost, catches naive bots)
2. Rate limiter (in-memory or Redis, microsecond check)
3. CAPTCHA (external API call, ~100ms)
4. Database dedup checks (Prisma query, ~10ms)

---

## Privacy-Preserving Analytics

PostHog analytics are configured with maximum privacy:

- `autocapture: false` -- No automatic DOM event capture
- `disable_session_recording: true` -- No session replays
- `opt_out_capturing_by_default: true` -- Requires explicit user consent
- Only boolean indicators sent (e.g., `has_specialty_filter: true`, not `specialty: "Cardiology"`)
- Sensitive URL parameters (`npi`, `planId`, `name`) stripped before pageview capture
- No healthcare-specific data ever sent to analytics

---

## Docker Containerization and Auto-Scaling

### Container Configuration
Both services use identical Cloud Run settings:
- **Memory**: 512Mi
- **CPU**: 1 vCPU
- **Port**: 8080
- **Min instances**: 0 (scale to zero when idle)
- **Max instances**: 10 (production), 2 (staging)
- **Concurrency**: 80 requests per instance

### Auto-Scaling Behavior
Cloud Run automatically scales based on:
- Request concurrency (target: 80 concurrent requests per instance)
- CPU utilization
- Cold starts from 0 instances (first request after idle takes ~2-5 seconds)

### Cost Optimization
- Scale-to-zero eliminates cost during low-traffic periods
- 512Mi memory is sufficient for the Express/Next.js workloads
- Concurrency of 80 allows efficient request handling per instance
- Docker layer caching in GitHub Actions speeds up builds

---

## Security Architecture Summary

| Category | Implementation |
|----------|---------------|
| **Transport** | HTTPS enforced by Cloud Run (TLS termination at load balancer) |
| **Headers** | Helmet with strict CSP, HSTS, X-Frame-Options, Referrer-Policy |
| **CORS** | Whitelist-based origin validation |
| **Authentication** | Admin endpoints: X-Admin-Secret with timing-safe comparison |
| **Rate Limiting** | Sliding window (Redis distributed or in-memory), per-endpoint limits |
| **Input Validation** | Zod schemas, express.json size limits (100KB), base64 validation |
| **Bot Prevention** | 5-layer Sybil prevention (rate limit, honeypot, CAPTCHA, vote dedup, time windows) |
| **Secrets** | GCP Secret Manager (no env vars for sensitive data in production) |
| **Identity** | Workload Identity Federation (no long-lived keys) |
| **Containers** | Non-root users, production-only dependencies, multi-stage builds |
| **Logging** | Structured JSON (pino), request IDs for correlation, no PII in logs |
