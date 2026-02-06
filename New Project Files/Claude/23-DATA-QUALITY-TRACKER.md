# VerifyMyProvider Data Quality Tracker

**Last Updated:** 2026-02-06

---

## Data Quality Overview

### NPI Provider Data

| Issue | Status | Impact | Script/Fix |
|-------|--------|--------|------------|
| City name typos ("Birmingam" vs "Birmingham") | Known, cleanup script exists | Bad city dropdown, missed search results | `scripts/normalize-city-names.ts` |
| Trailing state codes ("Birmingham,al") | Known, cleanup script exists | Duplicate cities in dropdown | `scripts/normalize-city-names.ts` |
| Trailing punctuation ("Birmingham,") | Known, cleanup script exists | Duplicate cities in dropdown | `scripts/normalize-city-names.ts` |
| Deactivated providers (~0.2%) | Known, kept in DB, filtered in queries | Stale data if not filtered | `scripts/cleanup-deactivated-providers.ts` |
| Stale addresses (self-reported, rarely updated) | Inherent to NPI data | Inaccurate location display | Verification system mitigates |
| Only 6 states imported | Intentional, ~2.1M providers | Incomplete national coverage | Import remaining states as needed |
| Unmapped taxonomy codes | Catch-all "Other" category | Incorrect specialty display | `scripts/backfill-specialty-fast.cjs` |
| NYC neighborhood as city names | Extensive mapping exists | Hundreds of neighborhoods normalized | `scripts/normalize-city-names.ts` (424+ NYC mappings) |

### Insurance Plan Data

| Issue | Status | Impact |
|-------|--------|--------|
| Plan name normalization | Parser exists (Prisma schema has `rawName` + `planName` fields) | Inconsistent plan names |
| Carrier identification accuracy | Automated extraction via `carrier` and `carrierId` fields | Wrong carrier grouping |
| Plan-provider link completeness | Depends on import data | Missing acceptance records |

### Verification Data

| Issue | Status | Impact |
|-------|--------|--------|
| Verification TTL (6-month expiration) | Implemented via `expiresAt` field in both `VerificationLog` and `ProviderPlanAcceptance` | Stale verifications decay automatically |
| Low verification volume | Cold start problem | Low confidence scores |
| Sybil attack prevention | 4 layers implemented (rate limit + honeypot + CAPTCHA + IP/email dedup) | Data poisoning resistance |
| Vote manipulation | IP-based dedup via `VoteLog` unique constraint `[verificationId, sourceIp]` | Single vote per IP per verification |

---

## Quality Scripts Analysis

### `scripts/normalize-city-names.ts`

**Purpose:** Normalize inconsistent city names in the `practice_locations` table for 6 major metro areas.

**Coverage:** NYC (NY), Los Angeles (CA), Chicago (IL), Houston (TX), Phoenix (AZ), Philadelphia (PA)

**How it works:**
1. Connects directly to PostgreSQL via `pg` Pool
2. Queries unique city/state combinations with counts
3. Applies comprehensive mappings (1000+ entries across all metros):
   - NYC: 424+ mappings (boroughs, neighborhoods, typos)
   - LA: 166+ mappings
   - Chicago: 132+ mappings
   - Houston: 115+ mappings
   - Phoenix: 61+ mappings
   - Philadelphia: 130+ mappings
4. Includes cleanup patterns: trailing state codes, zip codes, multiple spaces
5. Dry run by default (`--apply` flag required to commit changes)
6. Transactional: all changes in a single transaction with rollback on error

**Usage verified:**
```bash
npx tsx scripts/normalize-city-names.ts              # DRY RUN (all metros)
npx tsx scripts/normalize-city-names.ts --apply      # Apply changes
npx tsx scripts/normalize-city-names.ts --state NY   # Specific state
```

### `scripts/cleanup-deactivated-providers.ts`

**Purpose:** Remove deactivated NPI providers from the database.

**How it works:**
1. Auto-detects deactivation column (checks `npi_status`, `status`, `npi_deactivation_date`, `deactivation_date`)
2. Handles reactivation dates (deactivated then reactivated providers are kept)
3. Hard-deletes in order: verification_logs -> provider_plan_acceptance -> providers
4. Dry run by default, transactional when applied
5. Includes analysis output: breakdown by state and specialty

**Database impact:** Cascading delete of related records for each deactivated provider.

### `scripts/verify-data-quality.ts`

**Purpose:** Basic quality checks on imported NY data.

**Checks performed:**
1. Individual name parsing samples (first_name, last_name, credential)
2. Organization name parsing samples
3. Date conversion samples (enumeration_date, last_updated)
4. Overall field population statistics (% of records with each field populated)

**Limitation:** Currently hardcoded to NY state only. Could be parameterized.

### `scripts/check-import-status.ts`

**Purpose:** Quick check of import status - counts NY records and total records.

**Limitation:** Very basic - only checks NY count and total. Does not check per-state breakdown or data completeness.

### `scripts/backfill-specialty-fast.cjs`

**Purpose:** Backfill specialty categories for providers that have taxonomy codes but no specialty_category.

### Other quality-related scripts found:
- `scripts/deduplicate-locations.ts` - Remove duplicate practice locations (by address_hash)
- `scripts/audit-npi-validation.ts` - Validate NPI data integrity
- `scripts/generate-dq-report.ts` - Generate data quality report
- `scripts/recalculate-confidence.ts` - Recalculate confidence scores for all records
- `scripts/update-specialties.ts` - Update specialty mappings

---

## Schema Constraints (from `schema.prisma`)

**Data integrity constraints verified:**
- `Provider.npi` - Primary key, VarChar(10)
- `practice_locations` - Indexed on city, state, zip_code, npi, address_hash
- `VerificationLog` - Sybil prevention indexes: `idx_vl_sybil_ip` (providerNpi + planId + sourceIp + createdAt) and `idx_vl_sybil_email` (providerNpi + planId + submittedBy + createdAt)
- `VoteLog` - Unique constraint on `[verificationId, sourceIp]` prevents duplicate votes
- `ProviderPlanAcceptance` - Partial unique indexes via raw SQL (npi + plan_id + location_id)
- `DataQualityAudit` model exists for tracking quality issues per NPI

**`DataQualityAudit` model fields:**
- `npi` - Provider NPI
- `auditType` - Type of quality issue
- `severity` - Issue severity
- `field` - Affected field
- `currentValue` / `expectedValue` - For comparison
- `resolved` - Whether issue has been fixed
- Indexed on npi, severity, auditType, resolved

---

## Confidence Service Impact on Data Quality

The `confidenceService.ts` scoring system directly reflects data quality:

| Factor | Max Points | How Data Quality Affects It |
|--------|-----------|---------------------------|
| Data Source | 25 | CMS data scores 25, crowdsource scores 15 |
| Recency | 30 | Specialty-specific decay (mental health: 30 days, primary care: 60 days, hospital: 90 days) |
| Verification Count | 25 | 0 verifications = 0 points, 3+ = 25 points (research-based threshold) |
| Agreement | 20 | Conflicting votes = 0 points, 100% consensus = 20 points |

**Quality signals built into the scoring:**
- Stale data automatically loses recency points
- Unverified records max out at lower scores
- Conflicting community data (low agreement) reduces confidence
- Specialty-specific freshness thresholds account for different provider turnover rates

---

## Questions Answered

### 1. When should city name cleanup be run?

**Answer:** After each state import. The `normalize-city-names.ts` script supports per-state execution (`--state NY`), making it safe to run incrementally. The script is transactional and idempotent - running it multiple times produces the same result.

### 2. Should deactivated providers be deleted or kept with a badge?

**Answer:** Current strategy is **keep + filter**. The Prisma schema has `deactivation_date` and `reactivation_date` fields on the Provider model. The `providers.ts` route handler adds `npiStatus: provider.deactivation_date ? 'DEACTIVATED' : 'ACTIVE'` to the API response. The `cleanup-deactivated-providers.ts` script exists for hard deletion if the strategy changes.

### 3. What is the acceptable error rate for taxonomy mapping?

**Answer:** Not formally defined. The `specialty_category` field uses a catch-all "Other" category for unmapped codes. The `backfill-specialty-fast.cjs` script exists to backfill missing categories. The `taxonomy_reference` table has `standardized_name` and `provider_count` fields for tracking coverage.

### 4. How do we measure and track data quality over time?

**Answer:** The `DataQualityAudit` model in the Prisma schema provides a framework for tracking quality issues per provider. Fields include `auditType`, `severity`, `currentValue`, `expectedValue`, `resolved`, and `resolvedAt`. Scripts like `audit-npi-validation.ts` and `generate-dq-report.ts` exist to populate and report on this data. However, automated periodic quality checks are not yet in CI.

### 5. Should we implement automated data quality checks in CI?

**Answer:** Yes, but not yet implemented. Current quality checks are manual scripts. The `security-scan.yml` workflow demonstrates the pattern - a similar `data-quality.yml` workflow could run checks on schema changes or data imports.

---

## Checklist Status

- [x] City name issues identified - Comprehensive mappings for 6 metros (1000+ entries)
- [x] Cleanup scripts exist - `normalize-city-names.ts`, `cleanup-deactivated-providers.ts`, `deduplicate-locations.ts`
- [x] Deactivated provider strategy decided - Keep + filter, with hard delete option
- [x] Quality check script exists - `verify-data-quality.ts`, `audit-npi-validation.ts`
- [x] Import status verification script exists - `check-import-status.ts`
- [x] DataQualityAudit model in schema for tracking issues
- [ ] Automated quality checks not in CI
- [ ] Data quality dashboard not built
- [ ] No alerts on quality degradation
- [ ] Quality check scripts only cover NY state
- [ ] No scheduled cleanup of deactivated providers (manual only)
