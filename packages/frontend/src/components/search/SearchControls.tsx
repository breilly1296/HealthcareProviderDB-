'use client';

import { useState, useCallback, Suspense, useRef } from 'react';
import { SearchForm, type SearchFormRef } from '@/components/SearchForm';
import { FilterButton } from '@/components/FilterButton';
import { FilterDrawer } from '@/components/FilterDrawer';
import { ViewModeToggle } from './SearchHeader';
import type { ViewMode } from './SearchHeader';
import type { ProviderDisplay, PaginationState } from '@/types';

interface SearchControlsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onResultsChange: (providers: ProviderDisplay[], pagination: PaginationState | null) => void;
  onFilterCountChange: (count: number) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function SearchControls({
  viewMode,
  onViewModeChange,
  onResultsChange,
  onFilterCountChange,
  onLoadingChange,
}: SearchControlsProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const drawerFormRef = useRef<SearchFormRef>(null);

  const handleFilterCount = useCallback((count: number) => {
    setActiveFilterCount(count);
    onFilterCountChange(count);
  }, [onFilterCountChange]);

  return (
    <>
      {/* Desktop Search Form */}
      <div className="hidden md:block card mb-8">
        <Suspense fallback={<div className="animate-pulse h-40 bg-gray-100 dark:bg-gray-700 rounded" />}>
          <SearchForm
            onResultsChange={onResultsChange}
            onFilterCountChange={handleFilterCount}
            onLoadingChange={onLoadingChange}
          />
        </Suspense>
      </div>

      {/* Mobile Filter Button + View Toggle */}
      <div className="flex items-center justify-between gap-3 mb-4 md:mb-0">
        <FilterButton activeFilterCount={activeFilterCount} onClick={() => setIsDrawerOpen(true)} isExpanded={isDrawerOpen} />
        <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </div>

      {/* Mobile Filter Drawer */}
      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onApply={() => drawerFormRef.current?.search()}
        onClear={() => drawerFormRef.current?.clear()}
        activeFilterCount={activeFilterCount}
      >
        <SearchForm
          ref={drawerFormRef}
          variant="drawer"
          onResultsChange={onResultsChange}
          onFilterCountChange={handleFilterCount}
          onLoadingChange={onLoadingChange}
        />
      </FilterDrawer>
    </>
  );
}
