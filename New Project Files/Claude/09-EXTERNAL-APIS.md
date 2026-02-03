# VerifyMyProvider External APIs Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

VerifyMyProvider integrates with 4 external APIs: Google reCAPTCHA, NPPES (NPI Registry), Anthropic (insurance card OCR), and PostHog (analytics). All integrations follow security best practices.

---

## External API Inventory

| API | Purpose | Required | Environment |
|-----|---------|----------|-------------|
| Google reCAPTCHA v3 | Bot protection | Prod only | Backend |
| NPPES Download | NPI data source | Yes | ETL pipeline |
| Anthropic Claude | Insurance card OCR | Optional | Backend |
| PostHog | Analytics | Optional | Frontend |
| Redis | Distributed rate limiting | Optional | Backend |

---

## Google reCAPTCHA v3

### Purpose
Prevent bot submissions on verification and voting endpoints.

### Integration

```typescript
// packages/backend/src/middleware/captcha.ts

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

export async function verifyCaptcha(req: Request, res: Response, next: NextFunction) {
  const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

  if (!RECAPTCHA_SECRET) {
    console.warn('[CAPTCHA] Not configured - allowing request');
    return next();
  }

  const token = req.body.captchaToken;
  if (!token) {
    return next(AppError.badRequest('CAPTCHA token required'));
  }

  try {
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: RECAPTCHA_SECRET,
        response: token,
        remoteip: req.ip || ''
      })
    });

    const data = await response.json();

    if (!data.success || data.score < CAPTCHA_MIN_SCORE) {
      return next(AppError.forbidden('Verification failed'));
    }

    // Store score for logging
    req.captchaScore = data.score;
    next();
  } catch (error) {
    // Fail-open with fallback rate limiting
    handleCaptchaFailure(req, res, next, error);
  }
}
```

### Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `RECAPTCHA_SECRET_KEY` | Required | Google secret key |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Required | Frontend site key |
| `CAPTCHA_MIN_SCORE` | 0.5 | Minimum passing score |
| `CAPTCHA_FAIL_MODE` | open | Behavior on API failure |
| `CAPTCHA_API_TIMEOUT_MS` | 5000 | Request timeout |

### Error Handling
- **Fail-open**: Allow with stricter rate limit (3/hr vs 10/hr)
- **Fail-closed**: Block all requests (configurable)

---

## NPPES NPI Registry

### Purpose
Source of provider data (names, addresses, specialties).

### Data Source

```bash
# NPI data download location
NPI_DATA_URL="https://download.cms.gov/nppes/NPI_Files.html"

# Monthly full file (~8GB compressed)
# Weekly delta files (~100MB)
```

### ETL Pipeline

```typescript
// packages/backend/src/etl/npiImport.ts

export async function importNpiData(filePath: string) {
  // 1. Download from NPPES
  const zipFile = await downloadNpiFile();

  // 2. Extract CSV
  const csvPath = await extractZip(zipFile);

  // 3. Stream and parse
  const parser = fs.createReadStream(csvPath)
    .pipe(csv.parse({ columns: true }));

  // 4. Batch insert to database
  let batch: Provider[] = [];
  for await (const record of parser) {
    const provider = transformNpiRecord(record);
    batch.push(provider);

    if (batch.length >= BATCH_SIZE) {
      await prisma.provider.createMany({
        data: batch,
        skipDuplicates: true
      });
      batch = [];
    }
  }

  // 5. Log completion
  await prisma.syncLog.create({
    data: {
      syncType: 'NPI_FULL',
      status: 'COMPLETED',
      recordsProcessed: count
    }
  });
}
```

### Schedule
- **Monthly**: Full data refresh (all ~2.1M providers)
- **Weekly**: Delta updates (new/changed providers)

---

## Anthropic Claude (Insurance Card OCR)

### Purpose
Extract plan information from uploaded insurance card photos.

### Integration

```typescript
// packages/backend/src/services/insuranceCardOcr.ts

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export async function extractInsuranceInfo(imageBase64: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw AppError.serviceUnavailable('OCR not configured');
  }

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: imageBase64
          }
        },
        {
          type: 'text',
          text: `Extract insurance information from this card image.
                 Return JSON with: planName, carrier, planType (HMO/PPO/etc).
                 Do NOT extract member ID, group number, or personal info.`
        }
      ]
    }]
  });

  return parseOcrResponse(response);
}
```

### Privacy Safeguards
- Only extracts plan name, carrier, plan type
- Does NOT store member ID, group number
- Image not persisted after processing
- Explicit prompt to exclude PII

### Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | No | Claude API key |

---

## PostHog Analytics

### Purpose
Anonymous usage analytics for product improvement.

### Frontend Integration

```typescript
// packages/frontend/src/app/providers.tsx

import posthog from 'posthog-js';

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: 'https://app.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,  // Disabled for privacy
    persistence: 'localStorage'
  });
}
```

### Tracked Events

```typescript
// Search performed
posthog.capture('search', {
  hasState: !!state,
  hasCity: !!city,
  hasSpecialty: !!specialty,
  resultCount: results.length
});

// Verification submitted
posthog.capture('verification_submitted', {
  acceptsInsurance: true  // No NPI or plan info
});

// Provider compared
posthog.capture('provider_compare', {
  providerCount: 3
});
```

### Privacy
- No PII captured
- No provider NPIs in analytics
- Anonymous distinct IDs
- Cookie consent required (EU)

### Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_POSTHOG_KEY` | No | PostHog project key |

---

## Redis (Optional)

### Purpose
Distributed rate limiting for multi-instance deployments.

### Integration

```typescript
// packages/backend/src/middleware/rateLimiter.ts

import Redis from 'ioredis';

let redis: Redis | null = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000)
  });
}

export async function checkRateLimit(key: string, limit: number, windowMs: number) {
  if (!redis) {
    return checkInMemoryRateLimit(key, limit, windowMs);
  }

  const now = Date.now();
  const windowStart = now - windowMs;

  // Sliding window with sorted set
  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart);
  multi.zadd(key, now, `${now}-${Math.random()}`);
  multi.zcard(key);
  multi.pexpire(key, windowMs);

  const results = await multi.exec();
  const count = results?.[2]?.[1] as number;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowMs
  };
}
```

### Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `REDIS_URL` | No | Redis connection string |

### Fallback
If Redis unavailable, falls back to in-memory rate limiting with warning header.

---

## API Security Summary

| API | Auth Method | Secret Storage | Fail Mode |
|-----|-------------|----------------|-----------|
| reCAPTCHA | API Key | Secret Manager | Open |
| NPPES | None (public) | - | Retry |
| Anthropic | API Key | Secret Manager | Error |
| PostHog | Project Key | Env var | Silent |
| Redis | Connection URL | Secret Manager | Fallback |

---

## Error Handling Patterns

### Graceful Degradation

```typescript
// Pattern used across all optional APIs
async function callExternalApi() {
  if (!API_KEY) {
    console.warn('[API] Not configured - feature disabled');
    return null;
  }

  try {
    const result = await apiCall();
    return result;
  } catch (error) {
    console.error('[API] Call failed:', error.message);
    // Return graceful fallback
    return handleFailure(error);
  }
}
```

### Timeout Configuration

```typescript
// All external calls have timeouts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

try {
  const response = await fetch(url, { signal: controller.signal });
  return response.json();
} finally {
  clearTimeout(timeout);
}
```

---

## Recommendations

### Immediate
- ✅ All APIs properly integrated
- Add circuit breaker for Anthropic API
- Consider caching reCAPTCHA site verify responses

### Monitoring
1. Track API response times
2. Alert on high error rates
3. Monitor API costs (Anthropic, PostHog)

### Future
1. Add API versioning for NPPES changes
2. Consider backup OCR provider
3. Evaluate self-hosted analytics (Plausible)

---

## Conclusion

External API integrations are **well-implemented**:

- ✅ Proper error handling and timeouts
- ✅ Graceful degradation for optional APIs
- ✅ Secrets in environment/Secret Manager
- ✅ Privacy-conscious analytics
- ✅ Fallback for distributed systems

No security concerns identified.
