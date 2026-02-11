// ============================================================================
// Mock setup — must come before imports
// ============================================================================

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    provider: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    practice_locations: { findMany: jest.fn() },
    providerPlanAcceptance: { findMany: jest.fn(), count: jest.fn() },
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

// Mock request timeout to be pass-through
jest.mock('../../middleware/requestTimeout', () => ({
  searchTimeout: (_req: any, _res: any, next: any) => next(),
  generalTimeout: (_req: any, _res: any, next: any) => next(),
  adminTimeout: (_req: any, _res: any, next: any) => next(),
}));

// Mock location services (excluded from tsconfig, may not compile)
jest.mock('../../services/locationService', () => ({
  getColocatedNpis: jest.fn(),
}));

jest.mock('../../services/locationEnrichment', () => ({
  getLocationHealthSystem: jest.fn().mockResolvedValue(null),
}));

// Mock confidence service
jest.mock('../../services/confidenceService', () => ({
  enrichAcceptanceWithConfidence: jest.fn((acceptance: any) => ({
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
import prisma from '../../lib/prisma';
import { errorHandler } from '../../middleware/errorHandler';
import providersRouter from '../providers';
import { getColocatedNpis } from '../../services/locationService';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetColocatedNpis = getColocatedNpis as jest.Mock;

// ============================================================================
// Test app setup
// ============================================================================

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/providers', providersRouter);
  app.use(errorHandler);
  return app;
}

// ============================================================================
// Test data factories
// ============================================================================

function makeMockProvider(overrides: Record<string, any> = {}) {
  return {
    npi: '1234567890',
    entityType: '1',
    firstName: 'John',
    lastName: 'Smith',
    middleName: null,
    namePrefix: null,
    nameSuffix: null,
    credential: 'MD',
    organizationName: null,
    gender: 'M',
    primaryTaxonomyCode: '207R00000X',
    primarySpecialty: 'Internal Medicine',
    specialtyCategory: 'Allopathic & Osteopathic Physicians',
    deactivationDate: null,
    enumerationDate: '2005-01-01',
    nppes_last_synced: new Date(),
    practice_locations: [
      {
        id: 1,
        address_type: 'practice',
        address_line1: '100 Main St',
        address_line2: null,
        city: 'New York',
        state: 'NY',
        zip_code: '10001',
        phone: '212-555-0100',
        fax: null,
      },
    ],
    provider_cms_details: null,
    provider_hospitals: [],
    provider_insurance: [],
    provider_medicare: [],
    provider_taxonomies: [],
    providerPlanAcceptances: [],
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
    insurancePlan: {
      planId: 'H1234-001',
      planName: 'Blue Cross PPO',
      issuerName: 'Blue Cross',
      planType: 'PPO',
      state: 'NY',
      carrier: 'Anthem',
      planVariant: null,
      rawName: null,
      sourceHealthSystem: null,
      providerCount: 100,
      carrierId: null,
      healthSystemId: null,
      createdAt: new Date(),
    },
    location: null,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Providers Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // GET /providers/search
  // ==========================================================================
  describe('GET /api/v1/providers/search', () => {
    it('returns providers with pagination', async () => {
      const providers = [makeMockProvider({ npi: '1111111111' }), makeMockProvider({ npi: '2222222222' })];
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue(providers);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(2);

      const res = await request(app).get('/api/v1/providers/search?state=NY');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.providers).toHaveLength(2);
      expect(res.body.data.pagination).toEqual(
        expect.objectContaining({
          total: 2,
          page: 1,
          limit: 20,
        }),
      );
    });

    it('returns empty results with pagination when no matches', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(0);

      const res = await request(app).get('/api/v1/providers/search?state=ZZ');

      expect(res.status).toBe(200);
      expect(res.body.data.providers).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it('accepts all valid filter params', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(0);

      const res = await request(app).get(
        '/api/v1/providers/search?state=NY&city=Brooklyn&specialty=Cardiology&name=Smith&entityType=INDIVIDUAL&page=2&limit=10',
      );

      expect(res.status).toBe(200);
    });

    it('respects page and limit query params', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(50);

      const res = await request(app).get('/api/v1/providers/search?page=3&limit=5');

      expect(res.status).toBe(200);
      expect(res.body.data.pagination).toEqual(
        expect.objectContaining({ page: 3, limit: 5, totalPages: 10 }),
      );
    });

    it('rejects limit > 100', async () => {
      const res = await request(app).get('/api/v1/providers/search?limit=200');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('transforms provider data for API response', async () => {
      const provider = makeMockProvider();
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([provider]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(1);

      const res = await request(app).get('/api/v1/providers/search?state=NY');

      const p = res.body.data.providers[0];
      expect(p.npi).toBe('1234567890');
      expect(p.displayName).toBe('John Smith, MD');
      expect(p.city).toBe('New York');
      expect(p.state).toBe('NY');
      expect(p.entityType).toBe('INDIVIDUAL');
    });
  });

  // ==========================================================================
  // GET /providers/cities
  // ==========================================================================
  describe('GET /api/v1/providers/cities', () => {
    it('returns cities for a given state', async () => {
      (mockPrisma.practice_locations.findMany as jest.Mock).mockResolvedValue([
        { city: 'NEW YORK' },
        { city: 'BROOKLYN' },
        { city: 'ALBANY' },
      ]);

      const res = await request(app).get('/api/v1/providers/cities?state=NY');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.state).toBe('NY');
      expect(res.body.data.cities).toBeInstanceOf(Array);
      expect(res.body.data.count).toBeGreaterThan(0);
    });

    it('rejects missing state param', async () => {
      const res = await request(app).get('/api/v1/providers/cities');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid state format (not 2 chars)', async () => {
      const res = await request(app).get('/api/v1/providers/cities?state=NEW');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // GET /providers/:npi
  // ==========================================================================
  describe('GET /api/v1/providers/:npi', () => {
    it('returns provider detail for valid NPI', async () => {
      const provider = makeMockProvider();
      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(provider);

      const res = await request(app).get('/api/v1/providers/1234567890');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.provider.npi).toBe('1234567890');
      expect(res.body.data.provider.displayName).toBe('John Smith, MD');
    });

    it('returns 404 for non-existent NPI', async () => {
      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app).get('/api/v1/providers/9999999999');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not found');
    });

    it('rejects NPI that is not exactly 10 digits', async () => {
      const res = await request(app).get('/api/v1/providers/123');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects NPI with non-digit characters', async () => {
      const res = await request(app).get('/api/v1/providers/12345abcde');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // GET /providers/:npi/colocated
  // ==========================================================================
  describe('GET /api/v1/providers/:npi/colocated', () => {
    it('returns co-located providers', async () => {
      const mainProvider = makeMockProvider();
      const colocatedProvider = makeMockProvider({ npi: '5555555555', firstName: 'Jane' });

      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(mainProvider);
      mockGetColocatedNpis.mockResolvedValue({
        npis: ['5555555555'],
        total: 1,
        page: 1,
        limit: 20,
      });
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([colocatedProvider]);

      const res = await request(app).get('/api/v1/providers/1234567890/colocated');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.providers).toHaveLength(1);
      expect(res.body.data.location).toBeDefined();
      expect(res.body.data.pagination).toBeDefined();
    });

    it('returns empty results when provider has no location', async () => {
      const provider = makeMockProvider({ practice_locations: [] });
      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(provider);

      const res = await request(app).get('/api/v1/providers/1234567890/colocated');

      expect(res.status).toBe(200);
      expect(res.body.data.providers).toEqual([]);
      expect(res.body.data.location).toBeNull();
    });

    it('returns 404 for non-existent provider', async () => {
      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app).get('/api/v1/providers/9999999999/colocated');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // GET /providers/:npi/plans
  // ==========================================================================
  describe('GET /api/v1/providers/:npi/plans', () => {
    it('returns plan acceptances for a valid provider', async () => {
      const provider = makeMockProvider();
      const acceptances = [makeMockAcceptance(), makeMockAcceptance({ id: 2, planId: 'H5678-002' })];

      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(provider);
      (mockPrisma.providerPlanAcceptance.findMany as jest.Mock).mockResolvedValue(acceptances);
      (mockPrisma.providerPlanAcceptance.count as jest.Mock).mockResolvedValue(2);

      const res = await request(app).get('/api/v1/providers/1234567890/plans');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.npi).toBe('1234567890');
      expect(res.body.data.acceptances).toHaveLength(2);
      expect(res.body.data.pagination).toEqual(
        expect.objectContaining({ total: 2, page: 1, limit: 20 }),
      );
    });

    it('returns enriched acceptance data with confidence fields', async () => {
      const provider = makeMockProvider();
      const acceptance = makeMockAcceptance();

      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(provider);
      (mockPrisma.providerPlanAcceptance.findMany as jest.Mock).mockResolvedValue([acceptance]);
      (mockPrisma.providerPlanAcceptance.count as jest.Mock).mockResolvedValue(1);

      const res = await request(app).get('/api/v1/providers/1234567890/plans');

      const acc = res.body.data.acceptances[0];
      expect(acc.confidenceLevel).toBe('MEDIUM');
      expect(acc.confidenceDescription).toBe('Community verified');
      expect(acc.plan).toBeDefined();
      expect(acc.plan.planId).toBe('H1234-001');
      expect(acc.plan.planName).toBe('Blue Cross PPO');
      expect(acc.providerId).toBe('1234567890');
    });

    it('returns empty acceptances array when provider has no plans', async () => {
      const provider = makeMockProvider();

      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(provider);
      (mockPrisma.providerPlanAcceptance.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.providerPlanAcceptance.count as jest.Mock).mockResolvedValue(0);

      const res = await request(app).get('/api/v1/providers/1234567890/plans');

      expect(res.status).toBe(200);
      expect(res.body.data.acceptances).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it('returns 404 for non-existent provider', async () => {
      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app).get('/api/v1/providers/9999999999/plans');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not found');
    });

    it('accepts pagination and filter query params', async () => {
      const provider = makeMockProvider();

      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(provider);
      (mockPrisma.providerPlanAcceptance.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.providerPlanAcceptance.count as jest.Mock).mockResolvedValue(0);

      const res = await request(app).get(
        '/api/v1/providers/1234567890/plans?page=2&limit=5&status=ACCEPTED&minConfidence=50',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.page).toBe(2);
      expect(res.body.data.pagination.limit).toBe(5);
    });

    it('rejects invalid NPI format in plans route', async () => {
      const res = await request(app).get('/api/v1/providers/abc/plans');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
