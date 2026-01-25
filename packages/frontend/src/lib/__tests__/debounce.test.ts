import { debounce, SEARCH_DEBOUNCE_MS, IMMEDIATE_MS } from '../debounce';

describe('debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ============================================================================
  // Basic debounce behavior
  // ============================================================================
  describe('basic debounce', () => {
    it('delays function execution by specified wait time', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('only executes once for multiple rapid calls', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced();
      debounced();

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('resets timer on each call within the wait window', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      jest.advanceTimersByTime(30);
      expect(fn).not.toHaveBeenCalled();

      debounced(); // Reset timer
      jest.advanceTimersByTime(30);
      expect(fn).not.toHaveBeenCalled();

      debounced(); // Reset timer again
      jest.advanceTimersByTime(30);
      expect(fn).not.toHaveBeenCalled();

      // After 90ms total, still within wait window from last call
      // Now advance to complete the 100ms wait from last call
      jest.advanceTimersByTime(70);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes arguments to the debounced function', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced('arg1', 'arg2');
      jest.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('uses the last arguments when called multiple times', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced('first');
      debounced('second');
      debounced('third');

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith('third');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // cancel()
  // ============================================================================
  describe('cancel', () => {
    it('cancels pending execution', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(debounced.pending()).toBe(true);

      debounced.cancel();
      expect(debounced.pending()).toBe(false);

      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });

    it('can be called safely when nothing is pending', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      expect(() => debounced.cancel()).not.toThrow();
    });

    it('allows new calls after cancellation', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced('first');
      debounced.cancel();

      debounced('second');
      jest.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('second');
    });
  });

  // ============================================================================
  // flush()
  // ============================================================================
  describe('flush', () => {
    it('executes pending call immediately', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced('flushed');
      expect(fn).not.toHaveBeenCalled();

      debounced.flush();
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('flushed');
    });

    it('does nothing when no call is pending', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced.flush();
      expect(fn).not.toHaveBeenCalled();
    });

    it('clears the pending state after flush', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(debounced.pending()).toBe(true);

      debounced.flush();
      expect(debounced.pending()).toBe(false);

      // Should not execute again after the wait period
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // pending()
  // ============================================================================
  describe('pending', () => {
    it('returns false when no call is pending', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      expect(debounced.pending()).toBe(false);
    });

    it('returns true when a call is pending', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(debounced.pending()).toBe(true);
    });

    it('returns false after execution', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      jest.advanceTimersByTime(100);

      expect(debounced.pending()).toBe(false);
    });
  });

  // ============================================================================
  // Leading edge option
  // ============================================================================
  describe('leading option', () => {
    it('executes immediately on leading edge when leading=true', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100, { leading: true });

      debounced('immediate');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('immediate');
    });

    it('still debounces subsequent calls with leading=true', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100, { leading: true });

      debounced('first');
      expect(fn).toHaveBeenCalledTimes(1);

      debounced('second');
      expect(fn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith('second');
    });

    it('with leading=true and trailing=false, only executes on leading edge', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100, { leading: true, trailing: false });

      debounced('first');
      expect(fn).toHaveBeenCalledTimes(1);

      debounced('second');
      debounced('third');

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('first');
    });
  });

  // ============================================================================
  // Trailing edge option
  // ============================================================================
  describe('trailing option', () => {
    it('does not execute on trailing edge when trailing=false', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100, { trailing: false });

      debounced();
      jest.advanceTimersByTime(100);

      expect(fn).not.toHaveBeenCalled();
    });

    it('executes on trailing edge by default', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      jest.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Constants
  // ============================================================================
  describe('constants', () => {
    it('SEARCH_DEBOUNCE_MS is 450ms', () => {
      expect(SEARCH_DEBOUNCE_MS).toBe(450);
    });

    it('IMMEDIATE_MS is 0ms', () => {
      expect(IMMEDIATE_MS).toBe(0);
    });
  });

  // ============================================================================
  // Edge cases
  // ============================================================================
  describe('edge cases', () => {
    it('handles zero wait time', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 0);

      debounced();
      jest.advanceTimersByTime(0);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('preserves `this` context', () => {
      const obj = {
        value: 'test',
        method: jest.fn(function (this: { value: string }) {
          return this.value;
        }),
      };

      const debounced = debounce(obj.method, 100);
      debounced.call(obj);

      jest.advanceTimersByTime(100);
      expect(obj.method).toHaveBeenCalled();
    });
  });
});
