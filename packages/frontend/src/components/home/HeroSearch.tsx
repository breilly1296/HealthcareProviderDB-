'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { SPECIALTY_OPTIONS, STATE_OPTIONS } from '@/lib/provider-utils';
import { useInsurancePlans } from '@/hooks/useInsurancePlans';

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
  const [searchText, setSearchText] = useState('');
  const [state, setState] = useState('NY');
  const [insurancePlanId, setInsurancePlanId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

    const matchedSpecialty = SPECIALTY_OPTIONS.find(
      opt => opt.value && opt.label.toLowerCase().includes(searchText.toLowerCase())
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
              className="w-full pl-10 pr-4 py-3 md:py-4 text-base bg-stone-50 dark:bg-gray-700 border border-stone-200 dark:border-gray-600 rounded-lg text-stone-800 dark:text-gray-100 placeholder-stone-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* State select */}
          <div className="flex-1">
            <select
              value={state}
              onChange={e => setState(e.target.value)}
              className="w-full px-4 py-3 md:py-4 text-base bg-stone-50 dark:bg-gray-700 border border-stone-200 dark:border-gray-600 rounded-lg text-stone-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer"
              required
            >
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
            <Search className="w-5 h-5" />
            Search
          </button>
        </div>
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
