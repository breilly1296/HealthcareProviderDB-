# Error Handling

**Last Updated:** 2026-02-07

This document provides a comprehensive review of error handling across the HealthcareProviderDB monorepo, covering the backend Express API, frontend Next.js application, shared patterns, and monitoring integration.

---

## Table of Contents

1. [Error Codes](#error-codes)
2. [Backend Error Handling](#backend-error-handling)
   - [AppError Class](#apperror-class)
   - [asyncHandler Wrapper](#asynchandler-wrapper)
   - [Global Error Handler](#global-error-handler)
   - [Specialized Error Handlers](#specialized-error-handlers)
   - [Middleware Error Integration](#middleware-error-integration)
   - [Service-Level Errors](#service-level-errors)
   - [Response Helpers](#response-helpers)
   - [Logging](#logging)
3. [Frontend Error Handling](#frontend-error-handling)
   - [Error Utilities (errorUtils.ts)](#error-utilities)
   - [API Layer (api.ts)](#api-layer)
   - [Error Context (ErrorContext.tsx)](#error-context)
   - [Error Boundary (error.tsx)](#error-boundary)
   - [Error UI Components](#error-ui-components)
   - [React Query Integration](#react-query-integration)
4. [Error Response Format](#error-response-format)
5. [Error Flow Diagrams](#error-flow-diagrams)
6. [Test Coverage](#test-coverage)
7. [Monitoring & Observability](#monitoring--observability)
8. [Checklist](#checklist)
9. [Issues](#issues)
10. [Recommendations](#recommendations)

---

## Error Codes

| Code | Status | Description | Thrown By |
|------|--------|-------------|-----------|
| `BAD_REQUEST` | 400 | Invalid request parameters | `AppError.badRequest()` in routes/services |
| `VALIDATION_ERROR` | 400 | Zod schema validation failed | Global error handler (ZodError) |
| `CAPTCHA_REQUIRED` | 400 | Missing CAPTCHA token | `captcha.ts` middleware |
| `CAPTCHA_FAILED` | 400 | CAPTCHA verification failed | `captcha.ts` middleware |
| `UNAUTHORIZED` | 401 | Missing or invalid auth credentials | `AppError.unauthorized()` in admin middleware |
| `FORBIDDEN` | 403 | Action not permitted (e.g., low CAPTCHA score) | `AppError.forbidden()` in captcha middleware |
| `NOT_FOUND` | 404 | Resource not found | `AppError.notFound()` in routes/services |
| `ROUTE_NOT_FOUND` | 404 | Unknown API route | `notFoundHandler()` catch-all |
| `REQUEST_TIMEOUT` | 408 | Request exceeded timeout | `requestTimeout.ts` middleware |
| `CONFLICT` | 409 | Duplicate action (e.g., duplicate vote/verification) | `AppError.conflict()` in verificationService |
| `DUPLICATE_ENTRY` | 409 | Prisma unique constraint violation (P2002) | Global error handler |
| `PAYLOAD_TOO_LARGE` | 413 | Request body exceeds 100kb limit | Global error handler |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded | `rateLimiter.ts` middleware |
| `FOREIGN_KEY_VIOLATION` | 400 | Prisma foreign key violation (P2003) | Global error handler |
| `QUERY_ERROR` | 500 | Prisma raw query failed (P2010) | Global error handler |
| `INTERNAL_ERROR` | 500 | Unexpected/unhandled server error | Global error handler (default) |
| `DATABASE_TIMEOUT` | 503 | Prisma connection pool timeout (P2024) | Global error handler |
| `DATABASE_UNAVAILABLE` | 503 | Prisma connection init failure | Global error handler |
| `SERVICE_UNAVAILABLE` | 503 | External service down (e.g., CAPTCHA API) | `AppError.serviceUnavailable()` |
| `ADMIN_NOT_CONFIGURED` | 503 | ADMIN_SECRET env var not set | `admin.ts` auth middleware |

---

## Backend Error Handling

### AppError Class

**File:** `packages/backend/src/middleware/errorHandler.ts`

The `AppError` class extends the native `Error` and serves as the primary mechanism for throwing operational errors throughout the backend. It includes:

- **`statusCode`** (number): HTTP status code to return.
- **`isOperational`** (boolean): Distinguishes expected errors from programming bugs. Set to `true` for all factory methods except `AppError.internal()` which sets it to `false`.
- **`code`** (string, optional): Machine-readable error code for API consumers.
- **Stack trace preservation** via `Error.captureStackTrace`.

```typescript
// packages/backend/src/middleware/errorHandler.ts (lines 7-57)
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    options: { isOperational?: boolean; code?: string } = {}
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = options.isOperational ?? true;
    this.code = options.code;
    Error.captureStackTrace(this, this.constructor);
  }

  // Factory methods
  static badRequest(message: string, code?: string): AppError { ... }
  static unauthorized(message: string = 'Unauthorized', code?: string): AppError { ... }
  static forbidden(message: string = 'Forbidden', code?: string): AppError { ... }
  static notFound(message: string = 'Resource not found', code?: string): AppError { ... }
  static conflict(message: string, code?: string): AppError { ... }
  static tooManyRequests(message: string = 'Too many requests', code?: string): AppError { ... }
  static serviceUnavailable(message: string = 'Service temporarily unavailable', code?: string): AppError { ... }
  static internal(message: string = 'Internal server error', code?: string): AppError { ... }
}
```

**Factory methods** provide clean, readable error creation at call sites:

```typescript
// packages/backend/src/routes/providers.ts (line 317)
throw AppError.notFound(`Provider with NPI ${npi} not found`);

// packages/backend/src/services/verificationService.ts (line 92-94)
throw AppError.conflict(
  'You have already submitted a verification for this provider-plan pair within the last 30 days.'
);
```

### asyncHandler Wrapper

**File:** `packages/backend/src/middleware/errorHandler.ts` (lines 62-68)

All async route handlers are wrapped with `asyncHandler` which catches rejected promises and forwards them to Express's `next()`, ensuring async errors are properly routed to the global error handler rather than causing unhandled promise rejections.

```typescript
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

**Usage across all route files:**

```typescript
// packages/backend/src/routes/verify.ts (line 63)
router.post('/', verificationRateLimiter, honeypotCheck('website'), verifyCaptcha,
  asyncHandler(async (req, res) => {
    const body = submitVerificationSchema.parse(req.body);
    // ... handler logic, any thrown error is caught by asyncHandler
  })
);
```

Every route handler in `providers.ts`, `plans.ts`, `locations.ts`, `verify.ts`, and `admin.ts` uses `asyncHandler`. This is a consistent pattern with no exceptions observed.

### Global Error Handler

**File:** `packages/backend/src/middleware/errorHandler.ts` (lines 73-251)

The global error handler is registered last in the Express middleware chain (`packages/backend/src/index.ts`, line 186) and handles errors in the following priority order:

1. **Structured logging** -- Every error is logged with request context (requestId, path, method) via Pino.
2. **AppError instances** -- Returns the specific status code, message, and error code.
3. **ZodError** -- Transforms Zod validation errors into a structured response with field-level detail.
4. **PayloadTooLargeError** -- Catches Express body-parser size limit violations.
5. **PrismaClientKnownRequestError** -- Handles specific Prisma error codes:
   - `P2002` (unique constraint) -> 409 DUPLICATE_ENTRY
   - `P2025` (record not found) -> 404 NOT_FOUND
   - `P2003` (foreign key violation) -> 400 FOREIGN_KEY_VIOLATION
   - `P2024` (connection pool timeout) -> 503 DATABASE_TIMEOUT
   - `P2010` (raw query failed) -> 500 QUERY_ERROR (message redacted in production)
6. **PrismaClientInitializationError** -- Database connection failure -> 503 DATABASE_UNAVAILABLE
7. **Default (unknown errors)** -- Returns 500 INTERNAL_ERROR with generic message in production, actual error message in development.

**Security considerations:**
- Stack traces are never included in error responses.
- In production, unknown error messages are replaced with "Internal server error" to prevent information leakage.
- Prisma raw query errors (P2010) redact the error message in production.
- Every error response includes `requestId` for correlation (except PayloadTooLargeError).

### 404 Not Found Handler

**File:** `packages/backend/src/middleware/errorHandler.ts` (lines 256-266)

Registered before the global error handler (`packages/backend/src/index.ts`, line 183), this catches requests to undefined routes:

```typescript
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'ROUTE_NOT_FOUND',
      statusCode: 404,
      requestId: req.id,
    },
  });
}
```

### Specialized Error Handlers

#### Rate Limiter (`packages/backend/src/middleware/rateLimiter.ts`)

The rate limiter operates in two modes (Redis and in-memory) and has a distinct error response format that differs slightly from the global handler:

```json
{
  "error": "Too many requests",
  "message": "Too many search requests. Please try again in 1 hour.",
  "retryAfter": 3600
}
```

**Note:** This response format does **not** wrap in `{ success: false, error: { ... } }`. The rate limiter uses a flat structure with `error` and `message` at the top level plus a `retryAfter` field. This is an inconsistency with the standard error format.

Rate limit headers are always set:
- `X-RateLimit-Limit` -- Maximum requests allowed
- `X-RateLimit-Remaining` -- Requests remaining in window
- `X-RateLimit-Reset` -- Unix timestamp when window resets
- `Retry-After` -- Seconds to wait (only on 429)

Pre-configured limiters:
| Limiter | Window | Max Requests | Applied To |
|---------|--------|-------------|------------|
| `defaultRateLimiter` | 1 hour | 200 | All API routes (global) |
| `searchRateLimiter` | 1 hour | 100 | Search endpoints |
| `verificationRateLimiter` | 1 hour | 10 | Verification submissions |
| `voteRateLimiter` | 1 hour | 10 | Vote endpoints |

**Fail-open behavior:** If Redis is unavailable, requests are allowed through with `X-RateLimit-Status: degraded` header and a warning logged. This prioritizes availability.

#### Request Timeout (`packages/backend/src/middleware/requestTimeout.ts`)

Returns 408 with a consistent error format when requests exceed their timeout:

```typescript
res.status(408).json({
  success: false,
  error: {
    message: 'Request timed out',
    code: 'REQUEST_TIMEOUT',
    statusCode: 408,
    requestId: req.id,
  },
});
```

Three timeout levels:
- `generalTimeout`: 30 seconds (all `/api/v1` routes)
- `searchTimeout`: 15 seconds (search endpoints)
- `adminTimeout`: 120 seconds (admin operations)

#### CAPTCHA Middleware (`packages/backend/src/middleware/captcha.ts`)

Handles CAPTCHA-related errors with graceful degradation:

- **Missing token** -> `AppError.badRequest('CAPTCHA token required for verification submissions')`
- **Failed verification** -> `AppError.badRequest('CAPTCHA verification failed')`
- **Low score** -> `AppError.forbidden('Request blocked due to suspicious activity')`
- **Google API failure (fail-closed)** -> `AppError.serviceUnavailable('Security verification temporarily unavailable...')`
- **Google API failure (fail-open)** -> Allows request with stricter fallback rate limiting (3 requests/hour vs normal 10), sets `X-Security-Degraded: captcha-unavailable` header
- **Fallback rate limit exceeded** -> `AppError.tooManyRequests('Too many requests while security verification is unavailable...')`

Skips in development/test environments and when `RECAPTCHA_SECRET_KEY` is not configured.

#### Honeypot (`packages/backend/src/middleware/honeypot.ts`)

Does **not** return an error. Instead, returns a fake `200 OK` success response to deceive bots:

```typescript
return res.json({ success: true, data: { id: 'submitted' } });
```

This is an intentional anti-bot strategy -- the bot receives what appears to be a successful response but the request is silently discarded.

### Service-Level Errors

**File:** `packages/backend/src/services/verificationService.ts`

Services throw `AppError` instances for business logic violations:

| Scenario | Error Type | Message |
|----------|-----------|---------|
| Provider not found | `AppError.notFound()` | `Provider with NPI ${npi} not found` |
| Plan not found | `AppError.notFound()` | `Plan with ID ${planId} not found` |
| Duplicate verification (same IP) | `AppError.conflict()` | `You have already submitted a verification...within the last 30 days.` |
| Duplicate verification (same email) | `AppError.conflict()` | `This email has already submitted a verification...within the last 30 days.` |
| Duplicate vote | `AppError.conflict()` | `You have already voted on this verification` |
| Missing source IP for vote | `AppError.badRequest()` | `Source IP is required for voting` |
| Verification not found | `AppError.notFound()` | `Verification not found` |

**Error propagation pattern:** Services throw `AppError` -> `asyncHandler` catches -> Express routes to global `errorHandler` -> structured JSON response.

### Response Helpers

**File:** `packages/backend/src/utils/responseHelpers.ts`

These provide consistent success responses (the counterpart to error responses):

```typescript
export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  res.status(statusCode).json({ success: true, data });
}

export function sendPaginatedSuccess<T>(
  res: Response, items: T[], total: number, page: number, limit: number, itemsKey: string = 'items'
): void {
  res.json({
    success: true,
    data: { [itemsKey]: items, pagination: buildPaginationMeta(total, page, limit) },
  });
}
```

### Logging

**File:** `packages/backend/src/utils/logger.ts`

Uses Pino for structured JSON logging:

- **Development:** Pretty-printed output via `pino-pretty` with colors and timestamps.
- **Production:** Structured JSON with ISO timestamps for cloud logging systems.
- **Log level:** Configurable via `LOG_LEVEL` env var (default: `info`).

Error handler logs include:
- `requestId` -- For log correlation
- `err` -- Full error object
- `path` and `method` -- Request context
- Prisma-specific fields (`prismaCode`, `meta`) for database errors

Request logger (`packages/backend/src/middleware/requestLogger.ts`) tracks per-request metrics without PII:
- `requestId`, `method`, `path`, `statusCode`, `responseTimeMs`, `rateLimited`, `rateLimitInfo`

---

## Frontend Error Handling

### Error Utilities

**File:** `packages/frontend/src/lib/errorUtils.ts`

This is the central error handling module for the frontend. It provides:

#### AppError Interface (frontend)

```typescript
export interface AppError {
  message: string;
  code?: string;
  statusCode?: number;
  retryable: boolean;
  originalError?: unknown;
}
```

#### Error Classification

Errors are classified using pattern matching and status codes:

- **Retryable statuses:** 408, 429, 500, 502, 503, 504
- **Network errors:** Detected via message patterns (`'network'`, `'fetch'`, `'connection'`, `'timeout'`, `'offline'`, `'failed to fetch'`, etc.)
- **Not found errors:** Detected via patterns (`'not found'`, `'404'`, `'does not exist'`, `'no longer available'`)
- **Validation errors:** Detected via patterns (`'invalid'`, `'validation'`, `'required'`, `'must be'`, `'cannot be'`, `'too long'`, `'too short'`)

#### Core Functions

| Function | Purpose |
|----------|---------|
| `toAppError(error: unknown)` | Converts any caught error (Error, object, string, null) to standardized `AppError` |
| `getUserMessage(error)` | Transforms technical messages into user-friendly text |
| `getErrorVariant(error)` | Maps errors to UI variants: `'network'`, `'server'`, `'not-found'`, `'validation'`, `'rate-limit'`, `'unknown'` |
| `createErrorState(error)` | Combines `toAppError`, `getUserMessage`, and `getErrorVariant` into a single state object |
| `isRetryableStatus(status)` | Checks if HTTP status is retryable |
| `isNetworkError(message)` | Pattern-matches network error messages |
| `isAbortError(error)` | Detects `AbortController` cancellations |
| `logError(context, error)` | Logs errors with context; sends to PostHog in production |

#### PostHog Error Tracking

The `logError` function and the error boundary both send errors to PostHog for observability:

```typescript
posthog.capture('$exception', {
  $exception_message: appError.message,
  $exception_type: appError.code || 'unknown',
  $exception_source: context,
  status_code: appError.statusCode,
  retryable: appError.retryable,
});
```

No PII is included in error tracking -- only error metadata.

### API Layer

**File:** `packages/frontend/src/lib/api.ts`

#### ApiError Class (frontend)

```typescript
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: ApiErrorDetails | null;
  public readonly retryAfter: number | null;

  // Convenience methods
  isRateLimited(): boolean { ... }
  isValidationError(): boolean { ... }
  isNotFound(): boolean { ... }
  isUnauthorized(): boolean { ... }
  isRetryable(): boolean { ... }
}
```

#### Retry Logic (`fetchWithRetry`)

The `fetchWithRetry` function implements automatic retry with configurable behavior:

- **Retryable statuses:** 429, 500, 502, 503, 504
- **Retryable conditions:** Network errors (TypeError, connection errors)
- **Non-retryable:** AbortError, 4xx client errors (except 429)
- **Default max retries:** 2 (3 total attempts)
- **Backoff strategy:** Exponential backoff (1s, 2s, 4s)
- **Retry-After header:** Respected for 429 responses (capped at 30 seconds)
- **Logging:** Retry attempts logged in development mode

```typescript
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 2,
  retryDelay: 1000,
  retryableStatuses: [429, 500, 502, 503, 504],
  exponentialBackoff: true,
};
```

#### Rate Limit Toast

When a 429 response is received (after exhausting retries), a toast notification is shown:

```typescript
toast.error(`Rate limit exceeded. Try again in ${formatRetryTime(retrySeconds)}.`, {
  duration: 6000,
  id: 'rate-limit', // Prevents duplicate toasts
});
```

### Error Context

**File:** `packages/frontend/src/context/ErrorContext.tsx`

Provides global error state management via React Context:

```typescript
interface ErrorContextValue {
  error: AppError | null;
  errorVariant: ErrorVariant | null;
  errorMessage: string | null;
  setError: (error: unknown) => void;
  clearError: () => void;
  showErrorToast: (error: unknown, duration?: number) => void;
  hasError: boolean;
}
```

Key features:
- **`setError`** -- Converts any error to `AppError` via `toAppError()` and stores it.
- **`showErrorToast`** -- Sets the error and auto-clears after a duration (default 5 seconds).
- **Timeout cleanup** -- Properly cleans up timers on unmount to prevent memory leaks.
- **Derived state** -- `errorVariant` and `errorMessage` are computed from the current error using `getErrorVariant()` and `getUserMessage()`.

The `ErrorProvider` wraps the entire application in `packages/frontend/src/app/layout.tsx` (line 165).

### Error Boundary

**File:** `packages/frontend/src/app/error.tsx`

Next.js App Router error boundary that catches unhandled React rendering errors:

- Displays user-friendly "Something went wrong" message.
- Provides "Try Again" button (calls `reset()`) and "Go Home" link.
- Shows "Contact Support" email link to `support@verifymyprovider.com`.
- **Development only:** Collapsible error details panel showing message, digest, and full stack trace.
- **PostHog tracking:** Captures `$exception` event with `$exception_type: 'unhandled_error'` and `$exception_source: 'error_boundary'`.
- Dark mode support with responsive layout.

### Error UI Components

#### ErrorMessage (`packages/frontend/src/components/ErrorMessage.tsx`)

Reusable error display component with five visual variants:

| Variant | Icon Color | Background | Default Title |
|---------|-----------|------------|---------------|
| `search` | Gray | `bg-gray-100` | No Results Found |
| `network` | Orange | `bg-orange-100` | Connection Error |
| `server` | Red | `bg-red-100` | Server Error |
| `not-found` | Gray | `bg-gray-100` | Not Found |
| `validation` | Yellow | `bg-yellow-100` | Validation Error |

Also exports `InlineError` for form-level error messages.

#### GlobalErrorBanner (`packages/frontend/src/components/GlobalErrorBanner.tsx`)

A fixed-position, animated banner at the top of the viewport that:

- Subscribes to `ErrorContext` for global errors.
- Uses six variant styles: `network`, `server`, `not-found`, `validation`, `rate-limit`, `unknown`.
- Shows a **Retry** button (page reload) when `error.retryable` is true.
- Shows a **Dismiss** button to clear the error.
- Uses `role="alert"` and `aria-live="assertive"` for accessibility.
- Slides in/out with CSS transitions.

### React Query Integration

**File:** `packages/frontend/src/lib/queryClient.ts`

React Query is configured with built-in retry behavior:

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // 5 minutes
      gcTime: 10 * 60 * 1000,       // 10 minutes
      retry: 2,                      // 2 retries (3 total attempts)
      refetchOnWindowFocus: false,
    },
  },
});
```

This provides a second layer of retry logic on top of `fetchWithRetry`. When an API call fails:

1. `fetchWithRetry` retries up to 2 times with exponential backoff.
2. If still failing, `ApiError` is thrown.
3. React Query retries the entire query function up to 2 more times.
4. If still failing, the error surfaces to the component via `useQuery`'s `error` property.

**Effective worst case:** Up to 9 total fetch attempts (3 fetch retries x 3 React Query retries). This may be excessive for non-idempotent or costly operations.

---

## Error Response Format

### Standard Error Response

All backend errors follow this JSON structure:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error description",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "requestId": "uuid-v4-string"
  }
}
```

### Validation Error Response (Zod)

Validation errors include field-level details:

```json
{
  "success": false,
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "uuid-v4-string",
    "details": [
      {
        "field": "npi",
        "message": "NPI must be exactly 10 digits"
      }
    ]
  }
}
```

### Rate Limit Response (inconsistency)

The rate limiter middleware uses a **different** response format:

```json
{
  "error": "Too many requests",
  "message": "Too many search requests. Please try again in 1 hour.",
  "retryAfter": 3600
}
```

This lacks the `success: false` wrapper and `error.code`/`error.statusCode` nesting used by the global error handler. The frontend `apiFetch` function handles this by falling back to `data.message` when `data.error?.message` is not present (line 336 of `api.ts`).

### Success Response Format

For reference, successful responses follow:

```json
{
  "success": true,
  "data": { ... }
}
```

---

## Error Flow Diagrams

### Backend Error Flow

```
Client Request
  |
  v
Express Middleware Chain
  |-- requestIdMiddleware (assigns req.id)
  |-- httpLogger (pino-http)
  |-- helmet / cors / body-parser
  |-- defaultRateLimiter --[429]--> Rate limit JSON response
  |-- requestLogger
  |-- generalTimeout --[408]--> Timeout JSON response
  |
  v
Route Handler (wrapped in asyncHandler)
  |-- Route-specific rate limiter --[429]--> Rate limit response
  |-- honeypotCheck --[200 fake]--> Silent rejection
  |-- verifyCaptcha --[400/403/503]--> AppError via next()
  |-- Zod schema.parse() --[throws ZodError]--> via next()
  |-- Service call --[throws AppError]--> via next()
  |-- Prisma query --[throws PrismaError]--> via next()
  |
  v
notFoundHandler (if no route matched)
  |
  v
errorHandler (global)
  |-- AppError? -> status + code + message
  |-- ZodError? -> 400 + VALIDATION_ERROR + details
  |-- PayloadTooLarge? -> 413
  |-- PrismaKnownError? -> mapped status
  |-- PrismaInitError? -> 503
  |-- Default -> 500 + sanitized message
```

### Frontend Error Flow

```
User Action (click, navigation, form submit)
  |
  v
React Query / Direct API Call
  |
  v
apiFetch(endpoint)
  |
  v
fetchWithRetry(url)
  |-- Network error? --[retryable]--> Retry with backoff (up to 2x)
  |-- 429/5xx? --[retryable]--> Retry with backoff (up to 2x)
  |-- AbortError? --[throw immediately]
  |
  v
Response.ok?
  |-- No --> Create ApiError from response body
  |    |-- 429? --> Show rate limit toast
  |    |-- throw ApiError
  |
  v (React Query layer)
  React Query retry (up to 2x)
  |
  v (Component layer)
  error from useQuery/useMutation
  |-- Component handles locally? --> ErrorMessage component
  |-- Global error? --> setError() / showErrorToast() via ErrorContext
  |-- Unhandled render crash? --> error.tsx boundary
  |
  v (Tracking)
  logError() --> console + PostHog $exception
```

---

## Test Coverage

### Frontend Error Utilities (`packages/frontend/src/lib/__tests__/errorUtils.test.ts`)

Comprehensive test suite covering:

| Test Group | Tests | Status |
|-----------|-------|--------|
| `toAppError` | Error instances, statusCode extraction, plain objects, strings, null/undefined, numbers | Passing |
| `getUserMessage` | 429, 401, 403, 404, 5xx, network errors, validation errors, string input | Passing |
| `isRetryableStatus` | All retryable (408, 429, 500, 502, 503, 504) and non-retryable (200, 400, 401, 403, 404) statuses | Passing |
| `getErrorVariant` | rate-limit, not-found, validation, server, network variants; string input | Passing |
| `isNetworkError` | Network, fetch, connection, timeout, offline, ECONNREFUSED patterns | Passing |
| `isNotFoundError` | "Not found", "404", "does not exist", "no longer available" patterns | Passing |
| `isValidationError` | Invalid, validation, required, "must be", "cannot be", "too long", "too short" patterns | Passing |
| `isAbortError` | AbortError detection, non-AbortError rejection | Passing |
| `createErrorState` | Combined state object creation | Passing |

### Backend Tests

Backend error handling is implicitly tested via integration tests in service test files (e.g., `packages/backend/src/services/__tests__/`). No dedicated unit tests for the `errorHandler.ts` module were found.

---

## Monitoring & Observability

### Current State

| Capability | Status | Implementation |
|-----------|--------|----------------|
| Structured logging | Implemented | Pino with JSON output in production |
| Request ID correlation | Implemented | UUID per request via `requestId` middleware, `X-Request-ID` header |
| Error logging | Implemented | All errors logged with requestId, path, method context |
| Rate limit tracking | Implemented | Headers on every response, logged in request logger |
| Frontend error tracking | Implemented | PostHog `$exception` events from `logError()` and error boundary |
| Cloud Logging integration | Implemented | JSON stdout picked up by Google Cloud Run |
| Error alerting | Not configured | No alert policies set up |
| Error dashboard | Not configured | No dedicated error dashboard |
| Sentry/error service | Not configured | PostHog used for basic tracking only |

### Request Logging Stats

The `requestLogger` middleware maintains an in-memory buffer of the last 1000 requests with:
- Status code distribution
- Endpoint hit counts
- Average response time
- Rate-limited request count

This is accessible via the admin health endpoint.

---

## Checklist

### Backend
- [x] AppError class with factory methods (badRequest, unauthorized, forbidden, notFound, conflict, tooManyRequests, serviceUnavailable, internal)
- [x] asyncHandler for all async routes (verified across providers, plans, locations, verify, admin)
- [x] Global error handler middleware (registered last in chain)
- [x] Zod validation error handling with field-level details
- [x] Prisma error handling (P2002, P2003, P2010, P2024, P2025, initialization errors)
- [x] PayloadTooLargeError handling (413)
- [x] Consistent error response format (success: false, error: { message, code, statusCode, requestId })
- [x] No stack traces in production
- [x] Error message redaction in production for unknown errors
- [x] 404 handler for undefined routes
- [x] Request timeout middleware (408)
- [x] Rate limiter with fail-open Redis fallback
- [x] CAPTCHA fail-open/fail-closed modes with fallback rate limiting
- [x] Honeypot silent rejection (200 fake response)
- [x] Request ID for error correlation
- [x] Structured logging (Pino)
- [ ] Error logging to dedicated monitoring service (only PostHog on frontend)
- [ ] Error alerting configured

### Frontend
- [x] Error context for global error state (ErrorProvider)
- [x] Error boundary for unhandled crashes (error.tsx)
- [x] API error handling with ApiError class
- [x] Retry mechanisms with exponential backoff (fetchWithRetry)
- [x] React Query retry (2 retries by default)
- [x] Toast notifications for rate limits
- [x] Global error banner (GlobalErrorBanner)
- [x] Reusable ErrorMessage component with variants
- [x] InlineError component for forms
- [x] PostHog error tracking ($exception events)
- [x] User-friendly error message transformation (getUserMessage)
- [x] Error variant classification for UI (getErrorVariant)
- [x] AbortController/AbortError handling
- [x] Unit tests for error utilities
- [ ] Not-found page (app/not-found.tsx not found in codebase)

### Monitoring
- [x] Structured request logging with Pino
- [x] Request ID correlation across logs
- [x] PostHog frontend error tracking
- [ ] Error alerting policies (Cloud Monitoring)
- [ ] Dedicated error dashboard
- [ ] Backend error tracking service (Sentry, Cloud Error Reporting)

---

## Issues

### 1. Rate Limiter Response Format Inconsistency

**Severity:** Medium

The rate limiter middleware returns errors in a flat format:
```json
{ "error": "Too many requests", "message": "...", "retryAfter": 3600 }
```

While the global error handler returns:
```json
{ "success": false, "error": { "message": "...", "code": "...", "statusCode": 429 } }
```

The frontend `apiFetch` works around this by checking both `data.error?.message` and `data.message`, but API consumers may be confused by the inconsistency.

### 2. Potential Double Retry (9 Attempts)

**Severity:** Low

`fetchWithRetry` retries up to 2 times, and React Query also retries up to 2 times. In the worst case, this means 9 total HTTP requests for a single user action. For non-idempotent operations (POST verification, POST vote), the rate limiter and Sybil checks prevent duplicate data, but it still creates unnecessary server load.

### 3. No Backend-Specific Error Monitoring

**Severity:** Medium

Backend errors are logged via Pino to stdout (picked up by Cloud Logging), but there is no dedicated error tracking service (Sentry, Bugsnag, or Cloud Error Reporting) configured. PostHog tracking is frontend-only. Backend errors must be found by querying Cloud Logging manually.

### 4. Missing `not-found.tsx` Page

**Severity:** Low

Next.js App Router supports a `not-found.tsx` file for custom 404 pages. This file was not found in the codebase. Users hitting invalid frontend routes will see a default Next.js 404 page rather than a branded one.

### 5. CORS Error Not Routed Through Error Handler

**Severity:** Low

In `packages/backend/src/index.ts` (lines 69-86), CORS rejections create a generic `Error('Not allowed by CORS')` which gets passed to the global error handler. This produces a 500 INTERNAL_ERROR response rather than a more appropriate 403. However, since CORS errors are typically handled by the browser before the response body is read, this has minimal practical impact.

### 6. Admin Auth Returns 503 When Not Configured

**Severity:** Low

When `ADMIN_SECRET` is not set, the admin auth middleware returns 503 (Service Unavailable) with a custom `ADMIN_NOT_CONFIGURED` code. This response bypasses the global error handler and uses a direct `res.json()` call, but the format is consistent.

---

## Recommendations

### Short-Term

1. **Standardize rate limiter response format.** Update the rate limiter middleware to use the same `{ success: false, error: { message, code, statusCode, requestId } }` format as the global error handler. This ensures API consumers can use a single error parsing strategy.

2. **Add `not-found.tsx` to the frontend.** Create a branded 404 page in `packages/frontend/src/app/not-found.tsx` consistent with the error boundary styling.

3. **Deduplicate retry logic.** Consider either:
   - Disabling React Query's built-in retry for API calls that already use `fetchWithRetry`, or
   - Removing `fetchWithRetry` and relying solely on React Query's retry with a custom `retryDelay` function for exponential backoff.

### Medium-Term

4. **Add backend error tracking.** Integrate Google Cloud Error Reporting or Sentry for the backend. This would provide:
   - Automatic error grouping and deduplication
   - Error rate trending and alerting
   - Stack trace analysis in production

5. **Create error alerting policies.** Set up Cloud Monitoring alert policies for:
   - Error rate exceeding threshold (e.g., >5% of requests returning 5xx)
   - Database unavailable errors (503 DATABASE_UNAVAILABLE)
   - Rate limit surge (high volume of 429 responses)

6. **Add error handler unit tests.** Write dedicated tests for `errorHandler.ts` covering each error type branch (AppError, ZodError, Prisma errors, PayloadTooLarge, unknown errors).

### Long-Term

7. **Build an error dashboard.** Create a monitoring dashboard showing:
   - Error counts by code (24h, 7d, 30d)
   - Error rate trends
   - Top error-producing endpoints
   - P95/P99 response times

8. **Consider circuit breaker pattern.** For external dependencies (Google reCAPTCHA API, database), implement a circuit breaker that:
   - Tracks failure rates over a sliding window
   - Opens the circuit after a threshold of failures
   - Periodically attempts recovery (half-open state)
   - Currently, fail-open behavior exists but without circuit breaker state management.

---

## Key File References

| File | Purpose |
|------|---------|
| `packages/backend/src/middleware/errorHandler.ts` | AppError class, asyncHandler, global error handler, 404 handler |
| `packages/backend/src/middleware/rateLimiter.ts` | Dual-mode (Redis/memory) rate limiting with fail-open |
| `packages/backend/src/middleware/captcha.ts` | CAPTCHA verification with fail-open/fail-closed modes |
| `packages/backend/src/middleware/honeypot.ts` | Bot detection with silent rejection |
| `packages/backend/src/middleware/requestTimeout.ts` | Per-route request timeouts |
| `packages/backend/src/middleware/requestId.ts` | UUID request ID generation for log correlation |
| `packages/backend/src/middleware/requestLogger.ts` | Request metrics logging (no PII) |
| `packages/backend/src/utils/logger.ts` | Pino logger configuration |
| `packages/backend/src/utils/responseHelpers.ts` | Success response helpers |
| `packages/backend/src/schemas/commonSchemas.ts` | Shared Zod validation schemas |
| `packages/backend/src/services/verificationService.ts` | Service-level error throwing |
| `packages/backend/src/index.ts` | Express app setup, middleware registration order |
| `packages/frontend/src/lib/errorUtils.ts` | Frontend error classification, user messages, PostHog tracking |
| `packages/frontend/src/lib/api.ts` | ApiError class, fetchWithRetry, rate limit toast |
| `packages/frontend/src/context/ErrorContext.tsx` | Global error state management |
| `packages/frontend/src/app/error.tsx` | Next.js error boundary |
| `packages/frontend/src/components/ErrorMessage.tsx` | Reusable error display with variants |
| `packages/frontend/src/components/GlobalErrorBanner.tsx` | Fixed-position global error banner |
| `packages/frontend/src/lib/queryClient.ts` | React Query retry configuration |
| `packages/frontend/src/lib/__tests__/errorUtils.test.ts` | Error utility test suite |
