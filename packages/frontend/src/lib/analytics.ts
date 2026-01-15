import posthog from 'posthog-js';

/**
 * Analytics tracking utilities for VerifyMyProvider
 *
 * Events tracked:
 * - search: User submits a search
 * - provider_view: User views provider details
 * - verification_submit: User submits a verification
 * - verification_vote: User votes on a verification
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
 */
export function trackSearch(props: SearchEventProps) {
  if (typeof window === 'undefined') return;

  posthog.capture('search', {
    specialty: props.specialty || null,
    state: props.state || null,
    city: props.city || null,
    cities: props.cities || null,
    health_system: props.healthSystem || null,
    results_count: props.resultsCount,
    mode: props.mode,
  });
}

/**
 * Track when a user views a provider's details
 */
export function trackProviderView(props: ProviderViewEventProps) {
  if (typeof window === 'undefined') return;

  posthog.capture('provider_view', {
    npi: props.npi,
    specialty: props.specialty || null,
    provider_name: props.providerName || null,
  });
}

/**
 * Track when a user submits a verification
 */
export function trackVerificationSubmit(props: VerificationSubmitEventProps) {
  if (typeof window === 'undefined') return;

  posthog.capture('verification_submit', {
    npi: props.npi,
    plan_id: props.planId,
    accepts_insurance: props.acceptsInsurance,
  });
}

/**
 * Track when a user votes on a verification
 */
export function trackVerificationVote(props: VerificationVoteEventProps) {
  if (typeof window === 'undefined') return;

  posthog.capture('verification_vote', {
    verification_id: props.verificationId,
    npi: props.npi || null,
    vote_type: props.voteType,
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
