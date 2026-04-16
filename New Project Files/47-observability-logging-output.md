# Observability Review — 2026-04-16

## Current State

- **Logging:** Pino (`packages/backend/src/utils/logger.ts:11-31`) with `LOG_LEVEL` env (default `info`), JSON output in production, pino-pretty in development. `pino-http` wraps every request (`packages/backend/src/middleware/httpLogger.ts:10-48`). Custom `requestLogger` middleware (`packages/backend/src/middleware/requestLogger.ts:36-83`) buffers the last 1000 request summaries in memory and logs each completion with request ID. No `console.*` calls in backend runtime code paths — only in `scripts/`. 100 `logger.*` call sites across 21 files.
- **Error tracking:** None. No Sentry / Bugsnag / PostHog-errors integration in either package (`grep -r Sentry` returns only docs). Frontend errors surface through `ErrorContext` (`packages/frontend/src/context/ErrorContext.tsx:29-99`) and `GlobalErrorBanner.tsx`, but are not reported off-device.
- **Metrics:** Structured Pino log events only. `/health` endpoint returns cache stats + memory usage (`packages/backend/src/index.ts:108-151`). No Prometheus, StatsD, or Cloud Monitoring custom metric emission.
- **Health checks:** `/health` (public, pre-rate-limiter, `packages/backend/src/index.ts:108-151`) checks DB via `SELECT 1` and returns status, cache stats, uptime, memory. Deploy smoke-test curls this at deploy time (`.github/workflows/deploy.yml:160-166`). No Redis or external-API health check.
- **Alerting:** None configured in-repo. No references to Cloud Monitoring alert policies, PagerDuty, OpsGenie, or equivalent.

## Strengths

- Consistent `logger` import across backend; no stray `console.log` in runtime paths.
- Request ID correlation wired end-to-end: `requestId` middleware (`packages/backend/src/middleware/requestId.ts:20-31`) generates or passes through `X-Request-ID`; pino-http picks it up via `genReqId` (httpLogger.ts:14); error responses always include `requestId` (`packages/backend/src/middleware/errorHandler.ts:94-265`).
- Error handler distinguishes Prisma error codes (P2002, P2025, P2003, P2024, P2010) and logs them with enough context (errorHandler.ts:134-215).
- PII discipline: `requestLogger` explicitly excludes IP, user-agent, and identifying info (`packages/backend/src/middleware/requestLogger.ts:7-10`). `stripVerificationPII` zeros sourceIp/userAgent/submittedBy before log or response (`packages/backend/src/services/verificationService.ts:329-332`).
- Captcha failures logged with structured context (ip, score, action, endpoint) (`packages/backend/src/middleware/captcha.ts:163-236`).
- Rate-limiter fail-open sets `X-RateLimit-Status: degraded` header + logs warning (`packages/backend/src/middleware/rateLimiter.ts:208-213, 273-278`).
- Redis connection lifecycle events all logged (`packages/backend/src/lib/redis.ts:72-98`).
- Graceful shutdown logs signal + progress (`packages/backend/src/index.ts:219-249`).

## Gaps (ranked by severity)

1. **CRITICAL** — No frontend error tracker. `ErrorContext` captures errors into React state only; any client-side exception, failed fetch, or render crash is lost. A user-reported bug has no server-visible trace. **Fix:** add Sentry (or PostHog `$exception` autocapture) to `packages/frontend/src/app/layout.tsx` and wire `ErrorContext.setError` to call `Sentry.captureException`. Also instrument `packages/frontend/src/app/error.tsx` (Next.js error boundary).

2. **HIGH** — No alerting on error-rate spikes or 5xx. Cloud Run emits stdout to Cloud Logging but there are no log-based metrics or alert policies in the repo (`.github/workflows/` has no Terraform/gcloud alert setup). **Fix:** define Cloud Monitoring alert policies (Terraform or `gcloud monitoring policies create`) for: (a) backend 5xx rate > 1% over 5 min, (b) `PrismaClientInitializationError` occurrences, (c) `CAPTCHA FAIL-OPEN` volume > 100/hour.

3. **HIGH** — Frontend-to-backend request correlation is broken. Backend generates or honors `X-Request-ID` (`packages/backend/src/middleware/requestId.ts:22`), but no frontend code sends it (`grep X-Request-ID packages/frontend` returns nothing). Each request gets a fresh ID, so a user-reported error in the browser can't be traced back to server logs. **Fix:** In `packages/frontend/src/lib/api.ts`, generate `crypto.randomUUID()` per request and add `X-Request-ID` header to all fetches; surface it in error toasts so users can report it.

4. **HIGH** — No health-check probe configured on Cloud Run. `deploy.yml:138-146` omits `--health-check-path`; Cloud Run's default TCP probe only verifies the port is open. A broken route or stuck DB connection pool would still pass. **Fix:** add `--startup-probe-http-path=/health` and `--liveness-probe-http-path=/health` to deploy.yml.

5. **MEDIUM** — `/health` doesn't check Redis. `packages/backend/src/index.ts:121-133` only pings DB. Once Memorystore is deployed, a bad Redis state won't appear in `/health`. **Fix:** add `await redis?.ping()` inside try/catch and include `checks.redis: 'healthy'|'unhealthy'|'not-configured'`.

6. **MEDIUM** — Frontend insurance-card route (`packages/frontend/src/app/api/insurance-card/extract/route.ts`) uses `console.log/warn/error` (lines 214, 346-354, 472, 501-505) instead of structured logging. Next.js API routes land in Cloud Logging but without Pino's JSON shape — correlation and filtering harder. **Fix:** use `JSON.stringify({...})` with `severity`/`requestId`/`message` fields, or import a shared logger that emits JSON.

7. **MEDIUM** — Prisma query logging disabled in production (`packages/backend/src/lib/prisma.ts:10-12`: only `['error']`). Slow queries go unseen. **Fix:** subscribe to `prisma.$on('query', ...)` with a duration filter (log only if > 500ms) to capture slow queries without flooding logs.

8. **MEDIUM** — Anthropic SDK call has no explicit timeout (`packages/frontend/src/app/api/insurance-card/extract/route.ts:183-205`). Hung external call = stuck request handler, no signal to observability. **Fix:** `new Anthropic({ apiKey, timeout: 15000 })`.

9. **MEDIUM** — Resend fetch has no timeout (`packages/backend/src/services/authService.ts:109-140`). Same risk as Anthropic. Fix: wrap with `AbortController`.

10. **MEDIUM** — In-memory request-log buffer (`packages/backend/src/middleware/requestLogger.ts:26-27`) is never exposed. It's computed in `getRequestStats()` (lines 100-135) but no route calls it. Either expose via `/admin/request-stats` or remove the buffer (it adds GC pressure without benefit).

11. **LOW** — Redis status exists (`getRedisStatus()` in `packages/backend/src/lib/redis.ts:118-128`) but isn't exposed via any endpoint. Add to `/health` or `/admin/health`.

12. **LOW** — No synthetic uptime checks referenced. Cloud Monitoring Uptime Checks could hit `/health` every 60 s and alert on failure. Not set up in-repo.

13. **LOW** — CORS blocks are logged at `warn` (`packages/backend/src/index.ts:81-83`). Good — but aggregated count is not tracked; a sudden spike (signal of a misconfigured client) would need log-based metric.

14. **LOW** — No request duration histogram. pino-http emits `responseTime` per request (httpLogger default) but p50/p95/p99 latency require Cloud Monitoring log-based metric or an exporter. Not configured.

15. **LOW** — `NODE_ENV=development` guard in `lib/prisma.ts:15` preserves the global instance across hot reloads, but also means Prisma's `global.prisma` is attached only in dev. In test, a new client is created per import — Jest warns about this pattern elsewhere.

## PII Discipline Spot-Check

- `logger.error({err, path, method}, 'Request error')` in errorHandler.ts:80-85 — includes error object, which may contain stack trace referencing request-body variables. Acceptable given no body logging elsewhere, but confirm Pino's default error serializer doesn't expand `req.body`.
- `stripVerificationPII` (verificationService.ts:329-332) omits sourceIp/userAgent/submittedBy in responses. Good.
- CAPTCHA logs IP (captcha.ts:164, 175, 202, 220, 232) — justified for abuse investigation but is PII. If GDPR scope expands, revisit.
- PostHog pageview strips `npi`, `planId`, `name` query params (`packages/frontend/src/components/PostHogProvider.tsx:34-37`). Good.

## Quick Wins

- [ ] Add `X-Request-ID` to every frontend fetch in `packages/frontend/src/lib/api.ts`.
- [ ] Add `--startup-probe-http-path=/health` to `deploy.yml:138-146`.
- [ ] Add Redis ping to `/health` once Redis is deployed.
- [ ] Replace `console.*` in `packages/frontend/src/app/api/insurance-card/extract/route.ts` with JSON-structured logs.
- [ ] Add timeouts: Anthropic SDK (route.ts:34), Resend fetch (authService.ts:109).
- [ ] Expose `getRedisStatus()` via admin health endpoint.
- [ ] Configure Cloud Monitoring Uptime Check pointing at backend `/health`.

## Longer Projects

- [ ] Integrate Sentry (or PostHog `$exception` capture) on frontend + backend.
- [ ] Define Cloud Monitoring alert policies as code (Terraform) for 5xx rate, DB init errors, CAPTCHA fail-open spikes, rate-limiter degraded events.
- [ ] Emit custom metrics (cache hit rate, verification submissions/hour, Anthropic latency) to Cloud Monitoring.
- [ ] Add Prisma slow-query logger with a 500ms threshold.
- [ ] Build a lightweight dashboard surfacing `/admin/retention/stats` + `/admin/cache/stats` + request-rate metrics for on-call visibility.
- [ ] Frontend correlation: render `X-Request-ID` in user-facing error toasts so bug reports include it.

## Checklist — Current State

- [x] Pino structured logging configured (`packages/backend/src/utils/logger.ts:11`)
- [x] Request ID correlation via `X-Request-ID` (backend only) (`packages/backend/src/middleware/requestId.ts`)
- [x] PII excluded from application logs (requestLogger.ts:7-10, verificationService.ts:329)
- [x] Cloud Run log aggregation (JSON pino -> stdout -> Cloud Logging)
- [x] Error-code-aware Prisma error handling (errorHandler.ts:134-215)
- [x] Graceful shutdown with logged signals (index.ts:219-249)
- [ ] Frontend error tracker
- [ ] Frontend request-ID propagation
- [ ] Alerting on 5xx / error rate
- [ ] Slow-query logging
- [ ] External API failure dashboards
- [ ] Synthetic uptime checks
- [ ] Redis health in `/health`
- [ ] Cloud Run health-check probe configured
- [ ] Structured logging in frontend API routes
