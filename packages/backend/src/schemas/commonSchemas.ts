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

// ============================================================================
// Type Exports
// ============================================================================

export type PaginationInput = z.infer<typeof paginationSchema>;
export type NpiParamInput = z.infer<typeof npiParamSchema>;
export type StateQueryInput = z.infer<typeof stateQuerySchema>;
export type PlanIdParamInput = z.infer<typeof planIdParamSchema>;
