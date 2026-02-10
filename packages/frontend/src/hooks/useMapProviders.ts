import { useState, useCallback, useRef } from 'react';
import { providerApi } from '@/lib/api';
import type { MapPin, MapBounds } from '@/types';

interface UseMapProvidersOptions {
  specialty?: string;
  specialtyCategory?: string;
  entityType?: string;
  limit?: number;
  enabled?: boolean;
}

interface UseMapProvidersReturn {
  pins: MapPin[];
  total: number;
  clustered: boolean;
  loading: boolean;
  error: string | null;
  onBoundsChanged: (bounds: MapBounds) => void;
}

export function useMapProviders(options: UseMapProvidersOptions = {}): UseMapProvidersReturn {
  const { specialty, specialtyCategory, entityType, limit = 200, enabled = true } = options;

  const [pins, setPins] = useState<MapPin[]>([]);
  const [total, setTotal] = useState(0);
  const [clustered, setClustered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Abort controller for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  const onBoundsChanged = useCallback(async (bounds: MapBounds) => {
    if (!enabled) return;

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await providerApi.getMapPins({
        north: bounds.north,
        south: bounds.south,
        east: bounds.east,
        west: bounds.west,
        specialty,
        specialtyCategory,
        entityType,
        limit,
      });

      setPins(result.pins);
      setTotal(result.total);
      setClustered(result.clustered);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load map data');
    } finally {
      setLoading(false);
    }
  }, [enabled, specialty, specialtyCategory, entityType, limit]);

  return { pins, total, clustered, loading, error, onBoundsChanged };
}
