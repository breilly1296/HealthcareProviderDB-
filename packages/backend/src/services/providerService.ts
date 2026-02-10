import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  getPaginationValues,
  cleanWhereClause,
  addAndCondition,
  buildCityFilter,
  mapEntityTypeToDb,
} from './utils';
import logger from '../utils/logger';

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
  specialty?: string;
  specialtyCategory?: string;
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
 * Standard include for enriched provider data
 */
export const PROVIDER_INCLUDE = {
  practice_locations: true,
  provider_taxonomies: true,
  provider_cms_details: true,
  provider_hospitals: true,
  provider_insurance: true,
  provider_medicare: true,
  providerPlanAcceptances: {
    include: {
      insurancePlan: true,
      location: {
        select: {
          id: true,
          address_line1: true,
          city: true,
          state: true,
          zip_code: true,
        },
      },
    },
  },
} as const;

/**
 * Search providers with filters and pagination
 *
 * Updated for new schema:
 * - Address/location filtering goes through practice_locations relation
 * - Specialty uses primary_specialty, primary_taxonomy_code, specialty_category
 * - Entity type maps INDIVIDUAL/ORGANIZATION to DB values '1'/'2'
 */
export async function searchProviders(params: ProviderSearchParams): Promise<ProviderSearchResult> {
  const { state, city, cities, zipCode, specialty, specialtyCategory, name, npi, entityType } = params;
  const { take, skip, page } = getPaginationValues(params.page, params.limit);

  const where: Prisma.ProviderWhereInput = { AND: [] };

  // NPI direct lookup
  if (npi) where.npi = npi;

  // Map entity type: API uses INDIVIDUAL/ORGANIZATION, DB stores '1'/'2'
  if (entityType) {
    where.entityType = mapEntityTypeToDb(entityType);
  }

  // Location-based filters go through practice_locations relation
  if (state || city || cities || zipCode) {
    const locationFilters: Prisma.practice_locationsWhereInput[] = [];

    if (state) locationFilters.push({ state: state.toUpperCase() });
    if (zipCode) locationFilters.push({ zip_code: { startsWith: zipCode } });

    const cityFilter = buildCityFilter(cities, city);
    if (cityFilter) locationFilters.push(cityFilter);

    addAndCondition(where, {
      practice_locations: {
        some: locationFilters.length === 1 ? locationFilters[0] : { AND: locationFilters },
      },
    });
  }

  // Specialty filter - searches primary_specialty, primary_taxonomy_code, and specialty_category
  if (specialty) {
    addAndCondition(where, {
      OR: [
        { primary_specialty: { contains: specialty, mode: 'insensitive' } },
        { primary_taxonomy_code: { contains: specialty, mode: 'insensitive' } },
        { specialty_category: { contains: specialty, mode: 'insensitive' } },
      ]
    });
  }

  // Specialty category filter (exact category match)
  if (specialtyCategory) {
    addAndCondition(where, {
      specialty_category: { contains: specialtyCategory, mode: 'insensitive' },
    });
  }

  // Name search with fuzzy matching
  if (name) {
    const nameConditions = buildNameSearchConditions(name);
    if (nameConditions.length > 0) {
      addAndCondition(where, { OR: nameConditions });
    }
  }

  cleanWhereClause(where);

  const [providers, total] = await Promise.all([
    prisma.provider.findMany({
      where,
      take,
      skip,
      orderBy: [
        { providerPlanAcceptances: { _count: 'desc' } },
        { lastName: 'asc' },
        { firstName: 'asc' },
        { organizationName: 'asc' },
      ],
      include: PROVIDER_INCLUDE,
    }),
    prisma.provider.count({ where }),
  ]);

  return { providers, total, page, limit: take, totalPages: Math.ceil(total / take) };
}

/**
 * Get provider by NPI with all enrichment data
 */
export async function getProviderByNpi(npi: string) {
  return prisma.provider.findUnique({
    where: { npi },
    include: PROVIDER_INCLUDE,
  });
}

/**
 * Get unique cities for a state (sorted alphabetically)
 * Now queries practice_locations table instead of providers
 */
export async function getCitiesByState(state: string): Promise<string[]> {
  const result = await prisma.practice_locations.findMany({
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
 * Entity type: '1' = Individual, '2' = Organization
 */
export function getProviderDisplayName(provider: {
  entityType?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  credential?: string | null;
  organizationName?: string | null;
}): string {
  if (provider.entityType === '2' || provider.entityType === 'ORGANIZATION') {
    return provider.organizationName || 'Unknown Organization';
  }

  const parts = [provider.firstName, provider.lastName]
    .filter(Boolean)
    .join(' ');

  return provider.credential ? `${parts}, ${provider.credential}` : parts || 'Unknown Provider';
}

/**
 * Get primary practice location from a provider's locations array.
 *
 * When `preferredState` (and optionally `preferredCities`) are supplied the
 * function tries to pick a location that matches the search context so the
 * displayed address corresponds to the state/city the user filtered by.
 *
 * Priority order:
 *   1. state + city + practice type
 *   2. state + city (any type)
 *   3. state + practice type
 *   4. state (any type)
 *   5. practice type (original behaviour)
 *   6. first location
 */
export function getPrimaryLocation(
  locations?: Array<{
    address_type?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    phone?: string | null;
    fax?: string | null;
  }>,
  options?: {
    preferredState?: string;
    preferredCities?: string[];
  },
) {
  if (!locations || locations.length === 0) return null;

  if (options?.preferredState) {
    const stateUpper = options.preferredState.toUpperCase();

    if (options.preferredCities && options.preferredCities.length > 0) {
      const citiesLower = options.preferredCities.map(c => c.toLowerCase());

      // 1. state + city + practice type
      const exactMatch = locations.find(
        l =>
          l.state?.toUpperCase() === stateUpper &&
          l.city != null &&
          citiesLower.includes(l.city.toLowerCase()) &&
          l.address_type === 'practice',
      );
      if (exactMatch) return exactMatch;

      // 2. state + city (any type)
      const cityMatch = locations.find(
        l =>
          l.state?.toUpperCase() === stateUpper &&
          l.city != null &&
          citiesLower.includes(l.city.toLowerCase()),
      );
      if (cityMatch) return cityMatch;
    }

    // 3. state + practice type
    const statePractice = locations.find(
      l => l.state?.toUpperCase() === stateUpper && l.address_type === 'practice',
    );
    if (statePractice) return statePractice;

    // 4. state (any type)
    const stateMatch = locations.find(l => l.state?.toUpperCase() === stateUpper);
    if (stateMatch) return stateMatch;
  }

  // 5 & 6. Original fallback
  return locations.find(l => l.address_type === 'practice') || locations[0];
}
