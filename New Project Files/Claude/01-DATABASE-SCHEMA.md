# Database Schema Review -- VerifyMyProvider

**Document type:** Architecture & Security Review
**Priority:** 1 (Critical)
**Generated:** 2026-02-07
**Source of truth:** `packages/backend/prisma/schema.prisma`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Infrastructure](#2-infrastructure)
3. [Schema Security Assessment](#3-schema-security-assessment)
4. [Core Models (15 Total)](#4-core-models-15-total)
5. [Enums](#5-enums)
6. [Relationships & Foreign Keys](#6-relationships--foreign-keys)
7. [Index Inventory](#7-index-inventory)
8. [Data Quality & Confidence Scoring](#8-data-quality--confidence-scoring)
9. [TTL & Data Retention](#9-ttl--data-retention)
10. [Sybil Prevention & Anti-Abuse](#10-sybil-prevention--anti-abuse)
11. [Schema Conventions](#11-schema-conventions)
12. [Migration History](#12-migration-history)
13. [Service Layer Database Usage](#13-service-layer-database-usage)
14. [Known Issues & Recommendations](#14-known-issues--recommendations)
15. [Questions for Future Work](#15-questions-for-future-work)

---

## 1. Overview

VerifyMyProvider is a healthcare provider directory that combines authoritative CMS/NPPES data with crowdsourced insurance acceptance verifications. The database stores **public data only** -- no Protected Health Information (PHI) is present in any table. The schema is centered around the NPI (National Provider Identifier) as the primary key for provider-related tables, with a crowdsource verification pipeline layered on top.

**Key statistics:**
- ~2.1 million provider records currently loaded
- 15 Prisma models mapped to 15 PostgreSQL tables
- 3 PostgreSQL enum types (in current schema)
- 55+ indexes for query performance
- 6 months TTL on verification data

---

## 2. Infrastructure

| Attribute | Value |
|---|---|
| **ORM** | Prisma 5.22.0 (`@prisma/client`) |
| **Database** | PostgreSQL on Google Cloud SQL |
| **Instance** | `verifymyprovider-db`, `us-central1` |
| **Database name** | `verifymyprovider` |
| **Engine type** | Prisma binary engine (`engineType = "binary"`) |
| **Connection** | Via `DATABASE_URL` environment variable |

### Prisma Client Singleton

From `packages/backend/src/lib/prisma.ts`:

```typescript
export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
```

The singleton pattern prevents multiple Prisma Client instances in development (common issue with hot-reloading). In production, only `error` level logging is enabled.

### Generator Configuration

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native"]
  engineType    = "binary"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

## 3. Schema Security Assessment

### 3.1 PHI Status: NONE

VerifyMyProvider stores only publicly available provider data sourced from:
- CMS National Provider & Plan Enumeration System (NPPES)
- CMS Provider Data Catalog
- Insurance carrier networks (public directories)
- Crowdsourced verification data (anonymous)

No patient data, no health records, no user accounts with personal information.

### 3.2 Row-Level Security: NOT REQUIRED

- No user-owned data patterns (no `user_id` columns anywhere)
- Verification data is anonymous (tracked by IP hash, not user identity)
- All provider data is public information
- Access control is handled at the application layer (rate limiting, admin authentication)

### 3.3 Encryption: NOT REQUIRED

- All stored data is publicly available
- No secrets stored in the database
- Connection to Cloud SQL uses SSL/TLS in transit
- PII in verification logs (sourceIp, userAgent, submittedBy) is stripped before API responses

### 3.4 Application-Layer Security

The application layer provides security through:
- **Rate limiting** on verification and vote endpoints (via `verificationRateLimiter`, `voteRateLimiter`)
- **CAPTCHA verification** (reCAPTCHA v3, minimum score 0.5)
- **Honeypot fields** for bot detection
- **Sybil prevention** via composite indexes on IP + email
- **PII stripping** in `verificationService.ts`:

```typescript
function stripVerificationPII<T extends Record<string, unknown>>(
  verification: T
): Omit<T, 'sourceIp' | 'userAgent' | 'submittedBy'> {
  const { sourceIp, userAgent, submittedBy, ...safe } = verification;
  return safe;
}
```

- **Admin endpoint authentication** via timing-safe comparison of `X-Admin-Secret` header

---

## 4. Core Models (15 Total)

### 4.1 Provider Data Models (7 models)

#### `Provider` (table: `providers`)

The central model. Uses NPI (10-digit national identifier) as the primary key.

```prisma
model Provider {
  npi                      String   @id @db.VarChar(10)
  entityType               String?  @map("entity_type") @db.VarChar(1)
  lastName                 String?  @map("last_name") @db.VarChar(100)
  firstName                String?  @map("first_name") @db.VarChar(100)
  middle_name              String?  @db.VarChar(100)
  name_prefix              String?  @db.VarChar(10)
  name_suffix              String?  @db.VarChar(10)
  credential               String?  @db.VarChar(50)
  organizationName         String?  @map("organization_name") @db.VarChar(200)
  gender                   String?  @db.VarChar(1)
  enumerationDate          String?  @map("enumeration_date") @db.VarChar(10)
  last_update_date         String?  @db.VarChar(10)
  deactivation_date        String?  @db.VarChar(10)
  reactivation_date        String?  @db.VarChar(10)
  is_sole_proprietor       String?  @db.VarChar(1)
  is_organization_subpart  String?  @db.VarChar(1)
  parent_organization_lbn  String?  @db.VarChar(200)
  primary_taxonomy_code    String?  @db.VarChar(20)
  primary_specialty        String?  @db.VarChar(200)
  specialty_category       String?  @db.VarChar(100)
  nppesLastSynced          DateTime? @map("nppes_last_synced") @db.Timestamptz(6)
  // ... 9 relations
  @@map("providers")
}
```

**Key design notes:**
- `entityType` stores `'1'` (Individual) or `'2'` (Organization), mapped from NPPES values. The service layer translates `INDIVIDUAL`/`ORGANIZATION` strings for API consumers.
- All fields are nullable except `npi` -- this accommodates partial data from NPPES imports.
- Date fields (`enumerationDate`, `last_update_date`, etc.) are stored as `VarChar(10)` strings rather than `DateTime`, matching their raw NPPES format.

#### `practice_locations` (table: `practice_locations`)

One-to-many relationship with Provider via NPI foreign key. Each provider can have multiple practice addresses.

```prisma
model practice_locations {
  id             Int     @id @default(autoincrement())
  npi            String  @db.VarChar(10)
  address_type   String? @default("practice") @db.VarChar(10)
  address_line1  String? @db.VarChar(200)
  address_line2  String? @db.VarChar(200)
  city           String? @db.VarChar(100)
  state          String? @db.VarChar(2)
  zip_code       String? @db.VarChar(10)
  phone          String? @db.VarChar(20)
  fax            String? @db.VarChar(20)
  address_hash   String? @map("address_hash") @db.VarChar(64)
  providers      Provider @relation(fields: [npi], references: [npi], onDelete: NoAction, onUpdate: NoAction)
  providerPlanAcceptances ProviderPlanAcceptance[]
  @@map("practice_locations") -- implicit, model name matches table
}
```

**Key design notes:**
- Replaced the older `Location` model from the initial migration
- `address_hash` (SHA-256) supports deduplication of practice locations
- `address_type` defaults to `"practice"` -- distinguishes from mailing addresses
- The `locationService.ts` uses an explicit `select` to avoid reading `address_hash` (noted as "not yet migrated" in Phase 2)

#### `provider_cms_details` (table: `provider_cms_details`)

One-to-one with Provider. Stores CMS enrichment data.

```prisma
model provider_cms_details {
  npi                 String   @id @db.VarChar(10)
  group_practice_name String?  @db.VarChar(200)
  medical_school      String?  @db.VarChar(200)
  graduation_year     String?  @db.VarChar(4)
  medicare_assignment String?  @db.VarChar(1)
  telehealth          String?  @db.VarChar(1)
  source              String?  @default("cms_national") @db.VarChar(30)
  providers           Provider @relation(fields: [npi], references: [npi], onDelete: NoAction, onUpdate: NoAction)
}
```

#### `provider_hospitals` (table: `provider_hospitals`)

One-to-many with Provider. Hospital affiliations with confidence scoring.

```prisma
model provider_hospitals {
  id              Int      @id @default(autoincrement())
  npi             String   @db.VarChar(10)
  hospital_system String?  @db.VarChar(100)
  hospital_name   String?  @db.VarChar(200)
  ccn             String?  @db.VarChar(20)
  source          String?  @db.VarChar(30)
  confidence      String?  @default("MEDIUM") @db.VarChar(10)
  providers       Provider @relation(...)
}
```

#### `provider_insurance` (table: `provider_insurance`)

One-to-many with Provider. Insurance network memberships derived from NPI other identifiers.

```prisma
model provider_insurance {
  id            Int      @id @default(autoincrement())
  npi           String   @db.VarChar(10)
  network_name  String?  @db.VarChar(200)
  identifier_id String?  @db.VarChar(100)
  source        String?  @default("npi_other_id") @db.VarChar(30)
  confidence    String?  @default("MEDIUM") @db.VarChar(10)
  providers     Provider @relation(...)
}
```

#### `provider_medicare` (table: `provider_medicare`)

One-to-many with Provider. Medicare identifier records.

```prisma
model provider_medicare {
  id             Int      @id @default(autoincrement())
  npi            String   @db.VarChar(10)
  medicare_id    String?  @db.VarChar(20)
  medicare_state String?  @db.VarChar(2)
  source         String?  @default("npi_other_id") @db.VarChar(30)
  providers      Provider @relation(...)
}
```

#### `provider_taxonomies` (table: `provider_taxonomies`)

One-to-many with Provider. All taxonomy codes per provider, with primary indicator and slot number.

```prisma
model provider_taxonomies {
  id            Int      @id @default(autoincrement())
  npi           String   @db.VarChar(10)
  taxonomy_code String?  @db.VarChar(20)
  is_primary    String?  @db.VarChar(1)
  slot_number   Int?
  providers     Provider @relation(...)
}
```

### 4.2 Reference Data Models (2 models)

#### `taxonomy_reference` (table: `taxonomy_reference`)

Lookup table for NUCC taxonomy codes. Used to translate codes into human-readable specialty names.

```prisma
model taxonomy_reference {
  taxonomy_code     String  @id @db.VarChar(20)
  display_name      String? @db.VarChar(200)
  grouping_name     String? @db.VarChar(200)
  classification    String? @db.VarChar(200)
  specialization    String? @db.VarChar(200)
  standardized_name String? @db.VarChar(200)
  provider_count    Int?
}
```

#### `hospitals` (table: `hospitals`)

Hospital master list with CCN (CMS Certification Number) as primary key.

```prisma
model hospitals {
  ccn             String  @id @db.VarChar(20)
  hospital_name   String? @db.VarChar(200)
  hospital_system String? @db.VarChar(100)
  address         String? @db.VarChar(200)
  city            String? @db.VarChar(100)
  state           String? @db.VarChar(2)
  zip_code        String? @db.VarChar(10)
  phone           String? @db.VarChar(20)
}
```

### 4.3 Insurance & Verification Models (4 models)

#### `InsurancePlan` (table: `insurance_plans`)

Insurance plan metadata. Supports carrier-based grouping for UI dropdowns.

```prisma
model InsurancePlan {
  planId              String   @id @map("plan_id") @db.VarChar(50)
  planName            String?  @map("plan_name") @db.VarChar(200)
  issuerName          String?  @map("issuer_name") @db.VarChar(200)
  planType            String?  @map("plan_type") @db.VarChar(20)
  state               String?  @db.VarChar(2)
  carrier             String?  @db.VarChar(100)
  planVariant         String?  @map("plan_variant") @db.VarChar(50)
  rawName             String?  @map("raw_name") @db.VarChar(500)
  sourceHealthSystem  String?  @map("source_health_system") @db.VarChar(200)
  providerCount       Int      @default(0) @map("provider_count")
  carrierId           Int?     @map("carrier_id")
  healthSystemId      Int?     @map("health_system_id")
  createdAt           DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  providerAcceptances ProviderPlanAcceptance[]
  verificationLogs    VerificationLog[]
  @@map("insurance_plans")
}
```

**Key design notes:**
- `carrierId` and `healthSystemId` are integer FKs reserved for future normalization (no FK constraints currently)
- `providerCount` is a denormalized count, with fallback to `_count.providerAcceptances` in the service layer
- `rawName` preserves the original plan name from import data

#### `ProviderPlanAcceptance` (table: `provider_plan_acceptance`)

Junction table linking providers to insurance plans. Core of the verification pipeline.

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
  provider           Provider?          @relation(fields: [providerNpi], references: [npi], onUpdate: NoAction)
  insurancePlan      InsurancePlan?     @relation(fields: [planId], references: [planId], onUpdate: NoAction)
  location           practice_locations? @relation(fields: [locationId], references: [id], onUpdate: NoAction)
  @@map("provider_plan_acceptance")
}
```

**Key design notes:**
- `locationId` enables per-location acceptance tracking (Phase 2 feature). A provider may accept a plan at one location but not another.
- Unique constraints are managed via **raw SQL partial indexes** (not Prisma `@@unique`):
  - `idx_ppa_npi_plan_location`: `UNIQUE(npi, plan_id, location_id) WHERE location_id IS NOT NULL`
  - `idx_ppa_npi_plan_legacy`: `UNIQUE(npi, plan_id) WHERE location_id IS NULL`
- `confidenceScore` is an integer 0-100 (changed from `DOUBLE PRECISION` in the original migration)
- `acceptanceStatus` uses `VARCHAR(20)` for flexibility, not the enum type directly
- `expiresAt` implements TTL -- records expire 6 months after `lastVerified`

#### `VerificationLog` (table: `verification_logs`)

Audit trail for crowdsource verifications. Application-generated CUID primary key.

```prisma
model VerificationLog {
  id                 String             @id @default(cuid())
  providerNpi        String?            @map("provider_npi") @db.VarChar(10)
  planId             String?            @map("plan_id") @db.VarChar(50)
  acceptanceId       String?
  verificationType   VerificationType
  verificationSource VerificationSource
  previousValue      Json?
  newValue           Json?
  sourceIp           String?            @db.VarChar(50)
  userAgent          String?            @db.VarChar(500)
  submittedBy        String?            @db.VarChar(200)
  upvotes            Int                @default(0)
  downvotes          Int                @default(0)
  isApproved         Boolean?
  reviewedAt         DateTime?          @db.Timestamptz(6)
  reviewedBy         String?
  notes              String?
  evidenceUrl        String?            @db.VarChar(500)
  createdAt          DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  expiresAt          DateTime?          @map("expires_at") @db.Timestamptz(6)
  plan               InsurancePlan?     @relation(...)
  provider           Provider?          @relation(...)
  votes              VoteLog[]
  @@map("verification_logs")
}
```

**Key design notes:**
- `previousValue` and `newValue` are `Json` fields storing the before/after state of the acceptance record
- `sourceIp`, `userAgent`, `submittedBy` are PII fields stripped before API responses
- `upvotes`/`downvotes` are denormalized counts from the `vote_logs` table
- Mixed column naming in PostgreSQL: fields with `@map()` are snake_case, fields without are camelCase (quoted identifiers)

#### `VoteLog` (table: `vote_logs`)

Individual votes on verifications. Enforces one vote per IP per verification.

```prisma
model VoteLog {
  id               String           @id @default(cuid())
  verificationId   String           @map("verification_id")
  sourceIp         String           @map("source_ip") @db.VarChar(50)
  vote             String           @db.VarChar(10)
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  verification     VerificationLog  @relation(fields: [verificationId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([verificationId, sourceIp])
  @@map("vote_logs")
}
```

**Key design notes:**
- `@@unique([verificationId, sourceIp])` enforces one vote per IP per verification at the database level
- `onDelete: Cascade` means votes are automatically deleted when their parent verification is deleted
- `vote` stores `'up'` or `'down'` as a string value

### 4.4 System Models (2 models)

#### `SyncLog` (table: `sync_logs`)

Tracks data import/sync operations for admin monitoring.

```prisma
model SyncLog {
  id                Int       @id @default(autoincrement())
  syncType          String?   @map("sync_type") @db.VarChar(50)
  state             String?   @db.VarChar(2)
  recordsProcessed  Int?      @default(0) @map("records_processed")
  status            String?   @db.VarChar(20)
  errorMessage      String?   @map("error_message")
  startedAt         DateTime? @default(now()) @map("started_at") @db.Timestamptz(6)
  completedAt       DateTime? @map("completed_at") @db.Timestamptz(6)
  @@map("sync_logs")
}
```

**Retention policy:** 90 days, managed via admin cleanup endpoint.

#### `DataQualityAudit` (table: `data_quality_audit`)

Tracks data quality issues per provider for monitoring and resolution.

```prisma
model DataQualityAudit {
  id             Int       @id @default(autoincrement())
  npi            String    @db.VarChar(10)
  auditType      String    @map("audit_type") @db.VarChar(50)
  severity       String    @db.VarChar(20)
  field          String?   @db.VarChar(100)
  currentValue   String?   @map("current_value")
  expectedValue  String?   @map("expected_value")
  details        String?
  resolved       Boolean   @default(false)
  resolvedAt     DateTime? @map("resolved_at") @db.Timestamptz(6)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  provider       Provider  @relation(fields: [npi], references: [npi], onDelete: NoAction, onUpdate: NoAction)
  @@map("data_quality_audit")
}
```

---

## 5. Enums

Three PostgreSQL enum types are used in the current schema:

### `AcceptanceStatus`

```prisma
enum AcceptanceStatus {
  ACCEPTED
  NOT_ACCEPTED
  PENDING
  UNKNOWN
}
```

Note: The `provider_plan_acceptance.acceptance_status` column uses `VARCHAR(20)` rather than the enum type directly, providing flexibility for status values without requiring migrations.

### `VerificationSource`

```prisma
enum VerificationSource {
  CMS_DATA
  CARRIER_DATA
  PROVIDER_PORTAL
  PHONE_CALL
  CROWDSOURCE
  AUTOMATED
  NPPES_SYNC
  CARRIER_SCRAPE
  NETWORK_CROSSREF
}
```

Used as a typed column in `verification_logs.verificationSource`. The `confidenceService.ts` maps each source to a score (0-25 points):

| Source | Score | Description |
|---|---|---|
| `CMS_DATA` / `NPPES_SYNC` | 25 | Official CMS data |
| `CARRIER_DATA` / `CARRIER_SCRAPE` | 20 | Insurance carrier data |
| `PROVIDER_PORTAL` | 20 | Provider-verified |
| `PHONE_CALL` / `CROWDSOURCE` / `NETWORK_CROSSREF` | 15 | Community verified / inferred |
| `AUTOMATED` | 10 | Automated checks |

### `VerificationType`

```prisma
enum VerificationType {
  PLAN_ACCEPTANCE
  PROVIDER_INFO
  CONTACT_INFO
  STATUS_CHANGE
  NEW_PLAN
}
```

### Legacy Enums (Initial Migration Only)

The initial migration (`20260113163234`) created several additional enum types that are **no longer used** in the current schema: `EntityType`, `SpecialtyCategory`, `NpiStatus`, `PlanType`, `MetalLevel`, `MarketType`, `DataSource`, `SyncType`, `SyncStatus`. These remain in the database but the current schema uses `VARCHAR` columns instead for greater flexibility.

---

## 6. Relationships & Foreign Keys

### Entity Relationship Diagram

```
Provider (npi PK)
  |-- practice_locations[]      (npi FK, one-to-many)
  |-- provider_cms_details?     (npi FK, one-to-one)
  |-- provider_hospitals[]      (npi FK, one-to-many)
  |-- provider_insurance[]      (npi FK, one-to-many)
  |-- provider_medicare[]       (npi FK, one-to-many)
  |-- provider_taxonomies[]     (npi FK, one-to-many)
  |-- ProviderPlanAcceptance[]  (npi FK, one-to-many)
  |-- VerificationLog[]         (provider_npi FK, one-to-many)
  '-- DataQualityAudit[]        (npi FK, one-to-many)

InsurancePlan (plan_id PK)
  |-- ProviderPlanAcceptance[]  (plan_id FK, one-to-many)
  '-- VerificationLog[]         (plan_id FK, one-to-many)

practice_locations (id PK, autoincrement)
  '-- ProviderPlanAcceptance[]  (location_id FK, one-to-many)

VerificationLog (id PK, CUID)
  '-- VoteLog[]                 (verification_id FK, one-to-many, CASCADE delete)
```

### ON DELETE Behavior Summary

| Relation | ON DELETE | Rationale |
|---|---|---|
| `practice_locations` -> `Provider` | `NoAction` | Preserve location data if provider deleted |
| `provider_cms_details` -> `Provider` | `NoAction` | Preserve CMS data |
| `provider_hospitals` -> `Provider` | `NoAction` | Preserve hospital affiliation data |
| `provider_insurance` -> `Provider` | `NoAction` | Preserve insurance data |
| `provider_medicare` -> `Provider` | `NoAction` | Preserve Medicare data |
| `provider_taxonomies` -> `Provider` | `NoAction` | Preserve taxonomy data |
| `ProviderPlanAcceptance` -> `Provider` | (default) | Preserve audit trail |
| `ProviderPlanAcceptance` -> `InsurancePlan` | (default) | Preserve audit trail |
| `ProviderPlanAcceptance` -> `practice_locations` | (default) | Preserve location reference |
| `VerificationLog` -> `Provider` | (default) | Preserve verification audit trail |
| `VerificationLog` -> `InsurancePlan` | (default) | Preserve verification audit trail |
| `VoteLog` -> `VerificationLog` | **Cascade** | Votes deleted with verification |
| `DataQualityAudit` -> `Provider` | `NoAction` | Preserve audit data |

The `NoAction` / default behavior for most relations means the database will prevent deletion of a Provider or InsurancePlan that still has dependent records. This is intentional -- provider data should not be silently orphaned.

---

## 7. Index Inventory

### Provider Indexes (6)

| Index Name | Column(s) | Purpose |
|---|---|---|
| `idx_providers_category` | `specialty_category` | Specialty category filtering |
| `idx_providers_credential` | `credential` | Credential search |
| `idx_providers_gender` | `gender` | Gender filtering |
| `idx_providers_last_name` | `lastName` (`last_name`) | Name search |
| `idx_providers_specialty` | `primary_specialty` | Specialty search |
| `idx_providers_taxonomy` | `primary_taxonomy_code` | Taxonomy code lookup |

### practice_locations Indexes (5)

| Index Name | Column(s) | Purpose |
|---|---|---|
| `idx_locations_city` | `city` | City search |
| `idx_locations_npi` | `npi` | Provider lookup |
| `idx_locations_state` | `state` | State filtering |
| `idx_locations_zip` | `zip_code` | ZIP code search |
| `idx_locations_address_hash` | `address_hash` | Address deduplication |

### provider_hospitals Indexes (2)

| Index Name | Column(s) | Purpose |
|---|---|---|
| `idx_hospitals_npi` | `npi` | Provider lookup |
| `idx_hospitals_system` | `hospital_system` | Health system filtering |

### provider_insurance Indexes (2)

| Index Name | Column(s) | Purpose |
|---|---|---|
| `idx_insurance_network` | `network_name` | Network name search |
| `idx_insurance_npi` | `npi` | Provider lookup |

### provider_medicare / provider_taxonomies Indexes (3)

| Index Name | Column(s) | Purpose |
|---|---|---|
| `idx_medicare_npi` | `npi` | Provider lookup |
| `idx_taxonomies_code` | `taxonomy_code` | Taxonomy code lookup |
| `idx_taxonomies_npi` | `npi` | Provider lookup |

### InsurancePlan Indexes (4)

| Index Name | Column(s) | Purpose |
|---|---|---|
| `idx_insurance_plans_carrier` | `carrier` | Carrier filtering |
| `idx_insurance_plans_carrier_id` | `carrierId` | Carrier ID lookup |
| `idx_insurance_plans_health_system_id` | `healthSystemId` | Health system lookup |
| `idx_insurance_plans_plan_variant` | `planVariant` | Plan variant filtering |

### ProviderPlanAcceptance Indexes (5 + partial unique)

| Index Name | Column(s) | Purpose |
|---|---|---|
| `idx_ppa_acceptance_status` | `acceptanceStatus` | Status filtering |
| `idx_ppa_confidence_score` | `confidenceScore` | Confidence sorting |
| `idx_ppa_expires_at` | `expiresAt` | TTL cleanup queries |
| `idx_ppa_last_verified` | `lastVerified` | Recency sorting |
| `idx_ppa_location_id` | `locationId` | Location lookup |
| **(partial unique)** `idx_ppa_npi_plan_location` | `(npi, plan_id, location_id)` WHERE `location_id IS NOT NULL` | Location-specific uniqueness |
| **(partial unique)** `idx_ppa_npi_plan_legacy` | `(npi, plan_id)` WHERE `location_id IS NULL` | Legacy NPI-level uniqueness |

### VerificationLog Indexes (9)

| Index Name | Column(s) | Purpose |
|---|---|---|
| `idx_vl_created_at` | `createdAt` | Time ordering |
| `idx_vl_expires_at` | `expiresAt` | TTL cleanup |
| `idx_vl_is_approved` | `isApproved` | Approval status filter |
| `idx_vl_plan_id` | `planId` | Plan lookup |
| `idx_vl_provider_npi` | `providerNpi` | Provider lookup |
| `idx_vl_provider_created` | `(providerNpi, createdAt)` | Provider activity timeline |
| `idx_vl_sybil_email` | `(providerNpi, planId, submittedBy, createdAt)` | Sybil prevention (email) |
| `idx_vl_sybil_ip` | `(providerNpi, planId, sourceIp, createdAt)` | Sybil prevention (IP) |
| `idx_vl_verification_type` | `verificationType` | Type filtering |

### VoteLog Indexes (2 + unique constraint)

| Index Name | Column(s) | Purpose |
|---|---|---|
| `@@unique` | `(verificationId, sourceIp)` | One vote per IP per verification |
| `idx_vote_logs_source_ip` | `sourceIp` | IP lookup |
| `idx_vote_logs_verification_id` | `verificationId` | Verification lookup |

### DataQualityAudit Indexes (4)

| Index Name | Column(s) | Purpose |
|---|---|---|
| `idx_dqa_npi` | `npi` | Provider lookup |
| `idx_dqa_severity` | `severity` | Severity filtering |
| `idx_dqa_audit_type` | `auditType` | Audit type filtering |
| `idx_dqa_resolved` | `resolved` | Resolution status filtering |

---

## 8. Data Quality & Confidence Scoring

### 8.1 Confidence Score Architecture

The confidence scoring system is defined in `packages/backend/src/services/confidenceService.ts` and produces a score from 0 to 100 based on four weighted factors:

| Factor | Max Points | Description |
|---|---|---|
| **Data Source** | 25 | Authoritative sources score higher (CMS=25, Carrier=20, Crowdsource=15) |
| **Recency** | 30 | Time-based decay with specialty-specific thresholds |
| **Verification Count** | 25 | Research-based: 3 verifications = expert-level accuracy |
| **Agreement** | 20 | Community consensus from upvote/downvote ratio |

### 8.2 Specialty-Specific Freshness Thresholds

Based on Ndumele et al. (2018), Health Affairs:

| Specialty Category | Freshness Threshold | Rationale |
|---|---|---|
| Mental Health | 30 days | 43% Medicaid acceptance, high churn |
| Primary Care | 60 days | 12% annual turnover |
| Specialist | 60 days | Similar to primary care |
| Hospital-Based | 90 days | More stable positions |
| Other | 60 days | Default |

### 8.3 Verification Count Scoring

Based on Mortensen et al. (2015), JAMIA:

| Verification Count | Score | Research Basis |
|---|---|---|
| 0 | 0 | No data |
| 1 | 10 | Single point -- could be outlier |
| 2 | 15 | Getting close, not optimal |
| 3+ | 25 | Expert-level accuracy (kappa=0.58) |

### 8.4 Confidence Level Labels

| Score Range | Level | With < 3 Verifications |
|---|---|---|
| 91-100 | `VERY_HIGH` | Capped at `MEDIUM` |
| 76-90 | `HIGH` | Capped at `MEDIUM` |
| 51-75 | `MEDIUM` | `MEDIUM` |
| 26-50 | `LOW` | `LOW` |
| 0-25 | `VERY_LOW` | `VERY_LOW` |

### 8.5 Confidence Decay Service

The `confidenceDecayService.ts` proactively recalculates scores for all acceptance records with `verificationCount >= 1`. It is triggered via the admin endpoint `POST /api/v1/admin/recalculate-confidence` and processes records in batches of 100 using cursor-based pagination.

### 8.6 Source Tracking Fields

- `ProviderPlanAcceptance.confidenceScore` -- Integer 0-100
- `ProviderPlanAcceptance.verificationCount` -- Number of verifications received
- `ProviderPlanAcceptance.lastVerified` -- Timestamptz of most recent verification
- `provider_hospitals.confidence` -- String enum (`"MEDIUM"`, etc.)
- `provider_insurance.confidence` -- String enum (`"MEDIUM"`, etc.)
- `provider_cms_details.source` -- Source identifier, defaults to `"cms_national"`

---

## 9. TTL & Data Retention

### 9.1 Verification TTL

Defined in `packages/backend/src/config/constants.ts`:

```typescript
export const VERIFICATION_TTL_MS = 6 * 30 * MS_PER_DAY; // ~180 days
```

Both `ProviderPlanAcceptance` and `VerificationLog` have `expiresAt` fields set to 6 months from creation/last verification. The rationale is based on 12% annual provider turnover -- verifications older than 6 months are considered stale.

### 9.2 TTL Filter Pattern

The `verificationService.ts` uses a `notExpiredFilter()` helper that includes legacy records (those with `expiresAt: null`) for backwards compatibility:

```typescript
function notExpiredFilter(): Prisma.VerificationLogWhereInput {
  return {
    OR: [
      { expiresAt: null },             // Legacy records without TTL
      { expiresAt: { gt: new Date() } }, // Not yet expired
    ],
  };
}
```

### 9.3 Cleanup Endpoints

| Endpoint | Table | Retention | Trigger |
|---|---|---|---|
| `POST /api/v1/admin/cleanup-expired` | `verification_logs`, `provider_plan_acceptance` | 6 months (TTL) | Cloud Scheduler |
| `POST /api/v1/admin/cleanup/sync-logs` | `sync_logs` | 90 days | Cloud Scheduler |

Both support `dryRun=true` query parameter for preview mode and use batched deletes (default batch size 1000) to avoid long-running transactions.

### 9.4 Monitoring Endpoints

- `GET /api/v1/admin/expiration-stats` -- Counts for expired, expiring-in-7-days, expiring-in-30-days
- `GET /api/v1/admin/retention/stats` -- Comprehensive retention metrics across all log types

---

## 10. Sybil Prevention & Anti-Abuse

### 10.1 Prevention Window

```typescript
export const SYBIL_PREVENTION_WINDOW_MS = 30 * MS_PER_DAY; // 30 days
```

Within a 30-day window, the same IP address or email address cannot submit multiple verifications for the same provider-plan pair. Checked in `verificationService.ts`:

```typescript
async function checkSybilAttack(
  providerNpi: string,
  planId: string,
  sourceIp?: string,
  submittedBy?: string
): Promise<void> {
  // Check IP-based duplicate
  // Check email-based duplicate
  // Throws AppError.conflict if duplicate found
}
```

### 10.2 Supporting Indexes

The Sybil prevention queries are covered by two composite indexes:

- `idx_vl_sybil_ip`: `(providerNpi, planId, sourceIp, createdAt)` -- IP-based deduplication
- `idx_vl_sybil_email`: `(providerNpi, planId, submittedBy, createdAt)` -- Email-based deduplication

### 10.3 Vote Deduplication

The `vote_logs` table enforces one vote per IP per verification via the unique constraint:

```prisma
@@unique([verificationId, sourceIp])
```

The service layer checks for existing votes and handles vote-changing (switching from up to down or vice versa) within a transaction.

### 10.4 Consensus Thresholds

Acceptance status changes require consensus safeguards (from `constants.ts`):

```typescript
export const MIN_VERIFICATIONS_FOR_CONSENSUS = 3;
export const MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60;
```

Additionally, the `determineAcceptanceStatus()` function requires a clear 2:1 majority ratio before changing status:

```typescript
const hasClearMajority = acceptedCount > notAcceptedCount * 2
  || notAcceptedCount > acceptedCount * 2;
```

---

## 11. Schema Conventions

### 11.1 Naming Conventions

| Convention | Example | Usage |
|---|---|---|
| PascalCase model + `@@map` | `InsurancePlan` -> `@@map("insurance_plans")` | Models with Prisma rename |
| lowercase model (no map) | `practice_locations`, `hospitals` | Models matching table name directly |
| camelCase fields + `@map` | `planName` -> `@map("plan_name")` | Fields needing rename |
| snake_case fields (no map) | `middle_name`, `name_prefix` | Fields matching DB column directly |

**Inconsistency noted:** Several Provider fields use raw snake_case without `@map` (`middle_name`, `name_prefix`, `name_suffix`, `last_update_date`, `deactivation_date`, `reactivation_date`, `is_sole_proprietor`, `is_organization_subpart`, `parent_organization_lbn`, `primary_taxonomy_code`, `primary_specialty`, `specialty_category`). This was inherited from `prisma db pull` and not fully normalized.

### 11.2 Type Conventions

| Pattern | Example | Notes |
|---|---|---|
| `@db.VarChar(N)` | `@db.VarChar(10)` for NPI | Explicit length limits on all string columns |
| `@db.Timestamptz(6)` | All timestamps | Timezone-aware with microsecond precision |
| `@default(cuid())` | `VerificationLog.id`, `VoteLog.id` | Application-generated TEXT PKs |
| `@default(autoincrement())` | Most table `id` fields | Integer PKs for data tables |
| `Json?` | `previousValue`, `newValue` | JSONB columns for flexible structured data |

### 11.3 Primary Key Strategies

| Strategy | Tables | Notes |
|---|---|---|
| NPI (natural key) | `providers`, `provider_cms_details` | 10-digit national identifier |
| CCN (natural key) | `hospitals` | CMS Certification Number |
| Taxonomy code (natural key) | `taxonomy_reference` | NUCC taxonomy code |
| Plan ID (natural key) | `insurance_plans` | External plan identifier |
| Autoincrement (surrogate) | `practice_locations`, `provider_hospitals`, `provider_insurance`, `provider_medicare`, `provider_taxonomies`, `provider_plan_acceptance`, `sync_logs`, `data_quality_audit` | Integer serial |
| CUID (surrogate) | `verification_logs`, `vote_logs` | Application-generated, globally unique |

---

## 12. Migration History

### Prisma Migrations (4)

| Timestamp | Name | Summary |
|---|---|---|
| `20260113163234` | `initial_schema` | Original schema with `providers`, `insurance_plans`, `provider_plan_acceptance`, `verification_logs`, `sync_logs`. Used enum types for most fields, TEXT PKs, and CASCADE deletes. |
| `20260114113939` | `add_location_details` | Added `name`, `health_system`, `facility_type` columns to `locations` table (since replaced by `practice_locations`). |
| `20260117224500` | `add_verification_ttl` | Added `expires_at` columns and indexes to `provider_plan_acceptance` and `verification_logs`. Added compound `(provider_npi, created_at)` index. |
| `20260124000000` | `add_vote_logs` | Created `vote_logs` table with unique `(verification_id, source_ip)` constraint and CASCADE delete from `verification_logs`. |

### Manual Migration (1)

| File | Summary |
|---|---|
| `packages/backend/migrations/add_verification_tables.sql` | Comprehensive migration that (re)creates `insurance_plans`, `provider_plan_acceptance`, `verification_logs`, `vote_logs`, and `sync_logs` tables with the current schema design. Includes all indexes, enums (idempotent creation), and detailed documentation. This represents the "current state" migration. |

### Schema Evolution

The schema has evolved significantly from the initial migration:

1. **Provider PK changed** from application-generated TEXT `id` to NPI as PK
2. **Enum columns replaced** with VARCHAR for flexibility
3. **Location model replaced** the old flat provider address fields with a separate `practice_locations` table
4. **Enrichment tables added** (`provider_cms_details`, `provider_hospitals`, `provider_insurance`, `provider_medicare`, `provider_taxonomies`) via direct `prisma db pull` from the live database
5. **TTL system added** for verification data lifecycle management
6. **Vote system added** for community consensus mechanism
7. **Data quality auditing** added via `data_quality_audit` table

---

## 13. Service Layer Database Usage

### 13.1 Provider Search (`providerService.ts`)

The `searchProviders()` function builds dynamic Prisma queries with:
- **Location filtering** via `practice_locations.some{}` relation filter
- **Specialty filtering** across `primary_specialty`, `primary_taxonomy_code`, and `specialty_category`
- **Name search** with fuzzy matching that strips medical titles (Dr., MD, DO, etc.) and tries both "First Last" and "Last First" orderings
- **Entity type mapping**: API `INDIVIDUAL`/`ORGANIZATION` mapped to DB `'1'`/`'2'`
- **Ordering**: By plan acceptance count (descending), then alphabetical
- **Standard include**: All enrichment tables eagerly loaded via `PROVIDER_INCLUDE`

### 13.2 Verification Pipeline (`verificationService.ts`)

The `submitVerification()` flow:

1. **Validate** provider and plan exist
2. **Sybil check** against IP and email within 30-day window
3. **Lookup** existing acceptance (location-specific first, then NPI-level fallback)
4. **Create** verification log with TTL
5. **Upsert** acceptance record with recalculated confidence score
6. **Return** PII-stripped result

### 13.3 Vote Processing (`verificationService.ts`)

The `voteOnVerification()` flow uses transactions:

```typescript
await prisma.$transaction(async (tx) => {
  // Create/update vote record
  // Increment/decrement upvote/downvote counters
});
```

After the vote transaction, the confidence score on the associated acceptance record is recalculated.

### 13.4 Plan Service (`planService.ts`)

Uses `getDistinctField()` helper for efficient distinct-value queries across `InsurancePlan` fields (carrier, planVariant, issuerName, etc.). Supports grouped plan display for UI carrier dropdowns.

### 13.5 Location Service (`locationService.ts`)

Provides location search, co-located provider discovery, health system lookup, and location statistics. Uses explicit `select` clauses to avoid reading unmigrated columns.

Note from `services/index.ts`:
```typescript
// TODO: locationService requires a Location model that doesn't exist in the new schema
// practice_locations is a flat per-provider table, not a deduplicated locations entity
// export * from './locationService';
```

The location service is **not re-exported** from the barrel file, but is used directly by route handlers.

### 13.6 Location Enrichment (`locationEnrichment.ts`)

Enriches practice locations with hospital/health-system data from `provider_hospitals`. Read-only -- no writes to `practice_locations`. Provides co-located provider discovery and enrichment statistics.

---

## 14. Known Issues & Recommendations

### 14.1 Active Issues

| Issue | Severity | Notes |
|---|---|---|
| No `state`/`city` index on Provider | Low | Address data lives in `practice_locations`, which has these indexes. Provider-level geographic queries must always join through the relation. |
| `provider_cms_details.source` defaults to `"cms_national"` | Low | May need source diversification as more CMS data sources are integrated. |
| Mixed camelCase/snake_case on Provider fields | Low | Several fields use raw snake_case without `@map()` -- inconsistent with the camelCase convention used elsewhere. Inherited from `prisma db pull`. |
| `locationService` not re-exported | Low | Works via direct import, but the barrel file comment suggests this may be temporary. |
| Legacy enum types in database | Info | Initial migration created `EntityType`, `SpecialtyCategory`, `NpiStatus`, etc. that are no longer referenced by the schema. Could be cleaned up. |

### 14.2 Recommendations

1. **Normalize Provider field names**: Add `@map("snake_case")` to `middle_name`, `name_prefix`, `name_suffix`, `last_update_date`, `deactivation_date`, `reactivation_date`, `is_sole_proprietor`, `is_organization_subpart`, `parent_organization_lbn` for consistent TypeScript camelCase access.

2. **Consider composite index on practice_locations**: `(state, city)` or `(state, zip_code)` for combined geographic queries that currently require separate index scans.

3. **Add unique constraint on practice_locations**: Consider `UNIQUE(npi, address_hash)` to prevent duplicate location records per provider.

4. **Clean up unused enum types**: Drop `EntityType`, `SpecialtyCategory`, `NpiStatus`, `PlanType`, `MetalLevel`, `MarketType`, `DataSource`, `SyncType`, `SyncStatus` from the database if they are no longer used.

5. **Scale planning for 9M+ providers**: The current ~2.1M provider dataset is a subset. Scaling to the full NPI registry (~9M records) may require:
   - Connection pooling (PgBouncer or similar)
   - Read replicas for search queries
   - Full-text search indexes or external search (Elasticsearch/Typesense)
   - Pagination optimization for large result sets

6. **Soft-delete consideration**: Currently no soft-delete pattern exists. Deactivated providers retain their records with `deactivation_date` set. Consider adding an `is_active` boolean index if filtering by active status becomes a common query pattern.

---

## 15. Questions for Future Work

1. **Are there missing indexes causing slow queries in production?** The comprehensive index coverage looks strong, but query analysis (`EXPLAIN ANALYZE`) on actual production queries would confirm.

2. **Should deactivated providers be soft-deleted or hard-deleted?** Currently they remain with `deactivation_date` set. The answer depends on whether users should be able to find deactivated providers (e.g., "this provider is no longer active").

3. **Are there N+1 query patterns in the service layer?** The `PROVIDER_INCLUDE` constant eagerly loads all relations, which prevents N+1 on the detail page. However, the `searchProviders()` function includes all relations even for list views, which may be over-fetching. Consider a lighter include for list endpoints.

4. **What is the plan for handling 9M+ providers?** Current indexes are sufficient for 2.1M records but may need optimization at scale. Full-text search, partitioning, or external search engines should be evaluated.

5. **Should `practice_locations` have a unique constraint on address fields?** The `address_hash` column exists for deduplication but currently has no unique constraint. Consider `UNIQUE(npi, address_hash)`.

6. **Should Provider fields be normalized to consistent camelCase with `@map`?** This is a non-breaking change that would improve code consistency but requires a migration to confirm column mappings.

---

## Appendix: File Reference

| File | Path | Purpose |
|---|---|---|
| Prisma Schema | `packages/backend/prisma/schema.prisma` | Source of truth for database schema |
| Prisma Client | `packages/backend/src/lib/prisma.ts` | Singleton Prisma client with dev logging |
| Constants | `packages/backend/src/config/constants.ts` | TTL, Sybil window, consensus thresholds |
| Provider Service | `packages/backend/src/services/providerService.ts` | Provider search with name parsing |
| Plan Service | `packages/backend/src/services/planService.ts` | Plan search and carrier grouping |
| Verification Service | `packages/backend/src/services/verificationService.ts` | Submit/vote/cleanup verifications |
| Confidence Service | `packages/backend/src/services/confidenceService.ts` | Research-based confidence scoring |
| Confidence Decay | `packages/backend/src/services/confidenceDecayService.ts` | Proactive score recalculation |
| Location Service | `packages/backend/src/services/locationService.ts` | Location search and co-location |
| Location Enrichment | `packages/backend/src/services/locationEnrichment.ts` | Hospital affiliation enrichment |
| Service Utilities | `packages/backend/src/services/utils.ts` | Pagination, city filters, WHERE builders |
| Verify Routes | `packages/backend/src/routes/verify.ts` | Verification API endpoints |
| Admin Routes | `packages/backend/src/routes/admin.ts` | Admin cleanup and monitoring endpoints |
| Initial Migration | `packages/backend/prisma/migrations/20260113163234_initial_schema/migration.sql` | Original schema |
| TTL Migration | `packages/backend/prisma/migrations/20260117224500_add_verification_ttl/migration.sql` | Added expires_at fields |
| Vote Migration | `packages/backend/prisma/migrations/20260124000000_add_vote_logs/migration.sql` | Added vote_logs table |
| Manual Migration | `packages/backend/migrations/add_verification_tables.sql` | Comprehensive current-state migration |
