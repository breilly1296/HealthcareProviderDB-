import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Extend Express Request to include id property
declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Request ID middleware for log correlation across the backend.
 * - Generates a UUID for each request using crypto.randomUUID()
 * - Attaches it to req.id
 * - Sets X-Request-ID response header
 * - If incoming request already has X-Request-ID header, uses that instead (for tracing across services)
 */
function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing X-Request-ID header if present, otherwise generate new UUID
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();

  // Attach to request object
  req.id = requestId;

  // Set response header for client-side correlation
  res.setHeader('X-Request-ID', requestId);

  next();
}

export default requestIdMiddleware;
