'use client';

import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ProviderCard } from '@/components/ProviderCard';
import ErrorMessage from '@/components/ErrorMessage';
import { EmptyState, type SearchSuggestion } from '@/components/EmptyState';
import { RecentSearches } from '@/components/RecentSearches';
import { SearchPagination } from './SearchPagination';
import type { ProviderDisplay, PaginationState } from '@/types';
import type { RecentSearch, RecentSearchParams } from '@/hooks/useRecentSearches';

interface SearchResultsListProps {
  providers: ProviderDisplay[];
  pagination: PaginationState | null;
  hasSearched: boolean;
  error: string | null;
  onRetry?: () => void;
  recentSearches: RecentSearch[];
  isHydrated: boolean;
  onRecentSearchSelect: (params: RecentSearchParams) => void;
  onRecentSearchRemove: (id: string) => void;
  onRecentSearchClearAll: () => void;
}

export function SearchResultsList({
  providers,
  pagination,
  hasSearched,
  error,
  onRetry,
  recentSearches,
  isHydrated,
  onRecentSearchSelect,
  onRecentSearchRemove,
  onRecentSearchClearAll,
}: SearchResultsListProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const state = searchParams.get('state') || '';
  const cities = searchParams.get('cities') || '';
  const specialty = searchParams.get('specialty') || '';
  const healthSystem = searchParams.get('healthSystem') || '';
  const insurancePlanId = searchParams.get('insurancePlanId') || '';
  const name = searchParams.get('name') || '';
  const npi = searchParams.get('npi') || '';

  const getNoResultsSuggestions = useCallback((): SearchSuggestion[] => {
    const suggestions: SearchSuggestion[] = [];
    if (specialty) suggestions.push({ label: 'Search all specialties', action: 'clear-specialty' });
    if (cities) suggestions.push({ label: 'Search entire state', action: 'clear-cities' });
    if (healthSystem) suggestions.push({ label: 'All health systems', action: 'clear-health-system' });
    if (insurancePlanId) suggestions.push({ label: 'All insurance plans', action: 'clear-insurance' });
    return suggestions.slice(0, 3);
  }, [specialty, cities, healthSystem, insurancePlanId]);

  const handleSuggestionClick = useCallback((action: string) => {
    const params = new URLSearchParams(searchParams.toString());
    switch (action) {
      case 'clear-specialty': params.delete('specialty'); break;
      case 'clear-cities': params.delete('cities'); break;
      case 'clear-health-system': params.delete('healthSystem'); break;
      case 'clear-insurance': params.delete('insurancePlanId'); break;
    }
    router.push(`/search?${params.toString()}`);
  }, [searchParams, router]);

  if (error) {
    return (
      <div aria-live="polite">
        <ErrorMessage
          variant="server"
          message={error}
          action={onRetry ? { label: 'Try Again', onClick: onRetry } : undefined}
        />
      </div>
    );
  }

  if (hasSearched && providers.length === 0) {
    return (
      <div aria-live="polite">
        <EmptyState
          type="no-results"
          suggestions={getNoResultsSuggestions()}
          onSuggestionClick={handleSuggestionClick}
        />
      </div>
    );
  }

  if (!hasSearched) {
    const hasRecent = isHydrated && recentSearches.length > 0;
    return (
      <div className="py-4">
        {hasRecent && (
          <div className="mb-6">
            <RecentSearches
              searches={recentSearches}
              onSelect={onRecentSearchSelect}
              onRemove={onRecentSearchRemove}
              onClearAll={onRecentSearchClearAll}
            />
          </div>
        )}
        <EmptyState type="landing" compact={hasRecent} />
      </div>
    );
  }

  const resultCount = pagination?.total || 0;
  const pageSize = pagination?.limit || 20;
  const currentPage = pagination?.page || 1;
  const isBroadSearch =
    resultCount > 500 && !specialty && !cities && !name && !npi && !insurancePlanId;

  // Range like "21-40 of 248,068" — the lower bound is what the user
  // sees as the first result on this page. Upper bound is clamped to
  // resultCount for the last (potentially partial) page.
  const rangeStart = resultCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, resultCount);

  // Scroll back to the top of the results when the page changes via
  // pagination link, so the user lands on result #1 of the new page
  // rather than wherever they were when they clicked the link. Smooth
  // scroll respects user's prefers-reduced-motion.
  useEffect(() => {
    if (currentPage > 1) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  // Build params for pagination links (only known filter fields)
  const paginationParams = new URLSearchParams();
  if (specialty) paginationParams.set('specialty', specialty);
  if (state) paginationParams.set('state', state);
  if (cities) paginationParams.set('cities', cities);
  if (healthSystem) paginationParams.set('healthSystem', healthSystem);
  if (insurancePlanId) paginationParams.set('insurancePlanId', insurancePlanId);
  if (name) paginationParams.set('name', name);
  if (npi) paginationParams.set('npi', npi);

  return (
    <div aria-live="polite">
      <p className="sr-only" role="status">
        {resultCount} {resultCount === 1 ? 'result' : 'results'} found
        {state ? ` in ${state}` : ''}
        {cities ? ` in ${cities.split(',').join(', ')}` : ''}
      </p>

      <div className="mb-4">
        <p className="text-stone-600 dark:text-gray-300">
          {isBroadSearch ? (
            <>
              Showing{' '}
              <strong className="text-stone-800 dark:text-white">
                {rangeStart.toLocaleString()}-{rangeEnd.toLocaleString()}
              </strong>{' '}
              of{' '}
              <strong className="text-stone-800 dark:text-white">
                {resultCount.toLocaleString()}
              </strong>{' '}
              providers{state && ` in ${state}`}
            </>
          ) : (
            <>
              Found{' '}
              <strong className="text-stone-800 dark:text-white">{resultCount.toLocaleString()}</strong>{' '}
              providers
              {state && ` in ${state}`}
              {cities && ` in ${cities.split(',').join(', ')}`}
            </>
          )}
        </p>
      </div>

      {isBroadSearch && (
        <div className="mb-5 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              That&apos;s a lot of providers! Narrow your search for better results.
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Try adding a <strong>specialty</strong>, <strong>city</strong>, or{' '}
              <strong>provider name</strong> to find what you&apos;re looking for faster.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="shrink-0 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-200 bg-blue-100 dark:bg-blue-800/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 rounded-lg transition-colors"
          >
            Refine search
          </button>
        </div>
      )}

      <ul className="space-y-5 list-none p-0" aria-label="Search results">
        {providers.map((provider) => (
          <li key={provider.id}>
            <ProviderCard provider={provider} />
          </li>
        ))}
      </ul>

      {pagination && (
        <SearchPagination pagination={pagination} currentParams={paginationParams} />
      )}

      <p className="text-center text-xs text-stone-400 dark:text-gray-500 mt-8 mb-4">
        Data sourced from CMS NPPES and community verifications.
        {/* M27 (F-09): visible "Learn more" stays (it matches the surrounding
            sentence), but aria-label gives SR users the concrete destination
            instead of a list of identical "learn more" links on the page. */}
        <Link
          href="/disclaimer"
          aria-label="Learn more about our data sources and disclaimer"
          className="underline hover:text-stone-600 dark:hover:text-gray-300 ml-1"
        >
          Learn more
        </Link>
      </p>
    </div>
  );
}
