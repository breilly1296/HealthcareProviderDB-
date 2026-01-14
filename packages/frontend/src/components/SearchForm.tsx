'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { providerApi, locationApi } from '@/lib/api';

const SPECIALTIES = [
  { value: '', label: 'All Specialties' },
  { value: 'ACUPUNCTURE', label: 'Acupuncture' },
  { value: 'ALLERGY_IMMUNOLOGY', label: 'Allergy & Immunology' },
  { value: 'ANESTHESIOLOGY', label: 'Anesthesiology' },
  { value: 'CARDIOLOGY', label: 'Cardiology' },
  { value: 'CHIROPRACTIC', label: 'Chiropractic' },
  { value: 'CLINIC_FACILITY', label: 'Clinic/Facility' },
  { value: 'COMMUNITY_HEALTH', label: 'Community Health' },
  { value: 'DENTISTRY', label: 'Dentistry' },
  { value: 'DERMATOLOGY', label: 'Dermatology' },
  { value: 'DIETETICS', label: 'Dietetics' },
  { value: 'DME_PROSTHETICS', label: 'DME & Prosthetics' },
  { value: 'EMERGENCY_MEDICINE', label: 'Emergency Medicine' },
  { value: 'ENDOCRINOLOGY', label: 'Endocrinology' },
  { value: 'FAMILY_MEDICINE', label: 'Family Medicine' },
  { value: 'GASTROENTEROLOGY', label: 'Gastroenterology' },
  { value: 'GERIATRICS', label: 'Geriatrics' },
  { value: 'HOME_HEALTH', label: 'Home Health' },
  { value: 'HOSPICE_PALLIATIVE', label: 'Hospice & Palliative' },
  { value: 'HOSPITAL', label: 'Hospital' },
  { value: 'INFECTIOUS_DISEASE', label: 'Infectious Disease' },
  { value: 'INTERNAL_MEDICINE', label: 'Internal Medicine' },
  { value: 'LAB_PATHOLOGY', label: 'Lab & Pathology' },
  { value: 'MENTAL_HEALTH', label: 'Mental Health' },
  { value: 'MIDWIFERY', label: 'Midwifery' },
  { value: 'NEPHROLOGY', label: 'Nephrology' },
  { value: 'NEUROLOGY', label: 'Neurology' },
  { value: 'NURSE_PRACTITIONER', label: 'Nurse Practitioner' },
  { value: 'NURSING', label: 'Nursing' },
  { value: 'OB_GYN', label: 'OB/GYN' },
  { value: 'OCCUPATIONAL_THERAPY', label: 'Occupational Therapy' },
  { value: 'ONCOLOGY', label: 'Oncology' },
  { value: 'OPTOMETRY', label: 'Optometry' },
  { value: 'ORTHOPEDICS', label: 'Orthopedics' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PATHOLOGY', label: 'Pathology' },
  { value: 'PEDIATRICS', label: 'Pediatrics' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'PHYSICAL_THERAPY', label: 'Physical Therapy' },
  { value: 'PHYSICIAN_ASSISTANT', label: 'Physician Assistant' },
  { value: 'PSYCHIATRY', label: 'Psychiatry' },
  { value: 'PSYCHOLOGY', label: 'Psychology' },
  { value: 'PULMONOLOGY', label: 'Pulmonology' },
  { value: 'RADIOLOGY', label: 'Radiology' },
  { value: 'RESPIRATORY_THERAPY', label: 'Respiratory Therapy' },
  { value: 'RHEUMATOLOGY', label: 'Rheumatology' },
  { value: 'SOCIAL_WORK', label: 'Social Work' },
  { value: 'SPEECH_THERAPY', label: 'Speech Therapy' },
  { value: 'SURGERY', label: 'Surgery' },
  { value: 'UROLOGY', label: 'Urology' },
];

const STATES = [
  { value: '', label: 'All States' },
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
  { value: 'DC', label: 'Washington DC' },
];

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

  // Load health systems from API on mount
  useEffect(() => {
    const loadHealthSystems = async () => {
      setHealthSystemsLoading(true);
      try {
        const result = await locationApi.getHealthSystems();
        setHealthSystems(result.healthSystems || []);
      } catch (error) {
        console.error('Failed to load health systems:', error);
        setHealthSystems([]);
      } finally {
        setHealthSystemsLoading(false);
      }
    };

    loadHealthSystems();
  }, []);

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
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              {SPECIALTIES.map((s) => (
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
            {STATES.map((s) => (
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

        {/* City - Multi-select */}
        <div className="relative">
          <label htmlFor="city" className="label">
            City (Select Multiple)
          </label>
          <div className="relative">
            <input
              type="text"
              id="city"
              value={citySearchInput}
              onChange={(e) => setCitySearchInput(e.target.value)}
              onFocus={() => state && setShowCityDropdown(true)}
              placeholder={!state ? 'Select a state first' : citiesLoading ? 'Loading cities...' : 'Search cities...'}
              className="input pr-8"
              disabled={!state}
              autoComplete="off"
            />
            {citiesLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-primary-200 border-t-primary-600 rounded-full" />
              </div>
            )}
            {!citiesLoading && state && (
              <button
                type="button"
                onClick={() => setShowCityDropdown(!showCityDropdown)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
              >
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${showCityDropdown ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>

          {/* Selected Cities Pills */}
          {selectedCities.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedCities.map((city) => (
                <span
                  key={city}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-700 rounded-md text-sm"
                >
                  {city}
                  <button
                    type="button"
                    onClick={() => removeCity(city)}
                    className="hover:text-primary-900"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* City Dropdown */}
          {showCityDropdown && state && !citiesLoading && (
            <div
              ref={cityDropdownRef}
              className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col"
            >
              {/* NYC All Boroughs Button */}
              {state === 'NY' && (
                <button
                  type="button"
                  onClick={toggleNYCBoroughs}
                  className={`w-full px-4 py-2.5 text-left text-sm font-medium border-b hover:bg-primary-50 ${
                    isNYCBoroughsSelected ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isNYCBoroughsSelected}
                      onChange={toggleNYCBoroughs}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>New York City (All Boroughs)</span>
                  </div>
                </button>
              )}

              {/* City Checkboxes */}
              <div className="overflow-y-auto max-h-60">
                {filteredCities.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    {citySearchInput ? 'No cities match your search' : 'No cities available'}
                  </div>
                ) : (
                  filteredCities.slice(0, 100).map((c) => (
                    <label
                      key={c}
                      className={`flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-primary-50 ${
                        selectedCities.includes(c) ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCities.includes(c)}
                        onChange={() => toggleCity(c)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm">{c}</span>
                    </label>
                  ))
                )}
                {filteredCities.length > 100 && (
                  <div className="px-4 py-2 text-xs text-gray-400 border-t">
                    Showing first 100 of {filteredCities.length} cities. Type to filter.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ZIP */}
        <div>
          <label htmlFor="zip" className="label">
            ZIP Code
          </label>
          <input
            type="text"
            id="zip"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="e.g., 33101"
            className="input"
            maxLength={10}
          />
        </div>
      </div>

      {/* Advanced options */}
      {showAdvanced && (
        <>
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="text-primary-600 hover:text-primary-700 font-medium text-sm flex items-center gap-1"
          >
            {showMore ? 'Less options' : 'More options'}
            <svg
              className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showMore && searchMode === 'providers' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
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
        </>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button type="submit" className="btn-primary flex-1 sm:flex-none">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search {searchMode === 'providers' ? 'Providers' : 'Locations'}
        </button>
        <button type="button" onClick={handleClear} className="btn-secondary">
          Clear
        </button>
      </div>
    </form>
  );
}
