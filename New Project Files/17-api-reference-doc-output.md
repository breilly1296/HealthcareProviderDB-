# VerifyMyProvider API Reference

**Last Updated:** 2026-04-16
**Base URL (prod):** `https://api.verifymyprovider.com`
**Versioning:** all resource endpoints are prefixed `/api/v1`.

---

## Conventions

### Success envelope
```json
{ "success": true, "data": { ... } }
```

### Error envelope
Every error returned by the platform uses this shape (see `middleware/errorHandler.ts`):
```json
{
  "success": false,
  "error": {
    "message": "Human readable description",
    "code": "MACHINE_CODE",
    "statusCode": 400,
    "requestId": "abc123...",
    "details": [ { "field": "state", "message": "Required" } ]
  }
}
```

### Pagination
Any list endpoint that uses `paginationSchema` accepts:

| Query param | Default | Max |
|-------------|---------|-----|
| `page`      | 1       | — |
| `limit`     | 20      | 100 |

Response includes:
```json
"pagination": { "total": 123, "page": 1, "limit": 20, "totalPages": 7 }
```

### Authentication
- **Public endpoints**: no auth required.
- **User endpoints** (`/auth/me`, `/saved-providers`, `/me/insurance-card/*`): `vmp_access_token` HttpOnly cookie (issued via magic link). CSRF token required for mutating calls except on `/auth/*`.
- **Admin endpoints** (`/admin/*`): `X-Admin-Secret` header with timing-safe comparison. Returns `503 ADMIN_NOT_CONFIGURED` if `ADMIN_SECRET` env var is unset.

### CORS
Allowed origins (enforced in `src/index.ts`):
- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- The Cloud Run frontend URL
- `http://localhost:3000` / `:3001` in development

### Rate limits
All limiters use a sliding-window over Redis (or in-memory fallback). The response includes:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1717123456   (unix seconds)
Retry-After: 3600              (only on 429)
```

---

## Health

### `GET /health`
Not rate-limited; registered BEFORE the default limiter.

```json
{
  "status": "ok",          // or "degraded"
  "timestamp": "2026-04-16T12:34:56.789Z",
  "version": "1.0.0",
  "uptime": 3600,
  "memory": { "heapUsed": 123, "heapTotal": 200, "unit": "MB" },
  "checks": { "database": "healthy" },
  "cache": { "hits": 42, "misses": 7, "size": 49, "mode": "redis", "hitRate": "85.7%" },
  "databaseResponseTime": "3ms"
}
```
Returns `503` if Postgres ping fails.

---

## Providers — `/api/v1/providers`

| Method | Path | Limiter | CAPTCHA | Notes |
|--------|------|---------|---------|-------|
| GET | `/search` | search (100/h) | – | 5-min cache (keyed by filters) |
| GET | `/cities` | default (200/h) | – | Required `state` query param |
| GET | `/map` | search (100/h) | – | Bounding-box query, lightweight pins |
| GET | `/:npi` | default (200/h) | – | Full provider detail + enrichment |
| GET | `/:npi/plans` | default (200/h) | – | Paginated plan acceptances |
| GET | `/:npi/colocated` | default (200/h) | – | Other providers at same address |

#### `GET /api/v1/providers/search`
Query params (any combination — all optional except at least one filter):
`state` (2-letter), `city`, `cities` (comma-separated, max 500 chars), `zipCode`, `specialty`, `specialtyCategory`, `name`, `npi` (10 digits), `entityType` (`INDIVIDUAL`|`ORGANIZATION`), `page`, `limit`.

#### `GET /api/v1/providers/:npi`
`npi` must be 10 digits. Returns `transformProvider()` shape including `cmsDetails`, `hospitals`, `insuranceNetworks`, `medicareIds`, `taxonomies`, `locations`, `planAcceptances`.

#### `GET /api/v1/providers/map`
Required: `north`, `south`, `east`, `west` (lat/lng). Optional: `specialty`, `specialtyCategory`, `entityType`, `limit` (default 200, max 500).

---

## Plans — `/api/v1/plans`

| Method | Path | Limiter | Notes |
|--------|------|---------|-------|
| GET | `/search` | search (100/h) | Filters: `issuerName`, `planType`, `search`, `state` |
| GET | `/grouped` | default (200/h) | Grouped by carrier for dropdowns |
| GET | `/meta/issuers` | default (200/h) | Unique issuer list |
| GET | `/meta/types` | default (200/h) | Plan type enum |
| GET | `/:planId/providers` | default (200/h) | Providers accepting a given plan |
| GET | `/:planId` | default (200/h) | Plan detail |

---

## Verification — `/api/v1/verify`

| Method | Path | Limiter | CAPTCHA | Notes |
|--------|------|---------|---------|-------|
| POST | `/` | verification (10/h) | Yes | Submit acceptance verification. Also invalidates search cache. |
| POST | `/:verificationId/vote` | vote (10/h) | Yes | `vote: "up" \| "down"` |
| GET | `/stats` | default (200/h) | – | Aggregate stats |
| GET | `/recent` | default (200/h) | – | `limit` (≤100), optional `npi`/`planId` filter |
| GET | `/:npi/:planId` | default (200/h) | – | Verifications for a specific pair |

#### `POST /api/v1/verify` body
```json
{
  "npi": "1234567890",
  "planId": "...",
  "acceptsInsurance": true,
  "acceptsNewPatients": true,
  "locationId": 42,
  "notes": "Confirmed by phone 2026-04-10",
  "evidenceUrl": "https://...",
  "submittedBy": "user@example.com",
  "captchaToken": "03AGdBq...",
  "website": ""            // honeypot — MUST be empty
}
```

---

## Locations — `/api/v1/locations`

| Method | Path | Limiter | Notes |
|--------|------|---------|-------|
| GET | `/search` | search (100/h) | Requires `state` |
| GET | `/health-systems` | default (200/h) | Filter by `state`/`city` |
| GET | `/stats/:state` | default (200/h) | |
| GET | `/:locationId` | default (200/h) | `locationId` is numeric PK |
| GET | `/:locationId/providers` | default (200/h) | Paginated |

---

## Authentication — `/api/v1/auth`

| Method | Path | Limiter | CSRF | Notes |
|--------|------|---------|------|-------|
| GET | `/csrf-token` | default | – | Issues the double-submit cookie + body token |
| POST | `/magic-link` | magic-link (5/15m) | – | Body `{ email }` — sends email via Resend |
| GET | `/verify?token=...` | default | – | Consumes token, sets `vmp_access_token` + `vmp_refresh_token` cookies, 302s to frontend |
| POST | `/refresh` | default | – | Uses `vmp_refresh_token` cookie |
| POST | `/logout` | default | – | Clears cookies, revokes session |
| POST | `/logout-all` | default | – | Revokes all sessions for user |
| GET | `/me` | default | – | Returns current user from cookie |
| GET | `/export` | default | – | GDPR-style data export |

Cookies (domain `.verifymyprovider.com` in prod):
- `vmp_access_token` — HttpOnly, Secure, `SameSite=Lax`, 15 min TTL, path `/`
- `vmp_refresh_token` — HttpOnly, Secure, `SameSite=Lax`, 30 d TTL, path `/api/v1/auth`

---

## Saved Providers — `/api/v1/saved-providers` (auth + CSRF)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | List current user's saved providers |
| POST | `/` | `{ npi }` |
| DELETE | `/:npi` | |
| GET | `/:npi/status` | `{ saved: true/false }` |

---

## Insurance Card — `/api/v1/me/insurance-card` (auth + CSRF)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/scan` | Base64 image → Claude OCR; uses route-level 16 MB JSON parser |
| POST | `/save` | Persist extracted fields (encrypted AES-GCM) |
| GET | `/` | Fetch current card (decrypted server-side) |
| PATCH | `/` | Partial update |
| DELETE | `/` | Delete stored card |

---

## Admin — `/api/v1/admin` (requires `X-Admin-Secret`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/cleanup-expired` | Delete expired verifications; `?dryRun=true&batchSize=1000` |
| POST | `/cleanup-sessions` | Delete expired sessions |
| GET | `/expiration-stats` | Expiration counts by bucket |
| GET | `/health` | Admin health incl. retention metrics |
| POST | `/cache/clear` | Flush cache layer |
| GET | `/cache/stats` | Hits/misses/size/mode |
| GET | `/enrichment/stats` | Enrichment source counts |
| POST | `/cleanup/sync-logs` | Delete old `sync_logs` rows |
| GET | `/retention/stats` | Retention summary by table |
| POST | `/recalculate-confidence` | Trigger decay recompute (Cloud Scheduler target) |
| POST | `/rotate-encryption-key` | Rotate insurance card AES keys (current → previous) |

All return `503 ADMIN_NOT_CONFIGURED` when `ADMIN_SECRET` is unset, `401` on wrong secret, `200` on success.

---

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Zod failure; `details` array included |
| `PAYLOAD_TOO_LARGE` | 413 | Body > 100 kb (or > 16 MB on card scan) |
| `FOREIGN_KEY_VIOLATION` | 400 | Prisma P2003 |
| `UNAUTHORIZED` (from AppError) | 401 | Missing/invalid auth token or admin secret |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` / `ROUTE_NOT_FOUND` | 404 | Resource or path not found |
| `DUPLICATE_ENTRY` | 409 | Prisma P2002 |
| `Too many requests` | 429 | Rate limit exceeded; `Retry-After` header |
| `ADMIN_NOT_CONFIGURED` | 503 | `ADMIN_SECRET` env var missing |
| `DATABASE_TIMEOUT` | 503 | Prisma P2024 connection pool timeout |
| `DATABASE_UNAVAILABLE` | 503 | Prisma init failure |
| `QUERY_ERROR` | 500 | Prisma P2010 raw query failure |
| `INTERNAL_ERROR` | 500 | Unclassified |

All error bodies include `requestId` for correlation with pino logs.

---

## Request Size Limits

| Route | Limit |
|-------|-------|
| Default JSON body | 100 kb |
| `POST /api/v1/me/insurance-card/scan` | 16 MB (base64 image) |
| URL-encoded body | 100 kb |

---

## Timeouts

| Scope | Timeout |
|-------|---------|
| All `/api/v1/*` | 30 s (`generalTimeout`) |
| `/providers/search`, `/providers/map` | 15 s (`searchTimeout`) |
| `/admin/*` (long-running) | 5 min (`adminTimeout`) |

---

## Headers Emitted by the API

| Header | Source | Purpose |
|--------|--------|---------|
| `X-Request-ID` | `requestId` middleware | Log correlation; accepted inbound too |
| `X-Cache` | Provider search cache | `HIT` / `MISS` |
| `X-RateLimit-Limit` / `-Remaining` / `-Reset` | rate limiter | See limits above |
| `X-RateLimit-Status: degraded` | rate limiter | Redis unavailable (fail-open) |
| `Retry-After` | 429 responses | Seconds until window resets |
| Helmet defaults | `helmet()` | CSP `default-src 'none'`, HSTS, X-Content-Type-Options, etc. |

---

## Open Gaps

- No OpenAPI / Swagger document generated from source.
- No stability annotations (all endpoints treated as stable).
- Response examples not committed in-repo (see the route tests in `__tests__/` for real fixtures).

---

## Related Prompts

- `06-api-routes` — route layout and implementation notes
- `08-rate-limiting` — limiter internals
- `37-error-handling` — every error class and mapping
- `38-admin-endpoints` — admin catalog detail
