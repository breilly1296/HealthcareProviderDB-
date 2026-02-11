'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { locationApi } from '@/lib/api';
import { Building2, Users, MapPin } from 'lucide-react';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import type { ProviderDisplay, Location, PaginationState } from '@/types';
import { ProviderCard } from '@/components/ProviderCard';
import { LocationDetailSkeleton } from '@/components/ProviderCardSkeleton';
import ErrorMessage from '@/components/ErrorMessage';

const SPECIALTIES = [
  { value: '', label: 'All Specialties' },
  { value: 'CARDIOLOGY', label: 'Cardiology' },
  { value: 'DENTISTRY', label: 'Dentistry' },
  { value: 'DERMATOLOGY', label: 'Dermatology' },
  { value: 'ENDOCRINOLOGY', label: 'Endocrinology' },
  { value: 'FAMILY_MEDICINE', label: 'Family Medicine' },
  { value: 'GASTROENTEROLOGY', label: 'Gastroenterology' },
  { value: 'INTERNAL_MEDICINE', label: 'Internal Medicine' },
  { value: 'MENTAL_HEALTH', label: 'Mental Health' },
  { value: 'NEUROLOGY', label: 'Neurology' },
  { value: 'OB_GYN', label: 'OB/GYN' },
  { value: 'ONCOLOGY', label: 'Oncology' },
  { value: 'ORTHOPEDICS', label: 'Orthopedics' },
  { value: 'PEDIATRICS', label: 'Pediatrics' },
  { value: 'PSYCHIATRY', label: 'Psychiatry' },
  { value: 'SURGERY', label: 'Surgery' },
  { value: 'OTHER', label: 'Other' },
];

export default function LocationDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locationId = parseInt(params.locationId as string, 10);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const specialtyFilter = searchParams.get('specialty') || '';

  const [location, setLocation] = useState<Location | null>(null);
  const [providers, setProviders] = useState<ProviderDisplay[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; type: 'network' | 'server' | 'not-found' } | null>(null);

  const fetchLocationDetails = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await locationApi.getProviders(locationId, {
        page,
        limit: DEFAULT_PAGE_SIZE,
      });

      setLocation(result.location);
      setProviders(result.providers);
      setPagination(result.pagination);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load location';
      const isNetworkError = errorMessage.toLowerCase().includes('network') ||
                            errorMessage.toLowerCase().includes('fetch') ||
                            errorMessage.toLowerCase().includes('connection');
      const isNotFound = errorMessage.toLowerCase().includes('not found') ||
                        errorMessage.toLowerCase().includes('404');

      setError({
        message: errorMessage,
        type: isNotFound ? 'not-found' : isNetworkError ? 'network' : 'server'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (locationId) {
      fetchLocationDetails();
    }
  }, [locationId, page]);

  // Filter providers by specialty on client side
  const filteredProviders = specialtyFilter
    ? providers.filter((p) =>
        p.specialtyCategory?.toLowerCase() === specialtyFilter.toLowerCase() ||
        p.taxonomyDescription?.toLowerCase().includes(specialtyFilter.toLowerCase())
      )
    : providers;

  if (loading) {
    return <LocationDetailSkeleton />;
  }

  if (error || !location) {
    return (
      <div className="py-12">
        <div className="container-wide">
          <ErrorMessage
            variant={error?.type || 'not-found'}
            message={error?.message || 'The location you are looking for does not exist.'}
            action={
              error?.type === 'network' || error?.type === 'server'
                ? { label: 'Try Again', onClick: fetchLocationDetails }
                : undefined
            }
          >
            <Link href="/search?mode=locations" className="btn-primary">
              Back to Location Search
            </Link>
          </ErrorMessage>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <li>
              <Link href="/" className="hover:text-primary-600 dark:hover:text-primary-400">Home</Link>
            </li>
            <li>/</li>
            <li>
              <Link href="/search?mode=locations" className="hover:text-primary-600 dark:hover:text-primary-400">Locations</Link>
            </li>
            <li>/</li>
            <li className="text-gray-900 dark:text-white font-medium truncate max-w-[200px]">
              {location.name || location.addressLine1}
            </li>
          </ol>
        </nav>

        {/* Location Header */}
        <div className="card mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-primary-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
                {location.name || location.addressLine1}
              </h1>
              {location.healthSystem && (
                <p className="text-lg text-primary-600 mb-2 font-medium">{location.healthSystem}</p>
              )}
              {location.facilityType && (
                <p className="text-sm text-gray-500 mb-2 uppercase tracking-wide">{location.facilityType}</p>
              )}
              {location.name && (
                <p className="text-lg text-gray-700 mb-2 font-medium">{location.addressLine1}</p>
              )}
              {location.addressLine2 && (
                <p className="text-lg text-gray-700 mb-2">{location.addressLine2}</p>
              )}
              <p className="text-lg text-gray-600 mb-4">
                {location.city}, {location.state} {location.zipCode}
              </p>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-primary-600 font-medium">
                  <Users className="w-5 h-5" />
                  <span>
                    {location.providerCount} provider{location.providerCount !== 1 ? 's' : ''}
                  </span>
                </div>

                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(`${location.addressLine1}${location.addressLine2 ? ' ' + location.addressLine2 : ''}, ${location.city}, ${location.state} ${location.zipCode}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                >
                  <MapPin className="w-5 h-5" />
                  View on Google Maps
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Specialty Filter */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-gray-900">
            Providers at This Location
          </h2>
          <div className="flex items-center gap-3">
            <label htmlFor="specialty-filter" className="text-sm font-medium text-gray-700">
              Filter by Specialty:
            </label>
            <select
              id="specialty-filter"
              value={specialtyFilter}
              onChange={(e) => {
                const newParams = new URLSearchParams();
                if (e.target.value) newParams.set('specialty', e.target.value);
                router.push(`/location/${locationId}?${newParams.toString()}`);
              }}
              className="input w-auto"
            >
              {SPECIALTIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Providers List */}
        {filteredProviders.length > 0 ? (
          <>
            <div className="space-y-4">
              {filteredProviders.map((provider) => (
                <ProviderCard
                  key={provider.npi}
                  provider={provider}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && !specialtyFilter && (
              <div className="mt-8 flex justify-center gap-2">
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    return (
                      p === 1 ||
                      p === pagination.totalPages ||
                      Math.abs(p - pagination.page) <= 2
                    );
                  })
                  .map((p, idx, arr) => {
                    const prevPage = arr[idx - 1];
                    const showEllipsisBefore = idx > 0 && prevPage !== undefined && p - prevPage > 1;

                    return (
                      <div key={p} className="flex items-center gap-2">
                        {showEllipsisBefore && (
                          <span className="px-2 text-gray-400">...</span>
                        )}
                        <Link
                          href={`/location/${locationId}?page=${p}`}
                          className={`px-4 py-2 rounded-lg font-medium ${
                            p === pagination.page
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {p}
                        </Link>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        ) : (
          <div className="card text-center py-12">
            <p className="text-gray-600">
              {specialtyFilter
                ? `No providers found with specialty "${SPECIALTIES.find(s => s.value === specialtyFilter)?.label || specialtyFilter}".`
                : 'No providers found at this location.'}
            </p>
            {specialtyFilter && (
              <Link
                href={`/location/${locationId}`}
                className="btn-secondary mt-4 inline-block"
              >
                Clear Filter
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
