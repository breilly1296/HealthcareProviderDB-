# FreshnessWarning Component Integration Guide

## Overview
The `FreshnessWarning` component displays research-backed verification freshness warnings on provider cards and detail pages.

## Research Foundation
- Mental health: 30-day threshold (43% Medicaid acceptance, high churn)
- Primary care: 60-day threshold (12% annual turnover)
- Specialists: 60-day threshold
- Hospital-based: 90-day threshold (more stable)

**Source:** Ndumele et al. (2018), Health Affairs

---

## Provider Detail Page Integration

### Example: Provider Detail Page Component

```tsx
import FreshnessWarning from '@/components/FreshnessWarning';

export default function ProviderDetailPage({ provider, planAcceptance }) {
  return (
    <div>
      {/* Provider Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{provider.displayName}</h1>
        <p className="text-xl text-gray-600">{provider.taxonomyDescription}</p>
      </div>

      {/* Freshness Warning - Prominent Detail Variant */}
      <FreshnessWarning
        lastVerifiedAt={planAcceptance?.lastVerifiedAt || null}
        specialty={provider.specialtyCategory}
        taxonomyDescription={provider.taxonomyDescription}
        providerNpi={provider.npi}
        providerName={provider.displayName}
        planId={planAcceptance?.planId}
        planName={planAcceptance?.planName}
        variant="detail"  // Prominent variant for detail pages
        showVerifyButton={true}
        className="mb-6"
      />

      {/* Rest of provider details */}
      <div className="card">
        {/* Contact information, address, etc. */}
      </div>
    </div>
  );
}
```

---

## Search Results Integration

### Example: Search Results with Provider Cards

```tsx
import { ProviderCard } from '@/components/ProviderCard';

export default function SearchResults({ providers, planId, planName }) {
  return (
    <div className="space-y-4">
      {providers.map((provider) => (
        <ProviderCard
          key={provider.npi}
          provider={provider}
          confidenceScore={provider.confidenceScore}
          showConfidence={true}
          // Freshness warning integration
          lastVerifiedAt={provider.lastVerifiedAt}
          planId={planId}
          planName={planName}
        />
      ))}
    </div>
  );
}
```

---

## Warning Levels

### GREEN (Within Threshold)
```tsx
// Example: Provider verified 15 days ago, primary care (60-day threshold)
<FreshnessWarning
  lastVerifiedAt={new Date('2026-01-01')}  // 15 days ago
  specialty="PRIMARY_CARE"
  variant="card"
/>

// Displays: "✓ Recently verified"
```

### YELLOW (Past threshold but < 2x)
```tsx
// Example: Provider verified 75 days ago, primary care (60-day threshold)
<FreshnessWarning
  lastVerifiedAt={new Date('2025-10-29')}  // 75 days ago
  specialty="PRIMARY_CARE"
  variant="card"
/>

// Displays:
// "⚠️ Last verified 75 days ago"
// "Research shows providers change networks frequently."
// [Verify Now →]
```

### RED (Past 2x threshold)
```tsx
// Example: Provider verified 150 days ago, primary care (60-day threshold)
<FreshnessWarning
  lastVerifiedAt={new Date('2025-08-15')}  // 150 days ago
  specialty="PRIMARY_CARE"
  variant="card"
/>

// Displays:
// "⚠️ Not verified in 150 days"
// "Research shows 12% annual turnover. Please re-verify."
// [Verify Now →]
```

---

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `lastVerifiedAt` | `Date \| null` | Yes | Date of last verification |
| `specialty` | `string \| null` | No | Provider specialty category |
| `taxonomyDescription` | `string \| null` | No | Provider taxonomy description |
| `providerNpi` | `string` | Yes | Provider NPI number |
| `providerName` | `string` | Yes | Provider display name |
| `planId` | `string` | No | Insurance plan ID for pre-fill |
| `planName` | `string` | No | Insurance plan name for pre-fill |
| `variant` | `'card' \| 'detail'` | No | Display variant (default: `'card'`) |
| `showVerifyButton` | `boolean` | No | Show "Verify Now" button (default: `true`) |
| `className` | `string` | No | Additional CSS classes |

---

## Specialty Detection

The component automatically maps specialties to freshness categories:

### Mental Health (30 days)
- Psychiatry, Psychology
- Mental Health, Behavioral Health
- Counselors, Therapists

### Primary Care (60 days)
- Family Medicine, Family Practice
- Internal Medicine, General Practice

### Hospital-Based (90 days)
- Hospital, Radiology
- Anesthesiology, Pathology
- Emergency Medicine

### Specialist (60 days)
- All other specialties (default)

---

## Research Tooltips

Each warning level includes a research-based tooltip:

### Mental Health
> "Research shows mental health providers change insurance networks more frequently, with only 43% accepting Medicaid. (Ndumele et al. 2018)"

### Primary Care
> "Research shows primary care providers have 12% annual turnover in insurance networks. (Ndumele et al. 2018)"

### Hospital-Based
> "Hospital-based providers typically have more stable network participation than other specialties."

### Specialists (Default)
> "Research shows providers change insurance networks at approximately 12% annually. (Ndumele et al. 2018)"

---

## Verify Now Button

The "Verify Now" button links to the verification form with pre-filled parameters:

```
/verify?npi={npi}&name={name}&planId={planId}&planName={planName}
```

This reduces friction for users to contribute fresh verification data.

---

## Styling Variants

### Card Variant (Compact)
- Used in search results and lists
- Inline layout with minimal vertical space
- Tooltip on hover for research details
- "Verify Now →" link inline

### Detail Variant (Prominent)
- Used on provider detail pages
- Full-width banner with icon
- Expanded research explanation
- Prominent "Verify This Provider Now" button

---

## Example: Complete Provider Detail Page

```tsx
import FreshnessWarning from '@/components/FreshnessWarning';

export default function ProviderDetailPage({ params }) {
  const { npi } = params;

  // Fetch provider and plan acceptance data
  const provider = await getProvider(npi);
  const planAcceptance = await getPlanAcceptance(npi, planId);

  return (
    <div className="container-wide py-8">
      {/* Provider Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          {provider.displayName}
        </h1>
        <p className="text-xl text-gray-600 mt-2">
          {provider.taxonomyDescription}
        </p>
      </div>

      {/* Freshness Warning - Prominent */}
      <FreshnessWarning
        lastVerifiedAt={planAcceptance?.lastVerifiedAt || null}
        specialty={provider.specialtyCategory}
        taxonomyDescription={provider.taxonomyDescription}
        providerNpi={provider.npi}
        providerName={provider.displayName}
        planId={planAcceptance?.planId}
        planName={planAcceptance?.planName}
        variant="detail"
        showVerifyButton={true}
        className="mb-8"
      />

      {/* Provider Information Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Information */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-2xl font-bold mb-4">Contact Information</h2>
            {/* Address, phone, etc. */}
          </div>
        </div>

        {/* Insurance Plans Sidebar */}
        <div>
          <div className="card">
            <h3 className="text-xl font-bold mb-4">Insurance Plans</h3>
            {/* Plan list with freshness warnings */}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Best Practices

1. **Always pass lastVerifiedAt** - Even if null, this shows "Not verified" state
2. **Include plan context** - Pass planId and planName for better verification flow
3. **Use appropriate variant** - 'card' for lists, 'detail' for detail pages
4. **Show verify button** - Enable users to contribute fresh data
5. **Check for undefined vs null** - Use conditional rendering appropriately

---

## Testing

Test scenarios for different warning levels:

```tsx
// GREEN: Recently verified (within threshold)
lastVerifiedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) // 20 days ago

// YELLOW: Stale (past threshold, within 2x)
lastVerifiedAt: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000) // 75 days ago

// RED: Very stale (past 2x threshold)
lastVerifiedAt: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000) // 150 days ago

// RED: No verification
lastVerifiedAt: null
```
