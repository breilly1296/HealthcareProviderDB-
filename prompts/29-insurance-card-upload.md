---
tags:
  - feature
  - optional
  - ai
type: prompt
priority: 3
---

# Insurance Card Upload Feature

## Files to Review
- `packages/frontend/src/app/api/insurance-card/extract/route.ts` (API route)
- `packages/frontend/src/components/InsuranceCardUploader.tsx` (upload component)
- `packages/frontend/src/lib/insuranceCardSchema.ts` (validation schema & prompts)
- `packages/frontend/src/lib/imagePreprocess.ts` (image preprocessing with Sharp)
- `packages/frontend/src/types/insurance.ts` (TypeScript types)
- `packages/frontend/src/app/insurance/page.tsx` (insurance page)
- `packages/backend/src/routes/insuranceCard.ts` (CRUD + scan endpoints — requireAuth)
- `packages/backend/src/services/insuranceCardService.ts` (save, get, update, delete with encryption)
- `packages/backend/src/services/insuranceCardExtractor.ts` (Claude AI extraction)
- `packages/backend/src/lib/encryption.ts` (AES encryption for PII fields)
- `packages/frontend/src/app/dashboard/insurance/page.tsx` (insurance card dashboard)
- `packages/frontend/src/app/dashboard/insurance/InsuranceCardDashboard.tsx` (dashboard component)
- `packages/frontend/src/components/InsuranceCardScanner.tsx` (webcam scanner)
- `packages/backend/prisma/schema.prisma` (UserInsuranceCard model)

## Feature Overview

Optional feature that uses AI (Anthropic Claude) to extract insurance plan information from uploaded insurance card images.

### User Flow
1. User uploads photo of insurance card
2. Image preprocessed (resized, rotated, optionally enhanced)
3. Image sent to Next.js API route
4. API route sends image to Anthropic Claude for OCR
5. AI extracts plan name, issuer, member ID, etc.
6. Response includes confidence scoring
7. If low confidence, retry with alternative prompt
8. Extracted data displayed with confidence indicator
9. User can verify and use data to search for providers
10. User can save extracted data to their profile (requires login)
11. Saved card data encrypted at rest (subscriber ID, group number, pharmacy info)
12. User can view/update/delete saved card from dashboard
13. Saved plan can be matched to database plans for provider search

## Implementation

### Image Preprocessing
```typescript
// packages/frontend/src/lib/imagePreprocess.ts
import sharp from 'sharp';

export async function preprocessImage(base64Image: string, config: PreprocessConfig): Promise<PreprocessResult> {
  // - Resize images larger than 1024px (maintain aspect ratio)
  // - Compress to 80% quality JPEG
  // - Auto-rotate based on EXIF data
  // - Optionally enhance contrast for low-quality images
  // - Returns base64 string ready for API
}

export async function shouldEnhanceImage(base64Image: string): Promise<boolean> {
  // Analyzes image for low contrast or small size
  // Returns true if image needs enhancement
}
```

### API Route
```typescript
// packages/frontend/src/app/api/insurance-card/extract/route.ts
import Anthropic from '@anthropic-ai/sdk';
import { preprocessImage, shouldEnhanceImage } from '@/lib/imagePreprocess';
import { parseInsuranceCardResponse, PRIMARY_EXTRACTION_PROMPT, ALTERNATIVE_EXTRACTION_PROMPT } from '@/lib/insuranceCardSchema';

export async function POST(request: Request) {
  // 1. Validate request (rate limit, file size, format)
  // 2. Preprocess image with Sharp
  // 3. Call Claude with PRIMARY_EXTRACTION_PROMPT
  // 4. Parse and validate response
  // 5. If low confidence, retry with ALTERNATIVE_EXTRACTION_PROMPT
  // 6. Return data with confidence scoring and suggestions
}
```

### Extraction Prompts
Two prompts are used:
1. **PRIMARY_EXTRACTION_PROMPT** - Detailed prompt with carrier-specific guidance
2. **ALTERNATIVE_EXTRACTION_PROMPT** - Simpler prompt for retry attempts

### Extracted Fields
| Field | Description | Priority |
|-------|-------------|----------|
| `insurance_company` | Insurance carrier name | Critical |
| `plan_name` | Specific plan name | Critical |
| `provider_network` | Network name for matching | Critical |
| `subscriber_id` | Member ID number | Important |
| `group_number` | Group number | Important |
| `plan_type` | PPO, HMO, EPO, POS | Important |
| `effective_date` | Coverage start date | Standard |
| `rxbin`, `rxpcn`, `rxgrp` | Pharmacy info | Standard |
| `copay_*` | Various copay amounts | Standard |
| `deductible_*` | Deductible amounts | Standard |
| `oop_max_*` | Out-of-pocket maximums | Standard |
| `customer_care_phone` | Customer service phone | Standard |
| `website` | Insurance company website | Standard |
| `network_notes` | Network affiliations | Standard |

### Confidence Scoring
Confidence is calculated based on:
- Presence of critical fields (insurance_company, plan_name, provider_network)
- Presence of important fields (subscriber_id, group_number, plan_type)
- AI's self-reported confidence
- Image quality issues detected

Confidence levels:
- **High** (>=70%): All critical fields extracted clearly
- **Medium** (40-69%): Some critical fields missing or unclear
- **Low** (<40%): Most fields missing or extraction problems

### Frontend Component
```typescript
// InsuranceCardUploader.tsx
// - Drag-and-drop upload zone
// - Image preview with remove button
// - Loading state during extraction
// - Confidence indicator (high/medium/low)
// - Display extracted information in sections
// - Show suggestions for improving extraction
// - Card side indicator (front/back)
// - Mobile camera support
```

## Backend Storage (NEW -- Feb 2026)

### Prisma Model: UserInsuranceCard
```prisma
model UserInsuranceCard {
  id               String  @id @default(cuid())
  userId           String  @unique @map("user_id")  // One card per user
  insuranceCompany String? // plaintext
  planName         String? // plaintext
  planType         String? // plaintext (PPO, HMO, etc.)
  providerNetwork  String? // plaintext
  subscriberIdEnc  String? // AES encrypted
  groupNumberEnc   String? // AES encrypted
  rxbinEnc         String? // AES encrypted
  rxpcnEnc         String? // AES encrypted
  rxgrpEnc         String? // AES encrypted
  // ... copay, deductible, OOP max fields (plaintext)
  matchedPlanId    String? // FK to InsurancePlan
  confidenceScore  Int?
  cardSide         String? // front/back
  scannedAt        DateTime
  updatedAt        DateTime @updatedAt
}
```

### Backend Routes (`/api/v1/me/insurance-card`)
All routes require authentication (requireAuth middleware). CSRF protection applied at router level.

| Method | Path | Rate Limit | Description |
|--------|------|-----------|-------------|
| POST | `/scan` | 10/hr per user | Scan image via Claude AI -> extract -> encrypt PII -> save |
| POST | `/save` | default | Save pre-extracted data (frontend two-step flow) |
| GET | `/` | default | Get saved card (decrypts PII for response) |
| PATCH | `/` | default | Update specific card fields |
| DELETE | `/` | default | Remove saved card |

### Encryption
PII fields encrypted with AES via `lib/encryption.ts`:
- `subscriber_id` -> `subscriber_id_enc`
- `group_number` -> `group_number_enc`
- `rxbin` -> `rxbin_enc`
- `rxpcn` -> `rxpcn_enc`
- `rxgrp` -> `rxgrp_enc`

Requires `INSURANCE_ENCRYPTION_KEY` environment variable.

### Frontend Dashboard
- `app/dashboard/insurance/page.tsx` -- Dashboard page
- `InsuranceCardDashboard.tsx` -- View/edit/delete saved card
- `InsuranceCardScanner.tsx` -- Webcam-based card scanner

## Configuration

### Environment Variables
| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes (for feature) | Anthropic API access |
| `INSURANCE_ENCRYPTION_KEY` | Yes (for storage) | AES encryption key for PII fields |

### Constants
| Setting | Value | Description |
|---------|-------|-------------|
| `MAX_IMAGE_SIZE_BYTES` | 10MB | Maximum upload size |
| `RATE_LIMIT_PER_HOUR` | 10 | Extractions per IP per hour |
| `RETRY_CONFIDENCE_THRESHOLD` | 0.3 | Retry below this confidence |
| `MIN_FIELDS_FOR_SUCCESS` | 2 | Minimum fields for success |

### Feature Toggle
The feature is optional and gracefully degrades:
- If `ANTHROPIC_API_KEY` not set, returns appropriate error message
- Users can still manually enter plan information

## Security Considerations

### Data Handling
- [x] Images processed server-side only
- [x] Images not stored permanently
- [x] Only extracted text returned to client
- [x] Rate limiting on upload endpoint (10/hour per IP)
- [x] File size limits enforced (10MB max)

### Privacy
- [x] Member IDs stored ENCRYPTED (AES) -- subscriber_id_enc, group_number_enc, rx fields
- [x] No card images retained
- [x] Extraction results not logged
- [x] INSURANCE_ENCRYPTION_KEY required for decryption
- [x] Encryption key in GCP Secret Manager (production)
- [ ] Privacy policy updated for feature

### API Security
- [x] Rate limiting on extraction endpoint
- [x] File type validation (images only via magic bytes)
- [x] File size limit (10MB)
- [x] Base64 format validation
- [ ] CAPTCHA on upload (optional enhancement)
- [x] Authentication required (requireAuth middleware)
- [x] CSRF protection on all mutating routes
- [x] One card per user (unique constraint on userId)

## Checklist

### Implementation
- [x] API route created
- [x] Anthropic SDK integrated
- [x] InsuranceCardUploader component
- [x] Validation schema with Zod
- [x] Image preprocessing with Sharp
- [x] Error handling complete
- [x] Retry logic for low confidence
- [x] Confidence scoring
- [x] Loading states polished

### Security
- [x] Rate limiting applied
- [x] File size validation
- [x] File type validation
- [x] No sensitive data logged

### UX
- [x] Clear upload instructions
- [x] Extraction confidence shown
- [x] Manual correction allowed
- [x] Mobile camera support
- [x] Suggestions for improvement
- [x] Card side indicator

### Testing
- [x] Unit tests for insuranceCardSchema
- [x] Unit tests for imagePreprocess
- [ ] E2E tests for upload flow
- [ ] Various card formats tested
- [ ] Mobile upload tested

## Error Handling

### User-Friendly Error Messages
All errors return:
- `error`: Technical error message (for logging)
- `userMessage`: Human-friendly message for display
- `suggestions`: Array of tips to help user succeed

### Common Errors
| Error Type | User Message | Suggestions |
|------------|--------------|-------------|
| `not_insurance_card` | "This doesn't appear to be an insurance card" | Upload health insurance card, check card is visible |
| `blur` | "The image is too blurry to read clearly" | Hold camera steady, tap to focus |
| `low_contrast` | "The image is too dark or has poor contrast" | Better lighting, avoid shadows |
| `glare` | "There is glare on the card" | Tilt card to avoid reflections |
| `partial_card` | "Only part of the card is visible" | Entire card in frame |
| `low_resolution` | "Image resolution is too low" | Get closer, clean lens |
| `api_error` | "Service temporarily unavailable" | Try again in a moment |

## Edge Cases Handled

1. **Multiple card types**: BCBS state variations, United Healthcare plans, Aetna networks, Cigna designations
2. **Card sides**: Detects front vs back, suggests uploading other side
3. **Image quality issues**: Detects blur, glare, low contrast, partial visibility
4. **Medicare cards**: Extracts Medicare ID and plan details
5. **Non-standard plan types**: Accepts any string for plan_type beyond PPO/HMO/EPO/POS
6. **Missing fields**: Generates targeted suggestions based on what's missing

## Output Format

```markdown
# Insurance Card Upload

**Last Updated:** [Date]
**Status:** [Active/Inactive]

## Configuration
- ANTHROPIC_API_KEY: [Configured/Not Configured]
- Rate Limit: 10 requests/hour per IP
- Max File Size: 10 MB

## Usage Stats (if available)
- Extractions today: X
- Success rate: X%
- Avg confidence: X%

## Extracted Fields
| Field | Extraction Rate |
|-------|-----------------|
| Insurance Company | X% |
| Plan Name | X% |
| Provider Network | X% |
| Subscriber ID | X% |
| Group Number | X% |

## Issues
[List any issues]

## Recommendations
[List recommendations]
```

## Dependencies

- `sharp` - Image preprocessing (resize, rotate, enhance)
- `@anthropic-ai/sdk` - Claude API client
- `zod` - Response validation
