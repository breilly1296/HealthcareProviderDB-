'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SearchResultsSkeleton } from '@/components/ProviderCardSkeleton';
import {
  SearchHeader, SearchControls, InsuranceCardBanner,
  SearchResultsList, SearchMapView, SearchViewLayout,
  type ViewMode,
} from '@/components/search';
import { useMapProviders } from '@/hooks/useMapProviders';
import { useRecentSearches, type RecentSearchParams } from '@/hooks/useRecentSearches';
import type { ProviderDisplay, PaginationState } from '@/types';

function SearchPageContent() {
  const [providers, setProviders] = useState<ProviderDisplay[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const { recentSearches, removeSearch, clearAll: clearAllSearches, isHydrated } = useRecentSearches();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { pins, total: mapTotal, clustered, loading: mapLoading, onBoundsChanged } = useMapProviders({
    specialty: searchParams.get('specialty') || undefined,
    enabled: viewMode === 'map' || viewMode === 'split',
  });

  const handleRecentSearchSelect = useCallback((params: RecentSearchParams) => {
    const urlParams = new URLSearchParams();
    if (params.state) urlParams.set('state', params.state);
    if (params.specialty) urlParams.set('specialty', params.specialty);
    if (params.cities) urlParams.set('cities', params.cities);
    if (params.healthSystem) urlParams.set('healthSystem', params.healthSystem);
    if (params.insurancePlanId) urlParams.set('insurancePlanId', params.insurancePlanId);
    if (params.zipCode) urlParams.set('zipCode', params.zipCode);
    router.push(`/search?${urlParams.toString()}`);
  }, [router]);

  const handleResultsChange = useCallback((newProviders: ProviderDisplay[], newPagination: PaginationState | null) => {
    setProviders(newProviders);
    setPagination(newPagination);
    setHasSearched(newProviders.length > 0 || newPagination !== null);
    setError(null);
  }, []);

  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        <SearchHeader />
        <InsuranceCardBanner />
        <SearchControls
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onResultsChange={handleResultsChange}
          onFilterCountChange={() => {}}
          onLoadingChange={setIsLoading}
        />
        <SearchViewLayout
          viewMode={viewMode}
          isLoading={isLoading}
          listContent={
            <SearchResultsList
              providers={providers}
              pagination={pagination}
              hasSearched={hasSearched}
              error={error}
              recentSearches={recentSearches}
              isHydrated={isHydrated}
              onRecentSearchSelect={handleRecentSearchSelect}
              onRecentSearchRemove={removeSearch}
              onRecentSearchClearAll={clearAllSearches}
            />
          }
          mapContent={
            <SearchMapView
              pins={pins}
              total={mapTotal}
              clustered={clustered}
              loading={mapLoading}
              onBoundsChanged={onBoundsChanged}
            />
          }
        />
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
