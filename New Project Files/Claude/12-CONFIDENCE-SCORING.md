# Confidence Scoring Algorithm -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/12-confidence-scoring.md
**Status:** Strongly implemented. Core algorithm, metadata, verification integration, and frontend components all present. Test suite exists. Minor schema deviation in `taxonomy_reference`. Confidence decay background job remains unimplemented (acknowledged as future work in prompt).

---

## Findings

### 1. Algorithm Components (0-100 scale)

**Data Source Quality (0-25 points):**

- **[VERIFIED]** `DATA_SOURCE_SCORES` lookup is implemented at line 61-78 of `confidenceService.ts`. All six prompt-specified sources are present with correct point values: CMS_NPPES/CMS_PLAN_FINDER = 25, CARRIER_API = 20, PROVIDER_PORTAL = 20, USER_UPLOAD/PHONE_CALL/CROWDSOURCE = 15, AUTOMATED = 10.
- **[VERIFIED]** Handles both `DataSource` and `VerificationSource` enum values. Legacy values `CMS_DATA` (25) and `CARRIER_DATA` (20) are included.
- **[VERIFIED]** Default of 10 points for unknown/null sources (line 230-231: `if (!source) return 10; return DATA_SOURCE_SCORES[source] ?? 10;`).
- **[VERIFIED]** Additional enrichment pipeline sources added beyond prompt spec: `NPPES_SYNC` (25), `CARRIER_SCRAPE` (20), `NETWORK_CROSSREF` (15). This is an enhancement, not a deviation.

**Recency Score (0-30 points):**

- **[VERIFIED]** Specialty-specific freshness thresholds implemented via `VERIFICATION_FRESHNESS` record (lines 47-53): MENTAL_HEALTH=30, PRIMARY_CARE=60, SPECIALIST=60, HOSPITAL_BASED=90, OTHER=60. All match the prompt exactly.
- **[VERIFIED]** Tiered decay with specialty-adjusted boundaries (lines 269-278):
  - Tier 1 (30 pts): 0 to `threshold * 0.5` -- matches prompt
  - Tier 2 (20 pts): `threshold * 0.5` to `threshold` -- matches prompt
  - Tier 3 (10 pts): `threshold` to `threshold * 1.5` -- matches prompt
  - Tier 4 (5 pts): `threshold * 1.5` to 180 -- matches prompt
  - Tier 5 (0 pts): 180+ days -- matches prompt
- **[WARNING]** Tier 1 boundary has a `Math.min(30, ...)` cap at line 269: `const tier1 = Math.min(30, freshnessThreshold * 0.5);`. This means for the default 60-day threshold, tier1 = min(30, 30) = 30, which matches. For hospital-based (90-day), tier1 = min(30, 45) = 30. The prompt says tier1 should be `threshold * 0.5` (which would be 45 for hospital-based), but the code caps it at 30 days. This means hospital-based providers get the same Tier 1 window as standard providers (30 days instead of 45). This is a minor deviation that makes the scoring slightly more aggressive for hospital-based providers.
- **[VERIFIED]** Returns 0 for null `lastVerifiedAt` (line 257).
- **[VERIFIED]** Keyword-based specialty category detection (lines 84-126) matches all prompt keywords: psychiatr*, psycholog*, mental health, behavioral health, counselor, therapist for MENTAL_HEALTH; family medicine, family practice, internal medicine, general practice, primary care for PRIMARY_CARE; hospital, radiology, anesthesiology, pathology, emergency medicine for HOSPITAL_BASED.

**Verification Count Score (0-25 points):**

- **[VERIFIED]** Scoring exactly matches the prompt (lines 297-302): 0=0pts, 1=10pts, 2=15pts, 3+=25pts.
- **[VERIFIED]** 3-verification threshold from Mortensen et al. (2015) research is referenced in comments and via `MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE = 3` constant.

**Community Agreement Score (0-20 points):**

- **[VERIFIED]** Agreement ratio calculated as `upvotes / (upvotes + downvotes)` (line 323).
- **[VERIFIED]** Scoring tiers match the prompt exactly (lines 326-330): 100%=20, 80-99%=15, 60-79%=10, 40-59%=5, <40%=0.
- **[VERIFIED]** 0 points for no votes (line 320: `if (totalVotes === 0) return 0;`).

**Weight Verification (25/30/25/20):**

- **[VERIFIED]** The four components sum to 100 maximum: dataSourceScore (0-25) + recencyScore (0-30) + verificationScore (0-25) + agreementScore (0-20) = 0-100. The `Math.min(100, ...)` guard at line 157 confirms the intended cap.

### 2. Confidence Levels

- **[VERIFIED]** Standard thresholds with 3+ verifications (lines 433-438): 91-100=VERY_HIGH, 76-90=HIGH, 51-75=MEDIUM, 26-50=LOW, 0-25=VERY_LOW. Matches prompt.
- **[VERIFIED]** Verification-count-aware capping (lines 425-431): With 1-2 verifications (`verificationCount > 0` and `< 3`), max level is MEDIUM. Score >= 51 returns MEDIUM, 26-50 returns LOW, 0-25 returns VERY_LOW. Matches prompt.
- **[WARNING]** The capping logic has a code style note: lines 427-428 have two separate conditions (`score >= 76` and `score >= 51`) both returning MEDIUM. The first is redundant since `score >= 76` is a subset of `score >= 51`. Functionally correct but could be simplified.
- **[VERIFIED]** Zero verifications are NOT handled by the capping branch (the condition requires `verificationCount > 0`). With 0 verifications, standard thresholds apply. This matches the prompt's Example 1 where a score of 55 with 0 verifications gives MEDIUM (not capped by the 1-2 verification branch, but the prompt says "capped -- 0 verifications"). However, looking more carefully: the prompt says the result is "MEDIUM (capped -- 0 verifications)" but the code would actually apply standard scoring (since `verificationCount > 0` is false). A score of 55 with standard scoring = MEDIUM. So the end result is the same, but the logic path differs. The 0-verification case gets MEDIUM through standard scoring, not through capping.
- **[VERIFIED]** Level descriptions include research notes when below threshold (lines 446-449).

### 3. Score Metadata

- **[VERIFIED]** `daysUntilStale` -- implemented (line 171-172).
- **[VERIFIED]** `isStale` -- implemented (line 170).
- **[VERIFIED]** `recommendReVerification` -- implemented (lines 174-175), triggers when stale OR when `daysSinceVerification > freshnessThreshold * 0.8` (80% threshold) OR when never verified.
- **[VERIFIED]** `daysSinceVerification` -- null if never verified (lines 144-148).
- **[VERIFIED]** `freshnessThreshold` -- returned in metadata (line 216).
- **[VERIFIED]** `researchNote` -- specialty-specific research citation with additional note for < 3 verifications (lines 178-193).
- **[VERIFIED]** `explanation` -- human-readable score explanation generated via `generateScoreExplanation()` (lines 337-416).

### 4. Example Calculations

- **[VERIFIED]** Example 1 (Fresh CMS, mental health, 0 verifications): dataSource=25 (CMS_DATA) + recency=30 (0 days, threshold 30, tier1=15) + verification=0 + agreement=0 = 55. Level: MEDIUM via standard path (not capping path, since verificationCount=0). Result matches prompt.
- **[VERIFIED]** Example 2 (User-verified primary care, 3 verifications, unanimous): dataSource=15 (CROWDSOURCE) + recency=30 (today, threshold 60) + verification=25 (3+) + agreement=20 (100%) = 90. Level: HIGH (3+ verifications, standard scoring, 76-90). Matches prompt.
- **[VERIFIED]** Example 3 (Old carrier data, hospital-based, conflicting): dataSource=20 (CARRIER_DATA) + recency=5 (150 days: hospital tier3=135, tier4=180; 135<150<180 = tier4=5pts) + verification=15 (2 verifications) + agreement=0 (<40% from 50/50 split = 0pts) = 40. Level: LOW (capped, <3 verifications, score 26-50). Matches prompt. Note: the agreement for a 50/50 split is 0.5 = 50%, which falls in the 40-59% tier (5 pts, not 0). But the prompt says "50/50 split" yields 0 points. Re-checking: a 50/50 split means agreementRatio = 0.5 which is >= 0.4, so the code returns 5 points. This would make the total 45, not 40. This is a discrepancy between the prompt's expected calculation and the actual code behavior. However, the prompt description says "<40% agreement: 0 points" and labels the 50/50 case as "conflicting data", which suggests the prompt expected 50/50 to score 0. The code gives it 5 points.

### 5. Score Update Logic

- **[VERIFIED]** `verificationService.ts` calls `calculateConfidenceScore()` from `confidenceService.ts` on every new verification (lines 207-213 in the upsert function).
- **[VERIFIED]** Queries past verifications for NPI + planId (lines 126-134 via `countVerificationConsensus()`).
- **[VERIFIED]** Counts agreements and total verifications for consensus determination.
- **[VERIFIED]** Recalculates all 4 components via `calculateConfidenceScore()`.
- **[VERIFIED]** Updates `ProviderPlanAcceptance.confidenceScore` (line 228).
- **[VERIFIED]** `enrichAcceptanceWithConfidence()` helper exists (lines 479-511) to attach full confidence breakdown to acceptance records.
- **[VERIFIED]** Vote changes also trigger confidence recalculation (lines 527-547 in `voteOnVerification()`).

### 6. Frontend Display

- **[VERIFIED]** `ConfidenceGauge.tsx` exists at `packages/frontend/src/components/provider-detail/ConfidenceGauge.tsx`.
- **[VERIFIED]** `ScoreBreakdown.tsx` exists at `packages/frontend/src/components/provider-detail/ScoreBreakdown.tsx` (named `ScoreBreakdown` instead of prompt's `ScoreBreakdown` -- matches).
- **[VERIFIED]** `ConfidenceBadge.tsx` exists at `packages/frontend/src/components/ConfidenceBadge.tsx`.
- **[VERIFIED]** `ConfidenceScoreExplainer.tsx` exists at `packages/frontend/src/components/provider/ConfidenceScoreExplainer.tsx`.
- **[VERIFIED]** `FreshnessWarning.tsx` exists at `packages/frontend/src/components/FreshnessWarning.tsx`.
- **[VERIFIED]** Additional confidence-related component: `ConfidenceScoreBreakdown.tsx` at `packages/frontend/src/components/ConfidenceScoreBreakdown.tsx` and `ConfidenceSection.tsx` at `packages/frontend/src/components/home/ConfidenceSection.tsx`.

### 7. Confidence Decay (Future Feature)

- **[CONFIRMED NOT IMPLEMENTED]** No background job for nightly confidence recalculation exists. This matches the prompt's `[ ]` unchecked items. The prompt acknowledges this as a future feature.

### 8. Test Suite

- **[VERIFIED]** Comprehensive test file exists at `packages/backend/src/services/__tests__/confidenceService.test.ts`. Uses Jest with fake timers for deterministic time-based tests. Tests cover data source scoring, recency scoring, verification count scoring, and agreement scoring.

### 9. Schema Verification

- **[VERIFIED]** `ProviderPlanAcceptance.confidenceScore` field exists in Prisma schema (line 181): `confidenceScore Int @default(0) @map("confidence_score")`.

### 10. Schema Deviation for `taxonomy_reference`

- **[WARNING]** The prompt's embedded schema snippet shows `taxonomy_reference` with fields: `code @id`, `specialization`, `classification`, `grouping`, `specialtyCategory @map("specialty_category")`. The actual schema (lines 142-150) has: `taxonomy_code @id`, `display_name`, `grouping_name`, `classification`, `specialization`, `standardized_name`, `provider_count`. Notable differences:
  - PK field is `taxonomy_code` (not `code`)
  - No `specialtyCategory` / `specialty_category` field
  - Additional fields: `display_name`, `standardized_name`, `provider_count`
  - `grouping` is named `grouping_name`
  - This deviation is relevant to Prompt 13 (NPI pipeline), not directly to the confidence scoring algorithm.

---

## Summary

The confidence scoring algorithm is comprehensively implemented and closely matches the prompt specification. All four scoring components (data source 0-25, recency 0-30, verification count 0-25, community agreement 0-20) are correctly weighted and functional. Specialty-specific freshness thresholds are research-backed and properly integrated. The level capping system correctly limits confidence to MEDIUM for 1-2 verifications. Rich metadata including staleness detection, re-verification recommendations, and human-readable explanations is fully implemented. The verification service properly recalculates confidence on each new verification and vote. All five frontend components (ConfidenceGauge, ScoreBreakdown, ConfidenceBadge, ConfidenceScoreExplainer, FreshnessWarning) exist in the codebase.

Two minor discrepancies were identified: (1) a `Math.min(30, ...)` cap on tier 1 boundaries that slightly affects hospital-based providers, and (2) the prompt's Example 3 expects 0 points for a 50/50 agreement split, but the code returns 5 points for that scenario (since 50% falls in the 40-59% tier). Neither affects the overall architectural soundness of the implementation.

---

## Recommendations

1. **Verify Example 3 Agreement Calculation:** The prompt states a 50/50 split should yield 0 points (labeled "conflicting data"), but the code gives 5 points for 50% agreement. Decide whether the code or the prompt is authoritative. If 50/50 should truly be "conflicting," change the `>=0.4` threshold to `>0.5` or add a special case for exact 50% splits.

2. **Simplify Redundant Capping Logic:** In `getConfidenceLevel()`, lines 427-428 both return MEDIUM for the <3 verification branch. The `score >= 76` check is redundant and can be removed for clarity.

3. **Consider Hospital-Based Tier 1 Cap:** The `Math.min(30, freshnessThreshold * 0.5)` means hospital-based providers (90-day threshold) get the same 30-day Tier 1 as standard specialties instead of 45 days. Decide if this was intentional.

4. **Zero-Verification Capping Path:** With 0 verifications, the capping branch is bypassed (requires `verificationCount > 0`). The end result is the same for typical scores, but the intent differs from the prompt's labeling of "capped -- 0 verifications." Consider whether 0-verification records should also be explicitly capped.

5. **Confidence Decay Background Job:** This remains the main unimplemented feature. Consider on-demand recalculation (at read time) as a lighter alternative to a nightly cron job, especially given the current database size and query patterns.

6. **Update Prompt Schema Snippet:** The `taxonomy_reference` schema shown in the prompt does not match the actual Prisma schema. Update the prompt to reflect the current field names (`taxonomy_code`, `display_name`, `grouping_name`, etc.).
