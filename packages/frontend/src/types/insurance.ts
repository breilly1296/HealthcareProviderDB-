export interface InsuranceCardData {
  insurance_company: string | null;
  plan_name: string | null;
  plan_type: 'PPO' | 'HMO' | 'EPO' | 'POS' | string | null;
  provider_network: string | null;
  subscriber_name: string | null;
  subscriber_id: string | null;
  group_number: string | null;
  effective_date: string | null;
  rxbin: string | null;
  rxpcn: string | null;
  rxgrp: string | null;
  copay_pcp: string | null;
  copay_specialist: string | null;
  copay_urgent: string | null;
  copay_er: string | null;
  deductible_individual: string | null;
  deductible_family: string | null;
  oop_max_individual: string | null;
  oop_max_family: string | null;
  customer_care_phone: string | null;
  website: string | null;
  network_notes: string | null;
}

/**
 * Confidence score for individual extracted fields
 */
export interface FieldConfidence {
  /** The extracted value */
  value: string | null;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Reason for lower confidence (if applicable) */
  reason?: string;
}

/**
 * Detailed extraction result with per-field confidence scores
 */
export interface InsuranceCardDataWithConfidence extends InsuranceCardData {
  /** Per-field confidence scores */
  field_confidence?: {
    insurance_company?: FieldConfidence;
    plan_name?: FieldConfidence;
    plan_type?: FieldConfidence;
    provider_network?: FieldConfidence;
    subscriber_id?: FieldConfidence;
    group_number?: FieldConfidence;
  };
}

/**
 * Overall extraction confidence levels
 */
export type ExtractionConfidence = 'high' | 'medium' | 'low';

/**
 * Detailed extraction metadata
 */
export interface ExtractionMetadata {
  /** Overall confidence level */
  confidence: ExtractionConfidence;
  /** Numeric confidence score (0.0 to 1.0) */
  confidenceScore: number;
  /** Number of fields successfully extracted */
  fieldsExtracted: number;
  /** Total possible fields */
  totalFields: number;
  /** Card type detection (if identifiable) */
  cardType?: 'front' | 'back' | 'both' | 'unknown';
  /** Detected insurance company format */
  carrierFormat?: string;
  /** Issues detected during extraction */
  issues: ExtractionIssue[];
  /** Suggestions for better extraction */
  suggestions: string[];
  /** Whether a retry was attempted */
  retryAttempted: boolean;
  /** Image preprocessing info */
  preprocessing?: {
    resized: boolean;
    contrastEnhanced: boolean;
    originalSize: number;
    processedSize: number;
  };
}

/**
 * Issues detected during extraction
 */
export interface ExtractionIssue {
  type: 'blur' | 'low_contrast' | 'partial_card' | 'glare' | 'wrong_side' | 'not_insurance_card' | 'low_resolution';
  message: string;
  severity: 'warning' | 'error';
}

export interface InsuranceCardExtractionRequest {
  image: string; // base64 encoded image
}

export interface InsuranceCardExtractionResponse {
  success: boolean;
  data?: InsuranceCardDataWithConfidence;
  error?: string;
  /** User-friendly error message with guidance */
  userMessage?: string;
  /** Specific suggestions to improve extraction */
  suggestions?: string[];
  /** Detailed extraction metadata */
  metadata?: ExtractionMetadata;
  /** Rate limit information */
  rateLimit?: {
    remaining: number;
    resetAt: number;
  };
}
