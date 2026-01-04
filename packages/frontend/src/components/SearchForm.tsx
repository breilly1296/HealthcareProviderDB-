'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

  const [specialty, setSpecialty] = useState(searchParams.get('specialty') || '');
  const [state, setState] = useState(searchParams.get('state') || '');
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [zip, setZip] = useState(searchParams.get('zip') || '');
  const [name, setName] = useState(searchParams.get('name') || '');
  const [showMore, setShowMore] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const params = new URLSearchParams();
    if (specialty) params.set('specialty', specialty);
    if (state) params.set('state', state);
    if (city) params.set('city', city);
    if (zip) params.set('zip', zip);
    if (name) params.set('name', name);

    router.push(`/search?${params.toString()}`);
  };

  const handleClear = () => {
    setSpecialty('');
    setState('');
    setCity('');
    setZip('');
    setName('');
    router.push('/search');
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Specialty */}
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

        {/* State */}
        <div>
          <label htmlFor="state" className="label">
            State
          </label>
          <select
            id="state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="input"
          >
            {STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* City */}
        <div>
          <label htmlFor="city" className="label">
            City
          </label>
          <input
            type="text"
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Enter city name"
            className="input"
          />
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

          {showMore && (
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
          Search Providers
        </button>
        <button type="button" onClick={handleClear} className="btn-secondary">
          Clear
        </button>
      </div>
    </form>
  );
}
