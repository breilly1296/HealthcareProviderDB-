// ============================================================================
// Mock setup — must come before imports
// ============================================================================

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    provider: { findUnique: jest.fn() },
    insurancePlan: { findUnique: jest.fn() },
    providerPlanAcceptance: { findFirst: jest.fn(), upsert: jest.fn(), count: jest.fn() },
    verificationLog: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    voteLog: { create: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((fn: any) => fn()),
  },
}));

jest.mock('../../utils/cache', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDelete: jest.fn().mockResolvedValue(undefined),
  invalidateSearchCache: jest.fn().mockResolvedValue(undefined),
  generateSearchCacheKey: jest.fn().mockReturnValue('test-cache-key'),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock rate limiters to be pass-through
jest.mock('../../middleware/rateLimiter', () => ({
  defaultRateLimiter: (_req: any, _res: any, next: any) => next(),
  searchRateLimiter: (_req: any, _res: any, next: any) => next(),
  verificationRateLimiter: (_req: any, _res: any, next: any) => next(),
  voteRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

// Mock captcha to always pass
jest.mock('../../middleware/captcha', () => ({
  verifyCaptcha: (_req: any, _res: any, next: any) => next(),
}));

// Mock honeypot — use real implementation for testing
jest.mock('../../middleware/honeypot', () => ({
  honeypotCheck: (fieldName: string = 'website') => {
    return (req: any, res: any, next: any) => {
      const honeypotValue = req.body?.[fieldName];
      if (honeypotValue) {
        return res.json({ success: true, data: { id: 'submitted' } });
      }
      next();
    };
  },
}));

// Mock request timeout to be pass-through
jest.mock('../../middleware/requestTimeout', () => ({
  searchTimeout: (_req: any, _res: any, next: any) => next(),
  generalTimeout: (_req: any, _res: any, next: any) => next(),
  adminTimeout: (_req: any, _res: any, next: any) => next(),
}));

// Mock verification service
const mockSubmitVerification = jest.fn();
const mockVoteOnVerification = jest.fn();
const mockGetVerificationStats = jest.fn();
const mockGetRecentVerifications = jest.fn();
const mockGetVerificationsForPair = jest.fn();

jest.mock('../../services/verificationService', () => ({
  submitVerification: (...args: any[]) => mockSubmitVerification(...args),
  voteOnVerification: (...args: any[]) => mockVoteOnVerification(...args),
  getVerificationStats: (...args: any[]) => mockGetVerificationStats(...args),
  getRecentVerifications: (...args: any[]) => mockGetRecentVerifications(...args),
  getVerificationsForPair: (...args: any[]) => mockGetVerificationsForPair(...args),
}));

// Mock confidence service
jest.mock('../../services/confidenceService', () => ({
  enrichAcceptanceWithConfidence: jest.fn((acceptance: any, options?: any) => ({
    ...acceptance,
    confidenceLevel: 'MEDIUM',
    confidenceDescription: 'Community verified',
    confidence: {
      score: 50,
      level: 'MEDIUM',
      description: 'Community verified',
      factors: { dataSourceScore: 0, recencyScore: 0, verificationScore: 25, agreementScore: 25 },
    },
  })),
}));

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler';
import verifyRouter from '../verify';

// ============================================================================
// Test app setup
// ============================================================================

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/verify', verifyRouter);
  app.use(errorHandler);
  return app;
}

// ============================================================================
// Test data factories
// ============================================================================

function makeMockVerification(overrides: Record<string, any> = {}) {
  return {
    id: 'clx1234567890',
    providerNpi: '1234567890',
    planId: 'H1234-001',
    acceptsInsurance: true,
    acceptsNewPatients: true,
    notes: null,
    upvotes: 0,
    downvotes: 0,
    status: 'PENDING',
    createdAt: new Date('2025-03-01').toISOString(),
    ...overrides,
  };
}

function makeMockAcceptance(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    providerNpi: '1234567890',
    planId: 'H1234-001',
    locationId: null,
    acceptanceStatus: 'ACCEPTED',
    confidenceScore: 65,
    lastVerified: new Date('2025-01-15'),
    verificationCount: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Verify Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // POST /verify
  // ==========================================================================
  describe('POST /api/v1/verify', () => {
    const validBody = {
      npi: '1234567890',
      planId: 'H1234-001',
      acceptsInsurance: true,
    };

    it('successfully submits a verification', async () => {
      const verification = makeMockVerification();
      const acceptance = makeMockAcceptance();
      mockSubmitVerification.mockResolvedValue({ verification, acceptance });

      const res = await request(app)
        .post('/api/v1/verify')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verification).toBeDefined();
      expect(res.body.data.acceptance).toBeDefined();
      expect(res.body.data.message).toBe('Verification submitted successfully');
    });

    it('includes enriched confidence data in acceptance response', async () => {
      const verification = makeMockVerification();
      const acceptance = makeMockAcceptance();
      mockSubmitVerification.mockResolvedValue({ verification, acceptance });

      const res = await request(app)
        .post('/api/v1/verify')
        .send(validBody);

      expect(res.body.data.acceptance.confidenceLevel).toBe('MEDIUM');
      expect(res.body.data.acceptance.confidenceDescription).toBe('Community verified');
    });

    it('accepts optional fields (notes, submittedBy, acceptsNewPatients)', async () => {
      const verification = makeMockVerification();
      const acceptance = makeMockAcceptance();
      mockSubmitVerification.mockResolvedValue({ verification, acceptance });

      const res = await request(app)
        .post('/api/v1/verify')
        .send({
          ...validBody,
          acceptsNewPatients: true,
          notes: 'Called and confirmed',
          submittedBy: 'user@example.com',
        });

      expect(res.status).toBe(201);
      expect(mockSubmitVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: 'Called and confirmed',
          submittedBy: 'user@example.com',
          acceptsNewPatients: true,
        }),
      );
    });

    it('rejects request missing required npi field', async () => {
      const res = await request(app)
        .post('/api/v1/verify')
        .send({ planId: 'H1234-001', acceptsInsurance: true });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects request missing required planId field', async () => {
      const res = await request(app)
        .post('/api/v1/verify')
        .send({ npi: '1234567890', acceptsInsurance: true });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects request missing required acceptsInsurance field', async () => {
      const res = await request(app)
        .post('/api/v1/verify')
        .send({ npi: '1234567890', planId: 'H1234-001' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid NPI format (not 10 digits)', async () => {
      const res = await request(app)
        .post('/api/v1/verify')
        .send({ npi: '123', planId: 'H1234-001', acceptsInsurance: true });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('silently accepts request with honeypot filled (bot detection)', async () => {
      const res = await request(app)
        .post('/api/v1/verify')
        .send({
          ...validBody,
          website: 'http://spam-site.com',
        });

      // Honeypot returns fake 200 success to not alert the bot
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // But the verification service was never called
      expect(mockSubmitVerification).not.toHaveBeenCalled();
    });

    it('passes captchaToken through to service', async () => {
      const verification = makeMockVerification();
      const acceptance = makeMockAcceptance();
      mockSubmitVerification.mockResolvedValue({ verification, acceptance });

      await request(app)
        .post('/api/v1/verify')
        .send({ ...validBody, captchaToken: 'test-token-123' });

      expect(mockSubmitVerification).toHaveBeenCalledWith(
        expect.objectContaining({ captchaToken: 'test-token-123' }),
      );
    });

    it('rejects invalid email format in submittedBy', async () => {
      const res = await request(app)
        .post('/api/v1/verify')
        .send({ ...validBody, submittedBy: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // POST /verify/:verificationId/vote
  // ==========================================================================
  describe('POST /api/v1/verify/:verificationId/vote', () => {
    it('successfully records an upvote', async () => {
      mockVoteOnVerification.mockResolvedValue({
        id: 'clx1234567890',
        upvotes: 1,
        downvotes: 0,
        voteChanged: false,
      });

      const res = await request(app)
        .post('/api/v1/verify/clx1234567890/vote')
        .send({ vote: 'up' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verification.upvotes).toBe(1);
      expect(res.body.data.verification.netVotes).toBe(1);
      expect(res.body.data.message).toContain('Vote recorded');
    });

    it('successfully records a downvote', async () => {
      mockVoteOnVerification.mockResolvedValue({
        id: 'clx1234567890',
        upvotes: 0,
        downvotes: 1,
        voteChanged: false,
      });

      const res = await request(app)
        .post('/api/v1/verify/clx1234567890/vote')
        .send({ vote: 'down' });

      expect(res.status).toBe(200);
      expect(res.body.data.verification.downvotes).toBe(1);
      expect(res.body.data.verification.netVotes).toBe(-1);
    });

    it('indicates when vote was changed', async () => {
      mockVoteOnVerification.mockResolvedValue({
        id: 'clx1234567890',
        upvotes: 1,
        downvotes: 0,
        voteChanged: true,
      });

      const res = await request(app)
        .post('/api/v1/verify/clx1234567890/vote')
        .send({ vote: 'up' });

      expect(res.body.data.message).toContain('Vote changed');
    });

    it('rejects invalid vote value', async () => {
      const res = await request(app)
        .post('/api/v1/verify/clx1234567890/vote')
        .send({ vote: 'INVALID' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects missing vote field', async () => {
      const res = await request(app)
        .post('/api/v1/verify/clx1234567890/vote')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('silently accepts vote request with honeypot filled', async () => {
      const res = await request(app)
        .post('/api/v1/verify/clx1234567890/vote')
        .send({ vote: 'up', website: 'http://bot.com' });

      expect(res.status).toBe(200);
      expect(mockVoteOnVerification).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // GET /verify/stats
  // ==========================================================================
  describe('GET /api/v1/verify/stats', () => {
    it('returns verification statistics', async () => {
      mockGetVerificationStats.mockResolvedValue({
        total: 150,
        approved: 120,
        pending: 30,
        recentCount: 10,
      });

      const res = await request(app).get('/api/v1/verify/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stats).toEqual(
        expect.objectContaining({
          total: 150,
          approved: 120,
          pending: 30,
        }),
      );
    });
  });

  // ==========================================================================
  // GET /verify/recent
  // ==========================================================================
  describe('GET /api/v1/verify/recent', () => {
    it('returns recent verifications', async () => {
      const verifications = [
        makeMockVerification({ id: 'clx111' }),
        makeMockVerification({ id: 'clx222' }),
      ];
      mockGetRecentVerifications.mockResolvedValue(verifications);

      const res = await request(app).get('/api/v1/verify/recent');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verifications).toHaveLength(2);
      expect(res.body.data.count).toBe(2);
    });

    it('accepts filter query params (limit, npi, planId)', async () => {
      mockGetRecentVerifications.mockResolvedValue([]);

      const res = await request(app).get(
        '/api/v1/verify/recent?limit=5&npi=1234567890&planId=H1234-001',
      );

      expect(res.status).toBe(200);
      expect(mockGetRecentVerifications).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
          npi: '1234567890',
          planId: 'H1234-001',
        }),
      );
    });

    it('rejects limit > 100', async () => {
      const res = await request(app).get('/api/v1/verify/recent?limit=200');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // GET /verify/:npi/:planId
  // ==========================================================================
  describe('GET /api/v1/verify/:npi/:planId', () => {
    it('returns verifications for a provider-plan pair', async () => {
      const acceptance = makeMockAcceptance();
      const verifications = [makeMockVerification()];
      mockGetVerificationsForPair.mockResolvedValue({
        acceptance,
        verifications,
        summary: { totalVerifications: 1, totalUpvotes: 0, totalDownvotes: 0 },
      });

      const res = await request(app).get('/api/v1/verify/1234567890/H1234-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.npi).toBe('1234567890');
      expect(res.body.data.planId).toBe('H1234-001');
      expect(res.body.data.acceptance).toBeDefined();
      expect(res.body.data.acceptance.confidenceLevel).toBe('MEDIUM');
      expect(res.body.data.verifications).toHaveLength(1);
      expect(res.body.data.summary).toEqual(
        expect.objectContaining({ totalVerifications: 1 }),
      );
    });

    it('returns null acceptance when no acceptance record exists', async () => {
      mockGetVerificationsForPair.mockResolvedValue({
        acceptance: null,
        verifications: [],
        summary: { totalVerifications: 0, totalUpvotes: 0, totalDownvotes: 0 },
      });

      const res = await request(app).get('/api/v1/verify/1234567890/H1234-001');

      expect(res.status).toBe(200);
      expect(res.body.data.acceptance).toBeNull();
    });

    it('returns 404 when provider or plan not found', async () => {
      mockGetVerificationsForPair.mockResolvedValue(null);

      const res = await request(app).get('/api/v1/verify/9999999999/NONEXIST');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not found');
    });

    it('rejects invalid NPI in pair route', async () => {
      const res = await request(app).get('/api/v1/verify/abc/H1234-001');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
