'use client';

interface FilterButtonProps {
  activeFilterCount: number;
  onClick: () => void;
}

export function FilterButton({ activeFilterCount, onClick }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-expanded={false}
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
      {/* Filter icon */}
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
        />
      </svg>
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
