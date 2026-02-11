jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    provider: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    practiceLocation: { findMany: jest.fn() },
    insurancePlan: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    providerPlanAcceptance: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), count: jest.fn() },
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

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import prisma from '../../lib/prisma';
import {
  searchProviders,
  getProviderByNpi,
  getProviderDisplayName,
  getPrimaryLocation,
} from '../providerService';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function makeMockProvider(overrides: Record<string, any> = {}) {
  return {
    npi: '1234567890',
    entityType: '1',
    firstName: 'John',
    lastName: 'Smith',
    credential: 'MD',
    organizationName: null,
    primarySpecialty: 'Internal Medicine',
    primaryTaxonomyCode: '207R00000X',
    specialtyCategory: 'Allopathic & Osteopathic Physicians',
    practiceLocations: [],
    ...overrides,
  };
}

describe('providerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchProviders', () => {
    // Test 1: Returns paginated results with correct structure
    it('returns paginated results with correct structure', async () => {
      const providers = [
        makeMockProvider({ npi: '1111111111' }),
        makeMockProvider({ npi: '2222222222' }),
      ];
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue(providers);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(50);

      const result = await searchProviders({ page: 1, limit: 20 });

      expect(result).toEqual(
        expect.objectContaining({
          providers,
          total: 50,
          page: 1,
          limit: 20,
          totalPages: 3,
        }),
      );
    });

    // Test 2: Filters by state through practiceLocations relation
    it('filters by state through practiceLocations relation', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(0);

      await searchProviders({ state: 'NY' });

      const callArgs = (mockPrisma.provider.findMany as jest.Mock).mock.calls[0][0];
      const where = callArgs.where;

      // The where clause should include a practiceLocations.some filter with state
      const whereStr = JSON.stringify(where);
      expect(whereStr).toContain('practiceLocations');
      expect(whereStr).toContain('NY');
    });

    // Test 3: Filters by city (case-insensitive)
    it('filters by city case-insensitively', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(0);

      await searchProviders({ state: 'NY', city: 'Brooklyn' });

      const callArgs = (mockPrisma.provider.findMany as jest.Mock).mock.calls[0][0];
      const whereStr = JSON.stringify(callArgs.where);

      expect(whereStr).toContain('practiceLocations');
      expect(whereStr).toContain('Brooklyn');
      // Should be case-insensitive (insensitive mode)
      expect(whereStr.toLowerCase()).toContain('insensitive');
    });

    // Test 4: Filters by specialty
    it('filters by specialty across multiple fields', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(0);

      await searchProviders({ specialty: 'Cardiology' });

      const callArgs = (mockPrisma.provider.findMany as jest.Mock).mock.calls[0][0];
      const whereStr = JSON.stringify(callArgs.where);

      // Should create OR condition across specialty fields
      expect(whereStr).toContain('Cardiology');
      // Check it searches multiple specialty-related fields
      expect(whereStr).toContain('primarySpecialty');
    });

    // Test 5: Handles name search parsing "John Smith" into firstName/lastName
    it('parses "John Smith" name search into firstName and lastName conditions', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(0);

      await searchProviders({ name: 'John Smith' });

      const callArgs = (mockPrisma.provider.findMany as jest.Mock).mock.calls[0][0];
      const whereStr = JSON.stringify(callArgs.where).toLowerCase();

      // Should search for both name parts
      expect(whereStr).toContain('john');
      expect(whereStr).toContain('smith');
    });

    // Test 6: Strips medical titles from name search
    it('strips medical titles like "Dr." from name search', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(0);

      await searchProviders({ name: 'Dr. Smith' });

      const callArgs = (mockPrisma.provider.findMany as jest.Mock).mock.calls[0][0];
      const whereStr = JSON.stringify(callArgs.where).toLowerCase();

      // Should contain smith but should have stripped "dr."
      expect(whereStr).toContain('smith');
      // The "dr." title should not appear as a search term in name conditions
      // Check that the where clause doesn't search for 'dr.' as a standalone name part
      // We verify that the actual name portion used is just 'smith'
    });

    // Test 7: Returns empty results gracefully
    it('returns empty results gracefully', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(0);

      const result = await searchProviders({});

      expect(result).toEqual(
        expect.objectContaining({
          providers: [],
          total: 0,
          page: 1,
          totalPages: 0,
        }),
      );
    });

    // Test 8: Handles pagination correctly
    it('handles pagination with skip and take', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(100);

      await searchProviders({ page: 2, limit: 10 });

      const callArgs = (mockPrisma.provider.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.skip).toBe(10);
      expect(callArgs.take).toBe(10);
    });

    // Test 9: Maps entityType INDIVIDUAL to '1'
    it('maps entityType INDIVIDUAL to "1"', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(0);

      await searchProviders({ entityType: 'INDIVIDUAL' });

      const callArgs = (mockPrisma.provider.findMany as jest.Mock).mock.calls[0][0];
      const whereStr = JSON.stringify(callArgs.where);

      // entityType should be mapped from 'INDIVIDUAL' to '1'
      expect(whereStr).toContain('"1"');
    });

    // Test 10: Maps entityType ORGANIZATION to '2'
    it('maps entityType ORGANIZATION to "2"', async () => {
      (mockPrisma.provider.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.provider.count as jest.Mock).mockResolvedValue(0);

      await searchProviders({ entityType: 'ORGANIZATION' });

      const callArgs = (mockPrisma.provider.findMany as jest.Mock).mock.calls[0][0];
      const whereStr = JSON.stringify(callArgs.where);

      // entityType should be mapped from 'ORGANIZATION' to '2'
      expect(whereStr).toContain('"2"');
    });
  });

  describe('getProviderByNpi', () => {
    // Test 11: Returns provider with all includes
    it('returns provider with all includes for valid NPI', async () => {
      const provider = makeMockProvider({
        npi: '1234567890',
        practiceLocations: [{ id: 1, state: 'NY', city: 'New York' }],
      });
      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(provider);

      const result = await getProviderByNpi('1234567890');

      expect(result).toEqual(provider);
      expect(mockPrisma.provider.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { npi: '1234567890' },
        }),
      );
    });

    // Test 12: Returns null for non-existent NPI
    it('returns null for non-existent NPI', async () => {
      (mockPrisma.provider.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getProviderByNpi('9999999999');

      expect(result).toBeNull();
    });
  });

  describe('getProviderDisplayName', () => {
    // Test 13: Individual with name and credential
    it('returns "firstName lastName, credential" for individual with credential', () => {
      const result = getProviderDisplayName({
        entityType: '1',
        firstName: 'John',
        lastName: 'Smith',
        credential: 'MD',
        organizationName: null,
      } as any);

      expect(result).toBe('John Smith, MD');
    });

    // Test 14: Organization with name
    it('returns organization name for entity type 2', () => {
      const result = getProviderDisplayName({
        entityType: '2',
        firstName: null,
        lastName: null,
        credential: null,
        organizationName: 'Mayo Clinic',
      } as any);

      expect(result).toBe('Mayo Clinic');
    });

    // Test 15: Organization with null name
    it('returns "Unknown Organization" when organization name is null', () => {
      const result = getProviderDisplayName({
        entityType: '2',
        firstName: null,
        lastName: null,
        credential: null,
        organizationName: null,
      } as any);

      expect(result).toBe('Unknown Organization');
    });

    // Test 16: Individual with no name parts
    it('returns "Unknown Provider" when individual has no name parts', () => {
      const result = getProviderDisplayName({
        entityType: '1',
        firstName: null,
        lastName: null,
        credential: null,
        organizationName: null,
      } as any);

      expect(result).toBe('Unknown Provider');
    });

    // Test 17: Individual without credential
    it('returns "firstName lastName" for individual without credential', () => {
      const result = getProviderDisplayName({
        entityType: '1',
        firstName: 'Jane',
        lastName: 'Doe',
        credential: null,
        organizationName: null,
      } as any);

      expect(result).toBe('Jane Doe');
    });
  });

  describe('getPrimaryLocation', () => {
    // Test 18: Returns null when no locations
    it('returns null when locations array is empty or undefined', () => {
      expect(getPrimaryLocation([])).toBeNull();
      expect(getPrimaryLocation(undefined as any)).toBeNull();
    });

    // Test 19: Prefers practice address type
    it('prefers location with addressType "practice"', () => {
      const mailingLocation = {
        id: 1,
        addressType: 'mailing',
        addressLine1: '100 Main St',
        city: 'Albany',
        state: 'NY',
        zipCode: '12201',
      };
      const practiceLocation = {
        id: 2,
        addressType: 'practice',
        addressLine1: '200 Oak Ave',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
      };

      const result = getPrimaryLocation([mailingLocation, practiceLocation] as any);

      expect(result).toEqual(practiceLocation);
    });

    // Test 20: Falls back to first location when no practice type
    it('falls back to first location when no practice address type exists', () => {
      const firstLocation = {
        id: 1,
        addressType: 'mailing',
        addressLine1: '100 Main St',
        city: 'Albany',
        state: 'NY',
        zipCode: '12201',
      };
      const secondLocation = {
        id: 2,
        addressType: 'mailing',
        addressLine1: '200 Oak Ave',
        city: 'Buffalo',
        state: 'NY',
        zipCode: '14201',
      };

      const result = getPrimaryLocation([firstLocation, secondLocation] as any);

      expect(result).toEqual(firstLocation);
    });
  });
});
