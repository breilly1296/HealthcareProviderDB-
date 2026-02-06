---
tags:
  - algorithm
  - implemented
  - high
type: prompt
priority: 2
updated: 2026-02-05
---

# Confidence Scoring Algorithm Review

## Files to Review
- `packages/backend/src/services/confidenceService.ts` (main confidence algorithm)
- `packages/backend/src/services/__tests__/confidenceService.test.ts` (comprehensive tests)
- `packages/backend/src/services/verificationService.ts` (score updates on verification)
- `packages/backend/prisma/schema.prisma` (ProviderPlanAcceptance.confidenceScore field)

## VerifyMyProvider Confidence Scoring
- **Algorithm:** 0-100 scale combining 4 factors
- **Status:** Implemented and tested
- **Purpose:** Transparent data quality indicator (competitive differentiator)
- **Key Feature:** Specialty-specific freshness thresholds based on research
- **Research Basis:** Mortensen et al. (2015), JAMIA; Ndumele et al. (2018), Health Affairs

## Checklist

### 1. Algorithm Components (0-100 scale)

**Data Source Quality (0-25 points):**

Scores based on source authoritativeness. Covers both `DataSource` and `VerificationSource` enum values:

| Source | Points | Notes |
|---|---|---|
| CMS_NPPES / CMS_PLAN_FINDER / CMS_DATA | 25 | Official CMS data (most authoritative) |
| CARRIER_API / CARRIER_DATA | 20 | Insurance carrier data |
| PROVIDER_PORTAL | 20 | Provider self-reported |
| USER_UPLOAD / PHONE_CALL / CROWDSOURCE | 15 | Community verified |
| AUTOMATED | 10 | Automated checks |
| Unknown/null source | 10 | Default fallback |

- [x] Source scoring implemented with `DATA_SOURCE_SCORES` lookup
- [x] Handles both DataSource and VerificationSource enum values
- [x] Default of 10 points for unknown sources

**Recency Score (0-30 points):**

Tiered scoring with **specialty-specific freshness thresholds** based on research showing different churn rates by specialty:

| Specialty Category | Freshness Threshold | Research Basis |
|---|---|---|
| Mental Health | 30 days | 43% Medicaid acceptance, high churn (Ndumele et al. 2018) |
| Primary Care | 60 days | 12% annual turnover |
| Specialist | 60 days | Similar to primary care |
| Hospital-Based | 90 days | More stable positions |
| Other | 60 days | Default |

Tier boundaries are calculated from the specialty's freshness threshold:
- **Tier 1** (30 pts): 0 to `threshold * 0.5` days
- **Tier 2** (20 pts): `threshold * 0.5` to `threshold` days
- **Tier 3** (10 pts): `threshold` to `threshold * 1.5` days
- **Tier 4** (5 pts): `threshold * 1.5` to 180 days
- **Tier 5** (0 pts): 180+ days (always 0)
- **No verification date**: 0 points

Specialty detection uses keyword matching on `specialty` and `taxonomyDescription`:
- Mental Health: psychiatr*, psycholog*, mental health, behavioral health, counselor, therapist
- Primary Care: family medicine, family practice, internal medicine, general practice, primary care
- Hospital-Based: hospital, radiology, anesthesiology, pathology, emergency medicine
- All others: Specialist (default)

- [x] Specialty-specific thresholds implemented
- [x] Keyword-based specialty category detection
- [x] Tiered decay with specialty-adjusted boundaries

**Verification Count Score (0-25 points):**

Based on Mortensen et al. (2015): 3 verifications achieve expert-level accuracy (kappa=0.58).

| Verification Count | Points | Rationale |
|---|---|---|
| 0 | 0 | No data |
| 1 | 10 | Single verification — could be outlier |
| 2 | 15 | Getting there, not optimal |
| 3+ | 25 | Expert-level accuracy achieved |

- [x] 3-verification threshold from research
- [x] Score jumps from 15→25 at the research-backed threshold

**Community Agreement Score (0-20 points):**

Based on upvote/downvote ratio:

| Agreement % | Points | Label |
|---|---|---|
| 100% | 20 | Complete consensus |
| 80-99% | 15 | Strong consensus |
| 60-79% | 10 | Moderate consensus |
| 40-59% | 5 | Weak consensus |
| <40% | 0 | Conflicting data |
| No votes | 0 | No community input |

- [x] Agreement ratio calculated as `upvotes / (upvotes + downvotes)`
- [x] 0 points for no votes (not penalized, just no bonus)

### 2. Confidence Levels

The level system uses **verification-count-aware thresholds**. With fewer than 3 verifications, the maximum level is capped at MEDIUM regardless of score:

**With 3+ verifications (standard):**
| Score | Level |
|---|---|
| 91-100 | VERY_HIGH |
| 76-90 | HIGH |
| 51-75 | MEDIUM |
| 26-50 | LOW |
| 0-25 | VERY_LOW |

**With 1-2 verifications (capped):**
| Score | Level |
|---|---|
| 51+ | MEDIUM (capped) |
| 26-50 | LOW |
| 0-25 | VERY_LOW |

- [x] Research-backed capping of confidence level below 3 verifications
- [x] Level descriptions include research notes when below threshold

### 3. Score Metadata

Each confidence calculation returns rich metadata:
- `daysUntilStale` — days remaining before data is considered stale
- `isStale` — boolean flag when past freshness threshold
- `recommendReVerification` — true when stale OR within 80% of threshold
- `daysSinceVerification` — null if never verified
- `freshnessThreshold` — specialty-specific threshold used
- `researchNote` — specialty-specific research citation
- `explanation` — human-readable sentence explaining the score breakdown

- [x] All metadata fields implemented
- [x] Human-readable explanations generated

### 4. Example Calculations

**Example 1: Fresh CMS data, mental health provider, no community input**
- Data source: 25 (CMS_DATA)
- Recency: 30 (0 days, threshold 30)
- Verification: 0 (no verifications)
- Agreement: 0 (no votes)
- **Total: 55** → Level: MEDIUM (capped — 0 verifications)

**Example 2: User-verified primary care, 3 verifications, unanimous**
- Data source: 15 (CROWDSOURCE)
- Recency: 30 (verified today, threshold 60)
- Verification: 25 (3 verifications — expert-level)
- Agreement: 20 (100% agree)
- **Total: 90** → Level: HIGH

**Example 3: Old carrier data, hospital-based, conflicting votes**
- Data source: 20 (CARRIER_DATA)
- Recency: 5 (150 days, threshold 90 → between tier3=135 and tier4=180)
- Verification: 15 (2 verifications)
- Agreement: 0 (50/50 split)
- **Total: 40** → Level: LOW (capped — <3 verifications)

### 5. Score Update Logic

When a new verification is submitted (`verificationService.ts`):
1. Query past verifications for this NPI + planId
2. Count agreements (how many say "accepted"?)
3. Count total verifications
4. Recalculate all 4 components via `calculateConfidenceScore()`
5. Update `ProviderPlanAcceptance.confidenceScore`

Helper: `enrichAcceptanceWithConfidence()` — attaches full confidence breakdown to acceptance records for API responses.

- [x] Score recalculated on each new verification
- [x] Agreement percentage recalculated from all verifications
- [x] Recency updated to current date
- [x] Score increases for positive verifications
- [x] enrichAcceptanceWithConfidence helper eliminates duplicate calculation patterns

### 6. Frontend Display

**Confidence Gauge:** Visual gauge component (`ConfidenceGauge.tsx`)
**Score Breakdown:** Factor-by-factor display (`ScoreBreakdown.tsx`)
**Confidence Badge:** Compact badge (`ConfidenceBadge.tsx`)
**Explainer:** Educational component (`ConfidenceScoreExplainer.tsx`)
**Freshness Warning:** Stale data warning (`FreshnessWarning.tsx`)

- [x] Visual confidence gauge
- [x] Score breakdown by factor
- [x] Confidence badge for compact display
- [x] Freshness warning for stale data

### 7. Confidence Decay (Implemented)

**File:** `packages/backend/src/services/confidenceDecayService.ts`

**Admin Endpoint:** `POST /api/v1/admin/recalculate-confidence` (supports `dryRun` and `limit` params)

The `confidenceDecayService` proactively recalculates confidence scores with time-based decay:

- [x] `recalculateAllConfidenceScores()` — batch recalculation for all acceptances with verifications
- [x] Fetches provider specialty for specialty-specific decay rates
- [x] Aggregates upvotes/downvotes from related VerificationLog entries
- [x] Only considers non-expired verifications
- [x] Supports dry-run mode for preview without writing
- [x] Cursor-based pagination with configurable batch size
- [x] Progress callback support for monitoring
- [x] Returns stats: `{ processed, updated, unchanged, errors, durationMs }`

## Questions to Ask

1. **Should we implement confidence decay background job now or later?**
   - Pros: Automatic aging of data, scores reflect current freshness
   - Cons: Added complexity, cron job needed, database load
   - Alternative: Recalculate on-demand when record is accessed

2. **Should minimum confidence threshold be enforced?**
   - Hide providers with confidence <30?
   - Or show all with color coding?

3. **How should we handle conflicting verifications?**
   - Flag for manual review after N conflicts?
   - Weight by verification age (newer = more trusted)?

4. **Should we display the full score breakdown to users?**
   - Currently: Multiple components for different detail levels
   - Question: Is it confusing or empowering?

5. **Are the specialty-specific thresholds correctly calibrated?**
   - Mental health 30 days may be too aggressive
   - Hospital-based 90 days may be too lenient
