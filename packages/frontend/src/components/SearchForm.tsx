'use client';

import { useState, useEffect, useMemo, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Search, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useSearchParams as useNextSearchParams } from 'next/navigation';
import { useSearchForm, useCities, useHealthSystems, useInsurancePlans, useGeoLocation, useInsuranceCard, NYC_ALL_BOROUGHS_VALUE, NYC_BOROUGHS } from '@/hooks';
import { SearchableSelect } from './ui/SearchableSelect';
import { SPECIALTY_OPTIONS, STATE_OPTIONS } from '@/lib/provider-utils';
import type { SearchFilters, ProviderDisplay, PaginationState, SelectOption, GroupedSelectOptions } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface SearchFormRef {
  search: () => void;
  clear: () => void;
}

interface SearchFormProps {
  onResultsChange?: (results: ProviderDisplay[], pagination: PaginationState | null) => void;
  className?: string;
  defaultFilters?: Partial<SearchFilters>;
  /** 'inline' shows full form with Search button, 'drawer' hides Search button for mobile drawer use */
  variant?: 'inline' | 'drawer';
  /** Callback when active filter count changes (for mobile badge) */
  onFilterCountChange?: (count: number) => void;
  /** Callback when loading state changes */
  onLoadingChange?: (loading: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

export const SearchForm = forwardRef<SearchFormRef, SearchFormProps>(function SearchForm({
  onResultsChange,
  className = '',
  defaultFilters,
  variant = 'inline',
  onFilterCountChange,
  onLoadingChange,
}, ref) {
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
    searchImmediate,
    hasActiveFilters,
    activeFilterCount,
    canSearch,
  } = useSearchForm({ defaultFilters, syncWithUrl: true });

  const isDrawer = variant === 'drawer';

  // Expose search and clear methods via ref
  // Use searchImmediate for explicit button clicks (bypasses debounce)
  useImperativeHandle(ref, () => ({
    search: () => searchImmediate(),
    clear: () => clearFilters(),
  }), [searchImmediate, clearFilters]);

  // Notify parent of filter count changes
  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  // Data fetching hooks
  const { cities, isLoading: citiesLoading } = useCities(filters.state);
  const { healthSystems, isLoading: healthSystemsLoading } = useHealthSystems({
    state: filters.state,
    cities: filters.cities,
  });
  const { selectOptions: insuranceOptions, isLoading: insuranceLoading, findPlan, findPlanByName } = useInsurancePlans();

  // Auto-match insurance plan from card-upload hint params
  const nextSearchParams = useNextSearchParams();
  const hintIssuerName = nextSearchParams.get('issuerName');
  const hintPlanName = nextSearchParams.get('planName');
  const hasAutoMatchedPlan = useRef(false);

  // Saved insurance card (for logged-in users)
  const { card: savedCard } = useInsuranceCard();

  useEffect(() => {
    if (hasAutoMatchedPlan.current || insuranceLoading) return;

    // Priority 1: URL hint params
    if (hintIssuerName) {
      hasAutoMatchedPlan.current = true;
      const matched = findPlanByName(hintIssuerName, hintPlanName || undefined);
      if (matched) {
        setFilter('insurancePlanId', matched.planId);
      }
      return;
    }

    // Priority 2: Saved card with matched plan (no URL hints)
    if (savedCard?.matchedPlan?.planId) {
      hasAutoMatchedPlan.current = true;
      setFilter('insurancePlanId', savedCard.matchedPlan.planId);
    }
  }, [insuranceLoading, hintIssuerName, hintPlanName, findPlanByName, setFilter, savedCard]);

  // Auto-fill state from geolocation if no state is set (e.g. no URL params)
  const geo = useGeoLocation();
  useEffect(() => {
    if (geo.state && !filters.state) {
      setFilter('state', geo.state);
    }
  }, [geo.state]); // eslint-disable-line react-hooks/exhaustive-deps

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
    ...cities.map(c => ({
      value: c.city,
      label: c.city === NYC_ALL_BOROUGHS_VALUE ? 'NYC (All Boroughs)' : c.city,
    })),
  ], [cities]);

  const healthSystemOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'All Health Systems' },
    ...healthSystems.map(hs => ({ value: hs.name, label: hs.name })),
  ], [healthSystems]);

  // Handle form submission - use immediate search (bypasses debounce)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchImmediate();
  };

  // Enter key triggers search from plain text inputs (e.g. ZIP, name, NPI)
  // Native <input> Enter already submits the form via handleSubmit, but this
  // ensures it also works if the browser doesn't fire submit (e.g. single-input forms).
  // We skip SearchableSelect elements — they handle Enter internally.
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !canSearch || isLoading) return;
    const target = e.target as HTMLElement;
    // Only trigger for plain text inputs (ZIP, name, NPI) — not for
    // SearchableSelect buttons/inputs which handle Enter on their own.
    if (target.tagName === 'INPUT' && !(target as HTMLInputElement).readOnly) {
      e.preventDefault();
      searchImmediate();
    }
  }, [canSearch, isLoading, searchImmediate]);

  // Handle city selection with NYC All Boroughs logic
  const handleCityChange = (newValues: string[]) => {
    const prevValues = filters.cities;
    const hadNycCombo = prevValues.includes(NYC_ALL_BOROUGHS_VALUE);
    const hasNycCombo = newValues.includes(NYC_ALL_BOROUGHS_VALUE);

    // Case 1: NYC All Boroughs was just selected
    if (hasNycCombo && !hadNycCombo) {
      // Remove individual boroughs and just keep the combo
      const nonBoroughs = newValues.filter(
        city => city !== NYC_ALL_BOROUGHS_VALUE && !NYC_BOROUGHS.includes(city)
      );
      setFilter('cities', [NYC_ALL_BOROUGHS_VALUE, ...nonBoroughs]);
      return;
    }

    // Case 2: NYC All Boroughs was deselected (combo removed directly)
    if (hadNycCombo && !hasNycCombo) {
      // Check if a borough was individually deselected
      const removedBoroughs = NYC_BOROUGHS.filter(
        borough => prevValues.includes(NYC_ALL_BOROUGHS_VALUE) && !newValues.includes(borough)
      );

      if (removedBoroughs.length > 0) {
        // A borough was deselected while combo was active - expand to remaining boroughs
        const remainingBoroughs = NYC_BOROUGHS.filter(
          borough => !removedBoroughs.includes(borough)
        );
        const nonBoroughs = newValues.filter(
          city => city !== NYC_ALL_BOROUGHS_VALUE && !NYC_BOROUGHS.includes(city)
        );
        setFilter('cities', [...remainingBoroughs, ...nonBoroughs]);
        return;
      }
    }

    // Default case: just set the values as-is
    setFilter('cities', newValues);
  };

  // Get display label for active filter
  const getFilterLabel = (key: keyof SearchFilters, value: string | string[]): string => {
    if (Array.isArray(value)) {
      // Check if NYC All Boroughs is selected
      if (value.length === 1 && value[0] === NYC_ALL_BOROUGHS_VALUE) {
        return 'NYC (All Boroughs)';
      }
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

  // Drawer variant: single column layout with all fields visible
  if (isDrawer) {
    return (
      <div className={`space-y-4 ${className}`}>
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
          onChange={(v) => handleCityChange((v as string[]) || [])}
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

        <div>
          <label htmlFor="zipCode-drawer" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            ZIP Code
          </label>
          <input
            type="text"
            id="zipCode-drawer"
            value={filters.zipCode}
            onChange={(e) => setFilter('zipCode', e.target.value)}
            placeholder="Enter ZIP code"
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            maxLength={10}
          />
        </div>

        <div>
          <label htmlFor="name-drawer" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Provider Name
          </label>
          <input
            type="text"
            id="name-drawer"
            value={filters.name}
            onChange={(e) => setFilter('name', e.target.value)}
            placeholder="Search by name"
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <div>
          <label htmlFor="npi-drawer" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            NPI Number
          </label>
          <input
            type="text"
            id="npi-drawer"
            value={filters.npi}
            onChange={(e) => setFilter('npi', e.target.value)}
            placeholder="10-digit NPI"
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            maxLength={10}
          />
        </div>

        {error && (
          <div role="alert" className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Inline variant: desktop layout with primary row + collapsible secondary filters
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Count active secondary filters (everything except specialty, state, insurance)
  const secondaryFilterCount = useMemo(() => {
    let count = 0;
    if (filters.cities.length > 0) count++;
    if (filters.healthSystem) count++;
    if (filters.zipCode) count++;
    if (filters.name) count++;
    if (filters.npi) count++;
    return count;
  }, [filters.cities, filters.healthSystem, filters.zipCode, filters.name, filters.npi]);

  // Auto-expand "More Filters" if any secondary filter is active on mount
  const hasAutoExpanded = useRef(false);
  useEffect(() => {
    if (hasAutoExpanded.current) return;
    const hasSecondaryFilter = filters.cities.length > 0 ||
      filters.healthSystem ||
      filters.zipCode ||
      filters.name ||
      filters.npi;
    if (hasSecondaryFilter) {
      setShowMoreFilters(true);
      hasAutoExpanded.current = true;
    }
  }, [filters.cities, filters.healthSystem, filters.zipCode, filters.name, filters.npi]);

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} aria-label="Provider search form" className={`space-y-4 ${className}`}>
      {/* Primary Search Row: Specialty | State | Insurance | Search */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-4">
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
          label="Insurance Plan"
          options={insuranceOptions as GroupedSelectOptions[]}
          value={filters.insurancePlanId}
          onChange={(v) => setFilter('insurancePlanId', (v as string) || '')}
          placeholder="All Insurance Plans"
          isLoading={insuranceLoading}
          searchable
          clearable
          className="min-w-[180px]"
        />

        <div className="flex items-end gap-3">
          <button
            type="submit"
            disabled={!canSearch || isLoading}
            className={`btn-primary flex items-center gap-2 px-6 h-[42px] transition-shadow ${
              canSearch && !isLoading
                ? 'shadow-md shadow-primary-500/30'
                : ''
            }`}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>

          {activeFilterCount > 0 && !isLoading && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap h-[42px]"
            >
              <X className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* More Filters Toggle */}
      <button
        type="button"
        onClick={() => setShowMoreFilters(!showMoreFilters)}
        aria-expanded={showMoreFilters}
        className="flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
      >
        {showMoreFilters ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
        More Filters
        {secondaryFilterCount > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full">
            {secondaryFilterCount}
          </span>
        )}
      </button>

      {/* Secondary Filters (collapsible) */}
      {showMoreFilters && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-stone-200 dark:border-gray-700">
          <SearchableSelect
            label="City"
            options={cityOptions}
            value={filters.cities}
            onChange={(v) => handleCityChange((v as string[]) || [])}
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

          <div>
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
        </div>
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
              aria-label={`Remove ${label} filter`}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-sm bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
            >
              {label}
              <X className="w-3.5 h-3.5" aria-hidden="true" />
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
        <div role="alert" className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
    </form>
  );
});

export default SearchForm;
