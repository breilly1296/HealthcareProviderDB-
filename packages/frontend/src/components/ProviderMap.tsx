'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, InfoWindowF } from '@react-google-maps/api';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import Link from 'next/link';
import type { MapPin } from '@/types';
import LoadingSpinner from './LoadingSpinner';

interface ProviderMapProps {
  pins: MapPin[];
  loading?: boolean;
  onBoundsChanged?: (bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  }) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: string;
  clustered?: boolean;
  total?: number;
}

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = 12;
const DEBOUNCE_MS = 300;

const mapOptions: google.maps.MapOptions = {
  streetViewControl: false,
  zoomControl: true,
  mapTypeControl: false,
  fullscreenControl: true,
  styles: [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.medical', stylers: [{ visibility: 'on' }] },
    { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
  ],
};

export default function ProviderMap({
  pins,
  loading = false,
  onBoundsChanged,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  height = '100%',
  clustered = false,
  total = 0,
}: ProviderMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-maps-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  });

  // mapInstance is state (triggers re-render) rather than ref because the
  // clustering effect below depends on it. The callbacks that still need a
  // synchronous handle (onIdle/bounds-changed) use mapInstance directly.
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMapInstance(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMapInstance(null);
  }, []);

  const onIdle = useCallback(() => {
    if (!mapInstance || !onBoundsChanged) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const bounds = mapInstance.getBounds();
      if (!bounds) return;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      onBoundsChanged({
        north: ne.lat(),
        south: sw.lat(),
        east: ne.lng(),
        west: sw.lng(),
      });
    }, DEBOUNCE_MS);
  }, [mapInstance, onBoundsChanged]);

  // Debounce timer cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // --- Marker clustering (IM-42 / I-49) ---
  // Builds imperative google.maps.Marker instances from `pins`, hands them
  // to @googlemaps/markerclusterer, and tears everything down on change.
  // Creating ~500 markers per update is cheap; skipping incremental diffing
  // keeps the code short and avoids stale-marker bugs.
  //
  // Clicking a marker sets `selectedPin` — the <InfoWindowF> below renders
  // declaratively from that state, preserving the previous info-window UX
  // without needing an imperative google.maps.InfoWindow.
  useEffect(() => {
    if (!isLoaded || !mapInstance) return;

    const markers = pins.map((pin) => {
      const marker = new google.maps.Marker({
        position: { lat: pin.latitude, lng: pin.longitude },
        title: pin.displayName,
        // Preserve the "N providers at this address" badge that the old
        // MarkerF rendering put on co-located pins. Clusters handle spatial
        // grouping; the label handles same-address server-side dedup.
        label:
          pin.providerCount > 1
            ? {
                text: String(pin.providerCount),
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 'bold',
              }
            : undefined,
      });

      marker.addListener('click', () => {
        setSelectedPin(pin);
      });

      return marker;
    });

    const clusterer = new MarkerClusterer({ map: mapInstance, markers });

    return () => {
      clusterer.clearMarkers();
      markers.forEach((m) => m.setMap(null));
    };
  }, [isLoaded, mapInstance, pins]);

  if (loadError) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm"
        style={{ width: '100%', height }}
      >
        Failed to load Google Maps. Check your API key configuration.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 dark:bg-gray-800"
        style={{ width: '100%', height }}
      >
        <LoadingSpinner size="lg" text="Loading map..." />
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: '100%', height }}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={zoom}
        options={mapOptions}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onIdle={onIdle}
        onClick={() => setSelectedPin(null)}
      >
        {/* Markers rendered imperatively via MarkerClusterer above —
            no MarkerF children here. */}

        {selectedPin && (
          <InfoWindowF
            position={{
              lat: selectedPin.latitude,
              lng: selectedPin.longitude,
            }}
            onCloseClick={() => setSelectedPin(null)}
          >
            <div className="max-w-[260px] p-1 text-sm text-gray-800">
              <Link
                href={`/provider/${selectedPin.npi}`}
                className="font-semibold text-primary-700 hover:text-primary-900 hover:underline"
              >
                {selectedPin.displayName}
              </Link>

              {selectedPin.specialty && (
                <p className="text-gray-600 mt-0.5">{selectedPin.specialty}</p>
              )}

              <p className="text-gray-500 mt-1 leading-snug">
                {[
                  selectedPin.addressLine1,
                  [selectedPin.city, selectedPin.state]
                    .filter(Boolean)
                    .join(', '),
                  selectedPin.zipCode,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>

              {selectedPin.phone && (
                <p className="text-gray-500 mt-0.5">
                  {selectedPin.phone.replace(
                    /(\d{3})(\d{3})(\d{4})/,
                    '($1) $2-$3'
                  )}
                </p>
              )}

              {selectedPin.providerCount > 1 && (
                <p className="text-primary-600 font-medium mt-1.5">
                  {selectedPin.providerCount} providers at this location
                </p>
              )}
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>

      {/* "Showing X of Y" message — still driven by the server's `clustered`
          flag (which means total > API limit, not actual clustering).
          Kept verbatim per task spec. */}
      {clustered && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow text-xs text-gray-700 dark:text-gray-300">
          Showing {pins.length} of {total.toLocaleString()} providers. Zoom in
          to see more.
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-10 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center">
          <LoadingSpinner size="lg" text="Loading providers..." />
        </div>
      )}

      {/* Empty state */}
      {!loading && pins.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-6 py-4 rounded-lg shadow text-sm text-gray-600 dark:text-gray-400 text-center">
            No providers with map data in this area
          </div>
        </div>
      )}
    </div>
  );
}
