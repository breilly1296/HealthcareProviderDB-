// Entity types
export enum EntityType {
  INDIVIDUAL = 'INDIVIDUAL',
  ORGANIZATION = 'ORGANIZATION',
}

// Specialty categories for osteoporosis-relevant care
export enum SpecialtyCategory {
  ENDOCRINOLOGY = 'ENDOCRINOLOGY',
  RHEUMATOLOGY = 'RHEUMATOLOGY',
  ORTHOPEDICS = 'ORTHOPEDICS',
  INTERNAL_MEDICINE = 'INTERNAL_MEDICINE',
  FAMILY_MEDICINE = 'FAMILY_MEDICINE',
  GERIATRICS = 'GERIATRICS',
  OTHER = 'OTHER',
}

// NPI status
export enum NpiStatus {
  ACTIVE = 'ACTIVE',
  DEACTIVATED = 'DEACTIVATED',
}

// Insurance plan types
export enum PlanType {
  HMO = 'HMO',
  PPO = 'PPO',
  EPO = 'EPO',
  POS = 'POS',
  HDHP = 'HDHP',
  MEDICARE_ADVANTAGE = 'MEDICARE_ADVANTAGE',
  MEDICAID = 'MEDICAID',
  OTHER = 'OTHER',
}

// ACA metal levels
export enum MetalLevel {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
  CATASTROPHIC = 'CATASTROPHIC',
}

// Insurance market types
export enum MarketType {
  INDIVIDUAL = 'INDIVIDUAL',
  SMALL_GROUP = 'SMALL_GROUP',
  LARGE_GROUP = 'LARGE_GROUP',
  MEDICARE = 'MEDICARE',
  MEDICAID = 'MEDICAID',
}

// Data source origins
export enum DataSource {
  CMS_NPPES = 'CMS_NPPES',
  CMS_PLAN_FINDER = 'CMS_PLAN_FINDER',
  USER_UPLOAD = 'USER_UPLOAD',
  CARRIER_API = 'CARRIER_API',
  CROWDSOURCE = 'CROWDSOURCE',
}

// Provider-plan acceptance status
export enum AcceptanceStatus {
  ACCEPTED = 'ACCEPTED',
  NOT_ACCEPTED = 'NOT_ACCEPTED',
  PENDING = 'PENDING',
  UNKNOWN = 'UNKNOWN',
}

// Verification source types
export enum VerificationSource {
  CMS_DATA = 'CMS_DATA',
  CARRIER_DATA = 'CARRIER_DATA',
  PROVIDER_PORTAL = 'PROVIDER_PORTAL',
  PHONE_CALL = 'PHONE_CALL',
  CROWDSOURCE = 'CROWDSOURCE',
  AUTOMATED = 'AUTOMATED',
}

// Verification types
export enum VerificationType {
  PLAN_ACCEPTANCE = 'PLAN_ACCEPTANCE',
  PROVIDER_INFO = 'PROVIDER_INFO',
  CONTACT_INFO = 'CONTACT_INFO',
  STATUS_CHANGE = 'STATUS_CHANGE',
  NEW_PLAN = 'NEW_PLAN',
}

// Sync types
export enum SyncType {
  NPI_FULL = 'NPI_FULL',
  NPI_WEEKLY = 'NPI_WEEKLY',
  PLAN_IMPORT = 'PLAN_IMPORT',
  PLAN_UPDATE = 'PLAN_UPDATE',
}

// Sync status
export enum SyncStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}
