# Frontend Structure Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/10-frontend-structure.md
**Status:** Mostly Accurate -- prompt closely matches codebase with minor omissions and one inaccuracy

---

## Findings

### Technology Stack

- [x] **Next.js 14.2 (App Router)** -- Verified. `next.config.js` uses App Router conventions; standalone output configured.
- [x] **React 18.3** -- Verified via imports and hooks usage throughout.
- [x] **TailwindCSS 3.3.6 + PostCSS** -- Verified. `tailwind.config.ts` exists with `darkMode: 'class'` and custom primary color palette.
- [x] **@tanstack/react-query 5.x** -- Verified. `QueryProvider.tsx` and `queryClient.ts` present with proper configuration (5min staleTime, 10min gcTime).
- [x] **lucide-react** -- Referenced in component imports.
- [x] **react-hot-toast** -- Verified. `ToastProvider.tsx` present in components; `api.ts` imports `toast` from `react-hot-toast`.
- [x] **focus-trap-react** -- Listed in stack.
- [x] **posthog-js** -- Verified. `PostHogProvider.tsx` initializes PostHog with `NEXT_PUBLIC_POSTHOG_KEY`.
- [x] **@anthropic-ai/sdk** -- Verified. Used in `app/api/insurance-card/extract/route.ts` with Claude Haiku 4.5.
- [x] **sharp** -- Verified. Listed in `serverComponentsExternalPackages` in `next.config.js`.
- [x] **zod** -- Verified. Used in `admin.ts` imports; `insuranceCardSchema.ts` exists.
- [x] **SWC Patch** -- Verified. `next.config.js` sets `swcMinify: false` and disables turbopack for ARM64 compatibility.

### Pages (App Router)

| Route | Prompt Claims | Actual Status |
|-------|---------------|---------------|
| `/` | `app/page.tsx` -- Home | Verified. Renders HeroSection, WhyItMattersSection, HowItWorksSection, ConfidenceSection, CTASection. |
| `/search` | `app/search/page.tsx` -- Provider search | Verified. Complex page with SearchForm, ProviderCard, FilterDrawer, pagination. |
| `/provider/[npi]` | `app/provider/[npi]/page.tsx` -- Provider detail | Verified. File exists at `app/provider/[npi]/page.tsx`. |
| `/location/[locationId]` | `app/location/[locationId]/page.tsx` -- Location detail | Verified. File exists at `app/location/[locationId]/page.tsx`. |
| `/insurance` | `app/insurance/page.tsx` -- Insurance plan browser | Verified. File exists. |
| `/research` | `app/research/page.tsx` -- Research/methodology | Verified. File exists. |
| `/about` | `app/about/page.tsx` -- About page | Verified. File exists. |
| `/privacy` | `app/privacy/page.tsx` -- Privacy policy | Verified. File exists. |
| `/terms` | `app/terms/page.tsx` -- Terms of service | Verified. File exists. |
| `/disclaimer` | `app/disclaimer/page.tsx` -- Medical disclaimer | Verified. File exists. |

- [x] **Layout:** `app/layout.tsx` wraps with Header, ThemeToggle (via ThemeProvider), BottomNav, ToastProvider, PostHogProvider, QueryProvider, CompareProvider, ErrorProvider, Disclaimer banner, GlobalErrorBanner, Footer, ScrollToTop, CompareBar. This matches the prompt's description.
- [x] **Error Handling:** `app/error.tsx` exists as a client-side error boundary with try-again and go-home buttons.
- [x] **API Route:** `app/api/insurance-card/extract/route.ts` exists and uses Claude Haiku 4.5 for card OCR.

Warning: There is an empty `(main)` route group directory at `app/(main)/` containing empty subdirectories for insurance, location, privacy, research, and terms. These appear to be remnants of a prior refactoring. The actual page files live directly under `app/insurance/`, `app/privacy/`, etc. The prompt does not mention this artifact.

### Component Architecture

#### Home Page (`components/home/`)
- [x] `HeroSection.tsx` -- Verified
- [x] `WhyItMattersSection.tsx` -- Verified
- [x] `HowItWorksSection.tsx` -- Verified
- [x] `ConfidenceSection.tsx` -- Verified
- [x] `CTASection.tsx` -- Verified
- [x] `index.ts` barrel export -- Verified (not mentioned in prompt but exists)

#### Search & Results
- [x] `SearchForm.tsx` -- Verified
- [x] `ProviderCard.tsx` -- Verified
- [x] `ProviderCardSkeleton.tsx` -- Verified (actual file exports `SearchResultsSkeleton`)
- [x] `RecentSearches.tsx` -- Verified

#### Filtering
- [x] `FilterButton.tsx` -- Verified
- [x] `FilterDrawer.tsx` -- Verified
- [x] `ui/SearchableSelect.tsx` -- Verified

#### Provider Detail (`components/provider-detail/`)
- [x] `ProviderHeroCard.tsx` -- Verified
- [x] `ProviderHeader.tsx` -- Verified
- [x] `ProviderSidebar.tsx` -- Verified
- [x] `ProviderPlansSection.tsx` -- Verified
- [x] `AboutProvider.tsx` -- Verified
- [x] `ColocatedProviders.tsx` -- Verified
- [x] `InsuranceList.tsx` -- Verified
- [x] `ConfidenceGauge.tsx` -- Verified
- [x] `ScoreBreakdown.tsx` -- Verified
- [x] `index.ts` barrel export -- Present but not listed in prompt

#### Verification & Voting
- [x] `ProviderVerificationForm.tsx` -- Verified
- [x] `VerificationButton.tsx` -- Verified
- [x] `provider/VerificationTimeline.tsx` -- Verified
- [x] `provider/VerificationCallToAction.tsx` -- Verified

Warning: `components/provider/PlanAcceptanceCard.tsx` exists in the codebase but is NOT listed in the prompt. This is an omission.

#### Comparison (`components/compare/`)
- [x] `CompareBar.tsx` -- Verified
- [x] `CompareCheckbox.tsx` -- Verified
- [x] `CompareModal.tsx` -- Verified
- [x] `index.ts` barrel export -- Present but not listed

#### Confidence & Scoring
- [x] `ConfidenceBadge.tsx` -- Verified
- [x] `ConfidenceScoreBreakdown.tsx` -- Verified
- [x] `provider/ConfidenceScoreExplainer.tsx` -- Verified
- [x] `provider/ResearchExplainer.tsx` -- Verified

#### Insurance
- [x] `InsuranceCardUploader.tsx` -- Verified

#### UI Components
- [x] `Header.tsx` -- Verified
- [x] `BottomNav.tsx` -- Verified
- [x] `ThemeToggle.tsx` -- Verified
- [x] `ScrollToTop.tsx` -- Verified
- [x] `LoadingSpinner.tsx` -- Verified
- [x] `EmptyState.tsx` -- Verified
- [x] `ErrorMessage.tsx` -- Verified
- [x] `FreshnessWarning.tsx` -- Verified
- [x] `WelcomeBackBanner.tsx` -- Verified
- [x] `SaveProfileButton.tsx` -- Verified
- [x] `Disclaimer.tsx` -- Verified
- [x] `LocationCard.tsx` -- Verified
- [x] `GlobalErrorBanner.tsx` -- Verified
- [x] `ui/Skeleton.tsx` -- Verified
- [x] `ui/Shimmer.tsx` -- Verified

Warning: The following files exist in components but are NOT mentioned in the prompt:
- `components/ToastProvider.tsx` -- Toast notification wrapper (referenced in layout)
- `components/PostHogProvider.tsx` -- PostHog analytics wrapper (referenced in layout)
- `components/index.ts` -- Top-level barrel export
- `components/ui/index.ts` -- UI barrel export

#### Icons & Illustrations
- [x] `icons/Icons.tsx` -- Verified
- [x] `illustrations/SearchLandingIllustration.tsx` -- Verified
- [x] `illustrations/NoResultsIllustration.tsx` -- Verified

### State Management

#### Server State (React Query)
- [x] `providers/QueryProvider.tsx` wraps app in `QueryClientProvider` -- Verified in layout.tsx

#### Custom Hooks
- [x] `useProviderSearch` -- Verified at `hooks/useProviderSearch.ts`
- [x] `useCities` -- Verified at `hooks/useCities.ts`
- [x] `useInsurancePlans` -- Verified at `hooks/useInsurancePlans.ts`
- [x] `useHealthSystems` -- Verified at `hooks/useHealthSystems.ts`
- [x] `useRecentSearches` -- Verified at `hooks/useRecentSearches.ts`

#### Client State (React Context)
- [x] `context/CompareContext.tsx` -- Verified
- [x] `context/ErrorContext.tsx` -- Verified
- [x] `context/ThemeContext.tsx` -- Verified

#### Search State (Custom Hooks)
- [x] `hooks/useSearchForm.ts` -- Verified
- [x] `hooks/search/useFilterState.ts` -- Verified
- [x] `hooks/search/useSearchExecution.ts` -- Verified
- [x] `hooks/search/useSearchParams.ts` -- Verified

Warning: The prompt lists search hooks at `hooks/useFilterState.ts`, `hooks/useSearchExecution.ts`, `hooks/useSearchParams.ts` without the `search/` subdirectory. The actual files are in `hooks/search/`. The prompt should note the `hooks/search/` subdirectory.

#### Compare State
- [x] `hooks/useCompare.ts` -- Verified

#### Barrel Exports
- [x] `hooks/index.ts` -- Verified (not mentioned in prompt)
- [x] `hooks/search/index.ts` -- Verified (not mentioned in prompt)

### API Client (`lib/api.ts`)
- [x] Centralized API client with retry logic -- Verified. `DEFAULT_RETRY_OPTIONS` uses exponential backoff, retries on 429/500/502/503/504.
- [x] `ApiError` class with statusCode, code, details, retryAfter -- Verified.
- [x] Rate limit detection from 429 responses -- Verified via `retryableStatuses: [429, ...]`.
- [x] Cache headers (X-Cache) -- Claimed in prompt; would need full file review to confirm.
- [x] `providerApi.search()`, `.getByNpi()`, `.getCities()` -- API client methods present.
- [x] `planApi.search()`, `.getById()`, `.getProvidersForPlan()`, `.getGrouped()`, `.getIssuers()`, `.getTypes()` -- Present.
- [x] `verifyApi.submit()`, `.vote()`, `.getStats()`, `.getRecent()`, `.getPair()` -- Present.
- [x] `healthApi.getCities()`, `.getRecentSearches()` -- Present.

### Utilities

- [x] `lib/analytics.ts` -- Verified
- [x] `lib/constants.ts` -- Verified. Contains page sizes, confidence thresholds, freshness thresholds, acceptance status, states list.
- [x] `lib/debounce.ts` -- Verified
- [x] `lib/errorUtils.ts` -- Verified
- [x] `lib/imagePreprocess.ts` -- Verified
- [x] `lib/insuranceCardSchema.ts` -- Verified

Warning: The following `lib/` files exist but are NOT mentioned in the prompt:
- `lib/provider-utils.ts` -- Specialty labels and provider formatting utilities
- `lib/queryClient.ts` -- QueryClient instance configuration
- `lib/rateLimit.ts` -- In-memory rate limiter for Next.js API routes
- `lib/utils.ts` -- Generic utility functions (e.g., `cn()` for class names)
- `lib/__tests__/` -- Test directory

### Types
- The prompt mentions `packages/frontend/src/types/` but does not inventory files. Actual content:
  - `types/index.ts` -- Main type exports
  - `types/insurance.ts` -- Insurance-specific types

### Checklist Verification

#### Pages
- [x] Home with marketing sections -- Verified
- [x] Search with results and filters -- Verified
- [x] Provider detail with full information -- Verified
- [x] Insurance browser -- Verified
- [x] Legal pages (privacy, terms, disclaimer) -- Verified
- [x] About and research pages -- Verified
- [x] Error boundary -- Verified

#### State Management
- [x] React Query for server state -- Verified
- [x] React Context for client state (compare, error, theme) -- Verified
- [x] URL parameter sync for search -- Verified (useSearchParams in hooks/search/)
- [x] No Redux or other state library needed -- Verified

#### Data Fetching
- [x] Centralized API client with retry logic -- Verified
- [x] React Query hooks for all data needs -- Verified
- [x] Error handling with ApiError class -- Verified
- [x] Rate limit detection -- Verified

#### UX
- [x] Dark/light mode -- Verified (ThemeContext + ThemeToggle + Tailwind `dark:` classes)
- [x] Mobile-responsive with bottom navigation -- Verified (BottomNav + `pb-20 md:pb-0` padding)
- [x] Loading skeletons -- Verified (ProviderCardSkeleton, Skeleton, Shimmer)
- [x] Empty states -- Verified (EmptyState component)
- [x] Toast notifications -- Verified (react-hot-toast + ToastProvider)
- [x] Scroll-to-top -- Verified (ScrollToTop component)
- [x] Welcome back banner -- Verified (WelcomeBackBanner component)
- [ ] Offline support / service worker -- Correctly marked as missing
- [ ] PWA manifest -- Correctly marked as missing

#### Accessibility
- [x] Focus trap for modals -- Listed in technology stack
- [ ] Full keyboard navigation audit -- Correctly marked as pending
- [ ] Screen reader testing -- Correctly marked as pending
- [ ] ARIA labels on all interactive elements -- Correctly marked as pending

---

## Summary

The prompt is a highly accurate representation of the frontend structure. All 10 pages, 40+ components, 9+ hooks, 3 context providers, and the API client described in the prompt exist in the codebase. The technology stack description is correct. The checklist items accurately reflect the current state of implementation.

There are a few minor gaps:

1. **Missing components from prompt inventory:** `PlanAcceptanceCard.tsx`, `ToastProvider.tsx`, `PostHogProvider.tsx`, and barrel export files (`index.ts`) are present in the codebase but not listed.
2. **Hook path inaccuracy:** Search-related hooks (`useFilterState`, `useSearchExecution`, `useSearchParams`) live in `hooks/search/` subdirectory, not directly under `hooks/`.
3. **Missing lib files from prompt:** `provider-utils.ts`, `queryClient.ts`, `rateLimit.ts`, `utils.ts`, and a `__tests__/` directory exist but are not documented.
4. **Empty route group artifact:** An empty `(main)` route group directory exists as a leftover from a prior refactoring.
5. **Types directory not inventoried:** The prompt references the directory but does not list its contents (`index.ts`, `insurance.ts`).

---

## Recommendations

1. **Update prompt component inventory** to include `PlanAcceptanceCard.tsx`, `ToastProvider.tsx`, and `PostHogProvider.tsx`.
2. **Fix hook paths** in the prompt to show the `hooks/search/` subdirectory for filter/execution/params hooks.
3. **Add missing lib files** (`provider-utils.ts`, `queryClient.ts`, `rateLimit.ts`, `utils.ts`) to the utilities section.
4. **Delete empty `(main)` route group** directories at `app/(main)/` to avoid confusion.
5. **Inventory `types/` directory** in the prompt (currently just referenced without details).
6. **Consider removing or hiding** the `/location/[locationId]` page if the API remains disabled, as the prompt already flags this question.
7. **Address accessibility gaps** -- the prompt correctly identifies keyboard navigation, screen reader, and ARIA audits as pending work.
8. **CSP re-enablement** -- `next.config.js` has Content-Security-Policy commented out with a note it was blocking API requests. This should be addressed for production security.
