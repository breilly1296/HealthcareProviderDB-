import request from 'supertest';
import express, { Express } from 'express';

// Mock Prisma client before importing routes
const mockPrismaClient = {
  provider: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    groupBy: jest.fn(),
  },
  insurancePlan: {
    count: jest.fn(),
    findUnique: jest.fn(),
  },
  providerPlanAcceptance: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  verificationLog: {
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
  Prisma: {
    ProviderWhereInput: {},
    ProviderPlanAcceptanceWhereInput: {},
  },
  SpecialtyCategory: {
    ENDOCRINOLOGY: 'ENDOCRINOLOGY',
    RHEUMATOLOGY: 'RHEUMATOLOGY',
    ORTHOPEDICS: 'ORTHOPEDICS',
    INTERNAL_MEDICINE: 'INTERNAL_MEDICINE',
    FAMILY_MEDICINE: 'FAMILY_MEDICINE',
    GERIATRICS: 'GERIATRICS',
  },
  AcceptanceStatus: {
    ACCEPTED: 'ACCEPTED',
    NOT_ACCEPTED: 'NOT_ACCEPTED',
    PENDING: 'PENDING',
    UNKNOWN: 'UNKNOWN',
  },
  VerificationType: {
    PLAN_ACCEPTANCE: 'PLAN_ACCEPTANCE',
    PROVIDER_INFO: 'PROVIDER_INFO',
    NEW_PATIENTS: 'NEW_PATIENTS',
  },
  VerificationSource: {
    CMS_DATA: 'CMS_DATA',
    CARRIER_DATA: 'CARRIER_DATA',
    PROVIDER_PORTAL: 'PROVIDER_PORTAL',
    PHONE_CALL: 'PHONE_CALL',
    AUTOMATED: 'AUTOMATED',
    CROWDSOURCE: 'CROWDSOURCE',
  },
}));

// Mock the confidence scoring module
jest.mock('../matching/confidence', () => ({
  calculateConfidenceScore: jest.fn(() => ({
    score: 75,
    factors: {
      dataSourceScore: 20,
      dataSourceReason: 'Test source',
      recencyScore: 20,
      recencyReason: 'Test recency',
      verificationScore: 20,
      verificationReason: 'Test verification',
      crowdsourceScore: 15,
      crowdsourceReason: 'Test crowdsource',
    },
    recommendation: 'Test recommendation',
    needsVerification: false,
  })),
}));

import routes from './routes';

describe('API Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return healthy status when database is connected', async () => {
      mockPrismaClient.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.database).toBe('connected');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should still return healthy when db query returns truthy value', async () => {
      mockPrismaClient.$queryRaw.mockResolvedValue([1]);

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
    });
  });

  describe('GET /api/stats', () => {
    it('should return database statistics', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(1000);
      mockPrismaClient.insurancePlan.count.mockResolvedValue(500);
      mockPrismaClient.providerPlanAcceptance.count.mockResolvedValue(5000);
      mockPrismaClient.verificationLog.count.mockResolvedValue(200);
      mockPrismaClient.provider.groupBy.mockResolvedValue([
        { specialtyCategory: 'ENDOCRINOLOGY', _count: 100 },
        { specialtyCategory: 'RHEUMATOLOGY', _count: 150 },
        { specialtyCategory: 'ORTHOPEDICS', _count: 200 },
      ]);

      const response = await request(app).get('/api/stats');

      expect(response.status).toBe(200);
      expect(response.body.providers).toBe(1000);
      expect(response.body.insurancePlans).toBe(500);
      expect(response.body.planAcceptances).toBe(5000);
      expect(response.body.verifications).toBe(200);
      expect(response.body.bySpecialty).toEqual({
        ENDOCRINOLOGY: 100,
        RHEUMATOLOGY: 150,
        ORTHOPEDICS: 200,
      });
    });

    it('should handle empty specialty groups', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(0);
      mockPrismaClient.insurancePlan.count.mockResolvedValue(0);
      mockPrismaClient.providerPlanAcceptance.count.mockResolvedValue(0);
      mockPrismaClient.verificationLog.count.mockResolvedValue(0);
      mockPrismaClient.provider.groupBy.mockResolvedValue([]);

      const response = await request(app).get('/api/stats');

      expect(response.status).toBe(200);
      expect(response.body.providers).toBe(0);
      expect(response.body.bySpecialty).toEqual({});
    });
  });

  describe('GET /api/providers', () => {
    const mockProviders = [
      {
        id: '1',
        npi: '1234567890',
        entityType: 'INDIVIDUAL',
        firstName: 'John',
        lastName: 'Doe',
        credential: 'MD',
        organizationName: null,
        addressLine1: '123 Medical Dr',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
        phone: '305-555-1234',
        taxonomyCode: '207RE0101X',
        taxonomyDescription: 'Endocrinology',
        specialtyCategory: 'ENDOCRINOLOGY',
        npiStatus: 'ACTIVE',
        _count: { planAcceptances: 5 },
      },
      {
        id: '2',
        npi: '0987654321',
        entityType: 'INDIVIDUAL',
        firstName: 'Jane',
        lastName: 'Smith',
        credential: 'DO',
        organizationName: null,
        addressLine1: '456 Health Ave',
        city: 'Orlando',
        state: 'FL',
        zip: '32801',
        phone: '407-555-5678',
        taxonomyCode: '207RR0500X',
        taxonomyDescription: 'Rheumatology',
        specialtyCategory: 'RHEUMATOLOGY',
        npiStatus: 'ACTIVE',
        _count: { planAcceptances: 3 },
      },
    ];

    it('should return paginated providers with default pagination', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(2);
      mockPrismaClient.provider.findMany.mockResolvedValue(mockProviders);

      const response = await request(app).get('/api/providers');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].planCount).toBe(5);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('should filter by state', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(1);
      mockPrismaClient.provider.findMany.mockResolvedValue([mockProviders[0]]);

      const response = await request(app).get('/api/providers?state=FL');

      expect(response.status).toBe(200);
      expect(mockPrismaClient.provider.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ state: 'FL' }),
        })
      );
    });

    it('should filter by specialty', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(1);
      mockPrismaClient.provider.findMany.mockResolvedValue([mockProviders[0]]);

      const response = await request(app).get('/api/providers?specialty=endocrinology');

      expect(response.status).toBe(200);
      expect(mockPrismaClient.provider.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ specialtyCategory: 'ENDOCRINOLOGY' }),
        })
      );
    });

    it('should filter by city with case-insensitive search', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(1);
      mockPrismaClient.provider.findMany.mockResolvedValue([mockProviders[0]]);

      const response = await request(app).get('/api/providers?city=miami');

      expect(response.status).toBe(200);
      expect(mockPrismaClient.provider.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            city: { contains: 'miami', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should filter by zip prefix', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(1);
      mockPrismaClient.provider.findMany.mockResolvedValue([mockProviders[0]]);

      const response = await request(app).get('/api/providers?zip=33101');

      expect(response.status).toBe(200);
      expect(mockPrismaClient.provider.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            zip: { startsWith: '33101' },
          }),
        })
      );
    });

    it('should filter by name across multiple fields', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(1);
      mockPrismaClient.provider.findMany.mockResolvedValue([mockProviders[0]]);

      const response = await request(app).get('/api/providers?name=Doe');

      expect(response.status).toBe(200);
      expect(mockPrismaClient.provider.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { lastName: { contains: 'Doe', mode: 'insensitive' } },
              { firstName: { contains: 'Doe', mode: 'insensitive' } },
              { organizationName: { contains: 'Doe', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('should support custom pagination', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(100);
      mockPrismaClient.provider.findMany.mockResolvedValue(mockProviders);

      const response = await request(app).get('/api/providers?page=2&limit=10');

      expect(response.status).toBe(200);
      expect(mockPrismaClient.provider.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(10);
    });

    it('should cap limit at 100', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(500);
      mockPrismaClient.provider.findMany.mockResolvedValue(mockProviders);

      const response = await request(app).get('/api/providers?limit=500');

      expect(response.status).toBe(200);
      expect(mockPrismaClient.provider.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('should return 400 for invalid state format', async () => {
      const response = await request(app).get('/api/providers?state=FLA');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid query parameters');
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for invalid specialty', async () => {
      const response = await request(app).get('/api/providers?specialty=cardiology');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid query parameters');
    });

    it('should return 400 for invalid page number', async () => {
      const response = await request(app).get('/api/providers?page=abc');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid query parameters');
    });

    it('should return empty data when no providers match', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(0);
      mockPrismaClient.provider.findMany.mockResolvedValue([]);

      const response = await request(app).get('/api/providers?state=XX');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });
  });

  describe('GET /api/providers/:npi', () => {
    const mockProvider = {
      id: '1',
      npi: '1234567890',
      entityType: 'INDIVIDUAL',
      firstName: 'John',
      lastName: 'Doe',
      credential: 'MD',
      organizationName: null,
      addressLine1: '123 Medical Dr',
      addressLine2: null,
      city: 'Miami',
      state: 'FL',
      zip: '33101',
      phone: '305-555-1234',
      fax: null,
      taxonomyCode: '207RE0101X',
      taxonomyDescription: 'Endocrinology',
      specialtyCategory: 'ENDOCRINOLOGY',
      npiStatus: 'ACTIVE',
      planAcceptances: [
        {
          plan: {
            id: 'plan1',
            planId: 'H1234-001',
            planName: 'Blue Cross PPO',
            carrierName: 'Blue Cross',
            planType: 'PPO',
            metalLevel: 'GOLD',
          },
          acceptanceStatus: 'ACCEPTED',
          acceptsNewPatients: true,
          confidenceScore: 85,
          lastVerifiedAt: new Date('2024-01-15'),
        },
      ],
      _count: {
        planAcceptances: 10,
        verificationLogs: 5,
      },
    };

    it('should return provider details for valid NPI', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(mockProvider);

      const response = await request(app).get('/api/providers/1234567890');

      expect(response.status).toBe(200);
      expect(response.body.npi).toBe('1234567890');
      expect(response.body.firstName).toBe('John');
      expect(response.body.planAcceptances).toHaveLength(1);
      expect(response.body.statistics).toEqual({
        totalPlansAccepted: 10,
        totalVerifications: 5,
      });
    });

    it('should return 400 for invalid NPI format (too short)', async () => {
      const response = await request(app).get('/api/providers/123456789');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid NPI format. Must be 10 digits.');
    });

    it('should return 400 for invalid NPI format (too long)', async () => {
      const response = await request(app).get('/api/providers/12345678901');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid NPI format. Must be 10 digits.');
    });

    it('should return 400 for invalid NPI format (non-numeric)', async () => {
      const response = await request(app).get('/api/providers/123456789a');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid NPI format. Must be 10 digits.');
    });

    it('should return 404 for non-existent provider', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(null);

      const response = await request(app).get('/api/providers/9999999999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Provider not found');
    });
  });

  describe('GET /api/providers/:npi/plans', () => {
    const mockProvider = {
      id: '1',
      npi: '1234567890',
      firstName: 'John',
      lastName: 'Doe',
      organizationName: null,
    };

    const mockPlanAcceptances = [
      {
        id: 'acc1',
        verificationSource: 'CMS_DATA',
        lastVerifiedAt: new Date('2024-01-15'),
        verificationCount: 3,
        acceptanceStatus: 'ACCEPTED',
        acceptsNewPatients: true,
        effectiveDate: new Date('2024-01-01'),
        terminationDate: null,
        plan: {
          id: 'plan1',
          planId: 'H1234-001',
          planName: 'Blue Cross PPO',
          carrierName: 'Blue Cross',
          planType: 'PPO',
          metalLevel: 'GOLD',
          marketType: 'INDIVIDUAL',
          isActive: true,
          effectiveDate: new Date('2024-01-01'),
          terminationDate: null,
        },
      },
    ];

    beforeEach(() => {
      mockPrismaClient.verificationLog.aggregate.mockResolvedValue({
        _sum: { upvotes: 10, downvotes: 2 },
        _count: 5,
      });
    });

    it('should return plans for valid provider', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(mockProvider);
      mockPrismaClient.providerPlanAcceptance.findMany.mockResolvedValue(mockPlanAcceptances);

      const response = await request(app).get('/api/providers/1234567890/plans');

      expect(response.status).toBe(200);
      expect(response.body.provider.npi).toBe('1234567890');
      expect(response.body.provider.name).toBe('John Doe');
      expect(response.body.plans).toHaveLength(1);
      expect(response.body.plans[0].plan.planName).toBe('Blue Cross PPO');
      expect(response.body.plans[0].confidence).toBeDefined();
      expect(response.body.summary).toBeDefined();
    });

    it('should filter by acceptance status', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(mockProvider);
      mockPrismaClient.providerPlanAcceptance.findMany.mockResolvedValue(mockPlanAcceptances);

      const response = await request(app).get('/api/providers/1234567890/plans?status=ACCEPTED');

      expect(response.status).toBe(200);
      expect(mockPrismaClient.providerPlanAcceptance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            acceptanceStatus: 'ACCEPTED',
          }),
        })
      );
    });

    it('should filter by minimum confidence', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(mockProvider);
      mockPrismaClient.providerPlanAcceptance.findMany.mockResolvedValue(mockPlanAcceptances);

      const response = await request(app).get('/api/providers/1234567890/plans?minConfidence=50');

      expect(response.status).toBe(200);
      expect(mockPrismaClient.providerPlanAcceptance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            confidenceScore: { gte: 50 },
          }),
        })
      );
    });

    it('should use organization name when available', async () => {
      const orgProvider = { ...mockProvider, organizationName: 'Miami Health Clinic' };
      mockPrismaClient.provider.findUnique.mockResolvedValue(orgProvider);
      mockPrismaClient.providerPlanAcceptance.findMany.mockResolvedValue([]);

      const response = await request(app).get('/api/providers/1234567890/plans');

      expect(response.status).toBe(200);
      expect(response.body.provider.name).toBe('Miami Health Clinic');
    });

    it('should return 400 for invalid NPI', async () => {
      const response = await request(app).get('/api/providers/invalid/plans');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid NPI format. Must be 10 digits.');
    });

    it('should return 404 for non-existent provider', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(null);

      const response = await request(app).get('/api/providers/9999999999/plans');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Provider not found');
    });

    it('should calculate correct summary statistics', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(mockProvider);
      mockPrismaClient.providerPlanAcceptance.findMany.mockResolvedValue(mockPlanAcceptances);

      const response = await request(app).get('/api/providers/1234567890/plans');

      expect(response.status).toBe(200);
      expect(response.body.summary.total).toBe(1);
      expect(response.body.summary.accepted).toBe(1);
      expect(response.body.summary.averageConfidence).toBeDefined();
    });

    it('should handle empty plans list', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(mockProvider);
      mockPrismaClient.providerPlanAcceptance.findMany.mockResolvedValue([]);

      const response = await request(app).get('/api/providers/1234567890/plans');

      expect(response.status).toBe(200);
      expect(response.body.plans).toEqual([]);
      expect(response.body.summary.total).toBe(0);
      expect(response.body.summary.averageConfidence).toBe(0);
    });
  });

  describe('POST /api/providers/:npi/verify', () => {
    const mockProvider = { id: 'prov1' };
    const mockPlan = { id: 'plan1' };
    const mockAcceptance = {
      id: 'acc1',
      acceptanceStatus: 'ACCEPTED',
      verificationCount: 1,
    };
    const mockVerification = {
      id: 'ver1',
      createdAt: new Date('2024-06-15'),
    };

    beforeEach(() => {
      mockPrismaClient.$transaction.mockImplementation(async (callback) => {
        return callback({
          providerPlanAcceptance: {
            upsert: jest.fn().mockResolvedValue(mockAcceptance),
          },
          verificationLog: {
            create: jest.fn().mockResolvedValue(mockVerification),
          },
        });
      });
    });

    it('should create verification for valid request', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(mockProvider);
      mockPrismaClient.insurancePlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaClient.providerPlanAcceptance.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/providers/1234567890/verify')
        .send({
          planId: 'H1234-001',
          acceptsInsurance: true,
          acceptsNewPatients: true,
          notes: 'Called office today',
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Verification submitted successfully');
      expect(response.body.verification).toBeDefined();
      expect(response.body.verification.id).toBe('ver1');
    });

    it('should handle verification with all optional fields', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(mockProvider);
      mockPrismaClient.insurancePlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaClient.providerPlanAcceptance.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/providers/1234567890/verify')
        .send({
          planId: 'H1234-001',
          acceptsInsurance: false,
          acceptsNewPatients: false,
          notes: 'Office confirmed they no longer accept this plan',
          evidenceUrl: 'https://example.com/screenshot.png',
          submittedBy: 'user@example.com',
        });

      expect(response.status).toBe(201);
    });

    it('should return 400 for invalid NPI', async () => {
      const response = await request(app)
        .post('/api/providers/invalid/verify')
        .send({
          planId: 'H1234-001',
          acceptsInsurance: true,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid NPI format. Must be 10 digits.');
    });

    it('should return 400 for missing planId', async () => {
      const response = await request(app)
        .post('/api/providers/1234567890/verify')
        .send({
          acceptsInsurance: true,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request body');
    });

    it('should return 400 for missing acceptsInsurance', async () => {
      const response = await request(app)
        .post('/api/providers/1234567890/verify')
        .send({
          planId: 'H1234-001',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request body');
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/providers/1234567890/verify')
        .send({
          planId: 'H1234-001',
          acceptsInsurance: true,
          submittedBy: 'not-an-email',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request body');
    });

    it('should return 400 for invalid URL format', async () => {
      const response = await request(app)
        .post('/api/providers/1234567890/verify')
        .send({
          planId: 'H1234-001',
          acceptsInsurance: true,
          evidenceUrl: 'not-a-url',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request body');
    });

    it('should return 404 for non-existent provider', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/providers/9999999999/verify')
        .send({
          planId: 'H1234-001',
          acceptsInsurance: true,
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Provider not found');
    });

    it('should return 404 for non-existent plan', async () => {
      mockPrismaClient.provider.findUnique.mockResolvedValue(mockProvider);
      mockPrismaClient.insurancePlan.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/providers/1234567890/verify')
        .send({
          planId: 'INVALID-PLAN',
          acceptsInsurance: true,
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Insurance plan not found');
    });

    it('should handle notes exceeding max length', async () => {
      const response = await request(app)
        .post('/api/providers/1234567890/verify')
        .send({
          planId: 'H1234-001',
          acceptsInsurance: true,
          notes: 'x'.repeat(1001),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request body');
    });
  });

  describe('POST /api/verifications/:id/vote', () => {
    const mockVerification = {
      id: 'ver1',
      upvotes: 5,
      downvotes: 2,
    };

    it('should record upvote successfully', async () => {
      mockPrismaClient.verificationLog.findUnique.mockResolvedValue(mockVerification);
      mockPrismaClient.verificationLog.update.mockResolvedValue({
        ...mockVerification,
        upvotes: 6,
      });

      const response = await request(app)
        .post('/api/verifications/ver1/vote')
        .send({ vote: 'up' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Vote recorded');
      expect(response.body.verification.upvotes).toBe(6);
    });

    it('should record downvote successfully', async () => {
      mockPrismaClient.verificationLog.findUnique.mockResolvedValue(mockVerification);
      mockPrismaClient.verificationLog.update.mockResolvedValue({
        ...mockVerification,
        downvotes: 3,
      });

      const response = await request(app)
        .post('/api/verifications/ver1/vote')
        .send({ vote: 'down' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Vote recorded');
      expect(response.body.verification.downvotes).toBe(3);
    });

    it('should return 400 for missing vote', async () => {
      const response = await request(app)
        .post('/api/verifications/ver1/vote')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('should return 400 for invalid vote value', async () => {
      const response = await request(app)
        .post('/api/verifications/ver1/vote')
        .send({ vote: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('should return 404 for non-existent verification', async () => {
      mockPrismaClient.verificationLog.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/verifications/nonexistent/vote')
        .send({ vote: 'up' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Verification not found');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/unknown');

      expect(response.status).toBe(404);
    });

    it('should handle database errors gracefully', async () => {
      mockPrismaClient.provider.count.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).get('/api/providers');

      expect(response.status).toBe(500);
    });
  });

  describe('Combined Filters', () => {
    it('should apply multiple filters simultaneously', async () => {
      mockPrismaClient.provider.count.mockResolvedValue(1);
      mockPrismaClient.provider.findMany.mockResolvedValue([]);

      const response = await request(app).get(
        '/api/providers?state=FL&specialty=endocrinology&city=Miami&zip=33101'
      );

      expect(response.status).toBe(200);
      expect(mockPrismaClient.provider.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            state: 'FL',
            specialtyCategory: 'ENDOCRINOLOGY',
            city: { contains: 'Miami', mode: 'insensitive' },
            zip: { startsWith: '33101' },
          }),
        })
      );
    });
  });
});
