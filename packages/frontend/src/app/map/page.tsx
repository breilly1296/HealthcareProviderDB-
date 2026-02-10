'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMapProviders } from '@/hooks/useMapProviders';
import { MapPin, ArrowLeft, Filter } from 'lucide-react';

const ProviderMap = dynamic(() => import('@/components/ProviderMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
  ),
});

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = 12;

export default function MapPage() {
  const searchParams = useSearchParams();

  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const zoomParam = searchParams.get('zoom');
  const specialty = searchParams.get('specialty') || undefined;

  const initialCenter = lat && lng
    ? { lat: parseFloat(lat), lng: parseFloat(lng) }
    : DEFAULT_CENTER;
  const initialZoom = zoomParam ? parseInt(zoomParam, 10) : DEFAULT_ZOOM;

  const {
    pins,
    total,
    clustered,
    loading,
    onBoundsChanged,
  } = useMapProviders({ specialty, limit: 300 });

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <Link
            href="/search"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Search
          </Link>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary-600" />
            Browse Providers
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {specialty && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm rounded-full">
              <Filter className="w-3.5 h-3.5" />
              {specialty}
            </span>
          )}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {total.toLocaleString()} providers in view
          </span>
        </div>
      </div>

      {/* Map fills remaining space */}
      <div className="flex-1">
        <ProviderMap
          pins={pins}
          loading={loading}
          onBoundsChanged={onBoundsChanged}
          clustered={clustered}
          total={total}
          center={initialCenter}
          zoom={initialZoom}
        />
      </div>
    </div>
  );
}
