'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { SPECIALTY_OPTIONS, STATE_OPTIONS } from '@/lib/provider-utils';
import { useInsurancePlans } from '@/hooks/useInsurancePlans';
import { useGeoLocation } from '@/hooks/useGeoLocation';

const QUICK_SEARCHES: { label: string; specialty: string }[] = [
  { label: 'Allergist', specialty: 'ALLERGY_IMMUNOLOGY' },
  { label: 'Cardiologist', specialty: 'CARDIOLOGY' },
  { label: 'Dermatologist', specialty: 'DERMATOLOGY' },
  { label: 'Family Doctor', specialty: 'FAMILY_MEDICINE' },
  { label: 'OB/GYN', specialty: 'OB_GYN' },
  { label: 'Orthopedics', specialty: 'ORTHOPEDICS' },
  { label: 'Pediatrician', specialty: 'PEDIATRICS' },
  { label: 'Psychiatrist', specialty: 'PSYCHIATRY' },
];

export function HeroSearch() {
  const router = useRouter();
  const geo = useGeoLocation();
  const [searchText, setSearchText] = useState('');
  // Default state matches the NYC launch focus — see DEFAULT_FILTERS in
  // useFilterState.ts for the matching default on the /search page.
  const [state, setState] = useState('NY');
  const [insurancePlanId, setInsurancePlanId] = useState('');
  const [awaitingGps, setAwaitingGps] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // When the hero's Near-Me click resolves GPS, route into /search with
  // the lat/lng params so the search page picks up Near-Me mode. Also
  // forwards a matched specialty when the user has typed one — so the
  // journey "type 'cardiologist' → Near Me" lands on NYC cardiologists
  // within 10 mi instead of an unfiltered proximity search.
  useEffect(() => {
    if (!awaitingGps) return;
    if (geo.latitude === null || geo.longitude === null) return;

    setAwaitingGps(false);
    const params = new URLSearchParams();
    params.set('lat', geo.latitude.toFixed(6));
    params.set('lng', geo.longitude.toFixed(6));
    params.set('radius', '10');

    const q = searchText.trim().toLowerCase();
    if (q) {
      const matched = SPECIALTY_OPTIONS.find(opt => {
        if (!opt.value) return false;
        if (opt.label.toLowerCase().includes(q)) return true;
        if (opt.searchTerms?.some(term => term.toLowerCase().includes(q))) return true;
        return false;
      });
      if (matched) params.set('specialty', matched.value);
      else params.set('name', searchText.trim());
    }

    if (insurancePlanId) params.set('insurancePlanId', insurancePlanId);
    router.push(`/search?${params.toString()}`);
  }, [awaitingGps, geo.latitude, geo.longitude, searchText, insurancePlanId, router]);

  const { selectOptions, isLoading: insuranceLoading } = useInsurancePlans({ state });

  // Autofocus on desktop only
  useEffect(() => {
    if (window.innerWidth >= 768 && inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();

    if (state) params.set('state', state);

    const q = searchText.toLowerCase();
    const matchedSpecialty = SPECIALTY_OPTIONS.find(
      opt => {
        if (!opt.value) return false;
        if (opt.label.toLowerCase().includes(q)) return true;
        if (opt.searchTerms?.some(term => term.toLowerCase().includes(q))) return true;
        return false;
      }
    );
    if (matchedSpecialty) {
      params.set('specialty', matchedSpecialty.value);
    } else if (searchText.trim()) {
      params.set('name', searchText.trim());
    }

    if (insurancePlanId) params.set('insurancePlanId', insurancePlanId);

    router.push(`/search?${params.toString()}`);
  }

  function handleQuickSearch(specialty: string) {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    params.set('specialty', specialty);
    if (insurancePlanId) params.set('insurancePlanId', insurancePlanId);
    router.push(`/search?${params.toString()}`);
  }

  return (
    <div>
      <form
        role="search"
        aria-label="Find a provider"
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-lg shadow-stone-200/50 dark:shadow-black/20 border border-stone-200 dark:border-gray-700 p-2 sm:p-3"
      >
        <div className="flex flex-col md:flex-row gap-2">
          {/* Search text */}
          <div className="relative flex-[2]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 dark:text-gray-500 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Specialty, condition, or doctor name"
              aria-label="Specialty, condition, or doctor name"
              className="w-full pl-10 pr-4 py-3 md:py-4 text-base bg-stone-50 dark:bg-gray-700 border border-stone-200 dark:border-gray-600 rounded-lg text-stone-800 dark:text-gray-100 placeholder-stone-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* State select */}
          <div className="flex-1">
            <select
              value={state}
              onChange={e => setState(e.target.value)}
              aria-label="State"
              className="w-full px-4 py-3 md:py-4 text-base bg-stone-50 dark:bg-gray-700 border border-stone-200 dark:border-gray-600 rounded-lg text-stone-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer"
              required
            >
              <option value="">Select State</option>
              {STATE_OPTIONS.filter(opt => opt.value !== '').map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Insurance select */}
          <div className="flex-1">
            <select
              value={insurancePlanId}
              onChange={e => setInsurancePlanId(e.target.value)}
              aria-label="Insurance plan"
              className="w-full px-4 py-3 md:py-4 text-base bg-stone-50 dark:bg-gray-700 border border-stone-200 dark:border-gray-600 rounded-lg text-stone-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer"
              disabled={insuranceLoading}
            >
              <option value="">Insurance (optional)</option>
              {selectOptions.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="flex items-center justify-center gap-2 px-6 py-3 md:py-4 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shrink-0"
          >
            <Search className="w-5 h-5" aria-hidden="true" />
            Search
          </button>
        </div>

        {/* F-16: Near-Me entry point on the hero. Renders only when the
            browser has geolocation support. Click triggers the permission
            prompt (if needed); once coords resolve, we route to /search
            with lat/lng params so the search page picks up Near-Me mode. */}
        {geo.gpsAvailable && (
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => { setAwaitingGps(true); geo.requestGpsLocation(); }}
              disabled={awaitingGps}
              aria-label="Find providers near me"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-lg disabled:opacity-70"
            >
              {awaitingGps ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <MapPin className="w-4 h-4" aria-hidden="true" />
              )}
              {awaitingGps ? 'Locating…' : 'Near Me'}
            </button>
          </div>
        )}
      </form>

      {/* Quick search chips */}
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {QUICK_SEARCHES.map(({ label, specialty }) => (
          <button
            key={specialty}
            onClick={() => handleQuickSearch(specialty)}
            className="px-3 py-1.5 text-sm bg-white/80 dark:bg-gray-800/80 border border-stone-200 dark:border-gray-700 rounded-full text-stone-600 dark:text-gray-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 dark:hover:bg-blue-900/30 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
