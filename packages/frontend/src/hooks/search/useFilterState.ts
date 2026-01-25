'use client';

import { useState, useCallback, useMemo } from 'react';
import type { SearchFilters } from '../../types';

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_FILTERS: SearchFilters = {
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

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if a filter value is "active" (non-empty/non-default)
 */
export function isFilterActive(value: string | string[]): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== '';
}

// ============================================================================
// Hook
// ============================================================================

export interface UseFilterStateOptions {
  initialFilters: SearchFilters;
  onFiltersChange?: (filters: SearchFilters) => void;
}

export interface UseFilterStateResult {
  filters: SearchFilters;
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  setFilters: (partial: Partial<SearchFilters>) => void;
  clearFilters: () => void;
  clearFilter: (key: keyof SearchFilters) => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  canSearch: boolean;
}

export function useFilterState(options: UseFilterStateOptions): UseFilterStateResult {
  const { initialFilters, onFiltersChange } = options;

  const [filters, setFiltersState] = useState<SearchFilters>(initialFilters);

  const updateFilters = useCallback(
    (newFilters: SearchFilters) => {
      setFiltersState(newFilters);
      onFiltersChange?.(newFilters);
    },
    [onFiltersChange]
  );

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

        onFiltersChange?.(newFilters);
        return newFilters;
      });
    },
    [onFiltersChange]
  );

  const setFilters = useCallback(
    (partial: Partial<SearchFilters>) => {
      setFiltersState((prev) => {
        const newFilters = { ...prev, ...partial };
        onFiltersChange?.(newFilters);
        return newFilters;
      });
    },
    [onFiltersChange]
  );

  const clearFilters = useCallback(() => {
    updateFilters(initialFilters);
  }, [initialFilters, updateFilters]);

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

        onFiltersChange?.(newFilters);
        return newFilters;
      });
    },
    [onFiltersChange]
  );

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

  return {
    filters,
    setFilter,
    setFilters,
    clearFilters,
    clearFilter,
    hasActiveFilters,
    activeFilterCount,
    canSearch,
  };
}
