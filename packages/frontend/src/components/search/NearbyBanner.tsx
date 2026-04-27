'use client';

import { MapPin, X } from 'lucide-react';

interface NearbyBannerProps {
  radiusMiles: number;
  onRadiusChange: (radius: number) => void;
  onClear: () => void;
  resultCount?: number;
  className?: string;
}

// Four pre-baked radii — matches the design brief's 5/10/25/50 set. The
// backend caps the param at 100 mi; if a 100-mi option is ever added,
// the service's bounding-box pre-filter still works (sanity-verified in
// the backend prompt).
const RADIUS_OPTIONS = [5, 10, 25, 50] as const;

/**
 * Banner + controls that appear above search results when Near-Me mode is
 * active. Surfaces three things:
 *   1. What filter the user is viewing ("within X miles of your location").
 *   2. A radius selector (5 / 10 / 25 / 50).
 *   3. A clear button to exit Near-Me mode.
 *
 * Purely presentational — URL param / router.push lives in the parent
 * search page. Keeps this component trivially unit-testable.
 */
export function NearbyBanner({ radiusMiles, onRadiusChange, onClear, resultCount, className = '' }: NearbyBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg ${className}`}
    >
      <div className="flex items-start gap-2 text-sm text-primary-900 dark:text-primary-100">
        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <p>
          Showing providers within{' '}
          <strong>{radiusMiles} miles</strong> of your location
          {typeof resultCount === 'number' && (
            <span className="text-primary-700 dark:text-primary-300">
              {' '}· {resultCount} result{resultCount === 1 ? '' : 's'}
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-primary-900 dark:text-primary-100 font-medium">
          Radius
          <select
            value={radiusMiles}
            onChange={e => onRadiusChange(Number(e.target.value))}
            aria-label="Search radius"
            className="ml-2 h-8 px-2 bg-white dark:bg-gray-800 border border-primary-300 dark:border-primary-700 rounded text-sm text-stone-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {RADIUS_OPTIONS.map(r => (
              <option key={r} value={r}>{r} mi</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onClear}
          aria-label="Clear Near Me filter"
          className="inline-flex items-center gap-1 h-8 px-2 text-xs font-medium text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          Clear
        </button>
      </div>
    </div>
  );
}
