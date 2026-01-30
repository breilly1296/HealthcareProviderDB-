'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Stethoscope, CreditCard, Search } from 'lucide-react';
import { WelcomeBackBanner } from '@/components/WelcomeBackBanner';

const POPULAR_SPECIALTIES = [
  { value: '', label: 'Any Specialty' },
  { value: 'Family Medicine', label: 'Family Medicine' },
  { value: 'Internal Medicine', label: 'Internal Medicine' },
  { value: 'Pediatrics', label: 'Pediatrics' },
  { value: 'Obstetrics & Gynecology', label: 'OB/GYN' },
  { value: 'Cardiology', label: 'Cardiology' },
  { value: 'Dermatology', label: 'Dermatology' },
  { value: 'Orthopedic Surgery', label: 'Orthopedics' },
  { value: 'Psychiatry', label: 'Psychiatry' },
  { value: 'Ophthalmology', label: 'Ophthalmology' },
];

const POPULAR_INSURANCES = [
  { value: '', label: 'Any Insurance' },
  { value: 'blue-cross', label: 'Blue Cross Blue Shield' },
  { value: 'aetna', label: 'Aetna' },
  { value: 'united', label: 'UnitedHealthcare' },
  { value: 'cigna', label: 'Cigna' },
  { value: 'humana', label: 'Humana' },
  { value: 'kaiser', label: 'Kaiser Permanente' },
];

export function HeroSection() {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [insurance, setInsurance] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const params = new URLSearchParams();
    if (location) {
      // Check if it's a ZIP code (5 digits)
      if (/^\d{5}$/.test(location.trim())) {
        params.set('zipCode', location.trim());
      } else {
        params.set('cities', location.trim());
      }
    }
    if (specialty) params.set('specialty', specialty);
    if (insurance) params.set('insurancePlanId', insurance);

    router.push(`/search?${params.toString()}`);
  };

  return (
    <>
      {/* Welcome Back Banner - at very top */}
      <WelcomeBackBanner />

      <section className="bg-gradient-to-b from-primary-50 to-white dark:from-gray-800 dark:to-gray-900 py-8 md:py-16">
        <div className="container-wide text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 px-4">
            Find Providers Who Actually
            <span className="text-primary-600 dark:text-primary-400"> Accept Your Insurance</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-6 px-4">
            Verified by real patients. Backed by peer-reviewed research.
          </p>

          {/* Inline Search Form */}
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4">
            <div className="bg-slate-800/50 dark:bg-slate-800/70 backdrop-blur border border-slate-700 rounded-xl p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
                {/* Location Input */}
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City or ZIP code"
                    className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                {/* Specialty Dropdown */}
                <div className="relative">
                  <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                  <select
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    {POPULAR_SPECIALTIES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Insurance Dropdown */}
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                  <select
                    value={insurance}
                    onChange={(e) => setInsurance(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    {POPULAR_INSURANCES.map((i) => (
                      <option key={i.value} value={i.value}>{i.label}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Search Button */}
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  <Search className="w-5 h-5" />
                  Search
                </button>
              </div>
            </div>
          </form>

          {/* How it works link */}
          <Link
            href="#how-it-works"
            className="inline-flex items-center gap-1 mt-4 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            How it works
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Link>
        </div>
      </section>
    </>
  );
}
