import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import type { HealthSystem } from '../types';

// ============================================================================
// Cache Configuration
// ============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  healthSystems: HealthSystem[];
  timestamp: number;
}

// Module-level cache and pending requests tracker
const healthSystemsCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<HealthSystem[]>>();

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Generate cache key from state and cities
 */
function getCacheKey(state?: string, cities?: string[]): string {
  const stateKey = state?.toUpperCase() || '';
  const citiesKey = cities?.slice().sort().join(',') || '';
  return `${stateKey}:${citiesKey}`;
}

/**
 * Clear all cached health systems data
 */
export function clearHealthSystemsCache(): void {
  healthSystemsCache.clear();
}

/**
 * Prefetch health systems for a state and cities
 */
export async function prefetchHealthSystems(
  state: string,
  cities?: string[]
): Promise<HealthSystem[]> {
  if (!state) return [];

  const cacheKey = getCacheKey(state, cities);

  // Check cache first
  const cached = healthSystemsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.healthSystems;
  }

  // Check if request is already in flight
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Make the request
  const requestPromise = (async () => {
    try {
      const response = await api.locations.getHealthSystems(state, cities);
      const healthSystems: HealthSystem[] = response.healthSystems.map((name) => ({
        name,
        state,
      }));

      // Cache the result
      healthSystemsCache.set(cacheKey, {
        healthSystems,
        timestamp: Date.now(),
      });

      return healthSystems;
    } finally {
      // Clean up pending request
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
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

  const [healthSystems, setHealthSystems] = useState<HealthSystem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track current params to handle race conditions
  const currentParamsRef = useRef<UseHealthSystemsParams>(params);
  currentParamsRef.current = params;

  // Stable cache key for dependency tracking
  const cacheKey = getCacheKey(state, cities);

  const fetchHealthSystems = useCallback(async (forceRefresh = false) => {
    const currentState = currentParamsRef.current.state;
    const currentCities = currentParamsRef.current.cities;

    if (!currentState) {
      setHealthSystems([]);
      setError(null);
      return;
    }

    const key = getCacheKey(currentState, currentCities);

    // Check cache unless forcing refresh
    if (!forceRefresh) {
      const cached = healthSystemsCache.get(key);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setHealthSystems(cached.healthSystems);
        setError(null);
        return;
      }
    }

    // Check if request is already in flight
    const pending = pendingRequests.get(key);
    if (pending) {
      setIsLoading(true);
      try {
        const result = await pending;
        // Only update if params haven't changed
        if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.cities) === key) {
          setHealthSystems(result);
          setError(null);
        }
      } catch (err) {
        if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.cities) === key) {
          setError(err instanceof Error ? err : new Error('Failed to fetch health systems'));
        }
      } finally {
        if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.cities) === key) {
          setIsLoading(false);
        }
      }
      return;
    }

    // Make new request
    setIsLoading(true);
    setError(null);

    const requestPromise = (async () => {
      const response = await api.locations.getHealthSystems(currentState, currentCities);
      const systems: HealthSystem[] = response.healthSystems.map((name) => ({
        name,
        state: currentState,
      }));

      // Cache the result
      healthSystemsCache.set(key, {
        healthSystems: systems,
        timestamp: Date.now(),
      });

      return systems;
    })();

    pendingRequests.set(key, requestPromise);

    try {
      const result = await requestPromise;
      // Only update if params haven't changed during request
      if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.cities) === key) {
        setHealthSystems(result);
        setError(null);
      }
    } catch (err) {
      if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.cities) === key) {
        setError(err instanceof Error ? err : new Error('Failed to fetch health systems'));
        setHealthSystems([]);
      }
    } finally {
      pendingRequests.delete(key);
      if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.cities) === key) {
        setIsLoading(false);
      }
    }
  }, []);

  // Fetch when params change
  useEffect(() => {
    fetchHealthSystems();
  }, [cacheKey, fetchHealthSystems]);

  const refetch = useCallback(async () => {
    await fetchHealthSystems(true);
  }, [fetchHealthSystems]);

  return {
    healthSystems,
    isLoading,
    error,
    refetch,
  };
}

export default useHealthSystems;
