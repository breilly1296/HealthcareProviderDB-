import { z, ZodError } from 'zod';

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
}

/**
 * Result type for failed parsing
 */
interface ParseFailure {
  success: false;
  error: string;
  details?: ZodError;
}

/**
 * Union type for parse results
 */
export type ParseInsuranceCardResult = ParseSuccess | ParseFailure;

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
 * } else {
 *   console.error(result.error);
 * }
 */
export function parseInsuranceCardResponse(responseText: string): ParseInsuranceCardResult {
  // Try to extract JSON from the response using regex
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return {
      success: false,
      error: 'No JSON object found in response',
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
    };
  }

  // Validate with Zod schema
  const validationResult = InsuranceCardDataSchema.safeParse(parsedJson);

  if (!validationResult.success) {
    return {
      success: false,
      error: 'Validation failed: ' + validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      details: validationResult.error,
    };
  }

  return {
    success: true,
    data: validationResult.data,
  };
}
