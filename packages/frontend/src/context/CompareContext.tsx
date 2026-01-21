'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

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

const MAX_PROVIDERS = 3;
const STORAGE_KEY = 'verifymyprovider-compare';

function getStoredProviders(): CompareProvider[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Invalid JSON or storage error
  }
  return [];
}

function storeProviders(providers: CompareProvider[]) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  } catch {
    // Storage error (quota exceeded, etc.)
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
      if (prev.length >= MAX_PROVIDERS || prev.some((p) => p.npi === provider.npi)) {
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

  const canAddMore = selectedProviders.length < MAX_PROVIDERS;

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
