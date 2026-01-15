'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { providerApi, locationApi } from '@/lib/api';
import { SPECIALTY_OPTIONS, STATE_OPTIONS } from '@/lib/provider-utils';

interface SearchFormProps {
  showAdvanced?: boolean;
  className?: string;
}

export function SearchForm({ showAdvanced = true, className = '' }: SearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        cityDropdownRef.current &&
        !cityDropdownRef.current.contains(event.target as Node)
      ) {
        setShowCityDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter cities based on search input
  const filteredCities = cities.filter((c) =>
    c.toLowerCase().includes(citySearchInput.toLowerCase())
  );

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
    router.push('/search');
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 md:space-y-6 ${className}`}>
      {/* Search Mode Toggle */}
      <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg inline-flex">
        <button
          type="button"
          onClick={() => setSearchMode('providers')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            searchMode === 'providers'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
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
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
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
            >
              <span className={selectedCities.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
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
              className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden flex flex-col"
              style={{ maxHeight: '400px' }}
            >
              {/* Search Bar */}
              <div className="p-3 border-b bg-gray-50">
                <input
                  type="text"
                  value={citySearchInput}
                  onChange={(e) => setCitySearchInput(e.target.value)}
                  placeholder="Search cities..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>

              {/* Selected Cities Display */}
              {selectedCities.length > 0 && (
                <div className="p-3 border-b bg-primary-50">
                  <div className="text-xs font-medium text-primary-900 mb-2">
                    {selectedCities.length} selected:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCities.map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => removeCity(city)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white text-primary-700 rounded text-xs hover:bg-primary-100"
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
                  className={`w-full px-4 py-2.5 text-left text-sm font-medium border-b hover:bg-primary-50 ${
                    isNYCBoroughsSelected ? 'bg-primary-100 text-primary-700' : 'text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isNYCBoroughsSelected}
                      readOnly
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>NYC (All 5 Boroughs)</span>
                  </div>
                </button>
              )}

              {/* City Checkboxes */}
              <div className="overflow-y-auto" style={{ maxHeight: '250px' }}>
                {filteredCities.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">
                    {citySearchInput ? 'No cities match your search' : 'No cities available'}
                  </div>
                ) : (
                  filteredCities.slice(0, 100).map((c) => (
                    <label
                      key={c}
                      className={`flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-primary-50 ${
                        selectedCities.includes(c) ? 'bg-primary-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCities.includes(c)}
                        onChange={() => toggleCity(c)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className={`text-sm ${selectedCities.includes(c) ? 'font-medium text-primary-700' : 'text-gray-700'}`}>{c}</span>
                    </label>
                  ))
                )}
                {filteredCities.length > 100 && (
                  <div className="px-4 py-2 text-xs text-gray-400 border-t bg-gray-50 text-center">
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
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg z-40">
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
        <div className="border-t pt-4">
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="text-primary-600 hover:text-primary-700 font-medium text-sm flex items-center gap-1"
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
