# External API Security Review

## External API Inventory

### 1. Google reCAPTCHA v3 API

**File:** `packages/backend/src/middleware/captcha.ts`
**Direction:** Backend --> Google
**Purpose:** Bot detection on verification and vote submissions

| Detail | Value | Line |
|--------|-------|------|
| Endpoint | `https://www.google.com/recaptcha/api/siteverify` | Line 48 |
| Method | POST (URLSearchParams body) | Lines 142-146 |
| Auth | `RECAPTCHA_SECRET_KEY` env var | Line 47 |
| Timeout | 5 seconds (`CAPTCHA_API_TIMEOUT_MS` from constants.ts) | Lines 149-150 |
| Score threshold | 0.5 (`CAPTCHA_MIN_SCORE`) | Line 173 |
| HTTP client | Native `fetch()` with `AbortController` | Lines 149-156 |

**Security Checklist:**
- [x] API key stored in environment variable, not hardcoded (line 47)
- [x] Response validated: checks `success` boolean (line 162) and `score` number (line 173)
- [x] Timeout prevents hanging (5s via AbortController, lines 149-150)
- [x] Fail-open mode with fallback rate limiting (3/hr per IP, lines 210-237)
- [x] Fail-closed mode available (`CAPTCHA_FAIL_MODE=closed`, lines 199-208)
- [x] Skipped in development/test environments (lines 121-123)
- [x] Client IP sent to Google for risk assessment (line 145)
- [x] No SSRF risk -- URL is hardcoded constant (line 48), not user-influenced
- [ ] API key rotation procedure not documented
- [ ] CAPTCHA action field not validated against expected values

**Failure behavior:**
- `CAPTCHA_FAIL_MODE=open` (default): Allows requests with `X-Security-Degraded: captcha-unavailable` header and stricter 3/hr fallback rate limit
- `CAPTCHA_FAIL_MODE=closed`: Blocks all requests with 503

### 2. Anthropic Claude API (Insurance Card Extraction)

**File:** `packages/frontend/src/app/api/insurance-card/extract/route.ts`
**Direction:** Frontend API route --> Anthropic
**Purpose:** AI-powered OCR to extract insurance plan details from uploaded card images

| Detail | Value | Line |
|--------|-------|------|
| Model | `claude-haiku-4-5-20251001` | Line 23 |
| Auth | `ANTHROPIC_API_KEY` env var | Line 34-36 |
| HTTP client | `@anthropic-ai/sdk` package | Lines 183-205 |
| Max tokens | 1500 | Line 185 |
| Feature toggle | Graceful 500 if API key not set | Lines 316-323 |

**Security Checklist:**
- [x] API key stored in Cloud Run Secret Manager (deploy.yml line 194)
- [x] Images processed server-side only (Next.js API route)
- [x] Images NOT stored permanently -- processed in memory only
- [x] File size validated (max 10MB, line 26)
- [x] File type validated: base64 format check (lines 296-297), magic byte detection (lines 43-77)
- [x] Rate limited (10 extractions/hour per IP, lines 28-29, 228-254)
- [x] Feature disabled gracefully if `ANTHROPIC_API_KEY` not configured (lines 316-323)
- [x] Response parsed through Zod schema (`parseInsuranceCardResponse`, line 376)
- [x] Retry logic for low confidence (lines 378-403)
- [ ] No cost monitoring/alerting for API usage
- [ ] Console.error used instead of structured logger (lines 214, 346, 501)

**Data flow:**
1. User uploads card image on frontend
2. Image preprocessed with `sharp` (resize, compress, auto-rotate) via `preprocessImage`/`preprocessImageEnhanced`
3. Next.js API route sends base64 image to Claude with extraction prompt
4. Claude returns text response parsed through Zod schema
5. Results returned to user -- image is NOT persisted

### 3. PostHog Analytics API

**File:** `packages/frontend/src/components/PostHogProvider.tsx`, `packages/frontend/src/lib/analytics.ts`
**Direction:** Frontend --> PostHog (client-side)
**Purpose:** Product analytics and event tracking

| Detail | Value | Line |
|--------|-------|------|
| Endpoint | `https://us.i.posthog.com` (default) or via `NEXT_PUBLIC_POSTHOG_HOST` | PostHogProvider.tsx line 14 |
| Auth | `NEXT_PUBLIC_POSTHOG_KEY` env var (public API key) | PostHogProvider.tsx line 10 |
| HTTP client | `posthog-js` SDK (client-side) | Imported at line 1 |

**Security Checklist:**
- [x] Public API key (safe to expose -- PostHog design)
- [x] Autocapture disabled (`autocapture: false`, PostHogProvider.tsx line 18)
- [x] No PII tracked: analytics.ts explicitly strips NPI, planId, name from search events
- [x] Session recording disabled (`disable_session_recording: true`, PostHogProvider.tsx line 19)
- [x] Only initialized in browser (`typeof window !== 'undefined'`, PostHogProvider.tsx line 9)
- [x] Opt-out by default (`opt_out_capturing_by_default: true`, PostHogProvider.tsx line 20)
- [x] Sensitive params stripped from pageview URLs (PostHogProvider.tsx lines 35-38: npi, planId, name removed)
- [x] Cookie consent component present in layout (`CookieConsent` imported in layout.tsx line 18)
- [ ] User opt-out mechanism beyond initial opt-out-by-default not verified

**Privacy-preserving events tracked (analytics.ts):**
- `search`: Only boolean filter indicators (has_specialty_filter, has_state_filter), NOT actual values (lines 54-63)
- `provider_view`: Only `has_specialty` boolean, NOT NPI or name (lines 74-78)
- `verification_submit`: Empty properties -- only tracks that submission occurred (lines 89-92)
- `verification_vote`: Only `vote_type` direction, NOT verification ID (lines 103-106)

### 4. NPI Registry API (CMS NPPES)

**Direction:** Backend scripts --> CMS (batch data pipeline, NOT live API calls)
**Purpose:** Provider data lookup and enrichment

| Detail | Value |
|--------|-------|
| Endpoint | `https://npiregistry.cms.hhs.gov/api/?version=2.1` |
| Auth | None required (public API) |
| Usage | Bulk CSV download + direct PostgreSQL insertion via import scripts |

**Security Checklist:**
- [x] Public API -- no key management needed
- [x] Bulk data downloaded, not queried in real-time
- [x] No SSRF risk -- URL is not used in live application code
- [x] No user input influences the API URL

### 5. Redis (Optional -- Distributed Rate Limiting & Caching)

**File:** `packages/backend/src/lib/redis.ts`, `packages/backend/src/utils/cache.ts`
**Direction:** Backend --> Redis instance
**Purpose:** Distributed rate limiting and search result caching

| Detail | Value | Line |
|--------|-------|------|
| Client | `ioredis` | redis.ts line 21 |
| Connection | `REDIS_URL` env var | redis.ts line 40 |
| Max retries | 3 per request | redis.ts line 51 |
| Connect timeout | 10 seconds | redis.ts line 52 |
| Command timeout | 5 seconds | redis.ts line 53 |
| Retry strategy | Exponential backoff, max 5 attempts, max 3s delay | redis.ts lines 56-64 |

**Security Checklist:**
- [x] Connection string stored in environment variable (line 40)
- [x] Graceful fallback to in-memory when Redis unavailable (getRedisClient returns null)
- [x] Fail-open behavior (requests allowed when Redis down)
- [x] Singleton pattern prevents connection leaks (lines 24-26)
- [x] Graceful shutdown with `closeRedisConnection()` (lines 134-148)
- [ ] TLS not configured (needed for production Memorystore)
- [ ] No authentication configured beyond network security
- [ ] Connection pooling limits not explicitly set

## Cross-Cutting Security Concerns

### SSRF Risk Assessment: LOW

No user input is used to construct external API URLs anywhere in the codebase:
- reCAPTCHA URL: hardcoded constant (`captcha.ts` line 48)
- Claude API: uses SDK with fixed Anthropic endpoint (`route.ts` line 34)
- PostHog URL: from environment variable set at deploy time
- NPI Registry: hardcoded constant in scripts only
- `evidenceUrl` field in verifications: stored but NEVER fetched server-side

### API Key Management

| Key | Storage | Rotation | Used By | File |
|-----|---------|----------|---------|------|
| `RECAPTCHA_SECRET_KEY` | Cloud Run Secret Manager | Manual | Backend captcha.ts | deploy.yml line 112 |
| `ANTHROPIC_API_KEY` | Cloud Run Secret Manager | Manual | Frontend API route | deploy.yml line 194 |
| `NEXT_PUBLIC_POSTHOG_KEY` | Build-time arg | Manual | Frontend client-side | deploy.yml line 172 |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Build-time arg | Manual | Frontend client-side | .env.example line 81 |
| `ADMIN_SECRET` | Cloud Run Secret Manager | Manual | Backend admin.ts | deploy.yml line 111 |
| `REDIS_URL` | Cloud Run env | Manual | Backend redis.ts | Not in deploy.yml (optional) |
| `DATABASE_URL` | Cloud Run Secret Manager | Manual | Backend prisma.ts | deploy.yml line 110 |

### Response Validation

- [x] reCAPTCHA: Response validated for `success` boolean and `score` number (captcha.ts lines 162, 173)
- [x] Claude: Response parsed through Zod schema (`parseInsuranceCardResponse` in insuranceCardSchema.ts)
- [x] PostHog: Client-side SDK -- no response validation needed
- [x] Redis: Connection errors caught and handled (redis.ts error handler line 81)

## Questions Answered

### 1. Should we implement cost monitoring/alerting for Anthropic API usage?
**Recommended.** Each extraction uses Claude Haiku 4.5 with max 1500 tokens. With retry logic, a single card upload can trigger 2 API calls. At 10 extractions/hour/IP, costs could scale if many users adopt the feature. GCP Cloud Monitoring or Anthropic's usage dashboard should be configured.

### 2. Should Redis connections use TLS in production?
**Yes.** The current `redis.ts` does not configure TLS. Google Cloud Memorystore for Redis requires TLS for network security. The `ioredis` client supports TLS via the connection URL (`rediss://`) or explicit `tls` option.

### 3. Is the NPI Registry API needed for live enrichment?
**Currently no.** All NPI data is bulk-imported via CSV. The API is available for on-demand enrichment but is not used in production. This is the correct approach for performance and reliability.

### 4. Should API key rotation be automated?
**Recommended.** Currently all keys are manually rotated. GCP Secret Manager supports versioning and rotation policies. Critical keys (DATABASE_URL, ADMIN_SECRET) should have rotation schedules.

### 5. Should PostHog be self-hosted?
**Not urgently needed.** The current setup already opts out of capturing by default, disables session recording, strips PII from events, and disables autocapture. Self-hosting would provide additional data control but is not a priority given the current privacy measures.
