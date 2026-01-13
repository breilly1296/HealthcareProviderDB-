# Verification Form v2.0 - Research-Backed Redesign

## Overview
Simplified verification form based on research showing binary yes/no questions achieve highest accuracy.

**Key Principle:** Simple, self-contained binary tasks (Mortensen et al. 2015, JAMIA)

---

## What Changed from v1.0

### v1.0 Flow (5 steps):
```
1. Phone reached?
2. Phone correct?
3. Accepts insurance?
4. New patients?
5. Scheduled appointment?
```

### v2.0 Flow (4 steps):
```
1. Does provider accept insurance (general)?
   ├─ YES → Continue
   ├─ NO → Thank you (cash-only)
   └─ NOT SURE → Thank you (call to confirm)

2. Did you contact them?
   ├─ YES → Continue
   ├─ NO → Continue (phone question)
   └─ NOT SURE → Skip to specific plan question

3. Is phone number correct?
   ├─ YES → Continue
   └─ NO → Continue

4. Do they accept [specific plan]?
   ├─ YES → Submit verification
   ├─ NOT ACCEPTING NEW → Submit verification
   ├─ NO → Submit verification
   └─ NOT SURE → Thank you (call to confirm)
```

---

## Key Improvements

### 1. **Added "I'm Not Sure" Option**
**Research:** Users shouldn't be forced to guess. "Not sure" responses are valuable data.

**Where it appears:**
- Step 1: Insurance acceptance (general)
- Step 2: Contacted provider
- Step 4: Specific plan acceptance

**What happens:**
- Routes user to appropriate thank-you screen
- Doesn't submit partial/uncertain data
- Recommends calling provider to confirm

### 2. **Early Filtering Question**
**Step 1:** "Does this provider accept insurance (general)?"

**Purpose:**
- Identifies cash-only providers immediately
- Prevents wasted time on insurance-specific questions
- Clearer user flow

### 3. **Simplified Contact Question**
**Changed from:** "Did you reach this phone number?"
**Changed to:** "Did you successfully contact this provider?"

**Why:**
- More natural language
- Includes in-person/online contact
- Less ambiguous

### 4. **Removed Optional "Appointment" Question**
**Why:**
- Reduced from 5 to 4 questions (<2 min target)
- Appointment scheduling isn't critical for verification
- Keeps focus on essential data only

### 5. **Better Progress Indicators**
**What's shown:**
- Question X of 4
- Time remaining (~X min)
- "Verification X of 3 needed for expert-level accuracy"
- Visual circles showing 3-verification progress

---

## Complete Question Breakdown

### INTRO SCREEN
**Purpose:** Set expectations, explain research basis

**What's shown:**
```
✓ Research shows simple verification achieves expert-level accuracy
✓ 3 verifications = κ=0.58 accuracy

Visual: [●●○] Verification 1 of 3

Benefits:
- 4 simple yes/no questions
- Under 2 minutes total
- Prevent surprise bills (4x risk)
```

**CTA:** "Start Verification" button

---

### STEP 1: Insurance Acceptance (General)
**Question:** "Does this provider accept insurance?"

**Options:**
1. **Yes - accepts insurance plans** [Primary] → Continue
2. **No - cash only / does not accept insurance** [Secondary] → Cash-only thank you
3. **I'm not sure** [Tertiary] → Not-sure thank you

**Research Tooltip:**
> Research shows 12% of providers change networks annually. Some providers are cash-only. Knowing if they accept any insurance at all helps us route your verification correctly.

**Purpose:**
- Filters out cash-only providers early
- Prevents wasted time on irrelevant questions
- Clear user path based on answer

**Logic:**
- YES → Continue to Step 2
- NO → Show "Cash-Only Provider" thank you screen
- NOT SURE → Show "Call to Confirm" thank you screen

---

### STEP 2: Contacted Provider
**Question:** "Did you successfully contact this provider?"

**Subtext:** "By phone, in person, or online"

**Options:**
1. **Yes - I reached them** [Primary] → Continue
2. **No - couldn't reach them** [Secondary] → Continue (phone accuracy question)
3. **I'm not sure** [Tertiary] → Skip to Step 4

**Research Tooltip:**
> Research shows 36% of directory errors are contact information. Knowing whether you successfully reached them helps us verify phone accuracy and assess data reliability.

**Purpose:**
- Determines if phone question is relevant
- Identifies contact issues
- Validates directory data

**Logic:**
- YES → Continue to Step 3 (phone accuracy)
- NO → Continue to Step 3 (phone accuracy)
- NOT SURE → Skip to Step 4 (specific plan)

---

### STEP 3: Phone Accuracy
**Question:** "Is the phone number correct?"

**Display:** "Current number: (XXX) XXX-XXXX" (if available)

**Subtext:** "Helps us maintain accurate contact information for future patients"

**Options:**
1. **Yes - phone number is correct** [Primary] → Continue
2. **No - phone number is wrong** [Secondary] → Continue

**Purpose:**
- Validates contact information
- Identifies directory errors
- Critical for 36% error statistic

**Logic:**
- Both options → Continue to Step 4

---

### STEP 4: Specific Plan Acceptance
**Question:** "Do they accept [Plan Name]?"

**Subtext:** "Your specific insurance plan"

**Options:**
1. **Yes - they accept it** [Primary] → Submit verification
2. **Yes, but not accepting new patients** [Secondary] → Submit verification
3. **No - they don't accept it** [Secondary] → Submit verification
4. **I'm not sure** [Tertiary] → Not-sure thank you

**Research Tooltip:**
> Research shows 12% annual provider network turnover. Providers frequently change which specific plans they accept. This is the most important verification to prevent surprise bills.

**Purpose:**
- **THE KEY QUESTION** - most important for preventing surprise bills
- Directly addresses 12% annual turnover
- High-impact verification

**Logic:**
- YES/NOT_ACCEPTING_NEW/NO → Submit verification, show success screen
- NOT SURE → Show "Call to Confirm" thank you screen

---

## Thank You Screens

### SUCCESS (after submission)
**Shows:**
- ✓ Green checkmark icon
- "Thank You! Your verification has been recorded."
- Research impact box with κ=0.58 citation
- Visual progress: [●●○] 2 of 3 verifications
- "You're verification 2 of 3 for this provider"

**If 3rd verification:**
- Green success banner: "✓ Expert-level accuracy achieved!"

**If < 3 verifications:**
- Yellow info banner: "X more verifications needed for high confidence"

**CTAs:**
- [Back to Search]
- [View Provider]
- "Learn about our research methodology →"

---

### NOT SURE (uncertain answer)
**Shows:**
- ℹ Blue info icon
- "Thank You! Your feedback helps us understand what information needs verification."
- Yellow recommendation box:
  > **Please call the provider to confirm** they accept your insurance before your appointment.
  > Phone: (XXX) XXX-XXXX
- "Research shows 46% of insurance directories contain errors. Calling ahead prevents surprise bills."

**CTAs:**
- [Back to Search]
- [View Provider]

**Purpose:**
- Encourages user to call (best practice)
- Acknowledges uncertainty
- Doesn't submit incomplete data

---

### CASH ONLY (provider doesn't accept insurance)
**Shows:**
- 💰 Blue cash icon
- "Thank You! Your feedback helps us identify cash-only providers."
- Blue info box:
  > **Cash-Only Provider**
  > This provider does not accept insurance. You'll need to pay out-of-pocket and may be able to file for reimbursement with your insurer.
- "This information will help other patients make informed decisions."

**CTAs:**
- [Find Another Provider]
- [View Provider]

**Purpose:**
- Informs user of cash-only status
- Explains reimbursement option
- Valuable data for other users

---

## Design Principles

### 1. **One Question Per Screen**
**Research:** Reduces cognitive load, improves accuracy

**Implementation:**
- Each step shows only 1 question
- Large, touch-friendly buttons
- No distractions or competing elements

### 2. **Binary Choices (+ "Not Sure")**
**Research:** Simple tasks achieve highest accuracy (Mortensen et al.)

**Implementation:**
- Primary button: Expected/affirmative answer
- Secondary button: Negative answer
- Tertiary button (when shown): "I'm not sure" (gray border)
- No rating scales, no text fields, no complex multi-select

### 3. **Immediate Progress Feedback**
**Research:** Users need context and motivation

**Implementation:**
- Question X of 4 (top progress bar)
- ~X min remaining
- "Verification X of 3 needed for expert-level accuracy" (prominent badge)
- Visual circles: [●●○] showing 3-verification goal

### 4. **Research Context Throughout**
**Research:** Builds trust and explains "why"

**Implementation:**
- Tooltip on every question (ℹ icon)
- Citations in tooltips (e.g., "Ndumele et al. 2018")
- Specific statistics (12% turnover, 36% contact errors, etc.)
- Research badge on intro and success screens

### 5. **Under 2 Minutes Total**
**Research:** Short tasks maintain attention

**Time estimates:**
- Intro: 15s
- Step 1: 20s
- Step 2: 15s
- Step 3: 15s
- Step 4: 25s
- Success: 15s
- **Total: ~1:45 (under 2 min)**

---

## Mobile Optimization

### Touch Targets
- All buttons: `text-lg py-4` = ~56px height (exceeds 48px minimum)
- Wide spacing: `space-y-3` = 12px between buttons
- Full-width buttons for easy tapping

### Single Column Layout
- One question per screen = no scrolling
- Large text: `text-2xl` for questions
- Progress bar at top for context

### Accessibility
- Semantic HTML (`<button>`, `<h2>`)
- ARIA labels on info icons
- Keyboard navigation support
- Screen reader friendly tooltips

---

## Backend Compatibility

### API Submission Format (unchanged)
```typescript
POST /api/verifications
{
  npi: string,
  planId: string,
  phoneReached: boolean | null,    // From Step 2
  phoneCorrect: boolean | null,    // From Step 3
  acceptsInsurance: boolean,       // From Step 4 (YES = true)
  acceptsNewPatients: boolean,     // From Step 4 (NOT_ACCEPTING_NEW = false)
  scheduledAppointment: false,     // Removed from form, always false
  notes: undefined                 // Removed text field
}
```

**Key Points:**
- Same API endpoint and format
- Backend validation unchanged
- Only frontend flow/UX changed
- Backward compatible

---

## A/B Testing Opportunities

### Test 1: "Not Sure" Button Placement
- **Control:** Gray tertiary button (current)
- **Variant:** Hide "not sure" behind "Skip" link
- **Hypothesis:** Forcing decision increases completion rate

### Test 2: Question Order
- **Control:** General insurance → Contact → Phone → Specific plan
- **Variant:** Contact → Phone → Specific plan (remove general insurance)
- **Hypothesis:** Fewer questions increases completion

### Test 3: Progress Emphasis
- **Control:** "Verification X of 3" badge on all screens
- **Variant:** Show only on intro and success
- **Hypothesis:** Less progress noise improves focus

### Test 4: Research Tooltips
- **Control:** Tooltip on every question
- **Variant:** Inline research note (always visible)
- **Hypothesis:** Visible research increases trust

---

## Success Metrics

### Completion Rate
- **Target:** >85% (intro → success)
- **Benchmark:** v1.0 form completion rate
- **Track:** Dropoff at each step

### Time to Complete
- **Target:** <2 minutes average
- **Track:** Time from intro to success
- **Alert:** If average >2:30

### Data Quality
- **"Not Sure" Rate:** Track % of users selecting "not sure"
- **Target:** <20% "not sure" responses
- **High rate suggests:** Question clarity issues

### Verification Value
- **Full Verifications:** % that reach Step 4 and submit
- **Target:** >70% full verifications
- **Partial Data:** Track thank-you exits (still valuable)

---

## Migration Plan

### Phase 1: Deploy as Separate Component
- Deploy `ProviderVerificationForm.v2.tsx` alongside v1.0
- Keep v1.0 as fallback
- Test v2.0 with internal users

### Phase 2: A/B Test
- Split traffic 50/50 between v1.0 and v2.0
- Run for 2 weeks (minimum 500 completions)
- Compare metrics

### Phase 3: Full Rollout
- If v2.0 wins: Replace v1.0 completely
- If v1.0 wins: Keep current form, iterate on v2.0
- If tie: Keep simpler v2.0 (fewer questions = better UX)

### Phase 4: Rename and Clean Up
- Rename v2.0 → ProviderVerificationForm.tsx
- Delete old v1.0
- Update all imports

---

## Research Citations

1. **Mortensen et al. (2015), JAMIA**
   - Simple binary tasks achieve κ=0.58 (expert-level)
   - Self-contained questions improve accuracy
   - 3 verifications optimal

2. **Ndumele et al. (2018), Health Affairs**
   - 12% annual provider network turnover
   - Mental health: 43% Medicaid acceptance (high churn)

3. **Haeder et al. (2024), Health Affairs**
   - 46-77% directory error rate
   - 36% contact information errors
   - 4x more surprise bills with wrong directories

---

## Future Enhancements

### Conditional Logic Improvements
- If phone = wrong → Ask for correct number (optional field)
- If plan = NO → Ask "When did they drop it?" (helps track churn)
- If contact = NO → Ask "What happened?" (busy signal, wrong number, etc.)

### Gamification
- "You've submitted X verifications - you're more accurate than 80% of users!"
- Badge system: Bronze (1), Silver (3), Gold (10) verifications
- Leaderboard for power users

### AI-Assisted Validation
- Flag suspicious patterns (all "NO" answers)
- Cross-reference with recent verifications
- Request re-verification when conflicts detected

### Progressive Disclosure
- Start with 3 critical questions
- "Want to add more details?" → Optional 2 more
- Balances completion rate vs data richness
