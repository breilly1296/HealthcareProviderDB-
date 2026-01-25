import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { verificationRateLimiter, voteRateLimiter, defaultRateLimiter } from '../middleware/rateLimiter';
import { verifyCaptcha } from '../middleware/captcha';
import {
  submitVerification,
  voteOnVerification,
  getVerificationStats,
  getRecentVerifications,
  getVerificationsForPair,
} from '../services/verificationService';
import { getConfidenceLevel, getConfidenceLevelDescription, calculateConfidenceScore } from '../services/confidenceService';

const router = Router();

// Validation schemas
const submitVerificationSchema = z.object({
  npi: z.string().length(10).regex(/^\d+$/, 'NPI must be exactly 10 digits'),
  planId: z.string().min(1).max(50),
  acceptsInsurance: z.boolean(),
  acceptsNewPatients: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
  evidenceUrl: z.string().url().max(500).optional(),
  submittedBy: z.string().email().max(200).optional(),
  captchaToken: z.string().optional(), // reCAPTCHA v3 token
});

const voteSchema = z.object({
  vote: z.enum(['up', 'down']),
  captchaToken: z.string().optional(), // reCAPTCHA v3 token
});

const verificationIdParamSchema = z.object({
  verificationId: z.string().min(1),
});

const pairParamsSchema = z.object({
  npi: z.string().length(10).regex(/^\d+$/),
  planId: z.string().min(1).max(50),
});

const recentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  planId: z.string().min(1).max(50).optional(),
});

/**
 * POST /api/v1/verify
 * Submit a new verification with full confidence breakdown
 */
router.post(
  '/',
  verificationRateLimiter,
  verifyCaptcha,
  asyncHandler(async (req, res) => {
    const body = submitVerificationSchema.parse(req.body);

    const result = await submitVerification({
      ...body,
      sourceIp: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Calculate full confidence breakdown using research-based scoring
    const confidenceResult = calculateConfidenceScore({
      dataSource: null, // Verification source tracked in VerificationLog
      lastVerifiedAt: result.acceptance.lastVerified,
      verificationCount: result.acceptance.verificationCount,
      upvotes: 0,
      downvotes: 0,
      specialty: null,
      taxonomyDescription: null,
    });

    res.status(201).json({
      success: true,
      data: {
        verification: result.verification,
        acceptance: {
          ...result.acceptance,
          confidenceLevel: confidenceResult.level,
          confidenceDescription: confidenceResult.description,
          confidence: {
            score: confidenceResult.score,
            level: confidenceResult.level,
            description: confidenceResult.description,
            factors: confidenceResult.factors,
            metadata: confidenceResult.metadata,
          },
        },
        message: 'Verification submitted successfully',
      },
    });
  })
);

/**
 * POST /api/v1/verify/:verificationId/vote
 * Vote on a verification
 */
router.post(
  '/:verificationId/vote',
  voteRateLimiter,
  verifyCaptcha,
  asyncHandler(async (req, res) => {
    const { verificationId } = verificationIdParamSchema.parse(req.params);
    const { vote } = voteSchema.parse(req.body);
    const sourceIp = req.ip || 'unknown';

    const result = await voteOnVerification(verificationId, vote, sourceIp);

    res.json({
      success: true,
      data: {
        verification: {
          id: result.id,
          upvotes: result.upvotes,
          downvotes: result.downvotes,
          netVotes: result.upvotes - result.downvotes,
        },
        message: result.voteChanged ? `Vote changed to: ${vote}` : `Vote recorded: ${vote}`,
      },
    });
  })
);

/**
 * GET /api/v1/verify/stats
 * Get verification statistics
 */
router.get(
  '/stats',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const stats = await getVerificationStats();

    res.json({
      success: true,
      data: {
        stats,
      },
    });
  })
);

/**
 * GET /api/v1/verify/recent
 * Get recent verifications
 */
router.get(
  '/recent',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const query = recentQuerySchema.parse(req.query);

    const verifications = await getRecentVerifications({
      limit: query.limit,
      npi: query.npi,
      planId: query.planId,
    });

    res.json({
      success: true,
      data: {
        verifications,
        count: verifications.length,
      },
    });
  })
);

/**
 * GET /api/v1/verify/:npi/:planId
 * Get verifications for a specific provider-plan pair with full confidence breakdown
 */
router.get(
  '/:npi/:planId',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { npi, planId } = pairParamsSchema.parse(req.params);

    const result = await getVerificationsForPair(npi, planId);

    if (!result) {
      throw AppError.notFound('Provider or plan not found');
    }

    let acceptanceWithConfidence = null;
    if (result.acceptance) {
      // Calculate full confidence breakdown using research-based scoring
      const confidenceResult = calculateConfidenceScore({
        dataSource: null, // Verification source tracked in VerificationLog
        lastVerifiedAt: result.acceptance.lastVerified,
        verificationCount: result.acceptance.verificationCount,
        upvotes: result.summary.totalUpvotes,
        downvotes: result.summary.totalDownvotes,
        specialty: null,
        taxonomyDescription: null,
      });

      acceptanceWithConfidence = {
        ...result.acceptance,
        confidenceLevel: confidenceResult.level,
        confidenceDescription: confidenceResult.description,
        confidence: {
          score: confidenceResult.score,
          level: confidenceResult.level,
          description: confidenceResult.description,
          factors: confidenceResult.factors,
          metadata: confidenceResult.metadata,
        },
      };
    }

    res.json({
      success: true,
      data: {
        npi,
        planId,
        acceptance: acceptanceWithConfidence,
        verifications: result.verifications,
        summary: result.summary,
      },
    });
  })
);

export default router;
