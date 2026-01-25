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

  constructor(
    message: string,
    statusCode: number,
    code: string = 'UNKNOWN_ERROR',
    details: ApiErrorDetails | null = null
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
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
}

// ============================================================================
// Helper Functions
// ============================================================================

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
// API Fetch Wrapper
// ============================================================================

/**
 * Fetch wrapper with automatic JSON parsing and error handling
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new ApiError(
      data.error?.message || data.message || 'An error occurred',
      response.status,
      data.error?.code || 'API_ERROR',
      data.error?.details || null
    );

    // Show toast for rate limiting
    if (error.isRateLimited()) {
      const retryAfter = data.retryAfter || 60;
      toast.error(`Rate limit exceeded. Try again in ${formatRetryTime(retryAfter)}.`, {
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
  acceptsInsurance: boolean;
  acceptsNewPatients?: boolean;
  notes?: string;
  submittedBy?: string;
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

  vote: (verificationId: string, vote: 'up' | 'down') =>
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
      body: JSON.stringify({ vote }),
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
export const planApi = plans;
export const verificationApi = verify;
export const locationApi = locations;
