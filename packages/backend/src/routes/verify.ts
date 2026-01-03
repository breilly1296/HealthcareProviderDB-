import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { verificationRateLimiter } from '../middleware/rateLimiter';
import {
  submitVerification,
  voteOnVerification,
  getVerificationStats,
  getRecentVerifications,
  getVerificationsForPair,
} from '../services/verificationService';
import { getConfidenceLevel, getConfidenceLevelDescription } from '../services/confidenceService';

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
});

const voteSchema = z.object({
  vote: z.enum(['up', 'down']),
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
 * Submit a new verification
 */
router.post(
  '/',
  verificationRateLimiter,
  asyncHandler(async (req, res) => {
    const body = submitVerificationSchema.parse(req.body);

    const result = await submitVerification({
      ...body,
      sourceIp: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(201).json({
      success: true,
      data: {
        verification: result.verification,
        acceptance: {
          ...result.acceptance,
          confidenceLevel: getConfidenceLevel(result.acceptance.confidenceScore),
          confidenceDescription: getConfidenceLevelDescription(result.acceptance.confidenceScore),
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
  asyncHandler(async (req, res) => {
    const { verificationId } = verificationIdParamSchema.parse(req.params);
    const { vote } = voteSchema.parse(req.body);

    const verification = await voteOnVerification(verificationId, vote);

    res.json({
      success: true,
      data: {
        verification: {
          id: verification.id,
          upvotes: verification.upvotes,
          downvotes: verification.downvotes,
          netVotes: verification.upvotes - verification.downvotes,
        },
        message: `Vote recorded: ${vote}`,
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
 * Get verifications for a specific provider-plan pair
 */
router.get(
  '/:npi/:planId',
  asyncHandler(async (req, res) => {
    const { npi, planId } = pairParamsSchema.parse(req.params);

    const result = await getVerificationsForPair(npi, planId);

    if (!result) {
      throw AppError.notFound('Provider or plan not found');
    }

    res.json({
      success: true,
      data: {
        npi,
        planId,
        acceptance: result.acceptance
          ? {
              ...result.acceptance,
              confidenceLevel: getConfidenceLevel(result.acceptance.confidenceScore),
              confidenceDescription: getConfidenceLevelDescription(result.acceptance.confidenceScore),
            }
          : null,
        verifications: result.verifications,
        summary: result.summary,
      },
    });
  })
);

export default router;
