import { Shimmer } from '@/components/ui/Shimmer';

export default function AboutLoading() {
  return (
    <div className="py-12 md:py-16" role="status" aria-label="Loading page">
      <span className="sr-only">Loading...</span>
      <div className="container-wide max-w-3xl" aria-hidden="true">
        {/* Title */}
        <Shimmer className="h-10 w-2/3 rounded mb-4" />
        <Shimmer className="h-5 w-full rounded mb-2" />
        <Shimmer className="h-5 w-3/4 rounded mb-8" />

        {/* Content sections */}
        <div className="space-y-6">
          <Shimmer className="h-7 w-1/3 rounded" />
          <Shimmer className="h-4 w-full rounded" />
          <Shimmer className="h-4 w-full rounded" />
          <Shimmer className="h-4 w-5/6 rounded" />
          <Shimmer className="h-4 w-2/3 rounded" />

          <Shimmer className="h-7 w-1/4 rounded mt-4" />
          <Shimmer className="h-4 w-full rounded" />
          <Shimmer className="h-4 w-full rounded" />
          <Shimmer className="h-4 w-3/4 rounded" />
        </div>
      </div>
    </div>
  );
}
