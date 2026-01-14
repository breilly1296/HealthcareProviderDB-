import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

/**
 * Common medical prefixes and suffixes to strip from name searches
 */
const MEDICAL_TITLES = [
  'dr.', 'dr', 'doctor',
  'md', 'm.d.', 'do', 'd.o.',
  'np', 'n.p.', 'pa', 'p.a.',
  'rn', 'r.n.', 'lpn', 'l.p.n.',
  'phd', 'ph.d.', 'dds', 'd.d.s.',
  'dpm', 'd.p.m.', 'od', 'o.d.',
  'pharmd', 'pharm.d.',
  'mph', 'm.p.h.', 'msw', 'm.s.w.',
  'lcsw', 'l.c.s.w.', 'lpc', 'l.p.c.',
  'psyd', 'psy.d.',
];

/**
 * Clean and parse a name search query
 * Strips medical titles and handles various name formats
 */
function parseNameSearch(nameInput: string): {
  searchTerms: string[];
  firstName?: string;
  lastName?: string;
} {
  // Normalize: trim, lowercase, remove extra spaces
  let cleaned = nameInput.trim().toLowerCase().replace(/\s+/g, ' ');

  // Remove medical titles
  for (const title of MEDICAL_TITLES) {
    // Remove from beginning
    const startRegex = new RegExp(`^${title}\\s+`, 'i');
    cleaned = cleaned.replace(startRegex, '');

    // Remove from end
    const endRegex = new RegExp(`\\s+${title}$`, 'i');
    cleaned = cleaned.replace(endRegex, '');

    // Remove with comma separator
    const commaRegex = new RegExp(`[,\\s]+${title}[,\\s]*`, 'gi');
    cleaned = cleaned.replace(commaRegex, ' ');
  }

  // Clean up any remaining punctuation and extra spaces
  cleaned = cleaned.replace(/[,\.;]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return { searchTerms: [] };
  }

  // Split into terms
  const terms = cleaned.split(/\s+/).filter(Boolean);

  // Single term - could match first, last, or organization name
  if (terms.length === 1) {
    return { searchTerms: terms };
  }

  // Two terms - could be "First Last" or "Last First"
  if (terms.length === 2) {
    return {
      searchTerms: terms,
      firstName: terms[0],
      lastName: terms[1],
    };
  }

  // Three or more terms - treat first as firstName, last as lastName
  if (terms.length >= 3) {
    return {
      searchTerms: terms,
      firstName: terms[0],
      lastName: terms[terms.length - 1],
    };
  }

  return { searchTerms: terms };
}

/**
 * Build name search conditions with fuzzy matching
 */
function buildNameSearchConditions(nameInput: string): Prisma.ProviderWhereInput[] {
  const parsed = parseNameSearch(nameInput);
  const conditions: Prisma.ProviderWhereInput[] = [];

  if (parsed.searchTerms.length === 0) {
    return conditions;
  }

  // Single term - search across all name fields
  if (parsed.searchTerms.length === 1) {
    const term = parsed.searchTerms[0];
    conditions.push(
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { organizationName: { contains: term, mode: 'insensitive' } },
    );
  }

  // Multiple terms with identified first/last names
  if (parsed.firstName && parsed.lastName) {
    // Try "First Last" combination
    conditions.push({
      AND: [
        { firstName: { contains: parsed.firstName, mode: 'insensitive' } },
        { lastName: { contains: parsed.lastName, mode: 'insensitive' } },
      ],
    });

    // Try "Last First" combination (reverse order)
    conditions.push({
      AND: [
        { firstName: { contains: parsed.lastName, mode: 'insensitive' } },
        { lastName: { contains: parsed.firstName, mode: 'insensitive' } },
      ],
    });
  }

  // Search for each term individually across all fields
  for (const term of parsed.searchTerms) {
    if (term.length >= 2) {
      conditions.push(
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { organizationName: { contains: term, mode: 'insensitive' } },
      );
    }
  }

  // For organization names, try matching all terms together
  if (parsed.searchTerms.length > 1) {
    const allTerms = parsed.searchTerms.join(' ');
    conditions.push({
      organizationName: { contains: allTerms, mode: 'insensitive' },
    });
  }

  return conditions;
}

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
    const nameConditions = buildNameSearchConditions(name);
    if (nameConditions.length > 0) {
      (where.AND as Prisma.ProviderWhereInput[]).push({
        OR: nameConditions,
      });
    }
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
