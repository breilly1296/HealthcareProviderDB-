# VerifyMyProvider Data Quality Tracker

**Generated:** 2026-02-18

---

## Data Quality Overview

### Database: `verifymyprovider` (Google Cloud SQL PostgreSQL)

The VerifyMyProvider database consists of 20 models (Prisma schema). The primary data pipeline flows from NPPES (National Plan & Provider Enumeration System) through import scripts into PostgreSQL, with enrichment from CMS national data, hospital system matching, and crowdsourced verification.

---

## Data Quality Dimensions

### 1. NPI Provider Data

| Issue | Status | Severity | Impact | Mitigation |
|-------|--------|----------|--------|------------|
| City name typos ("Birmingam" vs "Birmingham") | Known, cleanup script exists | Medium | Missed search results, duplicate cities in dropdown | `scripts/normalize-city-names.ts` |
| Trailing state codes ("Birmingham,al") | Known, cleanup script exists | Medium | Duplicate entries in city dropdown | `scripts/normalize-city-names.ts` |
| Trailing punctuation ("Birmingham,") | Known, cleanup script exists | Low | Visual artifacts in UI | `scripts/normalize-city-names.ts` |
| Deactivated providers (~0.2%) | Kept in DB, filtered in queries | Low | Stale results if not filtered | `deactivationDate` field checked; `npiStatus: 'DEACTIVATED'` shown in API |
| Stale addresses (self-reported, rarely updated) | Inherent to NPI data | Medium | Inaccurate location display | Crowdsourced verification + geocoding validates locations |
| Unmapped taxonomy codes | Catch-all "Other" category | Low | Incorrect specialty display | `taxonomy_reference` table with standardized names |
| Missing specialty_category | Backfill script exists | Medium | Providers not appearing in specialty filters | `scripts/backfill-specialty-fast.cjs` |
| 6 test states + NYC launch dataset | Documented | Info | Test states (FL, AL, AK, AR, AZ, CA) are non-production data; NYC is the priority | NYC (5 boroughs, ~50-75K providers) is Q2 2026 launch target |

### 2. Practice Location Data

| Issue | Status | Severity | Impact | Mitigation |
|-------|--------|----------|--------|------------|
| Missing geocoding (lat/lng) | Partially complete | Medium | Map pins missing for ungeocoded locations | `scripts/geocode-locations.ts` |
| Duplicate locations | Handled by unique constraint | Low | Extra storage | `uq_location_address` composite unique on (npi, addressLine1, city, state, zipCode) |
| Address hash inconsistency | Hash column exists | Low | Co-location matching may miss matches | `address_hash` column and `idx_locations_address_hash` index |
| Enrichment data protection | Complete (Phase 6) | Info | Import scripts cannot overwrite enriched data | `data_source` column, field allowlists in import scripts |

### 3. Insurance Plan Data

| Issue | Status | Severity | Impact | Mitigation |
|-------|--------|----------|--------|------------|
| Plan name normalization | Parser exists | Medium | Inconsistent plan names in search | `insurancePlanParser.ts` in backend scripts |
| Carrier identification accuracy | Automated extraction | Medium | Wrong carrier grouping | `carrier` and `carrier_id` fields; `source_health_system` for provenance |
| Plan-provider link completeness | Depends on enrichment data | High | Missing acceptance records for real provider-plan pairs | Crowdsourced verification fills gaps |

### 4. Verification Data Quality

| Issue | Status | Severity | Impact | Mitigation |
|-------|--------|----------|--------|------------|
| Verification TTL (6-month expiration) | Implemented | Info | Stale verifications auto-expire | `expiresAt` field, `cleanupExpiredVerifications()` admin endpoint |
| Low verification volume | Cold start problem | High | Low confidence scores across the board | Launch strategy: NYC focus to concentrate volume |
| Sybil attack (data poisoning) | 4 layers implemented | Low | Mitigated | Rate limiting + honeypot + CAPTCHA + IP/email dedup (30-day) |
| Consensus threshold | Implemented | Info | Status changes require 3 verifications, 60 confidence, 2:1 majority | `verificationService.ts` |

### 5. Enrichment Data Integrity

| Issue | Status | Severity | Impact | Mitigation |
|-------|--------|----------|--------|------------|
| Import conflicts (NPI re-import) | Review queue exists | Medium | Enriched data could be overwritten | `import_conflicts` table with pending/keep_current/accept_incoming/manual resolution |
| Provider profile URL validation | Phase 5A complete | Info | Some URLs may be stale | 2,552 practices re-verified across 15 specialties |
| Hospital system matching | Complete for major NYC systems | Info | Some providers missing hospital affiliation | `provider_hospitals` table, confidence column |

---

## Quality Scripts Inventory

| Script | Purpose | Location | Last Run |
|--------|---------|----------|----------|
| `normalize-city-names.ts` | Fix city name typos, trailing codes, punctuation | `scripts/` | After imports |
| `cleanup-deactivated-providers.ts` | Handle deactivated NPI providers | `scripts/` | After imports |
| `verify-data-quality.ts` | Run quality checks (name parsing, field population) | `scripts/` | As needed |
| `check-import-status.ts` | Verify import completeness | `scripts/` | After imports |
| `backfill-specialty-fast.cjs` | Backfill specialty_category from taxonomy codes | `scripts/` | After imports |
| `pre-import-check.ts` | Safety check before NPI re-imports (enrichment protection) | `scripts/` | Before every import |
| `geocode-locations.ts` | Geocode practice locations (lat/lng) | `scripts/` | After imports |
| `deduplicate-locations.ts` | Remove duplicate practice locations | `scripts/` | As needed |
| `recalculate-confidence.ts` | Recalculate confidence scores with decay | `scripts/` | Scheduled via admin API |
| `enrich-providers-nppes.ts` | Enrich providers with NPPES data (phone/fax, new locations) | `scripts/` | After NPI data refresh |
| `import-npi.ts` | Main NPI import (Prisma-based, enrichment-safe) | `scripts/` | Data refresh cycles |
| `import-npi-direct.ts` | Direct SQL NPI import (faster, reduced column set) | `scripts/` | Bulk imports |
| `generate-dq-report.ts` | Generate data quality report | `scripts/` | As needed |

---

## Schema Constraints (Data Quality Enforcement)

### Primary Keys and Unique Constraints

| Table | Constraint | Type | Purpose |
|-------|-----------|------|---------|
| `providers` | `npi` (VARCHAR(10)) | PK | One record per NPI number |
| `practice_locations` | `uq_location_address` | Unique (npi, addressLine1, city, state, zipCode) | Prevents duplicate locations per provider |
| `vote_logs` | `(verificationId, sourceIp)` | Unique | One vote per IP per verification (Sybil prevention) |
| `saved_providers` | `uq_saved_provider_user_npi` | Unique (userId, providerNpi) | One bookmark per user per provider |
| `user_insurance_cards` | `userId` | Unique | One card per user |
| `sessions` | `refreshToken` | Unique | Token uniqueness for auth |

### Key Indexes for Data Integrity

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_vl_sybil_ip` | `verification_logs` | Fast Sybil check: (providerNpi, planId, sourceIp, createdAt) |
| `idx_vl_sybil_email` | `verification_logs` | Fast Sybil check: (providerNpi, planId, submittedBy, createdAt) |
| `idx_ppa_expires_at` | `provider_plan_acceptance` | Efficient TTL cleanup queries |
| `idx_vl_expires_at` | `verification_logs` | Efficient TTL cleanup queries |
| `idx_conflicts_resolution` | `import_conflicts` | Quick lookup of pending conflicts |

---

## Enrichment Protection (Phase 6 -- Complete)

### Protected Fields

These fields are never overwritten by NPI re-imports:

**On `providers` table:**
- `provider_profile_url` (enrichment data)
- `confidence_score` (calculated field)
- `verification_count` (calculated field)
- `data_source` (provenance tracking)

**On `practice_locations` table:**
- `latitude`, `longitude` (geocoding data)
- `geocoded_at` (geocoding timestamp)
- `address_hash` (computed field)
- `data_source` (provenance tracking)
- `enriched_at`, `enrichment_source` (enrichment metadata)

### Import Script Hardening

| Script | Protection Method |
|--------|------------------|
| `import-npi.ts` | Prisma upsert `update` block uses explicit 24-field allowlist (no `...data` spread) |
| `import-npi-direct.ts` | `ON CONFLICT SET` reduced to 11 NPI-sourced columns only |
| `enrich-providers-nppes.ts` | Phone/fax only filled if NULL; conflicts logged to `import_conflicts`; new locations get `data_source = 'nppes'` |

---

## Data Quality Metrics

### Current State (as of Feb 2026)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Enriched providers (data_source = 'enrichment') | 0 | N/A | Provider-level enrichment not yet applied |
| Enriched locations (data_source = 'enrichment') | 348,190 | N/A | Complete |
| Pending import conflicts | 0 | 0 | Clean |
| Practice re-verifications (Phase 5B) | 2,552 across 15 specialties | All | Complete |
| DNS dead websites found | 5 | 0 | Corrected |
| Wrong websites corrected | 1 | 0 | Corrected |
| Closures/acquisitions flagged | 4 | N/A | Documented |
| MEDIUM to HIGH upgrades | ~104 | N/A | Hospital-system practices verified |

---

## Data Quality Checklist

- [x] City name issues identified and cleanup scripts exist
- [x] Deactivated provider strategy decided (keep + filter, show badge)
- [x] Quality check script exists (`verify-data-quality.ts`)
- [x] Import status verification script exists (`check-import-status.ts`)
- [x] Enrichment data protected from NPI re-imports (Phase 6)
- [x] Import conflict review queue operational (`import_conflicts` table)
- [x] Pre-import safety check script exists (`pre-import-check.ts`)
- [x] Practice re-verification complete (Phase 5B, 2,552 practices)
- [x] Sybil attack prevention implemented (4 layers)
- [x] Verification TTL implemented (6-month expiration)
- [x] Verification consensus thresholds enforced
- [x] DataQualityAudit model exists in schema for tracking issues
- [ ] Automated quality checks not in CI pipeline
- [ ] Data quality dashboard not built
- [ ] No alerting on quality degradation
- [ ] No automated city name normalization after import (manual script run)

---

## Recommendations

### Short-term (Next Sprint)
1. Run `normalize-city-names.ts` after every NPI import (or automate in import pipeline)
2. Add data quality check step to CI/CD pipeline (count null specialties, check city format)

### Medium-term (Q2 2026)
3. Build admin dashboard showing data quality metrics (coverage by borough, specialty distribution, geocoding completeness)
4. Implement automated alerting when import adds > X% deactivated providers or when city name anomalies spike

### Long-term (Q3-Q4 2026)
5. Implement real-time data quality scoring per provider (freshness + completeness + verification status)
6. Add "data quality" badge on provider cards (green/yellow/red based on address freshness and verification count)
7. Consider address verification service (USPS API) for location validation
