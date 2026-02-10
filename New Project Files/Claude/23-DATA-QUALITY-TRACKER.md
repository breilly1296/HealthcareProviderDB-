# Data Quality Tracker - VerifyMyProvider

## Overview

This document tracks data quality issues, metrics, and remediation scripts across the three primary data domains in VerifyMyProvider: NPI provider data, insurance plan data, and community verification data.

---

## NPI Provider Data

### Source

All provider data is sourced from the CMS NPI Registry (NPPES). The dataset contains approximately 2.1 million provider records across 6 states (testing subset for NYC launch).

### Known Quality Issues

#### City Name Typos, Trailing Codes, and Punctuation

**Severity:** Low
**Impact:** Search results may miss providers due to inconsistent city names

Examples of issues found in NPI data:

| Raw Value | Problem | Corrected Value |
|---|---|---|
| `NEW YORK,` | Trailing comma | `NEW YORK` |
| `BROOKLYN  ` | Trailing spaces | `BROOKLYN` |
| `New york` | Inconsistent capitalization | `NEW YORK` |
| `FLUSHING 11355` | Trailing ZIP fragment | `FLUSHING` |
| `ST. ALBANS` | Period in abbreviation | `ST ALBANS` or `SAINT ALBANS` |

**Status:** Cleanup script exists (`normalize-city-names.ts`). Can be run after each data import.

**Remediation:** The provider search endpoint performs case-insensitive matching and trims whitespace, which mitigates most issues at query time. The cleanup script provides a more thorough correction at the data level.

---

#### Deactivated Providers (~0.2%)

**Severity:** Low
**Impact:** Small number of deactivated NPI records present in database

Approximately 0.2% of imported NPI records have a deactivation date, meaning the provider is no longer active. These records are retained in the database for historical reference and audit trail purposes.

**Status:** Cleanup script exists (`cleanup-deactivated-providers.ts`). The approach is to keep deactivated records but filter them from public search results.

**Remediation:** Search endpoints filter out deactivated providers by default. Admin endpoints can access all records including deactivated ones.

---

#### Stale Provider Addresses

**Severity:** Low
**Impact:** Some provider addresses may be outdated

The NPI registry relies on providers to update their own records. Address staleness is inherent to the data source and cannot be fully resolved through data quality scripts.

**Status:** Inherent limitation of NPI data. No automated fix.

**Remediation:** Regular re-imports from the NPPES dataset capture updates that providers have made. The community verification system allows users to flag incorrect information. Future enhancement: cross-reference with other public data sources.

---

#### Unmapped Taxonomies

**Severity:** Low
**Impact:** Some providers show "Other" as their specialty category

The taxonomy-to-specialty mapping covers the vast majority of NUCC taxonomy codes, but some uncommon codes fall through to a catch-all "Other" category.

**Status:** Known limitation. The mapping is maintained in the specialty mapping configuration.

**Remediation:** Run `backfill-specialty-fast.cjs` to reprocess specialty assignments when the mapping is updated. Monitor the "Other" category count to identify common unmapped codes that should be added.

---

### NPI Data Quality Metrics

| Metric | Value | Notes |
|---|---|---|
| Total providers imported | ~2,100,000 | 6 states for testing |
| Deactivated providers | ~0.2% | Retained, filtered from search |
| City name issues | Estimated 1-3% | Cleanup script available |
| Unmapped taxonomies | <1% | Catch-all "Other" category |
| Missing first/last name | <0.1% | Organization entities (entity_type != Individual) |
| Missing primary specialty | ~2% | Taxonomy mapping gap |

---

## Insurance Plan Data

### Source

Insurance plan data is sourced from CMS Qualified Health Plan (QHP) Landscape files. Plans are imported via a dedicated pipeline that parses, deduplicates, and normalizes the data.

### Known Quality Issues

#### Plan Name Normalization

**Severity:** Low
**Impact:** Duplicate or inconsistently named plans may appear in search results

Plan names from CMS data contain variations in formatting, capitalization, and abbreviations. Examples:

| Raw Value | Normalized Value |
|---|---|
| `AETNA HEALTH INC.` | `Aetna Health Inc` |
| `BCBS OF NY` / `Blue Cross Blue Shield of New York` | Consistent form needed |
| `Plan Name (HMO)` / `Plan Name HMO` | Parenthetical inconsistency |

**Status:** Parser handles basic normalization during import. Edge cases may remain.

**Remediation:** The import pipeline includes name normalization logic. Review and extend normalization rules as new edge cases are discovered.

---

#### Carrier Identification Accuracy

**Severity:** Low
**Impact:** Some plans may not correctly match to their parent carrier/issuer

CMS data identifies plans by issuer ID, but mapping issuer IDs to consumer-facing carrier names requires a lookup table that may be incomplete for smaller regional carriers.

**Status:** Known limitation. The lookup table covers all major national and most regional carriers.

**Remediation:** Extend the issuer-to-carrier mapping as gaps are identified. Users can report mismatched carriers via the verification system.

---

#### Plan-Provider Link Completeness

**Severity:** Medium
**Impact:** Not all provider-plan relationships are captured in the database

The `ProviderPlanAcceptance` junction table relies on data from CMS and community verifications. CMS data covers QHP marketplace plans but not all employer-sponsored or Medicaid plans. Community verifications fill gaps but are sparse during cold start.

**Status:** Known limitation. Completeness improves as verifications accumulate.

**Remediation:** The verification system is the primary mechanism for improving plan-provider link completeness. As the user base grows, coverage will increase organically.

---

### Insurance Plan Data Quality Metrics

| Metric | Value | Notes |
|---|---|---|
| Total plans imported | Varies by state | CMS QHP Landscape data |
| Plan name normalization | Automated | Parser handles during import |
| Issuer mapping coverage | >95% of plans | Major and most regional carriers |
| Plan-provider links | Growing | Cold start, verification-dependent |

---

## Verification Data

### Quality Controls

#### 6-Month TTL via expiresAt

All verifications have a `expiresAt` timestamp set 6 months from creation. Expired verifications are excluded from confidence score calculations and can be cleaned up via the `POST /api/admin/cleanup-expired` admin endpoint.

**Rationale:** Insurance plan acceptance can change. A verification from 2 years ago is unreliable. The 6-month TTL ensures that only reasonably current data influences confidence scores.

---

#### Low Volume (Cold Start)

**Severity:** Medium
**Impact:** Confidence scores are unreliable with very few verifications

During the cold start phase, most provider-plan pairs have zero or very few verifications. The confidence scoring algorithm accounts for this by requiring a minimum verification count before reporting a confidence score as authoritative.

**Status:** Expected behavior during launch phase. Volume will grow with user acquisition.

**Remediation:** The confidence scoring algorithm includes a verification count factor that discounts scores with very few data points. The UI communicates confidence levels clearly to users.

---

#### Sybil Prevention (4 Layers)

The verification system implements 4 layers of defense against manipulation:

| Layer | Mechanism | Purpose |
|---|---|---|
| **1. Rate Limiting** | 10 verifications per hour per IP | Prevents bulk submission from single source |
| **2. reCAPTCHA v3** | Bot detection with score threshold | Filters automated submissions |
| **3. Duplicate Detection** | Same IP + NPI + plan within time window | Prevents repeated submissions |
| **4. Vote Weight Decay** | Reduced weight for repeated votes from same IP | Diminishes influence of coordinated voting |

Additionally, the confidence scoring algorithm includes a **source diversity factor** that weights verifications from unique IP ranges more heavily than clustered submissions.

---

### Verification Data Quality Metrics

| Metric | Target | Notes |
|---|---|---|
| Verification TTL | 6 months | Enforced via expiresAt |
| Minimum for confidence | Configurable threshold | Low count = low confidence |
| Sybil prevention layers | 4 active | Rate limit, CAPTCHA, dedup, decay |
| Expired cleanup | On-demand via admin | POST /api/admin/cleanup-expired |

---

## Quality Scripts

The following scripts are available for data quality maintenance:

| Script | Location | Purpose |
|---|---|---|
| `normalize-city-names.ts` | Backend scripts | Fixes city name typos, trailing codes, punctuation |
| `cleanup-deactivated-providers.ts` | Backend scripts | Flags or filters deactivated NPI records |
| `verify-data-quality.ts` | Backend scripts | Runs quality checks and reports metrics |
| `check-import-status.ts` | Backend scripts | Verifies data import completeness and integrity |
| `backfill-specialty-fast.cjs` | Backend scripts | Reprocesses specialty assignments from taxonomy codes |

### Running Quality Scripts

All scripts are run from the `packages/backend` directory:

```bash
# Normalize city names
npx tsx scripts/normalize-city-names.ts

# Check for deactivated providers
npx tsx scripts/cleanup-deactivated-providers.ts

# Run full data quality report
npx tsx scripts/verify-data-quality.ts

# Check import status
npx tsx scripts/check-import-status.ts

# Backfill specialty mappings
node scripts/backfill-specialty-fast.cjs
```

### Recommended Quality Maintenance Schedule

| Task | Frequency | Script |
|---|---|---|
| City name normalization | After each NPI import | `normalize-city-names.ts` |
| Deactivated provider check | After each NPI import | `cleanup-deactivated-providers.ts` |
| Data quality report | Weekly | `verify-data-quality.ts` |
| Import verification | After each import | `check-import-status.ts` |
| Specialty backfill | After mapping updates | `backfill-specialty-fast.cjs` |
| Expired verification cleanup | Weekly | Admin API: `POST /api/admin/cleanup-expired` |
