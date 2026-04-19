import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://verifymyprovider.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// Target URLs per sitemap shard. Google allows up to 50K per sitemap file;
// 10K keeps each XML file small enough to serve quickly from Next.js's ISR
// cache and leaves room for future per-provider additional metadata.
const PROVIDERS_PER_SITEMAP = 10_000;

// Backend's /providers/search caps limit at 100 (paginationSchema in
// packages/backend/src/schemas/commonSchemas.ts). Each sitemap shard
// therefore fetches PAGES_PER_SHARD backend pages in parallel.
const BACKEND_PAGE_LIMIT = 100;
const PAGES_PER_SHARD = PROVIDERS_PER_SITEMAP / BACKEND_PAGE_LIMIT; // 100

// Daily regeneration. Used by each per-shard sitemap route.
export const revalidate = 86_400;

interface SearchResponse {
  data?: {
    providers?: Array<{ npi: string }>;
    pagination?: { total?: number };
  };
}

async function fetchSearchPage(page: number, limit: number): Promise<SearchResponse | null> {
  try {
    const res = await fetch(`${API_URL}/providers/search?limit=${limit}&page=${page}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as SearchResponse;
  } catch {
    return null;
  }
}

/**
 * Tell Next.js how many sitemap shards to generate.
 *
 * Shard 0 = static pages (small, doesn't need a provider fetch).
 * Shards 1..N = provider pages, PROVIDERS_PER_SITEMAP URLs each.
 *
 * Falls back to just the static shard on API failure so `/sitemap.xml`
 * always resolves, even during a backend outage.
 */
export async function generateSitemaps() {
  const first = await fetchSearchPage(1, 1);
  const total = first?.data?.pagination?.total ?? 0;
  const providerShards = Math.ceil(total / PROVIDERS_PER_SITEMAP);
  return Array.from({ length: 1 + providerShards }, (_, i) => ({ id: i }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  // Shard 0: static, well-known pages. lastModified is intentionally omitted
  // — setting it to `new Date()` on every regen would tell crawlers every
  // page changed daily, which is a lie and dilutes the signal for pages
  // that actually did change.
  if (id === 0) {
    return [
      { url: SITE_URL, changeFrequency: 'weekly', priority: 1.0 },
      { url: `${SITE_URL}/search`, changeFrequency: 'daily', priority: 0.9 },
      { url: `${SITE_URL}/insurance`, changeFrequency: 'weekly', priority: 0.7 },
      { url: `${SITE_URL}/map`, changeFrequency: 'weekly', priority: 0.7 },
      { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
      { url: `${SITE_URL}/research`, changeFrequency: 'monthly', priority: 0.5 },
      { url: `${SITE_URL}/terms`, changeFrequency: 'monthly', priority: 0.3 },
      { url: `${SITE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
      { url: `${SITE_URL}/disclaimer`, changeFrequency: 'monthly', priority: 0.3 },
    ];
  }

  // Provider shards. Shard id=1 maps to backend pages 1..PAGES_PER_SHARD;
  // id=2 maps to pages PAGES_PER_SHARD+1..2*PAGES_PER_SHARD; etc.
  const startPage = (id - 1) * PAGES_PER_SHARD + 1;
  const endPage = id * PAGES_PER_SHARD;

  const pages = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage + i
  );

  const responses = await Promise.all(
    pages.map(page => fetchSearchPage(page, BACKEND_PAGE_LIMIT))
  );

  const urls: MetadataRoute.Sitemap = [];
  for (const response of responses) {
    const providers = response?.data?.providers ?? [];
    for (const provider of providers) {
      if (typeof provider.npi === 'string') {
        urls.push({
          url: `${SITE_URL}/provider/${provider.npi}`,
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      }
    }
  }
  return urls;
}
