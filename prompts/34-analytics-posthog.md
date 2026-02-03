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

### Event Tracking

```typescript
// packages/frontend/src/lib/analytics.ts
import posthog from 'posthog-js';

// Track page views
export function trackPageView(path: string) {
  posthog.capture('$pageview', { path });
}

// Track search events
export function trackSearch(params: {
  state?: string;
  city?: string;
  specialty?: string;
  resultCount: number;
}) {
  posthog.capture('provider_search', params);
}

// Track provider views
export function trackProviderView(npi: string, name: string) {
  posthog.capture('provider_view', { npi, name });
}

// Track verification submissions
export function trackVerification(npi: string, accepted: boolean) {
  posthog.capture('verification_submit', { npi, accepted });
}

// Track comparison actions
export function trackCompare(action: 'add' | 'remove' | 'view', count: number) {
  posthog.capture('compare_action', { action, count });
}
```

## Events Tracked

### Page Views
| Event | Properties |
|-------|------------|
| `$pageview` | path |
| `$pageleave` | path, duration |

### User Actions
| Event | Properties | Purpose |
|-------|------------|---------|
| `provider_search` | state, city, specialty, resultCount | Understand search patterns |
| `provider_view` | npi, name | Popular providers |
| `verification_submit` | npi, accepted | Verification engagement |
| `compare_action` | action, count | Comparison feature usage |
| `filter_change` | filter, value | Filter preferences |
| `insurance_card_upload` | success | OCR feature usage |

### Errors
| Event | Properties |
|-------|------------|
| `api_error` | endpoint, status, message |
| `search_no_results` | filters |

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

### What IS Tracked
- Page views
- Search queries (no results, just params)
- Feature usage (verification, compare)
- Error events

### What is NOT Tracked
- Personal information (names, emails)
- Health information
- Insurance details
- Provider-specific data beyond NPI

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
- [x] PostHogProvider created
- [x] Provider in layout
- [ ] Environment variables configured
- [ ] Tracking verified working

### Event Tracking
- [ ] Page views
- [ ] Search events
- [ ] Provider views
- [ ] Verification submissions
- [ ] Compare actions
- [ ] Error events

### Privacy
- [ ] No PII captured
- [ ] Cookie consent
- [ ] Privacy policy updated
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
