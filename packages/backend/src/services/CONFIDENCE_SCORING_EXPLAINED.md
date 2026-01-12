# Research-Based Confidence Scoring System

## Overview
Our confidence scoring system is built on peer-reviewed research to provide accurate reliability ratings for provider directory information.

## Research Foundation

### 1. Specialty-Specific Freshness Thresholds
**Source:** Ndumele et al. (2018), *Health Affairs*

Provider networks have different churn rates by specialty:

| Specialty Category | Threshold | Research Basis |
|-------------------|-----------|----------------|
| **Mental Health** | 30 days | Only 43% of psychiatrists accept Medicaid; high network turnover |
| **Primary Care** | 60 days | 12% annual turnover rate in Medicaid managed care |
| **Specialists** | 60 days | Similar turnover to primary care (~12% annually) |
| **Hospital-Based** | 90 days | More stable positions (radiology, anesthesiology, pathology) |

### 2. 3-Verification Minimum
**Source:** Mortensen et al. (2015), *Journal of the American Medical Informatics Association*

Crowdsourced medical information validation shows:
- **Crowd-expert agreement:** κ=0.58 (expert-level)
- **Expert-expert agreement:** κ=0.59
- **Optimal verification count:** 3 verifications

This means just 3 patient verifications achieve the same accuracy as having medical experts review the information.

## Scoring Algorithm

### Total Score: 0-100 Points

#### 1. Data Source Score (0-30 points)
- **CMS NPPES:** 30 points (official government registry)
- **CMS Plan Finder:** 28 points
- **Carrier API:** 26-28 points
- **Provider Portal:** 25 points
- **Phone Call:** 22 points
- **User Upload:** 20 points
- **Automated:** 15 points
- **Crowdsource:** 10 points (base, enhanced by verification count)

#### 2. Recency Score (0-25 points)
**Specialty-specific decay:**

```
Days since verification vs Threshold:
├─ < threshold:           25 points (FRESH ✓)
├─ threshold to 2x:       Linear decay to 0
└─ > 2x threshold:        0 points (TOO STALE ✗)
```

**Examples:**
- **Mental Health (30-day threshold)**
  - 20 days old: 25 points ✓
  - 45 days old: 12 points (halfway between 30-60)
  - 70 days old: 0 points ✗

- **Primary Care (60-day threshold)**
  - 45 days old: 25 points ✓
  - 90 days old: 12.5 points (halfway between 60-120)
  - 125 days old: 0 points ✗

- **Hospital-Based (90-day threshold)**
  - 60 days old: 25 points ✓
  - 135 days old: 12.5 points (halfway between 90-180)
  - 185 days old: 0 points ✗

#### 3. Verification Score (0-25 points)
**Research-based thresholds:**

```
Verification Count → Score:
├─ 0 verifications:     0 points  (Unverified)
├─ 1 verification:      8 points  (Low confidence)
├─ 2 verifications:    12 points  (Below optimal)
├─ 3 verifications:    20 points  (OPTIMAL - expert-level accuracy) ✓
├─ 4-5 verifications:  23 points  (Above optimal)
└─ 6+ verifications:   25 points  (Very high confidence)
```

**Key:** 3 verifications is the research-validated sweet spot (κ=0.58 vs 0.59 expert agreement)

#### 4. Agreement Score (0-20 points)
Based on community upvote/downvote ratio:

```
Upvote Ratio → Base Score:
├─ ≥ 90%:    20 points
├─ ≥ 80%:    16 points
├─ ≥ 70%:    12 points
├─ ≥ 60%:     8 points
├─ ≥ 50%:     4 points
└─ < 50%:     0 points

Final Score = Base Score × (min(totalVotes, 5) / 5)
```

## Confidence Levels

### With ≥3 Verifications (Expert-Level)
- **91-100:** VERY HIGH
- **76-90:** HIGH
- **51-75:** MEDIUM
- **26-50:** LOW
- **0-25:** VERY LOW

### With <3 Verifications (Below Research Threshold)
Maximum level is capped at MEDIUM regardless of score, because research shows <3 verifications don't achieve expert-level accuracy.

## Metadata Fields

Every confidence score includes:

```typescript
{
  score: 87,                        // 0-100
  level: "VERY_HIGH",               // Confidence label
  description: "Verified through...", // User-friendly explanation
  factors: {
    dataSourceScore: 28,            // Breakdown of score
    recencyScore: 25,
    verificationScore: 20,
    agreementScore: 14
  },
  metadata: {
    daysUntilStale: 15,             // Days remaining before stale
    isStale: false,                 // Has it passed threshold?
    recommendReVerification: false,  // Should user re-verify?
    daysSinceVerification: 45,      // Actual age of data
    freshnessThreshold: 60,         // Specialty-specific threshold
    researchNote: "Based on research showing 12% annual provider turnover..."
  }
}
```

## Specialty Detection

The system automatically detects specialty category from:
- Provider `specialtyCategory` field
- Provider `taxonomyDescription` field

### Detection Logic

**Mental Health:**
```
Keywords: psychiatr, psycholog, mental health, behavioral health,
          counselor, therapist
```

**Primary Care:**
```
Keywords: family medicine, family practice, internal medicine,
          general practice, primary care
```

**Hospital-Based:**
```
Keywords: hospital, radiology, anesthesiology, pathology,
          emergency medicine
```

**Specialist (Default):**
```
All other specialties
```

## Real-World Examples

### Example 1: High-Confidence Primary Care Provider
```typescript
{
  dataSource: "CMS_NPPES",          // +28 points
  lastVerifiedAt: 20 days ago,      // +25 points (< 60-day threshold)
  verificationCount: 4,              // +23 points (above optimal 3)
  upvotes: 5,                        // +20 points (100% agreement)
  downvotes: 0,
  specialty: "PRIMARY_CARE"
}

Result:
- Score: 96 (VERY HIGH)
- Fresh: Yes (20 < 60 days)
- Research note: "Based on research showing 12% annual provider
  turnover in primary care."
```

### Example 2: Stale Mental Health Provider
```typescript
{
  dataSource: "CROWDSOURCE",         // +10 points
  lastVerifiedAt: 75 days ago,       // +0 points (> 2x 30-day threshold)
  verificationCount: 1,               // +8 points (low confidence)
  upvotes: 1,                         // +4 points (poor agreement)
  downvotes: 1,
  specialty: "MENTAL_HEALTH"
}

Result:
- Score: 22 (VERY LOW)
- Stale: Yes (75 > 30 days)
- Recommend re-verification: Yes
- Research note: "Mental health providers show high network turnover.
  Research shows only 43% accept Medicaid. Research shows 3 verifications
  achieve expert-level accuracy (κ=0.58)."
```

### Example 3: Well-Verified Hospital Provider
```typescript
{
  dataSource: "CARRIER_API",         // +28 points
  lastVerifiedAt: 85 days ago,       // +25 points (< 90-day threshold)
  verificationCount: 6,               // +25 points (very high)
  upvotes: 8,                         // +20 points (100% agreement)
  downvotes: 0,
  specialty: "HOSPITAL_BASED"
}

Result:
- Score: 98 (VERY HIGH)
- Fresh: Yes (85 < 90 days)
- Research note: "Hospital-based providers typically have more stable
  network participation than other specialties."
```

## Implementation Notes

### Why These Thresholds?

**Mental Health (30 days):**
- Highest network churn
- Only 43% of psychiatrists accept Medicaid
- Patients most likely to encounter surprise denials

**Primary Care (60 days):**
- 12% annual turnover = ~1% per month
- Balances freshness with verification frequency

**Hospital-Based (90 days):**
- More stable employment
- Less likely to drop insurance networks
- Institutional stability

### Why 3 Verifications?

Research (Mortensen et al. 2015) tested crowdsourced medical information validation:
- 1 verification: Insufficient agreement
- 2 verifications: Better but still variable
- **3 verifications: κ=0.58 (matches expert-expert agreement of κ=0.59)**
- 4+ verifications: Marginal improvement, not worth the cost

### Why Zero Points After 2x Threshold?

Network churn research shows exponential decay in accuracy:
- **< threshold:** Fresh, reliable
- **threshold to 2x:** Increasingly unreliable
- **> 2x threshold:** So stale that it provides false confidence

Better to show 0 points and force re-verification than to give users a false sense of security.

## API Response Format

```json
{
  "success": true,
  "data": {
    "provider": {
      "npi": "1234567890",
      "displayName": "Dr. Jane Smith",
      "specialtyCategory": "PRIMARY_CARE",
      "planAcceptances": [
        {
          "planId": "BCBS-MA-001",
          "planName": "Blue Cross Blue Shield MA",
          "acceptsInsurance": true,
          "confidenceScore": 87,
          "confidenceLevel": "VERY_HIGH",
          "confidenceDescription": "Verified through authoritative sources or multiple community verifications.",
          "metadata": {
            "daysUntilStale": 15,
            "isStale": false,
            "recommendReVerification": false,
            "daysSinceVerification": 45,
            "freshnessThreshold": 60,
            "researchNote": "Based on research showing 12% annual provider turnover in primary care."
          }
        }
      ]
    }
  }
}
```

## References

1. **Ndumele, C.D., et al. (2018).** "Network Optimization And The Continuity Of Physicians In Medicaid Managed Care." *Health Affairs*, 37(6).
   - 12% annual turnover in primary care
   - 43% Medicaid acceptance for psychiatrists
   - Specialty-specific churn rates

2. **Mortensen, J.M., et al. (2015).** "Using the Wisdom of the Crowds to Find Critical Errors in Biomedical Ontologies: A Study of SNOMED CT." *Journal of the American Medical Informatics Association*, 22(3).
   - Crowdsourced validation: κ=0.58
   - Expert validation: κ=0.59
   - Optimal verification count: 3

3. **Haeder, S.F. & Xu, W.Y. (2024).** "Consumer Experiences Navigating Health Care Provider Directories." *World Medical & Health Policy*.
   - 46-77% directory inaccuracy rates
   - 4x surprise bills with inaccurate directories

4. **Haeder, S.F. & Zhu, J.M. (2024).** "Inaccuracies in provider directories persist for long periods of time." *Health Affairs Scholar*, 2(6).
   - 540-day average correction lag
   - Only 11.6% corrected in 4-9 months
