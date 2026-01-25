/**
 * Barrel exports for search hooks
 */

// URL synchronization
export {
  useSearchUrlParams,
  parseUrlToFilters,
  filtersToSearchParams,
} from './useSearchParams';
export type { UseSearchParamsOptions, UseSearchParamsResult } from './useSearchParams';

// Filter state management
export {
  useFilterState,
  DEFAULT_FILTERS,
  isFilterActive,
} from './useFilterState';
export type { UseFilterStateOptions, UseFilterStateResult } from './useFilterState';

// Search execution
export { useSearchExecution } from './useSearchExecution';
export type { UseSearchExecutionOptions, UseSearchExecutionResult } from './useSearchExecution';

// Re-export recent searches from parent directory for convenience
export { useRecentSearches } from '../useRecentSearches';
export type { RecentSearch, RecentSearchParams } from '../useRecentSearches';
