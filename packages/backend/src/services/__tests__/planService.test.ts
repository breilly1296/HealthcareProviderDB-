jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    provider: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    practice_locations: { findMany: jest.fn() },
    insurancePlan: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    providerPlanAcceptance: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), count: jest.fn() },
    verificationLog: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
    voteLog: { create: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((fn: any) => fn()),
  },
}));

jest.mock('../../utils/cache', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDelete: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../../lib/prisma';
import { searchPlans, getPlanByPlanId, getProvidersForPlan, getGroupedPlans, getCarriers, getPlanTypes } from '../planService';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('planService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchPlans', () => {
    const makePlan = (overrides: Record<string, any> = {}) => ({
      id: 1,
      planId: 'PLAN001',
      planName: 'Gold PPO',
      rawName: 'Gold PPO 2025',
      issuerName: 'Aetna',
      carrier: 'Aetna',
      planType: 'PPO',
      planVariant: 'Gold',
      state: 'CA',
      sourceHealthSystem: null,
      providerCount: 100,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      ...overrides,
    });

    it('returns paginated plan results', async () => {
      const plans = [makePlan({ id: 1, planId: 'PLAN001' }), makePlan({ id: 2, planId: 'PLAN002', planName: 'Silver HMO' })];
      (mockPrisma.insurancePlan.findMany as jest.Mock).mockResolvedValue(plans);
      (mockPrisma.insurancePlan.count as jest.Mock).mockResolvedValue(30);

      const result = await searchPlans({});

      expect(result.plans).toHaveLength(2);
      expect(result.total).toBe(30);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(2);
    });

    it('filters by issuerName with case-insensitive contains', async () => {
      (mockPrisma.insurancePlan.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.insurancePlan.count as jest.Mock).mockResolvedValue(0);

      await searchPlans({ issuerName: 'Aetna' });

      const findManyCall = (mockPrisma.insurancePlan.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.issuerName).toEqual(
        expect.objectContaining({ contains: 'Aetna', mode: 'insensitive' })
      );
    });

    it('filters by planType', async () => {
      (mockPrisma.insurancePlan.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.insurancePlan.count as jest.Mock).mockResolvedValue(0);

      await searchPlans({ planType: 'HMO' });

      const findManyCall = (mockPrisma.insurancePlan.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.planType).toEqual(
        expect.objectContaining({ contains: 'HMO', mode: 'insensitive' })
      );
    });

    it('applies text search across multiple fields with OR', async () => {
      (mockPrisma.insurancePlan.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.insurancePlan.count as jest.Mock).mockResolvedValue(0);

      await searchPlans({ search: 'blue' });

      const findManyCall = (mockPrisma.insurancePlan.findMany as jest.Mock).mock.calls[0][0];
      const orClause = findManyCall.where.OR;
      expect(orClause).toBeDefined();
      expect(Array.isArray(orClause)).toBe(true);

      const searchedFields = orClause.map((condition: any) => Object.keys(condition)[0]);
      expect(searchedFields).toEqual(expect.arrayContaining(['carrier', 'issuerName', 'planName', 'rawName', 'planId']));

      for (const condition of orClause) {
        const field = Object.keys(condition)[0];
        expect(condition[field]).toEqual(
          expect.objectContaining({ contains: 'blue', mode: 'insensitive' })
        );
      }
    });

    it('filters by state', async () => {
      (mockPrisma.insurancePlan.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.insurancePlan.count as jest.Mock).mockResolvedValue(0);

      await searchPlans({ state: 'CA' });

      const findManyCall = (mockPrisma.insurancePlan.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.state).toBe('CA');
    });

    it('returns empty result when no plans match', async () => {
      (mockPrisma.insurancePlan.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.insurancePlan.count as jest.Mock).mockResolvedValue(0);

      const result = await searchPlans({});

      expect(result.plans).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('getPlanByPlanId', () => {
    it('returns plan with providerCount when providerCount is set', async () => {
      const plan = {
        id: 1,
        planId: 'PLAN001',
        planName: 'Gold PPO',
        rawName: 'Gold PPO 2025',
        issuerName: 'Aetna',
        carrier: 'Aetna',
        planType: 'PPO',
        planVariant: 'Gold',
        state: 'CA',
        sourceHealthSystem: null,
        providerCount: 42,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        _count: { providerAcceptances: 42 },
      };
      (mockPrisma.insurancePlan.findUnique as jest.Mock).mockResolvedValue(plan);

      const result = await getPlanByPlanId('PLAN001');

      expect(result).not.toBeNull();
      expect(result!.providerCount).toBe(42);
    });

    it('falls back to _count.providerAcceptances when providerCount is 0', async () => {
      const plan = {
        id: 2,
        planId: 'PLAN002',
        planName: 'Silver HMO',
        rawName: 'Silver HMO 2025',
        issuerName: 'BCBS',
        carrier: 'BCBS',
        planType: 'HMO',
        planVariant: 'Silver',
        state: 'NY',
        sourceHealthSystem: null,
        providerCount: 0,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        _count: { providerAcceptances: 15 },
      };
      (mockPrisma.insurancePlan.findUnique as jest.Mock).mockResolvedValue(plan);

      const result = await getPlanByPlanId('PLAN002');

      expect(result).not.toBeNull();
      expect(result!.providerCount).toBe(15);
    });

    it('returns null for non-existent plan', async () => {
      (mockPrisma.insurancePlan.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getPlanByPlanId('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('getProvidersForPlan', () => {
    const makeAcceptanceRecord = () => ({
      id: 1,
      providerNpi: '1234567890',
      planId: 'P1',
      locationId: 100,
      acceptanceStatus: 'ACCEPTED',
      confidenceScore: 75,
      lastVerified: new Date('2025-01-01'),
      verificationCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
      provider: {
        npi: '1234567890',
        firstName: 'John',
        lastName: 'Smith',
        organizationName: null,
        entityType: '1',
        primarySpecialty: 'Internal Medicine',
        primaryTaxonomyCode: '207R00000X',
        practice_locations: [
          {
            id: 100,
            address_type: 'practice',
            city: 'New York',
            state: 'NY',
            zip_code: '10001',
            phone: '2125551234',
          },
        ],
      },
      location: {
        id: 100,
        address_line1: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip_code: '10001',
        phone: '2125551234',
      },
    });

    it('returns providers that accept a specific plan', async () => {
      (mockPrisma.insurancePlan.findUnique as jest.Mock).mockResolvedValue({ planId: 'P1' });

      const acceptanceRecords = [makeAcceptanceRecord()];
      (mockPrisma.providerPlanAcceptance.findMany as jest.Mock).mockResolvedValue(acceptanceRecords);
      (mockPrisma.providerPlanAcceptance.count as jest.Mock).mockResolvedValue(1);

      const result = await getProvidersForPlan('P1', {});

      expect(result).not.toBeNull();
      expect(result!.providers).toHaveLength(1);

      const provider = result!.providers[0];
      expect(provider.npi).toBe('1234567890');
      expect(provider.firstName).toBe('John');
      expect(provider.lastName).toBe('Smith');
      expect(provider.specialty).toBe('Internal Medicine');
      expect(provider.confidenceScore).toBe(75);
      expect(provider.city).toBe('New York');
      expect(provider.state).toBe('NY');
      expect(result!.total).toBe(1);
      expect(result!.page).toBe(1);
    });

    it('returns null for non-existent plan', async () => {
      (mockPrisma.insurancePlan.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getProvidersForPlan('NONEXISTENT', {});

      expect(result).toBeNull();
      expect(mockPrisma.providerPlanAcceptance.findMany).not.toHaveBeenCalled();
    });

    it('returns empty providers array for plan with no acceptances', async () => {
      (mockPrisma.insurancePlan.findUnique as jest.Mock).mockResolvedValue({ planId: 'P1' });
      (mockPrisma.providerPlanAcceptance.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.providerPlanAcceptance.count as jest.Mock).mockResolvedValue(0);

      const result = await getProvidersForPlan('P1', {});

      expect(result).not.toBeNull();
      expect(result!.providers).toEqual([]);
      expect(result!.total).toBe(0);
    });

    it('handles pagination correctly', async () => {
      (mockPrisma.insurancePlan.findUnique as jest.Mock).mockResolvedValue({ planId: 'P1' });
      (mockPrisma.providerPlanAcceptance.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.providerPlanAcceptance.count as jest.Mock).mockResolvedValue(20);

      await getProvidersForPlan('P1', { page: 2, limit: 5 });

      const findManyCall = (mockPrisma.providerPlanAcceptance.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.skip).toBe(5);
      expect(findManyCall.take).toBe(5);
    });
  });

  describe('getGroupedPlans', () => {
    it('groups plans by carrier', async () => {
      const plans = [
        { id: 1, planId: 'P1', planName: 'Gold PPO', carrier: 'Aetna', planType: 'PPO', state: 'CA' },
        { id: 2, planId: 'P2', planName: 'Silver HMO', carrier: 'Aetna', planType: 'HMO', state: 'CA' },
        { id: 3, planId: 'P3', planName: 'Bronze PPO', carrier: 'BCBS', planType: 'PPO', state: 'NY' },
      ];
      (mockPrisma.insurancePlan.findMany as jest.Mock).mockResolvedValue(plans);

      const result = await getGroupedPlans({});

      expect(result.carriers).toBeDefined();
      expect(Array.isArray(result.carriers)).toBe(true);

      const aetnaGroup = result.carriers.find((g: any) => g.carrier === 'Aetna');
      expect(aetnaGroup).toBeDefined();
      expect(aetnaGroup!.plans).toHaveLength(2);

      const bcbsGroup = result.carriers.find((g: any) => g.carrier === 'BCBS');
      expect(bcbsGroup).toBeDefined();
      expect(bcbsGroup!.plans).toHaveLength(1);

      expect(result.totalPlans).toBe(3);
    });

    it('handles search filter', async () => {
      (mockPrisma.insurancePlan.findMany as jest.Mock).mockResolvedValue([]);

      await getGroupedPlans({ search: 'blue' });

      const findManyCall = (mockPrisma.insurancePlan.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.OR).toBeDefined();
      expect(Array.isArray(findManyCall.where.OR)).toBe(true);

      const searchedFields = findManyCall.where.OR.map((condition: any) => Object.keys(condition)[0]);
      expect(searchedFields.length).toBeGreaterThan(0);
    });
  });
});
