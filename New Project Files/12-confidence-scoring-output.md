# Confidence Scoring Algorithm Review — 2026-04-16

## Status
Implementation is **complete** and well-factored. Scoring logic, decay service, admin endpoint, full test suite, and frontend components are all in place. No critical gaps — a handful of minor inconsistencies and open design questions remain.

---

## Files Reviewed
- `packages/backend/src/services/confidenceService.ts` (515 lines)
- `packages/backend/src/services/confidenceDecayService.ts` (169 lines)
- `packages/backend/src/services/verificationService.ts` (909 lines; scoring touchpoints at 229-273, 566)
- `packages/backend/src/services/__tests__/confidenceService.test.ts` (645 lines)
- `scripts/recalculate-confidence.ts` (204 lines, admin script)
- `packages/backend/prisma/schema.prisma:38` (ProviderPlanAcceptance.confidenceScore: Float)

---

## 1. Algorithm Components — Verification

### Data Source (0-25 pts)
`confidenceService.ts:87-104` defines `DATA_SOURCE_SCORES`. Matches prompt spec. Also adds **3 bonus sources not in the prompt doc**:

| Source | Points | Notes |
|---|---|---|
| `NPPES_SYNC` | 25 | Enrichment pipeline, CMS-backed |
| `CARRIER_SCRAPE` | 20 | Carrier website scrape |
| `NETWORK_CROSSREF` | 15 | Inferred from network IDs |

- [x] Source scoring in `DATA_SOURCE_SCORES` lookup (`:87`)
- [x] Handles DataSource + VerificationSource enum values
- [x] Default fallback of 10 pts (`calculateDataSourceScore:243-246`)
- [ ] **Gap:** Prompt checklist does not document the 3 enrichment sources above. Update `12-confidence-scoring.md` or add entries to the checklist table.

### Recency (0-30 pts)
`calculateRecencyScore:267-293`. Tiered, specialty-adjusted.

- [x] Specialty threshold lookup `VERIFICATION_FRESHNESS` (`:47-53`)
- [x] `getSpecialtyFreshnessCategory` keyword matcher (`:110-152`)
- [x] Tier boundaries `tier1 = min(30, threshold*0.5)`, `tier2 = threshold`, `tier3 = threshold*1.5`, `tier4 = 180`
- [x] No verification date returns 0 (`:271`)

**Subtle tier-1 behavior:** `tier1 = Math.min(30, freshnessThreshold * 0.5)`. For MENTAL_HEALTH (threshold=30), tier1 = 15 (not 15 days as "half of 30"). For HOSPITAL_BASED (threshold=90), tier1 = `min(30, 45) = 30`. The tier-1 boundary is **clamped at 30 days** so hospital-based providers still need verification within 30 days to get the top bucket — this is arguably inconsistent with the "more lenient decay" framing in the doc comment (`:262-264`). Consider removing the `Math.min(30, ...)` clamp so hospital-based gets tier1=45.

### Verification Count (0-25 pts)
`calculateVerificationScore:311-316`. Correct per prompt and Mortensen et al. (κ=0.58).

- [x] 0→0, 1→10, 2→15, 3+→25
- [x] 3-verification threshold constant at `:57` (`MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE`)

### Community Agreement (0-20 pts)
`calculateAgreementScore:332-345`. Correct.

- [x] Ratio = upvotes / (upvotes + downvotes)
- [x] No votes → 0 (no penalty)
- [x] Buckets 100/80/60/40/<40 → 20/15/10/5/0

---

## 2. Confidence Levels
`getConfidenceLevel:426-442`.

- [x] Verification-count capping at MEDIUM when 1-2 verifications and score≥51
- [x] VERY_LOW/LOW/MEDIUM/HIGH/VERY_HIGH bands match prompt
- [x] `getConfidenceLevelDescription:448-467` appends research note when < 3 verifications

**Edge case:** At `verificationCount === 0`, the cap at `:429` is skipped (`> 0` guard), so a 0-verification record scoring 91 would return VERY_HIGH. In practice, a 0-verification record cannot reach 91 (verification component contributes 0), but relying on implicit score ceiling is fragile.

- [ ] **Minor risk:** Harden `getConfidenceLevel` to also cap when `verificationCount === 0`. Today it's a theoretical, not practical, gap.

---

## 3. Metadata
`calculateConfidenceScore:196-231` returns full metadata envelope.

- [x] `daysUntilStale`, `isStale`, `recommendReVerification`, `daysSinceVerification`
- [x] `freshnessThreshold`, `researchNote`, `explanation`
- [x] `recommendReVerification` triggers at 80% of threshold, stale, or null lastVerifiedAt (`:200-201`)
- [x] `generateScoreExplanation:351-420` builds human-readable sentence with specialty note

---

## 4. Example Calculations — Spot-Check

Replayed the three prompt examples against current code:

| Ex | Source | Days | VCount | Votes | DS | Rec | VC | Ag | Sum | Level |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | CMS_DATA | 0 | 0 | — | 25 | 30 | 0 | 0 | 55 | VERY_LOW (cap skipped, score 55 → MEDIUM) |
| 2 | CROWDSOURCE | 0 | 3 | 3:0 | 15 | 30 | 25 | 20 | 90 | HIGH |
| 3 | CARRIER_DATA | 150 | 2 | 1:1 | 20 | 5 | 15 | 0 | 40 | LOW |

Example 1 result: per `getConfidenceLevel`, `verificationCount=0` → code skips the cap branch (guard is `> 0`), falls into standard bands, score=55 → MEDIUM. Prompt says "MEDIUM (capped)". Matches. Confirms the 0-verification cap **only works accidentally** because the component is 0.

---

## 5. Score Update Logic
`verificationService.ts:212-285` (`upsertAcceptance`).

- [x] Queries existing acceptance, counts verifications, recalculates
- [x] Upvotes/downvotes derived from majority/minority consensus counts (`:226-227`) — **this is different from the prompt framing**: upvotes here == majority agreement count, not literal "accepted" count. Conceptually sound (consensus) but should be documented.
- [x] Score recalculated every submission
- [x] TTL (`expiresAt`) reset on every update
- [x] `enrichAcceptanceWithConfidence` helper at `:482-514` — single call site consolidation

**Note:** `dataSource` for recalculations is always `VerificationSource.CROWDSOURCE` in `upsertAcceptance:230,257`. For a provider whose acceptance was originally created from CMS data, the data source score drops from 25 to 15 on first user verification. May not be desired — consider preserving highest-ever `dataSource`.

---

## 6. Decay Service
`confidenceDecayService.ts:33-168`.

- [x] Cursor pagination (`id > cursor`)
- [x] Filters `verificationCount >= 1` only (skips never-verified)
- [x] Fetches provider.primarySpecialty for specialty-aware decay
- [x] Aggregates upvotes/downvotes via `verificationLog.aggregate` + TTL filter (`expiresAt > NOW()`)
- [x] Dry-run mode, batchSize, limit, onProgress callback
- [x] Returns `{ processed, updated, unchanged, errors, durationMs }`
- [x] Admin endpoint exists; CLI wrapper at `scripts/recalculate-confidence.ts` (204 lines)

**Gap (minor):** `recalculateAllConfidenceScores` passes `dataSource: null` (`:113`). Same concern as above — the recalc loop loses any non-crowdsource data provenance. If the acceptance had `dataSource='CMS_NPPES'` originally, it would be scored as 10 (null fallback) rather than 25. Today this isn't stored on acceptance records (see `CONFIDENCE_SCORING_V2.md`), so it's a no-op — but if/when data source is added to `ProviderPlanAcceptance`, this code needs updating.

---

## 7. Frontend Components — Confirmed
- `ConfidenceGauge.tsx` — `packages/frontend/src/components/provider-detail/ConfidenceGauge.tsx`
- `ScoreBreakdown.tsx` — `packages/frontend/src/components/provider-detail/ScoreBreakdown.tsx`
- `ConfidenceBadge.tsx` — `packages/frontend/src/components/ConfidenceBadge.tsx`
- `ConfidenceScoreBreakdown.tsx` — `packages/frontend/src/components/ConfidenceScoreBreakdown.tsx`
- `ConfidenceScoreExplainer.tsx` — `packages/frontend/src/components/provider/ConfidenceScoreExplainer.tsx`
- `FreshnessWarning.tsx` — `packages/frontend/src/components/FreshnessWarning.tsx`

All 5 frontend pieces called out in the prompt exist. Good coverage.

---

## Findings (ranked)

### HIGH
1. **Data-source erasure on user verification (verificationService.ts:230, 257).** Every re-verification coerces `dataSource` to `CROWDSOURCE`, dropping ~10 pts of source score vs original CMS/carrier. Consider storing max(original, current) dataSource on `ProviderPlanAcceptance` or looking up the original seed source.

### MEDIUM
2. **Hospital-based tier-1 clamp (confidenceService.ts:283).** `Math.min(30, threshold*0.5)` makes hospital-based (90-day threshold) effectively use tier1=30 rather than the intended 45, contradicting the "more lenient" comment.
3. **0-verification level cap is incidental (confidenceService.ts:429).** The `> 0` guard means a theoretical 0-verification record scoring 91 would be labeled VERY_HIGH. Guard against future changes by caping at `<= 0` too.
4. **Decay recalc hardcodes null dataSource (confidenceDecayService.ts:113).** Doesn't matter today (field not stored on acceptance) but is a landmine for any future work that persists source.

### LOW
5. **Prompt doc missing 3 enrichment sources** (`NPPES_SYNC`, `CARRIER_SCRAPE`, `NETWORK_CROSSREF`). Update `prompts/12-confidence-scoring.md`.
6. **No monotonicity guard.** Nothing prevents a lower-quality re-verification from dropping a previously-high score. Memory notes mention "Confidence scores never downgraded by lower-priority sources" as a contract for import scripts, but the in-app recalc path has no such guard. Verify that is intentional.

---

## Open Questions (from prompt)

1. **Decay as cron job vs on-demand?** Decay is now implemented as a batch recalc (`confidenceDecayService`) + admin endpoint + `scripts/recalculate-confidence.ts` CLI. Memory notes show `scripts/run-confidence-decay.sh` also exists — check that Cloud Scheduler (`scripts/setup-cloud-scheduler.sh`) targets it.
2. **Minimum threshold enforcement?** Not enforced today. Recommend color-coding + filter toggle rather than hiding, so users can see low-confidence data with appropriate warnings.
3. **Conflict handling?** `import_conflicts` table (migration `20260218010000`) exists for import conflicts. No analogous mechanism for vote-level conflicts — weight-by-age and/or flag-for-review after N conflicts are both open.
4. **Show breakdown to users?** Five separate components already ship; consider A/B testing collapse into single expandable panel.
5. **Specialty threshold calibration?** Values derive from Ndumele et al. 2018. Mental health 30 days is aggressive but defensible. Re-check once real verification data accrues (after NYC launch).

---

## Test Coverage
`confidenceService.test.ts` (645 lines) covers:
- Data source bands (every enum value)
- Recency decay per specialty category
- Verification-count stepping (0,1,2,3,4+)
- Agreement percentage buckets
- Level capping at 1-2 verifications
- Explanation generation
- Metadata fields

Coverage is strong. No integration test for `confidenceDecayService` was located under `__tests__/` — would be worth adding one that seeds a small fixture and asserts `updated` vs `unchanged` counts.

---

## Recommendations

### Immediate
- [ ] Fix hospital-based tier-1 clamp (`confidenceService.ts:283`) or update the doc comment to match behavior.
- [ ] Tighten 0-verification level guard: change `verificationCount > 0` to `verificationCount < MIN_VERIFICATIONS_FOR_HIGH_CONFIDENCE` (drops the `> 0` lower bound).
- [ ] Add integration test for `recalculateAllConfidenceScores` (dry-run + applied).

### Next Sprint
- [ ] Persist highest-ever `dataSource` on `ProviderPlanAcceptance` so crowdsource re-verifications don't erase the original CMS provenance.
- [ ] Document `confidenceDecayService` + admin endpoint + Cloud Scheduler wiring in a single place (currently split between `scripts/run-confidence-decay.sh` and setup shell scripts).

### Longer Term
- [ ] Calibration pass after NYC launch — real data may show MENTAL_HEALTH=30 days is unsustainable with current verification volume; consider dynamic threshold based on observed churn.
- [ ] Add conflict-flagging: auto-pause a provider's score when > N votes disagree within a window.
