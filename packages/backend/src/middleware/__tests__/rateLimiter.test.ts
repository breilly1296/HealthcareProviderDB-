// Mock Redis to return null (force in-memory mode for all tests)
jest.mock('../../lib/redis', () => ({
  getRedisClient: jest.fn().mockReturnValue(null),
  isRedisConnected: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import express, { Request, Response } from 'express';
import request from 'supertest';
import { createRateLimiter } from '../rateLimiter';

// ============================================================================
// Test helpers
// ============================================================================

/**
 * Create a minimal Express app with a rate-limited endpoint.
 * Each test gets a unique limiter name to avoid shared state.
 */
let limiterCounter = 0;

function createTestApp(options: {
  windowMs: number;
  maxRequests: number;
  name?: string;
}) {
  const app = express();
  const name = options.name || `test-limiter-${++limiterCounter}`;
  const limiter = createRateLimiter({ ...options, name });

  app.get('/test', limiter, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  return app;
}

// ============================================================================
// Tests
// ============================================================================

describe('Rate Limiter Middleware (in-memory mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Basic allow / deny
  // --------------------------------------------------------------------------

  it('allows requests within the limit', async () => {
    const app = createTestApp({ windowMs: 60_000, maxRequests: 5 });

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 429 when limit is exceeded', async () => {
    const app = createTestApp({ windowMs: 60_000, maxRequests: 3 });

    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      await request(app).get('/test');
    }

    // 4th request should be rejected
    const res = await request(app).get('/test');

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many requests');
    expect(res.body.retryAfter).toBeDefined();
  });

  it('allows exactly maxRequests before blocking', async () => {
    const app = createTestApp({ windowMs: 60_000, maxRequests: 2 });

    const res1 = await request(app).get('/test');
    const res2 = await request(app).get('/test');
    const res3 = await request(app).get('/test');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(429);
  });

  // --------------------------------------------------------------------------
  // Rate limit headers
  // --------------------------------------------------------------------------

  it('sets X-RateLimit-Limit header to maxRequests', async () => {
    const app = createTestApp({ windowMs: 60_000, maxRequests: 50 });

    const res = await request(app).get('/test');

    expect(res.headers['x-ratelimit-limit']).toBe('50');
  });

  it('sets X-RateLimit-Remaining header that decrements with each request', async () => {
    const app = createTestApp({ windowMs: 60_000, maxRequests: 5 });

    // Remaining is calculated before adding the current request to the store
    const res1 = await request(app).get('/test');
    expect(res1.headers['x-ratelimit-remaining']).toBe('5');

    const res2 = await request(app).get('/test');
    expect(res2.headers['x-ratelimit-remaining']).toBe('4');

    const res3 = await request(app).get('/test');
    expect(res3.headers['x-ratelimit-remaining']).toBe('3');
  });

  it('sets X-RateLimit-Reset header as a future unix timestamp', async () => {
    const app = createTestApp({ windowMs: 60_000, maxRequests: 5 });

    const res = await request(app).get('/test');

    const resetTimestamp = parseInt(res.headers['x-ratelimit-reset'], 10);
    const nowSec = Math.floor(Date.now() / 1000);

    expect(resetTimestamp).toBeGreaterThan(nowSec);
    expect(resetTimestamp).toBeLessThanOrEqual(nowSec + 61);
  });

  it('sets Retry-After header on 429 responses', async () => {
    const app = createTestApp({ windowMs: 60_000, maxRequests: 1 });

    await request(app).get('/test');
    const res = await request(app).get('/test');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(parseInt(res.headers['retry-after'], 10)).toBeGreaterThan(0);
  });

  it('remaining reaches 0 on the request that hits the limit', async () => {
    const app = createTestApp({ windowMs: 60_000, maxRequests: 2 });

    // req 1: 0 in store, remaining=2, then added (1 in store)
    const res1 = await request(app).get('/test');
    expect(res1.headers['x-ratelimit-remaining']).toBe('2');

    // req 2: 1 in store, remaining=1, then added (2 in store)
    const res2 = await request(app).get('/test');
    expect(res2.headers['x-ratelimit-remaining']).toBe('1');

    // req 3: 2 in store, remaining=0, rejected (429)
    const res3 = await request(app).get('/test');
    expect(res3.status).toBe(429);
    expect(res3.headers['x-ratelimit-remaining']).toBe('0');
  });

  // --------------------------------------------------------------------------
  // IP isolation
  // --------------------------------------------------------------------------

  it('tracks different IPs independently', async () => {
    // Use a custom keyGenerator that reads a test header, since supertest
    // always sends from the same local address
    const app = express();
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      name: `ip-isolation-${++limiterCounter}`,
      keyGenerator: (req: Request) => req.headers['x-test-ip'] as string || 'default',
    });
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    // IP A: 2 requests (should be fine)
    await request(app).get('/test').set('x-test-ip', '1.1.1.1');
    await request(app).get('/test').set('x-test-ip', '1.1.1.1');
    const resA3 = await request(app).get('/test').set('x-test-ip', '1.1.1.1');

    // IP B: First request should still be allowed
    const resB1 = await request(app).get('/test').set('x-test-ip', '2.2.2.2');

    expect(resA3.status).toBe(429);
    expect(resB1.status).toBe(200);
  });

  // --------------------------------------------------------------------------
  // Tier-specific limits
  // --------------------------------------------------------------------------

  it('enforces strict tier (10 requests) limit', async () => {
    const app = createTestApp({ windowMs: 3_600_000, maxRequests: 10, name: `strict-${++limiterCounter}` });

    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    }

    const overLimitRes = await request(app).get('/test');
    expect(overLimitRes.status).toBe(429);
    expect(overLimitRes.headers['x-ratelimit-limit']).toBe('10');
  });

  it('enforces search tier (100 requests) limit header correctly', async () => {
    const app = createTestApp({ windowMs: 3_600_000, maxRequests: 100, name: `search-${++limiterCounter}` });

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('100');
    // First request: 0 in store, remaining = 100
    expect(res.headers['x-ratelimit-remaining']).toBe('100');
  });

  it('enforces default tier (200 requests) limit header correctly', async () => {
    const app = createTestApp({ windowMs: 3_600_000, maxRequests: 200, name: `default-${++limiterCounter}` });

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('200');
    // First request: 0 in store, remaining = 200
    expect(res.headers['x-ratelimit-remaining']).toBe('200');
  });

  // --------------------------------------------------------------------------
  // Custom message
  // --------------------------------------------------------------------------

  it('uses custom rejection message when provided', async () => {
    const app = express();
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      name: `custom-msg-${++limiterCounter}`,
      message: 'Custom rate limit message',
    });
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    await request(app).get('/test');
    const res = await request(app).get('/test');

    expect(res.status).toBe(429);
    expect(res.body.message).toBe('Custom rate limit message');
  });

  // --------------------------------------------------------------------------
  // Skip function
  // --------------------------------------------------------------------------

  it('skips rate limiting when skip function returns true', async () => {
    const app = express();
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      name: `skip-${++limiterCounter}`,
      skip: (req: Request) => req.headers['x-skip'] === 'true',
    });
    app.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    // First request without skip (uses limit)
    await request(app).get('/test');
    // Second request without skip (should be blocked)
    const blocked = await request(app).get('/test');
    expect(blocked.status).toBe(429);

    // Request with skip header bypasses the limiter
    const skipped = await request(app).get('/test').set('x-skip', 'true');
    expect(skipped.status).toBe(200);
  });
});
