# Insurance Plan Database Import Design

**Version**: 1.0
**Status**: Draft
**Last Updated**: 2024-01-15

## Table of Contents

1. [Overview](#overview)
2. [Data Sources](#data-sources)
3. [Database Schema](#database-schema)
4. [ETL Pipeline](#etl-pipeline)
5. [Import Script](#import-script)
6. [Admin Endpoints](#admin-endpoints)
7. [API Endpoints](#api-endpoints)
8. [Carrier Name Normalization](#carrier-name-normalization)
9. [Update Schedule](#update-schedule)
10. [Migration Strategy](#migration-strategy)
11. [Implementation Checklist](#implementation-checklist)

---

## Overview

### Current State

The current insurance plan handling has several limitations:

1. **Manual Entry**: Users type plan names free-form, leading to inconsistencies
2. **Limited Data**: Only a small set of pre-loaded plans exists
3. **No Standardization**: Same plan appears with different names/spellings
4. **No Carrier Linking**: Plans aren't linked to parent insurance carriers
5. **No Metadata**: Missing plan type (HMO/PPO), metal level, market type

### Goal

Create a comprehensive database of US insurance plans that provides:

- **Autocomplete**: Fast, accurate plan search as users type
- **Standardization**: Canonical plan names and IDs
- **Carrier Linking**: Plans linked to parent insurance companies
- **Rich Metadata**: Plan type, metal level, state, effective dates
- **Regular Updates**: Automated sync with official sources

### Benefits

| Benefit | Impact |
|---------|--------|
| Data Quality | Consistent plan names across all verifications |
| User Experience | Fast autocomplete reduces typing errors |
| Search & Filter | Filter providers by plan type, carrier, metal level |
| Analytics | Accurate reporting on plan acceptance rates |
| Matching | Match verifications to canonical plan database |

### Scope

| In Scope | Out of Scope |
|----------|--------------|
| ACA Marketplace plans | Employer-specific custom plans |
| Medicare Advantage | Self-funded employer plans |
| Medicare Part D | International plans |
| State Medicaid | Historical plans (>3 years old) |
| Major carrier plans | |

### Estimated Plan Count

| Market Type | Estimated Plans |
|-------------|-----------------|
| ACA Individual | ~15,000 |
| ACA Small Group | ~20,000 |
| Medicare Advantage | ~4,000 |
| Medicare Part D | ~1,000 |
| Medicaid (varies by state) | ~500 |
| **Total** | **~40,000+** |

---

## Data Sources

### Primary Sources

| Source | Coverage | Format | Update Frequency | Cost | URL |
|--------|----------|--------|------------------|------|-----|
| CMS HIOS | ACA Marketplace plans | CSV/JSON | Annual + quarterly updates | Free | data.healthcare.gov |
| CMS Medicare | MA & Part D plans | CSV | Quarterly | Free | cms.gov |
| State Medicaid | State-specific | Varies | Varies | Free | State websites |
| NAIC | Insurer registry | CSV | Quarterly | Free | naic.org |

### CMS HIOS (Health Insurance Oversight System)

**Primary data source for ACA Marketplace plans**

**Key Files**:
- `Plan_Attributes_PUF.csv` - Plan details, metal level, type
- `Rate_PUF.csv` - Premium rates by area
- `Benefits_Cost_Sharing_PUF.csv` - Copays, deductibles
- `Business_Rules_PUF.csv` - Enrollment rules
- `Service_Area_PUF.csv` - Geographic coverage
- `Network_PUF.csv` - Network information

**URL**: https://data.healthcare.gov/dataset/QHP-Landscape-Individual-Market-Medical/

**Fields We Need**:
```
StandardComponentId     - Unique plan identifier (e.g., "12345NY0010001")
PlanMarketingName       - Display name
PlanType                - HMO, PPO, EPO, POS, HDHP
MetalLevel              - Bronze, Silver, Gold, Platinum, Catastrophic
IssuerId                - Carrier ID
IssuerName              - Carrier name
StateCode               - Two-letter state code
MarketCoverage          - Individual, SHOP (Small Group)
DentalOnlyPlan          - Yes/No
IsNewPlan               - Yes/No
PlanEffectiveDate       - Start date
PlanExpirationDate      - End date
```

### CMS Medicare Plans

**Medicare Advantage and Part D Plans**

**Key Files**:
- `Plan_Information.csv` - Plan details
- `Benefit_Information.csv` - Coverage details
- `Geographic_Service_Areas.csv` - Where plans are offered

**URL**: https://data.cms.gov/provider-data/dataset/medicare-advantage-part-d

**Fields We Need**:
```
Contract_ID             - CMS contract number
Plan_ID                 - Plan within contract
Plan_Name               - Display name
Plan_Type               - HMO, PPO, PFFS, SNP, etc.
Organization_Name       - Carrier name
State                   - State(s) where offered
Star_Rating             - Quality rating (1-5)
```

### NAIC Insurer Registry

**Insurance company master list**

**URL**: https://content.naic.org/cipr_company_search.htm

**Fields We Need**:
```
NAIC_Code               - Unique insurer ID
Company_Name            - Legal name
DBA_Name                - Doing business as
State_of_Domicile       - Home state
Company_Type            - Health, Life, P&C
Parent_Organization     - Holding company
```

### State Medicaid

Each state maintains its own Medicaid plan data. Priority states:

| State | Medicaid Name | Data Availability |
|-------|---------------|-------------------|
| CA | Medi-Cal | API available |
| NY | Medicaid | PDF/CSV |
| TX | Medicaid | CSV |
| FL | Medicaid | CSV |
| PA | HealthChoices | CSV |

---

## Database Schema

### Prisma Models

```prisma
// =============================================================================
// Insurance Carrier (Parent Organization)
// =============================================================================

model InsuranceCarrier {
  id              String   @id  // NAIC code or generated ID

  // Names
  legalName       String          // Official legal name
  displayName     String          // Common display name
  aliases         String[]        // Alternative names/abbreviations

  // Organization Info
  parentOrgId     String?         // Parent holding company
  parentOrg       InsuranceCarrier? @relation("CarrierParent", fields: [parentOrgId], references: [id])
  subsidiaries    InsuranceCarrier[] @relation("CarrierParent")

  // Contact
  website         String?
  phone           String?

  // Coverage
  states          String[]        // States where carrier operates
  marketTypes     String[]        // Individual, Group, Medicare, Medicaid

  // Status
  isActive        Boolean  @default(true)

  // Timestamps
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  plans           InsurancePlan[]

  @@index([displayName])
  @@index([isActive])
}

// =============================================================================
// Insurance Plan
// =============================================================================

model InsurancePlan {
  id              String   @id  // HIOS Standard Component ID or generated

  // Plan Identity
  externalId      String?         // External system ID (HIOS, CMS, etc.)
  source          PlanSource      // Where this plan data came from

  // Names
  name            String          // Official plan name
  marketingName   String?         // Marketing/display name
  shortName       String?         // Abbreviated name for UI

  // Carrier
  carrierId       String
  carrier         InsuranceCarrier @relation(fields: [carrierId], references: [id])
  carrierName     String          // Denormalized for search

  // Plan Classification
  planType        PlanType?       // HMO, PPO, EPO, POS, etc.
  metalLevel      MetalLevel?     // Bronze, Silver, Gold, Platinum
  marketType      MarketType      // Individual, Small Group, Medicare, etc.

  // Coverage
  state           String?  @db.VarChar(2)  // Primary state (null for national)
  serviceArea     String[]        // Counties/regions covered
  isDentalOnly    Boolean  @default(false)
  isVisionOnly    Boolean  @default(false)

  // Status
  isActive        Boolean  @default(true)
  effectiveDate   DateTime?
  expirationDate  DateTime?

  // Metadata
  year            Int?            // Plan year
  starRating      Float?          // Quality rating (Medicare)

  // Timestamps
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  acceptances     PlanAcceptance[]

  @@unique([externalId, source])
  @@unique([carrierId, name, state, marketType, year])
  @@index([carrierId])
  @@index([carrierName])
  @@index([state])
  @@index([planType])
  @@index([marketType])
  @@index([metalLevel])
  @@index([name])
  @@index([isActive])
  @@index([year])

  @@fulltext([name, marketingName, carrierName])
}

// =============================================================================
// Enums
// =============================================================================

enum PlanSource {
  CMS_HIOS           // ACA Marketplace
  CMS_MEDICARE       // Medicare Advantage/Part D
  STATE_MEDICAID     // State Medicaid programs
  MANUAL             // Manually entered
  USER_SUBMITTED     // User-submitted custom plan
}

enum PlanType {
  HMO               // Health Maintenance Organization
  PPO               // Preferred Provider Organization
  EPO               // Exclusive Provider Organization
  POS               // Point of Service
  HDHP              // High Deductible Health Plan
  PFFS              // Private Fee-for-Service (Medicare)
  MSA               // Medical Savings Account
  SNP               // Special Needs Plan (Medicare)
  UNKNOWN
}

enum MetalLevel {
  CATASTROPHIC
  BRONZE
  SILVER
  GOLD
  PLATINUM
  NOT_APPLICABLE    // Medicare, Medicaid, etc.
}

enum MarketType {
  INDIVIDUAL        // ACA Individual market
  SMALL_GROUP       // ACA SHOP market
  LARGE_GROUP       // Large employer
  MEDICARE_ADVANTAGE
  MEDICARE_PART_D
  MEDICAID
  CHIP              // Children's Health Insurance Program
  OTHER
}

// =============================================================================
// Import Tracking
// =============================================================================

model PlanImportLog {
  id              String   @id @default(cuid())

  source          PlanSource
  status          ImportStatus

  // Counts
  totalRecords    Int
  newRecords      Int
  updatedRecords  Int
  skippedRecords  Int
  errorRecords    Int

  // Timing
  startedAt       DateTime
  completedAt     DateTime?
  durationMs      Int?

  // Details
  fileName        String?
  fileSize        Int?
  errorDetails    Json?

  createdAt       DateTime @default(now())

  @@index([source])
  @@index([status])
  @@index([createdAt])
}

enum ImportStatus {
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

// =============================================================================
// Carrier Name Mapping
// =============================================================================

model CarrierAlias {
  id              String   @id @default(cuid())

  alias           String   @unique  // The variant name
  carrierId       String            // Maps to canonical carrier

  isAutoGenerated Boolean  @default(false)

  createdAt       DateTime @default(now())

  @@index([alias])
  @@index([carrierId])
}
```

### Migration SQL

```sql
-- Create new tables
CREATE TABLE "InsuranceCarrier" (
  "id" TEXT PRIMARY KEY,
  "legalName" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "aliases" TEXT[],
  "parentOrgId" TEXT,
  "website" TEXT,
  "phone" TEXT,
  "states" TEXT[],
  "marketTypes" TEXT[],
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3),
  FOREIGN KEY ("parentOrgId") REFERENCES "InsuranceCarrier"("id")
);

CREATE TABLE "InsurancePlan" (
  "id" TEXT PRIMARY KEY,
  "externalId" TEXT,
  "source" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "marketingName" TEXT,
  "shortName" TEXT,
  "carrierId" TEXT NOT NULL,
  "carrierName" TEXT NOT NULL,
  "planType" TEXT,
  "metalLevel" TEXT,
  "marketType" TEXT NOT NULL,
  "state" VARCHAR(2),
  "serviceArea" TEXT[],
  "isDentalOnly" BOOLEAN DEFAULT false,
  "isVisionOnly" BOOLEAN DEFAULT false,
  "isActive" BOOLEAN DEFAULT true,
  "effectiveDate" TIMESTAMP(3),
  "expirationDate" TIMESTAMP(3),
  "year" INTEGER,
  "starRating" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3),
  FOREIGN KEY ("carrierId") REFERENCES "InsuranceCarrier"("id")
);

-- Create indexes
CREATE INDEX "InsuranceCarrier_displayName_idx" ON "InsuranceCarrier"("displayName");
CREATE INDEX "InsurancePlan_carrierId_idx" ON "InsurancePlan"("carrierId");
CREATE INDEX "InsurancePlan_state_idx" ON "InsurancePlan"("state");
CREATE INDEX "InsurancePlan_planType_idx" ON "InsurancePlan"("planType");
CREATE INDEX "InsurancePlan_marketType_idx" ON "InsurancePlan"("marketType");
CREATE INDEX "InsurancePlan_name_idx" ON "InsurancePlan"("name");
CREATE INDEX "InsurancePlan_isActive_idx" ON "InsurancePlan"("isActive");

-- Full-text search index (PostgreSQL)
CREATE INDEX "InsurancePlan_search_idx" ON "InsurancePlan"
  USING GIN (to_tsvector('english', "name" || ' ' || COALESCE("marketingName", '') || ' ' || "carrierName"));
```

---

## ETL Pipeline

### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Insurance Plan ETL Pipeline                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │   Download   │───►│    Parse     │───►│  Transform   │───►│   Load    │ │
│  │   Source     │    │    CSV       │    │  & Normalize │    │  Database │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│         │                   │                   │                   │       │
│         ▼                   ▼                   ▼                   ▼       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │  - CMS HIOS  │    │  - Encoding  │    │  - Carrier   │    │  - Upsert │ │
│  │  - Medicare  │    │  - Headers   │    │    Mapping   │    │  - Counts │ │
│  │  - Medicaid  │    │  - Types     │    │  - Dedup     │    │  - Verify │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Import Log & Monitoring                        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### ETL Implementation

Create `packages/backend/src/etl/insurancePlans.ts`:

```typescript
/**
 * Insurance Plan ETL Pipeline
 *
 * Imports insurance plan data from CMS and other sources.
 */

import { PrismaClient, PlanSource, MarketType, PlanType, MetalLevel } from '@prisma/client';
import { parse } from 'csv-parse';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { normalizeCarrierName, getCarrierMapping } from './carrierNormalization';

const prisma = new PrismaClient();

// =============================================================================
// Configuration
// =============================================================================

interface DataSourceConfig {
  name: string;
  url: string;
  source: PlanSource;
  parser: (filePath: string) => AsyncGenerator<RawPlanRecord>;
}

const DATA_SOURCES: DataSourceConfig[] = [
  {
    name: 'CMS HIOS Individual Market',
    url: 'https://data.healthcare.gov/api/views/xxx/rows.csv?accessType=DOWNLOAD',
    source: 'CMS_HIOS',
    parser: parseHIOSFile,
  },
  {
    name: 'CMS Medicare Advantage',
    url: 'https://data.cms.gov/...',
    source: 'CMS_MEDICARE',
    parser: parseMedicareFile,
  },
];

const DOWNLOAD_DIR = '/tmp/insurance-plan-import';
const BATCH_SIZE = 1000;

// =============================================================================
// Types
// =============================================================================

interface RawPlanRecord {
  externalId: string;
  name: string;
  marketingName?: string;
  carrierId: string;
  carrierName: string;
  planType?: string;
  metalLevel?: string;
  marketType: string;
  state?: string;
  effectiveDate?: string;
  expirationDate?: string;
  isDentalOnly?: boolean;
  year?: number;
}

interface ImportStats {
  totalRecords: number;
  newRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  errorRecords: number;
  errors: Array<{ record: string; error: string }>;
}

// =============================================================================
// Download Functions
// =============================================================================

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete partial file
      reject(err);
    });
  });
}

async function ensureDownloadDir(): Promise<void> {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }
}

// =============================================================================
// Parsers
// =============================================================================

async function* parseHIOSFile(filePath: string): AsyncGenerator<RawPlanRecord> {
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      encoding: 'utf-8',
    })
  );

  for await (const record of parser) {
    // Skip dental-only plans if desired
    if (record.DentalOnlyPlan === 'Yes') {
      continue;
    }

    yield {
      externalId: record.StandardComponentId,
      name: record.PlanMarketingName || record.PlanName,
      marketingName: record.PlanMarketingName,
      carrierId: record.IssuerId,
      carrierName: record.IssuerName,
      planType: mapPlanType(record.PlanType),
      metalLevel: mapMetalLevel(record.MetalLevel),
      marketType: record.MarketCoverage === 'SHOP' ? 'SMALL_GROUP' : 'INDIVIDUAL',
      state: record.StateCode,
      effectiveDate: record.PlanEffectiveDate,
      expirationDate: record.PlanExpirationDate,
      isDentalOnly: record.DentalOnlyPlan === 'Yes',
      year: parseInt(record.BusinessYear) || new Date().getFullYear(),
    };
  }
}

async function* parseMedicareFile(filePath: string): AsyncGenerator<RawPlanRecord> {
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
  );

  for await (const record of parser) {
    // Determine if MA or Part D
    const marketType = record.Plan_Type?.includes('PDP')
      ? 'MEDICARE_PART_D'
      : 'MEDICARE_ADVANTAGE';

    yield {
      externalId: `${record.Contract_ID}-${record.Plan_ID}`,
      name: record.Plan_Name,
      carrierId: record.Contract_ID,
      carrierName: record.Organization_Name,
      planType: mapMedicarePlanType(record.Plan_Type),
      metalLevel: 'NOT_APPLICABLE',
      marketType,
      state: record.State,
      year: new Date().getFullYear(),
    };
  }
}

// =============================================================================
// Mapping Functions
// =============================================================================

function mapPlanType(raw: string | undefined): PlanType | undefined {
  if (!raw) return undefined;

  const normalized = raw.toUpperCase().trim();
  const mapping: Record<string, PlanType> = {
    'HMO': 'HMO',
    'PPO': 'PPO',
    'EPO': 'EPO',
    'POS': 'POS',
    'HDHP': 'HDHP',
    'HIGH DEDUCTIBLE': 'HDHP',
  };

  return mapping[normalized] || 'UNKNOWN';
}

function mapMedicarePlanType(raw: string | undefined): PlanType | undefined {
  if (!raw) return undefined;

  const normalized = raw.toUpperCase().trim();
  if (normalized.includes('HMO')) return 'HMO';
  if (normalized.includes('PPO')) return 'PPO';
  if (normalized.includes('PFFS')) return 'PFFS';
  if (normalized.includes('SNP')) return 'SNP';
  if (normalized.includes('MSA')) return 'MSA';

  return 'UNKNOWN';
}

function mapMetalLevel(raw: string | undefined): MetalLevel | undefined {
  if (!raw) return undefined;

  const normalized = raw.toUpperCase().trim();
  const mapping: Record<string, MetalLevel> = {
    'CATASTROPHIC': 'CATASTROPHIC',
    'BRONZE': 'BRONZE',
    'SILVER': 'SILVER',
    'GOLD': 'GOLD',
    'PLATINUM': 'PLATINUM',
    'EXPANDED BRONZE': 'BRONZE',
  };

  return mapping[normalized] || 'NOT_APPLICABLE';
}

function mapMarketType(raw: string): MarketType {
  const normalized = raw.toUpperCase().trim();
  const mapping: Record<string, MarketType> = {
    'INDIVIDUAL': 'INDIVIDUAL',
    'SMALL_GROUP': 'SMALL_GROUP',
    'SHOP': 'SMALL_GROUP',
    'LARGE_GROUP': 'LARGE_GROUP',
    'MEDICARE_ADVANTAGE': 'MEDICARE_ADVANTAGE',
    'MEDICARE_PART_D': 'MEDICARE_PART_D',
    'MEDICAID': 'MEDICAID',
    'CHIP': 'CHIP',
  };

  return mapping[normalized] || 'OTHER';
}

// =============================================================================
// Import Functions
// =============================================================================

export async function importPlans(
  source: DataSourceConfig,
  options: { dryRun?: boolean } = {}
): Promise<ImportStats> {
  const { dryRun = false } = options;

  const stats: ImportStats = {
    totalRecords: 0,
    newRecords: 0,
    updatedRecords: 0,
    skippedRecords: 0,
    errorRecords: 0,
    errors: [],
  };

  // Create import log entry
  const importLog = await prisma.planImportLog.create({
    data: {
      source: source.source,
      status: 'RUNNING',
      totalRecords: 0,
      newRecords: 0,
      updatedRecords: 0,
      skippedRecords: 0,
      errorRecords: 0,
      startedAt: new Date(),
    },
  });

  try {
    // Download file
    await ensureDownloadDir();
    const filePath = path.join(DOWNLOAD_DIR, `${source.source}_${Date.now()}.csv`);

    logger.info({ source: source.name, url: source.url }, 'Downloading data file');
    await downloadFile(source.url, filePath);

    const fileStats = fs.statSync(filePath);
    logger.info({ size: fileStats.size }, 'Download complete');

    // Get carrier mappings
    const carrierMappings = await getCarrierMapping();

    // Process records in batches
    let batch: RawPlanRecord[] = [];

    for await (const record of source.parser(filePath)) {
      stats.totalRecords++;
      batch.push(record);

      if (batch.length >= BATCH_SIZE) {
        await processBatch(batch, source.source, carrierMappings, stats, dryRun);
        batch = [];

        // Update progress
        if (stats.totalRecords % 10000 === 0) {
          logger.info({ processed: stats.totalRecords }, 'Import progress');
        }
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      await processBatch(batch, source.source, carrierMappings, stats, dryRun);
    }

    // Cleanup downloaded file
    fs.unlinkSync(filePath);

    // Update import log
    await prisma.planImportLog.update({
      where: { id: importLog.id },
      data: {
        status: 'COMPLETED',
        totalRecords: stats.totalRecords,
        newRecords: stats.newRecords,
        updatedRecords: stats.updatedRecords,
        skippedRecords: stats.skippedRecords,
        errorRecords: stats.errorRecords,
        completedAt: new Date(),
        durationMs: Date.now() - importLog.startedAt.getTime(),
        errorDetails: stats.errors.length > 0 ? stats.errors.slice(0, 100) : null,
      },
    });

    logger.info({ stats }, 'Import completed');

  } catch (error) {
    logger.error({ error }, 'Import failed');

    await prisma.planImportLog.update({
      where: { id: importLog.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorDetails: { message: error instanceof Error ? error.message : 'Unknown error' },
      },
    });

    throw error;
  }

  return stats;
}

async function processBatch(
  batch: RawPlanRecord[],
  source: PlanSource,
  carrierMappings: Map<string, string>,
  stats: ImportStats,
  dryRun: boolean
): Promise<void> {
  for (const record of batch) {
    try {
      // Normalize carrier
      const normalizedCarrierId = carrierMappings.get(
        normalizeCarrierName(record.carrierName)
      ) || record.carrierId;

      // Ensure carrier exists
      if (!dryRun) {
        await prisma.insuranceCarrier.upsert({
          where: { id: normalizedCarrierId },
          update: {
            updatedAt: new Date(),
          },
          create: {
            id: normalizedCarrierId,
            legalName: record.carrierName,
            displayName: record.carrierName,
            states: record.state ? [record.state] : [],
            marketTypes: [record.marketType],
          },
        });
      }

      // Generate plan ID
      const planId = `${source}_${record.externalId}`;

      // Upsert plan
      if (!dryRun) {
        const existing = await prisma.insurancePlan.findUnique({
          where: { id: planId },
        });

        if (existing) {
          await prisma.insurancePlan.update({
            where: { id: planId },
            data: {
              name: record.name,
              marketingName: record.marketingName,
              carrierName: record.carrierName,
              planType: record.planType as PlanType,
              metalLevel: record.metalLevel as MetalLevel,
              state: record.state,
              effectiveDate: record.effectiveDate ? new Date(record.effectiveDate) : null,
              expirationDate: record.expirationDate ? new Date(record.expirationDate) : null,
              year: record.year,
              updatedAt: new Date(),
            },
          });
          stats.updatedRecords++;
        } else {
          await prisma.insurancePlan.create({
            data: {
              id: planId,
              externalId: record.externalId,
              source,
              name: record.name,
              marketingName: record.marketingName,
              carrierId: normalizedCarrierId,
              carrierName: record.carrierName,
              planType: record.planType as PlanType,
              metalLevel: record.metalLevel as MetalLevel,
              marketType: mapMarketType(record.marketType),
              state: record.state,
              isDentalOnly: record.isDentalOnly || false,
              effectiveDate: record.effectiveDate ? new Date(record.effectiveDate) : null,
              expirationDate: record.expirationDate ? new Date(record.expirationDate) : null,
              year: record.year,
            },
          });
          stats.newRecords++;
        }
      } else {
        stats.newRecords++; // Count as new in dry run
      }

    } catch (error) {
      stats.errorRecords++;
      stats.errors.push({
        record: record.externalId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// =============================================================================
// Full Import
// =============================================================================

export async function runFullImport(options: { dryRun?: boolean } = {}): Promise<void> {
  logger.info('Starting full insurance plan import');

  for (const source of DATA_SOURCES) {
    logger.info({ source: source.name }, 'Processing data source');
    try {
      await importPlans(source, options);
    } catch (error) {
      logger.error({ source: source.name, error }, 'Source import failed');
      // Continue with other sources
    }
  }

  // Mark old plans as inactive
  if (!options.dryRun) {
    const currentYear = new Date().getFullYear();
    await prisma.insurancePlan.updateMany({
      where: {
        year: { lt: currentYear - 1 },
        isActive: true,
      },
      data: { isActive: false },
    });
  }

  logger.info('Full import completed');
}

// =============================================================================
// Validation
// =============================================================================

export async function validateImport(): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check for plans without carriers
  const orphanPlans = await prisma.insurancePlan.count({
    where: {
      carrier: null,
    },
  });
  if (orphanPlans > 0) {
    issues.push(`${orphanPlans} plans without carrier reference`);
  }

  // Check for duplicate plans
  const duplicates = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*) as count FROM (
      SELECT name, "carrierId", state, "marketType"
      FROM "InsurancePlan"
      WHERE "isActive" = true
      GROUP BY name, "carrierId", state, "marketType"
      HAVING COUNT(*) > 1
    ) as dupes
  `;
  if (duplicates[0]?.count > 0) {
    issues.push(`${duplicates[0].count} potential duplicate plans`);
  }

  // Check for empty required fields
  const missingNames = await prisma.insurancePlan.count({
    where: { name: '' },
  });
  if (missingNames > 0) {
    issues.push(`${missingNames} plans with empty names`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
```

### Carrier Normalization Module

Create `packages/backend/src/etl/carrierNormalization.ts`:

```typescript
/**
 * Carrier Name Normalization
 *
 * Maps variant carrier names to canonical IDs.
 */

import prisma from '../lib/prisma';

// =============================================================================
// Known Carrier Variations
// =============================================================================

export const CARRIER_ALIASES: Record<string, string[]> = {
  // Blue Cross Blue Shield family
  'ANTHEM': [
    'Anthem',
    'Anthem Blue Cross',
    'Anthem Blue Cross Blue Shield',
    'Anthem BCBS',
    'Anthem Inc',
  ],
  'BCBS': [
    'Blue Cross Blue Shield',
    'Blue Cross and Blue Shield',
    'BCBS',
    'BlueCross BlueShield',
  ],
  'BCBS_CA': [
    'Blue Shield of California',
    'Blue Cross of California',
  ],
  'BCBS_NY': [
    'Empire BlueCross BlueShield',
    'Empire BCBS',
    'Excellus BlueCross BlueShield',
    'Excellus BCBS',
  ],

  // UnitedHealth Group
  'UNITED': [
    'United Healthcare',
    'UnitedHealthcare',
    'UHC',
    'UnitedHealth',
    'United Health Care',
    'Oxford Health Plans',
  ],

  // CVS/Aetna
  'AETNA': [
    'Aetna',
    'Aetna Health',
    'Aetna Life Insurance',
    'CVS Aetna',
    'Aetna Inc',
  ],

  // Cigna
  'CIGNA': [
    'Cigna',
    'Cigna Health',
    'Cigna HealthCare',
    'Evernorth', // Cigna subsidiary
  ],

  // Humana
  'HUMANA': [
    'Humana',
    'Humana Health',
    'Humana Insurance',
  ],

  // Kaiser
  'KAISER': [
    'Kaiser Permanente',
    'Kaiser Foundation',
    'Kaiser Health Plan',
  ],

  // Centene
  'CENTENE': [
    'Centene',
    'Ambetter',
    'WellCare',
    'Health Net', // Acquired by Centene
    'Fidelis Care',
  ],

  // Molina
  'MOLINA': [
    'Molina Healthcare',
    'Molina Health',
  ],
};

// =============================================================================
// Normalization Functions
// =============================================================================

/**
 * Normalize a carrier name for matching.
 */
export function normalizeCarrierName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Find canonical carrier ID for a name variant.
 */
export function findCanonicalCarrierId(name: string): string | null {
  const normalized = normalizeCarrierName(name);

  for (const [canonicalId, aliases] of Object.entries(CARRIER_ALIASES)) {
    for (const alias of aliases) {
      if (normalizeCarrierName(alias) === normalized) {
        return canonicalId;
      }
      // Partial match for longer names
      if (normalized.includes(normalizeCarrierName(alias))) {
        return canonicalId;
      }
    }
  }

  return null;
}

/**
 * Get carrier mapping from database.
 */
export async function getCarrierMapping(): Promise<Map<string, string>> {
  const aliases = await prisma.carrierAlias.findMany();

  const mapping = new Map<string, string>();
  for (const alias of aliases) {
    mapping.set(normalizeCarrierName(alias.alias), alias.carrierId);
  }

  // Add hardcoded aliases
  for (const [canonicalId, variants] of Object.entries(CARRIER_ALIASES)) {
    for (const variant of variants) {
      mapping.set(normalizeCarrierName(variant), canonicalId);
    }
  }

  return mapping;
}

/**
 * Initialize carrier aliases in database.
 */
export async function initializeCarrierAliases(): Promise<void> {
  for (const [canonicalId, aliases] of Object.entries(CARRIER_ALIASES)) {
    for (const alias of aliases) {
      await prisma.carrierAlias.upsert({
        where: { alias },
        update: {},
        create: {
          alias,
          carrierId: canonicalId,
          isAutoGenerated: false,
        },
      });
    }
  }
}

/**
 * Find potential carrier matches for a new name.
 */
export async function suggestCarrierMatch(name: string): Promise<{
  exactMatch: string | null;
  suggestions: Array<{ carrierId: string; similarity: number }>;
}> {
  const normalized = normalizeCarrierName(name);

  // Check for exact match
  const exactMatch = findCanonicalCarrierId(name);

  // Find similar carriers
  const carriers = await prisma.insuranceCarrier.findMany({
    select: { id: true, displayName: true, aliases: true },
  });

  const suggestions: Array<{ carrierId: string; similarity: number }> = [];

  for (const carrier of carriers) {
    const similarity = calculateSimilarity(normalized, normalizeCarrierName(carrier.displayName));
    if (similarity > 0.6) {
      suggestions.push({ carrierId: carrier.id, similarity });
    }
  }

  suggestions.sort((a, b) => b.similarity - a.similarity);

  return {
    exactMatch,
    suggestions: suggestions.slice(0, 5),
  };
}

/**
 * Simple string similarity (Jaccard index on words).
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' '));
  const wordsB = new Set(b.split(' '));

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}
```

---

## Import Script

Create `packages/backend/scripts/import-insurance-plans.sh`:

```bash
#!/bin/bash
#
# Insurance Plan Import Script
#
# Downloads and imports insurance plan data from CMS and other sources.
#
# Usage:
#   ./scripts/import-insurance-plans.sh [command]
#
# Commands:
#   check     - Check data source availability
#   download  - Download data files only
#   import    - Run full import
#   validate  - Validate imported data
#   stats     - Show import statistics
#   dry-run   - Preview import without changes
#
# Environment Variables:
#   DATABASE_URL  - PostgreSQL connection string
#   DOWNLOAD_DIR  - Directory for downloaded files (default: /tmp/plan-import)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOWNLOAD_DIR="${DOWNLOAD_DIR:-/tmp/plan-import}"

# Data source URLs
CMS_HIOS_URL="https://data.healthcare.gov/api/views/xxx/rows.csv"
CMS_MEDICARE_URL="https://data.cms.gov/..."

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_header() {
    echo ""
    echo "============================================================================="
    echo "$1"
    echo "============================================================================="
    echo ""
}

check_sources() {
    print_header "CHECKING DATA SOURCES"

    log_info "Checking CMS HIOS..."
    if curl -sI "$CMS_HIOS_URL" | grep -q "200 OK"; then
        echo -e "  CMS HIOS: ${GREEN}Available${NC}"
    else
        echo -e "  CMS HIOS: ${RED}Unavailable${NC}"
    fi

    log_info "Checking CMS Medicare..."
    if curl -sI "$CMS_MEDICARE_URL" | grep -q "200 OK"; then
        echo -e "  CMS Medicare: ${GREEN}Available${NC}"
    else
        echo -e "  CMS Medicare: ${RED}Unavailable${NC}"
    fi
}

download_files() {
    print_header "DOWNLOADING DATA FILES"

    mkdir -p "$DOWNLOAD_DIR"

    log_info "Downloading CMS HIOS data..."
    curl -L -o "$DOWNLOAD_DIR/hios_plans.csv" "$CMS_HIOS_URL"
    log_success "Downloaded: hios_plans.csv ($(du -h "$DOWNLOAD_DIR/hios_plans.csv" | cut -f1))"

    log_info "Downloading CMS Medicare data..."
    curl -L -o "$DOWNLOAD_DIR/medicare_plans.csv" "$CMS_MEDICARE_URL"
    log_success "Downloaded: medicare_plans.csv ($(du -h "$DOWNLOAD_DIR/medicare_plans.csv" | cut -f1))"
}

run_import() {
    print_header "RUNNING IMPORT"

    cd "$PROJECT_DIR"

    log_info "Running ETL pipeline..."
    npx ts-node -e "
      const { runFullImport } = require('./src/etl/insurancePlans');
      runFullImport().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
    "

    log_success "Import completed"
}

run_dry_run() {
    print_header "DRY RUN (NO CHANGES)"

    cd "$PROJECT_DIR"

    log_info "Running ETL pipeline in dry-run mode..."
    npx ts-node -e "
      const { runFullImport } = require('./src/etl/insurancePlans');
      runFullImport({ dryRun: true }).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
    "
}

validate_import() {
    print_header "VALIDATING IMPORT"

    cd "$PROJECT_DIR"

    npx ts-node -e "
      const { validateImport } = require('./src/etl/insurancePlans');
      validateImport().then(result => {
        console.log('Valid:', result.valid);
        if (result.issues.length > 0) {
          console.log('Issues:');
          result.issues.forEach(i => console.log('  -', i));
        }
        process.exit(result.valid ? 0 : 1);
      });
    "
}

show_stats() {
    print_header "IMPORT STATISTICS"

    cd "$PROJECT_DIR"

    npx ts-node -e "
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      async function showStats() {
        const totalPlans = await prisma.insurancePlan.count();
        const activePlans = await prisma.insurancePlan.count({ where: { isActive: true } });
        const totalCarriers = await prisma.insuranceCarrier.count();

        const byMarketType = await prisma.insurancePlan.groupBy({
          by: ['marketType'],
          _count: true,
          where: { isActive: true },
        });

        const bySource = await prisma.insurancePlan.groupBy({
          by: ['source'],
          _count: true,
        });

        const recentImports = await prisma.planImportLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        console.log('Total Plans:', totalPlans);
        console.log('Active Plans:', activePlans);
        console.log('Total Carriers:', totalCarriers);
        console.log('');
        console.log('By Market Type:');
        byMarketType.forEach(m => console.log('  ' + m.marketType + ':', m._count));
        console.log('');
        console.log('By Source:');
        bySource.forEach(s => console.log('  ' + s.source + ':', s._count));
        console.log('');
        console.log('Recent Imports:');
        recentImports.forEach(i => {
          console.log('  ' + i.source + ' (' + i.status + '):', i.totalRecords, 'records');
        });

        await prisma.\$disconnect();
      }

      showStats();
    "
}

show_help() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  check     Check data source availability"
    echo "  download  Download data files only"
    echo "  import    Run full import"
    echo "  validate  Validate imported data"
    echo "  stats     Show import statistics"
    echo "  dry-run   Preview import without changes"
    echo "  help      Show this help"
}

main() {
    local command="${1:-help}"

    case "$command" in
        check)
            check_sources
            ;;
        download)
            download_files
            ;;
        import)
            download_files
            run_import
            validate_import
            show_stats
            ;;
        validate)
            validate_import
            ;;
        stats)
            show_stats
            ;;
        dry-run)
            run_dry_run
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
```

---

## Admin Endpoints

Add to `packages/backend/src/routes/admin.ts`:

```typescript
// =============================================================================
// Insurance Plan Import Endpoints
// =============================================================================

/**
 * POST /api/v1/admin/insurance-plans/sync
 * Trigger manual import of insurance plans
 */
router.post(
  '/insurance-plans/sync',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { source, dryRun = false } = req.body;

    logger.info({ source, dryRun }, 'Admin triggered insurance plan sync');

    // Run import in background
    const importPromise = source
      ? importPlans(getDataSource(source), { dryRun })
      : runFullImport({ dryRun });

    // Don't await - return immediately
    importPromise.catch(err => {
      logger.error({ err }, 'Background import failed');
    });

    res.json({
      success: true,
      data: {
        message: 'Import started',
        dryRun,
      },
    });
  })
);

/**
 * GET /api/v1/admin/insurance-plans/stats
 * Get import statistics
 */
router.get(
  '/insurance-plans/stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const [
      totalPlans,
      activePlans,
      totalCarriers,
      byMarketType,
      bySource,
      recentImports,
    ] = await Promise.all([
      prisma.insurancePlan.count(),
      prisma.insurancePlan.count({ where: { isActive: true } }),
      prisma.insuranceCarrier.count(),
      prisma.insurancePlan.groupBy({
        by: ['marketType'],
        _count: true,
        where: { isActive: true },
      }),
      prisma.insurancePlan.groupBy({
        by: ['source'],
        _count: true,
      }),
      prisma.planImportLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalPlans,
        activePlans,
        totalCarriers,
        byMarketType: Object.fromEntries(
          byMarketType.map(m => [m.marketType, m._count])
        ),
        bySource: Object.fromEntries(
          bySource.map(s => [s.source, s._count])
        ),
        recentImports,
      },
    });
  })
);

/**
 * POST /api/v1/admin/insurance-plans/normalize
 * Run carrier name normalization
 */
router.post(
  '/insurance-plans/normalize',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    logger.info('Admin triggered carrier normalization');

    await initializeCarrierAliases();

    // Find plans with non-normalized carriers and update
    const unnormalizedPlans = await prisma.insurancePlan.findMany({
      where: {
        carrier: null,
      },
      take: 1000,
    });

    let updated = 0;
    for (const plan of unnormalizedPlans) {
      const match = await suggestCarrierMatch(plan.carrierName);
      if (match.exactMatch) {
        await prisma.insurancePlan.update({
          where: { id: plan.id },
          data: { carrierId: match.exactMatch },
        });
        updated++;
      }
    }

    res.json({
      success: true,
      data: {
        message: `Normalized ${updated} plans`,
        processed: unnormalizedPlans.length,
        updated,
      },
    });
  })
);
```

---

## API Endpoints

Add to `packages/backend/src/routes/plans.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { searchRateLimiter, defaultRateLimiter } from '../middleware/rateLimiter';
import prisma from '../lib/prisma';
import { buildPaginationMeta } from '../utils/responseHelpers';

const router = Router();

// =============================================================================
// Schemas
// =============================================================================

const planSearchSchema = z.object({
  q: z.string().min(1).max(100).optional(),
  state: z.string().length(2).toUpperCase().optional(),
  carrier: z.string().optional(),
  carrierId: z.string().optional(),
  type: z.enum(['HMO', 'PPO', 'EPO', 'POS', 'HDHP']).optional(),
  metalLevel: z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'CATASTROPHIC']).optional(),
  marketType: z.enum(['INDIVIDUAL', 'SMALL_GROUP', 'MEDICARE_ADVANTAGE', 'MEDICARE_PART_D', 'MEDICAID']).optional(),
  activeOnly: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

const carrierSearchSchema = z.object({
  q: z.string().min(1).max(100).optional(),
  state: z.string().length(2).toUpperCase().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// =============================================================================
// Plan Search (Autocomplete)
// =============================================================================

/**
 * GET /api/v1/plans/search
 * Search plans with autocomplete support
 */
router.get(
  '/search',
  searchRateLimiter,
  asyncHandler(async (req, res) => {
    const query = planSearchSchema.parse(req.query);
    const { q, state, carrier, carrierId, type, metalLevel, marketType, activeOnly, limit, page } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (activeOnly) {
      where.isActive = true;
    }

    if (state) {
      where.state = state;
    }

    if (carrierId) {
      where.carrierId = carrierId;
    } else if (carrier) {
      where.carrierName = { contains: carrier, mode: 'insensitive' };
    }

    if (type) {
      where.planType = type;
    }

    if (metalLevel) {
      where.metalLevel = metalLevel;
    }

    if (marketType) {
      where.marketType = marketType;
    }

    // Full-text search on name
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { marketingName: { contains: q, mode: 'insensitive' } },
        { carrierName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [plans, total] = await Promise.all([
      prisma.insurancePlan.findMany({
        where,
        take: limit,
        skip,
        orderBy: [
          { carrierName: 'asc' },
          { name: 'asc' },
        ],
        select: {
          id: true,
          name: true,
          marketingName: true,
          carrierId: true,
          carrierName: true,
          planType: true,
          metalLevel: true,
          marketType: true,
          state: true,
        },
      }),
      prisma.insurancePlan.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        plans,
        pagination: buildPaginationMeta(total, page, limit),
      },
    });
  })
);

/**
 * GET /api/v1/plans/:id
 * Get plan details
 */
router.get(
  '/:id',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const plan = await prisma.insurancePlan.findUnique({
      where: { id },
      include: {
        carrier: {
          select: {
            id: true,
            displayName: true,
            website: true,
            phone: true,
          },
        },
      },
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: { message: 'Plan not found' },
      });
    }

    res.json({
      success: true,
      data: { plan },
    });
  })
);

// =============================================================================
// Carriers
// =============================================================================

/**
 * GET /api/v1/plans/carriers
 * List carriers with plan counts
 */
router.get(
  '/carriers',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const query = carrierSearchSchema.parse(req.query);
    const { q, state, limit } = query;

    const where: any = { isActive: true };

    if (q) {
      where.OR = [
        { displayName: { contains: q, mode: 'insensitive' } },
        { aliases: { has: q } },
      ];
    }

    if (state) {
      where.states = { has: state };
    }

    const carriers = await prisma.insuranceCarrier.findMany({
      where,
      take: limit,
      orderBy: { displayName: 'asc' },
      include: {
        _count: {
          select: {
            plans: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: {
        carriers: carriers.map(c => ({
          id: c.id,
          name: c.displayName,
          website: c.website,
          planCount: c._count.plans,
        })),
      },
    });
  })
);

/**
 * GET /api/v1/plans/meta/types
 * Get available plan types
 */
router.get(
  '/meta/types',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const types = await prisma.insurancePlan.groupBy({
      by: ['planType'],
      where: { isActive: true, planType: { not: null } },
      _count: true,
    });

    res.json({
      success: true,
      data: {
        types: types.map(t => ({
          type: t.planType,
          count: t._count,
        })),
      },
    });
  })
);

/**
 * GET /api/v1/plans/meta/metal-levels
 * Get available metal levels
 */
router.get(
  '/meta/metal-levels',
  defaultRateLimiter,
  asyncHandler(async (req, res) => {
    const levels = await prisma.insurancePlan.groupBy({
      by: ['metalLevel'],
      where: { isActive: true, metalLevel: { not: null } },
      _count: true,
    });

    res.json({
      success: true,
      data: {
        metalLevels: levels.map(l => ({
          level: l.metalLevel,
          count: l._count,
        })),
      },
    });
  })
);

export default router;
```

---

## Carrier Name Normalization

### Common Carrier Variations

| Canonical Name | Variations |
|---------------|------------|
| Anthem | Anthem, Anthem BCBS, Anthem Blue Cross, Anthem Blue Cross Blue Shield |
| Blue Cross Blue Shield | BCBS, Blue Cross, Blue Shield, BlueCross BlueShield |
| UnitedHealthcare | United Healthcare, UHC, UnitedHealth, United Health Care, Oxford |
| Aetna | Aetna, Aetna Health, CVS Aetna, Aetna Inc |
| Cigna | Cigna, Cigna Health, Cigna HealthCare, Evernorth |
| Humana | Humana, Humana Health, Humana Insurance |
| Kaiser Permanente | Kaiser, Kaiser Health Plan, Kaiser Foundation |
| Centene | Centene, Ambetter, WellCare, Health Net, Fidelis |
| Molina | Molina, Molina Healthcare, Molina Health |

### Normalization Algorithm

```typescript
function normalizeCarrierName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')      // Remove punctuation
    .replace(/\s+/g, ' ')          // Normalize whitespace
    .replace(/\binc\b/g, '')       // Remove "Inc"
    .replace(/\bcorp\b/g, '')      // Remove "Corp"
    .replace(/\bllc\b/g, '')       // Remove "LLC"
    .replace(/\bof\b/g, '')        // Remove "of"
    .replace(/\bthe\b/g, '')       // Remove "the"
    .replace(/\band\b/g, '')       // Remove "and"
    .trim();
}
```

---

## Update Schedule

### Automated Updates

```yaml
# Cloud Scheduler configuration

# Annual full refresh (November 1st, before open enrollment)
annual_refresh:
  schedule: "0 6 1 11 *"  # 6 AM UTC on November 1st
  job: import-insurance-plans --full
  timeout: 4h

# Monthly delta check
monthly_check:
  schedule: "0 6 1 * *"   # 6 AM UTC on 1st of each month
  job: import-insurance-plans --check-updates
  timeout: 2h

# Weekly validation
weekly_validation:
  schedule: "0 8 * * 0"   # 8 AM UTC on Sundays
  job: import-insurance-plans --validate
  timeout: 30m
```

### Update Triggers

| Trigger | Action | Frequency |
|---------|--------|-----------|
| Open Enrollment | Full refresh | Annual (Nov) |
| CMS Update Published | Delta import | As needed |
| Medicare Update | Medicare refresh | Quarterly |
| New State Added | State-specific import | As needed |
| Manual Admin Action | Targeted refresh | On demand |

---

## Migration Strategy

### Phase 1: Import Data (Weeks 1-2)

**Goal**: Import comprehensive plan database without disrupting existing functionality

**Steps**:
1. Create new database tables (InsurancePlan, InsuranceCarrier)
2. Run initial import from CMS sources
3. Validate imported data
4. Keep existing Plan table unchanged

**User Impact**: None

### Phase 2: Match Existing Data (Weeks 3-4)

**Goal**: Link existing verifications to standardized plans

**Steps**:
1. Create matching algorithm for planId → InsurancePlan.id
2. Add `standardizedPlanId` column to PlanAcceptance
3. Run matching on historical data
4. Manual review of unmatched plans

**Matching Algorithm**:
```typescript
async function matchToStandardizedPlan(customPlanId: string): Promise<string | null> {
  // 1. Try exact ID match
  const exactMatch = await prisma.insurancePlan.findFirst({
    where: { id: customPlanId },
  });
  if (exactMatch) return exactMatch.id;

  // 2. Try name match
  const customPlan = await prisma.plan.findUnique({ where: { planId: customPlanId } });
  if (customPlan) {
    const nameMatch = await prisma.insurancePlan.findFirst({
      where: {
        name: { contains: customPlan.planName, mode: 'insensitive' },
      },
    });
    if (nameMatch) return nameMatch.id;
  }

  // 3. Return null for manual review
  return null;
}
```

### Phase 3: Enable Autocomplete (Weeks 5-6)

**Goal**: Users see standardized plans in autocomplete

**Steps**:
1. Update frontend plan search to use new API
2. Show standardized plans first, custom as fallback
3. Allow custom plan entry if no match found
4. Track usage of standardized vs custom

**User Impact**: Improved autocomplete experience

### Phase 4: Require Standardized Plans (Future)

**Goal**: All new verifications use standardized plans

**Steps**:
1. Require selection from standardized plan list
2. Add "Request New Plan" flow for missing plans
3. Admin review queue for plan requests
4. Deprecate free-form entry

**User Impact**: More structured entry, but plans may be missing

### Data Model Transition

```
Current:
  PlanAcceptance.planId → Plan.planId (free-form text)

Phase 2:
  PlanAcceptance.planId → Plan.planId (legacy)
  PlanAcceptance.standardizedPlanId → InsurancePlan.id (new)

Phase 4:
  PlanAcceptance.planId → InsurancePlan.id (required)
  (Legacy planId column deprecated)
```

---

## Implementation Checklist

### Database

- [ ] Create InsuranceCarrier model
- [ ] Create InsurancePlan model
- [ ] Create PlanImportLog model
- [ ] Create CarrierAlias model
- [ ] Run migrations
- [ ] Create indexes

### ETL Pipeline

- [ ] Implement download functions
- [ ] Implement CMS HIOS parser
- [ ] Implement CMS Medicare parser
- [ ] Implement carrier normalization
- [ ] Implement batch upsert
- [ ] Add import logging
- [ ] Add validation

### Import Script

- [ ] Create import shell script
- [ ] Add download commands
- [ ] Add validation commands
- [ ] Add statistics output
- [ ] Test with sample data

### Admin Endpoints

- [ ] POST /admin/insurance-plans/sync
- [ ] GET /admin/insurance-plans/stats
- [ ] POST /admin/insurance-plans/normalize
- [ ] Add to admin routes

### API Endpoints

- [ ] GET /plans/search (autocomplete)
- [ ] GET /plans/:id
- [ ] GET /plans/carriers
- [ ] GET /plans/meta/types
- [ ] GET /plans/meta/metal-levels
- [ ] Add rate limiting
- [ ] Add caching

### Automation

- [ ] Create Cloud Scheduler job
- [ ] Set up annual refresh
- [ ] Set up monthly check
- [ ] Add monitoring alerts

### Frontend

- [ ] Update plan search component
- [ ] Add autocomplete dropdown
- [ ] Show carrier with plan
- [ ] Handle custom plan fallback

### Testing

- [ ] Unit tests for parsers
- [ ] Unit tests for normalization
- [ ] Integration tests for import
- [ ] API endpoint tests
- [ ] Load testing for search

---

## Appendix: Sample Data

### CMS HIOS Sample Row

```csv
StandardComponentId,PlanMarketingName,PlanType,MetalLevel,IssuerId,IssuerName,StateCode,MarketCoverage
12345NY0010001,Empire BlueCross Gold PPO,PPO,Gold,12345,Empire BlueCross BlueShield,NY,Individual
```

### CMS Medicare Sample Row

```csv
Contract_ID,Plan_ID,Plan_Name,Plan_Type,Organization_Name,State
H1234,001,Aetna Medicare Advantage HMO,Local HMO,Aetna Health Inc,NY
```

### API Response Example

```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "CMS_HIOS_12345NY0010001",
        "name": "Empire BlueCross Gold PPO",
        "marketingName": "Empire BlueCross Gold PPO",
        "carrierId": "BCBS_NY",
        "carrierName": "Empire BlueCross BlueShield",
        "planType": "PPO",
        "metalLevel": "GOLD",
        "marketType": "INDIVIDUAL",
        "state": "NY"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```
