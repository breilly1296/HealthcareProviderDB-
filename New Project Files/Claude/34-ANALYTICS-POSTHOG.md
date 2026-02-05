# PostHog Analytics Integration -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/34-analytics-posthog.md
**Status:** Partially Implemented -- Core privacy-preserving tracking is solid, but event wiring and consent controls are incomplete

---

## Findings

### Setup
- [x] **PostHogProvider created** (`packages/frontend/src/components/PostHogProvider.tsx`) -- Verified. Initializes `posthog-js` client-side only (guarded by `typeof window !== 'undefined'`), wraps children with `PHProvider`, and includes a `PostHogPageview` component for manual pageview tracking on route changes.
- [x] **Provider in layout** (`packages/frontend/src/app/layout.tsx`) -- Verified at line 160. `<PostHogProvider>` wraps all application content inside a `<Suspense>` boundary. This is the correct Next.js App Router pattern.
- [x] **Environment variables in deploy.yml** -- Verified. `.github/workflows/deploy.yml` line 119 passes `NEXT_PUBLIC_POSTHOG_KEY` as a Docker build arg from GitHub Secrets.
- [ ] **Tracking verified working in PostHog dashboard** -- Cannot verify from code alone. Requires manual confirmation.

### Event Tracking
- [x] **Search events -- privacy-preserving** -- Verified in `analytics.ts` lines 50-64. Sends only `has_specialty_filter`, `has_state_filter`, `has_city_filter`, `has_health_system_filter`, `results_count`, `has_results`, `mode`. Does NOT send actual filter values.
- [x] **Provider view events -- privacy-preserving** -- Verified in `analytics.ts` lines 70-78. Sends only `has_specialty`. Does NOT send `npi`, `specialty`, or `provider_name`.
- [x] **Verification submit events -- privacy-preserving** -- Verified in `analytics.ts` lines 84-93. Sends empty payload `{}`. The `_props` parameter is intentionally unused. Only tracks that a submission occurred.
- [x] **Verification vote events -- vote direction only** -- Verified in `analytics.ts` lines 99-107. Sends only `vote_type` ('up'/'down'). Does NOT send `verification_id` or `npi`.
- [x] **User identity functions ready** -- Verified. `identifyUser()` and `resetUser()` are defined (lines 112-125) for future account integration.
- [ ] **Compare actions** -- Not tracked in `analytics.ts`.
- [ ] **Error events** -- Not tracked in `analytics.ts`.
- [ ] **Insurance card upload events** -- Not tracked in `analytics.ts`.

### Privacy
- [x] **No PII captured** -- Verified. All four event functions strip identifiable data before sending to PostHog. Type signatures accept full data but implementations discard sensitive fields.
- [x] **No healthcare data captured** -- Verified. Specialties, plan details, and NPI numbers are never sent.
- [x] **Pageview tracking is manual** -- `capture_pageview: false` is set in the PostHog init config (PostHogProvider.tsx line 15). A `PostHogPageview` component manually captures `$pageview` events on route changes.

#### Discrepancies Between Prompt and Actual Code

| Setting | Prompt Says | Actual Code |
|---------|-------------|-------------|
| `api_host` | `https://app.posthog.com` | `https://us.i.posthog.com` |
| `autocapture` | Listed under "Privacy Settings" as `false` (checklist says "not explicitly disabled") | **`true`** (line 18) |
| `disable_session_recording` | `true` | Not set at all |
| `persistence` | `'localStorage'` | `'localStorage'` (matches) |
| Pageview tracking | Only `$pageleave` auto-captured | PostHogPageview component ALSO manually captures `$pageview` on every route change, including search params in the URL |

- [!] **`autocapture: true` is a privacy concern** -- With `autocapture` enabled, PostHog automatically captures click events, form submissions, and other DOM interactions. This could inadvertently capture sensitive text content (e.g., provider names, NPI numbers displayed in UI elements). The prompt's checklist acknowledges this is "not explicitly disabled" but the actual code actively enables it.

- [!] **PostHogPageview sends full URL including search params** -- Lines 32-36 of PostHogProvider.tsx construct `$current_url` from `pathname + searchParams.toString()`. If search parameters contain provider-identifying information (e.g., `?npi=1234567890&specialty=Cardiology`), these get sent to PostHog as part of the pageview event, undermining the privacy-preserving design of the custom event functions.

- [ ] **Cookie consent banner** -- Not implemented. No consent banner component found anywhere in `packages/frontend/src`.
- [ ] **Privacy policy updated to mention PostHog** -- Cannot verify from code; requires reviewing the privacy policy page content.
- [ ] **Opt-out mechanism** -- Not implemented.

### Actual Usage in Components
- **`trackVerificationSubmit`** -- Used in `VerificationButton.tsx` (line 5 import, line 90 call).
- **`trackSearch`** -- Defined but NOT imported/used by any component.
- **`trackProviderView`** -- Defined but NOT imported/used by any component.
- **`trackVerificationVote`** -- Defined but NOT imported/used by any component.

### Analysis
- [ ] Dashboard created -- Cannot verify.
- [ ] Key metrics defined -- Cannot verify.
- [ ] Funnels set up -- Cannot verify.
- [ ] Alerts configured -- Cannot verify.

---

## Summary

The PostHog analytics implementation demonstrates a thoughtful privacy-preserving design at the `analytics.ts` level -- functions accept full event data as typed parameters but deliberately strip all identifiable information before sending to PostHog. However, this careful approach is partially undermined by two issues in `PostHogProvider.tsx`: (1) `autocapture: true` allows PostHog to automatically capture DOM interactions which may contain sensitive content, and (2) the `PostHogPageview` component sends the full URL including search parameters to PostHog, potentially leaking provider/plan identifiers.

Only 1 of 4 tracking functions (`trackVerificationSubmit`) is actually wired into a component. The other three (`trackSearch`, `trackProviderView`, `trackVerificationVote`) are defined but never called, meaning most of the designed event tracking is not yet operational.

No user consent mechanism (cookie banner, opt-out) exists, which is a compliance concern for GDPR and potentially other privacy regulations.

---

## Recommendations

1. **Set `autocapture: false`** in `PostHogProvider.tsx` to prevent PostHog from automatically capturing click events that may contain sensitive healthcare information displayed in the UI.
2. **Sanitize URLs in PostHogPageview** -- Either strip query parameters before sending `$pageview` events, or ensure search parameters never contain PII/PHI. Currently, search params are included verbatim.
3. **Wire up the remaining tracking functions** -- `trackSearch`, `trackProviderView`, and `trackVerificationVote` are defined but not called from any component. Integrate them into the relevant search results page, provider detail page, and vote button components.
4. **Implement a cookie consent banner** -- Required for GDPR compliance. Conditionally initialize PostHog only after user consent is obtained.
5. **Add an opt-out mechanism** -- PostHog supports `posthog.opt_out_capturing()`. Expose this to users via a privacy settings UI.
6. **Set `disable_session_recording: true`** explicitly in the PostHog config to prevent accidental enablement if session recording is turned on in the PostHog project settings.
7. **Update the privacy policy** to disclose the use of PostHog analytics, what data is collected, and how users can opt out.
