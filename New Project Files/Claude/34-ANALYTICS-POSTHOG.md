# PostHog Analytics

## Status: IMPLEMENTED (Privacy-Preserving)

## Overview

PostHog is integrated as the analytics platform with a strict privacy-preserving configuration. The implementation prioritizes user privacy by tracking only boolean indicators and aggregate counts rather than personally identifiable information.

## Setup

### PostHogProvider.tsx

Initializes PostHog with the following privacy-focused configuration:

```typescript
posthog.init(POSTHOG_KEY, {
  autocapture: false,                    // No automatic event capture
  capture_pageview: false,               // Manual pageview with param sanitization
  capture_pageleave: true,               // Track when users leave
  disable_session_recording: true,       // No session replays
  opt_out_capturing_by_default: true,    // Opt-out until consent given
  persistence: 'localStorage',           // Use localStorage, not cookies
});
```

Key design decisions:

- **autocapture disabled** - Prevents accidental capture of sensitive form data or PII
- **manual pageviews** - Allows URL parameter sanitization before sending
- **no session recording** - Users are never recorded
- **opt-out by default** - No data collected until explicit cookie consent

### PostHogPageview Component

Handles manual pageview tracking with URL parameter sanitization:

- Strips `npi` parameter from URLs
- Strips `planId` parameter from URLs
- Strips `name` parameter from URLs
- Sends only the sanitized URL path

## Event Tracking

### Analytics.ts

All tracking functions send only boolean indicators or counts, never actual search terms, provider names, or identifiers.

#### trackSearch

Tracks that a search occurred with filter usage indicators.

```typescript
trackSearch({
  has_specialty_filter: boolean,   // Whether specialty filter was used
  has_state_filter: boolean,       // Whether state filter was used
  has_city_filter: boolean,        // Whether city filter was used
  results_count: number,           // Number of results returned
});
```

**NOT tracked:** Actual specialty name, state value, city value, search query text.

#### trackProviderView

Tracks that a provider profile was viewed.

```typescript
trackProviderView({
  has_specialty: boolean,   // Whether the provider has a specialty listed
});
```

**NOT tracked:** NPI number, provider name, specialty name, or any identifying information.

#### trackVerificationSubmit

Tracks that a verification was submitted.

```typescript
trackVerificationSubmit({});   // Empty payload
```

**NOT tracked:** NPI, plan details, verification content, submitter information.

#### trackVerificationVote

Tracks that a vote was cast on a verification.

```typescript
trackVerificationVote({
  vote_type: string,   // "helpful" or "not_helpful"
});
```

**NOT tracked:** Verification ID, provider details, voter information.

## Cookie Consent

### CookieConsent.tsx

Provides a consent banner for analytics tracking.

- **Accept** - Enables PostHog tracking, stored in localStorage
- **Decline** - PostHog remains opted out, stored in localStorage
- Consent preference persisted in localStorage
- Banner does not reappear after a choice is made

## Events NOT Tracked

The following user actions are intentionally excluded from analytics:

- Compare actions (adding/removing providers from comparison)
- Error events (API failures, validation errors)
- Insurance card uploads
- Individual verification details
- Vote counts per verification

## Known Gaps

- **Privacy policy** has not yet been updated to reference PostHog as an analytics provider
- Privacy policy should disclose what data is collected, retention period, and how to opt out
