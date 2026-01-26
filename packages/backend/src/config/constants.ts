// ============================================================================
// Time Constants
// ============================================================================

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

// ============================================================================
// Verification Constants
// ============================================================================

/**
 * Verification TTL (6 months)
 * Based on 12% annual provider turnover research - verifications older than
 * 6 months are considered stale and need re-verification.
 */
export const VERIFICATION_TTL_MS = 6 * 30 * MS_PER_DAY;

/**
 * Sybil attack prevention window (30 days)
 * Prevents the same IP/user from submitting multiple verifications for
 * the same provider-plan pair within this window.
 */
export const SYBIL_PREVENTION_WINDOW_MS = 30 * MS_PER_DAY;

// ============================================================================
// Consensus Thresholds
// ============================================================================

/**
 * Minimum verifications required before changing acceptance status.
 * Based on Mortensen et al. (2015) research on crowdsourced data reliability.
 */
export const MIN_VERIFICATIONS_FOR_CONSENSUS = 3;

/**
 * Minimum confidence score required to change acceptance status.
 * Prevents low-confidence data from affecting provider records.
 */
export const MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60;

// ============================================================================
// CAPTCHA Settings
// ============================================================================

/**
 * Minimum reCAPTCHA v3 score to pass verification.
 * Scores range from 0.0 (likely bot) to 1.0 (likely human).
 */
export const CAPTCHA_MIN_SCORE = 0.5;

/**
 * Timeout for Google reCAPTCHA API calls.
 */
export const CAPTCHA_API_TIMEOUT_MS = 5 * MS_PER_SECOND;

/**
 * Maximum requests allowed in fallback mode (when CAPTCHA API is unavailable).
 */
export const CAPTCHA_FALLBACK_MAX_REQUESTS = 3;

/**
 * Time window for fallback rate limiting.
 */
export const CAPTCHA_FALLBACK_WINDOW_MS = MS_PER_HOUR;

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Interval for cleaning up expired rate limit entries.
 */
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = MS_PER_MINUTE;

// ============================================================================
// Pagination Defaults
// ============================================================================

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
