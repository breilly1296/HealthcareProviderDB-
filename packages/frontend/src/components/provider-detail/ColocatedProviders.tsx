'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { providerApi } from '@/lib/api';
import type { ProviderDisplay, Location } from '@/types';

interface ColocatedProvidersProps {
  npi: string;
}

export function ColocatedProviders({ npi }: ColocatedProvidersProps) {
  const [colocatedProviders, setColocatedProviders] = useState<ProviderDisplay[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [colocatedTotal, setColocatedTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const fetchColocatedProviders = async () => {
    if (fetched) return;
    setLoading(true);
    setError(null);
    try {
      const result = await providerApi.getColocated(npi, { limit: 10 });
      setColocatedProviders(result.providers);
      setLocation(result.location);
      setColocatedTotal(result.pagination.total);
      setFetched(true);
    } catch (err) {
      console.error('Failed to load colocated providers:', err);
      setError('Unable to load other providers at this location');
    } finally {
      setLoading(false);
    }
  };

  // Lazy load when section scrolls into view
  useEffect(() => {
    if (!sectionRef.current || fetched) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fetched) {
          fetchColocatedProviders();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, [npi, fetched]);

  return (
    <div ref={sectionRef}>
      {/* Loading state */}
      {(loading || (!fetched && !error)) && (
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Other Providers at This Location
          </h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2"></div>
                <div className="h-4 bg-gray-100 dark:bg-gray-600 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Other Providers at This Location
          </h2>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">{error}</p>
                <button
                  onClick={() => { setFetched(false); fetchColocatedProviders(); }}
                  className="text-sm font-medium text-yellow-700 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-300 mt-2"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zero colocated providers */}
      {!loading && !error && fetched && colocatedTotal === 0 && (
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Other Providers at This Location
          </h2>
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
            <svg className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-600 dark:text-gray-300 font-medium">
              This is the only provider at this location
            </p>
          </div>
        </div>
      )}

      {/* Colocated providers list */}
      {!loading && !error && fetched && colocatedTotal !== null && colocatedTotal > 0 && location && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Other Providers at This Location
            </h2>
            {colocatedTotal > 10 && (
              <Link
                href={`/search?city=${encodeURIComponent(location.city)}&state=${location.state}&zipCode=${location.zipCode.substring(0, 5)}`}
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
              >
                View all {colocatedTotal}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>

          {/* Location Info */}
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-start gap-2">
            <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {location.name && (
                <p className="font-semibold text-base text-gray-900 dark:text-white mb-1">{location.name}</p>
              )}
              {location.healthSystem && (
                <p className="text-primary-600 dark:text-primary-400 mb-1">{location.healthSystem}</p>
              )}
              <p className="font-medium">{location.addressLine1}</p>
              {location.addressLine2 && <p>{location.addressLine2}</p>}
              <p>{location.city}, {location.state} {location.zipCode}</p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {colocatedTotal + 1} provider{colocatedTotal + 1 !== 1 ? 's' : ''} at this {location.facilityType ? location.facilityType.toLowerCase() : 'address'}
              </p>
            </div>
          </div>

          {/* Provider List */}
          <div className="space-y-3">
            {colocatedProviders.slice(0, 10).map((colProvider) => (
              <Link
                key={colProvider.npi}
                href={`/provider/${colProvider.npi}`}
                className="block p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/30 dark:hover:bg-primary-900/20 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
                      {colProvider.displayName}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {colProvider.taxonomyDescription || colProvider.specialtyCategory || 'Healthcare Provider'}
                    </p>
                    {colProvider.phone && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {colProvider.phone}
                      </p>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>

          {colocatedTotal > 10 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-center">
              <Link
                href={`/search?city=${encodeURIComponent(location.city)}&state=${location.state}&zipCode=${location.zipCode.substring(0, 5)}`}
                className="btn-secondary"
              >
                View all {colocatedTotal} providers at this location
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
