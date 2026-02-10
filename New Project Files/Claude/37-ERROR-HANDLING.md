# Error Handling

## Overview

Error handling follows a structured approach across both backend and frontend. The backend uses a custom `AppError` class with factory methods, a global error handler middleware, and standardized error response formats. The frontend uses context-based global error state, error boundaries, and toast notifications.

## Backend

### AppError Class

Custom error class extending `Error` with HTTP status codes, error codes, and an operational flag to distinguish expected errors from unexpected failures.

#### Factory Methods

| Method | Status Code | Use Case |
|--------|-------------|----------|
| `AppError.badRequest(message)` | 400 | Invalid input, missing parameters |
| `AppError.unauthorized(message)` | 401 | Missing or invalid authentication |
| `AppError.forbidden(message)` | 403 | Insufficient permissions |
| `AppError.notFound(message)` | 404 | Resource does not exist |
| `AppError.conflict(message)` | 409 | Duplicate resource, state conflict |
| `AppError.tooManyRequests(message)` | 429 | Rate limit exceeded |
| `AppError.serviceUnavailable(message)` | 503 | External service down, maintenance |

### asyncHandler

Higher-order function that wraps async route handlers to catch rejected promises and forward them to the error middleware.

```typescript
const asyncHandler = (fn: RequestHandler) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

This eliminates the need for try/catch blocks in every route handler.

### Global errorHandler Middleware

Centralized Express error-handling middleware that processes all errors passed via `next(error)`.

#### Error Type Handling

| Error Type | Status | Code | Behavior |
|------------|--------|------|----------|
| `ZodError` | 400 | `VALIDATION_ERROR` | Returns validation details (field paths and messages) |
| `AppError` (operational) | Varies | Varies | Returns the error's message and code |
| Unexpected errors | 500 | `INTERNAL_ERROR` | Logs full error; returns generic message (no details leaked) |

### Error Response Format

All error responses follow a consistent JSON structure:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error description",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "details": []
  }
}
```

The `details` field is optional and included only for validation errors (Zod) where it contains per-field error information.

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Malformed request or invalid parameters |
| `VALIDATION_ERROR` | 400 | Request body/query fails Zod schema validation |
| `CAPTCHA_REQUIRED` | 400 | CAPTCHA token missing from request |
| `CAPTCHA_FAILED` | 400 | CAPTCHA verification returned low score |
| `UNAUTHORIZED` | 401 | Authentication required but not provided |
| `FORBIDDEN` | 403 | Authenticated but lacks permission |
| `NOT_FOUND` | 404 | Requested resource does not exist |
| `CONFLICT` | 409 | Action conflicts with existing state |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Downstream service unavailable |

## Frontend

### ErrorContext

React context providing global error state management.

- Stores the current error (message, code, details)
- Provides `setError()` and `clearError()` functions
- Consumed by error display components throughout the app

### error.tsx (Error Boundary)

Next.js error boundary component that catches rendering errors.

- Displays a user-friendly error message
- Provides a **Retry** button that attempts to re-render the failed component
- Logs error details for debugging

### ApiError Class

Custom error class in `api.ts` for handling API response errors on the client side.

```typescript
class ApiError extends Error {
  statusCode: number;      // HTTP status code from response
  code: string;            // Error code from response body
  retryAfter?: number;     // Seconds to wait before retrying (from 429 responses)
}
```

### Toast Notifications

Non-blocking notifications displayed to users for transient errors.

- Appear temporarily in a corner of the viewport
- Auto-dismiss after a timeout
- Used for errors that do not require page-level error display (e.g., failed vote, rate limit hit)
