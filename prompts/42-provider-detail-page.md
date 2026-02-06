---
tags:
  - frontend
  - feature
  - implemented
type: prompt
priority: 3
created: 2026-02-05
---

# Provider Detail Page Architecture

## Files to Review
- `packages/frontend/src/app/provider/[npi]/page.tsx` (page component)
- `packages/frontend/src/components/provider-detail/` (sub-components)
  - `ProviderHeroCard.tsx` — Header card with name, specialty, location, confidence
  - `InsuranceList.tsx` — Insurance plans accepted by provider
  - `AboutProvider.tsx` — Provider details (entity type, new patients, languages)
  - `ColocatedProviders.tsx` — Other providers at same location
- `packages/frontend/src/components/Disclaimer.tsx` (data accuracy disclaimer)
- `packages/frontend/src/components/ConfidenceBadge.tsx` (confidence score badge)
- `packages/frontend/src/components/ConfidenceScoreBreakdown.tsx` (score factor breakdown)
- `packages/frontend/src/hooks/useProviderSearch.ts` (`useProvider`, `useProviderPlans`, `useColocatedProviders`)
- `packages/frontend/src/lib/api.ts` (`providerApi.getByNpi()`)

## Page Overview

The provider detail page (`/provider/[npi]`) is the most complex page in the app. It displays comprehensive information about a single healthcare provider, including their insurance acceptance, confidence scoring, and co-located providers.

**Route:** `/provider/[npi]` (dynamic segment = NPI number)
**Rendering:** Server-side with ISR (`revalidate: 3600`) + client-side interactivity via `ProviderDetailClient`

## Data Flow

```
URL: /provider/1234567890
        │
        ▼
  useParams() → npi
        │
        ▼
  providerApi.getByNpi(npi)
        │
        ▼
  Backend: GET /api/v1/providers/:npi
        │
        ▼
  Response: {
    provider: ProviderDisplay & {
      planAcceptances: PlanAcceptanceDisplay[]
    }
  }
        │
        ▼
  Page computes:
  ├── confidenceScore (max across all plan acceptances)
  ├── verificationCount (sum across all plan acceptances)
  ├── lastVerifiedAt (most recent across all)
  └── insurancePlans (transformed for InsuranceList)
        │
        ▼
  Render sub-components
```

## Component Tree

```
ProviderDetailPage
├── Breadcrumb (Link back to /search)
├── LoadingSpinner (loading state)
├── Error State (retry + back to search)
└── Provider Content (when loaded)
    ├── ProviderHeroCard
    │   ├── Provider name, credentials
    │   ├── Specialty and entity type
    │   ├── Practice address
    │   ├── Phone number
    │   ├── ConfidenceBadge (overall score)
    │   └── Verification count
    ├── Disclaimer (inline variant, with "Learn More" link)
    ├── AboutProvider
    │   ├── Entity type (Individual vs Organization)
    │   ├── Accepts new patients (if available)
    │   └── Languages (if available)
    ├── InsuranceList
    │   ├── Plan cards with acceptance status
    │   ├── Per-plan confidence scores
    │   ├── Verification CTA (if no plans)
    │   └── Last verified date
    └── ColocatedProviders
        └── Other providers at same address
```

## Key Computations

### Confidence Score Aggregation
```typescript
// Max confidence across all plan acceptances
const confidenceScore = provider?.planAcceptances?.reduce(
  (max, p) => Math.max(max, p.confidence?.score ?? p.confidenceScore ?? 0),
  0
) || 0;
```

### Verification Count Aggregation
```typescript
// Total verifications across all plans
const verificationCount = provider?.planAcceptances?.reduce(
  (total, p) => total + (p.verificationCount || 0),
  0
) || 0;
```

### Insurance Plan Transformation
```typescript
// Transform PlanAcceptanceDisplay → InsuranceList format
const insurancePlans = provider?.planAcceptances?.map(p => ({
  id: p.id,
  planId: p.planId,
  name: p.plan?.planName || p.plan?.issuerName || 'Unknown Plan',
  status: p.acceptanceStatus === 'ACCEPTED' ? 'accepted' : 'unknown',
  confidence: p.confidence?.score ?? p.confidenceScore ?? 0,
})) || [];
```

## Sub-Components

### ProviderHeroCard
Primary display card at top of page. Shows:
- Display name with credentials (MD, DO, NP, etc.)
- Primary specialty
- Entity type badge (Individual/Organization)
- Practice address (from first practice_location)
- Phone number
- Overall confidence gauge
- Verification count badge

### InsuranceList
Displays insurance acceptance data. Features:
- List of accepted plans with status badges
- Per-plan confidence scores
- Last verified date per plan
- Verification CTA button for adding new verifications
- Empty state with call-to-action when no plans linked

### AboutProvider
Additional provider information:
- Entity type explanation
- New patient acceptance status
- Languages spoken
- Conditionally rendered sections (only if data available)

### ColocatedProviders
Shows other providers at the same practice location:
- Fetches via `providerApi.getColocated(npi)`
- Shows provider cards similar to search results
- Helps users discover related providers (same clinic/hospital)

### Disclaimer
Data accuracy disclaimer:
- `variant="inline"` for compact display
- Links to full `/disclaimer` page
- Required for all provider-specific data display

## States

### Loading
- `LoadingSpinner` centered on page
- Triggered on initial load and NPI change

### Error
- "Provider Not Found" card with error icon
- "Try Again" button (re-fetches)
- "Back to Search" link
- Handles network errors, 404s, rate limits

### Success
- Full provider content with all sub-components

## Checklist

### Page
- [x] Dynamic route `/provider/[npi]`
- [x] Server-side rendering with ISR (`revalidate: 3600`)
- [x] SEO metadata generation (Physician schema)
- [x] Client-side interactivity via `ProviderDetailClient`
- [x] Breadcrumb navigation back to search
- [x] Loading, error, and success states
- [x] Retry on error

### Data
- [x] Single API call for provider + plan acceptances
- [x] Confidence score aggregation (max across plans)
- [x] Verification count aggregation (sum across plans)
- [x] Insurance plan data transformation
- [x] Co-located provider fetching

### Components
- [x] ProviderHeroCard with confidence badge
- [x] InsuranceList with per-plan scores
- [x] AboutProvider (entity type, new patients, languages)
- [x] ColocatedProviders
- [x] Data accuracy Disclaimer

### Missing / Future
- [x] Server-side rendering for SEO — implemented with `revalidate: 3600` and metadata generation
- [ ] Structured data / JSON-LD for search engines (beyond current metadata)
- [ ] Share provider button
- [ ] Print-friendly view
- [ ] Verification history timeline (component exists but not wired in)
- [ ] Score breakdown modal (component exists but not wired in)

## Questions to Ask
1. Should provider detail pages be server-rendered for SEO?
2. Should we add structured data (JSON-LD) for Google healthcare search results?
3. Is the co-located providers feature useful? Is it performant?
4. Should the verification timeline be displayed on this page?
5. Should we add a "Report incorrect information" feature?
