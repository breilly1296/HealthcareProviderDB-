# PostHog Analytics

**Last Updated:** 2026-02-07
**Status:** Active (conditionally -- depends on `NEXT_PUBLIC_POSTHOG_KEY` being set and user consent)

## Configuration

- **PostHog Key:** Configured via `NEXT_PUBLIC_POSTHOG_KEY` GitHub secret, injected at Docker build time
- **PostHog Host:** `https://us.i.posthog.com` (default; overridable via `NEXT_PUBLIC_POSTHOG_HOST`)
- **SDK Version:** `posthog-js@^1.321.2`
- **Events tracked:** 6 custom event types (4 user actions + 2 page lifecycle)
- **Consent model:** Opt-out by default; requires explicit user acceptance

---

## Architecture Overview

PostHog integration follows a three-layer architecture:

1. **Provider Layer** -- `PostHogProvider.tsx` initializes the SDK and wraps the entire app
2. **Tracking Layer** -- `analytics.ts` defines typed, privacy-preserving event functions
3. **Consent Layer** -- `CookieConsent.tsx` manages user opt-in/opt-out via localStorage

### Component Hierarchy

```
<html>
  <body>
    <Suspense>
      <PostHogProvider>          <!-- SDK init + pageview tracking -->
        <QueryProvider>
          <ThemeProvider>
            <CompareProvider>
              <ErrorProvider>
                {children}
                <CookieConsent />  <!-- Consent banner -->
              </ErrorProvider>
            </CompareProvider>
          </ThemeProvider>
        </QueryProvider>
      </PostHogProvider>
    </Suspense>
  </body>
</html>
```

**Source:** `packages/frontend/src/app/layout.tsx` (lines 160--183)

---

## Provider Setup

**File:** `packages/frontend/src/components/PostHogProvider.tsx`

The provider component initializes PostHog with privacy-first defaults and handles manual pageview tracking with sensitive parameter sanitization.

### Initialization Configuration

```typescript
posthog.init(posthogKey, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
  capture_pageview: false,             // Manual capture with param sanitization
  capture_pageleave: true,             // Auto-capture page leave events
  persistence: 'localStorage',         // No cookies -- localStorage only
  autocapture: false,                  // No auto-captured clicks/forms
  disable_session_recording: true,     // No session replays
  opt_out_capturing_by_default: true,  // No tracking until user opts in
});
```

**Key design decisions:**

| Setting | Value | Rationale |
|---------|-------|-----------|
| `capture_pageview` | `false` | Manual capture allows stripping sensitive URL parameters (NPI, planId, name) before sending |
| `autocapture` | `false` | Prevents accidental capture of form data, click targets, or healthcare-related DOM content |
| `disable_session_recording` | `true` | Eliminates risk of recording sensitive healthcare information on screen |
| `opt_out_capturing_by_default` | `true` | No tracking occurs until user explicitly accepts the consent banner |
| `persistence` | `'localStorage'` | Avoids third-party cookie issues; stores anonymous visitor ID in localStorage only |

### Manual Pageview Tracking

The `PostHogPageview` component tracks route changes while sanitizing sensitive query parameters:

```typescript
function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname && typeof window !== 'undefined') {
      const sanitizedParams = new URLSearchParams(searchParams.toString());
      ['npi', 'planId', 'name'].forEach(key => sanitizedParams.delete(key));
      const query = sanitizedParams.toString();
      const url = window.origin + pathname + (query ? `?${query}` : '');
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}
```

**Sanitized parameters:** `npi`, `planId`, `name` -- these are stripped from the URL before the pageview event is sent to PostHog, ensuring no provider identifiers or plan references appear in analytics data.

---

## Event Tracking Library

**File:** `packages/frontend/src/lib/analytics.ts`

The analytics module defines six functions. Each accepts typed parameters with full event data but deliberately discards identifiable information before sending to PostHog. This "maximum utility, minimum data" approach means the TypeScript interfaces document what *could* be tracked, while the implementations ensure only aggregate/boolean data is actually sent.

### Function Inventory

| Function | Defined | Called From | Status |
|----------|---------|-------------|--------|
| `trackSearch` | `analytics.ts:50` | `useSearchExecution.ts:142` | Active |
| `trackProviderView` | `analytics.ts:70` | `ProviderDetailClient.tsx:79` | Active |
| `trackVerificationSubmit` | `analytics.ts:84` | `VerificationButton.tsx:92` | Active |
| `trackVerificationVote` | `analytics.ts:99` | *(not called anywhere)* | Defined but unused |
| `identifyUser` | `analytics.ts:112` | *(not called anywhere)* | Reserved for future accounts |
| `resetUser` | `analytics.ts:121` | *(not called anywhere)* | Reserved for future accounts |

### trackSearch

**Called from:** `packages/frontend/src/hooks/search/useSearchExecution.ts` (line 142)

Triggered after every successful search API response (including debounced auto-search and explicit button clicks).

```typescript
// What the function receives (full data):
trackSearch({
  specialty: currentFilters.specialty,
  state: currentFilters.state,
  city: currentFilters.city,
  cities: expandedCities.join(','),
  healthSystem: currentFilters.healthSystem,
  resultsCount: response.pagination.total,
  mode: 'providers',
});

// What PostHog actually receives (privacy-preserving):
posthog.capture('search', {
  has_specialty_filter: !!props.specialty,      // boolean
  has_state_filter: !!props.state,              // boolean
  has_city_filter: !!(props.city || props.cities), // boolean
  has_health_system_filter: !!props.healthSystem,  // boolean
  results_count: props.resultsCount,            // number
  has_results: props.resultsCount > 0,          // boolean
  mode: props.mode,                             // 'providers' | 'locations'
});
```

**Not sent:** The actual specialty name, state, city, or health system name.

### trackProviderView

**Called from:** `packages/frontend/src/components/provider-detail/ProviderDetailClient.tsx` (line 79)

Triggered via `useEffect` when provider data loads on the detail page.

```typescript
// What the function receives:
trackProviderView({
  npi,
  specialty: provider.taxonomyDescription || provider.specialtyCategory || undefined,
});

// What PostHog actually receives:
posthog.capture('provider_view', {
  has_specialty: !!props.specialty,  // boolean only
});
```

**Not sent:** NPI number, specialty name, or provider name.

### trackVerificationSubmit

**Called from:** `packages/frontend/src/components/VerificationButton.tsx` (line 92)

Triggered after a successful verification API submission.

```typescript
// What the function receives:
trackVerificationSubmit({
  npi,
  planId: planId.trim(),
  acceptsInsurance,
});

// What PostHog actually receives:
posthog.capture('verification_submit', {});  // Empty payload
```

**Not sent:** NPI, plan ID, or insurance acceptance status. The `_props` parameter is deliberately unused.

### trackVerificationVote

**Defined but not yet called** from any component. Reserved for the verification voting feature.

```typescript
// What PostHog would receive:
posthog.capture('verification_vote', {
  vote_type: props.voteType,  // 'up' | 'down'
});
```

**Not sent:** Verification ID or NPI.

---

## Events Summary

### Page Views
| Event | Properties | Trigger |
|-------|------------|---------|
| `$pageview` | `$current_url` (sanitized: npi, planId, name params stripped) | Every client-side route change via `PostHogPageview` component |
| `$pageleave` | *(auto-captured by PostHog SDK)* | User navigates away; enabled via `capture_pageleave: true` |

### User Actions (Privacy-Preserving)
| Event | Properties Sent | Properties NOT Sent | Purpose |
|-------|----------------|---------------------|---------|
| `search` | `has_specialty_filter`, `has_state_filter`, `has_city_filter`, `has_health_system_filter`, `results_count`, `has_results`, `mode` | specialty, state, city, healthSystem | Search pattern analysis without knowing WHAT was searched |
| `provider_view` | `has_specialty` | npi, specialty, provider_name | Provider detail engagement without identifying WHICH provider |
| `verification_submit` | *(empty object)* | npi, plan_id, accepts_insurance | Only that a verification occurred |
| `verification_vote` | `vote_type` | verification_id, npi | Vote direction only (not yet wired up) |

---

## User Consent System

**File:** `packages/frontend/src/components/CookieConsent.tsx`

### How It Works

1. **First visit:** After a 500ms delay (to avoid blocking initial render), a sliding banner appears at the bottom of the viewport
2. **Accept:** Calls `posthog.opt_in_capturing()` and stores `'accepted'` in localStorage under key `vmp-analytics-consent`
3. **Decline:** Calls `posthog.opt_out_capturing()` and stores `'declined'` in localStorage
4. **Return visit:** On page load, if consent was previously `'accepted'`, the component calls `posthog.opt_in_capturing()` to re-enable tracking; if `'declined'`, no action is taken (PostHog defaults to opted-out)

### Consent Banner UI

The banner displays:
> "We use privacy-preserving analytics to improve your experience. No personal health information is ever collected."

With two buttons: **Decline** (muted style) and **Accept** (primary blue).

**Positioning:** `bottom-20` on mobile (above bottom nav), `bottom-4` on desktop. Max width `2xl`, centered with rounded shadow.

### Implementation Details

```typescript
const CONSENT_KEY = 'vmp-analytics-consent';

// On mount:
const stored = localStorage.getItem(CONSENT_KEY);
if (!stored) {
  // Show banner after 500ms
} else if (stored === 'accepted') {
  posthog.opt_in_capturing();  // Re-enable on return visits
}

// Accept handler:
posthog.opt_in_capturing();
localStorage.setItem(CONSENT_KEY, 'accepted');

// Decline handler:
posthog.opt_out_capturing();
localStorage.setItem(CONSENT_KEY, 'declined');
```

---

## Environment Variables & Deployment

### Environment Variables

| Variable | Required | Default | Where Set |
|----------|----------|---------|-----------|
| `NEXT_PUBLIC_POSTHOG_KEY` | Yes (for analytics to work) | *(none -- SDK skips init if missing)* | GitHub Secrets, passed as Docker build arg |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | `https://us.i.posthog.com` | `.env.example` |

### Local Development

In `.env.example`:
```
NEXT_PUBLIC_POSTHOG_KEY=
```

The key is intentionally left empty in the example file. If not set, the PostHog SDK silently skips initialization (guarded by `if (posthogKey)` check).

### Production Deployment

**File:** `.github/workflows/deploy.yml` (line 175)

The PostHog key is injected at Docker build time as a build argument:

```yaml
- name: Build and push Frontend Docker image
  uses: docker/build-push-action@v6
  with:
    build-args: |
      NEXT_PUBLIC_API_URL=${{ needs.deploy-backend.outputs.backend_url }}/api/v1
      NEXT_PUBLIC_POSTHOG_KEY=${{ secrets.NEXT_PUBLIC_POSTHOG_KEY }}
```

**File:** `packages/frontend/Dockerfile` (lines 33--34)

```dockerfile
ARG NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY}
```

The same pattern is used in `deploy-staging.yml` (line 175), meaning both staging and production can have PostHog enabled (potentially with different keys via separate GitHub secrets).

---

## Privacy Policy Integration

**File:** `packages/frontend/src/app/privacy/page.tsx`

The privacy policy page (updated February 2026) contains a dedicated **Section 5: Analytics** that comprehensively documents the PostHog integration, including:

- What is tracked (page views, search events, verification submissions, vote events)
- What is NOT tracked (provider names, NPI numbers, plan details, search terms, IP addresses)
- Technical safeguards (autocapture disabled, session recording disabled, opt-out by default)

The page also references PostHog in:
- **Section 1** (Information collected automatically) -- browser/device info, usage patterns
- **Section 6** (Cookies & Local Storage) -- PostHog's localStorage identifier
- **Section 7** (Third-Party Services) -- PostHog listed with link to their privacy policy
- **Section 8** (Data Retention) -- analytics data retained per PostHog's policies
- **Section 9** (Your Rights) -- opt-out instructions

---

## Privacy Analysis

### What IS Tracked (Boolean/Aggregate Only)

- Whether search filters were used (boolean: `has_specialty_filter`, not the actual specialty)
- Result counts (number, not what was returned)
- Search mode (`'providers'` or `'locations'`)
- That a provider detail page was viewed (not which provider)
- That a verification was submitted (no details about which provider/plan)
- Vote direction (up/down, not which verification)
- Page URLs with sensitive parameters stripped
- Page leave events (auto-captured by SDK)

### What is NOT Tracked

- Provider NPIs, names, or specialties
- Search filter values (state, city, specialty names, health system names)
- Insurance plan details (plan IDs, plan names, acceptance status)
- Verification details (which provider, which plan, what was the result)
- Personal information (names, emails, IP addresses)
- Health information of any kind
- Session recordings or replays
- Click positions, form inputs, or DOM elements (autocapture is off)

### SSR Safety

All tracking functions include a `typeof window === 'undefined'` guard to prevent execution during server-side rendering:

```typescript
export function trackSearch(props: SearchEventProps) {
  if (typeof window === 'undefined') return;
  // ...
}
```

---

## Checklist

### Setup
- [x] PostHogProvider created (`packages/frontend/src/components/PostHogProvider.tsx`)
- [x] Provider integrated in root layout (`packages/frontend/src/app/layout.tsx`, line 161)
- [x] Environment variables in `deploy.yml` (`NEXT_PUBLIC_POSTHOG_KEY` as Docker build arg)
- [x] Environment variables in `deploy-staging.yml` (same pattern)
- [x] Dockerfile accepts `NEXT_PUBLIC_POSTHOG_KEY` as build arg
- [x] `.env.example` documents the variable
- [ ] Tracking verified working in PostHog dashboard

### Event Tracking
- [x] Search events -- privacy-preserving, called from `useSearchExecution.ts`
- [x] Provider view events -- privacy-preserving, called from `ProviderDetailClient.tsx`
- [x] Verification submit events -- privacy-preserving, called from `VerificationButton.tsx`
- [x] Verification vote function defined -- but NOT yet called from any component
- [x] User identity functions ready for future accounts (`identifyUser`, `resetUser`)
- [ ] Compare actions -- not tracked in `analytics.ts`
- [ ] Error events -- not tracked in `analytics.ts`
- [ ] Insurance card upload events -- not tracked in `analytics.ts`

### Privacy & Consent
- [x] No PII captured (only booleans and counts)
- [x] No healthcare data captured (specialties, plans stripped)
- [x] `autocapture: false` explicitly set in PostHogProvider
- [x] `disable_session_recording: true` explicitly set
- [x] `opt_out_capturing_by_default: true` -- no tracking until user opts in
- [x] Cookie consent banner (`CookieConsent.tsx`) with accept/decline buttons
- [x] Opt-out mechanism via CookieConsent decline button
- [x] Privacy policy updated to mention PostHog (Section 5: Analytics)
- [x] Privacy policy links to PostHog's own privacy policy
- [x] URL parameter sanitization (npi, planId, name stripped from pageview URLs)
- [x] SSR guards on all tracking functions

### Analysis & Dashboards
- [ ] PostHog dashboard created
- [ ] Key metrics defined (DAU, search conversion, verification rate)
- [ ] Funnels set up (Search, Verification, Comparison)
- [ ] Alerts configured

---

## Key Metrics (Recommended)

Once the PostHog dashboard is created, the following metrics can be tracked with the current event data:

| Metric | How to Calculate |
|--------|-----------------|
| Daily active users | Unique visitors per day |
| Search volume | Count of `search` events |
| Search success rate | `search` events where `has_results = true` / total `search` events |
| Filter usage | Percentage of searches with each filter type |
| Provider view rate | `provider_view` events / `search` events with results |
| Verification rate | `verification_submit` events / `provider_view` events |
| Consent acceptance rate | Users who accepted / total unique visitors |

### Recommended Funnels

1. **Search Funnel:** `$pageview` (home) -> `search` -> `provider_view`
2. **Verification Funnel:** `provider_view` -> `verification_submit`
3. **Engagement Funnel:** `$pageview` (any) -> `search` -> `provider_view` -> `verification_submit`

---

## Issues

1. **`trackVerificationVote` is defined but never called.** The function exists in `analytics.ts` but no component invokes it. If there is a voting UI, it should call this function on vote submission. If the voting feature is not yet implemented, this is expected.

2. **`trackSearch` is not called from the search page directly.** Instead, it is called from the `useSearchExecution` hook (line 142), which is correct because all search paths (auto-search, manual search, pagination) flow through that hook. However, the `ProviderVerificationForm.tsx` component does NOT call `trackVerificationSubmit` -- only the simpler `VerificationButton.tsx` does. If the multi-step verification form at `ProviderVerificationForm.tsx` is used in production, its submissions are not tracked by analytics.

3. **No error tracking.** Failed API calls, failed verifications, and client-side errors are not sent to PostHog. Adding an `error` event type could help identify reliability issues.

4. **Local `.env.local` does not have PostHog key set.** The local development environment has no `NEXT_PUBLIC_POSTHOG_KEY` configured, which means analytics are completely disabled during local development. This is reasonable but means analytics code paths are not tested locally.

5. **Same PostHog key for staging and production.** Both `deploy.yml` and `deploy-staging.yml` reference `${{ secrets.NEXT_PUBLIC_POSTHOG_KEY }}`, meaning staging and production may share the same PostHog project unless separate secrets are configured. Consider using a separate staging PostHog project to avoid polluting production analytics data.

---

## Recommendations

1. **Wire up `trackVerificationVote`.** Find the component that handles verification voting and call `trackVerificationVote({ verificationId, voteType })` on vote submission.

2. **Add analytics to `ProviderVerificationForm.tsx`.** The multi-step verification form (used on the provider detail page) does not call any analytics functions. Import and call `trackVerificationSubmit` after successful submission at line 122 of `ProviderVerificationForm.tsx`.

3. **Add error event tracking.** Define a `trackError` function in `analytics.ts` that sends a privacy-preserving error event (e.g., error type, page path) to help identify broken flows.

4. **Add compare action tracking.** The comparison feature (CompareContext, CompareBar, CompareModal) is not instrumented. Consider tracking `compare_add`, `compare_remove`, and `compare_view` events.

5. **Add insurance card upload tracking.** The insurance card scanning feature (`InsuranceCardUploader.tsx`) is not instrumented. A `card_scan` event (with only success/failure boolean) would help measure feature adoption.

6. **Separate staging PostHog project.** Use a distinct `NEXT_PUBLIC_POSTHOG_KEY_STAGING` secret in `deploy-staging.yml` to keep staging analytics separate from production data.

7. **Verify PostHog dashboard exists.** Confirm that the PostHog project has been created, the key is valid, and events are appearing. Without dashboard verification, the analytics infrastructure may be deployed but non-functional.

8. **Consider PostHog feature flags.** The SDK is already initialized and could support feature flags for A/B testing or gradual rollouts without adding additional dependencies.

---

## File Reference

| File | Purpose |
|------|---------|
| `packages/frontend/src/components/PostHogProvider.tsx` | SDK initialization, manual pageview tracking with URL sanitization |
| `packages/frontend/src/lib/analytics.ts` | Privacy-preserving event tracking functions (6 functions) |
| `packages/frontend/src/components/CookieConsent.tsx` | User consent banner with opt-in/opt-out via localStorage |
| `packages/frontend/src/app/layout.tsx` | Root layout integrating PostHogProvider and CookieConsent |
| `packages/frontend/src/hooks/search/useSearchExecution.ts` | Calls `trackSearch` after search API responses |
| `packages/frontend/src/components/provider-detail/ProviderDetailClient.tsx` | Calls `trackProviderView` when provider data loads |
| `packages/frontend/src/components/VerificationButton.tsx` | Calls `trackVerificationSubmit` after successful verification API call |
| `packages/frontend/src/app/privacy/page.tsx` | Privacy policy with Section 5 documenting PostHog usage |
| `packages/frontend/package.json` | `posthog-js@^1.321.2` dependency |
| `packages/frontend/Dockerfile` | Accepts `NEXT_PUBLIC_POSTHOG_KEY` as build arg |
| `packages/frontend/.env.example` | Documents `NEXT_PUBLIC_POSTHOG_KEY` variable |
| `.github/workflows/deploy.yml` | Injects PostHog key from GitHub Secrets at build time |
| `.github/workflows/deploy-staging.yml` | Same PostHog key injection for staging |
