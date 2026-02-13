import { doubleCsrf } from 'csrf-csrf';
import type { Request } from 'express';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE_DOMAIN = IS_PRODUCTION ? '.verifymyprovider.com' : undefined;

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => {
    const secret = process.env.CSRF_SECRET;
    if (!secret) {
      throw new Error('CSRF_SECRET environment variable is required');
    }
    return secret;
  },
  getSessionIdentifier: (req?: Request) =>
    req?.user?.sessionId || req?.ip || 'anonymous',
  cookieName: 'vmp_csrf',
  cookieOptions: {
    httpOnly: false, // JS needs to read it for double-submit pattern
    secure: IS_PRODUCTION,
    sameSite: 'lax' as const,
    path: '/',
    domain: COOKIE_DOMAIN,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req: Request) =>
    req.headers['x-csrf-token'] as string | undefined,
});

export { doubleCsrfProtection as csrfProtection, generateCsrfToken };
