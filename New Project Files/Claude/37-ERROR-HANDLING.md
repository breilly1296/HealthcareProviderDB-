# Error Handling Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/37-error-handling.md
**Status:** Backend error handling is robust and well-structured. Frontend error files (ErrorContext, error boundary, errorUtils, api.ts) do not exist yet.

---

## Findings

### Backend -- AppError Class

- **Prompt specifies:** AppError with `statusCode`, `code`, `isOperational` fields and seven factory methods (`badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `tooManyRequests`, `serviceUnavailable`).
- **Actual implementation** (`packages/backend/src/middleware/errorHandler.ts` lines 7-57):
  - All three fields present: `statusCode` (number), `isOperational` (boolean), `code` (optional string).
  - Constructor signature differs from prompt: actual uses `(message, statusCode, options: { isOperational?, code? })` instead of `(message, statusCode, code?)`. This is functionally equivalent but more extensible.
  - All seven factory methods from the prompt are present: `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `tooManyRequests`, `serviceUnavailable`.
  - **Additional factory method** not in prompt: `static internal()` for 500 errors with `isOperational: false`. This is a sensible addition.
  - Factory methods in the actual code accept an optional `code` parameter, while the prompt shows hardcoded codes (e.g., `'BAD_REQUEST'`). In the actual code, the code is passed through but defaults to `undefined` rather than a named constant. This means `err.code` may be `undefined` unless the caller explicitly supplies one.

**Verdict:**
- &#x2705; AppError class exists with factory methods
- &#x26A0;&#xFE0F; Factory methods do not assign default error codes. Prompt shows `code: 'BAD_REQUEST'` for `badRequest()`, but actual code passes `code` through as optional. If callers do not supply a code string, the error response `code` field will be `undefined`.

### Backend -- asyncHandler Wrapper

- **Prompt specifies:** Function that wraps async handlers and forwards rejected promises to `next()`.
- **Actual implementation** (lines 62-68): Matches exactly. Uses `Promise.resolve(fn(req, res, next)).catch(next)` pattern. Return type is typed as `RequestHandler` for better Express compatibility.

**Verdict:**
- &#x2705; asyncHandler implemented correctly and used consistently across all 5 route files (providers, verify, admin, locations, plans).

### Backend -- asyncHandler Usage Across Routes

Checked all route files for consistent usage:

| Route File | asyncHandler Used | AppError Used |
|---|---|---|
| `providers.ts` | Yes (3 handlers) | Yes (`AppError.notFound`) |
| `verify.ts` | Yes (5 handlers) | Yes (`AppError.notFound`) |
| `admin.ts` | Yes (7 handlers) | Yes (`AppError.unauthorized` in auth middleware) |
| `locations.ts` | Yes (5 handlers) | Yes (`AppError.notFound`) |
| `plans.ts` | Yes (6 handlers) | Yes (`AppError.notFound`) |

**Verdict:**
- &#x2705; Every async route handler across all route files is wrapped in `asyncHandler`.
- &#x2705; `AppError.notFound()` used consistently for missing resources.

### Backend -- Global Error Handler

- **Prompt specifies:** Handler for ZodError, AppError, and unexpected errors with generic message.
- **Actual implementation** (lines 73-174): Handles **more** error types than the prompt specifies:
  1. **AppError** (lines 88-98): Returns `err.statusCode`, `err.message`, `err.code`, plus `requestId`.
  2. **ZodError** (lines 101-116): Returns 400 with `VALIDATION_ERROR` code and `details` array. Details format is slightly different from prompt: actual maps to `{ field, message }` instead of `{ path, message }`.
  3. **PayloadTooLargeError** (lines 118-129): Returns 413 with `PAYLOAD_TOO_LARGE` code. Not in prompt.
  4. **PrismaClientKnownRequestError** (lines 132-158): Handles `P2002` (unique constraint -> 409 DUPLICATE_ENTRY) and `P2025` (record not found -> 404). Not in prompt, but addresses one of the prompt's own questions ("Are there any unhandled error types? Prisma errors?").
  5. **Default/unexpected** (lines 160-173): Returns 500 with generic message in production, actual error message in development.

**Verdict:**
- &#x2705; Global error handler exists and is comprehensive
- &#x2705; ZodError handling present
- &#x2705; Prisma errors handled (prompt identified this as a gap, but it is already implemented)
- &#x2705; PayloadTooLargeError handled (extra coverage not in prompt)

### Backend -- Error Response Format

- **Prompt specifies:** `{ success: false, error: { message, code, statusCode } }`
- **Actual implementation:** The error response format is **mostly consistent but has a discrepancy**:
  - AppError responses (line 89): `{ error: { message, code, statusCode, requestId } }` -- note **no `success: false`** wrapper.
  - ZodError responses (line 103): `{ error: { message, code, statusCode, requestId, details } }` -- also **no `success: false`** wrapper.
  - Prisma error responses: Same pattern, **no `success: false`**.
  - Default 500 responses: **No `success: false`**.
  - PayloadTooLargeError (line 121): **Has `success: false`** -- the only error branch that includes it.
  - The `adminAuthMiddleware` 503 response (admin.ts line 27): **Has `success: false`**.

  Success responses consistently include `success: true`. Error responses from the global handler are **missing** the `success: false` field in most branches.

**Verdict:**
- &#x26A0;&#xFE0F; Inconsistent `success` field in error responses. The prompt specifies `success: false` in all error responses. The actual global error handler omits it from AppError, ZodError, Prisma, and default branches. Only `PayloadTooLargeError` and the admin auth middleware include it.
- &#x2705; Error responses include `requestId` (not specified in prompt, but a useful addition for debugging).

### Backend -- No Stack Traces in Production

- **Prompt specifies:** No stack traces leaked in production.
- **Actual implementation** (lines 160-173): In production (`NODE_ENV === 'production'`), the default 500 handler returns `'Internal server error'`. In development, it returns `err.message`. **No branch ever includes `err.stack` in the response.**
- The `Error.captureStackTrace` call in AppError (line 23) only sets the stack on the Error object for logging/debugging purposes; it is never serialized into the JSON response.

**Verdict:**
- &#x2705; No stack traces in production responses. Verified across all error handler branches.

### Backend -- Error Logging

- Errors are logged via `logger.error()` with structured context (`requestId`, `err`, `path`, `method`) on line 80-85.
- The prompt's checklist marks "Error logging to monitoring service" as unchecked.

**Verdict:**
- &#x2705; Errors are logged with structured context
- &#x26A0;&#xFE0F; No external monitoring service integration (Sentry, Cloud Error Reporting) -- matches prompt's own assessment

### Backend -- 404 Not Found Handler

- **Not in prompt** but present in actual code (lines 179-188): A dedicated `notFoundHandler` for unmatched routes, returning `ROUTE_NOT_FOUND` code with the method and path.

**Verdict:**
- &#x2705; Additional coverage: unmatched routes get a proper JSON 404 response instead of Express's default HTML.

### Backend -- Response Helpers

- `packages/backend/src/utils/responseHelpers.ts` provides `sendSuccess()`, `buildPaginationMeta()`, and `sendPaginatedSuccess()`.
- These ensure consistent `{ success: true, data: ... }` format for success responses.
- Used across routes (verify.ts, locations.ts, plans.ts, providers.ts).

**Verdict:**
- &#x2705; Response helpers exist and enforce consistent success format.

### Frontend -- Error Handling Files

The prompt references four frontend files:
- `packages/frontend/src/lib/errorUtils.ts`
- `packages/frontend/src/context/ErrorContext.tsx`
- `packages/frontend/src/app/error.tsx`
- `packages/frontend/src/lib/api.ts`

**None of these files exist.** The `packages/frontend/src/` directory contains no `.ts` or `.tsx` files at all.

**Verdict:**
- &#x274C; Frontend error handling files do not exist. The `ErrorContext`, error boundary, `ApiError` class, and `fetchApi` wrapper described in the prompt are not implemented.

### Error Codes Table

The prompt lists 11 error codes. Here is verification of which are actually used:

| Code | Status | Used In Code |
|---|---|---|
| `BAD_REQUEST` | 400 | Not directly -- factory exists but code not auto-assigned |
| `VALIDATION_ERROR` | 400 | Yes (errorHandler.ts ZodError branch) |
| `CAPTCHA_REQUIRED` | 400 | Not found in errorHandler.ts (may be in captcha middleware) |
| `CAPTCHA_FAILED` | 400 | Not found in errorHandler.ts (may be in captcha middleware) |
| `UNAUTHORIZED` | 401 | Factory exists; used in admin auth |
| `FORBIDDEN` | 403 | Factory exists; no current usage found |
| `NOT_FOUND` | 404 | Yes (Prisma P2025 branch, route notFoundHandler) |
| `ROUTE_NOT_FOUND` | 404 | Yes (notFoundHandler, not in prompt's table) |
| `CONFLICT` | 409 | Factory exists; `DUPLICATE_ENTRY` used for Prisma P2002 |
| `DUPLICATE_ENTRY` | 409 | Yes (Prisma P2002 branch, not in prompt's table) |
| `TOO_MANY_REQUESTS` | 429 | Factory exists; likely used by rate limiter middleware |
| `PAYLOAD_TOO_LARGE` | 413 | Yes (not in prompt's table) |
| `INTERNAL_ERROR` | 500 | Yes (default error branch) |
| `SERVICE_UNAVAILABLE` | 503 | Factory exists; used as `ADMIN_NOT_CONFIGURED` in admin |

**Verdict:**
- &#x26A0;&#xFE0F; Error codes in actual code do not always match the prompt's table. Additional codes exist (`ROUTE_NOT_FOUND`, `DUPLICATE_ENTRY`, `PAYLOAD_TOO_LARGE`, `ADMIN_NOT_CONFIGURED`). Some listed codes like `CAPTCHA_REQUIRED` and `CAPTCHA_FAILED` may live in the captcha middleware rather than the error handler.

---

## Summary

The backend error handling implementation is more comprehensive than what the prompt describes. The `AppError` class, `asyncHandler` wrapper, and global `errorHandler` are all present and well-structured. The implementation goes beyond the prompt by handling Prisma-specific errors and payload-too-large errors, and includes a dedicated 404 handler for unmatched routes. All route files consistently use `asyncHandler` and `AppError`.

Two notable gaps exist:
1. The `success: false` field is inconsistently included in error responses (most branches omit it).
2. The entire frontend error handling layer (ErrorContext, error boundary, API error class) does not exist yet -- no frontend source files were found.

## Recommendations

1. **Add `success: false` to all error response branches** in `errorHandler.ts`. Currently only the `PayloadTooLargeError` branch and the admin auth middleware include it. For API consumer consistency, all error responses should include `success: false` at the top level.

2. **Add default error codes to factory methods.** `AppError.badRequest("msg")` should default to `code: 'BAD_REQUEST'` rather than `undefined`. This ensures error responses always have a meaningful `code` field without requiring callers to remember to pass one.

3. **Build the frontend error handling layer.** The four files referenced by the prompt (`errorUtils.ts`, `ErrorContext.tsx`, `error.tsx`, `api.ts`) do not exist. When the frontend is implemented, these should be created to provide consistent error display, an error boundary for React crashes, and a typed API client with error handling.

4. **Document the additional error codes** (`ROUTE_NOT_FOUND`, `DUPLICATE_ENTRY`, `PAYLOAD_TOO_LARGE`, `ADMIN_NOT_CONFIGURED`) in the prompt's error codes table so API consumers have a complete reference.

5. **Consider adding external error monitoring** (Sentry or Google Cloud Error Reporting) as noted in the prompt's own unchecked items. The structured logging via `logger.error()` is a good foundation, but a dedicated service would provide alerting, deduplication, and trend analysis.

6. **Verify CAPTCHA error codes.** The prompt lists `CAPTCHA_REQUIRED` and `CAPTCHA_FAILED` but these were not found in `errorHandler.ts`. Confirm these are handled in the captcha middleware (`verifyCaptcha`) and that they follow the same response format.
