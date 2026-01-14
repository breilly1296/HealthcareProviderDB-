import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

export interface LocationSearchParams {
  search?: string;
  state?: string;
  city?: string;
  cities?: string; // Comma-separated cities
  zipCode?: string;
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
  const {
    search,
    state,
    city,
    cities,
    zipCode,
    minProviders,
    page = 1,
    limit = 20,
  } = params;

  const take = Math.min(limit, 100);
  const skip = (page - 1) * take;

  const where: Prisma.LocationWhereInput = {
    AND: [],
  };

  // Text search across address fields
  if (search) {
    (where.AND as Prisma.LocationWhereInput[]).push({
      OR: [
        { addressLine1: { contains: search, mode: 'insensitive' } },
        { addressLine2: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ]
    });
  }

  if (state) {
    where.state = state.toUpperCase();
  }

  // Handle multiple cities or single city
  if (cities) {
    const cityArray = cities.split(',').map(c => c.trim()).filter(Boolean);
    if (cityArray.length > 0) {
      (where.AND as Prisma.LocationWhereInput[]).push({
        OR: cityArray.map(cityName => ({
          city: { equals: cityName, mode: 'insensitive' }
        }))
      });
    }
  } else if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }

  if (zipCode) {
    where.zipCode = { startsWith: zipCode };
  }

  if (minProviders !== undefined) {
    where.providerCount = { gte: minProviders };
  }

  // Clean up empty AND array
  if ((where.AND as Prisma.LocationWhereInput[]).length === 0) {
    delete where.AND;
  }

  const [locations, total] = await Promise.all([
    prisma.location.findMany({
      where,
      take,
      skip,
      orderBy: [
        { providerCount: 'desc' },
        { city: 'asc' },
      ],
    }),
    prisma.location.count({ where }),
  ]);

  return {
    locations,
    total,
    page,
    limit: take,
    totalPages: Math.ceil(total / take),
  };
}

/**
 * Get location by ID with providers
 */
export async function getLocationById(
  locationId: number,
  options: {
    includeProviders?: boolean;
    page?: number;
    limit?: number;
  } = {}
) {
  const { includeProviders = true, page = 1, limit = 20 } = options;

  const location = await prisma.location.findUnique({
    where: { id: locationId },
  });

  if (!location) {
    return null;
  }

  if (!includeProviders) {
    return {
      location,
      providers: [],
      total: location.providerCount,
      page: 1,
      limit: 0,
      totalPages: 0,
    };
  }

  const take = Math.min(limit, 100);
  const skip = (page - 1) * take;

  const [providers, total] = await Promise.all([
    prisma.provider.findMany({
      where: { locationId },
      take,
      skip,
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
        { organizationName: 'asc' },
      ],
    }),
    prisma.provider.count({ where: { locationId } }),
  ]);

  return {
    location,
    providers,
    total,
    page,
    limit: take,
    totalPages: Math.ceil(total / take),
  };
}

/**
 * Get providers colocated with a specific provider (same address)
 */
export async function getColocatedProviders(
  npi: string,
  options: {
    page?: number;
    limit?: number;
  } = {}
) {
  const { page = 1, limit = 20 } = options;

  // Find the provider and their location
  const provider = await prisma.provider.findUnique({
    where: { npi },
    select: { npi: true, locationId: true },
  });

  if (!provider || !provider.locationId) {
    return null;
  }

  const take = Math.min(limit, 100);
  const skip = (page - 1) * take;

  // Get other providers at the same location
  const where: Prisma.ProviderWhereInput = {
    locationId: provider.locationId,
    npi: { not: npi }, // Exclude the original provider
  };

  const [providers, total, location] = await Promise.all([
    prisma.provider.findMany({
      where,
      take,
      skip,
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
        { organizationName: 'asc' },
      ],
    }),
    prisma.provider.count({ where }),
    prisma.location.findUnique({
      where: { id: provider.locationId },
    }),
  ]);

  return {
    location,
    providers,
    total,
    page,
    limit: take,
    totalPages: Math.ceil(total / take),
  };
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
