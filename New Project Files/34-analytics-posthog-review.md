# PostHog Analytics Integration Review

**Generated:** 2026-02-18
**Prompt:** `prompts/34-analytics-posthog.md`
**Status:** Implemented -- Privacy-First, Production-Ready

---

## Files Reviewed

| File | Path | Status |
|------|------|--------|
| PostHogProvider.tsx | `packages/frontend/src/components/PostHogProvider.tsx` | Verified |
| analytics.ts | `packages/frontend/src/lib/analytics.ts` | Verified |
| layout.tsx | `packages/frontend/src/app/layout.tsx` | Verified |
| CookieConsent.tsx | `packages/frontend/src/components/CookieConsent.tsx` | Verified |
| errorUtils.ts | `packages/frontend/src/lib/errorUtils.ts` | Verified |
| error.tsx | `packages/frontend/src/app/error.tsx` | Verified |

---

## Provider Setup

### PostHogProvider.tsx -- Confirmed Implementation

The provider initializes PostHog client-side with privacy-preserving defaults:

```typescript
posthog.init(posthogKey, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
  capture_pageview: false,              // Manual capture for sanitization
  capture_pageleave: true,              // Auto-captured
  persistence: 'localStorage',          // No cookies for PostHog itself
  autocapture: false,                   // No DOM event auto-capture
  disable_session_recording: true,      // No session replays
  opt_out_capturing_by_default: true,   // GDPR-safe: no tracking until consent
});
```

**Key finding:** The `opt_out_capturing_by_default: true` setting means PostHog sends zero data until the user explicitly accepts via the CookieConsent banner. This is a strong privacy-by-default posture.

### Layout Integration -- Confirmed

In `layout.tsx`, PostHogProvider wraps the entire component tree at the outermost layer (lines 125-151), ensuring all child components have access to analytics context. The provider is inside a `<Suspense>` boundary, which is correct for the `useSearchParams()` hook used by `PostHogPageview`.

### Pageview Tracking -- Parameter Sanitization Confirmed

The `PostHogPageview` component manually tracks route changes and strips sensitive query parameters before sending:

```typescript
['npi', 'planId', 'name'].forEach(key => sanitizedParams.delete(key));
```

This prevents provider NPIs, plan identifiers, and provider names from leaking into analytics pageview events.

---

## Event Tracking Analysis

### Privacy-Preserving Design -- Verified

All four tracking functions in `analytics.ts` follow the same pattern: accept typed props with full data, but only send boolean indicators or minimal metadata.

| Function | What IS Sent | What is NOT Sent |
|----------|-------------|-----------------|
| `trackSearch()` | `has_specialty_filter`, `has_state_filter`, `has_city_filter`, `has_health_system_filter`, `results_count`, `has_results`, `mode` | specialty, state, city, cities, healthSystem |
| `trackProviderView()` | `has_specialty` | npi, specialty, provider_name |
| `trackVerificationSubmit()` | Empty object `{}` | npi, plan_id, accepts_insurance |
| `trackVerificationVote()` | `vote_type` (up/down) | verification_id, npi |

**Design insight:** The function signatures accept full typed parameters (e.g., `ProviderViewEventProps` includes `npi`, `specialty`, `providerName`) but the implementations deliberately ignore them. This serves dual purposes: (1) the type signatures document what data flows through the system, and (2) the implementations enforce that only aggregate data leaves the client.

### SSR Safety -- Confirmed

Every tracking function includes a `typeof window === 'undefined'` guard to prevent server-side execution, which is correct for Next.js App Router components that may render on the server.

### Future-Proofing -- Confirmed

`identifyUser()` and `resetUser()` functions are implemented but currently unused, ready for when user accounts become the primary interaction model.

---

## Cookie Consent Implementation

### CookieConsent.tsx -- Verified

The consent mechanism is well-implemented:

1. **Default state:** No tracking (PostHog is opt-out by default)
2. **Banner display:** Shows after a 500ms delay on first visit (no stored consent)
3. **Accept path:** Calls `posthog.opt_in_capturing()`, stores `'accepted'` in localStorage under `vmp-analytics-consent`
4. **Decline path:** Calls `posthog.opt_out_capturing()`, stores `'declined'`
5. **Return visits:** If previously accepted, calls `posthog.opt_in_capturing()` on load

The banner uses `role="alert"` and `aria-live="polite"` for accessibility, and the copy explicitly states "No personal health information is ever collected."

---

## Error Tracking Integration

### Discovered: Error Tracking via PostHog -- Not in Prompt Checklist

Two additional PostHog integration points were found beyond what the prompt describes:

1. **error.tsx** (error boundary): Captures `$exception` events with `$exception_message`, `$exception_type: 'unhandled_error'`, `$exception_source: 'error_boundary'`, and `digest`. This is privacy-safe since error messages are application-generated, not user-generated.

2. **errorUtils.ts** (`logError()` function): Also captures `$exception` events with `$exception_message`, `$exception_type` (error code), `$exception_source` (component context), `status_code`, and `retryable` flag.

Both use dynamic `import('posthog-js')` with `.catch()` fallbacks, so PostHog unavailability never disrupts the user experience.

---

## Checklist Verification

### Setup
- [x] PostHogProvider created (`components/PostHogProvider.tsx`) -- confirmed, 59 lines
- [x] Provider in layout (`app/layout.tsx`) -- confirmed, wraps entire component tree at line 126
- [x] Environment variables in deploy.yml (`NEXT_PUBLIC_POSTHOG_KEY` as build arg) -- references confirmed in code
- [ ] Tracking verified working in PostHog dashboard -- cannot verify from code review

### Event Tracking
- [x] Search events -- privacy-preserving (boolean indicators only) -- confirmed in `trackSearch()`
- [x] Provider view events -- privacy-preserving (no NPI sent) -- confirmed in `trackProviderView()`
- [x] Verification submit events -- privacy-preserving (empty payload) -- confirmed in `trackVerificationSubmit()`
- [x] Verification vote events -- vote direction only -- confirmed in `trackVerificationVote()`
- [x] User identity functions ready for future accounts -- confirmed (`identifyUser`, `resetUser`)
- [x] Error events -- found in `errorUtils.ts` and `error.tsx` (not listed in prompt but implemented)
- [ ] Compare actions -- not currently tracked in `analytics.ts`
- [ ] Insurance card upload events -- not currently tracked in `analytics.ts`

### Privacy
- [x] No PII captured (only booleans and counts) -- confirmed across all 4 event functions
- [x] No healthcare data captured (specialties, plans stripped) -- confirmed, NPI/planId/name stripped from pageviews
- [x] `autocapture: false` explicitly set -- confirmed in PostHogProvider.tsx line 18
- [x] `opt_out_capturing_by_default: true` -- confirmed in PostHogProvider.tsx line 20
- [x] Cookie consent banner -- confirmed in `CookieConsent.tsx` with accept/decline
- [ ] Privacy policy updated to mention PostHog -- cannot verify from code
- [x] Opt-out mechanism -- decline button calls `posthog.opt_out_capturing()`

### Analysis
- [ ] Dashboard created -- cannot verify from code
- [ ] Key metrics defined -- not configured in code
- [ ] Funnels set up -- not configured in code
- [ ] Alerts configured -- not configured in code

---

## Configuration

| Setting | Value | Status |
|---------|-------|--------|
| `NEXT_PUBLIC_POSTHOG_KEY` | Required env var | Referenced in code |
| `NEXT_PUBLIC_POSTHOG_HOST` | Default: `https://us.i.posthog.com` | Set in PostHogProvider |
| `capture_pageview` | `false` (manual) | Correct for param sanitization |
| `capture_pageleave` | `true` (auto) | Enabled |
| `persistence` | `localStorage` | No third-party cookie issues |
| `autocapture` | `false` | No DOM auto-capture |
| `disable_session_recording` | `true` | No session replays |
| `opt_out_capturing_by_default` | `true` | GDPR-compliant default |

---

## Issues

1. **PostHog host default mismatch:** The prompt documentation says the default is `https://app.posthog.com`, but the actual code uses `https://us.i.posthog.com` (the newer US ingestion endpoint). The code is correct; the prompt documentation is outdated.

2. **No compare or insurance card upload tracking:** The prompt notes these as missing, and they remain unimplemented. If these features are actively used, adding boolean-only tracking would improve funnel analysis.

3. **Error tracking not documented in prompt:** The `$exception` events captured in `errorUtils.ts` and `error.tsx` are a valuable addition not reflected in the prompt's event table.

---

## Recommendations

1. **Add compare and insurance card upload events** to `analytics.ts` with the same boolean-only pattern. These are key user flows that currently have no visibility.

2. **Update the prompt documentation** to reflect the actual PostHog host default (`us.i.posthog.com`) and the error tracking integration.

3. **Create a PostHog dashboard** with the funnels described in the prompt (search funnel, verification funnel, comparison funnel) to start deriving value from the analytics data.

4. **Consider adding a `trackFeatureUsage()` generic function** for lightweight feature adoption tracking (e.g., dark mode toggle, saved providers) that follows the same boolean-only pattern.

5. **Privacy policy should be updated** to disclose PostHog usage, even though the implementation is privacy-preserving. Transparency builds user trust.
