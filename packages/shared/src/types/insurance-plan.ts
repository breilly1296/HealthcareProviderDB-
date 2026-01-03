import { DataSource, MarketType, MetalLevel, PlanType } from './enums';

// Base insurance plan type
export interface InsurancePlan {
  id: string;
  planId: string;
  planName: string;

  // Carrier info
  carrierId: string | null;
  carrierName: string;

  // Plan details
  planType: PlanType;
  metalLevel: MetalLevel | null;
  marketType: MarketType;

  // Coverage area
  statesCovered: string[];
  serviceArea: string | null;

  // Plan year
  planYear: number;
  effectiveDate: Date | null;
  terminationDate: Date | null;

  // Data source
  dataSource: DataSource;
  sourceFileId: string | null;

  // Status
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Insurance plan with relations
export interface InsurancePlanWithRelations extends InsurancePlan {
  providerCount?: number;
}

// Plan creation input
export interface CreateInsurancePlanInput {
  planId: string;
  planName: string;
  carrierId?: string | null;
  carrierName: string;
  planType: PlanType;
  metalLevel?: MetalLevel | null;
  marketType: MarketType;
  statesCovered: string[];
  serviceArea?: string | null;
  planYear: number;
  effectiveDate?: Date | null;
  terminationDate?: Date | null;
  dataSource: DataSource;
  sourceFileId?: string | null;
  isActive?: boolean;
}

// Plan update input
export interface UpdateInsurancePlanInput extends Partial<CreateInsurancePlanInput> {}

// Plan search filters
export interface InsurancePlanSearchFilters {
  carrierName?: string;
  planType?: PlanType;
  metalLevel?: MetalLevel;
  marketType?: MarketType;
  state?: string;
  planYear?: number;
  isActive?: boolean;
}

// Plan search result
export interface InsurancePlanSearchResult {
  plans: InsurancePlan[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
