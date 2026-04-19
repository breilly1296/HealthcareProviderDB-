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

// ============================================================================
// Exception tracking
// ============================================================================

/**
 * Context passed to `trackException` when reporting a client-side error.
 * Intentionally narrow: only error metadata, never PII. See the privacy
 * banner at the top of this file — no emails, IPs, names, or search values.
 */
export interface ExceptionContext {
  /** Where the capture was invoked from — helps group in PostHog. */
  source:
    | 'ErrorContext'
    | 'ErrorBoundary'
    | 'window.onerror'
    | 'unhandledrejection'
    | 'apiFetch'
    | (string & {});
  /** Override the derived `$exception_type` if the Error name isn't useful. */
  type?: string;
  /** For apiFetch captures — HTTP status (only 5xx reaches us). */
  apiStatus?: number;
  /** For apiFetch captures — pathname only, query string stripped. */
  apiPath?: string;
  /** Client-generated X-Request-ID correlating to backend logs. Random UUID, not PII. */
  requestId?: string;
  /** For window.onerror captures. */
  lineno?: number;
  colno?: number;
  /** Next.js error boundary digest, when present. */
  digest?: string;
  /** Raw stack, for error-boundary captures. */
  stackTrace?: string;
}

/**
 * Duck-type check for `ApiError` from `lib/api.ts`. Imported-as-value would
 * create a circular dependency (api.ts imports from this file), so we match
 * on `error.name` — which the ApiError constructor sets explicitly.
 */
function isApiError(error: unknown): error is Error & { statusCode: number } {
  if (!(error instanceof Error) || error.name !== 'ApiError') return false;
  const statusCode = (error as unknown as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number';
}

/**
 * Report a client-side exception to PostHog via its `$exception` event.
 *
 * Filters:
 * - SSR: no-op (posthog-js is browser-only)
 * - 4xx ApiError: no-op (expected user errors — validation, auth, not-found)
 * - 5xx ApiError: apiFetch captures these directly with richer context, so
 *   this helper skips them to avoid double-reporting. Callers that route
 *   through ErrorContext won't re-emit.
 */
export function trackException(error: unknown, context: ExceptionContext): void {
  if (typeof window === 'undefined') return;

  if (isApiError(error)) {
    // apiFetch owns API error reporting; 4xx is explicitly not tracked.
    if (context.source !== 'apiFetch') return;
  }

  const message = error instanceof Error ? error.message : String(error);
  const type = context.type ?? (error instanceof Error ? error.name : 'Error');

  posthog.capture('$exception', {
    $exception_message: message,
    $exception_type: type,
    $exception_source: context.source,
    ...(context.stackTrace && { $exception_stack_trace_raw: context.stackTrace }),
    ...(context.apiStatus !== undefined && { api_status: context.apiStatus }),
    ...(context.apiPath && { api_path: context.apiPath }),
    ...(context.requestId && { request_id: context.requestId }),
    ...(context.lineno !== undefined && { $exception_lineno: context.lineno }),
    ...(context.colno !== undefined && { $exception_colno: context.colno }),
    ...(context.digest && { digest: context.digest }),
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
