'use client';

import { useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SearchResultsSkeleton } from '@/components/ProviderCardSkeleton';
import {
  SearchHeader, SearchControls, InsuranceCardBanner,
  SearchResultsList, SearchMapView, SearchViewLayout, NearbyBanner,
  type ViewMode,
} from '@/components/search';
import { NearMeButton } from '@/components/NearMeButton';
import { useMapProviders } from '@/hooks/useMapProviders';
import { useRecentSearches, type RecentSearchParams } from '@/hooks/useRecentSearches';
import { useNearbySearch, type NearbySearchParams } from '@/hooks/useNearbySearch';
import type { ProviderDisplay, PaginationState } from '@/types';

// Default radius when the user activates Near-Me without specifying one.
// Matches the backend default (services/providerService.ts findNearbyProviders).
const DEFAULT_RADIUS_MILES = 10;

// Shape returned by api.providers.nearby — infer from the hook's return
// instead of re-declaring so any backend response change flows through
// the TS compiler.
type NearbyResponseProvider = NonNullable<
  NonNullable<ReturnType<typeof useNearbySearch>['data']>['providers'][number]
>;

/**
 * Adapt a nearby-endpoint row to the ProviderDisplay shape the rest of the
 * search UI consumes. The two endpoints return different shapes (nearby
 * carries a single `practiceLocation` sub-object; regular search carries
 * a flat address + relations), so we flatten here to keep ProviderCard +
 * SearchResultsList unchanged. distanceMiles passes straight through.
 */
function toProviderDisplay(n: NearbyResponseProvider): ProviderDisplay {
  return {
    id: n.npi,
    npi: n.npi,
    entityType: n.entityType === 'ORGANIZATION' ? 'ORGANIZATION' : 'INDIVIDUAL',
    firstName: n.firstName,
    lastName: n.lastName,
    middleName: null,
    credential: n.credential,
    organizationName: n.organizationName,
    addressLine1: n.practiceLocation.addressLine1 ?? '',
    addressLine2: n.practiceLocation.addressLine2,
    city: n.practiceLocation.city ?? '',
    state: n.practiceLocation.state ?? '',
    zip: n.practiceLocation.zipCode ?? '',
    phone: n.practiceLocation.phone,
    taxonomyCode: n.taxonomyCode,
    taxonomyDescription: n.primarySpecialty,
    specialtyCategory: n.specialtyCategory,
    npiStatus: n.npiStatus,
    displayName: n.displayName,
    distanceMiles: n.distanceMiles,
  };
}

function SearchPageContent() {
  const [searchProviders, setSearchProviders] = useState<ProviderDisplay[]>([]);
  const [searchPagination, setSearchPagination] = useState<PaginationState | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const { recentSearches, removeSearch, clearAll: clearAllSearches, isHydrated } = useRecentSearches();
  const router = useRouter();
  const searchParams = useSearchParams();

  // -------------------------------------------------------------------------
  // Near-Me (F-16): URL params are the source of truth so proximity searches
  // are shareable / bookmarkable. /search?lat=40.7128&lng=-74.0060&radius=10
  // activates Near-Me mode; removing the params returns to the regular flow.
  // -------------------------------------------------------------------------
  const latParam = searchParams.get('lat');
  const lngParam = searchParams.get('lng');
  const radiusParam = searchParams.get('radius');
  const specialtyParam = searchParams.get('specialty') || undefined;
  const nameParam = searchParams.get('name') || undefined;

  const nearbyParams = useMemo<NearbySearchParams | null>(() => {
    if (!latParam || !lngParam) return null;
    const lat = Number(latParam);
    const lng = Number(lngParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const radius = Number(radiusParam) || DEFAULT_RADIUS_MILES;
    return { lat, lng, radius, specialty: specialtyParam, name: nameParam, limit: 20 };
  }, [latParam, lngParam, radiusParam, specialtyParam, nameParam]);

  const isNearbyActive = nearbyParams !== null;

  const nearbyQuery = useNearbySearch(nearbyParams);

  // Adapt the nearby results to the ProviderDisplay shape the downstream
  // list expects. Memoized so SearchResultsList doesn't re-render on every
  // parent render.
  const nearbyProviders = useMemo<ProviderDisplay[]>(() => {
    if (!nearbyQuery.data) return [];
    return nearbyQuery.data.providers.map(toProviderDisplay);
  }, [nearbyQuery.data]);

  const nearbyPagination = nearbyQuery.data?.pagination ?? null;

  // Switch the URL into Near-Me mode. Preserves specialty/name from the
  // existing query so users don't lose active filters when they toggle.
  const activateNearby = useCallback((lat: number, lng: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('lat', lat.toFixed(6));
    params.set('lng', lng.toFixed(6));
    if (!params.get('radius')) params.set('radius', String(DEFAULT_RADIUS_MILES));
    // Strip state/cities/zipCode/healthSystem — they're scoped to regular
    // search and don't combine cleanly with a coordinate-based query.
    ['state', 'cities', 'zipCode', 'healthSystem', 'insurancePlanId'].forEach(k => params.delete(k));
    router.push(`/search?${params.toString()}`);
  }, [router, searchParams]);

  const clearNearby = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('lat');
    params.delete('lng');
    params.delete('radius');
    router.push(`/search${params.toString() ? `?${params.toString()}` : ''}`);
  }, [router, searchParams]);

  const changeRadius = useCallback((radius: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('radius', String(radius));
    router.push(`/search?${params.toString()}`);
  }, [router, searchParams]);

  // Regular-search map pins — skip when Near-Me mode is active to avoid
  // hitting /providers/map with filters that don't apply anymore.
  const { pins, total: mapTotal, clustered, loading: mapLoading, onBoundsChanged } = useMapProviders({
    specialty: specialtyParam,
    enabled: !isNearbyActive && (viewMode === 'map' || viewMode === 'split'),
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
    setSearchProviders(newProviders);
    setSearchPagination(newPagination);
    setHasSearched(newProviders.length > 0 || newPagination !== null);
    setError(null);
  }, []);

  // Pick the right data source for the list. In Near-Me mode the regular
  // useSearchForm still runs (if a state is present), but we ignore its
  // results; in normal mode we use them.
  const providers = isNearbyActive ? nearbyProviders : searchProviders;
  const pagination = isNearbyActive ? nearbyPagination : searchPagination;
  const listLoading = isNearbyActive ? nearbyQuery.isLoading : isLoading;
  const listHasSearched = isNearbyActive ? true : hasSearched;
  const listError = isNearbyActive
    ? (nearbyQuery.error instanceof Error ? nearbyQuery.error.message : null)
    : error;

  const radiusMiles = Number(radiusParam) || DEFAULT_RADIUS_MILES;

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

        {/* Near-Me toggle sits directly under the search controls — intentionally
            outside SearchForm to keep that component's contract unchanged. */}
        <div className="mb-4 flex justify-start">
          <NearMeButton
            onActivate={activateNearby}
            onClear={clearNearby}
            isActive={isNearbyActive}
            className="w-full sm:w-auto"
          />
        </div>

        {isNearbyActive && (
          <NearbyBanner
            radiusMiles={radiusMiles}
            onRadiusChange={changeRadius}
            onClear={clearNearby}
            resultCount={nearbyQuery.data?.providers.length}
          />
        )}

        <SearchViewLayout
          viewMode={viewMode}
          isLoading={listLoading}
          listContent={
            <SearchResultsList
              providers={providers}
              pagination={pagination}
              hasSearched={listHasSearched}
              error={listError}
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

/**
 * Client-only body of the /search route. Exported as default so the server
 * component wrapper at app/search/page.tsx can mount it underneath
 * `generateMetadata` (which client components can't define). Visual and
 * behavioral contract is identical to before the server/client split.
 */
export default function SearchPageClient() {
  return (
    <Suspense fallback={<SearchResultsSkeleton count={5} />}>
      <SearchPageContent />
    </Suspense>
  );
}
