---
tags:
  - analytics
  - posthog
  - frontend
type: prompt
priority: 3
---

# PostHog Analytics Integration

## Files to Review
- `packages/frontend/src/components/PostHogProvider.tsx` (provider setup)
- `packages/frontend/src/lib/analytics.ts` (event tracking)
- `packages/frontend/src/app/layout.tsx` (provider integration)

## PostHog Overview

PostHog is used for product analytics to understand user behavior and improve the product.

### Why PostHog
- Open source option
- Self-hostable (privacy)
- Feature flags (future)
- Session recordings (future)
- Generous free tier

## Implementation

### Provider Setup

```typescript
// packages/frontend/src/components/PostHogProvider.tsx
'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    capture_pageview: false, // We capture manually
    capture_pageleave: true,
  });
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
```

### Event Tracking (Privacy-Preserving)

The actual implementation in `analytics.ts` is **deliberately privacy-preserving** — it sends only boolean indicators, NOT actual search values or provider identifiers.

```typescript
// packages/frontend/src/lib/analytics.ts — ACTUAL implementation
// Privacy: Only sends boolean indicators, not actual values

export function trackSearch(props: SearchEventProps) {
  posthog.capture('search', {
    has_specialty_filter: !!props.specialty,
    has_state_filter: !!props.state,
    has_city_filter: !!(props.city || props.cities),
    has_health_system_filter: !!props.healthSystem,
    results_count: props.resultsCount,
    has_results: props.resultsCount > 0,
    mode: props.mode,
    // NOT sending: specialty, state, city, cities, healthSystem
  });
}

export function trackProviderView(props: ProviderViewEventProps) {
  posthog.capture('provider_view', {
    has_specialty: !!props.specialty,
    // NOT sending: npi, specialty, provider_name
  });
}

export function trackVerificationSubmit(_props: VerificationSubmitEventProps) {
  // _props intentionally unused — only tracks that a submission occurred
  posthog.capture('verification_submit', {});
}

export function trackVerificationVote(props: VerificationVoteEventProps) {
  posthog.capture('verification_vote', {
    vote_type: props.voteType,
    // NOT sending: verification_id, npi
  });
}
```

Also provides `identifyUser()` and `resetUser()` for future account integration.

## Events Tracked

### Page Views
| Event | Properties |
|-------|------------|
| `$pageleave` | (auto-captured via `capture_pageleave: true`) |

**Note:** `capture_pageview` is set to `false` — page views are NOT auto-captured.

### User Actions (Privacy-Preserving)
| Event | Properties Sent | Properties NOT Sent | Purpose |
|-------|----------------|---------------------|---------|
| `search` | has_specialty_filter, has_state_filter, has_city_filter, has_health_system_filter, results_count, has_results, mode | specialty, state, city, healthSystem | Search pattern analysis without knowing WHAT was searched |
| `provider_view` | has_specialty | npi, specialty, provider_name | Provider detail engagement without identifying WHICH provider |
| `verification_submit` | *(empty)* | npi, plan_id, accepts_insurance | Only that a verification occurred |
| `verification_vote` | vote_type | verification_id, npi | Vote direction only |

## Configuration

### Environment Variables
| Variable | Required | Default |
|----------|----------|---------|
| `NEXT_PUBLIC_POSTHOG_KEY` | Yes | - |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | https://app.posthog.com |

### Privacy Settings
```typescript
posthog.init(key, {
  autocapture: false,      // Don't auto-capture clicks
  capture_pageview: false, // Manual pageview tracking
  persistence: 'localStorage', // or 'cookie'
  disable_session_recording: true, // No session replays (for now)
});
```

## Privacy Considerations

### What IS Tracked (Boolean/Aggregate Only)
- Whether search filters were used (boolean: `has_specialty_filter`, not the actual specialty)
- Result counts (number, not what was returned)
- That a verification was submitted (no details about which provider/plan)
- Vote direction (up/down, not which verification)
- Page leave events (auto-captured)

### What is NOT Tracked
- Provider NPIs, names, specialties
- Search filter values (state, city, specialty names)
- Insurance plan details
- Verification acceptance status
- Personal information (names, emails, IPs)
- Health information of any kind

### Design Philosophy
The analytics implementation follows a "maximum utility, minimum data" approach. Functions accept full event data (NPI, plan ID, etc.) as typed parameters but deliberately discard identifiable information before sending to PostHog. This means the type signatures serve as documentation of what COULD be tracked, while the implementation ensures only aggregate/boolean data is actually sent.

### User Consent
- [ ] Cookie consent banner
- [ ] Opt-out mechanism
- [ ] Privacy policy updated

## Dashboard & Insights

### Key Metrics
- Daily active users
- Search conversion rate
- Verification rate
- Popular searches
- Error rate

### Funnels to Build
1. **Search Funnel:**
   Home → Search → Results → Provider Detail

2. **Verification Funnel:**
   Provider Detail → Start Verification → Submit

3. **Comparison Funnel:**
   Search → Add to Compare → View Comparison

## Checklist

### Setup
- [x] PostHogProvider created (`components/PostHogProvider.tsx`)
- [x] Provider in layout (`app/layout.tsx`)
- [x] Environment variables in deploy.yml (`NEXT_PUBLIC_POSTHOG_KEY` as build arg)
- [ ] Tracking verified working in PostHog dashboard

### Event Tracking
- [x] Search events — privacy-preserving (boolean indicators only)
- [x] Provider view events — privacy-preserving (no NPI sent)
- [x] Verification submit events — privacy-preserving (empty payload)
- [x] Verification vote events — vote direction only
- [x] User identity functions ready for future accounts (`identifyUser`, `resetUser`)
- [ ] Compare actions — not currently tracked in `analytics.ts`
- [ ] Error events — not currently tracked in `analytics.ts`
- [ ] Insurance card upload events — not currently tracked in `analytics.ts`

### Privacy
- [x] No PII captured (only booleans and counts)
- [x] No healthcare data captured (specialties, plans stripped)
- [x] `autocapture` not explicitly disabled in PostHogProvider (consider adding)
- [ ] Cookie consent banner
- [ ] Privacy policy updated to mention PostHog
- [ ] Opt-out mechanism

### Analysis
- [ ] Dashboard created
- [ ] Key metrics defined
- [ ] Funnels set up
- [ ] Alerts configured

## Questions to Ask

1. **Is PostHog currently active?**
   - Environment variables set?
   - Events appearing in dashboard?

2. **What insights are most valuable?**
   - Search patterns?
   - Feature adoption?
   - Error rates?

3. **Should we enable session recordings?**
   - Helpful for debugging UX issues
   - Privacy implications

4. **Should we add feature flags?**
   - A/B testing
   - Gradual rollouts

5. **Is there a user consent mechanism?**
   - GDPR compliance
   - Cookie banner

## Output Format

```markdown
# PostHog Analytics

**Last Updated:** [Date]
**Status:** [Active/Inactive]

## Configuration
- PostHog Key: [Configured/Not Configured]
- Events tracked: X types

## Key Metrics (Last 7 Days)
| Metric | Value |
|--------|-------|
| Page views | X |
| Unique users | X |
| Searches | X |
| Verifications | X |

## Top Events
1. [Event] - X occurrences
2. [Event] - X occurrences

## Issues
[List any issues]

## Recommendations
[List recommendations]
```
