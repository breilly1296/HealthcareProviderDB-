import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_COMPARE_PROVIDERS,
  MAX_RECENT_SEARCHES,
  CONFIDENCE_THRESHOLDS,
  FRESHNESS_THRESHOLDS,
  ACCEPTANCE_STATUS,
  ENTITY_TYPES,
} from '../constants';

describe('constants', () => {
  // ============================================================================
  // API and pagination constants
  // ============================================================================
  describe('API and pagination', () => {
    it('DEFAULT_PAGE_SIZE is 20', () => {
      expect(DEFAULT_PAGE_SIZE).toBe(20);
    });

    it('MAX_PAGE_SIZE is 100', () => {
      expect(MAX_PAGE_SIZE).toBe(100);
    });

    it('DEFAULT_PAGE_SIZE is less than MAX_PAGE_SIZE', () => {
      expect(DEFAULT_PAGE_SIZE).toBeLessThan(MAX_PAGE_SIZE);
    });
  });

  // ============================================================================
  // UI limits
  // ============================================================================
  describe('UI limits', () => {
    it('MAX_COMPARE_PROVIDERS is 3', () => {
      expect(MAX_COMPARE_PROVIDERS).toBe(3);
    });

    it('MAX_RECENT_SEARCHES is 5', () => {
      expect(MAX_RECENT_SEARCHES).toBe(5);
    });
  });

  // ============================================================================
  // CONFIDENCE_THRESHOLDS
  // ============================================================================
  describe('CONFIDENCE_THRESHOLDS', () => {
    it('has correct HIGH threshold (70)', () => {
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBe(70);
    });

    it('has correct MEDIUM threshold (40)', () => {
      expect(CONFIDENCE_THRESHOLDS.MEDIUM).toBe(40);
    });

    it('has correct LOW threshold (0)', () => {
      expect(CONFIDENCE_THRESHOLDS.LOW).toBe(0);
    });

    it('thresholds are in descending order', () => {
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBeGreaterThan(CONFIDENCE_THRESHOLDS.MEDIUM);
      expect(CONFIDENCE_THRESHOLDS.MEDIUM).toBeGreaterThan(CONFIDENCE_THRESHOLDS.LOW);
    });

    it('all thresholds are non-negative', () => {
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBeGreaterThanOrEqual(0);
      expect(CONFIDENCE_THRESHOLDS.MEDIUM).toBeGreaterThanOrEqual(0);
      expect(CONFIDENCE_THRESHOLDS.LOW).toBeGreaterThanOrEqual(0);
    });

    it('all thresholds are at most 100 (percentage)', () => {
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBeLessThanOrEqual(100);
      expect(CONFIDENCE_THRESHOLDS.MEDIUM).toBeLessThanOrEqual(100);
      expect(CONFIDENCE_THRESHOLDS.LOW).toBeLessThanOrEqual(100);
    });
  });

  // ============================================================================
  // FRESHNESS_THRESHOLDS
  // ============================================================================
  describe('FRESHNESS_THRESHOLDS', () => {
    it('has correct FRESH threshold (30 days)', () => {
      expect(FRESHNESS_THRESHOLDS.FRESH).toBe(30);
    });

    it('has correct STALE threshold (90 days)', () => {
      expect(FRESHNESS_THRESHOLDS.STALE).toBe(90);
    });

    it('has correct EXPIRED threshold (180 days)', () => {
      expect(FRESHNESS_THRESHOLDS.EXPIRED).toBe(180);
    });

    it('thresholds are in ascending order', () => {
      expect(FRESHNESS_THRESHOLDS.FRESH).toBeLessThan(FRESHNESS_THRESHOLDS.STALE);
      expect(FRESHNESS_THRESHOLDS.STALE).toBeLessThan(FRESHNESS_THRESHOLDS.EXPIRED);
    });

    it('all thresholds are positive', () => {
      expect(FRESHNESS_THRESHOLDS.FRESH).toBeGreaterThan(0);
      expect(FRESHNESS_THRESHOLDS.STALE).toBeGreaterThan(0);
      expect(FRESHNESS_THRESHOLDS.EXPIRED).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // ACCEPTANCE_STATUS
  // ============================================================================
  describe('ACCEPTANCE_STATUS', () => {
    it('has ACCEPTED status', () => {
      expect(ACCEPTANCE_STATUS.ACCEPTED).toBe('ACCEPTED');
    });

    it('has NOT_ACCEPTED status', () => {
      expect(ACCEPTANCE_STATUS.NOT_ACCEPTED).toBe('NOT_ACCEPTED');
    });

    it('has PENDING status', () => {
      expect(ACCEPTANCE_STATUS.PENDING).toBe('PENDING');
    });

    it('has UNKNOWN status', () => {
      expect(ACCEPTANCE_STATUS.UNKNOWN).toBe('UNKNOWN');
    });

    it('contains exactly 4 statuses', () => {
      expect(Object.keys(ACCEPTANCE_STATUS)).toHaveLength(4);
    });
  });

  // ============================================================================
  // ENTITY_TYPES
  // ============================================================================
  describe('ENTITY_TYPES', () => {
    it('has INDIVIDUAL type', () => {
      expect(ENTITY_TYPES.INDIVIDUAL).toBe('INDIVIDUAL');
    });

    it('has ORGANIZATION type', () => {
      expect(ENTITY_TYPES.ORGANIZATION).toBe('ORGANIZATION');
    });

    it('contains exactly 2 types', () => {
      expect(Object.keys(ENTITY_TYPES)).toHaveLength(2);
    });
  });
});
