import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

export interface ProviderSearchParams {
  state?: string;
  city?: string;
  cities?: string; // Comma-separated cities
  zipCode?: string;
  healthSystem?: string;
  specialty?: string;
  name?: string;
  npi?: string;
  entityType?: 'INDIVIDUAL' | 'ORGANIZATION';
  page?: number;
  limit?: number;
}

export interface ProviderSearchResult {
  providers: Awaited<ReturnType<typeof prisma.provider.findMany>>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Search providers with filters and pagination
 */
export async function searchProviders(params: ProviderSearchParams): Promise<ProviderSearchResult> {
  const {
    state,
    city,
    cities,
    zipCode,
    healthSystem,
    specialty,
    name,
    npi,
    entityType,
    page = 1,
    limit = 20,
  } = params;

  const take = Math.min(limit, 100);
  const skip = (page - 1) * take;

  const where: Prisma.ProviderWhereInput = {
    AND: [],
  };

  if (state) {
    where.state = state.toUpperCase();
  }

  // Handle multiple cities or single city
  if (cities) {
    const cityArray = cities.split(',').map(c => c.trim()).filter(Boolean);
    if (cityArray.length > 0) {
      (where.AND as Prisma.ProviderWhereInput[]).push({
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

  if (healthSystem) {
    where.location = {
      healthSystem: healthSystem,
    };
  }

  if (specialty) {
    (where.AND as Prisma.ProviderWhereInput[]).push({
      OR: [
        { specialty: { contains: specialty, mode: 'insensitive' } },
        { specialtyCode: { contains: specialty, mode: 'insensitive' } },
      ]
    });
  }

  if (npi) {
    where.npi = npi;
  }

  if (entityType) {
    where.entityType = entityType;
  }

  if (name) {
    (where.AND as Prisma.ProviderWhereInput[]).push({
      OR: [
        { firstName: { contains: name, mode: 'insensitive' } },
        { lastName: { contains: name, mode: 'insensitive' } },
        { organizationName: { contains: name, mode: 'insensitive' } },
      ]
    });
  }

  // Clean up empty AND array
  if ((where.AND as Prisma.ProviderWhereInput[]).length === 0) {
    delete where.AND;
  }

  const [providers, total] = await Promise.all([
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
  ]);

  return {
    providers,
    total,
    page,
    limit: take,
    totalPages: Math.ceil(total / take),
  };
}

/**
 * Get provider by NPI
 */
export async function getProviderByNpi(npi: string) {
  return prisma.provider.findUnique({
    where: { npi },
    include: {
      location: true,
      planAcceptances: {
        take: 10,
        orderBy: { confidenceScore: 'desc' },
        include: {
          plan: true,
        },
      },
    },
  });
}

/**
 * Get accepted plans for a provider
 */
export async function getProviderAcceptedPlans(
  npi: string,
  options: {
    status?: 'ACCEPTED' | 'NOT_ACCEPTED' | 'PENDING' | 'UNKNOWN';
    minConfidence?: number;
    page?: number;
    limit?: number;
  } = {}
) {
  const { status, minConfidence, page = 1, limit = 20 } = options;
  const take = Math.min(limit, 100);
  const skip = (page - 1) * take;

  const provider = await prisma.provider.findUnique({
    where: { npi },
    select: { npi: true },
  });

  if (!provider) {
    return null;
  }

  const where: Prisma.ProviderPlanAcceptanceWhereInput = {
    providerNpi: provider.npi,
  };

  if (status) {
    where.acceptanceStatus = status;
  }

  if (minConfidence !== undefined) {
    where.confidenceScore = { gte: minConfidence };
  }

  const [acceptances, total] = await Promise.all([
    prisma.providerPlanAcceptance.findMany({
      where,
      take,
      skip,
      orderBy: { confidenceScore: 'desc' },
      include: {
        plan: true,
      },
    }),
    prisma.providerPlanAcceptance.count({ where }),
  ]);

  return {
    acceptances,
    total,
    page,
    limit: take,
    totalPages: Math.ceil(total / take),
  };
}

/**
 * Get unique cities for a state (sorted alphabetically)
 */
export async function getCitiesByState(state: string): Promise<string[]> {
  const result = await prisma.provider.findMany({
    where: {
      state: state.toUpperCase(),
    },
    select: {
      city: true,
    },
    distinct: ['city'],
    orderBy: {
      city: 'asc',
    },
  });

  // Return unique cities, properly cased (title case)
  const cities = result
    .map((r) => r.city)
    .filter((city): city is string => city !== null && city.length > 0)
    .map((city) => {
      // Convert to title case for display
      return city
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    });

  // Remove duplicates that might arise from case differences
  return [...new Set(cities)].sort();
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: {
  entityType: string;
  firstName?: string | null;
  lastName?: string | null;
  credential?: string | null;
  organizationName?: string | null;
}): string {
  if (provider.entityType === 'ORGANIZATION') {
    return provider.organizationName || 'Unknown Organization';
  }

  const parts = [provider.firstName, provider.lastName]
    .filter(Boolean)
    .join(' ');

  return provider.credential ? `${parts}, ${provider.credential}` : parts || 'Unknown Provider';
}
