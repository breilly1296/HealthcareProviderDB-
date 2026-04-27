'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';
import { useGeoLocation } from '@/hooks/useGeoLocation';

interface NearMeButtonProps {
  /** Called with GPS coords once the browser resolves them. */
  onActivate: (lat: number, lng: number) => void;
  /** Called when the user clears Near-Me mode. */
  onClear: () => void;
  /** True when the parent is currently showing nearby results. */
  isActive: boolean;
  className?: string;
}

// Four visible states for the button, each with its own copy + affordance.
// Kept in one file so the state machine is obvious at a glance.
type ButtonState = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable';

/**
 * "Near Me" proximity-search toggle. Opt-in GPS — never auto-prompts.
 *
 * Flow:
 *   1. User clicks → call requestGpsLocation() from useGeoLocation.
 *   2. Browser prompt appears (first use) or resolves silently (cached grant).
 *   3. When lat/lng materialize, call onActivate(lat, lng) exactly once per
 *      request (ref-guard against re-fires from useGeoLocation's state).
 *   4. Active state shows a filled chip + X to clear.
 *
 * Hides entirely on servers and on devices without navigator.geolocation —
 * `gpsAvailable` is false there and the button would just confuse the user.
 *
 * SSR-safe: the underlying hook guards all navigator access via
 * `typeof window !== 'undefined'`. We render on every environment but
 * useEffect handles the click side-effects only after mount.
 */
export function NearMeButton({ onActivate, onClear, isActive, className = '' }: NearMeButtonProps) {
  const { latitude, longitude, gpsAvailable, gpsPermission, requestGpsLocation, error } = useGeoLocation();
  const [awaitingGps, setAwaitingGps] = useState(false);
  // Track the last coords we forwarded so a re-render of useGeoLocation
  // doesn't re-fire onActivate and push duplicate URL updates.
  const lastForwarded = useRef<{ lat: number; lng: number } | null>(null);

  // Fire onActivate() when GPS delivers new coords after a click.
  useEffect(() => {
    if (!awaitingGps) return;
    if (latitude === null || longitude === null) return;

    const already = lastForwarded.current;
    if (already && already.lat === latitude && already.lng === longitude) return;

    lastForwarded.current = { lat: latitude, lng: longitude };
    setAwaitingGps(false);
    onActivate(latitude, longitude);
  }, [awaitingGps, latitude, longitude, onActivate]);

  // If permission flips to 'denied' after a click, stop waiting.
  useEffect(() => {
    if (gpsPermission === 'denied' && awaitingGps) {
      setAwaitingGps(false);
    }
  }, [gpsPermission, awaitingGps]);

  // Don't render at all on devices without GPS support — keeps the UI
  // clean for non-mobile scenarios where the button would always be dead.
  if (!gpsAvailable) return null;

  const buttonState: ButtonState = (() => {
    if (awaitingGps) return 'locating';
    if (isActive) return 'active';
    if (gpsPermission === 'denied') return 'denied';
    return 'idle';
  })();

  const handleClick = () => {
    if (isActive) {
      // Toggle off — clear coords + forwarded ref so a subsequent click
      // re-fires with a fresh lat/lng even if the hook hasn't changed.
      lastForwarded.current = null;
      onClear();
      return;
    }
    if (buttonState === 'denied') {
      // Clicking a denied button doesn't re-prompt (browser policy). The
      // copy below tells the user to change it in browser settings, so
      // all the button does here is re-request so Safari etc. can show
      // their native permission refresh prompt if available.
      requestGpsLocation();
      return;
    }
    setAwaitingGps(true);
    requestGpsLocation();
  };

  const baseClasses =
    'inline-flex items-center gap-2 px-4 h-[42px] text-sm font-medium rounded-lg transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900';

  const stateClasses: Record<ButtonState, string> = {
    idle: 'bg-white dark:bg-gray-800 border-stone-300 dark:border-gray-600 text-stone-700 dark:text-gray-200 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400',
    locating: 'bg-white dark:bg-gray-800 border-primary-500 text-primary-600 dark:text-primary-400 cursor-wait',
    active: 'bg-primary-600 dark:bg-primary-500 border-primary-600 dark:border-primary-500 text-white hover:bg-primary-700 dark:hover:bg-primary-600',
    denied: 'bg-white dark:bg-gray-800 border-red-300 dark:border-red-800 text-red-600 dark:text-red-400',
    unavailable: 'hidden',
  };

  const label: Record<ButtonState, React.ReactNode> = {
    idle: (
      <>
        <MapPin className="w-4 h-4" aria-hidden="true" />
        Near Me
      </>
    ),
    locating: (
      <>
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Locating…
      </>
    ),
    active: (
      <>
        <MapPin className="w-4 h-4" aria-hidden="true" />
        Using your location
        <X className="w-3.5 h-3.5 ml-1 opacity-80" aria-hidden="true" />
      </>
    ),
    denied: (
      <>
        <MapPin className="w-4 h-4" aria-hidden="true" />
        Location denied
      </>
    ),
    unavailable: null,
  };

  // aria-label adds the tooltip-equivalent context that SR users would miss
  // from the tiny visible X. aria-pressed exposes the active/inactive state
  // of the toggle — a user hitting Tab knows immediately whether they're
  // currently in Near-Me mode.
  const ariaLabel =
    buttonState === 'active' ? 'Clear Near Me filter'
    : buttonState === 'denied' ? 'Location permission denied. Enable in browser settings.'
    : buttonState === 'locating' ? 'Getting your location'
    : 'Find providers near me';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={buttonState === 'locating'}
      aria-pressed={isActive}
      aria-label={ariaLabel}
      title={buttonState === 'denied' && error ? error : undefined}
      className={`${baseClasses} ${stateClasses[buttonState]} ${className}`}
    >
      {label[buttonState]}
    </button>
  );
}
