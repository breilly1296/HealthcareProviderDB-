---
tags:
  - backend
  - error-handling
  - implemented
type: prompt
priority: 2
---

# Error Handling Review

## Files to Review
- `packages/backend/src/middleware/errorHandler.ts` (main error handler)
- `packages/backend/src/utils/responseHelpers.ts` (response utilities)
- `packages/frontend/src/lib/errorUtils.ts` (frontend error handling)
- `packages/frontend/src/context/ErrorContext.tsx` (error state)
- `packages/frontend/src/app/error.tsx` (error boundary)

## Backend Error Handling

### AppError Class
```typescript
// packages/backend/src/middleware/errorHandler.ts
export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || 'INTERNAL_ERROR';
    this.isOperational = true;
  }

  // Factory methods
  static badRequest(message: string) {
    return new AppError(message, 400, 'BAD_REQUEST');
  }

  static unauthorized(message: string) {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message: string) {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message: string) {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message: string) {
    return new AppError(message, 409, 'CONFLICT');
  }

  static tooManyRequests(message: string) {
    return new AppError(message, 429, 'TOO_MANY_REQUESTS');
  }

  static serviceUnavailable(message: string) {
    return new AppError(message, 503, 'SERVICE_UNAVAILABLE');
  }
}
```

### asyncHandler Wrapper
```typescript
// Wraps async route handlers to catch errors
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Usage
router.get('/:npi', asyncHandler(async (req, res) => {
  const provider = await getProvider(req.params.npi);
  if (!provider) {
    throw AppError.notFound('Provider not found');
  }
  res.json({ success: true, data: { provider } });
}));
```

### Global Error Handler
```typescript
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: err.errors,
      },
    });
  }

  // Handle operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
        statusCode: err.statusCode,
      },
    });
  }

  // Handle unexpected errors (don't leak details)
  console.error('Unexpected error:', err);
  return res.status(500).json({
    success: false,
    error: {
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    },
  });
}
```

## Error Response Format

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "statusCode": 400
  }
}
```

### Validation Error Response
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "path": ["npi"],
        "message": "NPI must be exactly 10 digits"
      }
    ]
  }
}
```

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `BAD_REQUEST` | 400 | Invalid request parameters |
| `VALIDATION_ERROR` | 400 | Zod validation failed |
| `CAPTCHA_REQUIRED` | 400 | Missing CAPTCHA token |
| `CAPTCHA_FAILED` | 400 | CAPTCHA verification failed |
| `UNAUTHORIZED` | 401 | Missing or invalid auth |
| `FORBIDDEN` | 403 | Action not allowed |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate action |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily down |

## Frontend Error Handling

### Error Context
```typescript
// packages/frontend/src/context/ErrorContext.tsx
interface ErrorContextType {
  error: Error | null;
  setError: (error: Error | null) => void;
  clearError: () => void;
}

export const ErrorProvider: React.FC = ({ children }) => {
  const [error, setError] = useState<Error | null>(null);

  const clearError = () => setError(null);

  return (
    <ErrorContext.Provider value={{ error, setError, clearError }}>
      {children}
    </ErrorContext.Provider>
  );
};
```

### Error Boundary
```typescript
// packages/frontend/src/app/error.tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="error-page">
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

### API Error Handling
```typescript
// packages/frontend/src/lib/api.ts
export async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await response.json();
    throw new ApiError(
      error.error?.message || 'Request failed',
      response.status,
      error.error?.code
    );
  }

  const data = await response.json();
  return data.data;
}
```

## Checklist

### Backend
- [x] AppError class with factory methods
- [x] asyncHandler for async routes
- [x] Global error handler middleware
- [x] Zod validation error handling
- [x] Consistent error response format
- [x] No stack traces in production
- [ ] Error logging to monitoring service

### Frontend
- [x] Error context for global state
- [x] Error boundary for crashes
- [x] API error handling
- [x] Toast notifications for errors
- [ ] Retry mechanisms for transient errors

### Monitoring
- [ ] Error logging configured
- [ ] Error alerts set up
- [ ] Error dashboard created

## Questions to Ask

1. **Are all error codes documented?**
   - For API consumers?
   - For frontend handling?

2. **Is error logging configured?**
   - What service (Cloud Logging)?
   - What context is captured?

3. **Are there any unhandled error types?**
   - Prisma errors?
   - Network errors?

4. **Should we add retry logic?**
   - For transient failures?
   - With exponential backoff?

5. **Is there error monitoring?**
   - Sentry?
   - Cloud Error Reporting?

## Output Format

```markdown
# Error Handling

**Last Updated:** [Date]

## Error Codes
| Code | Status | Count (24h) |
|------|--------|-------------|
| VALIDATION_ERROR | 400 | X |
| NOT_FOUND | 404 | X |
| TOO_MANY_REQUESTS | 429 | X |
| INTERNAL_ERROR | 500 | X |

## Backend
- [x] AppError class
- [x] asyncHandler
- [x] Global error handler
- [x] Zod handling

## Frontend
- [x] Error boundary
- [x] Error context
- [x] API error handling

## Monitoring
- [status] Logging
- [status] Alerts
- [status] Dashboard

## Issues
[List any issues]

## Recommendations
[List recommendations]
```
