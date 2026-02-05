---
tags:
  - documentation
  - data
  - quality
type: prompt
priority: 2
updated: 2026-02-05
---

# Data Quality Tracker

## Purpose
Track data quality issues in the VerifyMyProvider database, including NPI import quality, city name cleanup, deactivated providers, and verification data integrity.

## Files to Review
- `scripts/normalize-city-names.ts` (city cleanup script)
- `scripts/cleanup-deactivated-providers.ts` (deactivated provider handling)
- `scripts/verify-data-quality.ts` (quality checks)
- `scripts/check-import-status.ts` (import verification)
- `packages/backend/src/services/providerService.ts` (search — data quality impacts results)
- `packages/backend/src/services/confidenceService.ts` (scoring — data quality impacts confidence)
- `packages/backend/prisma/schema.prisma` (schema constraints)

## Data Quality Dimensions

### NPI Provider Data
| Issue | Status | Impact |
|-------|--------|--------|
| City name typos ("Birmingam" vs "Birmingham") | Known, cleanup script exists | Bad city dropdown, missed search results |
| Trailing state codes ("Birmingham,al") | Known, cleanup script exists | Duplicate cities in dropdown |
| Trailing punctuation ("Birmingham,") | Known, cleanup script exists | Duplicate cities in dropdown |
| Deactivated providers (~0.2%) | Known, kept in DB, filtered in queries | Stale data if not filtered |
| Stale addresses (self-reported, rarely updated) | Inherent to NPI data | Inaccurate location display |
| Only 6 states imported | Intentional, ~2.1M providers | Incomplete national coverage |
| Unmapped taxonomy codes | Catch-all "Other" category | Incorrect specialty display |

### Insurance Plan Data
| Issue | Status | Impact |
|-------|--------|--------|
| Plan name normalization | Parser exists (`insurancePlanParser.ts`) | Inconsistent plan names |
| Carrier identification accuracy | Automated extraction | Wrong carrier grouping |
| Plan-provider link completeness | Depends on import data | Missing acceptance records |

### Verification Data
| Issue | Status | Impact |
|-------|--------|--------|
| Verification TTL (6-month expiration) | Implemented via `expiresAt` | Stale verifications decay |
| Low verification volume | Cold start problem | Low confidence scores |
| Sybil attack prevention | 4 layers implemented | Data poisoning resistance |

## Quality Scripts
| Script | Purpose | Location |
|--------|---------|----------|
| `normalize-city-names.ts` | Fix city name typos and duplicates | `scripts/` |
| `cleanup-deactivated-providers.ts` | Handle deactivated providers | `scripts/` |
| `verify-data-quality.ts` | Run quality checks | `scripts/` |
| `check-import-status.ts` | Verify import completeness | `scripts/` |
| `backfill-specialty-fast.cjs` | Backfill specialty categories | `scripts/` |

## Questions to Ask
1. When should city name cleanup be run (after each import or after all states)?
2. Should deactivated providers be deleted or kept with a badge?
3. What is the acceptable error rate for taxonomy mapping?
4. How do we measure and track data quality over time?
5. Should we implement automated data quality checks in CI?

## Checklist
- [x] City name issues identified
- [x] Cleanup scripts exist
- [x] Deactivated provider strategy decided (keep + filter)
- [x] Quality check script exists
- [x] Import status verification script exists
- [ ] Automated quality checks not in CI
- [ ] Data quality dashboard not built
- [ ] No alerts on quality degradation
