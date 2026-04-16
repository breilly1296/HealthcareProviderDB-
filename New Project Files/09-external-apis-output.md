# External API Security Review — 2026-04-16

## Scope

Reviewed every outbound network integration in the VerifyMyProvider monorepo:
Google reCAPTCHA v3, Anthropic Claude, Resend (magic-link email), PostHog,
NPI Registry (pipeline only), and Redis (Memorystore target). Focus on auth,
timeouts, failure handling, SSRF exposure, response validation, and
observability.

## External API Inventory

### 1. Google reCAPTCHA v3 (Backend -> Google)

| Field | Value |
|-------|-------|
| File | `packages/backend/src/middleware/captcha.ts:47-48` |
| Endpoint | `https://www.google.com/recaptcha/api/siteverify` (hardcoded constant) |
| Auth | `RECAPTCHA_SECRET_KEY` env var (captcha.ts:47) |
| HTTP client | Native `fetch` + `AbortController` (captcha.ts:149-156) |
| Timeout | 5s via `CAPTCHA_API_TIMEOUT_MS` (config/constants.ts:57) |
| Min score | 0.5 (`CAPTCHA_MIN_SCORE`, constants.ts:52) |
| Skip conditions | `NODE_ENV=development|test` (captcha.ts:121); no secret configured (captcha.ts:126) |

Security considerations:
- [x] Secret in env only — no hardcoded value (captcha.ts:47)
- [x] Response validated: checks `success` (captcha.ts:162) and `score` (captcha.ts:173)
- [x] Timeout prevents hang (captcha.ts:149-158)
- [x] Client IP passed to Google for risk assessment (captcha.ts:145)
- [x] Fail-open/fail-closed behavior via `CAPTCHA_FAIL_MODE` (captcha.ts:52)
- [x] Fallback rate limit (3/hr) when Google API down (captcha.ts:89-106)
- [x] Structured logging on all error paths (captcha.ts:191-236)
- [x] URL is a module constant, not user-influenced — no SSRF
- [ ] Key rotation procedure not documented
- [ ] No alerting on high-volume FAIL-OPEN log events

### 2. Anthropic Claude API — Insurance Card OCR (Frontend route -> Anthropic)

| Field | Value |
|-------|-------|
| File | `packages/frontend/src/app/api/insurance-card/extract/route.ts:34-36` |
| SDK | `@anthropic-ai/sdk` v? — direct SDK call (route.ts:183) |
| Auth | `ANTHROPIC_API_KEY` (route.ts:35); loaded from Cloud Run Secret Manager (deploy.yml:239) |
| Model | `claude-haiku-4-5-20251001` (route.ts:23) |
| Max tokens | 1500 per request (route.ts:185) |
| Timeout | SDK default (no explicit timeout set) — RISK |
| Rate limit | 10/hr/IP via `checkRateLimit` (route.ts:228-233) |
| Payload guard | 10 MB image max (route.ts:26, 279) |
| Feature flag | Graceful 500 if `ANTHROPIC_API_KEY` missing (route.ts:316-323) |

Security considerations:
- [x] Key never sent to browser — server-side only
- [x] File size validated pre-API call (route.ts:279)
- [x] Base64 format validated (route.ts:296-304)
- [x] Magic-byte media-type detection (route.ts:43-77)
- [x] Rate limiting per-IP (route.ts:229)
- [x] Feature degrades gracefully without key (route.ts:316)
- [x] Retry logic on low confidence with alternative prompt (route.ts:378-403)
- [ ] No explicit request timeout on SDK call (route.ts:183) — could hang on slow Anthropic response
- [ ] No cost monitoring / per-IP daily spend cap
- [ ] `console.error/warn/log` used throughout (route.ts:214, 346-354, 472, 501) — not Pino, so structure differs from backend logs
- [ ] No circuit breaker on repeated Anthropic errors

### 3. Resend — Magic Link Email (Backend -> Resend)

| Field | Value |
|-------|-------|
| File | `packages/backend/src/services/authService.ts:20-22` |
| Endpoint | `https://api.resend.com/emails` (hardcoded) |
| Auth | `RESEND_API_KEY` env var (authService.ts:20) |
| HTTP client | Native `fetch` (authService.ts:109) |
| Timeout | None explicit — RISK |
| Fail behavior | Log + return; magic-link record still created (authService.ts:106-137) |

Security considerations:
- [x] Key server-side only, Cloud Run Secret Manager (deploy.yml:155)
- [x] Graceful log + skip if key missing (authService.ts:105-107)
- [x] Pino structured logging on error (authService.ts:135)
- [ ] No `AbortController` timeout — could stall event loop
- [ ] No retry on transient 5xx
- [ ] Response body not parsed for Resend-specific error codes

### 4. PostHog Analytics (Frontend browser -> PostHog)

| Field | Value |
|-------|-------|
| Files | `packages/frontend/src/components/PostHogProvider.tsx:9-23`, `packages/frontend/src/lib/analytics.ts` |
| Endpoint | `https://us.i.posthog.com` default (PostHogProvider.tsx:14) |
| Auth | `NEXT_PUBLIC_POSTHOG_KEY` — public by design |
| Autocapture | Disabled (PostHogProvider.tsx:18) |
| Session recording | Disabled (PostHogProvider.tsx:19) |
| Opt-in | `opt_out_capturing_by_default: true` (PostHogProvider.tsx:20) — requires explicit consent |

Security considerations:
- [x] Public key safe to expose (PostHog design)
- [x] Opt-in by default, not opt-out (PostHogProvider.tsx:20)
- [x] Sensitive URL params stripped before sending (PostHogProvider.tsx:34-37 removes npi, planId, name)
- [x] All tracking helpers in `lib/analytics.ts:50-107` use boolean flags — never raw PII
- [x] Explicit "NOT sending" comments document what is withheld (analytics.ts:62, 76, 91, 105)
- [ ] CookieConsent component exists (`packages/frontend/src/components/CookieConsent.tsx`) — wiring to PostHog opt-in not fully audited
- [ ] No user-controlled opt-out UI surfaced in analytics helpers

### 5. NPI Registry / NPPES (Backend scripts only — NOT runtime)

Used only by `scripts/import-npi-direct.ts`, `scripts/enrich-providers-nppes.ts`.
- Bulk CSV download from `https://download.cms.gov/nppes/NPI_Files.html`
- No live API calls from Express runtime.
- No auth required; no SSRF surface.

### 6. Redis / Memorystore (Backend -> Redis)

| Field | Value |
|-------|-------|
| File | `packages/backend/src/lib/redis.ts:33-106` |
| Client | `ioredis` (redis.ts:20) |
| Connection | `REDIS_URL` env (redis.ts:40) |
| Timeouts | `connectTimeout: 10000`, `commandTimeout: 5000` (redis.ts:52-53) |
| Retry | `maxRetriesPerRequest: 3` (redis.ts:51), exponential backoff capped 5 attempts (redis.ts:56-64) |
| Fallback | In-memory mode when REDIS_URL unset (redis.ts:41-44) |
| TLS | **Not configured** — REDIS_URL must use `rediss://` manually |

Security considerations:
- [x] Singleton pattern, one connection per process (redis.ts:24-38)
- [x] Connect/ready/error/close/reconnecting events all logged (redis.ts:72-98)
- [x] Graceful shutdown helper (redis.ts:134-148)
- [x] Fail-open behavior — requests allowed when Redis down (rateLimiter.ts:208-213)
- [ ] No TLS requirement enforced in code (redis.ts:49) — relies on operator setting `rediss://`
- [ ] No AUTH password verification — operator must bake into URL
- [ ] Not deployed in production yet — all rate limiting currently in-memory

## Cross-Cutting

### SSRF Assessment — LOW RISK
- reCAPTCHA URL: hardcoded constant (captcha.ts:48)
- Anthropic: SDK fixed endpoint
- Resend: hardcoded constant (authService.ts:22)
- PostHog: set at build time via `NEXT_PUBLIC_POSTHOG_HOST`
- `evidenceUrl` field on verification submissions is stored but never fetched server-side (verificationService.ts:412)

### API Key Management

| Key | Storage | Used By | File:Line |
|-----|---------|---------|-----------|
| `RECAPTCHA_SECRET_KEY` | Cloud Run Secret Manager | Backend | captcha.ts:47, deploy.yml:153 |
| `ANTHROPIC_API_KEY` | Cloud Run Secret Manager | Frontend route | route.ts:35, deploy.yml:239 |
| `RESEND_API_KEY` | Cloud Run Secret Manager | Backend | authService.ts:20, deploy.yml:155 |
| `JWT_SECRET` | Cloud Run Secret Manager | Backend | deploy.yml:154 |
| `INSURANCE_ENCRYPTION_KEY` | Cloud Run Secret Manager | Backend | deploy.yml:156 |
| `CSRF_SECRET` | Cloud Run Secret Manager | Backend | deploy.yml:157 |
| `ADMIN_SECRET` | Cloud Run Secret Manager | Backend | deploy.yml:152 |
| `DATABASE_URL` | Cloud Run Secret Manager | Backend | deploy.yml:151 |
| `NEXT_PUBLIC_POSTHOG_KEY` | GitHub Actions build arg | Frontend | deploy.yml:217 |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | GitHub Actions build arg | Frontend | (not yet in deploy.yml — gap) |

### Response Validation

- [x] reCAPTCHA: typed `RecaptchaResponse`, checked for `success` and `score` (captcha.ts:76-83, 162-182)
- [x] Claude: response parsed via `parseInsuranceCardResponse` (route.ts:376) with confidence metadata
- [x] Resend: status-code check (authService.ts:127-140), no body parse
- [ ] Redis: command errors caught but returned values not re-validated

## Ranked Findings

1. **HIGH** — Anthropic SDK call has no explicit client timeout (route.ts:183). If Anthropic hangs, Next.js route handler can stall until platform timeout. Fix: wrap with `AbortController` or use SDK `timeout` option.
2. **HIGH** — Resend `fetch` has no timeout (authService.ts:109). Fix: add `AbortController` with ~8s deadline.
3. **MEDIUM** — Insurance-card route uses `console.log/warn/error` (route.ts:214, 346, 472, 501) — bypasses Pino; frontend route logs are unstructured in Cloud Logging. Fix: use a shared logger or JSON-formatted `console.log({...})`.
4. **MEDIUM** — No cost monitoring for Anthropic (10/hr/IP still allows large image payloads; 10 MB * 10 = 100 MB/hr/IP input). Fix: add daily aggregate budget cap or per-IP token counter in Redis.
5. **MEDIUM** — `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is referenced by env docs but missing from deploy.yml build-args. Frontend currently has no way to load it in production.
6. **LOW** — Redis TLS not enforced in code (redis.ts:49); depends on operator passing `rediss://`. Fix: detect and warn in `getRedisClient()` when URL starts with `redis://` in production.
7. **LOW** — No retry logic on Anthropic transient failures (route.ts:217) — primary call returns 503 on first failure. Retry already exists for low-confidence responses but not for network errors.
8. **LOW** — reCAPTCHA missing `action` field verification. reCAPTCHA v3 recommends checking `data.action` matches the endpoint's expected action; we read it into logs (captcha.ts:166, 178) but don't enforce it.

## Checklist

- [x] Secrets in env / Secret Manager — captcha.ts:47, authService.ts:20, route.ts:35
- [x] Response validation on reCAPTCHA, Claude
- [x] Timeouts on reCAPTCHA, Redis
- [ ] Timeouts on Anthropic SDK call
- [ ] Timeouts on Resend fetch
- [x] Rate limiting on Anthropic route (10/hr/IP)
- [x] Fail-open Redis, configurable fail-mode CAPTCHA
- [x] SSRF-safe: all external URLs hardcoded or env-sourced
- [ ] Cost monitoring / alerts for paid APIs (Anthropic, Resend)
- [ ] Automated key rotation via Secret Manager versioning
- [ ] TLS enforcement helper for Redis in production
- [ ] `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` build-arg wired in deploy.yml

## Questions

1. Is `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` expected to be a build arg or runtime env? Currently inconsistent — cited in env docs but absent from `deploy.yml` frontend build-args.
2. What's the Anthropic monthly budget and how is overage monitored today?
3. Should Resend send failures queue to a DLQ, or is best-effort acceptable (current behavior)?
4. When will Redis/Memorystore be enabled in production? All rate limiters are currently process-local.
