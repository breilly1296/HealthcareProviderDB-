# Confidence Scoring Algorithm Review

**Generated:** 2026-02-18
**Prompt:** 12-confidence-scoring.md
**Status:** FULLY IMPLEMENTED AND TESTED -- All four scoring components, specialty-specific thresholds, verification-count capping, confidence decay service, and admin recalculation endpoint verified against actual code.

---

## Algorithm Implementation Verification

### File: `packages/backend/src/services/confidenceService.ts`

#### 1. Data Source Quality Score (0-25 points)

**Verified `DATA_SOURCE_SCORES` lookup table (lines 87-104):**

| Source | Points | Verified |
|--------|--------|----------|
| `CMS_NPPES` | 25 | CONFIRMED |
| `CMS_PLAN_FINDER` | 25 | CONFIRMED |
| `CMS_DATA` | 25 | CONFIRMED (legacy alias) |
| `NPPES_SYNC` | 25 | CONFIRMED (enrichment pipeline) |
| `CARRIER_API` | 20 | CONFIRMED |
| `CARRIER_DATA` | 20 | CONFIRMED (legacy alias) |
| `CARRIER_SCRAPE` | 20 | CONFIRMED (enrichment pipeline) |
| `PROVIDER_PORTAL` | 20 | CONFIRMED |
| `USER_UPLOAD` | 15 | CONFIRMED |
| `PHONE_CALL` | 15 | CONFIRMED |
| `CROWDSOURCE` | 15 | CONFIRMED |
| `NETWORK_CROSSREF` | 15 | CONFIRMED (enrichment pipeline) |
| `AUTOMATED` | 10 | CONFIRMED |
| Unknown/null | 10 | CONFIRMED (default in `calculateDataSourceScore`, line 245) |

**Implementation detail:** `calculateDataSourceScore()` returns `DATA_SOURCE_SCORES[source] ?? 10` (line 245). The `??` nullish coalescing ensures any unknown source gets 10 points.

**Additional sources not in prompt:** `NPPES_SYNC`, `CARRIER_SCRAPE`, `NETWORK_CROSSREF` -- these were added for the enrichment pipeline and correctly map to appropriate authority levels.

#### 2. Recency Score (0-30 points)

**Verified `calculateRecencyScore()` function (lines 267-293):**

**Specialty-specific freshness thresholds (lines 47-53):**
| Specialty Category | Threshold (days) | Verified |
|-------------------|-------------------|----------|
| `MENTAL_HEALTH` | 30 | CONFIRMED |
| `PRIMARY_CARE` | 60 | CONFIRMED |
| `SPECIALIST` | 60 | CONFIRMED |
| `HOSPITAL_BASED` | 90 | CONFIRMED |
| `OTHER` | 60 | CONFIRMED |

**Tier boundaries (lines 283-292):**
| Tier | Points | Boundary | Verified |
|------|--------|----------|----------|
| Tier 1 | 30 | 0 to `min(30, threshold * 0.5)` days | CONFIRMED (line 283, 288) |
| Tier 2 | 20 | to `threshold` days | CONFIRMED (line 284, 289) |
| Tier 3 | 10 | to `threshold * 1.5` days | CONFIRMED (line 285, 290) |
| Tier 4 | 5 | to 180 days (fixed) | CONFIRMED (line 286, 291) |
| Tier 5 | 0 | 180+ days | CONFIRMED (line 292) |
| No verification | 0 | null `lastVerifiedAt` | CONFIRMED (line 271) |

**Specialty detection via `getSpecialtyFreshnessCategory()` (lines 110-152):**

Keyword matching on concatenated `specialty + taxonomyDescription` string (lowercased):

| Category | Keywords | Verified |
|----------|----------|----------|
| MENTAL_HEALTH | psychiatr*, psycholog*, mental health, behavioral health, counselor, therapist | CONFIRMED (lines 118-125) |
| PRIMARY_CARE | family medicine, family practice, internal medicine, general practice, primary care | CONFIRMED (lines 130-136) |
| HOSPITAL_BASED | hospital, radiology, anesthesiology, pathology, emergency medicine | CONFIRMED (lines 140-147) |
| SPECIALIST | all others (default) | CONFIRMED (line 151) |

**Note:** The Tier 1 boundary has a `Math.min(30, freshnessThreshold * 0.5)` cap (line 283), meaning even for hospital-based providers (90-day threshold), Tier 1 is capped at 30 days. This ensures "very fresh" always means within 30 days regardless of specialty.

#### 3. Verification Count Score (0-25 points)

**Verified `calculateVerificationScore()` function (lines 311-316):**

| Count | Points | Verified |
|-------|--------|----------|
| 0 | 0 | CONFIRMED (line 312) |
| 1 | 10 | CONFIRMED (line 313) |
| 2 | 15 | CONFIRMED (line 314) |
| 3+ | 25 | CONFIRMED (line 315) |

**Research basis:** Mortensen et al. (2015), JAMIA -- 3 verifications achieve expert-level accuracy (kappa=0.58). Constant `MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE = 3` (line 57).

#### 4. Community Agreement Score (0-20 points)

**Verified `calculateAgreementScore()` function (lines 332-345):**

| Agreement % | Points | Verified |
|-------------|--------|----------|
| 100% | 20 | CONFIRMED (line 340) |
| 80-99% | 15 | CONFIRMED (line 341) |
| 60-79% | 10 | CONFIRMED (line 342) |
| 40-59% | 5 | CONFIRMED (line 343) |
| <40% | 0 | CONFIRMED (line 344) |
| No votes | 0 | CONFIRMED (line 335) |

**Implementation detail:** Agreement ratio = `upvotes / (upvotes + downvotes)` (line 337). Returns 0 for no votes (not penalized, just no bonus).

---

## Confidence Level Verification

### `getConfidenceLevel()` function (lines 426-442)

**With < 3 verifications (capped, lines 429-434):**
| Score | Level | Verified |
|-------|-------|----------|
| 51+ | MEDIUM (max) | CONFIRMED |
| 26-50 | LOW | CONFIRMED |
| 0-25 | VERY_LOW | CONFIRMED |

**With 3+ verifications (standard, lines 437-441):**
| Score | Level | Verified |
|-------|-------|----------|
| 91-100 | VERY_HIGH | CONFIRMED |
| 76-90 | HIGH | CONFIRMED |
| 51-75 | MEDIUM | CONFIRMED |
| 26-50 | LOW | CONFIRMED |
| 0-25 | VERY_LOW | CONFIRMED |

**Key insight:** The function checks `verificationCount < 3 && verificationCount > 0` (line 429). This means providers with 0 verifications are NOT capped -- they naturally score low due to 0 verification points and 0 agreement points.

### `getConfidenceLevelDescription()` function (lines 448-468)

Each level has a descriptive message. When verification count is below 3, the research note "Research shows 3 verifications achieve expert-level accuracy." is appended (lines 449-452).

---

## Score Metadata Verification

The `ConfidenceResult.metadata` object (lines 219-233) includes:

| Field | Type | Verified |
|-------|------|----------|
| `daysUntilStale` | number | CONFIRMED -- `max(0, freshnessThreshold - daysSinceVerification)` (lines 197-199) |
| `isStale` | boolean | CONFIRMED -- true when `daysSinceVerification > freshnessThreshold` (line 196) |
| `recommendReVerification` | boolean | CONFIRMED -- true when stale OR never verified OR within 80% of threshold (lines 200-201) |
| `daysSinceVerification` | number or null | CONFIRMED -- null if never verified (lines 170-174) |
| `freshnessThreshold` | number | CONFIRMED -- specialty-specific threshold used (line 167) |
| `researchNote` | string | CONFIRMED -- specialty-specific + verification count note (lines 204-207) |
| `explanation` | string | CONFIRMED -- generated by `generateScoreExplanation()` (lines 210-217) |

### Human-Readable Explanation Generation (lines 351-420)

The `generateScoreExplanation()` function builds a sentence from four parts:
1. **Data source part:** "verified through official CMS data" / "insurance carrier data" / "community submissions" / "limited authoritative data"
2. **Recency part:** Includes actual day count and research references for stale data
3. **Verification count part:** References the 3-verification research threshold
4. **Agreement part:** Labels from "complete consensus" to "conflicting community data"

Specialty-specific notes from `SPECIALTY_EXPLANATION_NOTES` are appended for mental health, primary care, and hospital-based providers.

---

## Score Update Logic Verification

### File: `packages/backend/src/services/verificationService.ts`

**When a new verification is submitted (`submitVerification`, starting line 338):**

1. Validates provider and plan exist (`validateProviderAndPlan`, lines 65-88)
2. Checks for Sybil attack patterns (`checkSybilAttack`, lines 94-137) -- 30-day window per IP and per email
3. Gets existing acceptance record (lines 363-385)
4. Creates verification log with TTL (lines 397-421) -- 6-month expiration
5. Calls `upsertAcceptance()` (lines 212-285) which:
   - Counts verification consensus (ACCEPTED vs NOT_ACCEPTED) from all non-expired verifications
   - Calculates upvotes as `max(accepted, notAccepted)`, downvotes as `min(accepted, notAccepted)`
   - Calls `calculateConfidenceScore()` with `CROWDSOURCE` source, current timestamp, updated count
   - Determines final acceptance status via `determineAcceptanceStatus()` (lines 185-207)
   - Updates `ProviderPlanAcceptance.confidenceScore` in database

**Consensus requirements (line 196-198):**
- 3+ verifications
- Confidence score >= 60
- Clear 2:1 majority ratio (acceptedCount > notAccepted * 2 OR vice versa)

**When a vote is cast (`voteOnVerification`, starting line 443):**
1. Validates verification exists
2. Checks for existing vote from same IP (duplicate/change detection)
3. Uses transaction to update vote counts atomically
4. Recalculates confidence score on the linked acceptance record (lines 549-568)

---

## Confidence Decay Service Verification

### File: `packages/backend/src/services/confidenceDecayService.ts`

**`recalculateAllConfidenceScores()` function (lines 33-168):**

| Feature | Status | Evidence |
|---------|--------|----------|
| Batch processing | CONFIRMED | Configurable `batchSize` (default 100), cursor-based pagination (lines 66-88) |
| Provider specialty lookup | CONFIRMED | Fetches `provider.primarySpecialty` via Prisma relation (line 82-86) |
| Vote aggregation | CONFIRMED | Aggregates upvotes/downvotes from non-expired VerificationLog entries (lines 96-109) |
| Score comparison | CONFIRMED | Only updates if `newScore !== record.confidenceScore` (line 123) |
| Dry-run support | CONFIRMED | Skips `prisma.update` when `dryRun` is true (line 124) |
| Progress callback | CONFIRMED | `onProgress(processed, updated)` callback support (lines 151-153) |
| Stats tracking | CONFIRMED | Returns `{ processed, updated, unchanged, errors, durationMs }` (lines 156-167) |
| Limit parameter | CONFIRMED | `effectiveLimit = limit ? min(limit, totalCount) : totalCount` (line 57) |

### Admin Endpoint

**File:** `packages/backend/src/routes/admin.ts` (lines 502-538)

- **Route:** `POST /api/v1/admin/recalculate-confidence`
- **Auth:** `X-Admin-Secret` header required
- **Timeout:** `adminTimeout` middleware applied
- **Parameters:** `dryRun` (query, boolean), `limit` (query, positive integer)
- **Batch size:** Hardcoded to 100 (line 519)

---

## Example Calculations Verification

### Example 1: Fresh CMS data, mental health provider, no community input
```
dataSource: CMS_DATA → 25 points
recency: 0 days, threshold 30 → Tier 1 → 30 points
verification: 0 count → 0 points
agreement: 0 votes → 0 points
Total: 55 → getConfidenceLevel(55, 0) → 0 verifications, not capped (>0 check) → MEDIUM
```
**Prompt says:** 55, MEDIUM (capped -- 0 verifications)
**Actual code:** `verificationCount < 3 && verificationCount > 0` means 0 is NOT capped. With 55 score and 0 verifications, `getConfidenceLevel` falls through to standard scoring: 55 >= 51 = MEDIUM.
**Result:** Same level (MEDIUM) but for different reason than prompt states. The prompt says "capped" but the code does not cap at 0 verifications.

### Example 2: User-verified primary care, 3 verifications, unanimous
```
dataSource: CROWDSOURCE → 15 points
recency: 0 days, threshold 60 → Tier 1 (0 <= min(30, 30)) → 30 points
verification: 3 count → 25 points
agreement: 100% → 20 points
Total: 90 → getConfidenceLevel(90, 3) → 76-90 = HIGH
```
**Prompt says:** 90, HIGH -- CONFIRMED MATCH

### Example 3: Old carrier data, hospital-based, conflicting votes
```
dataSource: CARRIER_DATA → 20 points
recency: 150 days, threshold 90 → tier3 = 90*1.5 = 135, tier4 = 180
  150 > 135 AND 150 <= 180 → Tier 4 → 5 points
verification: 2 count → 15 points
agreement: 50/50 → 0.5 ratio, 40-59% → 5 points
Total: 45 → getConfidenceLevel(45, 2) → capped (< 3, > 0): 26-50 = LOW
```
**Prompt says:** 40, LOW (capped)
**Actual calculation:** 20 + 5 + 15 + 5 = 45, not 40. The prompt's agreement calculation assumed 0 points for 50/50, but `agreementRatio = 0.5` is `>= 0.4`, so it gets 5 points.
**Result:** Score is 45, not 40. Level is still LOW (capped).

---

## Frontend Display Components

| Component | File | Purpose | Verified |
|-----------|------|---------|----------|
| ConfidenceGauge | `components/provider-detail/ConfidenceGauge.tsx` | Visual gauge | CONFIRMED |
| ScoreBreakdown | `components/provider-detail/ScoreBreakdown.tsx` | Factor-by-factor | CONFIRMED |
| ConfidenceBadge | `components/ConfidenceBadge.tsx` | Compact badge | CONFIRMED |
| ConfidenceScoreExplainer | `components/provider/ConfidenceScoreExplainer.tsx` | Educational | CONFIRMED |
| FreshnessWarning | `components/FreshnessWarning.tsx` | Stale data warning | CONFIRMED |
| ConfidenceScoreBreakdown | `components/ConfidenceScoreBreakdown.tsx` | Detailed breakdown | CONFIRMED |
| ConfidenceSection | `components/home/ConfidenceSection.tsx` | Home page explainer | CONFIRMED |

---

## Checklist Results

### Algorithm Components
- [x] Data source scoring with lookup table (12 sources + 2 enrichment pipeline sources)
- [x] Specialty-specific freshness thresholds (5 categories)
- [x] Tiered recency decay with specialty-adjusted boundaries
- [x] Research-backed verification count scoring (3-verification threshold)
- [x] Community agreement scoring (5 tiers + no-vote case)
- [x] Score capped at 100 via `Math.min(100, ...)` (line 183)
- [x] Verification-count-aware confidence levels (capped at MEDIUM for 1-2 verifications)

### Score Metadata
- [x] All 7 metadata fields implemented
- [x] Human-readable explanations with specialty-specific research notes
- [x] `recommendReVerification` triggers at 80% of threshold OR when stale

### Score Update Logic
- [x] Score recalculated on each new verification
- [x] Score recalculated on each vote
- [x] Agreement percentage from all non-expired verifications
- [x] Sybil prevention (30-day window per IP and per email)
- [x] Consensus requires 3 verifications + score >= 60 + 2:1 majority

### Confidence Decay
- [x] Batch recalculation service implemented
- [x] Fetches provider specialty for decay rates
- [x] Aggregates votes from non-expired verifications only
- [x] Dry-run mode support
- [x] Admin endpoint with auth
- [x] Progress and stats tracking

---

## Discrepancies Found

1. **Example 1 capping logic:** Prompt says "capped -- 0 verifications" but code only caps for `verificationCount > 0 && < 3`. With 0 verifications, the standard scoring applies (which also yields MEDIUM for score 55).

2. **Example 3 agreement score:** Prompt calculates 0 points for "50/50 split" but the code gives 5 points for agreement ratio 0.5 (which is >= 0.4). This changes the total from 40 to 45, though the level remains LOW.

3. **`enrichAcceptanceWithConfidence` helper:** Sets `dataSource: null` (line 499), meaning all acceptance records enriched through this helper get the default 10-point data source score, not the actual source. This is intentional (source tracked in VerificationLog, not on acceptance).

---

## Recommendations

1. **Fix prompt examples** -- Update Example 1 and Example 3 calculations to match actual code behavior.
2. **Consider storing data source on acceptance** -- Currently `enrichAcceptanceWithConfidence` always passes `null` for `dataSource`, giving 10 default points. If the acceptance record tracked its original source, scores would be more accurate.
3. **Background decay job** -- The decay service exists but there is no scheduled Cloud Scheduler job configured yet. Consider setting up a daily cron to keep scores fresh.
4. **Mental health threshold review** -- 30 days may be aggressive for initial launch. Consider monitoring how many mental health records fall to "stale" status and adjusting if needed.
