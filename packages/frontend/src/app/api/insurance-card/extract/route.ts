import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type {
  InsuranceCardDataWithConfidence,
  InsuranceCardExtractionResponse,
  ExtractionIssue,
} from '@/types/insurance';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rateLimit';
import {
  parseInsuranceCardResponse,
  PRIMARY_EXTRACTION_PROMPT,
  ALTERNATIVE_EXTRACTION_PROMPT,
} from '@/lib/insuranceCardSchema';
import { preprocessImage, shouldEnhanceImage, preprocessImageEnhanced } from '@/lib/imagePreprocess';

// === Model Configuration ===
// Model ID verified: January 2026
// Using Claude Haiku 4.5 for insurance card extraction:
// - Fast response time for good UX
// - Cost-effective for high-volume structured extraction
// - Sufficient accuracy for OCR/data extraction tasks
// Upgrade to Sonnet 4 if extraction accuracy issues arise
const CLAUDE_MODEL_ID = 'claude-haiku-4-5-20251001';

// === Protection Constants ===
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB max (increased for raw photos)
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_SIZE_BYTES * 1.37); // Base64 is ~37% larger
const RATE_LIMIT_PER_HOUR = 10; // 10 extractions per hour per IP

// === Confidence Thresholds ===
const RETRY_CONFIDENCE_THRESHOLD = 0.3; // Retry if confidence below this
const MIN_FIELDS_FOR_SUCCESS = 2; // Need at least this many fields for success

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

/**
 * Detect image media type from base64 data using magic bytes
 */
function detectMediaType(base64Data: string): ImageMediaType {
  // Remove data URL prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

  // Decode first few bytes to check magic numbers
  const binaryStr = atob(cleanBase64.slice(0, 16));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Check magic bytes
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return 'image/webp';
  }

  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }

  // Default to JPEG if unknown
  return 'image/jpeg';
}

/**
 * Get client IP from request headers
 */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Generate user-friendly error messages based on error type
 */
function getUserFriendlyError(
  errorType: string,
  _issues: ExtractionIssue[] = []
): { message: string; suggestions: string[] } {
  const suggestions: string[] = [];

  switch (errorType) {
    case 'not_insurance_card':
      return {
        message:
          "This doesn't appear to be an insurance card. Please upload a photo of your health insurance card.",
        suggestions: [
          'Make sure you are uploading your health insurance card, not a different type of card.',
          'The card should show your insurance company name and member ID.',
        ],
      };

    case 'blur':
      suggestions.push('Hold your camera steady when taking the photo.');
      suggestions.push('Tap to focus on the card before taking the photo.');
      return {
        message: 'The image is too blurry to read clearly.',
        suggestions,
      };

    case 'low_contrast':
      suggestions.push('Take the photo in a well-lit area.');
      suggestions.push('Avoid shadows falling on the card.');
      return {
        message: 'The image is too dark or has poor contrast.',
        suggestions,
      };

    case 'glare':
      suggestions.push('Avoid direct light reflecting off the card.');
      suggestions.push('Try tilting the card slightly to eliminate reflections.');
      return {
        message: 'There is glare on the card making it difficult to read.',
        suggestions,
      };

    case 'partial_card':
      suggestions.push('Make sure the entire card is visible in the frame.');
      suggestions.push('Hold the camera further from the card to capture it all.');
      return {
        message: 'Only part of the card is visible in the image.',
        suggestions,
      };

    case 'low_resolution':
      suggestions.push('Get closer to the card for a higher resolution image.');
      suggestions.push('Make sure your camera lens is clean.');
      return {
        message: 'The image resolution is too low to read the text clearly.',
        suggestions,
      };

    case 'api_error':
      return {
        message: 'Our service is temporarily unavailable. Please try again in a moment.',
        suggestions: ['Wait a few seconds and try again.', 'If the problem persists, try uploading a different photo.'],
      };

    case 'parse_error':
      return {
        message: 'We had trouble reading your insurance card.',
        suggestions: [
          'Try taking a new photo with better lighting.',
          'Make sure the card text is sharp and in focus.',
          'Try uploading just the front or back of the card separately.',
        ],
      };

    default:
      return {
        message: 'Something went wrong. Please try again.',
        suggestions: ['Try uploading a different photo of your insurance card.'],
      };
  }
}

/**
 * Call Claude API for extraction
 */
async function callExtractionAPI(
  base64Data: string,
  mediaType: ImageMediaType,
  prompt: string
): Promise<{ text: string } | { error: string }> {
  try {
    const response = await anthropic.messages.create({
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
    console.error('Claude API error:', error);
    if (error instanceof Anthropic.APIError) {
      return { error: `API error: ${error.status}` };
    }
    return { error: 'Unknown API error' };
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // === PROTECTION 1: Rate Limiting ===
    const clientIp = getClientIp(request);

    const rateLimitResult = checkRateLimit(
      `insurance-extract:${clientIp}`,
      RATE_LIMIT_PER_HOUR,
      60 * 60 * 1000 // 1 hour
    );

    if (!rateLimitResult.success) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: 'Too many requests. Please try again later.',
        userMessage: `You've reached the limit of ${RATE_LIMIT_PER_HOUR} card scans per hour. Please try again later.`,
        suggestions: ['Wait for the rate limit to reset.', 'You can manually enter your insurance information instead.'],
        rateLimit: {
          remaining: 0,
          resetAt: rateLimitResult.resetTime,
        },
      };
      return NextResponse.json(response, {
        status: 429,
        headers: {
          ...getRateLimitHeaders(rateLimitResult),
          'Retry-After': String(retryAfter),
        },
      });
    }

    const body = await request.json();
    const { image } = body;

    if (!image) {
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: 'No image provided',
        userMessage: 'Please select an image to upload.',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // === PROTECTION 2: Payload Type Validation ===
    if (typeof image !== 'string') {
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: 'Invalid image format - expected base64 string',
        userMessage: 'The image format is not supported. Please try a different image.',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // === PROTECTION 3: Payload Size Validation ===
    if (image.length > MAX_BASE64_LENGTH) {
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: `Image too large. Maximum size is ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`,
        userMessage: `Your image is too large. Please use an image smaller than ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB.`,
        suggestions: [
          'Try taking a new photo at a lower resolution.',
          'Use your phone\'s photo editing to crop to just the card.',
        ],
      };
      return NextResponse.json(response, { status: 413 });
    }

    // === PROTECTION 4: Base64 Format Validation ===
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    // Check for valid base64 characters
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    if (!base64Regex.test(base64Data)) {
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: 'Invalid base64 image data',
        userMessage: 'There was a problem with your image. Please try uploading again.',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Validate minimum length (at least a few bytes of image data)
    if (base64Data.length < 100) {
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: 'Image data too small to be valid',
        userMessage: 'The image appears to be empty or corrupted. Please try a different image.',
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: 'Anthropic API key not configured',
        userMessage: 'The image scanning service is not available. Please enter your insurance information manually.',
      };
      return NextResponse.json(response, { status: 500 });
    }

    // === IMAGE PREPROCESSING ===
    let processedBase64 = base64Data;
    let preprocessingInfo: { resized: boolean; contrastEnhanced: boolean; originalSize: number; processedSize: number } | undefined;

    try {
      // Check if image needs enhancement
      const needsEnhancement = await shouldEnhanceImage(image);

      // Preprocess the image
      const preprocessResult = needsEnhancement
        ? await preprocessImageEnhanced(image)
        : await preprocessImage(image);

      processedBase64 = preprocessResult.base64;
      preprocessingInfo = {
        resized: preprocessResult.processingApplied.resized,
        contrastEnhanced: preprocessResult.processingApplied.contrastEnhanced,
        originalSize: preprocessResult.originalSize,
        processedSize: preprocessResult.processedSize,
      };

      console.log('[InsuranceCardExtract] Image preprocessed:', {
        compressionRatio: preprocessResult.compressionRatio.toFixed(2),
        originalSize: `${(preprocessResult.originalSize / 1024).toFixed(1)}KB`,
        processedSize: `${(preprocessResult.processedSize / 1024).toFixed(1)}KB`,
        enhanced: needsEnhancement,
      });
    } catch (preprocessError) {
      // Log but continue with original image if preprocessing fails
      console.warn('[InsuranceCardExtract] Preprocessing failed, using original:', preprocessError);
    }

    // Use JPEG for preprocessed images, detect for originals
    const mediaType = preprocessingInfo ? 'image/jpeg' : detectMediaType(image);

    // === PRIMARY EXTRACTION ATTEMPT ===
    console.log('[InsuranceCardExtract] Starting primary extraction...');
    const primaryResult = await callExtractionAPI(processedBase64, mediaType, PRIMARY_EXTRACTION_PROMPT);

    if ('error' in primaryResult) {
      const errorInfo = getUserFriendlyError('api_error', []);
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: primaryResult.error,
        userMessage: errorInfo.message,
        suggestions: errorInfo.suggestions,
      };
      return NextResponse.json(response, { status: 503 });
    }

    // Parse the primary response
    let parseResult = parseInsuranceCardResponse(primaryResult.text);

    // === RETRY LOGIC FOR LOW CONFIDENCE ===
    let retryAttempted = false;
    if (
      !parseResult.success ||
      (parseResult.success && parseResult.metadata.confidenceScore < RETRY_CONFIDENCE_THRESHOLD)
    ) {
      console.log('[InsuranceCardExtract] Low confidence or parse failure, attempting retry with alternative prompt...');
      retryAttempted = true;

      const retryResult = await callExtractionAPI(processedBase64, mediaType, ALTERNATIVE_EXTRACTION_PROMPT);

      if (!('error' in retryResult)) {
        const retryParseResult = parseInsuranceCardResponse(retryResult.text);

        // Use retry result if it's better
        if (retryParseResult.success) {
          if (!parseResult.success) {
            parseResult = retryParseResult;
          } else if (
            retryParseResult.metadata.confidenceScore > parseResult.metadata.confidenceScore
          ) {
            parseResult = retryParseResult;
          }
        }
      }
    }

    // === HANDLE PARSE FAILURE ===
    if (!parseResult.success) {
      const primaryIssue = parseResult.issues[0];
      const errorType = primaryIssue?.type || 'parse_error';
      const errorInfo = getUserFriendlyError(errorType, parseResult.issues);

      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: parseResult.error,
        userMessage: errorInfo.message,
        suggestions: [...errorInfo.suggestions, ...parseResult.suggestions].slice(0, 4),
        metadata: {
          confidence: 'low',
          confidenceScore: 0,
          fieldsExtracted: 0,
          totalFields: 22,
          cardType: 'unknown',
          issues: parseResult.issues,
          suggestions: parseResult.suggestions,
          retryAttempted,
          preprocessing: preprocessingInfo,
        },
        rateLimit: {
          remaining: rateLimitResult.remaining - 1,
          resetAt: rateLimitResult.resetTime,
        },
      };

      return NextResponse.json(response, {
        status: 422,
        headers: getRateLimitHeaders(rateLimitResult),
      });
    }

    // === HANDLE LOW FIELD COUNT ===
    if (parseResult.metadata.fieldsExtracted < MIN_FIELDS_FOR_SUCCESS) {
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: 'Insufficient data extracted',
        userMessage:
          "We couldn't extract enough information from your card. The image may be unclear or this may not be an insurance card.",
        suggestions: [
          'Make sure you are uploading a health insurance card.',
          'Try taking a clearer photo with good lighting.',
          'Make sure the entire card is visible.',
        ],
        metadata: {
          ...parseResult.metadata,
          retryAttempted,
          preprocessing: preprocessingInfo,
        },
        rateLimit: {
          remaining: rateLimitResult.remaining - 1,
          resetAt: rateLimitResult.resetTime,
        },
      };

      return NextResponse.json(response, {
        status: 422,
        headers: getRateLimitHeaders(rateLimitResult),
      });
    }

    // === SUCCESS ===
    const extractedData = parseResult.data as InsuranceCardDataWithConfidence;

    const processingTime = Date.now() - startTime;
    console.log('[InsuranceCardExtract] Success:', {
      fieldsExtracted: parseResult.metadata.fieldsExtracted,
      confidence: parseResult.metadata.confidence,
      confidenceScore: parseResult.metadata.confidenceScore.toFixed(2),
      processingTimeMs: processingTime,
      retryAttempted,
    });

    const response: InsuranceCardExtractionResponse = {
      success: true,
      data: extractedData,
      metadata: {
        ...parseResult.metadata,
        retryAttempted,
        preprocessing: preprocessingInfo,
      },
      suggestions:
        parseResult.metadata.confidence !== 'high' ? parseResult.metadata.suggestions : undefined,
      rateLimit: {
        remaining: rateLimitResult.remaining - 1,
        resetAt: rateLimitResult.resetTime,
      },
    };

    return NextResponse.json(response, {
      headers: getRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    // === ERROR HANDLING ===
    console.error('[InsuranceCardExtract] Unexpected error:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Handle specific error types
    if (error instanceof SyntaxError) {
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: 'Invalid request format',
        userMessage: 'There was a problem with your request. Please try again.',
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (error instanceof Anthropic.APIError) {
      const errorInfo = getUserFriendlyError('api_error', []);
      const response: InsuranceCardExtractionResponse = {
        success: false,
        error: 'AI service temporarily unavailable',
        userMessage: errorInfo.message,
        suggestions: errorInfo.suggestions,
      };
      return NextResponse.json(response, { status: 503 });
    }

    // Generic error
    const response: InsuranceCardExtractionResponse = {
      success: false,
      error: 'An unexpected error occurred',
      userMessage: 'Something went wrong. Please try again.',
      suggestions: ['Try uploading a different photo of your insurance card.'],
    };
    return NextResponse.json(response, { status: 500 });
  }
}
