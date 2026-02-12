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
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
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

    const extraction = await callExtractionApi(imageBase64, mimeType);

    if (!extraction.success || !extraction.data) {
      throw AppError.badRequest(
        extraction.error || 'Failed to extract insurance card data',
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

// ============================================================================
// Extraction API (TODO: replace with direct AI SDK call)
// ============================================================================

interface ExtractionResult {
  success: boolean;
  data: ExtractedCardData | null;
  error?: string;
  metadata: {
    confidence: string;
    confidenceScore: number;
    fieldsExtracted: number;
    totalFields: number;
  } | null;
  suggestions: string[];
}

/**
 * Call the Next.js frontend extraction endpoint to process a card image.
 *
 * Option B — routes through the existing frontend API which already has
 * the AI extraction logic. This avoids duplicating the prompt/parsing code
 * in the backend while we decide on the final architecture.
 */
async function callExtractionApi(
  imageBase64: string,
  mimeType: string,
): Promise<ExtractionResult> {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

  let response: globalThis.Response;
  try {
    response = await fetch(`${FRONTEND_URL}/api/insurance-card/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64, mimeType }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      data: null,
      error: `Extraction service unavailable: ${message}`,
      metadata: null,
      suggestions: [],
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => 'No response body');
    return {
      success: false,
      data: null,
      error: `Extraction failed (${response.status}): ${text}`,
      metadata: null,
      suggestions: [],
    };
  }

  const body = await response.json() as Record<string, unknown>;

  return {
    success: (body.success as boolean) ?? true,
    data: (body.data as ExtractedCardData) ?? null,
    error: body.error as string | undefined,
    metadata: (body.metadata as ExtractionResult['metadata']) ?? null,
    suggestions: (body.suggestions as string[]) ?? [],
  };
}

export default router;
