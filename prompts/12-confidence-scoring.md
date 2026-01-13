---
tags:
  - algorithm
  - implemented
  - high
type: prompt
priority: 2
---

# Confidence Scoring Algorithm Review

## Files to Review
- `packages/backend/src/matching/confidence.ts` (✅ IMPLEMENTED - 82 tests passing)
- `packages/backend/prisma/schema.prisma` (ProviderPlanAcceptance.confidenceScore field)
- `packages/backend/src/services/verificationService.ts` (score updates)

## VerifyMyProvider Confidence Scoring
- **Algorithm:** 0-100 scale combining 4 factors
- **Status:** ✅ Implemented and tested (82 passing tests)
- **Purpose:** Transparent data quality indicator (competitive differentiator)
- **Bug Fixed:** Score now increases correctly with positive verifications (was dropping)

## Checklist

### 1. Algorithm Components (0-100 scale)

**Data Source Quality (0-30 points):**
- [ ] User verified recently: 30 points
- [ ] Multiple CMS sources agree: 25 points
- [ ] Single CMS source: 20 points
- [ ] Insurer website scrape: 15 points
- [ ] Inferred from location/specialty: 5 points

**Recency (0-25 points):**
- [ ] 0-30 days: 25 points
- [ ] 31-90 days: 20 points
- [ ] 91-180 days: 15 points
- [ ] 181-365 days: 10 points
- [ ] 1-2 years: 5 points
- [ ] 2+ years: 0 points

**Verification Status (0-25 points):**
- [ ] 5+ user verifications: 25 points
- [ ] 3-4 verifications: 20 points
- [ ] 2 verifications: 15 points
- [ ] 1 verification: 10 points
- [ ] No verifications: 0 points

**Crowdsource Agreement (0-20 points):**
- [ ] 100% agreement (all yes or all no): 20 points
- [ ] 80-99% agreement: 15 points
- [ ] 60-79% agreement: 10 points
- [ ] 40-59% agreement: 5 points
- [ ] <40% agreement (conflicting data): 0 points

### 2. Example Calculations

**Example 1: Fresh CMS FHIR data (no users yet)**
- Data source: 20 (single CMS)
- Recency: 25 (0-30 days)
- Verification: 0 (no users)
- Agreement: 0 (no users)
- **Total: 45** (Yellow flag, "Needs verification")

**Example 2: User-verified, recent**
- Data source: 30 (user verified)
- Recency: 25 (0-30 days)
- Verification: 20 (3 verifications)
- Agreement: 20 (100% agree)
- **Total: 95** (Green flag, "Highly confident")

**Example 3: Old FHIR data, conflicting**
- Data source: 20 (single CMS)
- Recency: 5 (1.5 years old)
- Verification: 15 (2 verifications)
- Agreement: 0 (50/50 split - conflict)
- **Total: 40** (Red flag, "Conflicting reports")

### 3. Score Update Logic

**When New Verification Added:**
```typescript
// CORRECT (bug fixed):
// 1. Query past verifications for this NPI + planId
// 2. Count agreements (how many say "accepted"?)
// 3. Count total verifications
// 4. Recalculate all 4 components
// 5. Sum to 0-100

// WRONG (old bug):
// - Always pass upvotes=1, downvotes=0
// - Ignore past verification history
// - Score incorrectly decreased
```

- [ ] Verification increments count properly
- [ ] Agreement percentage recalculated
- [ ] Recency updated to current date
- [ ] Score increases for positive verifications
- [ ] Score decreases for negative verifications

### 4. Edge Cases

- [ ] **No verifications yet:** Score based only on source + recency
- [ ] **Conflicting verifications (50/50 split):** Agreement = 0 points
- [ ] **Very old data (2+ years):** Recency = 0 points
- [ ] **Single verification:** Don't over-trust, give moderate score
- [ ] **Unanimous agreement (5+ verifications, all "yes"):** Maximum confidence

### 5. Frontend Display

**Color Coding:**
- [ ] 70-100: Green (High confidence)
- [ ] 40-69: Yellow (Medium confidence, use caution)
- [ ] 0-39: Red (Low confidence, verify independently)

**Messaging:**
- [ ] 90-100: "Highly verified"
- [ ] 70-89: "Verified"
- [ ] 50-69: "Needs verification"
- [ ] 30-49: "Limited data"
- [ ] 0-29: "Unverified"

### 6. Confidence Decay (Future Feature)

**Background Job (Not Yet Implemented):**
- [ ] Run nightly
- [ ] Recalculate confidence for all provider-plan pairs
- [ ] Age decreases recency score automatically
- [ ] No manual updates needed

**Decision Pending:**
- [ ] Implement in Phase 2B?
- [ ] Or leave for Phase 3?

## Questions to Ask

1. **Is the confidence scoring algorithm working as expected?** (After the bug fix on Jan 4?)

2. **What confidence thresholds should we use for UI colors?**
   - Current: Red <40, Yellow 40-69, Green 70+
   - Should we adjust these?

3. **Should we implement confidence decay background job now or later?**
   - Pros: Automatic aging of data
   - Cons: Added complexity, cron job needed

4. **Should minimum confidence threshold be enforced?**
   - Hide providers with confidence <30?
   - Or show all with color coding?

5. **How should we handle conflicting verifications?**
   - Flag for manual review after N conflicts?
   - Weight by verification age (newer = more trusted)?

6. **Should we display confidence score breakdown to users?**
   - "This score is based on: 3 user verifications, 2 months old, 100% agreement"
   - Or just show the final number?

7. **Any observed patterns where scoring seems wrong?**
   - Scores too high?
   - Scores too low?
   - Not updating as expected?

8. **Should we differentiate between "accepts this plan" vs "in-network for this plan"?**
   - Technically different concepts
   - Users may not understand the distinction
