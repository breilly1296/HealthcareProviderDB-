# VerifyMyProvider CAPTCHA Integration Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

VerifyMyProvider uses Google reCAPTCHA v3 for bot protection on write endpoints. The integration includes score-based verification, fail-open mode with fallback rate limiting, and proper error handling.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CAPTCHA Flow                              │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ Frontend │    │ Google   │    │ Backend  │             │
│  │ (React)  │    │ reCAPTCHA│    │ (Express)│             │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘             │
│       │               │               │                     │
│  1. Load reCAPTCHA    │               │                     │
│       │──────────────→│               │                     │
│       │               │               │                     │
│  2. Execute (action)  │               │                     │
│       │──────────────→│               │                     │
│       │←──────────────│               │                     │
│       │    token      │               │                     │
│       │               │               │                     │
│  3. Submit form + token               │                     │
│       │───────────────────────────────→│                     │
│       │               │               │                     │
│       │               │  4. Verify    │                     │
│       │               │←──────────────│                     │
│       │               │──────────────→│                     │
│       │               │    score      │                     │
│       │               │               │                     │
│  5. Response (allow/deny)             │                     │
│       │←──────────────────────────────│                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RECAPTCHA_SECRET_KEY` | Prod | - | Google secret key |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Prod | - | Frontend site key |
| `CAPTCHA_MIN_SCORE` | No | 0.5 | Minimum passing score |
| `CAPTCHA_FAIL_MODE` | No | open | `open` or `closed` |
| `CAPTCHA_API_TIMEOUT_MS` | No | 5000 | API timeout |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | No | 3 | Fallback rate limit |

### Score Thresholds

| Score | Interpretation | Action |
|-------|----------------|--------|
| 0.9+ | Definitely human | Allow |
| 0.7-0.9 | Likely human | Allow |
| 0.5-0.7 | Uncertain | Allow (default threshold) |
| 0.3-0.5 | Likely bot | Deny |
| 0.0-0.3 | Definitely bot | Deny |

---

## Frontend Implementation

### React Hook

```typescript
// packages/frontend/src/hooks/useRecaptcha.ts

import { useCallback } from 'react';

declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

export function useRecaptcha() {
  const executeRecaptcha = useCallback(async (action: string): Promise<string | null> => {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

    if (!siteKey) {
      console.warn('[CAPTCHA] Site key not configured');
      return null;
    }

    return new Promise((resolve) => {
      window.grecaptcha.ready(async () => {
        try {
          const token = await window.grecaptcha.execute(siteKey, { action });
          resolve(token);
        } catch (error) {
          console.error('[CAPTCHA] Execute failed:', error);
          resolve(null);
        }
      });
    });
  }, []);

  return { executeRecaptcha };
}
```

### Script Loading

```typescript
// packages/frontend/src/app/layout.tsx

import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  return (
    <html>
      <head>
        {siteKey && (
          <Script
            src={`https://www.google.com/recaptcha/api.js?render=${siteKey}`}
            strategy="lazyOnload"
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Form Usage

```typescript
// packages/frontend/src/components/VerificationForm.tsx

export function VerificationForm({ npi, planId }: Props) {
  const { executeRecaptcha } = useRecaptcha();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      // Get CAPTCHA token immediately before submission
      const captchaToken = await executeRecaptcha('verification');

      const response = await api.submitVerification({
        ...data,
        captchaToken
      });

      toast.success('Verification submitted!');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={isSubmitting}>
        Submit Verification
      </button>
    </form>
  );
}
```

---

## Backend Implementation

### Middleware

```typescript
// packages/backend/src/middleware/captcha.ts

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const CAPTCHA_MIN_SCORE = parseFloat(process.env.CAPTCHA_MIN_SCORE || '0.5');
const CAPTCHA_FAIL_MODE = process.env.CAPTCHA_FAIL_MODE || 'open';
const CAPTCHA_TIMEOUT = parseInt(process.env.CAPTCHA_API_TIMEOUT_MS || '5000');

// Fallback rate limiter for degraded mode
const fallbackLimiter = new Map<string, { count: number; resetAt: number }>();
const FALLBACK_MAX = parseInt(process.env.CAPTCHA_FALLBACK_MAX_REQUESTS || '3');
const FALLBACK_WINDOW = 60 * 60 * 1000; // 1 hour

export async function verifyCaptcha(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

  // Skip in development
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  // Graceful degradation if not configured
  if (!RECAPTCHA_SECRET) {
    console.warn('[CAPTCHA] Not configured - allowing request');
    return next();
  }

  const captchaToken = req.body.captchaToken;

  // Token required in production
  if (!captchaToken) {
    return next(AppError.badRequest('CAPTCHA token required'));
  }

  try {
    // Verify with Google
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CAPTCHA_TIMEOUT);

    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: RECAPTCHA_SECRET,
        response: captchaToken,
        remoteip: req.ip || ''
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await response.json() as RecaptchaResponse;

    // Check success and score
    if (!data.success) {
      console.warn('[CAPTCHA] Verification failed:', data['error-codes']);
      return next(AppError.badRequest('CAPTCHA verification failed'));
    }

    if (data.score < CAPTCHA_MIN_SCORE) {
      console.warn(`[CAPTCHA] Low score: ${data.score} (IP: ${req.ip})`);
      return next(AppError.forbidden('Suspicious activity blocked'));
    }

    // Store score for logging
    req.captchaScore = data.score;
    console.log(`[CAPTCHA] Passed: score=${data.score}, action=${data.action}`);

    next();
  } catch (error) {
    return handleCaptchaError(req, res, next, error);
  }
}

function handleCaptchaError(
  req: Request,
  res: Response,
  next: NextFunction,
  error: Error
) {
  console.error('[CAPTCHA] API error:', error.message);

  if (CAPTCHA_FAIL_MODE === 'closed') {
    return next(AppError.serviceUnavailable(
      'Security verification temporarily unavailable'
    ));
  }

  // Fail-open with fallback rate limiting
  const clientIp = req.ip || 'unknown';
  const now = Date.now();

  let entry = fallbackLimiter.get(clientIp);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + FALLBACK_WINDOW };
    fallbackLimiter.set(clientIp, entry);
  }

  entry.count++;

  if (entry.count > FALLBACK_MAX) {
    return next(AppError.tooManyRequests(
      'Rate limit exceeded (security service unavailable)'
    ));
  }

  // Set degraded mode header
  res.setHeader('X-Security-Degraded', 'captcha-unavailable');
  res.setHeader('X-Fallback-RateLimit-Limit', FALLBACK_MAX.toString());
  res.setHeader('X-Fallback-RateLimit-Remaining', (FALLBACK_MAX - entry.count).toString());

  console.warn(`[CAPTCHA] Fail-open: allowing request (IP: ${clientIp}, count: ${entry.count})`);
  next();
}
```

### Types

```typescript
interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}
```

---

## Protected Endpoints

| Endpoint | Action Name | Purpose |
|----------|-------------|---------|
| POST /verify | `verification` | Submit verification |
| POST /verify/:id/vote | `vote` | Vote on verification |

### Route Configuration

```typescript
// packages/backend/src/routes/verify.ts

router.post('/',
  verificationRateLimiter,  // First: rate limiting
  verifyCaptcha,            // Second: CAPTCHA
  asyncHandler(async (req, res) => {
    // Handler
  })
);

router.post('/:verificationId/vote',
  voteRateLimiter,
  verifyCaptcha,
  asyncHandler(async (req, res) => {
    // Handler
  })
);
```

---

## Error Responses

### Missing Token

```json
{
  "success": false,
  "error": {
    "message": "CAPTCHA token required",
    "code": "BAD_REQUEST",
    "statusCode": 400
  }
}
```

### Low Score

```json
{
  "success": false,
  "error": {
    "message": "Suspicious activity blocked",
    "code": "FORBIDDEN",
    "statusCode": 403
  }
}
```

### Service Unavailable (fail-closed)

```json
{
  "success": false,
  "error": {
    "message": "Security verification temporarily unavailable",
    "code": "SERVICE_UNAVAILABLE",
    "statusCode": 503
  }
}
```

---

## Monitoring

### Log Patterns

```
# Successful verification
[CAPTCHA] Passed: score=0.9, action=verification

# Low score blocked
[CAPTCHA] Low score: 0.3 (IP: 1.2.3.4)

# API error with fail-open
[CAPTCHA] API error: timeout
[CAPTCHA] Fail-open: allowing request (IP: 1.2.3.4, count: 1)

# Not configured
[CAPTCHA] Not configured - allowing request
```

### Metrics to Track

| Metric | Alert Threshold |
|--------|-----------------|
| Average score | < 0.6 |
| Low score rate | > 10% |
| API error rate | > 5% |
| Fallback usage | > 1% |

---

## Testing

### Development Mode

CAPTCHA is skipped in development:
```typescript
if (process.env.NODE_ENV === 'development') {
  return next();
}
```

### Manual Testing

```bash
# Test without token (should fail in prod)
curl -X POST https://api.../verify \
  -H "Content-Type: application/json" \
  -d '{"npi":"1234567890","planId":"test"}'

# Test with token
curl -X POST https://api.../verify \
  -H "Content-Type: application/json" \
  -d '{"npi":"1234567890","planId":"test","captchaToken":"..."}'
```

---

## Conclusion

CAPTCHA integration is **production-ready**:

- ✅ reCAPTCHA v3 with score-based verification
- ✅ Graceful degradation (fail-open with fallback)
- ✅ Proper error handling
- ✅ Development mode bypass
- ✅ Comprehensive logging
- ✅ Timeout handling

The implementation balances security with user experience.
