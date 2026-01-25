'use client';

import { DEFAULT_PAGE_SIZE } from '../lib/constants';
import { useSearchUrlParams } from './search/useSearchParams';
import { useFilterState, DEFAULT_FILTERS } from './search/useFilterState';
import { useSearchExecution } from './search/useSearchExecution';
import type { SearchFilters, PaginationState, ProviderDisplay } from '../types';

export interface UseSearchFormOptions {
  defaultFilters?: Partial<SearchFilters>;
  pageSize?: number;
  syncWithUrl?: boolean;
  autoSearch?: boolean;
  autoSearchDebounce?: number;
}

export interface UseSearchFormResult {
  filters: SearchFilters;
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  setFilters: (partial: Partial<SearchFilters>) => void;
  clearFilters: () => void;
  clearFilter: (key: keyof SearchFilters) => void;
  results: ProviderDisplay[];
  pagination: PaginationState | null;
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;
  search: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  canSearch: boolean;
}

export function useSearchForm(options: UseSearchFormOptions = {}): UseSearchFormResult {
  const {
    defaultFilters: userDefaultFilters = {},
    pageSize = DEFAULT_PAGE_SIZE,
    syncWithUrl = true,
    autoSearch = false,
    autoSearchDebounce = 500,
  } = options;

  const mergedDefaultFilters: SearchFilters = { ...DEFAULT_FILTERS, ...userDefaultFilters };

  const { getInitialFilters, updateUrl } = useSearchUrlParams({
    syncWithUrl,
    defaultFilters: mergedDefaultFilters,
  });

  const filterState = useFilterState({
    initialFilters: { ...mergedDefaultFilters, ...getInitialFilters() },
    onFiltersChange: updateUrl,
  });

  const searchExecution = useSearchExecution({
    filters: filterState.filters,
    pageSize,
    autoSearch,
    autoSearchDebounce,
    canSearch: filterState.canSearch,
  });

  const clearFilters = () => {
    filterState.clearFilters();
    searchExecution.clearResults();
  };

  return {
    filters: filterState.filters,
    setFilter: filterState.setFilter,
    setFilters: filterState.setFilters,
    clearFilters,
    clearFilter: filterState.clearFilter,
    results: searchExecution.results,
    pagination: searchExecution.pagination,
    isLoading: searchExecution.isLoading,
    error: searchExecution.error,
    hasSearched: searchExecution.hasSearched,
    search: searchExecution.search,
    goToPage: searchExecution.goToPage,
    hasActiveFilters: filterState.hasActiveFilters,
    activeFilterCount: filterState.activeFilterCount,
    canSearch: filterState.canSearch,
  };
}

export default useSearchForm;
