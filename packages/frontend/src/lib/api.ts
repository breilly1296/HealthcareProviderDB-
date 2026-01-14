const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

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
  id: string;
  planId: string;
  planName: string;
  carrierId: string | null;
  carrierName: string;
  planType: string;
  metalLevel: string | null;
  marketType: string;
  statesCovered: string[];
  planYear: number;
  isActive: boolean;
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
    carrierName: string;
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
    throw new ApiError(
      data.error?.message || 'An error occurred',
      response.status,
      data.error?.code
    );
  }

  return data.data;
}

// Provider API
export const providerApi = {
  search: async (params: {
    state?: string;
    city?: string;
    cities?: string;
    zip?: string;
    healthSystem?: string;
    specialty?: string;
    name?: string;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value));
      }
    });

    return fetchApi<{
      providers: (Provider & { displayName: string })[];
      pagination: Pagination;
    }>(`/providers/search?${searchParams.toString()}`);
  },

  getByNpi: async (npi: string) => {
    return fetchApi<{
      provider: Provider & {
        displayName: string;
        planAcceptances: PlanAcceptance[];
      };
    }>(`/providers/${npi}`);
  },

  getPlans: async (
    npi: string,
    params: {
      status?: string;
      minConfidence?: number;
      page?: number;
      limit?: number;
    } = {}
  ) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return fetchApi<{
      npi: string;
      acceptances: PlanAcceptance[];
      pagination: Pagination;
    }>(`/providers/${npi}/plans?${searchParams.toString()}`);
  },

  getCities: async (state: string) => {
    return fetchApi<{
      state: string;
      cities: string[];
      count: number;
    }>(`/providers/cities?state=${encodeURIComponent(state)}`);
  },

  getColocated: async (
    npi: string,
    params: {
      page?: number;
      limit?: number;
    } = {}
  ) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return fetchApi<{
      location: Location;
      providers: (Provider & { displayName: string })[];
      pagination: Pagination;
    }>(`/providers/${npi}/colocated?${searchParams.toString()}`);
  },
};

// Location API
export const locationApi = {
  search: async (params: {
    search?: string;
    state?: string;
    city?: string;
    cities?: string;
    zipCode?: string;
    healthSystem?: string;
    minProviders?: number;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value));
      }
    });

    return fetchApi<{
      locations: Location[];
      pagination: Pagination;
    }>(`/locations/search?${searchParams.toString()}`);
  },

  getById: async (locationId: number, params: { page?: number; limit?: number } = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return fetchApi<{
      location: Location;
      providers: (Provider & { displayName: string })[];
      pagination: Pagination;
    }>(`/locations/${locationId}/providers?${searchParams.toString()}`);
  },

  getStats: async (state: string) => {
    return fetchApi<{
      state: string;
      totalLocations: number;
      totalProviders: number;
      avgProvidersPerLocation: number;
      maxProvidersAtLocation: number;
    }>(`/locations/stats/${encodeURIComponent(state)}`);
  },

  getHealthSystems: async () => {
    return fetchApi<{
      healthSystems: string[];
      count: number;
    }>('/locations/health-systems');
  },
};

// Plan API
export const planApi = {
  search: async (params: {
    carrierName?: string;
    planType?: string;
    state?: string;
    planYear?: number;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value));
      }
    });

    return fetchApi<{
      plans: InsurancePlan[];
      pagination: Pagination;
    }>(`/plans/search?${searchParams.toString()}`);
  },

  getByPlanId: async (planId: string) => {
    return fetchApi<{
      plan: InsurancePlan & { providerCount: number };
    }>(`/plans/${encodeURIComponent(planId)}`);
  },

  getIssuers: async (params: { state?: string; planYear?: number } = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return fetchApi<{
      issuers: { carrierId: string | null; carrierName: string }[];
      count: number;
    }>(`/plans/meta/issuers?${searchParams.toString()}`);
  },
};

// Verification API
export const verificationApi = {
  submit: async (data: {
    npi: string;
    planId: string;
    acceptsInsurance: boolean;
    acceptsNewPatients?: boolean;
    notes?: string;
    submittedBy?: string;
  }) => {
    return fetchApi<{
      verification: Verification;
      acceptance: PlanAcceptance;
      message: string;
    }>('/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  vote: async (verificationId: string, vote: 'up' | 'down') => {
    return fetchApi<{
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
    });
  },

  getStats: async () => {
    return fetchApi<{
      stats: {
        total: number;
        approved: number;
        pending: number;
        recentCount: number;
      };
    }>('/verify/stats');
  },

  getRecent: async (params: { limit?: number; npi?: string; planId?: string } = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return fetchApi<{
      verifications: Verification[];
      count: number;
    }>(`/verify/recent?${searchParams.toString()}`);
  },

  getForPair: async (npi: string, planId: string) => {
    return fetchApi<{
      npi: string;
      planId: string;
      acceptance: PlanAcceptance | null;
      verifications: Verification[];
      summary: {
        totalVerifications: number;
        totalUpvotes: number;
        totalDownvotes: number;
      };
    }>(`/verify/${npi}/${encodeURIComponent(planId)}`);
  },
};
