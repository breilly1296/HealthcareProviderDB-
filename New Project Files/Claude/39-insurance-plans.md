# Insurance Plans Feature Review

## Overview

Insurance plans are a core data dimension in HealthcareProviderDB, connecting healthcare providers to the insurance networks they accept. The feature spans the full stack: a PostgreSQL data model with two primary tables, six backend API endpoints with Zod validation and rate limiting, a CSV import pipeline with plan name normalization, and multiple frontend components for browsing plans, viewing provider-plan associations, and uploading insurance cards for AI-powered extraction.

---

## 1. Database Schema

### 1.1 InsurancePlan Model

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\prisma\schema.prisma` (lines 157-179)

The `InsurancePlan` model maps to the `insurance_plans` PostgreSQL table. Each plan is identified by a generated slug-based `planId` (max 50 chars) that serves as the primary key.

```prisma
model InsurancePlan {
  planId              String                     @id @map("plan_id") @db.VarChar(50)
  planName            String?                    @map("plan_name") @db.VarChar(200)
  issuerName          String?                    @map("issuer_name") @db.VarChar(200)
  planType            String?                    @map("plan_type") @db.VarChar(20)
  state               String?                    @db.VarChar(2)
  carrier             String?                    @db.VarChar(100)
  planVariant         String?                    @map("plan_variant") @db.VarChar(50)
  rawName             String?                    @map("raw_name") @db.VarChar(500)
  sourceHealthSystem  String?                    @map("source_health_system") @db.VarChar(200)
  providerCount       Int                        @default(0) @map("provider_count")
  carrierId           Int?                       @map("carrier_id")
  healthSystemId      Int?                       @map("health_system_id")
  createdAt           DateTime?                  @default(now()) @map("created_at") @db.Timestamptz(6)
  providerAcceptances ProviderPlanAcceptance[]
  verificationLogs    VerificationLog[]

  @@index([carrier], map: "idx_insurance_plans_carrier")
  @@index([carrierId], map: "idx_insurance_plans_carrier_id")
  @@index([healthSystemId], map: "idx_insurance_plans_health_system_id")
  @@index([planVariant], map: "idx_insurance_plans_plan_variant")
  @@map("insurance_plans")
}
```

**Key design decisions:**
- `planId` is a generated slug (e.g., `aetna-hmo`, `empire-blue-cross-blue-shield-medicare`) rather than an auto-incremented integer, enabling stable references and human-readable IDs.
- `providerCount` is a denormalized counter that is incremented during import, avoiding expensive `COUNT` queries at read time. The service also computes a fallback via `_count.providerAcceptances`.
- `rawName` preserves the original scraped plan name for audit/debugging while `carrier`, `planVariant`, and `planType` hold the normalized decomposition.
- `sourceHealthSystem` tracks which hospital system the plan data was scraped from (e.g., "Mount Sinai").
- Four indexes target the most common query patterns: carrier lookups, carrier ID joins, health system filtering, and plan variant filtering.

### 1.2 ProviderPlanAcceptance Model

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\prisma\schema.prisma` (lines 181-206)

The `ProviderPlanAcceptance` model is the many-to-many join between providers and plans, enriched with confidence scoring and TTL semantics.

```prisma
model ProviderPlanAcceptance {
  id                 Int                @id @default(autoincrement())
  providerNpi        String?            @map("npi") @db.VarChar(10)
  planId             String?            @map("plan_id") @db.VarChar(50)
  locationId         Int?               @map("location_id")
  acceptanceStatus   String             @default("UNKNOWN") @map("acceptance_status") @db.VarChar(20)
  confidenceScore    Int                @default(0) @map("confidence_score")
  lastVerified       DateTime?          @map("last_verified") @db.Timestamptz(6)
  verificationCount  Int                @default(0) @map("verification_count")
  createdAt          DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime           @default(now()) @map("updated_at") @db.Timestamptz(6)
  expiresAt          DateTime?          @map("expires_at") @db.Timestamptz(6)
  provider           Provider?          @relation(fields: [providerNpi], references: [npi])
  insurancePlan      InsurancePlan?     @relation(fields: [planId], references: [planId])
  location           practice_locations? @relation(fields: [locationId], references: [id])

  // Unique constraints via raw SQL partial indexes:
  // idx_ppa_npi_plan_location: UNIQUE(npi, plan_id, location_id) WHERE location_id IS NOT NULL
  // idx_ppa_npi_plan_legacy: UNIQUE(npi, plan_id) WHERE location_id IS NULL
  @@index([acceptanceStatus], map: "idx_ppa_acceptance_status")
  @@index([confidenceScore], map: "idx_ppa_confidence_score")
  @@index([expiresAt], map: "idx_ppa_expires_at")
  @@index([lastVerified], map: "idx_ppa_last_verified")
  @@index([locationId], map: "idx_ppa_location_id")
  @@map("provider_plan_acceptance")
}
```

**Key design decisions:**
- **Location-aware uniqueness:** The table uses two partial unique indexes in PostgreSQL (managed via raw SQL, not Prisma `@@unique`). When `location_id IS NOT NULL`, uniqueness is on `(npi, plan_id, location_id)`. When `location_id IS NULL`, uniqueness falls back to `(npi, plan_id)`. This allows a provider to accept the same plan at multiple office locations with potentially different statuses.
- **Confidence scoring:** An integer 0-100 score tracks how reliable the acceptance data is. The score factors in data source quality, recency, verification count, and community agreement (see Section 5).
- **TTL via `expiresAt`:** A 6-month expiration based on 12% annual provider network turnover research. Records past their TTL should be treated as stale.
- **`acceptanceStatus`:** One of `ACCEPTED`, `NOT_ACCEPTED`, `PENDING`, or `UNKNOWN`.
- **Five indexes** cover the most common query patterns: filtering by status, sorting by confidence, checking TTL expiration, freshness queries, and location filtering.

### 1.3 Related Enums

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\shared\src\types\enums.ts`

The shared package defines canonical enum types used across the stack:

| Enum | Values | Usage |
|------|--------|-------|
| `AcceptanceStatus` | `ACCEPTED`, `NOT_ACCEPTED`, `PENDING`, `UNKNOWN` | `ProviderPlanAcceptance.acceptanceStatus` |
| `PlanType` | `HMO`, `PPO`, `EPO`, `POS`, `HDHP`, `MEDICARE_ADVANTAGE`, `MEDICAID`, `OTHER` | `InsurancePlan.planType` |
| `VerificationSource` | `CMS_DATA`, `CARRIER_DATA`, `PROVIDER_PORTAL`, `PHONE_CALL`, `CROWDSOURCE`, `AUTOMATED` | Tracks how the acceptance was verified |
| `VerificationType` | `PLAN_ACCEPTANCE`, `PROVIDER_INFO`, `CONTACT_INFO`, `STATUS_CHANGE`, `NEW_PLAN` | Categorizes verification log entries |
| `MetalLevel` | `BRONZE`, `SILVER`, `GOLD`, `PLATINUM`, `CATASTROPHIC` | ACA metal levels (shared types) |
| `MarketType` | `INDIVIDUAL`, `SMALL_GROUP`, `LARGE_GROUP`, `MEDICARE`, `MEDICAID` | Market segment (shared types) |

The Prisma schema also defines `AcceptanceStatus`, `VerificationSource`, and `VerificationType` as PostgreSQL enums for database-level enforcement.

---

## 2. Backend API

### 2.1 Route Definitions

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\plans.ts` (199 lines)

All six endpoints are mounted under `/api/v1/plans` via an Express `Router`. Each endpoint uses Zod schema validation on inputs, rate limiting middleware, and the `asyncHandler` wrapper for consistent error propagation.

#### Endpoint Summary

| Method | Path | Rate Limiter | Description |
|--------|------|-------------|-------------|
| `GET` | `/search` | `searchRateLimiter` (100/hr) | Search plans with filters and pagination |
| `GET` | `/grouped` | `defaultRateLimiter` (200/hr) | Plans grouped by carrier for dropdown UI |
| `GET` | `/meta/issuers` | `defaultRateLimiter` (200/hr) | List of unique insurance issuers |
| `GET` | `/meta/types` | `defaultRateLimiter` (200/hr) | List of available plan types |
| `GET` | `/:planId/providers` | `searchRateLimiter` (100/hr) | Providers accepting a specific plan |
| `GET` | `/:planId` | `defaultRateLimiter` (200/hr) | Single plan detail with provider count |

**Route ordering note:** The `/:planId/providers` route is defined before `/:planId` to prevent Express from matching "providers" as a planId segment (line 119 comment in source).

#### Validation Schemas

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\schemas\commonSchemas.ts`

Shared schemas used across routes:

```typescript
// Pagination: page >= 1, limit 1-100, defaults page=1 limit=20
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Plan ID: 1-50 character string
export const planIdParamSchema = z.object({
  planId: z.string().min(1).max(50),
});

// State: exactly 2 characters, auto-uppercased
export const stateQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
});
```

The `/search` endpoint adds a local schema:

```typescript
const searchQuerySchema = z.object({
  issuerName: z.string().min(1).max(200).optional(),
  planType: z.string().min(1).max(20).optional(),
  search: z.string().min(1).max(200).optional(),
  state: z.string().length(2).toUpperCase().optional(),
}).merge(paginationSchema);
```

### 2.2 Service Layer

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\planService.ts` (378 lines)

The service layer implements all business logic for plan queries. Key functions:

#### `searchPlans(params: PlanSearchParams)`

Builds a dynamic Prisma `where` clause from optional filters (`issuerName`, `carrier`, `planType`, `planVariant`, `search`, `state`, `sourceHealthSystem`). The `search` parameter triggers an `OR` clause that searches across five fields simultaneously:

```typescript
where.OR = [
  { carrier: { contains: search, mode: 'insensitive' } },
  { issuerName: { contains: search, mode: 'insensitive' } },
  { planName: { contains: search, mode: 'insensitive' } },
  { rawName: { contains: search, mode: 'insensitive' } },
  { planId: { contains: search, mode: 'insensitive' } },
];
```

Results are ordered by `carrier ASC, planName ASC` and returned with full pagination metadata. The query and count execute in parallel via `Promise.all`.

#### `getPlanByPlanId(planId: string)`

Returns a single plan with its provider acceptance count via `_count.providerAcceptances`. Uses the denormalized `providerCount` field as the primary value, falling back to the computed count:

```typescript
providerCount: plan.providerCount || plan._count.providerAcceptances,
```

#### `getGroupedPlans(options)`

Fetches plans filtered by optional `search` and `state`, then groups them client-side by carrier using a `Map<string, plan[]>`. Returns an array of `{ carrier, plans[] }` objects plus a `totalPlans` count. This powers the carrier-grouped dropdown in the frontend.

#### `getProvidersForPlan(planId, options)`

Returns paginated providers who accept a given plan. Filters to `acceptanceStatus: 'ACCEPTED'` and requires the provider relation to exist (`provider: { isNot: null }`). Results are ordered by `confidenceScore DESC` (most reliable first). Each result includes:
- Provider identity (NPI, name, entity type, specialty)
- First practice location (city, state, phone)
- A computed `displayName` (organization name for type 2, full name for type 1)
- Confidence score, last verified date, and verification count
- Associated location data from the acceptance record

#### `getDistinctField(field, options)` (Private Helper)

A generic helper that consolidates the pattern of querying distinct non-null values for a given field (carrier, planVariant, issuerName, planType, sourceHealthSystem) with optional state/carrier/issuer filters. Used by `getCarriers()`, `getPlanVariants()`, `getIssuers()`, `getPlanTypes()`, and `getSourceHealthSystems()`.

---

## 3. Data Pipeline

### 3.1 Import Script

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\scripts\importInsurancePlans.ts` (393 lines)

The import script reads CSV files containing provider-plan data extracted via Gemini from hospital website scrapes.

**Usage:**
```bash
npx ts-node src/scripts/importInsurancePlans.ts <csv-file> [--health-system <name>]
```

**CSV format:**
The script accepts CSV files with the following columns (case-insensitive):
- `NPI` / `npi` -- Provider NPI number
- `Insurance_Plans` / `insurance_plans` / `Accepted_Insurance` / `accepted_insurance` -- Semicolon/comma-separated list of plan names

**Pipeline steps:**

1. **CSV Parsing:** A custom CSV parser (`parseCsvLine()`) handles quoted fields with embedded commas and escaped quotes. It splits on `\r?\n` and builds rows from header-value pairs.

2. **Validation:** Rows without a valid 10-digit NPI are skipped (`skippedNoNpi`). Rows with no plan data or `NOT_FOUND` are skipped (`skippedNoPlans`). Rows whose NPI does not exist in the `providers` table are counted as errors.

3. **Plan Parsing:** Each plan list string is split by semicolons/commas and parsed through `parsePlanList()` from the plan parser utility.

4. **Plan Upsert:** For each parsed plan:
   - A `planId` slug is generated via `generatePlanId()`
   - If the plan already exists, it is tracked but not modified
   - If new, it is created with `issuerName` set to the extracted carrier, `state` defaulting to `'NY'`, and `sourceHealthSystem` set from the CLI flag
   - The plan type is extracted from the variant (HMO, PPO, EPO, POS, MEDICARE, MEDICAID)

5. **Acceptance Upsert:** For each provider-plan pair:
   - If an acceptance record already exists with `locationId: null`, its confidence score is updated if the new source (`HOSPITAL_SCRAPE_CONFIDENCE = 70`) is higher
   - If no record exists, a new one is created with status `ACCEPTED`, confidence 70, and verification count 1
   - New acceptances trigger an `incrementProviderCount()` on the plan

6. **Reporting:** The script outputs detailed statistics:
   ```
   Total rows in CSV, Processed rows, Skipped (no NPI), Skipped (no plans),
   Errors, New plans created, Plans updated, New acceptances, Acceptances updated
   ```

### 3.2 Plan Parser / Normalizer

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\utils\insurancePlanParser.ts` (266 lines)

This utility converts raw scraped plan names into structured `{ carrier, planVariant, rawName }` objects.

#### Carrier Normalization

The `CARRIER_ALIASES` map contains 30+ entries mapping common abbreviations and variations to canonical carrier names. Examples:

| Raw Input | Normalized Carrier |
|-----------|--------------------|
| `bcbs`, `blue cross`, `bluecross` | Blue Cross Blue Shield |
| `empire bcbs`, `empire blue cross` | Empire Blue Cross Blue Shield |
| `united`, `uhc`, `united healthcare` | UnitedHealthcare |
| `ghi` | EmblemHealth (GHI) |
| `hip` | EmblemHealth (HIP) |
| `oscar`, `oscar health` | Oscar Health |
| `1199`, `1199seiu` | 1199SEIU |

The lookup is sorted by alias length descending so that longer, more specific matches take priority (e.g., "empire blue cross blue shield" matches before "blue cross").

If no alias matches, the parser strips plan-type suffixes (HMO, PPO, etc.) and capitalizes the first two words as the carrier name.

#### Variant Detection

The `VARIANT_PATTERNS` array contains 20 regex patterns ordered by specificity:

- **Medicare variants:** Medicare Advantage, Medicare Supplement, Medigap, Medicare
- **Medicaid variants:** Managed Medicaid, Medicaid, CHIP
- **Plan types:** PPO, HMO, EPO, POS, HDHP (using word boundaries `\b`)
- **Market types:** Commercial, Exchange, Marketplace, Individual, Group, Employer
- **Special programs:** Essential Plan, Child Health Plus

#### Plan ID Generation

`generatePlanId()` creates a deterministic, URL-safe slug:

```typescript
export function generatePlanId(parsed: ParsedInsurancePlan): string {
  const carrierSlug = parsed.carrier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
  const variantSlug = parsed.planVariant
    ? parsed.planVariant.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 18)
    : 'general';
  return `${carrierSlug}-${variantSlug}`.substring(0, 50);
}
```

The carrier portion is capped at 30 characters, the variant at 18, and the total at 50 to match the database VarChar(50) constraint.

#### Deduplication

`parseInsurancePlans()` deduplicates parsed plans using a `carrier|planVariant` composite key (case-insensitive). `parsePlanList()` splits on both semicolons and commas, trims whitespace, filters empty strings, and runs through `parseInsurancePlans()`.

---

## 4. Frontend Integration

### 4.1 Insurance Browser Page (`/insurance`)

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\app\insurance\page.tsx` (122 lines)

A Next.js page with server-side metadata (`title: 'Insurance Card Scanner | ProviderDB'`). The page structure includes:

1. **Breadcrumb navigation** (Home > Insurance Card Scanner)
2. **Header section** with title and description
3. **Privacy notice** informing users that card images are not stored on servers and data is session-only
4. **`InsuranceCardUploader` component** (see Section 4.5)
5. **Tips section** with four bullet points for best photo results (clear photo, include front, legible text, avoid glare)

### 4.2 `useInsurancePlans` Hook

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\hooks\useInsurancePlans.ts` (233 lines)

A custom React hook that fetches and caches insurance plans grouped by carrier.

**Key features:**
- **Module-level cache:** Plans are cached in a `Map<string, CacheEntry>` at the module level (outside React) with a 10-minute TTL. Cache keys combine `state` and `search` parameters.
- **Request deduplication:** A `pendingRequests` map prevents duplicate in-flight requests for the same parameters.
- **Race condition handling:** A `currentParamsRef` ref tracks current parameters so that stale responses from outdated requests are discarded.
- **Derived data:** The hook exposes multiple views of the data via `useMemo`:
  - `groupedPlans` -- Raw carrier groups from the API
  - `allPlans` -- A flattened `InsurancePlanDisplay[]` array
  - `selectOptions` -- Grouped `{ label, options[] }` format for dropdown components
  - `findPlan(planId)` -- A lookup function for finding a plan by ID

**Return interface:**
```typescript
interface UseInsurancePlansResult {
  groupedPlans: CarrierGroup[];
  allPlans: InsurancePlanDisplay[];
  selectOptions: GroupedSelectOptions[];
  isLoading: boolean;
  error: Error | null;
  findPlan: (planId: string) => InsurancePlanDisplay | undefined;
  refetch: () => Promise<void>;
}
```

### 4.3 `useHealthSystems` Hook

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\hooks\useHealthSystems.ts` (226 lines)

A companion hook that fetches health systems for filtering. Follows the same caching pattern as `useInsurancePlans` with a 5-minute TTL. Cache keys combine `state` and sorted `cities`. Includes a standalone `prefetchHealthSystems()` function for eager loading.

### 4.4 API Client

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\lib\api.ts` (lines 474-535)

The `plans` namespace on the API client provides typed methods for all plan endpoints:

```typescript
const plans = {
  // Search with filters + pagination
  search: (params) => apiFetch<{ plans, pagination }>('/plans/search?...'),

  // Grouped by carrier (powers dropdowns)
  getGrouped: (params?) => apiFetch<{ carriers, totalPlans }>('/plans/grouped?...'),

  // Legacy alias for backward compatibility
  getGroupedPlans: (params?) => apiFetch<{ carriers, totalPlans }>('/plans/grouped?...'),

  // Issuer metadata
  getIssuers: (state?) => apiFetch<{ issuers, count }>('/plans/meta/issuers?...'),

  // Plan type metadata
  getPlanTypes: (params?) => apiFetch<{ planTypes, count }>('/plans/meta/plan-types?...'),

  // Single plan detail
  getById: (planId) => apiFetch<{ plan }>('/plans/{planId}'),

  // Providers for a plan with filters
  getProviders: (planId, params) => apiFetch<{ plan, providers, pagination }>('/plans/{planId}/providers?...'),
};
```

All methods use the `apiFetch<T>()` wrapper which provides:
- Automatic JSON parsing and error handling
- Retry logic with exponential backoff for 429/5xx errors
- Network error retries (up to 2 retries, 1s base delay)
- Retry-After header parsing
- Rate limit toast notifications
- `ApiError` class with helper methods (`isRateLimited()`, `isNotFound()`, etc.)

### 4.5 Provider Detail -- Plans Section

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\components\provider-detail\ProviderPlansSection.tsx` (284 lines)

Displays all accepted insurance plans on a provider's detail page. The component:

1. **Filters to accepted plans** (`acceptanceStatus === 'ACCEPTED'`)
2. **Groups by carrier** using `pa.plan?.carrier || pa.plan?.issuerName || 'Other'`
3. **Provides search** (shown when > 5 plans) filtering by plan name and carrier name
4. **Renders collapsible carrier groups** with expand/collapse all controls
5. **Each plan card (`PlanCard`)** displays:
   - Plan name and type
   - New patient acceptance status (green check or red X)
   - `ConfidenceScoreBadge` with the plan's confidence score and level
   - `VerificationButton` to submit a new verification
   - `ConfidenceScoreBreakdown` with factor details (data source, recency, verification, agreement scores)
   - `FreshnessWarning` with staleness detection (> 60 days triggers warning)

**Confidence factor estimation:** When the API does not return pre-computed confidence factors, the component synthesizes them from the raw score:
```typescript
const factors = pa.confidence?.factors || {
  dataSourceScore: Math.round(pa.confidenceScore * 0.25),
  recencyScore: Math.round(pa.confidenceScore * 0.30),
  verificationScore: Math.min(25, pa.verificationCount * 8),
  agreementScore: Math.round(pa.confidenceScore * 0.20),
};
```

### 4.6 Insurance List Component

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\components\provider-detail\InsuranceList.tsx` (844 lines)

A comprehensive insurance acceptance list with rich UI features:

**Carrier grouping:** Plans are grouped into carrier families using `CARRIER_PATTERNS`, an array of 18 regex patterns covering major US carriers (Aetna, EmblemHealth, Empire BCBS, UnitedHealthcare, Cigna, Humana, Kaiser, etc.). Plans that match 2+ plans in a carrier are shown as collapsible groups; single-carrier plans are shown in an "Other Plans" section.

**Status rendering:**
- Green check icon for `accepted`
- Red X icon for `not_accepted`
- Yellow clock icon for `pending`
- Gray question icon for `unknown`

**Data freshness badge:** Color-coded based on days since verification:
- Green: < 30 days
- Yellow: 30-90 days
- Red: > 90 days
- Gray dot: Never verified

**Location filtering:** When plans have location-specific acceptance data (`locationId` is set), a dropdown filter appears allowing users to filter by office location.

**Inline verification:** Each plan row has a "Verify" button. Clicking it opens a `VerificationModal` that allows the user to confirm or deny acceptance, optionally select when they verified (Today, This week, This month, A while ago), add a note (up to 200 characters), and submit via `verificationApi.submit()`. The modal includes a honeypot field for bot detection. Successfully verified plans show a green "Verified" badge instead of the verify button.

**Search:** Shown when > 5 plans, with result count display.

### 4.7 Insurance Card Uploader

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\components\InsuranceCardUploader.tsx` (534 lines)

Allows users to upload a photo of their insurance card for AI-powered data extraction.

**Upload flow:**
1. User selects an image via file picker or camera capture (`capture="environment"`)
2. Client-side validation: image type check, 10MB size limit
3. Image is converted to base64 via `FileReader`
4. Preview displayed with remove button
5. "Extract Insurance Data" button sends POST to `/api/insurance-card/extract`

**Extraction API route:**

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\app\api\insurance-card\extract\route.ts` (538 lines)

A Next.js API route that processes insurance card images using Claude Haiku 4.5 (`claude-haiku-4-5-20251001`):

- **Rate limiting:** 10 extractions per hour per IP
- **Validation:** File type, size (10MB max), base64 format, minimum payload length
- **Image preprocessing:** Checks if enhancement is needed (low contrast), resizes and compresses if appropriate
- **Primary extraction:** Sends the image to Claude with the primary extraction prompt
- **Retry logic:** If confidence < 0.3, retries with an alternative prompt and keeps the better result
- **Minimum field threshold:** Requires at least 2 extracted fields for success
- **Confidence scoring:** Returns overall confidence (`high`/`medium`/`low`) with per-field scores
- **Issue detection:** Reports issues like blur, glare, partial card, wrong side, low resolution

**Extracted data fields** (22 total):
```typescript
interface InsuranceCardData {
  insurance_company, plan_name, plan_type, provider_network,
  subscriber_name, subscriber_id, group_number, effective_date,
  rxbin, rxpcn, rxgrp,
  copay_pcp, copay_specialist, copay_urgent, copay_er,
  deductible_individual, deductible_family,
  oop_max_individual, oop_max_family,
  customer_care_phone, website, network_notes
}
```

The response UI organizes extracted data into sections: Plan Information, Subscriber Information, Copays, Deductibles & Out-of-Pocket Max, Pharmacy Information, and Contact Information. It also displays a confidence indicator with a progress bar and provides suggestions for improving extraction on medium/low confidence results.

---

## 5. Confidence Scoring System

### 5.1 Shared Types

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\shared\src\types\provider-plan-acceptance.ts`

The confidence scoring system is research-backed, citing Mortensen et al. (2015) and Ndumele et al. (2018). It defines four scoring factors that sum to 100:

| Factor | Max Score | Description |
|--------|-----------|-------------|
| `dataSourceScore` | 25 | Authoritativeness of the data source |
| `recencyScore` | 30 | Time-based decay since last verification |
| `verificationScore` | 25 | Number of verification submissions (optimal at 3) |
| `agreementScore` | 20 | Community consensus among verifications |

### 5.2 Confidence Levels

The `getConfidenceLevel(score, verificationCount)` function maps numeric scores to five levels:

| Score Range | Level (3+ verifications) | Level (< 3 verifications) |
|-------------|--------------------------|---------------------------|
| 91-100 | `VERY_HIGH` | `MEDIUM` (capped) |
| 76-90 | `HIGH` | `MEDIUM` (capped) |
| 51-75 | `MEDIUM` | `MEDIUM` |
| 26-50 | `LOW` | `LOW` |
| 0-25 | `VERY_LOW` | `VERY_LOW` |

The key insight: **plans with fewer than 3 verifications are capped at MEDIUM confidence regardless of score**, because research shows 3 verifications achieve expert-level accuracy (kappa = 0.58).

### 5.3 Confidence Metadata

Each acceptance record includes metadata for UI display:
- `daysUntilStale` / `isStale` -- Whether the record needs re-verification
- `recommendReVerification` -- Boolean flag for the UI
- `daysSinceVerification` -- Null if never verified
- `freshnessThreshold` -- Days before data is considered stale
- `researchNote` -- Human-readable research justification

---

## 6. Frontend Type Definitions

### 6.1 Display Types

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\types\index.ts`

```typescript
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

export interface CarrierGroup {
  carrier: string;
  plans: {
    planId: string;
    planName: string | null;
    planType: string | null;
  }[];
}

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
  plan?: { planId, planName, issuerName, planType, state, carrier };
  location?: { id, addressLine1, city, state, zipCode } | null;
  confidence?: {
    score: number;
    level: ConfidenceLevelDisplay;
    factors: { dataSourceScore, recencyScore, verificationScore, agreementScore };
    metadata?: { researchNote, isStale, daysSinceVerification, ... };
  };
  expiresAt?: string | null;
}
```

### 6.2 Insurance Card Types

**File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\src\types\insurance.ts`

Defines the full extraction type system:
- `InsuranceCardData` -- 22 nullable string fields covering plan info, subscriber info, copays, deductibles, pharmacy, and contact
- `InsuranceCardDataWithConfidence` -- Extends with per-field `FieldConfidence` (value, confidence 0-1, reason)
- `ExtractionMetadata` -- Overall confidence, field counts, card type detection, issues, suggestions, retry info, preprocessing details
- `ExtractionIssue` -- Typed issues (blur, low_contrast, partial_card, glare, wrong_side, not_insurance_card, low_resolution) with severity
- `InsuranceCardExtractionResponse` -- Complete API response with success flag, data, metadata, suggestions, and rate limit info

---

## 7. Data Flow Summary

```
Hospital Websites
    |
    v (Gemini scrape)
CSV Files (NPI, Insurance_Plans)
    |
    v (importInsurancePlans.ts)
insurancePlanParser.ts
    |-- extractCarrier() via CARRIER_ALIASES (30+ entries)
    |-- extractVariant() via VARIANT_PATTERNS (20 patterns)
    |-- generatePlanId() -> slug
    |
    v
PostgreSQL
    |-- insurance_plans (plan catalog)
    |-- provider_plan_acceptance (provider-plan links + confidence)
    |
    v (Express API, planService.ts)
6 REST Endpoints
    |-- /search (full-text across 5 fields)
    |-- /grouped (carrier-grouped dropdown)
    |-- /meta/issuers, /meta/types (filter options)
    |-- /:planId (detail + provider count)
    |-- /:planId/providers (paginated, confidence-sorted)
    |
    v (api.ts client + useInsurancePlans hook)
Frontend
    |-- /insurance page (card upload)
    |-- Provider detail: ProviderPlansSection + InsuranceList
    |-- Insurance card upload: Claude Haiku 4.5 extraction
```

---

## 8. Implementation Checklist

### Database
- [x] `InsurancePlan` model with all fields (planId, planName, issuerName, planType, state, carrier, planVariant, rawName, sourceHealthSystem, providerCount, carrierId, healthSystemId)
- [x] `ProviderPlanAcceptance` with location-aware partial unique indexes on (npi, planId, locationId)
- [x] Confidence scoring (0-100 integer) on acceptance records
- [x] TTL via `expiresAt` field (6-month window based on 12% annual turnover research)
- [x] Indexes on carrier, carrierId, healthSystemId, planVariant (4 indexes on insurance_plans)
- [x] Indexes on acceptanceStatus, confidenceScore, expiresAt, lastVerified, locationId (5 indexes on provider_plan_acceptance)
- [x] Provider count denormalized on plan (`providerCount` field, incremented during import)

### Backend API
- [x] Plan search with filters (issuerName, planType, search, state) and pagination
- [x] Grouped plans by carrier for dropdown display
- [x] Issuer metadata endpoint with optional state filter
- [x] Plan type metadata endpoint with optional state and issuerName filters
- [x] Providers-for-plan with pagination, confidence-sorted, location-included
- [x] Plan detail with provider count (denormalized + computed fallback)
- [x] Zod validation on all inputs (searchQuerySchema, paginationSchema, planIdParamSchema, stateQuerySchema)
- [x] Rate limiting on all endpoints (100/hr for search endpoints, 200/hr for metadata/detail)

### Frontend
- [x] Insurance browser page at `/insurance` with card upload and privacy notice
- [x] `useInsurancePlans` hook with 10-minute module-level cache, request deduplication, race condition handling
- [x] `useHealthSystems` hook with 5-minute cache and prefetch support
- [x] Provider detail plans section (`ProviderPlansSection`) with carrier grouping, search, expand/collapse, confidence breakdown, freshness warning, inline verification
- [x] `InsuranceList` component with 18 carrier pattern matchers, location filtering, verification modal with honeypot
- [x] Insurance card upload via Claude Haiku 4.5 with retry logic, preprocessing, 22-field extraction, confidence scoring, issue detection
- [x] API client methods for all 7 plan endpoints (search, getGrouped, getGroupedPlans, getIssuers, getPlanTypes, getById, getProviders)

### Data Pipeline
- [x] Import script with CLI interface, CSV parsing, provider validation, plan upsert, acceptance upsert, progress logging, statistics
- [x] Plan parser/normalizer with 30+ carrier aliases, 20 variant patterns, slug-based ID generation, deduplication
- [ ] Automated periodic import not configured (manual CLI execution only)
- [ ] Plan data freshness tracking not implemented (no scheduled job to flag stale plans)

---

## 9. Open Questions

1. **Import frequency:** How frequently should plan data be refreshed? Currently imports are manual CLI-only. A cron job or Cloud Scheduler could automate this.
2. **Search caching:** Provider search results use Redis caching (see prompt 31). Should plan search results receive similar treatment, or is the 10-minute client-side hook cache sufficient?
3. **Carrier/health system ID assignment:** During import, `carrierId` and `healthSystemId` are set to `null`. These fields exist in the schema but are not populated by the import pipeline. Are they intended for a future carrier management feature?
4. **Plan comparison:** Should there be a feature to compare coverage across plans (side-by-side view)?
5. **Orphan plans:** How should plans with zero linked providers be handled in the UI? Currently they appear in search results with `providerCount: 0`.
6. **State defaulting:** The import script hardcodes `state: 'NY'` for all imported plans. Multi-state health systems may need per-plan state detection.
7. **TTL enforcement:** The `expiresAt` field exists but there is no scheduled job to expire or flag stale acceptance records. Should a background worker transition expired records to `UNKNOWN` status?
