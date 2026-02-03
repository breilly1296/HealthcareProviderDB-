# VerifyMyProvider Insurance Card Upload Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

The insurance card upload feature uses Anthropic's Claude API to extract plan information from photos of insurance cards. It intentionally extracts only plan name, carrier, and type—never member ID, group number, or personal information.

---

## Feature Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Insurance Card OCR Flow                    │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │  User    │    │ Frontend │    │ Backend  │             │
│  │ Takes    │    │ Encode   │    │ OCR API  │             │
│  │ Photo    │    │ Base64   │    │ Claude   │             │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘             │
│       │               │               │                     │
│  1. Capture image     │               │                     │
│       │──────────────→│               │                     │
│       │               │               │                     │
│  2. Encode & send     │               │                     │
│       │               │──────────────→│                     │
│       │               │               │                     │
│       │               │  3. Extract   │                     │
│       │               │     plan info │                     │
│       │               │               │                     │
│  4. Return plan name  │               │                     │
│       │←──────────────│←──────────────│                     │
│       │               │               │                     │
│  5. Pre-fill form     │               │                     │
│       │               │               │                     │
│  ⚠️ NO member ID, group number, or PII extracted           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Privacy Safeguards

### Data NOT Extracted

| Field | Reason |
|-------|--------|
| Member ID | PII - could identify patient |
| Group Number | Could be used for fraud |
| Subscriber Name | PII |
| Dependent Names | PII |
| Date of Birth | PHI |
| Effective Date | Not needed for verification |
| Copay/Deductible | Not needed for verification |

### Data Extracted

| Field | Purpose |
|-------|---------|
| Plan Name | Identify the insurance plan |
| Carrier | Identify the insurance company |
| Plan Type | HMO/PPO/EPO categorization |

### Image Handling

```typescript
// Image is NEVER stored
// - Processed in memory only
// - Not logged
// - Not sent to analytics
// - Immediately discarded after extraction
```

---

## Implementation

### Backend Service

```typescript
// packages/backend/src/services/insuranceCardOcr.ts

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export interface ExtractedPlanInfo {
  planName: string | null;
  carrier: string | null;
  planType: 'HMO' | 'PPO' | 'EPO' | 'POS' | 'OTHER' | null;
  suggestedPlanId: string | null;
}

export async function extractInsuranceInfo(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'
): Promise<ExtractedPlanInfo> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw AppError.serviceUnavailable('Insurance card OCR not configured');
  }

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',  // Fast, cost-effective
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: imageBase64
          }
        },
        {
          type: 'text',
          text: `Extract ONLY the insurance plan information from this card.

Return a JSON object with these fields ONLY:
- planName: The name of the insurance plan (e.g., "Blue Cross Blue Shield PPO")
- carrier: The insurance company name (e.g., "Blue Cross Blue Shield")
- planType: One of "HMO", "PPO", "EPO", "POS", or "OTHER"

IMPORTANT:
- Do NOT extract member ID, group number, subscriber name, or any personal information
- Do NOT include dates, copays, deductibles, or phone numbers
- If you cannot determine a field with confidence, use null
- Return ONLY the JSON object, no other text

Example response:
{"planName": "Aetna Choice POS II", "carrier": "Aetna", "planType": "POS"}`
        }
      ]
    }]
  });

  return parseOcrResponse(response);
}

function parseOcrResponse(response: Anthropic.Message): ExtractedPlanInfo {
  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    // Extract JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize
    return {
      planName: typeof parsed.planName === 'string' ? parsed.planName : null,
      carrier: typeof parsed.carrier === 'string' ? parsed.carrier : null,
      planType: ['HMO', 'PPO', 'EPO', 'POS', 'OTHER'].includes(parsed.planType)
        ? parsed.planType
        : null,
      suggestedPlanId: generatePlanId(parsed)
    };
  } catch (error) {
    console.error('[OCR] Parse error:', error);
    return {
      planName: null,
      carrier: null,
      planType: null,
      suggestedPlanId: null
    };
  }
}

function generatePlanId(info: { carrier?: string; planType?: string }): string | null {
  if (!info.carrier) return null;

  const carrier = info.carrier
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 20);

  const type = info.planType || 'OTHER';

  return `${carrier}_${type}`;
}
```

### API Endpoint

```typescript
// packages/backend/src/routes/insurance.ts

router.post('/extract',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { image, mediaType } = req.body;

    // Validate base64 image
    if (!image || typeof image !== 'string') {
      throw AppError.badRequest('Image data required');
    }

    // Check image size (max 5MB base64)
    if (image.length > 5 * 1024 * 1024 * 1.37) {
      throw AppError.badRequest('Image too large (max 5MB)');
    }

    const result = await extractInsuranceInfo(image, mediaType);

    res.json({
      success: true,
      data: result
    });
  })
);
```

---

## Frontend Implementation

### Camera/Upload Component

```typescript
// packages/frontend/src/components/InsuranceCardUpload.tsx

export function InsuranceCardUpload({ onExtract }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCapture = async (file: File) => {
    setIsProcessing(true);

    try {
      // Convert to base64
      const base64 = await fileToBase64(file);

      // Remove data URL prefix
      const imageData = base64.split(',')[1];

      // Call OCR API
      const result = await api.extractInsuranceInfo({
        image: imageData,
        mediaType: file.type as 'image/jpeg' | 'image/png'
      });

      if (result.planName) {
        onExtract(result);
        toast.success('Plan information extracted!');
      } else {
        toast.warning('Could not extract plan info. Please enter manually.');
      }
    } catch (error) {
      toast.error('Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"  // Use back camera on mobile
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleCapture(e.target.files[0])}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isProcessing}
        className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
      >
        {isProcessing ? (
          <>
            <Spinner className="h-5 w-5" />
            Processing...
          </>
        ) : (
          <>
            <Camera className="h-5 w-5" />
            Scan Insurance Card
          </>
        )}
      </button>

      <p className="text-xs text-gray-500">
        We only extract plan name and carrier.
        Your card image is not stored.
      </p>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

### Integration with Verification Form

```typescript
// packages/frontend/src/components/VerificationForm.tsx

export function VerificationForm({ npi }: Props) {
  const [planInfo, setPlanInfo] = useState<ExtractedPlanInfo | null>(null);

  const handleCardExtract = (info: ExtractedPlanInfo) => {
    setPlanInfo(info);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Insurance Card Upload */}
      <InsuranceCardUpload onExtract={handleCardExtract} />

      {/* Plan Search (pre-filled if extracted) */}
      <PlanSearch
        defaultValue={planInfo?.planName || ''}
        defaultPlanId={planInfo?.suggestedPlanId || ''}
      />

      {/* Rest of form */}
    </form>
  );
}
```

---

## Error Handling

### Common Scenarios

| Scenario | Response | User Message |
|----------|----------|--------------|
| API key not configured | 503 | "Card scanning unavailable" |
| Image too large | 400 | "Image too large (max 5MB)" |
| Unreadable card | Partial data | "Could not read all info" |
| No plan found | Null fields | "Enter plan manually" |

### Implementation

```typescript
try {
  const result = await extractInsuranceInfo(image);

  if (!result.planName && !result.carrier) {
    // Could not extract anything useful
    return res.json({
      success: true,
      data: result,
      warning: 'Could not extract plan information. Please enter manually.'
    });
  }

  return res.json({ success: true, data: result });
} catch (error) {
  if (error.message.includes('rate_limit')) {
    throw AppError.tooManyRequests('OCR service busy. Try again shortly.');
  }
  throw AppError.serviceUnavailable('Card scanning temporarily unavailable');
}
```

---

## Cost Considerations

### Anthropic API Pricing

| Model | Input | Output | Per Card (~) |
|-------|-------|--------|--------------|
| claude-3-haiku | $0.25/M tokens | $1.25/M tokens | ~$0.003 |
| claude-3-sonnet | $3/M tokens | $15/M tokens | ~$0.03 |

Using Haiku for cost-effectiveness (~$3 per 1,000 card scans).

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | For OCR | - | Claude API key |

### Feature Flag

```typescript
// Check if feature is available
const ocrAvailable = !!process.env.ANTHROPIC_API_KEY;

// Frontend can check via API
// GET /api/v1/insurance/capabilities
{
  "ocrAvailable": true
}
```

---

## Recommendations

### Immediate
- ✅ Core OCR functionality complete
- Add image preprocessing (resize, compress)
- Add confidence score to response

### Future
1. **Multiple Card Formats**
   - Support vertical cards
   - Handle cards with multiple logos

2. **Caching**
   - Cache common plan lookups
   - Reduce API calls for similar cards

3. **Fallback OCR**
   - Consider backup provider (Google Vision)
   - Offline card template matching

---

## Conclusion

Insurance card upload is **well-implemented**:

- ✅ Privacy-focused extraction (no PII)
- ✅ Image not stored
- ✅ Clear user messaging
- ✅ Graceful degradation
- ✅ Cost-effective model choice

The feature reduces friction for verification submission while protecting user privacy.
