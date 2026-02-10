/**
 * Utility functions for the frontend
 */

/**
 * Conditionally join class names together.
 * Filters out falsy values and joins the rest with spaces.
 *
 * @example
 * cn('base-class', isActive && 'active', className)
 * // => 'base-class active custom-class'
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ============================================================================
// Dynamic Style Helpers
// ============================================================================
// These helpers create inline style objects for dynamic values that can't be
// expressed as Tailwind classes. They improve code readability and type safety.

/**
 * Creates a width style object for progress bars.
 * Clamps the percentage between 0 and 100.
 *
 * @example
 * <div style={progressWidth(75)} />
 * // => { width: '75%' }
 */
export function progressWidth(percentage: number): React.CSSProperties {
  return { width: `${Math.min(100, Math.max(0, percentage))}%` };
}

/**
 * Creates a max-height style object.
 * Useful for scrollable containers with dynamic heights.
 *
 * @example
 * <div style={maxHeightStyle(300)} />
 * // => { maxHeight: 300 }
 */
export function maxHeightStyle(maxHeight: number | string): React.CSSProperties {
  return { maxHeight };
}
