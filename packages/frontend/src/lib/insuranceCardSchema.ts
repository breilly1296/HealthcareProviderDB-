import { z, ZodError } from 'zod';
import type { ExtractionIssue, ExtractionMetadata, ExtractionConfidence } from '@/types/insurance';

/**
 * Zod schema for validating insurance card data extracted from images.
 * All fields are optional and nullable to handle partial extractions.
 */
export const InsuranceCardDataSchema = z.object({
  // Plan Information
  insurance_company: z.string().nullable().optional(),
  plan_name: z.string().nullable().optional(),
  plan_type: z.enum(['PPO', 'HMO', 'EPO', 'POS']).or(z.string()).nullable().optional(),
  provider_network: z.string().nullable().optional(),

  // Subscriber Information
  subscriber_name: z.string().nullable().optional(),
  subscriber_id: z.string().nullable().optional(),
  group_number: z.string().nullable().optional(),
  effective_date: z.string().nullable().optional(),

  // Pharmacy Information
  rxbin: z.string().nullable().optional(),
  rxpcn: z.string().nullable().optional(),
  rxgrp: z.string().nullable().optional(),

  // Copay Information
  copay_pcp: z.string().nullable().optional(),
  copay_specialist: z.string().nullable().optional(),
  copay_urgent: z.string().nullable().optional(),
  copay_er: z.string().nullable().optional(),

  // Deductible and Out-of-Pocket Information
  deductible_individual: z.string().nullable().optional(),
  deductible_family: z.string().nullable().optional(),
  oop_max_individual: z.string().nullable().optional(),
  oop_max_family: z.string().nullable().optional(),

  // Contact Information
  customer_care_phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  network_notes: z.string().nullable().optional(),

  // Confidence information from AI
  extraction_confidence: z.enum(['high', 'medium', 'low']).optional(),
  extraction_notes: z.string().nullable().optional(),
  card_side: z.enum(['front', 'back', 'both', 'unknown']).optional(),
  image_quality_issues: z.array(z.string()).optional(),
});

/**
 * Type inferred from the InsuranceCardDataSchema.
 * Use this type for validated insurance card data.
 */
export type ValidatedInsuranceCardData = z.infer<typeof InsuranceCardDataSchema>;

/**
 * Result type for successful parsing
 */
interface ParseSuccess {
  success: true;
  data: ValidatedInsuranceCardData;
  metadata: ExtractionMetadata;
}

/**
 * Result type for failed parsing
 */
interface ParseFailure {
  success: false;
  error: string;
  details?: ZodError;
  issues: ExtractionIssue[];
  suggestions: string[];
}

/**
 * Union type for parse results
 */
export type ParseInsuranceCardResult = ParseSuccess | ParseFailure;

/**
 * Count non-null fields in the extracted data
 */
function countExtractedFields(data: ValidatedInsuranceCardData): number {
  const fieldsToCount = [
    'insurance_company',
    'plan_name',
    'plan_type',
    'provider_network',
    'subscriber_name',
    'subscriber_id',
    'group_number',
    'effective_date',
    'rxbin',
    'rxpcn',
    'rxgrp',
    'copay_pcp',
    'copay_specialist',
    'copay_urgent',
    'copay_er',
    'deductible_individual',
    'deductible_family',
    'oop_max_individual',
    'oop_max_family',
    'customer_care_phone',
    'website',
    'network_notes',
  ] as const;

  return fieldsToCount.filter((field) => {
    const value = data[field as keyof ValidatedInsuranceCardData];
    return value !== null && value !== undefined && value !== '';
  }).length;
}

/**
 * Calculate confidence score based on extracted data
 */
function calculateConfidenceScore(data: ValidatedInsuranceCardData): number {
  // Critical fields for provider search
  const criticalFields = ['insurance_company', 'plan_name', 'provider_network'];
  const importantFields = ['subscriber_id', 'group_number', 'plan_type'];

  let score = 0;
  let maxScore = 0;

  // Critical fields worth 3 points each
  criticalFields.forEach((field) => {
    maxScore += 3;
    const value = data[field as keyof ValidatedInsuranceCardData];
    if (value !== null && value !== undefined && value !== '') {
      score += 3;
    }
  });

  // Important fields worth 2 points each
  importantFields.forEach((field) => {
    maxScore += 2;
    const value = data[field as keyof ValidatedInsuranceCardData];
    if (value !== null && value !== undefined && value !== '') {
      score += 2;
    }
  });

  // Other fields worth 1 point each (capped contribution)
  const otherFieldCount = countExtractedFields(data) - criticalFields.length - importantFields.length;
  score += Math.min(otherFieldCount, 5); // Cap at 5 bonus points
  maxScore += 5;

  // Use AI's confidence if provided
  if (data.extraction_confidence === 'low') {
    score *= 0.7;
  } else if (data.extraction_confidence === 'medium') {
    score *= 0.85;
  }

  return Math.min(score / maxScore, 1.0);
}

/**
 * Determine confidence level from score
 */
function getConfidenceLevel(score: number): ExtractionConfidence {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Generate suggestions based on extraction results
 */
function generateSuggestions(
  data: ValidatedInsuranceCardData,
  issues: ExtractionIssue[]
): string[] {
  const suggestions: string[] = [];

  // Check for missing critical fields
  if (!data.insurance_company) {
    suggestions.push('The insurance company name could not be identified. Make sure the card shows the carrier logo or name clearly.');
  }
  if (!data.subscriber_id && !data.group_number) {
    suggestions.push('Member ID and Group Number were not found. These are usually on the front of the card.');
  }
  if (!data.provider_network) {
    suggestions.push('The provider network could not be identified. This information helps match you with in-network providers.');
  }

  // Check for image quality issues from AI
  if (data.image_quality_issues && data.image_quality_issues.length > 0) {
    data.image_quality_issues.forEach((issue) => {
      if (issue.toLowerCase().includes('blur')) {
        suggestions.push('The image appears blurry. Try taking a new photo with better focus.');
      }
      if (issue.toLowerCase().includes('glare')) {
        suggestions.push('There may be glare on the card. Try photographing at an angle to avoid reflections.');
      }
      if (issue.toLowerCase().includes('dark') || issue.toLowerCase().includes('shadow')) {
        suggestions.push('The image is too dark. Try taking the photo in better lighting.');
      }
    });
  }

  // Suggest uploading the other side
  if (data.card_side === 'front' && !data.customer_care_phone) {
    suggestions.push('Consider uploading the back of your card for customer service contact information.');
  }
  if (data.card_side === 'back' && !data.subscriber_id) {
    suggestions.push('The Member ID is usually on the front of the card. Try uploading the front side.');
  }

  // Generic suggestions based on issues
  issues.forEach((issue) => {
    if (issue.type === 'low_resolution') {
      suggestions.push('The image resolution is low. Try taking a closer photo of your card.');
    }
    if (issue.type === 'partial_card') {
      suggestions.push('Only part of the card is visible. Make sure the entire card is in frame.');
    }
  });

  // Limit suggestions to most relevant
  return suggestions.slice(0, 3);
}

/**
 * Parses and validates an insurance card response from an AI model.
 * Extracts JSON from the response text and validates it against the schema.
 *
 * @param responseText - The raw response text that may contain JSON
 * @returns A result object indicating success with data, or failure with error details
 *
 * @example
 * const result = parseInsuranceCardResponse(aiResponse);
 * if (result.success) {
 *   console.log(result.data.insurance_company);
 *   console.log('Confidence:', result.metadata.confidence);
 * } else {
 *   console.error(result.error);
 *   console.log('Suggestions:', result.suggestions);
 * }
 */
export function parseInsuranceCardResponse(responseText: string): ParseInsuranceCardResult {
  const issues: ExtractionIssue[] = [];

  // Try to extract JSON from the response using regex
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    // Check if response indicates this isn't an insurance card
    const lowerResponse = responseText.toLowerCase();
    if (
      lowerResponse.includes('not an insurance card') ||
      lowerResponse.includes('cannot identify') ||
      lowerResponse.includes("doesn't appear to be")
    ) {
      return {
        success: false,
        error: 'The uploaded image does not appear to be an insurance card.',
        issues: [
          {
            type: 'not_insurance_card',
            message: 'Image does not appear to be an insurance card',
            severity: 'error',
          },
        ],
        suggestions: [
          'Please upload a photo of your health insurance card.',
          'Make sure the card is clearly visible and not obstructed.',
        ],
      };
    }

    return {
      success: false,
      error: 'No JSON object found in response',
      issues: [],
      suggestions: ['Please try uploading a clearer image of your insurance card.'],
    };
  }

  const jsonString = jsonMatch[0];

  // Safely parse the JSON
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonString);
  } catch (parseError) {
    return {
      success: false,
      error: `Failed to parse JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`,
      issues: [],
      suggestions: [
        'There was a problem processing your card. Please try again.',
        'If the problem persists, try uploading a different photo.',
      ],
    };
  }

  // Validate with Zod schema
  const validationResult = InsuranceCardDataSchema.safeParse(parsedJson);

  if (!validationResult.success) {
    return {
      success: false,
      error:
        'Validation failed: ' +
        validationResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      details: validationResult.error,
      issues: [],
      suggestions: ['The extracted data could not be validated. Please try a clearer photo.'],
    };
  }

  const data = validationResult.data;

  // Calculate confidence
  const confidenceScore = calculateConfidenceScore(data);
  const confidence = getConfidenceLevel(confidenceScore);
  const fieldsExtracted = countExtractedFields(data);

  // Generate suggestions
  const suggestions = generateSuggestions(data, issues);

  // Build metadata
  const metadata: ExtractionMetadata = {
    confidence,
    confidenceScore,
    fieldsExtracted,
    totalFields: 22,
    cardType: data.card_side || 'unknown',
    issues,
    suggestions,
    retryAttempted: false,
  };

  return {
    success: true,
    data,
    metadata,
  };
}

/**
 * Primary extraction prompt - detailed and structured
 */
export const PRIMARY_EXTRACTION_PROMPT = `You are an expert at reading insurance cards. Extract all visible information from this insurance card image.

IMPORTANT INSTRUCTIONS:
1. Extract ONLY what you can clearly see - do not guess or infer
2. For unclear text, set the value to null rather than guessing
3. Identify the card side (front typically has member ID, back has customer service info)
4. Note any image quality issues that affect extraction

Return a JSON object with these fields (use null for fields you cannot read clearly):

{
  "insurance_company": "The insurance carrier name (e.g., 'Blue Cross Blue Shield', 'Aetna', 'UnitedHealthcare')",
  "plan_name": "The specific plan name if shown",
  "plan_type": "PPO, HMO, EPO, POS, or other plan type designation",
  "provider_network": "Network name - CRITICAL for matching providers (e.g., 'Blue Card PPO', 'Open Access', 'Cigna OAP')",
  "subscriber_name": "Member/subscriber name",
  "subscriber_id": "Member ID number (often labeled 'Member ID', 'ID#', or 'Subscriber ID')",
  "group_number": "Group number (often labeled 'Group#', 'Grp', or 'Group')",
  "effective_date": "Coverage effective date if shown",
  "rxbin": "Pharmacy BIN number (usually 6 digits)",
  "rxpcn": "Pharmacy PCN",
  "rxgrp": "Pharmacy Group ID",
  "copay_pcp": "Primary care copay amount (e.g., '$25')",
  "copay_specialist": "Specialist copay amount",
  "copay_urgent": "Urgent care copay amount",
  "copay_er": "Emergency room copay amount",
  "deductible_individual": "Individual deductible amount",
  "deductible_family": "Family deductible amount",
  "oop_max_individual": "Individual out-of-pocket maximum",
  "oop_max_family": "Family out-of-pocket maximum",
  "customer_care_phone": "Customer service phone number",
  "website": "Insurance company website",
  "network_notes": "Any network affiliations (BlueCard, MultiPlan, Beech Street, etc.)",
  "extraction_confidence": "high/medium/low - your confidence in the extraction accuracy",
  "extraction_notes": "Brief notes about extraction challenges if any",
  "card_side": "front/back/both/unknown",
  "image_quality_issues": ["list of issues like 'blurry text', 'glare', 'partial card visible', 'low resolution'"]
}

SPECIAL HANDLING:
- Blue Cross Blue Shield: Note the specific state/region (e.g., "BCBS of Illinois")
- United Healthcare: Look for plan identifiers like "Choice Plus", "Options PPO"
- Aetna: Look for network indicators like "Open Access", "Managed Choice"
- Cigna: Look for "OAP" (Open Access Plus) or "LocalPlus" designations
- For Medicare cards: Extract the Medicare ID and plan details

Return ONLY the JSON object, no additional text.`;

/**
 * Alternative extraction prompt - simpler, for retry attempts
 */
export const ALTERNATIVE_EXTRACTION_PROMPT = `Extract insurance card information from this image. Focus on the most important fields.

Return JSON with these key fields (use null if not visible):
{
  "insurance_company": "carrier name",
  "plan_name": "plan name if shown",
  "plan_type": "PPO/HMO/EPO/POS if indicated",
  "provider_network": "network name if shown",
  "subscriber_id": "member ID number",
  "group_number": "group number",
  "customer_care_phone": "phone number if visible",
  "extraction_confidence": "high/medium/low",
  "card_side": "front/back/unknown"
}

Be conservative - only extract what is clearly readable.
Return ONLY the JSON object.`;
