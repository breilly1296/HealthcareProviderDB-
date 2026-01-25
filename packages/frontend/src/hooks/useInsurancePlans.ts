import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../lib/api';
import type {
  CarrierGroup,
  InsurancePlanDisplay,
  GroupedSelectOptions,
  SelectOption,
} from '../types';

// ============================================================================
// Cache Configuration
// ============================================================================

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes (plans change less frequently)

interface CacheEntry {
  carriers: CarrierGroup[];
  timestamp: number;
}

// Module-level cache and pending requests tracker
const plansCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<CarrierGroup[]>>();

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Generate cache key from params
 */
function getCacheKey(state?: string, search?: string): string {
  return `${state || ''}:${search || ''}`;
}

/**
 * Clear all cached insurance plans data
 */
export function clearInsurancePlansCache(): void {
  plansCache.clear();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Flatten carrier groups into a flat array of plans
 */
function flattenPlans(carriers: CarrierGroup[]): InsurancePlanDisplay[] {
  const plans: InsurancePlanDisplay[] = [];

  for (const carrier of carriers) {
    for (const plan of carrier.plans) {
      plans.push({
        planId: plan.planId,
        planName: plan.planName,
        planType: plan.planType,
        carrier: carrier.carrier,
        issuerName: carrier.carrier,
        state: null,
        planVariant: null,
        rawName: null,
        sourceHealthSystem: null,
        providerCount: 0,
      });
    }
  }

  return plans;
}

/**
 * Convert carrier groups to select options format
 */
function toSelectOptions(carriers: CarrierGroup[]): GroupedSelectOptions[] {
  return carriers.map((carrier) => ({
    label: carrier.carrier,
    options: carrier.plans.map((plan): SelectOption => ({
      value: plan.planId,
      label: plan.planName || plan.planId,
    })),
  }));
}

// ============================================================================
// Hook
// ============================================================================

interface UseInsurancePlansParams {
  state?: string;
  search?: string;
}

interface UseInsurancePlansResult {
  groupedPlans: CarrierGroup[];
  allPlans: InsurancePlanDisplay[];
  selectOptions: GroupedSelectOptions[];
  isLoading: boolean;
  error: Error | null;
  findPlan: (planId: string) => InsurancePlanDisplay | undefined;
  refetch: () => Promise<void>;
}

export function useInsurancePlans(
  params: UseInsurancePlansParams = {}
): UseInsurancePlansResult {
  const { state, search } = params;

  const [carriers, setCarriers] = useState<CarrierGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track current params to handle race conditions
  const currentParamsRef = useRef<UseInsurancePlansParams>(params);
  currentParamsRef.current = params;

  // Stable cache key for dependency tracking
  const cacheKey = getCacheKey(state, search);

  const fetchPlans = useCallback(async (forceRefresh = false) => {
    const currentState = currentParamsRef.current.state;
    const currentSearch = currentParamsRef.current.search;
    const key = getCacheKey(currentState, currentSearch);

    // Check cache unless forcing refresh
    if (!forceRefresh) {
      const cached = plansCache.get(key);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setCarriers(cached.carriers);
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
        if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.search) === key) {
          setCarriers(result);
          setError(null);
        }
      } catch (err) {
        if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.search) === key) {
          setError(err instanceof Error ? err : new Error('Failed to fetch insurance plans'));
        }
      } finally {
        if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.search) === key) {
          setIsLoading(false);
        }
      }
      return;
    }

    // Make new request
    setIsLoading(true);
    setError(null);

    const requestPromise = (async () => {
      const response = await api.plans.getGrouped({
        state: currentState,
        search: currentSearch,
      });

      // Cache the result
      plansCache.set(key, {
        carriers: response.carriers,
        timestamp: Date.now(),
      });

      return response.carriers;
    })();

    pendingRequests.set(key, requestPromise);

    try {
      const result = await requestPromise;
      // Only update if params haven't changed during request
      if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.search) === key) {
        setCarriers(result);
        setError(null);
      }
    } catch (err) {
      if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.search) === key) {
        setError(err instanceof Error ? err : new Error('Failed to fetch insurance plans'));
        setCarriers([]);
      }
    } finally {
      pendingRequests.delete(key);
      if (getCacheKey(currentParamsRef.current.state, currentParamsRef.current.search) === key) {
        setIsLoading(false);
      }
    }
  }, []);

  // Fetch when params change
  useEffect(() => {
    fetchPlans();
  }, [cacheKey, fetchPlans]);

  // Memoized derived data
  const allPlans = useMemo(() => flattenPlans(carriers), [carriers]);
  const selectOptions = useMemo(() => toSelectOptions(carriers), [carriers]);

  // Plan lookup function
  const findPlan = useCallback(
    (planId: string): InsurancePlanDisplay | undefined => {
      return allPlans.find((plan) => plan.planId === planId);
    },
    [allPlans]
  );

  const refetch = useCallback(async () => {
    await fetchPlans(true);
  }, [fetchPlans]);

  return {
    groupedPlans: carriers,
    allPlans,
    selectOptions,
    isLoading,
    error,
    findPlan,
    refetch,
  };
}

export default useInsurancePlans;
