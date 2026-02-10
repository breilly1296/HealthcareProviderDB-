# Database Schema - VerifyMyProvider

## Overview

VerifyMyProvider uses **Prisma 5.22.0** as the ORM with a **PostgreSQL** database hosted on **Google Cloud SQL**. The database name is `verifymyprovider`. The dataset contains approximately **2.1 million provider records** sourced from the CMS NPI Registry and related public datasets.

**No HIPAA or Row-Level Security (RLS) is required** -- all data is publicly available provider information. There is no patient data in the system.

---

## Schema Conventions

| Convention | Example | Notes |
|---|---|---|
| Model names | `PascalCase` with `@@map("snake_case_table")` | Prisma generates PascalCase; PostgreSQL tables are snake_case |
| Field names | `camelCase` with `@map("snake_case_column")` | TypeScript uses camelCase; DB columns are snake_case |
| String columns | `@db.VarChar(N)` | Explicit length limits on all VARCHAR fields |
| Timestamps | `@db.Timestamptz(6)` | Timezone-aware with microsecond precision |
| Text primary keys | `@default(cuid())` | Application-generated IDs for verification_logs, vote_logs |
| Integer primary keys | `@default(autoincrement())` | Auto-incrementing for reference/junction tables |
| Prisma pull behavior | `prisma db pull` generates raw lowercase model names | Must manually rename to PascalCase and add `@@map` |

---

## Models (15 Total)

### Provider Data Models (7)

#### Provider

The central model. Primary key is the 10-digit NPI number (National Provider Identifier).

```prisma
model Provider {
  npi                    String   @id @db.VarChar(10)
  firstName              String?  @map("first_name") @db.VarChar(100)
  lastName               String?  @map("last_name") @db.VarChar(100)
  credential             String?  @db.VarChar(50)
  gender                 String?  @db.VarChar(10)
  entityType             String?  @map("entity_type") @db.VarChar(50)
  primarySpecialty       String?  @map("primary_specialty") @db.VarChar(255)
  primaryTaxonomyCode    String?  @map("primary_taxonomy_code") @db.VarChar(20)
  specialtyCategory      String?  @map("specialty_category") @db.VarChar(100)
  providerProfileUrl     String?  @map("provider_profile_url") @db.VarChar(500)
  profileUrlVerified     Boolean? @map("profile_url_verified")
  profileUrlVerifiedAt   DateTime? @map("profile_url_verified_at") @db.Timestamptz(6)
  lastUpdated            DateTime? @map("last_updated") @db.Timestamptz(6)
  createdAt              DateTime? @map("created_at") @db.Timestamptz(6)
  confidenceScore        Float?   @map("confidence_score")
  verificationCount      Int?     @map("verification_count") @default(0)

  // Relations
  practiceLocations      practice_locations[]
  cmsDetails             provider_cms_details?
  hospitals              provider_hospitals[]
  insurance              provider_insurance[]
  medicare               provider_medicare[]
  taxonomies             provider_taxonomies[]
  planAcceptances        ProviderPlanAcceptance[]
  verifications          VerificationLog[]
  dataQualityAudits      DataQualityAudit[]

  @@map("providers")
}
```

#### practice_locations

One-to-many relationship with Provider via NPI. Stores physical practice addresses.

```prisma
model practice_locations {
  id              Int      @id @default(autoincrement())
  npi             String   @db.VarChar(10)
  addressLine1    String?  @map("address_line_1") @db.VarChar(255)
  addressLine2    String?  @map("address_line_2") @db.VarChar(255)
  city            String?  @db.VarChar(100)
  state           String?  @db.VarChar(2)
  zipCode         String?  @map("zip_code") @db.VarChar(10)
  phone           String?  @db.VarChar(20)
  fax             String?  @db.VarChar(20)
  isPrimary       Boolean? @map("is_primary") @default(false)
  locationName    String?  @map("location_name") @db.VarChar(255)
  healthSystemId  String?  @map("health_system_id") @db.VarChar(50)
  healthSystemName String? @map("health_system_name") @db.VarChar(255)
  latitude        Float?
  longitude       Float?

  provider        Provider @relation(fields: [npi], references: [npi])

  @@map("practice_locations")
}
```

#### provider_cms_details

One-to-one relationship with Provider. Additional CMS data fields.

```prisma
model provider_cms_details {
  npi                    String   @id @db.VarChar(10)
  enumerationDate        DateTime? @map("enumeration_date") @db.Date
  lastUpdateDate         DateTime? @map("last_update_date") @db.Date
  certificationDate      DateTime? @map("certification_date") @db.Date
  sole_proprietor        String?  @db.VarChar(5)
  organizationSubpart    String?  @map("organization_subpart") @db.VarChar(5)
  parentOrganizationLbn  String?  @map("parent_organization_lbn") @db.VarChar(255)

  provider               Provider @relation(fields: [npi], references: [npi])

  @@map("provider_cms_details")
}
```

#### provider_hospitals

One-to-many via NPI. Hospital affiliations for providers.

```prisma
model provider_hospitals {
  id          Int      @id @default(autoincrement())
  npi         String   @db.VarChar(10)
  ccn         String?  @db.VarChar(20)
  hospitalName String? @map("hospital_name") @db.VarChar(255)

  provider    Provider @relation(fields: [npi], references: [npi])

  @@map("provider_hospitals")
}
```

#### provider_insurance

One-to-many via NPI. Insurance plans accepted by providers (legacy/enrichment data).

```prisma
model provider_insurance {
  id            Int      @id @default(autoincrement())
  npi           String   @db.VarChar(10)
  insuranceName String?  @map("insurance_name") @db.VarChar(255)
  planType      String?  @map("plan_type") @db.VarChar(50)

  provider      Provider @relation(fields: [npi], references: [npi])

  @@map("provider_insurance")
}
```

#### provider_medicare

One-to-many via NPI. Medicare enrollment and participation data.

```prisma
model provider_medicare {
  id                    Int      @id @default(autoincrement())
  npi                   String   @db.VarChar(10)
  participationIndicator String? @map("participation_indicator") @db.VarChar(5)
  medicareSpecialtyCode String?  @map("medicare_specialty_code") @db.VarChar(10)
  enrollmentDate        DateTime? @map("enrollment_date") @db.Date

  provider              Provider @relation(fields: [npi], references: [npi])

  @@map("provider_medicare")
}
```

#### provider_taxonomies

One-to-many via NPI. Taxonomy classifications for providers.

```prisma
model provider_taxonomies {
  id            Int      @id @default(autoincrement())
  npi           String   @db.VarChar(10)
  taxonomyCode  String?  @map("taxonomy_code") @db.VarChar(20)
  taxonomyDesc  String?  @map("taxonomy_desc") @db.VarChar(255)
  isPrimary     Boolean? @map("is_primary") @default(false)
  licenseNumber String?  @map("license_number") @db.VarChar(50)
  licenseState  String?  @map("license_state") @db.VarChar(2)

  provider      Provider @relation(fields: [npi], references: [npi])

  @@map("provider_taxonomies")
}
```

---

### Reference Data Models (2)

#### taxonomy_reference

Lookup table for taxonomy codes. Primary key is the taxonomy code string.

```prisma
model taxonomy_reference {
  taxonomyCode    String  @id @map("taxonomy_code") @db.VarChar(20)
  providerType    String? @map("provider_type") @db.VarChar(255)
  specialization  String? @db.VarChar(255)
  definition      String?
  category        String? @db.VarChar(100)

  @@map("taxonomy_reference")
}
```

#### hospitals

Hospital reference data. Primary key is the CCN (CMS Certification Number).

```prisma
model hospitals {
  ccn            String  @id @db.VarChar(20)
  hospitalName   String? @map("hospital_name") @db.VarChar(255)
  city           String? @db.VarChar(100)
  state          String? @db.VarChar(2)
  zipCode        String? @map("zip_code") @db.VarChar(10)
  hospitalType   String? @map("hospital_type") @db.VarChar(100)

  @@map("hospitals")
}
```

---

### Insurance & Verification Models (4)

#### InsurancePlan

Marketplace insurance plans. Primary key is plan_id (HIOS standard identifier).

```prisma
model InsurancePlan {
  planId         String   @id @map("plan_id") @db.VarChar(50)
  planName       String?  @map("plan_name") @db.VarChar(500)
  issuerName     String?  @map("issuer_name") @db.VarChar(255)
  planType       String?  @map("plan_type") @db.VarChar(50)
  metalLevel     String?  @map("metal_level") @db.VarChar(50)
  state          String?  @db.VarChar(2)
  year           Int?
  isActive       Boolean? @map("is_active") @default(true)

  planAcceptances ProviderPlanAcceptance[]
  verifications   VerificationLog[]

  @@map("insurance_plans")
}
```

#### ProviderPlanAcceptance

Junction table linking providers and insurance plans. Unique constraint on NPI + planId.

```prisma
model ProviderPlanAcceptance {
  id               Int              @id @default(autoincrement())
  npi              String           @db.VarChar(10)
  planId           String           @map("plan_id") @db.VarChar(50)
  status           AcceptanceStatus @default(UNKNOWN)
  confidenceScore  Float?           @map("confidence_score")
  lastVerifiedAt   DateTime?        @map("last_verified_at") @db.Timestamptz(6)
  verificationCount Int?            @map("verification_count") @default(0)
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  provider         Provider         @relation(fields: [npi], references: [npi])
  plan             InsurancePlan    @relation(fields: [planId], references: [planId])

  @@unique([npi, planId])
  @@map("provider_plan_acceptance")
}
```

#### VerificationLog

Community-submitted verifications. Uses cuid() for the primary key.

```prisma
model VerificationLog {
  id                String             @id @default(cuid())
  npi               String             @db.VarChar(10)
  planId            String?            @map("plan_id") @db.VarChar(50)
  acceptsInsurance  Boolean?           @map("accepts_insurance")
  notes             String?            @db.VarChar(1000)
  evidenceUrl       String?            @map("evidence_url") @db.VarChar(500)
  submittedBy       String?            @map("submitted_by") @db.VarChar(255)
  sourceIp          String?            @map("source_ip") @db.VarChar(45)
  userAgent         String?            @map("user_agent") @db.VarChar(500)
  source            VerificationSource @default(COMMUNITY)
  verificationType  VerificationType   @default(INSURANCE_ACCEPTANCE) @map("verification_type")
  isExpired         Boolean            @default(false) @map("is_expired")
  expiresAt         DateTime?          @map("expires_at") @db.Timestamptz(6)
  upvotes           Int                @default(0)
  downvotes         Int                @default(0)
  createdAt         DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)

  provider          Provider           @relation(fields: [npi], references: [npi])
  plan              InsurancePlan?     @relation(fields: [planId], references: [planId])
  votes             VoteLog[]

  @@map("verification_logs")
}
```

#### VoteLog

Votes on verifications. Unique constraint on verificationId + sourceIp. Cascades on verification delete.

```prisma
model VoteLog {
  id              String          @id @default(cuid())
  verificationId  String          @map("verification_id")
  vote            String          @db.VarChar(10) // "up" or "down"
  sourceIp        String?         @map("source_ip") @db.VarChar(45)
  createdAt       DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)

  verification    VerificationLog @relation(fields: [verificationId], references: [id], onDelete: Cascade)

  @@unique([verificationId, sourceIp])
  @@map("vote_logs")
}
```

---

### System Models (2)

#### SyncLog

Tracks data synchronization operations (NPI imports, enrichment runs, etc.).

```prisma
model SyncLog {
  id          Int      @id @default(autoincrement())
  syncType    String   @map("sync_type") @db.VarChar(50)
  status      String   @db.VarChar(20)
  recordCount Int?     @map("record_count")
  errorMessage String? @map("error_message")
  startedAt   DateTime @default(now()) @map("started_at") @db.Timestamptz(6)
  completedAt DateTime? @map("completed_at") @db.Timestamptz(6)
  metadata    Json?

  @@map("sync_logs")
}
```

#### DataQualityAudit

Tracks data quality checks and issues per provider.

```prisma
model DataQualityAudit {
  id          Int      @id @default(autoincrement())
  npi         String   @db.VarChar(10)
  field       String   @db.VarChar(100)
  issue       String   @db.VarChar(255)
  severity    String   @db.VarChar(20)
  resolvedAt  DateTime? @map("resolved_at") @db.Timestamptz(6)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  provider    Provider @relation(fields: [npi], references: [npi])

  @@map("data_quality_audits")
}
```

---

## Enums

```prisma
enum AcceptanceStatus {
  ACCEPTED
  NOT_ACCEPTED
  PENDING
  UNKNOWN
}

enum VerificationSource {
  COMMUNITY
  PROVIDER_OFFICE
  INSURANCE_COMPANY
  CMS_DATA
  WEB_SCRAPE
  AI_ENRICHMENT
  INSURANCE_CARD
  PHONE_VERIFICATION
  ADMIN
}

enum VerificationType {
  INSURANCE_ACCEPTANCE
  ADDRESS_CONFIRMATION
  PHONE_CONFIRMATION
  HOURS_UPDATE
  GENERAL_INFO
}
```

---

## Relationships Summary

```
Provider (1) ──── (*) practice_locations      [via NPI]
Provider (1) ──── (1) provider_cms_details     [via NPI]
Provider (1) ──── (*) provider_hospitals       [via NPI]
Provider (1) ──── (*) provider_insurance       [via NPI]
Provider (1) ──── (*) provider_medicare        [via NPI]
Provider (1) ──── (*) provider_taxonomies      [via NPI]
Provider (1) ──── (*) ProviderPlanAcceptance   [via NPI]
Provider (1) ──── (*) VerificationLog          [via NPI]
Provider (1) ──── (*) DataQualityAudit         [via NPI]

InsurancePlan (1) ── (*) ProviderPlanAcceptance [via planId]
InsurancePlan (1) ── (*) VerificationLog        [via planId]

VerificationLog (1) ── (*) VoteLog              [via verificationId, CASCADE DELETE]
```

---

## Indexes

### providers

| Index Name | Column(s) | Purpose |
|---|---|---|
| `providers_specialty_category_idx` | `specialty_category` | Filter by specialty category |
| `providers_credential_idx` | `credential` | Filter by credential type |
| `providers_gender_idx` | `gender` | Filter by gender |
| `providers_last_name_idx` | `last_name` | Name search |
| `providers_primary_specialty_idx` | `primary_specialty` | Filter by primary specialty |
| `providers_primary_taxonomy_code_idx` | `primary_taxonomy_code` | Taxonomy lookup |

### practice_locations

| Index Name | Column(s) | Purpose |
|---|---|---|
| `practice_locations_city_idx` | `city` | City-based search |
| `practice_locations_npi_idx` | `npi` | Join to provider |
| `practice_locations_state_idx` | `state` | State-based filtering |
| `practice_locations_zip_code_idx` | `zip_code` | ZIP code search |

### provider_plan_acceptance

| Index Name | Column(s) | Purpose |
|---|---|---|
| `provider_plan_acceptance_npi_plan_id_key` | `npi, plan_id` | Unique constraint / lookup |
| `provider_plan_acceptance_plan_id_idx` | `plan_id` | Plan-based queries |

### verification_logs

| Index Name | Column(s) | Purpose |
|---|---|---|
| `verification_logs_npi_idx` | `npi` | Provider verification lookup |
| `verification_logs_plan_id_idx` | `plan_id` | Plan verification lookup |
| `verification_logs_created_at_idx` | `created_at` | Recent verifications sort |
| `verification_logs_source_ip_idx` | `source_ip` | Sybil detection / rate check |

### vote_logs

| Index Name | Column(s) | Purpose |
|---|---|---|
| `vote_logs_verification_id_source_ip_key` | `verification_id, source_ip` | Unique constraint / dedup |

### insurance_plans

| Index Name | Column(s) | Purpose |
|---|---|---|
| `insurance_plans_issuer_name_idx` | `issuer_name` | Issuer-based search |
| `insurance_plans_state_idx` | `state` | State-based filtering |

---

## Scale Notes

- ~2.1 million rows in `providers`
- ~4+ million rows in `practice_locations` (multiple locations per provider)
- Insurance plans are marketplace plans loaded from CMS QHP datasets
- Verification data is community-generated and grows over time
- No partitioning currently required at this scale
- Connection pooling handled by Prisma's built-in pool (configured via `DATABASE_URL` connection string parameters)
