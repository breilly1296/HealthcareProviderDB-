# SEO & Sitemap Review

## Overview

This document reviews the SEO (Search Engine Optimization) and sitemap implementation for VerifyMyProvider, covering dynamic XML sitemap generation, per-page metadata, structured data (JSON-LD), Open Graph tags, and identifies gaps for future improvement.

---

## 1. Sitemap Implementation

### File: `packages/frontend/src/app/sitemap.ts`

Next.js App Router convention: exporting a default async function from `app/sitemap.ts` causes Next.js to automatically generate and serve `/sitemap.xml`.

#### Static Pages

The sitemap defines six static page entries with explicit priorities and change frequencies:

| URL | Priority | Change Frequency |
|-----|----------|-----------------|
| `/` (home) | 1.0 | weekly |
| `/search` | 0.9 | daily |
| `/about` | 0.5 | monthly |
| `/terms` | 0.3 | monthly |
| `/privacy` | 0.3 | monthly |
| `/disclaimer` | 0.3 | monthly |

All static entries set `lastModified` to `new Date()` (the time the sitemap was generated/revalidated).

```typescript
const staticPages: SitemapEntry[] = [
  { url: SITE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
  { url: `${SITE_URL}/search`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${SITE_URL}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/disclaimer`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
];
```

#### Dynamic Provider Pages

The sitemap fetches the top 500 providers from the backend search API and generates `/provider/[npi]` entries:

```typescript
const res = await fetch(`${API_URL}/providers/search?limit=500&page=1`, {
  next: { revalidate: 86400 }, // Revalidate daily
});
if (res.ok) {
  const json = await res.json();
  const providers = json.data?.providers ?? [];
  providerPages = providers.map((p: { npi: string }) => ({
    url: `${SITE_URL}/provider/${p.npi}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));
}
```

- **Revalidation**: Daily (86400 seconds) via Next.js ISR fetch caching
- **Priority**: 0.7 for all dynamic provider pages
- **Change frequency**: Weekly
- **Fallback**: If the API fetch fails, the `catch` block silently continues and returns only static pages. This is a graceful degradation strategy.

#### Configuration

- `SITE_URL` defaults to `https://verifymyprovider.com` (overridable via `NEXT_PUBLIC_SITE_URL`)
- `API_URL` defaults to `http://localhost:3001/api/v1` (overridable via `NEXT_PUBLIC_API_URL`)

---

## 2. Root Layout Metadata

### File: `packages/frontend/src/app/layout.tsx`

The root layout exports a static `metadata` object that serves as the default for all pages unless overridden:

```typescript
export const metadata: Metadata = {
  title: 'VerifyMyProvider - Find Providers Who Accept Your Insurance',
  description: 'Search for healthcare providers and verify insurance acceptance with community-verified data.',
};
```

Additional root layout features relevant to SEO:
- `<html lang="en">` -- proper language attribute for accessibility and search engines
- Uses the Inter font from Google Fonts via `next/font/google` (self-hosted, no external CSS requests)
- No favicon, manifest, or icons metadata is configured in the root layout

---

## 3. Per-Page Metadata Audit

### Pages WITH explicit metadata

| Page | File | Metadata Type | Title | Description |
|------|------|---------------|-------|-------------|
| Home (`/`) | `app/page.tsx` | Inherits root layout | "VerifyMyProvider - Find Providers Who Accept Your Insurance" | From root layout |
| About (`/about`) | `app/about/page.tsx` | Static export | "About VerifyMyProvider - Our Mission & Team" | Yes |
| Disclaimer (`/disclaimer`) | `app/disclaimer/page.tsx` | Static export | "Data Accuracy Disclaimer - VerifyMyProvider" | Yes |
| Insurance (`/insurance`) | `app/insurance/page.tsx` | Static export | "Insurance Card Scanner \| ProviderDB" | Yes (note: uses "ProviderDB" not "VerifyMyProvider") |
| Provider Detail (`/provider/[npi]`) | `app/provider/[npi]/page.tsx` | Dynamic `generateMetadata` | Dynamic per-provider | Dynamic per-provider |

### Pages WITHOUT explicit metadata (inherit root layout defaults)

| Page | File | Notes |
|------|------|-------|
| Search (`/search`) | `app/search/page.tsx` | `'use client'` directive -- cannot export metadata |
| Terms (`/terms`) | `app/terms/page.tsx` | No metadata export |
| Privacy (`/privacy`) | `app/privacy/page.tsx` | No metadata export |
| Research (`/research`) | `app/research/page.tsx` | No metadata export |
| Location (`/location/[locationId]`) | `app/location/[locationId]/page.tsx` | `'use client'` directive -- cannot export metadata |

---

## 4. Provider Detail Page SEO (Deep Dive)

### File: `packages/frontend/src/app/provider/[npi]/page.tsx`

This is the most SEO-optimized page in the application. It is a **server component** with full SSR.

#### Data Fetching

```typescript
async function getProvider(npi: string): Promise<ProviderWithPlans | null> {
  const res = await fetch(`${API_URL}/providers/${npi}`, {
    next: { revalidate: 3600 }, // ISR: regenerate every hour
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.provider ?? null;
}
```

- **ISR (Incremental Static Regeneration)**: Pages are cached and revalidated every 3600 seconds (1 hour)
- Graceful null return on fetch failure

#### Dynamic Metadata (`generateMetadata`)

```typescript
export async function generateMetadata({ params }: { params: Promise<{ npi: string }> }): Promise<Metadata> {
  const { npi } = await params;
  const provider = await getProvider(npi);

  if (!provider) {
    return { title: 'Provider Not Found | VerifyMyProvider' };
  }

  const name = getProviderName(provider);
  const specialty = provider.taxonomyDescription || provider.specialtyCategory || 'Healthcare Provider';
  const location = [provider.city, provider.state].filter(Boolean).join(', ');

  return {
    title: `${name} - ${specialty} in ${location} | VerifyMyProvider`,
    description: `Verify insurance acceptance for ${name}, ${specialty} in ${location}. Check which insurance plans are accepted with community-verified data.`,
    openGraph: {
      title: `${name} - ${specialty}`,
      description: `Insurance verification for ${name} in ${location}`,
      type: 'profile',
    },
  };
}
```

Generated metadata includes:
- **Title**: `{Provider Name} - {Specialty} in {City, State} | VerifyMyProvider`
- **Description**: Contains provider name, specialty, location, and a call-to-action about insurance verification
- **Open Graph tags**: `og:title`, `og:description`, `og:type=profile` for social sharing
- **Fallback**: If provider is not found, returns a simple "Provider Not Found" title

#### JSON-LD Structured Data

The page renders a `<script type="application/ld+json">` tag with Schema.org structured data:

```typescript
const jsonLd = provider ? {
  '@context': 'https://schema.org',
  '@type': provider.entityType === 'INDIVIDUAL' ? 'Physician' : 'MedicalOrganization',
  name,
  ...(specialty && { medicalSpecialty: specialty }),
  ...(firstLocation && {
    address: {
      '@type': 'PostalAddress',
      streetAddress: firstLocation.address_line1,
      addressLocality: firstLocation.city,
      addressRegion: firstLocation.state,
      postalCode: firstLocation.zip_code,
    },
  }),
  ...(firstLocation?.phone && { telephone: firstLocation.phone }),
} : null;
```

Schema.org properties rendered:
| Property | Source | Conditional |
|----------|--------|-------------|
| `@type` | `Physician` or `MedicalOrganization` based on `entityType` | Always present |
| `name` | Provider display name | Always present |
| `medicalSpecialty` | `taxonomyDescription` or `specialtyCategory` | If available |
| `address` | First location's address fields (`PostalAddress` type) | If location exists |
| `telephone` | First location's phone | If available |

The JSON-LD is injected into the page via:
```tsx
{jsonLd && (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
  />
)}
```

---

## 5. E2E Test Coverage for SEO

### File: `packages/frontend/e2e/flows.spec.ts` (lines 321-341)

The Playwright E2E tests validate SEO elements on provider detail pages:

```typescript
// Check that the page title contains the provider name
const title = await page.title();
const firstName = providerName!.split(/[\s,]/)[0];
expect(title.toLowerCase()).toContain(firstName!.toLowerCase());

// Check that meta description exists and is non-empty
const metaDescription = page.locator('meta[name="description"]');
await expect(metaDescription).toHaveAttribute('content', /.+/);

// Check for JSON-LD script tag
const jsonLd = page.locator('script[type="application/ld+json"]');
await expect(jsonLd.first()).toBeAttached();

// Verify JSON-LD contains structured data
const jsonLdContent = await jsonLd.first().textContent();
const parsed = JSON.parse(jsonLdContent!);
expect(parsed['@context']).toBe('https://schema.org');
expect(['Physician', 'MedicalOrganization']).toContain(parsed['@type']);
```

Tests verify:
1. Page title contains the provider's first name
2. Meta description is present and non-empty
3. JSON-LD script tag exists
4. JSON-LD `@context` is `https://schema.org`
5. JSON-LD `@type` is either `Physician` or `MedicalOrganization`

---

## 6. Security Headers Relevant to SEO

### File: `packages/frontend/next.config.js`

The Next.js config applies security headers to all routes:

| Header | Value | SEO Impact |
|--------|-------|------------|
| `X-Frame-Options` | `DENY` | Prevents embedding in iframes (no negative SEO impact) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends origin on cross-origin requests, full URL on same-origin -- preserves referrer data for analytics |
| `X-Content-Type-Options` | `nosniff` | No SEO impact |
| `X-XSS-Protection` | `1; mode=block` | No SEO impact |

The Content-Security-Policy header is currently disabled (commented out) due to API request blocking issues.

---

## 7. Current State Checklist

### Sitemap
- [x] Dynamic XML sitemap generation via `app/sitemap.ts`
- [x] Static page entries with priorities and change frequencies
- [x] Dynamic provider page entries (top 500 from API)
- [x] Daily revalidation (86400s)
- [x] Graceful fallback on API error (returns static pages only)
- [ ] `/insurance` page not included in sitemap
- [ ] `/research` page not included in sitemap
- [ ] `/location/[locationId]` pages not included in sitemap

### Root Layout
- [x] Default title and description
- [x] Language attribute (`lang="en"`)
- [ ] No favicon or icons metadata
- [ ] No `metadataBase` configured (needed for absolute URL resolution in Open Graph)
- [ ] No site-wide Open Graph defaults

### Provider Detail Page
- [x] Server-side rendering with ISR (1 hour revalidation)
- [x] Dynamic metadata with `generateMetadata` (title, description)
- [x] Open Graph tags (`og:title`, `og:description`, `og:type`)
- [x] JSON-LD structured data (Physician / MedicalOrganization schema)
- [x] E2E test coverage for SEO elements
- [ ] No `og:image` tag (social cards will show generic preview)
- [ ] No Twitter Card metadata

### Other Pages
- [x] `/about` has custom metadata
- [x] `/disclaimer` has custom metadata
- [x] `/insurance` has custom metadata (uses "ProviderDB" instead of "VerifyMyProvider" -- brand inconsistency)
- [ ] `/search` is a client component -- cannot export metadata (needs wrapper or layout)
- [ ] `/terms` has no metadata
- [ ] `/privacy` has no metadata
- [ ] `/research` has no metadata
- [ ] `/location/[locationId]` is a client component -- cannot export metadata

---

## 8. Gaps and Missing Features

### Critical

| Item | Description | Priority |
|------|-------------|----------|
| `robots.txt` | No `robots.txt` file or `app/robots.ts` exists. Search engines have no crawl directives. | High |
| Search page metadata | `/search` is a client component and cannot export metadata. Needs a `layout.tsx` wrapper or conversion. | High |
| Missing `metadataBase` | Root layout does not set `metadataBase`, which is needed for Next.js to resolve relative URLs in Open Graph and other metadata. | High |

### Important

| Item | Description | Priority |
|------|-------------|----------|
| Terms/Privacy metadata | `/terms` and `/privacy` pages have no custom title or description. They fall back to the root layout defaults. | Medium |
| Research page metadata | `/research` has no metadata and is not in the sitemap. | Medium |
| Location page SEO | `/location/[locationId]` is a client component with no metadata. It cannot be indexed well. | Medium |
| Insurance branding | `/insurance` metadata title says "ProviderDB" instead of "VerifyMyProvider". | Medium |
| Sitemap completeness | `/insurance`, `/research`, and `/location/[locationId]` pages are missing from the sitemap. | Medium |

### Nice to Have

| Item | Description | Priority |
|------|-------------|----------|
| `og:image` | No Open Graph image for social sharing previews. Provider pages and home page would benefit from dynamic OG images. | Low |
| Twitter Cards | No `twitter:card`, `twitter:site`, or `twitter:image` metadata. | Low |
| Canonical URLs | No canonical URL tags on any page. Search results pages (`/search?q=...`) could have duplicate content issues without canonicals. | Low |
| Google Search Console | No verification meta tag or DNS record for Google Search Console. | Low |
| Favicon/icons | No favicon or app icons configured in root metadata. | Low |
| Sitemap scaling | Currently limited to 500 providers. For larger datasets, consider sitemap index with multiple sitemaps. | Low |

---

## 9. Questions for Future Planning

1. **Is the sitemap being submitted to Google Search Console?** No Google Search Console verification tag was found in the codebase.
2. **Should more than 500 providers be included in the sitemap?** The current limit fetches the first 500 from `/providers/search`. As the database grows, a sitemap index with paginated sub-sitemaps may be needed.
3. **Should insurance plan pages and location pages have SEO metadata?** Location pages are client-side rendered and have no metadata. Converting them to server components or adding a layout with metadata would improve indexability.
4. **Are Open Graph tags needed for social sharing?** The provider detail page has basic OG tags, but no `og:image` is set, so social platforms will show a generic preview. A dynamic OG image generator (using Next.js `ImageResponse`) could improve social sharing.
5. **Should the search page be indexable?** It is currently a client component with no metadata. Search pages with query parameters typically use `noindex` to avoid duplicate content, but the base `/search` page should have metadata.

---

## 10. File Reference

| File | Purpose |
|------|---------|
| `packages/frontend/src/app/sitemap.ts` | Dynamic XML sitemap generation |
| `packages/frontend/src/app/layout.tsx` | Root metadata (title, description) |
| `packages/frontend/src/app/provider/[npi]/page.tsx` | Provider detail SSR metadata + JSON-LD |
| `packages/frontend/src/app/about/page.tsx` | About page metadata |
| `packages/frontend/src/app/disclaimer/page.tsx` | Disclaimer page metadata |
| `packages/frontend/src/app/insurance/page.tsx` | Insurance page metadata |
| `packages/frontend/src/app/search/page.tsx` | Client component -- no metadata |
| `packages/frontend/src/app/terms/page.tsx` | No metadata |
| `packages/frontend/src/app/privacy/page.tsx` | No metadata |
| `packages/frontend/src/app/research/page.tsx` | No metadata |
| `packages/frontend/src/app/location/[locationId]/page.tsx` | Client component -- no metadata |
| `packages/frontend/next.config.js` | Security headers, standalone output |
| `packages/frontend/e2e/flows.spec.ts` | E2E tests for provider page SEO |
