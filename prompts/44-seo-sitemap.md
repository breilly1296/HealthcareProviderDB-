---
tags:
  - frontend
  - seo
  - implemented
type: prompt
priority: 3
created: 2026-02-06
updated: 2026-04-16
role: auditor
output_format: analysis
---

# SEO & Sitemap Review

## Files to Review
- `packages/frontend/src/app/sitemap.ts` (dynamic XML sitemap generation)
- `packages/frontend/src/app/provider/[npi]/page.tsx` (SSR metadata generation)
- `packages/frontend/src/app/layout.tsx` (root metadata)

## Sitemap Implementation

### Dynamic Sitemap (`sitemap.ts`)
Generates an XML sitemap for search engine crawling:

**Static pages:**
| URL | Priority | Change Frequency |
|-----|----------|-----------------|
| `/` (home) | 1.0 | daily |
| `/search` | 0.9 | daily |
| `/about` | 0.5 | monthly |
| `/terms` | 0.3 | monthly |
| `/privacy` | 0.3 | monthly |
| `/disclaimer` | 0.3 | monthly |

**Dynamic pages:**
- Fetches top 500 most-verified providers from API
- Generates `/provider/[npi]` entries with 0.7 priority and weekly change frequency
- Revalidates daily (`revalidate: 86400`)
- Falls back to static pages only if API fetch fails

### Provider Detail SEO

The provider detail page (`/provider/[npi]`) has server-side rendering with:
- `revalidate: 3600` (ISR — regenerates every hour)
- Dynamic metadata generation (title, description based on provider name/specialty)
- Physician schema structured data in metadata

## Checklist

### Sitemap
- [x] Dynamic XML sitemap generation
- [x] Static page entries with priorities
- [x] Dynamic provider page entries (top 500)
- [x] Daily revalidation
- [x] Graceful fallback on API error

### Provider Page SEO
- [x] Server-side rendering with ISR
- [x] Dynamic metadata (title, description)
- [ ] JSON-LD structured data (beyond metadata)
- [ ] Open Graph / social sharing tags

### Missing / Future
- [ ] `robots.txt` configuration
- [ ] Google Search Console verification
- [ ] Insurance plan page SEO metadata
- [ ] Location page SEO metadata
- [ ] Canonical URLs for search results

## Response Format

Produce a review with these sections:
1. **Summary** — 2-3 sentences on the feature's current state and maturity.
2. **Findings** — grouped CRITICAL / HIGH / MEDIUM / LOW; each cites file:line.
3. **Checklist verification** — walk the Checklist above, mark each item verified / partial / missing with evidence.
4. **Recommendations** — ranked, 1-2 sentences each, with a concrete next action.
5. **Open questions** — pull unanswered items from "Questions to Ask" below.

Keep ≤400 lines. Cite file:line references; avoid generic advice.

---

## Questions to Ask
1. Is the sitemap being submitted to Google Search Console?
2. Should more than 500 providers be included in the sitemap?
3. Should insurance plan pages and location pages also have SEO metadata?
4. Are Open Graph tags needed for social sharing?
