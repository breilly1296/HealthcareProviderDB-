'use client';

import { Suspense } from 'react';
import { List, Columns2, Map } from 'lucide-react';
import { SaveProfileButton } from '@/components/SaveProfileButton';

export type ViewMode = 'list' | 'map' | 'split';

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function SearchHeader() {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-stone-800 dark:text-white mb-2">
            Find Healthcare Providers
          </h1>
          <p className="text-xl text-stone-600 dark:text-gray-300">
            Search for providers by specialty, location, and more.
          </p>
        </div>
        <Suspense fallback={null}>
          <SaveProfileButton />
        </Suspense>
      </div>
    </div>
  );
}

export function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  const modes: { mode: ViewMode; label: string; Icon: typeof List }[] = [
    { mode: 'list', label: 'List view', Icon: List },
    { mode: 'split', label: 'Split view', Icon: Columns2 },
    { mode: 'map', label: 'Map view', Icon: Map },
  ];

  return (
    <div className="hidden md:flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 gap-1">
      {modes.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          onClick={() => onViewModeChange(mode)}
          className={`p-2 rounded-md transition-colors ${
            viewMode === mode
              ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          aria-label={label}
          title={label}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
