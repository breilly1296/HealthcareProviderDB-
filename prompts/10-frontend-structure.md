---
tags:
  - frontend
  - architecture
  - medium
type: prompt
priority: 3
updated: 2026-04-26
---

# Frontend Structure Review

## Files to Review
- `packages/frontend/src/app/` (Next.js App Router pages)
- `packages/frontend/src/components/` (React components by feature)
- `packages/frontend/src/hooks/` (custom React hooks)
- `packages/frontend/src/lib/` (API client, analytics, utilities)
- `packages/frontend/src/types/` (TypeScript types)
- `packages/frontend/src/context/` (React contexts — note: some in `components/context/`)
- `packages/frontend/src/components/providers/` (React Query provider)
- `packages/frontend/tailwind.config.ts` (Tailwind CSS configuration)
- `packages/frontend/next.config.js` (Next.js configuration)

## Technology Stack
- **Framework:** Next.js 14.2 (App Router)
- **React:** 18.3
- **Styling:** TailwindCSS 3.3.6 + PostCSS
- **Data Fetching:** @tanstack/react-query 5.x
- **Icons:** lucide-react
- **Toasts:** react-hot-toast
- **Accessibility:** focus-trap-react
- **Analytics:** posthog-js
- **AI Integration:** @anthropic-ai/sdk (insurance card extraction)
- **Image Processing:** sharp (server-side)
- **Validation:** zod
- **SWC Patch:** Custom postinstall for Windows ARM64 compatibility

## Pages (App Router)

| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | Home — Hero, WhyItMatters, HowItWorks, Confidence, CTA sections |
| `/search` | `app/search/page.tsx` | Provider search with form, results, filters, pagination |
| `/provider/[npi]` | `app/provider/[npi]/page.tsx` | Provider detail — hero card, plans, co-located, about |
| `/location/[locationId]` | `app/location/[locationId]/page.tsx` | Location detail — address, providers at location |
| `/insurance` | `app/insurance/page.tsx` | Insurance plan browser |
| `/research` | `app/research/page.tsx` | Research/methodology page |
| `/about` | `app/about/page.tsx` | About page |
| `/privacy` | `app/privacy/page.tsx` | Privacy policy |
| `/terms` | `app/terms/page.tsx` | Terms of service |
| `/disclaimer` | `app/disclaimer/page.tsx` | Medical disclaimer |
| `/login` | `app/login/page.tsx` | Login — Magic link authentication form |
| `/saved-providers` | `app/saved-providers/page.tsx` | Saved providers — bookmarked provider list (requireAuth) |
| `/dashboard/insurance` | `app/dashboard/insurance/page.tsx` | Insurance card dashboard — view/edit saved card (requireAuth) |
| `/map` | `app/map/page.tsx` | Map view — geographic provider search with Google Maps |

**Layout:** `app/layout.tsx` — Root layout with Header, ThemeToggle, BottomNav, ToastProvider, PostHogProvider, QueryProvider

**Error Handling:** `app/error.tsx` — Error boundary

**API Route:** `app/api/insurance-card/extract/route.ts` — Claude API for card OCR

## Component Architecture

### Home Page (`components/home/`)
- `HeroSection.tsx` — Landing hero with search CTA
- `WhyItMattersSection.tsx` — Value proposition
- `HowItWorksSection.tsx` — How it works steps
- `ConfidenceSection.tsx` — Confidence scoring explainer
- `CTASection.tsx` — Call-to-action

### Search & Results
- `SearchForm.tsx` — Search form with state/specialty/name inputs
- `ProviderCard.tsx` — Provider card in search results
- `ProviderCardSkeleton.tsx` — Loading skeleton
- `RecentSearches.tsx` — Recent search history

### Map & Location
- `search/SearchMapView.tsx` — Map view within search results
- `ProviderMap.tsx` — Map visualization component

### Filtering
- `FilterButton.tsx` — Filter toggle button
- `FilterDrawer.tsx` — Filter drawer/modal with all filter options
- `ui/SearchableSelect.tsx` — Searchable dropdown component

### Provider Detail (`components/provider-detail/`)
- `ProviderHeroCard.tsx` — Provider header (name, specialty, location)
- `ProviderHeader.tsx` — Header section
- `ProviderSidebar.tsx` — Sidebar with contact info
- `ProviderPlansSection.tsx` — Insurance plans accepted
- `AboutProvider.tsx` — Provider bio/details
- `ColocatedProviders.tsx` — Other providers at same location
- `InsuranceList.tsx` — Plans listing
- `ConfidenceGauge.tsx` — Visual confidence score gauge
- ~~`ScoreBreakdown.tsx`~~ — **DELETED 2026-04-26** as superseded dead code. The active confidence breakdown ships via `components/ConfidenceScoreBreakdown.tsx` rendered inside `components/provider-detail/ConfidenceGauge.tsx`'s "How is this calculated?" modal.

### Verification & Voting
- `ProviderVerificationForm.tsx` — Verification submission form
- `VerificationButton.tsx` — Submit verification CTA button
- `provider/VerificationTimeline.tsx` — Verification history timeline
- `provider/VerificationCallToAction.tsx` — CTA for first verification

### Comparison (`components/compare/`)
- `CompareBar.tsx` — Sticky bottom bar (shows when providers selected)
- `CompareCheckbox.tsx` — Checkbox to add provider to comparison
- `CompareModal.tsx` — Side-by-side comparison modal (max 4 providers)

### Confidence & Scoring
- `ConfidenceBadge.tsx` — Compact confidence badge
- `ConfidenceScoreBreakdown.tsx` — Detailed breakdown
- `provider/ConfidenceScoreExplainer.tsx` — Educational explainer
- `provider/ResearchExplainer.tsx` — Research methodology

### Insurance
- `InsuranceCardUploader.tsx` — Drag-and-drop card upload with Claude extraction
- `InsuranceCardScanner.tsx` — Webcam-based card scanner
- `search/InsuranceCardBanner.tsx` — Banner in search promoting card upload

### Authentication
- `app/login/LoginForm.tsx` — Magic link login form
- `app/saved-providers/SavedProvidersList.tsx` — Paginated saved provider list
- `app/dashboard/insurance/InsuranceCardDashboard.tsx` — Insurance card management

### UI Components
- `Header.tsx` — Main header/nav
- `BottomNav.tsx` — Mobile bottom navigation
- `ThemeToggle.tsx` — Dark/light mode toggle
- `ScrollToTop.tsx` — Scroll-to-top button
- `LoadingSpinner.tsx` — Loading spinner
- `EmptyState.tsx` — Empty results state
- `ErrorMessage.tsx` — Error display
- `FreshnessWarning.tsx` — Stale data warning
- `WelcomeBackBanner.tsx` — Returning user banner
- `SaveProfileButton.tsx` — Save provider profile
- `Disclaimer.tsx` — Medical disclaimer
- `LocationCard.tsx` — Location card
- `GlobalErrorBanner.tsx` — Global error banner
- `BookmarkButton.tsx` — Save/unsave provider bookmark (requires auth)
- `CookieConsent.tsx` — Cookie consent banner
- `ui/Skeleton.tsx`, `ui/Shimmer.tsx` — Loading effects

### Icons & Illustrations
- `icons/Icons.tsx` — Custom icon components
- `illustrations/SearchLandingIllustration.tsx` — Search illustration
- `illustrations/NoResultsIllustration.tsx` — No results illustration

## State Management

### Server State (React Query)
`providers/QueryProvider.tsx` wraps the app in `QueryClientProvider`.

Custom hooks in `hooks/`:
- `useProviderSearch` — Search providers with caching
- `useCities` — Get cities for state
- `useInsurancePlans` — Get insurance plans
- `useHealthSystems` — Get health systems
- `useRecentSearches` — Get recent searches
- `useInsuranceCard` — Get/save/update/delete insurance card
- `useGeoLocation` — Browser geolocation API wrapper
- `useMapProviders` — Provider data for map display
- `useCaptcha` — reCAPTCHA token handling

### Client State (React Context)
- `context/CompareContext.tsx` — Compare state (providers array, add/remove/clear, max 4)
- `context/ErrorContext.tsx` — Global error state
- `context/ThemeContext.tsx` — Dark/light theme state

### Search State (Custom Hooks)
- `hooks/useSearchForm.ts` — Form input state
- `hooks/useFilterState.ts` — Filter state management
- `hooks/useSearchExecution.ts` — Execute search with React Query
- `hooks/useSearchParams.ts` — URL search parameter sync

### Compare State
- `hooks/useCompare.ts` — Compare context consumer hook

## API Client (`lib/api.ts`)

Centralized API client with:
- **Retry logic:** Configurable attempts, exponential backoff
- **Error handling:** `ApiError` class with statusCode, code, details, retryAfter
- **Rate limit detection:** Extracts Retry-After from 429 responses
- **Cache headers:** Reads X-Cache header from backend

Methods:
- `providerApi.search()`, `.getByNpi()`, `.getCities()`
- `planApi.search()`, `.getById()`, `.getProvidersForPlan()`, `.getGrouped()`, `.getIssuers()`, `.getTypes()`
- `verifyApi.submit()`, `.vote()`, `.getStats()`, `.getRecent()`, `.getPair()`
- `healthApi.getCities()`, `.getRecentSearches()`

## Utilities
- `lib/analytics.ts` — PostHog event tracking (privacy-preserving)
- `lib/constants.ts` — Frontend constants (page sizes, states list, etc.)
- `lib/debounce.ts` — Debounce utility
- `lib/errorUtils.ts` — Error handling utilities
- `lib/imagePreprocess.ts` — Image preprocessing for insurance card upload
- `lib/insuranceCardSchema.ts` — Insurance card data Zod schema

## Checklist

### Pages
- [x] Home with marketing sections
- [x] Search with results and filters
- [x] Provider detail with full information
- [x] Insurance browser
- [x] Legal pages (privacy, terms, disclaimer)
- [x] About and research pages
- [x] Error boundary
- [x] Login page with magic link auth
- [x] Saved providers (authenticated)
- [x] Insurance card dashboard (authenticated)
- [x] Map view with Google Maps

### State Management
- [x] React Query for server state
- [x] React Context for client state (compare, error, theme)
- [x] URL parameter sync for search
- [x] No Redux or other state library needed

### Data Fetching
- [x] Centralized API client with retry logic
- [x] React Query hooks for all data needs
- [x] Error handling with ApiError class
- [x] Rate limit detection

### UX
- [x] Dark/light mode
- [x] Mobile-responsive with bottom navigation
- [x] Loading skeletons
- [x] Empty states
- [x] Toast notifications
- [x] Scroll-to-top
- [x] Welcome back banner
- [x] Offline support / service worker — `components/ServiceWorkerRegistration.tsx` registers a worker; `app/offline/page.tsx` is the offline fallback route.
- [x] PWA manifest — `app/manifest.ts` generates the Web App Manifest dynamically (theme color, icons, name).
- [ ] (Caveat: scaffolding exists but a full PWA audit — caching strategies, install-prompt UX, update flow — has not been done.)

### Accessibility
- [x] Focus trap for modals
- [ ] Full keyboard navigation audit
- [ ] Screen reader testing
- [ ] ARIA labels on all interactive elements

## Questions to Ask
1. Should the location detail page be removed or hidden until the API is re-enabled?
2. Is the comparison feature being used? Should it persist to localStorage?
3. Should we add loading states for all page transitions?
4. Are there any performance bottlenecks in the search flow?
5. Should we implement server-side rendering for SEO on provider detail pages?
