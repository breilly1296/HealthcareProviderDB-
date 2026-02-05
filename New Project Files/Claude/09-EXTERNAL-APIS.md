# External API Security Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/09-external-apis.md
**Status:** All external APIs are properly integrated with appropriate security controls; some gaps in TLS, cost monitoring, and privacy compliance

---

## Findings

### 1. Google reCAPTCHA v3 API

**File:** `packages/backend/src/middleware/captcha.ts`

- **API key stored in environment variable (not hardcoded):**
  Verified. Line 47: `const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;`

- **Response validated (checks `success` and `score` fields):**
  Verified. Lines 162-183: Checks `data.success` boolean, then checks `data.score < CAPTCHA_MIN_SCORE`. Both conditions produce distinct error responses with structured logging.

- **Timeout prevents hanging on slow responses:**
  Verified. Lines 149-151: Uses `AbortController` with `CAPTCHA_API_TIMEOUT_MS` (5 seconds from `constants.ts` line 57). Timeout abort is detected via `error.name === 'AbortError'` at line 189.

- **Fail-open mode with fallback rate limiting:**
  Verified. Lines 210-237: When Google API fails and `CAPTCHA_FAIL_MODE=open`, the `checkFallbackRateLimit()` function applies a stricter 3/hour limit per IP (vs normal 10/hour). Appropriate headers are set: `X-Security-Degraded`, `X-Fallback-RateLimit-Limit`, `X-Fallback-RateLimit-Remaining`, `X-Fallback-RateLimit-Reset`.

- **Fail-closed mode available:**
  Verified. Lines 199-208: When `CAPTCHA_FAIL_MODE=closed`, returns 503 via `AppError.serviceUnavailable()`.

- **Skipped in development/test environments:**
  Verified. Lines 121-123: Returns `next()` for `NODE_ENV=development` or `NODE_ENV=test`.

- **Skipped when secret key not configured:**
  Verified. Lines 126-132: Logs a warning and allows the request through.

- **Client IP sent to Google for risk assessment:**
  Verified. Line 146: `remoteip: clientIp` included in the URLSearchParams body.

- **No SSRF risk:**
  Verified. The URL `https://www.google.com/recaptcha/api/siteverify` is a hardcoded constant at line 48. No user input influences the URL.

- **API key rotation procedure:**
  Not documented. The prompt notes this as unchecked.

- **Endpoint hardcoded constant:**
  Verified. `RECAPTCHA_VERIFY_URL` is `'https://www.google.com/recaptcha/api/siteverify'` (line 48), not derived from user input or environment variables.

- **Token source:**
  Verified. Line 134: Token is read from `req.body.captchaToken` or `req.headers['x-captcha-token']`, providing flexibility for different client implementations.

### 2. Anthropic Claude API (Insurance Card Extraction)

**File:** `packages/frontend/src/app/api/insurance-card/extract/route.ts`

- **API key stored securely:**
  Verified. Line 34-36: `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`. The prompt states the key is in Cloud Run Secret Manager.

- **Images processed server-side only:**
  Verified. This is a Next.js API route (`export async function POST(request: NextRequest)`), so the image is sent to the server and the Claude API call happens server-side. The `ANTHROPIC_API_KEY` is never exposed to the client.

- **Images not stored permanently:**
  Verified. The image is received as base64, preprocessed in memory, sent to Claude, and the response is returned. No file system writes or database storage of the image data.

- **File size validated (max 10MB):**
  Verified. Lines 26-27: `MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024` and `MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_SIZE_BYTES * 1.37)`. Check at line 279 rejects with 413 if exceeded.

- **File type validated (image/* only):**
  Verified. Lines 43-77: `detectMediaType()` uses magic byte detection to identify PNG, JPEG, WebP, and GIF. Only these image types are accepted. Base64 format validation at lines 296-303 ensures valid base64 characters.

- **Rate limited (10 extractions/hour per IP):**
  Verified. Lines 28-29: `RATE_LIMIT_PER_HOUR = 10`. Lines 229-254: Uses the frontend's `checkRateLimit()` function from `packages/frontend/src/lib/rateLimit.ts` with 1-hour window.

- **Feature disabled gracefully if API key not configured:**
  Verified. Lines 316-323: If `ANTHROPIC_API_KEY` is not set, returns 500 with a user-friendly message suggesting manual entry.

- **Response parsed through Zod schema:**
  Verified. `parseInsuranceCardResponse()` from `packages/frontend/src/lib/insuranceCardSchema.ts` uses `InsuranceCardDataSchema` (a comprehensive Zod schema with 22+ fields) to validate and parse the Claude response. This prevents malformed or unexpected data from reaching the frontend.

- **No retry logic on API failure:**
  Partially addressed. Lines 378-403: There IS retry logic, but only for low-confidence results (below `RETRY_CONFIDENCE_THRESHOLD = 0.3`), using an alternative prompt. However, there is no retry on transient API errors (network timeout, 5xx responses).

- **Cost monitoring:**
  Not implemented. The prompt notes this as unchecked. Each extraction is a Claude Haiku 4.5 API call with image input and up to 1500 output tokens. No spend tracking or alerting exists.

- **Prompt injection risk:**
  Low risk. The Claude API receives image data with a fixed extraction prompt. The prompts are defined as constants (`PRIMARY_EXTRACTION_PROMPT`, `ALTERNATIVE_EXTRACTION_PROMPT`) in the schema module. User-controlled text is not injected into the prompt.

- **Error handling:**
  Verified. Lines 499-536: Comprehensive error handling distinguishes `SyntaxError` (400), `Anthropic.APIError` (503), and generic errors (500). All return user-friendly messages with suggestions.

- **Image preprocessing:**
  Verified. Lines 326-355: Images are preprocessed using the `sharp` library for resize, compression, and optional contrast enhancement. Preprocessing failures are caught and the original image is used as fallback.

### 3. PostHog Analytics API

**File:** `packages/frontend/src/components/PostHogProvider.tsx`, `packages/frontend/src/lib/analytics.ts`

- **Public API key (safe to expose):**
  Verified. Line 10 of PostHogProvider.tsx: `process.env.NEXT_PUBLIC_POSTHOG_KEY`. PostHog public keys are designed to be client-visible.

- **Autocapture disabled (explicit events only):**
  Issue. The prompt states autocapture is disabled, but PostHogProvider.tsx line 18 shows `autocapture: true`. This contradicts the prompt's checklist item. With autocapture enabled, PostHog will automatically capture clicks, form submissions, and other DOM interactions, which could inadvertently capture sensitive healthcare-related UI elements.

- **No PII tracked (no names, emails, health data):**
  Verified. `packages/frontend/src/lib/analytics.ts` implements privacy-preserving event tracking:
  - `trackSearch()` (lines 50-64): Sends only boolean indicators (`has_specialty_filter`, `has_state_filter`, etc.) and result count. Does NOT send actual search values.
  - `trackProviderView()` (lines 70-78): Sends only `has_specialty` boolean. Does NOT send NPI, provider name, or specialty.
  - `trackVerificationSubmit()` (lines 84-93): Sends NO data at all -- only that a submission occurred.
  - `trackVerificationVote()` (lines 99-107): Sends only `vote_type`. Does NOT send verification ID or NPI.

- **No session recording enabled:**
  Verified. No `enable_recording_console_log` or `session_recording` configuration in PostHog init.

- **Only initialized in browser environment:**
  Verified. PostHogProvider.tsx line 9: `if (typeof window !== 'undefined')`. analytics.ts functions also check `if (typeof window === 'undefined') return;`.

- **Cookie consent banner:**
  Not implemented. The prompt notes this as unchecked. PostHog sets cookies and uses localStorage (`persistence: 'localStorage'` at line 17) without user consent.

- **User opt-out mechanism:**
  Not implemented. No `posthog.opt_out_capturing()` call or UI toggle exists.

- **PostHog host:**
  Warning. PostHogProvider.tsx line 14 uses `api_host: 'https://us.i.posthog.com'` which is a hardcoded PostHog cloud URL. The prompt mentions `NEXT_PUBLIC_POSTHOG_HOST` as an option, but the code uses a hardcoded string instead of an environment variable.

- **Pageview tracking:**
  Verified. Lines 26-41: `PostHogPageview` component captures `$pageview` events on route changes using `usePathname()` and `useSearchParams()`. Manual pageview capture is used (`capture_pageview: false`) with URL construction.

- **Search params in pageview URL:**
  Warning. Line 33: `searchParams.toString()` is appended to the pageview URL. If search parameters contain sensitive data (e.g., provider NPIs, plan IDs), these would be sent to PostHog as part of the URL.

### 4. NPI Registry API (CMS NPPES)

- **Public API -- no key management needed:**
  Verified. The prompt confirms this is a public API used only for batch import scripts, not live API calls.

- **Bulk data downloaded, not queried in real-time:**
  Verified. The prompt states usage is via `scripts/import-npi-direct.ts` for direct PostgreSQL insertion from CSV downloads.

- **No SSRF risk:**
  Verified. The CMS NPPES URL is a constant, not user-influenced.

### 5. Redis (Distributed Rate Limiting and Caching)

**Files:** `packages/backend/src/lib/redis.ts`, `packages/backend/src/utils/cache.ts`

- **Connection string stored in environment variable:**
  Verified. `redis.ts` line 40: `const redisUrl = process.env.REDIS_URL;`

- **Graceful fallback to in-memory:**
  Verified. `redis.ts` line 41-44: If `REDIS_URL` not configured, returns null. Callers (rateLimiter.ts, cache.ts) check for null and use in-memory alternatives.

- **Fail-open behavior:**
  Verified. Both the rate limiter and cache module handle Redis errors gracefully -- the rate limiter allows requests with degraded headers, and the cache falls back to in-memory.

- **Retry strategy:**
  Verified. `redis.ts` lines 56-64: Exponential backoff with `maxRetriesPerRequest: 3`, up to 5 reconnection attempts, delays capped at 3 seconds.

- **Connection event logging:**
  Verified. Lines 72-98: Events logged include `connect`, `ready`, `error`, `close`, `reconnecting`, and `end`.

- **Graceful shutdown:**
  Verified. `closeRedisConnection()` at lines 134-148 attempts `quit()` first, falls back to `disconnect()`.

- **TLS not configured:**
  Issue. The prompt notes TLS is needed for production Memorystore. The `new Redis(redisUrl, {...})` configuration at lines 49-69 does not include any TLS settings. If `REDIS_URL` uses a `rediss://` scheme, ioredis will use TLS automatically, but there is no explicit TLS configuration or certificate pinning.

- **No authentication configured:**
  Warning. The prompt notes reliance on network security. If the Redis instance is on a VPC (Cloud Memorystore), network-level security may suffice, but no Redis AUTH password is configured in code.

- **Connection pooling limits not set:**
  Warning. No `maxConnections` or similar pool configuration. ioredis defaults to a single connection, which is appropriate for the current use case but should be reviewed at scale.

- **Cache response data not validated:**
  Warning. In `cache.ts`, `cacheGet()` at line 97 does `JSON.parse(value) as T` with a type assertion but no runtime validation. Corrupted or tampered cache entries would be passed through without validation.

### 6. Cross-Cutting: SSRF Risk Assessment

- Verified. No user input constructs external API URLs anywhere in the codebase:
  - reCAPTCHA URL: hardcoded constant
  - Anthropic API: SDK with fixed endpoint
  - PostHog: hardcoded in code (not even from env var)
  - NPI Registry: hardcoded constant in scripts
  - `evidenceUrl` in verifications: stored but never fetched server-side

### 7. Cross-Cutting: API Key Management

| Key | Storage | Verified |
|-----|---------|----------|
| `RECAPTCHA_SECRET_KEY` | Env var / Secret Manager | Yes -- used in captcha.ts |
| `ANTHROPIC_API_KEY` | Cloud Run Secret Manager | Yes -- used in extract/route.ts |
| `NEXT_PUBLIC_POSTHOG_KEY` | Build-time arg | Yes -- used in PostHogProvider.tsx |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Build-time arg | Assumed (frontend reCAPTCHA widget) |
| `ADMIN_SECRET` | Cloud Run env | Not reviewed (out of scope) |
| `REDIS_URL` | Cloud Run env | Yes -- used in redis.ts |
| `DATABASE_URL` | Cloud Run Secret Manager | Not reviewed (out of scope) |

- **Key rotation:**
  Not documented or automated for any key. All rotation is manual.

### 8. Cross-Cutting: Response Validation

- **reCAPTCHA:**
  Verified. Response is typed as `RecaptchaResponse` interface and both `success` boolean and `score` number are explicitly checked.

- **Claude API:**
  Verified. Response is parsed through a Zod schema (`InsuranceCardDataSchema`) with 22+ fields, each with proper type constraints. Parse failures are handled gracefully with user-friendly error messages.

- **PostHog:**
  Verified. Client-side SDK -- no response validation needed.

- **Redis:**
  Warning. Connection errors are handled, but cached data retrieved via `JSON.parse()` has no runtime schema validation.

---

## Summary

All five external API integrations (Google reCAPTCHA v3, Anthropic Claude, PostHog, NPI Registry, Redis) are implemented with appropriate security controls. API keys are stored in environment variables or Secret Manager, responses are validated where it matters most (reCAPTCHA and Claude), and failure modes are well-designed with graceful degradation. The privacy-preserving analytics implementation in `analytics.ts` is particularly well done -- it sends only boolean indicators rather than actual healthcare data.

Key strengths:
- CAPTCHA has configurable fail-open/fail-closed with stricter fallback rate limiting
- Claude API route has five layers of protection (rate limiting, type validation, size validation, base64 validation, API key check)
- Analytics functions explicitly strip PII before sending events
- Redis connection has comprehensive event logging and retry logic

The most notable gaps are the PostHog autocapture discrepancy, missing TLS for Redis, absence of cost monitoring for Claude API, and lack of cookie consent and user opt-out mechanisms for analytics.

---

## Recommendations

1. **Disable PostHog autocapture.** The prompt claims `autocapture: false` but the code has `autocapture: true` in `PostHogProvider.tsx` line 18. Autocapture can inadvertently capture clicks on healthcare-related UI elements (provider names, insurance details, NPI numbers). Change to `autocapture: false` and rely on the explicit event tracking already implemented in `analytics.ts`.

2. **Configure Redis TLS for production.** Add explicit TLS configuration when connecting to Cloud Memorystore or any production Redis instance. At minimum, use `rediss://` scheme in `REDIS_URL` or add `tls: {}` to the ioredis options.

3. **Implement cost monitoring for Claude API.** Each insurance card extraction uses Claude Haiku 4.5 with image input. Add tracking of API call count and estimated cost (perhaps via PostHog or a simple counter) and set up alerts for unusual spikes. Consider adding a daily/monthly extraction cap as a safety valve.

4. **Implement cookie consent and user opt-out for PostHog.** This is increasingly required by privacy regulations (GDPR, CCPA). Add a consent banner and honor opt-out via `posthog.opt_out_capturing()`. Consider delaying PostHog initialization until consent is granted.

5. **Use environment variable for PostHog host.** Replace the hardcoded `'https://us.i.posthog.com'` with `process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'` for flexibility (e.g., if self-hosting PostHog in the future).

6. **Add retry logic for transient Claude API errors.** The route retries on low-confidence results but not on network errors or 5xx responses. A single retry with a short delay (e.g., 1 second) for transient errors would improve reliability.

7. **Sanitize search params from pageview URLs.** In `PostHogPageview`, consider stripping or hashing sensitive query parameters (NPI, planId) before sending to PostHog, consistent with the privacy-preserving approach in `analytics.ts`.

8. **Document API key rotation procedures.** Create a runbook for rotating each external API key, including the Google reCAPTCHA secret, Anthropic API key, and PostHog project key. Consider automating rotation via Cloud Secret Manager versioning.

9. **Add runtime validation for Redis cache data.** When reading cached search results via `cacheGet()`, consider validating the structure before returning to callers, to protect against cache corruption.
