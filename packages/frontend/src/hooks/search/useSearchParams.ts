'use client';

import { useCallback } from 'react';
import { useSearchParams as useNextSearchParams, useRouter, usePathname } from 'next/navigation';
import type { SearchFilters } from '../../types';

// ============================================================================
// URL Parsing Utilities
// ============================================================================

/**
 * Parse URL search params into SearchFilters
 */
export function parseUrlToFilters(searchParams: URLSearchParams): Partial<SearchFilters> {
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
export function filtersToSearchParams(
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

// ============================================================================
// Hook
// ============================================================================

export interface UseSearchParamsOptions {
  syncWithUrl: boolean;
  defaultFilters: SearchFilters;
}

export interface UseSearchParamsResult {
  /** Get initial filters from URL */
  getInitialFilters: () => Partial<SearchFilters>;
  /** Update URL with new filters */
  updateUrl: (filters: SearchFilters) => void;
}

export function useSearchUrlParams(options: UseSearchParamsOptions): UseSearchParamsResult {
  const { syncWithUrl, defaultFilters } = options;

  const searchParams = useNextSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const getInitialFilters = useCallback((): Partial<SearchFilters> => {
    if (!syncWithUrl) return {};
    return parseUrlToFilters(searchParams);
  }, [syncWithUrl, searchParams]);

  const updateUrl = useCallback(
    (newFilters: SearchFilters) => {
      if (!syncWithUrl) return;

      const params = filtersToSearchParams(newFilters, defaultFilters);
      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      // Use replace to avoid adding to history on every filter change
      router.replace(newUrl, { scroll: false });
    },
    [syncWithUrl, pathname, router, defaultFilters]
  );

  return {
    getInitialFilters,
    updateUrl,
  };
}
