/**
 * Standardized Error Handling Utilities
 * =====================================
 *
 * This module provides consistent error handling patterns across the frontend.
 *
 * Usage:
 * ------
 * 1. In catch blocks, convert unknown errors to ClientError:
 *    ```typescript
 *    try {
 *      await api.call();
 *    } catch (err) {
 *      const clientError = toClientError(err);
 *      setError(clientError);
 *    }
 *    ```
 *
 * 2. Display user-friendly messages:
 *    ```typescript
 *    <ErrorMessage message={getUserMessage(error)} />
 *    ```
 *
 * 3. Determine error type for UI variants:
 *    ```typescript
 *    const variant = getErrorVariant(error);
 *    <ErrorMessage variant={variant} message={getUserMessage(error)} />
 *    ```
 *
 * 4. Check if retry is appropriate:
 *    ```typescript
 *    {error.retryable && <button onClick={retry}>Try Again</button>}
 *    ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Standardized error type used throughout the application
 */
export interface ClientError {
  /** The error message (may be technical) */
  message: string;
  /** Application-specific error code */
  code?: string;
  /** HTTP status code if from API */
  statusCode?: number;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** X-Request-ID for the failing request, when available — usable as a support ref and for backend log correlation. */
  requestId?: string;
  /**
   * Field-level error details from the backend. Populated for two paths:
   *   - Zod validation failures (errorHandler.ts auto-emits these)
   *   - AppError.badRequest(message, code, details) callers that pass a
   *     structured details array (added 2026-04-26)
   * Form components can read this to highlight which input failed.
   */
  details?: Array<{ field?: string; message: string }>;
  /** Original error for debugging */
  originalError?: unknown;
}

/**
 * Error variants that map to UI states
 */
export type ErrorVariant = 'network' | 'server' | 'not-found' | 'validation' | 'rate-limit' | 'unknown';

/**
 * Extended Error type that may come from API responses
 */
interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  status?: number;
  requestId?: string | null;
  /** Structured field-level details. Type is `unknown` because the
   *  ApiErrorDetails legacy type in lib/api.ts allows a single object
   *  shape, but the backend now also emits Array<{ field?, message }>.
   *  `extractClientErrorDetails` runtime-checks for the array shape. */
  details?: unknown;
}

/**
 * Runtime-narrow an unknown `details` value into the ClientError shape.
 * Returns `undefined` unless the input is an array of objects with a
 * string `message`. Filters out malformed entries rather than rejecting
 * the whole array, so a single bad entry doesn't drop the rest.
 */
function extractClientErrorDetails(
  value: unknown
): ClientError['details'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const valid = value.filter(
    (e): e is { field?: string; message: string } =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as { message?: unknown }).message === 'string'
  );
  return valid.length > 0 ? valid : undefined;
}

// ============================================================================
// Error Classification
// ============================================================================

/**
 * HTTP status codes that indicate retryable errors
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Network-related error messages (case-insensitive matching)
 */
const NETWORK_ERROR_PATTERNS = [
  'network',
  'fetch',
  'connection',
  'timeout',
  'offline',
  'internet',
  'failed to fetch',
  'networkerror',
  'econnrefused',
  'econnreset',
  'enotfound',
];

/**
 * Not found error patterns
 */
const NOT_FOUND_PATTERNS = [
  'not found',
  '404',
  'does not exist',
  'no longer available',
];

/**
 * Validation error patterns
 */
const VALIDATION_PATTERNS = [
  'invalid',
  'validation',
  'required',
  'must be',
  'cannot be',
  'too long',
  'too short',
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Determine if an HTTP status code indicates a retryable error.
 * 5xx errors and 429 (rate limit) are typically retryable.
 */
export function isRetryableStatus(status?: number): boolean {
  if (!status) return true;
  return RETRYABLE_STATUS_CODES.has(status);
}

/**
 * Check if an error message matches network-related patterns
 */
export function isNetworkError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some(pattern => lowerMessage.includes(pattern));
}

/**
 * Check if an error message matches not-found patterns
 */
export function isNotFoundError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return NOT_FOUND_PATTERNS.some(pattern => lowerMessage.includes(pattern));
}

/**
 * Check if an error message matches validation patterns
 */
export function isValidationError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return VALIDATION_PATTERNS.some(pattern => lowerMessage.includes(pattern));
}

/**
 * Check if the error is an AbortError (from AbortController)
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

// ============================================================================
// Error Conversion
// ============================================================================

/**
 * Convert any caught error to a standardized ClientError.
 * Handles Error objects, API errors with status codes, and unknown types.
 *
 * @param error - The caught error (unknown type from catch blocks)
 * @returns Standardized ClientError object
 */
export function toClientError(error: unknown): ClientError {
  // Handle Error instances (including API errors)
  if (error instanceof Error) {
    const apiError = error as ApiError;
    const statusCode = apiError.statusCode ?? apiError.status;
    const details = extractClientErrorDetails(apiError.details);

    return {
      message: error.message,
      statusCode,
      code: apiError.code,
      retryable: isRetryableStatus(statusCode) && !isNotFoundError(error.message),
      requestId: apiError.requestId ?? undefined,
      ...(details && { details }),
      originalError: error,
    };
  }

  // Handle plain objects with error-like properties
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    const message = typeof errorObj.message === 'string'
      ? errorObj.message
      : 'An unexpected error occurred';
    const statusCode = typeof errorObj.statusCode === 'number'
      ? errorObj.statusCode
      : typeof errorObj.status === 'number'
        ? errorObj.status
        : undefined;
    const details = extractClientErrorDetails(errorObj.details);

    return {
      message,
      statusCode,
      code: typeof errorObj.code === 'string' ? errorObj.code : undefined,
      retryable: isRetryableStatus(statusCode),
      ...(details && { details }),
      originalError: error,
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      message: error,
      retryable: true,
      originalError: error,
    };
  }

  // Fallback for truly unknown errors
  return {
    message: 'An unexpected error occurred',
    retryable: true,
    originalError: error,
  };
}

// ============================================================================
// User-Facing Messages
// ============================================================================

/**
 * Get a user-friendly error message suitable for display.
 * Transforms technical error messages into helpful user guidance.
 *
 * @param error - ClientError or string message
 * @returns User-friendly error message
 */
export function getUserMessage(error: ClientError | string): string {
  const clientError = typeof error === 'string' ? { message: error, retryable: true } : error;
  const { message, statusCode } = clientError;

  // Handle specific status codes
  if (statusCode === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  if (statusCode === 401) {
    return 'Your session has expired. Please refresh the page.';
  }

  if (statusCode === 403) {
    return 'You don\'t have permission to perform this action.';
  }

  if (statusCode === 404) {
    return 'The requested resource was not found.';
  }

  if (statusCode && statusCode >= 500) {
    return 'Our servers are having issues. Please try again later.';
  }

  // Handle network errors
  if (isNetworkError(message)) {
    return 'Unable to connect. Please check your internet connection and try again.';
  }

  // Handle validation errors
  if (isValidationError(message)) {
    // Validation errors are often already user-friendly
    return message;
  }

  // Handle not found errors
  if (isNotFoundError(message)) {
    return 'The requested item could not be found.';
  }

  // Default: use the original message if it seems user-friendly, otherwise generic
  if (message && message.length < 200 && !message.includes('Error:') && !message.includes('at ')) {
    return message;
  }

  return 'Something went wrong. Please try again.';
}

// ============================================================================
// UI Integration
// ============================================================================

/**
 * Determine the appropriate UI variant for an error.
 * Maps to ErrorMessage component variants.
 *
 * @param error - ClientError or string message
 * @returns ErrorVariant for UI rendering
 */
export function getErrorVariant(error: ClientError | string): ErrorVariant {
  const clientError = typeof error === 'string' ? { message: error, retryable: true } : error;
  const { message, statusCode } = clientError;

  // Status code based classification
  if (statusCode === 429) {
    return 'rate-limit';
  }

  if (statusCode === 404) {
    return 'not-found';
  }

  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return 'validation';
  }

  if (statusCode && statusCode >= 500) {
    return 'server';
  }

  // Message based classification
  if (isNetworkError(message)) {
    return 'network';
  }

  if (isNotFoundError(message)) {
    return 'not-found';
  }

  if (isValidationError(message)) {
    return 'validation';
  }

  return 'server';
}

/**
 * Create an error state object suitable for component state.
 * Combines message, type, and retryable status.
 *
 * @param error - The caught error
 * @returns Object with message, type, and retryable properties
 */
export function createErrorState(error: unknown): {
  message: string;
  type: ErrorVariant;
  retryable: boolean;
} {
  const clientError = toClientError(error);
  return {
    message: getUserMessage(clientError),
    type: getErrorVariant(clientError),
    retryable: clientError.retryable,
  };
}

// ============================================================================
// Logging & Debugging
// ============================================================================

/**
 * Log an error with consistent formatting for debugging.
 * In production, this could be connected to error tracking services.
 *
 * @param context - Where the error occurred (e.g., 'ProviderSearch', 'API.getProvider')
 * @param error - The error to log
 */
export function logError(context: string, error: unknown): void {
  const clientError = toClientError(error);

  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context}] Error:`, {
      message: clientError.message,
      code: clientError.code,
      statusCode: clientError.statusCode,
      retryable: clientError.retryable,
      originalError: clientError.originalError,
    });
  } else {
    // In production, log minimal info
    console.error(`[${context}] ${clientError.message}`);
  }

  // Route through the centralized helper — it handles SSR guards, ApiError
  // filtering (4xx skip, 5xx captured by apiFetch), and PII discipline.
  // Use dynamic import to avoid a cycle: analytics.ts → (future) → errorUtils.
  if (typeof window !== 'undefined') {
    import('./analytics')
      .then(({ trackException }) => trackException(error, { source: context }))
      .catch(() => {
        // analytics module failed to load — silently ignore
      });
  }
}
