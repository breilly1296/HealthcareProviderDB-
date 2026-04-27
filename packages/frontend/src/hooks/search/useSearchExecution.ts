'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import api from '../../lib/api';
import { NYC_ALL_BOROUGHS_VALUE, NYC_BOROUGHS } from '../useCities';
import { isAbortError, toClientError, getUserMessage, logError } from '../../lib/errorUtils';
import { debounce, SEARCH_DEBOUNCE_MS } from '../../lib/debounce';
import type { DebouncedFunction } from '../../lib/debounce';
import { trackSearch } from '../../lib/analytics';
import type { SearchFilters, PaginationState, ProviderDisplay } from '../../types';

// ============================================================================
// Types
// ============================================================================

export interface UseSearchExecutionOptions {
  filters: SearchFilters;
  pageSize: number;
  autoSearch: boolean;
  /** Debounce delay for auto-search in ms. Default: 450ms (SEARCH_DEBOUNCE_MS) */
  autoSearchDebounce?: number;
  canSearch: boolean;
  /**
   * Page to fetch on next auto-search trigger. Reactive — changes (e.g.
   * pagination link click that flips `?page=N`) re-fire the search at the
   * new page. Defaults to 1. Filter changes via `searchImmediate` always
   * reset to page 1 regardless of this value (new search semantics).
   */
  currentPage?: number;
}

export interface UseSearchExecutionResult {
  results: ProviderDisplay[];
  pagination: PaginationState | null;
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;
  /**
   * Execute search with debounce (for auto-search/typing).
   * Waits for the debounce period before executing.
   */
  search: () => void;
  /**
   * Execute search immediately (for button clicks).
   * Bypasses debounce and cancels any pending debounced calls.
   */
  searchImmediate: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  /**
   * Clear results and cancel any pending debounced searches.
   */
  clearResults: () => void;
}

// ============================================================================
// Debounce Strategy
// ============================================================================
//
// This hook implements a two-tier debounce strategy to optimize API calls:
//
// 1. Auto-search (typing): 450ms debounce delay
//    - Reduces API calls while user is actively typing
//    - 450ms captures natural pauses between words
//    - Each keystroke resets the timer, so fast typing = one API call
//
// 2. Explicit search (button click): Immediate execution
//    - Uses searchImmediate() which bypasses debounce
//    - Also cancels any pending debounced calls to prevent double-execution
//    - Users expect instant feedback when clicking "Search"
//
// 3. Filter clear: Cancels pending searches
//    - clearResults() cancels any pending debounced calls
//    - Prevents stale searches from executing after reset
//
// ============================================================================

// ============================================================================
// Hook
// ============================================================================

export function useSearchExecution(options: UseSearchExecutionOptions): UseSearchExecutionResult {
  const {
    filters,
    pageSize,
    autoSearch,
    autoSearchDebounce = SEARCH_DEBOUNCE_MS,
    canSearch,
    currentPage = 1,
  } = options;

  // State
  const [results, setResults] = useState<ProviderDisplay[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentPageRef = useRef(1);
  const filtersRef = useRef(filters);

  // Keep filtersRef in sync
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

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
        // Use ref to get current filters (important for debounced calls)
        const currentFilters = filtersRef.current;

        // Expand NYC_ALL_BOROUGHS to actual borough names before API call
        const expandedCities = currentFilters.cities.flatMap(city =>
          city === NYC_ALL_BOROUGHS_VALUE ? NYC_BOROUGHS : [city]
        );
        const searchFilters = {
          ...currentFilters,
          cities: expandedCities,
        };

        const response = await api.providers.search(searchFilters, page, pageSize);

        // Check if this request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        setResults(response.providers);
        setPagination(response.pagination);

        trackSearch({
          specialty: currentFilters.specialty,
          state: currentFilters.state,
          city: currentFilters.city,
          cities: expandedCities.join(','),
          healthSystem: currentFilters.healthSystem,
          resultsCount: response.pagination.total,
          mode: 'providers',
        });
      } catch (err) {
        // Ignore abort errors (user cancelled the request)
        if (isAbortError(err)) {
          return;
        }

        // Use standardized error handling
        const clientError = toClientError(err);
        logError('useSearchExecution.performSearch', err);
        setError(getUserMessage(clientError));
        setResults([]);
        setPagination(null);
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize]
  );

  // ============================================================================
  // Debounced Search
  // ============================================================================

  // Create debounced search function with configurable delay
  const debouncedSearchRef = useRef<DebouncedFunction<() => void> | null>(null);

  // Track the most recent currentPage in a ref so the debounced function
  // always reads the current value without needing to be re-created on
  // every page change (which would cancel pending debounced calls).
  const currentPageRefForDebounce = useRef(currentPage);
  useEffect(() => {
    currentPageRefForDebounce.current = currentPage;
  }, [currentPage]);

  // Initialize/update debounced function when delay changes
  useEffect(() => {
    debouncedSearchRef.current = debounce(
      () => {
        performSearch(currentPageRefForDebounce.current);
      },
      autoSearchDebounce,
      { leading: false, trailing: true }
    );

    return () => {
      // Cancel pending debounced call on cleanup
      debouncedSearchRef.current?.cancel();
    };
  }, [performSearch, autoSearchDebounce]);

  // Debounced search (for auto-search/typing)
  const search = useCallback(() => {
    debouncedSearchRef.current?.();
  }, []);

  // Immediate search (for button clicks) - bypasses debounce
  const searchImmediate = useCallback(async () => {
    // Cancel any pending debounced call to prevent double execution
    debouncedSearchRef.current?.cancel();
    await performSearch(1);
  }, [performSearch]);

  const goToPage = useCallback(
    async (page: number) => {
      // Cancel any pending debounced call
      debouncedSearchRef.current?.cancel();
      await performSearch(page);
    },
    [performSearch]
  );

  const clearResults = useCallback(() => {
    // Cancel any pending debounced search
    debouncedSearchRef.current?.cancel();
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setResults([]);
    setPagination(null);
    setHasSearched(false);
    setError(null);
  }, []);

  // ============================================================================
  // Auto-search Effect
  // ============================================================================

  useEffect(() => {
    if (!autoSearch || !canSearch) {
      return;
    }

    // Trigger debounced search when filters change OR when the URL page
    // param flips (pagination link click). Both routes use the same
    // debounced path; the ref above ensures the debounced function picks
    // up the latest currentPage when it fires.
    search();
  }, [filters, autoSearch, canSearch, search, currentPage]);

  // ============================================================================
  // Cleanup on Unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      debouncedSearchRef.current?.cancel();
    };
  }, []);

  return {
    results,
    pagination,
    isLoading,
    error,
    hasSearched,
    search,
    searchImmediate,
    goToPage,
    clearResults,
  };
}
