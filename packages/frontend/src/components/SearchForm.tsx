'use client';

import { useState, useEffect, useRef, FormEvent, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { providerApi, locationApi, planApi, CarrierGroup } from '@/lib/api';
import { SPECIALTY_OPTIONS, STATE_OPTIONS } from '@/lib/provider-utils';
import { useRecentSearches, RecentSearchParams } from '@/hooks/useRecentSearches';
import { RecentSearches } from './RecentSearches';

interface SearchFormProps {
  showAdvanced?: boolean;
  className?: string;
}

export function SearchForm({ showAdvanced = true, className = '' }: SearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Recent searches
  const { recentSearches, addSearch, removeSearch, clearAll } = useRecentSearches();

  const [searchMode, setSearchMode] = useState<'providers' | 'locations'>(
    searchParams.get('mode') as 'providers' | 'locations' || 'providers'
  );
  const [specialty, setSpecialty] = useState(searchParams.get('specialty') || '');
  const [state, setState] = useState(searchParams.get('state') || '');
  const [selectedCities, setSelectedCities] = useState<string[]>(
    searchParams.get('cities')?.split(',').filter(Boolean) || []
  );
  const [zip, setZip] = useState(searchParams.get('zip') || '');
  const [healthSystem, setHealthSystem] = useState(searchParams.get('healthSystem') || '');
  const [name, setName] = useState(searchParams.get('name') || '');
  const [locationName, setLocationName] = useState(searchParams.get('locationName') || '');
  const [showMore, setShowMore] = useState(false);

  // Health Systems dropdown state
  const [healthSystems, setHealthSystems] = useState<string[]>([]);
  const [healthSystemsLoading, setHealthSystemsLoading] = useState(false);

  // City dropdown state
  const [cities, setCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [citySearchInput, setCitySearchInput] = useState('');
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  // Insurance plan dropdown state
  const [carrierGroups, setCarrierGroups] = useState<CarrierGroup[]>([]);
  const [insurancePlansLoading, setInsurancePlansLoading] = useState(false);
  const [selectedInsurancePlan, setSelectedInsurancePlan] = useState(searchParams.get('insurancePlanId') || '');
  const [selectedInsurancePlanName, setSelectedInsurancePlanName] = useState('');
  const [showInsuranceDropdown, setShowInsuranceDropdown] = useState(false);
  const [insuranceSearchInput, setInsuranceSearchInput] = useState('');
  const insuranceDropdownRef = useRef<HTMLDivElement>(null);

  // NYC All Boroughs preset
  const NYC_BOROUGHS = ['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

  // Load health systems from API - filtered by state and cities
  useEffect(() => {
    const loadHealthSystems = async () => {
      setHealthSystemsLoading(true);
      try {
        const params: { state?: string; cities?: string } = {};
        if (state) {
          params.state = state;
        }
        if (selectedCities.length > 0) {
          params.cities = selectedCities.join(',');
        }

        const result = await locationApi.getHealthSystems(params);
        const newHealthSystems = result.healthSystems || [];
        setHealthSystems(newHealthSystems);

        // Clear health system selection if it's no longer in the filtered list
        if (healthSystem && !newHealthSystems.includes(healthSystem)) {
          setHealthSystem('');
        }
      } catch (error) {
        console.error('Failed to load health systems:', error);
        setHealthSystems([]);
      } finally {
        setHealthSystemsLoading(false);
      }
    };

    loadHealthSystems();
  }, [state, selectedCities]);

  // Load cities from API
  useEffect(() => {
    if (!state) {
      setCities([]);
      setSelectedCities([]);
      return;
    }

    const loadCities = async () => {
      setCitiesLoading(true);
      try {
        const result = await providerApi.getCities(state);
        setCities(result.cities || []);
      } catch (error) {
        console.error('Failed to load cities:', error);
        setCities([]);
      } finally {
        setCitiesLoading(false);
      }
    };

    loadCities();
  }, [state]);

  // Load insurance plans from API
  useEffect(() => {
    const loadInsurancePlans = async () => {
      setInsurancePlansLoading(true);
      try {
        const result = await planApi.getGroupedPlans();
        setCarrierGroups(result.carriers || []);

        // If there's a selected plan ID from URL, find and set its name
        if (selectedInsurancePlan) {
          for (const group of result.carriers || []) {
            const plan = group.plans.find(p => p.planId === selectedInsurancePlan);
            if (plan) {
              setSelectedInsurancePlanName(plan.planName || plan.planId);
              break;
            }
          }
        }
      } catch (error) {
        console.error('Failed to load insurance plans:', error);
        setCarrierGroups([]);
      } finally {
        setInsurancePlansLoading(false);
      }
    };

    loadInsurancePlans();
  }, []);

  // Handle click outside and ESC key to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        cityDropdownRef.current &&
        !cityDropdownRef.current.contains(event.target as Node)
      ) {
        setShowCityDropdown(false);
      }
      if (
        insuranceDropdownRef.current &&
        !insuranceDropdownRef.current.contains(event.target as Node)
      ) {
        setShowInsuranceDropdown(false);
      }
    };

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showCityDropdown) setShowCityDropdown(false);
        if (showInsuranceDropdown) setShowInsuranceDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showCityDropdown, showInsuranceDropdown]);

  // Filter cities based on search input
  const filteredCities = cities.filter((c) =>
    c.toLowerCase().includes(citySearchInput.toLowerCase())
  );

  // Filter insurance plans based on search input
  const filteredCarrierGroups = carrierGroups
    .map((group) => ({
      ...group,
      plans: group.plans.filter(
        (p) =>
          (p.planName?.toLowerCase() || '').includes(insuranceSearchInput.toLowerCase()) ||
          group.carrier.toLowerCase().includes(insuranceSearchInput.toLowerCase())
      ),
    }))
    .filter((group) => group.plans.length > 0);

  const selectInsurancePlan = (planId: string, planName: string) => {
    setSelectedInsurancePlan(planId);
    setSelectedInsurancePlanName(planName);
    setShowInsuranceDropdown(false);
    setInsuranceSearchInput('');
  };

  const clearInsurancePlan = () => {
    setSelectedInsurancePlan('');
    setSelectedInsurancePlanName('');
  };

  const toggleCity = (cityName: string) => {
    setSelectedCities(prev =>
      prev.includes(cityName)
        ? prev.filter(c => c !== cityName)
        : [...prev, cityName]
    );
  };

  const toggleNYCBoroughs = () => {
    const allBoroughsSelected = NYC_BOROUGHS.every(b => selectedCities.includes(b));
    if (allBoroughsSelected) {
      // Deselect all boroughs
      setSelectedCities(selectedCities.filter(c => !NYC_BOROUGHS.includes(c)));
    } else {
      // Select all boroughs
      const newSelection = [...new Set([...selectedCities, ...NYC_BOROUGHS])];
      setSelectedCities(newSelection);
    }
  };

  const isNYCBoroughsSelected = state === 'NY' && NYC_BOROUGHS.every(borough => selectedCities.includes(borough));

  const handleStateChange = (newState: string) => {
    setState(newState);
    setSelectedCities([]);
    setCitySearchInput('');
  };

  const removeCity = (cityToRemove: string) => {
    setSelectedCities(prev => prev.filter(c => c !== cityToRemove));
  };

  // Handle selecting a recent search
  const handleSelectRecentSearch = useCallback((params: RecentSearchParams) => {
    // Populate form fields
    if (params.specialty !== undefined) setSpecialty(params.specialty);
    if (params.state !== undefined) {
      setState(params.state);
    }
    if (params.cities !== undefined) {
      setSelectedCities(params.cities ? params.cities.split(',').filter(Boolean) : []);
    }
    if (params.healthSystem !== undefined) setHealthSystem(params.healthSystem);
    if (params.insurancePlanId !== undefined) setSelectedInsurancePlan(params.insurancePlanId);
    if (params.zipCode !== undefined) setZip(params.zipCode);

    // Build URL and navigate
    const urlParams = new URLSearchParams();
    urlParams.set('mode', 'providers');
    if (params.state) urlParams.set('state', params.state);
    if (params.cities) urlParams.set('cities', params.cities);
    if (params.zipCode) urlParams.set('zip', params.zipCode);
    if (params.healthSystem) urlParams.set('healthSystem', params.healthSystem);
    if (params.specialty) urlParams.set('specialty', params.specialty);
    if (params.insurancePlanId) urlParams.set('insurancePlanId', params.insurancePlanId);

    router.push(`/search?${urlParams.toString()}`);
  }, [router]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const params = new URLSearchParams();
    params.set('mode', searchMode);
    if (state) params.set('state', state);
    if (selectedCities.length > 0) params.set('cities', selectedCities.join(','));
    if (zip) params.set('zip', zip);
    if (healthSystem) params.set('healthSystem', healthSystem);

    if (searchMode === 'providers') {
      if (specialty) params.set('specialty', specialty);
      if (name) params.set('name', name);
      if (selectedInsurancePlan) params.set('insurancePlanId', selectedInsurancePlan);

      // Save to recent searches (providers mode only)
      addSearch({
        specialty: specialty || undefined,
        state: state || undefined,
        cities: selectedCities.length > 0 ? selectedCities.join(',') : undefined,
        healthSystem: healthSystem || undefined,
        insurancePlanId: selectedInsurancePlan || undefined,
        zipCode: zip || undefined,
      });
    } else {
      if (locationName) params.set('locationName', locationName);
    }

    router.push(`/search?${params.toString()}`);
  };

  const handleClear = () => {
    setSpecialty('');
    setState('');
    setSelectedCities([]);
    setZip('');
    setHealthSystem('');
    setName('');
    setLocationName('');
    setCities([]);
    setCitySearchInput('');
    setSelectedInsurancePlan('');
    setSelectedInsurancePlanName('');
    setInsuranceSearchInput('');
    router.push('/search');
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 md:space-y-6 ${className}`}>
      {/* Recent Searches - Only show for provider search */}
      {searchMode === 'providers' && (
        <RecentSearches
          searches={recentSearches}
          onSelect={handleSelectRecentSearch}
          onRemove={removeSearch}
          onClearAll={clearAll}
        />
      )}

      {/* Search Mode Toggle */}
      <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg inline-flex">
        <button
          type="button"
          onClick={() => setSearchMode('providers')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            searchMode === 'providers'
              ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Providers
        </button>
        <button
          type="button"
          onClick={() => setSearchMode('locations')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            searchMode === 'locations'
              ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Organizations/Locations
        </button>
      </div>

      {/* Row 1: Primary Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {/* Specialty - Only for provider search */}
        {searchMode === 'providers' && (
          <div>
            <label htmlFor="specialty" className="label">
              Specialty
            </label>
            <select
              id="specialty"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="input"
            >
              {SPECIALTY_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Location Name - Only for location search */}
        {searchMode === 'locations' && (
          <div>
            <label htmlFor="locationName" className="label">
              Location/Organization Name
            </label>
            <input
              type="text"
              id="locationName"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g., Kings Highway, Mount Sinai"
              className="input"
            />
          </div>
        )}

        {/* State */}
        <div>
          <label htmlFor="state" className="label">
            State
          </label>
          <select
            id="state"
            value={state}
            onChange={(e) => handleStateChange(e.target.value)}
            className="input"
          >
            {STATE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Health System */}
        <div>
          <label htmlFor="healthSystem" className="label">
            Health System
          </label>
          <select
            id="healthSystem"
            value={healthSystem}
            onChange={(e) => setHealthSystem(e.target.value)}
            className="input"
            disabled={healthSystemsLoading}
          >
            <option value="">All Health Systems</option>
            {healthSystems.map((hs) => (
              <option key={hs} value={hs}>
                {hs}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Insurance Plan Filter - Only for provider search */}
      {searchMode === 'providers' && (
        <div className="relative">
          <label htmlFor="insurancePlan" className="label">
            Insurance Plan
          </label>
          <div className="relative" ref={insuranceDropdownRef}>
            <button
              type="button"
              onClick={() => setShowInsuranceDropdown(!showInsuranceDropdown)}
              className="input w-full text-left flex items-center justify-between cursor-pointer"
              aria-haspopup="listbox"
              aria-expanded={showInsuranceDropdown}
              aria-label={`Select insurance plan${selectedInsurancePlan ? `, ${selectedInsurancePlanName} selected` : ''}`}
            >
              <span className={selectedInsurancePlan ? 'text-gray-900 dark:text-white truncate' : 'text-gray-500 dark:text-gray-400'}>
                {insurancePlansLoading ? 'Loading plans...' :
                 selectedInsurancePlan ? selectedInsurancePlanName :
                 'All Insurance Plans'}
              </span>
              <div className="flex items-center gap-2">
                {selectedInsurancePlan && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearInsurancePlan();
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    aria-label="Clear insurance plan"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {insurancePlansLoading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-primary-200 border-t-primary-600 rounded-full" />
                ) : (
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${showInsuranceDropdown ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>
            </button>

            {/* Insurance Plan Dropdown */}
            {showInsuranceDropdown && !insurancePlansLoading && (
              <div
                className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden flex flex-col"
                style={{ maxHeight: '400px' }}
                role="listbox"
                aria-label="Available insurance plans"
              >
                {/* Search Bar */}
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <input
                    type="text"
                    value={insuranceSearchInput}
                    onChange={(e) => setInsuranceSearchInput(e.target.value)}
                    placeholder="Search plans or carriers..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                </div>

                {/* Plans List grouped by Carrier */}
                <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
                  {filteredCarrierGroups.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                      {insuranceSearchInput ? 'No plans match your search' : 'No insurance plans available'}
                    </div>
                  ) : (
                    filteredCarrierGroups.map((group) => (
                      <div key={group.carrier}>
                        {/* Carrier Header */}
                        <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide sticky top-0">
                          {group.carrier}
                        </div>
                        {/* Plans under this Carrier */}
                        {group.plans.map((plan) => (
                          <button
                            key={plan.planId}
                            type="button"
                            onClick={() => selectInsurancePlan(plan.planId, plan.planName || plan.planId)}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-primary-50 dark:hover:bg-primary-900/30 ${
                              selectedInsurancePlan === plan.planId ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-700 dark:text-gray-300'
                            }`}
                            role="option"
                            aria-selected={selectedInsurancePlan === plan.planId}
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate">{plan.planName || plan.planId}</span>
                              {plan.planType && (
                                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                  {plan.planType}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row 2: Location & Actions */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-end">
        {/* City - Multi-select - Compact */}
        <div className="relative md:col-span-4">
          <label htmlFor="city" className="label">
            City
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => state && setShowCityDropdown(!showCityDropdown)}
              disabled={!state}
              className={`input w-full text-left flex items-center justify-between ${!state ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              aria-haspopup="listbox"
              aria-expanded={showCityDropdown}
              aria-label={`Select cities${selectedCities.length > 0 ? `, ${selectedCities.length} selected` : ''}`}
            >
              <span className={selectedCities.length > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}>
                {!state ? 'Select a state first' :
                 citiesLoading ? 'Loading cities...' :
                 selectedCities.length > 0 ? `${selectedCities.length} ${selectedCities.length === 1 ? 'city' : 'cities'} selected` :
                 'Select cities...'}
              </span>
              {citiesLoading ? (
                <div className="animate-spin h-4 w-4 border-2 border-primary-200 border-t-primary-600 rounded-full" />
              ) : (
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${showCityDropdown ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          </div>

          {/* City Dropdown */}
          {showCityDropdown && state && !citiesLoading && (
            <div
              ref={cityDropdownRef}
              className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden flex flex-col"
              style={{ maxHeight: '400px' }}
              role="listbox"
              aria-label="Available cities"
              aria-multiselectable="true"
            >
              {/* Search Bar */}
              <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <input
                  type="text"
                  value={citySearchInput}
                  onChange={(e) => setCitySearchInput(e.target.value)}
                  placeholder="Search cities..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>

              {/* Selected Cities Display */}
              {selectedCities.length > 0 && (
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-primary-50 dark:bg-primary-900/30">
                  <div className="text-xs font-medium text-primary-900 dark:text-primary-300 mb-2">
                    {selectedCities.length} selected:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCities.map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => removeCity(city)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-700 text-primary-700 dark:text-primary-300 rounded text-xs hover:bg-primary-100 dark:hover:bg-gray-600"
                      >
                        {city}
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* NYC All Boroughs Button */}
              {state === 'NY' && (
                <button
                  type="button"
                  onClick={toggleNYCBoroughs}
                  className={`w-full px-4 py-2.5 text-left text-sm font-medium border-b border-gray-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 ${
                    isNYCBoroughsSelected ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isNYCBoroughsSelected}
                      readOnly
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    />
                    <span>NYC (All 5 Boroughs)</span>
                  </div>
                </button>
              )}

              {/* City Checkboxes */}
              <div className="overflow-y-auto" style={{ maxHeight: '250px' }}>
                {filteredCities.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                    {citySearchInput ? 'No cities match your search' : 'No cities available'}
                  </div>
                ) : (
                  filteredCities.slice(0, 100).map((c) => (
                    <label
                      key={c}
                      className={`flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/30 ${
                        selectedCities.includes(c) ? 'bg-primary-50 dark:bg-primary-900/30' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCities.includes(c)}
                        onChange={() => toggleCity(c)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                      <span className={`text-sm ${selectedCities.includes(c) ? 'font-medium text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300'}`}>{c}</span>
                    </label>
                  ))
                )}
                {filteredCities.length > 100 && (
                  <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-center">
                    Showing first 100 of {filteredCities.length} cities
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ZIP */}
        <div className="md:col-span-3">
          <label htmlFor="zip" className="label">
            ZIP Code <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            id="zip"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="Or search by ZIP"
            className="input"
            maxLength={10}
          />
        </div>

        {/* Search & Clear Buttons - Desktop */}
        <div className="hidden md:flex md:col-span-5 gap-3">
          <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
          </button>
          <button type="button" onClick={handleClear} className="btn-secondary">
            Clear
          </button>
        </div>
      </div>

      {/* Mobile Sticky Search Button */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg z-40">
        <div className="flex gap-3 max-w-lg mx-auto">
          <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search Providers
          </button>
          <button type="button" onClick={handleClear} className="btn-secondary px-4">
            Clear
          </button>
        </div>
      </div>

      {/* Spacer for mobile sticky button */}
      <div className="md:hidden h-20"></div>

      {/* Advanced options */}
      {showAdvanced && searchMode === 'providers' && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium text-sm flex items-center gap-1"
          >
            {showMore ? 'Hide' : 'More'} options
            <svg
              className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showMore && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {/* Provider Name */}
              <div>
                <label htmlFor="name" className="label">
                  Provider Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Search by name"
                  className="input"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
