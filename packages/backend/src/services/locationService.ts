import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getPaginationValues } from './utils';

// ============================================================================
// Types
// ============================================================================

export interface LocationSearchParams {
  state: string;
  city?: string;
  zipCode?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// Shared Selects
// ============================================================================

/**
 * Explicit select for practice_locations to avoid unmigrated columns (address_hash).
 * Once the Phase 2 migration lands, address_hash can be added here.
 */
const locationSelect = {
  id: true,
  npi: true,
  address_type: true,
  address_line1: true,
  address_line2: true,
  city: true,
  state: true,
  zip_code: true,
  phone: true,
  fax: true,
  latitude: true,
  longitude: true,
  geocoded_at: true,
} as const;

const providerBriefSelect = {
  npi: true,
  firstName: true,
  lastName: true,
  organizationName: true,
  entityType: true,
  primary_specialty: true,
} as const;

const providerDetailSelect = {
  ...providerBriefSelect,
  credential: true,
} as const;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Search practice locations with filters and pagination.
 * State is required; city and zipCode are optional refinements.
 */
export async function searchLocations(params: LocationSearchParams) {
  const { state, city, zipCode } = params;
  const { take, skip, page } = getPaginationValues(params.page, params.limit);

  const where: Prisma.practice_locationsWhereInput = {
    state: state.toUpperCase(),
  };

  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }

  if (zipCode) {
    where.zip_code = { startsWith: zipCode };
  }

  const [locations, total] = await Promise.all([
    prisma.practice_locations.findMany({
      where,
      take,
      skip,
      orderBy: [{ city: 'asc' }, { address_line1: 'asc' }],
      select: {
        ...locationSelect,
        providers: { select: providerBriefSelect },
      },
    }),
    prisma.practice_locations.count({ where }),
  ]);

  return { locations, total, page, limit: take, totalPages: Math.ceil(total / take) };
}

/**
 * Get a single practice location by ID, including its parent provider.
 */
export async function getLocationById(id: number) {
  return prisma.practice_locations.findUnique({
    where: { id },
    select: {
      ...locationSelect,
      providers: { select: providerDetailSelect },
    },
  });
}

/**
 * Get all providers that share the same physical address as the given location.
 * Matches on address_line1 + city + state + zip_code (case-insensitive for text fields).
 */
export async function getProvidersAtLocation(
  id: number,
  options: { page?: number; limit?: number } = {}
) {
  const { take, skip, page } = getPaginationValues(options.page, options.limit);

  const location = await prisma.practice_locations.findUnique({
    where: { id },
    select: locationSelect,
  });

  if (!location) return null;

  // Need at least address_line1 for a meaningful address match
  if (!location.address_line1) {
    return { location, providers: [], total: 0, page, limit: take, totalPages: 0 };
  }

  // Match colocated locations by address fields (only filter on non-null fields)
  const where: Prisma.practice_locationsWhereInput = {
    address_line1: { equals: location.address_line1, mode: 'insensitive' },
    ...(location.city && { city: { equals: location.city, mode: 'insensitive' as const } }),
    ...(location.state && { state: location.state }),
    ...(location.zip_code && { zip_code: location.zip_code }),
  };

  const [colocated, total] = await Promise.all([
    prisma.practice_locations.findMany({
      where,
      take,
      skip,
      select: {
        ...locationSelect,
        providers: { select: providerDetailSelect },
      },
      orderBy: { npi: 'asc' },
    }),
    prisma.practice_locations.count({ where }),
  ]);

  return { location, providers: colocated, total, page, limit: take, totalPages: Math.ceil(total / take) };
}

/**
 * Get distinct NPIs of providers colocated at the same address.
 * Excludes the queried provider's NPI. Returns paginated NPI strings.
 */
export async function getColocatedNpis(
  addressLine1: string,
  city: string | null,
  state: string | null,
  zipCode: string | null,
  excludeNpi: string,
  options: { page?: number; limit?: number } = {}
) {
  const { take, skip, page } = getPaginationValues(options.page, options.limit);

  const where: Prisma.practice_locationsWhereInput = {
    address_line1: { equals: addressLine1, mode: 'insensitive' },
    ...(city && { city: { equals: city, mode: 'insensitive' as const } }),
    ...(state && { state }),
    ...(zipCode && { zip_code: zipCode }),
    npi: { not: excludeNpi },
  };

  // Fetch all distinct NPIs for total count (Prisma doesn't support count + distinct together)
  const allDistinct = await prisma.practice_locations.findMany({
    where,
    select: { npi: true },
    distinct: ['npi'],
    orderBy: { npi: 'asc' },
  });

  const total = allDistinct.length;

  // Paginate the distinct NPIs
  const paginatedNpis = allDistinct.slice(skip, skip + take).map(r => r.npi);

  return { npis: paginatedNpis, total, page, limit: take };
}

/**
 * Get distinct health system names from provider_hospitals.
 * Optionally filtered by state/city via providers → practice_locations.
 */
export async function getHealthSystems(options: { state?: string; city?: string } = {}) {
  const where: Prisma.provider_hospitalsWhereInput = {
    hospital_system: { not: null },
  };

  if (options.state || options.city) {
    where.providers = {
      practice_locations: {
        some: {
          ...(options.state && { state: options.state.toUpperCase() }),
          ...(options.city && { city: { contains: options.city, mode: 'insensitive' as const } }),
        },
      },
    };
  }

  const results = await prisma.provider_hospitals.findMany({
    where,
    select: { hospital_system: true },
    distinct: ['hospital_system'],
    orderBy: { hospital_system: 'asc' },
  });

  return results
    .map(r => r.hospital_system)
    .filter((hs): hs is string => hs !== null);
}

/**
 * Get location statistics for a state.
 */
export async function getLocationStats(state: string) {
  const upperState = state.toUpperCase();

  const [totalLocations, distinctCities, distinctZips, distinctProviders] = await Promise.all([
    prisma.practice_locations.count({
      where: { state: upperState },
    }),
    prisma.practice_locations.findMany({
      where: { state: upperState, city: { not: null } },
      select: { city: true },
      distinct: ['city'],
    }),
    prisma.practice_locations.findMany({
      where: { state: upperState, zip_code: { not: null } },
      select: { zip_code: true },
      distinct: ['zip_code'],
    }),
    prisma.practice_locations.findMany({
      where: { state: upperState },
      select: { npi: true },
      distinct: ['npi'],
    }),
  ]);

  return {
    totalLocations,
    distinctCities: distinctCities.length,
    distinctZipCodes: distinctZips.length,
    totalProviders: distinctProviders.length,
  };
}
