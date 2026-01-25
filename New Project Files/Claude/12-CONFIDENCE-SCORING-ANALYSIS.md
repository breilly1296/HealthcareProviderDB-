# VerifyMyProvider Confidence Scoring Algorithm Review

**Last Updated:** January 25, 2026
**Priority:** High
**Algorithm Status:** IMPLEMENTED and tested (82+ passing tests)
**Scale:** 0-100 points

---

## Executive Summary

The confidence scoring algorithm calculates a 0-100 point score reflecting data reliability. It combines 4 research-backed components with specialty-specific adjustments and security features to prevent gaming.

---

## Algorithm Overview

### Total Score Formula
```
Total = min(100, DataSource + Recency + Verification + Agreement)
```

| Component | Max Points | Purpose |
|-----------|-----------|---------|
| Data Source Quality | 25 | Source reliability |
| Recency/Freshness | 30 | Data age penalty |
| Verification Count | 25 | Independent confirmations |
| Community Agreement | 20 | Consensus strength |
| **Total** | **100** | |

---

## Component 1: Data Source Quality (0-25 points)

### Scoring Hierarchy

| Points | Source | Examples |
|--------|--------|----------|
| 25 | CMS/Government | CMS_NPPES, CMS_PLAN_FINDER |
| 20 | Insurance/Provider | CARRIER_API, PROVIDER_PORTAL |
| 15 | Community | USER_UPLOAD, PHONE_CALL, CROWDSOURCE |
| 10 | Automated/Unknown | AUTOMATED, null sources |

**Rationale:** Official government sources are most reliable, community sources weighted lower but still valuable.

---

## Component 2: Recency/Freshness (0-30 points)

### Specialty-Specific Thresholds

| Specialty | Threshold | Rationale |
|-----------|-----------|-----------|
| Mental Health | 30 days | Highest churn (43% Medicaid acceptance) |
| Primary Care | 60 days | 12% annual turnover |
| Specialist | 60 days | Similar to primary care |
| Hospital-based | 90 days | More stable positions |
| Other | 60 days | Default |

### Tiered Scoring

| Age (% of threshold) | Points |
|---------------------|--------|
| 0-50% | 30 (very fresh) |
| 50-100% | 20 (recent) |
| 100-150% | 10 (aging) |
| 150-180 days | 5 (stale) |
| 180+ days | 0 (too old) |

**Research Basis:** 12% annual provider turnover (Ndumele et al. 2018)

---

## Component 3: Verification Count (0-25 points)

### Scoring Thresholds

| Verifications | Points | Status |
|---------------|--------|--------|
| 0 | 0 | No data |
| 1 | 10 | Could be outlier |
| 2 | 15 | Getting closer |
| 3+ | 25 | Expert-level accuracy |

**Research Basis:** κ=0.58 expert threshold achieved at 3 verifications (Mortensen et al. 2015, JAMIA)

**Key Insight:** Diminishing returns after 3 - more verifications don't increase score further.

---

## Component 4: Community Agreement (0-20 points)

### Agreement Ratio Scoring

| Agreement % | Points |
|-------------|--------|
| 100% | 20 |
| 80-99% | 15 |
| 60-79% | 10 |
| 40-59% | 5 |
| <40% | 0 (conflicting) |
| No votes | 0 |

**Formula:** `agreementRatio = upvotes / (upvotes + downvotes)`

---

## Score Calculation Examples

### Example 1: Fresh CMS Data (No Users)
```
Data Source: 20 (single CMS)
Recency: 30 (0-30 days, primary care)
Verification: 0 (no users)
Agreement: 0 (no users)
TOTAL: 50 (Yellow - "Needs verification")
```

### Example 2: User-Verified, Recent
```
Data Source: 25 (CMS + user verified)
Recency: 30 (0-30 days)
Verification: 25 (3+ verifications)
Agreement: 20 (100% agree)
TOTAL: 100 (Green - "Highly verified")
```

### Example 3: Old Data, Conflicting
```
Data Source: 20 (single CMS)
Recency: 5 (1.5 years old)
Verification: 15 (2 verifications)
Agreement: 0 (50/50 split)
TOTAL: 40 (Red - "Conflicting reports")
```

---

## Confidence Level Mapping

### Score to Level

| Score | With 3+ Verifications | With <3 Verifications |
|-------|----------------------|----------------------|
| 91-100 | VERY_HIGH | MEDIUM (capped) |
| 76-90 | HIGH | MEDIUM (capped) |
| 51-75 | MEDIUM | MEDIUM/LOW |
| 26-50 | LOW | LOW |
| 0-25 | VERY_LOW | VERY_LOW |

**Critical Feature:** Scores are capped at MEDIUM if fewer than 3 verifications exist, regardless of numeric score.

---

## Frontend Display

### Color Coding

| Score | Color | Meaning |
|-------|-------|---------|
| 70-100 | Green | High confidence |
| 40-69 | Yellow | Medium - use caution |
| 0-39 | Red | Low - verify independently |

### User Messaging

| Score | Message |
|-------|---------|
| 90-100 | "Highly verified" |
| 70-89 | "Verified" |
| 50-69 | "Needs verification" |
| 30-49 | "Limited data" |
| 0-29 | "Unverified" |

---

## Edge Cases Handled

### Data Source
- Null/unknown sources → 10 points (fallback)
- Legacy enum values → Backwards compatible

### Recency
- Never verified → 0 points + recommend re-verification
- 180+ days → Always 0 points

### Verification Count
- Zero verifications → Score based on source + recency only
- Capping at 3 → 10 verifications scored same as 3

### Agreement
- No votes → 0 points (doesn't penalize new submissions)
- 50-50 split → 5 points (weak consensus)
- All downvotes → 0 points

---

## Security Features

### Sybil Attack Prevention
- Duplicate submission detection (IP/email within 30 days)
- Vote deduplication by IP
- Consensus requirements for status changes

### Status Change Requirements
- Minimum 3 verifications
- Score ≥ 60
- 2:1 majority ratio
- First verification → PENDING only

---

## Score Update Triggers

### On New Verification
1. Query all non-expired verifications for NPI+plan
2. Count agreements (accepts vs rejects)
3. Recalculate all 4 components
4. Update ProviderPlanAcceptance.confidenceScore

### On Vote Change
1. Prevent duplicate votes
2. Recalculate agreement score
3. Update confidence score immediately

---

## TTL (Time-To-Live)

- **Verification expiration:** 6 months
- **Acceptance expiration:** 6 months
- **Rationale:** 12% annual turnover = ~6 month half-life
- **Cleanup:** Background job removes expired records

---

## Test Coverage

### Test Categories (82+ tests)

| Category | Tests |
|----------|-------|
| Data Source Scoring | 6 |
| Recency Decay | 8 |
| Specialty-Based Decay | 4 |
| Verification Count | 5 |
| Community Agreement | 4 |
| Overall Score | 7 |
| Confidence Level | 11 |
| Level Descriptions | 6 |
| Metadata Calculations | 10 |
| Integration | Various |

### Test Characteristics
- Deterministic (fixed time via jest.useFakeTimers)
- Mock data helpers
- Boundary testing
- Edge case coverage

---

## Implementation Files

| File | Purpose |
|------|---------|
| `confidenceService.ts` | Main algorithm |
| `confidenceService.test.ts` | Comprehensive tests |
| `verificationService.ts` | Score update logic |
| `schema.prisma` | Database fields |

---

## Recommendations

### Immediate
- None (algorithm working correctly)

### Future Enhancements
1. **Confidence decay job** - Automatic recalculation as data ages
2. **Score breakdown display** - Show users the 4 components
3. **Weight adjustments** - Based on observed patterns
4. **Anomaly detection** - Flag suspicious score patterns

### Questions to Consider
1. Should minimum threshold hide providers with score <30?
2. Should we differentiate "accepts" vs "in-network"?
3. Should score breakdown be shown to users?

---

## Summary

| Aspect | Status |
|--------|--------|
| Algorithm implemented | Complete |
| Test coverage | Comprehensive (82+) |
| Bug fix (score dropping) | Resolved |
| Security features | Implemented |
| TTL expiration | Implemented |
| Specialty-specific thresholds | Implemented |

**Overall Assessment:** Confidence scoring is well-designed, research-backed, and thoroughly tested.

---

*Algorithm is production-ready with strong anti-gaming measures*
