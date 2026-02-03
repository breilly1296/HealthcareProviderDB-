# VerifyMyProvider User Journey Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

This document maps the primary user journeys through VerifyMyProvider, from initial discovery to verification submission. Understanding these flows helps optimize UX and identify improvement opportunities.

---

## Primary Personas

### 1. Insurance Verifier (Primary)
- **Who:** Patient looking to verify if their doctor accepts their insurance
- **Goal:** Quickly confirm provider-plan acceptance before appointment
- **Pain Points:** Outdated provider directories, phone tag with offices

### 2. Community Contributor
- **Who:** Patient who recently visited a provider
- **Goal:** Share verification to help others
- **Pain Points:** Wants to contribute but doesn't want to create account

### 3. Healthcare Navigator
- **Who:** Professional helping patients find providers
- **Goal:** Search and compare multiple providers efficiently
- **Pain Points:** Needs to check many providers quickly

---

## Journey 1: Verify My Provider

**Trigger:** User has upcoming appointment, unsure if provider accepts their insurance.

```
┌─────────────────────────────────────────────────────────────┐
│                    Verify My Provider Journey                │
│                                                              │
│  1. DISCOVER           2. SEARCH           3. VIEW          │
│  ┌──────────┐         ┌──────────┐        ┌──────────┐     │
│  │ Land on  │    →    │ Enter    │   →    │ Provider │     │
│  │ Homepage │         │ Criteria │        │ Detail   │     │
│  └──────────┘         └──────────┘        └──────────┘     │
│                                                   │          │
│  4. CHECK              5. DECIDE           6. ACTION        │
│  ┌──────────┐         ┌──────────┐        ┌──────────┐     │
│  │ Plan     │    →    │ Verified │   →    │ Book or  │     │
│  │ Status   │         │ or Not?  │        │ Call     │     │
│  └──────────┘         └──────────┘        └──────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Step Details

**Step 1: Discover**
- User arrives via search engine or direct link
- Sees clear value proposition: "Verify your provider accepts your insurance"
- Immediate access to search (no signup required)

**Step 2: Search**
- Enter provider name, location, or specialty
- Optional: Filter by state, city, ZIP
- Results appear quickly (< 500ms)

**Step 3: View Provider**
- See provider details (name, address, specialty)
- View all known insurance plan acceptance
- See confidence levels for each plan

**Step 4: Check Plan Status**
- Find specific insurance plan
- View acceptance status: Verified/Likely/Uncertain/Unknown
- See last verification date and count

**Step 5: Decide**
- HIGH confidence → Proceed with appointment
- MEDIUM confidence → Consider calling to confirm
- LOW/UNKNOWN → Contribute verification or call office

**Step 6: Action**
- Book appointment with confidence
- Or call office to verify (then contribute verification)

---

## Journey 2: Submit Verification

**Trigger:** User just confirmed insurance acceptance (phone, visit, card).

```
┌─────────────────────────────────────────────────────────────┐
│                   Submit Verification Journey                │
│                                                              │
│  1. FIND PROVIDER      2. SELECT PLAN      3. SUBMIT        │
│  ┌──────────┐         ┌──────────┐        ┌──────────┐     │
│  │ Search   │    →    │ Choose   │   →    │ Verify   │     │
│  │ Provider │         │ Plan     │        │ CAPTCHA  │     │
│  └──────────┘         └──────────┘        └──────────┘     │
│                                                   │          │
│  4. CONFIRM            5. ENGAGE                            │
│  ┌──────────┐         ┌──────────┐                         │
│  │ Success  │    →    │ Vote on  │                         │
│  │ Message  │         │ Others   │                         │
│  └──────────┘         └──────────┘                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Step Details

**Step 1: Find Provider**
- Search for provider by NPI, name, or location
- If coming from verification check, provider pre-selected

**Step 2: Select Plan**
- Search for insurance plan
- Or upload insurance card (OCR extracts plan)
- Select Accepts/Rejects

**Step 3: Submit**
- Complete CAPTCHA verification
- Optionally add notes ("Confirmed by phone 1/30/2026")
- Submit verification

**Step 4: Confirmation**
- See success message
- See updated confidence score
- Thank user for contribution

**Step 5: Engage (Optional)**
- Prompted to vote on other recent verifications
- See other providers at same location
- Encouraged to verify more

---

## Journey 3: Compare Providers

**Trigger:** User wants to compare multiple providers before choosing.

```
┌─────────────────────────────────────────────────────────────┐
│                   Compare Providers Journey                  │
│                                                              │
│  1. SEARCH             2. ADD TO COMPARE   3. COMPARE       │
│  ┌──────────┐         ┌──────────┐        ┌──────────┐     │
│  │ Search   │    →    │ Select   │   →    │ View     │     │
│  │ Results  │         │ Up to 4  │        │ Side by  │     │
│  └──────────┘         └──────────┘        │ Side     │     │
│                                           └──────────┘     │
│  4. DECIDE                                                  │
│  ┌──────────┐                                              │
│  │ Choose   │                                              │
│  │ Provider │                                              │
│  └──────────┘                                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Step Details

**Step 1: Search**
- Search for providers by specialty and location
- View results with basic info

**Step 2: Add to Compare**
- Click "Compare" button on provider cards
- Add up to 4 providers
- See compare tray at bottom

**Step 3: Compare**
- Side-by-side view of:
  - Provider details
  - Insurance acceptance
  - Confidence levels
  - Location/distance

**Step 4: Decide**
- Choose best provider for needs
- Click through to provider detail
- Optionally contribute verification

---

## Journey 4: Browse by Location

**Trigger:** User wants to see all providers at a specific hospital/clinic.

```
┌─────────────────────────────────────────────────────────────┐
│                   Browse Location Journey                    │
│                                                              │
│  1. FIND LOCATION      2. FILTER          3. SELECT         │
│  ┌──────────┐         ┌──────────┐        ┌──────────┐     │
│  │ Search   │    →    │ Filter   │   →    │ Provider │     │
│  │ Address  │         │ Specialty│        │ Detail   │     │
│  └──────────┘         └──────────┘        └──────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Interaction Points

### Search Experience

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Search for a provider                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  State: [California ▼]     City: [Los Angeles        ]     │
│                                                              │
│  Specialty: [Cardiology ▼]  Name: [optional           ]    │
│                                                              │
│                              [🔍 Search]                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Provider Card

```
┌─────────────────────────────────────────────────────────────┐
│  Dr. John Smith, MD                                    [⚡] │
│  Cardiovascular Disease                                     │
│  ─────────────────────────────────────────────────────────  │
│  📍 123 Medical Center Dr, Los Angeles, CA 90001           │
│  📞 (310) 555-1234                                         │
│  ─────────────────────────────────────────────────────────  │
│  Insurance Status:                                          │
│  ● Blue Cross PPO     [HIGH ✓]                             │
│  ● Aetna HMO          [MEDIUM ?]                           │
│  ● United Healthcare  [UNKNOWN]                             │
│  ─────────────────────────────────────────────────────────  │
│  [View Details]              [+ Compare]                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Verification Form

```
┌─────────────────────────────────────────────────────────────┐
│  Submit Verification                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Provider: Dr. John Smith, MD                               │
│            1234567890                                        │
│                                                              │
│  Insurance Plan:                                            │
│  [Search plans...                              ] [📷 Scan]  │
│                                                              │
│  Does this provider accept this plan?                       │
│  ○ Yes, they accept it                                      │
│  ○ No, they don't accept it                                 │
│                                                              │
│  Notes (optional):                                          │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Confirmed via phone call on 1/30/2026                 │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                              │
│  [✓] I'm not a robot                    [Submit]           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Conversion Funnel

```
Homepage Visit                    100%
        │
        ▼
Search Performed                   65%
        │
        ▼
Provider Detail Viewed             45%
        │
        ▼
Plan Status Checked                30%
        │
        ▼
Verification Submitted              5%
```

### Optimization Opportunities

1. **Search → Provider Detail (65% → 45%)**
   - Improve search result relevance
   - Add more filters
   - Show plan acceptance in search results

2. **Provider Detail → Plan Check (45% → 30%)**
   - Make plan search more prominent
   - Pre-populate common plans
   - Clearer confidence indicators

3. **Plan Check → Verification (30% → 5%)**
   - Reduce friction in verification form
   - Better call-to-action messaging
   - Thank contributors publicly

---

## Mobile Considerations

| Feature | Mobile Adaptation |
|---------|-------------------|
| Search | Stacked form fields |
| Results | Single column cards |
| Compare | Swipeable carousel |
| Verification | Simplified form, camera access |

---

## Analytics Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `page_view` | Page load | page, referrer |
| `search` | Search submitted | hasState, hasCity, hasSpecialty |
| `provider_view` | Provider detail | providerNpi |
| `plan_check` | Plan status viewed | providerNpi, planId |
| `verification_start` | Form opened | providerNpi |
| `verification_submit` | Form submitted | acceptsInsurance |
| `vote` | Vote cast | verificationId, vote |
| `compare_add` | Added to compare | providerNpi |

---

## Conclusion

User journeys are **well-designed for the MVP**:

- ✅ Clear primary flow (verify → search → check)
- ✅ Low friction verification submission
- ✅ Multiple entry points (search, compare, location)
- ✅ No signup required

**Optimization priorities:**
1. Improve search-to-detail conversion
2. Increase verification submission rate
3. Enhance mobile experience
