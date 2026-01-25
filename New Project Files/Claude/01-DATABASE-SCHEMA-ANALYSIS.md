# VerifyMyProvider Database Schema Security Audit

**Last Updated:** January 25, 2026
**Priority:** Critical
**ORM:** Prisma with PostgreSQL
**Database:** Cloud SQL (verifymyprovider-db, us-central1)

---

## Executive Summary

The VerifyMyProvider database uses PostgreSQL with Prisma ORM and contains healthcare provider information from public NPI registry sources. The schema demonstrates thoughtful design with several security and data quality considerations. **No PHI is stored** - only public NPI registry data.

---

## Tables Overview

### 1. Location Model
**Purpose:** Groups providers by shared physical addresses

| Field | Type | Notes |
|-------|------|-------|
| id | INT (PK) | Auto-increment |
| addressLine1 | VARCHAR(200) | Required |
| addressLine2 | VARCHAR(200) | Optional |
| city | VARCHAR(100) | Required |
| state | VARCHAR(2) | Required |
| zipCode | VARCHAR(10) | Required |
| name | VARCHAR(200) | Optional (e.g., "Mayo Clinic") |
| healthSystem | VARCHAR(100) | Optional parent organization |
| facilityType | VARCHAR(100) | Optional (Hospital, Clinic, etc.) |
| providerCount | INT | Denormalized count (default 0) |
| createdAt | TIMESTAMP | Record creation |
| updatedAt | TIMESTAMP | Last modification |

**Unique Constraint:** `(addressLine1, city, state, zipCode)`

---

### 2. Provider Model
**Purpose:** Core table storing NPI registry data (~2.1M records)

| Field | Type | Notes |
|-------|------|-------|
| npi | VARCHAR(10) | **Primary Key** |
| id | INT | Secondary unique ID |
| entityType | VARCHAR(20) | "INDIVIDUAL" or "ORGANIZATION" |
| firstName | VARCHAR(100) | For individuals |
| lastName | VARCHAR(100) | For individuals |
| credential | VARCHAR(50) | MD, DO, PA, NP, etc. |
| organizationName | VARCHAR(200) | For organizations |
| specialty | VARCHAR(200) | Full specialty name |
| specialtyCode | VARCHAR(20) | Taxonomy code |
| addressLine1 | VARCHAR(200) | Practice address |
| city, state, zipCode | VARCHAR | Location fields |
| phone, fax | VARCHAR(20) | Contact info |
| locationId | INT (FK) | Reference to Location |
| enumerationDate | DATE | NPI registration date |
| lastUpdated | DATE | NPI last update |
| createdAt | TIMESTAMP | Record creation |

---

### 3. InsurancePlan Model
**Purpose:** Insurance plans from CMS and user uploads

| Field | Type | Notes |
|-------|------|-------|
| planId | VARCHAR(50) | **Primary Key** |
| planName | VARCHAR(200) | Plan name |
| issuerName | VARCHAR(200) | Insurance company |
| planType | VARCHAR(20) | Plan type |
| state | VARCHAR(2) | State offered |
| createdAt | TIMESTAMP | Record creation |

---

### 4. ProviderPlanAcceptance Model
**Purpose:** Junction table linking providers to plans with confidence scoring

| Field | Type | Notes |
|-------|------|-------|
| id | INT (PK) | Auto-increment |
| providerNpi | VARCHAR(10) FK | SetNull on delete |
| planId | VARCHAR(50) FK | SetNull on delete |
| acceptanceStatus | VARCHAR(20) | ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN |
| confidenceScore | INT | 0-100 scale |
| lastVerified | TIMESTAMP | Last verification |
| verificationCount | INT | Number of verifications |
| expiresAt | TIMESTAMP | TTL (6 months) |
| createdAt | TIMESTAMP | Record creation |
| updatedAt | TIMESTAMP | Last modification |

**Unique Constraint:** `(providerNpi, planId)`

---

### 5. VerificationLog Model
**Purpose:** Audit trail for all verification activities

| Field | Type | Notes |
|-------|------|-------|
| id | CUID | **Primary Key** |
| providerNpi | VARCHAR(10) FK | SetNull on delete |
| planId | VARCHAR(50) FK | SetNull on delete |
| verificationType | ENUM | PLAN_ACCEPTANCE, PROVIDER_INFO, etc. |
| verificationSource | ENUM | CMS_DATA, CROWDSOURCE, etc. |
| previousValue | JSON | Value before change |
| newValue | JSON | New value |
| sourceIp | VARCHAR(50) | For Sybil prevention |
| userAgent | VARCHAR(500) | Browser info |
| submittedBy | VARCHAR(200) | Email or anonymous ID |
| upvotes | INT | Community engagement |
| downvotes | INT | Community engagement |
| isApproved | BOOLEAN | Moderation status |
| notes | TEXT | User notes |
| evidenceUrl | VARCHAR(500) | Evidence link |
| expiresAt | TIMESTAMP | TTL (6 months) |
| createdAt | TIMESTAMP | Creation time |

---

### 6. VoteLog Model
**Purpose:** Vote deduplication for Sybil attack prevention

| Field | Type | Notes |
|-------|------|-------|
| id | CUID | **Primary Key** |
| verificationId | STRING FK | Cascade on delete |
| sourceIp | VARCHAR(50) | One vote per IP |
| vote | VARCHAR(10) | 'up' or 'down' |
| createdAt | TIMESTAMP | Vote time |

**Unique Constraint:** `(verificationId, sourceIp)`

---

### 7. SyncLog Model
**Purpose:** Tracking data imports

| Field | Type | Notes |
|-------|------|-------|
| id | INT (PK) | Auto-increment |
| syncType | VARCHAR(50) | NPI_FULL, PLAN_IMPORT, etc. |
| state | VARCHAR(2) | State being processed |
| recordsProcessed | INT | Count |
| status | VARCHAR(20) | PENDING, IN_PROGRESS, COMPLETED, FAILED |
| errorMessage | TEXT | Error details |
| startedAt | TIMESTAMP | Start time |
| completedAt | TIMESTAMP | End time |

---

## Index Strategy

### Provider Indexes (Comprehensive)
```
- PRIMARY: npi
- UNIQUE: id
- INDEX: state
- INDEX: specialtyCode
- INDEX: lastName
- INDEX: firstName
- INDEX: city
- INDEX: organizationName
- INDEX: (state, specialtyCode) - Combined search
- INDEX: locationId
```

### ProviderPlanAcceptance Indexes
```
- UNIQUE: (providerNpi, planId)
- INDEX: acceptanceStatus
- INDEX: confidenceScore
- INDEX: lastVerified
- INDEX: expiresAt - TTL cleanup
```

### VerificationLog Indexes (Sybil Prevention)
```
- INDEX: providerNpi
- INDEX: planId
- INDEX: createdAt
- INDEX: isApproved
- INDEX: expiresAt
- INDEX: (providerNpi, createdAt)
- INDEX: (providerNpi, planId, sourceIp, createdAt) - Rate limiting
- INDEX: (providerNpi, planId, submittedBy, createdAt) - Account-based attack detection
```

### Location Indexes
```
- UNIQUE: (addressLine1, city, state, zipCode)
- INDEX: state
- INDEX: (city, state)
- INDEX: zipCode
```

---

## Security Analysis

### Strengths
- Clean separation of concerns (Location, Provider, Plan, Acceptance, Verification)
- Comprehensive indexing for common queries
- Sybil attack prevention with IP tracking and vote deduplication
- Audit trail preservation via SetNull foreign keys
- TTL implementation (6-month expiration)
- Confidence scoring system for data credibility
- **No PHI stored** - public data only

### Concerns

#### Moderate
1. **Missing NOT NULL constraints on FK columns** - Allows orphaned records
2. **Denormalized providerCount** - Risk of inconsistency without triggers
3. **No audit of WHO made changes** - Only timestamps tracked
4. **Enum values as VARCHAR** - No database-level validation
5. **submittedBy anonymization** - Unclear how "anonymous ID" is generated

#### Minor
1. Missing geographic coordinates for spatial queries
2. No address format standardization
3. SyncLog has minimal tracking (no file hashing)

---

## Foreign Key Relationships

| From | Column | To | On Delete |
|------|--------|-----|-----------|
| Provider | locationId | Location | (implicit) |
| ProviderPlanAcceptance | providerNpi | Provider | SetNull |
| ProviderPlanAcceptance | planId | InsurancePlan | SetNull |
| VerificationLog | providerNpi | Provider | SetNull |
| VerificationLog | planId | InsurancePlan | SetNull |
| VoteLog | verificationId | VerificationLog | Cascade |

**Note:** SetNull preserves audit trail when records are deleted.

---

## Recommendations

### High Priority
1. Add constraint ensuring ProviderPlanAcceptance has at least one FK non-null
2. Implement trigger to maintain providerCount accuracy
3. Document submittedBy anonymization algorithm

### Medium Priority
1. Consider native PostgreSQL ENUMs
2. Add geographic coordinates to Location
3. Enhance SyncLog with file integrity tracking

### Low Priority
1. Add schema comments documenting compliance stance
2. Standardize address format documentation

---

## Data Quality Fields

### Confidence Scoring
- `confidenceScore` (0-100) on ProviderPlanAcceptance
- Indexed for quality-based filtering

### Verification Tracking
- `verificationCount` - Number of independent verifications
- `lastVerified` - Most recent verification date
- `expiresAt` - 6-month TTL based on 12% annual provider turnover

### Community Engagement
- `upvotes/downvotes` on VerificationLog
- `isApproved` for moderation status

---

*Analysis based on prisma/schema.prisma and migration files*
