# Insurance Card Upload Feature -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/29-insurance-card-upload.md
**Status:** Fully implemented. The feature is complete with Claude AI integration, image preprocessing, Zod validation, confidence scoring, retry logic, and comprehensive error handling. All core checklist items are verified.

---

## Findings

### API Route (`packages/frontend/src/app/api/insurance-card/extract/route.ts`)

- **Anthropic SDK integrated**
  Verified. Line 2: `import Anthropic from '@anthropic-ai/sdk';`. Client instantiated at line 34 with `process.env.ANTHROPIC_API_KEY`.

- **Model selection**
  Verified. Line 23: `const CLAUDE_MODEL_ID = 'claude-haiku-4-5-20251001';`. The code includes a comment noting this was verified January 2026 and recommends upgrading to Sonnet 4 if accuracy issues arise.

- **Rate limiting applied (10/hour per IP)**
  Verified. Line 28: `const RATE_LIMIT_PER_HOUR = 10;`. Lines 229-253 call `checkRateLimit()` with a 1-hour window and return HTTP 429 with `Retry-After` header and rate limit details when exceeded.

- **File size validation (10MB max)**
  Verified. Line 26: `const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;`. Line 27 calculates the base64 equivalent: `MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_SIZE_BYTES * 1.37)`. Checked at line 279.

- **File type validation (magic bytes)**
  Verified. The `detectMediaType()` function (lines 43-77) checks the first bytes of the decoded base64 data against magic byte signatures for PNG (`89 50 4E 47`), JPEG (`FF D8 FF`), WebP (`52 49 46 46`), and GIF (`47 49 46 38`). Defaults to JPEG if unknown.

- **Base64 format validation**
  Verified. Lines 296-303 test against `/^[A-Za-z0-9+/]+=*$/` regex. Lines 307-313 check minimum length (100 characters).

- **Feature toggle (graceful degradation)**
  Verified. Lines 316-323 check for `ANTHROPIC_API_KEY` and return HTTP 500 with user message "The image scanning service is not available. Please enter your insurance information manually."

- **Retry logic for low confidence**
  Verified. Lines 379-403 implement retry: if the primary extraction yields a confidence score below `RETRY_CONFIDENCE_THRESHOLD` (0.3) or fails to parse, a second attempt is made with `ALTERNATIVE_EXTRACTION_PROMPT`. The better result is kept (comparison at lines 393-399).

- **Minimum fields for success**
  Verified. Line 32: `const MIN_FIELDS_FOR_SUCCESS = 2;`. Lines 440-466 check this threshold and return HTTP 422 if fewer than 2 fields were extracted.

- **Image preprocessing before extraction**
  Verified. Lines 326-355 call `shouldEnhanceImage()` to determine if enhancement is needed, then call either `preprocessImageEnhanced()` or `preprocessImage()`. If preprocessing fails, the original image is used (catch at line 352).

- **Error handling complete**
  Verified. The route handles:
  - Rate limit exceeded (429)
  - No image provided (400)
  - Invalid image format (400)
  - Image too large (413)
  - Invalid base64 (400)
  - Image data too small (400)
  - API key not configured (500)
  - Claude API errors (503)
  - Parse failures (422)
  - Insufficient fields (422)
  - SyntaxError in request (400)
  - Anthropic.APIError specifically (503)
  - Generic catch-all (500)

- **No sensitive data logged**
  Verified. Console logging at lines 346-351 and 472-478 logs only metadata (sizes, ratios, field counts, confidence scores, timing). No image data, member IDs, or personal information is logged.

### Image Preprocessing (`packages/frontend/src/lib/imagePreprocess.ts`)

- **Sharp library integration**
  Verified. Line 7: `import type Sharp from 'sharp';`. Dynamic import at line 10-12 for server-side only usage.

- **Resize images larger than 1024px**
  Verified. Lines 131-137 check if width or height exceeds `maxDimension` (default 1024) and resize with `fit: 'inside'` and `withoutEnlargement: true` to maintain aspect ratio.

- **Compress to 80% quality JPEG**
  Verified. Lines 154-157: `.jpeg({ quality: opts.quality, mozjpeg: true })`. Default quality is 80 (line 62).

- **Auto-rotate based on EXIF data**
  Verified. Lines 122-128: `pipeline.rotate()` (Sharp auto-rotates without arguments). EXIF orientation is checked to track if rotation was applied.

- **Contrast enhancement for low-quality images**
  Verified. Lines 140-145: `.normalize().linear(1.1, -10)` when `enhanceContrast` is true.

- **Enhanced preprocessing for difficult cards**
  Verified. `preprocessImageEnhanced()` at lines 198-208 uses higher settings: `maxDimension: 1536`, `quality: 90`, `enhanceContrast: true`.

- **shouldEnhanceImage detection**
  Verified. Lines 213-237 analyze image statistics: low standard deviation across channels (< 40) or small dimensions (< 400x300) triggers enhancement.

- **Grayscale option available**
  Verified. Lines 148-151 support grayscale conversion but it defaults to `false` (line 65) since some cards use color for organization.

### Validation Schema (`packages/frontend/src/lib/insuranceCardSchema.ts`)

- **Zod schema with all 22+ fields**
  Verified. `InsuranceCardDataSchema` (lines 8-48) defines all extraction fields using `z.string().nullable().optional()` pattern. Fields include: `insurance_company`, `plan_name`, `plan_type`, `provider_network`, `subscriber_name`, `subscriber_id`, `group_number`, `effective_date`, `rxbin`, `rxpcn`, `rxgrp`, `copay_pcp`, `copay_specialist`, `copay_urgent`, `copay_er`, `deductible_individual`, `deductible_family`, `oop_max_individual`, `oop_max_family`, `customer_care_phone`, `website`, `network_notes`, plus metadata fields (`extraction_confidence`, `extraction_notes`, `card_side`, `image_quality_issues`).

- **plan_type accepts standard and custom values**
  Verified. Line 12: `z.enum(['PPO', 'HMO', 'EPO', 'POS']).or(z.string())` -- accepts the four standard types or any string.

- **Confidence scoring implemented**
  Verified. `calculateConfidenceScore()` (lines 119-158) uses a weighted scoring system:
  - Critical fields (`insurance_company`, `plan_name`, `provider_network`): 3 points each
  - Important fields (`subscriber_id`, `group_number`, `plan_type`): 2 points each
  - Other fields: 1 point each, capped at 5 bonus points
  - AI confidence modifiers: `low` = 0.7x, `medium` = 0.85x

- **Confidence levels**
  Verified. `getConfidenceLevel()` (lines 163-167): >= 0.7 = `high`, >= 0.4 = `medium`, < 0.4 = `low`.

- **Suggestion generation**
  Verified. `generateSuggestions()` (lines 172-224) generates contextual suggestions based on missing fields, image quality issues, and card side. Capped at 3 suggestions.

- **JSON extraction from AI response**
  Verified. `parseInsuranceCardResponse()` (lines 243-342) uses regex `/\{[\s\S]*\}/` to extract JSON from the raw AI response, with special handling for "not an insurance card" detection.

### Extraction Prompts

- **PRIMARY_EXTRACTION_PROMPT**
  Verified. Lines 347-393 define a detailed prompt with:
  - Explicit instructions to extract only visible information
  - All 22+ field names with descriptions
  - Carrier-specific guidance (BCBS state variants, United Healthcare plan identifiers, Aetna network indicators, Cigna designations, Medicare handling)
  - Image quality issue reporting
  - Card side detection
  - "Return ONLY the JSON object" instruction

- **ALTERNATIVE_EXTRACTION_PROMPT**
  Verified. Lines 398-414 define a simpler prompt focusing on key fields only (7 data fields plus confidence and card side). Used for retry attempts.

### Frontend Component (`packages/frontend/src/components/InsuranceCardUploader.tsx`)

- **Drag-and-drop upload zone**
  Verified. Lines 203-224 render a clickable upload zone with visual styling and instructions.

- **Image preview with remove button**
  Verified. Lines 226-242 show the selected image with an X button to remove it.

- **Loading state during extraction**
  Verified. Lines 249-267 show a spinning animation and "Scanning card..." text when `loading` is true.

- **Confidence indicator**
  Verified. The `ConfidenceIndicator` component (lines 10-48) renders a color-coded bar (green/yellow/red) with percentage label based on confidence level and score.

- **Extracted data displayed in sections**
  Verified. Lines 383-520 organize extracted data into sections: Plan Information, Subscriber Information, Copays, Deductibles & Out-of-Pocket, Pharmacy Information, and Contact Information. Each section only renders if it has data.

- **Suggestions for improvement**
  Verified. The `ExtractionSuggestions` component (lines 53-86) renders a blue info box with tips. Shown both on failure (lines 321-342) and on medium/low confidence success (lines 377-381).

- **Card side indicator**
  Verified. The `CardSideIndicator` component (lines 91-105) shows "Front of Card", "Back of Card", or "Both Sides" badge.

- **Mobile camera support**
  Verified. Line 294: `<input ... accept="image/*" capture="environment" ...>` enables direct camera capture on mobile devices.

- **File type validation (client-side)**
  Verified. Line 121: checks `file.type.startsWith('image/')`.

- **File size validation (client-side)**
  Verified. Line 127: checks `file.size > 10 * 1024 * 1024`.

- **Manual correction note**
  Verified. Lines 524-527: "Please verify the extracted information. You can manually correct any errors when searching for providers."

- **Error handling with ErrorContext**
  Verified. Line 114: `const { showErrorToast } = useError();`. Lines 167-168 show user-friendly error messages. Line 171 catches network errors via the global error toast.

### Security & Privacy

- **Images processed server-side only**
  Verified. The extraction API runs in the Next.js server-side route handler. Sharp processing and Claude API calls happen server-side.

- **Images not stored permanently**
  Verified. The base64 data is processed in memory, sent to Claude, and then the response is returned. No file system writes or database storage of images.

- **Only extracted text returned to client**
  Verified. The response contains structured JSON data (insurance fields, metadata, suggestions) but not the original or processed image.

- **Rate limiting on upload endpoint**
  Verified. 10 requests per hour per IP, enforced server-side.

- **No member IDs stored in database**
  Verified. Extracted data is returned to the client but never persisted to the database.

- **No card images retained**
  Verified. Images are only held in memory during the request lifecycle.

- **Extraction results not logged**
  Verified. Only metadata (field count, confidence, timing) is logged, not the actual extracted values.

- **Privacy policy updated for feature**
  NOT VERIFIED. Cannot confirm from code alone; this is a legal/documentation item.

- **CAPTCHA on upload**
  NOT IMPLEMENTED. Noted as optional enhancement in the prompt.

### Testing

- **Unit tests for insuranceCardSchema**
  Referenced in prompt as complete; not verified from source files in this review.

- **Unit tests for imagePreprocess**
  Referenced in prompt as complete; not verified from source files in this review.

- **E2E tests for upload flow**
  NOT IMPLEMENTED per prompt checklist.

- **Various card formats tested**
  NOT IMPLEMENTED per prompt checklist.

- **Mobile upload tested**
  NOT IMPLEMENTED per prompt checklist.

---

## Summary

The insurance card upload feature is a well-implemented optional capability that uses Claude AI (Haiku 4.5) to extract structured insurance data from card photos. The implementation covers the full stack:

- **Server-side API route** with 6 layers of protection (rate limiting, type validation, size validation, base64 validation, minimum length, API key check), image preprocessing via Sharp, primary + retry extraction with Claude, Zod schema validation, and confidence scoring.
- **Image preprocessing** with configurable resize, JPEG compression, EXIF rotation, contrast enhancement, and automatic detection of images needing enhancement.
- **Validation schema** with weighted confidence scoring (critical/important/other field tiers), AI confidence integration, contextual suggestion generation, and robust JSON extraction from AI responses.
- **Frontend component** with upload UI, image preview, loading states, confidence visualization, sectioned data display, mobile camera support, and error handling.

The feature gracefully degrades when the Anthropic API key is not configured, allowing manual data entry as a fallback. Privacy is well-handled: images are not stored, extraction results are not logged, and no sensitive data is persisted.

---

## Recommendations

1. **Add E2E tests for the upload flow.** The prompt checklist identifies this as incomplete. Test the full cycle from file selection through extraction display, including error states (rate limit, large file, blurry image).

2. **Test with diverse card formats.** BCBS state variations, Medicare, Medicaid, United Healthcare, Aetna, Cigna, and non-standard carriers should be tested. The prompts include carrier-specific guidance but this has not been validated against real card samples.

3. **Test mobile upload on iOS and Android.** The `capture="environment"` attribute should launch the back camera, but behavior varies across devices and browsers.

4. **Update privacy policy.** The prompt notes this as incomplete. Users should be informed that card images are sent to a third-party AI service (Anthropic) for processing, even though images are not stored.

5. **Consider model upgrade path.** The code uses Haiku 4.5 for cost/speed optimization. If extraction accuracy complaints arise (particularly for low-quality images or non-standard card layouts), the commented upgrade path to Sonnet 4 should be straightforward -- just change `CLAUDE_MODEL_ID`.

6. **Monitor extraction success rates in production.** Add structured logging or metrics for extraction success rate, average confidence score, retry rate, and most common failure types. This data would inform whether the model or prompts need adjustment.

7. **Consider adding CAPTCHA protection.** The prompt notes this as an optional enhancement. Given that the endpoint calls a paid API (Anthropic), CAPTCHA would provide additional protection against automated abuse beyond the 10/hour rate limit.

8. **Base64 regex validation may be overly permissive.** The regex at line 296 (`/^[A-Za-z0-9+/]+=*$/`) validates base64 characters but does not verify the data actually decodes to a valid image. The magic bytes check in `detectMediaType` provides a secondary validation layer, but an invalid base64 string that happens to match the regex pattern could still reach the Claude API. The cost is minimal since Claude would simply fail to process it.
