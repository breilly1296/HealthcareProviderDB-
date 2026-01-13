# Research-Based Verification Form Design

## Overview
Our verification form is designed based on crowdsourcing research to maximize accuracy while minimizing time burden.

## Research Foundation

### Mortensen et al. (2015), JAMIA
**Key Finding:** Simple, self-contained binary tasks achieve highest crowdsourcing accuracy

- **Crowdsourced validation:** κ=0.58 (expert-level)
- **Expert validation:** κ=0.59
- **Optimal verification count:** 3 verifications per data point

### Design Principles

1. **Binary Choices Only**
   - YES/NO questions exclusively
   - No rating scales, no text fields
   - Reduces cognitive load and increases accuracy

2. **One Question Per Screen**
   - Single focus improves attention
   - Prevents skip-ahead bias
   - Mobile-friendly design

3. **Under 2 Minutes Total**
   - 5 questions maximum
   - ~20-30 seconds per question
   - No typing required

4. **Research Tooltips**
   - Conversational tone
   - Cite key statistics
   - Build trust and credibility

## Form Flow

### Step 0: Intro Screen
**Purpose:** Set expectations and build motivation

```
✓ 5 simple yes/no questions
✓ Under 2 minutes total (one question at a time, no typing required)
✓ Prevent surprise bills (research shows wrong directories cause 4x more surprise bills)

[Research Context Banner]
3 verifications achieve expert-level accuracy (κ=0.58)
Based on peer-reviewed research from JAMIA

[Verification Progress]
Verification 1 of 3 needed for high confidence
```

**CTA:** "Start Verification" (Large, primary button)

---

### Step 1: Phone Reached
**Question:** "Did you reach this phone number?"

**Display:** [Phone number or "Phone number on file"]

**Research Tooltip:**
> Research shows 36% of directory errors are contact information.
>
> Wrong phone numbers waste time and delay care. When directories are wrong, 28% of patients delay care and 10% skip it entirely.
>
> *Source: Health Affairs*

**Options:**
- YES: "Yes, I reached them" (Primary)
- NO: "No, couldn't reach them" (Secondary)

**Logic:**
- YES → Step 2 (Phone Correct)
- NO → Skip to Step 3, auto-set phoneCorrect=false

---

### Step 2: Phone Correct
**Question:** "Is the phone number correct?"

**Display:** "Did you reach [Provider Name] at this number?"

**Options:**
- YES: "Yes, correct number" (Primary)
- NO: "No, wrong office/number" (Secondary)

**Logic:** Both → Step 3 (Accepts Insurance)

---

### Step 3: Accepts Insurance
**Question:** "Do they accept [Plan Name]?"

**Research Tooltip:**
> Research shows providers change insurance networks 12% annually.
>
> When directories are wrong, patients face 4x more surprise medical bills (16% vs 4%). Mental health providers change networks even more frequently - only 43% accept Medicaid.
>
> *Sources: Health Affairs, Ndumele et al. 2018*

**Options:**
- YES: "Yes, they accept it" (Primary)
- NOT_ACCEPTING_NEW: "Yes, but not accepting new patients" (Secondary)
- NO: "No, they don't accept it" (Secondary)

**Logic:**
- YES → Step 4 (New Patients)
- NOT_ACCEPTING_NEW → Step 5 (Appointment)
- NO → Step 5 (Appointment)

---

### Step 4: New Patients
**Question:** "Are they accepting new patients?"

**Display:** "With [Plan Name]"

**Options:**
- YES: "Yes, accepting new patients" (Primary)
- NO: "No, not accepting new patients" (Secondary)

**Logic:**
- YES → Step 5 (Appointment)
- NO → Step 5 (Appointment), set acceptsInsurance=NOT_ACCEPTING_NEW

---

### Step 5: Appointment (Optional)
**Question:** "Did you schedule an appointment?"

**Display:** "Optional - this helps us verify acceptance"

**Options:**
- YES: "Yes, I scheduled" (Primary, submits form)
- NO: "No appointment yet" (Secondary, submits form)

**Logic:** Both options submit the verification

---

### Step 6: Success Screen
**Purpose:** Thank user, show impact, encourage return

```
[Success Icon]

Thank You!
Your verification has been recorded.

[Research Impact Box]
Research shows 3 verifications achieve expert-level accuracy (κ=0.58)
Mortensen et al. (2015), JAMIA

[Visual Progress]
● ● ○  2 of 3 verifications
[or]
● ● ●  3 of 3 verifications
✓ This provider now has expert-level verification confidence!

[CTAs]
[Back to Search] [View Provider]

Learn about our research methodology →
```

## Progress Indicators

### Question Progress
Shows completion within current verification:

```
Question 3 of 5              ~2 min remaining
[████████████░░░░░░░░░░░░] 60%
```

### Verification Progress (New Feature)
Shows progress toward 3-verification goal:

```
┌─────────────────────────────────────────────┐
│  ✓ Verification 1 of 3 needed for          │
│    expert-level accuracy                     │
└─────────────────────────────────────────────┘
2 more verifications after this to reach high confidence
```

**Design:**
- Primary badge: bg-primary-50, text-primary-900
- Positioned below question progress bar
- Visible on all question screens
- Dynamic calculation based on existingVerificationCount

## Research Tooltips

### Design Pattern
```tsx
<Tooltip id="unique-id">
  <strong>Research shows [key statistic].</strong>
  <br /><br />
  [Conversational explanation with specific impacts]
  <br /><br />
  <em className="text-xs">Source: [Journal Name]</em>
</Tooltip>
```

### Tooltip Styling
- Dark background (bg-gray-900)
- White text
- Rounded corners (rounded-lg)
- Drop shadow (shadow-lg)
- Position: Absolute, left of info icon
- Width: 256px (w-64)

### Tooltip Behavior
- Hover to show
- Click to toggle (mobile support)
- Auto-hide on mouse leave

## Button Hierarchy

### Primary Action
```tsx
className="w-full btn-primary text-lg py-4"
```
- Full width
- Large text (text-lg)
- Extra padding (py-4)
- Primary brand color
- Used for affirmative/expected answers

### Secondary Action
```tsx
className="w-full btn-outline text-lg py-4"
```
- Full width
- Large text (text-lg)
- Extra padding (py-4)
- Outlined style
- Used for negative/alternative answers

## Time Estimates

Based on research showing optimal crowdsourcing tasks are <5 minutes:

| Step | Time | Cumulative |
|------|------|------------|
| Intro | 15s | 15s |
| Phone Reached | 20s | 35s |
| Phone Correct | 15s | 50s |
| Accepts Insurance | 25s | 1:15 |
| New Patients | 15s | 1:30 |
| Appointment | 20s | 1:50 |
| **Total** | **~2 min** | |

## API Integration

### Submit Endpoint
```typescript
POST /api/verifications

{
  npi: string,
  planId: string,
  phoneReached: boolean,
  phoneCorrect: boolean,
  acceptsInsurance: boolean,
  acceptsNewPatients: boolean,
  scheduledAppointment: boolean,
  notes?: string
}
```

### Response Format
```json
{
  "success": true,
  "data": {
    "verification": { ... },
    "acceptance": {
      "confidenceScore": 87,
      "verificationCount": 2,
      "confidenceLevel": "MEDIUM",
      "confidenceDescription": "Some verification exists, but may need confirmation. Research shows 3 verifications achieve expert-level accuracy."
    },
    "message": "Verification submitted successfully"
  }
}
```

## Mobile Optimization

### Touch Targets
- Buttons: Minimum 48px height (py-4 with text-lg = ~56px)
- Wide spacing between options (space-y-3 = 12px)
- Full-width buttons for easy tapping

### Single Column Layout
- One question per screen = no scrolling
- Large text for readability (text-2xl headings)
- Progress bar at top for context

### Accessibility
- Semantic HTML (h2 for questions)
- Proper button elements (not divs)
- Keyboard navigation support
- Screen reader friendly tooltips

## Why This Works

### Cognitive Load Reduction
- **Single focus:** One question at a time
- **Binary choices:** Yes/No only, no complex decisions
- **No typing:** All button-based interactions

### Motivation & Trust
- **Research citations:** Build credibility
- **Progress tracking:** Show impact ("X of 3 needed")
- **Time estimate:** "Under 2 minutes" sets expectations

### Accuracy Optimization
Based on Mortensen et al. (2015):
- **Simple tasks:** Binary > rating scales > open-ended
- **Self-contained:** Each question standalone
- **Quick completion:** <5 minutes maintains attention

### Conversion Optimization
- **Low barrier:** "Just 5 questions, no typing"
- **Social proof:** "3 verifications = expert-level"
- **Impact messaging:** "Prevent surprise bills"

## A/B Test Opportunities

### Test 1: Progress Emphasis
- **Control:** "Question 3 of 5"
- **Variant:** "Verification 1 of 3 needed" (more prominent)

### Test 2: Research Context Timing
- **Control:** Research banner on intro only
- **Variant:** Research badge on every question screen

### Test 3: Button Copy
- **Control:** "Yes, I reached them"
- **Variant:** "Yes ✓" (more concise)

### Test 4: Tooltip Presentation
- **Control:** "Why we ask this" + hover tooltip
- **Variant:** Inline research note (always visible)

## Success Metrics

### Completion Rate
- **Target:** >85% completion (intro → success)
- **Benchmark:** Industry standard for 5-question forms: 70-80%

### Time to Complete
- **Target:** <2 minutes average
- **Dropout Analysis:** Track which questions cause abandonment

### Data Quality
- **Agreement Rate:** Track upvote/downvote ratio
- **Conflict Rate:** % of verifications that contradict previous data
- **Follow-up Verification:** % that schedule appointments

### User Engagement
- **Repeat Verifications:** % of users who verify multiple providers
- **Referral Rate:** % who share after completing
- **Trust Signals:** Click rate on "Learn about research" link

## Future Enhancements

### Gamification (Research-Backed)
- "You've submitted X verifications - you're more accurate than 80% of users!"
- Badge system based on verification count
- Leaderboard for power users

### Progressive Disclosure
- Start with 3 critical questions
- "Want to add more details?" → Optional 2 more
- Balances completion rate vs data richness

### Conditional Logic
- If phoneReached=NO, ask "Did you try to call?"
- If acceptsInsurance=NO, ask "When did they drop it?"
- More data without overwhelming all users

### AI-Assisted Validation
- Flag suspicious patterns (all providers "don't accept")
- Cross-reference with recent verifications
- Request re-verification when conflicts detected
