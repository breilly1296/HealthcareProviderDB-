# VerifyMyProvider Shared Types Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

The shared package (`packages/shared`) provides TypeScript types and utilities used by both frontend and backend. This ensures type consistency across the monorepo and reduces duplication.

---

## Package Structure

```
packages/shared/
├── src/
│   ├── types/
│   │   ├── provider.ts      # Provider-related types
│   │   ├── verification.ts  # Verification types
│   │   ├── plan.ts          # Insurance plan types
│   │   ├── location.ts      # Location types
│   │   ├── api.ts           # API request/response types
│   │   └── index.ts         # Re-exports
│   ├── utils/
│   │   ├── validation.ts    # Shared validation utilities
│   │   ├── formatting.ts    # Formatting utilities
│   │   └── index.ts         # Re-exports
│   └── index.ts             # Main entry point
├── package.json
└── tsconfig.json
```

---

## Provider Types

```typescript
// packages/shared/src/types/provider.ts

export type EntityType = 'INDIVIDUAL' | 'ORGANIZATION';

export interface Provider {
  npi: string;
  entityType: EntityType;
  firstName: string | null;
  lastName: string | null;
  credential: string | null;
  organizationName: string | null;
  specialty: string | null;
  specialtyCode: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  phone: string | null;
  locationId: number | null;
}

export interface ProviderWithLocation extends Provider {
  location: Location | null;
}

export interface ProviderSearchResult {
  providers: Provider[];
  pagination: Pagination;
}

export interface ProviderComparisonItem {
  provider: Provider;
  planAcceptance: PlanAcceptance[];
}
```

---

## Verification Types

```typescript
// packages/shared/src/types/verification.ts

export type VerificationType = 'ACCEPTS' | 'REJECTS' | 'UNKNOWN';

export type VerificationSource =
  | 'CROWDSOURCE'
  | 'INSURANCE_CARD'
  | 'PHONE_CALL'
  | 'OFFICIAL_SITE'
  | 'EOB'
  | 'OTHER';

export interface Verification {
  id: string;
  providerNpi: string | null;
  planId: string | null;
  verificationType: VerificationType;
  verificationSource: VerificationSource;
  sourceIp: string | null;
  notes: string | null;
  captchaScore: number | null;
  upvotes: number;
  downvotes: number;
  createdAt: string;
  expiresAt: string | null;
}

export interface VerificationSubmission {
  npi: string;
  planId: string;
  acceptsInsurance: boolean;
  notes?: string;
  captchaToken?: string;
}

export interface VoteSubmission {
  vote: 'up' | 'down';
  captchaToken?: string;
}

export interface VerificationStats {
  totalVerifications: number;
  verificationsLast24h: number;
  verificationsLast7d: number;
  uniqueProviders: number;
  uniquePlans: number;
  averageConfidence: number;
}
```

---

## Plan Types

```typescript
// packages/shared/src/types/plan.ts

export type PlanType = 'HMO' | 'PPO' | 'EPO' | 'POS' | 'HDHP' | 'OTHER';

export interface InsurancePlan {
  id: string;
  name: string;
  carrier: string;
  planType: PlanType;
  state: string | null;
}

export type AcceptanceStatus = 'ACCEPTS' | 'REJECTS' | 'UNKNOWN';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface PlanAcceptance {
  id: number;
  providerNpi: string | null;
  planId: string | null;
  planName?: string;
  carrier?: string;
  acceptanceStatus: AcceptanceStatus;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  lastVerified: string | null;
  verificationCount: number;
  expiresAt: string | null;
}

export interface PlanSearchResult {
  plans: InsurancePlan[];
  pagination: Pagination;
}
```

---

## Location Types

```typescript
// packages/shared/src/types/location.ts

export type FacilityType =
  | 'HOSPITAL'
  | 'CLINIC'
  | 'URGENT_CARE'
  | 'MEDICAL_OFFICE'
  | 'SURGERY_CENTER'
  | 'OTHER';

export interface Location {
  id: number;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  name: string | null;
  healthSystem: string | null;
  facilityType: FacilityType | null;
  providerCount: number;
}

export interface LocationWithProviders extends Location {
  providers: Provider[];
}

export interface HealthSystem {
  name: string;
  locationCount: number;
  totalProviders: number;
}
```

---

## API Types

```typescript
// packages/shared/src/types/api.ts

// Generic API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  message: string;
  code: string;
  statusCode: number;
  details?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
}

// Pagination
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: Pagination;
}

// Search query types
export interface ProviderSearchQuery {
  state?: string;
  city?: string;
  specialty?: string;
  name?: string;
  zipCode?: string;
  page?: number;
  limit?: number;
}

export interface PlanSearchQuery {
  name?: string;
  carrier?: string;
  state?: string;
  page?: number;
  limit?: number;
}

// Rate limit info (from headers)
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;
}
```

---

## Utility Types

```typescript
// packages/shared/src/types/utils.ts

// Make specific properties optional
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Make specific properties required
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

// Extract non-null values
export type NonNullableFields<T> = {
  [K in keyof T]: NonNullable<T[K]>;
};

// ID types for type safety
export type NPI = string & { readonly brand: unique symbol };
export type PlanId = string & { readonly brand: unique symbol };
export type VerificationId = string & { readonly brand: unique symbol };
```

---

## Shared Utilities

### Validation Utilities

```typescript
// packages/shared/src/utils/validation.ts

export function isValidNpi(npi: string): boolean {
  return /^\d{10}$/.test(npi);
}

export function isValidState(state: string): boolean {
  const validStates = ['AL', 'AK', 'AZ', ...]; // All 50 states + territories
  return validStates.includes(state.toUpperCase());
}

export function isValidZipCode(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

### Formatting Utilities

```typescript
// packages/shared/src/utils/formatting.ts

export function formatNpi(npi: string): string {
  return npi.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function formatAddress(provider: Provider): string {
  const parts = [
    provider.addressLine1,
    provider.addressLine2,
    `${provider.city}, ${provider.state} ${provider.zipCode}`
  ].filter(Boolean);
  return parts.join(', ');
}

export function formatProviderName(provider: Provider): string {
  if (provider.entityType === 'ORGANIZATION') {
    return provider.organizationName || 'Unknown Organization';
  }
  const parts = [
    provider.firstName,
    provider.lastName,
    provider.credential ? `, ${provider.credential}` : ''
  ].filter(Boolean);
  return parts.join(' ') || 'Unknown Provider';
}

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score >= 20) return 'LOW';
  return 'UNKNOWN';
}
```

---

## Usage Examples

### Frontend Usage

```typescript
// packages/frontend/src/components/ProviderCard.tsx
import type { Provider, PlanAcceptance } from '@verifymyprovider/shared';
import { formatProviderName, formatAddress } from '@verifymyprovider/shared';

interface ProviderCardProps {
  provider: Provider;
  planAcceptance?: PlanAcceptance[];
}

export function ProviderCard({ provider, planAcceptance }: ProviderCardProps) {
  return (
    <div>
      <h3>{formatProviderName(provider)}</h3>
      <p>{formatAddress(provider)}</p>
    </div>
  );
}
```

### Backend Usage

```typescript
// packages/backend/src/services/providerService.ts
import type { Provider, ProviderSearchQuery } from '@verifymyprovider/shared';
import { isValidNpi, isValidState } from '@verifymyprovider/shared';

export async function searchProviders(query: ProviderSearchQuery): Promise<Provider[]> {
  if (query.state && !isValidState(query.state)) {
    throw new Error('Invalid state code');
  }
  // ... implementation
}
```

---

## Package Configuration

### package.json

```json
{
  "name": "@verifymyprovider/shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"]
}
```

---

## Type Safety Benefits

1. **Compile-time errors** - Catch type mismatches before runtime
2. **Autocomplete** - IDE suggestions for properties and methods
3. **Refactoring** - Rename types/properties across entire codebase
4. **Documentation** - Types serve as inline documentation
5. **API contracts** - Ensure frontend and backend agree on shapes

---

## Conclusion

The shared types package is **well-structured**:

- ✅ Comprehensive type definitions
- ✅ Utility functions for common operations
- ✅ Clean package structure
- ✅ Proper TypeScript configuration
- ✅ Used consistently across frontend and backend
