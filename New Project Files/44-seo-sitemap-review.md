# SEO & Sitemap Review

**Generated:** 2026-02-18
**Prompt:** 44-seo-sitemap.md
**Status:** Solid foundation with sitemap, ISR, metadata, JSON-LD, and Open Graph; some gaps remain

---

## Summary

The SEO implementation covers the critical bases: a dynamic XML sitemap with static and provider pages, server-side rendering with ISR for the provider detail page, dynamic metadata generation (title, description, Open Graph), JSON-LD structured data (Physician/MedicalOrganization schema), and global root metadata with Open Graph and Twitter card defaults. The sitemap revalidates daily and gracefully handles API failures.

---

## Verified Checklist

### Sitemap (`packages/frontend/src/app/sitemap.ts`)

- [x] **Dynamic XML sitemap generation** -- Next.js App Router `sitemap()` export that returns `SitemapEntry[]`
- [x] **Static page entries**:

| URL | Priority | Change Frequency |
|-----|----------|-----------------|
| `/` (home) | 1.0 | weekly |
| `/search` | 0.9 | daily |
| `/about` | 0.5 | monthly |
| `/terms` | 0.3 | monthly |
| `/privacy` | 0.3 | monthly |
| `/disclaimer` | 0.3 | monthly |

- [x] **Dynamic provider pages** -- Fetches first 500 providers from `GET /providers/search?limit=500&page=1`, generates `/provider/[npi]` entries with priority 0.7, weekly change frequency
- [x] **Daily revalidation** -- `next: { revalidate: 86400 }` on the fetch call
- [x] **Graceful fallback** -- `try/catch` wraps the API call; on failure, returns only static pages
- [x] **`lastModified`** -- Set to `new Date()` for all entries (current timestamp)

**Note on provider selection**: The sitemap fetches the first 500 from a general search endpoint (no sorting by verification count). The prompt says "top 500 most-verified providers" but the actual code uses `search?limit=500&page=1` which returns providers in default sort order (lastName ASC). This could be improved by adding a sort parameter or a dedicated sitemap endpoint.

### Provider Detail Page SEO (`packages/frontend/src/app/provider/[npi]/page.tsx`)

- [x] **Server-side rendering with ISR** -- `getProvider()` uses `fetch()` with `next: { revalidate: 3600 }` (regenerates every hour)
- [x] **Dynamic metadata** -- `generateMetadata()` async function:
  - **Title**: `"{Name} - {Specialty} in {City, State} | VerifyMyProvider"`
  - **Description**: `"Verify insurance acceptance for {Name}, {Specialty} in {Location}. Check which insurance plans are accepted with community-verified data."`
  - **Fallback**: `"Provider Not Found | VerifyMyProvider"` when provider doesn't exist
- [x] **Open Graph tags**:
  - `title`: `"{Name} - {Specialty}"`
  - `description`: `"Insurance verification for {Name} in {Location}"`
  - `type`: `"profile"`
- [x] **JSON-LD structured data** -- Full schema.org markup:
  - `@context`: `"https://schema.org"`
  - `@type`: `"Physician"` (individual) or `"MedicalOrganization"` (organization)
  - `name`: Provider display name
  - `medicalSpecialty`: Taxonomy description or specialty category
  - `address`: `PostalAddress` with street, city, state, zip from first location
  - `telephone`: Phone from first location
  - All fields conditionally included (only when data exists)

### Root Layout SEO (`packages/frontend/src/app/layout.tsx`)

- [x] **Root metadata** -- Global defaults:
  - `metadataBase`: `https://verifymyprovider.com`
  - `title`: `"VerifyMyProvider - Find Providers Who Accept Your Insurance"`
  - `description`: `"Search for healthcare providers and verify insurance acceptance with community-verified data."`
- [x] **Favicons** -- Multiple formats: `.ico`, `.svg`, `16x16.png`, `32x32.png`, Apple Touch Icon
- [x] **Open Graph defaults**:
  - `type: 'website'`
  - `locale: 'en_US'`
  - `siteName: 'VerifyMyProvider'`
  - `images: ['/full-logo/logo-full-light-1200w.png']`
- [x] **Twitter card** -- `card: 'summary_large_image'`
- [x] **Skip to content link** -- `<a href="#main-content" className="sr-only focus:not-sr-only ...">` for accessibility

### Map Page SEO (`packages/frontend/src/app/map/layout.tsx`)

- [x] **Map layout metadata** -- `title: 'Provider Map | VerifyMyProvider'`, `description: 'Browse healthcare providers on an interactive map'`

---

## Observations

1. **Sitemap fetches 500 providers but not the "most verified"** -- The code calls `/providers/search?limit=500&page=1` which returns providers in default alphabetical order, not sorted by verification count or confidence score. A more SEO-effective approach would be to include the most-viewed or most-verified providers, since those are the pages search engines should prioritize.

2. **`lastModified` is always `new Date()`** -- All sitemap entries use the current timestamp, which doesn't reflect when the content actually changed. For provider pages, using the `lastVerifiedAt` or `updatedAt` from the provider data would be more accurate and help search engines prioritize recently-updated pages.

3. **No `robots.txt`** -- The prompt checklist notes this is missing. Without a `robots.txt`, search engines use default behavior (crawl everything). A `robots.txt` should be added to:
   - Allow all pages
   - Point to the sitemap URL: `Sitemap: https://verifymyprovider.com/sitemap.xml`
   - Potentially block `/api/` paths from crawling

4. **500-provider limit** -- For a database with hundreds of thousands of providers, 500 is a small fraction. Consider implementing a [sitemap index](https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps) that breaks provider pages into multiple sitemaps (e.g., by state) for better coverage.

5. **No canonical URLs on search results** -- Search result pages with URL parameters (e.g., `/search?state=NY&specialty=CARDIOLOGY`) don't have canonical URLs set. This could lead to search engines indexing many parameter combinations as separate pages. A canonical URL strategy would help consolidate ranking signals.

6. **Insurance plan pages and location pages lack SEO metadata** -- The prompt notes these are missing. If these pages exist and are public, they should have dynamic metadata similar to provider pages.

---

## Items from Prompt Checklist -- Updated Assessment

| Prompt Item | Status | Notes |
|---|---|---|
| Dynamic XML sitemap generation | DONE | 6 static + up to 500 provider pages |
| Static page entries with priorities | DONE | 6 pages with appropriate priorities |
| Dynamic provider page entries | DONE | 500 providers, but not sorted by verification |
| Daily revalidation | DONE | `revalidate: 86400` on API fetch |
| Graceful fallback on API error | DONE | Returns static pages only on failure |
| Server-side rendering with ISR | DONE | `revalidate: 3600` (hourly) |
| Dynamic metadata (title, description) | DONE | Generated from provider name, specialty, location |
| JSON-LD structured data | DONE | Physician/MedicalOrganization with PostalAddress |
| Open Graph / social sharing tags | DONE | On provider pages and root layout |
| `robots.txt` configuration | NOT DONE | Should be added |
| Google Search Console verification | UNKNOWN | Cannot verify from codebase |
| Insurance plan page SEO metadata | NOT DONE | No metadata generation for plan pages |
| Location page SEO metadata | NOT DONE | No metadata generation for location pages |
| Canonical URLs for search results | NOT DONE | Search pages lack canonical URL tags |

---

## Recommendations

1. **Add `robots.txt`** -- Create `packages/frontend/public/robots.txt` with `Sitemap: https://verifymyprovider.com/sitemap.xml` and appropriate allow/disallow rules.

2. **Expand sitemap coverage** -- Implement a sitemap index with multiple sitemaps. Split provider pages by state (50 sitemaps) to include more than 500 providers. Each state sitemap could include all providers in that state.

3. **Sort sitemap providers by relevance** -- Modify the sitemap API call to sort by verification count or confidence score, so the most valuable pages are in the sitemap.

4. **Use real `lastModified` dates** -- Include `updatedAt` or `lastVerifiedAt` from provider data in sitemap entries instead of `new Date()`.

5. **Add canonical URLs to search pages** -- Use `<link rel="canonical">` on search result pages, either pointing to the canonical search URL or using `noindex` for parameterized search pages.

6. **Add plan and location page metadata** -- If these pages are public-facing, add `generateMetadata()` functions similar to the provider detail page.
