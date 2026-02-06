const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://verifymyprovider.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export default async function sitemap(): Promise<SitemapEntry[]> {
  const staticPages: SitemapEntry[] = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/search`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/disclaimer`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  // Fetch most-verified providers for dynamic sitemap entries
  let providerPages: SitemapEntry[] = [];
  try {
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
  } catch {
    // Silently fail — static pages are still returned
  }

  return [...staticPages, ...providerPages];
}
