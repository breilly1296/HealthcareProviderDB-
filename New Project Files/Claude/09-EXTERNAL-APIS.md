# External API Security Review

This document inventories every external API integration in the VerifyMyProvider application, including authentication methods, failure modes, data exposure risks, and key management practices.

---

## 1. Google reCAPTCHA v3 API

| Property | Value |
|----------|-------|
| **Purpose** | Bot detection on verification and vote submissions |
| **File** | `packages/backend/src/middleware/captcha.ts` |
| **Endpoint** | `https://www.google.com/recaptcha/api/siteverify` (POST) |
| **Auth** | `RECAPTCHA_SECRET_KEY` environment variable, sent as form body parameter |
| **Timeout** | 5 seconds (`CAPTCHA_API_TIMEOUT_MS`), enforced via `AbortController` |
| **Score Threshold** | 0.5 (`CAPTCHA_MIN_SCORE`) -- scores below this are rejected as likely bots |
| **Data Sent** | Secret key, CAPTCHA token, client IP (`remoteip`) |
| **Data Received** | `success`, `score` (0.0-1.0), `action`, `challenge_ts`, `hostname`, `error-codes` |

### Failure Modes

**Fail-Open Mode** (default, `CAPTCHA_FAIL_MODE=open`):
- When Google API is unavailable (timeout, network error, outage), requests are allowed through
- Fallback rate limiting is applied: 3 requests per hour per IP (vs normal 10/hour for verifications)
- Response headers set: `X-Security-Degraded: captcha-unavailable`, plus fallback rate limit headers
- Prioritizes availability over security -- appropriate for consumer-facing features

**Fail-Closed Mode** (`CAPTCHA_FAIL_MODE=closed`):
- When Google API is unavailable, ALL requests are blocked with HTTP 503
- Returns user-friendly message: "Security verification temporarily unavailable"
- Prioritizes security over availability -- appropriate for admin or financial endpoints

### Environment Behavior
- **Development/Test**: CAPTCHA verification is skipped entirely (`NODE_ENV === 'development' || 'test'`)
- **Missing Secret Key**: Verification is skipped with a warning log (graceful degradation during initial setup)
- **Missing Token**: Returns 400 "CAPTCHA token required"

### Client-Side Integration
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` loaded in `ReCaptchaProvider.tsx`
- Token sent via `captchaToken` field in request body or `x-captcha-token` header
- `useCaptcha` hook handles token acquisition in the frontend

---

## 2. Anthropic Claude API (Insurance Card Extraction)

| Property | Value |
|----------|-------|
| **Purpose** | AI-powered OCR to extract structured data from insurance card photographs |
| **File** | `packages/frontend/src/app/api/insurance-card/extract/route.ts` |
| **SDK** | `@anthropic-ai/sdk` package (official Anthropic TypeScript SDK) |
| **Model** | `claude-haiku-4-5-20251001` (cost-effective for structured extraction) |
| **Auth** | `ANTHROPIC_API_KEY` stored in GCP Secret Manager, injected at runtime |
| **Max Tokens** | 1,500 per request |
| **Rate Limit** | 10 extractions per hour per IP (application-enforced) |

### Security Protections (Defense in Depth)

1. **Rate Limiting**: 10 requests/hour per client IP, enforced before API call
2. **Payload Type Validation**: Image must be a base64 string
3. **Payload Size Validation**: Maximum 10MB (raw), ~13.7MB base64-encoded
4. **Base64 Format Validation**: Regex check for valid base64 characters
5. **Minimum Size Check**: At least 100 base64 characters (rejects empty/corrupt uploads)
6. **Magic Byte Detection**: Verifies actual image format (PNG, JPEG, WebP, GIF) from binary header

### Image Processing Pipeline
1. Client uploads image as base64
2. Server-side preprocessing with `sharp`: resize, contrast enhancement if needed
3. Primary extraction attempt with structured prompt
4. If confidence < 0.3 or parse failure, retry with alternative prompt
5. Best result returned to client with confidence metadata

### Data Handling
- Images are processed in-memory on the server, never stored permanently
- No image data is logged or persisted to disk
- Extracted structured data (plan name, member ID, group number) returned to client
- API key not configured gracefully returns 500 with message to enter data manually

### Error Handling
- `Anthropic.APIError` caught specifically, returns HTTP 503 with user-friendly message
- `SyntaxError` from malformed requests returns HTTP 400
- Parse failures return HTTP 422 with specific suggestions (blur, glare, partial card, etc.)

---

## 3. PostHog Analytics API

| Property | Value |
|----------|-------|
| **Purpose** | Privacy-preserving product analytics and usage tracking |
| **Files** | `packages/frontend/src/components/PostHogProvider.tsx`, `packages/frontend/src/lib/analytics.ts` |
| **SDK** | `posthog-js` (client-side JavaScript SDK) |
| **Auth** | `NEXT_PUBLIC_POSTHOG_KEY` (public project API key, safe for client exposure) |
| **Host** | `NEXT_PUBLIC_POSTHOG_HOST` (defaults to `https://us.i.posthog.com`) |

### Privacy Configuration

```typescript
posthog.init(key, {
  capture_pageview: false,        // Manual pageview capture for sanitization
  capture_pageleave: true,        // Track session duration
  persistence: 'localStorage',    // No cookies
  autocapture: false,             // No automatic event capture
  disable_session_recording: true, // No session replays
  opt_out_capturing_by_default: true, // Opt-in only (requires user consent)
});
```

### Privacy-Preserving Event Design

All analytics events send **boolean indicators only**, never actual healthcare data:

| Event | Sent | NOT Sent |
|-------|------|----------|
| `search` | `has_specialty_filter`, `has_state_filter`, `has_city_filter`, `results_count`, `mode` | specialty name, state, city, health system |
| `provider_view` | `has_specialty` | NPI, provider name, specialty |
| `verification_submit` | (empty -- only that submission occurred) | NPI, plan ID, acceptance status |
| `verification_vote` | `vote_type` (up/down) | verification ID, NPI |

### Pageview Sanitization
- Sensitive query parameters (`npi`, `planId`, `name`) are stripped from URLs before sending
- Only sanitized URL path is sent to PostHog

---

## 4. NPI Registry API (CMS NPPES)

| Property | Value |
|----------|-------|
| **Purpose** | National provider data lookup and import |
| **Source** | NPPES Data Dissemination (CMS), bulk CSV downloads |
| **Auth** | None required (public government data) |
| **Integration Type** | Batch import only -- no live API calls from the running application |

### Import Process
- Bulk CSV files downloaded from CMS NPPES website
- Processed by `scripts/import-npi-direct.ts` using direct PostgreSQL insertion
- Batch size: 5,000 records per batch
- NYC import (~50-75K providers) takes approximately 60-90 minutes
- Supporting scripts: `normalize-city-names.ts`, `cleanup-deactivated-providers.ts`, `backfill-verification-ttl.ts`, `backfill-specialty-fast.cjs`, `generate-cities-json.cjs`, `check-import-status.ts`, `verify-data-quality.ts`

### No Runtime API Dependency
The application does **not** make live calls to the NPI Registry API. All provider data is pre-imported and served from PostgreSQL. This eliminates runtime dependency on CMS API availability and avoids rate limiting concerns.

---

## 5. Redis (Optional Distributed Cache)

| Property | Value |
|----------|-------|
| **Purpose** | Distributed rate limiting and caching for horizontal scaling |
| **File** | `packages/backend/src/lib/redis.ts` |
| **Client** | `ioredis` package |
| **Connection** | `REDIS_URL` environment variable |
| **Auth** | Included in connection URL if required |

### Connection Configuration
```typescript
{
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,       // 10s connection timeout
  commandTimeout: 5000,        // 5s command timeout
  retryStrategy: exponentialBackoff, // Up to 5 attempts, max 3s delay
  enableReadyCheck: true,
  lazyConnect: false,
}
```

### Graceful Fallback
- If `REDIS_URL` is not configured, all Redis features fall back to in-memory implementations
- If Redis becomes unavailable mid-operation, rate limiter fails open (allows request with warning)
- In-memory rate limiting uses sliding window algorithm (safe for single-instance deployments)
- `X-RateLimit-Status: degraded` header set when Redis is unavailable

---

## SSRF Risk Assessment

**Overall Risk: LOW**

No external API URLs in this application are constructed from user input:
- reCAPTCHA URL is hardcoded: `https://www.google.com/recaptcha/api/siteverify`
- Anthropic SDK uses the official API endpoint internally
- PostHog host is configured via environment variable (not user input)
- Redis URL is configured via environment variable (not user input)
- NPI data is batch-imported, not fetched at runtime

The only user-provided data sent to external APIs is:
- CAPTCHA tokens (opaque strings from Google's client-side widget)
- Insurance card images (base64 to Anthropic, with size/type validation)

---

## API Key Management

| Key | Storage (Local) | Storage (Production) | Rotation Method | Exposure Risk |
|-----|----------------|---------------------|-----------------|---------------|
| `RECAPTCHA_SECRET_KEY` | `.env` (gitignored) | GCP Secret Manager | Google Cloud Console, redeploy | Low -- server-side only |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | `.env` (gitignored) | Build arg in Dockerfile | Google Cloud Console, rebuild | None -- designed to be public |
| `ANTHROPIC_API_KEY` | `.env` (gitignored) | GCP Secret Manager | Anthropic Console, update secret version | Low -- server-side only, Next.js API route |
| `NEXT_PUBLIC_POSTHOG_KEY` | `.env` (gitignored) | Build arg in Dockerfile | PostHog dashboard, rebuild | None -- designed to be public |
| `ADMIN_SECRET` | `.env` (gitignored) | GCP Secret Manager | Generate new secret, update GCP Secret Manager | Medium -- protects admin endpoints |
| `DATABASE_URL` | `.env` (gitignored) | GCP Secret Manager | Rotate Cloud SQL password, update secret | High -- full database access |
| `REDIS_URL` | `.env` (gitignored) | Cloud Run env var | Update Redis credentials | Medium -- rate limiting state |

### Key Security Practices
- All secrets are gitignored via `.env` files locally
- Production secrets stored in GCP Secret Manager (not environment variables)
- Admin secret validated using `crypto.timingSafeEqual` to prevent timing attacks
- Workload Identity Federation used for GCP authentication (no long-lived service account keys)
- `NEXT_PUBLIC_` prefixed keys are intentionally public (PostHog project key, reCAPTCHA site key)
