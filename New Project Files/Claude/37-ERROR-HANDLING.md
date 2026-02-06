# Error Handling

**Last Updated:** 2026-02-06

## Error Codes

| Code | Status | Description | Handled In |
|------|--------|-------------|------------|
| `BAD_REQUEST` | 400 | Invalid request parameters | `AppError.badRequest()` |
| `VALIDATION_ERROR` | 400 | Zod validation failed | `errorHandler` ZodError branch |
| `CAPTCHA_REQUIRED` | 400 | Missing CAPTCHA token | `captcha.ts` |
| `CAPTCHA_FAILED` | 400 | CAPTCHA verification failed | `captcha.ts` |
| `UNAUTHORIZED` | 401 | Missing/invalid auth | `AppError.unauthorized()` |
| `FORBIDDEN` | 403 | Action not allowed | `AppError.forbidden()` |
| `NOT_FOUND` | 404 | Resource not found | `AppError.notFound()` |
| `ROUTE_NOT_FOUND` | 404 | Unknown API route | `notFoundHandler()` |
| `CONFLICT` | 409 | Duplicate action (Sybil) | `AppError.conflict()` |
| `DUPLICATE_ENTRY` | 409 | Prisma P2002 unique violation | `errorHandler` Prisma branch |
| `PAYLOAD_TOO_LARGE` | 413 | Request body too large | `errorHandler` PayloadTooLarge branch |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded | `AppError.tooManyRequests()` |
| `INTERNAL_ERROR` | 500 | Unexpected server error | Default handler |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily down | `AppError.serviceUnavailable()` |
| `ADMIN_NOT_CONFIGURED` | 503 | ADMIN_SECRET not set | `admin.ts` middleware |

## Backend Error Handling

### AppError Class (`errorHandler.ts`)

**Verified implementation** at `packages/backend/src/middleware/errorHandler.ts`:

```typescript
class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
}
```

**Factory methods verified**:
- [x] `AppError.badRequest(message, code?)` -- 400
- [x] `AppError.unauthorized(message?, code?)` -- 401 (default: "Unauthorized")
- [x] `AppError.forbidden(message?, code?)` -- 403 (default: "Forbidden")
- [x] `AppError.notFound(message?, code?)` -- 404 (default: "Resource not found")
- [x] `AppError.conflict(message, code?)` -- 409
- [x] `AppError.tooManyRequests(message?, code?)` -- 429 (default: "Too many requests")
- [x] `AppError.serviceUnavailable(message?, code?)` -- 503 (default: "Service temporarily unavailable")
- [x] `AppError.internal(message?, code?)` -- 500 (sets `isOperational: false`)

### asyncHandler Wrapper

**Verified**: Wraps async route handlers to catch rejected promises and forward to Express error handler via `next()`. Used consistently across all route files (admin.ts, plans.ts, etc.).

### Global Error Handler (`errorHandler`)

**Verified error type handling**:

1. **AppError**: Returns structured error with message, code, statusCode, and requestId
2. **ZodError**: Returns 400 with `VALIDATION_ERROR` code and field-level details
3. **PayloadTooLargeError**: Returns 413 with `PAYLOAD_TOO_LARGE` code
4. **PrismaClientKnownRequestError**:
   - P2002 (unique violation): Returns 409 with `DUPLICATE_ENTRY`
   - P2025 (record not found): Returns 404 with `NOT_FOUND`
5. **Default**: Returns 500 with `INTERNAL_ERROR`; hides actual error message in production

**Error response format inconsistency detected**:
- AppError responses use: `{ error: { message, code, statusCode, requestId } }`
- PayloadTooLarge response uses: `{ success: false, error: { message, code, statusCode } }`
- The `success` field is inconsistently included (present in PayloadTooLarge, absent in AppError responses)

### Response Helpers (`responseHelpers.ts`)

**Verified** at `packages/backend/src/utils/responseHelpers.ts`:
- `sendSuccess(res, data, statusCode)` -- wraps data in `{ success: true, data }`
- `sendPaginatedSuccess(res, items, total, page, limit, itemsKey)` -- adds pagination metadata
- `buildPaginationMeta(total, page, limit)` -- computes totalPages and hasMore

### Logging

**Verified**: Uses `pino` logger via `logger.error()` in the error handler. Logs include:
- `requestId` (from `req.id`)
- Error object
- Request path and method

### Route-Level 404 Handler (`notFoundHandler`)

**Verified**: Returns structured 404 response for unmatched routes with the method and path.

## Frontend Error Handling

### errorUtils.ts (`packages/frontend/src/lib/errorUtils.ts`)

**Comprehensive error utility module verified**:

**AppError interface** (frontend version -- different from backend):
```typescript
interface AppError {
  message: string;
  code?: string;
  statusCode?: number;
  retryable: boolean;
  originalError?: unknown;
}
```

**Key functions verified**:
- `toAppError(error: unknown)` -- Converts any caught error to standardized AppError. Handles Error instances, plain objects, strings, and unknown types.
- `getUserMessage(error)` -- Maps technical errors to user-friendly messages (e.g., 429 -> "Too many requests. Please wait a moment and try again.")
- `getErrorVariant(error)` -- Maps errors to UI variants: 'network', 'server', 'not-found', 'validation', 'rate-limit', 'unknown'
- `createErrorState(error)` -- Combines message, type, and retryable into a component-ready state object
- `isRetryableStatus(status)` -- Checks if HTTP status indicates retryable error (408, 429, 500, 502, 503, 504)
- `isNetworkError(message)` -- Pattern matches network-related error messages
- `logError(context, error)` -- Logs errors with different detail levels for dev vs production

### ErrorContext.tsx (`packages/frontend/src/context/ErrorContext.tsx`)

**Verified implementation**:
- Provides global error state via React Context
- Exposes: `error`, `errorVariant`, `errorMessage`, `setError`, `clearError`, `showErrorToast`, `hasError`
- `showErrorToast(error, duration)` -- Sets error with auto-dismiss after `duration` ms (default 5000)
- Properly cleans up timeouts on unmount
- Uses `toAppError()` and `getUserMessage()` from errorUtils

### Error Boundary (`packages/frontend/src/app/error.tsx`)

**Verified** -- Next.js error boundary with:
- User-friendly error message ("Something went wrong")
- "Try Again" button (calls `reset()`)
- "Go Home" link
- Contact support email link
- Development-only expandable error details (message, digest, stack trace)
- TODO comment for error tracking service integration (Sentry, PostHog, LogRocket)
- Does NOT currently report errors to any monitoring service

### API Error Handling (`packages/frontend/src/lib/api.ts`)

**Verified** -- `ApiError` class with:
- `statusCode`, `code`, `details`, `retryAfter` properties
- Helper methods: `isRateLimited()`, `isValidationError()`, `isNotFound()`, `isUnauthorized()`, `isRetryable()`

**Retry logic verified** (`fetchWithRetry`):
- Retries on 429, 500, 502, 503, 504
- Retries on network errors
- Exponential backoff: `baseDelay * 2^attempt` (1s, 2s, 4s)
- Respects `Retry-After` header (capped at 30s)
- Does NOT retry aborted requests
- Does NOT retry 4xx errors (except 429)
- Max retries: 2 (3 total attempts)

**Rate limit toast**: Automatically shows toast notification when rate-limited (after retries exhausted)

## Checklist Verification

### Backend
- [x] AppError class with factory methods -- VERIFIED: 8 factory methods
- [x] asyncHandler for async routes -- VERIFIED: catches rejected promises
- [x] Global error handler middleware -- VERIFIED: handles AppError, ZodError, Prisma errors, PayloadTooLarge
- [x] Zod validation error handling -- VERIFIED: returns field-level details
- [x] Prisma error handling -- VERIFIED: P2002 (duplicate) and P2025 (not found)
- [x] PayloadTooLarge handling -- VERIFIED: 413 response
- [x] No stack traces in production -- VERIFIED: production uses generic "Internal server error" message
- [x] Request ID in error responses -- VERIFIED: `requestId: req.id` in all structured errors
- [x] Error logging via pino -- VERIFIED: `logger.error()` with context
- [ ] Error logging to monitoring service -- NOT implemented

### Frontend
- [x] Error context for global state -- VERIFIED: `ErrorContext.tsx` with full state management
- [x] Error boundary for crashes -- VERIFIED: `error.tsx` with dev details
- [x] API error handling -- VERIFIED: `ApiError` class with retry logic
- [x] Toast notifications for errors -- VERIFIED: rate limit toast in `api.ts`
- [x] Error classification -- VERIFIED: `errorUtils.ts` with network/server/not-found/validation/rate-limit variants
- [x] User-friendly error messages -- VERIFIED: `getUserMessage()` translates technical errors
- [x] Retry mechanisms -- VERIFIED: `fetchWithRetry` with exponential backoff
- [ ] Retry UI for transient errors -- Partial: `retryable` property exists but no generic retry button component

### Monitoring
- [ ] Error logging configured -- Uses console logging only (no external service)
- [ ] Error alerts set up -- NOT implemented
- [ ] Error dashboard created -- NOT implemented

## Questions Answered

### 1. Are all error codes documented?
**Mostly.** The codebase uses 15 distinct error codes (listed in the table above). The prompt's error code table is accurate but missing:
- `ROUTE_NOT_FOUND` (from `notFoundHandler`)
- `DUPLICATE_ENTRY` (from Prisma P2002 handler)
- `PAYLOAD_TOO_LARGE` (from body parser error handler)
- `ADMIN_NOT_CONFIGURED` (from admin middleware)

### 2. Is error logging configured?
**Backend**: Yes, using `pino` structured logger. All errors are logged with request context (path, method, requestId). However, logs only go to stdout -- no external logging service (Cloud Logging, Sentry, etc.) is configured.
**Frontend**: Console logging only via `logError()` function. The error boundary has a TODO comment for Sentry/PostHog integration.

### 3. Are there any unhandled error types?
**Identified gaps**:
- **Prisma connection errors** (e.g., `PrismaClientInitializationError`): Not specifically handled -- would fall through to the default 500 handler
- **Redis connection errors**: Handled via fail-open in rate limiter, but not surfaced through the error handler
- **JSON parse errors**: Express's built-in body parser handles these, but they may not produce the standard error format
- **File upload errors**: No specific handling for multipart/file upload errors
- **Prisma P2003 (foreign key constraint)**: Not specifically handled

### 4. Should we add retry logic?
**Already implemented on the frontend** via `fetchWithRetry()` with exponential backoff. Backend does not have retry logic for database operations, which could be beneficial for transient PostgreSQL/Cloud SQL connection issues.

### 5. Is there error monitoring?
**No external monitoring is configured.** Both the frontend error boundary and backend error handler log to console/stdout only. The error boundary's TODO comment explicitly lists Sentry, PostHog error tracking, and LogRocket as planned integrations.

## Issues

1. **Inconsistent response format**: AppError responses omit the `success` field, while PayloadTooLarge includes `success: false`. The `responseHelpers.ts` uses `{ success: true, data }` for success responses, but error responses don't consistently include `success: false`.
2. **No external error monitoring**: All errors go to stdout/console only. No Sentry, Cloud Error Reporting, or similar service is configured.
3. **Frontend error boundary lacks reporting**: The TODO in `error.tsx` (line 22-23) indicates error tracking integration is planned but not implemented.
4. **Missing Prisma error codes**: Only P2002 and P2025 are handled; other common Prisma errors (P2003 foreign key, P2010 raw query, P2024 timeout) fall through to the generic 500 handler.
5. **No request timeout handling**: No explicit request timeout middleware for long-running database queries.

## Recommendations

1. **Standardize error response format**: Always include `success: false` in error responses to match the `success: true` pattern in success responses. This makes client-side error detection consistent.
2. **Add Sentry or Cloud Error Reporting**: Integrate an error monitoring service for both frontend and backend. PostHog could also capture errors via `posthog.capture('$exception', ...)`.
3. **Handle additional Prisma errors**: Add handlers for P2003 (foreign key), P2024 (timeout), and connection errors.
4. **Add request timeout middleware**: Implement a timeout for database-heavy requests (e.g., admin cleanup, confidence recalculation) to prevent hanging connections.
5. **Add error event tracking to PostHog**: Since PostHog is already integrated, capture error events (without PII) for monitoring application health alongside usage analytics.
