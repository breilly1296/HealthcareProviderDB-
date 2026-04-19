import { Request, Response, NextFunction } from 'express';
import { honeypotCheck } from '../honeypot';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import logger from '../../utils/logger';

// ============================================================================
// Test helpers
// ============================================================================

function makeMockReq(body: Record<string, any> = {}): Partial<Request> {
  return { body, ip: '127.0.0.1', path: '/test' };
}

function makeMockRes(): Partial<Response> & { jsonData: any; statusCode: number } {
  const res: any = {
    jsonData: null,
    statusCode: 200,
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockImplementation((data: any) => {
    res.jsonData = data;
    return res;
  });
  return res;
}

// ============================================================================
// Tests
// ============================================================================

describe('honeypotCheck middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Default field name ('website')
  // --------------------------------------------------------------------------

  it('calls next() when honeypot field is not present in body', () => {
    const middleware = honeypotCheck();
    const req = makeMockReq({ npi: '1234567890' });
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() when honeypot field is empty string', () => {
    const middleware = honeypotCheck();
    const req = makeMockReq({ website: '' });
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns fake success (200) when honeypot field is filled', () => {
    const middleware = honeypotCheck();
    const req = makeMockReq({ website: 'http://spam.com' });
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      data: {
        verification: {
          id: expect.stringMatching(/^c[a-z0-9]{24}$/),
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
        message: 'Verification submitted successfully',
      },
    });
  });

  it('does NOT call next() when honeypot is triggered (blocks pipeline)', () => {
    const middleware = honeypotCheck();
    const req = makeMockReq({ website: 'filled-by-bot' });
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('logs a warning when honeypot is triggered', () => {
    const middleware = honeypotCheck();
    const req = makeMockReq({ website: 'http://evil.bot' });
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: '127.0.0.1',
        field: 'website',
        path: '/test',
      }),
      expect.stringContaining('Honeypot triggered'),
    );
  });

  // --------------------------------------------------------------------------
  // Custom field name
  // --------------------------------------------------------------------------

  it('supports custom field names', () => {
    const middleware = honeypotCheck('company');
    const req = makeMockReq({ company: 'Bot Corp' });
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.jsonData).toEqual({
      success: true,
      data: {
        verification: expect.objectContaining({
          id: expect.stringMatching(/^c[a-z0-9]{24}$/),
        }),
        message: 'Verification submitted successfully',
      },
    });
  });

  it('ignores default field when checking custom field name', () => {
    const middleware = honeypotCheck('company');
    const req = makeMockReq({ website: 'http://spam.com' }); // default field has value, but we're checking 'company'
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows through when custom field is present but empty', () => {
    const middleware = honeypotCheck('fax');
    const req = makeMockReq({ fax: '' });
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  it('handles missing body gracefully (no crash)', () => {
    const middleware = honeypotCheck();
    const req = { ip: '1.2.3.4', path: '/test' } as Partial<Request>;
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('treats any truthy value as bot detection (not just strings)', () => {
    const middleware = honeypotCheck();
    const req = makeMockReq({ website: 123 });
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('returns a fresh cuid-shaped id on each call (defeats shape-diff detection)', () => {
    const middleware = honeypotCheck();
    const next = jest.fn();

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const req = makeMockReq({ website: 'http://malicious.bot/form' });
      const res = makeMockRes();
      middleware(req as Request, res as unknown as Response, next);
      ids.push(res.jsonData.data.verification.id);
    }

    // Every id is cuid-shaped and unique — a bot that submits twice and
    // diffs the responses can't use `id === id` to confirm the honeypot.
    for (const id of ids) {
      expect(id).toMatch(/^c[a-z0-9]{24}$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
