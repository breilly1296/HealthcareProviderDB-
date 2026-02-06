# VerifyMyProvider Architecture Document

**Last Updated:** 2026-02-06

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router), React, TailwindCSS, React Query | 14.2, 18.3, 3.3, 5.x |
| Backend | Express.js, Zod validation | 4.18, 3.22 |
| ORM | Prisma | 5.22 |
| Database | PostgreSQL (Google Cloud SQL) | 15 |
| Caching | Redis (optional) / In-memory fallback | ioredis 5.9 |
| Logging | Pino + pino-http | 10.3 |
| Security | Helmet, reCAPTCHA v3, rate limiting, honeypot | helmet 7.1 |
| Infrastructure | Google Cloud Run, Artifact Registry, Secret Manager | |
| CI/CD | GitHub Actions, Workload Identity Federation | |
| Analytics | PostHog (privacy-preserving) | |
| AI | Anthropic Claude (insurance card OCR) | SDK 0.71 |
| Testing | Jest, Playwright (E2E) | 29.7, 1.58 |

---

## Monorepo Structure

```
HealthcareProviderDB/
├── packages/
│   ├── backend/              Express API + Prisma ORM
│   │   ├── src/
│   │   │   ├── index.ts          Main server (middleware chain, CORS, health check)
│   │   │   ├── routes/           API route handlers
│   │   │   │   ├── index.ts      Route registration
│   │   │   │   ├── providers.ts  Provider search + detail (3 endpoints)
│   │   │   │   ├── plans.ts      Insurance plan endpoints (6 endpoints)
│   │   │   │   ├── verify.ts     Verification + voting (5 endpoints)
│   │   │   │   ├── locations.ts  Location endpoints (5 endpoints)
│   │   │   │   └── admin.ts      Admin endpoints (9 endpoints)
│   │   │   ├── services/         Business logic layer
│   │   │   │   ├── providerService.ts     Provider search, name parsing
│   │   │   │   ├── planService.ts         Plan search, grouping
│   │   │   │   ├── verificationService.ts Verification CRUD, Sybil prevention
│   │   │   │   ├── confidenceService.ts   4-factor confidence scoring
│   │   │   │   ├── confidenceDecayService.ts Proactive score recalculation
│   │   │   │   ├── locationService.ts     Location search, co-located providers
│   │   │   │   └── locationEnrichment.ts  Location enrichment stats
│   │   │   ├── middleware/       Request processing pipeline
│   │   │   │   ├── rateLimiter.ts  Dual-mode rate limiting (Redis/in-memory)
│   │   │   │   ├── captcha.ts      reCAPTCHA v3 with fail-open/closed modes
│   │   │   │   ├── honeypot.ts     Bot detection via hidden fields
│   │   │   │   ├── errorHandler.ts Global error handling + AppError class
│   │   │   │   ├── requestLogger.ts PII-free structured logging
│   │   │   │   ├── requestId.ts    Correlation ID generation
│   │   │   │   └── httpLogger.ts   HTTP request/response logging
│   │   │   ├── schemas/         Zod validation schemas
│   │   │   ├── utils/           Cache, logger, response helpers
│   │   │   ├── lib/             Prisma client, Redis client
│   │   │   └── config/          Constants (TTLs, thresholds)
│   │   ├── prisma/
│   │   │   └── schema.prisma    Database schema (15 models)
│   │   └── Dockerfile
│   ├── frontend/             Next.js 14 App
│   │   ├── src/
│   │   │   ├── app/              App Router pages
│   │   │   │   ├── page.tsx      Home (Hero, WhyItMatters, HowItWorks, Confidence, CTA)
│   │   │   │   ├── search/       Provider search page
│   │   │   │   ├── provider/     Provider detail page
│   │   │   │   ├── insurance/    Insurance card upload
│   │   │   │   ├── location/     Location detail page
│   │   │   │   ├── about/        About page
│   │   │   │   ├── privacy/      Privacy policy
│   │   │   │   ├── terms/        Terms of service
│   │   │   │   ├── disclaimer/   Data disclaimer
│   │   │   │   └── research/     Research citations
│   │   │   ├── components/       React components
│   │   │   ├── context/          React contexts (Theme, Compare, Error)
│   │   │   └── lib/              API client, utilities
│   │   ├── scripts/
│   │   │   └── patch-next-swc.js Windows ARM64 SWC patch
│   │   └── Dockerfile
│   └── shared/               TypeScript types shared between packages
├── scripts/                  NPI import, data cleanup utilities (40+ scripts)
├── src/
│   └── taxonomy-mappings.ts  Specialty category mappings (400+ codes)
├── .github/workflows/        CI/CD pipelines (5 workflows)
├── docker-compose.yml        Full stack Docker setup
├── docker-compose.dev.yml    Dev database only
└── prompts/                  Claude project prompts
```

---

## Database Schema

### 15 Prisma Models

**Core Entities:**
- `Provider` -- NPI-keyed provider records with specialty, entity type, credentials
- `InsurancePlan` -- Insurance plans with issuer, plan type, carrier, state
- `practice_locations` -- Provider practice addresses (linked via NPI)

**Verification System:**
- `ProviderPlanAcceptance` -- Tracks whether a provider accepts a plan at a location (with confidence score, TTL)
- `VerificationLog` -- Individual verification submissions with Sybil prevention fields
- `VoteLog` -- Up/down votes on verifications (unique per IP per verification)

**Enrichment Data:**
- `provider_cms_details` -- CMS data (medical school, graduation year, telehealth, Medicare assignment)
- `provider_hospitals` -- Provider-hospital affiliations
- `provider_insurance` -- Provider insurance network memberships
- `provider_medicare` -- Medicare IDs
- `provider_taxonomies` -- Provider taxonomy codes (up to 15 per provider)
- `taxonomy_reference` -- NUCC taxonomy code reference data

**Operational:**
- `SyncLog` -- NPI import tracking (status, records processed, errors)
- `DataQualityAudit` -- Data quality issue tracking

**Supporting:**
- `hospitals` -- Hospital reference data (CCN-keyed)

### Key Relationships
```
Provider (NPI) ─┬── practice_locations (1:N)
                ├── provider_taxonomies (1:N)
                ├── provider_cms_details (1:1)
                ├── provider_hospitals (1:N)
                ├── provider_insurance (1:N)
                ├── provider_medicare (1:N)
                ├── ProviderPlanAcceptance (1:N) ── InsurancePlan (N:1)
                ├── VerificationLog (1:N) ── VoteLog (1:N)
                └── DataQualityAudit (1:N)
```

### Enums
- `AcceptanceStatus`: ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN
- `VerificationSource`: CMS_DATA, CARRIER_DATA, PROVIDER_PORTAL, PHONE_CALL, CROWDSOURCE, AUTOMATED, NPPES_SYNC, CARRIER_SCRAPE, NETWORK_CROSSREF
- `VerificationType`: PLAN_ACCEPTANCE, PROVIDER_INFO, CONTACT_INFO, STATUS_CHANGE, NEW_PLAN

---

## Data Flow

### Search Flow
```
User searches → Next.js Frontend → GET /api/v1/providers/search
                                          │
                                    Zod validation
                                          │
                                    Rate limit check (100/hr)
                                          │
                                    Cache check (5-min TTL)
                                          │ (miss)
                                    Prisma query (practice_locations JOIN)
                                          │
                                    Transform provider data
                                          │
                                    Cache result → Return JSON
```

### Verification Flow
```
User submits verification → POST /api/v1/verify
                                   │
                             Rate limit (10/hr)
                                   │
                             Honeypot check
                                   │
                             reCAPTCHA v3 verify
                                   │
                             Zod validation
                                   │
                             Validate provider + plan exist
                                   │
                             Sybil check (IP + email dedup, 30-day window)
                                   │
                             Create VerificationLog (with TTL)
                                   │
                             Upsert ProviderPlanAcceptance
                                   │
                             Calculate confidence score (4 factors)
                                   │
                             Determine consensus status
                                   │
                             Invalidate search cache
                                   │
                             Return result
```

### NPI Import Flow
```
NPPES CSV file → import-npi-direct.ts
                        │
                  Create sync_log entry
                        │
                  Stream CSV records (csv-parse)
                        │
                  For each record:
                  ├── Parse dates, clean phone numbers
                  ├── Extract taxonomy codes (up to 15)
                  ├── Map taxonomy → specialty category
                  ├── Skip deactivated providers
                  └── Add to batch
                        │
                  Every 5000 records:
                  ├── BEGIN transaction
                  ├── INSERT ... ON CONFLICT (upsert)
                  ├── COMMIT
                  └── Log progress
                        │
                  Update sync_log → COMPLETED/FAILED
```

---

## Middleware Chain

The Express backend processes requests through this middleware chain (defined in `packages/backend/src/index.ts`):

1. **requestId** -- Generates unique correlation ID for log tracing
2. **httpLogger** -- Pino HTTP request/response logging
3. **helmet** -- Security headers (strict CSP for JSON API, CORS headers, referrer policy)
4. **cors** -- Origin validation against allowed list
5. **express.json** -- Body parsing with 100KB limit
6. **Health check** (`/health`) -- Bypasses rate limiter
7. **defaultRateLimiter** -- 200 req/hr default (sliding window)
8. **requestLogger** -- PII-free structured logging
9. **API routes** (`/api/v1/*`) -- Route-specific rate limiters applied per-endpoint
10. **notFoundHandler** -- 404 for unmatched routes
11. **errorHandler** -- Global error handler (AppError, Zod, Prisma, payload errors)

---

## Confidence Scoring Algorithm

4-factor scoring system (0-100 points total):

| Factor | Max Points | Logic |
|--------|-----------|-------|
| Data Source | 25 | CMS/NPPES: 25, Carrier: 20, Crowdsource: 15, Automated: 10 |
| Recency | 30 | Tiered by days since verification, adjusted by specialty freshness threshold |
| Verification Count | 25 | 0: 0pts, 1: 10pts, 2: 15pts, 3+: 25pts (research: 3 = expert accuracy) |
| Agreement | 20 | Based on upvote/downvote ratio: 100%: 20, 80%+: 15, 60%+: 10, 40%+: 5 |

**Specialty-specific freshness thresholds:**
- Mental Health: 30 days (43% Medicaid acceptance, highest churn)
- Primary Care: 60 days (12% annual turnover)
- Specialist: 60 days
- Hospital-based: 90 days (most stable)

**Confidence levels:** VERY_HIGH (91+), HIGH (76-90), MEDIUM (51-75), LOW (26-50), VERY_LOW (0-25)
- With < 3 verifications, maximum level is capped at MEDIUM regardless of score

---

## Sybil Attack Prevention (4 Layers)

1. **Rate Limiting:** IP-based sliding window (10 verifications/hour, 10 votes/hour)
2. **CAPTCHA:** Google reCAPTCHA v3 with configurable fail-open/closed mode and fallback rate limiting (3/hour when CAPTCHA unavailable)
3. **Vote Deduplication:** Unique constraint on `(verificationId, sourceIp)` prevents duplicate votes; allows vote direction changes
4. **Temporal Windows:** 30-day deduplication on `(providerNpi, planId, sourceIp)` and `(providerNpi, planId, submittedBy)` prevents re-submission

---

## Caching Architecture

**Dual-mode caching:**
- **Redis mode:** Distributed across instances when `REDIS_URL` configured. Uses sorted sets for rate limiting, key-value for search cache.
- **In-memory mode:** Process-local fallback. Sliding window arrays for rate limiting, Map for search cache. Safe only for single-instance.
- **Fail-open:** If Redis becomes unavailable mid-operation, requests are allowed with degraded header.

**Search cache:** 5-minute TTL, invalidated on new verification submission.

---

## Security Architecture

- **Helmet:** Strict CSP (default-src 'none' for JSON API), HSTS, no-referrer, frame-ancestors 'none'
- **CORS:** Explicit origin allowlist, blocked origins logged
- **Body parsing:** 100KB limit prevents large payload attacks
- **Admin auth:** Timing-safe comparison of `X-Admin-Secret` header via `crypto.timingSafeEqual`
- **Error sanitization:** Production mode hides internal error messages, returns generic "Internal server error"
- **PII stripping:** `stripVerificationPII()` removes sourceIp, userAgent, submittedBy from API responses
- **Trust proxy:** Set to 1 for Cloud Run's load balancer (correct client IP for rate limiting)

---

## Key Architectural Decisions

1. **npm workspaces monorepo** -- Single repo for backend, frontend, shared types. Avoids version drift and enables atomic changes.
2. **practice_locations as separate table** -- Replaces earlier embedded address fields. Enables multi-location providers, location-specific verifications, and co-located provider queries.
3. **Direct PostgreSQL for imports, Prisma for API** -- Raw SQL via `pg` for bulk import performance (5000 record batches); Prisma ORM for type-safe API queries with relation loading.
4. **Scale-to-zero Cloud Run** -- Min instances = 0 eliminates idle costs during pre-revenue phase. Cold start acceptable for current traffic levels.
5. **No HIPAA** -- All data is public (NPI registry, plan directories, anonymous crowdsource). Enables faster development and simpler infrastructure.
6. **Taxonomy mapping at import time** -- Specialty categories computed during NPI import (not at query time) for query performance. Stored as denormalized `specialty_category` field on providers.
