import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryClient } from '../lib/queryClient';
import type { HealthSystem } from '../types';

// ============================================================================
// Query Key Factory
// ============================================================================

export const healthSystemKeys = {
  all: ['healthSystems'] as const,
  list: (state?: string, cities?: string[]) =>
    [...healthSystemKeys.all, state?.toUpperCase() || '', cities?.slice().sort().join(',') || ''] as const,
};

// ============================================================================
// Query Function
// ============================================================================

async function fetchHealthSystems(state: string, cities?: string[]): Promise<HealthSystem[]> {
  const response = await api.locations.getHealthSystems(state, cities);
  return response.healthSystems.map((name) => ({
    name,
    state,
  }));
}

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Clear all cached health systems data
 */
export function clearHealthSystemsCache(): void {
  queryClient.invalidateQueries({ queryKey: healthSystemKeys.all });
}

/**
 * Prefetch health systems for a state and cities
 */
export async function prefetchHealthSystems(
  state: string,
  cities?: string[]
): Promise<HealthSystem[]> {
  if (!state) return [];
  return queryClient.fetchQuery({
    queryKey: healthSystemKeys.list(state, cities),
    queryFn: () => fetchHealthSystems(state, cities),
  });
}

// ============================================================================
// Hook
// ============================================================================

interface UseHealthSystemsParams {
  state?: string;
  cities?: string[];
}

interface UseHealthSystemsResult {
  healthSystems: HealthSystem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useHealthSystems(
  params: UseHealthSystemsParams
): UseHealthSystemsResult {
  const { state, cities } = params;
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<HealthSystem[], Error>({
    queryKey: healthSystemKeys.list(state, cities),
    queryFn: () => fetchHealthSystems(state!, cities),
    enabled: !!state,
  });

  return {
    healthSystems: data ?? [],
    isLoading,
    error: error ?? null,
    refetch: async () => {
      await queryClient.invalidateQueries({ queryKey: healthSystemKeys.list(state, cities) });
    },
  };
}

export default useHealthSystems;
