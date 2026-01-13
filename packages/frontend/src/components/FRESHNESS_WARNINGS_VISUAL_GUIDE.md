# Freshness Warnings Visual Guide

## Overview
Color-coded verification freshness warnings appear on both search results (compact) and provider detail pages (prominent) to help users understand data reliability.

## Research Foundation

**Ndumele et al. (2018), Health Affairs:**
- 12% annual provider network turnover
- Mental health: Only 43% accept Medicaid (highest churn)
- Primary care: 12% annual turnover
- Hospital-based: More stable positions

**Implementation:** Specialty-specific thresholds with aggressive decay at 2x threshold

---

## Warning Levels

### 🟢 GREEN: Recently Verified (Within Threshold)

**Criteria:**
- Mental Health: < 30 days
- Primary Care: < 60 days
- Specialists: < 60 days
- Hospital-Based: < 90 days

**Card Variant (Search Results):**
```
✓ Recently verified
```

**Detail Variant (Provider Pages):**
```
┌─────────────────────────────────────────────────────┐
│  ✓  Recently Verified                               │
│                                                      │
│  Last verified 15 days ago (within 60-day          │
│  recommendation)                                     │
│                                                      │
│  Research shows primary care providers have 12%     │
│  annual turnover in insurance networks.             │
│  (Ndumele et al. 2018)                             │
└─────────────────────────────────────────────────────┘
```
**Color:** Green background (bg-green-50, border-green-200)

---

### 🟡 YELLOW: Stale Data (Past Threshold, Within 2x)

**Criteria:**
- Mental Health: 30-60 days
- Primary Care: 60-120 days
- Specialists: 60-120 days
- Hospital-Based: 90-180 days

**Card Variant (Search Results):**
```
⚠️ Last verified 75 days ago  ℹ️
Research shows providers change networks frequently.
                                          [Verify Now →]
```

**Hover Tooltip:**
```
┌────────────────────────────────────────┐
│ Research shows providers change        │
│ insurance networks 12% annually.       │
│                                        │
│ Mental health providers change         │
│ networks even more frequently - only  │
│ 43% accept Medicaid.                  │
│                                        │
│ (Ndumele et al. 2018)                 │
└────────────────────────────────────────┘
```

**Detail Variant (Provider Pages):**
```
┌─────────────────────────────────────────────────────┐
│  ⚠️  Verification Needed                            │
│                                                      │
│  Last verified 75 days ago. Research shows          │
│  providers change networks frequently.              │
│                                                      │
│  Research shows primary care providers have 12%     │
│  annual turnover in insurance networks.             │
│  (Ndumele et al. 2018)                             │
│                                                      │
│  [Verify This Provider Now]                         │
└─────────────────────────────────────────────────────┘
```
**Color:** Yellow background (bg-yellow-50, border-yellow-200)

---

### 🔴 RED: Very Stale (Past 2x Threshold or Never Verified)

**Criteria:**
- Mental Health: > 60 days
- Primary Care: > 120 days
- Specialists: > 120 days
- Hospital-Based: > 180 days
- OR: Never verified (null)

**Card Variant (Search Results):**
```
⚠️ Not verified in 150 days  ℹ️
Research shows 12% annual turnover. Please re-verify.
                                          [Verify Now →]
```

**Hover Tooltip:**
```
┌────────────────────────────────────────┐
│ Research shows providers change        │
│ insurance networks 12% annually.       │
│                                        │
│ Mental health providers change         │
│ networks even more frequently - only  │
│ 43% accept Medicaid.                  │
│                                        │
│ (Ndumele et al. 2018)                 │
└────────────────────────────────────────┘
```

**Detail Variant (Provider Pages):**
```
┌─────────────────────────────────────────────────────┐
│  ⚠️  Stale Verification - Re-verify Needed          │
│                                                      │
│  Not verified in 150 days. Research shows 12%       │
│  annual provider turnover in insurance networks.    │
│                                                      │
│  Research shows primary care providers have 12%     │
│  annual turnover in insurance networks.             │
│  (Ndumele et al. 2018)                             │
│                                                      │
│  [Verify This Provider Now]                         │
└─────────────────────────────────────────────────────┘
```
**Color:** Red background (bg-red-50, border-red-200)

---

## Implementation Locations

### 1. Search Results (ProviderCard.tsx)

**Location:** Below provider address/phone, above "View Details" link

**Variant:** `card` (compact)

**Props:**
```tsx
<FreshnessWarning
  lastVerifiedAt={lastVerifiedAt}              // Date | null
  specialty={provider.specialtyCategory}        // string | null
  taxonomyDescription={provider.taxonomyDescription}
  providerNpi={provider.npi}
  providerName={provider.displayName}
  planId={planId}                               // For pre-fill
  planName={planName}                           // For pre-fill
  variant="card"                                // Compact display
  showVerifyButton={true}
/>
```

**Visual Example:**
```
┌────────────────────────────────────────────────────┐
│  Dr. Jane Smith                                    │
│  Primary Care                                      │
│                                                     │
│  📍 123 Main St, Boston, MA 02101                  │
│  📞 (617) 555-0100                                 │
│                                                     │
│  ⚠️ Last verified 75 days ago  ℹ️   [Verify Now →] │
│  Research shows providers change networks           │
│  frequently.                                        │
│                                                     │
│                            [View Details →]        │
└────────────────────────────────────────────────────┘
```

---

### 2. Provider Detail Pages (page.tsx)

**Location:** Below each plan acceptance card

**Variant:** `detail` (prominent banner)

**Props:**
```tsx
<FreshnessWarning
  lastVerifiedAt={pa.lastVerifiedAt ? new Date(pa.lastVerifiedAt) : null}
  specialty={provider.specialtyCategory}
  taxonomyDescription={provider.taxonomyDescription}
  providerNpi={provider.npi}
  providerName={provider.displayName}
  planId={pa.plan?.planId}
  planName={pa.plan?.planName}
  variant="detail"                              // Prominent banner
  showVerifyButton={true}
/>
```

**Visual Example:**
```
Accepted Insurance Plans
────────────────────────────────────────────────

┌────────────────────────────────────────────────────┐
│  Blue Cross Blue Shield MA                          │
│  Blue Cross Blue Shield • PPO                       │
│  ✓ Accepting new patients                          │
│                                                     │
│                      [Medium Confidence] [Verify]  │
└────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  ⚠️  Verification Needed                            │
│                                                      │
│  Last verified 75 days ago. Research shows          │
│  providers change networks frequently.              │
│                                                      │
│  Research shows primary care providers have 12%     │
│  annual turnover in insurance networks.             │
│  (Ndumele et al. 2018)                             │
│                                                      │
│  [Verify This Provider Now]                         │
└─────────────────────────────────────────────────────┘
```

---

## Specialty-Specific Examples

### Mental Health Provider (30-day threshold)

**20 days old:** 🟢 GREEN "Recently verified"

**45 days old:** 🟡 YELLOW
```
⚠️ Last verified 45 days ago
Research shows providers change networks frequently.
```

**Tooltip:**
> Research shows mental health providers change insurance networks more frequently, with only 43% accepting Medicaid. (Ndumele et al. 2018)

**70 days old:** 🔴 RED
```
⚠️ Not verified in 70 days
Research shows 12% annual turnover. Please re-verify.
```

---

### Primary Care (60-day threshold)

**45 days old:** 🟢 GREEN "Recently verified"

**85 days old:** 🟡 YELLOW
```
⚠️ Last verified 85 days ago
Research shows providers change networks frequently.
```

**Tooltip:**
> Research shows primary care providers have 12% annual turnover in insurance networks. (Ndumele et al. 2018)

**130 days old:** 🔴 RED
```
⚠️ Not verified in 130 days
Research shows 12% annual turnover. Please re-verify.
```

---

### Hospital-Based (90-day threshold)

**75 days old:** 🟢 GREEN "Recently verified"

**130 days old:** 🟡 YELLOW
```
⚠️ Last verified 130 days ago
Research shows providers change networks frequently.
```

**Tooltip:**
> Hospital-based providers typically have more stable network participation than other specialties.

**190 days old:** 🔴 RED
```
⚠️ Not verified in 190 days
Research shows 12% annual turnover. Please re-verify.
```

---

## Verify Now Button

### Behavior
Clicking "Verify Now →" links to verification form with pre-filled data:

**URL Format:**
```
/verify?npi={npi}&name={name}&planId={planId}&planName={planName}
```

**Example:**
```
/verify?npi=1234567890&name=Dr.%20Jane%20Smith&planId=BCBS-MA-001&planName=Blue%20Cross%20Blue%20Shield%20MA
```

### Button Styling

**Card Variant (Inline Link):**
- Text: "Verify Now →"
- Size: text-xs
- Color: Matches warning level
  - YELLOW: text-yellow-700 hover:text-yellow-800
  - RED: text-red-700 hover:text-red-800
- Position: Right-aligned, same line as warning

**Detail Variant (Prominent Button):**
- Text: "Verify This Provider Now"
- Size: text-sm
- Style: btn-outline (YELLOW) or btn-primary (RED)
- Position: Bottom of banner, left-aligned

---

## Research Tooltips

### Design
- **Trigger:** Info icon (ℹ️) next to warning
- **Interaction:** Hover to show, click to toggle (mobile)
- **Position:** Absolute, left of icon
- **Width:** 256px (w-64)
- **Style:**
  - Background: bg-gray-900
  - Text: white, text-xs
  - Rounded: rounded-lg
  - Shadow: shadow-lg

### Content Structure
```
<strong>Research shows [key statistic].</strong>

[Specialty-specific context and implications]

<em className="text-xs">(Journal Name, Author et al. Year)</em>
```

### Specialty-Specific Tooltips

**Mental Health:**
> Research shows mental health providers change insurance networks more frequently, with only 43% accepting Medicaid. (Ndumele et al. 2018)

**Primary Care:**
> Research shows primary care providers have 12% annual turnover in insurance networks. (Ndumele et al. 2018)

**Hospital-Based:**
> Hospital-based providers typically have more stable network participation than other specialties.

**Specialists (Default):**
> Research shows providers change insurance networks at approximately 12% annually. (Ndumele et al. 2018)

---

## Mobile Optimization

### Card Variant (Search Results)
```
┌─────────────────────────────────┐
│  Dr. Jane Smith                 │
│  Primary Care                   │
│                                 │
│  📍 123 Main St                 │
│     Boston, MA 02101            │
│                                 │
│  ⚠️ Last verified 75 days ago   │
│     ℹ️                          │
│     Research shows providers    │
│     change networks frequently. │
│                                 │
│     [Verify Now →]              │
│                                 │
│              [View Details →]  │
└─────────────────────────────────┘
```

**Changes:**
- Warning text wraps naturally
- "Verify Now" button moves to its own line
- Tooltip click-to-toggle for mobile

### Detail Variant (Provider Pages)
```
┌─────────────────────────────────┐
│  Blue Cross Blue Shield MA      │
│  BCBS • PPO                     │
│  ✓ Accepting new patients       │
│                                 │
│  [Medium] [Verify]              │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  ⚠️  Verification Needed        │
│                                 │
│  Last verified 75 days ago.     │
│  Research shows providers       │
│  change networks frequently.    │
│                                 │
│  Research shows primary care    │
│  providers have 12% annual      │
│  turnover in insurance          │
│  networks.                      │
│  (Ndumele et al. 2018)         │
│                                 │
│  [Verify This Provider Now]     │
└─────────────────────────────────┘
```

**Changes:**
- Full-width banner (already responsive)
- Text wraps naturally
- Button remains prominent and touch-friendly

---

## User Impact

### Problem Being Solved
**Research shows:**
- 46-77% of insurance directories are wrong
- 4x more surprise medical bills with inaccurate directories
- 28% of patients delay care due to directory errors
- Traditional directories take 540 days to correct errors

### Solution
**Freshness warnings:**
- Alert users to potentially stale information
- Provide research context for trust
- Enable quick re-verification
- Specialty-specific thresholds match churn rates

### Expected Outcomes
1. **Reduced Surprise Bills:** Users avoid providers with stale data
2. **Increased Verification:** "Verify Now" CTAs drive re-verification
3. **Better Decisions:** Research tooltips build trust in warnings
4. **Community Engagement:** Users understand why verification matters

---

## Analytics & Metrics

### Track These Events

**Warning Display:**
- Impression: Freshness warning shown
- Level: GREEN/YELLOW/RED
- Specialty: Mental health/primary care/specialist/hospital
- Days since verification

**User Interaction:**
- Tooltip opened
- "Verify Now" clicked
- Verification completed (from freshness CTA)

**Conversion Funnel:**
```
Warning Shown → Tooltip Opened → Verify Clicked → Form Started → Form Completed
```

### Success Metrics

**Re-verification Rate:**
- Target: >15% of users who see YELLOW warnings click "Verify Now"
- Target: >25% of users who see RED warnings click "Verify Now"

**Time to Re-verification:**
- Mental health: <30 days average
- Primary care: <60 days average
- Specialists: <60 days average
- Hospital-based: <90 days average

**User Trust:**
- Survey: "Do freshness warnings help you make better decisions?"
- Target: >80% agree or strongly agree

---

## A/B Test Opportunities

### Test 1: Warning Copy
- **Control:** "Last verified 75 days ago"
- **Variant:** "75 days since last patient verified this"
- **Hypothesis:** Personal framing increases engagement

### Test 2: Research Tooltip
- **Control:** Click/hover tooltip
- **Variant:** Always visible research note (inline)
- **Hypothesis:** Visible research increases trust without tooltip

### Test 3: Verify Button Position
- **Control:** Right-aligned link on same line
- **Variant:** Full-width button on separate line
- **Hypothesis:** More prominent CTA increases clicks

### Test 4: Color Intensity
- **Control:** Current soft backgrounds (50 opacity)
- **Variant:** More saturated backgrounds (100 opacity)
- **Hypothesis:** Stronger colors increase attention to stale data

---

## Future Enhancements

### 1. Dynamic Thresholds
Use actual observed churn rates per specialty/region to adjust thresholds

### 2. Predictive Warnings
"This provider dropped 3 insurance plans in the past year - verify carefully"

### 3. Verification History Timeline
Show trend: "Verified 5 times in last 90 days - high confidence"

### 4. Push Notifications
Email/SMS when a saved provider's data becomes stale

### 5. Crowdsourced Churn Data
"8 users reported this provider dropped [Plan] in last 30 days"
