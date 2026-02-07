# External API Security Review

> **Generated:** 2026-02-07
> **Project:** VerifyMyProvider (HealthcareProviderDB)
> **Scope:** All external API integrations, including third-party services, data pipelines, and infrastructure connections

---

## Table of Contents

1. [API Inventory Summary](#api-inventory-summary)
2. [Google reCAPTCHA v3 API](#1-google-recaptcha-v3-api)
3. [Anthropic Claude API (Insurance Card Extraction)](#2-anthropic-claude-api-insurance-card-extraction)
4. [PostHog Analytics API](#3-posthog-analytics-api)
5. [NPI Registry API (CMS NPPES)](#4-npi-registry-api-cms-nppes)
6. [Redis (Distributed Rate Limiting & Caching)](#5-redis-distributed-rate-limiting--caching)
7. [Google Cloud SQL (PostgreSQL)](#6-google-cloud-sql-postgresql)
8. [Cross-Cutting Security Concerns](#cross-cutting-security-concerns)
9. [API Key Management](#api-key-management)
10. [Response Validation Summary](#response-validation-summary)
11. [Open Questions & Recommendations](#open-questions--recommendations)

---

## API Inventory Summary

| # | External Service | Direction | Auth Mechanism | Usage Context | Failure Mode |
|---|-----------------|-----------|---------------|---------------|-------------|
| 1 | Google reCAPTCHA v3 | Backend -> Google | Secret key (env) | Bot protection on verification/vote endpoints | Fail-open with fallback rate limiting (configurable) |
| 2 | Anthropic Claude API | Frontend API route -> Anthropic | API key (Secret Manager) | Insurance card OCR extraction | Graceful degradation; returns 503 |
| 3 | PostHog Analytics | Frontend (client-side) -> PostHog | Public API key (build-time) | Product analytics and event tracking | Silent failure; opt-out by default |
| 4 | CMS NPPES (NPI Registry) | Import scripts -> CMS | None (public API) | Bulk provider data import (offline) | Script fails; no production impact |
| 5 | Redis (Memorystore) | Backend -> Redis | Connection string (env) | Distributed rate limiting and caching | Fail-open to in-memory fallback |
| 6 | Google Cloud SQL | Backend -> PostgreSQL | Connection string (Secret Manager) | Primary data store | App returns 503 on health check |

---

## 1. Google reCAPTCHA v3 API

**Purpose:** Bot detection on verification and vote submission endpoints.
**Direction:** Backend -> Google
**File:** `packages/backend/src/middleware/captcha.ts`

### Connection Details

| Detail | Value |
|--------|-------|
| Endpoint | `https://www.google.com/recaptcha/api/siteverify` |
| Method | POST (URLSearchParams body) |
| Auth | `RECAPTCHA_SECRET_KEY` env var |
| Timeout | 5 seconds (`CAPTCHA_API_TIMEOUT_MS` from `packages/backend/src/config/constants.ts`) |
| Score threshold | 0.5 (`CAPTCHA_MIN_SCORE`) |
| HTTP client | Native `fetch()` with `AbortController` |

### How It Works

The middleware (`verifyCaptcha`) is applied to verification and vote submission routes. It extracts the CAPTCHA token from either `req.body.captchaToken` or the `x-captcha-token` header, then sends it to Google for server-side verification along with the client IP.

```typescript
// From packages/backend/src/middleware/captcha.ts (lines 141-157)
const params = new URLSearchParams({
  secret: RECAPTCHA_SECRET,
  response: captchaToken as string,
  remoteip: clientIp,
});

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), CAPTCHA_API_TIMEOUT_MS);

const response = await fetch(RECAPTCHA_VERIFY_URL, {
  method: 'POST',
  body: params,
  signal: controller.signal,
});
```

Google returns a JSON response with a `success` boolean and a `score` (0.0 to 1.0). The middleware rejects requests with `success: false` or scores below the configured threshold (0.5).

### Security Checklist

- [x] API key stored in environment variable (not hardcoded)
- [x] Response validated (checks both `success` boolean and `score` number)
- [x] Timeout prevents hanging on slow responses (5 seconds via `AbortController`)
- [x] Fail-open mode with fallback rate limiting (3 requests/hour vs normal 10/hour)
- [x] Fail-closed mode available for high-security (`CAPTCHA_FAIL_MODE=closed`)
- [x] Skipped in development/test environments
- [x] Client IP sent to Google for risk assessment
- [x] No SSRF risk -- URL is a hardcoded constant, not user-influenced
- [ ] API key rotation procedure not documented
- [ ] No metric tracking for CAPTCHA pass/fail rates (only log-based)

### Failure Behavior

The middleware implements a configurable fail-open/fail-closed pattern controlled by `CAPTCHA_FAIL_MODE`:

**FAIL-OPEN (default, `CAPTCHA_FAIL_MODE=open`):**
- Requests are allowed through when Google API fails
- Response includes `X-Security-Degraded: captcha-unavailable` header
- Fallback rate limiting at 3 requests/hour per IP (from `CAPTCHA_FALLBACK_MAX_REQUESTS` in `packages/backend/src/config/constants.ts`)
- Fallback window: 1 hour (`CAPTCHA_FALLBACK_WINDOW_MS`)
- In-memory `Map` used for fallback tracking with periodic cleanup

**FAIL-CLOSED (`CAPTCHA_FAIL_MODE=closed`):**
- All requests blocked with 503 Service Unavailable
- Returns: "Security verification temporarily unavailable. Please try again in a few minutes."

```typescript
// From packages/backend/src/middleware/captcha.ts (lines 199-208)
if (CAPTCHA_FAIL_MODE === 'closed') {
  logger.warn({ ip: clientIp, endpoint: req.path },
    'CAPTCHA FAIL-CLOSED: Blocking request due to API unavailability');
  return next(AppError.serviceUnavailable(
    'Security verification temporarily unavailable. Please try again in a few minutes.'
  ));
}
```

### Environment Configuration

From `packages/backend/.env.example`:
```
RECAPTCHA_SECRET_KEY=your-recaptcha-secret-key
CAPTCHA_FAIL_MODE=open
```

---

## 2. Anthropic Claude API (Insurance Card Extraction)

**Purpose:** AI-powered OCR to extract insurance plan details from uploaded card images.
**Direction:** Frontend Next.js API route -> Anthropic
**File:** `packages/frontend/src/app/api/insurance-card/extract/route.ts`

### Connection Details

| Detail | Value |
|--------|-------|
| Endpoint | Anthropic API (via `@anthropic-ai/sdk`) |
| Model | `claude-haiku-4-5-20251001` (Claude Haiku 4.5) |
| Auth | `ANTHROPIC_API_KEY` env var (Cloud Run Secret Manager) |
| Max tokens | 1,500 per extraction |
| HTTP client | `@anthropic-ai/sdk` package |
| Feature toggle | Returns 500 gracefully if API key not set |

### How It Works

The extraction flow consists of multiple stages:

1. **Rate limiting** -- 10 extractions per hour per IP via in-memory rate limiter (`packages/frontend/src/lib/rateLimit.ts`)
2. **Input validation** -- Type check (string), size check (max 10MB / `MAX_IMAGE_SIZE_BYTES`), base64 format validation, minimum length check
3. **Image preprocessing** -- Uses `sharp` library (`packages/frontend/src/lib/imagePreprocess.ts`) to resize (max 1024px), compress (JPEG quality 80), auto-rotate via EXIF, and optionally enhance contrast for low-quality images
4. **Primary extraction** -- Sends preprocessed image + structured prompt to Claude
5. **Retry logic** -- If confidence score < 0.3 (`RETRY_CONFIDENCE_THRESHOLD`) or parse failure, retries with an alternative, simpler prompt
6. **Response validation** -- Parses Claude's JSON response through a Zod schema (`InsuranceCardDataSchema` in `packages/frontend/src/lib/insuranceCardSchema.ts`)

```typescript
// From packages/frontend/src/app/api/insurance-card/extract/route.ts (lines 183-205)
const response = await anthropic.messages.create({
  model: CLAUDE_MODEL_ID,
  max_tokens: 1500,
  messages: [{
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64Data },
      },
      { type: 'text', text: prompt },
    ],
  }],
});
```

### Data Flow

```
User uploads image
  -> Frontend component sends base64 to /api/insurance-card/extract
    -> Rate limit check (10/hour per IP)
    -> Input validation (type, size, format)
    -> Image preprocessing (sharp: resize, compress, rotate)
    -> Quality analysis (shouldEnhanceImage: checks contrast, dimensions)
    -> Claude API call (primary prompt)
    -> If low confidence: retry with alternative prompt
    -> Zod schema validation (InsuranceCardDataSchema)
    -> Return structured data + confidence metadata
  -> Image is NOT persisted
```

### Extraction Schema

The Zod schema (`packages/frontend/src/lib/insuranceCardSchema.ts`) validates 22 data fields across these categories:

- **Plan information:** insurance_company, plan_name, plan_type, provider_network
- **Subscriber information:** subscriber_name, subscriber_id, group_number, effective_date
- **Pharmacy information:** rxbin, rxpcn, rxgrp
- **Copay information:** copay_pcp, copay_specialist, copay_urgent, copay_er
- **Financial information:** deductible_individual, deductible_family, oop_max_individual, oop_max_family
- **Contact information:** customer_care_phone, website, network_notes
- **AI metadata:** extraction_confidence, extraction_notes, card_side, image_quality_issues

All data fields are optional and nullable to handle partial extractions. A confidence scoring system (`calculateConfidenceScore`) weighs critical fields (insurance_company, plan_name, provider_network) at 3 points, important fields at 2 points, and other fields at 1 point (capped at 5).

### Security Checklist

- [x] API key stored in Cloud Run Secret Manager (not in code)
- [x] Images processed server-side only (Next.js API route)
- [x] Images not stored permanently -- processed in-memory and discarded
- [x] File size validated (max 10MB)
- [x] File type validated via magic bytes detection (`detectMediaType` function)
- [x] Base64 format validated with regex
- [x] Rate limited (10 extractions/hour per IP)
- [x] Feature disabled gracefully if `ANTHROPIC_API_KEY` not configured
- [x] Response parsed through Zod schema (prevents malformed data)
- [x] Specific error handling for `Anthropic.APIError` class
- [x] User-friendly error messages that do not leak internal details
- [ ] No prompt injection risk from card images (Claude processes image-only input with fixed prompt)
- [ ] Cost monitoring not implemented (each extraction is an API call)
- [ ] No request-level timeout beyond SDK defaults

### Image Preprocessing Pipeline

From `packages/frontend/src/lib/imagePreprocess.ts`:

| Step | Default Config | Enhanced Config |
|------|---------------|-----------------|
| Max dimension | 1024px | 1536px |
| JPEG quality | 80 | 90 |
| Auto-rotate | Yes | Yes |
| Contrast enhance | No | Yes (normalize + linear) |
| Grayscale | No | No |

Enhancement is triggered automatically when the image has:
- Low standard deviation across channels (< 40, indicating low contrast)
- Very small dimensions (< 400x300 pixels)

### Environment Configuration

From `packages/frontend/.env.example`:
```
ANTHROPIC_API_KEY=
```

---

## 3. PostHog Analytics API

**Purpose:** Product analytics and event tracking for usage patterns.
**Direction:** Frontend (client-side) -> PostHog
**Files:** `packages/frontend/src/components/PostHogProvider.tsx`, `packages/frontend/src/lib/analytics.ts`

### Connection Details

| Detail | Value |
|--------|-------|
| Endpoint | `https://us.i.posthog.com` (default) or custom via `NEXT_PUBLIC_POSTHOG_HOST` |
| Auth | `NEXT_PUBLIC_POSTHOG_KEY` env var (public API key) |
| HTTP client | `posthog-js` SDK (client-side) |
| Init location | PostHog React provider component |

### Initialization Configuration

```typescript
// From packages/frontend/src/components/PostHogProvider.tsx (lines 9-22)
if (typeof window !== 'undefined') {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: false,        // Manual pageview capture
      capture_pageleave: true,
      persistence: 'localStorage',
      autocapture: false,             // Explicit events only
      disable_session_recording: true, // No session recording
      opt_out_capturing_by_default: true, // Opt-out by default
    });
  }
}
```

Notable: `opt_out_capturing_by_default: true` means analytics are disabled until the user explicitly opts in. This is a privacy-first configuration.

### Privacy-Preserving Event Tracking

The analytics module (`packages/frontend/src/lib/analytics.ts`) implements explicit privacy boundaries for every tracked event. Each function accepts full context but only sends anonymized, boolean-level indicators:

| Event Name | Sent Properties | Explicitly NOT Sent |
|-----------|----------------|-------------------|
| `search` | has_specialty_filter, has_state_filter, has_city_filter, has_health_system_filter, results_count, has_results, mode | specialty, state, city, cities, healthSystem |
| `provider_view` | has_specialty | npi, specialty, provider_name |
| `verification_submit` | *(empty -- only event occurrence)* | npi, plan_id, accepts_insurance |
| `verification_vote` | vote_type | verification_id, npi |
| `$pageview` | sanitized URL (npi, planId, name params stripped) | Raw URL with identifiers |
| `$exception` | exception_message, exception_type, source, digest | Stack traces, user context |

```typescript
// From packages/frontend/src/lib/analytics.ts (lines 50-63)
export function trackSearch(props: SearchEventProps) {
  if (typeof window === 'undefined') return;
  posthog.capture('search', {
    has_specialty_filter: !!props.specialty,
    has_state_filter: !!props.state,
    has_city_filter: !!(props.city || props.cities),
    has_health_system_filter: !!props.healthSystem,
    results_count: props.resultsCount,
    has_results: props.resultsCount > 0,
    mode: props.mode,
    // NOT sending: specialty, state, city, cities, healthSystem
  });
}
```

Pageview tracking also sanitizes URLs to remove sensitive query parameters:

```typescript
// From packages/frontend/src/components/PostHogProvider.tsx (lines 35-39)
const sanitizedParams = new URLSearchParams(searchParams.toString());
['npi', 'planId', 'name'].forEach(key => sanitizedParams.delete(key));
const query = sanitizedParams.toString();
const url = window.origin + pathname + (query ? `?${query}` : '');
posthog.capture('$pageview', { $current_url: url });
```

### Error Tracking

The app error boundary (`packages/frontend/src/app/error.tsx`) sends unhandled errors to PostHog as `$exception` events with only error metadata (message, type, source, digest) -- no PII or stack traces in production.

### Security Checklist

- [x] Public API key (safe to expose -- PostHog design)
- [x] Autocapture disabled (explicit events only)
- [x] No PII tracked (no names, emails, NPI numbers, health data)
- [x] No session recording enabled
- [x] Only initialized in browser environment
- [x] Opt-out by default (`opt_out_capturing_by_default: true`)
- [x] Sensitive URL parameters stripped before pageview tracking
- [ ] Cookie consent banner not implemented (mitigated by opt-out default)
- [ ] No user opt-in UI currently exists

### Environment Configuration

From `packages/frontend/.env.example`:
```
NEXT_PUBLIC_POSTHOG_KEY=
```

Frontend Dockerfile passes this as a build-time argument:
```dockerfile
ARG NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY}
```

---

## 4. NPI Registry API (CMS NPPES)

**Purpose:** Provider data lookup and enrichment via bulk CSV import.
**Direction:** Offline import scripts -> CMS NPPES data files
**Files:** `scripts/import-npi.ts`, `scripts/import-npi-direct.ts`

### Connection Details

| Detail | Value |
|--------|-------|
| Data source | CMS NPPES Data Dissemination (`https://download.cms.gov/nppes/NPI_Files.html`) |
| Live API endpoint | `https://npiregistry.cms.hhs.gov/api/?version=2.1` (not currently used) |
| Auth | None required (public data) |
| Usage | Batch import scripts only -- NOT used for live API requests |

### Import Scripts

The project provides two import scripts:

**1. Prisma-based import (`scripts/import-npi.ts`):**
- Uses `PrismaClient` for database operations
- Supports state filtering (`--states FL,CA`)
- Supports specialty filtering (defaults to osteoporosis-relevant specialties)
- Batch size: 1,000 records per transaction
- Includes file download capability with redirect handling
- Maps taxonomy codes to specialty categories (Endocrinology, Rheumatology, Orthopedics, Internal Medicine, Family Medicine, Geriatrics)

**2. Direct PostgreSQL import (`scripts/import-npi-direct.ts`):**
- Uses `pg` Pool for direct SQL operations (bypasses Prisma, designed for Windows ARM64 compatibility)
- Imports ALL providers (no specialty filter)
- Batch size: 5,000 records per transaction
- Uses `ON CONFLICT (npi) DO UPDATE` for upsert semantics
- Retry logic for connection errors (up to 3 retries with 2-second delay)
- Creates sync log entries for import tracking

```typescript
// From scripts/import-npi-direct.ts (lines 99-106)
const pool = new Pool({
  connectionString: databaseUrl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});
```

### Data Pipeline

```
CMS NPPES website
  -> Manual bulk CSV download (~8GB compressed)
  -> Extract to local filesystem
  -> Run import script (import-npi-direct.ts)
    -> Parse CSV with csv-parse (streaming)
    -> Skip deactivated providers (not reactivated)
    -> Map taxonomy codes to specialty categories
    -> Batch upsert to PostgreSQL (5,000 per batch)
    -> Log import statistics to sync_logs table
```

### Security Checklist

- [x] Public API -- no key management needed
- [x] Bulk data downloaded manually, not queried in real-time (no latency dependency)
- [x] Import scripts require explicit file path and database URL arguments
- [x] Import statistics tracked in sync_logs table with file hash verification
- [x] Deactivated providers filtered out during import
- [ ] No SSRF risk -- URLs are constants, not user-influenced
- [ ] Download URL in `import-npi.ts` is hardcoded (line 488): `https://download.cms.gov/nppes/NPPES_Data_Dissemination_December_2024.zip`

---

## 5. Redis (Distributed Rate Limiting & Caching)

**Purpose:** Distributed rate limiting across multiple Cloud Run instances and search result caching.
**Direction:** Backend -> Redis instance (Google Cloud Memorystore)
**Files:** `packages/backend/src/lib/redis.ts`, `packages/backend/src/utils/cache.ts`, `packages/backend/src/middleware/rateLimiter.ts`

### Connection Details

| Detail | Value |
|--------|-------|
| Client library | `ioredis` |
| Connection | `REDIS_URL` env var |
| TLS | Not configured (planned for production Memorystore) |
| Max retries per request | 3 |
| Connect timeout | 10,000ms |
| Command timeout | 5,000ms |
| Max reconnection attempts | 5 (with exponential backoff, max 3s delay) |
| Fallback | In-memory mode when Redis unavailable |

### Redis Client Singleton

```typescript
// From packages/backend/src/lib/redis.ts (lines 49-69)
redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryStrategy: (times) => {
    if (times > 5) {
      logger.error({ attempts: times }, 'Redis max reconnection attempts reached, giving up');
      return null;
    }
    const delay = Math.min(times * 200, 3000);
    return delay;
  },
  enableReadyCheck: true,
  lazyConnect: false,
});
```

### Dual-Mode Architecture

The system operates in two modes, selected automatically based on `REDIS_URL` availability:

**1. Redis Mode (distributed):**
- Rate limiting uses sorted sets for sliding window algorithm
- Cache uses `SETEX` with configurable TTL
- Shared state across all Cloud Run instances

**2. In-Memory Mode (fallback):**
- Rate limiting uses `Map<string, number[]>` with sliding window
- Cache uses `Map<string, CacheEntry>` with TTL-based expiration
- Process-local state -- only safe for single-instance deployments

### Rate Limiting Implementation

From `packages/backend/src/middleware/rateLimiter.ts`, the project defines four pre-configured rate limiters:

| Limiter | Limit | Window | Applied To |
|---------|-------|--------|-----------|
| `defaultRateLimiter` | 200 req | 1 hour | All API routes |
| `verificationRateLimiter` | 10 req | 1 hour | Verification submissions |
| `voteRateLimiter` | 10 req | 1 hour | Vote submissions |
| `searchRateLimiter` | 100 req | 1 hour | Search endpoints |

Redis-based rate limiting uses a sorted set per client key with `MULTI/EXEC` transactions:

```typescript
// From packages/backend/src/middleware/rateLimiter.ts (lines 222-237)
const multi = redis.multi();
multi.zremrangebyscore(redisKey, 0, windowStart);  // Remove expired
multi.zadd(redisKey, now, requestId);               // Add current
multi.zcard(redisKey);                              // Count in window
multi.expire(redisKey, Math.ceil(windowMs / 1000) + 1);
const results = await multi.exec();
```

### Cache Implementation

From `packages/backend/src/utils/cache.ts`:

| Feature | Value |
|---------|-------|
| Default TTL | 300 seconds (5 minutes) |
| Key prefix | `cache:` for general, `search:` for search results |
| Cleanup interval | 60 seconds (periodic expired entry removal) |
| Statistics | hits, misses, sets, deletes, size tracked |
| Pattern deletion | Uses Redis SCAN (not KEYS) for production safety |

Search cache keys are generated with normalization for deterministic caching:
```
search:<state>:<city>:<specialty>:<page>:<limit>:<hash-of-additional-params>
```

Search cache is invalidated when new verifications are submitted (`invalidateSearchCache()`).

### Fail-Open Behavior

Redis failures at every level fall open to maintain availability:

1. **Connection failure** -- `getRedisClient()` returns `null`, system uses in-memory mode
2. **Mid-request failure** -- Rate limiter logs warning, allows request with `X-RateLimit-Status: degraded` header
3. **Cache failure** -- `cacheGet`/`cacheSet` catch Redis errors, fall back to in-memory cache
4. **Transaction failure** -- Rate limiter allows request through

### Security Checklist

- [x] Connection string stored in environment variable
- [x] Graceful fallback to in-memory when Redis unavailable
- [x] Fail-open behavior (requests not blocked when Redis down)
- [x] Singleton pattern prevents connection leaks
- [x] Graceful shutdown support (`closeRedisConnection()`)
- [x] Connection state tracking with event handlers
- [ ] TLS not configured (needed for production Memorystore)
- [ ] No authentication configured (relies on VPC network security)
- [ ] Connection pooling limits not explicitly set (ioredis defaults)

### Environment Configuration

From `packages/backend/.env.example`:
```
# REDIS_URL=redis://localhost:6379
```

---

## 6. Google Cloud SQL (PostgreSQL)

**Purpose:** Primary persistent data store for all application data.
**Direction:** Backend -> Google Cloud SQL PostgreSQL
**Files:** `packages/backend/src/lib/prisma.ts`, `packages/backend/Dockerfile`

### Connection Details

| Detail | Value |
|--------|-------|
| Database | `verifymyprovider` on Google Cloud SQL PostgreSQL |
| ORM | Prisma Client |
| Connection | `DATABASE_URL` env var (via Cloud Run Secret Manager) |
| Connection pooling | Prisma default (relies on Cloud SQL Proxy or direct connection) |
| Health check | `SELECT 1` query on `/health` endpoint |

### Client Configuration

```typescript
// From packages/backend/src/lib/prisma.ts (lines 9-17)
export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
```

In development, Prisma logs queries, errors, and warnings. In production, only errors are logged. The singleton pattern with `global.prisma` prevents multiple client instances during hot module reloading in development.

### Security Checklist

- [x] Connection string stored in Cloud Run Secret Manager
- [x] Non-root database user (assumed via Cloud SQL IAM)
- [x] Health check validates database connectivity
- [x] Graceful shutdown disconnects Prisma client
- [x] Logging restricted to errors only in production
- [ ] Connection pool size not explicitly configured
- [ ] SSL mode not explicitly set in connection string

---

## Cross-Cutting Security Concerns

### SSRF Risk Assessment

**Overall Risk: LOW**

No user input is used to construct external API URLs anywhere in the codebase:

| Integration | URL Source | User-Influenced? |
|------------|-----------|-------------------|
| reCAPTCHA | Hardcoded constant (`RECAPTCHA_VERIFY_URL`) | No |
| Claude API | SDK with fixed endpoint | No |
| PostHog | Environment variable (set at deploy time) | No |
| NPI Registry | Hardcoded constant in import scripts | No |
| Redis | Environment variable (set at deploy time) | No |
| PostgreSQL | Environment variable (Secret Manager) | No |

The `evidenceUrl` field in verification submissions is stored in the database but is **never fetched server-side** -- it is only rendered as a link in the frontend, eliminating server-side SSRF vectors.

### Data Flow Security

```
                    Internet
                       |
              [Cloud Run Load Balancer]
                   /          \
    [Frontend (Next.js)]    [Backend (Express)]
          |                      |        \
    [Anthropic API]        [Cloud SQL]   [Redis]
    [PostHog (client)]     [Google reCAPTCHA]
```

**Inbound data validation:**
- Express body parser limited to 100KB (`packages/backend/src/index.ts` line 89)
- Insurance card images validated to 10MB max with type, format, and size checks
- All API inputs validated with Zod schemas before processing

**Outbound data exposure:**
- PostHog receives only anonymized event data (no PII, no health data)
- Google reCAPTCHA receives client IP + token (standard, required for risk scoring)
- Anthropic receives insurance card images (processed in-memory, not persisted)
- No user data is sent to NPI Registry (read-only data source)

### CORS Configuration

From `packages/backend/src/index.ts` (lines 23-86):

```typescript
const ALLOWED_ORIGINS: string[] = [
  'https://verifymyprovider.com',
  'https://www.verifymyprovider.com',
  'https://verifymyprovider-frontend-741434145252.us-central1.run.app',
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));
```

- Production origins are hardcoded
- Additional origins configurable via `FRONTEND_URL` env var
- Development mode adds `localhost:3000` and `localhost:3001`
- Blocked origins are logged for monitoring
- Allowed headers include `X-Admin-Secret` for admin routes

### Security Headers

The backend applies strict security headers via `helmet` (`packages/backend/src/index.ts` lines 47-67):

| Header | Value |
|--------|-------|
| Content-Security-Policy | `default-src 'none'` (JSON API, no HTML served) |
| Cross-Origin-Embedder-Policy | `require-corp` |
| Cross-Origin-Opener-Policy | `same-origin` |
| Cross-Origin-Resource-Policy | `same-origin` |
| Referrer-Policy | `no-referrer` |
| Frame-Ancestors | `'none'` |

### Container Security

Both Dockerfiles (`packages/backend/Dockerfile`, `packages/frontend/Dockerfile`) implement:

- Multi-stage builds (builder + runner stages)
- Non-root users (`expressjs:nodejs` for backend, `nextjs:nodejs` for frontend)
- `node:20-alpine` base images (minimal attack surface)
- Health checks configured
- Production-only dependencies in runner stage
- No secrets baked into images (all injected at runtime)

---

## API Key Management

| Key | Storage Location | Rotation | Scope | Used By |
|-----|-----------------|----------|-------|---------|
| `RECAPTCHA_SECRET_KEY` | Cloud Run env / Secret Manager | Manual | Server-side only | `packages/backend/src/middleware/captcha.ts` |
| `ANTHROPIC_API_KEY` | Cloud Run Secret Manager | Manual | Server-side only | `packages/frontend/src/app/api/insurance-card/extract/route.ts` |
| `NEXT_PUBLIC_POSTHOG_KEY` | Docker build-time arg | Manual | Public (client-side) | `packages/frontend/src/components/PostHogProvider.tsx` |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Docker build-time arg | Manual | Public (client-side) | Frontend reCAPTCHA widget |
| `ADMIN_SECRET` | Cloud Run env | Manual | Server-side only | `packages/backend/src/routes/admin.ts` |
| `REDIS_URL` | Cloud Run env | Manual | Server-side only | `packages/backend/src/lib/redis.ts` |
| `DATABASE_URL` | Cloud Run Secret Manager | Manual | Server-side only | `packages/backend/src/lib/prisma.ts` |

### Admin Secret Security

The admin authentication middleware (`packages/backend/src/routes/admin.ts` lines 22-56) implements timing-safe comparison using `crypto.timingSafeEqual()` to prevent timing attacks:

```typescript
// From packages/backend/src/routes/admin.ts (lines 42-49)
const providedBuffer = Buffer.from(String(providedSecret || ''));
const secretBuffer = Buffer.from(adminSecret);

const isValid =
  providedBuffer.length === secretBuffer.length &&
  timingSafeEqual(providedBuffer, secretBuffer);
```

If `ADMIN_SECRET` is not configured, admin endpoints return 503 rather than being accessible without authentication.

---

## Response Validation Summary

| API | Validation Method | Details |
|-----|------------------|---------|
| reCAPTCHA | TypeScript interface (`RecaptchaResponse`) | Checks `success` boolean and `score` number; validates against `CAPTCHA_MIN_SCORE` threshold |
| Claude API | Zod schema (`InsuranceCardDataSchema`) | 22-field schema with nullable/optional fields; JSON extraction via regex; confidence scoring |
| PostHog | N/A (client-side SDK, fire-and-forget) | No response validation needed |
| Redis | Connection event handlers + try/catch | Errors caught and logged; graceful fallback to in-memory |
| PostgreSQL | Prisma Client type safety | Query errors caught; health check validates connectivity |

---

## Open Questions & Recommendations

### Priority 1 -- Should Address

1. **Cost monitoring for Anthropic API usage:** Each insurance card extraction is an API call to Claude Haiku 4.5. There is no budget alerting or usage cap beyond the 10 requests/hour rate limit. Consider implementing daily/monthly spend tracking via Anthropic's usage API or Cloud Monitoring alerts.

2. **Redis TLS for production:** The current Redis connection does not use TLS. For Google Cloud Memorystore, TLS should be enabled to encrypt data in transit. Add `tls: {}` to the ioredis configuration when connecting to production Redis.

3. **API key rotation automation:** All API keys are rotated manually. Consider leveraging Google Secret Manager versioning with automated rotation schedules, especially for `RECAPTCHA_SECRET_KEY` and `ANTHROPIC_API_KEY`.

### Priority 2 -- Should Consider

4. **PostHog cookie consent/opt-in UI:** Analytics are opt-out by default (`opt_out_capturing_by_default: true`), which is privacy-friendly. However, there is no UI for users to explicitly opt in. If analytics data is desired, a consent banner is needed, especially for GDPR/CCPA compliance.

5. **Claude API timeout configuration:** The insurance card extraction route does not set an explicit timeout on the Anthropic SDK call. While the SDK has internal defaults, an explicit timeout (e.g., 30 seconds) would prevent long-running requests from consuming resources.

6. **NPI data freshness strategy:** The current NPI import is a manual, offline process. If the database needs to stay current with CMS data, consider automated periodic imports (e.g., monthly Cloud Scheduler job) or incremental update support.

### Priority 3 -- Nice to Have

7. **Self-hosted PostHog:** For maximum data control in a healthcare-adjacent application, self-hosting PostHog would eliminate third-party data transmission entirely.

8. **Circuit breaker pattern:** For the reCAPTCHA and Anthropic API integrations, a circuit breaker (e.g., `opossum`) would prevent repeated calls to a failing service and speed up degraded-mode transitions.

9. **Request-level cost tracking:** Tag Anthropic API calls with metadata (e.g., request ID) and correlate with billing data for per-request cost visibility.

---

## File Reference Index

| File | Purpose |
|------|---------|
| `packages/backend/src/middleware/captcha.ts` | reCAPTCHA v3 verification middleware |
| `packages/backend/src/config/constants.ts` | CAPTCHA thresholds, timeouts, rate limit constants |
| `packages/backend/src/lib/redis.ts` | Redis client singleton with retry/reconnection |
| `packages/backend/src/utils/cache.ts` | Dual-mode cache (Redis + in-memory fallback) |
| `packages/backend/src/middleware/rateLimiter.ts` | Dual-mode rate limiting (Redis + in-memory) |
| `packages/backend/src/routes/admin.ts` | Admin endpoints with timing-safe auth |
| `packages/backend/src/lib/prisma.ts` | Prisma client singleton |
| `packages/backend/src/index.ts` | Express server setup, CORS, security headers |
| `packages/backend/.env.example` | Backend environment variable documentation |
| `packages/backend/Dockerfile` | Backend container build (multi-stage, non-root) |
| `packages/frontend/src/app/api/insurance-card/extract/route.ts` | Claude API insurance card extraction route |
| `packages/frontend/src/lib/insuranceCardSchema.ts` | Zod schema for extraction validation |
| `packages/frontend/src/lib/imagePreprocess.ts` | Sharp-based image preprocessing |
| `packages/frontend/src/lib/rateLimit.ts` | Frontend in-memory rate limiter |
| `packages/frontend/src/components/PostHogProvider.tsx` | PostHog initialization and pageview tracking |
| `packages/frontend/src/lib/analytics.ts` | Privacy-preserving analytics event functions |
| `packages/frontend/src/app/error.tsx` | Error boundary with PostHog exception tracking |
| `packages/frontend/.env.example` | Frontend environment variable documentation |
| `packages/frontend/Dockerfile` | Frontend container build (multi-stage, non-root) |
| `scripts/import-npi.ts` | NPI import script (Prisma-based) |
| `scripts/import-npi-direct.ts` | NPI import script (direct PostgreSQL) |
| `.env.example` | Root environment variable documentation |
