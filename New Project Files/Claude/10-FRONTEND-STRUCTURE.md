# Frontend Structure

This document provides a comprehensive map of the VerifyMyProvider frontend application, including pages, components, state management, hooks, and the API client layer.

---

## Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 14.2 | App Router framework, server-side rendering, API routes |
| React | 18.3 | UI component library |
| TailwindCSS | 3.3.6 | Utility-first CSS framework |
| @tanstack/react-query | 5.x | Server state management, caching, background refetching |
| lucide-react | -- | Icon library |
| react-hot-toast | -- | Toast notification system |
| focus-trap-react | -- | Accessibility: keyboard focus trapping for modals/drawers |
| posthog-js | -- | Privacy-preserving product analytics |
| @anthropic-ai/sdk | -- | Insurance card AI extraction (server-side API route) |
| sharp | -- | Server-side image preprocessing for insurance card photos |
| zod | -- | Runtime schema validation for insurance card extraction |

---

## Pages (10 Routes)

| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | Home page with hero, WhyItMatters, HowItWorks, Confidence, and CTA sections |
| `/search` | `app/search/page.tsx` | Provider search with form, results, filters, pagination. Has `layout.tsx` and `loading.tsx` |
| `/provider/[npi]` | `app/provider/[npi]/page.tsx` | Provider detail -- hero card, plan acceptances, co-located providers, about section. Has `loading.tsx` |
| `/location/[locationId]` | `app/location/[locationId]/page.tsx` | Location detail page. Has `layout.tsx` |
| `/insurance` | `app/insurance/page.tsx` | Insurance plan browser with card uploader. Has `loading.tsx` |
| `/research` | `app/research/page.tsx` | Research methodology and data quality explanation |
| `/about` | `app/about/page.tsx` | About page. Has `loading.tsx` |
| `/privacy` | `app/privacy/page.tsx` | Privacy policy |
| `/terms` | `app/terms/page.tsx` | Terms of service |
| `/disclaimer` | `app/disclaimer/page.tsx` | Medical disclaimer |

### Special Files
- `app/layout.tsx` -- Root layout with providers (QueryProvider, PostHogProvider, ThemeContext, ErrorContext, CompareContext, ToastProvider)
- `app/error.tsx` -- Global error boundary
- `app/sitemap.ts` -- Dynamic sitemap generation

### API Routes
- `app/api/insurance-card/extract/route.ts` -- POST endpoint for Claude-powered insurance card OCR

---

## Component Architecture (60+ Components)

### Home Page Components (`components/home/`)
| Component | Purpose |
|-----------|---------|
| `HeroSection` | Landing hero with search CTA |
| `WhyItMattersSection` | Problem statement (ghost networks, 50% inaccuracy) |
| `HowItWorksSection` | Three-step explanation of search, verify, trust |
| `ConfidenceSection` | Confidence scoring explanation |
| `CTASection` | Call-to-action for search |

### Search Components
| Component | File | Purpose |
|-----------|------|---------|
| `SearchForm` | `components/SearchForm.tsx` | Multi-field search form (specialty, state, city, name, NPI, health system, insurance plan) |
| `ProviderCard` | `components/ProviderCard.tsx` | Search result card showing provider summary |
| `ProviderCardSkeleton` | `components/ProviderCardSkeleton.tsx` | Loading skeleton for provider cards |
| `RecentSearches` | `components/RecentSearches.tsx` | localStorage-based recent search history |

### Filtering Components
| Component | File | Purpose |
|-----------|------|---------|
| `FilterButton` | `components/FilterButton.tsx` | Toggle button to open filter drawer |
| `FilterDrawer` | `components/FilterDrawer.tsx` | Side drawer with filter options, focus-trapped |
| `SearchableSelect` | `components/ui/SearchableSelect.tsx` | Searchable dropdown for specialty/plan selection |

### Provider Detail Components (`components/provider-detail/`)
| Component | Purpose |
|-----------|---------|
| `ProviderDetailClient` | Client-side wrapper for provider detail page |
| `ProviderHeroCard` | Main provider information card (name, specialty, credentials) |
| `ProviderHeader` | Page header with back navigation |
| `ProviderSidebar` | Side panel with quick actions and metadata |
| `ProviderPlansSection` | Insurance plan acceptance list with confidence scores |
| `AboutProvider` | Extended provider information (medical school, telehealth, etc.) |
| `ColocatedProviders` | Other providers at the same practice location |
| `InsuranceList` | Detailed insurance plan listing |
| `ConfidenceGauge` | Visual circular gauge for confidence score (0-100) |
| `ScoreBreakdown` | Factor-by-factor confidence score breakdown |

### Provider Components (`components/provider/`)
| Component | Purpose |
|-----------|---------|
| `ConfidenceScoreExplainer` | Educational explainer for confidence scoring methodology |
| `VerificationCallToAction` | CTA encouraging users to verify provider information |
| `VerificationTimeline` | Timeline of verification history for a provider-plan pair |
| `PlanAcceptanceCard` | Individual plan acceptance display with verification status |
| `ResearchExplainer` | Research methodology explanation |

### Verification Components
| Component | File | Purpose |
|-----------|------|---------|
| `ProviderVerificationForm` | `components/ProviderVerificationForm.tsx` | Form for submitting new verifications (with honeypot field) |
| `VerificationButton` | `components/VerificationButton.tsx` | Button to initiate verification flow |

### Comparison Components (`components/compare/`)
| Component | Purpose |
|-----------|---------|
| `CompareCheckbox` | Checkbox on provider cards to add to comparison (max 4) |
| `CompareBar` | Sticky bottom bar showing selected providers for comparison |
| `CompareModal` | Side-by-side comparison modal for up to 4 providers |

### Insurance Components
| Component | File | Purpose |
|-----------|------|---------|
| `InsuranceCardUploader` | `components/InsuranceCardUploader.tsx` | Drag-and-drop image upload with Claude AI extraction |

### UI Components
| Component | File | Purpose |
|-----------|------|---------|
| `Header` | `components/Header.tsx` | App header with navigation |
| `BottomNav` | `components/BottomNav.tsx` | Mobile bottom navigation bar |
| `ThemeToggle` | `components/ThemeToggle.tsx` | Dark/light mode toggle |
| `ScrollToTop` | `components/ScrollToTop.tsx` | Scroll-to-top button |
| `LoadingSpinner` | `components/LoadingSpinner.tsx` | Loading indicator |
| `EmptyState` | `components/EmptyState.tsx` | Empty results placeholder |
| `ErrorMessage` | `components/ErrorMessage.tsx` | Error display component |
| `FreshnessWarning` | `components/FreshnessWarning.tsx` | Stale data warning banner |
| `ConfidenceBadge` | `components/ConfidenceBadge.tsx` | Small badge showing confidence level |
| `ConfidenceScoreBreakdown` | `components/ConfidenceScoreBreakdown.tsx` | Detailed score breakdown |
| `LocationCard` | `components/LocationCard.tsx` | Location summary card |
| `Disclaimer` | `components/Disclaimer.tsx` | Inline disclaimer component |
| `GlobalErrorBanner` | `components/GlobalErrorBanner.tsx` | Global error banner from ErrorContext |
| `WelcomeBackBanner` | `components/WelcomeBackBanner.tsx` | Returning user welcome message |
| `SaveProfileButton` | `components/SaveProfileButton.tsx` | Save provider to favorites |
| `CookieConsent` | `components/CookieConsent.tsx` | GDPR cookie consent banner |
| `ReCaptchaProvider` | `components/ReCaptchaProvider.tsx` | Google reCAPTCHA v3 provider |
| `Skeleton` | `components/ui/Skeleton.tsx` | Generic skeleton loading component |
| `Shimmer` | `components/ui/Shimmer.tsx` | Shimmer loading animation |

### Illustrations (`components/illustrations/`)
| Component | Purpose |
|-----------|---------|
| `NoResultsIllustration` | SVG illustration for empty search results |
| `SearchLandingIllustration` | SVG illustration for search landing state |

### Providers (React Context Wrappers)
| Component | File | Purpose |
|-----------|------|---------|
| `QueryProvider` | `components/providers/QueryProvider.tsx` | React Query provider with configured `QueryClient` |
| `PostHogProvider` | `components/PostHogProvider.tsx` | PostHog analytics provider with pageview tracking |
| `ToastProvider` | `components/ToastProvider.tsx` | react-hot-toast configuration |

### Icons
| Component | File | Purpose |
|-----------|------|---------|
| `Icons` | `components/icons/Icons.tsx` | Custom SVG icon components |

---

## State Management

### Server State (React Query)

Server state is managed exclusively through `@tanstack/react-query` with custom hooks:

| Hook | File | Purpose |
|------|------|---------|
| `useProviderSearch` | `hooks/useProviderSearch.ts` | Provider search with pagination |
| `useCities` | `hooks/useCities.ts` | City list for a given state |
| `useInsurancePlans` | `hooks/useInsurancePlans.ts` | Insurance plan search and filtering |
| `useHealthSystems` | `hooks/useHealthSystems.ts` | Health system list for filtering |
| `useRecentSearches` | `hooks/useRecentSearches.ts` | localStorage-based recent search tracking |
| `useSearchForm` | `hooks/useSearchForm.ts` | Search form state and validation |
| `useCaptcha` | `hooks/useCaptcha.ts` | reCAPTCHA token management |
| `useCompare` | `hooks/useCompare.ts` | Provider comparison selection (max 4) |

### Search State Composition (`hooks/search/`)
| Hook | Purpose |
|------|---------|
| `useSearchParams` | URL search parameter synchronization (bidirectional) |
| `useFilterState` | Filter state management (specialty, city, health system, plan) |
| `useSearchExecution` | Search execution with debouncing and error handling |

### Client State (React Context)

| Context | File | Purpose |
|---------|------|---------|
| `CompareContext` | `context/CompareContext.tsx` | Provider comparison selection (max 4 providers) |
| `ErrorContext` | `context/ErrorContext.tsx` | Global error state for error banner |
| `ThemeContext` | `context/ThemeContext.tsx` | Dark/light theme preference |

### QueryClient Configuration (`lib/queryClient.ts`)
- Configured with default stale time and cache time for healthcare data
- Background refetching enabled for data freshness

---

## API Client Layer (`lib/api.ts`)

### Core Features
- **Base URL**: `NEXT_PUBLIC_API_URL` environment variable (defaults to `http://localhost:3001/api/v1`)
- **Retry Logic**: Automatic retry with exponential backoff (base 1s, up to 2 retries)
- **Retryable Statuses**: 429, 500, 502, 503, 504
- **Retry-After Support**: Respects `Retry-After` header (capped at 30 seconds)
- **Network Error Retry**: Automatically retries on connection failures
- **Abort Support**: Does not retry aborted/cancelled requests
- **Rate Limit Toast**: Automatic toast notification on 429 responses

### ApiError Class
```typescript
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

### API Namespaces

**`api.providers`**
- `search(filters, page, limit)` -- Search providers with filters and pagination
- `getByNpi(npi)` -- Get provider by NPI with plan acceptances
- `getCities(state)` -- Get city list for a state
- `getPlans(npi, params)` -- Get plan acceptances for a provider
- `getColocated(npi, params)` -- Get co-located providers

**`api.plans`**
- `search(params)` -- Search insurance plans
- `getGrouped(params)` -- Get plans grouped by carrier
- `getIssuers(state)` -- Get insurance issuers/carriers
- `getPlanTypes(params)` -- Get available plan types
- `getById(planId)` -- Get plan details
- `getProviders(planId, params)` -- Get providers accepting a plan

**`api.verify`**
- `submit(data)` -- Submit a verification (with honeypot and CAPTCHA)
- `vote(verificationId, vote, website, captchaToken)` -- Vote on a verification
- `getStats()` -- Get verification statistics
- `getRecent(params)` -- Get recent verifications
- `getForPair(npi, planId)` -- Get verifications for a provider-plan pair

**`api.locations`**
- `search(params)` -- Search locations
- `getHealthSystems(stateOrParams, cities)` -- Get health systems for filtering
- `getById(locationId)` -- Get location details
- `getProviders(locationId, params)` -- Get providers at a location
- `getStats(state)` -- Get location statistics for a state

---

## Utility Libraries (`lib/`)

| File | Purpose |
|------|---------|
| `api.ts` | API client with retry, error handling, and namespaced endpoints |
| `analytics.ts` | Privacy-preserving PostHog event tracking |
| `constants.ts` | Application constants |
| `debounce.ts` | Debounce utility for search input |
| `errorUtils.ts` | Error formatting and classification utilities |
| `formatName.ts` | Provider name formatting (prefix, first, middle, last, suffix, credential) |
| `imagePreprocess.ts` | Sharp-based image preprocessing for insurance card photos |
| `insuranceCardSchema.ts` | Zod schemas and prompts for insurance card extraction parsing |
| `provider-utils.ts` | Provider data transformation utilities |
| `queryClient.ts` | React Query client configuration |
| `rateLimit.ts` | Client-side rate limiting for API routes (insurance card extraction) |
| `utils.ts` | General utility functions |

---

## Key Architecture Patterns

### URL-Synced Search State
Search parameters are bidirectionally synced with URL query parameters via `useSearchParams`. This enables:
- Shareable search URLs
- Browser back/forward navigation through search history
- Bookmarkable search results

### Privacy-First Analytics
The analytics layer (`analytics.ts`) accepts full event data but intentionally strips all identifying information before sending to PostHog. Function signatures accept props like `npi` and `specialty` but only send boolean indicators (`has_specialty: true`).

### Graceful Feature Degradation
- Insurance card extraction: disabled with user-friendly message if `ANTHROPIC_API_KEY` not configured
- PostHog analytics: silently disabled if `NEXT_PUBLIC_POSTHOG_KEY` not configured
- reCAPTCHA: skipped in development/test environments
- Compare feature: max 4 providers, clear messaging at limit

### Skeleton-First Loading
All data-heavy pages include dedicated loading states (`loading.tsx`) with skeleton components that match the final layout, preventing layout shift during data fetching.
