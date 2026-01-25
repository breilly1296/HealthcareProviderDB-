/**
 * Debounce Utility
 * ================
 *
 * A flexible debounce implementation with cancel and flush capabilities.
 *
 * Debounce Strategy for Search:
 * -----------------------------
 * - Auto-search (typing): 450ms delay to reduce API calls while user types
 *   This balances responsiveness with efficiency - users typically pause
 *   between words, and 450ms catches most natural typing pauses.
 *
 * - Explicit search (button click): 0ms delay (immediate execution)
 *   When users explicitly click "Search", they expect immediate results.
 *
 * - Filter clear: Cancel any pending debounced calls
 *   Prevents stale searches from executing after filters are reset.
 *
 * Options:
 * - leading: Execute on the leading edge (first call)
 * - trailing: Execute on the trailing edge (after wait period) - default
 *
 * Example usage:
 * ```typescript
 * const debouncedSearch = debounce(search, 450);
 *
 * // Call debounced version (waits 450ms)
 * debouncedSearch();
 *
 * // Cancel pending execution
 * debouncedSearch.cancel();
 *
 * // Execute immediately if pending
 * debouncedSearch.flush();
 * ```
 */

export interface DebounceOptions {
  /** Execute on the leading edge of the timeout */
  leading?: boolean;
  /** Execute on the trailing edge of the timeout (default: true) */
  trailing?: boolean;
}

export interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): void;
  /** Cancel any pending debounced execution */
  cancel: () => void;
  /** Execute immediately if there's a pending call */
  flush: () => void;
  /** Check if there's a pending execution */
  pending: () => boolean;
}

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was invoked.
 *
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param options - Options for leading/trailing edge execution
 * @returns Debounced function with cancel, flush, and pending methods
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  options?: DebounceOptions
): DebouncedFunction<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: unknown = null;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;

  const { leading = false, trailing = true } = options || {};

  const invokeFunc = (time: number): void => {
    const args = lastArgs;
    const thisArg = lastThis;

    lastArgs = null;
    lastThis = null;
    lastInvokeTime = time;

    if (args) {
      func.apply(thisArg, args);
    }
  };

  const shouldInvoke = (time: number): boolean => {
    const timeSinceLastCall = lastCallTime === undefined ? wait : time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    // Either this is the first call, activity has stopped and we're at the
    // trailing edge, the system time has gone backwards, or we've hit the wait period
    return (
      lastCallTime === undefined ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      timeSinceLastInvoke >= wait
    );
  };

  const timerExpired = (): void => {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    // Restart the timer
    const timeSinceLastCall = lastCallTime ? time - lastCallTime : 0;
    const timeWaiting = wait - timeSinceLastCall;
    timeoutId = setTimeout(timerExpired, timeWaiting);
  };

  const trailingEdge = (time: number): void => {
    timeoutId = null;

    // Only invoke if we have `lastArgs` which means `func` has been
    // debounced at least once.
    if (trailing && lastArgs) {
      invokeFunc(time);
    } else {
      lastArgs = null;
      lastThis = null;
    }
  };

  const leadingEdge = (time: number): void => {
    // Reset any timeSinceLastInvoke timer
    lastInvokeTime = time;
    // Start the timer for the trailing edge
    timeoutId = setTimeout(timerExpired, wait);
    // Invoke the leading edge
    if (leading) {
      invokeFunc(time);
    }
  };

  const cancel = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    lastInvokeTime = 0;
    lastArgs = null;
    lastThis = null;
    lastCallTime = undefined;
    timeoutId = null;
  };

  const flush = (): void => {
    if (timeoutId === null) {
      return;
    }
    const time = Date.now();
    clearTimeout(timeoutId);
    timeoutId = null;
    if (lastArgs) {
      invokeFunc(time);
    }
  };

  const pending = (): boolean => {
    return timeoutId !== null;
  };

  const debounced = function (this: unknown, ...args: Parameters<T>): void {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timeoutId === null) {
        leadingEdge(time);
        return;
      }
    }

    if (timeoutId === null) {
      timeoutId = setTimeout(timerExpired, wait);
    }
  } as DebouncedFunction<T>;

  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.pending = pending;

  return debounced;
}

// ============================================================================
// Debounce Timing Constants
// ============================================================================

/**
 * Recommended debounce delay for search input (typing).
 * 450ms balances responsiveness with reducing unnecessary API calls.
 * Users typically pause 300-500ms between words when typing.
 */
export const SEARCH_DEBOUNCE_MS = 450;

/**
 * Immediate execution (no debounce) for explicit user actions like button clicks.
 */
export const IMMEDIATE_MS = 0;

export default debounce;
