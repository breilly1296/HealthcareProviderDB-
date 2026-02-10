import toast from 'react-hot-toast';
import type {
  SearchFilters,
  PaginationState,
  Location,
  ProviderDisplay,
  InsurancePlanDisplay,
  PlanAcceptanceDisplay,
  Verification,
  CarrierGroup,
} from '../types';

// ============================================================================
// Configuration
// ============================================================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// ============================================================================
// Retry Configuration
// ============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay between retries in milliseconds (default: 1000) */
  retryDelay?: number;
  /** HTTP status codes that should trigger a retry */
  retryableStatuses?: number[];
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 2,
  retryDelay: 1000,
  retryableStatuses: [429, 500, 502, 503, 504],
  exponentialBackoff: true,
};

// ============================================================================
// ApiError Class
// ============================================================================

export interface ApiErrorDetails {
  field?: string;
  constraint?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: ApiErrorDetails | null;
  public readonly retryAfter: number | null;

  constructor(
    message: string,
    statusCode: number,
    code: string = 'UNKNOWN_ERROR',
    details: ApiErrorDetails | null = null,
    retryAfter: number | null = null
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }

  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  isValidationError(): boolean {
    return this.statusCode === 400 || this.code === 'VALIDATION_ERROR';
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }

  isUnauthorized(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }

  isRetryable(): boolean {
    return DEFAULT_RETRY_OPTIONS.retryableStatuses.includes(this.statusCode);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is an AbortError (request was cancelled)
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Check if an error appears to be a network error
 */
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    error.name === 'TypeError' || // fetch network errors are TypeErrors
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('econnreset')
  );
}

/**
 * Parse Retry-After header value to milliseconds
 * Supports both seconds (integer) and HTTP-date format
 */
function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null;

  // Try parsing as seconds (integer)
  const seconds = parseInt(headerValue, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP-date
  const date = new Date(headerValue);
  if (!isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return delayMs > 0 ? delayMs : null;
  }

  return null;
}

/**
 * Calculate delay for retry attempt with exponential backoff
 */
function calculateRetryDelay(
  attempt: number,
  baseDelay: number,
  useExponentialBackoff: boolean,
  retryAfterMs: number | null
): number {
  // If we have a Retry-After header, use it (but cap at 30 seconds)
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, 30000);
  }

  // Calculate exponential backoff: baseDelay * 2^attempt
  // e.g., 1000ms, 2000ms, 4000ms for attempts 0, 1, 2
  if (useExponentialBackoff) {
    return baseDelay * Math.pow(2, attempt);
  }

  return baseDelay;
}

/**
 * Log retry attempt for debugging
 */
function logRetry(
  attempt: number,
  maxRetries: number,
  url: string,
  reason: string,
  delayMs: number
): void {
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      `[API Retry] Attempt ${attempt + 1}/${maxRetries + 1} for ${url}: ${reason}. ` +
      `Retrying in ${Math.round(delayMs / 1000)}s...`
    );
  }
}

/**
 * Format seconds into human-readable time for rate limit messages
 */
function formatRetryTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
}

/**
 * Build URLSearchParams from object, filtering out undefined/null/empty values
 */
export function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        // Join arrays with commas for multi-value params
        if (value.length > 0) {
          searchParams.set(key, value.join(','));
        }
      } else {
        searchParams.set(key, String(value));
      }
    }
  });
  return searchParams.toString();
}

// ============================================================================
// Fetch with Retry
// ============================================================================

/**
 * Fetch wrapper with automatic retry for transient failures.
 *
 * Features:
 * - Retries on 5xx errors and 429 (rate limit)
 * - Retries on network errors
 * - Exponential backoff between retries
 * - Respects Retry-After header for 429 responses
 * - Does NOT retry aborted requests
 * - Does NOT retry 4xx client errors (except 429)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries,
    retryDelay,
    retryableStatuses,
    exponentialBackoff,
  } = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Check if we should retry based on status code
      if (!response.ok && retryableStatuses.includes(response.status)) {
        // Don't retry if this is the last attempt
        if (attempt < maxRetries) {
          const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
          const delayMs = calculateRetryDelay(attempt, retryDelay, exponentialBackoff, retryAfterMs);

          logRetry(attempt, maxRetries, url, `HTTP ${response.status}`, delayMs);

          await sleep(delayMs);
          continue;
        }
      }

      // Return response (caller will handle non-ok responses)
      return response;

    } catch (error) {
      lastError = error as Error;

      // Never retry aborted requests
      if (isAbortError(error)) {
        throw error;
      }

      // Retry network errors
      if (isNetworkError(error) && attempt < maxRetries) {
        const delayMs = calculateRetryDelay(attempt, retryDelay, exponentialBackoff, null);

        logRetry(attempt, maxRetries, url, error instanceof Error ? error.message : 'Network error', delayMs);

        await sleep(delayMs);
        continue;
      }

      // Non-retryable error, throw immediately
      throw error;
    }
  }

  // Should not reach here, but if we do, throw the last error
  throw lastError ?? new Error('Request failed after retries');
}

// ============================================================================
// API Fetch Wrapper
// ============================================================================

/**
 * Fetch wrapper with automatic JSON parsing, error handling, and retry logic
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const response = await fetchWithRetry(
    url,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    },
    retryOptions
  );

  const data = await response.json();

  if (!response.ok) {
    const retryAfter = data.retryAfter ?? null;
    const error = new ApiError(
      data.error?.message || data.message || 'An error occurred',
      response.status,
      data.error?.code || 'API_ERROR',
      data.error?.details || null,
      retryAfter
    );

    // Show toast for rate limiting (only if we've exhausted retries)
    if (error.isRateLimited()) {
      const retrySeconds = retryAfter || 60;
      toast.error(`Rate limit exceeded. Try again in ${formatRetryTime(retrySeconds)}.`, {
        duration: 6000,
        id: 'rate-limit',
      });
    }

    throw error;
  }

  return data.data;
}

// ============================================================================
// Type Definitions for API Responses
// ============================================================================

export interface VerificationSubmission {
  npi: string;
  planId: string;
  locationId?: number;
  acceptsInsurance: boolean;
  acceptsNewPatients?: boolean;
  notes?: string;
  submittedBy?: string;
  website?: string; // honeypot field — must be empty for real users
  captchaToken?: string;
}

export interface VerificationStats {
  total: number;
  approved: number;
  pending: number;
  recentCount: number;
}

export interface LocationStats {
  state: string;
  totalLocations: number;
  totalProviders: number;
  avgProvidersPerLocation: number;
  maxProvidersAtLocation: number;
}

export interface Issuer {
  carrierId: string | null;
  carrierName: string;
}

// ============================================================================
// API Namespaces
// ============================================================================

const providers = {
  search: (
    filters: Partial<Omit<SearchFilters, 'cities'>> & {
      // Legacy params for backward compatibility
      cities?: string[] | string;
      zip?: string;
      page?: number;
      limit?: number;
    },
    page?: number,
    limit?: number
  ) => {
    // Support both old style (page/limit in filters) and new style (separate args)
    const pageNum = page ?? filters.page ?? 1;
    const limitNum = limit ?? filters.limit ?? 20;

    // Handle cities as string or array
    const citiesValue = Array.isArray(filters.cities)
      ? filters.cities.join(',')
      : filters.cities;

    const params = {
      state: filters.state,
      city: filters.city,
      cities: citiesValue,
      zip: filters.zipCode || filters.zip,
      healthSystem: filters.healthSystem,
      specialty: filters.specialty,
      name: filters.name,
      npi: filters.npi,
      entityType: filters.entityType,
      insurancePlanId: filters.insurancePlanId,
      page: pageNum,
      limit: limitNum,
    };
    return apiFetch<{
      providers: ProviderDisplay[];
      pagination: PaginationState;
    }>(`/providers/search?${buildQueryString(params)}`);
  },

  getByNpi: (npi: string) =>
    apiFetch<{
      provider: ProviderDisplay & { planAcceptances: PlanAcceptanceDisplay[] };
    }>(`/providers/${npi}`),

  getCities: (state: string) =>
    apiFetch<{ state: string; cities: string[]; count: number }>(
      `/providers/cities?state=${encodeURIComponent(state)}`
    ),

  getPlans: (
    npi: string,
    params: {
      status?: string;
      minConfidence?: number;
      page?: number;
      limit?: number;
    } = {}
  ) =>
    apiFetch<{
      npi: string;
      acceptances: PlanAcceptanceDisplay[];
      pagination: PaginationState;
    }>(`/providers/${npi}/plans?${buildQueryString(params)}`),

  getColocated: (
    npi: string,
    params: { page?: number; limit?: number } = {}
  ) =>
    apiFetch<{
      location: Location;
      providers: ProviderDisplay[];
      pagination: PaginationState;
    }>(`/providers/${npi}/colocated?${buildQueryString(params)}`),

  getMapPins: (params: {
    north: number;
    south: number;
    east: number;
    west: number;
    specialty?: string;
    specialtyCategory?: string;
    entityType?: string;
    limit?: number;
  }) => apiFetch<{
    pins: Array<{
      npi: string;
      displayName: string;
      specialty: string | null;
      entityType: string;
      latitude: number;
      longitude: number;
      addressLine1: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
      phone: string | null;
      addressHash: string | null;
      providerCount: number;
    }>;
    total: number;
    clustered: boolean;
    bounds: { north: number; south: number; east: number; west: number };
  }>(`/providers/map?${buildQueryString(params)}`),
};

const plans = {
  search: (params: {
    carrierName?: string;
    planType?: string;
    state?: string;
    planYear?: number;
    page?: number;
    limit?: number;
  }) =>
    apiFetch<{
      plans: InsurancePlanDisplay[];
      pagination: PaginationState;
    }>(`/plans/search?${buildQueryString(params)}`),

  getGrouped: (params?: { search?: string; state?: string }) => {
    const query = buildQueryString(params || {});
    return apiFetch<{ carriers: CarrierGroup[]; totalPlans: number }>(
      `/plans/grouped${query ? `?${query}` : ''}`
    );
  },

  // Legacy alias for backward compatibility
  getGroupedPlans: (params?: { search?: string; state?: string }) => {
    const query = buildQueryString(params || {});
    return apiFetch<{ carriers: CarrierGroup[]; totalPlans: number }>(
      `/plans/grouped${query ? `?${query}` : ''}`
    );
  },

  getIssuers: (state?: string) =>
    apiFetch<{ issuers: Issuer[]; count: number }>(
      `/plans/meta/issuers?${buildQueryString({ state })}`
    ),

  getPlanTypes: (params?: { state?: string; carrier?: string }) => {
    const query = buildQueryString(params || {});
    return apiFetch<{ planTypes: string[]; count: number }>(
      `/plans/meta/plan-types${query ? `?${query}` : ''}`
    );
  },

  getById: (planId: string) =>
    apiFetch<{ plan: InsurancePlanDisplay & { providerCount: number } }>(
      `/plans/${encodeURIComponent(planId)}`
    ),

  getProviders: (
    planId: string,
    params: {
      state?: string;
      city?: string;
      specialty?: string;
      page?: number;
      limit?: number;
    } = {}
  ) =>
    apiFetch<{
      plan: InsurancePlanDisplay;
      providers: ProviderDisplay[];
      pagination: PaginationState;
    }>(`/plans/${encodeURIComponent(planId)}/providers?${buildQueryString(params)}`),
};

const verify = {
  submit: (data: VerificationSubmission) =>
    apiFetch<{
      verification: Verification;
      acceptance: PlanAcceptanceDisplay;
      message: string;
    }>('/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  vote: (verificationId: string, vote: 'up' | 'down', website?: string, captchaToken?: string) =>
    apiFetch<{
      verification: {
        id: string;
        upvotes: number;
        downvotes: number;
        netVotes: number;
      };
      message: string;
    }>(`/verify/${verificationId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote, website, captchaToken }),
    }),

  getStats: () =>
    apiFetch<{ stats: VerificationStats }>('/verify/stats'),

  getRecent: (params: { limit?: number; npi?: string; planId?: string } = {}) =>
    apiFetch<{ verifications: Verification[]; count: number }>(
      `/verify/recent?${buildQueryString(params)}`
    ),

  getForPair: (npi: string, planId: string) =>
    apiFetch<{
      npi: string;
      planId: string;
      acceptance: PlanAcceptanceDisplay | null;
      verifications: Verification[];
      summary: {
        totalVerifications: number;
        totalUpvotes: number;
        totalDownvotes: number;
      };
    }>(`/verify/${npi}/${encodeURIComponent(planId)}`),
};

const locations = {
  search: (params: {
    search?: string;
    state?: string;
    city?: string;
    cities?: string[] | string;
    zipCode?: string;
    healthSystem?: string;
    minProviders?: number;
    page?: number;
    limit?: number;
  }) => {
    const citiesValue = Array.isArray(params.cities)
      ? params.cities.join(',')
      : params.cities;
    const queryParams = {
      ...params,
      cities: citiesValue,
    };
    return apiFetch<{
      locations: Location[];
      pagination: PaginationState;
    }>(`/locations/search?${buildQueryString(queryParams)}`);
  },

  getHealthSystems: (
    stateOrParams: string | { state?: string; cities?: string },
    cities?: string[]
  ) => {
    // Support both old style (object param) and new style (separate args)
    let queryState: string | undefined;
    let queryCities: string | undefined;

    if (typeof stateOrParams === 'object') {
      queryState = stateOrParams.state;
      queryCities = stateOrParams.cities;
    } else {
      queryState = stateOrParams;
      queryCities = cities?.join(',');
    }

    return apiFetch<{ healthSystems: string[]; count: number }>(
      `/locations/health-systems?${buildQueryString({
        state: queryState,
        cities: queryCities,
      })}`
    );
  },

  getById: (locationId: number) =>
    apiFetch<{ location: Location }>(`/locations/${locationId}`),

  getProviders: (
    locationId: number,
    params: { page?: number; limit?: number } = {}
  ) =>
    apiFetch<{
      location: Location;
      providers: ProviderDisplay[];
      pagination: PaginationState;
    }>(`/locations/${locationId}/providers?${buildQueryString(params)}`),

  getStats: (state: string) =>
    apiFetch<LocationStats>(`/locations/stats/${encodeURIComponent(state)}`),
};

// ============================================================================
// Unified API Object
// ============================================================================

const api = {
  providers,
  plans,
  verify,
  locations,
} as const;

export default api;

// ============================================================================
// Legacy exports for backward compatibility
// ============================================================================

export const providerApi = providers;
// planApi removed - unused
export const verificationApi = verify;
export const locationApi = locations;
