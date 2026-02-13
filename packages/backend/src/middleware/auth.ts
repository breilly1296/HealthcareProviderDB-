import { Request, Response, NextFunction } from 'express';
import { jwtVerify, errors as joseErrors } from 'jose';
import prisma from '../lib/prisma';
import { AppError } from './errorHandler';
import logger from '../utils/logger';
import { SESSION_ACTIVITY_DEBOUNCE_MS } from '../config/constants';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user: { id: string; email: string; sessionId: string } | null;
    }
  }
}

/**
 * JWT secret encoded as Uint8Array for jose.
 * Lazily initialized on first use so the module can be imported
 * before environment variables are loaded (e.g., in tests).
 */
let jwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array | null {
  if (jwtSecret) return jwtSecret;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  jwtSecret = new TextEncoder().encode(secret);
  return jwtSecret;
}

/**
 * Optional auth middleware — runs on ALL requests.
 *
 * Reads the `vmp_access_token` cookie, verifies it as a JWT, and looks up
 * the session in the database. On success, sets `req.user` with the
 * authenticated user's info. On any failure (missing cookie, invalid JWT,
 * expired session, DB error), sets `req.user = null` and continues —
 * the request proceeds as anonymous. Never throws.
 */
export async function extractUser(req: Request, _res: Response, next: NextFunction) {
  req.user = null;

  const token = req.cookies?.vmp_access_token;
  if (!token) {
    return next();
  }

  const secret = getJwtSecret();
  if (!secret) {
    logger.warn('JWT_SECRET not configured, skipping token verification');
    return next();
  }

  try {
    const { payload } = await jwtVerify(token, secret);

    const userId = payload.sub;
    const email = payload.email as string | undefined;
    const sessionId = payload.sid as string | undefined;

    if (!userId || !email || !sessionId) {
      return next();
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId || session.expiresAt < new Date()) {
      return next();
    }

    req.user = { id: userId, email, sessionId };

    // Touch lastUsedAt with debounce to avoid excessive DB writes
    const now = Date.now();
    const lastUsed = session.lastUsedAt?.getTime() ?? 0;
    if (now - lastUsed > SESSION_ACTIVITY_DEBOUNCE_MS) {
      prisma.session.update({
        where: { id: sessionId },
        data: { lastUsedAt: new Date(now) },
      }).catch(err => {
        logger.warn({ error: err instanceof Error ? err.message : 'Unknown', sessionId }, 'Failed to update session lastUsedAt');
      });
    }
  } catch (error) {
    // Expected for expired/malformed tokens — don't log as error
    if (error instanceof joseErrors.JWTExpired || error instanceof joseErrors.JWTClaimValidationFailed) {
      logger.debug({ error: (error as Error).message }, 'JWT validation failed');
    } else {
      logger.warn({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Token verification failed');
    }
  }

  next();
}

/**
 * Route-level guard — rejects unauthenticated requests.
 *
 * Must be placed AFTER `extractUser` in the middleware chain.
 * If `req.user` is null (anonymous), responds with 401.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(AppError.unauthorized('Authentication required'));
  }
  next();
}
