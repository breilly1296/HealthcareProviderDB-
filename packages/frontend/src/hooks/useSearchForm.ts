'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import api from '../lib/api';
import { DEFAULT_PAGE_SIZE } from '../lib/constants';
import { NYC_ALL_BOROUGHS_VALUE, NYC_BOROUGHS } from './useCities';
import type {
  SearchFilters,
  PaginationState,
  ProviderDisplay,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseSearchFormOptions {
  /** Default filter values */
  defaultFilters?: Partial<SearchFilters>;
  /** Number of results per page */
  pageSize?: number;
  /** Sync filters with URL query params */
  syncWithUrl?: boolean;
  /** Automatically search when filters change */
  autoSearch?: boolean;
  /** Debounce delay for auto-search in milliseconds */
  autoSearchDebounce?: number;
}

export interface UseSearchFormResult {
  // Filter state
  filters: SearchFilters;
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  setFilters: (partial: Partial<SearchFilters>) => void;
  clearFilters: () => void;
  clearFilter: (key: keyof SearchFilters) => void;

  // Results
  results: ProviderDisplay[];
  pagination: PaginationState | null;

  // Status
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;

  // Actions
  search: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;

  // Computed
  hasActiveFilters: boolean;
  activeFilterCount: number;
  canSearch: boolean;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_FILTERS: SearchFilters = {
  state: '',
  city: '',
  cities: [],
  specialty: '',
  name: '',
  npi: '',
  entityType: '',
  insurancePlanId: '',
  healthSystem: '',
  zipCode: '',
};

const DEFAULT_OPTIONS: Required<UseSearchFormOptions> = {
  defaultFilters: {},
  pageSize: DEFAULT_PAGE_SIZE,
  syncWithUrl: true,
  autoSearch: false,
  autoSearchDebounce: 500,
};

// ============================================================================
// URL Parsing Utilities
// ============================================================================

/**
 * Parse URL search params into SearchFilters
 */
function parseUrlToFilters(searchParams: URLSearchParams): Partial<SearchFilters> {
  const filters: Partial<SearchFilters> = {};

  const state = searchParams.get('state');
  if (state) filters.state = state;

  const city = searchParams.get('city');
  if (city) filters.city = city;

  const cities = searchParams.get('cities');
  if (cities) filters.cities = cities.split(',').filter(Boolean);

  const specialty = searchParams.get('specialty');
  if (specialty) filters.specialty = specialty;

  const name = searchParams.get('name');
  if (name) filters.name = name;

  const npi = searchParams.get('npi');
  if (npi) filters.npi = npi;

  const entityType = searchParams.get('entityType');
  if (entityType) filters.entityType = entityType;

  const insurancePlanId = searchParams.get('insurancePlanId');
  if (insurancePlanId) filters.insurancePlanId = insurancePlanId;

  const healthSystem = searchParams.get('healthSystem');
  if (healthSystem) filters.healthSystem = healthSystem;

  const zipCode = searchParams.get('zipCode');
  if (zipCode) filters.zipCode = zipCode;

  return filters;
}

/**
 * Convert SearchFilters to URLSearchParams
 */
function filtersToSearchParams(
  filters: SearchFilters,
  defaultFilters: SearchFilters
): URLSearchParams {
  const params = new URLSearchParams();

  // Only include non-default values
  if (filters.state && filters.state !== defaultFilters.state) {
    params.set('state', filters.state);
  }
  if (filters.city && filters.city !== defaultFilters.city) {
    params.set('city', filters.city);
  }
  if (filters.cities.length > 0) {
    params.set('cities', filters.cities.join(','));
  }
  if (filters.specialty && filters.specialty !== defaultFilters.specialty) {
    params.set('specialty', filters.specialty);
  }
  if (filters.name && filters.name !== defaultFilters.name) {
    params.set('name', filters.name);
  }
  if (filters.npi && filters.npi !== defaultFilters.npi) {
    params.set('npi', filters.npi);
  }
  if (filters.entityType && filters.entityType !== defaultFilters.entityType) {
    params.set('entityType', filters.entityType);
  }
  if (filters.insurancePlanId && filters.insurancePlanId !== defaultFilters.insurancePlanId) {
    params.set('insurancePlanId', filters.insurancePlanId);
  }
  if (filters.healthSystem && filters.healthSystem !== defaultFilters.healthSystem) {
    params.set('healthSystem', filters.healthSystem);
  }
  if (filters.zipCode && filters.zipCode !== defaultFilters.zipCode) {
    params.set('zipCode', filters.zipCode);
  }

  return params;
}

/**
 * Check if a filter value is "active" (non-empty/non-default)
 */
function isFilterActive(value: string | string[]): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== '';
}

// ============================================================================
// Hook
// ============================================================================

export function useSearchForm(options: UseSearchFormOptions = {}): UseSearchFormResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const mergedDefaultFilters: SearchFilters = { ...DEFAULT_FILTERS, ...opts.defaultFilters };

  // Next.js navigation hooks
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // State
  const [filters, setFiltersState] = useState<SearchFilters>(() => {
    if (opts.syncWithUrl) {
      const urlFilters = parseUrlToFilters(searchParams);
      return { ...mergedDefaultFilters, ...urlFilters };
    }
    return mergedDefaultFilters;
  });

  const [results, setResults] = useState<ProviderDisplay[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentPageRef = useRef(1);

  // ============================================================================
  // URL Synchronization
  // ============================================================================

  const updateUrl = useCallback(
    (newFilters: SearchFilters) => {
      if (!opts.syncWithUrl) return;

      const params = filtersToSearchParams(newFilters, mergedDefaultFilters);
      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      // Use replace to avoid adding to history on every filter change
      router.replace(newUrl, { scroll: false });
    },
    [opts.syncWithUrl, pathname, router, mergedDefaultFilters]
  );

  // ============================================================================
  // Search Function
  // ============================================================================

  const performSearch = useCallback(
    async (page: number = 1) => {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();
      currentPageRef.current = page;

      setIsLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        // Expand NYC_ALL_BOROUGHS to actual borough names before API call
        const expandedCities = filters.cities.flatMap(city =>
          city === NYC_ALL_BOROUGHS_VALUE ? NYC_BOROUGHS : [city]
        );
        const searchFilters = {
          ...filters,
          cities: expandedCities,
        };

        const response = await api.providers.search(searchFilters, page, opts.pageSize);

        // Check if this request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        setResults(response.providers);
        setPagination(response.pagination);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        const errorMessage = err instanceof Error ? err.message : 'Search failed';
        setError(errorMessage);
        setResults([]);
        setPagination(null);
      } finally {
        setIsLoading(false);
      }
    },
    [filters, opts.pageSize]
  );

  const search = useCallback(async () => {
    await performSearch(1);
  }, [performSearch]);

  const goToPage = useCallback(
    async (page: number) => {
      await performSearch(page);
    },
    [performSearch]
  );

  // ============================================================================
  // Filter Management
  // ============================================================================

  const setFilter = useCallback(
    <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
      setFiltersState((prev) => {
        const newFilters = { ...prev, [key]: value };

        // Clear dependent filters when state changes
        if (key === 'state') {
          newFilters.city = '';
          newFilters.cities = [];
          newFilters.healthSystem = '';
        }

        updateUrl(newFilters);
        return newFilters;
      });
    },
    [updateUrl]
  );

  const setFilters = useCallback(
    (partial: Partial<SearchFilters>) => {
      setFiltersState((prev) => {
        const newFilters = { ...prev, ...partial };
        updateUrl(newFilters);
        return newFilters;
      });
    },
    [updateUrl]
  );

  const clearFilters = useCallback(() => {
    setFiltersState(mergedDefaultFilters);
    updateUrl(mergedDefaultFilters);
    setResults([]);
    setPagination(null);
    setHasSearched(false);
    setError(null);
  }, [mergedDefaultFilters, updateUrl]);

  const clearFilter = useCallback(
    (key: keyof SearchFilters) => {
      setFiltersState((prev) => {
        const newFilters = { ...prev };

        if (key === 'cities') {
          newFilters.cities = [];
        } else {
          newFilters[key] = '' as never;
        }

        // Clear dependent filters when state is cleared
        if (key === 'state') {
          newFilters.city = '';
          newFilters.cities = [];
          newFilters.healthSystem = '';
        }

        updateUrl(newFilters);
        return newFilters;
      });
    },
    [updateUrl]
  );

  // ============================================================================
  // Auto-search with Debounce
  // ============================================================================

  useEffect(() => {
    if (!opts.autoSearch) return;

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Don't auto-search if we can't search
    if (!filters.state) return;

    debounceTimeoutRef.current = setTimeout(() => {
      search();
    }, opts.autoSearchDebounce);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [filters, opts.autoSearch, opts.autoSearchDebounce, search]);

  // ============================================================================
  // Cleanup on Unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================================
  // Computed Values
  // ============================================================================

  const hasActiveFilters = useMemo(() => {
    return (
      isFilterActive(filters.state) ||
      isFilterActive(filters.city) ||
      isFilterActive(filters.cities) ||
      isFilterActive(filters.specialty) ||
      isFilterActive(filters.name) ||
      isFilterActive(filters.npi) ||
      isFilterActive(filters.entityType) ||
      isFilterActive(filters.insurancePlanId) ||
      isFilterActive(filters.healthSystem) ||
      isFilterActive(filters.zipCode)
    );
  }, [filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (isFilterActive(filters.state)) count++;
    if (isFilterActive(filters.city)) count++;
    if (isFilterActive(filters.cities)) count++;
    if (isFilterActive(filters.specialty)) count++;
    if (isFilterActive(filters.name)) count++;
    if (isFilterActive(filters.npi)) count++;
    if (isFilterActive(filters.entityType)) count++;
    if (isFilterActive(filters.insurancePlanId)) count++;
    if (isFilterActive(filters.healthSystem)) count++;
    if (isFilterActive(filters.zipCode)) count++;
    return count;
  }, [filters]);

  const canSearch = useMemo(() => {
    // At minimum, state must be selected
    return isFilterActive(filters.state);
  }, [filters.state]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // Filter state
    filters,
    setFilter,
    setFilters,
    clearFilters,
    clearFilter,

    // Results
    results,
    pagination,

    // Status
    isLoading,
    error,
    hasSearched,

    // Actions
    search,
    goToPage,

    // Computed
    hasActiveFilters,
    activeFilterCount,
    canSearch,
  };
}

export default useSearchForm;
