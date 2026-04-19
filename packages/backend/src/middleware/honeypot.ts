import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import logger from '../utils/logger';

/**
 * Generate a plausible cuid-shaped id. Matches Prisma's `@default(cuid())`
 * output format (a 'c' prefix + 24 chars of [a-z0-9]) so the bot can't
 * distinguish a honeypot response from a real one by inspecting the id
 * shape. No new dependency needed — `randomBytes` already drives other
 * random-id paths in the codebase.
 */
const CUID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
function fakeCuid(): string {
  const bytes = randomBytes(24);
  let out = 'c';
  for (let i = 0; i < 24; i++) {
    out += CUID_ALPHABET[bytes[i] % CUID_ALPHABET.length];
  }
  return out;
}

/**
 * Honeypot middleware for bot detection.
 *
 * Adds a hidden form field that real users never fill in but bots auto-populate.
 * If the field has a value, the request is silently "accepted" with a fake
 * success response that mimics the real `POST /verify` shape — different id
 * per request, plausible timestamp, same message string — so a bot running
 * the form twice (once with honeypot, once without) can't diff the shapes
 * to detect the trap. (IM-46 / VMP-2026-009)
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

      // Return a shape-matched fake success. 200 status (per task constraint)
      // instead of the real POST /verify's 201 — a deliberate constant
      // tradeoff, since flipping to 201 would pass the shape check but
      // introduce a status-code mismatch on POST /verify/:id/vote (which
      // genuinely returns 200).
      return res.status(200).json({
        success: true,
        data: {
          verification: {
            id: fakeCuid(),
            createdAt: new Date().toISOString(),
          },
          message: 'Verification submitted successfully',
        },
      });
    }
    next();
  };
}
