# Frontend Structure Review

## Overview

The VerifyMyProvider frontend is a Next.js 14.2 application using the App Router pattern. It provides a community-verified healthcare provider search experience with insurance acceptance verification, provider comparison, and AI-powered insurance card scanning. The application is designed with an older demographic in mind (18px base font, 44px minimum touch targets) and supports full dark/light theming.

**Package:** `@healthcareproviderdb/frontend`
**Location:** `packages/frontend/`
**Framework:** Next.js 14.2 (App Router) with React 18.3

---

## Technology Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Framework | Next.js | 14.2.35 | App Router, SSR, API Routes |
| UI Library | React | 18.3.1 | Component rendering |
| Styling | TailwindCSS | 3.3.6 | Utility-first CSS with dark mode |
| Data Fetching | @tanstack/react-query | 5.90.20 | Server state caching |
| Icons | lucide-react | 0.563.0 | Icon components |
| Toasts | react-hot-toast | 2.6.0 | Toast notifications |
| Accessibility | focus-trap-react | 11.0.6 | Focus trapping for modals |
| Analytics | posthog-js | 1.321.2 | Privacy-preserving analytics |
| AI Integration | @anthropic-ai/sdk | 0.71.2 | Insurance card OCR extraction |
| Image Processing | sharp | 0.33.2 | Server-side image preprocessing |
| Validation | zod | 3.25.76 | Insurance card data schema validation |
| Shared Types | @healthcareproviderdb/shared | workspace | Shared TypeScript types and enums |
| Testing | Jest + Testing Library | 29.x / 16.x | Unit and component tests |
| E2E Testing | Playwright | 1.58.0 | End-to-end browser tests |

### Build Configuration

**`next.config.js`** (`packages/frontend/next.config.js`):
- `reactStrictMode: true` for development warnings
- `output: 'standalone'` for Docker deployments
- `swcMinify: false` for ARM64 compatibility
- Security headers on all routes: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`
- CSP is commented out (was blocking API requests; to be re-enabled with proper config)
- `serverComponentsExternalPackages: ['sharp', 'detect-libc']` for native dependency resolution

**`tailwind.config.ts`** (`packages/frontend/tailwind.config.ts`):
- `darkMode: 'class'` for class-based dark mode toggling
- Custom `primary` color palette (blue: 50-900)
- Custom `confidence` colors: high (green), medium (yellow), low (red)
- Enlarged base font sizes for accessibility (base = 1.125rem/18px)
- Custom animations: `shimmer`, `slide-up`, `modal-enter`, `fade-in`

**`globals.css`** (`packages/frontend/src/app/globals.css`):
- 18px root font size for older demographic readability
- 44px minimum touch targets on all interactive elements
- Focus-visible ring states (only on keyboard navigation)
- Component classes: `.container-narrow`, `.container-wide`, `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.input`, `.label`, `.card`, `.card-hover`
- Confidence badge utility classes: `.confidence-high`, `.confidence-medium`, `.confidence-low`
- iOS safe area support for notch and home indicator

### SWC Windows ARM64 Patch

A custom `postinstall` script at `packages/frontend/scripts/patch-next-swc.js` patches Next.js SWC binaries for Windows ARM64 + Node.js v24+ compatibility. The WASM fallback is forced because native SWC binaries are incompatible with this platform combination.

---

## Application Architecture

### Provider Hierarchy

```
PostHogProvider
  QueryProvider (React Query)
    ThemeProvider (dark/light/system)
      CompareProvider (provider comparison state)
        ErrorProvider (global error state)
          [App Shell: Header, GlobalErrorBanner, Disclaimer, main content, Footer, ScrollToTop, CompareBar, CookieConsent, BottomNav]
```

### Root Layout

**File:** `packages/frontend/src/app/layout.tsx`

The root layout defines the full application shell:

```tsx
<html lang="en" suppressHydrationWarning>
  <head>
    <script dangerouslySetInnerHTML={{ __html: themeScript }} />
  </head>
  <body>
    <Suspense fallback={null}>
      <PostHogProvider>
        <QueryProvider>
          <ThemeProvider>
            <CompareProvider>
              <ErrorProvider>
                <ToastProvider />
                <GlobalErrorBanner />
                <Header />
                <Disclaimer variant="banner" />
                <main className="flex-1 pb-20 md:pb-0">{children}</main>
                <Footer />
                <ScrollToTop />
                <CompareBar />
                <CookieConsent />
                <BottomNav />
              </ErrorProvider>
            </CompareProvider>
          </ThemeProvider>
        </QueryProvider>
      </PostHogProvider>
    </Suspense>
  </body>
</html>
```

Key design decisions:
- An inline `themeScript` runs before React hydration to prevent flash of wrong theme (reads from `localStorage`)
- Inter font from Google Fonts
- Footer is defined inline in the layout with four columns: About, Quick Links, Legal, OwnMyHealth parent brand
- `pb-20 md:pb-0` on main provides space for the mobile bottom nav
- The `Footer` component includes a persistent disclaimer: "Data is crowdsourced and may not be accurate."

### Metadata

```ts
export const metadata: Metadata = {
  title: 'VerifyMyProvider - Find Providers Who Accept Your Insurance',
  description: 'Search for healthcare providers and verify insurance acceptance with community-verified data.',
};
```

---

## Pages (App Router)

### Route Table

| Route | File | Rendering | Description |
|-------|------|-----------|-------------|
| `/` | `app/page.tsx` | Static (RSC) | Home page with marketing sections |
| `/search` | `app/search/page.tsx` | Client | Provider search with filters, results, pagination |
| `/provider/[npi]` | `app/provider/[npi]/page.tsx` | Hybrid (SSR + Client) | Provider detail with plans, confidence, colocated |
| `/location/[locationId]` | `app/location/[locationId]/page.tsx` | TBD | Location detail page |
| `/insurance` | `app/insurance/page.tsx` | Static + Client | Insurance card scanner (Claude AI OCR) |
| `/research` | `app/research/page.tsx` | Static | Research/methodology page |
| `/about` | `app/about/page.tsx` | Static | About page |
| `/privacy` | `app/privacy/page.tsx` | Static | Privacy policy |
| `/terms` | `app/terms/page.tsx` | Static | Terms of service |
| `/disclaimer` | `app/disclaimer/page.tsx` | Static | Medical disclaimer |

### Additional Routes

| Route | File | Type | Description |
|-------|------|------|-------------|
| `/sitemap.xml` | `app/sitemap.ts` | Dynamic | Generates sitemap with static + provider pages |
| `/api/insurance-card/extract` | `app/api/insurance-card/extract/route.ts` | API Route | Claude Haiku 4.5 insurance card OCR |
| Error | `app/error.tsx` | Client | Error boundary with retry, PostHog tracking |

### Page Details

#### Home Page (`/`)

**File:** `packages/frontend/src/app/page.tsx`

Simple server component composing five marketing sections:

```tsx
export default function HomePage() {
  return (
    <div>
      <HeroSection />
      <WhyItMattersSection />
      <HowItWorksSection />
      <ConfidenceSection />
      <CTASection />
    </div>
  );
}
```

All sections are exported from `components/home/index.ts`.

#### Search Page (`/search`)

**File:** `packages/frontend/src/app/search/page.tsx`

A fully client-side page wrapped in `Suspense`. Key architecture:

- `SearchPageContent` manages top-level state: providers, pagination, hasSearched, error, isLoading
- **Desktop layout:** `SearchForm` visible in a card above results
- **Mobile layout:** `FilterButton` opens `FilterDrawer` which contains a `SearchForm` in `variant="drawer"` mode
- `SearchForm` exposes a `SearchFormRef` with `search()` and `clear()` methods via `useImperativeHandle`
- `SearchResultsDisplay` renders results with pagination (ellipsis pagination for large result sets)
- Empty state with `EmptyState` component (landing vs. no-results variants with search suggestions)
- `SaveProfileButton` in header area
- Crowdsourced data disclaimer banner above results

#### Provider Detail Page (`/provider/[npi]`)

**File:** `packages/frontend/src/app/provider/[npi]/page.tsx`

**Hybrid rendering:** Server component fetches initial data with `revalidate: 3600` (1 hour ISR), then hands off to `ProviderDetailClient`.

Server-side features:
- `generateMetadata()` produces dynamic SEO metadata with provider name, specialty, location
- JSON-LD structured data (schema.org `Physician` or `MedicalOrganization`)
- OpenGraph metadata for social sharing

**Client component** (`packages/frontend/src/components/provider-detail/ProviderDetailClient.tsx`):
- Receives `initialProvider` from SSR; only fetches client-side if SSR data is null
- Computes best confidence score across all plan acceptances
- Aggregates verification count and most recent verification date
- Renders: `ProviderHeroCard`, `Disclaimer`, `AboutProvider`, `InsuranceList`, `ColocatedProviders`
- Tracks provider views via PostHog analytics (privacy-preserving: no identifiers sent)

#### Insurance Card Scanner (`/insurance`)

**File:** `packages/frontend/src/app/insurance/page.tsx`

Static page wrapping the `InsuranceCardUploader` component with:
- Breadcrumb navigation
- Privacy notice (image not stored)
- Tips for best results
- Camera capture support (`capture="environment"`)

**API Route:** `packages/frontend/src/app/api/insurance-card/extract/route.ts`
- Uses Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) for cost-effective extraction
- Rate limited: 10 extractions per hour per IP (in-memory rate limiter)
- Image preprocessing via Sharp: auto-rotate, resize (max 1024px), optional contrast enhancement
- Two-pass extraction: primary detailed prompt, retry with simpler prompt if confidence < 0.3
- Validates extracted data with Zod schema (`InsuranceCardDataSchema`)
- Returns structured response with confidence scores, field counts, and user-friendly suggestions

#### Sitemap

**File:** `packages/frontend/src/app/sitemap.ts`

Generates dynamic sitemap combining:
- Static pages (home, search, about, terms, privacy, disclaimer)
- Up to 500 provider pages fetched from the backend API (revalidated daily)

#### Error Boundary

**File:** `packages/frontend/src/app/error.tsx`

Client-side error boundary with:
- User-friendly error message with "Try Again" and "Go Home" buttons
- Support email link
- Development-only expandable error details (message, digest, stack trace)
- PostHog error tracking (no PII: only error metadata)

---

## Component Architecture

### Component Directory Structure

```
src/components/
  home/                     # Home page sections
  provider-detail/          # Provider detail page components
  provider/                 # Provider-related components (explainers, timeline)
  compare/                  # Provider comparison feature
  providers/                # React Query provider wrapper
  icons/                    # Custom SVG icon components
  illustrations/            # SVG illustrations
  ui/                       # Reusable UI primitives
  [top-level components]    # Shared/global components
```

### Home Page Components (`components/home/`)

| Component | File | Description |
|-----------|------|-------------|
| `HeroSection` | `HeroSection.tsx` | Landing hero with search CTA |
| `WhyItMattersSection` | `WhyItMattersSection.tsx` | Value proposition |
| `HowItWorksSection` | `HowItWorksSection.tsx` | Step-by-step process |
| `ConfidenceSection` | `ConfidenceSection.tsx` | Confidence scoring explainer |
| `CTASection` | `CTASection.tsx` | Call-to-action |

### Search & Results Components

| Component | File | Description |
|-----------|------|-------------|
| `SearchForm` | `SearchForm.tsx` | Multi-field search form (state, specialty, name, city, insurance, health system) with `variant="drawer"` support |
| `ProviderCard` | `ProviderCard.tsx` | Memoized provider card with avatar, confidence badge, insurance preview, "View Details" link |
| `ProviderCardCompact` | `ProviderCard.tsx` | Compact provider card for colocated provider lists |
| `ProviderCardSkeleton` | `ProviderCardSkeleton.tsx` | Loading skeleton for provider cards |
| `SearchResultsSkeleton` | `ProviderCardSkeleton.tsx` | Multiple skeleton cards for search results loading |
| `RecentSearches` | `RecentSearches.tsx` | Recent search history (localStorage-backed) |
| `EmptyState` | `EmptyState.tsx` | Landing illustration or no-results state with search suggestions |

`ProviderCard` details:
- Custom `memo` comparison function comparing NPI, displayName, phone, address, city, state, zip, confidenceScore, and planAcceptances length
- Cleans provider names: removes license numbers, keeps only valid medical credentials (MD, DO, NP, PA, etc.)
- Handles organization name truncation gracefully
- Shows top 3 accepted insurance plans with "+N more" badge
- Formats phone numbers, addresses from NPPES ALL-CAPS data using `formatName.ts` utilities

### Filtering Components

| Component | File | Description |
|-----------|------|-------------|
| `FilterButton` | `FilterButton.tsx` | Mobile filter toggle showing active filter count badge |
| `FilterDrawer` | `FilterDrawer.tsx` | Full-screen mobile filter drawer with Apply/Clear actions |
| `SearchableSelect` | `ui/SearchableSelect.tsx` | Searchable dropdown with grouped options support |

### Provider Detail Components (`components/provider-detail/`)

| Component | File | Description |
|-----------|------|-------------|
| `ProviderDetailClient` | `ProviderDetailClient.tsx` | Main client component orchestrating provider detail view |
| `ProviderHeroCard` | `ProviderHeroCard.tsx` | Provider header with name, specialty, location, confidence gauge |
| `ProviderHeader` | `ProviderHeader.tsx` | Header section |
| `ProviderSidebar` | `ProviderSidebar.tsx` | Sidebar with contact info |
| `ProviderPlansSection` | `ProviderPlansSection.tsx` | Insurance plans section |
| `InsuranceList` | `InsuranceList.tsx` | Full plans listing with status, confidence, verification CTA |
| `AboutProvider` | `AboutProvider.tsx` | Provider bio/details (entity type, new patients, languages) |
| `ColocatedProviders` | `ColocatedProviders.tsx` | Other providers at the same location |
| `ConfidenceGauge` | `ConfidenceGauge.tsx` | Visual confidence score gauge |
| `ScoreBreakdown` | `ScoreBreakdown.tsx` | Confidence factor breakdown |

### Provider Components (`components/provider/`)

| Component | File | Description |
|-----------|------|-------------|
| `ConfidenceScoreExplainer` | `ConfidenceScoreExplainer.tsx` | Educational explainer for confidence scoring methodology |
| `VerificationCallToAction` | `VerificationCallToAction.tsx` | CTA for first verification on a provider |
| `VerificationTimeline` | `VerificationTimeline.tsx` | Verification history timeline |
| `ResearchExplainer` | `ResearchExplainer.tsx` | Research methodology explainer |
| `PlanAcceptanceCard` | `PlanAcceptanceCard.tsx` | Individual plan acceptance display card |

### Verification Components

| Component | File | Description |
|-----------|------|-------------|
| `ProviderVerificationForm` | `ProviderVerificationForm.tsx` | Verification submission form (provider + plan + acceptance status) |
| `VerificationButton` | `VerificationButton.tsx` | Submit verification CTA button |

### Comparison Components (`components/compare/`)

| Component | File | Description |
|-----------|------|-------------|
| `CompareBar` | `CompareBar.tsx` | Sticky bar (desktop: bottom-right card; mobile: full-width above BottomNav) showing selected providers |
| `CompareCheckbox` | `CompareCheckbox.tsx` | Checkbox to add/remove provider from comparison |
| `CompareModal` | `CompareModal.tsx` | Side-by-side comparison table modal (max 3 providers) with focus trap, escape key handler, best-value highlighting |

`CompareModal` compares across 8 attributes: Specialty, Health System, Location, Confidence, Status, Verifications, Last Verified, Phone. Best values are highlighted with green background.

### Confidence & Scoring Components

| Component | File | Description |
|-----------|------|-------------|
| `ConfidenceBadge` | `ConfidenceBadge.tsx` | Compact confidence badge with color coding |
| `ConfidenceScoreBreakdown` | `ConfidenceScoreBreakdown.tsx` | Detailed confidence factor breakdown |

### Insurance Components

| Component | File | Description |
|-----------|------|-------------|
| `InsuranceCardUploader` | `InsuranceCardUploader.tsx` | Drag-and-drop card upload with Claude extraction, confidence indicator, data display |

The uploader includes sub-components: `ConfidenceIndicator`, `ExtractionSuggestions`, `CardSideIndicator`. Displays extracted data in categorized sections: Plan Information, Subscriber Information, Copays, Deductibles & OOP Max, Pharmacy (Rx), Contact.

### Global UI Components

| Component | File | Description |
|-----------|------|-------------|
| `Header` | `Header.tsx` | Sticky header with logo, nav links (desktop), ThemeToggle, Search CTA |
| `BottomNav` | `BottomNav.tsx` | Mobile bottom navigation (Home, Search, Scan Card, How It Works) |
| `ThemeToggle` | `ThemeToggle.tsx` | Dark/light/system mode toggle |
| `ScrollToTop` | `ScrollToTop.tsx` | Scroll-to-top floating button |
| `LoadingSpinner` | `LoadingSpinner.tsx` | Loading spinner |
| `ErrorMessage` | `ErrorMessage.tsx` | Error display with variant styling |
| `FreshnessWarning` | `FreshnessWarning.tsx` | Stale data warning indicator |
| `WelcomeBackBanner` | `WelcomeBackBanner.tsx` | Returning user welcome banner |
| `SaveProfileButton` | `SaveProfileButton.tsx` | Save provider profile button |
| `Disclaimer` | `Disclaimer.tsx` | Medical data disclaimer (banner and inline variants) |
| `GlobalErrorBanner` | `GlobalErrorBanner.tsx` | Global error banner (uses ErrorContext) |
| `LocationCard` | `LocationCard.tsx` | Location card display |
| `ToastProvider` | `ToastProvider.tsx` | react-hot-toast provider |
| `PostHogProvider` | `PostHogProvider.tsx` | PostHog analytics wrapper with pageview tracking |
| `CookieConsent` | `CookieConsent.tsx` | GDPR-style analytics consent banner with accept/decline |

### UI Primitives (`components/ui/`)

| Component | File | Description |
|-----------|------|-------------|
| `Skeleton` | `ui/Skeleton.tsx` | Loading skeleton placeholder |
| `Shimmer` | `ui/Shimmer.tsx` | Shimmer loading effect |
| `SearchableSelect` | `ui/SearchableSelect.tsx` | Searchable dropdown with grouped options |

### Icons & Illustrations

| Component | File | Description |
|-----------|------|-------------|
| Custom Icons | `icons/Icons.tsx` | `HomeIcon`, `SearchIcon`, `CreditCardIcon`, `InfoIcon`, `LocationIcon`, `PhoneIcon`, `ChevronRightIcon` |
| `SearchLandingIllustration` | `illustrations/SearchLandingIllustration.tsx` | Search page landing SVG illustration |
| `NoResultsIllustration` | `illustrations/NoResultsIllustration.tsx` | No results SVG illustration |

---

## State Management

### Server State (React Query)

**Provider:** `packages/frontend/src/components/providers/QueryProvider.tsx`
**Configuration:** `packages/frontend/src/lib/queryClient.ts`

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 minutes
      gcTime: 10 * 60 * 1000,       // 10 minutes (garbage collection)
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
```

#### Query Key Factory

Defined in `packages/frontend/src/hooks/useProviderSearch.ts`:

```ts
export const providerKeys = {
  all: ['providers'] as const,
  searches: () => [...providerKeys.all, 'search'] as const,
  search: (filters, page, limit) => [...providerKeys.searches(), { filters, page, limit }] as const,
  detail: (npi) => [...providerKeys.all, 'detail', npi] as const,
  plans: (npi, params?) => [...providerKeys.all, 'plans', npi, params] as const,
  colocated: (npi, params?) => [...providerKeys.all, 'colocated', npi, params] as const,
};
```

### Client State (React Context)

Three React contexts manage client-side state:

#### ThemeContext

**File:** `packages/frontend/src/context/ThemeContext.tsx`

```ts
type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
}
```

- Persisted to `localStorage` under key `verifymyprovider-theme`
- Listens for system `prefers-color-scheme` changes
- Inline script in `<head>` prevents flash of wrong theme (FOUC)
- Returns `null` until mounted to prevent hydration mismatch

#### CompareContext

**File:** `packages/frontend/src/context/CompareContext.tsx`

```ts
interface CompareContextType {
  selectedProviders: CompareProvider[];
  addProvider: (provider: CompareProvider) => void;
  removeProvider: (npi: string) => void;
  clearAll: () => void;
  isSelected: (npi: string) => boolean;
  canAddMore: boolean;
}
```

- Maximum 3 providers (`MAX_COMPARE_PROVIDERS`)
- Persisted to `sessionStorage` under key `verifymyprovider-compare`
- Includes robust error handling for `SyntaxError`, `DOMException`, and `QuotaExceededError`
- SSR-safe initialization via `useEffect`

#### ErrorContext

**File:** `packages/frontend/src/context/ErrorContext.tsx`

```ts
interface ErrorContextValue {
  error: AppError | null;
  errorVariant: ErrorVariant | null;
  errorMessage: string | null;
  setError: (error: unknown) => void;
  clearError: () => void;
  showErrorToast: (error: unknown, duration?: number) => void;
  hasError: boolean;
}
```

- Converts any error to `AppError` via `toAppError()` utility
- Auto-clears toast errors after configurable duration (default 5000ms)
- Cleans up timeouts on unmount

### Search State (Custom Hooks)

The search flow is decomposed into four specialized hooks:

#### `useSearchForm` (Orchestrator)

**File:** `packages/frontend/src/hooks/useSearchForm.ts`

Composes `useSearchUrlParams`, `useFilterState`, and `useSearchExecution` into a single hook:

```ts
interface UseSearchFormResult {
  filters: SearchFilters;
  setFilter / setFilters / clearFilters / clearFilter;
  results: ProviderDisplay[];
  pagination: PaginationState | null;
  isLoading / error / hasSearched;
  search: () => void;              // Debounced (450ms)
  searchImmediate: () => Promise<void>; // Bypasses debounce
  goToPage: (page: number) => Promise<void>;
  hasActiveFilters / activeFilterCount / canSearch;
}
```

#### `useSearchUrlParams`

**File:** `packages/frontend/src/hooks/search/useSearchParams.ts`

Bidirectional URL sync for search filters. Parses URL params into `SearchFilters` and updates URL on filter changes using `router.replace()` (no history push to avoid back-button spam).

Supported URL parameters: `state`, `city`, `cities`, `specialty`, `name`, `npi`, `entityType`, `insurancePlanId`, `healthSystem`, `zipCode`.

#### `useFilterState`

**File:** `packages/frontend/src/hooks/search/useFilterState.ts`

Manages filter state with cascade logic:
- Clearing `state` also clears `city`, `cities`, and `healthSystem`
- Computes `hasActiveFilters`, `activeFilterCount`, and `canSearch` (requires state)

#### `useSearchExecution`

**File:** `packages/frontend/src/hooks/search/useSearchExecution.ts`

Executes API search with a two-tier debounce strategy:

1. **Auto-search (typing):** 450ms debounce via custom `debounce()` utility
2. **Explicit search (button click):** Immediate execution, cancels pending debounced calls
3. **Filter clear:** Cancels pending searches and in-flight requests

Features:
- `AbortController` for request cancellation on new searches
- Ref-based filter access for debounced callbacks (avoids stale closures)
- NYC All Boroughs expansion (converts `NYC_ALL_BOROUGHS` to 5 individual borough names)
- PostHog analytics tracking on each search (privacy-preserving)

---

## Custom Hooks

### Data Fetching Hooks

| Hook | File | Description |
|------|------|-------------|
| `useProviderSearch` | `hooks/useProviderSearch.ts` | React Query hook for provider search (staleTime: 2 min) |
| `useProvider` | `hooks/useProviderSearch.ts` | React Query hook for single provider by NPI (staleTime: 10 min) |
| `useProviderPlans` | `hooks/useProviderSearch.ts` | React Query hook for provider insurance plans |
| `useColocatedProviders` | `hooks/useProviderSearch.ts` | React Query hook for co-located providers |
| `useCities` | `hooks/useCities.ts` | Cities for a state with module-level cache (5 min TTL), pinned major cities, NYC All Boroughs |
| `useInsurancePlans` | `hooks/useInsurancePlans.ts` | Grouped insurance plans with module-level cache (10 min TTL), flat plan list, select options |
| `useHealthSystems` | `hooks/useHealthSystems.ts` | Health systems for state/cities with module-level cache (5 min TTL) |
| `useRecentSearches` | `hooks/useRecentSearches.ts` | Recent search history in localStorage (max 5, deduplication) |

### Caching Strategy

The hooks use a dual caching approach:

1. **React Query cache** (for `useProviderSearch`, `useProvider`, etc.): Managed by the global `queryClient` with 5-minute stale time and 10-minute garbage collection.

2. **Module-level Map cache** (for `useCities`, `useInsurancePlans`, `useHealthSystems`): Custom `Map<string, CacheEntry>` with TTL-based expiration and deduplication of in-flight requests via `pendingRequests` Map. This prevents duplicate API calls when multiple components request the same data simultaneously.

### City Pinning System

`useCities` includes a comprehensive pinned cities system (`PINNED_CITIES`) for all 50 states + DC. Major cities appear first in dropdowns, followed by remaining cities alphabetically. For New York, a special "NYC All Boroughs" option selects all 5 boroughs simultaneously.

### State Flow Hook (`useCompare`)

**File:** `packages/frontend/src/hooks/useCompare.ts`

Re-exports `useCompare` and `CompareProvider` type from `CompareContext` for convenience.

---

## API Client

**File:** `packages/frontend/src/lib/api.ts`

### Architecture

The API client is organized into four namespaces:

```ts
const api = {
  providers,  // Provider search, detail, cities, plans, colocated
  plans,      // Plan search, grouped, issuers, types, by ID, providers
  verify,     // Submit verification, vote, stats, recent, pair lookup
  locations,  // Location search, health systems, by ID, providers, stats
} as const;
```

### `fetchWithRetry` Wrapper

All API calls go through `fetchWithRetry` which provides:

- **Configurable retry:** Default 2 retries with exponential backoff (1s, 2s, 4s)
- **Retryable statuses:** 429, 500, 502, 503, 504
- **Network error retry:** Detects `TypeError`, "failed to fetch", connection errors
- **Retry-After header:** Respects header value (capped at 30 seconds)
- **Abort support:** Never retries aborted requests
- **No client error retry:** 4xx errors (except 429) are not retried

### `ApiError` Class

```ts
class ApiError extends Error {
  statusCode: number;
  code: string;
  details: ApiErrorDetails | null;
  retryAfter: number | null;

  isRateLimited(): boolean;
  isValidationError(): boolean;
  isNotFound(): boolean;
  isUnauthorized(): boolean;
  isRetryable(): boolean;
}
```

Rate-limited responses (429) automatically show a toast notification with retry timing.

### API Methods

**Providers:**
- `providers.search(filters, page?, limit?)` - Search with all filter combinations
- `providers.getByNpi(npi)` - Single provider with plan acceptances
- `providers.getCities(state)` - Cities list for a state
- `providers.getPlans(npi, params?)` - Provider insurance plans with pagination
- `providers.getColocated(npi, params?)` - Co-located providers

**Plans:**
- `plans.search(params)` - Search plans by carrier, type, state, year
- `plans.getGrouped(params?)` - Plans grouped by carrier
- `plans.getIssuers(state?)` - Insurance issuers
- `plans.getPlanTypes(params?)` - Plan type metadata
- `plans.getById(planId)` - Single plan with provider count
- `plans.getProviders(planId, params?)` - Providers accepting a plan

**Verify:**
- `verify.submit(data)` - Submit verification (includes honeypot `website` field for spam)
- `verify.vote(id, vote, website?)` - Up/down vote on verification
- `verify.getStats()` - Verification statistics
- `verify.getRecent(params?)` - Recent verifications
- `verify.getForPair(npi, planId)` - Verifications for specific provider-plan pair

**Locations:**
- `locations.search(params)` - Search locations
- `locations.getHealthSystems(state, cities?)` - Health systems for filtering
- `locations.getById(locationId)` - Single location
- `locations.getProviders(locationId, params?)` - Providers at a location
- `locations.getStats(state)` - Location statistics for a state

Legacy exports (`providerApi`, `verificationApi`, `locationApi`) are maintained for backward compatibility.

---

## Utilities

### `lib/errorUtils.ts` - Standardized Error Handling

**File:** `packages/frontend/src/lib/errorUtils.ts`

Provides a complete error handling pipeline:

1. **`toAppError(error: unknown): AppError`** - Converts any caught error to standardized `AppError` with message, statusCode, code, retryable flag
2. **`getUserMessage(error): string`** - Maps technical errors to user-friendly messages (network errors, 429, 401, 403, 404, 5xx)
3. **`getErrorVariant(error): ErrorVariant`** - Maps errors to UI variants: `'network'`, `'server'`, `'not-found'`, `'validation'`, `'rate-limit'`, `'unknown'`
4. **`logError(context, error)`** - Consistent error logging with PostHog tracking (development: verbose; production: minimal)
5. **`isRetryableStatus(status)`** - Checks if 408, 429, 500, 502, 503, 504

### `lib/debounce.ts` - Debounce Utility

**File:** `packages/frontend/src/lib/debounce.ts`

Full-featured debounce implementation with:
- `cancel()` - Cancel pending execution
- `flush()` - Execute immediately if pending
- `pending()` - Check if execution is pending
- Leading/trailing edge options
- Constants: `SEARCH_DEBOUNCE_MS = 450`, `IMMEDIATE_MS = 0`

### `lib/analytics.ts` - Privacy-Preserving Analytics

**File:** `packages/frontend/src/lib/analytics.ts`

PostHog event tracking that intentionally strips sensitive data:

| Event | Sends | Does NOT Send |
|-------|-------|---------------|
| `search` | Boolean filter indicators, result count, mode | Actual specialty, state, city, health system values |
| `provider_view` | `has_specialty` boolean | NPI, specialty name, provider name |
| `verification_submit` | (empty properties) | NPI, plan ID, acceptance status |
| `verification_vote` | Vote type (up/down) | Verification ID, NPI |

### `lib/formatName.ts` - Name Formatting

**File:** `packages/frontend/src/lib/formatName.ts`

Converts NPPES ALL-CAPS data to proper display case:

- `toTitleCase(str)` - General title case with Mc/Mac prefix handling (McDonald, MacArthur), O' prefix (O'Brien), hyphenated names
- `toDisplayCase(displayName)` - Title case preserving credential suffixes (MD, DO, NP, etc.)
- `toAddressCase(str)` - Address formatting preserving directionals (N, S, E, W, NE), unit numbers (E12), ordinals (18th)
- `formatProviderName(first, middle, last, credential)` - Full provider name formatting
- `formatAddress(addr, city, state, zip)` - Full address formatting

### `lib/provider-utils.ts` - Provider Display Utilities

**File:** `packages/frontend/src/lib/provider-utils.ts`

- `SPECIALTY_LABELS` - Comprehensive mapping of 67 specialty codes to display names
- `SPECIALTY_OPTIONS` - Dropdown-ready specialty options array
- `US_STATES` - All 50 states + DC mapping
- `STATE_OPTIONS` - Dropdown-ready state options array
- `getSpecialtyDisplay(category, taxonomy)` - Resolves specialty to display name
- `getConfidenceLevel(score)` - Maps score to high/medium/low with configurable thresholds
- `CONFIDENCE_STYLES` / `CONFIDENCE_BAR_COLORS` - Styling constants for confidence display

### `lib/constants.ts` - Frontend Constants

**File:** `packages/frontend/src/lib/constants.ts`

```ts
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_COMPARE_PROVIDERS = 3
MAX_RECENT_SEARCHES = 5
CONFIDENCE_THRESHOLDS = { HIGH: 70, MEDIUM: 40, LOW: 0 }
FRESHNESS_THRESHOLDS = { FRESH: 30, STALE: 90, EXPIRED: 180 }
ACCEPTANCE_STATUS = { ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN }
ENTITY_TYPES = { INDIVIDUAL, ORGANIZATION }
```

### `lib/insuranceCardSchema.ts` - Insurance Card Validation

**File:** `packages/frontend/src/lib/insuranceCardSchema.ts`

- Zod schema for 22 insurance card fields (all optional/nullable)
- Confidence score calculation: weighted by field importance (critical: 3pts, important: 2pts, other: 1pt capped at 5)
- Suggestion generation based on missing fields and image quality issues
- Two extraction prompts: `PRIMARY_EXTRACTION_PROMPT` (detailed, 22 fields) and `ALTERNATIVE_EXTRACTION_PROMPT` (simplified, 9 key fields)

### `lib/imagePreprocess.ts` - Image Preprocessing

**File:** `packages/frontend/src/lib/imagePreprocess.ts`

Server-side image processing using Sharp:
- `preprocessImage(base64, config)` - Resize (max 1024px), auto-rotate, optional contrast enhancement, JPEG compression (mozjpeg)
- `preprocessImageEnhanced(base64)` - Higher resolution (1536px), quality 90, contrast enhancement for difficult cards
- `shouldEnhanceImage(base64)` - Checks standard deviation (< 40 suggests low contrast) and resolution (< 400x300)

### `lib/rateLimit.ts` - Rate Limiting

**File:** `packages/frontend/src/lib/rateLimit.ts`

Simple in-memory rate limiter for Next.js API routes:
- `checkRateLimit(identifier, limit, windowMs)` - Returns success, remaining, resetTime
- `getRateLimitHeaders(result)` - Generates `X-RateLimit-*` response headers
- Auto-cleanup of expired entries every 60 seconds

### `lib/queryClient.ts` - React Query Configuration

**File:** `packages/frontend/src/lib/queryClient.ts`

Singleton `QueryClient` instance with default options.

### `lib/utils.ts` - General Utilities

**File:** `packages/frontend/src/lib/utils.ts`

General utility functions.

---

## Type System

### Shared Types (Re-exported)

**File:** `packages/frontend/src/types/index.ts`

Re-exports from `@healthcareproviderdb/shared`:
- Provider types: `Provider`, `ProviderWithRelations`, `ProviderSearchFilters`, etc.
- Insurance types: `InsurancePlan`, `InsurancePlanWithRelations`, etc.
- Acceptance types: `ProviderPlanAcceptance`, `ConfidenceDetails`, `ConfidenceFactors`, etc.
- Enums: `EntityType`, `SpecialtyCategory`, `NpiStatus`, `PlanType`, `MetalLevel`, `MarketType`, `DataSource`, `AcceptanceStatus`, `VerificationSource`, `VerificationType`

### Frontend-Specific Types

Defined in `packages/frontend/src/types/index.ts`:

| Type | Description |
|------|-------------|
| `SearchFilters` | 10 filter fields (state, city, cities[], specialty, name, npi, entityType, insurancePlanId, healthSystem, zipCode) |
| `PaginationState` | total, page, limit, totalPages, hasMore |
| `ApiResponse<T>` | Generic API response wrapper |
| `SelectOption` | value/label/disabled for dropdowns |
| `GroupedSelectOptions` | Grouped options (carrier -> plans) |
| `CityData` | city/state pair |
| `HealthSystem` | name/state/locationCount |
| `Location` | Full location with address, health system, facility type, provider count |
| `ProviderDisplay` | Provider with display fields, optional confidence/plan data |
| `InsurancePlanDisplay` | Plan with carrier, variant, provider count |
| `PlanAcceptanceDisplay` | Full plan acceptance with confidence breakdown and metadata |
| `Verification` | Verification record with provider and plan details |
| `CarrierGroup` | Carrier with array of plans |

### Insurance Types

**File:** `packages/frontend/src/types/insurance.ts`

| Type | Description |
|------|-------------|
| `InsuranceCardData` | 22 fields extracted from insurance card (all nullable) |
| `InsuranceCardDataWithConfidence` | Extends with per-field confidence scores |
| `ExtractionConfidence` | `'high' \| 'medium' \| 'low'` |
| `ExtractionMetadata` | Confidence, fields count, card type, issues, suggestions |
| `ExtractionIssue` | Issue type, message, severity |
| `InsuranceCardExtractionResponse` | Full API response with data, metadata, rate limit info |

---

## Analytics & Privacy

### PostHog Integration

**File:** `packages/frontend/src/components/PostHogProvider.tsx`

Configuration:
- Manual pageview capture (sensitive params stripped: npi, planId, name)
- Autocapture disabled
- Session recording disabled
- **Opt-out by default** (`opt_out_capturing_by_default: true`)
- Persistence via localStorage

### Cookie Consent

**File:** `packages/frontend/src/components/CookieConsent.tsx`

- Appears 500ms after first page load (slide-up animation)
- Accept: calls `posthog.opt_in_capturing()`, stores `'accepted'` in localStorage
- Decline: calls `posthog.opt_out_capturing()`, stores `'declined'`
- Returning users who previously accepted are automatically opted back in

---

## Testing

### Unit Tests

**Configuration:** `packages/frontend/jest.config.js`, `packages/frontend/babel.config.jest.js`

Existing test files:
- `src/lib/__tests__/errorUtils.test.ts`
- `src/lib/__tests__/constants.test.ts`
- `src/lib/__tests__/debounce.test.ts`

### E2E Tests

**Configuration:** Playwright (`@playwright/test` 1.58.0)

Scripts:
- `npm run test:e2e` - Run Playwright tests
- `npm run test:e2e:ui` - Run with Playwright UI
- `npm run test:e2e:headed` - Run in headed browser mode

---

## Accessibility Features

### Implemented

- **Focus management:** `focus-trap-react` for CompareModal and FilterDrawer
- **Focus-visible only:** Ring states only appear on keyboard navigation (not mouse clicks)
- **44px minimum touch targets:** Applied globally via CSS
- **18px base font size:** Larger text for older demographic
- **ARIA attributes:** `aria-label`, `aria-current`, `aria-live="polite"`, `aria-modal`, `role="dialog"` on interactive elements
- **Dark mode:** Full dark/light/system theme support with class-based toggling
- **iOS safe area:** Support for notch and home indicator spacing
- **Semantic HTML:** `<nav>`, `<article>`, `<main>`, `<header>`, `<footer>`, `<h1>`-`<h4>` hierarchy

### Gaps (Per Checklist)

- Full keyboard navigation audit not yet performed
- Screen reader testing not yet conducted
- Not all interactive elements have ARIA labels verified

---

## Mobile Responsiveness

### Adaptive Layouts

- **Header:** Full nav links on desktop, abbreviated logo ("VMP") on mobile
- **Search:** Card-based form on desktop, FilterDrawer (full-screen) on mobile with FilterButton trigger
- **BottomNav:** Fixed bottom nav with 4 items on mobile only (hidden on md+)
- **CompareBar:** Floating card bottom-right on desktop, full-width bar above BottomNav on mobile
- **ProviderCard:** Compact avatar (12x12 vs 14x14), hidden NPI on mobile, full-width tap target for "View Details"
- **CookieConsent:** Positioned above BottomNav on mobile, at bottom on desktop

### Responsive Breakpoints

Following Tailwind defaults:
- `sm:` (640px) - Small screens
- `md:` (768px) - Desktop breakpoint (BottomNav hidden, full nav shown)
- `lg:` (1024px) - Large screens (wider padding)

---

## SEO

### Static Metadata

Set in `layout.tsx` for the root and in individual page files.

### Dynamic Metadata

Provider detail pages generate per-provider metadata:
```ts
title: `${name} - ${specialty} in ${location} | VerifyMyProvider`
description: `Verify insurance acceptance for ${name}, ${specialty} in ${location}...`
openGraph: { title, description, type: 'profile' }
```

### Structured Data

Provider detail pages include JSON-LD (`schema.org/Physician` or `schema.org/MedicalOrganization`) with name, specialty, address, and phone.

### Sitemap

Dynamic sitemap at `/sitemap.xml` with static pages + up to 500 provider pages.

---

## Checklist Status

### Pages
- [x] Home with marketing sections (Hero, WhyItMatters, HowItWorks, Confidence, CTA)
- [x] Search with results, filters, and pagination
- [x] Provider detail with full information, SSR, JSON-LD
- [x] Insurance card scanner with Claude AI
- [x] Legal pages (privacy, terms, disclaimer)
- [x] About and research pages
- [x] Error boundary with PostHog tracking

### State Management
- [x] React Query for server state (5 min stale, 10 min GC)
- [x] React Context for client state (compare, error, theme)
- [x] URL parameter sync for search
- [x] No Redux or other state library needed

### Data Fetching
- [x] Centralized API client with retry logic (exponential backoff)
- [x] React Query hooks for provider search
- [x] Custom hooks with module-level caching for cities, plans, health systems
- [x] Error handling with ApiError class
- [x] Rate limit detection with user-friendly toast

### UX
- [x] Dark/light/system mode with flash prevention
- [x] Mobile-responsive with bottom navigation
- [x] Loading skeletons and spinners
- [x] Empty states with search suggestions
- [x] Toast notifications
- [x] Scroll-to-top
- [x] Welcome back banner
- [x] Cookie consent with opt-in analytics
- [ ] Offline support / service worker
- [ ] PWA manifest

### Accessibility
- [x] Focus trap for modals (CompareModal)
- [x] 44px minimum touch targets
- [x] 18px base font for readability
- [x] Focus-visible ring states
- [ ] Full keyboard navigation audit
- [ ] Screen reader testing
- [ ] ARIA labels on all interactive elements verified

---

## Open Questions

1. **Location detail page:** The `/location/[locationId]` route exists but may not have a complete implementation or may be disabled pending API re-enablement. Should it be removed or hidden?

2. **Comparison persistence:** Compare state uses `sessionStorage` (cleared on tab close). Should this migrate to `localStorage` for persistence across sessions?

3. **Page transitions:** Loading states exist for search and provider detail but not for all page transitions. Should we add `loading.tsx` files for App Router streaming?

4. **Search performance:** The search flow involves debouncing, AbortController cancellation, and module-level caching. Are there observable performance bottlenecks in production?

5. **SSR for SEO:** Provider detail pages use hybrid SSR. Should search results also be server-rendered for better SEO indexing of provider listings?

6. **CSP re-enablement:** The Content-Security-Policy header is commented out because it was blocking API requests. What is the timeline for proper CSP configuration?

7. **Rate limiter scaling:** The insurance card extraction uses an in-memory rate limiter. For multi-instance deployments, this needs to be replaced with Redis or similar distributed store.
