'use client';

import { useState, useEffect } from 'react';

interface GeoState {
  state: string | null;
  city: string | null;
  loading: boolean;
  error: string | null;
}

const CACHE_KEY = 'vmp-geo-state';

/**
 * Attempts to detect user's state via IP geolocation.
 * Falls back gracefully — never blocks the UI.
 * Results cached in sessionStorage for instant subsequent loads.
 */
export function useGeoLocation() {
  const [geo, setGeo] = useState<GeoState>({
    state: null,
    city: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Check sessionStorage cache first
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setGeo({ state: parsed.state, city: parsed.city, loading: false, error: null });
        return;
      } catch {
        // Ignore bad cache
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    fetch('https://ipapi.co/json/', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (data.region_code && data.country_code === 'US') {
          const result = { state: data.region_code, city: data.city || null };
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
          setGeo({ ...result, loading: false, error: null });
        } else {
          setGeo({ state: null, city: null, loading: false, error: 'Not in US' });
        }
      })
      .catch(() => {
        setGeo({ state: null, city: null, loading: false, error: 'Failed to detect' });
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  return geo;
}
