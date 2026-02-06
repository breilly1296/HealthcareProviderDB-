# Frontend Structure Review

## Technology Stack (Verified)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 14.2 (App Router) | Framework |
| React | 18.3 | UI library |
| TailwindCSS | 3.3.6 | Styling (configured in `packages/frontend/tailwind.config.ts`) |
| @tanstack/react-query | 5.x | Server state management |
| lucide-react | -- | Icons |
| react-hot-toast | -- | Toast notifications |
| focus-trap-react | -- | Modal accessibility |
| posthog-js | -- | Analytics |
| @anthropic-ai/sdk | -- | Insurance card OCR |
| sharp | -- | Server-side image processing |
| zod | -- | Validation (insurance card schema) |

## Pages (App Router) -- Verified

| Route | File | Description | Verified |
|-------|------|-------------|----------|
| `/` | `app/page.tsx` | Home -- Hero, WhyItMatters, HowItWorks, Confidence, CTA | Yes (directory exists) |
| `/search` | `app/search/page.tsx` | Provider search with form, results, filters, pagination | Yes |
| `/provider/[npi]` | `app/provider/[npi]/page.tsx` | Provider detail page | Yes |
| `/location/[locationId]` | `app/location/[locationId]/page.tsx` | Location detail page | Yes |
| `/insurance` | `app/insurance/page.tsx` | Insurance plan browser / card scanner | Yes |
| `/research` | `app/research/page.tsx` | Research/methodology page | Yes |
| `/about` | `app/about/page.tsx` | About page | Yes |
| `/privacy` | `app/privacy/page.tsx` | Privacy policy | Yes |
| `/terms` | `app/terms/page.tsx` | Terms of service | Yes |
| `/disclaimer` | `app/disclaimer/page.tsx` | Medical disclaimer | Yes |

**Layout:** `app/layout.tsx` -- Root layout wrapping: `PostHogProvider` > `QueryProvider` > `ThemeProvider` > `CompareProvider` > `ErrorProvider` > `ToastProvider` + `GlobalErrorBanner` + `Header` + `Disclaimer` (banner) + main content + `Footer` + `ScrollToTop` + `CompareBar` + `CookieConsent` + `BottomNav`

**Error Handling:** `app/error.tsx` -- Error boundary (confirmed present)

**API Route:** `app/api/insurance-card/extract/route.ts` -- Claude API for insurance card OCR

**Sitemap:** `app/sitemap.ts` -- Dynamic sitemap generation

## Component Architecture (Verified from layout.tsx)

### Root Layout Components (`app/layout.tsx` lines 149-187)
- `PostHogProvider` -- Analytics wrapper (conditionally initializes)
- `QueryProvider` -- React Query provider
- `ThemeProvider` -- Dark/light mode context
- `CompareProvider` -- Provider comparison state
- `ErrorProvider` -- Global error state
- `ToastProvider` -- Toast notifications
- `GlobalErrorBanner` -- Global error display
- `Header` -- Main navigation header
- `Disclaimer` (banner variant) -- Medical disclaimer banner
- `Footer` -- Inline footer component with quick links, legal links, OwnMyHealth
- `ScrollToTop` -- Scroll-to-top button
- `CompareBar` -- Sticky comparison bar
- `CookieConsent` -- Cookie consent banner
- `BottomNav` -- Mobile bottom navigation

### State Management (Verified)

**Server State -- React Query:**
`packages/frontend/src/components/providers/QueryProvider.tsx` wraps the app.

Custom hooks in `packages/frontend/src/hooks/`:
- `useProviderSearch.ts` -- Search providers with caching
- `useCities.ts` -- Get cities for a state
- `useInsurancePlans.ts` -- Get insurance plans
- `useHealthSystems.ts` -- Get health systems
- `useRecentSearches.ts` -- Get recent searches
- `useCompare.ts` -- Compare context consumer
- `useSearchForm.ts` -- Search form state
- `hooks/search/` -- Directory for search-specific hooks (useFilterState, useSearchExecution, useSearchParams)

**Client State -- React Context:**
`packages/frontend/src/context/`:
- `CompareContext.tsx` -- Provider comparison (add/remove/clear, max 4)
- `ErrorContext.tsx` -- Global error state
- `ThemeContext.tsx` -- Dark/light/system theme

### API Client (`packages/frontend/src/lib/api.ts`)

Centralized API client with comprehensive error handling:

**Features verified from code:**
- [x] Retry logic: max 2 retries with exponential backoff (lines 34-39)
- [x] `ApiError` class with `statusCode`, `code`, `details`, `retryAfter` (lines 51-91)
- [x] Rate limit detection: extracts `Retry-After` from 429 responses (lines 133-150)
- [x] Toast notification on rate limit (lines 344-349)
- [x] `X-Cache` header reading for backend cache status
- [x] Network error detection and retry (lines 114-127)
- [x] Abort error handling (no retry on cancelled requests, lines 107-109)

**API namespaces (lines 397-661):**
- `api.providers` -- search, getByNpi, getCities, getPlans, getColocated
- `api.plans` -- search, getGrouped, getIssuers, getPlanTypes, getById, getProviders
- `api.verify` -- submit, vote, getStats, getRecent, getForPair
- `api.locations` -- search, getHealthSystems, getById, getProviders, getStats

### Utilities (`packages/frontend/src/lib/`)

| File | Purpose | Verified |
|------|---------|----------|
| `analytics.ts` | PostHog event tracking (privacy-preserving) | Yes (read fully) |
| `api.ts` | Centralized API client with retry logic | Yes (read fully) |
| `imagePreprocess.ts` | Image preprocessing for insurance card upload | Yes (referenced in route.ts) |
| `insuranceCardSchema.ts` | Insurance card Zod schema + extraction prompts | Yes (referenced in route.ts) |
| `rateLimit.ts` | Client-side rate limiting for API route | Yes (referenced in route.ts) |

## Next.js Configuration (`packages/frontend/next.config.js`)

- `reactStrictMode: true`
- `output: 'standalone'` (Docker deployments)
- `swcMinify: false` (ARM64 compatibility)
- `serverComponentsExternalPackages: ['sharp', 'detect-libc']`
- Security headers applied to all routes:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - CSP is **commented out** (was blocking API requests)

## Tailwind Configuration (`packages/frontend/tailwind.config.ts`)

- Dark mode: `class` strategy
- Custom colors: `primary` (blue scale), `confidence` (high=green, medium=yellow, low=red)
- Font sizes: 18px base for older demographic accessibility
- Custom animations: shimmer, slide-up, modal-enter, fade-in

## Checklist Verification

### Pages
- [x] Home with marketing sections (page.tsx + home/ components)
- [x] Search with results and filters (search/page.tsx)
- [x] Provider detail with full information (provider/[npi]/page.tsx)
- [x] Insurance browser (insurance/page.tsx)
- [x] Legal pages -- privacy, terms, disclaimer (all confirmed in app/)
- [x] About and research pages (about/page.tsx, research/page.tsx)
- [x] Error boundary (error.tsx)

### State Management
- [x] React Query for server state (QueryProvider.tsx)
- [x] React Context for client state (CompareContext, ErrorContext, ThemeContext)
- [x] URL parameter sync for search (hooks/search/ directory)
- [x] No Redux or other state library needed

### Data Fetching
- [x] Centralized API client with retry logic (lib/api.ts, fetchWithRetry)
- [x] React Query hooks for all data needs (hooks/ directory)
- [x] Error handling with ApiError class (api.ts lines 51-91)
- [x] Rate limit detection (api.ts lines 133-150, 344-349)

### UX
- [x] Dark/light mode (ThemeContext.tsx, tailwind darkMode: 'class')
- [x] Mobile-responsive with bottom navigation (BottomNav in layout.tsx)
- [x] Loading skeletons (ProviderCardSkeleton, ui/Skeleton, ui/Shimmer)
- [x] Empty states (EmptyState component)
- [x] Toast notifications (react-hot-toast via ToastProvider)
- [x] Scroll-to-top (ScrollToTop in layout.tsx)
- [x] Welcome back banner (WelcomeBackBanner component listed)
- [x] Cookie consent (CookieConsent in layout.tsx)
- [ ] Offline support / service worker -- NOT implemented
- [ ] PWA manifest -- NOT implemented

### Accessibility
- [x] Focus trap for modals (focus-trap-react dependency)
- [x] 18px base font size for older demographic (tailwind.config.ts line 33)
- [ ] Full keyboard navigation audit -- NOT completed
- [ ] Screen reader testing -- NOT completed
- [ ] ARIA labels on all interactive elements -- NOT verified

## Questions Answered

### 1. Should the location detail page be removed or hidden until the API is re-enabled?
The location detail page (`app/location/[locationId]/page.tsx`) exists and the backend location routes are fully functional with rate limiting and validation. The location API appears to be enabled. If it was previously disabled, it has been re-enabled.

### 2. Is the comparison feature being used? Should it persist to localStorage?
The comparison feature uses React Context (`CompareContext.tsx`) for state management. Based on the layout, `CompareBar` is rendered globally. The state does NOT persist to localStorage -- it resets on page refresh. Adding localStorage persistence would improve UX for users comparing providers across sessions.

### 3. Should we add loading states for all page transitions?
The app uses React Query which provides `isLoading`/`isFetching` states. Loading skeletons exist for provider cards. A global page transition indicator (e.g., NProgress or Next.js loading.tsx files) is not implemented.

### 4. Are there performance bottlenecks in the search flow?
Backend search results are cached for 5 minutes (providers.ts line 269). The frontend uses React Query caching. The API client includes retry with exponential backoff. Potential bottleneck: no search debouncing is built into the API client (though `lib/debounce.ts` utility exists for use in components).

### 5. Should we implement server-side rendering for SEO on provider detail pages?
The provider detail page (`app/provider/[npi]/page.tsx`) is in the App Router, which supports SSR by default. Whether it currently fetches data server-side or client-side depends on its implementation. For SEO, provider detail pages should use `generateMetadata()` and server-side data fetching to ensure search engines index provider information.
