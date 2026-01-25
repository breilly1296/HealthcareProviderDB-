'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Search, X, Loader2, ChevronDown } from 'lucide-react';
import { useSearchForm, useCities, useHealthSystems, useInsurancePlans } from '@/hooks';
import { SearchableSelect } from './ui/SearchableSelect';
import { SPECIALTY_OPTIONS, STATE_OPTIONS } from '@/lib/provider-utils';
import type { SearchFilters, ProviderDisplay, PaginationState, SelectOption, GroupedSelectOptions } from '@/types';

// ============================================================================
// Types
// ============================================================================

interface SearchFormProps {
  onResultsChange?: (results: ProviderDisplay[], pagination: PaginationState | null) => void;
  showAdvancedFilters?: boolean;
  className?: string;
  defaultFilters?: Partial<SearchFilters>;
}

// ============================================================================
// Component
// ============================================================================

export function SearchForm({
  onResultsChange,
  showAdvancedFilters = true,
  className = '',
  defaultFilters,
}: SearchFormProps) {
  const {
    filters,
    setFilter,
    clearFilters,
    clearFilter,
    results,
    pagination,
    isLoading,
    error,
    search,
    hasActiveFilters,
    activeFilterCount,
    canSearch,
  } = useSearchForm({ defaultFilters, syncWithUrl: true });

  // Data fetching hooks
  const { cities, isLoading: citiesLoading } = useCities(filters.state);
  const { healthSystems, isLoading: healthSystemsLoading } = useHealthSystems({
    state: filters.state,
    cities: filters.cities,
  });
  const { selectOptions: insuranceOptions, isLoading: insuranceLoading, findPlan } = useInsurancePlans();

  // Track if initial search has been triggered
  const hasInitialSearched = useRef(false);

  // Trigger initial search if there are URL params
  useEffect(() => {
    if (!hasInitialSearched.current && canSearch) {
      hasInitialSearched.current = true;
      search();
    }
  }, [canSearch, search]);

  // Notify parent when results change
  useEffect(() => {
    onResultsChange?.(results, pagination);
  }, [results, pagination, onResultsChange]);

  // Convert data to select options
  const cityOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'All Cities' },
    ...cities.map(c => ({ value: c.city, label: c.city })),
  ], [cities]);

  const healthSystemOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'All Health Systems' },
    ...healthSystems.map(hs => ({ value: hs.name, label: hs.name })),
  ], [healthSystems]);

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search();
  };

  // Get display label for active filter
  const getFilterLabel = (key: keyof SearchFilters, value: string | string[]): string => {
    if (Array.isArray(value)) {
      return `${value.length} ${value.length === 1 ? 'city' : 'cities'}`;
    }

    switch (key) {
      case 'state':
        return STATE_OPTIONS.find(s => s.value === value)?.label || value;
      case 'specialty':
        return SPECIALTY_OPTIONS.find(s => s.value === value)?.label || value;
      case 'insurancePlanId':
        return findPlan(value)?.planName || value;
      default:
        return value;
    }
  };

  // Active filters for chips
  const activeFilters = useMemo(() => {
    const chips: { key: keyof SearchFilters; label: string; value: string | string[] }[] = [];

    if (filters.state) chips.push({ key: 'state', label: getFilterLabel('state', filters.state), value: filters.state });
    if (filters.cities.length > 0) chips.push({ key: 'cities', label: getFilterLabel('cities', filters.cities), value: filters.cities });
    if (filters.specialty) chips.push({ key: 'specialty', label: getFilterLabel('specialty', filters.specialty), value: filters.specialty });
    if (filters.healthSystem) chips.push({ key: 'healthSystem', label: filters.healthSystem, value: filters.healthSystem });
    if (filters.insurancePlanId) chips.push({ key: 'insurancePlanId', label: getFilterLabel('insurancePlanId', filters.insurancePlanId), value: filters.insurancePlanId });
    if (filters.zipCode) chips.push({ key: 'zipCode', label: `ZIP: ${filters.zipCode}`, value: filters.zipCode });
    if (filters.name) chips.push({ key: 'name', label: `Name: ${filters.name}`, value: filters.name });
    if (filters.npi) chips.push({ key: 'npi', label: `NPI: ${filters.npi}`, value: filters.npi });

    return chips;
  }, [filters, findPlan]);

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
      {/* Primary Search Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SearchableSelect
          label="Specialty"
          options={SPECIALTY_OPTIONS}
          value={filters.specialty}
          onChange={(v) => setFilter('specialty', (v as string) || '')}
          placeholder="All Specialties"
          searchable
          clearable
        />

        <SearchableSelect
          label="State"
          options={STATE_OPTIONS}
          value={filters.state}
          onChange={(v) => setFilter('state', (v as string) || '')}
          placeholder="Select State"
          searchable
          clearable
          required
        />

        <SearchableSelect
          label="City"
          options={cityOptions}
          value={filters.cities}
          onChange={(v) => setFilter('cities', (v as string[]) || [])}
          placeholder={!filters.state ? 'Select state first' : 'Select cities'}
          disabled={!filters.state}
          isLoading={citiesLoading}
          searchable
          clearable
          multiple
        />

        <SearchableSelect
          label="Health System"
          options={healthSystemOptions}
          value={filters.healthSystem}
          onChange={(v) => setFilter('healthSystem', (v as string) || '')}
          placeholder="All Health Systems"
          isLoading={healthSystemsLoading}
          searchable
          clearable
        />
      </div>

      {/* Insurance Plan Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SearchableSelect
          label="Insurance Plan"
          options={insuranceOptions as GroupedSelectOptions[]}
          value={filters.insurancePlanId}
          onChange={(v) => setFilter('insurancePlanId', (v as string) || '')}
          placeholder="All Insurance Plans"
          isLoading={insuranceLoading}
          searchable
          clearable
        />

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              ZIP Code
            </label>
            <input
              type="text"
              id="zipCode"
              value={filters.zipCode}
              onChange={(e) => setFilter('zipCode', e.target.value)}
              placeholder="Enter ZIP code"
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              maxLength={10}
            />
          </div>

          <button
            type="submit"
            disabled={!canSearch || isLoading}
            className="btn-primary flex items-center gap-2 px-6"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>
      </div>

      {/* Advanced Filters Toggle */}
      {showAdvancedFilters && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
            Advanced Filters
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </summary>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Provider Name
              </label>
              <input
                type="text"
                id="name"
                value={filters.name}
                onChange={(e) => setFilter('name', e.target.value)}
                placeholder="Search by name"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            <div>
              <label htmlFor="npi" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                NPI Number
              </label>
              <input
                type="text"
                id="npi"
                value={filters.npi}
                onChange={(e) => setFilter('npi', e.target.value)}
                placeholder="10-digit NPI"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                maxLength={10}
              />
            </div>
          </div>
        </details>
      )}

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Filters:</span>
          {activeFilters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => clearFilter(key)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-sm bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
            >
              {label}
              <X className="w-3.5 h-3.5" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
    </form>
  );
}

export default SearchForm;
