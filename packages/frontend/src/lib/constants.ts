// ============================================================================
// Centralized Constants
// ============================================================================

// API and pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// UI limits
export const MAX_COMPARE_PROVIDERS = 3;
export const MAX_RECENT_SEARCHES = 5;

// Confidence score thresholds (match backend)
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 70,      // Green - high confidence
  MEDIUM: 40,    // Yellow - medium confidence
  LOW: 0,        // Red - low confidence
} as const;

// Freshness thresholds (in days)
export const FRESHNESS_THRESHOLDS = {
  FRESH: 30,     // Green - verified within 30 days
  STALE: 90,     // Yellow - 30-90 days old
  EXPIRED: 180,  // Red - over 90 days, expires at 180
} as const;

// Verification status
export const ACCEPTANCE_STATUS = {
  ACCEPTED: 'ACCEPTED',
  NOT_ACCEPTED: 'NOT_ACCEPTED',
  PENDING: 'PENDING',
  UNKNOWN: 'UNKNOWN',
} as const;

// Entity types
export const ENTITY_TYPES = {
  INDIVIDUAL: 'INDIVIDUAL',
  ORGANIZATION: 'ORGANIZATION',
} as const;
