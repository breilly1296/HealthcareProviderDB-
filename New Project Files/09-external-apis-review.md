# External API Security Review

**Generated:** 2026-02-18
**Prompt:** 09-external-apis.md
**Status:** SOLID -- All six external integrations properly secured with appropriate auth, error handling, and graceful degradation. Two minor gaps: Redis TLS and Anthropic cost monitoring.

---

## Verified API Inventory

### 1. Google reCAPTCHA v3 API

**File:** `packages/backend/src/middleware/captcha.ts`

| Check | Status | Evidence |
|-------|--------|----------|
| API key in env var | PASS | `RECAPTCHA_SECRET_KEY` read from `process.env` (line 47) |
| Hardcoded URL (no SSRF) | PASS | `const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'` (line 48) |
| Timeout with AbortController | PASS | 5-second timeout via `CAPTCHA_API_TIMEOUT_MS` constant (lines 149-150) |
| Response validation | PASS | Checks `data.success` boolean AND `data.score` number (lines 162-181) |
| Fail-open with fallback rate limit | PASS | Fallback store applies 3 req/hr per IP when Google API fails (lines 89-106, 210-237) |
| Fail-closed mode | PASS | `CAPTCHA_FAIL_MODE=closed` blocks all requests with 503 (lines 199-208) |
| Dev/test skip | PASS | Skipped when `NODE_ENV === 'development'` or `'test'` (lines 121-123) |
| Degraded-security header | PASS | Sets `X-Security-Degraded: captcha-unavailable` on fail-open (line 214) |
| Client IP forwarded | PASS | `remoteip: clientIp` sent to Google (line 145) |

**Findings:**
- The `RecaptchaResponse` interface is properly typed (lines 76-83).
- Fallback store cleanup runs on `RATE_LIMIT_CLEANUP_INTERVAL_MS` interval (line 67-74).
- No API key rotation documentation exists, but this is a process concern not a code gap.

### 2. Anthropic Claude API (Insurance Card Extraction)

**File:** `packages/frontend/src/app/api/insurance-card/extract/route.ts`

| Check | Status | Evidence |
|-------|--------|----------|
| API key in env var | PASS | `process.env.ANTHROPIC_API_KEY` (line 34, 316) |
| Graceful disable if no key | PASS | Returns 500 with user-friendly message if key not set (lines 316-323) |
| Rate limiting | PASS | 10 extractions/hr per IP via `checkRateLimit()` (lines 228-254) |
| File size validation | PASS | 10MB max with `MAX_IMAGE_SIZE_BYTES` (lines 279-290) |
| File type validation | PASS | Magic byte detection for PNG/JPEG/WebP/GIF (lines 43-77) |
| Base64 format validation | PASS | Regex check + minimum length check (lines 296-314) |
| Image preprocessing | PASS | `sharp` used for resize/enhance before sending to Claude (lines 329-355) |
| Retry logic for low confidence | PASS | Retries with `ALTERNATIVE_EXTRACTION_PROMPT` if confidence < 0.3 (lines 379-403) |
| Response parsing via Zod | PASS | `parseInsuranceCardResponse()` from `insuranceCardSchema.ts` (line 376) |
| No image persistence | PASS | Image is processed in-memory only, never stored |
| Specific error handling | PASS | Handles `Anthropic.APIError`, `SyntaxError`, generic errors separately (lines 507-535) |

**Model Configuration:**
- Uses `claude-haiku-4-5-20251001` for cost efficiency (line 23).
- `max_tokens: 1500` per request (line 185).
- Model ID comment says "verified January 2026" (line 17).

**Gaps:**
- No cost monitoring or alerting for API usage -- each extraction is a billable API call.
- No circuit breaker pattern if Claude API is repeatedly failing.
- `console.error` used instead of structured logger for API errors (line 214).

### 3. PostHog Analytics API

**Files:** `packages/frontend/src/components/PostHogProvider.tsx`, `packages/frontend/src/lib/analytics.ts`

| Check | Status | Evidence |
|-------|--------|----------|
| Public API key (safe to expose) | PASS | `NEXT_PUBLIC_POSTHOG_KEY` is public by design |
| Browser-only initialization | PASS | `typeof window !== 'undefined'` check (PostHogProvider.tsx line 9) |
| Autocapture disabled | PASS | `autocapture: false` (line 18) |
| Session recording disabled | PASS | `disable_session_recording: true` (line 19) |
| Opt-out by default | PASS | `opt_out_capturing_by_default: true` (line 20) |
| No PII in events | PASS | analytics.ts sends only boolean indicators, never actual values |
| Privacy-preserving pageviews | PASS | Strips `npi`, `planId`, `name` from URL params before tracking (PostHogProvider.tsx lines 35-38) |

**Events Tracked (analytics.ts):**
- `search` -- boolean flags only (has_specialty_filter, has_state_filter, etc.), result count
- `provider_view` -- only `has_specialty` boolean, no NPI or name
- `verification_submit` -- empty properties (only tracks occurrence)
- `verification_vote` -- only `vote_type` (up/down)

**Findings:**
- Privacy implementation is excellent. All four tracking functions explicitly document what is NOT sent.
- `identifyUser()` and `resetUser()` exist but appear to be prepared for future auth integration.
- PostHog host defaults to `https://us.i.posthog.com` (US data residency).

**Gaps:**
- Cookie consent banner exists (`CookieConsent.tsx` in layout) -- need to verify it controls PostHog opt-in.
- `opt_out_capturing_by_default: true` means no analytics until user consents, which is good for GDPR compliance.

### 4. NPI Registry API (CMS NPPES)

**File:** `scripts/enrich-providers-nppes.ts`

| Check | Status | Evidence |
|-------|--------|----------|
| Public API (no auth needed) | PASS | `NPPES_API_URL = 'https://npiregistry.cms.hhs.gov/api/?version=2.1'` (line 24) |
| Hardcoded URL (no SSRF) | PASS | URL is a constant, not user-influenced |
| Rate limiting | PASS | 1-second delay between batches (`RATE_LIMIT_DELAY_MS = 1000`) (line 26) |
| Not used in live requests | PASS | Only in batch import scripts, never in production API routes |
| Error handling | PASS | `fetchNppes()` catches errors and returns null (lines 59-68) |
| Enrichment protection | PASS | Uses fill-not-overwrite pattern for phone/fax (lines 230-248) |
| Conflict logging | PASS | Logs conflicts to `import_conflicts` table (lines 220-228) |

**Findings:**
- The script operates in dry-run mode by default (10 NPIs), requiring `--apply` flag for writes.
- Rate limiting is conservative at 1 request per second per batch of 50.
- New locations get `data_source = 'nppes'` tag.

### 5. Redis (Optional -- Distributed Rate Limiting & Caching)

**Files:** `packages/backend/src/lib/redis.ts`, `packages/backend/src/utils/cache.ts`

| Check | Status | Evidence |
|-------|--------|----------|
| Connection string in env var | PASS | `REDIS_URL` from `process.env` (line 40) |
| Singleton pattern | PASS | `connectionAttempted` flag prevents multiple connections (lines 35-38) |
| Graceful fallback to in-memory | PASS | Returns null when Redis unavailable, callers use in-memory cache |
| Retry with exponential backoff | PASS | `retryStrategy` with max 5 attempts, capped at 3s delay (lines 56-64) |
| Command timeout | PASS | `commandTimeout: 5000` (line 53) |
| Connection timeout | PASS | `connectTimeout: 10000` (line 52) |
| Graceful shutdown | PASS | `closeRedisConnection()` calls `quit()` then `disconnect()` (lines 134-148) |
| Cache with TTL | PASS | `cacheSet()` uses `setex()` with configurable TTL (lines 132-160) |
| SCAN for pattern deletes | PASS | Uses SCAN instead of KEYS for production safety (lines 203-219) |

**Cache Stats Tracked:** hits, misses, sets, deletes, size, mode (redis vs memory)

**Gaps:**
- TLS not configured -- `ssl` option not set in Redis connection (needed for GCP Memorystore).
- No authentication configured (relies on VPC network security).
- No connection pool limits (default ioredis settings used).
- In-memory cache has no max size limit -- could theoretically grow unbounded.

### 6. Resend API (Magic Link Emails)

**File:** `packages/backend/src/services/authService.ts`

| Check | Status | Evidence |
|-------|--------|----------|
| API key in env var | PASS | `RESEND_API_KEY` from `process.env` (line 20) |
| Graceful skip if not configured | PASS | Logs warning and continues if key missing (lines 105-106) |
| Rate limiting | PASS | 5 magic links per email per hour via DB count (lines 73-85) |
| Error handling | PASS | Catches fetch errors, logs with structured logger (lines 139-144) |
| Response status checked | PASS | Checks `response.ok` before logging success (lines 133-138) |
| Hardcoded endpoint | PASS | `RESEND_API_URL = 'https://api.resend.com/emails'` (line 22) |
| Bearer token auth | PASS | `Authorization: Bearer ${RESEND_API_KEY}` header (line 112) |

**Findings:**
- Token generation uses `crypto.randomBytes(32)` for 256-bit entropy.
- Magic links expire in 15 minutes (`MAGIC_LINK_EXPIRY_MS`).
- Used tokens are marked (`usedAt`) to prevent replay.
- Magic link URL points to backend API route for cookie-based auth flow.

---

## Cross-Cutting Security Assessment

### SSRF Risk: LOW
All external API URLs are hardcoded constants or use SDK-managed endpoints:
- reCAPTCHA: hardcoded `https://www.google.com/recaptcha/api/siteverify`
- Claude: SDK manages endpoint
- PostHog: env var set at deploy time (not user-influenced)
- NPI: hardcoded `https://npiregistry.cms.hhs.gov/api/?version=2.1`
- Redis: env var set at deploy time
- Resend: hardcoded `https://api.resend.com/emails`

### API Key Management
| Key | Storage | Rotation Support |
|-----|---------|------------------|
| `RECAPTCHA_SECRET_KEY` | Cloud Run Secret Manager | Manual |
| `ANTHROPIC_API_KEY` | Cloud Run Secret Manager | Manual |
| `NEXT_PUBLIC_POSTHOG_KEY` | Build-time arg | Manual |
| `RESEND_API_KEY` | Cloud Run Secret Manager | Manual |
| `REDIS_URL` | Cloud Run env var | Manual |

### Response Validation Summary
| API | Validation Method |
|-----|-------------------|
| reCAPTCHA | TypeScript interface + `success`/`score` field checks |
| Claude | Zod schema via `parseInsuranceCardResponse()` |
| PostHog | N/A (client-side SDK) |
| NPI Registry | TypeScript interface, null check on results |
| Redis | ioredis handles protocol, JSON.parse on cached values |
| Resend | HTTP status check (`response.ok`) |

---

## Recommendations

1. **Redis TLS** -- Configure `tls: { rejectUnauthorized: false }` in Redis connection options before deploying with GCP Memorystore.
2. **Anthropic Cost Monitoring** -- Add a counter/metric for Claude API calls and set up an alert threshold (e.g., 1000 calls/day).
3. **In-Memory Cache Limit** -- Add a `MAX_CACHE_SIZE` constant and evict oldest entries when exceeded to prevent unbounded memory growth.
4. **Structured Logging in Frontend API Route** -- Replace `console.error`/`console.log` in the insurance card extraction route with a structured logger for better observability in Cloud Run.
5. **Secret Rotation** -- Document rotation procedures for all API keys, especially `INSURANCE_ENCRYPTION_KEY` which already has a rotation endpoint.
