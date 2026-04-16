---
tags:
  - observability
  - logging
  - monitoring
type: prompt
priority: 2
updated: 2026-04-16
role: architect
output_format: analysis
---

# Observability & Logging Architecture

## Task

Review the observability story for VerifyMyProvider end-to-end and identify gaps. This is **not** a security/audit-logging review (see [[05-audit-logging]] for that) — it's about operational visibility: Can we tell what's happening in production? Can we debug a user-reported issue? Can we detect outages before users do?

## Files to Review

### Logging
- `packages/backend/src/middleware/requestLogger.ts` — structured request logging (Pino)
- `packages/backend/src/lib/logger.ts` — logger instance, levels, destinations
- `packages/backend/src/middleware/errorHandler.ts` — error logging
- Any `logger.info/warn/error` call sites across services

### Error tracking
- Frontend: `packages/frontend/src/contexts/ErrorContext.tsx`
- Any Sentry / error-tracking integration (check `package.json`)

### Metrics / health
- `packages/backend/src/routes/health.ts` or equivalent health-check endpoint
- Cloud Run metrics dashboard references
- Any custom metrics emission (Prometheus, StatsD, Cloud Monitoring)

### Request correlation
- `X-Request-ID` propagation (request → log → response)
- Frontend → backend correlation (does the frontend attach request IDs?)

### External API monitoring
- `packages/backend/src/middleware/captcha.ts` — reCAPTCHA failures logged?
- Anthropic / Resend / Redis failures — how are they surfaced?

## Questions Claude should investigate

1. **Structured vs unstructured:** Is all logging via Pino (structured JSON for Cloud Logging)? Any lingering `console.log` in production paths?
2. **Log levels:** Is `LOG_LEVEL` respected in prod? Are debug logs stripped? Are errors consistently at `error` level and warnings at `warn`?
3. **Request correlation:** Can a single user request be traced across frontend → backend → DB? What ID chains it together?
4. **Error tracking:** Is there a frontend error tracker (Sentry, Bugsnag, PostHog errors)? If not, how do frontend-only errors get reported?
5. **Health checks:** Does Cloud Run have a health probe? What does it check (DB reachable, Redis reachable, external APIs reachable)?
6. **External API resilience:** When Anthropic/Resend/reCAPTCHA/Redis fails, is it logged with enough context to diagnose? Are there retries? Timeouts?
7. **Database observability:** Slow-query logging? Prisma query logs enabled in prod? Connection-pool metrics?
8. **Rate limiter observability:** Are Redis rate-limit failures (the "degraded" header case) visible in metrics, or only in logs?
9. **Alerting:** Is anything paging on 5xx spikes, error-rate spikes, DB connection failures? Or is the user the first alert?
10. **PII discipline:** Re-verify no IP/email/PII leaks into Pino logs even in error paths (stack traces can smuggle request bodies).

## Response format

Claude should produce a **gap analysis** with these sections:

```markdown
# Observability Review — [date]

## Current State
- **Logging:** [stack, level, format]
- **Error tracking:** [frontend/backend tools]
- **Metrics:** [what's emitted, where]
- **Health checks:** [endpoints, probes]
- **Alerting:** [what's configured]

## Gaps (ranked by severity)
1. **[CRITICAL]** [gap] — [why it matters] — [suggested fix]
2. **[HIGH]** [gap] — [why] — [fix]
3. **[MEDIUM]** [gap] — [why] — [fix]
...

## Strengths
- [things that are well-covered; keep short]

## Quick Wins
- [ ] [low-effort improvements, 1 line each]

## Longer Projects
- [ ] [bigger investments: error tracker integration, alerting setup, etc.]
```

Output should be ≤500 lines. Cite specific file paths + line numbers. Don't recommend tools without naming them.

## Checklist — known state

- [x] Pino structured logging configured
- [x] Request ID correlation via `X-Request-ID`
- [x] PII excluded from application logs
- [x] Cloud Run log aggregation (via structured JSON)
- [ ] Frontend error tracker — verify
- [ ] Alerting configured on 5xx / error rate
- [ ] Slow query logging
- [ ] External API failure dashboards
- [ ] Synthetic uptime checks
