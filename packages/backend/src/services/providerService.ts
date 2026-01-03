import { Prisma, SpecialtyCategory, EntityType, NpiStatus, AcceptanceStatus } from '@prisma/client';
import prisma from '../lib/prisma';

export interface ProviderSearchParams {
  state?: string;
  city?: string;
  zip?: string;
  specialty?: SpecialtyCategory;
  name?: string;
  npi?: string;
  entityType?: EntityType;
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
    zip,
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
    npiStatus: NpiStatus.ACTIVE,
  };

  if (state) {
    where.state = state.toUpperCase();
  }

  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }

  if (zip) {
    where.zip = { startsWith: zip };
  }

  if (specialty) {
    where.specialtyCategory = specialty;
  }

  if (npi) {
    where.npi = npi;
  }

  if (entityType) {
    where.entityType = entityType;
  }

  if (name) {
    where.OR = [
      { firstName: { contains: name, mode: 'insensitive' } },
      { lastName: { contains: name, mode: 'insensitive' } },
      { organizationName: { contains: name, mode: 'insensitive' } },
    ];
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
    status?: AcceptanceStatus;
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
    select: { id: true },
  });

  if (!provider) {
    return null;
  }

  const where: Prisma.ProviderPlanAcceptanceWhereInput = {
    providerId: provider.id,
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
 * Get provider display name
 */
export function getProviderDisplayName(provider: {
  entityType: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  credential?: string | null;
  organizationName?: string | null;
}): string {
  if (provider.entityType === 'ORGANIZATION') {
    return provider.organizationName || 'Unknown Organization';
  }

  const parts = [provider.firstName, provider.middleName, provider.lastName]
    .filter(Boolean)
    .join(' ');

  return provider.credential ? `${parts}, ${provider.credential}` : parts || 'Unknown Provider';
}
