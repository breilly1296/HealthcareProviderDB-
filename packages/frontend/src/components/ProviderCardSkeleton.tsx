'use client';

interface ProviderCardSkeletonProps {
  count?: number;
  className?: string;
}

export default function ProviderCardSkeleton({ count = 3, className = '' }: ProviderCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={`card animate-pulse ${className}`}>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            {/* Provider Info */}
            <div className="flex-1 space-y-3">
              {/* Name */}
              <div className="h-7 bg-gray-200 rounded w-3/4" />

              {/* Specialty */}
              <div className="h-5 bg-gray-200 rounded w-1/2" />

              {/* Address */}
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            </div>

            {/* Right side - Confidence & NPI */}
            <div className="flex flex-col items-end gap-2">
              <div className="h-8 w-24 bg-gray-200 rounded-full" />
              <div className="h-4 w-32 bg-gray-200 rounded" />
            </div>
          </div>

          {/* Freshness Warning Placeholder */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
          </div>

          {/* View Details */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
            <div className="h-4 w-24 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

// Skeleton for provider detail page
export function ProviderDetailSkeleton() {
  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        {/* Breadcrumb Skeleton */}
        <div className="mb-6 flex items-center gap-2">
          <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Provider Header */}
            <div className="card animate-pulse">
              <div className="space-y-4">
                <div className="h-10 bg-gray-200 rounded w-3/4" />
                <div className="h-6 bg-gray-200 rounded w-1/2" />
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="space-y-2 mt-6">
                  <div className="h-4 bg-gray-200 rounded w-full" />
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            </div>

            {/* Accepted Plans */}
            <div className="card animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/2 mb-6" />
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-4 bg-gray-200 rounded w-1/2" />
                    </div>
                    <div className="h-32 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6 animate-pulse">
            <div className="card h-64 bg-gray-100" />
            <div className="card h-48 bg-gray-100" />
            <div className="card h-40 bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact skeleton for listings
export function ProviderCardSkeletonCompact({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg animate-pulse">
          <div className="space-y-2">
            <div className="h-5 bg-gray-200 rounded w-40" />
            <div className="h-4 bg-gray-200 rounded w-24" />
          </div>
          <div className="h-4 w-16 bg-gray-200 rounded" />
        </div>
      ))}
    </>
  );
}
