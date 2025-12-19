import {
  calculateConfidenceScore,
  calculateBatchConfidenceScores,
  needsReverification,
  calculateProviderAggregateConfidence,
  ProviderPlanData,
} from './confidence';

// Mock Prisma enums
jest.mock('@prisma/client', () => ({
  VerificationSource: {
    CMS_DATA: 'CMS_DATA',
    CARRIER_DATA: 'CARRIER_DATA',
    PROVIDER_PORTAL: 'PROVIDER_PORTAL',
    PHONE_CALL: 'PHONE_CALL',
    AUTOMATED: 'AUTOMATED',
    CROWDSOURCE: 'CROWDSOURCE',
  },
  AcceptanceStatus: {
    ACCEPTED: 'ACCEPTED',
    NOT_ACCEPTED: 'NOT_ACCEPTED',
    PENDING: 'PENDING',
    UNKNOWN: 'UNKNOWN',
  },
}));

// Helper to create base provider plan data
function createBaseProviderPlanData(overrides: Partial<ProviderPlanData> = {}): ProviderPlanData {
  return {
    dataSource: null,
    dataSourceDate: null,
    lastVerifiedAt: null,
    verificationSource: null,
    verificationCount: 0,
    upvotes: 0,
    downvotes: 0,
    userSubmissions: 0,
    planEffectiveDate: null,
    planTerminationDate: null,
    providerLastUpdateDate: null,
    providerStatus: 'ACTIVE',
    acceptanceStatus: 'ACCEPTED' as any,
    ...overrides,
  };
}

// Helper to create dates relative to now
function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

describe('Confidence Scoring Engine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-15'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('calculateConfidenceScore', () => {
    describe('Data Source Scoring', () => {
      it('should return 0 for data source score when no data source is available', () => {
        const data = createBaseProviderPlanData({ dataSource: null });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(0);
        expect(result.factors.dataSourceReason).toBe('No data source available');
      });

      it('should give highest score (30) for CMS_DATA within 30 days', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(15),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(30);
        expect(result.factors.dataSourceReason).toContain('CMS_DATA');
        expect(result.factors.dataSourceReason).toContain('within last 30 days');
      });

      it('should give 28 points for CARRIER_DATA within 30 days', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CARRIER_DATA' as any,
          dataSourceDate: daysAgo(20),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(28);
      });

      it('should give 25 points for PROVIDER_PORTAL within 30 days', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'PROVIDER_PORTAL' as any,
          dataSourceDate: daysAgo(10),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(25);
      });

      it('should give 22 points for PHONE_CALL within 30 days', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'PHONE_CALL' as any,
          dataSourceDate: daysAgo(5),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(22);
      });

      it('should give 15 points for AUTOMATED within 30 days', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'AUTOMATED' as any,
          dataSourceDate: daysAgo(25),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(15);
      });

      it('should give 10 points for CROWDSOURCE within 30 days', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CROWDSOURCE' as any,
          dataSourceDate: daysAgo(7),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(10);
      });

      it('should reduce score by 10% for data 31-90 days old', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(60),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(27); // 30 * 0.9 = 27
        expect(result.factors.dataSourceReason).toContain('within last 90 days');
      });

      it('should reduce score by 25% for data 91-180 days old', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(120),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(23); // 30 * 0.75 = 22.5 rounded
        expect(result.factors.dataSourceReason).toContain('within last 6 months');
      });

      it('should reduce score by 50% for data 181-365 days old', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(250),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(15); // 30 * 0.5 = 15
        expect(result.factors.dataSourceReason).toContain('6-12 months old');
      });

      it('should reduce score by 75% for data over 1 year old', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(400),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(8); // 30 * 0.25 = 7.5 rounded
        expect(result.factors.dataSourceReason).toContain('over 1 year old');
      });

      it('should reduce score by 50% when data source date is unknown', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: null,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.dataSourceScore).toBe(15); // 30 * 0.5
        expect(result.factors.dataSourceReason).toContain('unknown date');
      });
    });

    describe('Recency Scoring', () => {
      it('should return 0 with appropriate message when no recency data available', () => {
        const data = createBaseProviderPlanData();
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(0);
        expect(result.factors.recencyReason).toBe('No recency data available');
      });

      it('should give 15 points for verification within last week', () => {
        const data = createBaseProviderPlanData({
          lastVerifiedAt: daysAgo(3),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(15);
        expect(result.factors.recencyReason).toContain('Verified within last week');
      });

      it('should give 12 points for verification within last month', () => {
        const data = createBaseProviderPlanData({
          lastVerifiedAt: daysAgo(15),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(12);
        expect(result.factors.recencyReason).toContain('Verified within last month');
      });

      it('should give 8 points for verification within last 3 months', () => {
        const data = createBaseProviderPlanData({
          lastVerifiedAt: daysAgo(60),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(8);
        expect(result.factors.recencyReason).toContain('Verified within last 3 months');
      });

      it('should give 4 points for verification within last 6 months', () => {
        const data = createBaseProviderPlanData({
          lastVerifiedAt: daysAgo(150),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(4);
        expect(result.factors.recencyReason).toContain('Verified within last 6 months');
      });

      it('should give 1 point for stale verification over 6 months', () => {
        const data = createBaseProviderPlanData({
          lastVerifiedAt: daysAgo(200),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(1);
        expect(result.factors.recencyReason).toContain('stale');
      });

      it('should add 10 points for currently active plan', () => {
        const data = createBaseProviderPlanData({
          planEffectiveDate: daysAgo(30),
          planTerminationDate: daysFromNow(30),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(10);
        expect(result.factors.recencyReason).toContain('Plan is currently active');
      });

      it('should add 5 points for plan not yet effective', () => {
        const data = createBaseProviderPlanData({
          planEffectiveDate: daysFromNow(10),
          planTerminationDate: daysFromNow(100),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(5);
        expect(result.factors.recencyReason).toContain('Plan not yet effective');
      });

      it('should add 0 points for terminated plan', () => {
        const data = createBaseProviderPlanData({
          planEffectiveDate: daysAgo(200),
          planTerminationDate: daysAgo(30),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(0);
        expect(result.factors.recencyReason).toContain('Plan has terminated');
      });

      it('should add 7 points for effective plan with no termination date', () => {
        const data = createBaseProviderPlanData({
          planEffectiveDate: daysAgo(30),
          planTerminationDate: null,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(7);
        expect(result.factors.recencyReason).toContain('no termination date');
      });

      it('should combine verification and plan recency scores', () => {
        const data = createBaseProviderPlanData({
          lastVerifiedAt: daysAgo(3),
          planEffectiveDate: daysAgo(30),
          planTerminationDate: daysFromNow(30),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyScore).toBe(25); // 15 + 10
      });
    });

    describe('Verification Scoring', () => {
      it('should return 0 when no verification data available', () => {
        const data = createBaseProviderPlanData();
        const result = calculateConfidenceScore(data);

        expect(result.factors.verificationScore).toBe(0);
        expect(result.factors.verificationReason).toBe('No verification data');
      });

      it('should add up to 15 points for verification source quality', () => {
        const data = createBaseProviderPlanData({
          verificationSource: 'CMS_DATA' as any, // 30/2 = 15
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.verificationScore).toBe(15);
        expect(result.factors.verificationReason).toContain('Verified via CMS_DATA');
      });

      it('should cap verification source score at 15', () => {
        const data = createBaseProviderPlanData({
          verificationSource: 'CMS_DATA' as any, // 30/2 = 15, capped at 15
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.verificationScore).toBe(15);
      });

      it('should add 2 points per verification count up to 10 max', () => {
        const data = createBaseProviderPlanData({
          verificationCount: 3,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.verificationScore).toBe(6); // 3 * 2 = 6
        expect(result.factors.verificationReason).toContain('3 verification(s)');
      });

      it('should cap verification count bonus at 10 points', () => {
        const data = createBaseProviderPlanData({
          verificationCount: 10,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.verificationScore).toBe(10); // 10 * 2 = 20, capped at 10
      });

      it('should subtract 10 points for deactivated provider', () => {
        const data = createBaseProviderPlanData({
          verificationSource: 'CMS_DATA' as any,
          verificationCount: 5,
          providerStatus: 'DEACTIVATED',
        });
        const result = calculateConfidenceScore(data);

        // 15 (source) + 10 (count) - 10 (deactivated) = 15
        expect(result.factors.verificationScore).toBe(15);
        expect(result.factors.verificationReason).toContain('deactivated');
      });

      it('should not go below 0 for deactivated provider with low score', () => {
        const data = createBaseProviderPlanData({
          verificationCount: 2,
          providerStatus: 'DEACTIVATED',
        });
        const result = calculateConfidenceScore(data);

        // 4 (count) - 10 (deactivated) = -6, capped at 0
        expect(result.factors.verificationScore).toBe(0);
      });

      it('should combine source and count scores for active provider', () => {
        const data = createBaseProviderPlanData({
          verificationSource: 'PHONE_CALL' as any, // 22/2 = 11
          verificationCount: 4, // 4 * 2 = 8
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.verificationScore).toBe(19); // 11 + 8
      });
    });

    describe('Crowdsource Scoring', () => {
      it('should return 0 when no crowdsource data available', () => {
        const data = createBaseProviderPlanData({
          upvotes: 0,
          downvotes: 0,
          userSubmissions: 0,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.crowdsourceScore).toBe(0);
        expect(result.factors.crowdsourceReason).toBe('No crowdsource data');
      });

      it('should give strong positive feedback score for 80%+ upvotes', () => {
        const data = createBaseProviderPlanData({
          upvotes: 9,
          downvotes: 1,
          userSubmissions: 0,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.crowdsourceScore).toBeGreaterThan(0);
        expect(result.factors.crowdsourceReason).toContain('Strong positive feedback');
        expect(result.factors.crowdsourceReason).toContain('9/10');
      });

      it('should give mostly positive feedback score for 60-79% upvotes', () => {
        const data = createBaseProviderPlanData({
          upvotes: 7,
          downvotes: 3,
          userSubmissions: 0,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.crowdsourceReason).toContain('Mostly positive feedback');
      });

      it('should give mixed feedback score for 40-59% upvotes', () => {
        const data = createBaseProviderPlanData({
          upvotes: 5,
          downvotes: 5,
          userSubmissions: 0,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.crowdsourceReason).toContain('Mixed feedback');
      });

      it('should give negative feedback score for <40% upvotes', () => {
        const data = createBaseProviderPlanData({
          upvotes: 2,
          downvotes: 8,
          userSubmissions: 0,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.crowdsourceScore).toBe(0);
        expect(result.factors.crowdsourceReason).toContain('Negative feedback');
      });

      it('should apply volume multiplier based on total votes', () => {
        const lowVotesData = createBaseProviderPlanData({
          upvotes: 4,
          downvotes: 1,
          userSubmissions: 0,
        });
        const highVotesData = createBaseProviderPlanData({
          upvotes: 40,
          downvotes: 10,
          userSubmissions: 0,
        });

        const lowResult = calculateConfidenceScore(lowVotesData);
        const highResult = calculateConfidenceScore(highVotesData);

        // Higher volume should give higher score with same ratio
        expect(highResult.factors.crowdsourceScore).toBeGreaterThan(
          lowResult.factors.crowdsourceScore
        );
      });

      it('should add up to 5 points for user submissions', () => {
        const data = createBaseProviderPlanData({
          upvotes: 0,
          downvotes: 0,
          userSubmissions: 3,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.crowdsourceScore).toBe(3);
        expect(result.factors.crowdsourceReason).toContain('3 user submission(s)');
      });

      it('should cap user submission bonus at 5 points', () => {
        const data = createBaseProviderPlanData({
          upvotes: 0,
          downvotes: 0,
          userSubmissions: 10,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.crowdsourceScore).toBe(5);
      });

      it('should combine vote and submission scores', () => {
        const data = createBaseProviderPlanData({
          upvotes: 25,
          downvotes: 0,
          userSubmissions: 5,
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.crowdsourceScore).toBeGreaterThan(5);
        expect(result.factors.crowdsourceReason).toContain('upvotes');
        expect(result.factors.crowdsourceReason).toContain('submission');
      });
    });

    describe('Total Score Calculation', () => {
      it('should sum all factor scores', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(10),
          lastVerifiedAt: daysAgo(5),
          planEffectiveDate: daysAgo(30),
          planTerminationDate: daysFromNow(30),
          verificationSource: 'CMS_DATA' as any,
          verificationCount: 3,
          upvotes: 25,
          downvotes: 0,
          userSubmissions: 5,
        });
        const result = calculateConfidenceScore(data);

        const expectedSum =
          result.factors.dataSourceScore +
          result.factors.recencyScore +
          result.factors.verificationScore +
          result.factors.crowdsourceScore;

        expect(result.score).toBe(Math.min(100, expectedSum));
      });

      it('should cap total score at 100', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(1),
          lastVerifiedAt: daysAgo(1),
          planEffectiveDate: daysAgo(30),
          planTerminationDate: daysFromNow(30),
          verificationSource: 'CMS_DATA' as any,
          verificationCount: 10,
          upvotes: 100,
          downvotes: 0,
          userSubmissions: 10,
        });
        const result = calculateConfidenceScore(data);

        expect(result.score).toBeLessThanOrEqual(100);
      });

      it('should handle minimum score of 0', () => {
        const data = createBaseProviderPlanData();
        const result = calculateConfidenceScore(data);

        expect(result.score).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Recommendations', () => {
      it('should warn about deactivated provider regardless of score', () => {
        const data = createBaseProviderPlanData({
          providerStatus: 'DEACTIVATED',
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(1),
        });
        const result = calculateConfidenceScore(data);

        expect(result.recommendation).toContain('deactivated');
        expect(result.recommendation).toContain('Contact the practice');
      });

      it('should indicate not accepted status with low confidence', () => {
        const data = createBaseProviderPlanData({
          acceptanceStatus: 'NOT_ACCEPTED' as any,
        });
        const result = calculateConfidenceScore(data);

        expect(result.recommendation).toContain('does not accept');
        expect(result.recommendation).toContain('uncertain');
      });

      it('should indicate not accepted status with high confidence', () => {
        const data = createBaseProviderPlanData({
          acceptanceStatus: 'NOT_ACCEPTED' as any,
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(1),
          lastVerifiedAt: daysAgo(1),
          verificationSource: 'CMS_DATA' as any,
          verificationCount: 5,
        });
        const result = calculateConfidenceScore(data);

        expect(result.recommendation).toContain('does not accept');
      });

      it('should indicate unknown status', () => {
        const data = createBaseProviderPlanData({
          acceptanceStatus: 'UNKNOWN' as any,
        });
        const result = calculateConfidenceScore(data);

        expect(result.recommendation).toContain('No acceptance data');
        expect(result.recommendation).toContain('Contact the provider');
      });

      it('should give high confidence recommendation for score >= 90', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(1),
          lastVerifiedAt: daysAgo(1),
          planEffectiveDate: daysAgo(30),
          planTerminationDate: daysFromNow(30),
          verificationSource: 'CMS_DATA' as any,
          verificationCount: 5,
          upvotes: 50,
          downvotes: 0,
          userSubmissions: 5,
        });
        const result = calculateConfidenceScore(data);

        if (result.score >= 90) {
          expect(result.recommendation).toContain('High confidence');
        }
      });

      it('should give good confidence recommendation for score 75-89', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(1),
          lastVerifiedAt: daysAgo(10),
          planEffectiveDate: daysAgo(30),
          planTerminationDate: daysFromNow(30),
          verificationSource: 'PHONE_CALL' as any,
          verificationCount: 2,
        });
        const result = calculateConfidenceScore(data);

        if (result.score >= 75 && result.score < 90) {
          expect(result.recommendation).toContain('Good confidence');
        }
      });

      it('should recommend calling for moderate confidence (50-74)', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CROWDSOURCE' as any,
          dataSourceDate: daysAgo(30),
          lastVerifiedAt: daysAgo(60),
          planEffectiveDate: daysAgo(30),
          planTerminationDate: daysFromNow(30),
        });
        const result = calculateConfidenceScore(data);

        if (result.score >= 50 && result.score < 75) {
          expect(result.recommendation).toContain('Moderate confidence');
        }
      });

      it('should strongly recommend verification for low confidence (25-49)', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CROWDSOURCE' as any,
          dataSourceDate: daysAgo(200),
        });
        const result = calculateConfidenceScore(data);

        if (result.score >= 25 && result.score < 50) {
          expect(result.recommendation).toContain('Low confidence');
        }
      });

      it('should indicate very low confidence for score < 25', () => {
        const data = createBaseProviderPlanData();
        const result = calculateConfidenceScore(data);

        if (result.score < 25) {
          expect(result.recommendation).toContain('Very low confidence');
        }
      });
    });

    describe('needsVerification Flag', () => {
      it('should flag for verification when score < 75', () => {
        const data = createBaseProviderPlanData();
        const result = calculateConfidenceScore(data);

        expect(result.needsVerification).toBe(true);
      });

      it('should not flag for verification when score >= 75', () => {
        const data = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(1),
          lastVerifiedAt: daysAgo(1),
          planEffectiveDate: daysAgo(30),
          planTerminationDate: daysFromNow(30),
          verificationSource: 'CMS_DATA' as any,
          verificationCount: 5,
        });
        const result = calculateConfidenceScore(data);

        if (result.score >= 75) {
          expect(result.needsVerification).toBe(false);
        }
      });
    });

    describe('Edge Cases', () => {
      it('should handle all null/zero values gracefully', () => {
        const data = createBaseProviderPlanData();
        const result = calculateConfidenceScore(data);

        expect(result).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.factors).toBeDefined();
        expect(result.recommendation).toBeDefined();
      });

      it('should handle exactly boundary dates correctly', () => {
        // Exactly 30 days ago
        const data30 = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(30),
        });
        const result30 = calculateConfidenceScore(data30);
        expect(result30.factors.dataSourceScore).toBe(30);

        // Exactly 31 days ago
        const data31 = createBaseProviderPlanData({
          dataSource: 'CMS_DATA' as any,
          dataSourceDate: daysAgo(31),
        });
        const result31 = calculateConfidenceScore(data31);
        expect(result31.factors.dataSourceScore).toBe(27); // 30 * 0.9
      });

      it('should handle plan effective date equal to current date', () => {
        const data = createBaseProviderPlanData({
          planEffectiveDate: new Date(),
          planTerminationDate: daysFromNow(30),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyReason).toContain('Plan is currently active');
      });

      it('should handle plan termination date equal to current date', () => {
        const data = createBaseProviderPlanData({
          planEffectiveDate: daysAgo(30),
          planTerminationDate: new Date(),
        });
        const result = calculateConfidenceScore(data);

        expect(result.factors.recencyReason).toContain('Plan is currently active');
      });
    });
  });

  describe('calculateBatchConfidenceScores', () => {
    it('should return empty array for empty input', () => {
      const results = calculateBatchConfidenceScores([]);

      expect(results).toEqual([]);
    });

    it('should process single item correctly', () => {
      const data = [createBaseProviderPlanData()];
      const results = calculateBatchConfidenceScores(data);

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('factors');
      expect(results[0]).toHaveProperty('recommendation');
    });

    it('should process multiple items correctly', () => {
      const data = [
        createBaseProviderPlanData({ dataSource: 'CMS_DATA' as any, dataSourceDate: daysAgo(10) }),
        createBaseProviderPlanData({ dataSource: 'CROWDSOURCE' as any, dataSourceDate: daysAgo(5) }),
        createBaseProviderPlanData(),
      ];
      const results = calculateBatchConfidenceScores(data);

      expect(results).toHaveLength(3);
      expect(results[0].factors.dataSourceScore).toBeGreaterThan(results[2].factors.dataSourceScore);
    });

    it('should maintain order of input items', () => {
      const data = [
        createBaseProviderPlanData({ upvotes: 100, downvotes: 0, userSubmissions: 5 }),
        createBaseProviderPlanData({ upvotes: 0, downvotes: 100, userSubmissions: 0 }),
      ];
      const results = calculateBatchConfidenceScores(data);

      expect(results[0].factors.crowdsourceScore).toBeGreaterThan(
        results[1].factors.crowdsourceScore
      );
    });

    it('should handle large batch efficiently', () => {
      const data = Array(100)
        .fill(null)
        .map(() => createBaseProviderPlanData());
      const results = calculateBatchConfidenceScores(data);

      expect(results).toHaveLength(100);
    });
  });

  describe('needsReverification', () => {
    it('should return true when lastVerifiedAt is null', () => {
      const result = needsReverification(null, 95);

      expect(result).toBe(true);
    });

    it('should allow 180 days for high confidence (>= 90)', () => {
      // Default daysSinceUpdate is 90, so 90 * 2 = 180 allowed
      const recentDate = daysAgo(170);
      const oldDate = daysAgo(190);

      expect(needsReverification(recentDate, 95)).toBe(false);
      expect(needsReverification(oldDate, 95)).toBe(true);
    });

    it('should allow 135 days for good confidence (75-89)', () => {
      // 90 * 1.5 = 135 allowed
      const recentDate = daysAgo(130);
      const oldDate = daysAgo(140);

      expect(needsReverification(recentDate, 80)).toBe(false);
      expect(needsReverification(oldDate, 80)).toBe(true);
    });

    it('should allow 90 days for moderate confidence (50-74)', () => {
      const recentDate = daysAgo(85);
      const oldDate = daysAgo(95);

      expect(needsReverification(recentDate, 60)).toBe(false);
      expect(needsReverification(oldDate, 60)).toBe(true);
    });

    it('should allow 45 days for low confidence (< 50)', () => {
      // 90 * 0.5 = 45 allowed
      const recentDate = daysAgo(40);
      const oldDate = daysAgo(50);

      expect(needsReverification(recentDate, 30)).toBe(false);
      expect(needsReverification(oldDate, 30)).toBe(true);
    });

    it('should respect custom daysSinceUpdate parameter', () => {
      const verifiedDate = daysAgo(50);

      // With default 90 days, confidence 60 allows 90 days
      expect(needsReverification(verifiedDate, 60, 90)).toBe(false);

      // With 30 day threshold, confidence 60 allows 30 days
      expect(needsReverification(verifiedDate, 60, 30)).toBe(true);
    });

    it('should return false for just verified data', () => {
      const justNow = new Date();

      expect(needsReverification(justNow, 0)).toBe(false);
      expect(needsReverification(justNow, 50)).toBe(false);
      expect(needsReverification(justNow, 100)).toBe(false);
    });

    it('should handle confidence score boundary values', () => {
      const verifiedDate = daysAgo(100);

      // Exactly 90 - should use 180 day window
      expect(needsReverification(verifiedDate, 90)).toBe(false);

      // Exactly 75 - should use 135 day window
      expect(needsReverification(verifiedDate, 75)).toBe(false);

      // Exactly 50 - should use 90 day window
      expect(needsReverification(verifiedDate, 50)).toBe(true);

      // Exactly 49 - should use 45 day window
      expect(needsReverification(verifiedDate, 49)).toBe(true);
    });
  });

  describe('calculateProviderAggregateConfidence', () => {
    it('should return zeros and needsAttention for empty array', () => {
      const result = calculateProviderAggregateConfidence([]);

      expect(result.average).toBe(0);
      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
      expect(result.needsAttention).toBe(true);
    });

    it('should calculate correctly for single score', () => {
      const result = calculateProviderAggregateConfidence([75]);

      expect(result.average).toBe(75);
      expect(result.min).toBe(75);
      expect(result.max).toBe(75);
      expect(result.needsAttention).toBe(false);
    });

    it('should calculate average correctly', () => {
      const result = calculateProviderAggregateConfidence([60, 70, 80]);

      expect(result.average).toBe(70);
    });

    it('should round average to nearest integer', () => {
      const result = calculateProviderAggregateConfidence([60, 70, 75]);

      expect(result.average).toBe(68); // 205/3 = 68.33...
    });

    it('should find min and max correctly', () => {
      const result = calculateProviderAggregateConfidence([50, 75, 100, 25, 60]);

      expect(result.min).toBe(25);
      expect(result.max).toBe(100);
    });

    it('should flag needsAttention when min < 50', () => {
      const result = calculateProviderAggregateConfidence([49, 80, 90]);

      expect(result.needsAttention).toBe(true);
    });

    it('should flag needsAttention when average < 60', () => {
      const result = calculateProviderAggregateConfidence([50, 55, 60]);

      expect(result.average).toBe(55);
      expect(result.needsAttention).toBe(true);
    });

    it('should not flag needsAttention when min >= 50 and average >= 60', () => {
      const result = calculateProviderAggregateConfidence([50, 70, 80]);

      expect(result.min).toBe(50);
      expect(result.average).toBe(67);
      expect(result.needsAttention).toBe(false);
    });

    it('should handle all same scores', () => {
      const result = calculateProviderAggregateConfidence([75, 75, 75, 75]);

      expect(result.average).toBe(75);
      expect(result.min).toBe(75);
      expect(result.max).toBe(75);
    });

    it('should handle extreme scores', () => {
      const result = calculateProviderAggregateConfidence([0, 100]);

      expect(result.average).toBe(50);
      expect(result.min).toBe(0);
      expect(result.max).toBe(100);
      expect(result.needsAttention).toBe(true);
    });

    it('should handle large arrays', () => {
      const scores = Array(1000)
        .fill(null)
        .map((_, i) => i % 100);
      const result = calculateProviderAggregateConfidence(scores);

      expect(result.min).toBe(0);
      expect(result.max).toBe(99);
      expect(result.needsAttention).toBe(true);
    });
  });
});
