import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { magicLinkRateLimiter } from '../middleware/rateLimiter';
import {
  sendMagicLink,
  verifyMagicLink,
  refreshSession,
  logout,
  getMe,
  exportUserData,
} from '../services/authService';
import { MS_PER_DAY } from '../config/constants';

const router = Router();

// ============================================================================
// Validation schemas
// ============================================================================

const magicLinkSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
});

const verifyQuerySchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// ============================================================================
// Cookie helpers
// ============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const FRONTEND_URL = process.env.MAGIC_LINK_BASE_URL || 'https://verifymyprovider.com';
const COOKIE_DOMAIN = IS_PRODUCTION ? '.verifymyprovider.com' : undefined;

function setAuthCookies(res: import('express').Response, accessToken: string, refreshToken: string) {
  res.cookie('vmp_access_token', accessToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    domain: COOKIE_DOMAIN,
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('vmp_refresh_token', refreshToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    domain: COOKIE_DOMAIN,
    path: '/api/v1/auth',
    maxAge: 30 * MS_PER_DAY, // 30 days
  });
}

function clearAuthCookies(res: import('express').Response) {
  res.clearCookie('vmp_access_token', { path: '/', domain: COOKIE_DOMAIN });
  res.clearCookie('vmp_refresh_token', { path: '/api/v1/auth', domain: COOKIE_DOMAIN });
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/v1/auth/magic-link
 * Request a magic link login email.
 * Always returns success to prevent email enumeration.
 */
router.post(
  '/magic-link',
  magicLinkRateLimiter,
  asyncHandler(async (req, res) => {
    const { email } = magicLinkSchema.parse(req.body);

    await sendMagicLink(email, req.ip);

    res.json({
      success: true,
      message: "If this email is valid, you'll receive a login link.",
    });
  })
);

/**
 * GET /api/v1/auth/verify
 * Verify a magic link token (user clicked the email link).
 * Sets auth cookies and redirects to the app.
 *
 * This is a browser navigation (email link click), so ALL outcomes must
 * redirect — never return JSON.
 */
router.get('/verify', async (req, res) => {
  try {
    const parsed = verifyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.redirect(302, `${FRONTEND_URL}/login?error=invalid`);
      return;
    }

    const result = await verifyMagicLink(
      parsed.data.token,
      req.ip,
      req.get('User-Agent')
    );

    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.redirect(302, `${FRONTEND_URL}/saved-providers`);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    const errorCode = message.includes('expired') ? 'expired'
      : message.includes('already been used') ? 'used'
      : 'invalid';
    res.redirect(302, `${FRONTEND_URL}/login?error=${errorCode}`);
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh the access token using the refresh token cookie.
 */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.vmp_refresh_token;

    if (!refreshToken) {
      throw AppError.unauthorized('No refresh token provided');
    }

    const result = await refreshSession(refreshToken);

    setAuthCookies(res, result.accessToken, result.refreshToken);

    res.json({ success: true });
  })
);

/**
 * POST /api/v1/auth/logout
 * Clear session and auth cookies. Requires authentication.
 */
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await logout(req.user!.sessionId);

    clearAuthCookies(res);

    res.json({ success: true });
  })
);

/**
 * GET /api/v1/auth/me
 * Get the current authenticated user's profile. Requires authentication.
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getMe(req.user!.id);

    res.json({
      success: true,
      data: { user },
    });
  })
);

/**
 * GET /api/v1/auth/export
 * Export all user data (GDPR data portability). Requires authentication.
 */
router.get(
  '/export',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await exportUserData(req.user!.id);

    res.json({
      success: true,
      data,
    });
  })
);

export default router;
