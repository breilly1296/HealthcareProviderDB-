'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchForm } from '@/components/SearchForm';
import { ProviderCard } from '@/components/ProviderCard';
import { providerApi, Provider, Pagination } from '@/lib/api';

function SearchResults() {
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<(Provider & { displayName: string })[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const specialty = searchParams.get('specialty') || '';
  const state = searchParams.get('state') || '';
  const city = searchParams.get('city') || '';
  const zip = searchParams.get('zip') || '';
  const name = searchParams.get('name') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);

  useEffect(() => {
    const hasFilters = specialty || state || city || zip || name;

    if (!hasFilters) {
      setProviders([]);
      setPagination(null);
      setHasSearched(false);
      return;
    }

    const fetchProviders = async () => {
      setLoading(true);
      setError('');
      setHasSearched(true);

      try {
        const result = await providerApi.search({
          specialty: specialty || undefined,
          state: state || undefined,
          city: city || undefined,
          zip: zip || undefined,
          name: name || undefined,
          page,
          limit: 20,
        });

        setProviders(result.providers);
        setPagination(result.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to search providers');
        setProviders([]);
        setPagination(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProviders();
  }, [specialty, state, city, zip, name, page]);

  return (
    <div>
      {/* Results */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Searching providers...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium mb-2">Search Error</p>
          <p className="text-gray-600">{error}</p>
        </div>
      ) : hasSearched && providers.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium mb-2">No Providers Found</p>
          <p className="text-gray-600">
            Try adjusting your search criteria or expanding your location.
          </p>
        </div>
      ) : hasSearched ? (
        <>
          {/* Results count */}
          <div className="mb-6">
            <p className="text-gray-600">
              Found <strong className="text-gray-900">{pagination?.total || 0}</strong> providers
              {state && ` in ${state}`}
              {city && ` near ${city}`}
            </p>
          </div>

          {/* Provider list */}
          <div className="space-y-4">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
              />
            ))}
          </div>

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
                          ...(specialty && { specialty }),
                          ...(state && { state }),
                          ...(city && { city }),
                          ...(zip && { zip }),
                          ...(name && { name }),
                          page: String(p),
                        }).toString()}`}
                        className={`px-4 py-2 rounded-lg font-medium ${
                          p === pagination.page
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
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
