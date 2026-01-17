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

export interface InsuranceCardExtractionRequest {
  image: string; // base64 encoded image
}

export interface InsuranceCardExtractionResponse {
  success: boolean;
  data?: InsuranceCardData;
  error?: string;
}
