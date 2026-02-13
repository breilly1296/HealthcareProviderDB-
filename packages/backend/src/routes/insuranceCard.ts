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

// Allowed image MIME types for card scanning (must be supported by Claude vision API)
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const scanBodySchema = z.object({
  imageBase64: z.string().min(1, 'Image data is required').max(15 * 1024 * 1024, 'Image must be under 15MB'),
  mimeType: z.enum(ALLOWED_IMAGE_TYPES, {
    errorMap: () => ({ message: 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.' }),
  }),
});

/** Reusable trimmed nullable optional string field. */
const trimmedString = () => z.string().trim().nullable().optional();

const saveBodySchema = z.object({
  insurance_company: trimmedString(),
  plan_name: trimmedString(),
  plan_type: trimmedString(),
  provider_network: trimmedString(),
  network_notes: trimmedString(),
  subscriber_name: trimmedString(),
  subscriber_id: trimmedString(),
  group_number: trimmedString(),
  effective_date: trimmedString(),
  copay_pcp: trimmedString(),
  copay_specialist: trimmedString(),
  copay_urgent: trimmedString(),
  copay_er: trimmedString(),
  deductible_individual: trimmedString(),
  deductible_family: trimmedString(),
  oop_max_individual: trimmedString(),
  oop_max_family: trimmedString(),
  rxbin: trimmedString(),
  rxpcn: trimmedString(),
  rxgrp: trimmedString(),
  card_side: trimmedString(),
  confidence_score: z.number().nullable().optional(),
});

const updateBodySchema = z
  .object({
    insurance_company: trimmedString(),
    plan_name: trimmedString(),
    plan_type: trimmedString(),
    provider_network: trimmedString(),
    network_notes: trimmedString(),
    subscriber_name: trimmedString(),
    subscriber_id: trimmedString(),
    group_number: trimmedString(),
    effective_date: trimmedString(),
    copay_pcp: trimmedString(),
    copay_specialist: trimmedString(),
    copay_urgent: trimmedString(),
    copay_er: trimmedString(),
    deductible_individual: trimmedString(),
    deductible_family: trimmedString(),
    oop_max_individual: trimmedString(),
    oop_max_family: trimmedString(),
    rxbin: trimmedString(),
    rxpcn: trimmedString(),
    rxgrp: trimmedString(),
    card_side: trimmedString(),
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

    const card = await saveInsuranceCard(req.user!.id, extraction.data, String(req.id));

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

    const card = await saveInsuranceCard(req.user!.id, data, String(req.id));

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
    const card = await getInsuranceCard(req.user!.id, String(req.id));

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

    const card = await updateInsuranceCard(req.user!.id, updates, String(req.id));

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
    await deleteInsuranceCard(req.user!.id, String(req.id));

    res.json({ success: true });
  }),
);

export default router;
