'use client';

import { useState, useEffect, useCallback } from 'react';
import { SPECIALTY_LABELS, US_STATES } from '@/lib/provider-utils';
import { logError } from '@/lib/errorUtils';

const STORAGE_KEY = 'vmp_recent_searches';
const MAX_SEARCHES = 5;

export interface RecentSearchParams {
  specialty?: string;
  state?: string;
  cities?: string;
  healthSystem?: string;
  insurancePlanId?: string;
  zipCode?: string;
}

export interface RecentSearch {
  id: string;
  params: RecentSearchParams;
  displayText: string;
  timestamp: number;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateDisplayText(params: RecentSearchParams): string {
  const parts: string[] = [];

  // Add specialty
  if (params.specialty) {
    const specialtyLabel = SPECIALTY_LABELS[params.specialty] || params.specialty;
    parts.push(specialtyLabel);
  }

  // Build location string
  const locationParts: string[] = [];

  if (params.cities) {
    const cityList = params.cities.split(',');
    if (cityList.length > 2) {
      locationParts.push(`${cityList.slice(0, 2).join(', ')} +${cityList.length - 2}`);
    } else {
      locationParts.push(cityList.join(', '));
    }
  }

  if (params.state) {
    const stateLabel = US_STATES[params.state] || params.state;
    locationParts.push(stateLabel);
  }

  if (params.zipCode) {
    locationParts.push(params.zipCode);
  }

  if (locationParts.length > 0) {
    parts.push(`in ${locationParts.join(', ')}`);
  }

  if (params.healthSystem) {
    parts.push(`at ${params.healthSystem}`);
  }

  // Fallback if nothing specified
  if (parts.length === 0) {
    return 'All providers';
  }

  return parts.join(' ');
}

function areParamsEqual(a: RecentSearchParams, b: RecentSearchParams): boolean {
  return (
    (a.specialty || '') === (b.specialty || '') &&
    (a.state || '') === (b.state || '') &&
    (a.cities || '') === (b.cities || '') &&
    (a.healthSystem || '') === (b.healthSystem || '') &&
    (a.insurancePlanId || '') === (b.insurancePlanId || '') &&
    (a.zipCode || '') === (b.zipCode || '')
  );
}

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed);
        }
      }
    } catch (error) {
      logError('useRecentSearches.load', error);
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage whenever searches change (after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSearches));
    } catch (error) {
      logError('useRecentSearches.save', error);
    }
  }, [recentSearches, isHydrated]);

  const addSearch = useCallback((params: RecentSearchParams) => {
    // Don't add empty searches
    const hasAnyParam = Object.values(params).some(v => v && v.trim() !== '');
    if (!hasAnyParam) return;

    setRecentSearches(prev => {
      // Check for duplicate
      const existingIndex = prev.findIndex(s => areParamsEqual(s.params, params));
      const existing = prev[existingIndex];

      if (existingIndex !== -1 && existing) {
        // Move existing search to top with updated timestamp
        const updated: RecentSearch = { ...existing, timestamp: Date.now() };
        const filtered = prev.filter((_, i) => i !== existingIndex);
        return [updated, ...filtered];
      }

      // Add new search at the beginning
      const newSearch: RecentSearch = {
        id: generateId(),
        params,
        displayText: generateDisplayText(params),
        timestamp: Date.now(),
      };

      // Keep only the most recent MAX_SEARCHES
      return [newSearch, ...prev].slice(0, MAX_SEARCHES);
    });
  }, []);

  const removeSearch = useCallback((id: string) => {
    setRecentSearches(prev => prev.filter(s => s.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setRecentSearches([]);
  }, []);

  return {
    recentSearches,
    addSearch,
    removeSearch,
    clearAll,
    isHydrated,
  };
}
