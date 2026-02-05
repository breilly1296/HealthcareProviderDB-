---
tags:
  - security
  - external-apis
  - medium
type: prompt
priority: 2
updated: 2026-02-05
---

# External API Security Review

## Files to Review
- `packages/backend/src/middleware/captcha.ts` (Google reCAPTCHA v3 API)
- `packages/frontend/src/app/api/insurance-card/extract/route.ts` (Anthropic Claude API)
- `packages/frontend/src/components/PostHogProvider.tsx` (PostHog analytics API)
- `packages/frontend/src/lib/analytics.ts` (PostHog event tracking)
- `packages/backend/src/lib/redis.ts` (Redis connection — optional)
- `packages/backend/src/config/constants.ts` (API timeouts and thresholds)

## External API Inventory

### 1. Google reCAPTCHA v3 API
**Purpose:** Bot detection on verification and vote submissions
**Direction:** Backend → Google
**File:** `packages/backend/src/middleware/captcha.ts`

| Detail | Value |
|--------|-------|
| Endpoint | `https://www.google.com/recaptcha/api/siteverify` |
| Method | POST (URLSearchParams body) |
| Auth | `RECAPTCHA_SECRET_KEY` env var |
| Timeout | 5 seconds (`CAPTCHA_API_TIMEOUT_MS`) |
| Score threshold | 0.5 (`CAPTCHA_MIN_SCORE`) |
| HTTP client | Native `fetch()` with `AbortController` |

**Security considerations:**
- [x] API key stored in environment variable (not hardcoded)
- [x] Response validated (checks `success` and `score` fields)
- [x] Timeout prevents hanging on slow responses
- [x] Fail-open mode with fallback rate limiting (3/hr vs normal 10/hr)
- [x] Fail-closed mode available for high-security
- [x] Skipped in development/test environments
- [x] Client IP sent to Google for risk assessment
- [ ] No SSRF risk — URL is hardcoded constant, not user-influenced
- [ ] API key rotation procedure not documented

**Failure behavior:**
- `CAPTCHA_FAIL_MODE=open` (default): Requests allowed with `X-Security-Degraded: captcha-unavailable` header and stricter fallback rate limiting
- `CAPTCHA_FAIL_MODE=closed`: All requests blocked with 503

### 2. Anthropic Claude API (Insurance Card Extraction)
**Purpose:** AI-powered OCR to extract insurance plan details from uploaded card images
**Direction:** Frontend API route → Anthropic
**File:** `packages/frontend/src/app/api/insurance-card/extract/route.ts`

| Detail | Value |
|--------|-------|
| Endpoint | Anthropic API (via `@anthropic-ai/sdk`) |
| Auth | `ANTHROPIC_API_KEY` env var (in Cloud Run secrets) |
| HTTP client | `@anthropic-ai/sdk` package |
| Feature toggle | Graceful degradation if API key not set |

**Security considerations:**
- [x] API key stored in Cloud Run Secret Manager (not in code)
- [x] Images processed server-side only (Next.js API route)
- [x] Images not stored permanently
- [x] File size validated (max 10MB)
- [x] File type validated (image/* only)
- [x] Rate limited (10 extractions/hour per IP)
- [x] Feature disabled gracefully if `ANTHROPIC_API_KEY` not configured
- [ ] No prompt injection risk from card images (Claude handles image-only input)
- [ ] Cost monitoring not implemented (each extraction is an API call)
- [ ] No retry logic on API failure

**Data flow:**
1. User uploads card image on frontend
2. Image preprocessed with `sharp` (resize, compress, auto-rotate)
3. Next.js API route sends image to Claude with extraction prompt
4. Claude returns structured JSON (insurance company, plan name, network, etc.)
5. Results displayed to user — image is not persisted

### 3. PostHog Analytics API
**Purpose:** Product analytics and event tracking
**Direction:** Frontend → PostHog (client-side)
**File:** `packages/frontend/src/components/PostHogProvider.tsx`, `packages/frontend/src/lib/analytics.ts`

| Detail | Value |
|--------|-------|
| Endpoint | `https://app.posthog.com` (default) or custom via `NEXT_PUBLIC_POSTHOG_HOST` |
| Auth | `NEXT_PUBLIC_POSTHOG_KEY` env var (public API key) |
| HTTP client | `posthog-js` SDK (client-side) |
| Init | Lazy initialization in React provider |

**Security considerations:**
- [x] Public API key (safe to expose — PostHog design)
- [x] Autocapture disabled (explicit events only)
- [x] No PII tracked (no names, emails, health data)
- [x] No session recording enabled
- [x] Only initialized in browser environment
- [ ] Cookie consent banner not implemented
- [ ] User opt-out mechanism not implemented

**Events tracked:** `provider_search`, `provider_view`, `verification_submit`, `compare_action`, `filter_change`, `insurance_card_upload`, `api_error`, `search_no_results`

### 4. NPI Registry API (CMS NPPES)
**Purpose:** Provider data lookup and enrichment
**Direction:** Backend scripts → CMS (used in data pipeline, not live API calls)

| Detail | Value |
|--------|-------|
| Endpoint | `https://npiregistry.cms.hhs.gov/api/?version=2.1` |
| Auth | None required (public API) |
| Rate limiting | CMS-imposed (not documented, estimated ~20 req/sec) |
| Usage | Batch import scripts only — NOT used for live API requests |

**Current usage:**
- Bulk CSV download from NPPES Data Dissemination (`https://download.cms.gov/nppes/NPI_Files.html`)
- Direct PostgreSQL insertion via `scripts/import-npi-direct.ts`
- NPI Registry API available for on-demand enrichment (not currently used in production)

**Security considerations:**
- [x] Public API — no key management needed
- [x] Bulk data downloaded, not queried in real-time (no latency dependency)
- [ ] No SSRF risk — URL is a constant, not user-influenced
- [ ] Rate limiting for on-demand enrichment not implemented (not needed since not used live)

### 5. Redis (Optional — Distributed Rate Limiting & Caching)
**Purpose:** Distributed rate limiting and search result caching
**Direction:** Backend → Redis instance
**File:** `packages/backend/src/lib/redis.ts`, `packages/backend/src/utils/cache.ts`

| Detail | Value |
|--------|-------|
| Client | `ioredis` |
| Connection | `REDIS_URL` env var |
| TLS | Not configured (planned for production) |
| Retry | `maxRetriesPerRequest: 3`, `retryDelayOnFailover: 100ms` |
| Fallback | In-memory mode when Redis unavailable |

**Security considerations:**
- [x] Connection string stored in environment variable
- [x] Graceful fallback to in-memory when Redis unavailable
- [x] Fail-open behavior (requests not blocked when Redis down)
- [ ] TLS not configured (needed for production Memorystore)
- [ ] No authentication configured (rely on network security)
- [ ] Connection pooling limits not set

## Cross-Cutting Security Concerns

### SSRF Risk Assessment
- **Low risk:** No user input is used to construct external API URLs
- reCAPTCHA URL is a hardcoded constant
- Claude API uses SDK with fixed endpoint
- PostHog URL comes from environment variable (set at deploy time)
- NPI Registry URL is a hardcoded constant
- `evidenceUrl` field in verifications is stored but never fetched server-side

### API Key Management
| Key | Storage | Rotation | Used By |
|-----|---------|----------|---------|
| `RECAPTCHA_SECRET_KEY` | Cloud Run env / Secret Manager | Manual | Backend captcha.ts |
| `ANTHROPIC_API_KEY` | Cloud Run Secret Manager | Manual | Frontend API route |
| `NEXT_PUBLIC_POSTHOG_KEY` | Build-time arg | Manual | Frontend client-side |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Build-time arg | Manual | Frontend client-side |
| `ADMIN_SECRET` | Cloud Run env | Manual | Backend admin.ts |
| `REDIS_URL` | Cloud Run env | Manual | Backend redis.ts |
| `DATABASE_URL` | Cloud Run Secret Manager | Manual | Backend prisma.ts |

### Response Validation
- [x] reCAPTCHA: Response validated for `success` boolean and `score` number
- [x] Claude: Response parsed through Zod schema (`insuranceCardSchema`)
- [x] PostHog: Client-side SDK — no response validation needed
- [ ] Redis: Connection errors handled, but response data not validated

## Questions to Ask
1. Should we implement cost monitoring/alerting for Anthropic API usage?
2. Should Redis connections use TLS in production?
3. Is the NPI Registry API needed for live enrichment, or is bulk import sufficient?
4. Should API key rotation be automated via Secret Manager versioning?
5. Should PostHog be self-hosted for better data control?
