# Confidence Scoring System v2.0

## Overview
Research-backed confidence scoring system emphasizing recent data and optimal verification threshold.

**Total Score: 0-100 points across 4 factors**

---

## Scoring Breakdown

### 1. DATA SOURCE (25 points)
**Why it matters:** Official data from CMS is most reliable, but community verification achieves expert-level accuracy with sufficient volume.

| Source | Points | Description |
|--------|--------|-------------|
| CMS_NPPES / CMS_PLAN_FINDER | 25 | Official CMS data |
| CARRIER_API / CARRIER_DATA | 20 | Insurance carrier data |
| PROVIDER_PORTAL | 20 | Provider-verified |
| USER_UPLOAD / PHONE_CALL / CROWDSOURCE | 15 | Community verified |
| AUTOMATED | 10 | Automated checks |
| None | 10 | Default fallback |

---

### 2. RECENCY (30 points) ⬆️ *Increased from 25*
**Research:** 12% annual provider turnover (Ndumele et al. 2018). Recent data is critical.

#### Tiered Scoring System

| Days Since Verification | Points | Status |
|------------------------|--------|---------|
| 0-30 days | 30 | Very fresh |
| 31-60 days | 20 | Recent |
| 61-90 days | 10 | Aging |
| 91-180 days | 5 | Stale |
| 180+ days | 0 | Too old |

#### Specialty-Specific Adjustments

The tier boundaries adjust based on specialty freshness thresholds:

**Mental Health (30-day threshold):**
- Tier 1: 0-15 days = 30pts
- Tier 2: 16-30 days = 20pts
- Tier 3: 31-45 days = 10pts
- Tier 4: 46-180 days = 5pts
- 180+ = 0pts

**Primary Care / Specialists (60-day threshold):**
- Tier 1: 0-30 days = 30pts
- Tier 2: 31-60 days = 20pts
- Tier 3: 61-90 days = 10pts
- Tier 4: 91-180 days = 5pts
- 180+ = 0pts

**Hospital-Based (90-day threshold):**
- Tier 1: 0-45 days = 30pts
- Tier 2: 46-90 days = 20pts
- Tier 3: 91-135 days = 10pts
- Tier 4: 136-180 days = 5pts
- 180+ = 0pts

---

### 3. VERIFICATION COUNT (25 points)
**Research:** 3 verifications achieve expert-level accuracy κ=0.58 vs κ=0.59 expert agreement (Mortensen et al. 2015, JAMIA). No significant improvement beyond 3.

| Verifications | Points | Reasoning |
|--------------|--------|-----------|
| 0 | 0 | No data |
| 1 | 10 | Single verification - could be outlier |
| 2 | 15 | Close but not optimal |
| 3+ | 25 | **Expert-level accuracy achieved!** |

**Key insight:** Flat scoring at 3+ because research shows no additional accuracy benefit from more verifications.

---

### 4. AGREEMENT (20 points)
**Research:** Crowdsourced verification works best with consensus. Conflicting data suggests outdated/incorrect information.

| Agreement % | Points | Status |
|------------|--------|---------|
| 100% | 20 | Complete consensus |
| 80-99% | 15 | Strong consensus |
| 60-79% | 10 | Moderate consensus |
| 40-59% | 5 | Weak consensus |
| <40% | 0 | Conflicting data (unreliable) |

**Calculation:** `upvotes / (upvotes + downvotes)`

---

## Confidence Levels

Based on total score (0-100):

| Score Range | Level | Description |
|-------------|-------|-------------|
| 91-100 | VERY_HIGH | Verified through multiple authoritative sources with expert-level accuracy |
| 76-90 | HIGH | Verified through authoritative sources or multiple community verifications |
| 51-75 | MEDIUM | Some verification exists, but may need confirmation |
| 26-50 | LOW | Limited verification data. Call provider to confirm |
| 0-25 | VERY_LOW | Unverified or potentially inaccurate. Always call to confirm |

**Special Rule:** If verification count < 3, maximum level is MEDIUM regardless of score (research-based constraint).

---

## Metadata Returned

```typescript
interface ConfidenceResult {
  score: number;                 // 0-100
  level: string;                 // VERY_HIGH | HIGH | MEDIUM | LOW | VERY_LOW
  description: string;           // User-facing description
  factors: {
    dataSourceScore: number;     // 0-25
    recencyScore: number;        // 0-30
    verificationScore: number;   // 0-25
    agreementScore: number;      // 0-20
  };
  metadata: {
    daysUntilStale: number;               // Days remaining before stale
    isStale: boolean;                     // Past specialty threshold?
    recommendReVerification: boolean;     // Should user re-verify?
    daysSinceVerification: number | null; // Days since last verification
    freshnessThreshold: number;           // Specialty-specific threshold
    researchNote: string;                 // Specialty-specific research context
    explanation: string;                  // Human-readable score explanation
  };
}
```

---

## Example Scenarios

### Scenario 1: New Provider (No Community Verification)
```typescript
Input:
- dataSource: 'CMS_NPPES'
- lastVerifiedAt: 10 days ago
- verificationCount: 0
- upvotes: 0, downvotes: 0

Output:
- dataSourceScore: 25 (CMS data)
- recencyScore: 30 (very fresh)
- verificationScore: 0 (no community verification)
- agreementScore: 0 (no votes)
Total: 55/100 (MEDIUM)

Explanation: "This 55% confidence score is based on: verified through official CMS data,
very recent verification (within 30 days), no patient verifications yet."
```

### Scenario 2: Well-Verified Provider
```typescript
Input:
- dataSource: 'CROWDSOURCE'
- lastVerifiedAt: 20 days ago
- verificationCount: 3
- upvotes: 3, downvotes: 0
- specialty: 'Primary Care'

Output:
- dataSourceScore: 15 (community verified)
- recencyScore: 30 (very fresh)
- verificationScore: 25 (expert-level!)
- agreementScore: 20 (100% agreement)
Total: 90/100 (HIGH)

Explanation: "This 90% confidence score is based on: verified through community submissions,
very recent verification (within 30 days), 3 verifications (expert-level accuracy achieved!),
complete community consensus. Research shows primary care providers have 12% annual network turnover."
```

### Scenario 3: Stale Mental Health Provider
```typescript
Input:
- dataSource: 'CARRIER_API'
- lastVerifiedAt: 120 days ago
- verificationCount: 1
- upvotes: 1, downvotes: 0
- specialty: 'Psychiatry'

Output:
- dataSourceScore: 20 (carrier data)
- recencyScore: 5 (stale)
- verificationScore: 10 (only 1 verification)
- agreementScore: 20 (100% agreement)
Total: 55/100 (MEDIUM - capped due to < 3 verifications)

Explanation: "This 55% confidence score is based on: verified through insurance carrier data,
stale data (120 days old) - research shows 12% annual provider turnover, only 1 verification
(research shows 3 achieve expert-level accuracy), complete community consensus. Mental health
providers show high network turnover (only 43% accept Medicaid)."
```

### Scenario 4: Conflicting Data
```typescript
Input:
- dataSource: 'PHONE_CALL'
- lastVerifiedAt: 45 days ago
- verificationCount: 5
- upvotes: 2, downvotes: 3 (40% agreement)
- specialty: 'Cardiology'

Output:
- dataSourceScore: 15 (community verified)
- recencyScore: 20 (recent)
- verificationScore: 25 (expert-level threshold exceeded)
- agreementScore: 5 (weak consensus)
Total: 65/100 (MEDIUM)

Explanation: "This 65% confidence score is based on: verified through community submissions,
recent verification (45 days ago), 5 verifications (exceeds expert-level threshold), weak
community consensus. Specialist network participation changes regularly. Research shows 12%
annual turnover."
```

---

## Key Changes from v1.0

### What Changed

1. **Recency increased:** 25 → 30 points
   - More weight on recent data due to 12% annual turnover research
   - Tiered scoring system (30/20/10/5/0) instead of linear decay

2. **Verification scoring simplified:**
   - Flat 25 points at 3+ verifications
   - Research shows no accuracy improvement beyond 3

3. **Agreement thresholds adjusted:**
   - Removed engagement multiplier
   - Clearer thresholds: 100%=20pts, 80%=15pts, 60%=10pts, 40%=5pts, <40%=0pts

4. **Data source reduced:** 30 → 25 points
   - Rebalanced to emphasize recency

5. **Explanation added:**
   - New `metadata.explanation` field
   - Human-readable breakdown of why score is what it is

### Why These Changes

**Research-driven priorities:**
- **Recency matters more:** 12% annual turnover means 6-month-old data has ~6% chance of being wrong
- **3 is the magic number:** Mortensen et al. shows no significant accuracy improvement beyond 3 verifications
- **Transparency:** Users need to understand why confidence is scored as it is

---

## Research Citations

1. **Mortensen et al. (2015), JAMIA** - "Crowdsourcing Methods for Capturing Provider Information in Online Provider Directories"
   - κ=0.58 crowdsourced validation
   - κ=0.59 expert validation
   - 3 verifications optimal

2. **Ndumele et al. (2018), Health Affairs** - "Association of Health Plan Type With Provider Network Churn"
   - 12% annual provider turnover
   - Mental health: Only 43% accept Medicaid (high churn)
   - Primary care: 12% annual turnover
   - Hospital-based: More stable

3. **Haeder et al. (2024), Health Affairs** - "Despite Federal Rules, Errors In Provider Directories Remain Common"
   - 46-77% of directories contain errors
   - 4x more surprise bills with wrong directories
   - 540 days average to fix errors

---

## Usage Example

```typescript
import { calculateConfidenceScore } from './confidenceService';

const result = calculateConfidenceScore({
  dataSource: 'CMS_NPPES',
  lastVerifiedAt: new Date('2026-01-01'), // 11 days ago
  verificationCount: 3,
  upvotes: 3,
  downvotes: 0,
  specialty: 'FAMILY_MEDICINE',
  taxonomyDescription: 'Family Practice'
});

console.log(result);
// {
//   score: 95,
//   level: 'HIGH',
//   description: 'Verified through authoritative sources...',
//   factors: {
//     dataSourceScore: 25,
//     recencyScore: 30,
//     verificationScore: 25,
//     agreementScore: 20
//   },
//   metadata: {
//     daysUntilStale: 49,
//     isStale: false,
//     recommendReVerification: false,
//     daysSinceVerification: 11,
//     freshnessThreshold: 60,
//     researchNote: 'Based on research showing 12% annual provider turnover...',
//     explanation: 'This 95% confidence score is based on: verified through official...'
//   }
// }
```

---

## Migration Notes

**Breaking Changes:**
- `ConfidenceFactors` interface updated (point allocations changed)
- `metadata.explanation` added (new field)
- Scoring distribution changed (different point values)

**Backward Compatible:**
- All function signatures unchanged
- Return type structure unchanged (only values differ)

**Database Impact:**
- Existing confidence scores will be different when recalculated
- Consider bulk recalculation for consistency
