# API Routes Security Review — Output

**Last Updated:** 2026-04-16
**Scope:** `packages/backend/src/routes/**`, `packages/backend/src/middleware/**`, `packages/backend/src/index.ts`

## Route Registry

Entry point is `packages/backend/src/routes/index.ts:1-24`. Eight sub-routers mounted under `/api/v1`:

| Prefix | Router | Router-level middleware | File |
|---|---|---|---|
| `/providers` | providersRouter | — | `packages/backend/src/routes/providers.ts:25` |
| `/plans` | plansRouter | — | `packages/backend/src/routes/plans.ts:16` |
| `/verify` | verifyRouter | — | `packages/backend/src/routes/verify.ts:20` |
| `/locations` | locationsRouter | — | `packages/backend/src/routes/locations.ts:15` |
| `/admin` | adminRouter | — | `packages/backend/src/routes/admin.ts:15` |
| `/auth` | authRouter | — | `packages/backend/src/routes/auth.ts:18` |
| `/saved-providers` | savedProvidersRouter | `csrfProtection` | `packages/backend/src/routes/index.ts:21` |
| `/me/insurance-card` | insuranceCardRouter | `csrfProtection` | `packages/backend/src/routes/index.ts:22` |

## Middleware Chain (`packages/backend/src/index.ts`)

Actual, as-implemented order:

1. `trust proxy, 1` — line 39 (required for Cloud Run client-IP rate limiting).
2. `requestIdMiddleware` — line 42.
3. `httpLogger` (pino-http) — line 45.
4. `helmet` with strict JSON-API CSP (`default-src 'none'`, `connect-src 'self'`) — lines 49-69.
5. `cors` with dynamic-origin function and credentials — lines 70-88.
6. Conditional `express.json` (100kb default; bypassed for `POST /api/v1/me/insurance-card/scan`) — lines 93-98.
7. `express.urlencoded({ limit: '100kb' })` — line 99.
8. `cookieParser` — line 102.
9. `extractUser` — line 105 (runs on all requests; never throws; sets `req.user` or null).
10. `GET /health` — line 108 **before** rate limiter so uptime probes pass.
11. `defaultRateLimiter` — line 154 (200/hr global).
12. `requestLogger` — line 157.
13. `GET /` API info — line 160.
14. `generalTimeout` (30s) applied on `/api/v1` — line 192.
15. `routes` mounted on `/api/v1` — line 195.
16. `notFoundHandler` — line 198.
17. `errorHandler` — line 201.

Graceful shutdown via `SIGINT`/`SIGTERM` with 10s force-exit timer — lines 217-252.

## Route Inventory

### Providers — `/api/v1/providers`
`packages/backend/src/routes/providers.ts`

| Method | Path | Auth | Rate limit | Timeout | Other | Line |
|---|---|---|---|---|---|---|
| GET | `/search` | none | searchRateLimiter (100/hr) | searchTimeout (15s) | Zod, 5-min cache w/ `X-Cache` header | 224 |
| GET | `/cities` | none | defaultRateLimiter | — | Zod (state len=2) | 309 |
| GET | `/:npi/colocated` | none | defaultRateLimiter | — | NPI+pagination Zod | 328 |
| GET | `/:npi/plans` | none | defaultRateLimiter | — | Zod w/ status, minConfidence | 404 |
| GET | `/map` | none | searchRateLimiter | — | bbox Zod, 5-min cache | 489 |
| GET | `/:npi` | none | defaultRateLimiter | — | NPI Zod | 532 |

Note: `/map` is declared **after** `/:npi/plans` but **before** `/:npi`. Because `/:npi` uses the generic npi regex `\d{10}` in schema-validation it won't match `map` as a 10-digit NPI — safe.

### Plans — `/api/v1/plans`
`packages/backend/src/routes/plans.ts`

| Method | Path | Auth | Rate limit | Line |
|---|---|---|---|---|
| GET | `/search` | none | searchRateLimiter | 30 |
| GET | `/grouped` | none | defaultRateLimiter | 59 |
| GET | `/meta/issuers` | none | defaultRateLimiter | 81 |
| GET | `/meta/types` | none | defaultRateLimiter | 99 |
| GET | `/:planId/providers` | none | searchRateLimiter | 121 |
| GET | `/:planId` | none | defaultRateLimiter | 174 |

Route order comment notes `/:planId/providers` must precede `/:planId` to avoid shadow — correctly ordered (line 119 comment, line 121 vs 174).

### Verify — `/api/v1/verify`
`packages/backend/src/routes/verify.ts`

| Method | Path | Auth | Rate limit | Extra | Line |
|---|---|---|---|---|---|
| POST | `/` | none | verificationRateLimiter (10/hr) | honeypotCheck, verifyCaptcha | 58 |
| POST | `/:verificationId/vote` | none | voteRateLimiter (10/hr) | honeypotCheck, verifyCaptcha | 93 |
| GET | `/stats` | none | defaultRateLimiter | — | 124 |
| GET | `/recent` | none | defaultRateLimiter | — | 137 |
| GET | `/:npi/:planId` | none | defaultRateLimiter | — | 157 |

Prompt claimed the inventory lists only CAPTCHA — actual code also applies **honeypot** on both POST endpoints (`packages/backend/src/middleware/honeypot.ts:11-25`), which silently 200's bot submissions.

POST `/` invalidates search cache asynchronously (non-blocking) — lines 73-76.

### Admin — `/api/v1/admin`
`packages/backend/src/routes/admin.ts`

Module-level `adminAuthMiddleware` applied per-route (not router-wide) — lines 24-58.
- Returns 503 if `ADMIN_SECRET` env unset (line 30).
- Timing-safe comparison via `timingSafeEqual` after length check (lines 44-51).

| Method | Path | Extra middleware | Line |
|---|---|---|---|
| POST | `/cleanup-expired` | adminTimeout (120s) | 71 |
| POST | `/cleanup-sessions` | adminTimeout | 110 |
| GET | `/expiration-stats` | — | 141 |
| GET | `/health` | — | 160 |
| POST | `/cache/clear` | — | 230 |
| GET | `/cache/stats` | — | 256 |
| GET | `/enrichment/stats` | — | 284 |
| POST | `/cleanup/sync-logs` | adminTimeout | 312 |
| GET | `/retention/stats` | — | 383 |
| POST | `/recalculate-confidence` | adminTimeout | 502 |
| POST | `/rotate-encryption-key` | adminTimeout | 561 |

Not in the prompt's inventory: `/cleanup-sessions` (line 110) and `/rotate-encryption-key` (line 561, which supports staged re-encryption under a new key with `INSURANCE_ENCRYPTION_KEY_PREVIOUS` fallback).

### Locations — `/api/v1/locations`
`packages/backend/src/routes/locations.ts`

| Method | Path | Auth | Rate limit | Line |
|---|---|---|---|---|
| GET | `/search` | none | searchRateLimiter | 48 |
| GET | `/health-systems` | none | defaultRateLimiter | 76 |
| GET | `/stats/:state` | none | defaultRateLimiter | 90 |
| GET | `/:locationId` | none | defaultRateLimiter | 104 |
| GET | `/:locationId/providers` | none | defaultRateLimiter | 123 |

Search requires `state` (non-optional) — line 22 Zod schema.

### Auth — `/api/v1/auth`
`packages/backend/src/routes/auth.ts`

| Method | Path | Auth | Rate limit | CSRF | Line |
|---|---|---|---|---|---|
| GET | `/csrf-token` | none | — | — | 74 |
| POST | `/magic-link` | none | magicLinkRateLimiter (5/15m) | csrfProtection | 84 |
| GET | `/verify` | none | — | — | 108 |
| POST | `/refresh` | none | — | csrfProtection | 137 |
| POST | `/logout` | requireAuth | — | csrfProtection | 159 |
| POST | `/logout-all` | requireAuth | — | csrfProtection | 177 |
| GET | `/me` | requireAuth | — | — | 194 |
| GET | `/export` | requireAuth | — | — | 211 |

Cookie settings (lines 40-58):
- `vmp_access_token` — HttpOnly, secure in prod, sameSite lax, path `/`, 15 min.
- `vmp_refresh_token` — HttpOnly, secure in prod, sameSite lax, path `/api/v1/auth`, 30 days.
- Domain `.verifymyprovider.com` in production (line 38).

`GET /verify` intentionally redirects on ALL error paths (never JSON) — lines 108-131.

### Saved Providers — `/api/v1/saved-providers`
`packages/backend/src/routes/savedProviders.ts`

Router-level `csrfProtection` (set at `routes/index.ts:21`). `csrfProtection` uses `ignoredMethods: ['GET','HEAD','OPTIONS']` so GETs are not blocked (`middleware/csrf.ts:26`).

| Method | Path | Auth | Line |
|---|---|---|---|
| GET | `/` | requireAuth | 22 |
| POST | `/` | requireAuth | 46 |
| DELETE | `/:npi` | requireAuth | 67 |
| GET | `/:npi/status` | **anonymous-tolerant** (returns `{saved:false}`) | 85 |

### Insurance Card — `/api/v1/me/insurance-card`
`packages/backend/src/routes/insuranceCard.ts`

Router-level `csrfProtection`. `POST /scan` has its own `express.json({ limit: '16mb' })` parser (line 113) because global parser is bypassed for that path (`index.ts:94-98`).

| Method | Path | Auth | Rate limit | Line |
|---|---|---|---|---|
| POST | `/scan` | requireAuth | scanRateLimiter 10/hr per user-or-IP | 111 |
| POST | `/save` | requireAuth | defaultRateLimiter | 158 |
| GET | `/` | requireAuth | defaultRateLimiter | 179 |
| PATCH | `/` | requireAuth | defaultRateLimiter | 198 |
| DELETE | `/` | requireAuth | defaultRateLimiter | 219 |

`scanRateLimiter` uses `req.user?.id || req.ip` as key (line 27) — prevents IP-shared users from blocking each other.
Image MIME allowlist `image/jpeg|png|webp|gif` (line 35).

### Infrastructure (not under `/api/v1`)

| Method | Path | Line | Notes |
|---|---|---|---|
| GET | `/health` | index.ts:108 | Before rate limiter; returns DB ping + cache stats; 503 on DB failure |
| GET | `/` | index.ts:160 | Endpoint directory (stale — lists `/meta/years` which does not exist in plans.ts) |

## Rate Limiter Configuration

`packages/backend/src/middleware/rateLimiter.ts`

Dual-mode: Redis sorted-set sliding window (line 189) or in-memory sliding window (line 117). Selected by presence of `REDIS_URL`. Redis path fails open with `X-RateLimit-Status: degraded` header (lines 208-213, 244-247).

Pre-configured limiters (all 1-hour window except magic-link):
- `defaultRateLimiter` — 200/hr (line 329)
- `verificationRateLimiter` — 10/hr (line 340)
- `voteRateLimiter` — 10/hr (line 351)
- `searchRateLimiter` — 100/hr (line 362)
- `magicLinkRateLimiter` — 5 / 15 min (line 373)

`createRateLimiter` factory logs mode selection once per limiter (lines 304-312).

## CSRF Protection

`packages/backend/src/middleware/csrf.ts` wraps `csrf-csrf`'s `doubleCsrf`:
- Secret from `CSRF_SECRET` env (throws if missing — line 11).
- Session identifier prefers `req.user.sessionId`, falls back to `req.ip`, then `'anonymous'` (line 15).
- Cookie `vmp_csrf` — httpOnly **false** (JS reads for double-submit pattern), size 64, sameSite lax, secure in prod, domain `.verifymyprovider.com` in prod.
- Ignored methods: GET, HEAD, OPTIONS.
- Token extracted from `x-csrf-token` header only (line 27).

## CAPTCHA (reCAPTCHA v3)

`packages/backend/src/middleware/captcha.ts`

- Skipped entirely in `development`/`test` (line 121).
- Skipped with warning if `RECAPTCHA_SECRET_KEY` missing (line 126).
- 400 if token missing (line 138), 400 if `data.success === false` (line 169), 403 if score below `CAPTCHA_MIN_SCORE` (line 181).
- On Google API outage: `CAPTCHA_FAIL_MODE` controls behavior (default `open`) — fail-open applies stricter 3/hr fallback rate limit with `X-Security-Degraded: captcha-unavailable` and `X-Fallback-RateLimit-*` headers (lines 211-229); fail-closed returns 503.
- 5s API timeout via AbortController (line 150).

## Auth Middleware

`packages/backend/src/middleware/auth.ts`

- `extractUser` (line 41) reads `vmp_access_token` cookie, verifies via `jose.jwtVerify`, looks up session in DB, checks `session.userId === userId && session.expiresAt > now`, populates `req.user`; any failure results in `req.user = null` and `next()` — never throws.
- Session `lastUsedAt` touched with `SESSION_ACTIVITY_DEBOUNCE_MS` debounce (lines 77-86).
- `requireAuth` (line 105) returns `AppError.unauthorized` if `req.user` is null.
- Typed via global Express `Request` augmentation (lines 9-15).

## Security Posture

| Control | Status | Where |
|---|---|---|
| Rate limit (global) | Implemented | `index.ts:154` |
| Rate limit (per-route) | Implemented | per-route |
| CAPTCHA on POST verify/vote | Implemented | `verify.ts:62, 97` |
| Honeypot on POST verify/vote | Implemented | `verify.ts:61, 96` |
| Zod input validation | All endpoints | per-route schemas |
| Admin auth: timing-safe secret | Implemented | `admin.ts:44-51` |
| JWT auth: `jose` verify + DB session check | Implemented | `auth.ts:56-74` |
| CSRF (double-submit) on mutating auth/me routes | Implemented | `csrf.ts`, `index.ts:21-22` |
| Helmet w/ strict CSP | Implemented | `index.ts:49-69` |
| CORS allowlist + credentials | Implemented | `index.ts:70-88` |
| Body size limit (100kb default, 16mb carved-out for scan) | Implemented | `index.ts:93-99`, `insuranceCard.ts:113` |
| Request timeout (30s general, 15s search, 120s admin) | Implemented | `middleware/requestTimeout.ts` |
| Request ID correlation | Implemented | `index.ts:42` |
| Graceful shutdown with force-exit timer | Implemented | `index.ts:217-252` |
| Encryption key rotation endpoint | Implemented | `admin.ts:561` |

## Drift from Prompt Inventory

- **Prompt missing routes:**
  - `GET /api/v1/providers/:npi/plans` (`providers.ts:404`).
  - `GET /api/v1/providers/map` (`providers.ts:489`).
  - `POST /api/v1/admin/cleanup-sessions` (`admin.ts:110`).
  - `POST /api/v1/admin/rotate-encryption-key` (`admin.ts:561`).
- **Honeypot** middleware applied on verify/vote endpoints not listed in prompt table (`verify.ts:61, 96`).
- **Request timeouts** (`generalTimeout`, `searchTimeout`, `adminTimeout`) not in prompt chain description.
- **Insurance-card `/scan` body-parse carve-out** in `index.ts:93-98` is subtle; prompt shows it but it is a real security-sensitive detail.
- **GET `/` endpoint directory is stale** — advertises `plans.meta.years` which doesn't exist (`index.ts:178`).

## Issues / Recommendations

1. **Stale `/` directory** (`index.ts:160-189`) lists `plans.meta.years` and omits `locations`, `auth`, `saved-providers`, `me/insurance-card`, `admin`. Either auto-generate from the mounted routers or remove, to prevent misleading consumers.
2. **`transformProvider` cast chain** (`providers.ts:61-216`) uses a large manual type widening; consider a concrete Prisma-generated input type to catch schema drift.
3. **Admin routes bind their own timeout per-route** rather than at router level — consistent but verbose. Consider `router.use(adminAuthMiddleware, adminTimeout)` once at top if no GET should skip the timeout.
4. **Plan search results are not cached** (unlike provider search which uses 5-min TTL) — consider parity if this becomes hot.
5. **`/:npi/status` route on saved-providers** returns `{saved:false}` for anonymous (`savedProviders.ts:85-99`) — deliberate, but it leaks that the NPI schema is valid without auth; acceptable for UX, document explicitly.
6. **Admin `X-Admin-Secret` is a single static secret** — consider adding IP allowlist (Cloud Armor) or mTLS for Cloud Scheduler calls to reduce blast radius.
7. **No endpoint requires auth for provider search / plan search** — intentional per product spec, but verify this is still correct pre-beta.
8. **CAPTCHA skipped in `development` AND `test`** — fine, but `NODE_ENV` must be set correctly in staging, else prod-like staging bypasses CAPTCHA.

## Questions from Prompt — Answers

1. *Keep `/` in sync with routes?* — No automation currently; it is already drifted. Recommend generating from router stacks or deleting.
2. *Pre-beta auth tightening?* — Saved providers, insurance card, and auth/me are already gated. Public search/detail are intentionally open; re-evaluate per abuse signals.
3. *IP allowlist for admin?* — Recommended; Cloud Armor or VPC connector ingress rule would pair well with timing-safe secret.
4. *Cache plan search?* — Yes, parity with `/providers/search` would be cheap.
5. *Expand locations?* — Current endpoints cover search/detail/providers/stats/health-systems. Consider exposing bounding-box map pins for locations like `providers.ts:489` does.
