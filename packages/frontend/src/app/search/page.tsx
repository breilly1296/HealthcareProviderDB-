'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SearchForm } from '@/components/SearchForm';
import { ProviderCard } from '@/components/ProviderCard';
import { LocationCard } from '@/components/LocationCard';
import { SearchResultsSkeleton } from '@/components/ProviderCardSkeleton';
import ErrorMessage from '@/components/ErrorMessage';
import { EmptyState, SearchSuggestion } from '@/components/EmptyState';
import { SaveProfileButton } from '@/components/SaveProfileButton';
import { providerApi, locationApi, Provider, Location, Pagination } from '@/lib/api';
import { trackSearch } from '@/lib/analytics';

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [providers, setProviders] = useState<(Provider & { displayName: string })[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; type: 'network' | 'server' } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const mode = (searchParams.get('mode') as 'providers' | 'locations') || 'providers';
  const specialty = searchParams.get('specialty') || '';
  const state = searchParams.get('state') || '';
  const cities = searchParams.get('cities') || '';
  const zip = searchParams.get('zip') || '';
  const healthSystem = searchParams.get('healthSystem') || '';
  const name = searchParams.get('name') || '';
  const locationName = searchParams.get('locationName') || '';
  const insurancePlanId = searchParams.get('insurancePlanId') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const fetchProviders = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const result = await providerApi.search({
        specialty: specialty || undefined,
        state: state || undefined,
        cities: cities || undefined,
        zip: zip || undefined,
        healthSystem: healthSystem || undefined,
        name: name || undefined,
        insurancePlanId: insurancePlanId || undefined,
        page,
        limit: 20,
      });

      setProviders(result.providers);
      setLocations([]);
      setPagination(result.pagination);

      // Track search event
      trackSearch({
        specialty: specialty || undefined,
        state: state || undefined,
        cities: cities || undefined,
        healthSystem: healthSystem || undefined,
        resultsCount: result.pagination.total,
        mode: 'providers',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search providers';
      const isNetworkError = errorMessage.toLowerCase().includes('network') ||
        errorMessage.toLowerCase().includes('fetch') ||
        errorMessage.toLowerCase().includes('connection');

      setError({
        message: errorMessage,
        type: isNetworkError ? 'network' : 'server'
      });
      setProviders([]);
      setLocations([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const result = await locationApi.search({
        search: locationName || undefined,
        state: state || undefined,
        cities: cities || undefined,
        zipCode: zip || undefined,
        healthSystem: healthSystem || undefined,
        page,
        limit: 20,
      });

      setLocations(result.locations);
      setProviders([]);
      setPagination(result.pagination);

      // Track search event
      trackSearch({
        state: state || undefined,
        cities: cities || undefined,
        healthSystem: healthSystem || undefined,
        resultsCount: result.pagination.total,
        mode: 'locations',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search locations';
      const isNetworkError = errorMessage.toLowerCase().includes('network') ||
        errorMessage.toLowerCase().includes('fetch') ||
        errorMessage.toLowerCase().includes('connection');

      setError({
        message: errorMessage,
        type: isNetworkError ? 'network' : 'server'
      });
      setLocations([]);
      setProviders([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasFilters = mode === 'providers'
      ? (specialty || state || cities || zip || healthSystem || name || insurancePlanId)
      : (locationName || state || cities || zip || healthSystem);

    if (!hasFilters) {
      setProviders([]);
      setLocations([]);
      setPagination(null);
      setHasSearched(false);
      setError(null);
      return;
    }

    if (mode === 'providers') {
      fetchProviders();
    } else {
      fetchLocations();
    }
  }, [mode, specialty, state, cities, zip, healthSystem, name, locationName, insurancePlanId, page]);

  // Auto-save current URL to localStorage
  useEffect(() => {
    const hasFilters = mode === 'providers'
      ? (specialty || state || cities || zip || healthSystem || name || insurancePlanId)
      : (locationName || state || cities || zip || healthSystem);

    if (hasFilters) {
      const currentUrl = window.location.href;
      localStorage.setItem('vmp_last_profile', currentUrl);
    }
  }, [mode, specialty, state, cities, zip, healthSystem, name, locationName, insurancePlanId, page]);

  // Generate suggestions based on current search
  const getNoResultsSuggestions = useCallback((): SearchSuggestion[] => {
    const suggestions: SearchSuggestion[] = [];

    if (specialty) {
      suggestions.push({
        label: 'Search all specialties',
        action: 'clear-specialty',
      });
    }

    if (cities) {
      suggestions.push({
        label: 'Search entire state',
        action: 'clear-cities',
      });
    }

    if (healthSystem) {
      suggestions.push({
        label: 'All health systems',
        action: 'clear-health-system',
      });
    }

    if (insurancePlanId) {
      suggestions.push({
        label: 'All insurance plans',
        action: 'clear-insurance',
      });
    }

    return suggestions.slice(0, 3); // Max 3 suggestions
  }, [specialty, cities, healthSystem, insurancePlanId]);

  // Handle suggestion clicks
  const handleSuggestionClick = useCallback((action: string) => {
    const params = new URLSearchParams();
    params.set('mode', mode);

    // Keep existing params except the one being cleared
    if (state && action !== 'clear-state') params.set('state', state);
    if (cities && action !== 'clear-cities') params.set('cities', cities);
    if (zip && action !== 'clear-zip') params.set('zip', zip);
    if (healthSystem && action !== 'clear-health-system') params.set('healthSystem', healthSystem);

    if (mode === 'providers') {
      if (specialty && action !== 'clear-specialty') params.set('specialty', specialty);
      if (name && action !== 'clear-name') params.set('name', name);
      if (insurancePlanId && action !== 'clear-insurance') params.set('insurancePlanId', insurancePlanId);
    } else {
      if (locationName && action !== 'clear-location-name') params.set('locationName', locationName);
    }

    router.push(`/search?${params.toString()}`);
  }, [mode, state, cities, zip, healthSystem, specialty, name, insurancePlanId, locationName, router]);

  return (
    <div aria-live="polite" aria-busy={loading}>
      {/* Results */}
      {loading ? (
        <SearchResultsSkeleton count={5} />
      ) : error ? (
        <ErrorMessage
          variant={error.type}
          message={error.message}
          action={{
            label: 'Try Again',
            onClick: mode === 'providers' ? fetchProviders : fetchLocations
          }}
        />
      ) : hasSearched && providers.length === 0 && locations.length === 0 ? (
        <EmptyState
          type={mode === 'providers' ? 'no-results' : 'no-results-locations'}
          suggestions={getNoResultsSuggestions()}
          onSuggestionClick={handleSuggestionClick}
        />
      ) : hasSearched ? (
        <>
          {/* Results count */}
          <div className="mb-4">
            <p className="text-gray-600">
              Found <strong className="text-gray-900">{pagination?.total || 0}</strong> {mode === 'providers' ? 'providers' : 'locations'}
              {state && ` in ${state}`}
              {cities && ` in ${cities.split(',').join(', ')}`}
            </p>
          </div>

          {/* Disclaimer banner */}
          <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Provider information is crowdsourced and may not be current. Always verify insurance acceptance directly with the provider's office before scheduling.
            </p>
          </div>

          {/* Provider list */}
          {mode === 'providers' && (
            <div className="space-y-4">
              {providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                />
              ))}
            </div>
          )}

          {/* Location list */}
          {mode === 'locations' && (
            <div className="space-y-4">
              {locations.map((location) => (
                <LocationCard
                  key={location.id}
                  location={location}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-8 flex justify-center gap-2">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  // Show first, last, current, and adjacent pages
                  return (
                    p === 1 ||
                    p === pagination.totalPages ||
                    Math.abs(p - pagination.page) <= 2
                  );
                })
                .map((p, idx, arr) => {
                  // Add ellipsis
                  const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;

                  return (
                    <div key={p} className="flex items-center gap-2">
                      {showEllipsisBefore && (
                        <span className="px-2 text-gray-400">...</span>
                      )}
                      <a
                        href={`/search?${new URLSearchParams({
                          mode,
                          ...(specialty && { specialty }),
                          ...(state && { state }),
                          ...(cities && { cities }),
                          ...(zip && { zip }),
                          ...(healthSystem && { healthSystem }),
                          ...(name && { name }),
                          ...(locationName && { locationName }),
                          ...(insurancePlanId && { insurancePlanId }),
                          page: String(p),
                        }).toString()}`}
                        className={`min-w-[44px] min-h-[44px] px-4 py-3 rounded-lg font-medium flex items-center justify-center ${p === pagination.page
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
        </>
      ) : (
        <EmptyState type="landing" />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                Find Healthcare Providers
              </h1>
              <p className="text-xl text-gray-600">
                Search for providers by specialty, location, and more.
              </p>
            </div>
            <Suspense fallback={null}>
              <SaveProfileButton />
            </Suspense>
          </div>
        </div>

        {/* Search Form */}
        <div className="card mb-8">
          <Suspense fallback={<div className="animate-pulse h-40 bg-gray-100 rounded" />}>
            <SearchForm />
          </Suspense>
        </div>

        {/* Results */}
        <Suspense fallback={<SearchResultsSkeleton count={5} />}>
          <SearchResults />
        </Suspense>
      </div>
    </div>
  );
}
