'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { SearchFilters, ProviderDisplay, PaginationState } from '@/types';

// Query key factory for provider searches
export const providerKeys = {
  all: ['providers'] as const,
  searches: () => [...providerKeys.all, 'search'] as const,
  search: (filters: Partial<SearchFilters>, page: number, limit: number) =>
    [...providerKeys.searches(), { filters, page, limit }] as const,
  detail: (npi: string) => [...providerKeys.all, 'detail', npi] as const,
  plans: (npi: string, params?: Record<string, unknown>) =>
    [...providerKeys.all, 'plans', npi, params] as const,
  colocated: (npi: string, params?: Record<string, unknown>) =>
    [...providerKeys.all, 'colocated', npi, params] as const,
};

interface UseProviderSearchOptions {
  filters: Partial<SearchFilters>;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

interface ProviderSearchResult {
  providers: ProviderDisplay[];
  pagination: PaginationState;
}

/**
 * Hook for searching providers with React Query caching
 *
 * @example
 * const { data, isLoading, error } = useProviderSearch({
 *   filters: { state: 'NY', specialty: 'CARDIOLOGY' },
 *   page: 1,
 *   limit: 20,
 *   enabled: true,
 * });
 */
export function useProviderSearch({
  filters,
  page = 1,
  limit = 20,
  enabled = true,
}: UseProviderSearchOptions) {
  // Only enable query if we have at least a state filter
  const hasRequiredFilters = Boolean(filters.state);

  return useQuery<ProviderSearchResult, Error>({
    queryKey: providerKeys.search(filters, page, limit),
    queryFn: async () => {
      const response = await api.providers.search(filters, page, limit);
      return response;
    },
    enabled: enabled && hasRequiredFilters,
    // Override defaults for search queries - slightly shorter stale time
    staleTime: 2 * 60 * 1000, // 2 minutes for search results
  });
}

/**
 * Hook for fetching a single provider by NPI
 *
 * @example
 * const { data, isLoading, error } = useProvider('1234567890');
 */
export function useProvider(npi: string, enabled = true) {
  return useQuery({
    queryKey: providerKeys.detail(npi),
    queryFn: async () => {
      const response = await api.providers.getByNpi(npi);
      return response.provider;
    },
    enabled: enabled && Boolean(npi),
    // Provider details can be cached longer
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook for fetching provider's insurance plans
 *
 * @example
 * const { data, isLoading } = useProviderPlans('1234567890', { status: 'ACCEPTED' });
 */
export function useProviderPlans(
  npi: string,
  params: {
    status?: string;
    minConfidence?: number;
    page?: number;
    limit?: number;
  } = {},
  enabled = true
) {
  return useQuery({
    queryKey: providerKeys.plans(npi, params),
    queryFn: async () => {
      const response = await api.providers.getPlans(npi, params);
      return response;
    },
    enabled: enabled && Boolean(npi),
  });
}

/**
 * Hook for fetching colocated providers
 *
 * @example
 * const { data, isLoading } = useColocatedProviders('1234567890');
 */
export function useColocatedProviders(
  npi: string,
  params: { page?: number; limit?: number } = {},
  enabled = true
) {
  return useQuery({
    queryKey: providerKeys.colocated(npi, params),
    queryFn: async () => {
      const response = await api.providers.getColocated(npi, params);
      return response;
    },
    enabled: enabled && Boolean(npi),
  });
}

export default useProviderSearch;
