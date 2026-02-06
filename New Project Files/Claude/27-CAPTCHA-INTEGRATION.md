# CAPTCHA Integration

**Last Updated:** 2026-02-06
**Status:** Backend COMPLETE, Frontend INCOMPLETE

---

## Configuration

| Setting | Value | Source | Notes |
|---------|-------|--------|-------|
| Score Threshold | 0.5 | `packages/backend/src/config/constants.ts` line 52 | Scores below this are blocked as likely bots |
| Fail Mode | open (default) | `CAPTCHA_FAIL_MODE` env var | Requests allowed with fallback rate limiting when Google API unavailable |
| API Timeout | 5,000ms | `packages/backend/src/config/constants.ts` line 57 | AbortController terminates request after 5s |
| Fallback Rate Limit | 3 req/hour | `packages/backend/src/config/constants.ts` line 62 | Applied when CAPTCHA API is unavailable and fail mode is open |
| Fallback Window | 1 hour | `packages/backend/src/config/constants.ts` line 67 | Window for fallback rate limiting |
| Cleanup Interval | 60 seconds | `RATE_LIMIT_CLEANUP_INTERVAL_MS` | Expired fallback rate limit entries cleaned up |

---

## Protected Endpoints

| Endpoint | Method | Rate Limit | CAPTCHA | Honeypot |
|----------|--------|------------|---------|----------|
| `/api/v1/verify` | POST | 10/hour | Yes | Yes (`website` field) |
| `/api/v1/verify/:verificationId/vote` | POST | 10/hour | Yes | Yes (`website` field) |

**Middleware chain for protected endpoints:**
```
verificationRateLimiter -> honeypotCheck('website') -> verifyCaptcha -> asyncHandler
```

---

## Backend Implementation Details

**File:** `packages/backend/src/middleware/captcha.ts` (241 lines)

### Token Extraction
The middleware accepts CAPTCHA tokens from two locations:
```typescript
const captchaToken = req.body.captchaToken || req.headers['x-captcha-token'];
```

### Environment Bypass
CAPTCHA is completely skipped in non-production environments:
```typescript
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  return next();
}
```

### Missing Secret Handling
If `RECAPTCHA_SECRET_KEY` is not configured, a warning is logged but the request proceeds:
```typescript
if (!RECAPTCHA_SECRET) {
  logger.warn({
    endpoint: req.path,
    method: req.method,
  }, 'CAPTCHA not configured - RECAPTCHA_SECRET_KEY missing, skipping verification');
  return next();
}
```

### Google API Call
- Uses native `fetch()` with `AbortController` for timeout
- Sends `secret`, `response` (token), and `remoteip` to Google's verify endpoint
- Handles both verification failure and low score separately

### Fail-Open Behavior (Default)
When Google API is unavailable:
1. Fallback rate limiting applied (3 req/hour per IP)
2. `X-Security-Degraded: captcha-unavailable` header set
3. `X-Fallback-RateLimit-*` headers set
4. Request is allowed if within fallback limit
5. Logged as warning for monitoring

### Fail-Closed Behavior
When `CAPTCHA_FAIL_MODE=closed`:
1. Returns 503 "Security verification temporarily unavailable"
2. All requests blocked until Google API recovers

---

## Frontend Implementation Status

**File:** `packages/frontend/src/components/ProviderVerificationForm.tsx` (800 lines)

### Current State (INCOMPLETE)

The frontend verification form does NOT currently integrate with reCAPTCHA. Specific gaps:

1. **No reCAPTCHA library imported** - The component does not use `react-google-recaptcha-v3` or any other reCAPTCHA client library.

2. **No CAPTCHA token generated** - The `handleSubmit` function (lines 94-129) sends a POST request without a `captchaToken` field:
   ```typescript
   // Current code (line 104-116):
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
       // MISSING: captchaToken
       // MISSING: website (honeypot field)
     }),
   });
   ```

3. **Wrong API URL** - Posts to `/api/verifications` instead of the correct backend URL. The backend expects `POST /api/v1/verify`. The frontend build uses `NEXT_PUBLIC_API_URL` build arg pointing to the backend Cloud Run URL.

4. **No error handling for CAPTCHA-specific errors** - The catch block (lines 123-128) shows a generic alert. It does not handle `CAPTCHA_REQUIRED`, `CAPTCHA_FAILED`, or `FORBIDDEN` error codes.

### What Needs to Be Done

1. Install `react-google-recaptcha-v3` in the frontend package
2. Add `<GoogleReCaptchaProvider>` wrapper component with `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
3. Use `useGoogleReCaptcha` hook in `ProviderVerificationForm`
4. Call `executeRecaptcha('verify')` before form submission
5. Include `captchaToken` in the POST body
6. Include `website: ''` honeypot field in the POST body
7. Fix the API URL to use the correct backend endpoint
8. Handle CAPTCHA-specific error responses (`CAPTCHA_REQUIRED`, `CAPTCHA_FAILED`, `FORBIDDEN`)

### Environment Variables Required

| Variable | Location | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Frontend build | reCAPTCHA site key (public, safe to expose) |
| `RECAPTCHA_SECRET_KEY` | Backend (GCP Secret Manager) | reCAPTCHA secret key (private, never exposed) |

---

## Error Responses

### Token Missing (400)
```json
{
  "error": {
    "message": "CAPTCHA token required for verification submissions",
    "code": "CAPTCHA_REQUIRED",
    "statusCode": 400
  }
}
```
**Note:** Uses `AppError.badRequest()` which returns the error via the global error handler with request ID.

### Verification Failed (400)
```json
{
  "error": {
    "message": "CAPTCHA verification failed",
    "statusCode": 400
  }
}
```

### Low Score / Bot Detected (403)
```json
{
  "error": {
    "message": "Request blocked due to suspicious activity",
    "statusCode": 403
  }
}
```

### Service Unavailable (503) - Fail-Closed Only
```json
{
  "error": {
    "message": "Security verification temporarily unavailable. Please try again in a few minutes.",
    "statusCode": 503
  }
}
```

### Fallback Rate Limit Exceeded (429) - Fail-Open Only
```json
{
  "error": {
    "message": "Too many requests while security verification is unavailable. Please try again later.",
    "statusCode": 429
  }
}
```

---

## Score Interpretation

| Score Range | Interpretation | Action | Backend Response |
|-------------|----------------|--------|-----------------|
| 0.9 - 1.0 | Very likely human | Allow | 200/201 |
| 0.7 - 0.9 | Likely human | Allow | 200/201 |
| 0.5 - 0.7 | Uncertain | Allow (at threshold) | 200/201 |
| 0.3 - 0.5 | Likely bot | Block | 403 |
| 0.0 - 0.3 | Very likely bot | Block | 403 |

---

## Monitoring

### Log Patterns

```
# Successful verification (score passes threshold)
[CAPTCHA] No specific success log - request simply proceeds to next middleware

# Low score blocked
CAPTCHA low score - possible bot (score: 0.3, threshold: 0.5, ip: x.x.x.x)

# Google API error - fail-open
CAPTCHA Google API error - verification unavailable (failMode: open)
CAPTCHA FAIL-OPEN: Allowing request with fallback rate limiting

# Google API error - fail-closed
CAPTCHA FAIL-CLOSED: Blocking request due to API unavailability

# Fallback rate limit exceeded
CAPTCHA FAIL-OPEN: Fallback rate limit exceeded (limit: 3, window: 1 hour)

# Token missing
(handled by AppError.badRequest - logged via global error handler)

# CAPTCHA not configured
CAPTCHA not configured - RECAPTCHA_SECRET_KEY missing, skipping verification
```

### Metrics to Track
- CAPTCHA pass rate (should be >90% for legitimate traffic)
- Average reCAPTCHA score (should be >0.7 for human traffic)
- Google API error rate (should be <1%)
- Fallback rate limit hits (should be 0 normally)
- Token-missing rate (indicates frontend not sending tokens)

---

## Checklist Status

### Implementation
- [x] Google reCAPTCHA v3 middleware created (`packages/backend/src/middleware/captcha.ts`)
- [x] Score threshold configurable (0.5 default in `config/constants.ts`)
- [x] API timeout configured (5 seconds via AbortController)
- [x] Fail-open mode with fallback rate limiting (3 req/hour)
- [x] Fail-closed mode available (`CAPTCHA_FAIL_MODE=closed`)
- [x] Development/test mode bypass
- [x] Structured logging for all outcomes via pino

### Integration
- [x] Applied to verification submission (`POST /api/v1/verify`)
- [x] Applied to voting endpoint (`POST /api/v1/verify/:verificationId/vote`)
- [ ] **Frontend does NOT send token in request body** (CRITICAL GAP)
- [ ] **Frontend does NOT handle CAPTCHA-specific errors**
- [ ] **Frontend uses wrong API URL**

### Monitoring
- [x] Logging on verification failure
- [x] Logging on low score
- [x] Logging on Google API errors
- [x] Logging on fallback rate limit hits
- [ ] No alerting on high failure rate
- [ ] No metrics dashboard for CAPTCHA events

---

## Questions Answered

### 1. Is the score threshold (0.5) appropriate?
**Answer:** 0.5 is Google's recommended threshold for most use cases. It is a reasonable default. For VerifyMyProvider, where the cost of blocking a legitimate user is high (lost verification data), keeping 0.5 is appropriate. If bot traffic is detected, the threshold can be raised to 0.7 via `CAPTCHA_MIN_SCORE` constant.

### 2. Should FAIL-CLOSED be used for any endpoints?
**Answer:** Currently all endpoints use FAIL-OPEN, which is appropriate for a user-facing application where availability is prioritized. For the admin endpoints, CAPTCHA is not applied (they use `X-Admin-Secret` header auth instead). Consider FAIL-CLOSED for financial or high-security endpoints if they are added in the future.

### 3. Is the frontend properly integrated?
**Answer:** **No.** The `ProviderVerificationForm.tsx` does not generate or send reCAPTCHA tokens. This is the most critical gap identified in this audit. In production, verification submissions will receive a 400 error with `CAPTCHA_REQUIRED` code unless:
- `RECAPTCHA_SECRET_KEY` is not set (CAPTCHA silently skipped with warning)
- `NODE_ENV` is not `production`

### 4. Are there any legitimate users being blocked?
**Answer:** Cannot determine yet - no verification traffic in production (pre-beta). Once launched, monitor the CAPTCHA logs for low-score events on what appear to be legitimate requests.

### 5. Should we implement CAPTCHA challenges?
**Answer:** Not recommended at this stage. reCAPTCHA v3 is invisible (no user interaction), which is ideal for the binary verification flow. Adding v2 challenges would break the "under 2 minutes" promise of the verification form. Consider v2 fallback only if v3 scores are consistently low for legitimate users.

---

## Recommendations

1. **CRITICAL:** Integrate `react-google-recaptcha-v3` in the frontend before beta launch
2. **CRITICAL:** Fix the API URL in `ProviderVerificationForm.tsx`
3. **HIGH:** Add CAPTCHA error handling in the frontend (show user-friendly messages for each error code)
4. **MEDIUM:** Add monitoring/alerting for CAPTCHA failure rates
5. **LOW:** Consider raising threshold from 0.5 to 0.7 if bot traffic is detected after launch
6. **LOW:** Evaluate whether FAIL-CLOSED should be used for admin endpoints (currently they use header-based auth, not CAPTCHA)
