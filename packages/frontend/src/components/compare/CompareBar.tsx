'use client';

import { useState } from 'react';
import { useCompare } from '@/hooks/useCompare';
import { CompareModal } from './CompareModal';

function ProviderInitial({ name, className = '' }: { name: string; className?: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className={`
        w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/50
        flex items-center justify-center
        text-sm font-semibold text-primary-700 dark:text-primary-300
        border-2 border-white dark:border-gray-800
        ${className}
      `}
      title={name}
    >
      {initial}
    </div>
  );
}

export function CompareBar() {
  const { selectedProviders, clearAll } = useCompare();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const count = selectedProviders.length;
  const canCompare = count >= 2;

  if (count === 0) {
    return null;
  }

  return (
    <>
      {/* Desktop: Floating card in bottom-right */}
      <div
        className="
          hidden md:flex
          fixed bottom-6 right-6 z-40
          items-center gap-4
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700
          rounded-xl shadow-lg
          px-4 py-3
          animate-slide-up
        "
      >
        {/* Provider initials */}
        <div className="flex -space-x-2">
          {selectedProviders.map((provider) => (
            <ProviderInitial key={provider.npi} name={provider.name} />
          ))}
        </div>

        {/* Count text */}
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {count} provider{count !== 1 ? 's' : ''} selected
        </span>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={!canCompare}
            aria-label={`Compare ${count} providers`}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium
              transition-colors duration-150
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
              dark:focus-visible:ring-offset-gray-800
              ${
                canCompare
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }
            `}
          >
            Compare
          </button>
          <button
            onClick={clearAll}
            aria-label="Clear all selected providers"
            className="
              px-3 py-2 text-sm text-gray-500 dark:text-gray-400
              hover:text-gray-700 dark:hover:text-gray-200
              transition-colors
            "
          >
            Clear
          </button>
        </div>
      </div>

      {/* Mobile: Full-width bar above BottomNav */}
      <div
        className="
          md:hidden
          fixed bottom-16 left-0 right-0 z-40
          bg-white dark:bg-gray-800
          border-t border-gray-200 dark:border-gray-700
          shadow-lg
          px-4 py-3
          safe-bottom
          animate-slide-up
        "
      >
        <div className="flex items-center justify-between gap-3">
          {/* Left: Initials and count */}
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {selectedProviders.slice(0, 3).map((provider) => (
                <ProviderInitial key={provider.npi} name={provider.name} className="w-7 h-7 text-xs" />
              ))}
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {count} selected
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={clearAll}
              aria-label="Clear all selected providers"
              className="
                px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400
                hover:text-gray-700 dark:hover:text-gray-200
                transition-colors
              "
            >
              Clear
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!canCompare}
              aria-label={`Compare ${count} providers`}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium
                transition-colors duration-150
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                ${
                  canCompare
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }
              `}
            >
              Compare
            </button>
          </div>
        </div>
      </div>

      {/* Comparison Modal */}
      <CompareModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
