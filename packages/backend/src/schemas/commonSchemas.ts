import { z } from 'zod';

// ============================================================================
// Shared Validation Schemas
// ============================================================================
// These schemas are used across multiple route files to ensure consistent
// validation of common parameters like pagination, NPI, state, and plan IDs.

/**
 * Pagination schema - validates page and limit query parameters
 * Used in: providers.ts, plans.ts, verify.ts, locations.ts
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * NPI parameter schema - validates 10-digit NPI numbers
 * Used in: providers.ts, verify.ts
 */
export const npiParamSchema = z.object({
  npi: z.string().length(10).regex(/^\d+$/, 'NPI must be exactly 10 digits'),
});

/**
 * State query schema - validates 2-letter state codes
 * Used in: providers.ts, plans.ts, locations.ts
 */
export const stateQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
});

/**
 * Plan ID parameter schema - validates plan identifiers
 * Used in: plans.ts, verify.ts
 */
export const planIdParamSchema = z.object({
  planId: z.string().min(1).max(50),
});

/**
 * Nearby (proximity) search schema (F-16).
 *
 * - lat/lng validated against WGS84 bounds so garbage input is rejected
 *   before it reaches the Haversine formula (acos domain errors otherwise).
 * - radius capped at 100 miles: above that the bounding-box pre-filter
 *   becomes useless (~30k sq mi) and the spherical-law-of-cosines
 *   approximation error grows past ~0.5%.
 * - specialty/name/entityType mirror the /providers/search filters so a
 *   user can narrow results after geolocation.
 */
export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(0.5).max(100).default(10),
  specialty: z.string().min(1).max(200).optional(),
  specialtyCategory: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
}).merge(paginationSchema);

// ============================================================================
// Type Exports
// ============================================================================

export type PaginationInput = z.infer<typeof paginationSchema>;
export type NpiParamInput = z.infer<typeof npiParamSchema>;
export type StateQueryInput = z.infer<typeof stateQuerySchema>;
export type PlanIdParamInput = z.infer<typeof planIdParamSchema>;
export type NearbyQueryInput = z.infer<typeof nearbyQuerySchema>;
