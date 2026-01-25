/**
 * Barrel exports for all hooks
 */

// Data fetching hooks
export {
  useCities,
  clearCitiesCache,
  prefetchCities,
} from './useCities';

export {
  useHealthSystems,
  clearHealthSystemsCache,
  prefetchHealthSystems,
} from './useHealthSystems';

export {
  useInsurancePlans,
  clearInsurancePlansCache,
} from './useInsurancePlans';

// Existing hooks
export { useCompare } from './useCompare';
export type { CompareProvider } from './useCompare';

export { useRecentSearches } from './useRecentSearches';
export type { RecentSearch, RecentSearchParams } from './useRecentSearches';

// Re-export types for convenience
export type { CityData, HealthSystem, GroupedSelectOptions } from '../types';
