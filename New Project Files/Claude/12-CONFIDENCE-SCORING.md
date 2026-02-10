# Confidence Scoring Algorithm

This document describes the research-backed confidence scoring system used by VerifyMyProvider to assess the reliability of provider-insurance plan acceptance data.

---

## Overview

Every provider-plan acceptance record in VerifyMyProvider receives a confidence score from 0 to 100, calculated from four weighted factors. The algorithm is implemented in `packages/backend/src/services/confidenceService.ts` and is based on published research on provider directory accuracy and crowdsourced data reliability.

**Total Score**: 0-100 (sum of four factors, capped at 100)

| Factor | Max Points | Weight | What It Measures |
|--------|-----------|--------|-----------------|
| Data Source Quality | 25 | 25% | Authoritativeness of the data origin |
| Recency | 30 | 30% | How recently the data was verified |
| Verification Count | 25 | 25% | Number of independent verifications |
| Community Agreement | 20 | 20% | Consensus among community votes |

---

## Factor 1: Data Source Quality (0-25 Points)

Scores the authoritativeness of the data source. Official government data scores highest; automated scraping scores lowest.

| Source | Score | Rationale |
|--------|-------|-----------|
| `CMS_NPPES` | 25 | Official CMS data -- most authoritative |
| `CMS_PLAN_FINDER` | 25 | Official CMS data |
| `CMS_DATA` | 25 | Legacy enum for CMS data |
| `NPPES_SYNC` | 25 | Official CMS data via NPPES API |
| `CARRIER_API` | 20 | Insurance carrier data -- provider-verified |
| `PROVIDER_PORTAL` | 20 | Provider-verified directly |
| `CARRIER_DATA` | 20 | Legacy enum for carrier data |
| `CARRIER_SCRAPE` | 20 | Carrier website data |
| `USER_UPLOAD` | 15 | User-provided evidence |
| `PHONE_CALL` | 15 | Community verified via phone |
| `CROWDSOURCE` | 15 | Community-only verification |
| `NETWORK_CROSSREF` | 15 | Inferred from network IDs |
| `AUTOMATED` | 10 | Automated checks -- least reliable |
| Unknown / null | 10 | Default for missing source information |

---

## Factor 2: Recency (0-30 Points)

Scores how recently the data was verified, using **specialty-specific freshness thresholds** based on research showing different provider turnover rates by specialty type.

### Specialty-Specific Freshness Thresholds

| Specialty Category | Freshness Threshold | Research Basis |
|-------------------|-------------------|----------------|
| **Mental Health** | 30 days | Only 43% of mental health providers accept Medicaid; highest network churn |
| **Primary Care** | 60 days | 12% annual turnover rate (Ndumele et al. 2018, Health Affairs) |
| **Specialist** | 60 days | Similar turnover to primary care |
| **Hospital-Based** | 90 days | More stable institutional positions (radiology, anesthesiology, pathology, emergency medicine) |
| **Other** | 60 days | Default threshold |

### Specialty Classification

The system maps provider specialty strings and taxonomy descriptions to categories using keyword matching:

- **Mental Health**: psychiatr*, psycholog*, mental health, behavioral health, counselor, therapist
- **Primary Care**: family medicine, family practice, internal medicine, general practice, primary care
- **Hospital-Based**: hospital, radiology, anesthesiology, pathology, emergency medicine
- **Specialist**: All other specialties

### Recency Scoring Tiers

The tier boundaries are dynamically calculated from the specialty-specific threshold:

| Tier | Days Since Verification | Points | Calculation |
|------|------------------------|--------|-------------|
| Very Fresh | 0 to threshold * 0.5 | 30 | e.g., 0-15 days for mental health, 0-30 for primary care |
| Recent | threshold * 0.5 to threshold | 20 | e.g., 15-30 days for mental health, 30-60 for primary care |
| Aging | threshold to threshold * 1.5 | 10 | e.g., 30-45 days for mental health, 60-90 for primary care |
| Stale | threshold * 1.5 to 180 days | 5 | Any specialty |
| Very Stale | 180+ days | 0 | Fixed cutoff regardless of specialty |
| Never Verified | null | 0 | No verification data exists |

---

## Factor 3: Verification Count (0-25 Points)

Scores based on the number of independent verifications, with a key threshold at 3 verifications based on published research.

| Verifications | Points | Rationale |
|--------------|--------|-----------|
| 0 | 0 | No data |
| 1 | 10 | Single verification -- could be an outlier |
| 2 | 15 | Getting close but not yet optimal |
| 3+ | 25 | Expert-level accuracy achieved |

### Research Basis
Mortensen et al. (2015), published in JAMIA (Journal of the American Medical Informatics Association):
- Crowdsourced verification achieves kappa = 0.58 (expert-level inter-rater agreement)
- Expert validation achieves kappa = 0.59 (nearly identical accuracy)
- **3 verifications is the optimal threshold** -- additional verifications beyond 3 show no significant accuracy improvement
- This finding justifies the steep jump from 15 points (2 verifications) to 25 points (3 verifications)

---

## Factor 4: Community Agreement (0-20 Points)

Scores the consensus level among community votes (upvotes vs downvotes) on verification records.

| Agreement Ratio | Points | Level |
|----------------|--------|-------|
| 100% (all upvotes) | 20 | Complete consensus |
| 80-99% | 15 | Strong consensus |
| 60-79% | 10 | Moderate consensus |
| 40-59% | 5 | Weak consensus |
| Below 40% | 0 | Conflicting data -- unreliable |
| No votes | 0 | No community feedback |

Agreement ratio is calculated as: `upvotes / (upvotes + downvotes)`

---

## Confidence Levels

The numeric score (0-100) maps to a human-readable confidence level. Importantly, **confidence level is capped when verification count is below 3**, regardless of numeric score.

### With 3+ Verifications (Full Scale)

| Score Range | Level | Description |
|------------|-------|-------------|
| 91-100 | `VERY_HIGH` | Verified through multiple authoritative sources with expert-level accuracy |
| 76-90 | `HIGH` | Verified through authoritative sources or multiple community verifications |
| 51-75 | `MEDIUM` | Some verification exists, but may need confirmation |
| 26-50 | `LOW` | Limited verification data. Call provider to confirm before visiting |
| 0-25 | `VERY_LOW` | Unverified or potentially inaccurate. Always call to confirm |

### With Fewer Than 3 Verifications (Capped at MEDIUM)

| Score Range | Level | Note |
|------------|-------|------|
| 76-100 | `MEDIUM` (capped) | Would be HIGH/VERY_HIGH with more verifications |
| 51-75 | `MEDIUM` | Standard |
| 26-50 | `LOW` | Standard |
| 0-25 | `VERY_LOW` | Standard |

This capping ensures that even high-scoring records from authoritative sources encourage additional community verification before displaying strong confidence.

---

## Score Metadata

Every confidence calculation returns rich metadata alongside the numeric score:

```typescript
interface ConfidenceResult {
  score: number;           // 0-100 numeric score
  level: string;           // VERY_HIGH, HIGH, MEDIUM, LOW, VERY_LOW
  description: string;     // Human-readable level description
  factors: {
    dataSourceScore: number;    // 0-25
    recencyScore: number;       // 0-30
    verificationScore: number;  // 0-25
    agreementScore: number;     // 0-20
  };
  metadata: {
    daysUntilStale: number;            // Days until data becomes stale
    isStale: boolean;                  // Whether data has exceeded freshness threshold
    recommendReVerification: boolean;  // True if within 80% of freshness threshold
    daysSinceVerification: number | null;
    freshnessThreshold: number;        // Specialty-specific threshold in days
    researchNote: string;              // Research citation for this specialty
    explanation: string;               // Human-readable explanation of score factors
  };
}
```

### Example Explanation Output
> "This 65% confidence score is based on: verified through official CMS data, aging data (75 days old), 2 verifications (1 more needed for expert-level accuracy), strong community consensus. Research shows primary care providers have 12% annual network turnover."

---

## Confidence Decay Service

**File**: `packages/backend/src/services/confidenceDecayService.ts`

Proactively recalculates confidence scores across all verified records to apply time-based decay, so search results always show accurate scores rather than only decaying on individual provider page views.

### Admin Endpoint
`POST /api/v1/admin/recalculate-confidence`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | query | `false` | Preview changes without writing |
| `limit` | query | all | Max records to process |

### Process
1. Fetches all `ProviderPlanAcceptance` records with `verificationCount >= 1` in batches of 100
2. For each record, aggregates upvotes/downvotes from non-expired `VerificationLog` entries
3. Recalculates confidence score using `calculateConfidenceScore()`
4. Updates the record if the score has changed
5. Reports statistics: processed, updated, unchanged, errors, duration

### Designed for Scheduled Execution
This endpoint is intended to be called by GCP Cloud Scheduler (e.g., daily) to keep scores accurate across all records without waiting for individual page views.

---

## Frontend Components

The confidence scoring system is surfaced through several frontend components:

| Component | File | Purpose |
|-----------|------|---------|
| `ConfidenceGauge` | `components/provider-detail/ConfidenceGauge.tsx` | Visual circular gauge (0-100) with color coding |
| `ScoreBreakdown` | `components/provider-detail/ScoreBreakdown.tsx` | Factor-by-factor score breakdown with progress bars |
| `ConfidenceBadge` | `components/ConfidenceBadge.tsx` | Small inline badge showing level (VERY_HIGH, HIGH, etc.) |
| `ConfidenceScoreExplainer` | `components/provider/ConfidenceScoreExplainer.tsx` | Educational explainer describing the methodology |
| `FreshnessWarning` | `components/FreshnessWarning.tsx` | Warning banner when `isStale` is true |
| `ConfidenceScoreBreakdown` | `components/ConfidenceScoreBreakdown.tsx` | Detailed score breakdown for search results |

---

## Helper: Acceptance Enrichment

The `enrichAcceptanceWithConfidence()` helper function in `confidenceService.ts` standardizes confidence calculation for acceptance records across multiple route handlers, eliminating duplicated calculation logic:

```typescript
function enrichAcceptanceWithConfidence<T>(
  acceptance: T,
  options?: { upvotes, downvotes, specialty, taxonomyDescription }
): T & { confidenceLevel, confidenceDescription, confidence: ConfidenceResult }
```

This function is used in provider detail, plan detail, and verification endpoints to ensure consistent score calculation.
