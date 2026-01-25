import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const MIN_SCORE = 0.5; // Threshold for bot detection (0.0 = bot, 1.0 = human)

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * CAPTCHA verification middleware using Google reCAPTCHA v3
 *
 * Protects endpoints from automated abuse by verifying the captchaToken
 * provided in the request body or x-captcha-token header.
 *
 * Gracefully degrades:
 * - Skips in development/test environments
 * - Skips if RECAPTCHA_SECRET_KEY not configured (with warning)
 * - Fails open on Google API errors (with logging)
 */
export async function verifyCaptcha(req: Request, res: Response, next: NextFunction) {
  // Skip in development/test environments
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return next();
  }

  // Skip if CAPTCHA not configured (but log warning)
  if (!RECAPTCHA_SECRET) {
    console.warn('[Security] CAPTCHA not configured - skipping verification');
    return next();
  }

  const captchaToken = req.body.captchaToken || req.headers['x-captcha-token'];

  if (!captchaToken) {
    return next(AppError.badRequest('CAPTCHA token required for verification submissions'));
  }

  try {
    // Use native fetch (available in Node 18+)
    const params = new URLSearchParams({
      secret: RECAPTCHA_SECRET,
      response: captchaToken as string,
      remoteip: req.ip || '',
    });

    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      body: params,
    });

    const data = (await response.json()) as RecaptchaResponse;

    if (!data.success) {
      console.warn(`[Security] CAPTCHA failed from IP ${req.ip}:`, data['error-codes']);
      return next(AppError.badRequest('CAPTCHA verification failed'));
    }

    // reCAPTCHA v3 returns a score (0.0 - 1.0)
    if (data.score !== undefined && data.score < MIN_SCORE) {
      console.warn(`[Security] Low CAPTCHA score: ${data.score} from IP ${req.ip}`);
      return next(AppError.forbidden('Request blocked due to suspicious activity'));
    }

    next();
  } catch (error) {
    // Fail open in case of Google API issues (but log it)
    console.error('[Security] CAPTCHA verification error:', error);
    next();
  }
}
