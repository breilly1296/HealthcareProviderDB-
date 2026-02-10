# 27 - CAPTCHA Integration

## Status: IMPLEMENTED

## Overview

Google reCAPTCHA v3 is integrated on all state-changing public endpoints to prevent automated abuse. reCAPTCHA v3 runs invisibly in the background and returns a score indicating the likelihood that the request came from a human.

## Protected Endpoints

- `POST /verify` - Submit a new provider verification
- `POST /:id/vote` - Vote on an existing verification

## Flow

1. Frontend loads the reCAPTCHA v3 script with the site key
2. When the user submits a verification or vote, the frontend requests a token from Google (`grecaptcha.execute`)
3. The token is included in the request body sent to the backend
4. The backend validates the token by calling the Google reCAPTCHA verify API (`https://www.google.com/recaptcha/api/siteverify`)
5. If the returned score is >= 0.5, the request proceeds
6. If the score is < 0.5, the request is rejected as likely bot activity

## Configuration

| Variable                       | Default   | Description                                          |
|--------------------------------|-----------|------------------------------------------------------|
| `RECAPTCHA_SECRET_KEY`         | (required)| Server-side secret key from Google reCAPTCHA console |
| `CAPTCHA_FAIL_MODE`            | `open`    | Behavior when Google API is unreachable: `open` or `closed` |
| `CAPTCHA_MIN_SCORE`            | `0.5`     | Minimum score to allow the request (0.0 to 1.0)     |
| `CAPTCHA_API_TIMEOUT_MS`       | `5000`    | Timeout for the Google verify API call in milliseconds |
| `CAPTCHA_FALLBACK_MAX_REQUESTS`| `3`       | Max requests per window when in fallback mode        |
| `CAPTCHA_FALLBACK_WINDOW_MS`   | `3600000` | Fallback rate limit window (1 hour)                  |

## Fail Modes

### Fail-Open (default: `CAPTCHA_FAIL_MODE=open`)

When the Google reCAPTCHA API is unreachable or returns an error:

- Requests are **allowed** to proceed
- The response includes an `X-Security-Degraded: true` header
- Fallback rate limiting is activated (3 requests/hour per IP by default)
- The incident is logged for monitoring

This is the recommended mode for a consumer-facing application where availability is prioritized over strict bot blocking.

### Fail-Closed (`CAPTCHA_FAIL_MODE=closed`)

When the Google reCAPTCHA API is unreachable or returns an error:

- Requests are **rejected** with a `503 Service Unavailable` error
- No fallback rate limiting is needed since all requests are blocked

Use this mode only if bot prevention is more important than uptime for the protected endpoints.

## Score Interpretation

| Score Range | Interpretation       | Action |
|-------------|----------------------|--------|
| 0.9 - 1.0  | Very likely human    | Allow  |
| 0.7 - 0.9  | Likely human         | Allow  |
| 0.5 - 0.7  | Uncertain            | Allow  |
| 0.3 - 0.5  | Suspicious           | Block  |
| 0.0 - 0.3  | Likely bot           | Block  |

The threshold of 0.5 balances false positives (blocking real users) against false negatives (allowing bots). Adjust `CAPTCHA_MIN_SCORE` based on observed traffic patterns after launch.

## Error Responses

| Error Code       | HTTP Status | Description                                           |
|------------------|-------------|-------------------------------------------------------|
| `CAPTCHA_REQUIRED` | 400       | No CAPTCHA token was included in the request body     |
| `CAPTCHA_FAILED`   | 400       | Token was invalid or the score was below the threshold |
| `FORBIDDEN`        | 403       | Request blocked by CAPTCHA policy                     |

## Development and Testing

CAPTCHA verification is **skipped** in development and test environments:

- When `NODE_ENV` is `development` or `test`, the CAPTCHA middleware passes all requests through without validation
- This allows local development and automated testing without requiring valid reCAPTCHA tokens
- The skip behavior is logged at the debug level for transparency

## Frontend Integration

The frontend includes the reCAPTCHA v3 script tag with the public site key and calls `grecaptcha.execute(siteKey, { action: 'verify' })` or `grecaptcha.execute(siteKey, { action: 'vote' })` before submitting requests. The returned token is added to the request payload as `captchaToken`.
