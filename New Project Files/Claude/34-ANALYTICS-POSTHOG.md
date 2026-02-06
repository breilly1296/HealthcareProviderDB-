# PostHog Analytics

**Last Updated:** 2026-02-06
**Status:** Active (opt-out by default)

## Configuration
- PostHog Key: Configured via `NEXT_PUBLIC_POSTHOG_KEY` environment variable (conditionally initialized only when key exists)
- PostHog Host: Defaults to `https://us.i.posthog.com` (US-specific endpoint)
- Events tracked: 5 types (pageview, search, provider_view, verification_submit, verification_vote)
- Opt-out by default: `opt_out_capturing_by_default: true` in PostHogProvider.tsx

## Key Findings from Source Code

### PostHogProvider.tsx
- Located at `packages/frontend/src/components/PostHogProvider.tsx`
- Initializes PostHog only in the browser (`typeof window !== 'undefined'`)
- Guards against missing key: only calls `posthog.init()` if `NEXT_PUBLIC_POSTHOG_KEY` is defined
- Configuration settings:
  - `capture_pageview: false` -- pageviews are captured manually via `PostHogPageview` component
  - `capture_pageleave: true` -- automatic page-leave tracking
  - `persistence: 'localStorage'` -- no cookies used for PostHog persistence
  - `autocapture: false` -- no automatic click/element tracking
  - `disable_session_recording: true` -- session recordings disabled
  - `opt_out_capturing_by_default: true` -- users must opt in via cookie consent
- Includes a `PostHogPageview` component that strips sensitive query params (`npi`, `planId`, `name`) before sending the `$pageview` event
- Wrapped in `<Suspense>` in layout.tsx to avoid blocking rendering

### analytics.ts
- Located at `packages/frontend/src/lib/analytics.ts`
- All 4 tracking functions include `typeof window === 'undefined'` guard for SSR safety
- Privacy-preserving design is verified in actual code:
  - `trackSearch()`: Only sends boolean indicators (has_specialty_filter, has_state_filter, has_city_filter, has_health_system_filter), result count, and mode. Does NOT send actual filter values.
  - `trackProviderView()`: Only sends `has_specialty` boolean. Does NOT send NPI, provider name, or specialty.
  - `trackVerificationSubmit()`: Sends empty payload `{}`. The `_props` parameter is intentionally unused.
  - `trackVerificationVote()`: Only sends `vote_type` (up/down). Does NOT send verification ID or NPI.
- `identifyUser()` and `resetUser()` are ready for future account integration

### layout.tsx Integration
- Located at `packages/frontend/src/app/layout.tsx`
- `PostHogProvider` wraps the entire application at the top level (just inside `<Suspense>`)
- Provider hierarchy: `PostHogProvider > QueryProvider > ThemeProvider > CompareProvider > ErrorProvider`
- `CookieConsent` component is rendered at the bottom of the layout

### CookieConsent.tsx
- Located at `packages/frontend/src/components/CookieConsent.tsx`
- Uses localStorage key `vmp-analytics-consent`
- Three states: no stored value (shows banner), `accepted`, `declined`
- On accept: calls `posthog.opt_in_capturing()` and stores `accepted`
- On decline: calls `posthog.opt_out_capturing()` and stores `declined`
- On page load with existing `accepted` consent: calls `posthog.opt_in_capturing()` to re-enable
- Banner has 500ms delay before appearing for a smooth slide-up effect
- Responsive design with proper dark mode support

## Events Tracked

| Event | Properties Sent | Properties NOT Sent | Privacy |
|-------|----------------|---------------------|---------|
| `$pageview` | Sanitized URL (npi, planId, name stripped) | Raw query params | Sanitized |
| `$pageleave` | Auto-captured | N/A | Auto |
| `search` | has_specialty_filter, has_state_filter, has_city_filter, has_health_system_filter, results_count, has_results, mode | specialty, state, city, healthSystem | Boolean only |
| `provider_view` | has_specialty | npi, specialty, provider_name | Boolean only |
| `verification_submit` | (empty) | npi, plan_id, accepts_insurance | Empty payload |
| `verification_vote` | vote_type | verification_id, npi | Direction only |

## Checklist Verification

### Setup
- [x] PostHogProvider created -- VERIFIED in `PostHogProvider.tsx`
- [x] Provider in layout -- VERIFIED wrapping all content in `layout.tsx`
- [x] Environment variables referenced -- `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`
- [ ] Tracking verified working in PostHog dashboard -- Cannot verify from code alone

### Event Tracking
- [x] Search events -- VERIFIED privacy-preserving in `analytics.ts` line 50-63
- [x] Provider view events -- VERIFIED privacy-preserving in `analytics.ts` line 70-78
- [x] Verification submit events -- VERIFIED empty payload in `analytics.ts` line 84-93
- [x] Verification vote events -- VERIFIED vote direction only in `analytics.ts` line 99-107
- [x] User identity functions ready -- VERIFIED `identifyUser` and `resetUser` in `analytics.ts` line 112-125
- [x] Manual pageview tracking -- VERIFIED `PostHogPageview` component strips sensitive params
- [ ] Compare actions -- NOT tracked
- [ ] Error events -- NOT tracked
- [ ] Insurance card upload events -- NOT tracked

### Privacy
- [x] No PII captured -- VERIFIED: only booleans, counts, and vote direction
- [x] No healthcare data captured -- VERIFIED: specialties, plans, NPIs are all stripped
- [x] `autocapture` explicitly disabled -- VERIFIED: `autocapture: false` in PostHogProvider.tsx line 18
- [x] `opt_out_capturing_by_default: true` -- VERIFIED: users must explicitly opt in
- [x] Cookie consent banner -- VERIFIED: `CookieConsent.tsx` with accept/decline buttons
- [x] Opt-out mechanism -- VERIFIED: `posthog.opt_out_capturing()` on decline
- [x] Sensitive URL params stripped from pageviews -- VERIFIED: npi, planId, name removed
- [ ] Privacy policy updated to mention PostHog -- Cannot verify from code

### Analysis
- [ ] Dashboard created
- [ ] Key metrics defined
- [ ] Funnels set up
- [ ] Alerts configured

## Questions Answered

### 1. Is PostHog currently active?
PostHog is **conditionally active**. It initializes only when `NEXT_PUBLIC_POSTHOG_KEY` is set AND the user has accepted cookies. The `opt_out_capturing_by_default: true` setting means no data is collected until the user explicitly clicks "Accept" in the CookieConsent banner. Whether events appear in the dashboard depends on whether the environment variable is configured in the deployment.

### 2. What insights are most valuable?
Based on the current event tracking, the most valuable insights would be:
- **Search patterns**: Which filter combinations are most commonly used (via boolean indicators)
- **Conversion rates**: search-to-provider-view ratio, view-to-verification ratio
- **Empty results rate**: `has_results: false` frequency indicates search quality issues
- **Verification engagement**: How often users submit verifications and vote

### 3. Should we enable session recordings?
Session recordings are currently **explicitly disabled** (`disable_session_recording: true`). Given the healthcare context and the privacy-first approach of this codebase, enabling session recordings would require careful consideration:
- Healthcare-related browsing patterns could be considered sensitive
- Would need prominent disclosure in privacy policy
- Could be valuable for UX debugging on specific flows (verification flow, insurance card upload)
- Recommendation: Keep disabled unless specific UX issues need debugging, and if enabled, use PostHog's privacy controls to mask form inputs

### 4. Should we add feature flags?
Feature flags are not currently used but PostHog supports them. Good candidates:
- A/B testing the verification flow (simple vs. detailed)
- Gradual rollout of insurance card upload
- Testing different search result layouts
- No additional code changes needed since PostHog is already initialized

### 5. Is there a user consent mechanism?
**Yes, fully implemented.** The `CookieConsent` component (`CookieConsent.tsx`):
- Shows a sliding banner on first visit after 500ms delay
- Provides clear "Accept" and "Decline" buttons
- Uses `posthog.opt_in_capturing()` / `posthog.opt_out_capturing()`
- Persists consent in localStorage (`vmp-analytics-consent`)
- Re-applies consent on subsequent visits
- Combined with `opt_out_capturing_by_default: true`, this provides full GDPR-style consent

## Issues

1. **Inconsistent response format**: The prompt's code snippet shows `success: true` wrapping pattern but PostHog analytics functions don't have error boundaries -- if `posthog.capture()` throws, it would be unhandled.
2. **No error event tracking**: Application errors (API failures, crashes) are not tracked in PostHog, missing an opportunity for monitoring.
3. **No pageview tracking for non-route-change pages**: The `PostHogPageview` component only fires on `pathname` or `searchParams` changes. Initial page loads should be captured, and they are via the `useEffect` dependency array, but this relies on client-side rendering.

## Recommendations

1. **Add error event tracking** in the `ErrorContext` or `error.tsx` boundary to capture application errors (without PII) for monitoring conversion-to-error rates.
2. **Track insurance card upload events** (success/failure, not the card data) to measure feature adoption.
3. **Add compare action tracking** when compare feature is used.
4. **Consider PostHog feature flags** for A/B testing the verification flow before wider rollout.
5. **Update privacy policy** to mention PostHog and the privacy-preserving approach to analytics.
