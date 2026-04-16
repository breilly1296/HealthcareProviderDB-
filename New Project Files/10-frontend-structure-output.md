# Frontend Structure Review — Output

**Last Updated:** 2026-04-16
**Framework:** Next.js 14.2.35 App Router
**Scope:** `packages/frontend/src/**`

## Stack (from `packages/frontend/package.json`)

- **Next.js** 14.2.35 (`package.json:29`). `swcMinify: false` + `experimental.turbo: undefined` forced for Windows ARM64 compatibility (`next.config.js:84-90`). `postinstall` runs SWC patch script (`package.json:16`).
- **React** 18.3.1 (`package.json:31-32`).
- **TailwindCSS** 3.3.6 with custom `primary`/`confidence` color palette and 18px base font for older demographic (`tailwind.config.ts:10-78`).
- **@tanstack/react-query** 5.90.20 (`package.json:24`).
- **lucide-react** 0.563 icons.
- **react-hot-toast** for toasts.
- **focus-trap-react** 11.0.6.
- **posthog-js** 1.321.2 for product analytics.
- **@anthropic-ai/sdk** 0.71.2 (insurance card OCR).
- **sharp** 0.33.2 (server-side image prep).
- **zod** 3.25.76.
- **@react-google-maps/api** 2.20.8 — **not documented in prompt**; used for map view.
- **react-google-recaptcha-v3** 1.11.0 — **not documented in prompt**; provider wraps app (`layout.tsx:16,132`).
- **Jest + Playwright** — `jest.config.js`, `playwright.config.ts`.

## App Router Tree

Root `packages/frontend/src/app/`:

```
app/
  layout.tsx
  page.tsx                     — home
  error.tsx                    — error boundary
  globals.css
  sitemap.ts
  (main)/                      — grouped route (no URL segment)
    insurance/
    location/[locationId]/
    privacy/
    research/
    terms/
  about/
  dashboard/insurance/
  disclaimer/
  api/insurance-card/          — Next.js API route (Claude OCR)
  login/
    LoginForm.tsx
    page.tsx
  map/
    layout.tsx, page.tsx
  provider/[npi]/
    loading.tsx, page.tsx
  saved-providers/
    SavedProvidersList.tsx, page.tsx
  search/
    layout.tsx, loading.tsx, page.tsx
```

Pages confirmed:

| Route | File | Notes |
|---|---|---|
| `/` | `app/page.tsx` | Home |
| `/search` | `app/search/page.tsx` | Has `loading.tsx` + own layout |
| `/provider/[npi]` | `app/provider/[npi]/page.tsx` | Has `loading.tsx` |
| `/location/[locationId]` | `app/(main)/location/[locationId]/...` | Inside `(main)` route group |
| `/insurance` | `app/(main)/insurance/...` | Inside `(main)` |
| `/research` | `app/(main)/research/...` | Inside `(main)` |
| `/privacy` | `app/(main)/privacy/...` | Inside `(main)` |
| `/terms` | `app/(main)/terms/...` | Inside `(main)` |
| `/about` | `app/about/...` | |
| `/disclaimer` | `app/disclaimer/...` | |
| `/login` | `app/login/page.tsx` | Client form in `LoginForm.tsx` |
| `/saved-providers` | `app/saved-providers/page.tsx` | Auth-gated |
| `/dashboard/insurance` | `app/dashboard/insurance/...` | Auth-gated |
| `/map` | `app/map/page.tsx` | Has own layout |

Prompt noted a `/api/insurance-card/extract/route.ts` Next.js API route. Directory is `app/api/insurance-card/` — serves as OCR proxy for the Claude integration.

**Sitemap:** `app/sitemap.ts` — SEO route.

## Root Layout (`app/layout.tsx`)

Provider stack (lines 126-151), outermost first:

1. `PostHogProvider`
2. `QueryProvider` (React Query)
3. `AuthProvider`
4. `ThemeProvider`
5. `CompareProvider`
6. `ErrorProvider`
7. `ReCaptchaProvider`

Layout fixtures: `ToastProvider`, `GlobalErrorBanner`, `Header`, `Disclaimer` banner, `<main>`, `Footer`, `ScrollToTop`, `CompareBar`, `CookieConsent`, `BottomNav`.

Theme flash prevention via inline script that reads `localStorage.verifymyprovider-theme` pre-hydration (lines 24-33, 119). Uses `suppressHydrationWarning` on `<html>` (line 117).

Skip-to-main-content a11y anchor at line 122.

`metadata` exports Open Graph, Twitter card, favicons (lines 41-63).

## Components Inventory

`packages/frontend/src/components/`:

### Flat components (top level)
`BookmarkButton.tsx`, `BottomNav.tsx`, `ConfidenceBadge.tsx`, `ConfidenceScoreBreakdown.tsx`, `CookieConsent.tsx`, `Disclaimer.tsx`, `EmptyState.tsx`, `ErrorMessage.tsx`, `FilterButton.tsx`, `FilterDrawer.tsx`, `FreshnessWarning.tsx`, `GlobalErrorBanner.tsx`, `Header.tsx`, `InsuranceCardScanner.tsx`, `InsuranceCardUploader.tsx`, `LoadingSpinner.tsx`, `LocationCard.tsx`, `PostHogProvider.tsx`, `ProviderCard.tsx`, `ProviderCardSkeleton.tsx`, `ProviderMap.tsx`, `ProviderVerificationForm.tsx`, `ReCaptchaProvider.tsx`, `RecentSearches.tsx`, `SaveProfileButton.tsx`, `ScrollToTop.tsx`, `SearchForm.tsx`, `ThemeToggle.tsx`, `ToastProvider.tsx`, `VerificationButton.tsx`, `index.ts` (barrel).

### Subdirs
- `components/compare/` — `CompareBar.tsx`, `CompareCheckbox.tsx`, `CompareModal.tsx`, `index.ts`.
- `components/home/` — `HeroSection.tsx`, `HeroSearch.tsx`, `WhyItMattersSection.tsx`, `HowItWorksSection.tsx`, `ConfidenceSection.tsx`, `CTASection.tsx`, `TrustBar.tsx`, `index.ts`. (`HeroSearch` and `TrustBar` are additions not called out in prompt.)
- `components/icons/` — custom icon set (prompt notes `Icons.tsx`).
- `components/illustrations/` — `NoResultsIllustration`, `SearchLandingIllustration`.
- `components/provider/` — `ConfidenceScoreExplainer.tsx`, `PlanAcceptanceCard.tsx`, `ResearchExplainer.tsx`, `VerificationCallToAction.tsx`, `VerificationTimeline.tsx`.
- `components/provider-detail/` — `AboutProvider.tsx`, `ColocatedProviders.tsx`, `ConfidenceGauge.tsx`, `InsuranceList.tsx`, `ProviderDetailClient.tsx`, `ProviderHeader.tsx`, `ProviderHeroCard.tsx`, `ProviderPlansSection.tsx`, `ProviderSidebar.tsx`, `ScoreBreakdown.tsx`, `index.ts`.
- `components/providers/` — `QueryProvider.tsx` (React Query provider only).
- `components/search/` — `InsuranceCardBanner.tsx`, `SearchControls.tsx`, `SearchHeader.tsx`, `SearchMapView.tsx`, `SearchPagination.tsx`, `SearchResultsList.tsx`, `SearchViewLayout.tsx`, `index.ts`. (More granular than prompt indicated.)
- `components/ui/` — `SearchableSelect.tsx`, `Skeleton.tsx`, `Shimmer.tsx`, `index.ts`.

Barrel file `components/index.ts` re-exports only a curated subset (confidence, provider card, search form, skeletons, header, nav, theme toggle, etc.).

## Contexts

`packages/frontend/src/context/` — four providers:

- `AuthContext.tsx` — **not in prompt's "Client State" list**; must exist because `layout.tsx:15,128` imports it.
- `CompareContext.tsx` — compare list state.
- `ErrorContext.tsx` — global error banner state (`ErrorContext.tsx:31-99`).
- `ThemeContext.tsx` — dark/light/system theme.

`ErrorContext` adds a `showErrorToast(error, duration)` helper with self-clearing timeout (lines 63-79) and integrates with `errorUtils.toAppError` / `getUserMessage` / `getErrorVariant` (lines 51, 81-82).

## Hooks

`packages/frontend/src/hooks/`:

- `useCaptcha.ts`, `useCities.ts`, `useCompare.ts`, `useGeoLocation.ts`, `useHealthSystems.ts`, `useInsuranceCard.ts`, `useInsurancePlans.ts`, `useMapProviders.ts`, `useProviderSearch.ts`, `useRecentSearches.ts`, `useSearchForm.ts`, `index.ts`.
- `hooks/search/` subfolder — `useFilterState.ts`, `useSearchExecution.ts`, `useSearchParams.ts`, `index.ts`.

Prompt's "Custom hooks" list matches, with two real-file clarifications: `useFilterState`, `useSearchExecution`, `useSearchParams` live under `hooks/search/`, not `hooks/` root.

## Lib Utilities

`packages/frontend/src/lib/`:

- `analytics.ts` — PostHog wrapper.
- `api.ts` — central fetch layer (see below).
- `constants.ts` — page sizes, state lists.
- `debounce.ts` — debounce.
- `errorUtils.ts` — error classification (see error-handling review).
- `formatName.ts` — name formatting helpers.
- `imagePreprocess.ts` — client-side image prep for insurance card upload.
- `insuranceCardApi.ts` — insurance-card-specific API namespace (imported into `api.ts`).
- `insuranceCardSchema.ts` — Zod schema for card data.
- `provider-utils.ts` — provider-display helpers.
- `queryClient.ts` — React Query client factory.
- `rateLimit.ts` — client-side retry/rate-limit helpers.
- `utils.ts` — misc.

`__tests__/` contains unit tests.

## API Client (`lib/api.ts`)

Single 880-line file. Key structures:

- `API_URL` is relative (`'/api/v1'`) in the browser (uses Next rewrite proxy so cookies are same-origin) and absolute on SSR (`api.ts:27-29`).
- `ApiError` class with `statusCode`, `code`, `details`, `retryAfter` and type-guards `isRateLimited` / `isValidationError` / `isNotFoundError` / `isUnauthorized` / `isRetryable` (lines 63-103).
- `fetchWithRetry` — retries on 429 + [500,502,503,504] and on network `TypeError`; respects `Retry-After` header, exponential backoff capped 30s (lines 255-315).
- **CSRF token management** — singleton token cache and promise-coalesced `fetchCsrfToken()`; auto-refresh on 403 EBADCSRFTOKEN (lines 321-349, 428-435).
- **401 token refresh interceptor** — singleton `attemptTokenRefresh()` hits `/auth/refresh`; retries the original request once on success (lines 361-381, 439-444).
- `apiFetch` includes `credentials: 'include'` for cookie auth (line 418).
- Mutating methods add `X-CSRF-Token` header (lines 321, 407-412).
- Rate-limit exhaustion triggers a deduplicated toast `id: 'rate-limit'` (lines 456-462).

Namespaces: `providers`, `plans`, `verify`, `locations`, `auth`, `savedProviders`, `insuranceCard` — exposed via default `api` export (line 860) plus legacy named exports (`providerApi`, `verificationApi`, `locationApi`, `authApi`, `savedProvidersApi`, lines 873-880).

`providers` namespace includes `getMapPins` for bbox map queries (lines 586-614) — **not documented in prompt** but matches backend `/providers/map`.

`auth` namespace is minimal (`sendMagicLink`, `logout`, `getMe`, lines 795-809); `/auth/refresh` is called directly by `attemptTokenRefresh`.

## Types

`packages/frontend/src/types/`:

- `index.ts` — barrel.
- `insurance.ts` — insurance-specific types.

Shared types come from `@healthcareproviderdb/shared` (e.g., `Provider`, `InsurancePlan`, `PlanAcceptance`, `Verification`, `CarrierGroup`) — `api.ts:2-11` imports them.

## next.config.js

`packages/frontend/next.config.js`:

- Standalone output for Docker (line 78).
- Image formats AVIF + WebP (line 81).
- `swcMinify: false` + `experimental.turbo: undefined` for ARM64 (lines 84-90).
- `serverComponentsExternalPackages: ['sharp', 'detect-libc']` (line 89).
- Full CSP with allowlists for Google reCAPTCHA, PostHog (`us.posthog.com`, `us.i.posthog.com`), Google Maps, ipapi.co (lines 19-42).
- HSTS, X-Frame DENY, X-Content-Type-Options, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy with `camera=(self)` for card capture (lines 44-73).
- `/api/v1/*` rewrite to backend URL — keeps auth cookies same-origin (lines 105-115).

## Pages Checklist

- [x] Home, Search, Provider detail, Location detail, Insurance browser.
- [x] Legal — Privacy, Terms, Disclaimer.
- [x] About, Research, Map.
- [x] Login with magic-link form.
- [x] Saved providers.
- [x] Dashboard / insurance card.
- [x] `error.tsx` error boundary (`app/error.tsx` — tracks via PostHog `$exception`, lines 17-33; dev-only stack details, lines 82-127).
- [x] `loading.tsx` for `/search` and `/provider/[npi]`.

## State Management

- **Server state:** React Query via `components/providers/QueryProvider.tsx`.
- **Client state:** four contexts (Auth, Compare, Error, Theme).
- **URL sync:** `hooks/search/useSearchParams.ts`.
- No Redux/Zustand.

## Third-party services wired

- **Google reCAPTCHA v3** — `ReCaptchaProvider.tsx` + `useCaptcha.ts`; backend enforces score (backend `middleware/captcha.ts`).
- **Google Maps** — `ProviderMap.tsx`, `SearchMapView.tsx`; CSP allows `maps.googleapis.com`.
- **PostHog** — `PostHogProvider.tsx`, `lib/analytics.ts`; error boundary emits `$exception`.
- **Claude (Anthropic SDK)** — insurance card OCR via `app/api/insurance-card/*/route.ts` (server-side) and backend `/me/insurance-card/scan`.
- **ipapi.co** — allowed in CSP, used for geolocation fallback.

## UX & A11y

- Dark/light theme with FOUC prevention script.
- Mobile bottom nav (`BottomNav.tsx`) + skip-to-content link.
- Loading skeletons (`ProviderCardSkeleton`, `ui/Skeleton`, `ui/Shimmer`, `search/loading.tsx`, `provider/[npi]/loading.tsx`).
- Empty states + no-results illustration.
- `focus-trap-react` for modals (compare modal, filter drawer).
- Missing: PWA manifest, service worker/offline support, full screen-reader audit.

## Drift from Prompt

1. `AuthContext.tsx` exists and is wired in `layout.tsx:15,128`; prompt omits it from the Client State list.
2. `components/home/HeroSearch.tsx` and `TrustBar.tsx` exist; not in prompt inventory.
3. `components/search/*` has more files than prompt lists (SearchControls, SearchHeader, SearchPagination, SearchResultsList, SearchViewLayout).
4. `lib/` includes `formatName.ts`, `insuranceCardApi.ts`, `provider-utils.ts`, `queryClient.ts`, `rateLimit.ts`, `utils.ts` — prompt lists fewer.
5. Frontend depends on `@react-google-maps/api` and `react-google-recaptcha-v3` — not mentioned in prompt stack.
6. `providers.getMapPins` API method exists in `lib/api.ts:586-614` — prompt API client method list doesn't include it.
7. Prompt places legal/research pages under `app/<name>/`; actual structure puts `privacy`, `terms`, `research`, `insurance`, `location` under the `app/(main)/` route group.

## Issues / Recommendations

1. **Large `api.ts` (~880 LOC)** — split into per-namespace files (`providers.ts`, `plans.ts`, etc.) that re-export through `api.ts`. Would reduce merge conflicts.
2. **Dual export styles** — `api.providers` + legacy `providerApi` both exported (`api.ts:860, 875-880`). Pick one and deprecate the other.
3. **No SSR on provider detail page** — consider `generateMetadata` + server component fetch for SEO on `/provider/[npi]`.
4. **Compare state is in-memory** — persisting to `localStorage` would survive navigation; currently lost on hard reload.
5. **No PWA manifest / service worker** — listed in checklist as open; low priority pre-beta.
6. **A11y audit gaps** — keyboard-only and screen-reader testing still outstanding.
7. **Redundant swcMinify flag + patch-next-swc.js** — codified in `package.json` memory notes; ensure build doc mentions ARM64 caveat prominently.
8. **CSP allows `'unsafe-inline'` + `'unsafe-eval'` for scripts** — required by Next.js, but monitor for `strict-dynamic` adoption in Next 15.

## Questions from Prompt — Answers

1. *Hide location detail page?* — Backend `/locations` is active; the page is wired. Keep.
2. *Compare feature persistence?* — Recommended; add `localStorage` persistence in `CompareContext.tsx`.
3. *Loading states for page transitions?* — `/search` and `/provider/[npi]` have `loading.tsx`; add for `/insurance`, `/saved-providers`, `/dashboard/insurance`.
4. *Search flow bottlenecks?* — Provider search response cache is server-side; client gets `X-Cache` header. React Query `staleTime` should align with the 5-min TTL.
5. *SSR for provider detail SEO?* — Yes, provider pages are high-SEO-value; move to RSC + `generateMetadata`.
