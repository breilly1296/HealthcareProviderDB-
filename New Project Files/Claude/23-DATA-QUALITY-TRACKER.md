# Data Quality Tracker

## Overview

This document tracks all known data quality dimensions, issues, mitigation scripts, and integrity mechanisms in the VerifyMyProvider (HealthcareProviderDB) project. The system ingests provider data from CMS/NPPES, enriches it with insurance plan acceptance and community verification data, and serves it through an API. Data quality directly impacts search accuracy, confidence scoring, and user trust.

---

## 1. Data Quality Dimensions

### 1.1 NPI Provider Data

| Issue | Severity | Status | Impact | Mitigation |
|-------|----------|--------|--------|------------|
| City name typos ("Birmingam", "NEWYORK") | WARNING | Active cleanup script exists | Bad city dropdown values, missed search results | `scripts/normalize-city-names.ts` |
| Trailing state codes ("Birmingham,al") | WARNING | Handled in cleanup script | Duplicate cities in dropdown | `scripts/normalize-city-names.ts` (CLEANUP_PATTERNS) |
| Trailing punctuation ("Birmingham,") | WARNING | Handled in cleanup script | Duplicate cities in dropdown | `scripts/normalize-city-names.ts` (CLEANUP_PATTERNS) |
| Neighborhood names as city ("Flushing", "Harlem") | WARNING | Comprehensive mapping tables | Fragmented search results in NYC | `scripts/normalize-city-names.ts` (NYC_CITY_MAPPINGS, ~400+ mappings) |
| Deactivated providers (~0.2% of NPI file) | CRITICAL | Skipped at import time; cleanup script for legacy data | Stale providers appearing in search results | `scripts/import-npi-direct.ts` (line 271), `scripts/cleanup-deactivated-providers.ts` |
| Stale addresses (self-reported, rarely updated) | INFO | Inherent to NPI data; NPPES enrichment refreshes periodically | Inaccurate location display | `scripts/enrich-providers-nppes.ts` (90-day stale threshold) |
| 6 states imported as test data (FL, AL, AK, AR, AZ, CA) | INFO | Pipeline testing data; NYC is launch target | Non-launch data occupies database space | Import script can be re-run with filtered state list |
| NYC launch dataset (5 boroughs, ~50-75K providers) | INFO | Q2 2026 launch target; primary focus | Core dataset for production | `scripts/import-npi-direct.ts` |
| Unmapped taxonomy codes | WARNING | Catch-all "OTHER" category; specialty backfill scripts exist | Incorrect specialty display; poor search filtering | `scripts/backfill-specialty-fast.cjs`, `scripts/update-specialties.ts` |
| Missing specialty_category or primary_specialty | WARNING | Backfill scripts address NULL/empty/"Specialist" values | Providers invisible to specialty search | `scripts/update-specialties.ts` |
| Missing primary_taxonomy_code | WARNING | Backfilled from `provider_taxonomies` table | Cascade failure: no taxonomy -> no specialty -> no category | `scripts/update-specialties.ts` (line 184) |
| Duplicate practice locations | INFO | Address hash deduplication exists | Inflated location counts; UI clutter | `scripts/deduplicate-locations.ts` |
| NPI not found in NPPES registry | CRITICAL | Detected by audit script; logged to `data_quality_audit` | Potentially invalid provider records | `scripts/audit-npi-validation.ts` |
| Name mismatch vs. NPPES | WARNING | Detected by audit script; requires manual review | Provider may have changed name or data entry error | `scripts/audit-npi-validation.ts` |
| Credential mismatch vs. NPPES | WARNING | Detected by audit script; auto-fixable | Outdated credential display | `scripts/audit-npi-validation.ts` |
| Specialty/taxonomy mismatch vs. NPPES | WARNING | Detected by audit script; auto-fixable | Wrong specialty displayed | `scripts/audit-npi-validation.ts` |
| Address mismatch vs. NPPES | INFO | Detected by audit script; informational only | Addresses change frequently in NPPES too | `scripts/audit-npi-validation.ts` |

### 1.2 Insurance Plan Data

| Issue | Severity | Status | Impact | Mitigation |
|-------|----------|--------|--------|------------|
| Plan name normalization | WARNING | Parser exists with ~50 carrier aliases | Inconsistent plan names ("BCBS" vs "Blue Cross Blue Shield") | `packages/backend/src/utils/insurancePlanParser.ts` |
| Carrier identification accuracy | WARNING | Longest-match alias lookup + variant extraction | Wrong carrier grouping from raw scraped names | `insurancePlanParser.ts` (`extractCarrier()` with `CARRIER_ALIASES`) |
| Plan variant extraction | INFO | Regex-based pattern matching (PPO/HMO/EPO/etc.) | Missing plan type information | `insurancePlanParser.ts` (`VARIANT_PATTERNS`, 20+ patterns) |
| Plan ID collision | INFO | Slug-based generation capped at 50 chars | Potential duplicate plan records | `insurancePlanParser.ts` (`generatePlanId()`) |
| Plan-provider link completeness | WARNING | Cross-reference script matches network IDs to plans | Missing acceptance records | `scripts/crossref-insurance-networks.ts` |
| Ambiguous network-to-carrier matches | INFO | Skipped when match score < 0.8; threshold at 0.7 minimum | Potentially unmapped provider-plan relationships | `scripts/crossref-insurance-networks.ts` (line 116-123) |
| provider_insurance network_name quality | WARNING | Raw data from NPI "other identifiers" field | Inconsistent naming; requires fuzzy matching to resolve | `crossref-insurance-networks.ts` (`nameMatchScore()`) |

### 1.3 Verification Data

| Issue | Severity | Status | Impact | Mitigation |
|-------|----------|--------|--------|------------|
| Verification TTL (6-month expiration) | Implemented | `expiresAt` field on `VerificationLog` and `ProviderPlanAcceptance` | Stale verifications decay automatically | `VERIFICATION_TTL_MS = 6 * 30 * MS_PER_DAY` in `constants.ts` |
| Legacy records without TTL | INFO | Backfill script exists | Old verifications never expire | `scripts/backfill-verification-ttl.ts` |
| Low verification volume (cold start) | WARNING | System in pre-launch phase | Low confidence scores across the board | Confidence algorithm accounts for this (0 verifications = 0 verification score) |
| Sybil attack prevention | Implemented | 4 layers of protection | Data poisoning resistance | See Section 3 below |
| Confidence score staleness | WARNING | Proactive recalculation script exists | Search results show outdated confidence | `scripts/recalculate-confidence.ts` |
| Expired verification cleanup | Implemented | `cleanupExpiredVerifications()` function in service | Storage waste; stale data in queries | `verificationService.ts` (line 767) |
| Vote manipulation | Implemented | One vote per IP per verification; vote change tracked | Inflated/deflated agreement scores | `verificationService.ts` (`voteOnVerification()`, line 421) |

---

## 2. Schema Constraints and Data Integrity

The Prisma schema at `packages/backend/prisma/schema.prisma` enforces the following data integrity measures:

### 2.1 Primary Keys and Uniqueness

| Model | Primary Key | Uniqueness Constraints |
|-------|-------------|----------------------|
| `Provider` | `npi` (VarChar(10)) | NPI is naturally unique |
| `InsurancePlan` | `planId` (VarChar(50)) | Plan ID is unique |
| `ProviderPlanAcceptance` | Auto-increment `id` | Partial unique indexes via raw SQL: `(npi, plan_id, location_id)` WHERE location_id IS NOT NULL; `(npi, plan_id)` WHERE location_id IS NULL |
| `VerificationLog` | CUID string | No natural unique constraint (multiple verifications allowed per pair) |
| `VoteLog` | CUID string | `@@unique([verificationId, sourceIp])` -- prevents duplicate votes |
| `DataQualityAudit` | Auto-increment `id` | No unique constraint (multiple audit entries per NPI possible) |

### 2.2 Referential Integrity

All foreign key relationships use `onDelete: NoAction, onUpdate: NoAction` (except `VoteLog` which cascades delete from `VerificationLog`). This means:

- Deleting a provider requires first deleting all related records (verification logs, plan acceptances, locations, etc.)
- The `cleanup-deactivated-providers.ts` script handles this cascade manually: verification_logs -> provider_plan_acceptance -> providers

### 2.3 DataQualityAudit Table

A dedicated audit table (`data_quality_audit`) tracks discrepancies found by the NPI validation audit script:

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
  resolvedAt     DateTime? @map("resolved_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  provider       Provider  @relation(fields: [npi], references: [npi])
}
```

Audit types include: `DEACTIVATED_NPI`, `NPI_NOT_FOUND`, `NAME_MISMATCH`, `CREDENTIAL_MISMATCH`, `SPECIALTY_MISMATCH`, `ADDRESS_MISMATCH`.

Severity levels: `CRITICAL`, `WARNING`, `INFO`.

Indexed on: `npi`, `severity`, `audit_type`, `resolved`.

### 2.4 SyncLog Table

The `SyncLog` model tracks import and enrichment operations:

```prisma
model SyncLog {
  id                Int       @id @default(autoincrement())
  syncType          String?   @map("sync_type") @db.VarChar(50)
  state             String?   @db.VarChar(2)
  recordsProcessed  Int?      @default(0)
  status            String?   @db.VarChar(20)
  errorMessage      String?   @map("error_message")
  startedAt         DateTime? @default(now())
  completedAt       DateTime?
}
```

The import script (`import-npi-direct.ts`) creates detailed sync log entries including file hash, file size, filter criteria, and per-record counts (total, processed, inserted, skipped, errors).

---

## 3. Sybil Attack Prevention (Verification Data Integrity)

The verification system implements 4 layers of protection against data poisoning, defined in `packages/backend/src/services/verificationService.ts` and `packages/backend/src/config/constants.ts`:

### Layer 1: IP-Based Duplicate Detection
```typescript
// verificationService.ts, checkSybilAttack() - line 72
// Prevents same IP from submitting duplicate verification within 30 days
const cutoffDate = new Date(Date.now() - SYBIL_PREVENTION_WINDOW_MS);
// SYBIL_PREVENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 (30 days)
```

Database indexes support this check:
- `idx_vl_sybil_ip`: composite index on `(providerNpi, planId, sourceIp, createdAt)`

### Layer 2: Email-Based Duplicate Detection
```typescript
// verificationService.ts, checkSybilAttack() - line 99
// Prevents same email from submitting duplicate verification within 30 days
```

Database indexes support this check:
- `idx_vl_sybil_email`: composite index on `(providerNpi, planId, submittedBy, createdAt)`

### Layer 3: Consensus-Based Status Changes
```typescript
// verificationService.ts, determineAcceptanceStatus() - line 163
// Requires:
//   - MIN_VERIFICATIONS_FOR_CONSENSUS = 3 verifications
//   - MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60 confidence score
//   - Clear 2:1 majority ratio (acceptedCount > notAcceptedCount * 2, or vice versa)
```

This prevents a single malicious actor from flipping a provider's acceptance status.

### Layer 4: Vote Deduplication
```typescript
// verificationService.ts, voteOnVerification() - line 421
// @@unique([verificationId, sourceIp]) on VoteLog table
// One vote per IP per verification; vote direction changes are tracked
```

### Layer 5 (Infrastructure): reCAPTCHA v3
```typescript
// constants.ts - line 52
// CAPTCHA_MIN_SCORE = 0.5 (scores 0.0 = bot, 1.0 = human)
// Fallback rate limiting: 3 requests per hour per IP when CAPTCHA API is down
```

---

## 4. Quality Scripts Inventory

### 4.1 Data Cleanup Scripts

| Script | Purpose | Dry Run | Apply Flag | Key Details |
|--------|---------|---------|------------|-------------|
| `scripts/normalize-city-names.ts` | Fix city name typos, trailing state codes, neighborhood-to-borough mapping | Default mode | `--apply` | Supports 6 metro areas (NYC, LA, Chicago, Houston, Phoenix, Philadelphia); ~1,000+ city mappings; transaction-safe; state-filterable via `--state` |
| `scripts/cleanup-deactivated-providers.ts` | Remove deactivated NPI providers and cascading records | Default mode | `--apply` | Auto-detects deactivation column; cascading delete: verification_logs -> provider_plan_acceptance -> providers; prints recommendation for import-time filtering |
| `scripts/deduplicate-locations.ts` | Compute SHA256 address hashes for deduplication | Default mode (report) | `--apply` | Hash = `SHA256(LOWER(address_line1) | city | state | zip5)`; populates `address_hash` column on `practice_locations`; reports duplication ratio and top duplicated addresses |
| `scripts/backfill-verification-ttl.ts` | Backfill `expires_at` for legacy verification records | Default mode | `--apply` | TTL = 6 months from `last_verified` (or `created_at` if null); transaction-safe; reports expiry breakdown |

### 4.2 Data Enrichment Scripts

| Script | Purpose | Dry Run | Apply Flag | Key Details |
|--------|---------|---------|------------|-------------|
| `scripts/enrich-providers-nppes.ts` | Refresh provider data from official NPPES API | Default (10 NPIs) | `--apply` | 90-day stale threshold; updates credentials, taxonomy, specialty; adds new practice locations; detects newly deactivated providers; rate-limited (1 req/sec) |
| `scripts/crossref-insurance-networks.ts` | Match `provider_insurance.network_name` to `insurance_plans` | Default mode | `--apply` | Token-based fuzzy matching (0.7 threshold, 0.8 for confidence); creates `ProviderPlanAcceptance` records with `PENDING` status and score 50 |
| `scripts/backfill-specialty-fast.cjs` | Backfill `specialty_category` from taxonomy code prefixes | N/A (applies directly) | N/A | 60+ prefix-to-category rules sorted by specificity; remaining providers assigned "OTHER" |
| `scripts/update-specialties.ts` | Fix NULL/"Specialist" specialty values using taxonomy lookups | `--dry-run` | `--apply` | Priority: `provider_taxonomies` (primary) > `primary_taxonomy_code` > legacy columns; also backfills `primary_taxonomy_code` from `provider_taxonomies` |
| `scripts/recalculate-confidence.ts` | Proactively recalculate confidence scores for time-based decay | `--dry-run` | `--apply` | Aggregates non-expired upvotes/downvotes; uses specialty-aware freshness thresholds; cursor-based pagination |

### 4.3 Data Validation Scripts

| Script | Purpose | Key Details |
|--------|---------|-------------|
| `scripts/audit-npi-validation.ts` | Cross-validate local data against NPPES registry API | Detects: deactivated NPIs (CRITICAL), NPIs not found (CRITICAL), name mismatches (WARNING), credential mismatches (WARNING), specialty mismatches (WARNING), address mismatches (INFO); writes to `data_quality_audit` table; supports `--resume` from last synced; rate-limited |
| `scripts/generate-dq-report.ts` | Generate summary report from `data_quality_audit` table | Reports by severity, by audit type; lists deactivated NPIs, NPIs not found, name mismatches; actionability summary (auto-fixable vs manual review vs informational); NPPES sync coverage stats |
| `scripts/verify-data-quality.ts` | Quick quality check on imported data (NY state focus) | Samples individual name parsing, org name parsing, date conversion; reports field population percentages |
| `scripts/check-import-status.ts` | Verify import completeness | Reports NY record count and total record count |

---

## 5. Confidence Scoring and Data Quality Impact

The confidence scoring system in `packages/backend/src/services/confidenceService.ts` is directly affected by data quality. The score is composed of four factors:

### 5.1 Score Breakdown (0-100)

| Factor | Max Points | Source | Data Quality Impact |
|--------|-----------|--------|-------------------|
| Data Source Score | 25 | `VerificationSource` enum | CMS_DATA/NPPES_SYNC = 25pts (highest); CROWDSOURCE = 15pts; AUTOMATED = 10pts |
| Recency Score | 30 | `lastVerifiedAt` timestamp | Tiered decay based on specialty-specific thresholds; stale data = 0 points |
| Verification Score | 25 | `verificationCount` | 0 = 0pts, 1 = 10pts, 2 = 15pts, 3+ = 25pts (research-based: Mortensen et al. 2015) |
| Agreement Score | 20 | `upvotes` / `downvotes` | 100% agreement = 20pts; < 40% = 0pts (conflicting data marked unreliable) |

### 5.2 Specialty-Specific Freshness Thresholds

Based on Ndumele et al. (2018) research on provider network churn:

| Specialty Category | Freshness Threshold | Rationale |
|-------------------|--------------------|-----------|
| Mental Health | 30 days | 43% Medicaid acceptance; highest churn |
| Primary Care | 60 days | 12% annual turnover |
| Specialist | 60 days | Similar to primary care |
| Hospital-Based | 90 days | More stable positions |
| Other | 60 days | Default |

### 5.3 Confidence Level Assignment

```
Level          Score Range    Additional Constraint
VERY_HIGH      91-100         Requires 3+ verifications
HIGH           76-90          Requires 3+ verifications
MEDIUM         51-75          Maximum level with < 3 verifications
LOW            26-50
VERY_LOW       0-25
```

Research constraint: Providers with fewer than 3 verifications are capped at MEDIUM confidence, regardless of score, based on Mortensen et al. (2015) showing that 3 verifications achieve expert-level accuracy (kappa = 0.58).

---

## 6. Search Data Quality Impact

The provider search service at `packages/backend/src/services/providerService.ts` is affected by data quality in several ways:

### 6.1 City Name Quality -> Search Results

The `getCitiesByState()` function (line 310) queries `practice_locations` for distinct cities and applies title-case normalization at query time:

```typescript
const cities = result
  .map((r) => r.city)
  .filter((city): city is string => city !== null && city.length > 0)
  .map((city) => {
    return city.toLowerCase().split(' ').map((word) =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  });
return [...new Set(cities)].sort();
```

Without running `normalize-city-names.ts`, this produces duplicate entries (e.g., "Flushing" and "Queens" both appearing, or "NEW YORK" and "New York" as separate entries after title-casing).

### 6.2 Name Search Quality

The `parseNameSearch()` function (line 30) strips medical titles (26 variations including "Dr.", "MD", "NP", "PhD", etc.) and handles multi-term name searches with "First Last" and "Last First" matching. This depends on clean `firstName` and `lastName` fields in the providers table.

### 6.3 Specialty Filter Quality

Specialty search (line 250) checks three fields: `primary_specialty`, `primary_taxonomy_code`, and `specialty_category`. If `update-specialties.ts` has not been run, providers with NULL specialty data are invisible to specialty-based searches.

### 6.4 Deactivated Provider Filtering

The current search query does NOT explicitly filter out deactivated providers. The strategy is to prevent them from entering the database at import time (the import script skips deactivated NPIs at line 271 of `import-npi-direct.ts`). Legacy deactivated providers must be cleaned up with `cleanup-deactivated-providers.ts`.

### 6.5 Search Ordering

Providers are ordered by plan acceptance count (descending), then alphabetically. This means providers with more verified plan acceptances (higher data quality) appear first:

```typescript
orderBy: [
  { providerPlanAcceptances: { _count: 'desc' } },
  { lastName: 'asc' },
  { firstName: 'asc' },
  { organizationName: 'asc' },
],
```

---

## 7. Data Flow and Quality Checkpoints

### 7.1 Import Pipeline

```
CMS NPPES CSV File
    |
    v
[import-npi-direct.ts]
    |-- Filter: Skip deactivated providers (deactivation_date check)
    |-- Transform: Parse entity type ('1'/'2'), clean phone numbers
    |-- Transform: Map taxonomy code to specialty_category and description
    |-- Load: UPSERT into providers table (ON CONFLICT npi DO UPDATE)
    |-- Log: sync_logs entry with file hash, record counts
    |
    v
[Post-Import Quality Scripts]
    |-- normalize-city-names.ts (city cleanup for metro areas)
    |-- update-specialties.ts (fix NULL/generic specialties)
    |-- deduplicate-locations.ts (address hash dedup)
    |-- backfill-specialty-fast.cjs (bulk taxonomy prefix mapping)
    |
    v
[Ongoing Enrichment]
    |-- enrich-providers-nppes.ts (refresh from NPPES API, 90-day cycle)
    |-- audit-npi-validation.ts (cross-validate against NPPES registry)
    |-- crossref-insurance-networks.ts (match network IDs to plans)
    |
    v
[Quality Reporting]
    |-- generate-dq-report.ts (audit table summary)
    |-- verify-data-quality.ts (field population stats)
    |-- check-import-status.ts (record counts)
```

### 7.2 Verification Pipeline

```
User submits verification
    |
    v
[Sybil Check] -- IP duplicate? (30-day window) -> REJECT
    |               Email duplicate? (30-day window) -> REJECT
    v
[Create VerificationLog]
    |-- Set expiresAt = now() + 6 months
    |-- Store previousValue for audit trail
    |
    v
[Consensus Check]
    |-- Count ACCEPTED vs NOT_ACCEPTED from non-expired verifications
    |-- Require: 3+ verifications AND score >= 60 AND 2:1 majority
    |
    v
[Update/Create ProviderPlanAcceptance]
    |-- Calculate confidence score (4-factor model)
    |-- Set expiresAt = now() + 6 months
    |
    v
[Community Voting]
    |-- One vote per IP per verification (VoteLog unique constraint)
    |-- Recalculates confidence score on vote
```

---

## 8. Operational Questions and Decisions

### 8.1 Answered Questions

| Question | Decision | Rationale |
|----------|----------|-----------|
| When to run city name cleanup? | After each import for target metro areas | The script supports `--state` filtering; run for NYC after NYC import |
| Should deactivated providers be deleted or kept? | Skip at import time; delete legacy records | Import script filters them out (line 271); cleanup script handles legacy data |
| What happens to deactivated providers' related data? | Cascade delete | `cleanup-deactivated-providers.ts` deletes verification_logs, plan_acceptances, then providers |
| How long should verifications be valid? | 6 months (research-based) | 12% annual provider turnover means ~6% change per 6 months; stale data is worse than no data |
| How many verifications for consensus? | 3 (research-based) | Mortensen et al. (2015): 3 crowdsourced verifications = expert-level accuracy (kappa = 0.58) |

### 8.2 Open Questions

| Question | Current Status | Recommendation |
|----------|---------------|----------------|
| What is the acceptable error rate for taxonomy mapping? | ~60+ prefix rules cover most codes; unmapped -> "OTHER" | Track "OTHER" percentage in generate-dq-report.ts; target < 5% |
| How do we measure and track data quality over time? | Ad-hoc script runs; `data_quality_audit` table exists | Build a cron job for `audit-npi-validation.ts` and `generate-dq-report.ts`; store metrics in `sync_logs` |
| Should we implement automated data quality checks in CI? | Not implemented | Add quality gate: run `verify-data-quality.ts` in CI and fail on threshold violations |
| Should confidence recalculation run on a schedule? | Manual script only | Recommend daily cron for `recalculate-confidence.ts --apply` |
| Should expired verifications be auto-cleaned? | Function exists but no cron job | Recommend weekly cron for `cleanupExpiredVerifications()` |

---

## 9. Quality Metrics and Monitoring

### 9.1 Current Monitoring Capabilities

The system provides the following monitoring through existing scripts and API endpoints:

**Data Quality Audit Report** (`generate-dq-report.ts`):
- Total/resolved/unresolved audit records
- Breakdown by severity (CRITICAL / WARNING / INFO)
- Breakdown by audit type (DEACTIVATED_NPI, NPI_NOT_FOUND, NAME_MISMATCH, etc.)
- Actionability summary (auto-fixable vs manual review vs informational)
- NPPES sync coverage (% of providers synced, oldest/newest sync dates)

**Verification Expiration Stats** (`verificationService.ts` - `getExpirationStats()`):
- Total verification logs and plan acceptances
- Records with TTL set
- Already expired records
- Records expiring within 7 days and 30 days

**Verification Activity Stats** (`verificationService.ts` - `getVerificationStats()`):
- Total verifications, approved count, pending count
- Breakdown by verification type
- Recent count (last 24 hours)

### 9.2 Recommended Quality Dashboard Metrics

| Metric | Source | Target |
|--------|--------|--------|
| % providers with specialty_category | `SELECT COUNT(*) FILTER (WHERE specialty_category IS NOT NULL) / COUNT(*)` | > 95% |
| % providers synced with NPPES | `SELECT COUNT(nppes_last_synced) / COUNT(*)` | > 80% |
| Unresolved CRITICAL audit issues | `data_quality_audit WHERE severity='CRITICAL' AND resolved=false` | 0 |
| City name normalization coverage | Distinct cities before/after normalization | < 5% duplicates |
| Deactivated provider count | `providers WHERE deactivation_date IS NOT NULL` | 0 (filtered at import) |
| Expired verification records | `verification_logs WHERE expires_at < NOW()` | 0 (cleaned regularly) |
| Average confidence score | `AVG(confidence_score) FROM provider_plan_acceptance` | > 50 |
| Verification volume (last 30 days) | `COUNT(*) FROM verification_logs WHERE created_at > NOW() - 30 days` | Growing trend |
| Location duplication ratio | `(total - unique) / total FROM practice_locations` | < 10% |

---

## 10. Checklist

### Completed

- [x] City name issues identified and comprehensive mapping tables built (6 metro areas, ~1,000+ mappings)
- [x] City cleanup script exists with dry-run mode and state-specific filtering
- [x] Deactivated provider strategy decided: skip at import time, delete legacy records
- [x] Deactivated provider cleanup script exists with cascade deletion
- [x] Quality check script (`verify-data-quality.ts`) exists
- [x] Import status verification script (`check-import-status.ts`) exists
- [x] NPI validation audit script (`audit-npi-validation.ts`) cross-validates against NPPES API
- [x] Data quality audit table (`data_quality_audit`) in schema with severity levels
- [x] Audit report generation script (`generate-dq-report.ts`) exists
- [x] Insurance plan parser (`insurancePlanParser.ts`) normalizes ~50 carrier aliases
- [x] Verification TTL implemented (6-month expiration)
- [x] TTL backfill script exists for legacy records
- [x] Sybil attack prevention: 4 layers (IP, email, consensus threshold, vote dedup)
- [x] reCAPTCHA v3 integration for bot prevention
- [x] Specialty backfill scripts exist (prefix-based and taxonomy-lookup-based)
- [x] Location deduplication script with SHA256 address hashing
- [x] NPPES enrichment script with 90-day refresh cycle
- [x] Insurance network cross-reference script with fuzzy matching
- [x] Confidence recalculation script for proactive score decay
- [x] Sync logging for import operations
- [x] PII stripping on verification API responses (sourceIp, userAgent, submittedBy excluded)

### Not Yet Implemented

- [ ] Automated data quality checks in CI pipeline
- [ ] Data quality monitoring dashboard (frontend)
- [ ] Alerts on quality degradation (no threshold-based alerting)
- [ ] Scheduled cron jobs for enrichment and cleanup scripts
- [ ] Automated `recalculate-confidence.ts` execution (currently manual)
- [ ] Automated `cleanupExpiredVerifications()` execution (function exists, no cron)
- [ ] Metrics collection over time (no time-series quality data)
- [ ] Full taxonomy mapping coverage (currently prefix-based; some codes fall through to "OTHER")
- [ ] Address standardization beyond city names (no street-level normalization)

---

## 11. Key File Reference

| File | Absolute Path |
|------|---------------|
| Prisma Schema | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\prisma\schema.prisma` |
| Provider Service | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\providerService.ts` |
| Confidence Service | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\confidenceService.ts` |
| Verification Service | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\verificationService.ts` |
| Constants | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\config\constants.ts` |
| Insurance Plan Parser | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\utils\insurancePlanParser.ts` |
| City Name Normalization | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\normalize-city-names.ts` |
| Deactivated Provider Cleanup | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\cleanup-deactivated-providers.ts` |
| Data Quality Verification | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\verify-data-quality.ts` |
| Import Status Check | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\check-import-status.ts` |
| NPI Import (Direct) | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\import-npi-direct.ts` |
| Specialty Backfill (Fast) | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\backfill-specialty-fast.cjs` |
| Specialty Update | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\update-specialties.ts` |
| NPI Validation Audit | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\audit-npi-validation.ts` |
| DQ Report Generator | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\generate-dq-report.ts` |
| NPPES Enrichment | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\enrich-providers-nppes.ts` |
| Insurance Cross-Reference | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\crossref-insurance-networks.ts` |
| Location Deduplication | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\deduplicate-locations.ts` |
| Verification TTL Backfill | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\backfill-verification-ttl.ts` |
| Confidence Recalculation | `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\recalculate-confidence.ts` |
