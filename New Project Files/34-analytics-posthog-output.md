# PostHog Analytics

**Last Updated:** 2026-04-16
**Status:** Active (privacy-preserving, opt-in)

## Configuration

| Setting | Value | Evidence |
|---------|-------|----------|
| PostHog key | `NEXT_PUBLIC_POSTHOG_KEY` (env) | `packages/frontend/src/components/PostHogProvider.tsx:10-12` |
| API host | `NEXT_PUBLIC_POSTHOG_HOST` or `https://us.i.posthog.com` | `PostHogProvider.tsx:14` |
| `autocapture` | `false` | `PostHogProvider.tsx:18` |
| `capture_pageview` | `false` (manual) | `PostHogProvider.tsx:15` |
| `capture_pageleave` | `true` | `PostHogProvider.tsx:16` |
| `persistence` | `'localStorage'` | `PostHogProvider.tsx:17` |
| `disable_session_recording` | `true` | `PostHogProvider.tsx:19` |
| `opt_out_capturing_by_default` | `true` | `PostHogProvider.tsx:20` |
| Provider wired in layout | Yes | `packages/frontend/src/app/layout.tsx:126-151` |
| Cookie consent banner | Yes | `packages/frontend/src/components/CookieConsent.tsx` |
| Events tracked | 4 custom + `$pageview` | `lib/analytics.ts:50-107` |

## Event Taxonomy

| Event | Payload sent | NOT sent | Evidence |
|-------|--------------|----------|----------|
| `$pageview` | `$current_url` with `npi,planId,name` params stripped | raw npi/plan/name | `PostHogProvider.tsx:32-41` |
| `$pageleave` | auto | — | `PostHogProvider.tsx:16` |
| `search` | `has_specialty_filter`, `has_state_filter`, `has_city_filter`, `has_health_system_filter`, `results_count`, `has_results`, `mode` | specialty, state, city, cities, healthSystem | `lib/analytics.ts:50-64` |
| `provider_view` | `has_specialty` | npi, specialty, provider_name | `lib/analytics.ts:70-78` |
| `verification_submit` | (empty) | npi, plan_id, accepts_insurance | `lib/analytics.ts:84-93` |
| `verification_vote` | `vote_type` | verification_id, npi | `lib/analytics.ts:99-107` |

Typed event prop interfaces accept full identifiers as documentation; the implementations deliberately strip them before calling `posthog.capture()`.

## Consent Flow (`CookieConsent.tsx`)

- Reads `vmp-analytics-consent` from `localStorage`; shows banner 500ms after mount if missing (`CookieConsent.tsx:6-25`).
- Accept -> `posthog.opt_in_capturing()` + localStorage `accepted` (`:29-33`).
- Decline -> `posthog.opt_out_capturing()` + localStorage `declined` (`:35-39`).
- Previously accepted users are re-opted-in on mount (`:21-23`).
- Banner: `role="alert"`, `aria-live="polite"`, responsive layout, z-50 (`:42-77`).

## Key Callers

| Event | Invoked From |
|-------|--------------|
| `trackSearch` | `hooks/search/useSearchExecution.ts:9` (imports), called after search resolves |
| `trackProviderView` | `components/provider-detail/ProviderDetailClient.tsx:9, 72-79` |
| `trackVerificationSubmit` / `trackVerificationVote` | referenced by verification UI (not inlined here) |

## Issues Found

- MEDIUM
  - `NEXT_PUBLIC_POSTHOG_HOST` default in `PostHogProvider.tsx:14` is `https://us.i.posthog.com`, but prompt documentation says `https://app.posthog.com`. Documentation drift.
  - Compare/insurance-card/error events are not tracked (`analytics.ts` has no helpers for these). Prompt's checklist already flags the gap.
  - `opt_out_capturing_by_default: true` is correct for pre-consent, but pageview listener at `PostHogProvider.tsx:32-41` still calls `posthog.capture('$pageview')` unconditionally. PostHog itself filters opted-out events; verify capture is suppressed before consent (PostHog JS does respect opt-out, but an early localStorage read would avoid the call entirely).
- LOW
  - Privacy policy copy not updated to mention PostHog — last unchecked item in prompt's Privacy section. No `/app/privacy/page.tsx` mention of PostHog observed.
  - No server-side event funnel is defined in code; analytics dashboards/funnels are PostHog-project-side and not reproducible from repo.
  - `identifyUser` / `resetUser` exported (`analytics.ts:112-125`) but not wired to `AuthContext`, so logged-in users are anonymous across sessions. When auth goes live, call `identifyUser(user.id)` on login and `resetUser()` on logout.

## Checklist Verification

### Setup
- [x] `PostHogProvider` created — `components/PostHogProvider.tsx:49`
- [x] Provider in layout — `app/layout.tsx:126, 151`
- [x] `NEXT_PUBLIC_POSTHOG_KEY` wired — read at `PostHogProvider.tsx:10`
- [ ] Tracking verified in PostHog dashboard — external verification; not evidenced in repo

### Event Tracking
- [x] Search events, boolean-only — `analytics.ts:50-64`
- [x] Provider view events, no NPI — `analytics.ts:70-78`
- [x] Verification submit, empty payload — `analytics.ts:84-93`
- [x] Vote direction only — `analytics.ts:99-107`
- [x] `identifyUser` / `resetUser` exported — `analytics.ts:112, 121`
- [ ] Compare actions — not tracked (no helper in `analytics.ts`)
- [ ] Error events — not tracked
- [ ] Insurance card upload events — not tracked (frontend route nor `InsuranceCardUploader.tsx` call `posthog.capture`)

### Privacy
- [x] No PII captured — verified via `analytics.ts` payload review
- [x] No healthcare data captured — specialty/plan names omitted
- [x] `autocapture: false` — `PostHogProvider.tsx:18`
- [x] `opt_out_capturing_by_default: true` — `:20`
- [x] Cookie consent banner — `CookieConsent.tsx:41-77`
- [ ] Privacy policy mentions PostHog — not evidenced
- [x] Opt-out mechanism — `CookieConsent.tsx:35-39` calls `posthog.opt_out_capturing()`

### Analysis
- [ ] Dashboard — not in repo
- [ ] Key metrics defined — not in repo
- [ ] Funnels set up — not in repo
- [ ] Alerts configured — not in repo

## Recommendations (ranked)

1. Update `/app/privacy/page.tsx` to disclose PostHog, list fields captured (aggregate only), and link to the cookie banner — closes the one remaining unchecked privacy item.
2. Wire `identifyUser(user.id)` on sign-in (inside `AuthContext` post-magic-link) and `resetUser()` on logout. Without this, returning users are re-anonymized every visit.
3. Add `trackCompareOpen`, `trackCompareAdd`, `trackInsuranceScan` helpers (boolean-only) to close the prompt's unchecked event rows. Emit from `CompareModal.tsx`, `CompareCheckbox.tsx`, `InsuranceCardUploader.handleExtract`.
4. Gate the `posthog.capture('$pageview')` call on consent state (localStorage key) to avoid even the outbound request before opt-in. PostHog's opt-out flag already suppresses transmission, but this is belt-and-suspenders.
5. Document a funnel set in `docs/` (Search -> Results -> Provider Detail -> Verification) as PostHog Insight definitions so the "funnels" checklist becomes verifiable.

## Open Questions

1. Is PostHog actively receiving events in production? No indicator in repo; needs dashboard screenshot.
2. Should session recordings be enabled (currently `disable_session_recording: true`) for UX debugging, with consent gating?
3. Should we adopt PostHog Feature Flags for A/B tests (e.g., new search layout)?
4. Is the cookie consent UX GDPR-compliant in EU? The banner currently doesn't distinguish "necessary" vs "analytics" tiers — single accept/decline.
5. Should we identify authenticated users by pseudonymous hash (not email) to keep PostHog profile free of direct PII?
