'use client';

import { useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SearchForm, type SearchFormRef } from '@/components/SearchForm';
import { ProviderCard } from '@/components/ProviderCard';
import { SearchResultsSkeleton } from '@/components/ProviderCardSkeleton';
import ErrorMessage from '@/components/ErrorMessage';
import { EmptyState, type SearchSuggestion } from '@/components/EmptyState';
import { SaveProfileButton } from '@/components/SaveProfileButton';
import { FilterButton } from '@/components/FilterButton';
import { FilterDrawer } from '@/components/FilterDrawer';
import type { ProviderDisplay, PaginationState } from '@/types';

function SearchResultsDisplay({
  providers,
  pagination,
  hasSearched,
  error,
  onRetry,
}: {
  providers: ProviderDisplay[];
  pagination: PaginationState | null;
  hasSearched: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const state = searchParams.get('state') || '';
  const cities = searchParams.get('cities') || '';
  const specialty = searchParams.get('specialty') || '';
  const healthSystem = searchParams.get('healthSystem') || '';
  const insurancePlanId = searchParams.get('insurancePlanId') || '';

  // Generate suggestions based on current search
  const getNoResultsSuggestions = useCallback((): SearchSuggestion[] => {
    const suggestions: SearchSuggestion[] = [];

    if (specialty) {
      suggestions.push({ label: 'Search all specialties', action: 'clear-specialty' });
    }
    if (cities) {
      suggestions.push({ label: 'Search entire state', action: 'clear-cities' });
    }
    if (healthSystem) {
      suggestions.push({ label: 'All health systems', action: 'clear-health-system' });
    }
    if (insurancePlanId) {
      suggestions.push({ label: 'All insurance plans', action: 'clear-insurance' });
    }

    return suggestions.slice(0, 3);
  }, [specialty, cities, healthSystem, insurancePlanId]);

  // Handle suggestion clicks
  const handleSuggestionClick = useCallback((action: string) => {
    const params = new URLSearchParams(searchParams.toString());

    switch (action) {
      case 'clear-specialty':
        params.delete('specialty');
        break;
      case 'clear-cities':
        params.delete('cities');
        break;
      case 'clear-health-system':
        params.delete('healthSystem');
        break;
      case 'clear-insurance':
        params.delete('insurancePlanId');
        break;
    }

    router.push(`/search?${params.toString()}`);
  }, [searchParams, router]);

  if (error) {
    return (
      <ErrorMessage
        variant="server"
        message={error}
        action={onRetry ? { label: 'Try Again', onClick: onRetry } : undefined}
      />
    );
  }

  if (hasSearched && providers.length === 0) {
    return (
      <EmptyState
        type="no-results"
        suggestions={getNoResultsSuggestions()}
        onSuggestionClick={handleSuggestionClick}
      />
    );
  }

  if (!hasSearched) {
    return <EmptyState type="landing" />;
  }

  return (
    <div aria-live="polite">
      {/* Results count */}
      <div className="mb-4">
        <p className="text-gray-600 dark:text-gray-300">
          Found <strong className="text-gray-900 dark:text-white">{pagination?.total || 0}</strong> providers
          {state && ` in ${state}`}
          {cities && ` in ${cities.split(',').join(', ')}`}
        </p>
      </div>

      {/* Disclaimer banner */}
      <div className="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          <strong>Note:</strong> Provider information is crowdsourced and may not be current. Always verify insurance acceptance directly with the provider's office before scheduling.
        </p>
      </div>

      {/* Provider list */}
      <div className="space-y-5">
        {providers.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - pagination.page) <= 2)
            .map((p, idx, arr) => {
              const prevPage = arr[idx - 1];
              const showEllipsisBefore = idx > 0 && prevPage !== undefined && p - prevPage > 1;

              return (
                <div key={p} className="flex items-center gap-2">
                  {showEllipsisBefore && (
                    <span className="px-2 text-gray-400 dark:text-gray-500">...</span>
                  )}
                  <a
                    href={`/search?${new URLSearchParams({
                      ...(specialty && { specialty }),
                      ...(state && { state }),
                      ...(cities && { cities }),
                      ...(healthSystem && { healthSystem }),
                      page: String(p),
                    }).toString()}`}
                    className={`min-w-[44px] min-h-[44px] px-4 py-3 rounded-lg font-medium flex items-center justify-center ${
                      p === pagination.page
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    aria-label={`Page ${p}${p === pagination.page ? ', current page' : ''}`}
                    aria-current={p === pagination.page ? 'page' : undefined}
                  >
                    {p}
                  </a>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function SearchPageContent() {
  const [providers, setProviders] = useState<ProviderDisplay[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Loading state is managed by SearchForm, but kept here for potential direct use
  const [isLoading, _setIsLoading] = useState(false);

  // Mobile filter drawer state
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const drawerFormRef = useRef<SearchFormRef>(null);

  const handleResultsChange = useCallback((
    newProviders: ProviderDisplay[],
    newPagination: PaginationState | null
  ) => {
    setProviders(newProviders);
    setPagination(newPagination);
    setHasSearched(newProviders.length > 0 || newPagination !== null);
    setError(null);
  }, []);

  const handleApplyFilters = useCallback(() => {
    drawerFormRef.current?.search();
  }, []);

  const handleClearFilters = useCallback(() => {
    drawerFormRef.current?.clear();
  }, []);

  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
                Find Healthcare Providers
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                Search for providers by specialty, location, and more.
              </p>
            </div>
            <Suspense fallback={null}>
              <SaveProfileButton />
            </Suspense>
          </div>
        </div>

        {/* Desktop Search Form - hidden on mobile */}
        <div className="hidden md:block card mb-8">
          <Suspense fallback={<div className="animate-pulse h-40 bg-gray-100 dark:bg-gray-700 rounded" />}>
            <SearchForm
              onResultsChange={handleResultsChange}
              onFilterCountChange={setActiveFilterCount}
            />
          </Suspense>
        </div>

        {/* Mobile Filter Button */}
        <FilterButton
          activeFilterCount={activeFilterCount}
          onClick={() => setIsFilterDrawerOpen(true)}
        />

        {/* Mobile Filter Drawer */}
        <FilterDrawer
          isOpen={isFilterDrawerOpen}
          onClose={() => setIsFilterDrawerOpen(false)}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
          activeFilterCount={activeFilterCount}
        >
          <SearchForm
            ref={drawerFormRef}
            variant="drawer"
            onResultsChange={handleResultsChange}
            onFilterCountChange={setActiveFilterCount}
          />
        </FilterDrawer>

        {/* Results */}
        {isLoading ? (
          <SearchResultsSkeleton count={5} />
        ) : (
          <Suspense fallback={<SearchResultsSkeleton count={5} />}>
            <SearchResultsDisplay
              providers={providers}
              pagination={pagination}
              hasSearched={hasSearched}
              error={error}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchResultsSkeleton count={5} />}>
      <SearchPageContent />
    </Suspense>
  );
}
