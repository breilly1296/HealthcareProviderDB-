import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Request timeout middleware factory.
 * Returns 408 if the response is not sent within the specified duration.
 * Clears the timer when the response finishes normally.
 */
export function requestTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (res.headersSent) {
        return;
      }

      logger.warn({
        requestId: req.id,
        path: req.path,
        method: req.method,
        timeoutMs: ms,
      }, 'Request timed out');

      res.status(408).json({
        success: false,
        error: {
          message: 'Request timed out',
          code: 'REQUEST_TIMEOUT',
          statusCode: 408,
          requestId: req.id,
        },
      });
    }, ms);

    res.on('finish', () => {
      clearTimeout(timer);
    });

    next();
  };
}

export const generalTimeout = requestTimeout(30_000);
export const searchTimeout = requestTimeout(15_000);
export const adminTimeout = requestTimeout(120_000);
