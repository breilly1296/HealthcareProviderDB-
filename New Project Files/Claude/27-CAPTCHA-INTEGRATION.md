# CAPTCHA Integration -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/27-captcha-integration.md
**Status:** Backend fully implemented; frontend integration incomplete -- no reCAPTCHA token generation or error handling in the verification form.

---

## Findings

### Implementation (Backend Middleware)

- **Google reCAPTCHA v3 middleware created**
  Verified. `packages/backend/src/middleware/captcha.ts` exports `verifyCaptcha`, a complete Express middleware that validates tokens against `https://www.google.com/recaptcha/api/siteverify`.

- **Score threshold configurable**
  Verified. The `CAPTCHA_MIN_SCORE` constant is imported from `packages/backend/src/config/constants.ts` and set to `0.5`. The middleware compares `data.score` against this value at line 173.

- **API timeout configured (5 seconds)**
  Verified. `CAPTCHA_API_TIMEOUT_MS` is set to `5 * MS_PER_SECOND` (5000ms) in `constants.ts`. The middleware uses `AbortController` with `setTimeout` to enforce this timeout (lines 149-151).

- **Fail-open mode with fallback rate limiting**
  Verified. When `CAPTCHA_FAIL_MODE` is `'open'` (default), the catch block at line 210 calls `checkFallbackRateLimit(clientIp)` which enforces 3 requests per hour per IP. Headers `X-Security-Degraded`, `X-Fallback-RateLimit-Limit`, `X-Fallback-RateLimit-Remaining`, and `X-Fallback-RateLimit-Reset` are set on the response.

- **Fail-closed mode available**
  Verified. When `CAPTCHA_FAIL_MODE` is `'closed'`, line 205 returns a `serviceUnavailable` error with the message "Security verification temporarily unavailable."

- **Development/test mode bypass**
  Verified. Lines 121-123 check `NODE_ENV` and call `next()` immediately for development or test environments.

- **Logging for monitoring**
  Verified. The middleware uses structured logging via `logger` for:
  - Verification failure (line 163, `warn`)
  - Low score / possible bot (line 174, `warn`)
  - Google API error (line 191, `error`)
  - Fail-closed blocking (line 201, `warn`)
  - Fail-open fallback rate limit exceeded (line 220, `warn`)
  - Fail-open allowing request (line 231, `warn`)

### Integration (Route Registration)

- **Applied to verification submission (POST /api/v1/verify)**
  Verified. In `packages/backend/src/routes/verify.ts`, the `POST '/'` handler chains `verificationRateLimiter` then `verifyCaptcha` at line 57-58.

- **Applied to voting endpoint (POST /api/v1/verify/:verificationId/vote)**
  Verified. The `POST '/:verificationId/vote'` handler chains `voteRateLimiter` then `verifyCaptcha` at lines 91-92.

- **captchaToken in Zod schemas**
  Verified. Both `submitVerificationSchema` (line 29) and `voteSchema` (line 33) include `captchaToken: z.string().optional()`. The token is marked optional because in dev/test mode the middleware skips validation.

### Frontend Integration

- **Frontend sends token in request body**
  NOT IMPLEMENTED. `ProviderVerificationForm.tsx` does not import or use `react-google-recaptcha` or any reCAPTCHA library. The `handleSubmit` function (line 104) sends a JSON body with `npi`, `planId`, `phoneReached`, etc. but does NOT include a `captchaToken` field. The form also does not use the `/api/v1/verify` backend endpoint -- it posts to `/api/verifications` (a Next.js API route), which may or may not proxy to the backend.

- **Frontend handles CAPTCHA errors**
  NOT IMPLEMENTED. There is no handling for `CAPTCHA_REQUIRED`, `CAPTCHA_FAILED`, or `FORBIDDEN` error codes in the form. The only error handling is a generic `alert('Failed to submit verification. Please try again.')` at line 125.

- **`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` usage**
  NOT FOUND. No reference to `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` exists in the verification form component. No `<script>` tag or library loads the Google reCAPTCHA script.

### Configuration Constants

- **CAPTCHA_MIN_SCORE = 0.5**
  Verified. `constants.ts` line 52.

- **CAPTCHA_API_TIMEOUT_MS = 5000**
  Verified. `constants.ts` line 57.

- **CAPTCHA_FALLBACK_MAX_REQUESTS = 3**
  Verified. `constants.ts` line 62.

- **CAPTCHA_FALLBACK_WINDOW_MS = 3600000 (1 hour)**
  Verified. `constants.ts` line 67 (`MS_PER_HOUR`).

- **RATE_LIMIT_CLEANUP_INTERVAL_MS = 60000 (1 minute)**
  Verified. `constants.ts` line 76. Used in the `setInterval` cleanup in `captcha.ts` line 67.

### Monitoring

- **Logging on verification failure** -- Verified (line 163)
- **Logging on low score** -- Verified (line 174)
- **Logging on Google API errors** -- Verified (line 191)
- **Alerting on high failure rate** -- NOT IMPLEMENTED. There is no alerting mechanism; only log output.

### Security Considerations

- **Token accepted from body and header**: Line 134 reads `req.body.captchaToken || req.headers['x-captcha-token']`, providing flexibility for API consumers.
- **Client IP forwarded to Google**: The `remoteip` parameter is sent to Google at line 145, allowing Google to factor in IP reputation.
- **Secret key not hardcoded**: Read from `process.env.RECAPTCHA_SECRET_KEY` at line 47.
- **Graceful skip when unconfigured**: If `RECAPTCHA_SECRET` is falsy, the middleware logs a warning and continues (line 126-132). This is appropriate for development but should be verified in production.

### Potential Issues

- **In-memory fallback store**: The `fallbackStore` Map at line 64 is in-process memory. In a multi-instance deployment, each instance has its own store, making the 3-request-per-hour limit per-instance rather than global. This is acceptable for low-traffic scenarios but should be noted for scaling.
- **`setInterval` leak potential**: The cleanup interval at line 67 runs indefinitely. In serverless environments or during hot reloads, this could accumulate. Not a critical issue for a traditional Express server.

---

## Summary

The backend CAPTCHA implementation is thorough and well-architected. The middleware correctly implements Google reCAPTCHA v3 with configurable score thresholds, dual fail modes (open/closed), fallback rate limiting, AbortController-based timeouts, and structured logging. Both protected endpoints (`POST /verify` and `POST /verify/:id/vote`) correctly chain the middleware.

The critical gap is on the frontend. `ProviderVerificationForm.tsx` does not generate reCAPTCHA tokens, does not send them with requests, and does not handle CAPTCHA-related error responses. Additionally, the form submits to `/api/verifications` (a Next.js route) rather than the backend `/api/v1/verify` endpoint, so it is unclear whether the backend CAPTCHA middleware is actually invoked for form submissions.

---

## Recommendations

1. **Complete frontend reCAPTCHA integration**: Install `react-google-recaptcha-v3`, load the site key from `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, execute `grecaptcha.execute()` before form submission, and include the resulting token as `captchaToken` in the request body.

2. **Add CAPTCHA error handling in the form**: Handle HTTP 400 (`CAPTCHA_REQUIRED`, `CAPTCHA_FAILED`) and 403 (`FORBIDDEN`) responses with user-friendly messages rather than a generic alert.

3. **Verify request routing**: Confirm whether `/api/verifications` (the Next.js API route the form calls) proxies to the backend `/api/v1/verify` endpoint. If it does not, the CAPTCHA middleware is never invoked for user-submitted verifications.

4. **Consider Redis for fallback rate limiting**: If the backend runs multiple instances, the in-memory `fallbackStore` allows each instance to independently grant 3 requests per hour. Switch to a shared store (Redis) for accurate global rate limiting.

5. **Add alerting for high CAPTCHA failure rates**: The prompt checklist notes this is missing. Integrate with a monitoring service to alert when CAPTCHA API errors or low-score blocks exceed a threshold.

6. **Audit production `RECAPTCHA_SECRET_KEY` configuration**: The middleware silently skips CAPTCHA when the secret is not set. Ensure production deployments have this variable configured and consider failing loudly (refusing to start) if it is absent in production.
