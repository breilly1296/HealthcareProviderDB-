import { Response } from 'express';

// ============================================================================
// Response Helper Types
// ============================================================================

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a standardized pagination metadata object
 */
export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
  };
}

/**
 * Send a success response with data
 */
export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  res.status(statusCode).json({
    success: true,
    data,
  });
}

/**
 * Send a paginated success response
 */
export function sendPaginatedSuccess<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  limit: number,
  itemsKey: string = 'items'
): void {
  res.json({
    success: true,
    data: {
      [itemsKey]: items,
      pagination: buildPaginationMeta(total, page, limit),
    },
  });
}
