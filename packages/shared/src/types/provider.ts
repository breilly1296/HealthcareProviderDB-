import { EntityType, NpiStatus, SpecialtyCategory } from './enums';

// Secondary taxonomy structure
export interface SecondaryTaxonomy {
  code: string;
  description: string;
  isPrimary: boolean;
}

// Base provider type
export interface Provider {
  id: string;
  npi: string;
  entityType: EntityType;

  // Individual provider fields
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  credential: string | null;

  // Organization fields
  organizationName: string | null;

  // Primary practice address
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;

  // Contact
  phone: string | null;
  fax: string | null;

  // Taxonomy/Specialty
  taxonomyCode: string | null;
  taxonomyDescription: string | null;
  specialtyCategory: SpecialtyCategory | null;
  secondaryTaxonomies: SecondaryTaxonomy[] | null;

  // NPI metadata
  enumerationDate: Date | null;
  lastUpdateDate: Date | null;
  deactivationDate: Date | null;
  reactivationDate: Date | null;
  npiStatus: NpiStatus;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Provider with relations
export interface ProviderWithRelations extends Provider {
  planAcceptances?: ProviderPlanAcceptanceBasic[];
}

// Basic plan acceptance for relation
export interface ProviderPlanAcceptanceBasic {
  id: string;
  planId: string;
  acceptanceStatus: string;
  confidenceScore: number;
}

// Provider creation input
export interface CreateProviderInput {
  npi: string;
  entityType: EntityType;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  credential?: string | null;
  organizationName?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string | null;
  fax?: string | null;
  taxonomyCode?: string | null;
  taxonomyDescription?: string | null;
  specialtyCategory?: SpecialtyCategory | null;
  secondaryTaxonomies?: SecondaryTaxonomy[] | null;
  enumerationDate?: Date | null;
  lastUpdateDate?: Date | null;
}

// Provider update input
export interface UpdateProviderInput extends Partial<CreateProviderInput> {
  npiStatus?: NpiStatus;
  deactivationDate?: Date | null;
  reactivationDate?: Date | null;
}

// Provider search filters
export interface ProviderSearchFilters {
  state?: string;
  city?: string;
  zip?: string;
  specialty?: SpecialtyCategory;
  name?: string;
  npi?: string;
  entityType?: EntityType;
  npiStatus?: NpiStatus;
}

// Provider search result
export interface ProviderSearchResult {
  providers: Provider[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Provider display name helper
export function getProviderDisplayName(provider: Provider): string {
  if (provider.entityType === EntityType.ORGANIZATION) {
    return provider.organizationName || 'Unknown Organization';
  }
  const parts = [provider.firstName, provider.middleName, provider.lastName]
    .filter(Boolean)
    .join(' ');
  return provider.credential ? `${parts}, ${provider.credential}` : parts || 'Unknown Provider';
}
