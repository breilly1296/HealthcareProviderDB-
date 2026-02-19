# Error Handling Review

**Generated:** 2026-02-18
**Prompt:** `prompts/37-error-handling.md`
**Status:** Comprehensive -- Full Stack Coverage with Structured Patterns

---

## Files Reviewed

| File | Path | Lines | Status |
|------|------|-------|--------|
| errorHandler.ts | `packages/backend/src/middleware/errorHandler.ts` | 267 | Verified |
| responseHelpers.ts | `packages/backend/src/utils/responseHelpers.ts` | 62 | Verified |
| errorUtils.ts | `packages/frontend/src/lib/errorUtils.ts` | 405 | Verified |
| ErrorContext.tsx | `packages/frontend/src/context/ErrorContext.tsx` | 107 | Verified |
| error.tsx | `packages/frontend/src/app/error.tsx` | 131 | Verified |

---

## Backend Error Handling

### AppError Class -- Verified

**File:** `packages/backend/src/middleware/errorHandler.ts`

```typescript
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(message: string, statusCode: number = 500, options: {
    isOperational?: boolean;
    code?: string;
  } = {}) { ... }
}
```

**Factory methods confirmed:**

| Method | Status Code | Code | Notes |
|--------|-------------|------|-------|
| `AppError.badRequest(msg, code?)` | 400 | Custom or undefined | Input validation failures |
| `AppError.unauthorized(msg?, code?)` | 401 | Custom or undefined | Default message: "Unauthorized" |
| `AppError.forbidden(msg?, code?)` | 403 | Custom or undefined | Default message: "Forbidden" |
| `AppError.notFound(msg?, code?)` | 404 | Custom or undefined | Default message: "Resource not found" |
| `AppError.conflict(msg, code?)` | 409 | Custom or undefined | Duplicate resources |
| `AppError.tooManyRequests(msg?, code?)` | 429 | Custom or undefined | Rate limit exceeded |
| `AppError.serviceUnavailable(msg?, code?)` | 503 | Custom or undefined | Temporary unavailability |
| `AppError.internal(msg?, code?)` | 500 | Custom or undefined | **isOperational: false** |

**Key design decision:** `AppError.internal()` sets `isOperational: false`, distinguishing programmer errors from expected operational errors. All other factory methods default to `isOperational: true`. This allows monitoring systems to distinguish between bugs and expected failures.

**Stack trace preservation:** `Error.captureStackTrace(this, this.constructor)` ensures clean stack traces that start at the `AppError` creation point, not inside the constructor.

---

### asyncHandler Wrapper -- Verified

```typescript
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

This wrapper is essential for Express.js async error handling. Without it, unhandled promise rejections in route handlers would silently crash the process instead of being forwarded to the error handler middleware. The `Promise.resolve()` wrapping ensures that even synchronous throws within the function are caught.

**Usage pattern confirmed** across all route files (admin.ts, plans.ts, etc.):
```typescript
router.get('/:planId', defaultRateLimiter, asyncHandler(async (req, res) => {
  // ... async logic, errors propagated via next()
}));
```

---

### Global Error Handler -- Verified

The `errorHandler` middleware handles multiple error types in priority order:

#### 1. AppError (Operational Errors)
```typescript
if (err instanceof AppError) {
  res.status(err.statusCode).json({
    success: false,
    error: { message: err.message, code: err.code, statusCode: err.statusCode, requestId: req.id }
  });
}
```

#### 2. Zod Validation Errors
```typescript
if (err.name === 'ZodError') {
  res.status(400).json({
    success: false,
    error: {
      message: 'Validation error',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      requestId: req.id,
      details: zodError.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    }
  });
}
```

Zod errors are flattened into `{ field, message }` pairs, which is frontend-friendly for form validation display.

#### 3. Payload Too Large (413)
```typescript
if (err.name === 'PayloadTooLargeError' || err.type === 'entity.too.large') {
  res.status(413).json({ ... code: 'PAYLOAD_TOO_LARGE' ... });
}
```

Handles Express body-parser size limits.

#### 4. Prisma Errors (5 specific codes)

| Prisma Code | HTTP Status | App Code | Description |
|------------|-------------|----------|-------------|
| P2002 | 409 | `DUPLICATE_ENTRY` | Unique constraint violation |
| P2025 | 404 | `NOT_FOUND` | Record not found |
| P2003 | 400 | `FOREIGN_KEY_VIOLATION` | Referenced record missing |
| P2024 | 503 | `DATABASE_TIMEOUT` | Connection pool timeout |
| P2010 | 500 | `QUERY_ERROR` | Raw query failed (message hidden in production) |

#### 5. Prisma Initialization Errors
```typescript
if (err.name === 'PrismaClientInitializationError') {
  // Logged as CRITICAL
  res.status(503).json({ ... code: 'DATABASE_UNAVAILABLE' ... });
}
```

This catches database connection failures at startup or reconnection.

#### 6. Default (Unknown Errors)
```typescript
const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
res.status(500).json({ ... code: 'INTERNAL_ERROR' ... });
```

**Security:** In production, the actual error message is replaced with a generic "Internal server error" to prevent information leakage.

---

### 404 Not Found Handler -- Verified

```typescript
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'ROUTE_NOT_FOUND',
      statusCode: 404,
      requestId: req.id
    }
  });
}
```

Placed at the end of the middleware chain to catch requests that match no route.

---

### Response Helpers -- Verified

**File:** `packages/backend/src/utils/responseHelpers.ts`

| Helper | Purpose |
|--------|---------|
| `buildPaginationMeta(total, page, limit)` | Returns `{ total, page, limit, totalPages, hasMore }` |
| `sendSuccess(res, data, statusCode?)` | Wraps data in `{ success: true, data }` |
| `sendPaginatedSuccess(res, items, total, page, limit, itemsKey?)` | Combines data with pagination metadata |

These helpers enforce a consistent response envelope across all endpoints:
```json
{
  "success": true|false,
  "data": { ... },
  "error": { "message": "...", "code": "...", "statusCode": N, "requestId": "..." }
}
```

---

### Structured Logging -- Verified

All error handler branches use `logger.error()` (pino) with structured context:
```typescript
logger.error({
  requestId: req.id,
  err,
  path: req.path,
  method: req.method,
}, 'Request error');
```

This ensures every error includes the request ID, path, and method for correlation in log aggregation systems.

---

## Error Response Format

### Standard Response Envelope

Every API response follows this structure:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "requestId": "abc123"
  }
}
```

**Validation Error (with details):**
```json
{
  "success": false,
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "abc123",
    "details": [
      { "field": "npi", "message": "NPI must be exactly 10 digits" }
    ]
  }
}
```

---

## Complete Error Code Table

| Code | Status | Source | Description |
|------|--------|--------|-------------|
| `BAD_REQUEST` | 400 | AppError.badRequest | Invalid request parameters |
| `VALIDATION_ERROR` | 400 | Zod handler | Schema validation failed |
| `CAPTCHA_REQUIRED` | 400 | captcha.ts | Missing CAPTCHA token |
| `CAPTCHA_FAILED` | 400 | captcha.ts | CAPTCHA verification failed |
| `PAYLOAD_TOO_LARGE` | 413 | errorHandler | Request body exceeds limit |
| `UNAUTHORIZED` | 401 | AppError.unauthorized | Missing or invalid auth |
| `FORBIDDEN` | 403 | AppError.forbidden | Action not allowed |
| `NOT_FOUND` | 404 | AppError.notFound | Resource not found |
| `ROUTE_NOT_FOUND` | 404 | notFoundHandler | No matching route |
| `CONFLICT` | 409 | AppError.conflict | Duplicate action |
| `DUPLICATE_ENTRY` | 409 | Prisma P2002 | Unique constraint violation |
| `FOREIGN_KEY_VIOLATION` | 400 | Prisma P2003 | Referenced record missing |
| `TOO_MANY_REQUESTS` | 429 | AppError.tooManyRequests / rateLimiter | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Default handler | Unexpected server error |
| `QUERY_ERROR` | 500 | Prisma P2010 | Raw query failed |
| `DATABASE_TIMEOUT` | 503 | Prisma P2024 | Connection pool exhausted |
| `DATABASE_UNAVAILABLE` | 503 | PrismaClientInitializationError | DB connection failed |
| `SERVICE_UNAVAILABLE` | 503 | AppError.serviceUnavailable | Temporary unavailability |
| `ADMIN_NOT_CONFIGURED` | 503 | admin.ts | ADMIN_SECRET not set |

---

## Frontend Error Handling

### errorUtils.ts -- Comprehensive Error Classification

**File:** `packages/frontend/src/lib/errorUtils.ts`

The frontend has a sophisticated error classification system:

**`toAppError(error: unknown): AppError`** -- Converts any caught value to a standardized `AppError`:
- Handles `Error` instances (including API errors with `statusCode`)
- Handles plain objects with error-like properties
- Handles string errors
- Falls back to a generic error for truly unknown types

**`getUserMessage(error): string`** -- Maps errors to user-friendly messages:
- 429: "Too many requests. Please wait a moment and try again."
- 401: "Your session has expired. Please refresh the page."
- 403: "You don't have permission to perform this action."
- 404: "The requested resource was not found."
- 5xx: "Our servers are having issues. Please try again later."
- Network errors: "Unable to connect. Please check your internet connection and try again."
- Validation errors: Pass through the original message (already user-friendly)
- Default: Uses original message if short and non-technical, otherwise "Something went wrong. Please try again."

**`getErrorVariant(error): ErrorVariant`** -- Maps errors to UI variants:

| Variant | When Applied |
|---------|-------------|
| `network` | Network-related error patterns |
| `server` | 5xx status codes |
| `not-found` | 404 or not-found message patterns |
| `validation` | 4xx status codes (except 404, 429) |
| `rate-limit` | 429 status code |
| `unknown` | Fallback (not currently returned -- defaults to `server`) |

**`isRetryableStatus(status): boolean`** -- Identifies retryable HTTP codes: 408, 429, 500, 502, 503, 504.

**Pattern-based error detection:** Uses lowercase string matching against known patterns:
- Network: `'network'`, `'fetch'`, `'connection'`, `'timeout'`, `'offline'`, `'failed to fetch'`, `'econnrefused'`, etc.
- Not found: `'not found'`, `'404'`, `'does not exist'`
- Validation: `'invalid'`, `'validation'`, `'required'`, `'must be'`

**PostHog error tracking integration:** `logError()` sends `$exception` events to PostHog with metadata (no PII).

---

### ErrorContext.tsx -- Global Error State

**File:** `packages/frontend/src/context/ErrorContext.tsx`

Provides application-wide error state management:

| Method | Purpose |
|--------|---------|
| `setError(err)` | Set persistent error (stays until cleared) |
| `clearError()` | Clear current error |
| `showErrorToast(err, duration?)` | Set error with auto-clear after duration (default 5s) |

**Properties exposed:**
- `error: AppError | null` -- current error
- `errorVariant: ErrorVariant | null` -- UI styling variant
- `errorMessage: string | null` -- user-friendly message
- `hasError: boolean` -- quick check

The context handles timeout cleanup properly via `useRef` and `useEffect` cleanup, preventing memory leaks.

---

### error.tsx -- Error Boundary

**File:** `packages/frontend/src/app/error.tsx`

Next.js App Router error boundary with:
- [x] User-friendly error message with "Try Again" and "Go Home" buttons
- [x] Support email link (`support@verifymyprovider.com`)
- [x] Development-only error details panel (message, digest, stack trace)
- [x] PostHog `$exception` event tracking (no PII)
- [x] Accessible icons with `aria-hidden="true"`
- [x] Dark mode support via Tailwind classes
- [x] Error digest display for debugging production errors

---

## Checklist Verification

### Backend
- [x] AppError class with factory methods -- 8 factory methods (badRequest, unauthorized, forbidden, notFound, conflict, tooManyRequests, serviceUnavailable, internal)
- [x] asyncHandler for async routes -- wraps Promise.resolve().catch(next)
- [x] Global error handler middleware -- handles AppError, Zod, PayloadTooLarge, 5 Prisma codes, PrismaInit, and default
- [x] Zod validation error handling -- flattened to `{ field, message }` details
- [x] Consistent error response format -- `{ success, error: { message, code, statusCode, requestId } }`
- [x] No stack traces in production -- production uses generic "Internal server error" for unknown errors
- [x] Prisma error handling -- P2002, P2003, P2010, P2024, P2025, PrismaClientInitializationError
- [x] 404 not found handler -- `notFoundHandler` for unmatched routes
- [x] Structured logging -- pino with requestId, path, method context
- [ ] Error logging to monitoring service -- logs to stdout/pino, no external service configured

### Frontend
- [x] Error context for global state -- `ErrorProvider` with `setError`, `clearError`, `showErrorToast`
- [x] Error boundary for crashes -- `error.tsx` with Try Again/Go Home
- [x] API error handling -- `toAppError()` with comprehensive type conversion
- [x] Toast notifications for errors -- `showErrorToast()` with configurable duration
- [x] User-friendly error messages -- `getUserMessage()` maps codes and patterns to clear text
- [x] Error variant classification -- `getErrorVariant()` for UI rendering decisions
- [x] Retryable error detection -- `isRetryableStatus()` for retry button logic
- [x] PostHog error tracking -- `logError()` and error boundary both send `$exception`
- [ ] Retry mechanisms for transient errors -- `retryable` flag computed but no automatic retry implemented

### Monitoring
- [ ] Error logging configured -- pino to stdout only
- [ ] Error alerts set up -- not implemented
- [ ] Error dashboard created -- not implemented

---

## Issues

1. **No external error monitoring:** Errors are logged to stdout via pino but are not sent to an external monitoring service (Sentry, Google Cloud Error Reporting, etc.). Production errors could go unnoticed without log aggregation.

2. **No automatic retry for transient errors:** The frontend computes `retryable` status for each error but does not implement automatic retry with backoff. Users must manually click "Try Again."

3. **`getErrorVariant` fallback returns `'server'` instead of `'unknown'`:** The `ErrorVariant` type includes `'unknown'` but it is never returned by `getErrorVariant()`. The default fallback is `'server'`, which may be misleading for non-server errors.

4. **Rate limiter error format differs from standard:** The rate limiter middleware returns `{ error: 'Too many requests', message: '...', retryAfter: N }` instead of the standard `{ success: false, error: { message, code, statusCode } }` envelope. This inconsistency may confuse frontend error parsing.

---

## Recommendations

1. **Integrate an error monitoring service** (Sentry or Google Cloud Error Reporting) for production. Connect it to the pino logger for backend and to the `logError()` function for frontend. This enables proactive alerting on error rate spikes.

2. **Standardize the rate limiter error response** to use the same `{ success: false, error: { ... } }` envelope as the rest of the API. Currently, 429 responses from the rate limiter have a different shape than 429 responses from the CAPTCHA fallback.

3. **Implement automatic retry with exponential backoff** for transient errors (5xx, 429) in the frontend API client, capped at 3 attempts. React Query's built-in retry mechanism could be leveraged for this.

4. **Add request timeout handling** to the global error handler -- long-running requests that timeout should return a consistent error response rather than a bare connection reset.

5. **Return the `'unknown'` variant** from `getErrorVariant()` for errors that do not match any pattern, rather than defaulting to `'server'`. This allows the UI to display a more appropriate message for truly unclassifiable errors.
