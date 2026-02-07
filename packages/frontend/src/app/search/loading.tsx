import { Shimmer } from '@/components/ui/Shimmer';
import { SearchResultsSkeleton } from '@/components/ProviderCardSkeleton';

export default function SearchLoading() {
  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        {/* Search form skeleton */}
        <div className="card mb-8" aria-hidden="true">
          <div className="space-y-4">
            <Shimmer className="h-6 w-48 rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Shimmer className="h-10 w-full rounded" />
              <Shimmer className="h-10 w-full rounded" />
              <Shimmer className="h-10 w-full rounded" />
              <Shimmer className="h-10 w-full rounded" />
            </div>
            <div className="flex justify-end">
              <Shimmer className="h-10 w-32 rounded" />
            </div>
          </div>
        </div>

        {/* Results skeleton */}
        <SearchResultsSkeleton count={6} />
      </div>
    </div>
  );
}
