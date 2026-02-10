import { Prisma } from '@prisma/client';

/**
 * Shared utility functions for services
 * Extracted to follow DRY principle
 */

/** Default pagination values */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Pagination result interface for consistent API responses */
export interface PaginatedResult<T> {
  items: T;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Calculate pagination values with bounds checking
 */
export function getPaginationValues(page = DEFAULT_PAGE, limit = DEFAULT_LIMIT) {
  const take = Math.min(limit, MAX_LIMIT);
  const skip = (page - 1) * take;
  return { take, skip, page };
}

/**
 * Build paginated result from items and count
 */
export function buildPaginatedResult<T>(
  items: T,
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Parse comma-separated cities into a city filter condition for practice_locations.
 * Returns a Prisma-compatible where fragment for the city field.
 */
export function buildCityFilter(
  cities: string | undefined,
  city: string | undefined
): Prisma.practice_locationsWhereInput | null {
  if (cities) {
    const cityArray = cities.split(',').map(c => c.trim()).filter(Boolean);
    if (cityArray.length > 0) {
      return {
        OR: cityArray.map(cityName => ({
          city: { equals: cityName, mode: 'insensitive' as const }
        }))
      };
    }
  }

  if (city) {
    return { city: { contains: city, mode: 'insensitive' as const } };
  }

  return null;
}

/**
 * Map entity type from API value (INDIVIDUAL/ORGANIZATION) to DB value ('1'/'2')
 */
export function mapEntityTypeToDb(entityType: string): string {
  if (entityType === 'INDIVIDUAL') return '1';
  if (entityType === 'ORGANIZATION') return '2';
  return entityType;
}

/**
 * Map entity type from DB value ('1'/'2') to API value (INDIVIDUAL/ORGANIZATION)
 */
export function mapEntityTypeToApi(dbValue: string | null | undefined): string {
  if (dbValue === '1') return 'INDIVIDUAL';
  if (dbValue === '2') return 'ORGANIZATION';
  return dbValue || 'UNKNOWN';
}

/** Type for Prisma where clauses with optional AND array */
type WhereWithAnd = { AND?: unknown[] | unknown };

/**
 * Clean up empty AND arrays in Prisma where clauses
 */
export function cleanWhereClause<T extends WhereWithAnd>(where: T): T {
  const w = where as { AND?: unknown[] };
  if (Array.isArray(w.AND) && w.AND.length === 0) {
    delete w.AND;
  }
  return where;
}

/**
 * Add condition to AND array, initializing if needed
 */
export function addAndCondition<T extends WhereWithAnd>(
  where: T,
  condition: unknown
): void {
  const w = where as { AND?: unknown[] };
  if (!w.AND) {
    w.AND = [];
  }
  w.AND.push(condition);
}
