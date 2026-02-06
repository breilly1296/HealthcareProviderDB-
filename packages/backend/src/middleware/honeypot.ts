import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Honeypot middleware for bot detection.
 *
 * Adds a hidden form field that real users never fill in but bots auto-populate.
 * If the field has a value, the request is silently "accepted" (200 OK with a
 * fake success response) so the bot doesn't know it was caught.
 */
export function honeypotCheck(fieldName: string = 'website') {
  return (req: Request, res: Response, next: NextFunction) => {
    const honeypotValue = req.body?.[fieldName];
    if (honeypotValue) {
      logger.warn({
        ip: req.ip,
        field: fieldName,
        path: req.path,
      }, 'Honeypot triggered — likely bot');
      // Return 200 to not alert the bot that it was caught
      return res.json({ success: true, data: { id: 'submitted' } });
    }
    next();
  };
}
