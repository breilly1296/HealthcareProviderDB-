# VerifyMyProvider Error Handling Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

VerifyMyProvider implements consistent error handling through a custom `AppError` class and centralized error middleware. All API errors follow a standardized format with appropriate HTTP status codes.

---

## Error Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Error Handling Flow                       │
│                                                              │
│  Route Handler                                               │
│       │                                                      │
│       ├─── Validation Error (Zod) ──────────┐              │
│       │                                      │              │
│       ├─── Business Error (AppError) ───────┤              │
│       │                                      │              │
│       ├─── Database Error (Prisma) ─────────┤              │
│       │                                      │              │
│       └─── Unexpected Error (throw) ────────┤              │
│                                              │              │
│                                              ▼              │
│                                   ┌──────────────────┐     │
│                                   │ Error Middleware │     │
│                                   │                  │     │
│                                   │ • Classify error │     │
│                                   │ • Format response│     │
│                                   │ • Log if needed  │     │
│                                   │ • Send to client │     │
│                                   └──────────────────┘     │
│                                              │              │
│                                              ▼              │
│                                   ┌──────────────────┐     │
│                                   │ JSON Response    │     │
│                                   │                  │     │
│                                   │ { success: false,│     │
│                                   │   error: {...} } │     │
│                                   └──────────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## AppError Class

```typescript
// packages/backend/src/utils/AppError.ts

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: ValidationError[];

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: ValidationError[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;  // Distinguishes from programming errors
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  // Factory methods for common errors
  static badRequest(message: string, details?: ValidationError[]): AppError {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message: string = 'Not found'): AppError {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static tooManyRequests(message: string = 'Too many requests'): AppError {
    return new AppError(message, 429, 'TOO_MANY_REQUESTS');
  }

  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }

  static serviceUnavailable(message: string = 'Service unavailable'): AppError {
    return new AppError(message, 503, 'SERVICE_UNAVAILABLE');
  }
}
```

---

## Error Middleware

```typescript
// packages/backend/src/middleware/errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AppError } from '../utils/AppError';

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    statusCode: number;
    details?: Array<{ field: string; message: string }>;
  };
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction
) {
  // Already handled
  if (res.headersSent) {
    return next(err);
  }

  // Log error (except 4xx client errors)
  if (!(err instanceof AppError) || err.statusCode >= 500) {
    console.error('[Error]', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      path: req.path,
      method: req.method
    });
  }

  // Handle different error types
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
        statusCode: err.statusCode,
        details: err.details
      }
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }
    });
  }

  if (err instanceof PrismaClientKnownRequestError) {
    return handlePrismaError(err, res);
  }

  // Unknown error - don't expose details in production
  return res.status(500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'development'
        ? err.message
        : 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      statusCode: 500
    }
  });
}

function handlePrismaError(
  err: PrismaClientKnownRequestError,
  res: Response<ErrorResponse>
) {
  switch (err.code) {
    case 'P2002':  // Unique constraint violation
      return res.status(409).json({
        success: false,
        error: {
          message: 'Resource already exists',
          code: 'CONFLICT',
          statusCode: 409
        }
      });

    case 'P2025':  // Record not found
      return res.status(404).json({
        success: false,
        error: {
          message: 'Resource not found',
          code: 'NOT_FOUND',
          statusCode: 404
        }
      });

    default:
      return res.status(500).json({
        success: false,
        error: {
          message: 'Database error',
          code: 'DATABASE_ERROR',
          statusCode: 500
        }
      });
  }
}
```

---

## Async Handler Wrapper

```typescript
// packages/backend/src/utils/asyncHandler.ts

import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

### Usage in Routes

```typescript
// packages/backend/src/routes/providers.ts

router.get('/:npi', defaultRateLimiter, asyncHandler(async (req, res) => {
  const { npi } = npiParamSchema.parse(req.params);

  const provider = await prisma.provider.findUnique({
    where: { npi }
  });

  if (!provider) {
    throw AppError.notFound('Provider not found');
  }

  res.json({ success: true, data: provider });
}));
```

---

## Error Response Format

### Standard Error

```json
{
  "success": false,
  "error": {
    "message": "Provider not found",
    "code": "NOT_FOUND",
    "statusCode": 404
  }
}
```

### Validation Error

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "field": "npi",
        "message": "NPI must be exactly 10 digits"
      },
      {
        "field": "limit",
        "message": "Maximum 100 results per page"
      }
    ]
  }
}
```

---

## Error Codes Reference

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Permission denied |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Server error |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `SERVICE_UNAVAILABLE` | 503 | External service down |

---

## Frontend Error Handling

### API Client

```typescript
// packages/frontend/src/lib/api.ts

interface ApiError {
  message: string;
  code: string;
  statusCode: number;
  details?: Array<{ field: string; message: string }>;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok || !data.success) {
    const error = new Error(data.error?.message || 'Request failed') as Error & {
      code: string;
      statusCode: number;
      details?: Array<{ field: string; message: string }>;
    };
    error.code = data.error?.code || 'UNKNOWN_ERROR';
    error.statusCode = data.error?.statusCode || response.status;
    error.details = data.error?.details;
    throw error;
  }

  return data.data;
}
```

### Error Display Component

```typescript
// packages/frontend/src/components/ui/ErrorMessage.tsx

interface ErrorMessageProps {
  error: Error & { code?: string; details?: Array<{ field: string; message: string }> };
}

export function ErrorMessage({ error }: ErrorMessageProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <p className="text-red-800 font-medium">{error.message}</p>

      {error.details && (
        <ul className="mt-2 text-sm text-red-700">
          {error.details.map((detail, i) => (
            <li key={i}>
              <strong>{detail.field}:</strong> {detail.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Form Error Handling

```typescript
// packages/frontend/src/components/VerificationForm.tsx

export function VerificationForm() {
  const [error, setError] = useState<Error | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (data: FormData) => {
    setError(null);
    setFieldErrors({});

    try {
      await api.submitVerification(data);
      toast.success('Verification submitted!');
    } catch (err) {
      const apiError = err as Error & { code?: string; details?: Array<{ field: string; message: string }> };

      if (apiError.code === 'VALIDATION_ERROR' && apiError.details) {
        // Map to field errors
        const errors: Record<string, string> = {};
        for (const detail of apiError.details) {
          errors[detail.field] = detail.message;
        }
        setFieldErrors(errors);
      } else {
        setError(apiError);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <ErrorMessage error={error} />}

      <Input
        name="npi"
        error={fieldErrors.npi}
      />
      {/* ... */}
    </form>
  );
}
```

---

## Logging

### Error Logging

```typescript
// Structured error logging
console.error('[Error]', {
  timestamp: new Date().toISOString(),
  type: err.constructor.name,
  message: err.message,
  code: err instanceof AppError ? err.code : 'UNKNOWN',
  statusCode: err instanceof AppError ? err.statusCode : 500,
  path: req.path,
  method: req.method,
  ip: req.ip,
  stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
});
```

### Log Patterns

```
# Operational error (expected)
[Error] { type: "AppError", code: "NOT_FOUND", path: "/api/v1/providers/9999999999" }

# Validation error
[Error] { type: "ZodError", code: "VALIDATION_ERROR", path: "/api/v1/verify" }

# Unexpected error (requires attention)
[Error] { type: "Error", code: "UNKNOWN", message: "Connection refused", path: "/api/v1/search" }
```

---

## Recommendations

### Immediate
- ✅ Error handling is comprehensive
- Add error correlation IDs
- Improve error logging structure

### Future
1. **Error Monitoring**
   - Integrate Sentry or similar
   - Track error rates

2. **Error Recovery**
   - Retry transient failures
   - Circuit breaker pattern

3. **User-Friendly Messages**
   - Map technical errors to user messages
   - Localization support

---

## Conclusion

Error handling is **well-implemented**:

- ✅ Custom AppError class
- ✅ Centralized error middleware
- ✅ Consistent JSON format
- ✅ Zod validation errors
- ✅ Prisma error mapping
- ✅ Async handler wrapper
- ✅ Frontend error display

The error handling system provides clear, consistent feedback to API consumers.
