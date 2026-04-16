# Error Handling Review — Output

**Last Updated:** 2026-04-16
**Scope:**
- `packages/backend/src/middleware/errorHandler.ts`
- `packages/backend/src/middleware/requestTimeout.ts`
- `packages/backend/src/utils/responseHelpers.ts`
- `packages/frontend/src/lib/errorUtils.ts`
- `packages/frontend/src/lib/api.ts`
- `packages/frontend/src/context/ErrorContext.tsx`
- `packages/frontend/src/app/error.tsx`

## Backend

### `AppError` class
`packages/backend/src/middleware/errorHandler.ts:7-57`.

Constructor signature differs from prompt sketch:
```ts
constructor(
  message: string,
  statusCode: number = 500,
  options: { isOperational?: boolean; code?: string } = {}
)
```
Factory methods: `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `tooManyRequests`, `serviceUnavailable`, `internal` (lines 26-56). `internal` uniquely sets `isOperational: false`. All factories accept an optional `code` argument (e.g., `AppError.badRequest(msg, 'EXTRACTION_FAILED')`). Uses `Error.captureStackTrace(this, this.constructor)` (line 23).

### `asyncHandler`
`packages/backend/src/middleware/errorHandler.ts:62-68`. Generic wrapper that catches and forwards async route-handler rejections to `next`:
```ts
export function asyncHandler<T>(
  fn: (req, res, next) => Promise<T>
): RequestHandler { ... }
```

### Global `errorHandler`
`packages/backend/src/middleware/errorHandler.ts:73-251`. Logs every error via `logger.error({ requestId, err, path, method }, 'Request error')` (lines 80-85) then dispatches by type:

| Detected type | Status | Code | Line |
|---|---|---|---|
| `AppError` | `err.statusCode` | `err.code` | 88-99 |
| `ZodError` (by `err.name`) | 400 | `VALIDATION_ERROR` (with `details` array of `{field, message}`) | 102-118 |
| `PayloadTooLargeError` / `type === 'entity.too.large'` | 413 | `PAYLOAD_TOO_LARGE` | 121-131 |
| `PrismaClientKnownRequestError` P2002 | 409 | `DUPLICATE_ENTRY` | 137-148 |
| P2025 | 404 | `NOT_FOUND` | 150-161 |
| P2003 | 400 | `FOREIGN_KEY_VIOLATION` | 163-174 |
| P2024 (pool timeout) | 503 | `DATABASE_TIMEOUT` (logs with prismaCode) | 176-192 |
| P2010 (raw query failure) | 500 | `QUERY_ERROR` (message redacted in prod) | 194-214 |
| `PrismaClientInitializationError` | 503 | `DATABASE_UNAVAILABLE` (logs CRITICAL) | 217-234 |
| default | 500 | `INTERNAL_ERROR` (message redacted in prod, line 238-240) | 236-250 |

All responses include `requestId: req.id` in the error envelope (provided by `requestIdMiddleware`).

### `notFoundHandler`
`packages/backend/src/middleware/errorHandler.ts:256-266`. 404 + `ROUTE_NOT_FOUND` with request ID.

### Request timeouts
`packages/backend/src/middleware/requestTimeout.ts:9-44`. Emits 408 `REQUEST_TIMEOUT` with request ID. Exports:
- `generalTimeout` — 30 s (applied to `/api/v1`).
- `searchTimeout` — 15 s (`providers.ts:226`).
- `adminTimeout` — 120 s (admin route handlers).

### Response helpers
`packages/backend/src/utils/responseHelpers.ts:22-61`. `buildPaginationMeta`, `sendSuccess`, `sendPaginatedSuccess`. Every success envelope is `{ success: true, data: <...> }`.

## Error Response Envelopes

Standard error body (example `AppError`, `errorHandler.ts:88-99`):
```json
{
  "success": false,
  "error": {
    "message": "...",
    "code": "BAD_REQUEST",
    "statusCode": 400,
    "requestId": "abc-123"
  }
}
```

Validation error (lines 104-117) adds `details: [{ field, message }, ...]`.

Timeout response (`requestTimeout.ts:23-31`) uses the same envelope with `code: 'REQUEST_TIMEOUT'`.

## Complete Error Code Table (backend-emitted)

| Code | Status | Source | Notes |
|---|---|---|---|
| `BAD_REQUEST` | 400 | `AppError.badRequest` | Generic client error |
| `VALIDATION_ERROR` | 400 | `errorHandler` Zod branch | `details` array |
| `PAYLOAD_TOO_LARGE` | 413 | `errorHandler` payload branch | 100 KB global, 16 MB insurance-scan |
| `FOREIGN_KEY_VIOLATION` | 400 | Prisma P2003 | |
| `CAPTCHA_REQUIRED` | 400 | `middleware/captcha.ts:138` (via `AppError.badRequest`) | Missing token |
| `EXTRACTION_FAILED` | 400 | `routes/insuranceCard.ts:128-131` | OCR failed |
| `UNAUTHORIZED` | 401 | `AppError.unauthorized` | |
| `FORBIDDEN` | 403 | `AppError.forbidden` — CAPTCHA low score, etc. | |
| `NOT_FOUND` | 404 | `AppError.notFound` + Prisma P2025 | |
| `ROUTE_NOT_FOUND` | 404 | `notFoundHandler` | Unknown route |
| `CONFLICT` | 409 | `AppError.conflict` | |
| `DUPLICATE_ENTRY` | 409 | Prisma P2002 | |
| `REQUEST_TIMEOUT` | 408 | `requestTimeout.ts` | |
| `TOO_MANY_REQUESTS` | 429 | `AppError.tooManyRequests` + rate limiter | Rate limiters emit plain `{ error, message, retryAfter }` (`rateLimiter.ts:165-169, 264-269`) — note this bypasses the `{success, error}` envelope |
| `QUERY_ERROR` | 500 | Prisma P2010 | |
| `INTERNAL_ERROR` | 500 | default branch | Message redacted in prod |
| `DATABASE_TIMEOUT` | 503 | Prisma P2024 | |
| `DATABASE_UNAVAILABLE` | 503 | `PrismaClientInitializationError` | |
| `SERVICE_UNAVAILABLE` | 503 | `AppError.serviceUnavailable` | |
| `ADMIN_NOT_CONFIGURED` | 503 | `admin.ts:30-38` | When `ADMIN_SECRET` unset |

## Frontend

### `ApiError` class
`packages/frontend/src/lib/api.ts:63-103`. Properties: `statusCode`, `code`, `details`, `retryAfter`. Helpers: `isRateLimited`, `isValidationError`, `isNotFoundError`, `isUnauthorized`, `isRetryable`.

`retryableStatuses` default: `[429, 500, 502, 503, 504]` (lines 48-51).

### `fetchWithRetry`
`packages/frontend/src/lib/api.ts:255-315`.
- Retries on `retryableStatuses` and on network `TypeError`.
- Parses `Retry-After` header as seconds or HTTP-date (lines 145-162).
- Exponential backoff: `baseDelay * 2^attempt` capped at 30 s.
- Never retries AbortError (lines 294-296).

### `apiFetch` interceptors
`packages/frontend/src/lib/api.ts:391-468`.
- Always sends `credentials: 'include'`.
- On mutating methods, includes cached `X-CSRF-Token`; auto-refetches CSRF token on 403 EBADCSRFTOKEN and retries once (lines 428-435).
- On 401, calls `/auth/refresh`, and if successful retries the original request once (lines 439-444). Refresh promise is singleton-coalesced (lines 363-381).
- On final 429, deduplicated toast with `id: 'rate-limit'` (lines 456-462) shows formatted retry time.

### `errorUtils`
`packages/frontend/src/lib/errorUtils.ts`.

`AppError` shape (lines 43-54) — frontend-local:
```ts
interface AppError {
  message: string;
  code?: string;
  statusCode?: number;
  retryable: boolean;
  originalError?: unknown;
}
```

Helpers:
- `toAppError(unknown)` — normalizes `Error`, plain object, string, or unknown (lines 181-232).
- `getUserMessage(AppError | string)` — maps 429/401/403/404/5xx to friendly text; detects network, validation, not-found text patterns (lines 245-292).
- `getErrorVariant(error)` — returns `'network' | 'server' | 'not-found' | 'validation' | 'rate-limit' | 'unknown'` (lines 305-340).
- `createErrorState(error)` — convenience combining message/type/retryable.
- `isRetryableStatus`, `isNetworkError`, `isNotFoundError`, `isValidationError`, `isAbortError`.
- `logError(context, error)` — dev-mode verbose console, prod-mode minimal, and fires PostHog `$exception` with `{message, type, source, status_code, retryable}` (lines 373-405).

Pattern sets used for classification:
- `NETWORK_ERROR_PATTERNS` (lines 89-101): `network, fetch, connection, timeout, offline, internet, failed to fetch, networkerror, econnrefused, econnreset, enotfound`.
- `NOT_FOUND_PATTERNS` (lines 106-111).
- `VALIDATION_PATTERNS` (lines 116-124).

### `ErrorContext`
`packages/frontend/src/context/ErrorContext.tsx:6-107`.
- Stores current `AppError | null`.
- Exposes `setError`, `clearError`, `showErrorToast(err, duration)` (self-clearing timeout, lines 63-79).
- Derives `errorVariant` and `errorMessage` via `errorUtils` (lines 81-82).
- Auto-cleans timers on unmount (lines 36-42).
- Consumed via `useError()` hook (lines 101-106). Throws if used outside provider.

Wired at `app/layout.tsx:14, 131` and rendered through `GlobalErrorBanner.tsx` (in layout at line 134).

### Error boundary
`packages/frontend/src/app/error.tsx:12-131`.
- Client component (`'use client'`).
- On mount: `console.error` and PostHog capture `$exception` with `{ $exception_message, $exception_type: 'unhandled_error', $exception_source: 'error_boundary', digest }` (lines 17-33).
- UI: large icon, title, Try-Again (`reset()`) button, Home link, Support mailto.
- Development-only expandable "Error Details" showing message, `digest`, and stack trace (lines 82-127). `isDevelopment` gate (line 14).

## Response envelope summary

| Surface | Envelope |
|---|---|
| Success | `{ success: true, data: <payload> }` |
| Error (AppError / Zod / Prisma / payload / timeout / 404 / default) | `{ success: false, error: { message, code, statusCode, requestId[, details] } }` |
| Rate-limit (429 from `rateLimiter.ts`) | `{ error: 'Too many requests', message, retryAfter }` — **bypasses the `{success, error}` envelope** |
| Health `/health` degraded | 503 with `{ status: 'degraded', checks: { database: 'unhealthy' }, ... }` — **not the error envelope** |
| `GET /api/v1/auth/verify` | HTTP 302 redirect only, never JSON (`auth.ts:108-131`) |

## Checklist

### Backend
- [x] `AppError` class with factory methods (`errorHandler.ts:7-57`).
- [x] `asyncHandler` for async routes (lines 62-68).
- [x] Global error handler (lines 73-251).
- [x] Zod validation with field-level details (lines 102-118).
- [x] Prisma error mapping (P2002/P2003/P2010/P2024/P2025 + init error).
- [x] Payload-too-large handling (413).
- [x] Request timeouts (408) with request ID correlation.
- [x] Request ID propagated in every error body.
- [x] 404 route handler (`notFoundHandler`).
- [x] Messages redacted in production for `INTERNAL_ERROR` and `QUERY_ERROR`.
- [x] Pino structured logging with `requestId` in every error log entry.
- [ ] Error logging to external monitoring (Cloud Error Reporting / Sentry) — not wired.

### Frontend
- [x] Error boundary (`app/error.tsx`) with PostHog capture + dev-only stack.
- [x] `ErrorContext` for global error banner state.
- [x] `ApiError` class with typed helpers.
- [x] Retry logic with exponential backoff + `Retry-After` honoring.
- [x] Transparent token refresh on 401.
- [x] CSRF token auto-refresh on 403.
- [x] Toast deduplication for rate limits.
- [ ] React Query-level retry config review — not inspected here; may overlap with `fetchWithRetry`.

### Monitoring
- [x] PostHog `$exception` capture from error boundary and `logError`.
- [ ] Google Cloud Error Reporting integration not explicit; Pino logs flow to Cloud Logging on Cloud Run and Error Reporting can auto-ingest 500s.
- [ ] Alerting / dashboards not codified in repo.

## Issues / Recommendations

1. **Rate-limit responses escape the standard envelope** — `rateLimiter.ts:165-169` and `:264-269` emit `{error, message, retryAfter}`. Normalize to `{success:false, error:{code:'TOO_MANY_REQUESTS', statusCode:429, retryAfter, ...}}`. Frontend already reads `data.retryAfter` as a fallback (`api.ts:446`) but code/message parsing inconsistent.
2. **Production message redaction is narrow** — only `INTERNAL_ERROR` and `QUERY_ERROR` redact. `PayloadTooLargeError`, Prisma P2003 meta, and init errors pass through the Error object's message unchanged. Audit that none contain secrets/DSNs.
3. **`_next` param name in `errorHandler`** — Express requires a 4-arity function to be treated as error handler. Underscore prefix is correct to avoid lint, but future refactors must preserve arity.
4. **No structured `VALIDATION_ERROR` from Zod**'s `issues` field — handler relies on `err.name === 'ZodError'` and casts to a loose shape (`errorHandler.ts:102-106`). Use `import { ZodError } from 'zod'` and `err instanceof ZodError` for type safety.
5. **Prisma error detection by `err.name`** — works with CJS but breaks in bundling that mangles names. Import Prisma error classes from `@prisma/client/runtime/library` and use `instanceof`.
6. **`notFoundHandler` signature** — shown as `(req, res)` but Express expects `(req, res, next)`; missing `next` is fine because it terminates, but add for clarity.
7. **Error boundary doesn't clear `ErrorContext`** when `reset()` is invoked — add an `useError().clearError()` call in the reset handler so stale banner state doesn't persist across recoveries.
8. **Monitoring gap** — consider wiring Cloud Error Reporting via `@google-cloud/error-reporting` (Pino transport) or Sentry on the backend for aggregated alerts. PostHog captures exceptions but isn't a full APM.
9. **`INTERNAL_ERROR` returns in Prod hides 400-class bugs** during early runtime — ensure logs retain the real stack even when message is redacted (current code does: `logger.error({err})` logs the full Error).
10. **`getUserMessage` heuristic** in `errorUtils.ts:287-289` returns the raw message if "short and clean" — messages like "User `x@y.com` already exists" would leak. Consider switching to explicit code-based mapping instead of message inspection.

## Output Format Answer (from prompt's "Output Format")

```markdown
# Error Handling

**Last Updated:** 2026-04-16

## Error Codes
| Code | Status | Count (24h) |
|------|--------|-------------|
| VALIDATION_ERROR | 400 | (not wired to metrics) |
| NOT_FOUND | 404 | (not wired) |
| TOO_MANY_REQUESTS | 429 | (not wired) |
| INTERNAL_ERROR | 500 | (not wired) |

## Backend
- [x] AppError class
- [x] asyncHandler
- [x] Global error handler
- [x] Zod handling
- [x] Prisma handling
- [x] Request-timeout handling
- [x] Request ID correlation

## Frontend
- [x] Error boundary
- [x] Error context
- [x] API error handling with retries
- [x] 401 auto-refresh + 403 CSRF auto-refresh

## Monitoring
- Partial: PostHog exception capture (frontend)
- Missing: Cloud Error Reporting / Sentry
- Missing: error-rate dashboards
```

## Questions from Prompt — Answers

1. *All error codes documented?* — Above table is authoritative; no doc file in repo currently lists them all.
2. *Is error logging configured?* — Pino backend logs are structured and include `requestId`; PostHog captures frontend exceptions. Cloud Error Reporting auto-pickup from Cloud Logging for 5xx is the likely path; verify configuration.
3. *Unhandled error types?* — Most are covered. Missing explicit handling: `PrismaClientValidationError`, `PrismaClientUnknownRequestError`, and rate-limit 429 shape.
4. *Retry logic?* — Client has exponential-backoff + `Retry-After`. No backend-level retry against DB (appropriate — let caller retry).
5. *Error monitoring?* — PostHog in place; Sentry / Google Cloud Error Reporting are open items.
