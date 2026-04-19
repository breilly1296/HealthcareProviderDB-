'use client';

import { useState, useEffect, useCallback } from 'react';

interface GeoState {
  // IP-based inference (cheap, cached, no permission prompt).
  state: string | null;
  city: string | null;

  // Browser geolocation (precise, requires user permission).
  latitude: number | null;
  longitude: number | null;
  gpsAvailable: boolean;
  gpsPermission: PermissionState | null;

  // Status — loading reflects the IP lookup that runs on mount; GPS status
  // is derivable from gpsPermission + (latitude === null).
  loading: boolean;
  error: string | null;

  // Caller-triggered: prompts for permission (if needed) and fetches position.
  requestGpsLocation: () => void;
}

const CACHE_KEY = 'vmp-geo-state';

/**
 * Dual-source geolocation:
 *   - IP-based state/city inference runs automatically on mount (as before).
 *   - Browser GPS (lat/lng) is opt-in via `requestGpsLocation()` so the
 *     permission prompt only appears after a user gesture (e.g. "Near Me"
 *     button click). If permission was previously granted, GPS is fetched
 *     silently on mount — no prompt, just instant coords.
 *
 * SSR-safe: all browser APIs (navigator, sessionStorage) are guarded via
 * `typeof window !== 'undefined'` and accessed only inside useEffect.
 *
 * IM-41 / I-46.
 */
export function useGeoLocation(): GeoState {
  const [state, setState] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsAvailable, setGpsAvailable] = useState(false);
  const [gpsPermission, setGpsPermission] = useState<PermissionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- IP lookup (preserved exactly from the previous implementation) ---
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setState(parsed.state ?? null);
        setCity(parsed.city ?? null);
        setLoading(false);
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
          setState(result.state);
          setCity(result.city);
          setError(null);
        } else {
          setError('Not in US');
        }
      })
      .catch(() => {
        setError('Failed to detect');
      })
      .finally(() => {
        setLoading(false);
        clearTimeout(timeout);
      });

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  // --- GPS availability + permission check (no prompt unless already granted) ---
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      return;
    }
    setGpsAvailable(true);

    // navigator.permissions is missing in older Safari; when absent we leave
    // gpsPermission at null and wait for requestGpsLocation() to trigger a
    // prompt naturally via getCurrentPosition.
    if (!navigator.permissions?.query) {
      return;
    }

    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then(status => {
        if (cancelled) return;
        setGpsPermission(status.state);

        // Already granted → fetch silently (no prompt shown).
        if (status.state === 'granted') {
          navigator.geolocation.getCurrentPosition(
            position => {
              if (cancelled) return;
              setLatitude(position.coords.latitude);
              setLongitude(position.coords.longitude);
            },
            () => {
              // Silent failure — caller can retry via requestGpsLocation.
            },
            { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
          );
        }

        // Keep state in sync if the user later changes permission via
        // browser UI while the page stays mounted.
        status.onchange = () => {
          if (!cancelled) setGpsPermission(status.state);
        };
      })
      .catch(() => {
        // Permissions API rejected — proceed without precise status.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Caller-triggered GPS fetch (may prompt) ---
  const requestGpsLocation = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setError('Geolocation not supported by this browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setGpsPermission('granted');
        setError(null);
      },
      err => {
        // err.code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        if (err.code === err.PERMISSION_DENIED) {
          setGpsPermission('denied');
          setError('Location permission denied');
        } else {
          setError(err.message || 'Failed to get GPS location');
        }
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );
  }, []);

  return {
    state,
    city,
    latitude,
    longitude,
    gpsAvailable,
    gpsPermission,
    loading,
    error,
    requestGpsLocation,
  };
}
