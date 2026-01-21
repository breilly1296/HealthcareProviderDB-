interface ShimmerProps {
  className?: string;
}

/**
 * Shimmer loading effect component
 * Uses an animated gradient that sweeps left-to-right
 */
export function Shimmer({ className = '' }: ShimmerProps) {
  return (
    <div
      aria-hidden="true"
      className={`
        animate-shimmer
        bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200
        dark:from-gray-700 dark:via-gray-600 dark:to-gray-700
        bg-[length:200%_100%]
        rounded
        ${className}
      `}
    />
  );
}

/**
 * Shimmer text line - common pattern for text loading
 */
export function ShimmerLine({
  width = 'full',
  height = '4',
  className = '',
}: {
  width?: 'full' | '3/4' | '2/3' | '1/2' | '1/3' | '1/4' | string;
  height?: '3' | '4' | '5' | '6' | '7' | '8' | string;
  className?: string;
}) {
  const widthClass = width.includes('/') || width === 'full' ? `w-${width}` : width;
  const heightClass = height.match(/^\d+$/) ? `h-${height}` : height;

  return <Shimmer className={`${heightClass} ${widthClass} ${className}`} />;
}

/**
 * Shimmer circle - for avatars, icons, etc.
 */
export function ShimmerCircle({
  size = '10',
  className = '',
}: {
  size?: '6' | '8' | '10' | '12' | '16' | '20' | string;
  className?: string;
}) {
  const sizeClass = size.match(/^\d+$/) ? `w-${size} h-${size}` : size;

  return <Shimmer className={`${sizeClass} rounded-full ${className}`} />;
}

/**
 * Shimmer badge - for tags, status badges
 */
export function ShimmerBadge({ className = '' }: { className?: string }) {
  return <Shimmer className={`h-6 w-20 rounded-full ${className}`} />;
}

/**
 * Shimmer button - for action buttons
 */
export function ShimmerButton({ className = '' }: { className?: string }) {
  return <Shimmer className={`h-10 w-24 rounded-md ${className}`} />;
}
