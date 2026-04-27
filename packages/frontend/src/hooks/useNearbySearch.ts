'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// Mirrors the backend `findNearbyProviders` params (packages/backend/src/
// services/providerService.ts). `radius` defaults to 10 server-side but we
// pass it explicitly so the React Query cache key differs between radii.
export interface NearbySearchParams {
  lat: number;
  lng: number;
  radius?: number;
  specialty?: string;
  specialtyCategory?: string;
  name?: string;
  entityType?: string;
  page?: number;
  limit?: number;
}

/**
 * React Query wrapper around GET /api/v1/providers/nearby (F-16).
 *
 * `params` is nullable on purpose — pass `null` when the user hasn't
 * granted GPS or hasn't activated Near-Me mode. `enabled: !!params`
 * keeps React Query from firing before we have coordinates. The query
 * key includes every param so switching radius / specialty / page
 * produces distinct cache entries.
 *
 * staleTime 5 min matches the backend's 5-min cache on the same endpoint
 * (utils/cache.ts `CACHE_TTL.DEFAULT`) — no point refetching sooner than
 * the server will re-derive fresh data anyway.
 */
export function useNearbySearch(params: NearbySearchParams | null) {
  return useQuery({
    queryKey: ['providers', 'nearby', params],
    queryFn: () => api.providers.nearby(params!),
    enabled: params !== null,
    staleTime: 5 * 60 * 1000,
  });
}
