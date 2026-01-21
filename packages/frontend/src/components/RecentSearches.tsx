'use client';

import { ClockIcon, XIcon } from './icons/Icons';
import { RecentSearch, RecentSearchParams } from '@/hooks/useRecentSearches';

interface RecentSearchesProps {
  searches: RecentSearch[];
  onSelect: (params: RecentSearchParams) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export function RecentSearches({
  searches,
  onSelect,
  onRemove,
  onClearAll,
}: RecentSearchesProps) {
  if (searches.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <ClockIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Recent Searches</span>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
        >
          Clear all
        </button>
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-2">
        {searches.map((search) => (
          <div
            key={search.id}
            className="group relative inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-full text-sm text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
          >
            <button
              type="button"
              onClick={() => onSelect(search.params)}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 rounded-full"
            >
              {search.displayText}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(search.id);
              }}
              className="
                md:opacity-0 md:group-hover:opacity-100
                text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300
                transition-opacity
                p-0.5 -mr-1
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-offset-gray-900 rounded-full
              "
              aria-label={`Remove "${search.displayText}" from recent searches`}
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
