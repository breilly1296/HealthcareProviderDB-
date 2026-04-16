# Provider Detail Page Architecture

## Summary

The provider detail page uses Next.js App Router server rendering with ISR (`revalidate: 3600`), JSON-LD structured data injection, and SEO metadata generation in the server component (`app/provider/[npi]/page.tsx`). Client-side, `ProviderDetailClient` hydrates from the initial payload into React Query (`staleTime: 10min`), computes confidence/verification aggregates across plan acceptances, and renders a hero card, disclaimer, about, insurance list, and colocated providers. Share/Print/Bookmark are already wired in `ProviderHeroCard`. Maturity: production-complete — a few items the prompt flags as "missing" are actually already implemented (server rendering, JSON-LD, share, print, score breakdown).

## Findings

### CRITICAL

- None observed.

### HIGH

- `ProviderDetailClient` recomputes `bestAcceptance` / `verificationCount` / `lastVerifiedAt` / `insurancePlans` on every render without `useMemo` (`components/provider-detail/ProviderDetailClient.tsx:82-116`). Each reduce/map iterates all plan acceptances. For providers with many plans this is cheap per render but triggers downstream re-renders of memoized children that compare these array/object props by reference (e.g., `InsuranceList.plans`).
- The server fetch in `getProvider` (`app/provider/[npi]/page.tsx:8-18`) reads `NEXT_PUBLIC_API_URL` directly and defaults to `http://localhost:3001/api/v1`. In production (Cloud Run / Vercel), this must be set to the full backend URL; a missing env var silently degrades to localhost, breaking SSR and metadata.

### MEDIUM

- Analytics: `trackProviderView` is called with `npi` as a prop, but per `lib/analytics.ts:70-78` the NPI is intentionally dropped server-side — yet `ProviderDetailClient.tsx:74-77` still passes it. Harmless but could be cleaned up.
- `ColocatedProviders` uses local `useState`/`useEffect` (`components/provider-detail/ColocatedProviders.tsx:16-40`) instead of `useColocatedProviders` from `hooks/useProviderSearch.ts:115`. The hook exists but isn't used here, bypassing React Query caching / dedup between pages.
- Metadata generation fetches the provider twice per request (once in `generateMetadata`, once in the page) — `app/provider/[npi]/page.tsx:33, 63`. Next.js dedupes `fetch` by URL only if cache policy matches, which it does here (both use `{ next: { revalidate: 3600 }}`), so the second call should be served from Next's data cache. Still, a single shared fetch would be clearer.
- Loading state is `LoadingSpinner` even when `initialProvider` is present (`ProviderDetailClient.tsx:140-144` guarded by `loading`), but React Query's `isLoading` is `false` when `initialData` is provided, so spinner shouldn't render. OK in practice, flagging for confirmation.

### LOW

- `useColocatedProviders` hook is unused (`hooks/useProviderSearch.ts:115-128`). Either adopt it inside `ColocatedProviders` or remove.
- `ProviderHeroCard.handleShare` falls back to `navigator.clipboard.writeText` but only shows toast on fallback path (`ProviderHeroCard.tsx:171-182`). On `navigator.share` success there's no feedback.
- JSON-LD only includes the first location (`app/provider/[npi]/page.tsx:67-86`). Providers with multiple practice addresses get truncated structured data. Schema.org `Physician.address` accepts arrays.
- Error handling in `getProvider` swallows all fetch errors to `null` (`app/provider/[npi]/page.tsx:15-17`). Distinguishing 404 vs 5xx would let the client show more accurate messages.
- `SaveProfileButton` exists (`components/SaveProfileButton.tsx`) and was referenced in the prompt as a sidebar variant, but isn't imported by `ProviderDetailClient` nor the current redesigned hero/about/insurance set — only `BookmarkButton` is used (`ProviderHeroCard.tsx:5, 192`).

## Checklist Verification

### Page
- [x] Dynamic route `/provider/[npi]` — `app/provider/[npi]/page.tsx:57-99`
- [x] SSR with ISR — `app/provider/[npi]/page.tsx:10` (`revalidate: 3600`)
- [x] SEO metadata generation — `generateMetadata` (`:28-55`), Physician JSON-LD at `:69-86`
- [x] Client-side interactivity via `ProviderDetailClient` — `:96`
- [x] Breadcrumb back to search — `ProviderDetailClient.tsx:122-138`
- [x] Loading/error/success states — `:141-209`
- [x] Retry on error — `refetch()` button at `:159`

### Data
- [x] Single API call for provider + plan acceptances — `api.providers.getByNpi` (`lib/api.ts:551-554`) returns `provider.planAcceptances`
- [x] Confidence score aggregation — `ProviderDetailClient.tsx:82-91` (chooses highest-confidence acceptance as `bestAcceptance`, then reads its score)
- [x] Verification count aggregation — `:94-97`
- [x] Insurance plan transformation — `:107-116`
- [x] Colocated provider fetching — `ColocatedProviders.tsx:25-41` calls `providerApi.getColocated`

### Components
- [x] `ProviderHeroCard` with confidence badge — `components/provider-detail/ProviderHeroCard.tsx:147`; `ConfidenceGauge` rendered inside; breakdown via `confidenceBreakdown` prop at `:147, 184`
- [x] `InsuranceList` with per-plan scores — `components/provider-detail/InsuranceList.tsx:10-27`; `confidence` on each plan
- [x] `AboutProvider` (entity type, new patients, languages) — `components/provider-detail/AboutProvider.tsx:11-30`
- [x] `ColocatedProviders` — `components/provider-detail/ColocatedProviders.tsx:16`
- [x] Data accuracy Disclaimer — `ProviderDetailClient.tsx:187`
- [x] `BookmarkButton` — wired in `ProviderHeroCard.tsx:192`
- [partial] `SaveProfileButton` — component exists but not wired into the current redesigned page (`components/SaveProfileButton.tsx` unused under provider-detail)

### Prompt "Missing / Future"
- [x] Server-side rendering for SEO — implemented with ISR + metadata
- [x] Structured data / JSON-LD — implemented at `app/provider/[npi]/page.tsx:69-86` (Physician / MedicalOrganization)
- [x] Share provider button — `ProviderHeroCard.tsx:193-200` (uses `navigator.share` with clipboard fallback)
- [x] Print-friendly view — `handlePrint` at `ProviderHeroCard.tsx:184-186`, `print:hidden` utility classes on non-print chrome
- [partial] Verification history timeline — component exists at `components/provider/VerificationTimeline.tsx` but **not** imported by the current `ProviderDetailClient` redesign (grep confirms)
- [x] Score breakdown modal — `ConfidenceScoreBreakdown` IS wired via `ConfidenceGauge.tsx:7-11, 198` which is rendered by `ProviderHeroCard`. Prompt's "exists but not wired" is out of date.

## Recommendations (ranked)

1. Memoize derived computations in `ProviderDetailClient.tsx:82-116` with `useMemo` keyed on `typedProvider?.planAcceptances`. Prevents reference churn that forces `InsuranceList`/`ColocatedProviders` re-renders.
2. Replace `ColocatedProviders`' local `useState`/`useEffect` fetch with the existing `useColocatedProviders` hook (`hooks/useProviderSearch.ts:115`). Unifies caching, stale time, and error semantics.
3. Mount `VerificationTimeline` on the provider detail page (currently orphaned at `components/provider/VerificationTimeline.tsx`). This closes prompt's "timeline not wired" item.
4. Validate `NEXT_PUBLIC_API_URL` at build time or in `getProvider` (`app/provider/[npi]/page.tsx:5-18`) and throw a loud warning if it's localhost in production builds. Silent SSR failure to localhost is a nasty production footgun.
5. Extend JSON-LD to include all practice locations as an array (`app/provider/[npi]/page.tsx:75-83`) and include `medicalSpecialty`/`availableService` where known.
6. Drop NPI from the `trackProviderView` call site (`ProviderDetailClient.tsx:74-77`) — the analytics layer already strips it, so passing it just adds misleading plumbing.

## Open Questions

1. Should provider detail pages be server-rendered for SEO? — Already yes (`revalidate: 3600` + metadata + JSON-LD).
2. Should we add structured data (JSON-LD) for Google healthcare search results? — Already yes; open question is whether to add `MedicalClinic` sub-types or aggregate review data.
3. Is the co-located providers feature useful and performant? Uses `limit: 10` (`ColocatedProviders.tsx:30`); unknown hit rate and conversion. Consider PostHog event.
4. Should the verification timeline be displayed on this page? Component exists but is orphaned.
5. Should we add a "Report incorrect information" feature? Currently users must go through the verification flow — a lightweight "flag" could be added next to the Disclaimer.
