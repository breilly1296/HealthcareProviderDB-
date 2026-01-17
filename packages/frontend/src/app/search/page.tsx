'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchForm } from '@/components/SearchForm';
import { ProviderCard } from '@/components/ProviderCard';
import { LocationCard } from '@/components/LocationCard';
import ProviderCardSkeleton from '@/components/ProviderCardSkeleton';
import ErrorMessage from '@/components/ErrorMessage';
import { providerApi, locationApi, Provider, Location, Pagination } from '@/lib/api';
import { trackSearch } from '@/lib/analytics';

function SearchResults() {
  const searchParams = useSearchParams();
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
      ? (specialty || state || cities || zip || healthSystem || name)
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
  }, [mode, specialty, state, cities, zip, healthSystem, name, locationName, page]);

  return (
    <div>
      {/* Results */}
      {loading ? (
        <div className="space-y-4">
          <ProviderCardSkeleton count={3} />
        </div>
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
        <ErrorMessage
          variant="search"
          title={mode === 'providers' ? 'No Providers Found' : 'No Locations Found'}
          message="Try adjusting your search criteria or expanding your location."
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
                          page: String(p),
                        }).toString()}`}
                        className={`px-4 py-2 rounded-lg font-medium ${
                          p === pagination.page
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
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium mb-2">Search for Providers</p>
          <p className="text-gray-600">
            Use the form above to find healthcare providers in your area.
          </p>
        </div>
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
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Find Healthcare Providers
          </h1>
          <p className="text-xl text-gray-600">
            Search for providers by specialty, location, and more.
          </p>
        </div>

        {/* Search Form */}
        <div className="card mb-8">
          <Suspense fallback={<div className="animate-pulse h-40 bg-gray-100 rounded" />}>
            <SearchForm />
          </Suspense>
        </div>

        {/* Results */}
        <Suspense fallback={
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600 mx-auto" />
          </div>
        }>
          <SearchResults />
        </Suspense>
      </div>
    </div>
  );
}
