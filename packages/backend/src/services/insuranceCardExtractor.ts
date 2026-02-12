/**
 * Insurance Card Extraction Service
 *
 * Processes insurance card images using Sharp preprocessing + Anthropic Claude API.
 * Replaces the previous approach of HTTP-fetching the Next.js frontend extraction route.
 */
import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger';
import {
  parseInsuranceCardResponse,
  PRIMARY_EXTRACTION_PROMPT,
  ALTERNATIVE_EXTRACTION_PROMPT,
} from '../lib/insuranceCardSchema';
import type { ValidatedInsuranceCardData, ExtractionMetadata } from '../lib/insuranceCardSchema';
import { preprocessImage, preprocessImageEnhanced, shouldEnhanceImage } from '../lib/imagePreprocess';

// ============================================================================
// Configuration
// ============================================================================

// Claude Haiku 4.5 — fast & cost-effective for structured extraction
const CLAUDE_MODEL_ID = 'claude-haiku-4-5-20251001';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_SIZE_BYTES * 1.37);

const RETRY_CONFIDENCE_THRESHOLD = 0.3;
const MIN_FIELDS_FOR_SUCCESS = 2;

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

// ============================================================================
// Result type used by the route handler
// ============================================================================

export interface ExtractionResult {
  success: boolean;
  data: ValidatedInsuranceCardData | null;
  error?: string;
  userMessage?: string;
  metadata: {
    confidence: string;
    confidenceScore: number;
    fieldsExtracted: number;
    totalFields: number;
  } | null;
  suggestions: string[];
}

// ============================================================================
// Lazy-init Anthropic client
// ============================================================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required for insurance card scanning');
  }
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

// ============================================================================
// Helpers
// ============================================================================

function detectMediaType(base64Data: string): ImageMediaType {
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const binaryStr = atob(cleanBase64.slice(0, 16));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';

  return 'image/jpeg';
}

async function callClaudeExtraction(
  base64Data: string,
  mediaType: ImageMediaType,
  prompt: string,
): Promise<{ text: string } | { error: string }> {
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: CLAUDE_MODEL_ID,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return { error: 'No text response from Claude' };
    }

    return { text: textContent.text.trim() };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({
      error: errMsg,
      name: error instanceof Error ? error.name : undefined,
      status: error instanceof Anthropic.APIError ? error.status : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Claude API error during extraction');
    if (error instanceof Anthropic.APIError) {
      return { error: `Anthropic API error ${error.status}: ${errMsg}` };
    }
    return { error: `Extraction error: ${errMsg}` };
  }
}

// ============================================================================
// Main extraction function
// ============================================================================

/**
 * Extract insurance card data from a base64-encoded image.
 *
 * Steps:
 * 1. Validate & clean the base64 payload
 * 2. Preprocess with Sharp (resize, contrast, rotation)
 * 3. Call Claude with primary prompt; retry with alternative prompt if low confidence
 * 4. Parse & validate the response
 */
export async function extractInsuranceCard(
  imageBase64: string,
  _mimeType: string,
): Promise<ExtractionResult> {
  const startTime = Date.now();

  // --- Payload validation ---------------------------------------------------

  if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    return {
      success: false,
      data: null,
      error: 'Invalid or empty image data',
      userMessage: 'The image appears to be empty or corrupted. Please try a different image.',
      metadata: null,
      suggestions: [],
    };
  }

  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return {
      success: false,
      data: null,
      error: `Image too large (max ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB)`,
      userMessage: 'Your image is too large. Please use a smaller image.',
      metadata: null,
      suggestions: ['Try taking a new photo at a lower resolution.', "Use your phone's photo editing to crop to just the card."],
    };
  }

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(base64Data)) {
    return {
      success: false,
      data: null,
      error: 'Invalid base64 image data',
      userMessage: 'There was a problem with your image. Please try uploading again.',
      metadata: null,
      suggestions: [],
    };
  }

  // --- Image preprocessing --------------------------------------------------

  let processedBase64 = base64Data;
  let preprocessingInfo: ExtractionMetadata['preprocessing'];

  try {
    const needsEnhancement = await shouldEnhanceImage(imageBase64);
    const preprocessResult = needsEnhancement
      ? await preprocessImageEnhanced(imageBase64)
      : await preprocessImage(imageBase64);

    processedBase64 = preprocessResult.base64;
    preprocessingInfo = {
      resized: preprocessResult.processingApplied.resized,
      contrastEnhanced: preprocessResult.processingApplied.contrastEnhanced,
      originalSize: preprocessResult.originalSize,
      processedSize: preprocessResult.processedSize,
    };
  } catch (preprocessError) {
    logger.warn({ error: preprocessError instanceof Error ? preprocessError.message : 'Unknown' }, 'Preprocessing failed, using original image');
  }

  const mediaType = preprocessingInfo ? 'image/jpeg' : detectMediaType(imageBase64);

  // --- Primary extraction ---------------------------------------------------

  logger.info('Starting primary insurance card extraction');
  const primaryResult = await callClaudeExtraction(processedBase64, mediaType, PRIMARY_EXTRACTION_PROMPT);

  if ('error' in primaryResult) {
    return {
      success: false,
      data: null,
      error: primaryResult.error,
      userMessage: 'Our service is temporarily unavailable. Please try again in a moment.',
      metadata: null,
      suggestions: ['Wait a few seconds and try again.', 'If the problem persists, try uploading a different photo.'],
    };
  }

  let parseResult = parseInsuranceCardResponse(primaryResult.text);

  // --- Retry with alternative prompt if low confidence ----------------------

  let retryAttempted = false;
  if (
    !parseResult.success ||
    (parseResult.success && parseResult.metadata.confidenceScore < RETRY_CONFIDENCE_THRESHOLD)
  ) {
    logger.info('Low confidence or parse failure, retrying with alternative prompt');
    retryAttempted = true;

    const retryResult = await callClaudeExtraction(processedBase64, mediaType, ALTERNATIVE_EXTRACTION_PROMPT);

    if (!('error' in retryResult)) {
      const retryParseResult = parseInsuranceCardResponse(retryResult.text);
      if (retryParseResult.success) {
        if (!parseResult.success) {
          parseResult = retryParseResult;
        } else if (retryParseResult.metadata.confidenceScore > parseResult.metadata.confidenceScore) {
          parseResult = retryParseResult;
        }
      }
    }
  }

  // --- Handle failures ------------------------------------------------------

  if (!parseResult.success) {
    return {
      success: false,
      data: null,
      error: parseResult.error,
      userMessage: 'We had trouble reading your insurance card.',
      metadata: null,
      suggestions: [...parseResult.suggestions, 'Try taking a new photo with better lighting.'].slice(0, 4),
    };
  }

  if (parseResult.metadata.fieldsExtracted < MIN_FIELDS_FOR_SUCCESS) {
    return {
      success: false,
      data: null,
      error: 'Insufficient data extracted',
      userMessage: "We couldn't extract enough information from your card.",
      metadata: {
        confidence: parseResult.metadata.confidence,
        confidenceScore: parseResult.metadata.confidenceScore,
        fieldsExtracted: parseResult.metadata.fieldsExtracted,
        totalFields: parseResult.metadata.totalFields,
      },
      suggestions: [
        'Make sure you are uploading a health insurance card.',
        'Try taking a clearer photo with good lighting.',
        'Make sure the entire card is visible.',
      ],
    };
  }

  // --- Success --------------------------------------------------------------

  const processingTime = Date.now() - startTime;
  logger.info({
    fieldsExtracted: parseResult.metadata.fieldsExtracted,
    confidence: parseResult.metadata.confidence,
    confidenceScore: parseResult.metadata.confidenceScore.toFixed(2),
    processingTimeMs: processingTime,
    retryAttempted,
  }, 'Insurance card extraction succeeded');

  return {
    success: true,
    data: parseResult.data,
    metadata: {
      confidence: parseResult.metadata.confidence,
      confidenceScore: parseResult.metadata.confidenceScore,
      fieldsExtracted: parseResult.metadata.fieldsExtracted,
      totalFields: parseResult.metadata.totalFields,
    },
    suggestions: parseResult.metadata.confidence !== 'high' ? parseResult.metadata.suggestions : [],
  };
}
