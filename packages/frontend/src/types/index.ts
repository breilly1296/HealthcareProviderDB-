/**
 * Unified type definitions for the frontend
 * Re-exports shared types and defines frontend-specific types
 */

import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

// Re-export from shared package
export {
  // Provider types
  type Provider,
  type ProviderWithRelations,
  type ProviderSearchFilters,
  type ProviderSearchResult,
  type SecondaryTaxonomy,
  getProviderDisplayName,

  // Insurance plan types
  type InsurancePlan,
  type InsurancePlanWithRelations,
  type InsurancePlanSearchFilters,

  // Provider-plan acceptance types
  type ProviderPlanAcceptance,
  type ProviderPlanAcceptanceWithRelations,
  type ConfidenceDetails,
  type ConfidenceFactors,
  type ConfidenceMetadata,
  type ConfidenceLevel,
  getConfidenceLevel,
  getConfidenceLevelDescription,

  // Enums
  EntityType,
  SpecialtyCategory,
  NpiStatus,
  PlanType,
  MetalLevel,
  MarketType,
  DataSource,
  AcceptanceStatus,
  VerificationSource,
  VerificationType,
} from '@healthcareproviderdb/shared';

// ============================================================================
// Frontend-specific types
// ============================================================================

/**
 * Search filters for provider search
 */
export interface SearchFilters {
  state: string;
  city: string;
  cities: string[];
  specialty: string;
  name: string;
  npi: string;
  entityType: string;
  insurancePlanId: string;
  healthSystem: string;
  zipCode: string;
}

/**
 * Pagination state for list views
 */
export interface PaginationState {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    code: string;
    statusCode: number;
  };
}

/**
 * Option for select/dropdown components
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  searchTerms?: string[];
}

/**
 * Grouped options for select components (e.g., carriers with plans)
 */
export interface GroupedSelectOptions {
  label: string;
  options: SelectOption[];
}

/**
 * City data for location filters
 */
export interface CityData {
  city: string;
  state: string;
}

/**
 * Health system data for filtering
 */
export interface HealthSystem {
  name: string;
  state: string;
  locationCount?: number;
}

/**
 * Location data (frontend representation)
 */
export interface Location {
  id: number;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  name: string | null;
  healthSystem: string | null;
  facilityType: string | null;
  providerCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Plan acceptance status for display
 */
export type AcceptanceStatusDisplay = 'ACCEPTED' | 'NOT_ACCEPTED' | 'PENDING' | 'UNKNOWN';

/**
 * Confidence level for display
 */
export type ConfidenceLevelDisplay = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';

/**
 * Verification data for display
 */
export interface Verification {
  id: string;
  providerId: string | null;
  planId: string | null;
  verificationType: string;
  verificationSource: string;
  upvotes: number;
  downvotes: number;
  isApproved: boolean | null;
  notes: string | null;
  createdAt: string;
  provider?: {
    npi: string;
    firstName: string | null;
    lastName: string | null;
    organizationName: string | null;
    entityType: string;
  };
  plan?: {
    planId: string;
    planName: string;
    carrier: string | null;
    issuerName: string | null;
  };
}

/**
 * Plan acceptance with computed display fields
 */
export interface PlanAcceptanceDisplay {
  id: string;
  providerId: string;
  planId: string;
  locationId?: number | null;
  acceptanceStatus: AcceptanceStatusDisplay;
  acceptsNewPatients: boolean | null;
  confidenceScore: number;
  confidenceLevel: string;
  confidenceDescription: string;
  lastVerifiedAt: string | null;
  verificationCount: number;
  plan?: {
    planId: string;
    planName: string | null;
    issuerName: string | null;
    planType: string | null;
    state: string | null;
    carrier: string | null;
  };
  location?: {
    id: number;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  } | null;
  confidence?: {
    score: number;
    level: ConfidenceLevelDisplay;
    description?: string;
    factors: {
      dataSourceScore: number;
      recencyScore: number;
      verificationScore: number;
      agreementScore: number;
    };
    metadata?: {
      researchNote?: string;
      isStale?: boolean;
      daysSinceVerification?: number | null;
      daysUntilStale?: number;
      freshnessThreshold?: number;
      recommendReVerification?: boolean;
      explanation?: string;
    };
  };
  expiresAt?: string | null;
}

/**
 * Carrier group for plan organization
 */
export interface CarrierGroup {
  carrier: string;
  plans: {
    planId: string;
    planName: string | null;
    planType: string | null;
  }[];
}

/**
 * Plan acceptance preview for search results
 */
export interface PlanAcceptancePreview {
  id: number;
  planId: string | null;
  planName: string | null;
  issuerName: string | null;
  acceptanceStatus: string;
  confidenceScore: number;
}

/**
 * Provider display type (with computed displayName)
 */
export interface ProviderDisplay {
  id: string;
  npi: string;
  entityType: 'INDIVIDUAL' | 'ORGANIZATION';
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  credential: string | null;
  organizationName: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  taxonomyCode: string | null;
  taxonomyDescription: string | null;
  specialtyCategory: string | null;
  npiStatus: string;
  displayName: string;
  nppesLastSynced?: string | null;
  // Optional fields for search results with plan data
  confidenceScore?: number | null;
  planAcceptances?: PlanAcceptancePreview[];
  locationCount?: number;
}

/**
 * Insurance plan display type (frontend-specific fields)
 */
export interface InsurancePlanDisplay {
  planId: string;
  planName: string | null;
  issuerName: string | null;
  planType: string | null;
  state: string | null;
  carrier: string | null;
  planVariant: string | null;
  rawName: string | null;
  sourceHealthSystem: string | null;
  providerCount: number;
}

// ============================================================================
// Default/initial values
// ============================================================================

/**
 * Default search filters
 */
export const defaultSearchFilters: SearchFilters = {
  state: '',
  city: '',
  cities: [],
  specialty: '',
  name: '',
  npi: '',
  entityType: '',
  insurancePlanId: '',
  healthSystem: '',
  zipCode: '',
};

/**
 * Default pagination state
 */
export const defaultPaginationState: PaginationState = {
  total: 0,
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  totalPages: 0,
  hasMore: false,
};
