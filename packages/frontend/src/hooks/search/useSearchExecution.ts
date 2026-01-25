'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import api from '../../lib/api';
import { NYC_ALL_BOROUGHS_VALUE, NYC_BOROUGHS } from '../useCities';
import { isAbortError, toAppError, getUserMessage, logError } from '../../lib/errorUtils';
import type { SearchFilters, PaginationState, ProviderDisplay } from '../../types';

// ============================================================================
// Types
// ============================================================================

export interface UseSearchExecutionOptions {
  filters: SearchFilters;
  pageSize: number;
  autoSearch: boolean;
  autoSearchDebounce: number;
  canSearch: boolean;
}

export interface UseSearchExecutionResult {
  results: ProviderDisplay[];
  pagination: PaginationState | null;
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;
  search: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  clearResults: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useSearchExecution(options: UseSearchExecutionOptions): UseSearchExecutionResult {
  const { filters, pageSize, autoSearch, autoSearchDebounce, canSearch } = options;

  // State
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

        const response = await api.providers.search(searchFilters, page, pageSize);

        // Check if this request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        setResults(response.providers);
        setPagination(response.pagination);
      } catch (err) {
        // Ignore abort errors (user cancelled the request)
        if (isAbortError(err)) {
          return;
        }

        // Use standardized error handling
        const appError = toAppError(err);
        logError('useSearchExecution.performSearch', err);
        setError(getUserMessage(appError));
        setResults([]);
        setPagination(null);
      } finally {
        setIsLoading(false);
      }
    },
    [filters, pageSize]
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

  const clearResults = useCallback(() => {
    setResults([]);
    setPagination(null);
    setHasSearched(false);
    setError(null);
  }, []);

  // ============================================================================
  // Auto-search with Debounce
  // ============================================================================

  useEffect(() => {
    if (!autoSearch) return;

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Don't auto-search if we can't search
    if (!canSearch) return;

    debounceTimeoutRef.current = setTimeout(() => {
      search();
    }, autoSearchDebounce);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [filters, autoSearch, autoSearchDebounce, search, canSearch]);

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

  return {
    results,
    pagination,
    isLoading,
    error,
    hasSearched,
    search,
    goToPage,
    clearResults,
  };
}
