/**
 * Tests for verifyCaptcha middleware.
 *
 * The middleware reads process.env at module load time for RECAPTCHA_SECRET_KEY
 * and at request time for NODE_ENV. We use jest.isolateModules to re-import
 * the module with different env states for each scenario.
 */

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { Request, Response, NextFunction } from 'express';

// ============================================================================
// Test helpers
// ============================================================================

function makeMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    body: {},
    headers: {},
    ip: '127.0.0.1',
    path: '/test',
    method: 'POST',
    get: jest.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

function makeMockRes(): Partial<Response> {
  const res: any = {};
  res.setHeader = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Import verifyCaptcha fresh with specific env vars.
 * This is needed because RECAPTCHA_SECRET is captured at module load time.
 */
function loadCaptchaModule(envOverrides: Record<string, string | undefined> = {}) {
  const originalEnv = { ...process.env };

  // Apply overrides
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  let verifyCaptcha: (req: Request, res: Response, next: NextFunction) => Promise<void>;

  jest.isolateModules(() => {
    const mod = require('../captcha');
    verifyCaptcha = mod.verifyCaptcha;
  });

  // Restore env immediately (the module already captured what it needs)
  process.env = originalEnv;

  return verifyCaptcha!;
}

// ============================================================================
// Tests
// ============================================================================

describe('verifyCaptcha middleware', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Environment skipping
  // --------------------------------------------------------------------------

  describe('environment skipping', () => {
    it('skips validation in test environment', async () => {
      const verifyCaptcha = loadCaptchaModule({
        RECAPTCHA_SECRET_KEY: 'test-secret',
        NODE_ENV: 'test',
      });
      // Ensure NODE_ENV is 'test' at request time
      process.env.NODE_ENV = 'test';

      const req = makeMockReq({ body: { captchaToken: 'token' } });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('skips validation in development environment', async () => {
      const verifyCaptcha = loadCaptchaModule({
        RECAPTCHA_SECRET_KEY: 'test-secret',
        NODE_ENV: 'development',
      });
      process.env.NODE_ENV = 'development';

      const req = makeMockReq();
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  // --------------------------------------------------------------------------
  // Missing RECAPTCHA_SECRET_KEY
  // --------------------------------------------------------------------------

  describe('missing RECAPTCHA_SECRET_KEY', () => {
    it('skips validation with warning when secret key is not configured', async () => {
      const logger = require('../../utils/logger').default;
      const verifyCaptcha = loadCaptchaModule({
        RECAPTCHA_SECRET_KEY: undefined,
        NODE_ENV: 'production',
      });
      process.env.NODE_ENV = 'production';

      const req = makeMockReq({ body: { captchaToken: 'token' } });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '/test' }),
        expect.stringContaining('RECAPTCHA_SECRET_KEY missing'),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Token validation
  // --------------------------------------------------------------------------

  describe('token validation (production mode)', () => {
    let verifyCaptcha: (req: Request, res: Response, next: NextFunction) => Promise<void>;

    beforeEach(() => {
      verifyCaptcha = loadCaptchaModule({
        RECAPTCHA_SECRET_KEY: 'test-secret-key',
        NODE_ENV: 'production',
        CAPTCHA_FAIL_MODE: 'open',
      });
      process.env.NODE_ENV = 'production';
    });

    it('returns 400 when captcha token is missing', async () => {
      const req = makeMockReq({ body: {} });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('CAPTCHA token required'),
        }),
      );
    });

    it('passes request through on successful CAPTCHA validation', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, score: 0.9, action: 'submit' }),
      }) as any;

      const req = makeMockReq({ body: { captchaToken: 'valid-token' } });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.google.com/recaptcha/api/siteverify',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('reads token from x-captcha-token header as fallback', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, score: 0.8 }),
      }) as any;

      const req = makeMockReq({
        body: {},
        headers: { 'x-captcha-token': 'header-token' },
      });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('returns 400 when Google says verification failed', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
      }) as any;

      const req = makeMockReq({ body: { captchaToken: 'bad-token' } });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('CAPTCHA verification failed'),
        }),
      );
    });

    it('returns 403 when score is below threshold (0.5)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, score: 0.2, action: 'submit' }),
      }) as any;

      const req = makeMockReq({ body: { captchaToken: 'low-score-token' } });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: expect.stringContaining('suspicious activity'),
        }),
      );
    });

    it('allows score exactly at threshold (0.5)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, score: 0.5 }),
      }) as any;

      const req = makeMockReq({ body: { captchaToken: 'edge-token' } });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  // --------------------------------------------------------------------------
  // Fail-open mode
  // --------------------------------------------------------------------------

  describe('fail-open mode (Google API errors)', () => {
    let verifyCaptcha: (req: Request, res: Response, next: NextFunction) => Promise<void>;

    beforeEach(() => {
      verifyCaptcha = loadCaptchaModule({
        RECAPTCHA_SECRET_KEY: 'test-secret-key',
        NODE_ENV: 'production',
        CAPTCHA_FAIL_MODE: 'open',
      });
      process.env.NODE_ENV = 'production';
    });

    it('allows request when Google API throws a network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;

      const req = makeMockReq({ body: { captchaToken: 'token' } });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      // Should allow the request through (fail-open)
      expect(next).toHaveBeenCalledWith();
    });

    it('sets X-Security-Degraded header when failing open', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as any;

      const req = makeMockReq({ body: { captchaToken: 'token' } });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Security-Degraded', 'captcha-unavailable');
    });

    it('sets fallback rate limit headers when failing open', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as any;

      const req = makeMockReq({ body: { captchaToken: 'token' } });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Fallback-RateLimit-Limit', 3);
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Fallback-RateLimit-Remaining',
        expect.any(Number),
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Fallback-RateLimit-Reset',
        expect.any(Number),
      );
    });

    it('enforces fallback rate limit (3/hr) after repeated fail-open requests', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as any;

      const req = makeMockReq({ body: { captchaToken: 'token' }, ip: '10.10.10.10' });
      const res = makeMockRes();

      // First 3 requests should be allowed (fallback limit is 3/hr)
      for (let i = 0; i < 3; i++) {
        const next = jest.fn();
        await verifyCaptcha(req as Request, res as Response, next);
        expect(next).toHaveBeenCalledWith();
      }

      // 4th request should be blocked by fallback rate limiter
      const next4 = jest.fn();
      await verifyCaptcha(req as Request, res as Response, next4);

      expect(next4).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 429,
          message: expect.stringContaining('Too many requests'),
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Fail-closed mode
  // --------------------------------------------------------------------------

  describe('fail-closed mode', () => {
    it('blocks request when Google API fails in closed mode', async () => {
      const verifyCaptcha = loadCaptchaModule({
        RECAPTCHA_SECRET_KEY: 'test-secret-key',
        NODE_ENV: 'production',
        CAPTCHA_FAIL_MODE: 'closed',
      });
      process.env.NODE_ENV = 'production';

      global.fetch = jest.fn().mockRejectedValue(new Error('API down')) as any;

      const req = makeMockReq({ body: { captchaToken: 'token' } });
      const res = makeMockRes();
      const next = jest.fn();

      await verifyCaptcha(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('Security verification temporarily unavailable'),
        }),
      );
    });
  });
});
