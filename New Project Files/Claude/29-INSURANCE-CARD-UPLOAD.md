# Insurance Card Upload

**Last Updated:** 2026-02-06
**Status:** Active

## Configuration
- ANTHROPIC_API_KEY: Required (feature degrades gracefully if not set)
- Model: `claude-haiku-4-5-20251001` (Claude Haiku 4.5, verified January 2026)
- Rate Limit: 10 requests/hour per IP
- Max File Size: 10 MB
- Retry Confidence Threshold: 0.3 (30%)
- Min Fields for Success: 2

## Usage Stats (if available)
- Extractions today: Not tracked in code (no persistent logging)
- Success rate: Not tracked
- Avg confidence: Not tracked

---

## Implementation Verification

### API Route (`/api/insurance-card/extract/route.ts`) -- VERIFIED
- 537 lines, comprehensive implementation
- **5 protection layers**: Rate limiting, payload type validation, payload size validation, base64 format validation, minimum data length check
- **Image preprocessing**: Uses Sharp library via `preprocessImage()` and `preprocessImageEnhanced()` functions
- **Dual prompt strategy**: Primary extraction with detailed carrier-specific guidance, alternative simpler prompt for retry
- **Confidence-based retry**: If confidence < 0.3 or parse failure, retries with alternative prompt; keeps the better result
- **Graceful degradation**: Returns user-friendly error if ANTHROPIC_API_KEY not configured
- **Magic byte validation**: Detects image type from binary data (PNG, JPEG, WebP, GIF)

### InsuranceCardUploader Component -- VERIFIED
- 533 lines, full-featured upload UI
- **Drag-and-drop zone** with click-to-upload fallback
- **Mobile camera support** via `capture="environment"` on file input
- **Image preview** with remove button
- **Loading state** with animated spinner
- **Confidence indicator** component: visual bar with color coding (green/yellow/red)
- **Card side indicator**: Shows "Front of Card", "Back of Card", or "Both Sides"
- **Extraction suggestions** component for low-confidence results
- **Sectioned display**: Plan Info, Subscriber Info, Copays, Deductibles, Pharmacy, Contact
- **Manual correction note** at bottom of extracted data
- **Validation errors** for file type/size issues displayed separately from extraction errors
- **Dark mode support** throughout

### Insurance Card Schema (`insuranceCardSchema.ts`) -- VERIFIED
- Zod schema with 22 extractable fields plus 4 metadata fields
- **Confidence scoring algorithm**: Weighted system -- critical fields (3 pts each: insurance_company, plan_name, provider_network), important fields (2 pts each: subscriber_id, group_number, plan_type), other fields (1 pt each, capped at 5 bonus)
- **AI confidence modifier**: Low AI confidence multiplies score by 0.7, medium by 0.85
- **Suggestion generation**: Context-aware suggestions based on missing fields, image quality issues, and card side
- **Dual prompts**: `PRIMARY_EXTRACTION_PROMPT` (394 chars, detailed with carrier-specific guidance for BCBS, UHC, Aetna, Cigna, Medicare) and `ALTERNATIVE_EXTRACTION_PROMPT` (simple, 8 key fields)

### Image Preprocessing (`imagePreprocess.ts`) -- VERIFIED
- Dynamic Sharp import via `getSharp()` for tree-shaking
- **Standard preprocessing**: Max 1024px, 80% JPEG quality, auto-rotate via EXIF, mozjpeg compression
- **Enhanced preprocessing**: Max 1536px, 90% quality, contrast normalization + linear adjustment
- **Auto-enhancement detection**: Analyzes channel standard deviation (threshold < 40) and image dimensions (< 400x300)
- **Compression monitoring**: Logs original/processed sizes and compression ratios
- **Processing metadata**: Tracks which operations were applied (resize, rotate, contrast, grayscale)

### TypeScript Types (`insurance.ts`) -- VERIFIED
- `InsuranceCardData`: 22 fields with `string | null` types
- `InsuranceCardDataWithConfidence`: Extends data with per-field confidence scores
- `ExtractionMetadata`: Includes preprocessing info, retry status, issue tracking
- `ExtractionIssue`: Typed issue categories (blur, low_contrast, partial_card, glare, wrong_side, not_insurance_card, low_resolution)
- `InsuranceCardExtractionResponse`: Full response type with success/error/metadata/rateLimit

### Insurance Page (`/insurance/page.tsx`) -- VERIFIED
- Server component with metadata for SEO
- Breadcrumb navigation (Home > Insurance Card Scanner)
- Privacy notice about secure processing and no storage
- Tips section for best photo results
- Clean layout with `InsuranceCardUploader` component

---

## Extracted Fields

| Field | Category | Weight |
|-------|----------|--------|
| `insurance_company` | Critical | 3 pts |
| `plan_name` | Critical | 3 pts |
| `provider_network` | Critical | 3 pts |
| `subscriber_id` | Important | 2 pts |
| `group_number` | Important | 2 pts |
| `plan_type` | Important | 2 pts |
| `subscriber_name` | Standard | 1 pt |
| `effective_date` | Standard | 1 pt |
| `rxbin` | Standard | 1 pt |
| `rxpcn` | Standard | 1 pt |
| `rxgrp` | Standard | 1 pt |
| `copay_pcp` | Standard | 1 pt |
| `copay_specialist` | Standard | 1 pt |
| `copay_urgent` | Standard | 1 pt |
| `copay_er` | Standard | 1 pt |
| `deductible_individual` | Standard | 1 pt |
| `deductible_family` | Standard | 1 pt |
| `oop_max_individual` | Standard | 1 pt |
| `oop_max_family` | Standard | 1 pt |
| `customer_care_phone` | Standard | 1 pt |
| `website` | Standard | 1 pt |
| `network_notes` | Standard | 1 pt |

---

## Security Verification

### Data Handling
- [x] Images processed server-side only -- **VERIFIED**: Processing in Next.js API route
- [x] Images not stored permanently -- **VERIFIED**: No file writes, only in-memory processing
- [x] Only extracted text returned to client -- **VERIFIED**: Response contains structured data, not raw image
- [x] Rate limiting on upload endpoint -- **VERIFIED**: 10/hour per IP via `checkRateLimit()`
- [x] File size limits enforced -- **VERIFIED**: `MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024`, checked against base64 length

### Privacy
- [x] No member IDs stored in database -- **VERIFIED**: No database writes in extraction route
- [x] No card images retained -- **VERIFIED**: Images processed in memory only
- [x] Extraction results not logged -- **VERIFIED**: Only metadata logged (field count, confidence, timing), no PII
- [ ] Privacy policy updated for feature -- **CANNOT VERIFY**: No privacy policy file found in codebase

### API Security
- [x] Rate limiting on extraction endpoint -- **VERIFIED**: `checkRateLimit()` with headers
- [x] File type validation via magic bytes -- **VERIFIED**: `detectMediaType()` checks PNG, JPEG, WebP, GIF magic bytes
- [x] File size limit (10MB) -- **VERIFIED**: `MAX_IMAGE_SIZE_BYTES` and `MAX_BASE64_LENGTH`
- [x] Base64 format validation -- **VERIFIED**: Regex check `^[A-Za-z0-9+/]+=*$` plus minimum length check (100 chars)
- [ ] CAPTCHA on upload -- **NOT IMPLEMENTED** (optional enhancement)

---

## Checklist Verification

### Implementation
- [x] API route created -- **VERIFIED**: `route.ts`, 537 lines
- [x] Anthropic SDK integrated -- **VERIFIED**: `@anthropic-ai/sdk` imported, `claude-haiku-4-5-20251001` model
- [x] InsuranceCardUploader component -- **VERIFIED**: 533 lines with full UI
- [x] Validation schema with Zod -- **VERIFIED**: `InsuranceCardDataSchema` with 26 fields
- [x] Image preprocessing with Sharp -- **VERIFIED**: `imagePreprocess.ts`, 237 lines
- [x] Error handling complete -- **VERIFIED**: 7 error types with user-friendly messages and suggestions
- [x] Retry logic for low confidence -- **VERIFIED**: Retries with `ALTERNATIVE_EXTRACTION_PROMPT` when confidence < 0.3
- [x] Confidence scoring -- **VERIFIED**: Weighted algorithm with 3-tier levels
- [x] Loading states polished -- **VERIFIED**: Animated spinner with "Scanning card..." text

### Security
- [x] Rate limiting applied -- **VERIFIED**
- [x] File size validation -- **VERIFIED**
- [x] File type validation -- **VERIFIED**
- [x] No sensitive data logged -- **VERIFIED**: Only metadata in console.log

### UX
- [x] Clear upload instructions -- **VERIFIED**: Drag/drop zone with format/size info, tips section on page
- [x] Extraction confidence shown -- **VERIFIED**: `ConfidenceIndicator` component with progress bar
- [x] Manual correction allowed -- **VERIFIED**: Note at bottom says "Please verify the extracted information"
- [x] Mobile camera support -- **VERIFIED**: `capture="environment"` on file input
- [x] Suggestions for improvement -- **VERIFIED**: `ExtractionSuggestions` component
- [x] Card side indicator -- **VERIFIED**: `CardSideIndicator` component

### Testing
- [x] Unit tests for insuranceCardSchema -- **VERIFIED**: File exists at `packages/frontend/src/lib/__tests__/insuranceCardSchema.test.ts`
- [x] Unit tests for imagePreprocess -- **VERIFIED**: File exists at `packages/frontend/src/lib/__tests__/imagePreprocess.test.ts`
- [ ] E2E tests for upload flow -- **NOT FOUND**
- [ ] Various card formats tested -- **CANNOT VERIFY** from code alone
- [ ] Mobile upload tested -- **CANNOT VERIFY** from code alone

---

## Issues

1. **No usage analytics**: Extraction success rates, confidence distributions, and error frequencies are not tracked persistently. Only console.log metadata exists.
2. **No privacy policy**: The insurance page has a privacy notice inline, but no dedicated privacy policy document was found.
3. **Rate limit is per-IP in-memory**: The `checkRateLimit` function used in the frontend API route appears to be an in-memory implementation (separate from the backend Redis rate limiter). This means rate limits reset on server restart and are not shared across instances.
4. **No connection to provider search**: After extraction, the user sees data but there is no automatic "Find providers that accept this plan" flow linking extracted data to the search page.

## Recommendations

1. **Add analytics endpoint**: Track extraction success rate, average confidence, common carriers, and failure reasons to monitor feature quality.
2. **Link extraction to search**: After successful extraction, offer a "Find In-Network Providers" button that pre-populates the search form with the extracted insurance company and plan name.
3. **Add privacy policy page**: Create a dedicated `/privacy` page referenced from the insurance card scanner page.
4. **Consider server-side rate limiting**: Move the rate limit check to the backend Redis-based system for consistency across instances and persistence across restarts.
5. **Add E2E tests**: The upload flow is a critical user-facing feature that would benefit from Playwright E2E coverage.
