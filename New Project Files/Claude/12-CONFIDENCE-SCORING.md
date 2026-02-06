# Confidence Scoring Algorithm Review

## Overview

**File:** `packages/backend/src/services/confidenceService.ts`
**Algorithm:** 0-100 scale combining 4 weighted factors
**Status:** Fully implemented and tested
**Research basis:** Mortensen et al. (2015), JAMIA; Ndumele et al. (2018), Health Affairs

## Algorithm Components (0-100 Scale)

### 1. Data Source Quality (0-25 points)

**Function:** `calculateDataSourceScore()` (confidenceService.ts lines 229-232)

Scores based on `DATA_SOURCE_SCORES` lookup map (lines 61-78):

| Source | Points | Category |
|--------|--------|----------|
| `CMS_NPPES` / `CMS_PLAN_FINDER` / `CMS_DATA` / `NPPES_SYNC` | 25 | Official CMS data |
| `CARRIER_API` / `CARRIER_DATA` / `CARRIER_SCRAPE` / `PROVIDER_PORTAL` | 20 | Carrier/provider data |
| `USER_UPLOAD` / `PHONE_CALL` / `CROWDSOURCE` / `NETWORK_CROSSREF` | 15 | Community verified |
| `AUTOMATED` | 10 | Automated checks |
| Unknown/null source | 10 | Default fallback (line 231) |

**Verified:**
- [x] Source scoring implemented with `DATA_SOURCE_SCORES` lookup
- [x] Handles both `DataSource` and `VerificationSource` enum values (comment at line 60)
- [x] Default of 10 points for unknown sources (line 231: `DATA_SOURCE_SCORES[source] ?? 10`)
- [x] Null source returns 10 (line 230: `if (!source) return 10`)

### 2. Recency Score (0-30 points)

**Function:** `calculateRecencyScore()` (confidenceService.ts lines 253-279)

Uses **specialty-specific freshness thresholds** with tiered scoring:

| Specialty Category | Freshness Threshold | Research Basis |
|--------------------|-------------------|---------------|
| `MENTAL_HEALTH` | 30 days | 43% Medicaid acceptance, high churn (Ndumele et al. 2018) |
| `PRIMARY_CARE` | 60 days | 12% annual turnover |
| `SPECIALIST` | 60 days | Similar to primary care |
| `HOSPITAL_BASED` | 90 days | More stable positions |
| `OTHER` | 60 days | Default |

Tier boundaries calculated from threshold (lines 269-273):
- **Tier 1** (30 pts): 0 to `threshold * 0.5` days
- **Tier 2** (20 pts): `threshold * 0.5` to `threshold` days
- **Tier 3** (10 pts): `threshold` to `threshold * 1.5` days
- **Tier 4** (5 pts): `threshold * 1.5` to 180 days
- **Tier 5** (0 pts): 180+ days (always 0)
- **No verification date**: 0 points (line 257)

**Specialty detection** via `getSpecialtyFreshnessCategory()` (lines 84-126):
- Mental Health: `psychiatr*`, `psycholog*`, `mental health`, `behavioral health`, `counselor`, `therapist`
- Primary Care: `family medicine`, `family practice`, `internal medicine`, `general practice`, `primary care`
- Hospital-Based: `hospital`, `radiology`, `anesthesiology`, `pathology`, `emergency medicine`
- All others: `SPECIALIST` (default, line 125)

**Verified:**
- [x] Specialty-specific thresholds implemented (VERIFICATION_FRESHNESS map, lines 47-53)
- [x] Keyword-based specialty category detection (lines 88-126)
- [x] Tiered decay with specialty-adjusted boundaries (lines 269-278)
- [x] Both `specialty` and `taxonomyDescription` searched (line 88: concatenated and lowercased)

### 3. Verification Count Score (0-25 points)

**Function:** `calculateVerificationScore()` (confidenceService.ts lines 297-302)

Based on Mortensen et al. (2015): 3 verifications achieve expert-level accuracy (kappa=0.58).

| Verification Count | Points | Rationale |
|--------------------|--------|-----------|
| 0 | 0 | No data (line 298) |
| 1 | 10 | Single verification -- could be outlier (line 299) |
| 2 | 15 | Getting there, not optimal (line 300) |
| 3+ | 25 | Expert-level accuracy achieved (line 301) |

**Verified:**
- [x] 3-verification threshold from research (constant `MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE = 3` at line 57)
- [x] Score jumps 15 to 25 at the research-backed threshold

### 4. Community Agreement Score (0-20 points)

**Function:** `calculateAgreementScore()` (confidenceService.ts lines 318-331)

| Agreement % | Points | Label |
|-------------|--------|-------|
| 100% | 20 | Complete consensus (line 326) |
| 80-99% | 15 | Strong consensus (line 327) |
| 60-79% | 10 | Moderate consensus (line 328) |
| 40-59% | 5 | Weak consensus (line 329) |
| <40% | 0 | Conflicting data (line 330) |
| No votes | 0 | No community input (line 321) |

**Verified:**
- [x] Agreement ratio: `upvotes / (upvotes + downvotes)` (line 323)
- [x] 0 points for no votes -- not penalized, just no bonus (line 321)

## Confidence Levels

**Function:** `getConfidenceLevel()` (confidenceService.ts lines 422-439)

With **verification-count-aware thresholds** -- fewer than 3 verifications caps maximum level at MEDIUM:

**With 3+ verifications (standard):**

| Score | Level |
|-------|-------|
| 91-100 | VERY_HIGH (line 434) |
| 76-90 | HIGH (line 435) |
| 51-75 | MEDIUM (line 436) |
| 26-50 | LOW (line 437) |
| 0-25 | VERY_LOW (line 438) |

**With 1-2 verifications (capped at MEDIUM):**

| Score | Level |
|-------|-------|
| 51+ | MEDIUM (lines 427-428: both score >= 76 and >= 51 return MEDIUM) |
| 26-50 | LOW (line 429) |
| 0-25 | VERY_LOW (line 430) |

**Verified:**
- [x] Research-backed capping of confidence level below 3 verifications
- [x] Level descriptions include research notes when below threshold (getConfidenceLevelDescription, lines 445-465)

## Score Metadata

**Returned from `calculateConfidenceScore()`** (lines 205-219):

| Field | Type | Description | Verified |
|-------|------|-------------|----------|
| `daysUntilStale` | number | Days remaining before stale | Line 172 |
| `isStale` | boolean | Past freshness threshold | Line 170 |
| `recommendReVerification` | boolean | Stale OR within 80% of threshold | Lines 174-175 |
| `daysSinceVerification` | number/null | Null if never verified | Lines 144-148 |
| `freshnessThreshold` | number | Specialty-specific threshold used | Line 141 |
| `researchNote` | string | Specialty-specific citation | Lines 178-193 |
| `explanation` | string | Human-readable score breakdown | Lines 196-203 |

**Verified:**
- [x] All metadata fields implemented
- [x] Human-readable explanations generated via `generateScoreExplanation()` (lines 337-416)

## Example Calculations (Verified Against Code)

**Example 1: Fresh CMS data, mental health provider, no community input**
- Data source: 25 (CMS_DATA, line 73)
- Recency: 30 (0 days since verification, mental health threshold 30, tier1 = 15 days, 0 <= 15)
- Verification: 0 (no verifications)
- Agreement: 0 (no votes)
- **Total: 55** -- Level: MEDIUM (0 verifications, capped -- line 425 condition met but verificationCount=0 skips the check since condition is `< 3 && > 0`)
- **Correction:** With 0 verifications, the capping condition `verificationCount < 3 && verificationCount > 0` is FALSE. So standard scoring applies: 55 = MEDIUM (standard). Level is MEDIUM.

**Example 2: User-verified primary care, 3 verifications, unanimous**
- Data source: 15 (CROWDSOURCE)
- Recency: 30 (verified today, primary care threshold 60, tier1 = 30, 0 <= 30)
- Verification: 25 (3 verifications)
- Agreement: 20 (100% agree)
- **Total: 90** -- Level: HIGH (standard scoring: 76-90)

**Example 3: Old carrier data, hospital-based, conflicting votes**
- Data source: 20 (CARRIER_DATA)
- Recency: 5 (150 days, hospital threshold 90, tier3 = 135, tier4 = 180, 135 < 150 <= 180)
- Verification: 15 (2 verifications)
- Agreement: 0 (50/50 split = 0.5 = ratio >= 0.4 --> 5 points actually)
- **Correction on agreement:** 50/50 split means `upvotes / (upvotes + downvotes)` = 0.5, which is >= 0.4, so 5 points
- **Total: 20 + 5 + 15 + 5 = 45** -- Level: LOW (capped -- < 3 verifications, score 26-50)

## Score Update Logic

**File:** `packages/backend/src/services/verificationService.ts`

When a new verification is submitted (`submitVerification`, line 316):
1. Validate provider and plan exist (`validateProviderAndPlan`, line 334)
2. Check for Sybil attack patterns (`checkSybilAttack`, line 337)
3. Get existing acceptance record (lines 341-363)
4. Create verification log with TTL (lines 375-399)
5. Upsert acceptance with recalculated score (`upsertAcceptance`, line 402)

**Inside `upsertAcceptance` (lines 190-263):**
- Counts consensus (ACCEPTED vs NOT_ACCEPTED) from all non-expired verifications
- Calculates upvotes = max(accepted, notAccepted), downvotes = min(accepted, notAccepted)
- Calls `calculateConfidenceScore()` with CROWDSOURCE source, current date, new count
- Determines final status: requires 3+ verifications, score >= 60, clear 2:1 majority (`determineAcceptanceStatus`, lines 163-185)
- Updates `ProviderPlanAcceptance.confidenceScore` in database

**On vote (`voteOnVerification`, lines 421-553):**
- Updates vote counts on `VerificationLog` (upvotes/downvotes)
- Recalculates confidence score on the linked `ProviderPlanAcceptance` (lines 527-547)
- Uses transaction for atomic vote + count updates

**Verified:**
- [x] Score recalculated on each new verification
- [x] Agreement percentage recalculated from all non-expired verifications
- [x] Recency updated to current date
- [x] `enrichAcceptanceWithConfidence` helper (lines 479-511) eliminates duplicate calculation patterns

## Confidence Decay Service

**File:** `packages/backend/src/services/confidenceDecayService.ts`

**Function:** `recalculateAllConfidenceScores()` (lines 33-168)

**Admin Endpoint:** `POST /api/v1/admin/recalculate-confidence` (admin.ts lines 462-497)

**Verified features:**
- [x] Batch recalculation for all acceptances with verificationCount >= 1 (line 54)
- [x] Fetches provider specialty for specialty-specific decay rates (line 83-84)
- [x] Aggregates upvotes/downvotes from non-expired VerificationLog entries (lines 96-109)
- [x] Only considers non-expired verifications (line 100: `expiresAt: { gt: new Date() }`)
- [x] Supports dry-run mode (line 124: `if (!dryRun)`)
- [x] Cursor-based pagination with configurable batch size (lines 64, 73-74)
- [x] Progress callback support (lines 151-153)
- [x] Returns stats: `{ processed, updated, unchanged, errors, durationMs }` (lines 5-11)

## Database Schema for Confidence

**File:** `packages/backend/prisma/schema.prisma`

**`ProviderPlanAcceptance` model (lines 181-206):**
- `confidenceScore Int @default(0)` -- Integer 0-100 (line 187)
- `lastVerified DateTime?` -- Timestamp of last verification (line 188)
- `verificationCount Int @default(0)` -- Number of verifications (line 189)
- `expiresAt DateTime?` -- TTL expiration (line 192)
- Indexed: `idx_ppa_confidence_score` (line 201), `idx_ppa_last_verified` (line 203), `idx_ppa_expires_at` (line 202)

**`VerificationLog` model (lines 208-243):**
- `upvotes Int @default(0)` (line 220)
- `downvotes Int @default(0)` (line 221)
- `expiresAt DateTime?` -- TTL expiration (line 228)
- Sybil prevention indexes: `idx_vl_sybil_ip` (line 240), `idx_vl_sybil_email` (line 239)

## Consensus and Status Change Logic

**Constants (config/constants.ts):**
- `MIN_VERIFICATIONS_FOR_CONSENSUS = 3` (line 36)
- `MIN_CONFIDENCE_FOR_STATUS_CHANGE = 60` (line 42)
- `VERIFICATION_TTL_MS = 6 months` (line 19)
- `SYBIL_PREVENTION_WINDOW_MS = 30 days` (line 26)

**Status determination (`determineAcceptanceStatus`, verificationService.ts lines 163-185):**
1. Requires `verificationCount >= 3`
2. Requires `confidenceScore >= 60`
3. Requires clear 2:1 majority ratio (`acceptedCount > notAcceptedCount * 2` or vice versa)
4. All three must be true to change status from current value
5. If not met: UNKNOWN --> PENDING, otherwise keep current status

## Frontend Display Components

| Component | Purpose | Verified |
|-----------|---------|----------|
| `ConfidenceGauge.tsx` | Visual gauge component | Listed in prompt |
| `ScoreBreakdown.tsx` | Factor-by-factor display | Listed in prompt |
| `ConfidenceBadge.tsx` | Compact badge (e.g., in search results) | Listed in prompt |
| `ConfidenceScoreExplainer.tsx` | Educational component explaining methodology | Listed in prompt |
| `FreshnessWarning.tsx` | Stale data warning banner | Listed in prompt |

**Tailwind confidence colors (tailwind.config.ts lines 26-29):**
- `confidence.high`: `#22c55e` (green, for scores 70+)
- `confidence.medium`: `#eab308` (yellow, for scores 40-69)
- `confidence.low`: `#ef4444` (red, for scores <40)

## Questions Answered

### 1. Should we implement confidence decay background job now or later?
The confidence decay service is already implemented (`confidenceDecayService.ts`). It is exposed as an admin endpoint (`POST /api/v1/admin/recalculate-confidence`) but is NOT running as a scheduled job. It should be called via Cloud Scheduler (e.g., daily) to keep scores fresh. On-demand recalculation at read time is NOT implemented -- scores are only updated when verifications are submitted or the admin endpoint is called.

### 2. Should minimum confidence threshold be enforced?
Currently, providers with ANY confidence score (including 0) are returned in search results. The consensus logic requires confidence >= 60 to change acceptance status, which is a form of threshold. Whether to hide low-confidence providers from search results depends on data density -- with a new platform, hiding too many results would be counterproductive.

### 3. How should we handle conflicting verifications?
Currently handled through:
- Agreement score (0-20 points) -- conflicting data gets 0-5 points
- Consensus requires 2:1 majority ratio to change status
- Sybil prevention prevents same IP/email from re-verifying within 30 days
- No manual review flagging is implemented for conflicting verifications

### 4. Should we display the full score breakdown to users?
Multiple components exist for different detail levels: `ConfidenceBadge` (compact), `ConfidenceGauge` (visual), `ScoreBreakdown` (detailed), `ConfidenceScoreExplainer` (educational). The API returns full breakdown via `enrichAcceptanceWithConfidence`. This is a competitive differentiator -- transparency builds trust.

### 5. Are the specialty-specific thresholds correctly calibrated?
Based on research:
- Mental health 30 days may be aggressive but is justified by 43% Medicaid non-acceptance rate and high network churn
- Hospital-based 90 days is appropriate for more stable positions
- Primary care / specialist 60 days aligns with 12% annual turnover research
- The tier system provides gradual decay rather than cliff edges, which smooths the impact

**Potential concern:** The decay service rounds to integer (`Math.round(result.score)` at line 121 of confidenceDecayService.ts), while `calculateConfidenceScore` returns a float rounded to 2 decimal places (`Math.round(score * 100) / 100` at line 165). This means the decay service may not detect sub-integer changes, which is acceptable for a 0-100 integer scale but worth noting.
