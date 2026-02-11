'use client';

import dynamic from 'next/dynamic';
import type { MapPin, MapBounds } from '@/types';

const ProviderMap = dynamic(() => import('@/components/ProviderMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
      <span className="text-gray-500">Loading map...</span>
    </div>
  ),
});

interface SearchMapViewProps {
  pins: MapPin[];
  total: number;
  clustered: boolean;
  loading: boolean;
  onBoundsChanged: (bounds: MapBounds) => void;
}

export function SearchMapView({ pins, total, clustered, loading, onBoundsChanged }: SearchMapViewProps) {
  return (
    <div className="h-[calc(100vh-200px)] min-h-[500px] rounded-lg overflow-hidden">
      <ProviderMap
        pins={pins}
        loading={loading}
        onBoundsChanged={onBoundsChanged}
        clustered={clustered}
        total={total}
      />
    </div>
  );
}
