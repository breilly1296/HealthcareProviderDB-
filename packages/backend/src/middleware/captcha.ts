import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import {
  CAPTCHA_MIN_SCORE,
  CAPTCHA_API_TIMEOUT_MS,
  CAPTCHA_FALLBACK_MAX_REQUESTS,
  CAPTCHA_FALLBACK_WINDOW_MS,
  RATE_LIMIT_CLEANUP_INTERVAL_MS,
} from '../config/constants';

/**
 * CAPTCHA Verification Middleware (Google reCAPTCHA v3)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FAIL-OPEN vs FAIL-CLOSED TRADEOFF
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When Google's reCAPTCHA API is unavailable (network error, timeout, outage),
 * the middleware must choose between:
 *
 * FAIL-OPEN (CAPTCHA_FAIL_MODE=open) - Default:
 *   - Allows requests through when Google API fails
 *   - Prioritizes AVAILABILITY over security
 *   - Risk: Attackers could exploit Google outages to bypass CAPTCHA
 *   - Mitigation: Fallback rate limiting is applied (3 requests/hour vs normal 10)
 *   - Use for: User-facing features where downtime is unacceptable
 *
 * FAIL-CLOSED (CAPTCHA_FAIL_MODE=closed):
 *   - Blocks ALL requests when Google API fails
 *   - Prioritizes SECURITY over availability
 *   - Risk: Legitimate users blocked during Google outages
 *   - Use for: High-security endpoints (financial, admin, etc.)
 *
 * Environment Variables:
 *   CAPTCHA_FAIL_MODE=open|closed  (default: open)
 *   RECAPTCHA_SECRET_KEY           (required for production)
 *
 * Monitoring:
 *   Watch for "[CAPTCHA] Google API error" logs to detect outages
 *   Alert on high volume of "FAIL-OPEN: Allowing request" logs
 *
 * See also: docs/SCALING.md for rate limiting configuration
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

// Fail mode configuration
type FailMode = 'open' | 'closed';
const CAPTCHA_FAIL_MODE: FailMode = (process.env.CAPTCHA_FAIL_MODE as FailMode) || 'open';

// Log configuration on module load (only in production where CAPTCHA is active)
if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  const failModeDescription = CAPTCHA_FAIL_MODE === 'open'
    ? 'requests allowed with fallback rate limiting if Google API fails'
    : 'requests blocked if Google API fails';
  console.log(`[CAPTCHA] Fail mode: ${CAPTCHA_FAIL_MODE} (${failModeDescription})`);
}

// Fallback rate limiting when CAPTCHA fails (much stricter than normal)
// Normal verification limit: 10/hour. Fallback: 3/hour
const fallbackStore: Map<string, { count: number; resetAt: number }> = new Map();

// Cleanup fallback store periodically
setInterval(() => {
  const now = Date.now();
  fallbackStore.forEach((entry, key) => {
    if (entry.resetAt < now) {
      fallbackStore.delete(key);
    }
  });
}, RATE_LIMIT_CLEANUP_INTERVAL_MS);

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * Check fallback rate limit (used when Google API fails and CAPTCHA_FAIL_MODE=open)
 * Much stricter than normal rate limits to mitigate CAPTCHA bypass risk
 */
function checkFallbackRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `captcha-fallback:${ip}`;

  let entry = fallbackStore.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + CAPTCHA_FALLBACK_WINDOW_MS };
    fallbackStore.set(key, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= CAPTCHA_FALLBACK_MAX_REQUESTS,
    remaining: Math.max(0, CAPTCHA_FALLBACK_MAX_REQUESTS - entry.count),
    resetAt: entry.resetAt,
  };
}

/**
 * CAPTCHA verification middleware using Google reCAPTCHA v3
 *
 * Protects endpoints from automated abuse by verifying the captchaToken
 * provided in the request body or x-captcha-token header.
 *
 * Graceful degradation:
 * - Skips in development/test environments
 * - Skips if RECAPTCHA_SECRET_KEY not configured (with warning)
 * - On Google API failure: behavior depends on CAPTCHA_FAIL_MODE
 */
export async function verifyCaptcha(req: Request, res: Response, next: NextFunction) {
  // Skip in development/test environments
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return next();
  }

  // Skip if CAPTCHA not configured (but log warning)
  if (!RECAPTCHA_SECRET) {
    console.warn('[CAPTCHA] Not configured - RECAPTCHA_SECRET_KEY missing. Skipping verification.', {
      endpoint: req.path,
      method: req.method,
    });
    return next();
  }

  const captchaToken = req.body.captchaToken || req.headers['x-captcha-token'];
  const clientIp = req.ip || 'unknown';

  if (!captchaToken) {
    return next(AppError.badRequest('CAPTCHA token required for verification submissions'));
  }

  try {
    const params = new URLSearchParams({
      secret: RECAPTCHA_SECRET,
      response: captchaToken as string,
      remoteip: clientIp,
    });

    // Add timeout to prevent hanging on slow Google API responses
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CAPTCHA_API_TIMEOUT_MS);

    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      body: params,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = (await response.json()) as RecaptchaResponse;

    if (!data.success) {
      console.warn('[CAPTCHA] Verification failed', {
        ip: clientIp,
        errors: data['error-codes'],
        action: data.action,
        endpoint: req.path,
      });
      return next(AppError.badRequest('CAPTCHA verification failed'));
    }

    // reCAPTCHA v3 returns a score (0.0 - 1.0)
    if (data.score !== undefined && data.score < CAPTCHA_MIN_SCORE) {
      console.warn('[CAPTCHA] Low score - possible bot', {
        ip: clientIp,
        score: data.score,
        threshold: CAPTCHA_MIN_SCORE,
        action: data.action,
        endpoint: req.path,
      });
      return next(AppError.forbidden('Request blocked due to suspicious activity'));
    }

    // CAPTCHA verification passed
    next();
  } catch (error) {
    // Google API failed - behavior depends on CAPTCHA_FAIL_MODE
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = error instanceof Error && error.name === 'AbortError';

    console.error('[CAPTCHA] Google API error - CAPTCHA verification unavailable', {
      ip: clientIp,
      error: errorMessage,
      isTimeout,
      failMode: CAPTCHA_FAIL_MODE,
      endpoint: req.path,
      timestamp: new Date().toISOString(),
    });

    if (CAPTCHA_FAIL_MODE === 'closed') {
      // FAIL-CLOSED: Block all requests when Google API unavailable
      console.warn('[CAPTCHA] FAIL-CLOSED: Blocking request due to API unavailability', {
        ip: clientIp,
        endpoint: req.path,
      });
      return next(AppError.serviceUnavailable(
        'Security verification temporarily unavailable. Please try again in a few minutes.'
      ));
    }

    // FAIL-OPEN: Allow request but apply stricter fallback rate limiting
    const fallbackResult = checkFallbackRateLimit(clientIp);

    // Set headers indicating degraded security and fallback limits
    res.setHeader('X-Security-Degraded', 'captcha-unavailable');
    res.setHeader('X-Fallback-RateLimit-Limit', CAPTCHA_FALLBACK_MAX_REQUESTS);
    res.setHeader('X-Fallback-RateLimit-Remaining', fallbackResult.remaining);
    res.setHeader('X-Fallback-RateLimit-Reset', Math.ceil(fallbackResult.resetAt / 1000));

    if (!fallbackResult.allowed) {
      console.warn('[CAPTCHA] FAIL-OPEN: Fallback rate limit exceeded', {
        ip: clientIp,
        limit: CAPTCHA_FALLBACK_MAX_REQUESTS,
        window: '1 hour',
        endpoint: req.path,
      });
      return next(AppError.tooManyRequests(
        'Too many requests while security verification is unavailable. Please try again later.'
      ));
    }

    console.warn('[CAPTCHA] FAIL-OPEN: Allowing request with fallback rate limiting', {
      ip: clientIp,
      remaining: fallbackResult.remaining,
      limit: CAPTCHA_FALLBACK_MAX_REQUESTS,
      endpoint: req.path,
    });

    next();
  }
}
