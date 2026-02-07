# Provider Detail Page Architecture

## Overview

The provider detail page (`/provider/[npi]`) is the most complex page in VerifyMyProvider. It displays comprehensive information about a single healthcare provider, including their insurance acceptance data, confidence scoring with interactive breakdown, co-located providers, and inline verification capabilities. The page combines server-side rendering (with ISR) for SEO with client-side interactivity for a dynamic user experience.

**Route:** `/provider/[npi]` (dynamic segment = NPI number)
**Rendering:** Server-side with ISR (`revalidate: 3600`) for initial data + `ProviderDetailClient` for client-side interactivity
**Primary Files:**

| File | Purpose |
|------|---------|
| `packages/frontend/src/app/provider/[npi]/page.tsx` | Server component: SSR, metadata, JSON-LD |
| `packages/frontend/src/components/provider-detail/ProviderDetailClient.tsx` | Client orchestrator: state, data transforms, layout |
| `packages/frontend/src/components/provider-detail/ProviderHeroCard.tsx` | Header card with name, address, confidence gauge |
| `packages/frontend/src/components/provider-detail/InsuranceList.tsx` | Insurance plans list with verification modal |
| `packages/frontend/src/components/provider-detail/AboutProvider.tsx` | Entity type, new patients, languages |
| `packages/frontend/src/components/provider-detail/ColocatedProviders.tsx` | Lazy-loaded co-located providers |
| `packages/frontend/src/components/provider-detail/ConfidenceGauge.tsx` | SVG circular gauge with modal breakdown |
| `packages/frontend/src/components/provider-detail/ScoreBreakdown.tsx` | Factor-by-factor score visualization |
| `packages/frontend/src/components/provider-detail/index.ts` | Barrel exports for all sub-components |
| `packages/frontend/src/components/Disclaimer.tsx` | Data accuracy disclaimer (inline variant) |
| `packages/frontend/src/components/ConfidenceBadge.tsx` | Reusable confidence badge |
| `packages/frontend/src/components/ConfidenceScoreBreakdown.tsx` | Expandable score breakdown with factors |
| `packages/frontend/src/hooks/useProviderSearch.ts` | React Query hooks: `useProvider`, `useProviderPlans`, `useColocatedProviders` |
| `packages/frontend/src/lib/api.ts` | API client: `providerApi.getByNpi()`, `providerApi.getColocated()` |
| `packages/frontend/src/lib/formatName.ts` | NPPES ALL-CAPS to Title Case formatting |
| `packages/frontend/src/lib/analytics.ts` | Privacy-preserving PostHog analytics |

---

## Data Flow

```
URL: /provider/1234567890
        |
        v
  [Server Component: page.tsx]
        |
        +-- getProvider(npi) ---- fetch(`${API_URL}/providers/${npi}`, { next: { revalidate: 3600 } })
        |                              |
        |                              v
        |                   Backend: GET /api/v1/providers/:npi
        |                              |
        |                              v
        |                   Response: { data: { provider: ProviderWithPlans } }
        |
        +-- generateMetadata() --- builds <title>, <meta>, OpenGraph tags
        |
        +-- JSON-LD script -------- Physician or MedicalOrganization schema
        |
        v
  <ProviderDetailClient npi={npi} initialProvider={provider} />
        |
        v
  [Client Component: ProviderDetailClient.tsx]
        |
        +-- If initialProvider is null: fetchProvider() via providerApi.getByNpi(npi)
        |
        +-- Computes derived state:
        |   +-- bestAcceptance (plan acceptance with highest confidence score)
        |   +-- confidenceScore (score from bestAcceptance)
        |   +-- verificationCount (sum across all plan acceptances)
        |   +-- lastVerifiedAt (most recent date across all plans)
        |   +-- insurancePlans[] (transformed for InsuranceList component)
        |
        +-- Tracks provider view via PostHog analytics (privacy-preserving)
        |
        v
  Renders sub-components:
  +-- ProviderHeroCard (provider info + ConfidenceGauge)
  +-- Disclaimer (inline variant)
  +-- AboutProvider (entity type, new patients, languages)
  +-- InsuranceList (grouped plans + verification modal)
  +-- ColocatedProviders (lazy-loaded via IntersectionObserver)
```

---

## Component Tree

```
ProviderDetailPage (Server Component)
|-- <script type="application/ld+json"> (JSON-LD structured data)
|-- ProviderDetailClient (Client Component)
    |-- Breadcrumb nav (Link to /search)
    |-- LoadingSpinner (when loading === true)
    |-- Error State card (when error !== null)
    |   |-- Error icon + "Provider Not Found" heading
    |   |-- "Try Again" button (re-fetches provider)
    |   |-- "Back to Search" Link
    |-- Provider Content (when loaded successfully)
        |-- ProviderHeroCard
        |   |-- Avatar (initials from display name)
        |   |-- Provider name (toDisplayCase) + BadgeCheck icon (if score >= 70)
        |   |-- Specialty label
        |   |-- Organization name (if INDIVIDUAL with org)
        |   |-- Address (toAddressCase + toTitleCase)
        |   |-- Phone (tel: link, formatted)
        |   |-- "Get Directions" link (Google Maps)
        |   |-- NPI number + CMS sync date
        |   |-- ConfidenceGauge
        |       |-- SVG circular progress arc
        |       |-- Score percentage (center)
        |       |-- Confidence level label (High/Medium/Low)
        |       |-- Improvement hint text
        |       |-- "How is this calculated?" link/button
        |       |-- Score Breakdown Modal (FocusTrap)
        |           |-- ConfidenceScoreBreakdown (expanded)
        |               |-- Staleness warning (if data is stale)
        |               |-- Factor rows (Data Source, Recency, Verifications, Agreement)
        |               |-- Total score
        |               |-- Research note (if present)
        |               |-- Explanation (if present)
        |-- Disclaimer (variant="inline", showLearnMore=true)
        |   |-- Warning icon
        |   |-- "Data Accuracy Notice" text
        |   |-- "Learn more about our data" link (/disclaimer)
        |-- AboutProvider
        |   |-- New Patients status (Yes/No/Unknown)
        |   |-- Practice Type (Individual Provider / Group Practice)
        |   |-- Languages (comma-separated list)
        |-- InsuranceList
        |   |-- Header ("Insurance Acceptance" + status summary)
        |   |-- Location filter dropdown (if 2+ locations with plan data)
        |   |-- Search input (if 5+ plans)
        |   |-- CarrierGroupSection[] (grouped by carrier family)
        |   |   |-- Collapsible group header (carrier name + plan count)
        |   |   |-- PlanRow[] (indented plan rows)
        |   |       |-- StatusIcon (check/x/clock/question)
        |   |       |-- Plan name
        |   |       |-- Location badge (if location-specific)
        |   |       |-- DataFreshnessBadge (green/yellow/red dot)
        |   |       |-- "Verify" button
        |   |       |-- Status badge (Accepted/Not Accepted/Pending)
        |   |       |-- Confidence percentage
        |   |-- Single plan rows (ungrouped)
        |   |-- "Other Plans" collapsible section (if 6+ ungrouped)
        |   |-- Verification CTA section
        |   |   |-- "Last verified: X ago" text
        |   |   |-- "Verify Insurance Acceptance" gradient button
        |   |   |-- Social proof text ("Join X people who verified")
        |   |-- VerificationModal (overlay)
        |       |-- Provider + plan name prompt
        |       |-- "Yes, they accept" button (green)
        |       |-- "No, they don't accept" button (red)
        |       |-- Date selector chips (Today/This week/This month/A while ago)
        |       |-- Optional note textarea (200 char limit)
        |       |-- "I'm not sure" button
        |       |-- Honeypot field (bot detection)
        |-- ColocatedProviders (lazy-loaded)
            |-- Shimmer loading skeleton (3 rows)
            |-- Location info card (address, health system, facility type)
            |-- Provider cards (up to 10)
            |   |-- Provider name (toDisplayCase)
            |   |-- Specialty
            |   |-- Phone
            |   |-- Link to /provider/:npi
            |-- "View all X providers" link (if > 10)
```

---

## Server-Side Rendering

The page component at `packages/frontend/src/app/provider/[npi]/page.tsx` is a Next.js 14 async server component that handles three responsibilities:

### 1. Data Fetching with ISR

```typescript
async function getProvider(npi: string): Promise<ProviderWithPlans | null> {
  try {
    const res = await fetch(`${API_URL}/providers/${npi}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.provider ?? null;
  } catch {
    return null;
  }
}
```

The `revalidate: 3600` option enables Incremental Static Regeneration -- pages are served from cache and revalidated in the background every hour. The server fetches provider data directly from the backend API and passes it as `initialProvider` to the client component, avoiding a redundant client-side fetch on initial load.

### 2. SEO Metadata Generation

```typescript
export async function generateMetadata({
  params,
}: {
  params: Promise<{ npi: string }>;
}): Promise<Metadata> {
  const { npi } = await params;
  const provider = await getProvider(npi);

  if (!provider) {
    return { title: 'Provider Not Found | VerifyMyProvider' };
  }

  const name = getProviderName(provider);
  const specialty = provider.taxonomyDescription || provider.specialtyCategory || 'Healthcare Provider';
  const city = provider.city || '';
  const state = provider.state || '';
  const location = [city, state].filter(Boolean).join(', ');

  return {
    title: `${name} - ${specialty} in ${location} | VerifyMyProvider`,
    description: `Verify insurance acceptance for ${name}, ${specialty} in ${location}. ...`,
    openGraph: {
      title: `${name} - ${specialty}`,
      description: `Insurance verification for ${name} in ${location}`,
      type: 'profile',
    },
  };
}
```

The metadata function generates page-specific `<title>`, `<meta description>`, and OpenGraph tags, ensuring each provider page has unique SEO content. The `getProviderName()` helper correctly selects individual name parts or organization name based on entity type.

### 3. JSON-LD Structured Data

```typescript
const jsonLd = provider
  ? {
      '@context': 'https://schema.org',
      '@type': provider.entityType === 'INDIVIDUAL' ? 'Physician' : 'MedicalOrganization',
      name,
      ...(specialty && { medicalSpecialty: specialty }),
      ...(firstLocation && {
        address: {
          '@type': 'PostalAddress',
          streetAddress: firstLocation.address_line1,
          addressLocality: firstLocation.city,
          addressRegion: firstLocation.state,
          postalCode: firstLocation.zip_code,
        },
      }),
      ...(firstLocation?.phone && { telephone: firstLocation.phone }),
    }
  : null;
```

A `<script type="application/ld+json">` tag is injected into the page with Schema.org structured data. The `@type` is dynamically set to `Physician` for individuals or `MedicalOrganization` for organizations. Address and phone are conditionally included from the first location in the provider's locations array.

---

## Client-Side Orchestration: ProviderDetailClient

The client component at `packages/frontend/src/components/provider-detail/ProviderDetailClient.tsx` manages all interactive state and data transformations.

### Type Definition

```typescript
export interface ProviderWithPlans extends Omit<ProviderDisplay, 'planAcceptances'> {
  planAcceptances: PlanAcceptanceDisplay[];
  acceptsNewPatients?: boolean | null;
  languages?: string[] | null;
  nppesLastSynced?: string | null;
  locations?: Array<{
    id: number;
    address_type?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    phone?: string | null;
    fax?: string | null;
  }>;
}
```

This extends `ProviderDisplay` with full `PlanAcceptanceDisplay[]` (instead of the preview type used in search results), plus additional fields only available on the detail endpoint: `acceptsNewPatients`, `languages`, `nppesLastSynced`, and `locations`.

### State Management

```typescript
const [provider, setProvider] = useState<ProviderWithPlans | null>(initialProvider);
const [loading, setLoading] = useState(!initialProvider);
const [error, setError] = useState<string | null>(null);
```

If the server successfully pre-fetched the provider (`initialProvider` is not null), loading starts as `false` and the provider data is immediately available. If SSR returned null, the component fetches client-side via `fetchProvider()`.

### Key Computations

**Best Plan Acceptance (highest confidence):**

```typescript
const bestAcceptance = provider?.planAcceptances?.reduce<PlanAcceptanceDisplay | null>(
  (best, p) => {
    const score = p.confidence?.score ?? p.confidenceScore ?? 0;
    const bestScore = best ? (best.confidence?.score ?? best.confidenceScore ?? 0) : -1;
    return score > bestScore ? p : best;
  },
  null
) ?? null;

const confidenceScore = bestAcceptance?.confidence?.score ?? bestAcceptance?.confidenceScore ?? 0;
```

The overall confidence score shown in the hero card is the maximum confidence score across all plan acceptances. The full `bestAcceptance` object (including its `confidence.factors` breakdown) is passed to the `ConfidenceGauge` component for the modal breakdown.

**Verification Count (sum across all plans):**

```typescript
const verificationCount = provider?.planAcceptances?.reduce(
  (total, p) => total + (p.verificationCount || 0),
  0
) || 0;
```

**Last Verified Date (most recent across all plans):**

```typescript
const lastVerifiedAt = provider?.planAcceptances?.reduce((latest, p) => {
  if (!p.lastVerifiedAt) return latest;
  if (!latest) return p.lastVerifiedAt;
  return new Date(p.lastVerifiedAt) > new Date(latest) ? p.lastVerifiedAt : latest;
}, null as string | null);
```

**Insurance Plan Transformation:**

```typescript
const statusMap: Record<string, 'accepted' | 'not_accepted' | 'pending' | 'unknown'> = {
  ACCEPTED: 'accepted',
  NOT_ACCEPTED: 'not_accepted',
  PENDING: 'pending',
  UNKNOWN: 'unknown',
};

const insurancePlans = provider?.planAcceptances?.map(p => ({
  id: p.id,
  planId: p.planId,
  name: p.plan?.planName || p.plan?.issuerName || 'Unknown Plan',
  status: statusMap[p.acceptanceStatus] || 'unknown',
  confidence: p.confidence?.score ?? p.confidenceScore ?? 0,
  locationId: p.locationId ?? undefined,
  location: p.location ?? undefined,
  lastVerifiedAt: p.lastVerifiedAt,
})) || [];
```

This transforms the backend's `PlanAcceptanceDisplay[]` into the simpler `InsurancePlan[]` format expected by the `InsuranceList` component. The status mapping normalizes backend enum values to lowercase display strings.

### Analytics Tracking

```typescript
useEffect(() => {
  if (provider) {
    trackProviderView({
      npi,
      specialty: provider.taxonomyDescription || provider.specialtyCategory || undefined,
    });
  }
}, [provider?.npi]);
```

Provider views are tracked via PostHog analytics, but in a privacy-preserving manner -- the `trackProviderView` function in `packages/frontend/src/lib/analytics.ts` only sends `has_specialty: true/false` to PostHog, not the actual NPI, provider name, or specialty string.

---

## Sub-Components

### ProviderHeroCard

**File:** `packages/frontend/src/components/provider-detail/ProviderHeroCard.tsx`

The primary display card at the top of the page. Renders a responsive layout with the provider avatar + info on the left and the confidence gauge on the right.

**Props:**

```typescript
interface ProviderHeroCardProps {
  provider: Provider;
  confidenceScore: number;
  verificationCount?: number;
  nppesLastSynced?: string | null;
  confidenceBreakdown?: ConfidenceBreakdown;
}
```

**Key features:**

- **Avatar:** Circular gradient badge with initials derived from display name (filters out credentials like MD, DO, NP)
- **Name formatting:** Uses `toDisplayCase()` from `formatName.ts` to convert NPPES ALL-CAPS names to proper title case, handling Irish/Scottish prefixes (McDonald, O'Brien), credentials, and suffixes
- **Verified badge:** A blue `BadgeCheck` icon appears next to the name when `confidenceScore >= 70`
- **Address formatting:** Uses `toAddressCase()` for street addresses (handles ordinals like "18TH" to "18th", keeps directionals like "NE" uppercase) and `toTitleCase()` for city names
- **Phone formatting:** Automatically formats 10-digit phone numbers as `(XXX) XXX-XXXX`
- **Google Maps link:** Builds a directions URL from the provider's address components
- **NPPES sync indicator:** Shows CMS verification date with a staleness warning (yellow dot) if the sync is older than 90 days

### ConfidenceGauge

**File:** `packages/frontend/src/components/provider-detail/ConfidenceGauge.tsx`

An SVG circular progress gauge that visually represents the confidence score.

**Props:**

```typescript
interface ConfidenceGaugeProps {
  score: number;
  size?: number;          // default: 140
  showLink?: boolean;     // default: true
  verificationCount?: number;
  confidenceBreakdown?: ConfidenceBreakdown;
}
```

**Key features:**

- **SVG ring:** Two concentric circles -- a gray background track and a colored progress arc. The arc length is calculated from `(score / 100) * circumference`, with the color determined by thresholds: green (>= 70), amber (>= 40), red (< 40)
- **Improvement hint:** Calculates and displays how many more verifications are needed for high confidence (3 total required)
- **Score breakdown modal:** When `confidenceBreakdown.factors` is available, the "How is this calculated?" text becomes a clickable button that opens a modal containing the `ConfidenceScoreBreakdown` component. The modal uses `FocusTrap` for accessibility, closes on Escape key, backdrop click, or the X button, and prevents body scroll while open

### InsuranceList

**File:** `packages/frontend/src/components/provider-detail/InsuranceList.tsx`

The most feature-rich sub-component. Displays insurance acceptance data with search, filtering, grouping, and inline verification.

**Props:**

```typescript
interface InsuranceListProps {
  plans?: InsurancePlan[];
  npi?: string;
  providerName?: string;
  lastVerifiedAt?: string | null;
  verificationCount?: number;
  mainConfidenceScore?: number;
  locations?: ProviderLocation[];
}
```

**Key features:**

- **Carrier grouping:** Plans are automatically grouped by carrier family using regex patterns (18 known carriers: Aetna, BCBS, UnitedHealthcare, Cigna, etc.). Single-plan carriers are collected into a separate "Other Plans" section
- **Collapsible groups:** Each carrier group has a toggle that expands/collapses its plan list. Groups with 2+ plans are collapsible; the "Other Plans" section is collapsible when it has 6+ plans
- **Search filtering:** A search input appears when there are 5+ plans, filtering plans by name match. When searching, all groups auto-expand
- **Location filtering:** If plans have location-specific data (multiple practice sites), a dropdown filter allows filtering by office location
- **Data freshness badges:** Each plan row shows a colored dot (green < 30 days, yellow < 90 days, red > 90 days, gray = never verified)
- **Status icons:** `CheckCircle` (green, accepted), `XCircle` (red, not accepted), `Clock` (yellow, pending), `HelpCircle` (gray, unknown)
- **Per-plan verification:** Each plan row has a "Verify" button that opens the `VerificationModal`. After successful verification, the button changes to a "Verified" badge
- **Verification CTA:** At the bottom, a gradient "Verify Insurance Acceptance" button with social proof text showing how many people have verified

**VerificationModal** (embedded in InsuranceList):

A modal overlay that prompts the user to verify whether the provider accepts a specific insurance plan. Features:

- Yes/No buttons with loading spinner states
- Optional date selector (Today / This week / This month / A while ago)
- Optional note field (200 character limit)
- Honeypot field for bot detection (hidden from real users via CSS)
- Submits via `verificationApi.submit()` which calls `POST /api/v1/verify`
- Success/error feedback via `react-hot-toast`

### AboutProvider

**File:** `packages/frontend/src/components/provider-detail/AboutProvider.tsx`

A conditionally rendered card showing additional provider details.

**Props:**

```typescript
interface AboutProviderProps {
  entityType?: string | null;
  acceptsNewPatients?: boolean | null;
  languages?: string[] | null;
}
```

**Key features:**

- **Conditional rendering:** Returns `null` if no meaningful data is available (`entityType`, `acceptsNewPatients`, or `languages`)
- **Responsive grid:** Displays 1 column on mobile, 2 on tablet, 3 on desktop
- **New patients:** Color-coded status (green = Yes, red = No, gray = Unknown)
- **Practice type:** "Individual Provider" or "Group Practice / Organization" based on entity type
- **Languages:** Comma-separated list of spoken languages

### ColocatedProviders

**File:** `packages/frontend/src/components/provider-detail/ColocatedProviders.tsx`

Shows other providers at the same physical practice location.

**Props:**

```typescript
interface ColocatedProvidersProps {
  npi: string;
}
```

**Key features:**

- **Lazy loading via IntersectionObserver:** The component does not fetch data until it scrolls into view (with 100px rootMargin for pre-loading). This avoids unnecessary API calls for users who never scroll down far enough
- **Data fetching:** Calls `providerApi.getColocated(npi, { limit: 10 })` which hits `GET /api/v1/providers/:npi/colocated`
- **Graceful absence:** If the fetch returns 0 colocated providers or errors, the entire section is hidden (returns `null`). No empty-state UI is shown
- **Location info card:** Shows the shared address with facility name, health system, and total provider count
- **Provider cards:** Up to 10 provider cards with name (title-cased), specialty, phone, and a link to their detail page
- **Overflow handling:** If more than 10 providers exist at the location, a "View all X providers" link appears that navigates to the search page filtered by city/state/zip
- **Loading skeleton:** Uses `Shimmer` components for skeleton loading state
- **Error handling:** Uses standardized `toAppError()` and `getUserMessage()` from `errorUtils.ts`

### Disclaimer

**File:** `packages/frontend/src/components/Disclaimer.tsx`

A data accuracy warning that appears on all provider-specific pages.

On the detail page, it is rendered with `variant="inline"` which:
- Always shows (not dismissible, unlike the `banner` variant which uses localStorage to remember dismissals for 30 days)
- Displays in a rounded amber-bordered card with a warning icon
- Shows text: "Data Accuracy Notice: This information is crowdsourced and may be inaccurate or outdated. Always verify insurance acceptance directly with the provider's office before scheduling an appointment."
- Includes a "Learn more about our data" link to `/disclaimer`

---

## API Layer

### Provider Detail Endpoint

**Client call:** `providerApi.getByNpi(npi)` in `packages/frontend/src/lib/api.ts`

```typescript
getByNpi: (npi: string) =>
  apiFetch<{
    provider: ProviderDisplay & { planAcceptances: PlanAcceptanceDisplay[] };
  }>(`/providers/${npi}`),
```

This returns the full provider record with all associated plan acceptances, each containing:
- `acceptanceStatus` (ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN)
- `confidenceScore` (legacy number field)
- `confidence` object (with `score`, `level`, `factors`, `metadata`)
- `verificationCount`
- `lastVerifiedAt`
- `plan` (plan name, issuer, carrier, type, state)
- `location` (if location-specific)

### Co-located Providers Endpoint

**Client call:** `providerApi.getColocated(npi, params)` in `packages/frontend/src/lib/api.ts`

```typescript
getColocated: (
  npi: string,
  params: { page?: number; limit?: number } = {}
) =>
  apiFetch<{
    location: Location;
    providers: ProviderDisplay[];
    pagination: PaginationState;
  }>(`/providers/${npi}/colocated?${buildQueryString(params)}`),
```

### Retry Logic

All API calls go through `fetchWithRetry()` which provides:
- Automatic retry on 5xx errors and 429 (rate limit) responses
- Retry on network errors (TypeError, connection refused, timeout)
- Exponential backoff (1s, 2s, 4s) between retries
- Retry-After header respect for 429 responses (capped at 30s)
- No retry on 4xx client errors (except 429) or aborted requests
- Toast notification for rate limiting when retries are exhausted

### React Query Hooks

The hooks in `packages/frontend/src/hooks/useProviderSearch.ts` are available but **not used by the current detail page implementation**. The `ProviderDetailClient` manages its own fetch lifecycle directly via `providerApi.getByNpi()`. The hooks exist for potential future use or for other components:

```typescript
// Available but not used on the detail page:
export function useProvider(npi: string, enabled = true) { ... }      // staleTime: 10 min
export function useProviderPlans(npi: string, params, enabled) { ... }
export function useColocatedProviders(npi: string, params, enabled) { ... }
```

---

## Confidence Scoring System

### Score Display Hierarchy

The confidence scoring system has multiple display components at different levels of detail:

1. **ConfidenceGauge** (provider-detail) -- Full SVG circular gauge with percentage, used on the detail page hero card
2. **ConfidenceBadge** (global) -- Compact inline badge with level label (High/Medium/Low), used in search results
3. **ConfidenceProgressBar** (global) -- Narrow horizontal bar with percentage, legacy component
4. **ConfidenceIndicator** (global) -- Text-based verified/unverified status with date and user count
5. **ConfidenceScoreBreakdown** (global) -- Full expandable breakdown with all 4 factors

### Score Factors (100 points total)

| Factor | Max Points | Description |
|--------|-----------|-------------|
| Data Source | 25 | Quality of the data source (CMS, manual entry, etc.) |
| Recency | 30 | How recently the acceptance was verified |
| Verifications | 25 | Number of community verifications |
| Agreement | 20 | Consensus among verifications |

### Confidence Levels

| Level | Score Range | Color |
|-------|-----------|-------|
| High | >= 70 | Green (#10b981) |
| Medium | >= 40 | Amber (#f59e0b) |
| Low | < 40 | Red (#ef4444) |

The expanded breakdown (`ConfidenceScoreBreakdown.tsx`) uses a finer 5-level scale: VERY_HIGH, HIGH, MEDIUM, LOW, VERY_LOW with corresponding styling.

### Staleness Detection

The confidence metadata includes staleness information:

```typescript
interface ConfidenceMetadata {
  isStale?: boolean;
  daysSinceVerification?: number | null;
  daysUntilStale?: number;
  freshnessThreshold?: number;
  recommendReVerification?: boolean;
}
```

When `isStale` is true, a warning banner appears in the score breakdown showing the number of days since last verification and a re-verification recommendation.

---

## Name Formatting System

The `packages/frontend/src/lib/formatName.ts` module handles converting NPPES ALL-CAPS data to properly formatted display text. This is critical because all NPPES data comes in as uppercase (e.g., "JOHN MCDONALD, MD").

### Functions Used on Detail Page

| Function | Usage | Example |
|----------|-------|---------|
| `toDisplayCase()` | Provider name with credentials | "JOHN SMITH, MD" -> "John Smith, MD" |
| `toAddressCase()` | Street addresses | "50 E 18TH ST APT E12" -> "50 E 18th St Apt E12" |
| `toTitleCase()` | City names, general text | "NEW YORK" -> "New York" |

Special handling includes:
- **Irish/Scottish prefixes:** "MCDONALD" -> "McDonald", "O'BRIEN" -> "O'Brien", "MACDONALD" -> "MacDonald"
- **Credentials:** Recognized credentials (MD, DO, PhD, NP, PA-C, etc.) stay uppercase
- **Suffixes:** Jr, Sr are title-cased; II, III, IV, V stay uppercase
- **Address directionals:** N, S, E, W, NE, NW, SE, SW stay uppercase
- **Ordinals:** 18TH -> 18th, 1ST -> 1st
- **Unit numbers:** Alphanumeric tokens like E12, B2 stay uppercase

---

## States and Error Handling

### Loading State

When `loading === true`, a centered `LoadingSpinner` component is displayed. Loading is triggered:
- On initial render if `initialProvider` is null (SSR returned no data)
- On retry after error
- The `ColocatedProviders` component has its own independent loading state with `Shimmer` skeleton components

### Error State

When `error !== null` and `loading === false`, an error card is rendered:

```typescript
<div className="bg-white rounded-xl shadow-sm border p-12 text-center">
  <div className="w-16 h-16 bg-red-50 rounded-full ...">!</div>
  <h2>Provider Not Found</h2>
  <p>{error}</p>
  <button onClick={fetchProvider}>Try Again</button>
  <Link href="/search">Back to Search</Link>
</div>
```

The error message is always "Unable to load provider information." regardless of the specific error type. The retry button calls `fetchProvider()` which resets error state and attempts a fresh API call.

### Success State

When `!loading && !error && provider`, the full provider content is rendered with all sub-components.

---

## Insurance Plan Grouping Logic

The `InsuranceList` component implements a sophisticated carrier grouping system:

### Carrier Family Detection

```typescript
const CARRIER_PATTERNS: { pattern: RegExp; family: string; displayName: string }[] = [
  { pattern: /^aetna/i, family: 'aetna', displayName: 'Aetna' },
  { pattern: /^emblem\s*health/i, family: 'emblemhealth', displayName: 'EmblemHealth' },
  { pattern: /^empire\s*(blue\s*cross|bcbs)/i, family: 'empire', displayName: 'Empire Blue Cross Blue Shield' },
  { pattern: /^(blue\s*cross|bcbs)/i, family: 'bluecross', displayName: 'Blue Cross Blue Shield' },
  // ... 18 total patterns
];
```

Plans are matched against these regex patterns (case-insensitive, prefix-matching). Unmatched plans use their first word as the family name.

### Grouping Algorithm

1. All plans are mapped to their carrier family
2. Families with 2+ plans become collapsible `CarrierGroupSection` components
3. Families with only 1 plan are collected into `singlePlans[]`
4. Groups are sorted alphabetically by display name
5. If there are both grouped and ungrouped plans:
   - If 6+ ungrouped plans: shown in a collapsible "Other Plans" section
   - If 5 or fewer ungrouped plans: shown as flat plan rows under an "Other Plans" heading

### Confidence Display Logic

Individual confidence percentages are shown per-plan only if they differ from the main confidence score:

```typescript
const showIndividualConfidence = useMemo(() => {
  if (mainConfidenceScore === undefined) return true;
  return plans.some(p => p.confidence !== mainConfidenceScore);
}, [plans, mainConfidenceScore]);
```

---

## Barrel Exports

**File:** `packages/frontend/src/components/provider-detail/index.ts`

```typescript
export { ProviderHeader } from './ProviderHeader';
export { ProviderPlansSection } from './ProviderPlansSection';
export { ColocatedProviders } from './ColocatedProviders';
export { ProviderSidebar } from './ProviderSidebar';

// New redesigned components
export { ConfidenceGauge } from './ConfidenceGauge';
export { ProviderHeroCard } from './ProviderHeroCard';
export { ScoreBreakdown } from './ScoreBreakdown';
export { InsuranceList } from './InsuranceList';
export { AboutProvider } from './AboutProvider';
```

Note: The barrel file exports both legacy components (`ProviderHeader`, `ProviderPlansSection`, `ProviderSidebar`) and the current redesigned components. The `ProviderDetailClient` imports the redesigned set: `ProviderHeroCard`, `InsuranceList`, `AboutProvider`, `ColocatedProviders`.

---

## Implementation Checklist

### Page
- [x] Dynamic route `/provider/[npi]`
- [x] Server-side rendering with ISR (`revalidate: 3600`)
- [x] SEO metadata generation (title, description, OpenGraph)
- [x] JSON-LD structured data (Physician / MedicalOrganization schema)
- [x] Client-side interactivity via `ProviderDetailClient`
- [x] SSR data passed as `initialProvider` to avoid redundant client fetch
- [x] Breadcrumb navigation back to search
- [x] Loading, error, and success states
- [x] Retry on error

### Data
- [x] Single API call for provider + plan acceptances
- [x] Confidence score aggregation (max across plans)
- [x] Verification count aggregation (sum across plans)
- [x] Last verified date aggregation (most recent across plans)
- [x] Insurance plan data transformation (status mapping, name resolution)
- [x] Co-located provider fetching (lazy-loaded via IntersectionObserver)
- [x] API retry with exponential backoff
- [x] Privacy-preserving analytics tracking

### Components
- [x] ProviderHeroCard with avatar, address, phone, Google Maps link
- [x] ConfidenceGauge with SVG ring and score breakdown modal
- [x] InsuranceList with carrier grouping, search, location filter
- [x] Per-plan verification modal with date/note/honeypot
- [x] Data freshness badges (green/yellow/red/gray)
- [x] AboutProvider (entity type, new patients, languages)
- [x] ColocatedProviders with lazy loading and shimmer skeleton
- [x] Data accuracy Disclaimer (inline variant)
- [x] NPPES ALL-CAPS to Title Case formatting throughout

### Missing / Future
- [x] Server-side rendering for SEO -- implemented with `revalidate: 3600` and metadata generation
- [x] Structured data / JSON-LD -- implemented with Physician/MedicalOrganization schema
- [ ] Share provider button
- [ ] Print-friendly view
- [ ] Verification history timeline (component exists but not wired in)
- [ ] Score breakdown as a section instead of modal-only (ScoreBreakdown component exists but not rendered in current layout)
- [ ] "Report incorrect information" feature
- [ ] Migrate from manual fetch to React Query hooks (`useProvider`, `useColocatedProviders`) for better caching, deduplication, and background refetching

---

## Questions

1. **Should the detail page migrate to React Query hooks?** The hooks (`useProvider`, `useProviderPlans`, `useColocatedProviders`) already exist in `useProviderSearch.ts` with proper cache keys and stale times (10 minutes for provider details), but `ProviderDetailClient` uses manual `useState`/`useEffect` fetch instead. Migration would provide automatic caching, deduplication, and background refetching.

2. **Is the co-located providers feature performant?** The IntersectionObserver-based lazy loading is good, but the component makes a fresh API call every page visit since it uses local state rather than React Query caching. Consider migrating to `useColocatedProviders` hook for automatic caching.

3. **Should the `ScoreBreakdown` component be rendered inline?** The component exists at `packages/frontend/src/components/provider-detail/ScoreBreakdown.tsx` and is exported from the barrel file, but it is not rendered in the current layout. Currently, the only way to see the factor breakdown is via the ConfidenceGauge modal. An inline breakdown section could improve visibility.

4. **Should structured data be expanded?** The current JSON-LD is minimal (name, specialty, address, phone). It could be extended to include insurance plans accepted, ratings/reviews equivalent (verification count), or operating hours if that data becomes available.

5. **Should there be a "Report incorrect information" feature?** Currently users can only submit new verifications (yes/no on insurance acceptance). There is no mechanism to flag incorrect provider metadata (wrong address, wrong specialty, etc.).
