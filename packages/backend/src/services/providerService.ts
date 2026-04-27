import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  getPaginationValues,
  cleanWhereClause,
  addAndCondition,
  buildCityFilter,
  mapEntityTypeToDb,
  mapEntityTypeToApi,
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
  practiceLocations: true,
  providerTaxonomies: true,
  providerCmsDetails: true,
  providerHospitals: true,
  providerInsurance: true,
  providerMedicare: true,
  providerPlanAcceptances: {
    include: {
      insurancePlan: true,
      location: {
        select: {
          id: true,
          addressLine1: true,
          city: true,
          state: true,
          zipCode: true,
        },
      },
    },
  },
} as const;

/**
 * Search providers with filters and pagination
 *
 * Updated for new schema:
 * - Address/location filtering goes through practiceLocations relation
 * - Specialty uses primarySpecialty, primaryTaxonomyCode, specialtyCategory
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

  // Location-based filters go through practiceLocations relation
  if (state || city || cities || zipCode) {
    const locationFilters: Prisma.PracticeLocationWhereInput[] = [];

    if (state) locationFilters.push({ state: state.toUpperCase() });
    if (zipCode) locationFilters.push({ zipCode: { startsWith: zipCode } });

    const cityFilter = buildCityFilter(cities, city);
    if (cityFilter) locationFilters.push(cityFilter);

    addAndCondition(where, {
      practiceLocations: {
        some: locationFilters.length === 1 ? locationFilters[0] : { AND: locationFilters },
      },
    });
  }

  // Specialty filter - searches primarySpecialty, primaryTaxonomyCode, and specialtyCategory
  if (specialty) {
    addAndCondition(where, {
      OR: [
        { primarySpecialty: { contains: specialty, mode: 'insensitive' } },
        { primaryTaxonomyCode: { contains: specialty, mode: 'insensitive' } },
        { specialtyCategory: { contains: specialty, mode: 'insensitive' } },
      ]
    });
  }

  // Specialty category filter (exact category match)
  if (specialtyCategory) {
    addAndCondition(where, {
      specialtyCategory: { contains: specialtyCategory, mode: 'insensitive' },
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
 * Now queries practiceLocations table instead of providers
 */
export async function getCitiesByState(state: string): Promise<string[]> {
  const result = await prisma.practiceLocation.findMany({
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
    addressType?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
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
          l.addressType === 'practice',
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
      l => l.state?.toUpperCase() === stateUpper && l.addressType === 'practice',
    );
    if (statePractice) return statePractice;

    // 4. state (any type)
    const stateMatch = locations.find(l => l.state?.toUpperCase() === stateUpper);
    if (stateMatch) return stateMatch;
  }

  // 5 & 6. Original fallback
  return locations.find(l => l.addressType === 'practice') || locations[0];
}

// ============================================================================
// findNearbyProviders — radius-based proximity search (F-16)
// ============================================================================

export interface NearbyParams {
  lat: number;
  lng: number;
  radius: number; // miles
  specialty?: string;
  specialtyCategory?: string;
  name?: string;
  entityType?: 'INDIVIDUAL' | 'ORGANIZATION';
  page?: number;
  limit?: number;
}

export interface NearbyProvider {
  npi: string;
  entityType: string;
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  credential: string | null;
  displayName: string;
  primarySpecialty: string | null;
  specialtyCategory: string | null;
  taxonomyCode: string | null;
  npiStatus: 'ACTIVE' | 'DEACTIVATED';
  practiceLocation: {
    id: number;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    phone: string | null;
    latitude: number;
    longitude: number;
  };
  distanceMiles: number;
}

export interface NearbyResult {
  providers: NearbyProvider[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  searchCenter: { lat: number; lng: number; radiusMiles: number };
}

// Earth's mean radius in miles — used in the spherical law of cosines
// formula below. 3959 is the standard approximation.
const EARTH_RADIUS_MILES = 3959;

// Shape returned by the raw SQL CTE — one row per (provider, nearest
// location) pair. All column names are the DB names so Prisma's raw-query
// deserializer maps them directly.
interface NearbyRow {
  npi: string;
  entity_type: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  credential: string | null;
  primary_specialty: string | null;
  specialty_category: string | null;
  primary_taxonomy_code: string | null;
  deactivation_date: string | null;
  location_id: number;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  distance_miles: number;
}

/**
 * Find providers within `radius` miles of (lat, lng), sorted by distance.
 *
 * Strategy:
 *   1. Bounding-box pre-filter using the composite (latitude, longitude)
 *      index — cuts the candidate set from ~348k to a few thousand rows
 *      before any trig runs.
 *   2. Spherical-law-of-cosines distance inside a CTE. acos() is clamped
 *      to [-1, 1] with LEAST/GREATEST because floating-point drift can push
 *      the argument marginally out of domain for antipodal-ish points
 *      (acos throws on out-of-domain input in Postgres).
 *   3. DISTINCT ON (npi) keeps the nearest practice location per provider
 *      so a provider with 3 offices appears once, at their closest office.
 *   4. Count query reuses the same predicates for accurate pagination.
 *
 * All user-supplied values (lat, lng, radius, filters, limit, offset) are
 * parameterized via Prisma.sql — never string-interpolated. Inline SQL
 * fragments (the filter ANDs) are composed with Prisma.join/Prisma.sql so
 * the final query still parameterizes every user value as $1, $2, ...
 */
export async function findNearbyProviders(params: NearbyParams): Promise<NearbyResult> {
  const { lat, lng, radius, specialty, specialtyCategory, name, entityType } = params;
  const { take, skip, page } = getPaginationValues(params.page, params.limit);

  // Bounding box, expressed in degrees. 1° latitude ≈ 69 miles everywhere;
  // 1° longitude ≈ 69·cos(φ) miles. We pad 1% to protect against
  // rounding — cheaper than missing a result.
  const latDelta = (radius / 69) * 1.01;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  // Near the poles cos(lat) → 0, so clamp to avoid divide-by-tiny. In
  // practice US-only traffic never gets close, but the clamp keeps the
  // query well-defined for any input the schema accepts.
  const lngDelta = (radius / (69 * Math.max(0.1, Math.abs(cosLat)))) * 1.01;
  const latMin = lat - latDelta;
  const latMax = lat + latDelta;
  const lngMin = lng - lngDelta;
  const lngMax = lng + lngDelta;

  // Optional WHERE fragments. Each Prisma.sql`...` still parameterizes any
  // interpolated value — only the SQL template around it is literal.
  const filters: Prisma.Sql[] = [];
  if (specialty) {
    const like = `%${specialty}%`;
    filters.push(Prisma.sql`AND (p.primary_specialty ILIKE ${like} OR p.specialty_category ILIKE ${like} OR p.primary_taxonomy_code ILIKE ${like})`);
  }
  if (specialtyCategory) {
    filters.push(Prisma.sql`AND p.specialty_category ILIKE ${`%${specialtyCategory}%`}`);
  }
  if (entityType) {
    filters.push(Prisma.sql`AND p.entity_type = ${mapEntityTypeToDb(entityType)}`);
  }
  if (name) {
    const like = `%${name}%`;
    filters.push(Prisma.sql`AND (p.first_name ILIKE ${like} OR p.last_name ILIKE ${like} OR p.organization_name ILIKE ${like})`);
  }
  const filterSql = filters.length > 0 ? Prisma.join(filters, ' ') : Prisma.empty;

  // Distance expression reused by both the row query (as a CTE column)
  // and the count query (inline predicate). Expressed once here so the
  // two stay in sync.
  const distanceSql = Prisma.sql`
    ${EARTH_RADIUS_MILES}::double precision * acos(
      LEAST(1::double precision, GREATEST(-1::double precision,
        cos(radians(${lat}::double precision)) * cos(radians(pl.latitude)) *
        cos(radians(pl.longitude) - radians(${lng}::double precision)) +
        sin(radians(${lat}::double precision)) * sin(radians(pl.latitude))
      ))
    )
  `;

  const rows = await prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
    WITH candidates AS (
      SELECT
        p.npi,
        p.entity_type,
        p.first_name,
        p.last_name,
        p.organization_name,
        p.credential,
        p.primary_specialty,
        p.specialty_category,
        p.primary_taxonomy_code,
        p.deactivation_date,
        pl.id AS location_id,
        pl.address_line1,
        pl.address_line2,
        pl.city,
        pl.state,
        pl.zip_code,
        pl.phone,
        pl.latitude,
        pl.longitude,
        ${distanceSql} AS distance_miles
      FROM providers p
      JOIN practice_locations pl ON pl.npi = p.npi
      WHERE pl.latitude IS NOT NULL
        AND pl.longitude IS NOT NULL
        AND pl.latitude BETWEEN ${latMin} AND ${latMax}
        AND pl.longitude BETWEEN ${lngMin} AND ${lngMax}
        ${filterSql}
    ),
    in_range AS (
      SELECT DISTINCT ON (npi) *
      FROM candidates
      WHERE distance_miles <= ${radius}
      ORDER BY npi, distance_miles ASC
    )
    SELECT * FROM in_range
    ORDER BY distance_miles ASC, last_name ASC NULLS LAST, first_name ASC NULLS LAST
    LIMIT ${take} OFFSET ${skip}
  `);

  // Total count — same bounding box + distance + filters, DISTINCT on npi
  // so a multi-office provider counts once. ::int cast avoids BigInt in the
  // return payload.
  const countRows = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT COUNT(DISTINCT p.npi)::int AS total
    FROM providers p
    JOIN practice_locations pl ON pl.npi = p.npi
    WHERE pl.latitude IS NOT NULL
      AND pl.longitude IS NOT NULL
      AND pl.latitude BETWEEN ${latMin} AND ${latMax}
      AND pl.longitude BETWEEN ${lngMin} AND ${lngMax}
      AND ${distanceSql} <= ${radius}
      ${filterSql}
  `);
  const total = countRows[0]?.total ?? 0;

  logger.debug(
    { lat, lng, radius, total, returned: rows.length },
    'Nearby provider search',
  );

  const providers: NearbyProvider[] = rows.map(row => ({
    npi: row.npi,
    entityType: mapEntityTypeToApi(row.entity_type),
    firstName: row.first_name,
    lastName: row.last_name,
    organizationName: row.organization_name,
    credential: row.credential,
    displayName: getProviderDisplayName({
      entityType: row.entity_type,
      firstName: row.first_name,
      lastName: row.last_name,
      credential: row.credential,
      organizationName: row.organization_name,
    }),
    primarySpecialty: row.primary_specialty,
    specialtyCategory: row.specialty_category,
    taxonomyCode: row.primary_taxonomy_code,
    npiStatus: row.deactivation_date ? 'DEACTIVATED' : 'ACTIVE',
    practiceLocation: {
      id: row.location_id,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      phone: row.phone,
      latitude: row.latitude,
      longitude: row.longitude,
    },
    // Round to 1 decimal — displayed as "2.3 miles away". Raw value has
    // ~10m precision that isn't meaningful given the formula's ~0.5% error.
    distanceMiles: Math.round(row.distance_miles * 10) / 10,
  }));

  return {
    providers,
    total,
    page,
    limit: take,
    totalPages: Math.max(1, Math.ceil(total / take)),
    searchCenter: { lat, lng, radiusMiles: radius },
  };
}
