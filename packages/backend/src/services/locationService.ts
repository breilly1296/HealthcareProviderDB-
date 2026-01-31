import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  getPaginationValues,
  buildCityFilter,
  cleanWhereClause,
  addAndCondition,
} from './utils';

// Re-export getLocationDisplayName from enrichment service for convenience
export { getLocationDisplayName } from './locationEnrichment';

export interface LocationSearchParams {
  search?: string;
  state?: string;
  city?: string;
  cities?: string; // Comma-separated cities
  zipCode?: string;
  healthSystem?: string;
  minProviders?: number;
  page?: number;
  limit?: number;
}

export interface LocationSearchResult {
  locations: Awaited<ReturnType<typeof prisma.location.findMany>>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Search locations with filters and pagination
 */
export async function searchLocations(params: LocationSearchParams): Promise<LocationSearchResult> {
  const { search, state, city, cities, zipCode, healthSystem, minProviders } = params;
  const { take, skip, page } = getPaginationValues(params.page, params.limit);

  const where: Prisma.LocationWhereInput = { AND: [] };

  // Apply simple filters
  if (state) where.state = state.toUpperCase();
  if (zipCode) where.zipCode = { startsWith: zipCode };
  if (healthSystem) where.healthSystem = healthSystem;
  if (minProviders !== undefined) where.providerCount = { gte: minProviders };

  // Text search across address fields
  if (search) {
    addAndCondition(where, {
      OR: [
        { addressLine1: { contains: search, mode: 'insensitive' } },
        { addressLine2: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ]
    });
  }

  // City filter (single or multiple)
  const cityFilter = buildCityFilter(cities, city);
  if (cityFilter) addAndCondition(where, cityFilter);

  cleanWhereClause(where);

  const [locations, total] = await Promise.all([
    prisma.location.findMany({
      where,
      take,
      skip,
      orderBy: [{ providerCount: 'desc' }, { city: 'asc' }],
    }),
    prisma.location.count({ where }),
  ]);

  return { locations, total, page, limit: take, totalPages: Math.ceil(total / take) };
}

/**
 * Get location by ID with providers
 */
export async function getLocationById(
  locationId: number,
  options: { includeProviders?: boolean; page?: number; limit?: number } = {}
) {
  const { includeProviders = true } = options;

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) return null;

  if (!includeProviders) {
    return { location, providers: [], total: location.providerCount, page: 1, limit: 0, totalPages: 0 };
  }

  const { take, skip, page } = getPaginationValues(options.page, options.limit);
  const where = { locationId };

  const [providers, total] = await Promise.all([
    prisma.provider.findMany({
      where,
      take,
      skip,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { organizationName: 'asc' }],
    }),
    prisma.provider.count({ where }),
  ]);

  return { location, providers, total, page, limit: take, totalPages: Math.ceil(total / take) };
}

/**
 * Get providers colocated with a specific provider (same address)
 */
export async function getColocatedProviders(
  npi: string,
  options: { page?: number; limit?: number } = {}
) {
  const provider = await prisma.provider.findUnique({
    where: { npi },
    select: { npi: true, locationId: true },
  });

  if (!provider?.locationId) return null;

  const { take, skip, page } = getPaginationValues(options.page, options.limit);
  const where: Prisma.ProviderWhereInput = {
    locationId: provider.locationId,
    npi: { not: npi },
  };

  const [providers, total, location] = await Promise.all([
    prisma.provider.findMany({
      where,
      take,
      skip,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { organizationName: 'asc' }],
    }),
    prisma.provider.count({ where }),
    prisma.location.findUnique({ where: { id: provider.locationId } }),
  ]);

  return { location, providers, total, page, limit: take, totalPages: Math.ceil(total / take) };
}

/**
 * Get location statistics by state
 */
export async function getLocationStatsByState(state: string) {
  const stats = await prisma.location.aggregate({
    where: { state: state.toUpperCase() },
    _count: true,
    _sum: {
      providerCount: true,
    },
    _avg: {
      providerCount: true,
    },
    _max: {
      providerCount: true,
    },
  });

  return {
    totalLocations: stats._count,
    totalProviders: stats._sum.providerCount || 0,
    avgProvidersPerLocation: stats._avg.providerCount || 0,
    maxProvidersAtLocation: stats._max.providerCount || 0,
  };
}

/**
 * Get distinct health systems (sorted by provider count)
 * Optionally filtered by state and/or cities
 */
export async function getHealthSystems(params?: { state?: string; cities?: string }): Promise<string[]> {
  const where: Prisma.LocationWhereInput = { healthSystem: { not: null }, AND: [] };

  if (params?.state) where.state = params.state.toUpperCase();

  // City filter using shared utility
  const cityFilter = buildCityFilter(params?.cities, undefined);
  if (cityFilter) addAndCondition(where, cityFilter);

  cleanWhereClause(where);

  const result = await prisma.location.groupBy({
    by: ['healthSystem'],
    where,
    _sum: { providerCount: true },
    orderBy: { _sum: { providerCount: 'desc' } },
  });

  return result.map(r => r.healthSystem).filter((hs): hs is string => hs !== null);
}
