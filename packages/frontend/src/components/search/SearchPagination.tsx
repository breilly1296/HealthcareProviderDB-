'use client';

import type { PaginationState } from '@/types';

interface SearchPaginationProps {
  pagination: PaginationState;
  currentParams: URLSearchParams;
}

export function SearchPagination({ pagination, currentParams }: SearchPaginationProps) {
  if (pagination.totalPages <= 1) return null;

  return (
    <nav aria-label="Search results pagination" className="mt-8 flex justify-center gap-2">
      {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
        .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - pagination.page) <= 2)
        .map((p, idx, arr) => {
          const prevPage = arr[idx - 1];
          const showEllipsisBefore = idx > 0 && prevPage !== undefined && p - prevPage > 1;

          const pageParams = new URLSearchParams(currentParams);
          pageParams.set('page', String(p));

          return (
            <div key={p} className="flex items-center gap-2">
              {showEllipsisBefore && (
                <span className="px-2 text-gray-400 dark:text-gray-500">...</span>
              )}
              <a
                href={`/search?${pageParams.toString()}`}
                className={`min-w-[44px] min-h-[44px] px-4 py-3 rounded-lg font-medium flex items-center justify-center ${
                  p === pagination.page
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                aria-label={`Page ${p}${p === pagination.page ? ', current page' : ''}`}
                aria-current={p === pagination.page ? 'page' : undefined}
              >
                {p}
              </a>
            </div>
          );
        })}
    </nav>
  );
}
