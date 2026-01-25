import posthog from 'posthog-js';

/**
 * Analytics tracking utilities for VerifyMyProvider
 *
 * PRIVACY NOTE: We intentionally do NOT send sensitive healthcare data to analytics.
 * This includes: specialty names, specific locations, provider identifiers, plan details.
 * We only track aggregate/boolean indicators to understand usage patterns.
 *
 * Events tracked:
 * - search: User submits a search (no specific filters sent)
 * - provider_view: User views provider details (no identifiers sent)
 * - verification_submit: User submits a verification (no health data sent)
 * - verification_vote: User votes on a verification (no identifiers sent)
 */

// Type definitions for event properties
interface SearchEventProps {
  specialty?: string;
  state?: string;
  city?: string;
  cities?: string;
  healthSystem?: string;
  resultsCount: number;
  mode: 'providers' | 'locations';
}

interface ProviderViewEventProps {
  npi: string;
  specialty?: string;
  providerName?: string;
}

interface VerificationSubmitEventProps {
  npi: string;
  planId: string;
  acceptsInsurance: boolean;
}

interface VerificationVoteEventProps {
  verificationId: string;
  npi?: string;
  voteType: 'up' | 'down';
}

/**
 * Track when a user performs a search
 * Privacy: Only sends boolean indicators, not actual search values
 */
export function trackSearch(props: SearchEventProps) {
  if (typeof window === 'undefined') return;

  // Privacy-preserving: Only send boolean indicators, not actual values
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

/**
 * Track when a user views a provider's details
 * Privacy: Only sends that a view occurred, not which provider
 */
export function trackProviderView(props: ProviderViewEventProps) {
  if (typeof window === 'undefined') return;

  // Privacy-preserving: Don't send identifiable provider info
  posthog.capture('provider_view', {
    has_specialty: !!props.specialty,
    // NOT sending: npi, specialty, provider_name
  });
}

/**
 * Track when a user submits a verification
 * Privacy: Only sends that a submission occurred, not health-related details
 */
export function trackVerificationSubmit(_props: VerificationSubmitEventProps) {
  if (typeof window === 'undefined') return;

  // Privacy-preserving: Don't send identifiable info
  // _props is intentionally unused - we only track that a submission occurred
  posthog.capture('verification_submit', {
    // Only track that a verification was submitted
    // NOT sending: npi, plan_id, accepts_insurance
  });
}

/**
 * Track when a user votes on a verification
 * Privacy: Only sends vote direction, not which verification
 */
export function trackVerificationVote(props: VerificationVoteEventProps) {
  if (typeof window === 'undefined') return;

  // Privacy-preserving: Only send vote type
  posthog.capture('verification_vote', {
    vote_type: props.voteType,
    // NOT sending: verification_id, npi
  });
}

/**
 * Identify a user (for when you add accounts later)
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;

  posthog.identify(userId, properties);
}

/**
 * Reset user identity (for logout)
 */
export function resetUser() {
  if (typeof window === 'undefined') return;

  posthog.reset();
}
