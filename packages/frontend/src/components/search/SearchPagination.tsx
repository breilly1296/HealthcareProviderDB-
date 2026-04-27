'use client';

import Link from 'next/link';
import type { PaginationState } from '@/types';

interface SearchPaginationProps {
  pagination: PaginationState;
  currentParams: URLSearchParams;
}

// Build the windowed list of page numbers to render: always include the
// first page, the last page, and a band of ±2 around the current page.
// Caller decides where ellipses go.
function buildPageWindow(currentPage: number, totalPages: number): number[] {
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages, currentPage + 2); p++) {
    pages.add(p);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

function buildHref(currentParams: URLSearchParams, page: number): string {
  const params = new URLSearchParams(currentParams);
  params.set('page', String(page));
  return `/search?${params.toString()}`;
}

const BUTTON_BASE =
  'min-w-[44px] min-h-[44px] px-4 py-3 rounded-lg font-medium flex items-center justify-center transition-colors';
const BUTTON_INACTIVE =
  'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600';
const BUTTON_DISABLED =
  'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed';

export function SearchPagination({ pagination, currentParams }: SearchPaginationProps) {
  if (pagination.totalPages <= 1) return null;

  const { page: currentPage, totalPages } = pagination;
  const pages = buildPageWindow(currentPage, totalPages);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav
      aria-label="Search results pagination"
      className="mt-8 flex flex-col items-center gap-3"
    >
      <p className="text-sm text-stone-600 dark:text-gray-300">
        Page <strong className="text-stone-800 dark:text-white">{currentPage.toLocaleString()}</strong>{' '}
        of <strong className="text-stone-800 dark:text-white">{totalPages.toLocaleString()}</strong>
      </p>

      <div className="flex flex-wrap justify-center items-center gap-2">
        {hasPrev ? (
          <Link
            href={buildHref(currentParams, currentPage - 1)}
            className={`${BUTTON_BASE} ${BUTTON_INACTIVE}`}
            aria-label="Previous page"
            rel="prev"
          >
            ← Previous
          </Link>
        ) : (
          <span className={`${BUTTON_BASE} ${BUTTON_DISABLED}`} aria-hidden="true">
            ← Previous
          </span>
        )}

        {pages.map((p, idx) => {
          const prevP = pages[idx - 1];
          const showEllipsis = prevP !== undefined && p - prevP > 1;
          const isCurrent = p === currentPage;

          return (
            <div key={p} className="flex items-center gap-2">
              {showEllipsis && (
                <span className="px-2 text-gray-400 dark:text-gray-500" aria-hidden="true">…</span>
              )}
              <Link
                href={buildHref(currentParams, p)}
                className={`${BUTTON_BASE} ${
                  isCurrent ? 'bg-primary-600 text-white' : BUTTON_INACTIVE
                }`}
                aria-label={`Page ${p}${isCurrent ? ', current page' : ''}`}
                aria-current={isCurrent ? 'page' : undefined}
              >
                {p}
              </Link>
            </div>
          );
        })}

        {hasNext ? (
          <Link
            href={buildHref(currentParams, currentPage + 1)}
            className={`${BUTTON_BASE} ${BUTTON_INACTIVE}`}
            aria-label="Next page"
            rel="next"
          >
            Next →
          </Link>
        ) : (
          <span className={`${BUTTON_BASE} ${BUTTON_DISABLED}`} aria-hidden="true">
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
