'use client';

import { Suspense, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { SearchResultsSkeleton } from '@/components/ProviderCardSkeleton';
import type { ViewMode } from './SearchHeader';

interface SearchViewLayoutProps {
  viewMode: ViewMode;
  isLoading: boolean;
  listContent: ReactNode;
  mapContent: ReactNode;
}

function LoadingIndicator() {
  return (
    <>
      <div className="flex items-center justify-center gap-2 py-4 text-primary-600 dark:text-primary-400" aria-live="polite">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-medium animate-pulse">Searching providers&hellip;</span>
      </div>
      <SearchResultsSkeleton count={5} />
    </>
  );
}

export function SearchViewLayout({ viewMode, isLoading, listContent, mapContent }: SearchViewLayoutProps) {
  if (viewMode === 'list') {
    return isLoading ? (
      <LoadingIndicator />
    ) : (
      <Suspense fallback={<SearchResultsSkeleton count={5} />}>
        {listContent}
      </Suspense>
    );
  }

  if (viewMode === 'map') {
    return <>{mapContent}</>;
  }

  // split view
  return (
    <div className="flex gap-6 h-[calc(100vh-200px)] min-h-[500px]">
      <div className="w-1/2 overflow-y-auto pr-2">
        {isLoading ? (
          <LoadingIndicator />
        ) : (
          <Suspense fallback={<SearchResultsSkeleton count={5} />}>
            {listContent}
          </Suspense>
        )}
      </div>
      <div className="w-1/2 rounded-lg overflow-hidden sticky top-0">
        {mapContent}
      </div>
    </div>
  );
}
