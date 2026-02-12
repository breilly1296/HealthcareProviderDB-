import { apiFetch } from './api';

// ============================================================================
// Types
// ============================================================================

export interface InsuranceCardResponse {
  id: string;
  insuranceCompany: string | null;
  planName: string | null;
  planType: string | null;
  providerNetwork: string | null;
  networkNotes: string | null;
  subscriberName: string | null;
  subscriberId: string | null;
  groupNumber: string | null;
  effectiveDate: string | null;
  copayPcp: string | null;
  copaySpecialist: string | null;
  copayUrgent: string | null;
  copayEr: string | null;
  deductibleIndiv: string | null;
  deductibleFamily: string | null;
  oopMaxIndiv: string | null;
  oopMaxFamily: string | null;
  rxbin: string | null;
  rxpcn: string | null;
  rxgrp: string | null;
  cardSide: string | null;
  confidenceScore: number | null;
  scannedAt: string;
  updatedAt: string;
  matchedPlan: {
    planId: string;
    planName: string | null;
    issuerName: string | null;
    planType: string | null;
    state: string | null;
    carrier: string | null;
  } | null;
}

export interface InsuranceCardExtraction {
  confidence: string | null;
  confidenceScore: number | null;
  fieldsExtracted: number;
  totalFields: number;
  suggestions: string[];
}

export interface ScanResponse {
  card: InsuranceCardResponse;
  extraction: InsuranceCardExtraction;
}

export interface InsuranceCardUpdates {
  insurance_company?: string | null;
  plan_name?: string | null;
  plan_type?: string | null;
  provider_network?: string | null;
  network_notes?: string | null;
  subscriber_name?: string | null;
  subscriber_id?: string | null;
  group_number?: string | null;
  effective_date?: string | null;
  copay_pcp?: string | null;
  copay_specialist?: string | null;
  copay_urgent?: string | null;
  copay_er?: string | null;
  deductible_individual?: string | null;
  deductible_family?: string | null;
  oop_max_individual?: string | null;
  oop_max_family?: string | null;
  rxbin?: string | null;
  rxpcn?: string | null;
  rxgrp?: string | null;
  card_side?: string | null;
  confidence_score?: number | null;
}

// ============================================================================
// API Functions
// ============================================================================

const insuranceCard = {
  scan: (imageBase64: string, mimeType: string) =>
    apiFetch<ScanResponse>('/me/insurance-card/scan', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType }),
    }),

  save: (data: InsuranceCardUpdates) =>
    apiFetch<{ card: InsuranceCardResponse }>('/me/insurance-card/save', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: () =>
    apiFetch<{ card: InsuranceCardResponse | null }>('/me/insurance-card'),

  update: (updates: InsuranceCardUpdates) =>
    apiFetch<{ card: InsuranceCardResponse }>('/me/insurance-card', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: () =>
    apiFetch<void>('/me/insurance-card', {
      method: 'DELETE',
    }),
};

export default insuranceCard;
