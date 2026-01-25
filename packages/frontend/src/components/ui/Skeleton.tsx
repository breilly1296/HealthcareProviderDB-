/**
 * Base Skeleton Component
 * =======================
 *
 * A flexible skeleton loading component for consistent loading states.
 *
 * This component provides a simple pulse animation for loading placeholders.
 * For a more visually appealing shimmer effect, use the Shimmer component instead.
 *
 * Usage:
 * ------
 * ```tsx
 * // Basic rectangular skeleton
 * <Skeleton className="h-4 w-full" />
 *
 * // Circular skeleton (for avatars)
 * <Skeleton variant="circular" className="w-10 h-10" />
 *
 * // Text skeleton (rounded, h-4 by default)
 * <Skeleton variant="text" className="w-3/4" />
 *
 * // With explicit dimensions
 * <Skeleton width={200} height={40} />
 *
 * // Without animation (for static placeholders)
 * <Skeleton animate={false} className="h-20 w-full" />
 * ```
 *
 * Accessibility:
 * --------------
 * - All skeletons have aria-hidden="true" by default
 * - Parent containers should have role="status" and aria-label
 * - Include a sr-only span for screen reader users
 *
 * @example
 * ```tsx
 * <div role="status" aria-label="Loading content">
 *   <span className="sr-only">Loading...</span>
 *   <Skeleton className="h-8 w-full" />
 * </div>
 * ```
 */

import { cn } from '@/lib/utils';

export interface SkeletonProps {
  /** Additional CSS classes */
  className?: string;
  /** Skeleton shape variant */
  variant?: 'text' | 'circular' | 'rectangular';
  /** Explicit width (number = pixels, string = CSS value) */
  width?: string | number;
  /** Explicit height (number = pixels, string = CSS value) */
  height?: string | number;
  /** Enable pulse animation (default: true) */
  animate?: boolean;
}

/**
 * Base skeleton component with pulse animation.
 * Use Shimmer for gradient-based shimmer effect.
 */
export function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
  animate = true,
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-gray-200 dark:bg-gray-700',
        animate && 'animate-pulse',
        variant === 'circular' && 'rounded-full',
        variant === 'text' && 'rounded h-4',
        variant === 'rectangular' && 'rounded-md',
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Text line skeleton - common pattern for text loading
 */
export function SkeletonText({
  lines = 1,
  className,
  lastLineWidth = '75%',
}: {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className="h-4"
          width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  );
}

/**
 * Avatar skeleton - circular placeholder for profile images
 */
export function SkeletonAvatar({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <Skeleton
      variant="circular"
      className={cn(sizeClasses[size], className)}
    />
  );
}

/**
 * Button skeleton - placeholder for action buttons
 */
export function SkeletonButton({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'h-8 w-16',
    md: 'h-10 w-24',
    lg: 'h-12 w-32',
  };

  return (
    <Skeleton className={cn(sizeClasses[size], 'rounded-lg', className)} />
  );
}

/**
 * Card skeleton - placeholder for card content
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('card', className)} aria-hidden="true">
      <div className="space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export default Skeleton;
