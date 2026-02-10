# Provider Detail Page Architecture

## Route & Rendering Strategy

- **Route:** `/provider/[npi]`
- **Rendering:** Server-Side Rendering (SSR) with Incremental Static Regeneration (ISR)
- **Revalidation:** `revalidate: 3600` (hourly ISR refresh)
- **Client interactivity:** Hydrated via `ProviderDetailClient` component

---

## Data Flow

```
URL (/provider/[npi])
    |
    v
useParams() extracts npi
    |
    v
providerApi.getByNpi(npi)
    |
    v
Backend: GET /providers/:npi
    |
    v
Response: { provider, planAcceptances[] }
    |
    v
Page computes:
  - max confidence score (across all planAcceptances)
  - total verification count (sum across all planAcceptances)
  - most recent lastVerifiedAt (max date)
  - transformed insurance plans (PlanAcceptanceDisplay[])
    |
    v
Render sub-components
```

---

## Component Tree

```
ProviderDetailPage
  |
  +-- Breadcrumb
  |     (Home > Search > Provider Name)
  |
  +-- LoadingSpinner (shown while data is fetching)
  |
  +-- Error State (shown when provider not found or API error)
  |     +-- Not Found Card
  |     +-- Retry Button
  |     +-- Back to Search Button
  |
  +-- Provider Content (shown on success)
        |
        +-- ProviderHeroCard
        |     +-- Provider Name (display name)
        |     +-- Specialty
        |     +-- Primary Address
        |     +-- Phone Number
        |     +-- ConfidenceBadge (max confidence across plans)
        |     +-- Verification Count (total across plans)
        |
        +-- Disclaimer (inline)
        |     (Crowdsourced data notice)
        |
        +-- AboutProvider
        |     +-- Entity Type (Individual / Organization)
        |     +-- Accepting New Patients (if available)
        |     +-- Languages Spoken
        |
        +-- InsuranceList
        |     +-- Per-plan rows:
        |           +-- Plan Name
        |           +-- Confidence Score (per plan)
        |           +-- Acceptance Status
        |           +-- Last Verified Date
        |           +-- Verification CTA (button to submit verification)
        |
        +-- ColocatedProviders
              (Other providers at the same practice address)
```

---

## Key Data Computations

### Confidence Score

```typescript
const confidenceScore = Math.max(
  ...provider.planAcceptances.map(pa => pa.confidenceScore)
);
```

The page-level confidence score is the **maximum** confidence across all plan acceptances for this provider. This represents the highest confidence of any insurance plan acceptance.

### Verification Count

```typescript
const verificationCount = provider.planAcceptances.reduce(
  (sum, pa) => sum + pa.verificationCount, 0
);
```

The total number of community verifications across all plan acceptances.

### Most Recent Verification

```typescript
const lastVerifiedAt = provider.planAcceptances.reduce(
  (latest, pa) => pa.lastVerifiedAt > latest ? pa.lastVerifiedAt : latest,
  new Date(0)
);
```

The most recent `lastVerifiedAt` timestamp across all plan acceptances.

### Insurance Plan Transformation

```typescript
interface PlanAcceptanceDisplay {
  id: string;
  planId: string;
  name: string;
  status: AcceptanceStatus;
  confidence: number;
}

const insurancePlans: PlanAcceptanceDisplay[] = provider.planAcceptances.map(pa => ({
  id: pa.id,
  planId: pa.planId,
  name: pa.plan.name,
  status: pa.status,
  confidence: pa.confidenceScore,
}));
```

Raw `planAcceptances` from the API response are transformed into a display-friendly format for the `InsuranceList` component.

---

## Page States

### Loading State

- Full-page `LoadingSpinner` component
- Displayed while `providerApi.getByNpi(npi)` is in flight
- No skeleton layout currently implemented

### Error State

- **Not Found:** Displayed when the API returns 404 or the NPI does not match any provider
- Includes a "not found" card with:
  - Message indicating the provider was not found
  - **Retry Button** to re-fetch the data
  - **Back to Search Button** to navigate back to the search page
- Network errors and server errors also route to this state

### Success State

- Full provider content rendered with all sub-components
- Client-side interactivity enabled (verification submissions, comparison, etc.)

---

## SEO

### Dynamic Metadata Generation

```typescript
export async function generateMetadata({ params }): Promise<Metadata> {
  const provider = await fetchProvider(params.npi);
  return {
    title: `${provider.displayName} - ${provider.specialty} | VerifyMyProvider`,
    description: `View insurance plans accepted by ${provider.displayName}, ${provider.specialty} in ${provider.city}, ${provider.state}. Community-verified provider information.`,
  };
}
```

- Title includes provider name, specialty, and site name
- Description includes provider name, specialty, and location

### Physician Schema

Structured data following the Schema.org `Physician` type is generated for provider detail pages to enhance search engine understanding.

### Missing SEO Features

| Feature | Status |
|---------|--------|
| JSON-LD structured data (full implementation) | Not implemented |
| Open Graph tags (og:title, og:description, og:image) | Not implemented |
| Twitter Card meta tags | Not implemented |
| Share button (social sharing) | Not implemented |
| Print view (printer-friendly layout) | Not implemented |
| Canonical URL | Not implemented |

---

## ISR Behavior

- **First visit:** Page is server-rendered and cached
- **Subsequent visits within 1 hour:** Served from cache (stale-while-revalidate)
- **After 1 hour:** Next visit triggers a background revalidation; the stale page is served immediately while the new version is generated
- **Benefit:** Provider data stays reasonably fresh without on-demand rendering for every request

---

## Related Files

- `providerApi.getByNpi` - API client method (`lib/api.ts`)
- `providerApi.getColocated` - Colocated providers API call
- `ConfidenceBadge` - Shared component for displaying confidence levels
- `InsuranceList` - Component rendering plan acceptance rows
- `ColocatedProviders` - Component listing other providers at the same address
- `verificationApi.submit` - Verification submission from the insurance list CTA
