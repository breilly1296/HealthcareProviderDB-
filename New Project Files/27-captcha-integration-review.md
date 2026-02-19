# CAPTCHA Integration Review

**Last Updated:** 2026-02-18
**Status:** Backend Complete / Frontend Partially Integrated

---

## Configuration

| Setting | Value | Source | Notes |
|---------|-------|--------|-------|
| Provider | Google reCAPTCHA v3 | `packages/backend/src/middleware/captcha.ts` | Score-based, invisible to users |
| Score Threshold | 0.5 | `packages/backend/src/config/constants.ts` (`CAPTCHA_MIN_SCORE`) | Scores below 0.5 blocked as likely bots |
| Fail Mode | open (default) | `CAPTCHA_FAIL_MODE` env var | Requests allowed with fallback rate limiting when Google API fails |
| API Timeout | 5 seconds | `packages/backend/src/config/constants.ts` (`CAPTCHA_API_TIMEOUT_MS`) | AbortController cancels slow Google API calls |
| Fallback Rate Limit | 3 requests/hour | `CAPTCHA_FALLBACK_MAX_REQUESTS` | Stricter limit applied when CAPTCHA unavailable |
| Fallback Window | 1 hour | `CAPTCHA_FALLBACK_WINDOW_MS` | Window for fallback rate counting |
| Secret Key | `RECAPTCHA_SECRET_KEY` env var | GCP Secret Manager | Required for production |
| Site Key (Frontend) | `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` env var | Build-time config | Public key for frontend widget |

---

## Protected Endpoints

| Endpoint | Method | Rate Limit (separate) | CAPTCHA | Honeypot |
|----------|--------|----------------------|---------|----------|
| `/api/v1/verify` | POST | 10/hour (verification) | Yes | Yes |
| `/api/v1/verify/:id/vote` | POST | 10/hour (vote) | Yes | Yes |

### Middleware Chain Order (Verification Endpoint)

```
verificationRateLimiter  →  honeypotCheck('website')  →  verifyCaptcha  →  handler
```

The order is intentional:
1. **Rate limiter first:** Cheapest check; rejects over-limit requests before any processing
2. **Honeypot second:** Catches bots that auto-fill hidden fields; returns fake 200 OK
3. **CAPTCHA third:** Most expensive check (external API call); only runs for non-bot, non-rate-limited requests

---

## Backend Implementation Details

### File: `packages/backend/src/middleware/captcha.ts`

**Token Extraction:**
```typescript
const captchaToken = req.body.captchaToken || req.headers['x-captcha-token'];
```
Accepts token in request body (`captchaToken` field) or `x-captcha-token` header.

**Verification Flow:**
1. Skip in development/test environments (`NODE_ENV === 'development' || 'test'`)
2. Skip if `RECAPTCHA_SECRET_KEY` not configured (logs warning)
3. Reject if no token provided (400: "CAPTCHA token required")
4. Call Google reCAPTCHA API with token + client IP
5. If `success: false` -- reject (400: "CAPTCHA verification failed")
6. If `score < 0.5` -- reject (403: "Request blocked due to suspicious activity")
7. If Google API unreachable:
   - **Fail-open mode:** Apply fallback rate limit (3/hour), set `X-Security-Degraded` header
   - **Fail-closed mode:** Reject all (503: "Security verification temporarily unavailable")

**Fallback Rate Limiting (Fail-Open):**
- Separate in-memory store from main rate limiters
- 3 requests per hour per IP (vs normal 10)
- Response headers indicate degraded state:
  - `X-Security-Degraded: captcha-unavailable`
  - `X-Fallback-RateLimit-Limit`
  - `X-Fallback-RateLimit-Remaining`
  - `X-Fallback-RateLimit-Reset`
- Periodic cleanup of expired fallback entries (every 60 seconds)

---

## Frontend Implementation Details

### ReCaptchaProvider

**File:** `packages/frontend/src/components/ReCaptchaProvider.tsx`

```typescript
export function ReCaptchaProvider({ children }: { children: React.ReactNode }) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    return <>{children}</>;  // Graceful degradation
  }
  return (
    <GoogleReCaptchaProvider reCaptchaKey={siteKey}>
      {children}
    </GoogleReCaptchaProvider>
  );
}
```

Wraps the application in Google's reCAPTCHA v3 provider. Gracefully degrades to rendering children without CAPTCHA if the site key is not configured.

### useCaptcha Hook

Used in `ProviderVerificationForm.tsx`:
```typescript
const { getToken } = useCaptcha();

// In submit handler:
const captchaToken = await getToken('submit_verification');
await verificationApi.submit({
  npi: providerNpi,
  planId,
  acceptsInsurance: ...,
  captchaToken,
  website: honeypot || undefined,  // Honeypot field
});
```

### Honeypot Field (Frontend)

**File:** `packages/frontend/src/components/ProviderVerificationForm.tsx`, lines 481-492

```tsx
<div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}
     aria-hidden="true" tabIndex={-1}>
  <label htmlFor="pvf-website">Website</label>
  <input
    type="text"
    id="pvf-website"
    name="website"
    value={honeypot}
    onChange={(e) => setHoneypot(e.target.value)}
    autoComplete="off"
    tabIndex={-1}
  />
</div>
```

Hidden from real users (off-screen, zero opacity, zero height, `aria-hidden`, negative `tabIndex`). Bots that auto-fill form fields will populate this, triggering the backend honeypot check.

---

## Score Interpretation

| Score Range | Interpretation | Action | Backend Code |
|-------------|----------------|--------|-------------|
| 0.9 - 1.0 | Very likely human | Allow | `data.score >= CAPTCHA_MIN_SCORE` |
| 0.7 - 0.9 | Likely human | Allow | Same |
| 0.5 - 0.7 | Uncertain | Allow (at threshold) | Same |
| 0.3 - 0.5 | Likely bot | Block | `data.score < CAPTCHA_MIN_SCORE` returns 403 |
| 0.0 - 0.3 | Very likely bot | Block | Same |

---

## Error Responses

### Token Missing (400)
```json
{
  "success": false,
  "error": {
    "message": "CAPTCHA token required for verification submissions",
    "code": "CAPTCHA_REQUIRED",
    "statusCode": 400
  }
}
```

### Verification Failed (400)
```json
{
  "success": false,
  "error": {
    "message": "CAPTCHA verification failed",
    "statusCode": 400
  }
}
```

### Low Score / Bot Detected (403)
```json
{
  "success": false,
  "error": {
    "message": "Request blocked due to suspicious activity",
    "code": "FORBIDDEN",
    "statusCode": 403
  }
}
```

### Service Unavailable -- Fail-Closed (503)
```json
{
  "success": false,
  "error": {
    "message": "Security verification temporarily unavailable. Please try again in a few minutes.",
    "statusCode": 503
  }
}
```

### Fallback Rate Limit Exceeded -- Fail-Open (429)
```json
{
  "success": false,
  "error": {
    "message": "Too many requests while security verification is unavailable. Please try again later.",
    "statusCode": 429
  }
}
```

---

## Development Mode

CAPTCHA is skipped in development and test environments:
```typescript
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  return next(); // Skip CAPTCHA
}
```

This allows local development and automated testing without configuring reCAPTCHA keys.

---

## Integration Checklist

### Backend Implementation
- [x] Google reCAPTCHA v3 middleware created (`captcha.ts`)
- [x] Score threshold configurable (`CAPTCHA_MIN_SCORE = 0.5`)
- [x] API timeout configured (5 seconds with AbortController)
- [x] Fail-open mode with fallback rate limiting (3/hour)
- [x] Fail-closed mode available (`CAPTCHA_FAIL_MODE=closed`)
- [x] Development/test mode bypass
- [x] Applied to verification submission (`POST /api/v1/verify`)
- [x] Applied to voting endpoint (`POST /api/v1/verify/:id/vote`)
- [x] Token accepted from body (`captchaToken`) and header (`x-captcha-token`)

### Frontend Integration
- [x] `ReCaptchaProvider` wraps application with graceful degradation
- [x] `useCaptcha` hook available for token generation
- [x] `ProviderVerificationForm` calls `getToken('submit_verification')` before submission
- [x] Honeypot field implemented (hidden `website` input)
- [x] `captchaToken` included in verification API request body
- [x] Honeypot value included in API request (`website` field)
- [ ] Frontend error handling for CAPTCHA token generation failures
- [ ] Frontend error handling for CAPTCHA-related API errors (400 CAPTCHA_REQUIRED, 403 FORBIDDEN)
- [ ] User-facing message when blocked for suspicious activity

### Backend Testing
- [x] Unit tests for CAPTCHA middleware (`captcha.test.ts`)
- [x] Unit tests for honeypot middleware (`honeypot.test.ts`)
- [x] Mocked Google API responses for score testing
- [ ] Integration test for full flow (rate limit + honeypot + CAPTCHA + handler)

### Monitoring
- [x] Logging on verification failure (`CAPTCHA verification failed`)
- [x] Logging on low score (`CAPTCHA low score - possible bot`)
- [x] Logging on Google API errors (`CAPTCHA Google API error`)
- [x] Logging on fail-open events (`CAPTCHA FAIL-OPEN: Allowing request`)
- [x] Logging on fallback rate limit exceeded (`CAPTCHA FAIL-OPEN: Fallback rate limit exceeded`)
- [ ] Alerting on high failure rate (no alerting system configured)
- [ ] Metrics dashboard for CAPTCHA pass/fail rates

---

## Log Patterns to Watch

```
# Successful verification (score passes threshold)
[CAPTCHA] Verification passed, score: 0.9

# Low score blocked (possible bot)
[CAPTCHA] Low score - possible bot: 0.3
  → Watch for patterns: same IP, rapid-fire requests

# Google API error (network/timeout)
[CAPTCHA] Google API error - CAPTCHA verification unavailable
  → Watch for: sustained outages (may indicate Google service issue)

# Fail-open allowing request
[CAPTCHA] FAIL-OPEN: Allowing request with fallback rate limiting
  → Watch for: spike in volume (may indicate attackers exploiting outage)

# Fallback rate limit hit
[CAPTCHA] FAIL-OPEN: Fallback rate limit exceeded
  → Watch for: single IP hitting fallback limit (likely automated)

# No secret key configured (should not appear in production)
CAPTCHA not configured - RECAPTCHA_SECRET_KEY missing
  → CRITICAL in production: means CAPTCHA is completely disabled
```

---

## Recommendations

### Score Threshold Tuning

The current threshold of 0.5 is Google's recommended starting point. After the beta launch collects real traffic data:

1. **Monitor score distribution** -- If many legitimate users score 0.4-0.5, consider lowering to 0.3
2. **Monitor bot patterns** -- If bots consistently score 0.5+, consider raising to 0.7
3. **Per-action thresholds** -- Consider different thresholds for verify (0.5) vs vote (0.3) since votes have additional dedup protection

### Fail Mode Decision

Currently all endpoints use FAIL-OPEN. This is correct for a pre-beta consumer application where availability is the priority. Consider switching to FAIL-CLOSED for:
- No current candidates (all endpoints are user-facing)
- Future: Admin endpoints with financial impact should use FAIL-CLOSED

### Additional Recommendations

1. **Complete frontend error handling:** Show user-friendly messages when CAPTCHA fails (e.g., "Please try again" instead of raw error)
2. **Add invisible reCAPTCHA v2 fallback:** For borderline scores (0.3-0.5), present an interactive challenge instead of blocking outright
3. **Track CAPTCHA metrics in PostHog:** Pass rate, average score, API error rate as custom events
4. **Consider Enterprise reCAPTCHA:** If traffic grows significantly, Enterprise tier provides more granular scoring and eliminates some false positives

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│                    Frontend                          │
│                                                      │
│  ┌──────────────────┐   ┌────────────────────────┐  │
│  │ ReCaptchaProvider │   │ ProviderVerificationForm│  │
│  │ (wraps app)       │   │                        │  │
│  │                   │   │ 1. User fills form     │  │
│  │ Google reCAPTCHA  │◄──│ 2. getToken() called   │  │
│  │ v3 script loaded  │   │ 3. Token + body sent   │  │
│  └──────────────────┘   │ 4. Honeypot included   │  │
│                          └────────┬───────────────┘  │
│                                   │                  │
└───────────────────────────────────┼──────────────────┘
                                    │ POST /api/v1/verify
                                    │ { captchaToken, website, npi, ... }
                                    ▼
┌──────────────────────────────────────────────────────┐
│                    Backend                            │
│                                                      │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Rate Limiter │→ │ Honeypot │→ │ CAPTCHA        │  │
│  │ (10/hour)    │  │ Check    │  │ Middleware      │  │
│  │              │  │          │  │                │  │
│  │ 429 if over  │  │ 200 fake │  │ Token →        │  │
│  │              │  │ if bot   │  │ Google API →   │  │
│  │              │  │          │  │ Score check →  │  │
│  │              │  │          │  │ Allow/Block    │  │
│  └─────────────┘  └──────────┘  └───────┬────────┘  │
│                                          │           │
│                                          ▼           │
│                              ┌────────────────────┐  │
│                              │ Zod Validation     │  │
│                              │ → Sybil Check      │  │
│                              │ → Submit Handler   │  │
│                              └────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Google reCAPTCHA  │
              │   API               │
              │                     │
              │   POST siteverify   │
              │   → { success,     │
              │      score,        │
              │      action }      │
              └─────────────────────┘
```
