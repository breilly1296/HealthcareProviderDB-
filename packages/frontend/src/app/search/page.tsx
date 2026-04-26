import type { Metadata } from 'next';
import SearchPageClient from './SearchPageClient';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://verifymyprovider.com';

/**
 * Allowlist of query params that are part of a search's canonical identity.
 * Anything not in this list (`view`, `lat`, `lng`, `radius`, ad-hoc params)
 * is excluded from the canonical so the same logical search produces the
 * same canonical regardless of UI state or coordinate noise.
 *
 *   - lat/lng/radius are excluded deliberately: near-me queries vary by
 *     six-decimal coordinates and would otherwise produce a near-infinite
 *     canonical surface that dilutes domain authority on a feature that
 *     isn't really meant to be a landing page.
 *   - `view` (list/map/split) is UI state; not SEO content.
 *   - `page` is included so paginated slices stay distinct (page 2 isn't
 *     the same content as page 1).
 *
 * Already-sorted alphabetically — matches the canonical query-string order.
 */
const SEARCH_CANONICAL_KEYS = [
  'cities',
  'healthSystem',
  'insurancePlanId',
  'name',
  'page',
  'specialty',
  'specialtyCategory',
  'state',
  'zipCode',
] as const;

function buildCanonical(
  searchParams: Record<string, string | string[] | undefined>
): string {
  const sp = new URLSearchParams();
  for (const key of SEARCH_CANONICAL_KEYS) {
    const raw = searchParams[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) continue;
    // Skip page=1 — semantically identical to no page param.
    if (key === 'page' && value === '1') continue;
    sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `${SITE_URL}/search?${qs}` : `${SITE_URL}/search`;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const canonical = buildCanonical(params);

  return {
    title: 'Search Healthcare Providers | VerifyMyProvider',
    description:
      'Search verified healthcare providers by specialty, location, and insurance plan. Community-verified data on which providers accept which plans.',
    alternates: { canonical },
    openGraph: {
      title: 'Search Healthcare Providers',
      description: 'Find providers by specialty, location, and insurance plan.',
      type: 'website',
      url: canonical,
    },
  };
}

export default function SearchPage() {
  return <SearchPageClient />;
}
