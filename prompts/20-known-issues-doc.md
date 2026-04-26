---
tags:
  - documentation
  - issues
type: prompt
priority: 2
updated: 2026-04-19
---

# Known Issues Document

## Purpose
Document known issues, limitations, and workarounds in VerifyMyProvider.

## Files to Review
- `packages/backend/src/routes/index.ts` (disabled routes)
- `packages/backend/src/routes/admin.ts` (disabled location enrichment)
- `packages/frontend/scripts/patch-next-swc.js` (SWC workaround)
- `packages/backend/prisma/schema.prisma` (schema limitations)
- `packages/frontend/src/app/location/` (non-functional page)

## Known Issues

### Architecture
1. ~~**Locations route disabled**~~ **RESOLVED** — `routes/locations.ts` is registered and active in `routes/index.ts`. Frontend `/location/[locationId]` page connects to working API endpoints.

2. **Location enrichment disabled** — Admin endpoints for location enrichment commented out in `admin.ts`. Depends on old Location model.

3. ~~**No staging environment**~~ **RESOLVED** — Staging pipeline exists (`.github/workflows/deploy-staging.yml`), triggers on `staging` branch, deploys to `-staging` Cloud Run services with max 2 instances.

### Development
4. **Next.js SWC on Windows ARM64** — Native SWC binaries incompatible with Node.js v24+ on Windows ARM64. Workaround: postinstall script patches SWC to use WASM fallback.

5. **OneDrive + node_modules** — OneDrive file sync corrupts native `.node` binaries. Workaround: WASM fallbacks.

6. **npm workspace hoisting** — `next` must NOT be in root `package.json` (causes version conflicts).

### Data
7. **NPI data partially imported** — Only 6 states imported (FL, AL, AK, AR, AZ, CA, ~2.1M providers). 44 states + territories remaining.

8. **City name quality (DATA-02)** — Typos, trailing state codes, and trailing punctuation in city names from NPI data. The previous cleanup script (`scripts/normalize-city-names.ts`) was archived on 2026-04-26 because it targets `providers.city`/`providers.state`, columns that moved to `practice_locations` in migration `20260114113939`. A replacement targeting `practice_locations.city` is required before DATA-02 can be resolved — the archived script also only covered 6 metros (NYC, LA, Chicago, Houston, Phoenix, Philadelphia) and would not have fixed the canonical Alabama/Birmingham examples even if it ran. See `scripts/archive/README.md` for what's worth lifting into the replacement.

9. **Provider addresses stale** — NPI data is self-reported and rarely updated. Some providers show outdated addresses.

### Security
10. ~~**No automated secret scanning**~~ — **Resolved (F-05, 2026-04-19).** `gitleaks` runs in `.github/workflows/security-scan.yml` on every push to `main`/`staging` and every PR targeting those branches, with full-history fetch (`fetch-depth: 0`) and the default ruleset extended via `.gitleaks.toml`. CodeQL (security-and-quality queries) covers JavaScript/TypeScript in parallel, including a weekly Monday 06:00 UTC schedule. A quick `grep` backstop for the most common secret patterns also runs in `test.yml`.

11. **No Cloud Armor / DDoS protection** — Cloud Run services are publicly accessible without WAF.

12. **`.env.example` incomplete** — Missing CAPTCHA settings, ADMIN_SECRET, REDIS_URL, ANTHROPIC_API_KEY, PostHog variables.

### Frontend
13. **No offline support** — No service worker or PWA manifest.

14. **No full accessibility audit** — Focus trap exists for modals but full keyboard navigation and screen reader testing not done.

### Resolved in 2026-04-19 session
- ~~**Staging DB shared with prod**~~ (IM-04) — `deploy-staging.yml` now targets `verifymyprovider-db-staging` via `DATABASE_URL_STAGING`.
- ~~**`prisma db push --accept-data-loss` in prod deploy**~~ (IM-04) — both deploy workflows now use `prisma migrate deploy` + PR-time `prisma migrate diff` job.
- ~~**Magic-link tokens stored plaintext**~~ (VMP-2026-005) — tokens now SHA-256 hashed before DB write; raw token only in the email URL.
- ~~**`POST /auth/refresh` only behind 200/hr default limiter**~~ (IM-10) — dedicated `refreshRateLimiter` (30/hr/IP).
- ~~**Admin endpoints only behind default limiter**~~ (IM-12) — dedicated `adminRateLimiter` (10/hr/IP) + IM-28 optional IP allowlist + IM-11 append-only audit table.
- ~~**Admin secret timing-leaked by length pre-check**~~ (IM-30) — both sides now hashed to 32 bytes before `timingSafeEqual`.
- ~~**Honeypot returned static `{ id: 'submitted' }`**~~ (IM-46) — now emits a fresh cuid-shaped id + full `POST /verify` response shape per request.
- ~~**Rate-limiter off-by-one between Redis and memory modes**~~ (I-11) — Redis path now checks before `ZADD`, both modes use pre-add count + `>= maxRequests`.
- ~~**Plaintext email in auth logs**~~ (IM-09) — `redactEmail()` helper redacts before every `logger.*` call.
- ~~**No AbortController timeout on Resend fetch / Anthropic SDK**~~ (IM-19) — 10s / 30s timeouts with distinct failure logging.
- ~~**No frontend error tracking**~~ (IM-05) — PostHog `$exception` capture via `trackException` helper, global `error` + `unhandledrejection` listeners, Next.js error boundary.
- ~~**No X-Request-ID propagation**~~ (IM-08) — frontend `apiFetch` generates a cuid-style id on every request, attached to `ApiError.requestId` and PostHog `request_id`.
- ~~**Cloud Run liveness/startup probes missing**~~ (IM-07) — both deploy workflows configure `/health` probes.
- ~~**No Redis health in `/health`**~~ (IM-20) — `checks.redis` added; degrades on `error`, not `not-configured`.
- ~~**Prisma slow queries invisible**~~ (IM-21) — queries over 500ms logged at `warn` with params redacted.
- ~~**Map pin under-count from NULL `address_hash`**~~ (IM-43) — two-pass query (hashed deduped, unhashed counted individually).
- ~~**Sitemap limited to 500 providers**~~ (IM-37) — Next.js `generateSitemaps()` shards to 10K URLs each, 100% coverage of provider table.
- ~~**No robots.txt, no canonical URLs, no GSC verification**~~ (IM-36, IM-39, IM-40, F-18) — all added.
- ~~**Frontend/backend API contract drift (`/meta/plan-types` 404, `totalCount` vs `total`, snake_case locations)**~~ (I-05, IM-38) — paths + casing fixed; contract test suite at `packages/backend/src/__tests__/api-contracts.test.ts` (IM-25) guards against recurrence.
- ~~**No Cloud Monitoring alerts / Scheduler / uptime checks as IaC**~~ (IM-06, IM-14, IM-32) — `infra/alerts/`, `infra/scheduler/`, `infra/uptime/` directories with idempotent `gcloud` scripts.
- ~~**No CI coverage gate**~~ (IM-16) — backend coverage thresholds enforced (28/20/25/28), per-metric summary on every PR.
- ~~**Frontend jest testEnvironment was `'node'`**~~ (IM-17) — switched to `'jsdom'` so future component tests work out of the box.
- ~~**Authenticated verifications not linked to userId**~~ (IM-44) — `verification_logs.user_id` + `vote_logs.user_id` + per-user unique constraint; strongest Sybil signal.

## Questions to Ask
1. Which issues should be prioritized for the next sprint?
2. Are any of these issues blocking user-facing features?
3. Should we add a public-facing status page?
4. Are there any issues discovered in production that aren't listed here?
5. Should we track these in GitHub Issues instead?

## Checklist
- [x] Architecture issues documented
- [x] Development environment issues documented
- [x] Data quality issues documented
- [x] Security gaps documented
- [x] Frontend limitations documented
- [ ] Severity/priority assigned to each issue
- [ ] GitHub Issues created for tracking
- [ ] Workarounds documented for all issues
