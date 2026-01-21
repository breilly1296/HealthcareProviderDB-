'use client';

import { Shimmer } from './ui/Shimmer';

interface ProviderCardSkeletonProps {
  count?: number;
  className?: string;
}

export default function ProviderCardSkeleton({ count = 3, className = '' }: ProviderCardSkeletonProps) {
  return (
    <div role="status" aria-label="Loading search results">
      <span className="sr-only">Loading results...</span>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={`card mb-4 ${className}`} aria-hidden="true">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            {/* Provider Info */}
            <div className="flex-1 space-y-3">
              {/* Name */}
              <Shimmer className="h-7 w-3/4 rounded" />

              {/* Specialty */}
              <Shimmer className="h-5 w-1/2 rounded" />

              {/* Address */}
              <div className="space-y-2">
                <Shimmer className="h-4 w-full rounded" />
                <Shimmer className="h-4 w-2/3 rounded" />
                <Shimmer className="h-4 w-1/2 rounded" />
              </div>
            </div>

            {/* Right side - Confidence & NPI */}
            <div className="flex flex-col items-end gap-2">
              <Shimmer className="h-8 w-24 rounded-full" />
              <Shimmer className="h-4 w-32 rounded" />
            </div>
          </div>

          {/* Freshness Warning Placeholder */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Shimmer className="h-4 w-3/4 rounded" />
          </div>

          {/* View Details */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
            <Shimmer className="h-4 w-24 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Skeleton for provider detail page
export function ProviderDetailSkeleton() {
  return (
    <div className="py-8 md:py-12" role="status" aria-label="Loading provider details">
      <span className="sr-only">Loading provider details...</span>
      <div className="container-wide" aria-hidden="true">
        {/* Breadcrumb Skeleton */}
        <div className="mb-6 flex items-center gap-2">
          <Shimmer className="h-4 w-12 rounded" />
          <Shimmer className="h-4 w-4 rounded" />
          <Shimmer className="h-4 w-16 rounded" />
          <Shimmer className="h-4 w-4 rounded" />
          <Shimmer className="h-4 w-32 rounded" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Provider Header */}
            <div className="card">
              <div className="space-y-4">
                <Shimmer className="h-10 w-3/4 rounded" />
                <Shimmer className="h-6 w-1/2 rounded" />
                <Shimmer className="h-4 w-1/3 rounded" />
                <div className="space-y-2 mt-6">
                  <Shimmer className="h-4 w-full rounded" />
                  <Shimmer className="h-4 w-2/3 rounded" />
                  <Shimmer className="h-4 w-1/2 rounded" />
                </div>
              </div>
            </div>

            {/* Accepted Plans */}
            <div className="card">
              <Shimmer className="h-8 w-1/2 rounded mb-6" />
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <Shimmer className="h-5 w-3/4 rounded mb-2" />
                      <Shimmer className="h-4 w-1/2 rounded" />
                    </div>
                    <Shimmer className="h-32 w-full rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="card">
              <Shimmer className="h-64 w-full rounded" />
            </div>
            <div className="card">
              <Shimmer className="h-48 w-full rounded" />
            </div>
            <div className="card">
              <Shimmer className="h-40 w-full rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact skeleton for listings
export function ProviderCardSkeletonCompact({ count = 1 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading">
      <span className="sr-only">Loading...</span>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-2" aria-hidden="true">
          <div className="space-y-2">
            <Shimmer className="h-5 w-40 rounded" />
            <Shimmer className="h-4 w-24 rounded" />
          </div>
          <Shimmer className="h-4 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

// Skeleton for search results header
export function SearchResultsHeaderSkeleton() {
  return (
    <div className="mb-4" aria-hidden="true">
      <Shimmer className="h-5 w-48 rounded" />
    </div>
  );
}

// Combined search results skeleton with header and cards
export function SearchResultsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" aria-label="Loading search results">
      <span className="sr-only">Loading search results...</span>
      <div aria-hidden="true">
        {/* Results count header */}
        <SearchResultsHeaderSkeleton />

        {/* Disclaimer banner skeleton */}
        <div className="mb-6 p-3 rounded-lg">
          <Shimmer className="h-4 w-full rounded mb-1" />
          <Shimmer className="h-4 w-3/4 rounded" />
        </div>

        {/* Provider cards */}
        <div className="space-y-4">
          {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="card">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                {/* Provider Info */}
                <div className="flex-1 space-y-3">
                  <Shimmer className="h-7 w-3/4 rounded" />
                  <Shimmer className="h-5 w-1/2 rounded" />
                  <div className="space-y-2">
                    <Shimmer className="h-4 w-full rounded" />
                    <Shimmer className="h-4 w-2/3 rounded" />
                    <Shimmer className="h-4 w-1/2 rounded" />
                  </div>
                </div>

                {/* Right side */}
                <div className="flex flex-col items-end gap-2">
                  <Shimmer className="h-8 w-24 rounded-full" />
                  <Shimmer className="h-4 w-32 rounded" />
                </div>
              </div>

              {/* Freshness Warning */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <Shimmer className="h-4 w-3/4 rounded" />
              </div>

              {/* View Details */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                <Shimmer className="h-4 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Skeleton for dropdown loading (insurance plans, cities, etc.)
export function DropdownLoadingSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="p-2 space-y-2" role="status" aria-label="Loading options">
      <span className="sr-only">Loading options...</span>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="px-3 py-2" aria-hidden="true">
          <Shimmer className="h-5 w-full rounded" />
        </div>
      ))}
    </div>
  );
}
