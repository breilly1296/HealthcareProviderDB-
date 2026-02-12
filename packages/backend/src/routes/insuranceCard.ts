import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { defaultRateLimiter, createRateLimiter } from '../middleware/rateLimiter';
import {
  saveInsuranceCard,
  getInsuranceCard,
  updateInsuranceCard,
  deleteInsuranceCard,
} from '../services/insuranceCardService';
import type { ExtractedCardData } from '../services/insuranceCardService';
import { extractInsuranceCard } from '../services/insuranceCardExtractor';
import logger from '../utils/logger';

const router = Router();

// ============================================================================
// Rate limiters
// ============================================================================

const scanRateLimiter = createRateLimiter({
  name: 'insurance-card-scan',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've scanned too many cards. Please try again in 1 hour.",
  keyGenerator: (req) => req.user?.id || req.ip || 'unknown',
});

// ============================================================================
// Validation schemas
// ============================================================================

const scanBodySchema = z.object({
  imageBase64: z.string().min(1, 'Image data is required').max(15 * 1024 * 1024, 'Image must be under 15MB'),
  mimeType: z.string().regex(/^image\//, 'Must be an image MIME type'),
});

const saveBodySchema = z.object({
  insurance_company: z.string().nullable().optional(),
  plan_name: z.string().nullable().optional(),
  plan_type: z.string().nullable().optional(),
  provider_network: z.string().nullable().optional(),
  network_notes: z.string().nullable().optional(),
  subscriber_name: z.string().nullable().optional(),
  subscriber_id: z.string().nullable().optional(),
  group_number: z.string().nullable().optional(),
  effective_date: z.string().nullable().optional(),
  copay_pcp: z.string().nullable().optional(),
  copay_specialist: z.string().nullable().optional(),
  copay_urgent: z.string().nullable().optional(),
  copay_er: z.string().nullable().optional(),
  deductible_individual: z.string().nullable().optional(),
  deductible_family: z.string().nullable().optional(),
  oop_max_individual: z.string().nullable().optional(),
  oop_max_family: z.string().nullable().optional(),
  rxbin: z.string().nullable().optional(),
  rxpcn: z.string().nullable().optional(),
  rxgrp: z.string().nullable().optional(),
  card_side: z.string().nullable().optional(),
  confidence_score: z.number().nullable().optional(),
});

const updateBodySchema = z
  .object({
    insurance_company: z.string().nullable().optional(),
    plan_name: z.string().nullable().optional(),
    plan_type: z.string().nullable().optional(),
    provider_network: z.string().nullable().optional(),
    network_notes: z.string().nullable().optional(),
    subscriber_name: z.string().nullable().optional(),
    subscriber_id: z.string().nullable().optional(),
    group_number: z.string().nullable().optional(),
    effective_date: z.string().nullable().optional(),
    copay_pcp: z.string().nullable().optional(),
    copay_specialist: z.string().nullable().optional(),
    copay_urgent: z.string().nullable().optional(),
    copay_er: z.string().nullable().optional(),
    deductible_individual: z.string().nullable().optional(),
    deductible_family: z.string().nullable().optional(),
    oop_max_individual: z.string().nullable().optional(),
    oop_max_family: z.string().nullable().optional(),
    rxbin: z.string().nullable().optional(),
    rxpcn: z.string().nullable().optional(),
    rxgrp: z.string().nullable().optional(),
    card_side: z.string().nullable().optional(),
    confidence_score: z.number().int().nullable().optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'At least one field must be provided' },
  );

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/v1/me/insurance-card/scan
 * Scan a card image, extract data via AI, and save to the user's profile.
 * Requires authentication. Rate limited to 10 per hour per user.
 */
router.post(
  '/scan',
  express.json({ limit: '16mb' }),
  scanRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const { imageBase64, mimeType } = scanBodySchema.parse(req.body);

    const extraction = await extractInsuranceCard(imageBase64, mimeType);

    if (!extraction.success || !extraction.data) {
      logger.error({
        error: extraction.error,
        userMessage: extraction.userMessage,
        metadata: extraction.metadata,
        suggestions: extraction.suggestions,
      }, 'Insurance card extraction failed');
      throw AppError.badRequest(
        extraction.userMessage || extraction.error || 'Failed to extract insurance card data',
        'EXTRACTION_FAILED',
      );
    }

    const card = await saveInsuranceCard(req.user!.id, extraction.data);

    res.status(201).json({
      success: true,
      data: {
        card,
        extraction: {
          confidence: extraction.metadata?.confidence ?? null,
          confidenceScore: extraction.metadata?.confidenceScore ?? null,
          fieldsExtracted: extraction.metadata?.fieldsExtracted ?? 0,
          totalFields: extraction.metadata?.totalFields ?? 0,
          suggestions: extraction.suggestions ?? [],
        },
      },
    });
  }),
);

/**
 * POST /api/v1/me/insurance-card/save
 * Save already-extracted insurance card data to the user's profile.
 * Used by the frontend two-step flow: extract on frontend, then save here.
 * Requires authentication.
 */
router.post(
  '/save',
  defaultRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = saveBodySchema.parse(req.body) as ExtractedCardData;

    const card = await saveInsuranceCard(req.user!.id, data);

    res.status(201).json({
      success: true,
      data: { card },
    });
  }),
);

/**
 * GET /api/v1/me/insurance-card
 * Get the current user's saved insurance card.
 * Requires authentication.
 */
router.get(
  '/',
  defaultRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const card = await getInsuranceCard(req.user!.id);

    res.json({
      success: true,
      data: { card },
    });
  }),
);

/**
 * PATCH /api/v1/me/insurance-card
 * Update specific fields on the saved insurance card.
 * Requires authentication.
 */
router.patch(
  '/',
  defaultRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const updates = updateBodySchema.parse(req.body) as Partial<ExtractedCardData>;

    const card = await updateInsuranceCard(req.user!.id, updates);

    res.json({
      success: true,
      data: { card },
    });
  }),
);

/**
 * DELETE /api/v1/me/insurance-card
 * Remove the saved insurance card from the user's profile.
 * Requires authentication.
 */
router.delete(
  '/',
  defaultRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    await deleteInsuranceCard(req.user!.id);

    res.json({ success: true });
  }),
);

export default router;
