# SEO & Sitemap

## Dynamic Sitemap (`sitemap.ts`)

The sitemap is generated dynamically using Next.js's built-in `sitemap.ts` convention, producing an XML sitemap at `/sitemap.xml`.

### Static Pages

| URL | Priority | Change Frequency |
|-----|----------|-----------------|
| `/` | 1.0 | daily |
| `/search` | 0.9 | daily |
| `/about` | 0.5 | monthly |
| `/terms` | 0.3 | monthly |
| `/privacy` | 0.3 | monthly |
| `/disclaimer` | 0.3 | monthly |

### Dynamic Provider Pages

- **Source:** Fetches the top **500 most-verified providers** from the backend API
- **URL pattern:** `/provider/[npi]` for each provider
- **Priority:** 0.7
- **Change frequency:** weekly
- **Revalidation:** Daily (`86400` seconds)

### Generation Logic

```typescript
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    { url: `${baseUrl}/`, priority: 1.0, changeFrequency: 'daily' },
    { url: `${baseUrl}/search`, priority: 0.9, changeFrequency: 'daily' },
    { url: `${baseUrl}/about`, priority: 0.5, changeFrequency: 'monthly' },
    { url: `${baseUrl}/terms`, priority: 0.3, changeFrequency: 'monthly' },
    { url: `${baseUrl}/privacy`, priority: 0.3, changeFrequency: 'monthly' },
    { url: `${baseUrl}/disclaimer`, priority: 0.3, changeFrequency: 'monthly' },
  ];

  try {
    const topProviders = await fetchTopVerifiedProviders(500);
    const providerPages = topProviders.map(provider => ({
      url: `${baseUrl}/provider/${provider.npi}`,
      lastModified: provider.lastVerifiedAt,
      priority: 0.7,
      changeFrequency: 'weekly' as const,
    }));
    return [...staticPages, ...providerPages];
  } catch (error) {
    // Graceful fallback: return static pages only on API failure
    return staticPages;
  }
}
```

### Fallback Behavior

If the API call to fetch top providers fails (network error, timeout, server error), the sitemap gracefully degrades to include **only static pages**. This ensures the sitemap is always available even during backend outages.

---

## Provider Detail Page SEO

### ISR Configuration

```typescript
export const revalidate = 3600; // Revalidate every hour
```

Provider detail pages use ISR with a **1-hour revalidation period**, ensuring that:
- Pages are served quickly from cache
- Provider data is refreshed at most hourly
- New providers are discoverable within an hour of their first visit

### Dynamic Metadata

```typescript
export async function generateMetadata({ params }): Promise<Metadata> {
  const provider = await fetchProvider(params.npi);

  if (!provider) {
    return { title: 'Provider Not Found | VerifyMyProvider' };
  }

  return {
    title: `${provider.displayName} - ${provider.specialty} | VerifyMyProvider`,
    description: `View insurance plans accepted by ${provider.displayName}, ${provider.specialty}. Community-verified provider information on VerifyMyProvider.`,
  };
}
```

### Physician Schema Structured Data

Provider pages include Schema.org `Physician` type structured data to enhance search engine understanding and enable rich results.

---

## Implementation Status

### Implemented

| Feature | Details |
|---------|---------|
| Dynamic XML sitemap | Generated via `sitemap.ts`, served at `/sitemap.xml` |
| Static page entries | 6 static pages with appropriate priorities and change frequencies |
| Dynamic provider entries | Top 500 most-verified providers included |
| Daily sitemap revalidation | `86400` second revalidation period |
| Graceful fallback | Falls back to static-only sitemap on API failure |
| SSR with ISR | Provider detail pages server-rendered with hourly revalidation |
| Dynamic metadata | Title and description generated per provider |
| Physician schema | Structured data on provider detail pages |

### Missing / Not Implemented

| Feature | Impact | Notes |
|---------|--------|-------|
| `robots.txt` | Medium | No robots.txt file to guide crawlers; should allow `/sitemap.xml`, block `/api/` |
| Google Search Console | Medium | Not configured; needed for sitemap submission and crawl monitoring |
| JSON-LD structured data (full) | Medium | Basic Physician schema exists; full JSON-LD with `MedicalBusiness`, `InsurancePlan` types not implemented |
| Open Graph tags | Medium | No `og:title`, `og:description`, `og:image` meta tags for social sharing |
| Twitter Card meta tags | Low | No `twitter:card`, `twitter:title`, `twitter:description` meta tags |
| Insurance plan page SEO | Low | No dedicated SEO for plan detail or plan listing pages |
| Location page SEO | Low | No dedicated SEO for location-based landing pages (e.g., `/providers/new-york`) |
| Canonical URLs for search results | Medium | Search result pages lack `<link rel="canonical">` to prevent duplicate content issues from varying query parameters |
| Sitemap index | Low | Single sitemap file; may need sitemap index if provider count exceeds 50,000 |

---

## Recommendations

### Short-Term (Pre-Launch)

1. **Add `robots.txt`** to allow sitemap discovery and block API routes:
   ```
   User-agent: *
   Allow: /
   Disallow: /api/
   Sitemap: https://verifymyprovider.com/sitemap.xml
   ```

2. **Add Open Graph meta tags** to provider detail pages and the homepage for social sharing previews.

3. **Add canonical URLs** to search result pages to consolidate ranking signals.

4. **Submit sitemap to Google Search Console** after domain and hosting are finalized.

### Medium-Term (Post-Launch)

5. **Expand JSON-LD structured data** with `MedicalBusiness` and `InsurancePlan` schema types.

6. **Create location-based landing pages** (e.g., `/providers/manhattan`, `/providers/brooklyn`) for local SEO targeting NYC boroughs.

7. **Implement sitemap index** if provider count grows beyond the initial 500 entries toward the 50,000 sitemap limit.
