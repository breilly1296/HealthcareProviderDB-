# CAPTCHA Integration Review

**Last Updated:** 2026-04-16
**Status:** Implemented (frontend + backend) with documented gaps

---

## Configuration

| Setting | Value | File:Line | Notes |
|---------|-------|-----------|-------|
| Min Score | `0.5` | `config/constants.ts:52` | `CAPTCHA_MIN_SCORE` — tunable via env via middleware refactor only (currently hardcoded) |
| API Timeout | `5000 ms` | `config/constants.ts:57` | `CAPTCHA_API_TIMEOUT_MS`, enforced via `AbortController` in middleware |
| Fallback Max Requests | `3` | `config/constants.ts:62` | Used only when fail-open + Google API down |
| Fallback Window | `3600000 ms` (1 h) | `config/constants.ts:67` | |
| Fail Mode | `open` (default) | `middleware/captcha.ts:52` | Reads `CAPTCHA_FAIL_MODE` env; defaults to `open` |
| Environment bypass | `development` / `test` | `middleware/captcha.ts:121-123` | Skip without warning |
| Missing secret behavior | Log warn, allow | `middleware/captcha.ts:126-132` | Skips verification if `RECAPTCHA_SECRET_KEY` not set |

Frontend:
| Setting | Value | File:Line |
|---------|-------|-----------|
| Site key env | `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | `components/ReCaptchaProvider.tsx:11` |
| Library | `react-google-recaptcha-v3` | `hooks/useCaptcha.ts:3`, `components/ReCaptchaProvider.tsx:3` |

---

## Protected Endpoints

| Method | Path | Middleware order | File:Line |
|--------|------|------------------|-----------|
| POST | `/api/v1/verify` | `verificationRateLimiter` -> `honeypotCheck('website')` -> `verifyCaptcha` | `routes/verify.ts:58-63` |
| POST | `/api/v1/verify/:verificationId/vote` | `voteRateLimiter` -> `honeypotCheck('website')` -> `verifyCaptcha` | `routes/verify.ts:93-98` |

All other state-changing endpoints (auth, saved-providers, insurance-card) rely on CSRF + requireAuth rather than CAPTCHA — appropriate since they require an authenticated session.

---

## Checklist Results

### Implementation
| Item | Status | Evidence |
|------|--------|----------|
| Google reCAPTCHA v3 middleware | Verified | `middleware/captcha.ts:119-240` |
| Score threshold configurable | Partial | `CAPTCHA_MIN_SCORE` is a constant, not env-driven. Swap requires redeploy. |
| API timeout configured (5s) | Verified | `middleware/captcha.ts:149-158` via `AbortController` |
| Fail-open with fallback rate limiting | Verified | `middleware/captcha.ts:210-236` |
| Fail-closed mode available | Verified | `middleware/captcha.ts:199-208` (selected via env) |
| Dev/test bypass | Verified | `middleware/captcha.ts:121-123` |
| Logging for monitoring | Verified | `middleware/captcha.ts:163-169, 174-181, 191-197, 201-204, 219-225, 231-236` |

### Integration
| Item | Status | Evidence |
|------|--------|----------|
| Applied to verification submission | Verified | `routes/verify.ts:62` |
| Applied to voting endpoint | Verified | `routes/verify.ts:97` |
| Frontend sends token in request body | Verified | `components/ProviderVerificationForm.tsx:103, 120` — `getToken('submit_verification')` then body `captchaToken` |
| Frontend handles CAPTCHA errors | Partial | `ProviderVerificationForm.tsx:125-129` surfaces backend errors via `toast.error(err.message)`. Does not distinguish specific CAPTCHA error codes (`CAPTCHA_REQUIRED`, `CAPTCHA_FAILED`, `FORBIDDEN`). |
| Frontend graceful degradation when no site key | Verified | `components/ReCaptchaProvider.tsx:13-15` renders children without provider; `useCaptcha.ts:15-22` returns `undefined` token and the backend fail-opens |

### Monitoring
| Item | Status | Evidence |
|------|--------|----------|
| Log on verification failure | Verified | `middleware/captcha.ts:163-169` |
| Log on low score | Verified | `middleware/captcha.ts:174-181` |
| Log on Google API errors | Verified | `middleware/captcha.ts:191-197` |
| Alerting on high failure rate | Missing | No alerting/metrics pipeline visible in repo |

---

## Error Response Shapes (verified)

- **Missing token** -> `AppError.badRequest('CAPTCHA token required for verification submissions')` (`middleware/captcha.ts:138`). Backend emits standard 400 envelope.
- **Google says `!success`** -> `AppError.badRequest('CAPTCHA verification failed')` (`middleware/captcha.ts:169`). 400.
- **Low score (`< 0.5`)** -> `AppError.forbidden('Request blocked due to suspicious activity')` (`middleware/captcha.ts:181`). 403.
- **Fail-closed + API down** -> `AppError.serviceUnavailable(...)` (`middleware/captcha.ts:205`). 503.
- **Fail-open + fallback limit exhausted** -> `AppError.tooManyRequests(...)` (`middleware/captcha.ts:226`). 429.

---

## Findings (ranked by severity)

### HIGH

(none)

### MEDIUM

**M1 — Score threshold not env-configurable**
- `CAPTCHA_MIN_SCORE = 0.5` in `config/constants.ts:52`. To tune per environment (dev/prod) or respond to abuse waves requires a code change + deploy.
- **Mitigation**: Read from `process.env.CAPTCHA_MIN_SCORE` with the current value as fallback.

**M2 — Fallback rate limit is in-memory only**
- `fallbackStore: Map<string, ...>` in `middleware/captcha.ts:64` is process-local. Multi-instance Cloud Run deployments would allow up to 3 × instances requests / hour during Google outages.
- **Mitigation**: Route through the main `createRateLimiter` (which is Redis-aware) when available.

**M3 — Missing `RECAPTCHA_SECRET_KEY` silently bypasses verification**
- `middleware/captcha.ts:126-132` logs a warning and calls `next()`. In production, a misconfigured env would disable CAPTCHA entirely.
- **Mitigation**: In production, treat missing secret as startup failure (throw on module load) rather than silent bypass.

### LOW

**L1 — No action-name validation on reCAPTCHA v3**
- reCAPTCHA v3 includes an `action` in the token (set to `'submit_verification'` by frontend at `ProviderVerificationForm.tsx:103`). The middleware logs `data.action` (`captcha.ts:167, 179`) but does NOT verify the action matches the endpoint. An attacker could reuse a token from a lower-risk page for the verify endpoint.
- **Mitigation**: Require `data.action === 'submit_verification'` (for `POST /verify`) or `'vote_verification'` (for vote). Reject mismatches.

**L2 — No hostname validation**
- Google returns `hostname` in the response (`RecaptchaResponse.hostname`). Currently ignored. An attacker could potentially request tokens from a sibling domain (if keys shared) and use them here.
- **Mitigation**: Verify `data.hostname` matches `verifymyprovider.com` or its subdomains.

**L3 — Frontend error handling is generic**
- `ProviderVerificationForm.tsx:125-128` surfaces `err.message` without distinguishing CAPTCHA-specific codes. Users blocked by `FORBIDDEN` (403 low score) see a generic "Request blocked due to suspicious activity" — no retry guidance.
- **Mitigation**: Parse error code; on CAPTCHA errors, suggest the user refresh and retry, or solve a v2 challenge fallback.

**L4 — No reCAPTCHA v2 fallback for borderline scores**
- All scores below 0.5 are rejected outright. Users with low scores due to privacy extensions or VPNs have no recourse.
- **Mitigation**: For scores between 0.3 and 0.5, serve an interactive v2 checkbox as a fallback.

### INFORMATIONAL

**I1 — Middleware order is correct**
- Rate limiter first, then honeypot (cheap fake-success), then CAPTCHA (external API call). Minimizes Google API calls for already-blocked clients.

**I2 — Honeypot integration works with CAPTCHA**
- Bots that fill the hidden `website` field get a fake 200 response before CAPTCHA is called, preserving Google API quota.

---

## Answers to Prompt Questions

1. **Is the score threshold (0.5) appropriate?** Industry-standard baseline. Make it env-configurable (M1) and monitor the blocked rate before adjusting.

2. **Should FAIL-CLOSED be used for any endpoints?** Currently all endpoints use fail-open, which is appropriate for a consumer-facing crowdsourcing feature. Fail-closed would be appropriate for admin endpoints, but admin endpoints are protected by `X-Admin-Secret` and do not use CAPTCHA at all — correct.

3. **Is the frontend properly integrated?** Yes, with graceful degradation: `ReCaptchaProvider` wraps the app (`src/components/ReCaptchaProvider.tsx`), `useCaptcha()` generates tokens per-action, `ProviderVerificationForm` submits `captchaToken` in body (`line 120`). Missing: specific error-code handling (L3).

4. **Are legitimate users being blocked?** No logs available in this review. Deploy-time recommendation: alert when `CAPTCHA low score` log volume exceeds a threshold (e.g., >5% of submissions).

5. **Should we implement CAPTCHA challenges (v2 fallback)?** See L4. Useful for borderline scores to reduce false positives.

---

## Monitoring

### Recommended log patterns (all already implemented)

```
[CAPTCHA] verification passed (implicit via next())
[CAPTCHA] CAPTCHA low score - possible bot     -> captcha.ts:174-181
[CAPTCHA] CAPTCHA Google API error              -> captcha.ts:191-197
[CAPTCHA] FAIL-OPEN: Allowing request           -> captcha.ts:231-236
[CAPTCHA] FAIL-OPEN: Fallback rate limit exceeded -> captcha.ts:219-225
[CAPTCHA] FAIL-CLOSED: Blocking request         -> captcha.ts:201-204
```

### Metrics to wire up (not implemented)
- CAPTCHA pass rate (count where middleware calls `next()` without error / total)
- Average score (histogram of `data.score`)
- Google API error rate (count of catch branches)
- Fallback rate limit hit rate

---

## Recommendations (priority order)

1. **L1** — Verify reCAPTCHA `action` matches endpoint. Cheap change, material improvement.
2. **M3** — Treat missing `RECAPTCHA_SECRET_KEY` as a startup error in production.
3. **M1** — Move `CAPTCHA_MIN_SCORE` to env config.
4. **M2** — Replace in-memory fallback store with Redis-backed limiter (once multi-instance scaling starts).
5. **L2** — Validate hostname from Google response.
6. **L3** — Improve frontend error UX for CAPTCHA rejections.
7. **L4** — Add v2 fallback for borderline scores.
8. Alerting on elevated low-score / failure rates.
