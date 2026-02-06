jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    provider: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    practice_locations: { findMany: jest.fn() },
    insurancePlan: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    providerPlanAcceptance: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    verificationLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
    },
    voteLog: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn(prismaDefault)),
  },
}));

import prismaDefault from '../../lib/prisma';

jest.mock('../../utils/cache', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDelete: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import prisma from '../../lib/prisma';
import {
  submitVerification,
  voteOnVerification,
  getVerificationStats,
  cleanupExpiredVerifications,
  getExpirationDate,
  VERIFICATION_TTL_MS,
} from '../verificationService';

const mockPrisma = prisma as any;

describe('verificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('submitVerification', () => {
    const validInput = {
      npi: '1234567890',
      planId: 'PLAN-001',
      acceptsInsurance: true,
      sourceIp: '1.2.3.4',
      userAgent: 'test-agent',
      submittedBy: 'test@test.com',
    };

    function setupHappyPath() {
      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue({ npi: '1234567890' });
      (mockPrisma.insurancePlan.findUnique as jest.Mock).mockResolvedValue({ planId: 'PLAN-001' });
      (mockPrisma.verificationLog.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.providerPlanAcceptance.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.verificationLog.create as jest.Mock).mockResolvedValue({
        id: 'vlog-1',
        providerNpi: '1234567890',
        planId: 'PLAN-001',
        verificationType: 'PLAN_ACCEPTANCE',
        verificationSource: 'CROWDSOURCE',
        previousValue: null,
        newValue: { acceptanceStatus: 'ACCEPTED' },
        sourceIp: '1.2.3.4',
        userAgent: 'test-agent',
        submittedBy: 'test@test.com',
        upvotes: 0,
        downvotes: 0,
        isApproved: null,
        createdAt: new Date(),
        expiresAt: new Date(),
        notes: null,
        evidenceUrl: null,
        acceptanceId: null,
        reviewedAt: null,
        reviewedBy: null,
      });
      (mockPrisma.providerPlanAcceptance.create as jest.Mock).mockResolvedValue({
        id: 1,
        providerNpi: '1234567890',
        planId: 'PLAN-001',
        acceptanceStatus: 'PENDING',
        confidenceScore: 45,
        lastVerified: new Date(),
        verificationCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        locationId: null,
        expiresAt: new Date(),
      });
      (mockPrisma.verificationLog.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.verificationLog.findMany as jest.Mock).mockResolvedValue([]);
    }

    // Test 1
    it('creates verification log and acceptance record', async () => {
      setupHappyPath();

      const result = await submitVerification(validInput);

      expect(mockPrisma.verificationLog.create).toHaveBeenCalled();
      expect(mockPrisma.providerPlanAcceptance.create).toHaveBeenCalled();
      expect(result).toHaveProperty('verification');
      expect(result).toHaveProperty('acceptance');
    });

    // Test 2
    it('sets ACCEPTED status when acceptsInsurance is true', async () => {
      setupHappyPath();

      await submitVerification({ ...validInput, acceptsInsurance: true });

      const createCall = (mockPrisma.verificationLog.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.newValue).toEqual(
        expect.objectContaining({ acceptanceStatus: 'ACCEPTED' }),
      );
    });

    // Test 3
    it('sets NOT_ACCEPTED status when acceptsInsurance is false', async () => {
      setupHappyPath();

      await submitVerification({ ...validInput, acceptsInsurance: false });

      const createCall = (mockPrisma.verificationLog.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.newValue).toEqual(
        expect.objectContaining({ acceptanceStatus: 'NOT_ACCEPTED' }),
      );
    });

    // Test 4
    it('rejects duplicate submission from same IP (sybil: IP)', async () => {
      setupHappyPath();
      (mockPrisma.verificationLog.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'existing-vlog',
        providerNpi: '1234567890',
        planId: 'PLAN-001',
        sourceIp: '1.2.3.4',
      });

      await expect(submitVerification(validInput)).rejects.toThrow(/already submitted/i);
    });

    // Test 5
    it('rejects duplicate submission from same email (sybil: email)', async () => {
      setupHappyPath();
      (mockPrisma.verificationLog.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // IP check passes
        .mockResolvedValueOnce({
          id: 'existing-vlog',
          providerNpi: '1234567890',
          planId: 'PLAN-001',
          submittedBy: 'test@test.com',
        }); // email check fails

      await expect(submitVerification(validInput)).rejects.toThrow(/already submitted/i);
    });

    // Test 6
    it('allows submission from different IP', async () => {
      setupHappyPath();
      (mockPrisma.verificationLog.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await submitVerification({
        ...validInput,
        sourceIp: '5.6.7.8',
      });

      expect(result).toHaveProperty('verification');
      expect(result).toHaveProperty('acceptance');
    });

    // Test 7
    it('throws notFound when provider does not exist', async () => {
      setupHappyPath();
      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(submitVerification(validInput)).rejects.toThrow(/not found/i);
    });

    // Test 8
    it('throws notFound when plan does not exist', async () => {
      setupHappyPath();
      (mockPrisma.insurancePlan.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(submitVerification(validInput)).rejects.toThrow(/not found/i);
    });

    // Test 9
    it('sets expiresAt approximately 6 months from now', async () => {
      setupHappyPath();

      const before = Date.now();
      await submitVerification(validInput);
      const after = Date.now();

      const createCall = (mockPrisma.verificationLog.create as jest.Mock).mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      const expectedMin = before + VERIFICATION_TTL_MS;
      const expectedMax = after + VERIFICATION_TTL_MS;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    // Test 10
    it('handles optional locationId', async () => {
      setupHappyPath();

      await submitVerification({ ...validInput, locationId: 42 });

      const createCall = (mockPrisma.providerPlanAcceptance.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data).toEqual(expect.objectContaining({ locationId: 42 }));
    });

    // Test 11
    it('strips PII from returned verification', async () => {
      setupHappyPath();

      const result = await submitVerification(validInput);

      expect(result.verification).not.toHaveProperty('sourceIp');
      expect(result.verification).not.toHaveProperty('userAgent');
      expect(result.verification).not.toHaveProperty('submittedBy');
    });

    // Test 12
    it('updates existing acceptance instead of creating new one', async () => {
      setupHappyPath();
      const existingAcceptance = {
        id: 99,
        providerNpi: '1234567890',
        planId: 'PLAN-001',
        acceptanceStatus: 'PENDING',
        confidenceScore: 30,
        lastVerified: new Date(),
        verificationCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        locationId: null,
        expiresAt: new Date(),
      };
      (mockPrisma.providerPlanAcceptance.findFirst as jest.Mock).mockResolvedValue(existingAcceptance);
      (mockPrisma.providerPlanAcceptance.update as jest.Mock).mockResolvedValue({
        ...existingAcceptance,
        verificationCount: 3,
        updatedAt: new Date(),
      });

      await submitVerification(validInput);

      expect(mockPrisma.providerPlanAcceptance.update).toHaveBeenCalled();
      expect(mockPrisma.providerPlanAcceptance.create).not.toHaveBeenCalled();
    });
  });

  describe('voteOnVerification', () => {
    const baseVerification = {
      id: 'v1',
      providerNpi: '1234567890',
      planId: 'PLAN-001',
      verificationType: 'PLAN_ACCEPTANCE',
      verificationSource: 'CROWDSOURCE',
      previousValue: null,
      newValue: { acceptanceStatus: 'ACCEPTED' },
      sourceIp: '1.2.3.4',
      userAgent: 'test-agent',
      submittedBy: 'test@test.com',
      upvotes: 0,
      downvotes: 0,
      isApproved: null,
      createdAt: new Date(),
      expiresAt: new Date(),
      notes: null,
      evidenceUrl: null,
      acceptanceId: null,
      reviewedAt: null,
      reviewedBy: null,
    };

    // Test 13
    it('requires sourceIp', async () => {
      await expect(
        voteOnVerification('v1', 'up', undefined as any),
      ).rejects.toThrow(/source ip/i);
    });

    // Test 14
    it('throws notFound for non-existent verification', async () => {
      (mockPrisma.verificationLog.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        voteOnVerification('nonexistent', 'up', '9.9.9.9'),
      ).rejects.toThrow(/not found/i);
    });

    // Test 15
    it('rejects duplicate vote from same IP', async () => {
      (mockPrisma.verificationLog.findUnique as jest.Mock).mockResolvedValue(baseVerification);
      (mockPrisma.voteLog.findUnique as jest.Mock).mockResolvedValue({
        id: 'vote-1',
        verificationId: 'v1',
        sourceIp: '9.9.9.9',
        vote: 'up',
      });

      await expect(
        voteOnVerification('v1', 'up', '9.9.9.9'),
      ).rejects.toThrow(/already voted/i);
    });

    // Test 16
    it('allows changing vote direction', async () => {
      (mockPrisma.verificationLog.findUnique as jest.Mock)
        .mockResolvedValueOnce(baseVerification) // exists check
        .mockResolvedValueOnce({
          ...baseVerification,
          upvotes: 0,
          downvotes: 1,
          acceptanceId: null,
        }); // refetch after transaction
      (mockPrisma.voteLog.findUnique as jest.Mock).mockResolvedValue({
        id: 'vote-1',
        verificationId: 'v1',
        sourceIp: '9.9.9.9',
        vote: 'up',
      });
      (mockPrisma.voteLog.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.verificationLog.update as jest.Mock).mockResolvedValue({});

      await expect(
        voteOnVerification('v1', 'down', '9.9.9.9'),
      ).resolves.not.toThrow();

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    // Test 17
    it('creates new vote when none exists', async () => {
      (mockPrisma.verificationLog.findUnique as jest.Mock)
        .mockResolvedValueOnce(baseVerification) // exists check
        .mockResolvedValueOnce({
          ...baseVerification,
          upvotes: 1,
          downvotes: 0,
          acceptanceId: null,
        }); // refetch after transaction
      (mockPrisma.voteLog.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.voteLog.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.verificationLog.update as jest.Mock).mockResolvedValue({});

      await expect(
        voteOnVerification('v1', 'up', '9.9.9.9'),
      ).resolves.not.toThrow();

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getVerificationStats', () => {
    // Test 18
    it('returns correct totals and shape', async () => {
      (mockPrisma.verificationLog.count as jest.Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(60) // approved
        .mockResolvedValueOnce(25) // pending
        .mockResolvedValueOnce(15); // recentCount
      (mockPrisma.verificationLog.groupBy as jest.Mock).mockResolvedValue([
        { verificationType: 'PLAN_ACCEPTANCE', _count: { id: 80 } },
        { verificationType: 'PROVIDER_INFO', _count: { id: 20 } },
      ]);

      const result = await getVerificationStats();

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('approved');
      expect(result).toHaveProperty('pending');
      expect(result).toHaveProperty('byType');
      expect(result).toHaveProperty('recentCount');
      expect(result.total).toBe(100);
      expect(result.approved).toBe(60);
      expect(result.pending).toBe(25);
    });
  });

  describe('cleanupExpiredVerifications', () => {
    // Test 19
    it('counts expired records in dry run mode without deleting', async () => {
      (mockPrisma.verificationLog.count as jest.Mock).mockResolvedValue(5);
      (mockPrisma.providerPlanAcceptance.count as jest.Mock).mockResolvedValue(3);

      const result = await cleanupExpiredVerifications({ dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.expiredVerificationLogs).toBe(5);
      expect(result.expiredPlanAcceptances).toBe(3);
      expect(result.deletedVerificationLogs).toBe(0);
      expect(result.deletedPlanAcceptances).toBe(0);
      expect(mockPrisma.verificationLog.deleteMany).not.toHaveBeenCalled();
    });

    // Test 20
    it('deletes expired records when not dry run', async () => {
      (mockPrisma.verificationLog.count as jest.Mock).mockResolvedValue(5);
      (mockPrisma.providerPlanAcceptance.count as jest.Mock).mockResolvedValue(3);
      (mockPrisma.verificationLog.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });
      (mockPrisma.providerPlanAcceptance.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });

      const result = await cleanupExpiredVerifications({ dryRun: false });

      expect(result.dryRun).toBe(false);
      expect(mockPrisma.verificationLog.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.providerPlanAcceptance.deleteMany).toHaveBeenCalled();
    });

    // Test 21
    it('returns zero counts when nothing is expired', async () => {
      (mockPrisma.verificationLog.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.providerPlanAcceptance.count as jest.Mock).mockResolvedValue(0);

      const result = await cleanupExpiredVerifications({ dryRun: false });

      expect(result.expiredVerificationLogs).toBe(0);
      expect(result.expiredPlanAcceptances).toBe(0);
      expect(result.deletedVerificationLogs).toBe(0);
      expect(result.deletedPlanAcceptances).toBe(0);
    });
  });

  describe('getExpirationDate', () => {
    // Test 22
    it('returns date approximately 6 months from now', () => {
      const before = Date.now();
      const result = getExpirationDate();
      const after = Date.now();

      const expectedMin = before + VERIFICATION_TTL_MS;
      const expectedMax = after + VERIFICATION_TTL_MS;

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.getTime()).toBeLessThanOrEqual(expectedMax);

      // Sanity check: roughly 6 months (~15,552,000,000 ms)
      const sixMonthsMs = 6 * 30 * 24 * 60 * 60 * 1000;
      expect(VERIFICATION_TTL_MS).toBe(sixMonthsMs);
    });
  });
});
