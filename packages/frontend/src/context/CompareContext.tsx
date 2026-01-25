'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { MAX_COMPARE_PROVIDERS } from '@/lib/constants';

export interface CompareProvider {
  npi: string;
  name: string;
  specialty: string;
  healthSystem: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  confidenceScore?: number;
  acceptanceStatus?: string;
  verificationCount?: number;
  lastVerified?: string | null;
  phone?: string | null;
}

interface CompareContextType {
  selectedProviders: CompareProvider[];
  addProvider: (provider: CompareProvider) => void;
  removeProvider: (npi: string) => void;
  clearAll: () => void;
  isSelected: (npi: string) => boolean;
  canAddMore: boolean;
}

const CompareContext = createContext<CompareContextType | undefined>(undefined);

const STORAGE_KEY = 'verifymyprovider-compare';

function getStoredProviders(): CompareProvider[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);

    // Validate the parsed data is an array
    if (!Array.isArray(parsed)) {
      console.warn('[CompareContext] Stored data is not an array, resetting');
      sessionStorage.removeItem(STORAGE_KEY);
      return [];
    }

    return parsed;
  } catch (error) {
    // P0 FIX: Log the error instead of silently swallowing it
    if (error instanceof SyntaxError) {
      console.error('[CompareContext] Invalid JSON in sessionStorage, resetting:', error.message);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (removeError) {
        console.error('[CompareContext] Failed to remove corrupted storage:', removeError);
      }
    } else if (error instanceof DOMException) {
      console.error('[CompareContext] Storage access error:', error.name, error.message);
    } else {
      console.error('[CompareContext] Unexpected error reading storage:', error);
    }

    return [];
  }
}

function storeProviders(providers: CompareProvider[]): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  } catch (error) {
    // P0 FIX: Log the error with context
    if (error instanceof DOMException) {
      if (error.name === 'QuotaExceededError') {
        console.error('[CompareContext] Storage quota exceeded:', error.message);
      } else if (error.name === 'SecurityError') {
        console.error('[CompareContext] Storage access denied (private browsing?):', error.message);
      } else {
        console.error('[CompareContext] Storage DOMException:', error.name, error.message);
      }
    } else {
      console.error('[CompareContext] Unexpected error saving to storage:', error);
    }
  }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [selectedProviders, setSelectedProviders] = useState<CompareProvider[]>([]);
  const [mounted, setMounted] = useState(false);

  // Initialize from sessionStorage (SSR-safe)
  useEffect(() => {
    setSelectedProviders(getStoredProviders());
    setMounted(true);
  }, []);

  // Persist to sessionStorage whenever selection changes
  useEffect(() => {
    if (mounted) {
      storeProviders(selectedProviders);
    }
  }, [selectedProviders, mounted]);

  const addProvider = useCallback((provider: CompareProvider) => {
    setSelectedProviders((prev) => {
      // Don't add if already at max or already selected
      if (prev.length >= MAX_COMPARE_PROVIDERS || prev.some((p) => p.npi === provider.npi)) {
        return prev;
      }
      return [...prev, provider];
    });
  }, []);

  const removeProvider = useCallback((npi: string) => {
    setSelectedProviders((prev) => prev.filter((p) => p.npi !== npi));
  }, []);

  const clearAll = useCallback(() => {
    setSelectedProviders([]);
  }, []);

  const isSelected = useCallback(
    (npi: string) => selectedProviders.some((p) => p.npi === npi),
    [selectedProviders]
  );

  const canAddMore = selectedProviders.length < MAX_COMPARE_PROVIDERS;

  return (
    <CompareContext.Provider
      value={{
        selectedProviders,
        addProvider,
        removeProvider,
        clearAll,
        isSelected,
        canAddMore,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const context = useContext(CompareContext);
  if (context === undefined) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
}
