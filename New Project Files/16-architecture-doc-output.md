# VerifyMyProvider Architecture

**Last Updated:** 2026-04-16
**Audience:** Engineers onboarding to the project.

---

## Executive Summary

VerifyMyProvider is a crowdsourced directory of US healthcare providers with insurance acceptance data. It ingests the CMS NPPES bulk NPI registry (≈8 GB raw, millions of rows) as the authoritative identity layer, then lets users confirm or dispute which insurance plans a provider actually accepts. Every claim carries a 0–100 confidence score that decays over time and is reinforced by peer votes — the goal is "Wikipedia for provider networks," but with Sybil-resistance baked in.

The immediate launch target (Q2 2026) is **NYC, five boroughs**, roughly 50–75k providers filtered from the full NY state NPPES feed. Six other states (FL, AL, AK, AR, AZ, CA) exist in the database as pipeline test data and are not part of the launch surface.

The architecture is deliberately boring: a single Express API, a single Next.js App Router frontend, a single Postgres database, and two Cloud Run services. Everything that can fail open does. Rate limiting and caching both auto-detect Redis and fall back to in-memory. Redis, reCAPTCHA, Claude, Resend, and PostHog are all optional at runtime — the app degrades rather than crashes.

---

## Stack at a Glance

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14.2 (App Router), React 18, TailwindCSS, TanStack Query 5 | App Router gives us RSC + streaming; standalone output trims the container; Query handles cache/invalidation we'd otherwise hand-roll |
| Maps | `@react-google-maps/api` | Google Places + geocoding we were already paying for |
| Backend | Node 20, Express 4, Prisma 5.22 | Express is the smallest surface area that still has mature middleware; Prisma gives us a strongly typed DB layer without an ORM learning tax |
| Database | PostgreSQL 15 (Cloud SQL) | Full-text search + JSONB + materialized views cover every query shape we need |
| Caching / Rate limiting | Redis (optional) with in-memory fallback | Single-instance deploys stay cheap; Redis kicks in for horizontal scale |
| Infra | Cloud Run, Artifact Registry, Secret Manager | Scale-to-zero pricing, no VM babysitting |
| CI/CD | GitHub Actions + Workload Identity Federation | Keyless auth to GCP |
| Analytics | PostHog | Privacy-preserving, self-hostable, no PHI collected |
| AI | Anthropic Claude (Sonnet) | Used only for client-uploaded insurance card OCR |
| Email | Resend | Magic-link auth |
| Auth | JWT (jose) + HttpOnly cookies, magic-link only | No passwords = no password storage problem |

---

## Repository Layout

```
HealthcareProviderDB/
├── packages/
│   ├── backend/        Express API, Prisma schema, services, middleware
│   │   ├── src/
│   │   │   ├── index.ts            Server bootstrap + middleware chain
│   │   │   ├── routes/             Route files grouped by resource
│   │   │   ├── services/           Business logic (pure, testable)
│   │   │   ├── middleware/         auth, CSRF, rate limit, captcha, errors
│   │   │   ├── lib/                Prisma, Redis, encryption helpers
│   │   │   ├── schemas/            Zod validators
│   │   │   └── utils/              logger, cache, response helpers
│   │   └── prisma/schema.prisma
│   ├── frontend/       Next.js 14 App Router
│   │   ├── src/app/                Pages & route handlers
│   │   ├── src/components/         UI components
│   │   └── src/lib/                api.ts, analytics.ts, utils
│   └── shared/         TypeScript types shared across packages
├── scripts/            NPI import, data cleanup, admin one-offs
├── prisma/             (symlinked to packages/backend/prisma)
├── .github/workflows/  CI/CD (deploy, rollback, staging, test, security, codeql)
├── docker-compose.yml          Full-stack (db + backend + frontend)
├── docker-compose.dev.yml      Database only; services run natively via `npm run dev`
└── prompts/            Claude prompt library this document was generated from
```

npm workspaces at root (`"workspaces": ["packages/*"]`). Only shared dependencies live at the root (`prisma`, `@prisma/client`, `pg`, `csv-parse`). Next.js and React are scoped to the frontend workspace — putting `next` at the root has bitten us before.

---

## Request Lifecycle

Tracing a typical search request end-to-end:

```
User types "cardiology in Manhattan"
   ↓
Next.js page  packages/frontend/src/app/search/page.tsx
   ↓         React Query useQuery
API client   packages/frontend/src/lib/api.ts
   ↓         fetch('https://api.../api/v1/providers/search?...')
   ↓         credentials:'include' → HttpOnly auth cookie goes along
Cloud Run (frontend) serves nothing; browser hits backend directly.
   ↓
Express backend  packages/backend/src/index.ts
 ├─ requestIdMiddleware      attaches req.id from header or cuid
 ├─ httpLogger (pino-http)   structured log line per request
 ├─ helmet                   strict CSP (JSON API: deny all)
 ├─ cors                     whitelisted origins only
 ├─ express.json (100 kb)    insurance-card/scan is exempted
 ├─ cookieParser             parses vmp_access_token
 ├─ extractUser              verifies JWT → sets req.user or leaves undefined
 ├─ /health                  short-circuits BEFORE rate limiter
 ├─ defaultRateLimiter       200 req/h per IP (sliding window)
 ├─ requestLogger            PII-free usage line
 ├─ generalTimeout (30 s)
 ↓
Router /api/v1/providers/search  packages/backend/src/routes/providers.ts
 ├─ searchTimeout             15 s
 ├─ searchRateLimiter         100 req/h per IP
 ├─ Zod parse                 rejects malformed params with 400
 ├─ cacheGet(searchKey)       Redis or in-memory; returns on hit
 ↓ miss
Service layer  providerService.searchProviders()
 ↓
Prisma  packages/backend/src/lib/prisma.ts
 ↓ (.findMany with include: PROVIDER_INCLUDE)
Postgres (Cloud SQL)          indexed on last_name / specialty_category / state
 ↓
transformProvider(...)        reshapes DB row to API contract
 ↓
cacheSet(key, 300 s TTL)
 ↓
res.json({ success: true, data: {...} })
   ↓ errorHandler catches AppError / Zod / Prisma errors uniformly
   ↓ notFoundHandler if no route matched
   ↓
Browser → React Query caches response keyed by URL.
```

---

## Data Model

There are ~20 models in `packages/backend/prisma/schema.prisma`. The core cluster:

```
Provider (PK: npi)
  ├── PracticeLocation       many locations per provider, one is primary
  ├── ProviderTaxonomy        NUCC taxonomy slots
  ├── ProviderCmsDetails      CMS-sourced extras (medical school, etc.)
  ├── ProviderInsurance       network membership (from enrichment)
  ├── ProviderMedicare        Medicare provider IDs
  ├── ProviderHospital        hospital affiliations
  └── ProviderPlanAcceptance  ← the business data ←── VerificationLog → VoteLog
                                    │
                                    └── InsurancePlan (PK: plan_id)
```

Supporting models: `Hospital`, `TaxonomyReference`, `SyncLog`, `DataQualityAudit`, `ImportConflict`, `User`, `Session`, `MagicLinkToken`, `SavedProvider`, `UserInsuranceCard`.

Conventions:
- **camelCase in TypeScript, snake_case in Postgres.** Every field has a `@map()` and every model has `@@map()`. `prisma db pull` produces raw lowercase; we rename manually.
- **TEXT primary keys with `@default(cuid())`** on verification_logs and vote_logs (application-generated, not DB-generated).
- **Enrichment-protected columns** (`provider_profile_url`, `confidence_score`, `verification_count`, `latitude/longitude`, `data_source`) are explicitly excluded from re-import writes. See MEMORY.md → Enrichment Protection (Phase 6).

Full reference → prompt `01-database-schema.md`.

---

## External Dependencies & Failure Modes

| Dependency | Used For | If it fails |
|------------|----------|-------------|
| Cloud SQL PostgreSQL | Everything | 503 with `DATABASE_UNAVAILABLE`, health check fails |
| Redis | Rate limiting + caching (optional) | Fail-open: requests allowed, `X-RateLimit-Status: degraded` header |
| Google reCAPTCHA v3 | `/verify` + `/verify/*/vote` | `CAPTCHA_FAIL_MODE=open` (default): fall back to rate limit + honeypot; `closed`: reject |
| Anthropic Claude | Insurance card OCR (frontend route) | Error surfaces to UI, user can retype manually |
| Resend | Magic-link emails | Login broken; API returns 500; no auth session created |
| PostHog | Analytics | Frontend no-ops |
| NPI Registry (CMS NPPES) | Offline bulk import | Import scripts fail; runtime unaffected |
| Google Maps | Map view, geocoding | Map page degrades; search unaffected |

No external dependency sits in the hot path of the default `/providers/search` request except Cloud SQL and (optionally) Redis.

---

## Deployment Topology

```
                        verifymyprovider.com (DNS)
                                  │
                                  ▼
                  ┌─────────────────────────────┐
                  │   Cloud Run (frontend)      │   min=0 max=10 concurrency=80
                  │   Next.js standalone build  │   512Mi, 1 vCPU
                  └──────────┬──────────────────┘
                             │ HTTPS (CORS allowlisted)
                             ▼
                  ┌─────────────────────────────┐
                  │   Cloud Run (backend)       │   min=0 max=10 concurrency=80
                  │   Express + Prisma          │   512Mi, 1 vCPU
                  └──────────┬──────────────────┘
                             │ unix socket via Cloud SQL Connector
                             ▼
                  ┌─────────────────────────────┐
                  │  Cloud SQL Postgres 15      │
                  └─────────────────────────────┘

   Artifact Registry (us-central1-docker.pkg.dev) — image store
   Secret Manager                                  — DATABASE_URL, JWT_SECRET, ...
   Workload Identity Federation                    — GH Actions → GCP (keyless)
```

Deploy details → `15-deployment-guide-output.md` and prompt `40-docker-cicd.md`.

---

## Cross-Cutting Concerns

| Concern | Implementation | Prompt |
|---------|---------------|--------|
| Authentication | Magic-link (no passwords) → JWT access (15 m) + refresh (30 d) in HttpOnly cookies. `jose` for signing. | `03-authentication`, `45-user-accounts` |
| CSRF | `csrf-csrf` double-submit pattern on mutating non-auth routes (`/saved-providers`, `/me/insurance-card`). GET/HEAD/OPTIONS ignored. | `04-csrf` |
| Rate limiting | Sliding window over Redis sorted sets, in-memory fallback. 5 pre-configured limiters (default 200/h, search 100/h, verify 10/h, vote 10/h, magic-link 5/15m). Fail-open on Redis failure. | `08-rate-limiting`, `31-redis-caching` |
| CAPTCHA | Google reCAPTCHA v3, server-verified on `/verify` and `/verify/*/vote`. `CAPTCHA_FAIL_MODE` switch for degraded mode. | `27-captcha-integration` |
| Honeypot | Hidden `website` form field; non-empty = silent reject. Layered with reCAPTCHA. | part of `36-sybil-attack-prevention` |
| Input validation | Zod on every route; 400 `VALIDATION_ERROR` with field-level details. | `07-input-validation` |
| Error handling | Central `errorHandler` maps AppError / Zod / Prisma / 413 / etc. to uniform `{success,error:{code,message,statusCode,requestId}}` envelope. | `37-error-handling` |
| Caching | `utils/cache.ts` — Redis or in-memory Map; 5 min TTL on search, invalidated on verify submission. | `31-redis-caching` |
| Confidence scoring | 4 factors: source 25%, recency 30%, agreement 25%, volume 20%. Decay runs via Cloud Scheduler → `/admin/recalculate-confidence`. | `12-confidence-scoring` |
| Sybil prevention | Rate limit → CAPTCHA → honeypot → vote dedup → 30-day window → IP hashing. | `36-sybil-attack-prevention` |
| Logging | `pino` structured JSON; request ID correlation; `requestLogger.ts` scrubs PII. | `47-observability-logging` |
| Analytics | PostHog with `person_profiles: 'identified_only'` and no PII event props. | `34-analytics-posthog` |
| Insurance card encryption | AES-256-GCM with current + previous key for rotation. PII never leaves the backend unencrypted. | `29-insurance-card-upload` |

---

## Scaling Bottlenecks

Known limits by layer, ranked by what would bite first at 10×/100× traffic:

| # | Bottleneck | At what scale | Mitigation path |
|---|-----------|---------------|------------------|
| 1 | **In-memory rate limiter** when horizontally scaled without `REDIS_URL` set | Any time we bump `max-instances > 1` and want accurate limiting | Provision Memorystore Redis; set `REDIS_URL` (code already supports it) |
| 2 | **Cloud SQL db-f1-micro / tiny tier** connection pool | ~50 concurrent requests during cache-miss storms | Tier up; add PgBouncer; keep `PROVIDER_INCLUDE` lean |
| 3 | **`providers/search` JSON payload size** (full include tree per row) | When a user paginates through hundreds of results with all plans joined | Split into `search` (lightweight) + `detail` (full); already partially done |
| 4 | **Prisma eager-loaded `practiceLocations`** for map view | > 500 pins | Dedicated `mapService` exists; uses `lat/lng` index; keep limit ≤ 500 |
| 5 | **Claude OCR** (insurance card) | Rate limits from Anthropic | Queue + retry; currently synchronous |
| 6 | **reCAPTCHA v3 quota** | 1M/mo free, we're nowhere near | Upgrade or swap provider |
| 7 | **Single-region deploy** | International users with latency budgets | Multi-region Cloud Run + CDN |

Horizontal concerns:
- Cloud Run already scales to 10 instances; `concurrency=80` means we can service ~800 in-flight requests before backpressure.
- Memory ceiling is 512 MiB per instance. Prisma + Node baseline is ~120 MiB; leaves ~400 MiB for request working set. No current leak indicators.
- `setInterval` cleanup in in-memory rate limiter runs every 60 s and is O(clients) — fine below 100k distinct IPs per hour.

---

## Change Log

See `19-changelog-doc-output.md` for dated changes; this architecture doc tracks the *shape* of the system, not its history.

---

## Related Prompts

- `01-database-schema` — full Prisma models and indexes
- `06-api-routes` — exhaustive endpoint catalog
- `09-external-apis` — reCAPTCHA, Resend, Claude, PostHog integration details
- `11-environment-secrets` — every env variable and its fallback
- `13-npi-data-pipeline` — import scripts and enrichment flow
- `35-monorepo-structure` — workspace hoisting rules and build order
- `40-docker-cicd` — Docker image layout and GH Actions deep dive
- `43-search-architecture` — how `/providers/search` is built internally
