import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

/**
 * Format seconds into human-readable time
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
 * Build URLSearchParams from object, filtering out undefined/empty values
 */
function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  return searchParams.toString();
}

// Types
export interface Provider {
  id: string;
  npi: string;
  entityType: 'INDIVIDUAL' | 'ORGANIZATION';
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  credential: string | null;
  organizationName: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  taxonomyCode: string | null;
  taxonomyDescription: string | null;
  specialtyCategory: string | null;
  npiStatus: string;
  displayName?: string;
}

export interface InsurancePlan {
  planId: string;
  planName: string | null;
  issuerName: string | null;
  planType: string | null;
  state: string | null;
  carrier: string | null;
  planVariant: string | null;
  rawName: string | null;
  sourceHealthSystem: string | null;
  providerCount: number;
}

export interface PlanAcceptance {
  id: string;
  providerId: string;
  planId: string;
  acceptanceStatus: 'ACCEPTED' | 'NOT_ACCEPTED' | 'PENDING' | 'UNKNOWN';
  acceptsNewPatients: boolean | null;
  confidenceScore: number;
  confidenceLevel: string;
  confidenceDescription: string;
  lastVerifiedAt: string | null;
  verificationCount: number;
  plan?: InsurancePlan;
}

export interface Verification {
  id: string;
  providerId: string | null;
  planId: string | null;
  verificationType: string;
  verificationSource: string;
  upvotes: number;
  downvotes: number;
  isApproved: boolean | null;
  notes: string | null;
  createdAt: string;
  provider?: {
    npi: string;
    firstName: string | null;
    lastName: string | null;
    organizationName: string | null;
    entityType: string;
  };
  plan?: {
    planId: string;
    planName: string;
    carrier: string | null;
    issuerName: string | null;
  };
}

export interface Location {
  id: number;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  name: string | null;
  healthSystem: string | null;
  facilityType: string | null;
  providerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    code: string;
    statusCode: number;
  };
}

// API Error class
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Fetch wrapper with error handling
async function fetchApi<T>(
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
    // Handle rate limiting with toast notification
    if (response.status === 429) {
      const retryAfter = data.retryAfter || 60;
      toast.error(`Rate limit exceeded. Try again in ${formatRetryTime(retryAfter)}.`, {
        duration: 6000,
        id: 'rate-limit', // Prevent duplicate toasts
      });
    }

    throw new ApiError(
      data.error?.message || data.message || 'An error occurred',
      response.status,
      data.error?.code
    );
  }

  return data.data;
}

// Provider API
export const providerApi = {
  search: (params: {
    state?: string;
    city?: string;
    cities?: string;
    zip?: string;
    healthSystem?: string;
    specialty?: string;
    name?: string;
    page?: number;
    limit?: number;
  }) => fetchApi<{
    providers: (Provider & { displayName: string })[];
    pagination: Pagination;
  }>(`/providers/search?${buildQueryString(params)}`),

  getByNpi: (npi: string) => fetchApi<{
    provider: Provider & { displayName: string; planAcceptances: PlanAcceptance[] };
  }>(`/providers/${npi}`),

  getPlans: (npi: string, params: { status?: string; minConfidence?: number; page?: number; limit?: number } = {}) =>
    fetchApi<{ npi: string; acceptances: PlanAcceptance[]; pagination: Pagination }>(
      `/providers/${npi}/plans?${buildQueryString(params)}`
    ),

  getCities: (state: string) => fetchApi<{ state: string; cities: string[]; count: number }>(
    `/providers/cities?state=${encodeURIComponent(state)}`
  ),

  getColocated: (npi: string, params: { page?: number; limit?: number } = {}) =>
    fetchApi<{ location: Location; providers: (Provider & { displayName: string })[]; pagination: Pagination }>(
      `/providers/${npi}/colocated?${buildQueryString(params)}`
    ),
};

// Location API
export const locationApi = {
  search: (params: {
    search?: string;
    state?: string;
    city?: string;
    cities?: string;
    zipCode?: string;
    healthSystem?: string;
    minProviders?: number;
    page?: number;
    limit?: number;
  }) => fetchApi<{ locations: Location[]; pagination: Pagination }>(
    `/locations/search?${buildQueryString(params)}`
  ),

  getById: (locationId: number, params: { page?: number; limit?: number } = {}) =>
    fetchApi<{ location: Location; providers: (Provider & { displayName: string })[]; pagination: Pagination }>(
      `/locations/${locationId}/providers?${buildQueryString(params)}`
    ),

  getStats: (state: string) => fetchApi<{
    state: string;
    totalLocations: number;
    totalProviders: number;
    avgProvidersPerLocation: number;
    maxProvidersAtLocation: number;
  }>(`/locations/stats/${encodeURIComponent(state)}`),

  getHealthSystems: (params?: { state?: string; cities?: string }) => {
    const query = buildQueryString(params || {});
    return fetchApi<{ healthSystems: string[]; count: number }>(
      `/locations/health-systems${query ? `?${query}` : ''}`
    );
  },
};

// Plan API
export const planApi = {
  search: (params: {
    carrierName?: string;
    planType?: string;
    state?: string;
    planYear?: number;
    page?: number;
    limit?: number;
  }) => fetchApi<{ plans: InsurancePlan[]; pagination: Pagination }>(
    `/plans/search?${buildQueryString(params)}`
  ),

  getByPlanId: (planId: string) => fetchApi<{ plan: InsurancePlan & { providerCount: number } }>(
    `/plans/${encodeURIComponent(planId)}`
  ),

  getIssuers: (params: { state?: string; planYear?: number } = {}) =>
    fetchApi<{ issuers: { carrierId: string | null; carrierName: string }[]; count: number }>(
      `/plans/meta/issuers?${buildQueryString(params)}`
    ),
};

// Verification API
export const verificationApi = {
  submit: (data: {
    npi: string;
    planId: string;
    acceptsInsurance: boolean;
    acceptsNewPatients?: boolean;
    notes?: string;
    submittedBy?: string;
  }) => fetchApi<{ verification: Verification; acceptance: PlanAcceptance; message: string }>('/verify', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  vote: (verificationId: string, vote: 'up' | 'down') =>
    fetchApi<{ verification: { id: string; upvotes: number; downvotes: number; netVotes: number }; message: string }>(
      `/verify/${verificationId}/vote`,
      { method: 'POST', body: JSON.stringify({ vote }) }
    ),

  getStats: () => fetchApi<{ stats: { total: number; approved: number; pending: number; recentCount: number } }>(
    '/verify/stats'
  ),

  getRecent: (params: { limit?: number; npi?: string; planId?: string } = {}) =>
    fetchApi<{ verifications: Verification[]; count: number }>(`/verify/recent?${buildQueryString(params)}`),

  getForPair: (npi: string, planId: string) => fetchApi<{
    npi: string;
    planId: string;
    acceptance: PlanAcceptance | null;
    verifications: Verification[];
    summary: { totalVerifications: number; totalUpvotes: number; totalDownvotes: number };
  }>(`/verify/${npi}/${encodeURIComponent(planId)}`),
};
