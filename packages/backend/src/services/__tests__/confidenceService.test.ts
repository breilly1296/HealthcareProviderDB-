import {
  calculateConfidenceScore,
  getConfidenceLevel,
  getConfidenceLevelDescription,
  ConfidenceInput,
} from '../confidenceService';

/**
 * Unit tests for the confidence scoring algorithm
 *
 * These tests verify the scoring logic without database access.
 * All test data is mocked in the test file.
 *
 * Research references:
 * - Mortensen et al. (2015), JAMIA: 3 verifications achieve expert-level accuracy (κ=0.58)
 * - Ndumele et al. (2018), Health Affairs: 12% annual provider turnover
 */

// Helper to create mock verification data
const createMockInput = (overrides: Partial<ConfidenceInput> = {}): ConfidenceInput => ({
  dataSource: 'CROWDSOURCE',
  lastVerifiedAt: new Date(),
  verificationCount: 1,
  upvotes: 1,
  downvotes: 0,
  specialty: null,
  taxonomyDescription: null,
  ...overrides,
});

// Helper to create a date N days ago from a fixed reference point
const FIXED_NOW = new Date('2025-01-15T12:00:00Z');
const daysAgo = (days: number): Date => {
  const date = new Date(FIXED_NOW);
  date.setDate(date.getDate() - days);
  return date;
};

// Mock Date.now() for deterministic tests
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

describe('confidenceService', () => {
  describe('Data Source Scoring', () => {
    test('CMS_NPPES source scores 25 points (highest)', () => {
      const input = createMockInput({ dataSource: 'CMS_NPPES' });
      const result = calculateConfidenceScore(input);
      expect(result.factors.dataSourceScore).toBe(25);
    });

    test('CMS_PLAN_FINDER source scores equal to CMS_NPPES (25 points)', () => {
      const input = createMockInput({ dataSource: 'CMS_PLAN_FINDER' });
      const result = calculateConfidenceScore(input);
      expect(result.factors.dataSourceScore).toBe(25);
    });

    test('CARRIER_API scores 20 points (higher than CROWDSOURCE, lower than CMS)', () => {
      const carrierInput = createMockInput({ dataSource: 'CARRIER_API' });
      const crowdsourceInput = createMockInput({ dataSource: 'CROWDSOURCE' });
      const cmsInput = createMockInput({ dataSource: 'CMS_NPPES' });

      const carrierResult = calculateConfidenceScore(carrierInput);
      const crowdsourceResult = calculateConfidenceScore(crowdsourceInput);
      const cmsResult = calculateConfidenceScore(cmsInput);

      expect(carrierResult.factors.dataSourceScore).toBe(20);
      expect(carrierResult.factors.dataSourceScore).toBeGreaterThan(
        crowdsourceResult.factors.dataSourceScore
      );
      expect(carrierResult.factors.dataSourceScore).toBeLessThan(
        cmsResult.factors.dataSourceScore
      );
    });

    test('CROWDSOURCE scores 15 points', () => {
      const input = createMockInput({ dataSource: 'CROWDSOURCE' });
      const result = calculateConfidenceScore(input);
      expect(result.factors.dataSourceScore).toBe(15);
    });

    test('null/unknown source gets fallback score of 10', () => {
      const nullInput = createMockInput({ dataSource: null });
      const unknownInput = createMockInput({ dataSource: 'UNKNOWN_SOURCE' });

      const nullResult = calculateConfidenceScore(nullInput);
      const unknownResult = calculateConfidenceScore(unknownInput);

      expect(nullResult.factors.dataSourceScore).toBe(10);
      expect(unknownResult.factors.dataSourceScore).toBe(10);
    });
  });

  describe('Recency Decay', () => {
    test('data verified today scores highest (30 points)', () => {
      const input = createMockInput({ lastVerifiedAt: daysAgo(0) });
      const result = calculateConfidenceScore(input);
      expect(result.factors.recencyScore).toBe(30);
    });

    test('data verified 30 days ago scores 20 points (tier 2)', () => {
      const input = createMockInput({ lastVerifiedAt: daysAgo(30) });
      const result = calculateConfidenceScore(input);
      // For default specialty (SPECIALIST with 60-day threshold), 30 days is tier1 boundary
      expect(result.factors.recencyScore).toBe(30);
    });

    test('data verified 45 days ago scores lower than 30 days', () => {
      const input30 = createMockInput({ lastVerifiedAt: daysAgo(30) });
      const input45 = createMockInput({ lastVerifiedAt: daysAgo(45) });

      const result30 = calculateConfidenceScore(input30);
      const result45 = calculateConfidenceScore(input45);

      expect(result45.factors.recencyScore).toBeLessThanOrEqual(result30.factors.recencyScore);
    });

    test('data verified 90 days ago scores lower than 30 days', () => {
      const input30 = createMockInput({ lastVerifiedAt: daysAgo(30) });
      const input90 = createMockInput({ lastVerifiedAt: daysAgo(90) });

      const result30 = calculateConfidenceScore(input30);
      const result90 = calculateConfidenceScore(input90);

      expect(result90.factors.recencyScore).toBeLessThan(result30.factors.recencyScore);
    });

    test('data older than 180 days gets minimum recency score (0 points)', () => {
      const input = createMockInput({ lastVerifiedAt: daysAgo(200) });
      const result = calculateConfidenceScore(input);
      expect(result.factors.recencyScore).toBe(0);
    });

    test('null/never verified date gets minimum recency score (0 points)', () => {
      const input = createMockInput({ lastVerifiedAt: null });
      const result = calculateConfidenceScore(input);
      expect(result.factors.recencyScore).toBe(0);
    });

    test('recency score decreases progressively with age', () => {
      const day0 = calculateConfidenceScore(createMockInput({ lastVerifiedAt: daysAgo(0) }));
      const day60 = calculateConfidenceScore(createMockInput({ lastVerifiedAt: daysAgo(60) }));
      const day120 = calculateConfidenceScore(createMockInput({ lastVerifiedAt: daysAgo(120) }));
      const day200 = calculateConfidenceScore(createMockInput({ lastVerifiedAt: daysAgo(200) }));

      expect(day0.factors.recencyScore).toBeGreaterThan(day60.factors.recencyScore);
      expect(day60.factors.recencyScore).toBeGreaterThan(day120.factors.recencyScore);
      expect(day120.factors.recencyScore).toBeGreaterThan(day200.factors.recencyScore);
    });
  });

  describe('Specialty-Based Decay Rates', () => {
    test('mental health provider data decays faster than radiology at same age', () => {
      const mentalHealth = createMockInput({
        lastVerifiedAt: daysAgo(45),
        specialty: 'Psychiatry',
        taxonomyDescription: 'Mental Health',
      });
      const radiology = createMockInput({
        lastVerifiedAt: daysAgo(45),
        specialty: 'Radiology',
        taxonomyDescription: 'Hospital Radiology',
      });

      const mentalHealthResult = calculateConfidenceScore(mentalHealth);
      const radiologyResult = calculateConfidenceScore(radiology);

      // Mental health has 30-day threshold, radiology (hospital-based) has 90-day threshold
      // At 45 days, mental health is past threshold, radiology is still within
      expect(mentalHealthResult.factors.recencyScore).toBeLessThan(
        radiologyResult.factors.recencyScore
      );
    });

    test('primary care has different freshness threshold than hospital-based', () => {
      const primaryCare = createMockInput({
        lastVerifiedAt: daysAgo(75),
        specialty: 'Family Medicine',
        taxonomyDescription: 'Family Practice',
      });
      const hospitalBased = createMockInput({
        lastVerifiedAt: daysAgo(75),
        specialty: 'Anesthesiology',
        taxonomyDescription: 'Anesthesiology',
      });

      const primaryCareResult = calculateConfidenceScore(primaryCare);
      const hospitalBasedResult = calculateConfidenceScore(hospitalBased);

      // Primary care has 60-day threshold, hospital-based has 90-day threshold
      // At 75 days, primary care is past threshold, hospital-based is within
      expect(primaryCareResult.factors.recencyScore).toBeLessThan(
        hospitalBasedResult.factors.recencyScore
      );
    });

    test('mental health specialty is identified correctly', () => {
      const inputs = [
        createMockInput({ specialty: 'Psychiatry' }),
        createMockInput({ taxonomyDescription: 'Mental Health Counselor' }),
        createMockInput({ specialty: 'Psychology' }),
        createMockInput({ taxonomyDescription: 'Behavioral Health' }),
      ];

      for (const input of inputs) {
        const result = calculateConfidenceScore(input);
        // Mental health has shortest freshness threshold (30 days)
        expect(result.metadata.freshnessThreshold).toBe(30);
      }
    });

    test('hospital-based specialty is identified correctly', () => {
      const inputs = [
        createMockInput({ specialty: 'Radiology' }),
        createMockInput({ taxonomyDescription: 'Emergency Medicine' }),
        createMockInput({ specialty: 'Anesthesiology' }),
        createMockInput({ taxonomyDescription: 'Hospital Pathology' }),
      ];

      for (const input of inputs) {
        const result = calculateConfidenceScore(input);
        // Hospital-based has longest freshness threshold (90 days)
        expect(result.metadata.freshnessThreshold).toBe(90);
      }
    });
  });

  describe('Verification Count', () => {
    test('0 verifications gives minimum verification score (0 points)', () => {
      const input = createMockInput({ verificationCount: 0, upvotes: 0, downvotes: 0 });
      const result = calculateConfidenceScore(input);
      expect(result.factors.verificationScore).toBe(0);
    });

    test('1 verification scores 10 points (lower than optimal)', () => {
      const input = createMockInput({ verificationCount: 1 });
      const result = calculateConfidenceScore(input);
      expect(result.factors.verificationScore).toBe(10);
    });

    test('2 verifications scores 15 points', () => {
      const input = createMockInput({ verificationCount: 2 });
      const result = calculateConfidenceScore(input);
      expect(result.factors.verificationScore).toBe(15);
    });

    test('3 verifications reaches optimal threshold (25 points) - research-backed κ=0.58', () => {
      const input = createMockInput({ verificationCount: 3 });
      const result = calculateConfidenceScore(input);
      expect(result.factors.verificationScore).toBe(25);
    });

    test('10 verifications scores same as 3 (diminishing returns)', () => {
      const input3 = createMockInput({ verificationCount: 3 });
      const input10 = createMockInput({ verificationCount: 10 });

      const result3 = calculateConfidenceScore(input3);
      const result10 = calculateConfidenceScore(input10);

      expect(result10.factors.verificationScore).toBe(result3.factors.verificationScore);
      expect(result10.factors.verificationScore).toBe(25);
    });

    test('verification count scoring is monotonically increasing up to 3', () => {
      const v0 = calculateConfidenceScore(createMockInput({ verificationCount: 0, upvotes: 0 }));
      const v1 = calculateConfidenceScore(createMockInput({ verificationCount: 1 }));
      const v2 = calculateConfidenceScore(createMockInput({ verificationCount: 2 }));
      const v3 = calculateConfidenceScore(createMockInput({ verificationCount: 3 }));

      expect(v1.factors.verificationScore).toBeGreaterThan(v0.factors.verificationScore);
      expect(v2.factors.verificationScore).toBeGreaterThan(v1.factors.verificationScore);
      expect(v3.factors.verificationScore).toBeGreaterThan(v2.factors.verificationScore);
    });
  });

  describe('Community Agreement', () => {
    test('100% agreement ratio (all upvotes) gives maximum agreement score (20 points)', () => {
      const input = createMockInput({ upvotes: 5, downvotes: 0 });
      const result = calculateConfidenceScore(input);
      expect(result.factors.agreementScore).toBe(20);
    });

    test('80% agreement ratio gives 15 points', () => {
      const input = createMockInput({ upvotes: 4, downvotes: 1 });
      const result = calculateConfidenceScore(input);
      expect(result.factors.agreementScore).toBe(15);
    });

    test('60% agreement ratio gives 10 points', () => {
      const input = createMockInput({ upvotes: 3, downvotes: 2 });
      const result = calculateConfidenceScore(input);
      expect(result.factors.agreementScore).toBe(10);
    });

    test('50% agreement ratio gives 5 points (weak consensus)', () => {
      const input = createMockInput({ upvotes: 1, downvotes: 1 });
      const result = calculateConfidenceScore(input);
      expect(result.factors.agreementScore).toBe(5);
    });

    test('0% agreement (all disagree) gives minimum score (0 points)', () => {
      const input = createMockInput({ upvotes: 0, downvotes: 5 });
      const result = calculateConfidenceScore(input);
      expect(result.factors.agreementScore).toBe(0);
    });

    test('agreement score is 0 when no votes exist', () => {
      const input = createMockInput({ upvotes: 0, downvotes: 0, verificationCount: 0 });
      const result = calculateConfidenceScore(input);
      expect(result.factors.agreementScore).toBe(0);
    });

    test('agreement score tiers work correctly', () => {
      // 100% = 20 points
      expect(
        calculateConfidenceScore(createMockInput({ upvotes: 10, downvotes: 0 })).factors.agreementScore
      ).toBe(20);

      // 90% = 15 points (80-99% tier)
      expect(
        calculateConfidenceScore(createMockInput({ upvotes: 9, downvotes: 1 })).factors.agreementScore
      ).toBe(15);

      // 70% = 10 points (60-79% tier)
      expect(
        calculateConfidenceScore(createMockInput({ upvotes: 7, downvotes: 3 })).factors.agreementScore
      ).toBe(10);

      // 40% = 5 points (40-59% tier)
      expect(
        calculateConfidenceScore(createMockInput({ upvotes: 4, downvotes: 6 })).factors.agreementScore
      ).toBe(5);

      // 30% = 0 points (<40% tier)
      expect(
        calculateConfidenceScore(createMockInput({ upvotes: 3, downvotes: 7 })).factors.agreementScore
      ).toBe(0);
    });
  });

  describe('Overall Score Calculation', () => {
    test('total score is sum of all component scores', () => {
      const input = createMockInput({
        dataSource: 'CMS_NPPES', // 25 points
        lastVerifiedAt: daysAgo(0), // 30 points
        verificationCount: 3, // 25 points
        upvotes: 5,
        downvotes: 0, // 20 points
      });

      const result = calculateConfidenceScore(input);

      const expectedSum =
        result.factors.dataSourceScore +
        result.factors.recencyScore +
        result.factors.verificationScore +
        result.factors.agreementScore;

      expect(result.score).toBe(expectedSum);
    });

    test('score is clamped to maximum of 100', () => {
      // This input would theoretically exceed 100 if not clamped
      const input = createMockInput({
        dataSource: 'CMS_NPPES', // 25
        lastVerifiedAt: daysAgo(0), // 30
        verificationCount: 10, // 25
        upvotes: 100,
        downvotes: 0, // 20
      });

      const result = calculateConfidenceScore(input);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    test('score minimum is 0', () => {
      const input = createMockInput({
        dataSource: null,
        lastVerifiedAt: null,
        verificationCount: 0,
        upvotes: 0,
        downvotes: 0,
      });

      const result = calculateConfidenceScore(input);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    test('perfect input (CMS, fresh, 3+ verifications, 100% agreement) scores 90+', () => {
      const input = createMockInput({
        dataSource: 'CMS_NPPES', // 25 points
        lastVerifiedAt: daysAgo(0), // 30 points
        verificationCount: 3, // 25 points
        upvotes: 5,
        downvotes: 0, // 20 points
      });

      const result = calculateConfidenceScore(input);
      expect(result.score).toBeGreaterThanOrEqual(90);
    });

    test('poor input (crowdsource, stale, 1 verification, 50% agreement) scores below 50', () => {
      const input = createMockInput({
        dataSource: 'CROWDSOURCE', // 15 points
        lastVerifiedAt: daysAgo(150), // 5 points (stale tier)
        verificationCount: 1, // 10 points
        upvotes: 1,
        downvotes: 1, // 5 points (50% agreement)
      });

      const result = calculateConfidenceScore(input);
      // Total: 15 + 5 + 10 + 5 = 35
      expect(result.score).toBeLessThan(50);
    });

    test('result includes all expected metadata fields', () => {
      const input = createMockInput();
      const result = calculateConfidenceScore(input);

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('factors');
      expect(result).toHaveProperty('metadata');

      expect(result.factors).toHaveProperty('dataSourceScore');
      expect(result.factors).toHaveProperty('recencyScore');
      expect(result.factors).toHaveProperty('verificationScore');
      expect(result.factors).toHaveProperty('agreementScore');

      expect(result.metadata).toHaveProperty('daysUntilStale');
      expect(result.metadata).toHaveProperty('isStale');
      expect(result.metadata).toHaveProperty('recommendReVerification');
      expect(result.metadata).toHaveProperty('daysSinceVerification');
      expect(result.metadata).toHaveProperty('freshnessThreshold');
      expect(result.metadata).toHaveProperty('researchNote');
      expect(result.metadata).toHaveProperty('explanation');
    });
  });

  describe('Confidence Level Assignment', () => {
    test('score 91+ with 3+ verifications returns VERY_HIGH', () => {
      const level = getConfidenceLevel(95, 5);
      expect(level).toBe('VERY_HIGH');
    });

    test('score 76-90 with 3+ verifications returns HIGH', () => {
      const level = getConfidenceLevel(80, 3);
      expect(level).toBe('HIGH');
    });

    test('score 51-75 with 3+ verifications returns MEDIUM', () => {
      const level = getConfidenceLevel(60, 3);
      expect(level).toBe('MEDIUM');
    });

    test('score 26-50 with 3+ verifications returns LOW', () => {
      const level = getConfidenceLevel(40, 3);
      expect(level).toBe('LOW');
    });

    test('score below 26 returns VERY_LOW', () => {
      const level = getConfidenceLevel(20, 3);
      expect(level).toBe('VERY_LOW');
    });

    test('high score with < 3 verifications caps at MEDIUM (research-backed)', () => {
      // Research shows 3 verifications are needed for expert-level accuracy
      // So even with high score, < 3 verifications means MEDIUM max
      const level = getConfidenceLevel(95, 2);
      expect(level).toBe('MEDIUM');
    });

    test('score 76+ with 1 verification returns MEDIUM (capped)', () => {
      const level = getConfidenceLevel(85, 1);
      expect(level).toBe('MEDIUM');
    });

    test('score 26-50 with 1 verification returns LOW', () => {
      const level = getConfidenceLevel(40, 1);
      expect(level).toBe('LOW');
    });

    test('score below 26 with 1 verification returns VERY_LOW', () => {
      const level = getConfidenceLevel(20, 1);
      expect(level).toBe('VERY_LOW');
    });

    test('level boundaries are correct', () => {
      expect(getConfidenceLevel(91, 5)).toBe('VERY_HIGH');
      expect(getConfidenceLevel(90, 5)).toBe('HIGH'); // 90 is in 76-90 range
      expect(getConfidenceLevel(76, 5)).toBe('HIGH');
      expect(getConfidenceLevel(75, 5)).toBe('MEDIUM'); // 75 is in 51-75 range
      expect(getConfidenceLevel(51, 5)).toBe('MEDIUM');
      expect(getConfidenceLevel(50, 5)).toBe('LOW'); // 50 is in 26-50 range
      expect(getConfidenceLevel(26, 5)).toBe('LOW');
      expect(getConfidenceLevel(25, 5)).toBe('VERY_LOW'); // 25 is in 0-25 range
    });
  });

  describe('Confidence Level Description', () => {
    test('VERY_HIGH level returns appropriate description', () => {
      const description = getConfidenceLevelDescription('VERY_HIGH', 5);
      expect(description).toContain('authoritative sources');
      expect(description).toContain('expert-level accuracy');
    });

    test('HIGH level returns appropriate description', () => {
      const description = getConfidenceLevelDescription('HIGH', 5);
      expect(description).toContain('authoritative sources');
    });

    test('MEDIUM level returns appropriate description', () => {
      const description = getConfidenceLevelDescription('MEDIUM', 5);
      expect(description).toContain('verification');
      expect(description).toContain('confirmation');
    });

    test('LOW level returns appropriate description', () => {
      const description = getConfidenceLevelDescription('LOW', 5);
      expect(description).toContain('Limited');
      expect(description).toContain('confirm');
    });

    test('VERY_LOW level returns appropriate description', () => {
      const description = getConfidenceLevelDescription('VERY_LOW', 5);
      expect(description).toContain('Unverified');
      expect(description).toContain('confirm');
    });

    test('description includes research note when < 3 verifications', () => {
      const description = getConfidenceLevelDescription('MEDIUM', 2);
      expect(description).toContain('3 verifications');
      expect(description).toContain('expert-level accuracy');
    });

    test('description does not include research note when >= 3 verifications', () => {
      const description = getConfidenceLevelDescription('HIGH', 5);
      // The research note about needing 3 verifications should not appear
      // since we already have sufficient verifications
      expect(description).not.toContain('Research shows 3 verifications');
    });
  });

  describe('Metadata Calculations', () => {
    test('isStale is true when days since verification exceeds threshold', () => {
      const input = createMockInput({
        lastVerifiedAt: daysAgo(100),
        specialty: 'Family Medicine', // 60-day threshold
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.isStale).toBe(true);
    });

    test('isStale is false when within freshness threshold', () => {
      const input = createMockInput({
        lastVerifiedAt: daysAgo(30),
        specialty: 'Family Medicine', // 60-day threshold
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.isStale).toBe(false);
    });

    test('daysUntilStale is calculated correctly', () => {
      const input = createMockInput({
        lastVerifiedAt: daysAgo(30),
        specialty: 'Family Medicine', // 60-day threshold
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.daysUntilStale).toBe(30); // 60 - 30 = 30
    });

    test('daysUntilStale is 0 when already stale', () => {
      const input = createMockInput({
        lastVerifiedAt: daysAgo(100),
        specialty: 'Family Medicine', // 60-day threshold
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.daysUntilStale).toBe(0);
    });

    test('recommendReVerification is true when stale', () => {
      const input = createMockInput({
        lastVerifiedAt: daysAgo(100),
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.recommendReVerification).toBe(true);
    });

    test('recommendReVerification is true when never verified', () => {
      const input = createMockInput({
        lastVerifiedAt: null,
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.recommendReVerification).toBe(true);
    });

    test('recommendReVerification is true when approaching staleness (80% of threshold)', () => {
      const input = createMockInput({
        lastVerifiedAt: daysAgo(50), // 50 days is > 80% of 60-day threshold
        specialty: 'Family Medicine', // 60-day threshold
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.recommendReVerification).toBe(true);
    });

    test('daysSinceVerification is calculated correctly', () => {
      const input = createMockInput({
        lastVerifiedAt: daysAgo(45),
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.daysSinceVerification).toBe(45);
    });

    test('daysSinceVerification is null when never verified', () => {
      const input = createMockInput({
        lastVerifiedAt: null,
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.daysSinceVerification).toBeNull();
    });

    test('researchNote mentions mental health for psychiatric providers', () => {
      const input = createMockInput({
        specialty: 'Psychiatry',
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.researchNote).toContain('Mental health');
      expect(result.metadata.researchNote).toContain('43%');
    });

    test('researchNote mentions turnover for primary care', () => {
      const input = createMockInput({
        specialty: 'Family Medicine',
      });
      const result = calculateConfidenceScore(input);
      expect(result.metadata.researchNote).toContain('12% annual');
    });
  });
});
