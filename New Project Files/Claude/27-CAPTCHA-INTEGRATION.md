# CAPTCHA Integration

**Last Updated:** 2026-02-07
**Status:** Backend Implemented / Frontend NOT Integrated (Fail-Open Degraded Mode Active)

---

## Executive Summary

Google reCAPTCHA v3 is **fully implemented on the backend** as Express middleware, with configurable score thresholds, fail-open/fail-closed modes, and fallback rate limiting. However, the **frontend does not send CAPTCHA tokens** with any API requests. The `react-google-recaptcha-v3` package is not installed, the reCAPTCHA script is not loaded, and no component generates or transmits `captchaToken` values.

Because the backend is configured in fail-open mode and the GCP secret `RECAPTCHA_SECRET_KEY` is currently a placeholder value, the middleware's catch block fires on every request, allowing it through with stricter fallback rate limiting (3 requests/hour per IP). This means **bot protection is significantly degraded in production** -- the only active anti-bot defenses are honeypot fields and standard rate limiting.

---

## Configuration

| Setting | Value | Source File | Notes |
|---------|-------|-------------|-------|
| Score Threshold | `0.5` | `packages/backend/src/config/constants.ts` (line 52) | Scores below 0.5 are blocked as probable bots. Configurable but not exposed as an env var -- hardcoded constant. |
| Fail Mode | `open` | `packages/backend/.env.example` (line 56) | Requests allowed with fallback rate limiting when Google API is unavailable. |
| API Timeout | `5000ms` (5 seconds) | `packages/backend/src/config/constants.ts` (line 57) | Uses `AbortController` with `setTimeout` for request cancellation. |
| Fallback Max Requests | `3` per window | `packages/backend/src/config/constants.ts` (line 62) | Much stricter than normal verification limit of 10/hour. |
| Fallback Window | `3600000ms` (1 hour) | `packages/backend/src/config/constants.ts` (line 67) | Same as the standard rate limit window. |
| Cleanup Interval | `60000ms` (1 minute) | `packages/backend/src/config/constants.ts` (line 76) | Periodic cleanup of expired fallback rate limit entries. |
| reCAPTCHA Verify URL | `https://www.google.com/recaptcha/api/siteverify` | `packages/backend/src/middleware/captcha.ts` (line 48) | Standard Google reCAPTCHA v3 server-side verification endpoint. |

### Environment Variables

| Variable | Location | Current State | Notes |
|----------|----------|---------------|-------|
| `RECAPTCHA_SECRET_KEY` | Backend (GCP Secret Manager) | **Placeholder** (`your-recaptcha-secret-key-here`) | Causes Google API to return errors; fail-open mode allows requests through. |
| `CAPTCHA_FAIL_MODE` | Backend env | `open` (default) | Can be set to `closed` for high-security endpoints. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Frontend (Docker build arg) | **Not configured** | Declared in `.env.example` but not set in GitHub Secrets, not in Dockerfile build args, not referenced in frontend source code. |

---

## Protected Endpoints

Both write endpoints on the verification router apply the CAPTCHA middleware in the request pipeline:

### `POST /api/v1/verify` -- Submit Verification

**File:** `packages/backend/src/routes/verify.ts` (lines 58-87)

Middleware chain:
1. `verificationRateLimiter` -- 10 requests/hour per IP
2. `honeypotCheck('website')` -- Silent bot trap
3. `verifyCaptcha` -- reCAPTCHA v3 verification
4. Route handler (Zod validation + service call)

### `POST /api/v1/verify/:verificationId/vote` -- Vote on Verification

**File:** `packages/backend/src/routes/verify.ts` (lines 93-118)

Middleware chain:
1. `voteRateLimiter` -- 10 requests/hour per IP
2. `honeypotCheck('website')` -- Silent bot trap
3. `verifyCaptcha` -- reCAPTCHA v3 verification
4. Route handler (Zod validation + service call)

### Unprotected Endpoints (Read-Only)

These endpoints do NOT require CAPTCHA (by design -- they are read-only):
- `GET /api/v1/verify/stats`
- `GET /api/v1/verify/recent`
- `GET /api/v1/verify/:npi/:planId`

---

## Backend Implementation Deep Dive

### Middleware: `verifyCaptcha`

**File:** `packages/backend/src/middleware/captcha.ts` (241 lines)

The middleware follows this decision tree:

```
Request arrives
    |
    v
Is NODE_ENV === 'development' or 'test'?
    YES --> next() (skip entirely)
    NO  --> continue
    |
    v
Is RECAPTCHA_SECRET_KEY set?
    NO  --> log warning, next() (skip with degraded security)
    YES --> continue
    |
    v
Is captchaToken present (body or x-captcha-token header)?
    NO  --> 400 "CAPTCHA token required for verification submissions"
    YES --> continue
    |
    v
POST to Google siteverify API (with 5s timeout)
    |
    +--> SUCCESS: data.success === true?
    |       NO  --> 400 "CAPTCHA verification failed"
    |       YES --> Is score >= 0.5?
    |                   NO  --> 403 "Request blocked due to suspicious activity"
    |                   YES --> next() (pass)
    |
    +--> ERROR (timeout, network failure, Google outage):
            |
            v
        CAPTCHA_FAIL_MODE?
            'closed' --> 503 "Security verification temporarily unavailable"
            'open'   --> Check fallback rate limit (3/hour per IP)
                            Over limit  --> 429 "Too many requests while security..."
                            Under limit --> next() + X-Security-Degraded header
```

### Token Extraction

The middleware reads the CAPTCHA token from two locations (line 134):

```typescript
const captchaToken = req.body.captchaToken || req.headers['x-captcha-token'];
```

This dual-source approach supports both JSON body submissions and header-based token passing (useful for GET-like proxied requests).

### Zod Schema Integration

Both verification schemas declare `captchaToken` as optional:

```typescript
// Submit verification schema (line 30)
captchaToken: z.string().optional(),

// Vote schema (line 36)
captchaToken: z.string().optional(),
```

Making it optional prevents breaking existing clients that don't yet send tokens. The middleware itself enforces the requirement (unless in dev/test mode or CAPTCHA is unconfigured).

### Fallback Rate Limiting

When Google API fails in fail-open mode, the middleware applies its own stricter rate limit:

**File:** `packages/backend/src/middleware/captcha.ts` (lines 89-106)

```typescript
function checkFallbackRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `captcha-fallback:${ip}`;
  let entry = fallbackStore.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + CAPTCHA_FALLBACK_WINDOW_MS };
    fallbackStore.set(key, entry);
  }
  entry.count++;
  return {
    allowed: entry.count <= CAPTCHA_FALLBACK_MAX_REQUESTS,
    remaining: Math.max(0, CAPTCHA_FALLBACK_MAX_REQUESTS - entry.count),
    resetAt: entry.resetAt,
  };
}
```

This uses an in-memory `Map<string, { count: number; resetAt: number }>` with periodic cleanup every 60 seconds. The limit is 3 requests per hour per IP, compared to the normal verification rate limit of 10 per hour.

### Response Headers in Degraded Mode

When operating in fail-open mode, the middleware sets informational headers (lines 214-217):

```
X-Security-Degraded: captcha-unavailable
X-Fallback-RateLimit-Limit: 3
X-Fallback-RateLimit-Remaining: 2
X-Fallback-RateLimit-Reset: <unix timestamp>
```

---

## Frontend Integration Status

### Current State: NOT INTEGRATED

A thorough scan of the frontend source code (`packages/frontend/src/`) reveals:

1. **No `react-google-recaptcha-v3` package installed** -- Not in `package.json`, no imports found.
2. **No reCAPTCHA script loaded** -- No `<script>` tag for `recaptcha/api.js`, no `GoogleReCaptchaProvider` component.
3. **No `captchaToken` in API calls** -- The `verify.submit()` and `verify.vote()` functions in `packages/frontend/src/lib/api.ts` do not include `captchaToken` in request bodies.
4. **No `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` references** -- The env var is declared in `.env.example` but never accessed via `process.env` in frontend code.
5. **CSP headers prepared but commented out** -- `packages/frontend/next.config.js` has reCAPTCHA domains in commented-out CSP rules (lines 19-24).

### Frontend Components That Submit Verifications

Three frontend components submit verification data to the backend, and none send CAPTCHA tokens:

#### 1. `VerificationButton` (`packages/frontend/src/components/VerificationButton.tsx`)

Lines 79-87 -- Calls `verificationApi.submit()` without `captchaToken`:
```typescript
await verificationApi.submit({
  npi,
  planId: planId.trim(),
  acceptsInsurance,
  acceptsNewPatients: acceptsNewPatients ?? undefined,
  notes: notes.trim() || undefined,
  submittedBy: email.trim() || undefined,
  website: honeypot || undefined,  // honeypot only, no captchaToken
});
```

#### 2. `InsuranceList` (`packages/frontend/src/components/provider-detail/InsuranceList.tsx`)

Lines 197-204 -- The `VerificationModal` inside this component calls `verificationApi.submit()` without `captchaToken`:
```typescript
await verificationApi.submit({
  npi,
  planId: plan.planId,
  locationId: plan.locationId,
  acceptsInsurance,
  notes: fullNote || undefined,
  website: honeypot || undefined,  // honeypot only, no captchaToken
});
```

#### 3. `ProviderVerificationForm` (`packages/frontend/src/components/ProviderVerificationForm.tsx`)

Lines 104-116 -- This component uses a raw `fetch` call to `/api/verifications` (not the standard API client) and also does not send `captchaToken`:
```typescript
const response = await fetch('/api/verifications', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    npi: providerNpi,
    planId: planId,
    phoneReached: formData.contactedProvider,
    phoneCorrect: formData.phoneAccurate,
    acceptsInsurance: formData.acceptsSpecificPlan === 'YES',
    acceptsNewPatients: formData.acceptsSpecificPlan !== 'NOT_ACCEPTING_NEW',
    scheduledAppointment: false,
    // No captchaToken field
  }),
});
```

### API Client Type Definition

**File:** `packages/frontend/src/lib/api.ts` (lines 362-371)

The `VerificationSubmission` interface does NOT include `captchaToken`:

```typescript
export interface VerificationSubmission {
  npi: string;
  planId: string;
  locationId?: number;
  acceptsInsurance: boolean;
  acceptsNewPatients?: boolean;
  notes?: string;
  submittedBy?: string;
  website?: string; // honeypot field
  // captchaToken is MISSING
}
```

---

## Companion Bot Protection: Honeypot Fields

While CAPTCHA is not functionally active, the honeypot mechanism IS fully integrated as a complementary defense layer.

### Backend Middleware

**File:** `packages/backend/src/middleware/honeypot.ts` (25 lines)

```typescript
export function honeypotCheck(fieldName: string = 'website') {
  return (req: Request, res: Response, next: NextFunction) => {
    const honeypotValue = req.body?.[fieldName];
    if (honeypotValue) {
      logger.warn({ ip: req.ip, field: fieldName, path: req.path }, 'Honeypot triggered -- likely bot');
      return res.json({ success: true, data: { id: 'submitted' } });
    }
    next();
  };
}
```

Key design: Returns a fake success response (200 OK) so bots don't know they were caught. The honeypot field is named `website` -- a common bait for auto-fill bots.

### Frontend Integration

All three verification components include a hidden honeypot field:

- **VerificationButton** (line 383-394): Hidden input with `id="vb-website"`, positioned off-screen with `left: -9999px`, `opacity: 0`, `aria-hidden="true"`, `tabIndex={-1}`.
- **InsuranceList** (line 349-360): Same pattern with `id="website"`.

Both Zod schemas on the backend accept `website: z.string().optional()` to pass the honeypot value through validation.

---

## Deployment Infrastructure

### GCP Secret Manager

The `RECAPTCHA_SECRET_KEY` is configured as a GCP Secret Manager secret and referenced in both deploy workflows:

**File:** `.github/workflows/deploy.yml` (line 115)
```yaml
RECAPTCHA_SECRET_KEY=RECAPTCHA_SECRET_KEY:latest
```

**File:** `.github/workflows/deploy-staging.yml` (line 115)
```yaml
RECAPTCHA_SECRET_KEY=RECAPTCHA_SECRET_KEY:latest
```

Both map the secret from GCP Secret Manager's `latest` version to the Cloud Run service at deploy time.

### Frontend Build Args

The deploy workflows currently do NOT pass `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` as a Docker build arg. The `RECAPTCHA-SETUP.md` document (at `docs/RECAPTCHA-SETUP.md`) details the exact changes needed to add it.

### Monitoring Alerts

**File:** `packages/backend/scripts/setup-alerts.sh` (lines 149-181)

A Cloud Monitoring alert is configured for CAPTCHA failure spikes:
- **Alert name:** `CAPTCHA Failures Spike`
- **Threshold:** >50 CAPTCHA failures in 10 minutes
- **Filter:** Matches log entries containing "CAPTCHA.*failed", "CAPTCHA.*verification failed", "captcha.*invalid"
- **Documentation:** Includes troubleshooting guidance for bot attacks, Google outages, and frontend misconfiguration.

---

## Privacy and Legal

The privacy page (`packages/frontend/src/app/privacy/page.tsx`, line 307) already discloses Google reCAPTCHA usage:

> "Google reCAPTCHA (Bot Protection) -- Protects our verification forms from spam and abuse. Collects interaction data for risk analysis."

This disclosure should remain in place even before frontend integration is complete, as it establishes the intent and prepares for when the integration goes live.

---

## Error Responses

All CAPTCHA-related errors use the `AppError` class from `packages/backend/src/middleware/errorHandler.ts`:

### Token Missing (400)
Triggered when `captchaToken` is absent from both `req.body` and `x-captcha-token` header.
```json
{
  "success": false,
  "error": {
    "message": "CAPTCHA token required for verification submissions",
    "statusCode": 400
  }
}
```

### Verification Failed (400)
Triggered when Google returns `success: false` (invalid, expired, or reused token).
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
Triggered when score is below the threshold (default 0.5).
```json
{
  "success": false,
  "error": {
    "message": "Request blocked due to suspicious activity",
    "statusCode": 403
  }
}
```

### Service Unavailable -- Fail-Closed Mode (503)
Only triggered when `CAPTCHA_FAIL_MODE=closed` and Google API is unreachable.
```json
{
  "success": false,
  "error": {
    "message": "Security verification temporarily unavailable. Please try again in a few minutes.",
    "statusCode": 503
  }
}
```

### Fallback Rate Limit Exceeded (429)
Triggered in fail-open mode when a client exceeds 3 requests/hour during CAPTCHA API outage.
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

## Layered Rate Limiting Summary

The verification endpoints have three layers of rate limiting, each serving a different purpose:

| Layer | Limit | Window | Scope | Purpose |
|-------|-------|--------|-------|---------|
| `verificationRateLimiter` / `voteRateLimiter` | 10 requests | 1 hour | Per IP | Normal abuse prevention |
| CAPTCHA fallback rate limit | 3 requests | 1 hour | Per IP | Stricter limit when CAPTCHA is unavailable |
| `defaultRateLimiter` | 200 requests | 1 hour | Per IP | Applied to read-only endpoints |

The CAPTCHA fallback rate limit is **independent** of the standard rate limiters. A client could hit the standard rate limit (10/hour) before ever reaching the fallback limit (3/hour), or vice versa, depending on timing.

---

## Development and Test Mode

**File:** `packages/backend/src/middleware/captcha.ts` (lines 121-123)

```typescript
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  return next();
}
```

CAPTCHA verification is completely bypassed in development and test environments. This means:
- Local development works without reCAPTCHA keys.
- Integration tests do not need to mock the Google API.
- The middleware has zero performance impact in non-production environments.

---

## Log Patterns

The middleware uses structured logging via Pino (`packages/backend/src/utils/logger`). Key log patterns:

| Event | Level | Message Pattern | Fields |
|-------|-------|-----------------|--------|
| Module startup (production) | `info` | `CAPTCHA fail mode configured` | `failMode`, `description` |
| Secret not configured | `warn` | `CAPTCHA not configured - RECAPTCHA_SECRET_KEY missing` | `endpoint`, `method` |
| Verification failed | `warn` | `CAPTCHA verification failed` | `ip`, `errors`, `action`, `endpoint` |
| Low score (bot) | `warn` | `CAPTCHA low score - possible bot` | `ip`, `score`, `threshold`, `action`, `endpoint` |
| Google API error | `error` | `CAPTCHA Google API error - verification unavailable` | `ip`, `error`, `isTimeout`, `failMode`, `endpoint` |
| Fail-closed block | `warn` | `CAPTCHA FAIL-CLOSED: Blocking request due to API unavailability` | `ip`, `endpoint` |
| Fail-open allow | `warn` | `CAPTCHA FAIL-OPEN: Allowing request with fallback rate limiting` | `ip`, `remaining`, `limit`, `endpoint` |
| Fallback limit exceeded | `warn` | `CAPTCHA FAIL-OPEN: Fallback rate limit exceeded` | `ip`, `limit`, `window`, `endpoint` |

---

## Issues

### Critical: Frontend Does Not Send CAPTCHA Tokens

The frontend has no reCAPTCHA integration whatsoever. No package installed, no script loaded, no tokens generated or transmitted. The backend's CAPTCHA middleware is effectively bypassed on every request because:

1. In the current production state, `RECAPTCHA_SECRET_KEY` is a placeholder.
2. The middleware sends the placeholder to Google, which returns an error.
3. The error triggers the `catch` block.
4. Fail-open mode allows the request through with fallback rate limiting (3/hour/IP).

This means the actual protection against bots is:
- Honeypot fields (effective against simple bots, not sophisticated ones)
- Standard rate limiting (10 verifications/hour/IP)
- Fallback rate limiting (3 requests/hour/IP in degraded mode)

### Moderate: `ProviderVerificationForm` Uses Non-Standard API Path

The `ProviderVerificationForm` component (`packages/frontend/src/components/ProviderVerificationForm.tsx`, line 104) submits to `/api/verifications` instead of using the standard API client that hits `/api/v1/verify`. This means it would need separate CAPTCHA integration work and may bypass the backend's CAPTCHA middleware entirely if the `/api/verifications` route is a Next.js API route proxy rather than the Express backend.

### Minor: Fallback Rate Limit Store is In-Memory Only

The `fallbackStore` in `captcha.ts` uses an in-memory `Map`. In a horizontally-scaled Cloud Run deployment with multiple instances, each instance maintains its own independent fallback store. A bot could get 3 requests per instance per hour, multiplied by the number of instances.

### Minor: CSP Headers Not Active

The Content Security Policy headers in `next.config.js` that whitelist Google reCAPTCHA domains (`www.google.com`, `www.gstatic.com`) are commented out. These will need to be uncommented when the frontend integration is activated.

---

## Recommendations

### 1. Complete Frontend Integration (Priority: HIGH)

Follow the step-by-step guide at `docs/RECAPTCHA-SETUP.md`. The key tasks are:

1. Create reCAPTCHA v3 keys at Google's admin console.
2. Replace the placeholder `RECAPTCHA_SECRET_KEY` in GCP Secret Manager with the real secret.
3. Add `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` to GitHub Secrets.
4. Update deploy workflows to pass the site key as a Docker build arg.
5. Install `react-google-recaptcha-v3` in the frontend.
6. Add `GoogleReCaptchaProvider` to the app layout.
7. Generate and send `captchaToken` in all verification and vote API calls.
8. Add `captchaToken?: string` to the `VerificationSubmission` type in `api.ts`.
9. Uncomment CSP headers in `next.config.js`.

### 2. Normalize `ProviderVerificationForm` API Call (Priority: MEDIUM)

The `ProviderVerificationForm` component should use the standard `verificationApi.submit()` client instead of raw `fetch('/api/verifications')`. This ensures it benefits from retry logic, error handling, and (once integrated) CAPTCHA token inclusion.

### 3. Consider Fail-Closed for Production (Priority: LOW)

Once the reCAPTCHA keys are real and the frontend is integrated, evaluate switching to `CAPTCHA_FAIL_MODE=closed` for the verification endpoints. The fail-open mode is appropriate during the current incomplete-integration phase, but once fully live, fail-closed provides stronger security guarantees. Monitor Google API error rates for 2-4 weeks first to assess reliability.

### 4. Add reCAPTCHA v2 Fallback for Borderline Scores (Priority: LOW)

For scores between 0.3 and 0.5 (borderline), consider presenting an interactive reCAPTCHA v2 challenge instead of outright blocking. This reduces false positives for legitimate users on VPNs, shared networks, or privacy-focused browsers that tend to receive lower v3 scores.

### 5. Centralize Fallback Rate Limiting in Redis (Priority: LOW)

When Redis is configured, the CAPTCHA fallback rate limiter should use the same Redis-backed sliding window as the main rate limiters (from `packages/backend/src/middleware/rateLimiter.ts`) instead of an in-memory `Map`. This ensures consistent enforcement across horizontally-scaled instances.

---

## File Reference

| File | Purpose |
|------|---------|
| `packages/backend/src/middleware/captcha.ts` | Core reCAPTCHA v3 middleware (241 lines) |
| `packages/backend/src/config/constants.ts` | CAPTCHA threshold, timeout, and fallback constants |
| `packages/backend/src/middleware/honeypot.ts` | Companion honeypot bot detection (25 lines) |
| `packages/backend/src/middleware/errorHandler.ts` | `AppError` class used by CAPTCHA error responses |
| `packages/backend/src/middleware/rateLimiter.ts` | Standard rate limiters (verification: 10/hour, vote: 10/hour) |
| `packages/backend/src/routes/verify.ts` | Route definitions applying CAPTCHA middleware |
| `packages/frontend/src/lib/api.ts` | Frontend API client (missing `captchaToken` in types and calls) |
| `packages/frontend/src/components/VerificationButton.tsx` | Verification modal (no CAPTCHA, has honeypot) |
| `packages/frontend/src/components/provider-detail/InsuranceList.tsx` | Insurance verification modal (no CAPTCHA, has honeypot) |
| `packages/frontend/src/components/ProviderVerificationForm.tsx` | Multi-step verification form (no CAPTCHA, no honeypot, non-standard API path) |
| `packages/frontend/next.config.js` | CSP headers for reCAPTCHA domains (commented out) |
| `packages/frontend/src/app/privacy/page.tsx` | Privacy disclosure of reCAPTCHA usage |
| `docs/RECAPTCHA-SETUP.md` | Step-by-step frontend integration guide |
| `packages/backend/scripts/setup-alerts.sh` | Cloud Monitoring alert for CAPTCHA failure spikes |
| `.github/workflows/deploy.yml` | Production deploy (passes `RECAPTCHA_SECRET_KEY` to Cloud Run) |
| `.github/workflows/deploy-staging.yml` | Staging deploy (same secret mapping) |
| `.env.example` | Root env template (documents all CAPTCHA env vars) |
| `packages/backend/.env.example` | Backend env template (detailed fail-mode documentation) |
