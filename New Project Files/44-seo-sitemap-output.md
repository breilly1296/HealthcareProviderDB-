# SEO & Sitemap — Review Output

## 1. Summary

SEO scaffolding is minimally in place: a dynamic Next.js sitemap, ISR-backed provider detail pages with dynamic metadata, Physician/MedicalOrganization JSON-LD, and OpenGraph tags on the provider page. The provider page is in fact **better** than the prompt's checklist implies — JSON-LD *is* present, contradicting the "Missing" item. Key gaps: no `robots.txt`, no sitemap index for the 1M-scale provider catalog (only top 500 providers are listed), no canonical URLs anywhere, and insurance/location pages carry no per-page metadata despite being in the public routing tree.

## 2. Findings

### HIGH

- **`robots.txt` is missing.** Neither `packages/frontend/src/app/robots.ts` nor `packages/frontend/public/robots.txt` exists (verified via directory listings at `packages/frontend/src/app/` and `packages/frontend/public/`). Search engines get no crawl policy and the sitemap at `/sitemap.xml` is not discoverable without manual submission. This is the single biggest omission for organic discoverability.
- **Sitemap only emits 500 providers.** `packages/frontend/src/app/sitemap.ts:24` hardcodes `limit=500&page=1`. With the scale described in CLAUDE.md (enrichment across 1M+ NPIs, 348k locations), 500 entries is ~0.05% coverage. Google tolerates up to 50k URLs per sitemap file, and the canonical answer is to shard into sitemap index files (e.g. `/sitemap-providers-0.xml`, `/sitemap-providers-1.xml`).
- **Sitemap `changeFrequency: 'weekly'` for home/search is stale.** `sitemap.ts:13-14` actually sets `weekly` for home and `daily` for search, but the prompt listed it as `daily` for home. More importantly, `lastModified: new Date()` (lines 13-19, 33) sets every URL's mod date to the current request time on every regeneration — search engines will see perpetual churn and de-prioritize. Should be omitted or set from DB-level timestamps.

### MEDIUM

- **Provider page JSON-LD exists but is not listed in the prompt's Missing section.** `packages/frontend/src/app/provider/[npi]/page.tsx:69-86` builds a Physician/MedicalOrganization JSON-LD block and injects it at `:90-95`. The Checklist's "JSON-LD structured data (beyond metadata)" should be marked verified.
- **JSON-LD uses snake_case keys that don't match the API.** `provider/[npi]/page.tsx:78-81` references `firstLocation.address_line1` and `firstLocation.zip_code` but the backend response uses `addressLine1` / `zipCode` (see `packages/backend/src/routes/providers.ts:166-170`). These keys will be `undefined`, producing a JSON-LD with empty `streetAddress` and `postalCode`. Net: structured data is emitted but partially empty for every provider.
- **`metadataBase`, OpenGraph site image, and Twitter card are global, but provider page OpenGraph lacks `images`.** Root `layout.tsx:54-62` sets a global OG image and twitter summary_large_image; per-provider OG at `provider/[npi]/page.tsx:49-54` overrides `title`/`description`/`type='profile'` but doesn't supply an image — social shares will fall back to the global logo. Minor brand issue.
- **No `canonical` on any page.** Searches like `/search?state=NY&cities=Bronx,Queens` or reordered filter URLs will be crawled as separate URLs. No `alternates.canonical` is declared in `layout.tsx` or any route-level metadata.
- **No `robots` meta noindex on filter-heavy pages.** Without robots.txt or page-level noindex on `/search`, every filter combination is crawlable and indexable, diluting link equity to the real provider detail pages.

### LOW

- **Static pages in sitemap include `/` duplicated by the Home OG image path.** `sitemap.ts:13` — benign.
- **Sitemap catches-all with silent fallback.** `sitemap.ts:37-39` swallows fetch errors — good for resilience but means a backend outage will silently strip all provider URLs from the sitemap for that day (since `revalidate: 86400`). A logged warning would help ops.
- **`NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_API_URL` fall back to hardcoded defaults** (`sitemap.ts:1-2`, `provider/[npi]/page.tsx:5`). If env isn't set in a preview deployment the sitemap will emit `https://verifymyprovider.com` URLs against a local DB — OK, but worth a note.
- **`revalidate: 3600` on provider detail** (`provider/[npi]/page.tsx:11`) vs sitemap `revalidate: 86400` (`sitemap.ts:25`) means the sitemap entry can claim `lastModified: now()` while the cached page is 23h stale. Cosmetic mostly.
- **No `/about`, `/terms`, `/privacy`, `/disclaimer` route-level metadata** visible from the directory listing (`packages/frontend/src/app/about`, `terms`, `privacy`, `disclaimer` all exist per `ls` output). These pages almost certainly inherit the generic root title/description — losing the chance to target "about verifymyprovider" etc.

## 3. Checklist verification

### Sitemap
- [x] Dynamic XML sitemap generation — `packages/frontend/src/app/sitemap.ts:11`
- [x] Static page entries with priorities — `sitemap.ts:12-19`
- [~] **Dynamic provider page entries (top 500) — PARTIAL**: the sitemap does emit up to 500, but 500 is ~0.05% of the catalog; not meaningful coverage. See HIGH.
- [x] Daily revalidation — `sitemap.ts:25` `revalidate: 86400`
- [x] Graceful fallback on API error — `sitemap.ts:37-39`

### Provider Page SEO
- [x] Server-side rendering with ISR — `provider/[npi]/page.tsx:11` `revalidate: 3600`
- [x] Dynamic metadata (title, description) — `provider/[npi]/page.tsx:28-55`
- [x] **JSON-LD structured data — VERIFIED** (prompt says missing): `provider/[npi]/page.tsx:69-95`. Note: partially broken due to key-casing mismatch (see MEDIUM).
- [~] **Open Graph / social sharing tags — PARTIAL**: present (`provider/[npi]/page.tsx:49-54`, layout.tsx:54-62) but no per-provider image; Twitter card is summary_large_image globally.

### Missing / Future
- [ ] `robots.txt` configuration — **NOT PRESENT** (verified via `ls packages/frontend/public` and `packages/frontend/src/app`)
- [ ] Google Search Console verification — no `google-site-verification` meta in `layout.tsx:41-63`
- [ ] Insurance plan page SEO metadata — `packages/frontend/src/app/insurance` exists; no per-plan metadata seen
- [ ] Location page SEO metadata — `packages/frontend/src/app/location` exists; no metadata seen
- [ ] Canonical URLs for search results — no `alternates.canonical` anywhere

## 4. Recommendations (ranked)

1. **Add `packages/frontend/src/app/robots.ts`** emitting `User-agent: *`, `Allow: /`, `Sitemap: ${SITE_URL}/sitemap.xml`, and `Disallow: /dashboard`, `/saved-providers`, `/api`, `/login`. Single-file win, unblocks sitemap discovery.
2. **Fix the JSON-LD key mismatch.** Change `provider/[npi]/page.tsx:78-81` to `firstLocation.addressLine1` / `firstLocation.zipCode` (camelCase). Without this the structured data is half-empty on every page.
3. **Shard the sitemap.** Replace `sitemap.ts` with a `sitemap.xml` index and sub-sitemaps by state (e.g. `/sitemap-providers-ny.xml`, `/sitemap-providers-ca.xml`). Each sub-sitemap pages through providers at 50k per file. Keep the top-500 "recent" shard for freshness and add state shards for scale.
4. **Drop `lastModified: new Date()` from static entries.** Use a fixed build-time constant (e.g. `new Date('2026-04-01')`) or derive from the provider's `nppes_last_synced` for dynamic entries (available on `transformProvider` output at `packages/backend/src/routes/providers.ts:188`).
5. **Add `alternates.canonical`** to `provider/[npi]/page.tsx:46-54` pointing at `https://verifymyprovider.com/provider/${npi}` so filter-variant URLs don't fragment link equity.
6. **Add per-page metadata for `/insurance/[planId]` and `/location/[id]` routes.** Both directories exist but none of their `page.tsx` files were surfaced — worth a follow-up to add `generateMetadata` matching the provider pattern.
7. **Set `robots: { index: false }` on `/search` and `/login`** via page-level `metadata` to avoid indexing filter-parameter combinations.

## 5. Open questions (from prompt)

1. **Is the sitemap being submitted to Google Search Console?** Unknown from code alone; no `google-site-verification` meta tag in `layout.tsx:41-63`, so likely not verified yet. Recommend adding it once robots.txt exists.
2. **Should more than 500 providers be included?** Yes — see Rec 3. Google handles 50k URLs/sitemap and unlimited sitemaps via index files. The current 500-cap is an artificial floor.
3. **Should insurance plan pages and location pages have SEO metadata?** Yes — they're linked from the provider detail page (`locations.ts:100-117` `/locations/:locationId` endpoint is public) and can carry their own long-tail keywords ("UnitedHealthcare Oxford Freedom in New York"). See Rec 6.
4. **Are Open Graph tags needed for social sharing?** Partially present; the provider page already has `openGraph.type='profile'` (`provider/[npi]/page.tsx:49-53`). Adding an `images` entry per provider (even the generic logo) will fix missing preview thumbnails on Twitter/LinkedIn/Slack.
