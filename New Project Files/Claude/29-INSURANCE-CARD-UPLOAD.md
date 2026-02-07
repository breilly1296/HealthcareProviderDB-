# Insurance Card Upload

**Last Updated:** 2026-02-07
**Status:** Active
**Feature Type:** Optional (AI-powered)
**Priority:** 3

---

## Table of Contents

1. [Configuration](#configuration)
2. [Feature Overview](#feature-overview)
3. [Architecture](#architecture)
4. [Source Files](#source-files)
5. [API Route: `/api/insurance-card/extract`](#api-route)
6. [Image Preprocessing Pipeline](#image-preprocessing-pipeline)
7. [AI Extraction & Prompts](#ai-extraction--prompts)
8. [Validation Schema & Confidence Scoring](#validation-schema--confidence-scoring)
9. [TypeScript Types](#typescript-types)
10. [Frontend Components](#frontend-components)
11. [Rate Limiting](#rate-limiting)
12. [Security Considerations](#security-considerations)
13. [Error Handling](#error-handling)
14. [Edge Cases Handled](#edge-cases-handled)
15. [Extracted Fields](#extracted-fields)
16. [Testing](#testing)
17. [Dependencies](#dependencies)
18. [Issues](#issues)
19. [Recommendations](#recommendations)

---

## Configuration

| Setting | Value | Source |
|---------|-------|--------|
| ANTHROPIC_API_KEY | Required for feature | Environment variable |
| AI Model | `claude-haiku-4-5-20251001` (Claude Haiku 4.5) | Hardcoded in route.ts |
| Rate Limit | 10 requests/hour per IP | `RATE_LIMIT_PER_HOUR` constant |
| Max File Size | 10 MB (raw), ~13.7 MB base64 | `MAX_IMAGE_SIZE_BYTES` constant |
| Max API Tokens | 1500 | `max_tokens` in `callExtractionAPI` |
| Retry Threshold | 30% confidence | `RETRY_CONFIDENCE_THRESHOLD` constant |
| Minimum Fields for Success | 2 | `MIN_FIELDS_FOR_SUCCESS` constant |
| Image Max Dimension | 1024px (standard), 1536px (enhanced) | `PreprocessConfig.maxDimension` |
| JPEG Quality | 80% (standard), 90% (enhanced) | `PreprocessConfig.quality` |

### Feature Toggle

The feature is optional and gracefully degrades. If `ANTHROPIC_API_KEY` is not set in the environment, the API route returns a 500 response with the user message: "The image scanning service is not available. Please enter your insurance information manually." Users can always manually enter plan information as an alternative path.

---

## Feature Overview

This feature allows users to upload a photograph of their health insurance card and have an AI model (Anthropic Claude Haiku 4.5) extract structured plan information via OCR. The extracted data (carrier name, plan name, network, member ID, copays, etc.) is then displayed with confidence scoring so the user can verify it and use it to search for in-network providers.

### User Flow

1. User navigates to `/insurance` page
2. User uploads a photo of their insurance card (click, drag-and-drop, or mobile camera)
3. Image is read as base64 via `FileReader` on the client
4. Client sends the base64 image to `POST /api/insurance-card/extract`
5. Server validates the request (rate limit, file size, format, base64 validity)
6. Server preprocesses the image with Sharp (resize, rotate, optionally enhance contrast)
7. Server sends the preprocessed image to Claude Haiku 4.5 with `PRIMARY_EXTRACTION_PROMPT`
8. AI response is parsed for JSON, validated against a Zod schema
9. Confidence score is calculated based on field presence and AI self-assessment
10. If confidence is below 30%, a retry is performed with `ALTERNATIVE_EXTRACTION_PROMPT`
11. The best result is returned to the client with confidence metadata and suggestions
12. Frontend displays extracted data in organized sections with a confidence indicator
13. User can verify and use the data to search for providers

---

## Architecture

```
[Browser]
  |
  | POST /api/insurance-card/extract  (base64 image in JSON body)
  v
[Next.js API Route: route.ts]
  |
  |--> Rate Limit Check (in-memory, per IP)
  |--> Payload Validation (type, size, base64 format)
  |--> Image Preprocessing (Sharp: resize, rotate, enhance)
  |--> Claude API Call (PRIMARY_EXTRACTION_PROMPT)
  |--> JSON Parsing + Zod Validation (insuranceCardSchema.ts)
  |--> Confidence Scoring
  |--> [If low confidence] Retry with ALTERNATIVE_EXTRACTION_PROMPT
  |--> Compare results, return best
  |
  v
[Browser: InsuranceCardUploader.tsx]
  |
  |--> Display confidence indicator (high/medium/low)
  |--> Display extracted fields in sections
  |--> Show suggestions for improvement
  |--> Show card side indicator
```

---

## Source Files

| File | Purpose | Lines |
|------|---------|-------|
| `packages/frontend/src/app/api/insurance-card/extract/route.ts` | Next.js API route handler for extraction | 537 |
| `packages/frontend/src/components/InsuranceCardUploader.tsx` | React upload component with preview and results | 533 |
| `packages/frontend/src/lib/insuranceCardSchema.ts` | Zod validation schema, confidence scoring, extraction prompts | 414 |
| `packages/frontend/src/lib/imagePreprocess.ts` | Sharp-based image preprocessing pipeline | 237 |
| `packages/frontend/src/types/insurance.ts` | TypeScript interfaces for all insurance-related types | 117 |
| `packages/frontend/src/app/insurance/page.tsx` | Insurance scanner page with layout, privacy notice, tips | 121 |
| `packages/frontend/src/lib/rateLimit.ts` | In-memory rate limiter utility | 91 |
| `packages/frontend/src/lib/__tests__/insuranceCardSchema.test.ts` | Unit tests for schema parsing and prompts | 257 |

---

## API Route

**File:** `packages/frontend/src/app/api/insurance-card/extract/route.ts`

### Endpoint

```
POST /api/insurance-card/extract
Content-Type: application/json

Body: { "image": "<base64-encoded-image-string>" }
```

### Protection Layers

The route implements four sequential protection layers before any AI processing occurs:

**1. Rate Limiting (line 226-254)**
```typescript
const rateLimitResult = checkRateLimit(
  `insurance-extract:${clientIp}`,
  RATE_LIMIT_PER_HOUR,     // 10
  60 * 60 * 1000            // 1 hour window
);
```
Returns HTTP 429 with `Retry-After` header if exceeded.

**2. Payload Type Validation (line 269-276)**
Verifies the `image` field exists and is a string.

**3. Payload Size Validation (line 279-290)**
```typescript
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_SIZE_BYTES * 1.37); // ~13.7MB
```
Returns HTTP 413 if the base64 string exceeds the maximum length.

**4. Base64 Format Validation (line 293-314)**
- Strips `data:image/...;base64,` prefix
- Validates characters match `/^[A-Za-z0-9+/]+=*$/`
- Rejects data shorter than 100 characters as likely corrupted

### API Key Check (line 316-323)

If `ANTHROPIC_API_KEY` is not set, returns HTTP 500 with a user-friendly message directing to manual entry.

### Image Type Detection (line 43-77)

The `detectMediaType` function inspects magic bytes to determine the actual image format:

```typescript
function detectMediaType(base64Data: string): ImageMediaType {
  // PNG: 89 50 4E 47
  // JPEG: FF D8 FF
  // WebP: 52 49 46 46
  // GIF: 47 49 46 38
  // Default fallback: 'image/jpeg'
}
```

This is used only when preprocessing was not applied (since preprocessing always outputs JPEG).

### Client IP Extraction (line 82-88)

```typescript
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
```

### Claude API Integration (line 177-220)

The `callExtractionAPI` function wraps the Anthropic SDK call:

```typescript
async function callExtractionAPI(
  base64Data: string,
  mediaType: ImageMediaType,
  prompt: string
): Promise<{ text: string } | { error: string }>
```

Key details:
- Uses model `claude-haiku-4-5-20251001` (chosen for speed and cost-effectiveness)
- Max tokens: 1500
- Sends image as base64 inline with the prompt in a single user message
- Extracts text content from the response content blocks
- Catches `Anthropic.APIError` specifically for proper error categorization

### Retry Logic (line 378-403)

If the primary extraction fails to parse or has a confidence score below `RETRY_CONFIDENCE_THRESHOLD` (0.3):

1. A second API call is made with `ALTERNATIVE_EXTRACTION_PROMPT`
2. The retry result is parsed independently
3. The better result (by confidence score) is selected
4. The `retryAttempted` flag is set in metadata for monitoring

### Response Structure

All responses follow the `InsuranceCardExtractionResponse` interface:

| HTTP Status | Meaning | Conditions |
|-------------|---------|------------|
| 200 | Success | Data extracted with sufficient fields |
| 400 | Bad Request | Missing image, invalid format, invalid base64, syntax error |
| 413 | Payload Too Large | Image exceeds 10MB |
| 422 | Unprocessable | Parse failure or fewer than 2 fields extracted |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Missing API key or unexpected error |
| 503 | Service Unavailable | Claude API error |

---

## Image Preprocessing Pipeline

**File:** `packages/frontend/src/lib/imagePreprocess.ts`

### Overview

Server-side image preprocessing using the Sharp library optimizes images before sending them to Claude. This reduces API costs (smaller payloads), improves OCR accuracy, and normalizes input from diverse camera sources.

### Standard Preprocessing (`preprocessImage`)

Default configuration:
```typescript
const DEFAULT_CONFIG: Required<PreprocessConfig> = {
  maxDimension: 1024,
  quality: 80,
  autoRotate: true,
  enhanceContrast: false,
  grayscale: false,
};
```

Pipeline steps:
1. **Decode**: Strip data URL prefix, convert base64 to Buffer
2. **Metadata**: Read original dimensions and EXIF orientation
3. **Auto-Rotate**: `sharp(buffer).rotate()` corrects EXIF orientation (rotation values > 1)
4. **Resize**: If either dimension exceeds `maxDimension`, resize with `fit: 'inside'` to maintain aspect ratio. `withoutEnlargement: true` prevents upscaling.
5. **Contrast Enhancement** (optional): `pipeline.normalize().linear(1.1, -10)` stretches histogram and applies linear contrast/brightness adjustment
6. **Grayscale** (optional): `pipeline.grayscale()` for potential OCR improvement
7. **JPEG Compression**: `pipeline.jpeg({ quality: 80, mozjpeg: true })` for efficient compression
8. **Output**: Returns base64 string with detailed metadata

### Enhanced Preprocessing (`preprocessImageEnhanced`)

Used when `shouldEnhanceImage` detects poor quality:
```typescript
export async function preprocessImageEnhanced(base64Image: string): Promise<PreprocessResult> {
  return preprocessImage(base64Image, {
    maxDimension: 1536,       // Higher resolution for small text
    quality: 90,              // Higher quality for detail preservation
    autoRotate: true,
    enhanceContrast: true,    // Normalize + linear adjustment
    grayscale: false,         // Keep color (cards use color for organization)
  });
}
```

### Image Quality Detection (`shouldEnhanceImage`)

Analyzes the image to determine if enhancement is needed:

```typescript
export async function shouldEnhanceImage(base64Image: string): Promise<boolean> {
  // 1. Calculate average standard deviation across color channels
  //    If avgStdDev < 40, image likely has low contrast -> enhance
  // 2. Check dimensions: width < 400 or height < 300 -> enhance
}
```

### Preprocessing Result

The `PreprocessResult` interface provides complete metadata:
- `base64`: Processed image as base64
- `mediaType`: Always `'image/jpeg'`
- `originalSize` / `processedSize`: Byte sizes for monitoring
- `compressionRatio`: `originalSize / processedSize`
- `originalDimensions` / `processedDimensions`: Width and height
- `processingApplied`: Flags for `resized`, `rotated`, `contrastEnhanced`, `convertedToGrayscale`

### Sharp Dynamic Import

Sharp is loaded dynamically to avoid bundling issues:
```typescript
async function getSharp(): Promise<typeof Sharp> {
  const mod = await import('sharp');
  return mod.default;
}
```

---

## AI Extraction & Prompts

**File:** `packages/frontend/src/lib/insuranceCardSchema.ts` (lines 347-414)

### Primary Extraction Prompt

A detailed, structured prompt used for the first extraction attempt. Key characteristics:

- Instructs Claude to extract **only clearly visible** text (no guessing)
- Specifies null for unclear fields rather than fabricating values
- Requests card side identification (front/back/both/unknown)
- Requests image quality issue self-reporting
- Defines all 22 data fields plus 4 metadata fields with inline descriptions
- Includes **carrier-specific guidance** for major insurers:
  - **Blue Cross Blue Shield**: Note state/region (e.g., "BCBS of Illinois")
  - **United Healthcare**: Look for plan identifiers ("Choice Plus", "Options PPO")
  - **Aetna**: Look for network indicators ("Open Access", "Managed Choice")
  - **Cigna**: Look for "OAP" (Open Access Plus) or "LocalPlus" designations
  - **Medicare**: Extract Medicare ID and plan details
- Requests JSON-only response (no surrounding text)

### Alternative Extraction Prompt

A simpler, focused prompt used for retry attempts:

- Focuses on 7 key fields plus 2 metadata fields (vs. 22+4 in primary)
- Shorter instructions reduce the chance of AI confusion on difficult images
- Emphasizes conservative extraction: "only extract what is clearly readable"
- Still requests JSON-only output

### Prompt Strategy

The dual-prompt approach handles a real OCR challenge: sometimes a highly detailed prompt causes the AI to over-interpret ambiguous text, while a simpler prompt produces cleaner results from the same image. The system tries the detailed prompt first (maximizing field extraction) and falls back to the simple prompt only when confidence is low.

---

## Validation Schema & Confidence Scoring

**File:** `packages/frontend/src/lib/insuranceCardSchema.ts`

### Zod Schema

All 22 data fields are defined as `z.string().nullable().optional()`, allowing partial extraction:

```typescript
export const InsuranceCardDataSchema = z.object({
  insurance_company: z.string().nullable().optional(),
  plan_name: z.string().nullable().optional(),
  plan_type: z.enum(['PPO', 'HMO', 'EPO', 'POS']).or(z.string()).nullable().optional(),
  provider_network: z.string().nullable().optional(),
  // ... 18 more data fields ...
  extraction_confidence: z.enum(['high', 'medium', 'low']).optional(),
  extraction_notes: z.string().nullable().optional(),
  card_side: z.enum(['front', 'back', 'both', 'unknown']).optional(),
  image_quality_issues: z.array(z.string()).optional(),
});
```

Notable: `plan_type` uses a union of an enum and a string, accepting both standard types (PPO/HMO/EPO/POS) and non-standard types (e.g., "Indemnity") without validation failure.

### Response Parsing (`parseInsuranceCardResponse`)

The parsing function handles several scenarios:

1. **JSON Extraction**: Uses regex `/\{[\s\S]*\}/` to find JSON in the response text, tolerating surrounding text from the AI
2. **Not-an-insurance-card detection**: If no JSON is found, checks for phrases like "not an insurance card", "cannot identify", "doesn't appear to be" and returns a typed `not_insurance_card` issue
3. **JSON Parse Error**: Catches `JSON.parse` failures with user-friendly messages
4. **Zod Validation**: Uses `safeParse` to validate extracted JSON against the schema
5. **Success Path**: Calculates confidence, counts fields, generates suggestions

### Confidence Scoring Algorithm

The `calculateConfidenceScore` function uses a weighted point system:

| Field Category | Fields | Points Each | Max Points |
|---------------|--------|-------------|------------|
| Critical | `insurance_company`, `plan_name`, `provider_network` | 3 | 9 |
| Important | `subscriber_id`, `group_number`, `plan_type` | 2 | 6 |
| Other (capped at 5) | All remaining 16 fields | 1 | 5 |
| **Total** | | | **20** |

The raw score is then adjusted by the AI's self-reported confidence:
- `extraction_confidence: 'low'` --> multiply score by 0.7
- `extraction_confidence: 'medium'` --> multiply score by 0.85
- `extraction_confidence: 'high'` --> no adjustment

Final score is clamped to [0, 1.0].

### Confidence Levels

| Level | Score Range | Meaning |
|-------|-----------|---------|
| High | >= 0.70 | All critical fields extracted clearly |
| Medium | 0.40 - 0.69 | Some critical fields missing or unclear |
| Low | < 0.40 | Most fields missing or extraction problems |

### Suggestion Generation (`generateSuggestions`)

Contextual suggestions are generated based on:
- Missing critical fields (insurance company, subscriber ID, group number, provider network)
- AI-reported image quality issues (blur, glare, dark/shadow keywords)
- Card side detection (suggests uploading the other side when relevant)
- Extraction issues (low resolution, partial card)
- Limited to 3 suggestions maximum

---

## TypeScript Types

**File:** `packages/frontend/src/types/insurance.ts`

### Core Types

```typescript
// Base data structure for all 22 extractable fields
interface InsuranceCardData {
  insurance_company: string | null;
  plan_name: string | null;
  plan_type: 'PPO' | 'HMO' | 'EPO' | 'POS' | string | null;
  // ... 19 more fields, all string | null
}

// Extended with optional per-field confidence
interface InsuranceCardDataWithConfidence extends InsuranceCardData {
  field_confidence?: {
    insurance_company?: FieldConfidence;
    plan_name?: FieldConfidence;
    plan_type?: FieldConfidence;
    provider_network?: FieldConfidence;
    subscriber_id?: FieldConfidence;
    group_number?: FieldConfidence;
  };
}

// Individual field confidence
interface FieldConfidence {
  value: string | null;
  confidence: number;     // 0.0 to 1.0
  reason?: string;
}

// Overall extraction confidence
type ExtractionConfidence = 'high' | 'medium' | 'low';

// Detailed metadata about the extraction
interface ExtractionMetadata {
  confidence: ExtractionConfidence;
  confidenceScore: number;
  fieldsExtracted: number;
  totalFields: number;
  cardType?: 'front' | 'back' | 'both' | 'unknown';
  carrierFormat?: string;
  issues: ExtractionIssue[];
  suggestions: string[];
  retryAttempted: boolean;
  preprocessing?: { resized; contrastEnhanced; originalSize; processedSize };
}

// Typed extraction issues
interface ExtractionIssue {
  type: 'blur' | 'low_contrast' | 'partial_card' | 'glare' |
        'wrong_side' | 'not_insurance_card' | 'low_resolution';
  message: string;
  severity: 'warning' | 'error';
}

// Full API response
interface InsuranceCardExtractionResponse {
  success: boolean;
  data?: InsuranceCardDataWithConfidence;
  error?: string;
  userMessage?: string;
  suggestions?: string[];
  metadata?: ExtractionMetadata;
  rateLimit?: { remaining: number; resetAt: number };
}
```

---

## Frontend Components

### Insurance Page (`/insurance`)

**File:** `packages/frontend/src/app/insurance/page.tsx`

A server-rendered page that provides:
- Breadcrumb navigation (Home > Insurance Card Scanner)
- Page title and description
- Privacy notice informing users that images are not stored
- The `InsuranceCardUploader` component
- Tips section with four bullet points for best results

Page metadata:
```typescript
export const metadata = {
  title: 'Insurance Card Scanner | ProviderDB',
  description: 'Upload your insurance card to extract plan information and find in-network providers.',
};
```

### InsuranceCardUploader Component

**File:** `packages/frontend/src/components/InsuranceCardUploader.tsx`

A client-side component (`'use client'`) with the following sub-components and features:

#### Sub-Components

**`ConfidenceIndicator`** - Displays a color-coded confidence bar:
- High: Green background, green bar
- Medium: Yellow background, yellow bar
- Low: Red background, red bar
- Shows percentage label and animated progress bar

**`ExtractionSuggestions`** - Displays a blue info box with bulleted tips for improving extraction.

**`CardSideIndicator`** - Displays a pill badge showing "Front of Card", "Back of Card", or "Both Sides".

#### Main Component State

```typescript
const [selectedImage, setSelectedImage] = useState<string | null>(null);
const [extractedData, setExtractedData] = useState<InsuranceCardDataWithConfidence | null>(null);
const [extractionResponse, setExtractionResponse] = useState<InsuranceCardExtractionResponse | null>(null);
const [loading, setLoading] = useState(false);
const [validationError, setValidationError] = useState<string | null>(null);
```

#### Upload Flow

1. **File Selection** (`handleFileSelect`):
   - Validates file type starts with `image/`
   - Validates file size is under 10MB
   - Converts to base64 via `FileReader.readAsDataURL`
   - Uses `accept="image/*"` and `capture="environment"` for mobile camera support

2. **Extraction** (`handleExtract`):
   - Sends base64 image to `/api/insurance-card/extract` via `fetch`
   - Parses typed response as `InsuranceCardExtractionResponse`
   - On success: sets `extractedData` for display
   - On failure: shows user-friendly error via `showErrorToast` from `ErrorContext`

3. **Reset** (`handleReset`):
   - Clears all state (image, data, response, errors)
   - Resets the file input element

#### UI Sections

The component renders conditionally based on state:

1. **Upload Zone**: Dashed-border drop zone with camera icon, format/size info, and privacy note
2. **Image Preview**: Shows selected image with remove button overlay and "Extract Insurance Data" button
3. **Loading State**: Spinner animation with "Scanning card..." text
4. **Validation Errors**: Red error box for file type/size issues
5. **Extraction Failures**: Yellow warning box with error message plus blue suggestions box
6. **Extracted Data Display** (on success):
   - Green success header with card side indicator
   - Confidence indicator with progress bar
   - Fields extracted count (e.g., "15 of 22 fields extracted")
   - Suggestions for medium/low confidence
   - Organized sections:
     - Plan Information (company, plan name, type, network, notes)
     - Subscriber Information (name, ID, group number, effective date)
     - Copays (PCP, specialist, urgent care, ER) -- shown only if any copay data exists
     - Deductibles & OOP Max (individual/family deductible and OOP) -- shown only if any data exists
     - Pharmacy Information (RxBIN, RxPCN, RxGRP) -- shown only if any Rx data exists
     - Contact Information (phone, website) -- shown only if any contact data exists
   - Manual correction note at the bottom

---

## Rate Limiting

**File:** `packages/frontend/src/lib/rateLimit.ts`

### Implementation

An in-memory rate limiter using a `Map<string, RateLimitEntry>`:

```typescript
interface RateLimitEntry {
  count: number;
  resetTime: number;
}
```

- **Storage**: In-memory `Map` (resets on server restart)
- **Cleanup**: `setInterval` every 60 seconds removes expired entries
- **Key Format**: `insurance-extract:<client-ip>`
- **Window**: 1 hour (3,600,000 ms)
- **Limit**: 10 requests per window per IP

### Response Headers

All responses include rate limit headers via `getRateLimitHeaders`:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: <remaining>
X-RateLimit-Reset: <unix-timestamp-ms>
```

When rate-limited (HTTP 429), the response also includes:
```
Retry-After: <seconds-until-reset>
```

### Limitations

The in-memory implementation resets on server restart and does not share state across multiple server instances. The code includes a comment noting that Upstash Redis or similar should be considered for production at scale.

---

## Security Considerations

### Data Handling

| Measure | Status | Implementation |
|---------|--------|----------------|
| Images processed server-side only | Implemented | API route processes on server, only text returned to client |
| Images not stored permanently | Implemented | Processed in-memory, no file system writes |
| Only extracted text returned to client | Implemented | Base64 image data stays server-side |
| Rate limiting on upload endpoint | Implemented | 10/hour per IP via in-memory store |
| File size limits enforced | Implemented | 10MB raw, ~13.7MB base64 |

### Privacy

| Measure | Status | Notes |
|---------|--------|-------|
| No member IDs stored in database | Implemented | Extraction results are session-only |
| No card images retained | Implemented | Images are garbage collected after processing |
| Extraction results not logged | Implemented | Only metadata (field count, confidence, timing) logged |
| Privacy policy updated for feature | Not Done | Privacy notice exists on the page but formal policy needs update |

### API Security

| Measure | Status | Implementation |
|---------|--------|----------------|
| Rate limiting | Implemented | In-memory, 10/hour per IP |
| File type validation (magic bytes) | Implemented | `detectMediaType` checks PNG/JPEG/WebP/GIF headers |
| File size limit | Implemented | 10MB max |
| Base64 format validation | Implemented | Regex check + minimum length |
| CAPTCHA on upload | Not Done | Listed as optional enhancement |

### Input Validation Chain

The route validates inputs in this order, rejecting as early as possible:
1. Rate limit check (before reading body)
2. Body parsing (JSON syntax)
3. `image` field presence and type check
4. Base64 string length check (size limit)
5. Base64 character validity check
6. Base64 minimum length check (corruption detection)
7. API key availability check

---

## Error Handling

### User-Friendly Error System

All errors return a structured response with three components:

```typescript
{
  error: string;          // Technical error message (for logging)
  userMessage: string;    // Human-friendly message for display
  suggestions: string[];  // Tips to help user succeed
}
```

### Error Types and Messages

| Error Type | HTTP Status | User Message | Suggestions |
|------------|-------------|--------------|-------------|
| `not_insurance_card` | 422 | "This doesn't appear to be an insurance card. Please upload a photo of your health insurance card." | Upload health insurance card; card should show company name and member ID |
| `blur` | 422 | "The image is too blurry to read clearly." | Hold camera steady; tap to focus |
| `low_contrast` | 422 | "The image is too dark or has poor contrast." | Well-lit area; avoid shadows |
| `glare` | 422 | "There is glare on the card making it difficult to read." | Avoid direct light; tilt card |
| `partial_card` | 422 | "Only part of the card is visible in the image." | Entire card in frame; hold camera further |
| `low_resolution` | 422 | "The image resolution is too low to read the text clearly." | Get closer; clean lens |
| `api_error` | 503 | "Our service is temporarily unavailable. Please try again in a moment." | Wait and retry; try different photo |
| `parse_error` | 422 | "We had trouble reading your insurance card." | New photo with better lighting; sharp focus; try front/back separately |
| Rate limit exceeded | 429 | "You've reached the limit of 10 card scans per hour. Please try again later." | Wait for reset; enter information manually |
| Missing API key | 500 | "The image scanning service is not available. Please enter your insurance information manually." | N/A |
| Insufficient data | 422 | "We couldn't extract enough information from your card." | Check it's an insurance card; clearer photo; entire card visible |
| SyntaxError | 400 | "There was a problem with your request. Please try again." | N/A |
| Anthropic.APIError | 503 | "Our service is temporarily unavailable. Please try again in a moment." | Wait and retry |

### Error Handling in the Frontend

The `InsuranceCardUploader` component handles errors at two levels:
1. **Client-side validation errors**: File type and size checked before upload, displayed in a red error box
2. **Server-side errors**: Parsed from the API response and shown via `showErrorToast` (from `ErrorContext`), with suggestions displayed in a dedicated suggestions panel

---

## Edge Cases Handled

1. **Multiple card types**: The primary prompt includes carrier-specific guidance for BCBS state variations, UnitedHealthcare plans, Aetna networks, and Cigna designations.

2. **Card sides**: The AI identifies front vs. back. When the front is detected without customer service info, it suggests uploading the back. When the back is detected without member ID, it suggests uploading the front.

3. **Image quality issues**: The `shouldEnhanceImage` function detects low contrast (stddev < 40) and small dimensions (< 400x300). The AI also self-reports quality issues (blur, glare, shadows) which feed into suggestion generation.

4. **Medicare cards**: The primary prompt explicitly instructs extraction of Medicare ID and plan details.

5. **Non-standard plan types**: The Zod schema accepts any string for `plan_type` beyond the standard PPO/HMO/EPO/POS enum, preventing validation failures on uncommon plan types like "Indemnity".

6. **Missing fields**: The system generates targeted, context-aware suggestions based on exactly which fields are missing and which card side was detected.

7. **JSON in surrounding text**: The parser uses regex to extract JSON from AI responses that may include explanatory text before or after the JSON object.

8. **Preprocessing failures**: If Sharp fails to preprocess the image (e.g., unsupported format), the original image is sent directly to Claude with a logged warning.

9. **Low-confidence retry**: When the primary attempt yields confidence below 30%, a simpler prompt is tried. The better of the two results is returned.

10. **EXIF rotation**: Mobile photos often have EXIF orientation metadata rather than physical rotation. Sharp's `rotate()` auto-corrects this.

---

## Extracted Fields

### Data Fields (22 total)

| Field | Description | Priority | Category |
|-------|-------------|----------|----------|
| `insurance_company` | Insurance carrier name (e.g., "Blue Cross Blue Shield") | Critical | Plan Info |
| `plan_name` | Specific plan name (e.g., "PPO Gold") | Critical | Plan Info |
| `provider_network` | Network name for provider matching (e.g., "BlueCard PPO") | Critical | Plan Info |
| `plan_type` | PPO, HMO, EPO, POS, or other | Important | Plan Info |
| `subscriber_name` | Member/subscriber name | Standard | Subscriber |
| `subscriber_id` | Member ID number | Important | Subscriber |
| `group_number` | Group number | Important | Subscriber |
| `effective_date` | Coverage start date | Standard | Subscriber |
| `rxbin` | Pharmacy BIN number (usually 6 digits) | Standard | Pharmacy |
| `rxpcn` | Pharmacy PCN | Standard | Pharmacy |
| `rxgrp` | Pharmacy Group ID | Standard | Pharmacy |
| `copay_pcp` | Primary care copay amount | Standard | Copays |
| `copay_specialist` | Specialist copay amount | Standard | Copays |
| `copay_urgent` | Urgent care copay amount | Standard | Copays |
| `copay_er` | Emergency room copay amount | Standard | Copays |
| `deductible_individual` | Individual deductible amount | Standard | Deductibles |
| `deductible_family` | Family deductible amount | Standard | Deductibles |
| `oop_max_individual` | Individual out-of-pocket maximum | Standard | OOP |
| `oop_max_family` | Family out-of-pocket maximum | Standard | OOP |
| `customer_care_phone` | Customer service phone number | Standard | Contact |
| `website` | Insurance company website | Standard | Contact |
| `network_notes` | Network affiliations (BlueCard, MultiPlan, etc.) | Standard | Plan Info |

### Metadata Fields (from AI)

| Field | Description |
|-------|-------------|
| `extraction_confidence` | AI self-reported confidence: high/medium/low |
| `extraction_notes` | Brief notes about extraction challenges |
| `card_side` | Detected card side: front/back/both/unknown |
| `image_quality_issues` | Array of detected issues (e.g., "blurry text", "glare") |

---

## Testing

**File:** `packages/frontend/src/lib/__tests__/insuranceCardSchema.test.ts`

### Test Suite: `insuranceCardSchema`

#### `parseInsuranceCardResponse` Tests (13 tests)

| Test | Description |
|------|-------------|
| Valid JSON with all fields | Parses complete response, verifies field values, checks high confidence and >15 fields extracted |
| Partial extraction (critical fields only) | Parses 3-field response, verifies low/medium confidence level |
| JSON embedded in text | Extracts JSON from surrounding explanatory text |
| No JSON found | Returns failure with suggestions |
| Not an insurance card | Detects "doesn't appear to be" phrases, returns `not_insurance_card` issue |
| Invalid JSON | Catches parse errors, returns "Failed to parse JSON" message |
| High confidence calculation | Verifies score >= 0.70 when all critical+important fields present |
| Low confidence calculation | Verifies score < 0.40 when only non-critical fields present |
| Missing field suggestions | Verifies suggestions mention "insurance company" when missing |
| Card side suggestion | Verifies suggestion to upload back of card when front detected |
| All valid plan types | Iterates PPO/HMO/EPO/POS, verifies each parses correctly |
| Non-standard plan types | Verifies "Indemnity" and other strings accepted |
| Image quality issues | Verifies blur-related suggestions generated from AI quality reports |

#### Extraction Prompts Tests (4 tests)

| Test | Description |
|------|-------------|
| Primary prompt defined | Verifies length > 100 and contains key field names |
| Alternative prompt defined | Verifies length > 50 and contains `insurance_company` |
| Primary more detailed | Verifies primary prompt is longer than alternative |
| Carrier-specific guidance | Verifies primary prompt mentions BCBS, United Healthcare, Aetna, Cigna |

### Test Coverage Gaps

| Area | Status |
|------|--------|
| `insuranceCardSchema` unit tests | Implemented (17 tests) |
| `imagePreprocess` unit tests | Not found in codebase |
| API route integration tests | Not found in codebase |
| E2E upload flow tests | Not implemented |
| Various card format tests | Not implemented |
| Mobile upload tests | Not implemented |

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `sharp` | ^0.33.2 | Server-side image preprocessing (resize, rotate, enhance, compress) |
| `@anthropic-ai/sdk` | ^0.71.2 | Claude API client for AI-powered OCR extraction |
| `zod` | ^3.25.76 | Runtime validation of extracted JSON against schema |
| `next` | ^14.2.35 | API route framework (Next.js App Router) |
| `react` | ^18.3.1 | Frontend component rendering |

---

## Issues

1. **No `imagePreprocess` unit tests**: The prompt checklist marks these as complete, but no test file was found in the codebase at `packages/frontend/src/lib/__tests__/imagePreprocess.test.ts` or any similar path.

2. **In-memory rate limiter is not production-ready**: The current `Map`-based rate limiter resets on server restart and does not share state across multiple server instances. This means users could bypass rate limits by waiting for a deployment or if the application scales horizontally.

3. **Privacy policy not updated**: The security checklist marks this as incomplete. While a privacy notice exists on the `/insurance` page, the formal privacy policy has not been updated to cover the AI-powered image processing feature.

4. **No CAPTCHA protection**: Listed as an optional enhancement in the prompt but not implemented. The rate limiter provides some protection, but automated abuse is still possible.

5. **E2E tests not implemented**: No Playwright tests exist for the upload flow, various card formats, or mobile upload scenarios.

6. **`FieldConfidence` type defined but not populated**: The `InsuranceCardDataWithConfidence` interface includes an optional `field_confidence` property with per-field confidence scores, but the extraction pipeline and prompts do not currently request or populate this data from the AI.

7. **Model version pinned to specific date**: The model ID `claude-haiku-4-5-20251001` is hardcoded. The comment says "verified January 2026" but there is no mechanism to update it automatically or notify when a newer model is available.

---

## Recommendations

1. **Add `imagePreprocess` unit tests**: Write tests covering the preprocessing pipeline, including resize logic, EXIF rotation handling, contrast enhancement, the `shouldEnhanceImage` threshold logic, and graceful failure when Sharp encounters unsupported formats.

2. **Upgrade rate limiter for production**: Replace the in-memory `Map` with a distributed store (Upstash Redis, Vercel KV, or similar) to maintain rate limit state across deployments and horizontal scaling.

3. **Add E2E tests**: Create Playwright tests covering the full upload flow including file selection, extraction, error states, rate limit handling, and mobile viewport testing.

4. **Populate per-field confidence**: Update the extraction prompts to request per-field confidence scores from Claude, then map them into the `field_confidence` property. This would give users more granular feedback about which specific fields might need manual correction.

5. **Update privacy policy**: Document that uploaded images are processed by a third-party AI service (Anthropic), are not stored, and that extracted text data is session-only.

6. **Consider CAPTCHA for abuse prevention**: Add a CAPTCHA challenge (e.g., Cloudflare Turnstile or hCaptcha) before the extraction call to prevent automated scraping of the AI endpoint.

7. **Add model version monitoring**: Implement a configuration-based model selection or a periodic check against the Anthropic API to ensure the latest appropriate Haiku model is being used.

8. **Test with diverse card formats**: Build a test suite with sample card images (or mock AI responses) covering BCBS regional variations, Medicare, Medicaid, dental-only cards, and non-US formats to validate extraction robustness.

9. **Add request logging with anonymized metrics**: Track extraction success rates, average confidence scores, common failure modes, and preprocessing statistics without storing any PII or card data. This would enable the "Usage Stats" section outlined in the prompt's output format.
