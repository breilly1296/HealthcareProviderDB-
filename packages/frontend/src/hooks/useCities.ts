import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import type { CityData } from '../types';

// ============================================================================
// Cache Configuration
// ============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  cities: CityData[];
  timestamp: number;
}

// Module-level cache and pending requests tracker
const citiesCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<CityData[]>>();

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Clear all cached cities data
 */
export function clearCitiesCache(): void {
  citiesCache.clear();
}

/**
 * Prefetch cities for a state (useful for preloading on hover)
 */
export async function prefetchCities(state: string): Promise<CityData[]> {
  if (!state) return [];

  const cacheKey = state.toUpperCase();

  // Check cache first
  const cached = citiesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.cities;
  }

  // Check if request is already in flight
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Make the request
  const requestPromise = (async () => {
    try {
      const response = await api.providers.getCities(state);
      const cities: CityData[] = response.cities.map((city) => ({
        city,
        state,
      }));

      // Cache the result
      citiesCache.set(cacheKey, {
        cities,
        timestamp: Date.now(),
      });

      return cities;
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

interface UseCitiesResult {
  cities: CityData[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useCities(state: string | undefined): UseCitiesResult {
  const [cities, setCities] = useState<CityData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track the current state to handle race conditions
  const currentStateRef = useRef<string | undefined>(state);
  currentStateRef.current = state;

  const fetchCities = useCallback(async (forceRefresh = false) => {
    const stateToFetch = currentStateRef.current;

    if (!stateToFetch) {
      setCities([]);
      setError(null);
      return;
    }

    const cacheKey = stateToFetch.toUpperCase();

    // Check cache unless forcing refresh
    if (!forceRefresh) {
      const cached = citiesCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setCities(cached.cities);
        setError(null);
        return;
      }
    }

    // Check if request is already in flight
    const pending = pendingRequests.get(cacheKey);
    if (pending) {
      setIsLoading(true);
      try {
        const result = await pending;
        // Only update if state hasn't changed
        if (currentStateRef.current === stateToFetch) {
          setCities(result);
          setError(null);
        }
      } catch (err) {
        if (currentStateRef.current === stateToFetch) {
          setError(err instanceof Error ? err : new Error('Failed to fetch cities'));
        }
      } finally {
        if (currentStateRef.current === stateToFetch) {
          setIsLoading(false);
        }
      }
      return;
    }

    // Make new request
    setIsLoading(true);
    setError(null);

    const requestPromise = (async () => {
      const response = await api.providers.getCities(stateToFetch);
      const cityData: CityData[] = response.cities.map((city) => ({
        city,
        state: stateToFetch,
      }));

      // Cache the result
      citiesCache.set(cacheKey, {
        cities: cityData,
        timestamp: Date.now(),
      });

      return cityData;
    })();

    pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      // Only update if state hasn't changed during request
      if (currentStateRef.current === stateToFetch) {
        setCities(result);
        setError(null);
      }
    } catch (err) {
      if (currentStateRef.current === stateToFetch) {
        setError(err instanceof Error ? err : new Error('Failed to fetch cities'));
        setCities([]);
      }
    } finally {
      pendingRequests.delete(cacheKey);
      if (currentStateRef.current === stateToFetch) {
        setIsLoading(false);
      }
    }
  }, []);

  // Fetch when state changes
  useEffect(() => {
    fetchCities();
  }, [state, fetchCities]);

  const refetch = useCallback(async () => {
    await fetchCities(true);
  }, [fetchCities]);

  return {
    cities,
    isLoading,
    error,
    refetch,
  };
}

export default useCities;
