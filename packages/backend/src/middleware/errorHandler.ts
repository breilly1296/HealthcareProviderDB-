import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Custom application error with status code
 */
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

    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code?: string): AppError {
    return new AppError(message, 400, { code });
  }

  static unauthorized(message: string = 'Unauthorized', code?: string): AppError {
    return new AppError(message, 401, { code });
  }

  static forbidden(message: string = 'Forbidden', code?: string): AppError {
    return new AppError(message, 403, { code });
  }

  static notFound(message: string = 'Resource not found', code?: string): AppError {
    return new AppError(message, 404, { code });
  }

  static conflict(message: string, code?: string): AppError {
    return new AppError(message, 409, { code });
  }

  static tooManyRequests(message: string = 'Too many requests', code?: string): AppError {
    return new AppError(message, 429, { code });
  }

  static serviceUnavailable(message: string = 'Service temporarily unavailable', code?: string): AppError {
    return new AppError(message, 503, { code });
  }

  static internal(message: string = 'Internal server error', code?: string): AppError {
    return new AppError(message, 500, { isOperational: false, code });
  }
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error
  console.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Handle AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        statusCode: err.statusCode,
        requestId: req.id,
      },
    });
    return;
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    const zodError = err as unknown as { errors: Array<{ path: string[]; message: string }> };
    res.status(400).json({
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        requestId: req.id,
        details: zodError.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  // Handle payload too large errors (413)
  if (err.name === 'PayloadTooLargeError' || (err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      error: {
        message: 'Request payload too large',
        code: 'PAYLOAD_TOO_LARGE',
        statusCode: 413,
      },
    });
    return;
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as unknown as { code: string; meta?: Record<string, unknown> };

    if (prismaError.code === 'P2002') {
      res.status(409).json({
        error: {
          message: 'A record with this value already exists',
          code: 'DUPLICATE_ENTRY',
          statusCode: 409,
          requestId: req.id,
        },
      });
      return;
    }

    if (prismaError.code === 'P2025') {
      res.status(404).json({
        error: {
          message: 'Record not found',
          code: 'NOT_FOUND',
          statusCode: 404,
          requestId: req.id,
        },
      });
      return;
    }
  }

  // Default error response
  const statusCode = 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: {
      message,
      code: 'INTERNAL_ERROR',
      statusCode,
      requestId: req.id,
    },
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'ROUTE_NOT_FOUND',
      statusCode: 404,
      requestId: req.id,
    },
  });
}
