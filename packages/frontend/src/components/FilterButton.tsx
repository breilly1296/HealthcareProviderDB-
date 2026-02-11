'use client';

import { SlidersHorizontal } from 'lucide-react';

interface FilterButtonProps {
  activeFilterCount: number;
  onClick: () => void;
  isExpanded?: boolean;
}

export function FilterButton({ activeFilterCount, onClick, isExpanded = false }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-expanded={isExpanded}
      aria-label={`Open filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
      className="
        md:hidden
        fixed bottom-20 right-4 z-30
        flex items-center gap-2
        px-4 py-3
        bg-primary-600 hover:bg-primary-700
        text-white font-medium
        rounded-full shadow-lg
        transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        dark:focus-visible:ring-offset-gray-900
      "
    >
      <SlidersHorizontal className="w-5 h-5" />
      <span>Filters</span>

      {/* Badge with active filter count */}
      {activeFilterCount > 0 && (
        <span
          className="
            absolute -top-1 -right-1
            min-w-[20px] h-5
            flex items-center justify-center
            px-1.5
            bg-white text-primary-600
            text-xs font-bold
            rounded-full
            shadow-sm
          "
        >
          {activeFilterCount}
        </span>
      )}
    </button>
  );
}
